import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { CheckCircle, Clipboard, Send01 as Send } from '@/components/icons/antIconCompat';

import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui-shared/Card';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { Field, Select, Textarea } from '@/components/ui-shared/Field';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import {
    checklistApi,
    deliveryReportApi,
    projectApi,
    type ChecklistTemplateDto,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
    type SignatureSnapshot,
} from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';

import { buildResponses, groupResponsesByCategory } from '../../projects/utils/deliveryReportUtils';
import { DeliveryChecklistCategory } from '../../projects/components/delivery/DeliveryChecklistCategory';

// Orders the technician has participated in are derived from their installations.
// There is no all-time "my orders" endpoint yet, so we scan a broad window; swap
// this for a dedicated backend endpoint when one exists.
const WINDOW_START = () => dayjs().subtract(1, 'year').format('YYYY-MM-DD');
const WINDOW_END = () => dayjs().add(3, 'month').format('YYYY-MM-DD');

type TechOrder = { id: string; orderNumber: string };
type TechProject = { id: string; name: string; customer?: any; orders: TechOrder[] };

const snapshotFromResponses = (project: TechProject, checklistName: string, responses: DeliveryResponseItem[]): SignatureSnapshot => ({
    title: checklistName || t('projects.delivery.pdf.title'),
    customerName: project.customer?.companyName,
    projectName: project.name,
    sections: groupResponsesByCategory(responses, t('projects.delivery.uncategorized')).map((group) => ({
        heading: group.category,
        rows: group.items.map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
    })),
});

const completed = (responses: DeliveryResponseItem[]) => responses.filter((r) => r.status !== null).length;

/**
 * Technician "Delivery Reports" screen (sidebar → Technician Installations →
 * Delivery Reports). The delivery report is per **project**: pick a project, fill
 * its checklist once, capture one customer signature, and send one report. Orders
 * are shown only as reference — an order is never signed on its own.
 */
export const TechnicianDeliveryReports = () => {
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);

    const [projects, setProjects] = useState<TechProject[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeProjectId, setActiveProjectId] = useState<string | null>(null);

    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [reports, setReports] = useState<DeliveryReportDto[]>([]);
    const [projectLoading, setProjectLoading] = useState(false);

    // Edit buffer for the selected project's single delivery report.
    const [reportId, setReportId] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState<string>('');
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [signature, setSignature] = useState<string | null>(null);
    const [signOpen, setSignOpen] = useState(false);
    // Sending overlay: 'sending' shows a spinner, 'done' a check, then it clears.
    const [sendState, setSendState] = useState<'sending' | 'done' | null>(null);

    const loadProjects = async () => {
        setLoading(true);
        try {
            const rows = (await projectApi.listMyInstallations(WINDOW_START(), WINDOW_END())) as any[];
            const map = new Map<string, TechProject>();
            for (const appt of rows) {
                const p = appt.project;
                if (!p?.id) continue;
                let tp = map.get(p.id);
                if (!tp) {
                    tp = { id: p.id, name: p.projectName || p.customer?.companyName || p.id, customer: p.customer, orders: [] };
                    map.set(p.id, tp);
                }
                for (const order of (p.salesOrders || []) as any[]) {
                    if (!order?.id || tp.orders.some((o) => o.id === order.id)) continue;
                    tp.orders.push({ id: order.id, orderNumber: order.orderNumber || order.id });
                }
            }
            setProjects(Array.from(map.values()));
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.montajlar_yuklenemedi'));
            setProjects([]);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!userId || !selectedTenantId) return;
        void loadProjects();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, selectedTenantId]);

    const activeProject = useMemo(() => projects.find((p) => p.id === activeProjectId) || null, [projects, activeProjectId]);
    const currentReport = useMemo(() => reports.find((r) => r.id === reportId) || null, [reports, reportId]);
    const selectedTemplate = templates.find((x) => x.id === templateId) || null;

    // Seed the edit buffer from the project's own delivery report (the one not
    // scoped to a single order), or a fresh checklist from the active template.
    const seedBuffer = (rows: DeliveryReportDto[], tpls: ChecklistTemplateDto[]) => {
        const projectReport = rows.find((r) => !r.salesOrderId) || rows[0] || null;
        setSignature(null);
        if (projectReport) {
            setReportId(projectReport.id);
            setTemplateId(projectReport.checklistTemplateId || '');
            setResponses((projectReport.responses || []).map((x) => ({ ...x })));
            setNotes(projectReport.notes || '');
        } else {
            const tpl = tpls[0] || null;
            setReportId(null);
            setTemplateId(tpl?.id || '');
            setResponses(tpl ? buildResponses(tpl) : []);
            setNotes('');
        }
    };

    const loadProject = async (projectId: string) => {
        setActiveProjectId(projectId);
        setProjectLoading(true);
        try {
            const [tpls, rows] = await Promise.all([
                checklistApi.list().then((r) => r.filter((x) => x.isActive)).catch(() => [] as ChecklistTemplateDto[]),
                deliveryReportApi.list({ projectId }).catch(() => [] as DeliveryReportDto[]),
            ]);
            setTemplates(tpls);
            setReports(rows);
            seedBuffer(rows, tpls);
        } finally {
            setProjectLoading(false);
        }
    };

    const selectTemplate = (id: string) => {
        setTemplateId(id);
        const tpl = templates.find((x) => x.id === id);
        setResponses(tpl ? buildResponses(tpl) : []);
    };

    const setStatus = (id: string, status: DeliveryStatus) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    // Persist the project's single delivery report (order-independent).
    const persist = async (signatureBase64: string | null): Promise<boolean> => {
        if (responses.length === 0) { toast.error(t('projects.delivery.selectChecklistFirst')); return false; }
        if (reportId) {
            await deliveryReportApi.update(reportId, { responses, notes: notes.trim() || null });
            if (signatureBase64) await deliveryReportApi.sign(reportId, signatureBase64);
        } else {
            await deliveryReportApi.create({
                projectId: activeProject?.id || null,
                salesOrderId: null,
                appointmentId: null,
                checklistTemplateId: templateId || null,
                checklistName: selectedTemplate?.name || null,
                responses,
                notes: notes.trim() || null,
                signatureBase64,
            });
        }
        return true;
    };

    const send = async () => {
        setSendState('sending');
        try {
            if (!(await persist(signature))) { setSendState(null); return; }
            setSendState('done');
            toast.success(t('projects.delivery.sentOk'));
            setSignature(null);
            if (activeProject) await loadProject(activeProject.id);
            setTimeout(() => setSendState(null), 1400);
        } catch (e: any) {
            setSendState(null);
            toast.error(e?.response?.data?.error || t('projects.delivery.sendError'));
        }
    };

    return (
        <div>
            <PageHeader breadcrumb="Proje" title={t('nav.deliveryReports')} description={t('projects.delivery.sendHint')} />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
                {/* Projects the technician is involved in. */}
                <div className="lg:col-span-4">
                    <Card title={t('nav.projects')} icon={<Clipboard size={13} />} noPadding>
                        {loading ? (
                            <div className="m-4 h-64 animate-pulse rounded bg-slate-100" />
                        ) : projects.length === 0 ? (
                            <EmptyState icon={<Clipboard size={28} />} title={t('projects.montaj_yok')} description={t('projects.secili_haftada_montaj_kaydi_yok')} />
                        ) : (
                            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                                {projects.map((project) => (
                                    <button key={project.id} type="button" onClick={() => loadProject(project.id)} className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${project.id === activeProjectId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                                        <div className="min-w-0">
                                            <div className="truncate text-[12.5px] font-semibold text-slate-900">{project.name}</div>
                                            <div className="text-[11px] text-slate-500">{project.customer?.companyName || '-'}</div>
                                        </div>
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{project.orders.length}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>

                {/* Selected project's single delivery report. */}
                <div className="lg:col-span-8">
                    <Card>
                        {!activeProject ? (
                            <EmptyState icon={<Clipboard size={28} />} title={t('nav.deliveryReports')} description={t('projects.randevu_secin')} />
                        ) : projectLoading ? (
                            <div className="h-64 animate-pulse rounded bg-slate-100" />
                        ) : (
                            <div className="space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-[13px] font-semibold text-slate-900">{activeProject.name}</div>
                                    {currentReport && (currentReport.isSigned
                                        ? <StatusChip variant="active">{t('projects.delivery.statusSigned')}</StatusChip>
                                        : <StatusChip variant="warning">{t('projects.delivery.statusUnsigned')}</StatusChip>)}
                                </div>

                                {/* Orders this project covers — reference only, never signed. */}
                                {activeProject.orders.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeProject.orders.map((order) => (
                                            <span key={order.id} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                        ))}
                                    </div>
                                )}

                                {!reportId && (
                                    <Field label={t('projects.delivery.checklist')}>
                                        <Select value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
                                            {templates.length === 0 && <option value="">{t('projects.delivery.noChecklists')}</option>}
                                            {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                                        </Select>
                                    </Field>
                                )}

                                {responses.length > 0 && (
                                    <div className="text-[11.5px] font-semibold text-slate-500">{completed(responses)}/{responses.length}</div>
                                )}

                                {groupResponsesByCategory(responses).map((group) => (
                                    <DeliveryChecklistCategory
                                        key={group.category}
                                        title={group.category === '—' ? t('projects.delivery.uncategorized') : group.category}
                                        items={group.items}
                                        onStatus={setStatus}
                                        onMeasurement={setMeasurement}
                                    />
                                ))}

                                <Field label={t('projects.delivery.notes')}>
                                    <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                                </Field>

                                {/* Single customer signature for the whole project. */}
                                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3">
                                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-800">
                                        {t('projects.delivery.customerSignature')}
                                        {(signature || currentReport?.isSigned) && <CheckCircle size={15} className="text-emerald-600" />}
                                    </div>
                                    <Button variant="secondary" size="sm" onClick={() => setSignOpen(true)}>{signature ? t('signatures.getSignature') : t('projects.task.sign')}</Button>
                                </div>

                                <div className="flex items-center justify-end gap-1.5">
                                    <Button variant="primary" size="sm" icon={<Send size={13} />} onClick={send}>{t('projects.delivery.sendReport')}</Button>
                                </div>

                                <SignatureSheet
                                    open={signOpen}
                                    title={selectedTemplate?.name || currentReport?.checklistName || t('projects.delivery.pdf.title')}
                                    snapshot={snapshotFromResponses(activeProject, selectedTemplate?.name || currentReport?.checklistName || '', responses)}
                                    saving={false}
                                    onClose={() => setSignOpen(false)}
                                    onSave={(sig) => { if (sig) setSignature(sig); setSignOpen(false); }}
                                />
                            </div>
                        )}
                    </Card>
                </div>
            </div>

            {/* Sending confirmation: "Delivery Report is being sent" then a check. */}
            {sendState && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/30">
                    <div className="flex flex-col items-center gap-3 rounded-2xl bg-white px-8 py-7 shadow-2xl">
                        {sendState === 'sending' ? (
                            <>
                                <span className="size-10 animate-spin rounded-full border-[3px] border-slate-200 border-t-[#272f67]" />
                                <div className="text-[13px] font-semibold text-slate-700">{t('projects.delivery.sending')}</div>
                            </>
                        ) : (
                            <>
                                <CheckCircle size={40} className="text-emerald-600" />
                                <div className="text-[13px] font-semibold text-emerald-700">{t('projects.delivery.sentOk')}</div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default TechnicianDeliveryReports;
