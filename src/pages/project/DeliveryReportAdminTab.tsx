import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { CheckCircle, FileDownload02 as DownloadIcon, Save01 as Save } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { Field, Textarea } from '../../components/ui-shared/Field';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { deliveryReportApi, type DeliveryReportDto, type DeliveryResponseItem, type DeliveryStatus } from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

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

export const DeliveryReportAdminTab = ({ project }: { project: ProjectDto; order?: { id: string } | null }) => {
    const [reports, setReports] = useState<DeliveryReportDto[]>([]);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [dlBusy, setDlBusy] = useState(false);

    const load = async (focusId?: string) => {
        setLoading(true);
        try {
            const rows = await deliveryReportApi.list({ projectId: project.id });
            setReports(rows);
            const focus = focusId ? rows.find((r) => r.id === focusId) : rows.find((r) => r.id === selectedId) || rows[0];
            if (focus) selectReport(focus);
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

    const selectReport = (r: DeliveryReportDto) => {
        setSelectedId(r.id);
        setResponses((r.responses || []).map((x) => ({ ...x })));
        setNotes(r.notes || '');
    };

    const selected = reports.find((r) => r.id === selectedId) || null;

    const categories = useMemo(() => {
        const order: string[] = [];
        for (const r of responses) { const k = r.category?.trim() || t('projects.delivery.uncategorized'); if (!order.includes(k)) order.push(k); }
        return order;
    }, [responses]);

    const setStatus = (id: string, status: DeliveryStatus) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const save = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            await deliveryReportApi.update(selected.id, { responses, notes: notes.trim() || null });
            toast.success(t('projects.delivery.admin.saved'));
            await load(selected.id);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const download = async () => {
        if (!selected) return;
        setDlBusy(true);
        try {
            const { exportDeliveryReportPdf } = await import('../../utils/pdf/deliveryReportPdf');
            await exportDeliveryReportPdf({ report: { ...selected, responses, notes }, project, fieldImages: gatherImages(project, selected.salesOrderId) });
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'PDF');
        } finally {
            setDlBusy(false);
        }
    };

    if (loading) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;
    if (reports.length === 0) {
        return <EmptyState icon={<CheckCircle size={28} />} title={t('projects.delivery.admin.empty')} description={t('projects.delivery.admin.emptyHint')} />;
    }

    return (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-4">
                <div className="overflow-hidden rounded-xl border border-slate-200">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">{t('projects.delivery.adminTitle')}</div>
                    <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto">
                        {reports.map((r) => (
                            <button key={r.id} type="button" onClick={() => selectReport(r)} className={`flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left transition-colors ${r.id === selectedId ? 'bg-slate-100' : 'hover:bg-slate-50'}`}>
                                <div className="min-w-0">
                                    <div className="truncate text-[12.5px] font-semibold text-slate-900">{r.checklistName || t('projects.delivery.pdf.title')}</div>
                                    <div className="text-[11px] text-slate-500">{dayjs(r.sentAt || r.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                                </div>
                                {r.isSigned ? <StatusChip variant="active">{t('projects.delivery.statusSigned')}</StatusChip> : <StatusChip variant="warning">{t('projects.delivery.statusUnsigned')}</StatusChip>}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="lg:col-span-8">
                {selected && (
                    <div className="space-y-4 rounded-xl border border-slate-200 p-4">
                        <div className="flex items-center justify-between gap-2">
                            <div>
                                <div className="text-[14px] font-semibold text-slate-900">{selected.checklistName || t('projects.delivery.pdf.title')}</div>
                                <div className="text-[11.5px] text-slate-500">{dayjs(selected.sentAt || selected.createdAt).format('DD.MM.YYYY HH:mm')}</div>
                            </div>
                            <div className="flex items-center gap-1.5">
                                <Button variant="secondary" size="sm" icon={<DownloadIcon size={13} />} loading={dlBusy} onClick={download}>{t('projects.delivery.download')}</Button>
                                <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={save}>{t('common.save')}</Button>
                            </div>
                        </div>

                        {selected.isSigned && (
                            <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.delivery.admin.signedNote')}</div>
                        )}

                        <div className="space-y-3">
                            {categories.map((category) => (
                                <div key={category} className="overflow-hidden rounded-lg border border-slate-200">
                                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">{category}</div>
                                    <div className="divide-y divide-slate-100">
                                        {responses.filter((r) => (r.category?.trim() || t('projects.delivery.uncategorized')) === category).map((r) => (
                                            <div key={r.id} className="px-3 py-2">
                                                <div className="text-[12.5px] text-slate-800">{r.label}</div>
                                                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                                    {STATUS_OPTIONS.map((opt) => (
                                                        <label key={opt.value} className="flex items-center gap-1.5 text-[12px] font-medium">
                                                            <input type="radio" name={`adm-${r.id}`} checked={r.status === opt.value} onChange={() => setStatus(r.id, opt.value)} />
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
                        </div>

                        <Field label={t('projects.delivery.notes')}>
                            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                        </Field>

                        {selected.customerSignature && (
                            <div>
                                <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{t('projects.delivery.customerSignature')}</div>
                                <img src={selected.customerSignature} alt="" className="h-24 rounded-md border border-slate-200 bg-white" />
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};

export default DeliveryReportAdminTab;
