import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { projectApi, deliveryReportApi, type DeliveryReportDto } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import type { AppointmentDto, ProjectMaterial } from '@/types/project';
import { t } from '@/i18n/translate';

import { findReport, operationItems, reportImageUrls } from '../utils/installationScope';

export type InstallationAppointment = AppointmentDto & {
    salesOrder?: { id: string; orderNumber: string; parentSalesOrderId?: string | null; revisionNumber?: number | null; tender?: any } | null;
    project?: any;
};

/** Task-oriented views of the technician installation screen. */
export type InstallationView = 'field' | 'materials' | 'expenses' | 'overtime' | 'general';

type ExpenseRow = { expenseType: string; amount: number; description: string };
type MaterialRow = { materialId: string; quantity: number; description: string };
type InstallationInitialSection = 'work' | 'general';

const isoWeekStart = (value: string) => {
    const date = dayjs(value);
    const day = date.day();
    return date.subtract(day === 0 ? 6 : day - 1, 'day').startOf('day');
};

// Technician-side autosave: the in-progress field report is kept in localStorage
// (keyed by appointment) so a refresh never loses work. It is NOT sent to the
// manager until "Finish & Send"; the draft is cleared once the report is sent.
const DRAFT_PREFIX = 'offitec:install-draft:';
type InstallationDraft = {
    operations: string[];
    technicalNotes: string;
    reportImages: string[];
    expenseRows: ExpenseRow[];
    materialRows: MaterialRow[];
    usedMaterialRows: MaterialRow[];
};
const loadInstallationDraft = (id?: string | null): InstallationDraft | null => {
    if (!id) return null;
    try { const raw = localStorage.getItem(DRAFT_PREFIX + id); return raw ? (JSON.parse(raw) as InstallationDraft) : null; } catch { return null; }
};
const saveInstallationDraft = (id: string, draft: InstallationDraft) => {
    try { localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify(draft)); }
    catch { try { localStorage.setItem(DRAFT_PREFIX + id, JSON.stringify({ ...draft, reportImages: [] })); } catch { /* quota — ignore */ } }
};
const clearInstallationDraft = (id?: string | null) => { if (id) { try { localStorage.removeItem(DRAFT_PREFIX + id); } catch { /* ignore */ } } };

const emptyExpenseRow = (): ExpenseRow => ({ expenseType: 'Diğer', amount: 0, description: '' });
const emptyMaterialRow = (): MaterialRow => ({ materialId: '', quantity: 1, description: '' });

/**
 * Owns the technician installation/appointment detail screen: appointment +
 * materials loading (guarded against out-of-order responses), the in-progress
 * field report draft (persisted to localStorage), the delivery reports backing
 * the general report, the active task view, and the "Finish & Send" save.
 */
export const useInstallationDetail = (
    appointmentId?: string,
    options: { initialSection?: InstallationInitialSection } = {},
) => {
    const initialSection = options.initialSection || 'work';
    const [weekAnchor, setWeekAnchor] = useState(dayjs().format('YYYY-MM-DD'));
    const [appointments, setAppointments] = useState<InstallationAppointment[]>([]);
    const [selected, setSelected] = useState<InstallationAppointment | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [loading, setLoading] = useState(true);
    const [expenseLoading, setExpenseLoading] = useState(false);
    const [materialLoading, setMaterialLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [operations, setOperations] = useState<string[]>(['']);
    const [technicalNotes, setTechnicalNotes] = useState('');
    const [reportImages, setReportImages] = useState<string[]>([]);
    const [expenseRows, setExpenseRows] = useState<ExpenseRow[]>([emptyExpenseRow()]);
    const [materialRows, setMaterialRows] = useState<MaterialRow[]>([emptyMaterialRow()]);
    const [usedMaterialRows, setUsedMaterialRows] = useState<MaterialRow[]>([emptyMaterialRow()]);
    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [reloadKey, setReloadKey] = useState(0);
    const [view, setView] = useState<InstallationView>('field');
    // Field-report signature captured during creation. It is NOT sent on capture —
    // it rides along with the report only when "Finish & Send" is clicked.
    const [capturedSignature, setCapturedSignature] = useState<string | null>(null);

    // Tenant context is set asynchronously by fetchProfile() after app start; the
    // axios interceptor reads it for the X-Tenant-Id header. `user.id` and
    // `selectedTenantId` are written together once the profile resolves, so gating
    // the fetch on `userId` guarantees the tenant header is attached — otherwise a
    // hard refresh can fire the list request before the tenant is known and come
    // back empty (the page then only fills in after navigating away and back).
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);

    const weekStart = useMemo(() => isoWeekStart(weekAnchor), [weekAnchor]);

    // Guards against out-of-order responses: only the newest load may write state,
    // so a slow early (wrong-tenant/empty) response can't clobber a good one.
    const loadSeq = useRef(0);
    const loadedExpenseAppointment = useRef<string | null>(null);
    const loadedMaterialAppointment = useRef<string | null>(null);
    const loadingExpenseAppointment = useRef<string | null>(null);
    const loadingMaterialAppointment = useRef<string | null>(null);

    const load = useCallback(async () => {
        const seq = ++loadSeq.current;
        setLoading(true);
        try {
            const rows = appointmentId
                ? [await projectApi.getMyInstallation(appointmentId, initialSection)]
                : await projectApi.listMyInstallations(weekStart.format('YYYY-MM-DD'), weekStart.add(6, 'day').format('YYYY-MM-DD'));
            if (seq !== loadSeq.current) return;
            setAppointments(rows as InstallationAppointment[]);
            setSelected((current) => {
                if (appointmentId) {
                    const next = rows[0] as InstallationAppointment | undefined;
                    if (!next) return null;
                    if (current?.id !== next.id || initialSection === 'general') return next;
                    return {
                        ...next,
                        salesOrder: {
                            ...next.salesOrder,
                            ...(current.salesOrder?.tender ? { tender: current.salesOrder.tender } : {}),
                        },
                        project: {
                            ...next.project,
                            ...(current.project?.tender ? { tender: current.project.tender } : {}),
                            ...(current.project?.expenses ? { expenses: current.project.expenses } : {}),
                        },
                    } as InstallationAppointment;
                }
                if (current) return (rows as InstallationAppointment[]).find((row) => row.id === current.id) || rows[0] as InstallationAppointment || null;
                return rows[0] as InstallationAppointment || null;
            });
        } catch (error: any) {
            if (seq !== loadSeq.current) return;
            toast.error(error.response?.data?.error || t('projects.montajlar_yuklenemedi'));
            setAppointments([]);
            setSelected(null);
        }
        if (seq === loadSeq.current) setLoading(false);
    }, [appointmentId, initialSection, weekStart]);

    const reloadAll = useCallback(() => { void load(); setReloadKey((key) => key + 1); }, [load]);

    useEffect(() => {
        // Wait until the auth profile (and tenant) has resolved before fetching,
        // then reload whenever the resolved tenant changes.
        if (!userId || !selectedTenantId) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [weekStart.valueOf(), appointmentId, selectedTenantId, userId]);

    // Delivery reports for the order back the general-report preview button.
    useEffect(() => {
        if (initialSection !== 'general') {
            setDeliveryReports([]);
            return;
        }
        const projectId = selected?.project?.id;
        if (!projectId) { setDeliveryReports([]); return; }
        deliveryReportApi.list({ projectId }).then(setDeliveryReports).catch(() => setDeliveryReports([]));
    }, [initialSection, selected?.project?.id, reloadKey]);

    const loadExpenses = useCallback(async () => {
        const id = selected?.id || appointmentId;
        if (!id || loadedExpenseAppointment.current === id || loadingExpenseAppointment.current === id) return;
        loadingExpenseAppointment.current = id;
        setExpenseLoading(true);
        try {
            const payload = await projectApi.getMyInstallation(id, 'expenses') as any;
            const rows = Array.isArray(payload.expenses) ? payload.expenses : [];
            setSelected((current) => current?.id === id
                ? {
                    ...current,
                    project: { ...current.project, expenses: rows },
                } as InstallationAppointment
                : current);
            setExpenseRows((current) => {
                const hasDraft = current.some((row) => Number(row.amount) > 0 || row.description.trim());
                if (hasDraft || !rows.length) return current;
                return rows.map((row: any) => ({
                    expenseType: row.expenseType || 'DiÄŸer',
                    amount: Number(row.amount || 0),
                    description: row.description || '',
                }));
            });
            loadedExpenseAppointment.current = id;
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.montajlar_yuklenemedi'));
        } finally {
            if (loadingExpenseAppointment.current === id) {
                loadingExpenseAppointment.current = null;
                setExpenseLoading(false);
            }
        }
    }, [appointmentId, selected?.id]);

    const loadMaterials = useCallback(async () => {
        const id = selected?.id || appointmentId;
        if (!id || loadedMaterialAppointment.current === id || loadingMaterialAppointment.current === id) return;
        loadingMaterialAppointment.current = id;
        setMaterialLoading(true);
        try {
            const [payload, catalogue] = await Promise.all([
                projectApi.getMyInstallation(id, 'materials') as Promise<any>,
                projectApi.materials({ compact: true }).catch(() => [] as ProjectMaterial[]),
            ]);
            setMaterials(catalogue);
            setSelected((current) => current?.id === id
                ? {
                    ...current,
                    salesOrder: { ...current.salesOrder, ...payload.salesOrder },
                    project: { ...current.project, ...payload.project },
                } as InstallationAppointment
                : current);
            const extraMaterials = Array.isArray(payload.extraMaterials) ? payload.extraMaterials : [];
            setMaterialRows((current) => {
                const hasDraft = current.some((row) => Boolean(row.materialId) || row.description.trim());
                if (hasDraft || !extraMaterials.length) return current;
                return extraMaterials.map((row: any) => ({
                    // Birleşme sonrası satırlar `articleId` taşır (eski yanıtlar materialId).
                    materialId: row.articleId || row.materialId || '',
                    quantity: Number(row.quantity || 0),
                    description: row.description || '',
                }));
            });
            loadedMaterialAppointment.current = id;
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.malzemeler_yuklenemedi'));
        } finally {
            if (loadingMaterialAppointment.current === id) {
                loadingMaterialAppointment.current = null;
                setMaterialLoading(false);
            }
        }
    }, [appointmentId, selected?.id]);

    const selectedReport = findReport(selected);
    // The technician can finish until the appointment is actually COMPLETED — an attached
    // (e.g. manager-drafted) report no longer blocks finishing, it only pre-fills the form.
    const canFinish = Boolean(selected && selected.status !== 'COMPLETED' && !dayjs().isBefore(dayjs(selected.startTime), 'day'));

    // When switching between assembly detail screens (e.g. clicking Order 1 then
    // Order 2 in quick succession), `selected` still holds the previous
    // appointment until the new fetch resolves. Detect that mismatch during render
    // — synchronously, so no frame ever paints — and treat it as "still loading"
    // so the screen shows a skeleton instead of momentarily flashing the old order.
    const isStale = Boolean(appointmentId && selected && selected.id !== appointmentId);

    // Restore the technician's local draft when switching appointment. While the montaj
    // is still open, prefer the local draft; if there is none but a report is already
    // attached (e.g. drafted by a manager), seed the editable form from that report so
    // the technician continues it instead of starting blank. Once COMPLETED it is
    // read-only, so there is nothing to edit.
    useEffect(() => {
        const completed = selected?.status === 'COMPLETED';
        const localDraft = !completed ? loadInstallationDraft(selected?.id) : null;
        const reportSeed = selectedReport
            ? { operations: operationItems(selectedReport), technicalNotes: selectedReport.technicalNotes || '', reportImages: reportImageUrls(selectedReport) }
            : null;
        const content = localDraft || reportSeed;
        setOperations(content?.operations?.length ? content.operations : ['']);
        setTechnicalNotes(content?.technicalNotes || '');
        setReportImages(Array.isArray(content?.reportImages) ? content.reportImages : []);
        setExpenseRows(localDraft?.expenseRows?.length ? localDraft.expenseRows : [emptyExpenseRow()]);
        setMaterialRows(localDraft?.materialRows?.length ? localDraft.materialRows : [emptyMaterialRow()]);
        setUsedMaterialRows(localDraft?.usedMaterialRows?.length ? localDraft.usedMaterialRows : [emptyMaterialRow()]);
        setCapturedSignature(null);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [selected?.id, selected?.status, Boolean(selectedReport)]);

    // Persist the in-progress draft as the technician edits (not once completed).
    useEffect(() => {
        if (!selected?.id || selected.status === 'COMPLETED') return;
        saveInstallationDraft(selected.id, { operations, technicalNotes, reportImages, expenseRows, materialRows, usedMaterialRows });
    }, [selected?.id, selected?.status, operations, technicalNotes, reportImages, expenseRows, materialRows, usedMaterialRows]);

    const submit = useCallback(async (signatureBase64?: string) => {
        if (!selected) return;
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) {
            toast.error(t('projects.yapilan_islerden_en_az_bir_madde_girin'));
            return;
        }
        setSaving(true);
        try {
            const result = await projectApi.completeInstallation(selected.id, {
                operationsDoneItems: cleanOperations,
                technicalNotes,
                images: reportImages,
                endedAt: new Date().toISOString(),
                // Send with the signature captured during creation, if any.
                signatureBase64: signatureBase64 ?? capturedSignature ?? undefined,
                expenses: expenseRows
                    .filter((row) => row.expenseType && Number(row.amount) > 0)
                    .map((row) => ({ ...row, amount: Number(row.amount || 0) })),
                materials: materialRows
                    .filter((row) => row.materialId && Number(row.quantity) > 0)
                    .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
                usedMaterials: usedMaterialRows
                    .filter((row) => row.materialId && Number(row.quantity) > 0)
                    .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
            });
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            toast.success(result.message || t('projects.montaj_tamamlandi'));
            // Technicians raise an addon-order request; the manager creates the order.
            if (result.addonRequest) toast.success(t('projects.addonRequestSent'));
            else if (result.addonOrder) toast.success(t('projects.addonOrderCreated', { orderNumber: result.addonOrder.orderNumber }));
            clearInstallationDraft(selected.id);
            setCapturedSignature(null);
            // Stay on the appointment so the now-sent report shows and the
            // signature actions unlock (signatures are disabled until Finish).
            void load().then(() => setReloadKey((key) => key + 1));
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.montaj_tamamlanamadi'));
        } finally {
            setSaving(false);
        }
    }, [selected, operations, technicalNotes, reportImages, expenseRows, materialRows, usedMaterialRows, capturedSignature, load]);

    return {
        weekAnchor,
        setWeekAnchor,
        appointments,
        // Never expose the previously-loaded appointment while a different one is
        // requested — otherwise the detail card paints the prior order for a frame.
        selected: isStale ? null : selected,
        materials,
        loading: loading || isStale,
        expenseLoading,
        materialLoading,
        saving,
        operations,
        setOperations,
        technicalNotes,
        setTechnicalNotes,
        reportImages,
        setReportImages,
        expenseRows,
        setExpenseRows,
        materialRows,
        setMaterialRows,
        usedMaterialRows,
        setUsedMaterialRows,
        deliveryReports,
        selectedReport,
        canFinish,
        view,
        setView,
        capturedSignature,
        setCapturedSignature,
        loadExpenses,
        loadMaterials,
        reloadAll,
        submit,
    };
};
