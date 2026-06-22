import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { FileCheck02 as FileCheck, Image01 as ImageIcon } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { Field, Select, Textarea } from '../../components/ui-shared/Field';
import { SignatureSheet, type SignatureAttachment } from '../../components/ui-shared/SignatureSheet';
import { checklistApi, deliveryReportApi, type ChecklistTemplateDto, type DeliveryReportDto, type DeliveryResponseItem, type DeliveryStatus, type SignatureSnapshot } from '../../lib/api/project';
import { TechnicianGetSignature } from './TechnicianGetSignature';

import { t } from '@/i18n/translate';

const buildDeliverySnapshot = (d: DeliveryReportDto, images: Array<{ id: string; imageData: string }>): SignatureSnapshot => {
    const cats: string[] = [];
    for (const x of d.responses || []) { const k = x.category?.trim() || t('projects.delivery.uncategorized'); if (!cats.includes(k)) cats.push(k); }
    return {
        title: d.checklistName || t('projects.delivery.pdf.title'),
        sections: cats.map((c) => ({ heading: c, rows: (d.responses || []).filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c).map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })) })),
        notes: d.notes || undefined,
        images: images.map((i) => i.imageData),
    };
};

// Snapshot built from the in-progress checklist for the signature request.
const buildDraftSnapshot = (
    checklistName: string,
    responses: DeliveryResponseItem[],
    notes: string,
    images: Array<{ id: string; imageData: string }>,
): SignatureSnapshot => {
    const cats: string[] = [];
    for (const x of responses) { const k = x.category?.trim() || t('projects.delivery.uncategorized'); if (!cats.includes(k)) cats.push(k); }
    return {
        title: checklistName || t('projects.delivery.pdf.title'),
        sections: cats.map((c) => ({ heading: c, rows: responses.filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c).map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })) })),
        notes: notes.trim() || undefined,
        images: images.map((i) => i.imageData),
    };
};

type Appointment = {
    id: string;
    salesOrderId?: string | null;
    salesOrder?: { id: string; orderNumber?: string } | null;
    project?: any;
};

const STATUS_OPTIONS: Array<{ value: Exclude<DeliveryStatus, null>; labelKey: string; tone: string }> = [
    { value: 'YES', labelKey: 'projects.delivery.yes', tone: 'text-emerald-700' },
    { value: 'NO', labelKey: 'projects.delivery.no', tone: 'text-rose-700' },
    { value: 'NA', labelKey: 'projects.delivery.na', tone: 'text-slate-500' },
];

const buildResponses = (tpl: ChecklistTemplateDto): DeliveryResponseItem[] =>
    (Array.isArray(tpl.items) ? tpl.items : []).map((it) => ({
        id: it.id,
        category: it.category || '',
        label: it.label,
        status: null,
        measurement: '',
        measurementEnabled: Boolean(it.measurement),
    }));

// Field-report visuals belonging to this order, gathered live from the project reports.
const gatherFieldImages = (appointment: Appointment): Array<{ id: string; imageData: string }> => {
    const orderId = appointment.salesOrderId || appointment.salesOrder?.id || null;
    const reports = (appointment.project?.reports || []) as any[];
    return reports
        .filter((r) => (r.salesOrderId || null) === orderId || !orderId)
        .flatMap((r) => (Array.isArray(r.images) ? r.images : []))
        .filter((img: any) => img?.imageData)
        .map((img: any) => ({ id: img.id, imageData: img.imageData }));
};

export const DeliveryReportTab = ({ appointment, attachments, onChanged }: { appointment: Appointment; attachments?: SignatureAttachment[]; onChanged?: () => void }) => {
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [templateId, setTemplateId] = useState<string>('');
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [existing, setExisting] = useState<DeliveryReportDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [signatureOpen, setSignatureOpen] = useState(false);

    const fieldImages = useMemo(() => gatherFieldImages(appointment), [appointment]);

    const load = async () => {
        setLoading(true);
        try {
            // One report per order: prefer the order-scoped report so a second
            // appointment on the same order reuses it instead of starting fresh.
            const orderId = appointment.salesOrderId || appointment.salesOrder?.id || null;
            const [tpls, current] = await Promise.all([
                checklistApi.list().catch(() => [] as ChecklistTemplateDto[]),
                orderId
                    ? deliveryReportApi.list({ salesOrderId: orderId }).then((rows) => rows[0] || null).catch(() => null)
                    : deliveryReportApi.getByAppointment(appointment.id).catch(() => null),
            ]);
            const activeTpls = tpls.filter((tpl) => tpl.isActive);
            setTemplates(activeTpls);
            setExisting(current);
            if (!current && activeTpls.length > 0) {
                setTemplateId(activeTpls[0].id);
                setResponses(buildResponses(activeTpls[0]));
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment.id]);

    const selectTemplate = (id: string) => {
        setTemplateId(id);
        const tpl = templates.find((tt) => tt.id === id);
        setResponses(tpl ? buildResponses(tpl) : []);
    };

    const setStatus = (id: string, status: DeliveryStatus) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const categories = useMemo(() => {
        const order: string[] = [];
        for (const r of responses) {
            const key = r.category.trim() || '—';
            if (!order.includes(key)) order.push(key);
        }
        return order;
    }, [responses]);

    const selectedTemplate = templates.find((tt) => tt.id === templateId) || null;

    const openSignature = () => {
        if (responses.length === 0) return toast.error(t('projects.delivery.selectChecklistFirst'));
        setSignatureOpen(true);
    };

    const sendReport = async (signatureBase64?: string | null) => {
        setSaving(true);
        try {
            await deliveryReportApi.create({
                appointmentId: appointment.id,
                projectId: appointment.project?.id || null,
                salesOrderId: appointment.salesOrderId || appointment.salesOrder?.id || null,
                checklistTemplateId: templateId || null,
                checklistName: selectedTemplate?.name || null,
                responses,
                notes: notes.trim() || null,
                signatureBase64: signatureBase64 || null,
            });
            toast.success(signatureBase64 ? t('projects.delivery.sentSigned') : t('projects.delivery.sentUnsigned'));
            setSignatureOpen(false);
            onChanged?.();
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('projects.delivery.sendError'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;

    // A delivery report has already been created/sent for this appointment.
    if (existing) {
        return (
            <div className="space-y-3">
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${existing.isSigned ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <FileCheck size={14} />
                    {existing.isSigned ? t('projects.delivery.alreadySentSigned') : t('projects.delivery.alreadySentUnsigned')}
                </div>
                <DeliverySummary report={existing} fieldImages={fieldImages} />
                {!existing.isSigned && (
                    <div className="flex justify-end">
                        <TechnicianGetSignature reportType="DELIVERY" reportId={existing.id} projectId={appointment.project?.id} title={existing.checklistName || t('projects.delivery.pdf.title')} snapshot={buildDeliverySnapshot(existing, fieldImages)} attachments={attachments} label={t('projects.sadece_imza_al')} onDone={() => { onChanged?.(); void load(); }} />
                    </div>
                )}
            </div>
        );
    }

    if (templates.length === 0) {
        return (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-600">
                {t('projects.delivery.noChecklists')}
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <Field label={t('projects.delivery.checklist')}>
                <Select value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
                    {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                    ))}
                </Select>
            </Field>

            <div className="space-y-3">
                {categories.map((category) => (
                    <div key={category} className="overflow-hidden rounded-lg border border-slate-200">
                        <div className="border-b border-slate-100 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-700">
                            {category === '—' ? t('projects.delivery.uncategorized') : category}
                        </div>
                        <div className="divide-y divide-slate-100">
                            {responses.filter((r) => (r.category.trim() || '—') === category).map((r) => (
                                <div key={r.id} className="px-3 py-2.5">
                                    <div className="text-[12.5px] text-slate-800">{r.label}</div>
                                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                                        {STATUS_OPTIONS.map((opt) => (
                                            <label key={opt.value} className="flex items-center gap-1.5 text-[12px] font-medium">
                                                <input
                                                    type="radio"
                                                    name={`st-${r.id}`}
                                                    checked={r.status === opt.value}
                                                    onChange={() => setStatus(r.id, opt.value)}
                                                />
                                                <span className={opt.tone}>{t(opt.labelKey)}</span>
                                            </label>
                                        ))}
                                        {r.measurementEnabled && (
                                            <input
                                                type="text"
                                                value={r.measurement}
                                                placeholder={t('projects.delivery.measurementPlaceholder')}
                                                onChange={(e) => setMeasurement(r.id, e.target.value)}
                                                className="ml-auto h-8 min-w-[140px] flex-1 rounded-lg border border-slate-200 px-2 text-[12px] outline-none focus:border-slate-400"
                                            />
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

            <div className="flex justify-end">
                <Button icon={<FileCheck size={13} />} onClick={openSignature}>{t('projects.delivery.create')}</Button>
            </div>

            <SignatureSheet
                open={signatureOpen}
                title={t('projects.delivery.create')}
                snapshot={buildDraftSnapshot(selectedTemplate?.name || '', responses, notes, fieldImages)}
                attachments={attachments}
                saving={saving}
                onClose={() => setSignatureOpen(false)}
                onSave={(signatureBase64) => sendReport(signatureBase64)}
            />
        </div>
    );
};

// ---- Read-only summary used inside the preview popup and the "already sent" view ----
const statusLabel = (status: DeliveryStatus) => {
    if (status === 'YES') return t('projects.delivery.yes');
    if (status === 'NO') return t('projects.delivery.no');
    if (status === 'NA') return t('projects.delivery.na');
    return '—';
};
const statusTone = (status: DeliveryStatus) =>
    status === 'YES' ? 'bg-emerald-50 text-emerald-700' : status === 'NO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';

const SummaryRows = ({ responses }: { responses: DeliveryResponseItem[] }) => {
    const categories: string[] = [];
    for (const r of responses) {
        const key = r.category.trim() || '—';
        if (!categories.includes(key)) categories.push(key);
    }
    return (
        <div className="space-y-3">
            {categories.map((category) => (
                <div key={category} className="overflow-hidden rounded-lg border border-slate-200">
                    <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">
                        {category === '—' ? t('projects.delivery.uncategorized') : category}
                    </div>
                    <table className="w-full text-[12px]">
                        <tbody className="divide-y divide-slate-100">
                            {responses.filter((r) => (r.category.trim() || '—') === category).map((r) => (
                                <tr key={r.id}>
                                    <td className="px-3 py-1.5 text-slate-700">{r.label}</td>
                                    <td className="w-24 px-3 py-1.5 text-right">
                                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                                    </td>
                                    <td className="w-32 px-3 py-1.5 text-right text-slate-500">{r.measurement || ''}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
};

const DeliverySummary = ({ report, fieldImages }: { report: DeliveryReportDto; fieldImages: Array<{ id: string; imageData: string }> }) => (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        {report.checklistName && <div className="text-[13px] font-semibold text-slate-900">{report.checklistName}</div>}
        <SummaryRows responses={report.responses || []} />
        {report.notes && <div className="rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{report.notes}</div>}
        {fieldImages.length > 0 && (
            <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600"><ImageIcon size={12} /> {t('projects.delivery.fieldVisuals')}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {fieldImages.map((img) => (
                        <a key={img.id} href={img.imageData} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200">
                            <img src={img.imageData} alt="" className="h-full w-full object-cover" />
                        </a>
                    ))}
                </div>
            </div>
        )}
        {report.customerSignature && (
            <div>
                <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{t('projects.delivery.customerSignature')}</div>
                <img src={report.customerSignature} alt="" className="h-24 rounded-md border border-slate-200 bg-white" />
            </div>
        )}
    </div>
);

export default DeliveryReportTab;
