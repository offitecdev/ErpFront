import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { CheckCircle, ChevronDown, ChevronRight, FileDownload02 as DownloadIcon, RefreshCcw01, Save01 as Save, Send01 as Send } from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { Field, Textarea } from '@/components/ui-shared/Field';
import { ReportsSheet } from '@/pages/project/features/components/detail/reports/ReportsSheet';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import {
    deliveryReportApi,
    signatureApi,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
} from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';
import { t } from '@/i18n/translate';

import { groupResponsesByCategory } from '../../utils/deliveryReportUtils';
import { buildDeliverySignatureSnapshot } from '../../utils/signatureSnapshots';

const STATUS_OPTIONS: Array<{ value: Exclude<DeliveryStatus, null>; labelKey: string; tone: string }> = [
    { value: 'YES', labelKey: 'projects.delivery.yes', tone: 'text-emerald-700' },
    { value: 'NO', labelKey: 'projects.delivery.no', tone: 'text-rose-700' },
    { value: 'NA', labelKey: 'projects.delivery.na', tone: 'text-slate-500' },
];

const gatherImages = (project: ProjectDto, salesOrderId: string | null): Array<{ imageData: string }> =>
    ((project as any).reports || [])
        .filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId)
        .flatMap((r: any) => (Array.isArray(r.images) ? r.images : []))
        .filter((img: any) => img?.imageData)
        .map((img: any) => ({ imageData: img.imageData }));

const completedCount = (responses: DeliveryResponseItem[]) => responses.filter((r) => r.status !== null).length;

/**
 * Project "Delivery Reports" tab: the project's delivery reports listed as order
 * items, each expanding to its checklist. Signatures live in their own section,
 * and "Send delivery report" opens a popup listing the orders to be delivered
 * (dispatched to the customer for signature).
 */
export const DeliveryReportsTab = ({ project }: { project: ProjectDto; order?: { id: string } | null }) => {
    const [reports, setReports] = useState<DeliveryReportDto[]>([]);
    const [expandedId, setExpandedId] = useState<string | null>(null);
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dlBusy, setDlBusy] = useState(false);
    const [sendOpen, setSendOpen] = useState(false);
    const [sendIds, setSendIds] = useState<Set<string>>(new Set());
    const [sendBusy, setSendBusy] = useState(false);

    const load = async (focusId?: string) => {
        setLoading(true);
        try {
            const rows = await deliveryReportApi.list({ projectId: project.id });
            setReports(rows);
            if (focusId) {
                const focus = rows.find((r) => r.id === focusId);
                if (focus) expand(focus);
            }
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id]);

    const orderLabel = (r: DeliveryReportDto) =>
        (project.salesOrders || []).find((o) => o.id === r.salesOrderId)?.orderNumber || r.checklistName || t('projects.delivery.pdf.title');

    // Load a report's checklist into the edit buffer when its card is opened.
    const expand = (r: DeliveryReportDto) => {
        setExpandedId(r.id);
        setResponses((r.responses || []).map((x) => ({ ...x })));
        setNotes(r.notes || '');
    };
    const toggle = (r: DeliveryReportDto) => (expandedId === r.id ? setExpandedId(null) : expand(r));

    const setStatus = (id: string, status: DeliveryStatus) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const save = async () => {
        if (!expandedId) return;
        setSaving(true);
        try {
            await deliveryReportApi.update(expandedId, { responses, notes: notes.trim() || null });
            toast.success(t('projects.delivery.admin.saved'));
            await load(expandedId);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const download = async (report: DeliveryReportDto) => {
        setDlBusy(true);
        try {
            const { exportDeliveryReportPdf } = await import('@/utils/pdf/deliveryReportPdf');
            const edited = report.id === expandedId ? { ...report, responses, notes } : report;
            await exportDeliveryReportPdf({ report: edited, project, fieldImages: gatherImages(project, report.salesOrderId) });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'PDF');
        } finally {
            setDlBusy(false);
        }
    };

    const pending = reports.filter((r) => !r.isSigned);

    const openSend = () => {
        setSendIds(new Set(pending.map((r) => r.id)));
        setSendOpen(true);
    };
    const toggleSend = (id: string, on: boolean) =>
        setSendIds((current) => {
            const next = new Set(current);
            if (on) next.add(id); else next.delete(id);
            return next;
        });

    const dispatch = async () => {
        const targets = pending.filter((r) => sendIds.has(r.id));
        if (targets.length === 0) return;
        setSendBusy(true);
        try {
            const email = project.customer?.mainEmail || null;
            for (const report of targets) {
                await signatureApi.create({
                    reportType: 'DELIVERY',
                    reportId: report.id,
                    projectId: project.id,
                    title: report.checklistName || t('projects.delivery.pdf.title'),
                    snapshot: buildDeliverySignatureSnapshot(project, report),
                    customerEmail: email,
                    sendEmail: Boolean(email),
                    notifyTechnician: true,
                });
            }
            toast.success(t('projects.delivery.sentOk'));
            setSendOpen(false);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.sendError'));
        } finally {
            setSendBusy(false);
        }
    };

    if (loading) {
        return (
            <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-lg border border-slate-200/70 bg-slate-50/60 text-slate-500">
                <RefreshCcw01 size={18} className="animate-spin" />
                <span className="text-[12px] font-medium">{t('projects.delivery.loading')}</span>
            </div>
        );
    }
    if (reports.length === 0) {
        return <EmptyState icon={<CheckCircle size={28} />} title={t('projects.delivery.admin.empty')} description={t('projects.delivery.admin.emptyHint')} />;
    }

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-[13px] font-semibold text-slate-900">{t('projects.delivery.reportsTab')}</div>
                <Button variant="primary" size="sm" icon={<Send size={13} />} disabled={pending.length === 0} onClick={openSend}>
                    {t('projects.delivery.sendReport')}
                </Button>
            </div>

            {/* Orders as items — each expands to its delivery checklist. */}
            <div className="space-y-2">
                {reports.map((report) => {
                    const open = expandedId === report.id;
                    const rows = open ? responses : report.responses || [];
                    return (
                        <div key={report.id} className="overflow-hidden rounded-xl border border-slate-200">
                            <button
                                type="button"
                                onClick={() => toggle(report)}
                                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left ${open ? 'bg-slate-50' : 'hover:bg-slate-50/60'}`}
                            >
                                {open ? <ChevronDown size={15} className="text-slate-400" /> : <ChevronRight size={15} className="text-slate-400" />}
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-[12.5px] font-semibold text-slate-900">{orderLabel(report)}</div>
                                    <div className="text-[11px] text-slate-500">{dayjs(report.sentAt || report.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                                </div>
                                <span className="text-[11px] text-slate-400">{completedCount(rows)}/{rows.length}</span>
                                {report.isSigned
                                    ? <StatusChip variant="active">{t('projects.delivery.statusSigned')}</StatusChip>
                                    : <StatusChip variant="warning">{t('projects.delivery.statusUnsigned')}</StatusChip>}
                            </button>

                            {open && (
                                <div className="space-y-3 border-t border-slate-100 p-3">
                                    {report.isSigned && (
                                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.delivery.admin.signedNote')}</div>
                                    )}

                                    {groupResponsesByCategory(responses).map((group) => (
                                        <div key={group.category} className="overflow-hidden rounded-lg border border-slate-200">
                                            <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">
                                                {group.category === '—' ? t('projects.delivery.uncategorized') : group.category}
                                            </div>
                                            <div className="divide-y divide-slate-100">
                                                {group.items.map((r) => (
                                                    <div key={r.id} className="px-3 py-2">
                                                        <div className="text-[12.5px] text-slate-800">{r.label}</div>
                                                        <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                                            {STATUS_OPTIONS.map((opt) => (
                                                                <label key={opt.value} className="flex items-center gap-1.5 text-[12px] font-medium">
                                                                    <input type="radio" name={`dlr-${r.id}`} checked={r.status === opt.value} onChange={() => setStatus(r.id, opt.value)} />
                                                                    <span className={opt.tone}>{t(opt.labelKey)}</span>
                                                                </label>
                                                            ))}
                                                            {r.measurementEnabled && (
                                                                <input type="text" value={r.measurement} placeholder={t('projects.delivery.measurementPlaceholder')} onChange={(e) => setMeasurement(r.id, e.target.value)} className="ml-auto h-8 min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-400" />
                                                            )}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}

                                    <Field label={t('projects.delivery.notes')}>
                                        <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                                    </Field>

                                    <div className="flex items-center justify-end gap-1.5">
                                        <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} loading={dlBusy} onClick={() => download(report)}>{t('projects.delivery.download')}</Button>
                                        <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={save}>{t('common.save')}</Button>
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Send popup: the orders to be delivered to the customer. Signature
                images are intentionally not rendered anywhere — the signed /
                unsigned chip on each report row is the whole story. */}
            <ReportsSheet
                open={sendOpen}
                title={t('projects.delivery.sendTitle')}
                subtitle={t('projects.delivery.sendHint')}
                onClose={() => setSendOpen(false)}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setSendOpen(false)}>{t('common.close')}</Button>
                        <Button variant="primary" icon={<Send size={13} />} loading={sendBusy} disabled={sendIds.size === 0} onClick={dispatch}>{t('projects.delivery.sendReport')}</Button>
                    </>
                }
            >
                {pending.length === 0 ? (
                    <div className="px-1 py-6 text-center text-[12.5px] text-slate-500">{t('projects.delivery.nothingToSend')}</div>
                ) : (
                    <div className="mx-auto w-full max-w-4xl space-y-2 px-5 py-6 md:px-8">
                        <div className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.delivery.ordersToDeliver')}</div>
                        {pending.map((report) => (
                            <div key={report.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
                                <Checkbox
                                    label={<span className="text-[12.5px] font-medium text-slate-800">{orderLabel(report)}</span>}
                                    size="sm"
                                    isSelected={sendIds.has(report.id)}
                                    onChange={(on) => toggleSend(report.id, on)}
                                />
                                <span className="text-[11px] text-slate-500">{dayjs(report.sentAt || report.createdAt).format('DD.MM.YYYY')}</span>
                            </div>
                        ))}
                    </div>
                )}
            </ReportsSheet>
        </div>
    );
};

export default DeliveryReportsTab;
