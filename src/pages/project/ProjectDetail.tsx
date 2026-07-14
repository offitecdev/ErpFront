import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    CheckCircle as CheckCircle2,
    Clipboard as ClipboardPenLine,
    Edit01 as Pencil,
    InfoCircle,
    List,
    Mail01 as Mail,
    PackagePlus,
    Receipt as ReceiptText,
    Save01 as Save,
    Send01 as Send,
    Trash01 as Trash2,
    X,
} from '@/components/icons/antIconCompat';
import { SlidePanel } from '../../components/layout/SlidePanel';

import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Modal } from '../../components/ui-shared/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { projectApi, type CompleteInstallationInput } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { PersonLite } from '../../types/maintenance';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '../../types/project';
import { ProjectProcessModal } from './ProjectProcessModal';
import { AppointmentSchedulerCalendar } from './features/components/detail/AppointmentSchedulerCalendar';
import { ProjectWorkflowNav } from './features/components/detail/ProjectWorkflowNav';
import { ProjectDetailHeader } from './features/components/detail/ProjectDetailHeader';
import { renderProjectSection } from './features/components/detail/ProjectSectionRenderer';
import { ProjectDetailsModal } from './features/components/detail/ProjectDetailsModal';
import { MaterialSearchSelect } from './features/components/common/MaterialSearchSelect';
import { SubTabs } from './features/components/common/SubTabs';
import { CostList } from './features/components/common/CostList';
import { TotalRow } from './features/components/common/TotalRow';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import { useProjectDetailData } from './features/hooks/useProjectDetailData';
import {
    displayOperationsDone,
    durationFmt,
    money,
    numberFmt,
} from './features/utils/projectFormatters';
import {
    getProjectDisplayOrders,
    orderPayloadId,
    scopedRecords,
} from './features/utils/projectOrderScope';
import { getProjectUsedMaterials } from './features/utils/projectMaterialUsage';
import {
    calculateProjectTotals,
    calculateTotals,
    hasAddonAttention,
} from './features/utils/projectTotals';
import {
    appointmentDuration,
    canManagerFinishAppointment,
    findAppointmentReport,
    getAwaitingTechnicianAppointments,
    isAppointmentAwaitingTechnician,
} from './features/utils/projectAppointments';
import { viewForSection, type ProjectDetailView } from './features/types/projectDetailNavigation';

import { t } from '@/i18n/translate';

export type MaterialMode = 'used' | 'extra';
type BookingMode = 'schedule' | 'mail' | 'signature' | 'overtime';

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, permissions } = useAuthStore();
    const { project, materials, mailSettings, loading, loadError, load } = useProjectDetailData(id);
    const [activeView, setActiveView] = useState<ProjectDetailView>({ section: 'overview' });
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showComplete, setShowComplete] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<ProjectSalesOrder | null>(null);
    const [deletingOrder, setDeletingOrder] = useState(false);

    const salesOrders = useMemo(() => getProjectDisplayOrders(project), [project]);
    // Memoized so downstream memo() tabs and callbacks see a stable `order` reference
    // when neither the order list nor the selection changed.
    const selectedOrder = useMemo(
        () => salesOrders.find((order) => order.id === selectedOrderId) || salesOrders[0] || null,
        [salesOrders, selectedOrderId],
    );
    const selectedOrderIndex = useMemo(
        () => Math.max(0, salesOrders.findIndex((order) => order.id === selectedOrder?.id)),
        [salesOrders, selectedOrder],
    );
    const selectedOrderIsPrimary = selectedOrderIndex <= 0;
    const selectedOrderIsAddon = Boolean(selectedOrder?.parentSalesOrderId);
    const totals = useMemo(() => calculateTotals(project, selectedOrder, selectedOrderIsPrimary, salesOrders), [project, selectedOrder, selectedOrderIsPrimary, salesOrders]);
    const projectTotals = useMemo(() => calculateProjectTotals(project, salesOrders), [project, salesOrders]);
    const addonAttention = useMemo(() => project ? hasAddonAttention(project, selectedOrder, salesOrders) : false, [project, selectedOrder, salesOrders]);
    const awaitingTechnicianAppointments = useMemo(
        () => project ? getAwaitingTechnicianAppointments(project, selectedOrder, selectedOrderIsPrimary, salesOrders) : [],
        [project, selectedOrder, selectedOrderIsPrimary, salesOrders],
    );

    useEffect(() => {
        if (!salesOrders.length) {
            setSelectedOrderId(null);
            return;
        }
        if (!selectedOrderId || !salesOrders.some((order) => order.id === selectedOrderId)) {
            setSelectedOrderId(salesOrders[0].id);
        }
    }, [salesOrders, selectedOrderId]);

    const canManageOrders = permissions.includes('projects.manage');

    // Ask before deleting. Standard orders that still have addons are blocked up
    // front (the backend also rejects invoiced orders and main-orders-with-addons).
    const requestDeleteOrder = useCallback((order: ProjectSalesOrder) => {
        if (!order.parentSalesOrderId && salesOrders.some((candidate) => candidate.parentSalesOrderId === order.id)) {
            toast.error(t('projects.deleteOrderBlockedAddons'));
            return;
        }
        setOrderToDelete(order);
    }, [salesOrders]);

    const confirmDeleteOrder = useCallback(async () => {
        if (!orderToDelete || !project) return;
        setDeletingOrder(true);
        try {
            await projectApi.deleteSalesOrder(project.id, orderToDelete.id);
            toast.success(t('projects.orderDeleted', { orderNumber: localizeTenderNumbersInText(orderToDelete.orderNumber) }));
            if (selectedOrderId === orderToDelete.id) setSelectedOrderId(null);
            setOrderToDelete(null);
            await load(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.orderDeleteFailed'));
        } finally {
            setDeletingOrder(false);
        }
    }, [orderToDelete, project, selectedOrderId, load]);

    // Stable handlers passed down to the header and the section renderer so memo()'d
    // children don't re-render on unrelated ProjectDetail state changes.
    const handleSelectOrder = useCallback((orderId: string) => {
        setSelectedOrderId(orderId);
        setActiveView({ section: 'overview' });
    }, []);

    const handleCreateAddon = useCallback((parentOrderId: string) => {
        setSelectedOrderId(parentOrderId);
        setActiveView(viewForSection('addons'));
    }, []);

    const handleReload = useCallback(() => load(true), [load]);

    const handleOrderCreated = useCallback(async (orderId: string) => {
        await load(true);
        setSelectedOrderId(orderId);
    }, [load]);

    // Stable header action handlers so the memo()'d header doesn't re-render (and
    // re-run its per-order totals) when unrelated modal state toggles.
    const handleOpenDetails = useCallback(() => setShowDetails(true), []);
    const handleComplete = useCallback(() => setShowComplete(true), []);
    const handleBack = useCallback(() => navigate('/projects'), [navigate]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map((x) => <div key={x} className="h-20 animate-pulse rounded-md border border-slate-100 bg-slate-50" />)}
                </div>
                <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            </div>
        );
    }

    if (!project) {
        return <EmptyState icon={<BriefcaseBusiness size={32} />} title={t('auto.proje_bulunamadi')} description={loadError ||t('auto.proje_silinmis_ya_da_erisiminiz_olmayabilir')} />;
    }

    return (
        <div>
            <ProjectDetailHeader
                project={project}
                orders={salesOrders}
                selectedOrder={selectedOrder}
                addonAttention={addonAttention}
                canManageOrders={canManageOrders}
                onDeleteOrder={requestDeleteOrder}
                onSelectOrder={handleSelectOrder}
                onCreateAddon={handleCreateAddon}
                onOpenDetails={handleOpenDetails}
                onComplete={handleComplete}
                onBack={handleBack}
            />

            <div className="min-w-0 md:flex md:gap-5">
                <div className="md:w-56 md:shrink-0">
                    <ProjectWorkflowNav
                        activeView={activeView}
                        onChange={setActiveView}
                        addonAttention={addonAttention}
                    />
                </div>
                <div className="min-w-0 flex-1 rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6">
                    {renderProjectSection({
                        view: activeView,
                        project,
                        order: selectedOrder,
                        orders: salesOrders,
                        isPrimary: selectedOrderIsPrimary,
                        isAddon: selectedOrderIsAddon,
                        totals,
                        materials,
                        mailSettings,
                        userEmail: user?.email || '',
                        awaitingAppointments: awaitingTechnicianAppointments,
                        addonAttention,
                        canCreateAddon: permissions.includes('projects.createAddonOrder'),
                        onNavigate: setActiveView,
                        onReload: handleReload,
                        onOrderCreated: handleOrderCreated,
                    })}
                </div>
            </div>

            {showComplete && (
                <ProjectProcessModal
                    project={project}
                    mode="complete"
                    onClose={() => setShowComplete(false)}
                    onCompleted={() => {
                        setShowComplete(false);
                        void load(true);
                    }}
                />
            )}

            {showDetails && (
                <ProjectDetailsModal project={project} totals={projectTotals} onClose={() => setShowDetails(false)} />
            )}

            {orderToDelete && (
                <Modal
                    open
                    width="sm"
                    title={t('projects.deleteOrderTitle')}
                    onClose={() => { if (!deletingOrder) setOrderToDelete(null); }}
                    closeOnBackdrop={!deletingOrder}
                    footer={(
                        <>
                            <Button variant="ghost" onClick={() => setOrderToDelete(null)} disabled={deletingOrder}>
                                {t('common.cancel')}
                            </Button>
                            <Button variant="danger" onClick={confirmDeleteOrder} loading={deletingOrder}>
                                {t('common.delete')}
                            </Button>
                        </>
                    )}
                >
                    <p className="text-[13px] text-slate-600">
                        {t(orderToDelete.parentSalesOrderId ? 'projects.deleteAddonConfirm' : 'projects.deleteMainConfirm', { orderNumber: localizeTenderNumbersInText(orderToDelete.orderNumber) })}
                    </p>
                </Modal>
            )}
        </div>
    );
};

export const getMaterialSubTabs = (): Array<{ key: MaterialMode; label: string }> => [
    { key: 'used', label:t('auto.kullanilan_malzemeler') },
    { key: 'extra', label:t('auto.ek_malzemeler') },
];

const getBookingSubTabs = (): Array<{ key: BookingMode; label: string }> => [
    { key: 'schedule', label:t('auto.randevu_saat_planlari') },
    { key: 'mail', label:t('auto.randevu_maili') },
    { key: 'signature', label:t('auto.imzaya_gonder') },
    { key: 'overtime', label:t('auto.15_uzeri_fazla_calisma') },
];

export const BookingSection = ({
    project,
    order,
    isPrimary,
    materials,
    settings,
    userEmail,
    onSaved,
    leaf,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials: ProjectMaterial[];
    settings: MailSettingDto | null;
    userEmail: string;
    onSaved: () => Promise<void>;
    // When set, render only this single leaf without the internal sub-tabs.
    // Used by the new workflow navigation, which owns section switching itself.
    leaf?: BookingMode;
}) => {
    const [mode, setMode] = useState<BookingMode>(leaf ?? 'schedule');
    const activeMode = leaf ?? mode;
    return (
        <div>
            {!leaf && <SubTabs tabs={getBookingSubTabs()} activeTab={mode} onSelectTab={setMode} />}
            {activeMode === 'schedule' && <AppointmentList project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onSaved} />}
            {activeMode === 'mail' && <MailTab project={project} order={order} settings={settings} userEmail={userEmail} />}
            {activeMode === 'signature' && <SignatureRequestTab project={project} order={order} isPrimary={isPrimary} settings={settings} userEmail={userEmail} onSaved={onSaved} />}
            {activeMode === 'overtime' && <OvertimeTab project={project} order={order} isPrimary={isPrimary} onSaved={onSaved} />}
        </div>
    );
};

const OvertimeTab = ({ project, order, isPrimary, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; onSaved: () => Promise<void> }) => {
    // Only managers may change the fee; everyone else sees the overtime read-only.
    const { permissions } = useAuthStore();
    const canManage = permissions.includes('projects.manage');
    // The threshold beyond which extra work is billed (backend default 15%).
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    const [rate, setRate] = useState<number>(Number(project.overtimeHourlyRate) || 0);
    const [savingRate, setSavingRate] = useState(false);

    // Persist the per-project hourly fee. The backend applies it per minute to any
    // work beyond the tolerance, so it takes effect across this order and every
    // addon order from the next saved field report onward.
    const saveRate = async () => {
        const next = Math.max(0, Number(rate) || 0);
        setSavingRate(true);
        try {
            await projectApi.update(project.id, { overtimeHourlyRate: next });
            toast.success(t('projects.settings.saveSuccess'));
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.settings.saveError'));
        } finally {
            setSavingRate(false);
        }
    };

    const overtimeReports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders).filter((report: any) => Number(report.overtimeCost) > 0),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const total = useMemo(
        () => overtimeReports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0),
        [overtimeReports],
    );
    const rows = useMemo(
        () => overtimeReports.map((report: any) => ({
            id: report.id,
            title: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
            meta: `${durationFmt(Number(report.overtimeMinutes || 0))} x ${money(report.overtimeHourlyRate)}`,
            amount: Number(report.overtimeCost) || 0,
            note: report.operationsDone ? displayOperationsDone(report.operationsDone) : undefined,
        })),
        [overtimeReports],
    );
    return (
        <div className="space-y-4">
            {canManage && (
                <div className="max-w-xl rounded-md border border-slate-200/70 bg-white p-4">
                    <Field label={t('projects.settings.laborFeeLabel')}>
                        <div className="flex items-center gap-2">
                            <Input
                                type="number"
                                min={0}
                                step="0.01"
                                value={rate}
                                placeholder="0"
                                onChange={(e) => setRate(Number(e.target.value) || 0)}
                                onKeyDown={(e) => { if (e.key === 'Enter') void saveRate(); }}
                            />
                            <Button variant="primary" size="sm" loading={savingRate} icon={<Save size={13} />} onClick={() => void saveRate()}>
                                {t('common.save')}
                            </Button>
                        </div>
                    </Field>
                    <div className="mt-2 flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                        <InfoCircle size={15} className="mt-0.5 shrink-0 text-amber-600" />
                        <span>{t('projects.settings.laborFeeHint', { tolerance })}</span>
                    </div>
                </div>
            )}
            <div className="max-w-xl rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="space-y-3 text-[13px]">
                    <TotalRow label={t('auto.15_uzeri_fazla_calisma')} value={total} total />
                </div>
            </div>
            <CostList title={t('auto.15_uzeri_fazla_calisma')} empty={t('auto.fazla_calisma_yok')} rows={rows} />
        </div>
    );
};

const SignatureRequestTab = ({ project, order, isPrimary, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; settings: MailSettingDto | null; userEmail: string; onSaved: () => Promise<void> }) => {
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);

    const send = async (report: any, channel: 'technician' | 'mail' | 'both') => {
        setLoadingKey(`${report.id}:${channel}`);
        try {
            await projectApi.requestReportSignature(report.id, {
                channel,
                to: project.customer?.mainEmail || undefined,
                fromEmail: settings?.fromEmail || userEmail,
                fromName: settings?.fromName ||t('auto.offitec_erp'),
                subject: `${project.projectName} - saha raporu imzasi`,
            });
            toast.success(channel === 'technician' ?t('auto.teknisyene_imza_bildirimi_gonderildi') : channel === 'mail' ?t('auto.musteriye_imza_maili_gonderildi') :t('auto.imza_istegi_gonderildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.imza_istegi_gonderilemedi'));
        } finally {
            setLoadingKey(null);
        }
    };

    return (
        <Card title={t('auto.imzaya_gonder')} icon={<Send size={13} />} noPadding>
            {reports.length === 0 ? (
                <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.saha_raporu_yok')} description={t('auto.imzaya_gondermek_icin_once_saha_raporu_olusturun')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {reports.map((report: any) => (
                        <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-slate-900">{dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · {t('auto.saha_raporu')}</div>
                                <div className="mt-0.5 text-[12px] text-slate-500">{dayjs(report.startedAt).format('HH:mm')} - {dayjs(report.endedAt).format('HH:mm')} · {report.isSigned ?t('auto.imzali') :t('auto.imza_bekliyor')}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:technician`} onClick={() => send(report, 'technician')}>{t('auto.teknikere_gonder')}</Button>
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:mail`} onClick={() => send(report, 'mail')}>{t('auto.musteriye_mail')}</Button>
                                <Button size="sm" loading={loadingKey === `${report.id}:both`} onClick={() => send(report, 'both')}>{t('auto.ikisine_gonder')}</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

const appointmentToForm = (appointment?: any) => ({
    id: appointment?.id || '',
    assignedTechId: appointment?.assignedTechId || '',
    technicianIds: appointment ? appointmentTechnicianIds(appointment) : [],
    date: appointment ? dayjs(appointment.startTime).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    start: appointment ? dayjs(appointment.startTime).format('HH:mm') : '09:00',
    end: appointment ? dayjs(appointment.endTime).format('HH:mm') : '17:00',
    notes: appointment?.notes || '',
});

const appointmentTechnicianIds = (appointment: any) => {
    const ids = new Set<string>();
    if (appointment?.assignedTechId) ids.add(appointment.assignedTechId);
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technicianId) ids.add(assignment.technicianId);
    });
    return Array.from(ids);
};

export const appointmentTechnicianNames = (appointment: any) => {
    const names = new Map<string, string>();
    if (appointment?.assignedTechnician) {
        names.set(appointment.assignedTechnician.id, `${appointment.assignedTechnician.firstName} ${appointment.assignedTechnician.lastName}`.trim());
    }
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technician) {
            names.set(assignment.technician.id, `${assignment.technician.firstName} ${assignment.technician.lastName}`.trim());
        }
    });
    return Array.from(names.values()).filter(Boolean).join(', ') ||t('auto.atanmadi');
};

type ManagerCompletionFormState = {
    operations: string[];
    technicalNotes: string;
    expenses: Array<{ expenseType: string; amount: number; description: string }>;
    materials: Array<{ materialId: string; quantity: number; description: string }>;
    usedMaterials: Array<{ materialId: string; quantity: number; description: string }>;
};

const emptyManagerCompletionForm = (): ManagerCompletionFormState => ({
    operations: [t('auto.yonetici_tarafindan_montaj_bitirildi')],
    technicalNotes: '',
    expenses: [{ expenseType:t('auto.nakliye'), amount: 0, description: '' }],
    materials: [{ materialId: '', quantity: 1, description: '' }],
    usedMaterials: [{ materialId: '', quantity: 1, description: '' }],
});

const AppointmentList = ({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(appointmentToForm());
    const [technicians, setTechnicians] = useState<PersonLite[]>([]);
    // Tenant-wide appointments of the calendar's visible month, reported up by the
    // calendar so the day agenda can also show what else runs on the selected day.
    const [tenantAppointments, setTenantAppointments] = useState<any[]>([]);
    // The full plan list (with the manager-finish workflows) lives in a slide-out
    // panel so the calendar + day agenda stay above the fold.
    const [showPlans, setShowPlans] = useState(false);
    const [loading, setLoading] = useState(false);
    const [completionAppointmentId, setCompletionAppointmentId] = useState<string | null>(null);
    const [completionForm, setCompletionForm] = useState<ManagerCompletionFormState>(() => emptyManagerCompletionForm());
    const [completionLoading, setCompletionLoading] = useState(false);
    const [confirmFinishAppointment, setConfirmFinishAppointment] = useState<any | null>(null);
    const editing = Boolean(form.id);
    // Upcoming plans first (today onwards, soonest at the top) so the list opens
    // on what matters; past plans follow, most recent first.
    const appointments = useMemo(() => {
        const list = [...scopedRecords(project.appointments, order, isPrimary, project.salesOrders)];
        const todayStart = dayjs().startOf('day').valueOf();
        const upcoming = list
            .filter((a: any) => dayjs(a.startTime).valueOf() >= todayStart)
            .sort((a: any, b: any) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
        const past = list
            .filter((a: any) => dayjs(a.startTime).valueOf() < todayStart)
            .sort((a: any, b: any) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf());
        return [...upcoming, ...past];
    }, [project.appointments, project.salesOrders, order, isPrimary]);
    const salesOrderId = orderPayloadId(order);

    useEffect(() => {
        projectApi.listTechnicians()
            .then(setTechnicians)
            .catch(() => setTechnicians([]));
    }, []);

    const submit = async () => {
        const startTime = dayjs(`${form.date}T${form.start}`).toISOString();
        const endTime = dayjs(`${form.date}T${form.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error(t('auto.bitis_saati_baslangictan_sonra_olmalidir'));
        const technicianIds = [...new Set(form.technicianIds.filter(Boolean))];
        if (!technicianIds.length) return toast.error(t('auto.en_az_bir_teknisyen_secin'));
        setLoading(true);
        try {
            if (editing) {
                await projectApi.updateAppointment(form.id, { salesOrderId, assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                toast.success(t('auto.saat_plani_guncellendi'));
            } else {
                await projectApi.createAppointment(project.id, { salesOrderId, assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                toast.success(t('auto.saat_plani_eklendi'));
            }
            setForm(appointmentToForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.saat_plani_kaydedilemedi'));
        } finally {
            setLoading(false);
        }
    };

    const openManagerCompletion = (appointment: any) => {
        setCompletionAppointmentId(appointment.id);
        setCompletionForm(emptyManagerCompletionForm());
    };

    // Shared by the day agenda and the full plan list.
    const removeAppointment = async (appointment: any) => {
        if (!confirm(t('auto.saat_plani_silinsin_mi_bu_randevuya_bagli_teknis'))) return;
        await projectApi.deleteAppointment(appointment.id);
        await onSaved();
    };

    // Plans still waiting on a technician/manager finish — surfaced on the panel
    // trigger so pending work is visible without opening the list.
    const awaitingCount = appointments.filter((appointment: any) => isAppointmentAwaitingTechnician(project, appointment)).length;

    const selectedDayAppointments = appointments.filter((appointment: any) => dayjs(appointment.startTime).format('YYYY-MM-DD') === form.date);
    const selectedDayOthers = tenantAppointments.filter((appointment: any) =>
        dayjs(appointment.startTime).format('YYYY-MM-DD') === form.date
        && !appointments.some((mine: any) => mine.id === appointment.id));

    const quickManagerFinish = async (appointment: any) => {
        const payload: CompleteInstallationInput = {
            operationsDoneItems: [t('projects.managerCompletedDefault')],
            technicalNotes: '',
            startedAt: appointment.startTime,
            endedAt: new Date().toISOString(),
            expenses: [],
            materials: [],
            usedMaterials: [],
        };
        setCompletionLoading(true);
        try {
            const result = await projectApi.completeAppointmentAsManager(appointment.id, payload);
            toast.success(result.message ||t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) {
                toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            }
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            setCompletionAppointmentId(null);
            setConfirmFinishAppointment(null);
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.montaj_bitirilemedi'));
        } finally {
            setCompletionLoading(false);
        }
    };

    const submitManagerCompletion = async (appointment: any) => {
        const operationItems = completionForm.operations.map((item) => item.trim()).filter(Boolean);
        if (!operationItems.length) return toast.error(t('auto.yapilan_islerden_en_az_bir_madde_girin'));
        const payload: CompleteInstallationInput = {
            operationsDoneItems: operationItems,
            technicalNotes: completionForm.technicalNotes,
            startedAt: appointment.startTime,
            endedAt: new Date().toISOString(),
            expenses: completionForm.expenses
                .filter((row) => row.expenseType && Number(row.amount) > 0)
                .map((row) => ({ ...row, amount: Number(row.amount || 0) })),
            materials: completionForm.materials
                .filter((row) => row.materialId && Number(row.quantity) > 0)
                .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
            usedMaterials: completionForm.usedMaterials
                .filter((row) => row.materialId && Number(row.quantity) > 0)
                .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
        };
        setCompletionLoading(true);
        try {
            const result = await projectApi.completeAppointmentAsManager(appointment.id, payload);
            toast.success(result.message ||t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) {
                toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            }
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            setCompletionAppointmentId(null);
            setCompletionForm(emptyManagerCompletionForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.montaj_bitirilemedi'));
        } finally {
            setCompletionLoading(false);
        }
    };

    return (
        <>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px] xl:items-start">
        <div className="min-w-0 space-y-4">
        <SlidePanel
            open={showPlans}
            onClose={() => setShowPlans(false)}
            title={t('auto.randevu_saat_planlari')}
            subtitle={`${appointments.length} ${t('projects.appointment')}`}
            width={640}
        >
            <div className="-mx-2 divide-y divide-slate-100">
                {appointments.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-slate-900">{t('auto.saat_plani_yok')}</div>}
                {appointments.map((appointment) => {
                    const appointmentReport = findAppointmentReport(project, appointment);
                    const technicianName = appointmentTechnicianNames(appointment);
                    const awaitingTechnician = isAppointmentAwaitingTechnician(project, appointment);
                    const managerCanFinish = canManagerFinishAppointment(project, appointment);
                    const onSelectedDay = dayjs(appointment.startTime).format('YYYY-MM-DD') === form.date;
                    return (
                    <div key={appointment.id} className={`flex flex-wrap items-center justify-between gap-3 border-l-2 px-4 py-3 text-[12.5px] ${onSelectedDay ? 'border-l-[#272f67] bg-[#272f67]/[0.03]' : 'border-l-transparent'}`}>
                        <div>
                            <div className="font-medium text-slate-800">{dayjs(appointment.startTime).format('DD.MM.YYYY')}</div>
                            <div className="text-slate-900">
                                {dayjs(appointment.startTime).format('HH:mm')} - {dayjs(appointment.endTime).format('HH:mm')} · {t('auto.plan')}: {durationFmt(appointmentDuration(appointment))} · {t('auto.azami')}: {durationFmt(Math.ceil(appointmentDuration(appointment) * 1.15))}
                            </div>
                            <div className="mt-1 text-[11.5px] font-semibold text-slate-600">{t('auto.teknisyen')}: {technicianName}
                            </div>
                            {appointment.status === 'COMPLETED' ? (
                                <div className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 size={11} />{t('auto.montaj_tamamlandi')}</div>
                            ) : appointmentReport ? (
                                // Report drafted/attached but the montaj is not finished yet — the
                                // technician can still work and the job can still be finished.
                                <div className="mt-1 inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    Rapor var</div>
                            ) : null}
                            {appointment.notes && <div className="mt-1 text-[11.5px] text-slate-900">{appointment.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className="rounded p-1 text-slate-900 hover:bg-slate-50 hover:text-slate-700"
                                onClick={() => { setForm(appointmentToForm(appointment)); setShowPlans(false); }}
                            >
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                className="rounded p-1 text-slate-900 hover:bg-rose-50 hover:text-rose-600"
                                onClick={() => void removeAppointment(appointment)}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                        {awaitingTechnician && (
                            <div className={`w-full rounded-md border px-3 py-2 ${managerCanFinish ?t('auto.border_red_200_bg_red_50') :t('auto.border_amber_200_bg_amber_50')}`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className={`flex items-center gap-2 text-[12px] font-semibold ${managerCanFinish ? 'text-red-700' : 'text-amber-700'}`}>
                                        <AlertTriangle size={14} />
                                        <span>{t('projects.technicianNotFinished')}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="ghost"
                                            disabled={completionLoading || !managerCanFinish}
                                            onClick={() => openManagerCompletion(appointment)}
                                        >{t('projects.detailedFinish')}</Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="primary"
                                            loading={completionLoading && completionAppointmentId !== appointment.id}
                                            disabled={completionLoading || !managerCanFinish}
                                            icon={<CheckCircle2 size={13} />}
                                            onClick={() => setConfirmFinishAppointment(appointment)}
                                        >{t('projects.managerFinish')}</Button>
                                    </div>
                                </div>
                            </div>
                        )}
                        {completionAppointmentId === appointment.id && (
                            <ManagerCompletionPanel
                                project={project}
                                order={order}
                                form={completionForm}
                                materials={materials}
                                loading={completionLoading}
                                onChange={setCompletionForm}
                                onCancel={() => setCompletionAppointmentId(null)}
                                onSubmit={() => submitManagerCompletion(appointment)}
                            />
                        )}
                    </div>
                    );
                })}
            </div>
        </SlidePanel>
        <AppointmentSchedulerCalendar
            appointments={appointments}
            technicianCount={technicians.length}
            selectedDate={form.date}
            onSelectDate={(date) => setForm((prev) => ({ ...prev, date }))}
            onEditAppointment={(appointment) => setForm(appointmentToForm(appointment))}
            onTenantAppointments={setTenantAppointments}
        />
        </div>
        <div className="min-w-0 space-y-4 xl:sticky xl:top-0">
        <Card
            title={t('projects.cal_day_agenda')}
            description={dayjs(form.date).format('dddd, DD MMMM YYYY')}
            icon={<CalendarClock size={13} />}
            noPadding
            actions={(
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<List size={13} />}
                    onClick={() => setShowPlans(true)}
                >
                    {t('projects.cal_all_plans')}{appointments.length ? ` (${appointments.length})` : ''}
                    {awaitingCount > 0 && (
                        <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-500 px-1 text-[10px] font-bold text-white">
                            {awaitingCount}
                        </span>
                    )}
                </Button>
            )}
        >
            <div className="max-h-72 divide-y divide-slate-100 overflow-y-auto">
                {selectedDayAppointments.length === 0 && selectedDayOthers.length === 0 && (
                    <div className="px-4 py-5 text-center text-[12px] text-slate-500">{t('projects.cal_day_agenda_empty')}</div>
                )}
                {selectedDayAppointments.map((appointment: any) => (
                    <div key={appointment.id} className="px-4 py-2.5">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12.5px] font-semibold tabular-nums text-slate-900">
                                {dayjs(appointment.startTime).format('HH:mm')} – {dayjs(appointment.endTime).format('HH:mm')}
                            </span>
                            <span className="flex items-center gap-1">
                                {appointment.status === 'COMPLETED' && (
                                    <span className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">
                                        <CheckCircle2 size={10} />{t('projects.flow.stateCompleted')}
                                    </span>
                                )}
                                <button
                                    type="button"
                                    title={t('common.update')}
                                    className="rounded p-1 text-slate-500 hover:bg-slate-50 hover:text-slate-800"
                                    onClick={() => setForm(appointmentToForm(appointment))}
                                >
                                    <Pencil size={12} />
                                </button>
                                <button
                                    type="button"
                                    title={t('common.delete')}
                                    className="rounded p-1 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
                                    onClick={() => void removeAppointment(appointment)}
                                >
                                    <Trash2 size={12} />
                                </button>
                            </span>
                        </div>
                        <div className="mt-0.5 text-[11.5px] font-medium text-slate-600">
                            {t('auto.teknisyen')}: {appointmentTechnicianNames(appointment)}
                        </div>
                        {appointment.notes && <div className="mt-0.5 text-[11.5px] text-slate-500">{appointment.notes}</div>}
                    </div>
                ))}
                {selectedDayOthers.length > 0 && (
                    <>
                        <div className="bg-slate-50/60 px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                            {t('projects.cal_others')}
                        </div>
                        {selectedDayOthers.map((appointment: any) => (
                            <div key={appointment.id} className="px-4 py-2">
                                <div className="text-[11.5px] font-medium text-slate-600">
                                    <span className="tabular-nums">{dayjs(appointment.startTime).format('HH:mm')} – {dayjs(appointment.endTime).format('HH:mm')}</span>
                                    {' · '}
                                    {appointment.project?.projectName || appointment.project?.customer?.companyName || appointment.salesOrder?.orderNumber || '—'}
                                </div>
                                <div className="mt-0.5 text-[11px] text-slate-400">
                                    {appointmentTechnicianNames(appointment)}
                                </div>
                            </div>
                        ))}
                    </>
                )}
            </div>
        </Card>
        <Card
            title={editing ?t('auto.saat_planini_duzenle') :t('auto.saat_plani_ekle')}
            icon={<CalendarClock size={13} />}
            actions={editing ? (
                <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50" onClick={() => setForm(appointmentToForm())}>
                    <X size={13} />
                </button>
            ) : undefined}
        >
            <div>
                <div className="mb-3 flex items-center gap-2.5 rounded-lg border border-[#272f67]/20 bg-[#272f67]/[0.04] px-3 py-2">
                    <CalendarClock size={15} className="shrink-0 text-[#272f67]" />
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[#272f67]/70">{t('projects.cal_selected')}</div>
                        <div className="truncate text-[12.5px] font-semibold capitalize text-[#272f67]">{dayjs(form.date).format('dddd, DD MMMM YYYY')}</div>
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-3">
                    <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                    <div className="grid grid-cols-2 gap-3">
                        <Field label={t('common.start')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                        <Field label={t('common.end')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                    </div>
                    <Field label={t('auto.teknisyenler')}>
                        <div className="space-y-2">
                            <Select value="" onChange={(e) => {
                                const id = e.target.value;
                                if (!id) return;
                                const ids = form.technicianIds.includes(id) ? form.technicianIds : [...form.technicianIds, id];
                                setForm({ ...form, assignedTechId: ids[0] || '', technicianIds: ids });
                            }}>
                                <option value="">{t('auto.teknisyen_ekle')}</option>
                                {technicians.filter((tech) => !form.technicianIds.includes(tech.id)).map((tech) => (
                                    <option key={tech.id} value={tech.id}>
                                        {tech.firstName} {tech.lastName}{tech.email ? ` - ${tech.email}` : ''}
                                    </option>
                                ))}
                            </Select>
                            <div className="flex flex-wrap gap-1">
                                {form.technicianIds.map((id, index) => {
                                    const tech = technicians.find((item) => item.id === id);
                                    return (
                                        <span key={id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                            {index === 0 ? 'Sorumlu: ' : ''}{tech ? `${tech.firstName} ${tech.lastName}` : id}
                                            <button
                                                type="button"
                                                className="text-slate-400 hover:text-rose-600"
                                                onClick={() => {
                                                    const ids = form.technicianIds.filter((item) => item !== id);
                                                    setForm({ ...form, assignedTechId: ids[0] || '', technicianIds: ids });
                                                }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    );
                                })}
                                {form.technicianIds.length === 0 && <span className="text-[11px] text-slate-500">{t('auto.teknisyen_secilmedi')}</span>}
                            </div>
                        </div>
                    </Field>
                    <Field label={t('auto.not')}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </div>
                <Button className="mt-3" loading={loading} icon={<Save size={13} />} onClick={submit}>
                    {editing ?t('common.update') :t('common.add')}
                </Button>
            </div>
        </Card>
        </div>
        </div>
        <Modal
            open={!!confirmFinishAppointment}
            title="Montajı bitir"
            description="Yönetici olarak montajı bitirmek istiyor musunuz?"
            width="sm"
            onClose={() => { if (!completionLoading) setConfirmFinishAppointment(null); }}
            footer={
                <>
                    <Button variant="secondary" size="sm" disabled={completionLoading} onClick={() => setConfirmFinishAppointment(null)}>{t('common.cancel')}</Button>
                    <Button
                        variant="primary"
                        size="sm"
                        loading={completionLoading}
                        icon={<CheckCircle2 size={13} />}
                        onClick={() => { if (confirmFinishAppointment) void quickManagerFinish(confirmFinishAppointment); }}
                    >Evet, bitir</Button>
                </>
            }
        >
            <p className="text-[13px] text-slate-600">
                Bu işlem montajı yönetici tarafından tamamlanmış olarak işaretler ve çalışılan saatleri onaylar. Herhangi bir alan doldurmanıza gerek yoktur.
            </p>
        </Modal>
        </>
    );
};

const ManagerCompletionPanel = ({
    project,
    order,
    form,
    materials,
    loading,
    onChange,
    onCancel,
    onSubmit,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    form: ManagerCompletionFormState;
    materials: ProjectMaterial[];
    loading: boolean;
    onChange: (form: ManagerCompletionFormState) => void;
    onCancel: () => void;
    onSubmit: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<'reports' | 'costs' | 'materials'>('reports');
    const [materialMode, setMaterialMode] = useState<MaterialMode>('used');
    const usedMaterials = getProjectUsedMaterials(project, order);
    const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
    const expenseTotal = form.expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const extraMaterialTotal = form.materials.reduce((sum, row) => {
        const material = materialById.get(row.materialId);
        return sum + Number(row.quantity || 0) * Number(material?.unitCost || 0);
    }, 0);
    const activeMaterialRows = materialMode === 'used' ? form.usedMaterials : form.materials;
    const setActiveMaterialRows = (rows: ManagerCompletionFormState['materials']) => {
        if (materialMode === 'used') onChange({ ...form, usedMaterials: rows });
        else onChange({ ...form, materials: rows });
    };
    const updateOperation = (index: number, value: string) =>
        onChange({ ...form, operations: form.operations.map((item, rowIndex) => rowIndex === index ? value : item) });
    const updateExpense = (index: number, patch: Partial<ManagerCompletionFormState['expenses'][number]>) =>
        onChange({ ...form, expenses: form.expenses.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item) });
    const updateMaterial = (index: number, patch: Partial<ManagerCompletionFormState['materials'][number]>) =>
        setActiveMaterialRows(activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item));

    return (
        <div className="w-full rounded-md border border-slate-200 bg-white p-3 shadow-xs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[12px] font-semibold text-slate-900">{t('auto.yonetici_bitirme_formu')}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{t('auto.kaydedilince_saha_raporu_olusur_maliyetler_proje')}</div>
                </div>
                <Button type="button" size="sm" variant="ghost" icon={<X size={13} />} disabled={loading} onClick={onCancel}>{t('common.close')}</Button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('projects.fieldReport')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{form.operations.filter((item) => item.trim()).length}{t('auto.madde')}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.harici_gider')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(expenseTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_malzeme')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(extraMaterialTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.kullanilan')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{usedMaterials.length}{t('auto.malzeme')}</div>
                </div>
            </div>

            <div className="mb-3 overflow-x-auto border-b border-slate-200">
                <div className="flex min-w-max items-center gap-6 px-1">
                    {[
                        { key: 'reports' as const, label:t('projects.fieldReport') },
                        { key: 'costs' as const, label:t('auto.harici_giderler') },
                        { key: 'materials' as const, label:t('nav.materials') },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`relative whitespace-nowrap pb-3 text-[13px] font-semibold transition-colors ${activeTab === tab.key ?t('auto.text_brand_700_after_absolute_after_inset_x_0_af') :t('auto.text_slate_600_hover_text_slate_950')}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className={activeTab === 'reports' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.yapilan_isler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ClipboardPenLine size={12} />} disabled={loading} onClick={() => onChange({ ...form, operations: [...form.operations, ''] })}>{t('auto.madde')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.operations.map((item, index) => (
                            <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                <Input value={item} disabled={loading} onChange={(event) => updateOperation(index, event.target.value)} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.operations.length === 1} onClick={() => onChange({ ...form, operations: form.operations.filter((_, rowIndex) => rowIndex !== index) })} />
                            </div>
                        ))}
                        <Field label={t('auto.teknik_notlar')}>
                            <Textarea rows={3} value={form.technicalNotes} disabled={loading} onChange={(event) => onChange({ ...form, technicalNotes: event.target.value })} />
                        </Field>
                    </div>
                </div>

                <div className={activeTab === 'costs' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.harici_giderler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ReceiptText size={12} />} disabled={loading} onClick={() => onChange({ ...form, expenses: [...form.expenses, { expenseType:t('auto.nakliye'), amount: 0, description: '' }] })}>{t('auto.satir')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.expenses.map((row, index) => (
                            <div key={index} className="grid grid-cols-[1fr_92px_32px] gap-2">
                                <Select value={row.expenseType} disabled={loading} onChange={(event) => updateExpense(index, { expenseType: event.target.value })}>
                                    {[t('auto.nakliye'),t('auto.ekipman_kiralama'),t('auto.dis_hizmetler'),t('auto.taseron'),t('auto.diger')].map((type) => <option key={type} value={type}>{type}</option>)}
                                </Select>
                                <Input type="number" min="0" step="0.01" value={row.amount} disabled={loading} onChange={(event) => updateExpense(index, { amount: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.expenses.length === 1} onClick={() => onChange({ ...form, expenses: form.expenses.filter((_, rowIndex) => rowIndex !== index) })} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateExpense(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className={activeTab === 'materials' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('nav.materials')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<PackagePlus size={12} />} disabled={loading} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('auto.satir')}</Button>
                    </div>
                    <div className="border-b border-slate-100 px-3 pt-3">
                        <SubTabs tabs={getMaterialSubTabs()} activeTab={materialMode} onSelectTab={setMaterialMode} />
                    </div>
                    {materialMode === 'used' && (usedMaterials.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[12px] text-slate-500">{t('auto.kullanilan_malzeme_yok')}</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {usedMaterials.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                        <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} - {numberFmt(item.quantity)}{"adet -"}{item.positionNumber}</div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('auto.dahil')}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="space-y-2 p-3">
                        {activeMaterialRows.map((row, index) => (
                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_82px_32px] gap-2">
                                <MaterialSearchSelect value={row.materialId} materials={materials} disabled={loading} onChange={(materialId) => {
                                    const next = activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, materialId } : item);
                                    setActiveMaterialRows(materialId && index === activeMaterialRows.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next);
                                }} />
                                <Input type="number" min="0" step="0.01" value={row.quantity} disabled={loading} onChange={(event) => updateMaterial(index, { quantity: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, rowIndex) => rowIndex !== index))} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateMaterial(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex justify-end">
                <Button type="button" loading={loading} icon={<Save size={13} />} onClick={onSubmit}>{t('auto.yonetici_bitir')}</Button>
            </div>
        </div>
    );
};

const MailTab = ({ project, order, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; settings: MailSettingDto | null; userEmail: string }) => {
    const [form, setForm] = useState({
        fromName: settings?.fromName ||t('auto.offitec_erp'),
        fromEmail: settings?.fromEmail || userEmail,
        to: project.customer?.mainEmail || '',
        subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
        message:t('auto.lutfen_size_uygun_montaj_saatini_secin'),
    });
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        setSent(false);
        setForm({
            fromName: settings?.fromName ||t('auto.offitec_erp'),
            fromEmail: settings?.fromEmail || userEmail,
            to: project.customer?.mainEmail || '',
            subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
            message:t('auto.lutfen_size_uygun_montaj_saatini_secin'),
        });
    }, [project.id, order?.id, settings, userEmail]);

    return (
        <div>
            <Card title={t('auto.randevu_maili')} icon={<Mail size={13} />}>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                    <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                    <Field label={t('auto.alici')}><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                    <Field label={t('auto.konu')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                    <Field label={t('auto.mesaj')} className="md:col-span-2"><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                </div>
                <Button
                    className="mt-3"
                    variant="primary"
                    icon={sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    loading={loading}
                    disabled={sent}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.sendBookingMail(project.id, { ...form, salesOrderId: orderPayloadId(order) });
                            setSent(true);
                            toast.success(res.message ||t('auto.mail_hazirlandi'));
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.mail_gonderilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {sent ?t('auto.gonderildi') :t('common.send')}
                </Button>
            </Card>
        </div>
    );
};

/* Retired with the inline Saha (FieldReportEditor) flow — kept for reference.
const emptyReportForm = () => ({ workDate: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', operationsDone: '', technicalNotes: '' });

const reportToForm = (report: any) => ({
    workDate: dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD'),
    start: dayjs(report.startedAt).format('HH:mm'),
    end: dayjs(report.endedAt).format('HH:mm'),
    operationsDone: report.operationsDone || '',
    technicalNotes: report.technicalNotes || '',
});

const ReportForm = ({ project, order, isPrimary, editingReport, onCancelEdit, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; editingReport: any | null; onCancelEdit: () => void; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(emptyReportForm());
    const [loading, setLoading] = useState(false);
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const existingForDay = reports.find((report: any) =>
        dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD') === form.workDate && report.id !== editingReport?.id
    );

    useEffect(() => {
        setForm(editingReport ? reportToForm(editingReport) : emptyReportForm());
    }, [editingReport?.id]);

    return (
        <Card title={editingReport ?t('auto.raporu_duzenle') :t('auto.yeni_rapor')} icon={<Save size={13} />}>
            <div className="space-y-3">
                <Field label={t('common.date')}><Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
                {existingForDay && (
                    <div className="text-[12px] text-slate-900">{t('auto.bu_gune_ait_bir_rapor_zaten_var_ayni_gune_ikinci')}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('common.start')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                    <Field label={t('common.end')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                </div>
                <Field label={t('auto.yapilan_is')} required><Textarea rows={4} value={form.operationsDone} onChange={(e) => setForm({ ...form, operationsDone: e.target.value })} /></Field>
                <Field label={t('auto.teknik_notlar')}><Textarea rows={3} value={form.technicalNotes} onChange={(e) => setForm({ ...form, technicalNotes: e.target.value })} /></Field>
                {editingReport && (
                    <Button variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={Boolean(existingForDay)}
                    icon={<Save size={13} />}
                    onClick={async () => {
                        if (!form.operationsDone.trim()) return toast.error(t('auto.yapilan_is_alani_zorunludur'));
                        setLoading(true);
                        try {
                            // Tie the report to a single appointment when the chosen day maps to
                            // exactly one appointment on this order, so it never leaks onto siblings.
                            const scopedAppointments = scopedRecords(project.appointments, order, isPrimary, project.salesOrders);
                            const sameDayAppointments = scopedAppointments.filter((appt: any) => dayjs(appt.startTime).format('YYYY-MM-DD') === form.workDate);
                            const resolvedAppointmentId = editingReport?.appointmentId ?? (sameDayAppointments.length === 1 ? sameDayAppointments[0].id : undefined);
                            const payload = {
                                salesOrderId: orderPayloadId(order),
                                appointmentId: resolvedAppointmentId,
                                workDate: dayjs(`${form.workDate}T00:00`).toISOString(),
                                startedAt: dayjs(`${form.workDate}T${form.start}`).toISOString(),
                                endedAt: dayjs(`${form.workDate}T${form.end}`).toISOString(),
                                operationsDone: form.operationsDone,
                                technicalNotes: form.technicalNotes,
                            };
                            const res = editingReport
                                ? await projectApi.updateReport(editingReport.id, payload)
                                : await projectApi.addReport(project.id, payload);
                            if (res.report?.overtimeWarning) toast.warning(res.report.overtimeWarning);
                            toast.success(`Saha raporu ${editingReport ?t('auto.guncellendi') : 'eklendi'}.`);
                            setForm(emptyReportForm());
                            await onSaved();
                            toast.success(editingReport ?t('auto.rapor_guncellendi') :t('auto.rapor_kaydedildi'));
                            setForm(emptyReportForm());
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.rapor_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingReport ?t('common.update') :t('common.save')}
                </Button>
            </div>
        </Card>
    );
};

/* View-only refactor: expenses & materials are now added only via the field-report flow.
   These add-forms are retained (commented) for reference.
const UsedMaterialForm = ({ project, order, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);
    const tenderId = order?.tenderId || project.tenderId;

    return (
        <Card title={t('auto.kullanilan_malzeme_ekle')} icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.malzeme')} required>
                    <MaterialSearchSelect value={form.materialId} materials={materials} disabled={!tenderId} onChange={(materialId) => setForm({ ...form, materialId })} />
                </Field>
                <Field label={t('common.quantity')}><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label={t('common.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">{t('auto.kullanilan_malzemeler_stoktan_duser_fakat_proje_')}</div>
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={!tenderId}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!tenderId) return toast.error(t('auto.bu_siparis_bir_teklife_bagli_degil'));
                        if (!form.materialId) return toast.error(t('auto.malzeme_secin'));
                        if (form.quantity <= 0) return toast.error(t('auto.miktar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            await tenderApi.mapMaterial(tenderId, form.materialId, form.quantity, form.description);
                            toast.success(t('auto.kullanilan_malzeme_eklendi'));
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.kullanilan_malzeme_eklenemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >{t('auto.kullanilan_malzeme_ekle')}</Button>
            </div>
        </Card>
    );
};

const VariationForm = ({
    projectId,
    salesOrderId,
    materials,
    editingMaterial,
    onCancelEdit,
    onSaved,
}: {
    projectId: string;
    salesOrderId?: string | null;
    materials: ProjectMaterial[];
    editingMaterial?: any | null;
    onCancelEdit?: () => void;
    onSaved: () => Promise<void>;
}) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setForm(editingMaterial
            ? {
                materialId: editingMaterial.materialId || '',
                quantity: Number(editingMaterial.quantity || 1),
                description: editingMaterial.description || '',
            }
            : { materialId: '', quantity: 1, description: '' });
    }, [editingMaterial?.id]);

    return (
        <Card title={editingMaterial ?t('auto.ek_malzemeyi_duzenle') :t('auto.malzeme_ekle')} icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.malzeme')} required><MaterialSearchSelect value={form.materialId} materials={materials} onChange={(materialId) => setForm({ ...form, materialId })} /></Field>
                <Field label={t('common.quantity')}><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label={t('common.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                {editingMaterial && (
                    <Button type="button" variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!form.materialId) return toast.error(t('auto.malzeme_secin'));
                        if (form.quantity <= 0) return toast.error(t('auto.miktar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            if (editingMaterial) {
                                await projectApi.updateExtraMaterial(editingMaterial.id, { ...form, salesOrderId });
                                toast.success(t('auto.ek_malzeme_guncellendi'));
                            } else {
                                await projectApi.requestVariation(projectId, { ...form, salesOrderId });
                                toast.success(t('auto.talep_olusturuldu'));
                            }
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.ek_malzeme_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingMaterial ?t('common.update') :t('auto.talep_olustur')}
                </Button>
            </div>
        </Card>
    );
};

const EditableExpenseForm = ({
    projectId,
    salesOrderId,
    editingExpense,
    onCancelEdit,
    onSaved,
}: {
    projectId: string;
    salesOrderId?: string | null;
    editingExpense?: any | null;
    onCancelEdit?: () => void;
    onSaved: () => Promise<void>;
}) => {
    const [form, setForm] = useState({ expenseType:t('auto.nakliye'), amount: 0, description: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setForm(editingExpense
            ? {
                expenseType: editingExpense.expenseType ||t('auto.nakliye'),
                amount: Number(editingExpense.amount || 0),
                description: editingExpense.description || '',
            }
            : { expenseType:t('auto.nakliye'), amount: 0, description: '' });
    }, [editingExpense?.id]);

    return (
        <Card title={editingExpense ?t('auto.harici_gideri_duzenle') :t('auto.harici_gider_ekle')} icon={<ReceiptText size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.gider_tipi')}>
                    <Select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>
                        {[t('auto.nakliye'),t('auto.ekipman_kiralama'),t('auto.dis_hizmetler'),t('auto.taseron'),t('auto.diger')].map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                </Field>
                <Field label={t('common.amount')}>
                    <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
                </Field>
                <Field label={t('common.description')}>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                {editingExpense && (
                    <Button type="button" variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        if (form.amount <= 0) return toast.error(t('auto.tutar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            if (editingExpense) {
                                await projectApi.updateExpense(editingExpense.id, { ...form, salesOrderId });
                                toast.success(t('auto.gider_guncellendi'));
                            } else {
                                await projectApi.addExpense(projectId, { ...form, salesOrderId });
                                toast.success(t('auto.gider_eklendi'));
                            }
                            setForm({ expenseType:t('auto.nakliye'), amount: 0, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.gider_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingExpense ?t('common.update') :t('auto.gider_ekle')}
                </Button>
            </div>
        </Card>
    );
};

/*
const ExpenseForm = ({ projectId, salesOrderId, onSaved }: { projectId: string; salesOrderId?: string | null; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ expenseType: 'Nakliye', amount: 0, description: '' });
    const [loading, setLoading] = useState(false);

    return (
        <Card title="Harici Gider Ekle" icon={<ReceiptText size={13} />}>
            <div className="space-y-3">
                <Field label="Gider tipi"><Select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>{['Nakliye', 'Ekipman Kiralama', 'Dış hizmetler', 'Taşeron', 'Diğer'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
                <Field label="Tutar"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} /></Field>
                <Field label="Aciklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        if (form.amount <= 0) return toast.error('Tutar sifirdan buyuk olmali.');
                        setLoading(true);
                        try {
                            await projectApi.addExpense(projectId, { ...form, salesOrderId });
                            toast.success('Gider eklendi.');
                            setForm({ expenseType: 'Nakliye', amount: 0, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Gider eklenemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Gider Ekle
                </Button>
            </div>
        </Card>
    );
};

*/
