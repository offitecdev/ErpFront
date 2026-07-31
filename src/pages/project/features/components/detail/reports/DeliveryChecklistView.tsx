import { Fragment, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Plus, Save01 as Save } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { CELL_INPUT_CLASS, SectionCard } from '@/components/ui-shared/TableKit';
import {
    checklistApi,
    deliveryReportApi,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';

import { orderPayloadId } from '../../../utils/projectOrderScope';

const STATUS_OPTIONS: Array<{ value: Exclude<DeliveryStatus, null>; labelKey: string; tone: string }> = [
    { value: 'YES', labelKey: 'projects.delivery.yes', tone: 'text-emerald-700' },
    { value: 'NO', labelKey: 'projects.delivery.no', tone: 'text-rose-700' },
    { value: 'NA', labelKey: 'projects.delivery.na', tone: 'text-slate-500' },
];

/**
 * Delivery checklist for one appointment, as a single thin-lined table (the
 * planning-popup style): category header rows, then one row per checklist item
 * with the YES/NO/NA choice and optional measurement. Managers edit and save
 * from here; a missing report is created from the first active checklist
 * template on demand.
 */
export const DeliveryChecklistView = ({
    project,
    order,
    appointment,
    onChanged,
}: {
    project: ProjectDto;
    order: { id: string } | null;
    appointment: any;
    /** Informs the sheet when the report appears/changes (drives its PDF glyph). */
    onChanged?: (report: DeliveryReportDto | null) => void;
}) => {
    const [report, setReport] = useState<DeliveryReportDto | null>(null);
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [creating, setCreating] = useState(false);

    const adopt = (row: DeliveryReportDto | null) => {
        setReport(row);
        setResponses(((row?.responses || []) as DeliveryResponseItem[]).map((x) => ({ ...x })));
        setNotes(row?.notes || '');
        onChanged?.(row);
    };

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        deliveryReportApi.getByAppointment(appointment.id)
            .then((row) => { if (!cancelled) adopt(row); })
            .catch(() => { if (!cancelled) adopt(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [appointment.id]);

    // Create the appointment's delivery report from the first active checklist
    // template — the same seed the technician handover flow uses.
    const createReport = async () => {
        setCreating(true);
        try {
            const templates = await checklistApi.list();
            const template = templates.find((x) => x.isActive !== false) || templates[0];
            if (!template) {
                toast.error(t('projects.reportsHub.noChecklistTemplate'));
                return;
            }
            const created = await deliveryReportApi.create({
                projectId: project.id,
                salesOrderId: orderPayloadId(order as any),
                appointmentId: appointment.id,
                checklistTemplateId: template.id,
                checklistName: template.name,
                responses: template.items.map((item) => ({
                    id: item.id,
                    category: item.category,
                    label: item.label,
                    status: null,
                    measurement: '',
                    measurementEnabled: Boolean(item.measurement),
                })),
            });
            adopt(created);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setCreating(false);
        }
    };

    const setStatus = (id: string, status: DeliveryStatus) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) => setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const save = async () => {
        if (!report) return;
        setSaving(true);
        try {
            const updated = await deliveryReportApi.update(report.id, { responses, notes: notes.trim() || null });
            adopt(updated);
            toast.success(t('projects.delivery.admin.saved'));
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.admin.saveError'));
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="h-40 animate-pulse rounded-[3px] bg-slate-100" />;
    }

    if (!report) {
        return (
            <div className="rounded-[3px] border border-slate-200 bg-slate-50/60 px-4 py-8 text-center">
                <div className="text-[12.5px] text-slate-500">{t('projects.delivery.admin.empty')}</div>
                <Button className="mt-3" variant="secondary" size="sm" icon={<Plus size={13} />} loading={creating} onClick={() => void createReport()}>
                    {t('projects.reportsHub.createDelivery')}
                </Button>
            </div>
        );
    }

    const categories: string[] = [];
    for (const row of responses) {
        const key = row.category?.trim() || t('projects.delivery.uncategorized');
        if (!categories.includes(key)) categories.push(key);
    }

    return (
        <div className="space-y-3">
            {report.isSigned && (
                <div className="rounded-[3px] border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.delivery.admin.signedNote')}</div>
            )}

            <SectionCard title={report.checklistName || t('projects.delivery.pdf.title')}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('projects.delivery.colChecklist')}</th>
                            <th className="w-56 text-left">{t('common.status')}</th>
                            <th className="w-44 text-left">{t('projects.delivery.measurementPlaceholder')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {categories.map((category) => (
                            <Fragment key={category}>
                                <tr>
                                    <td colSpan={3} className="h-9 bg-slate-50/80 text-[11.5px] font-semibold uppercase tracking-wide text-slate-500 dark:bg-white/5 dark:text-white/60">
                                        {category}
                                    </td>
                                </tr>
                                {responses
                                    .filter((row) => (row.category?.trim() || t('projects.delivery.uncategorized')) === category)
                                    .map((row) => (
                                        <tr key={row.id}>
                                            <td className="text-slate-800 dark:text-white">{row.label}</td>
                                            <td>
                                                <div className="flex items-center gap-3">
                                                    {STATUS_OPTIONS.map((opt) => (
                                                        <label key={opt.value} className="flex items-center gap-1 text-[12.5px] font-medium">
                                                            <input type="radio" name={`dlv-${row.id}`} checked={row.status === opt.value} onChange={() => setStatus(row.id, opt.value)} />
                                                            <span className={opt.tone}>{t(opt.labelKey)}</span>
                                                        </label>
                                                    ))}
                                                </div>
                                            </td>
                                            <td>
                                                {row.measurementEnabled ? (
                                                    <input
                                                        type="text"
                                                        value={row.measurement}
                                                        placeholder={t('projects.delivery.measurementPlaceholder')}
                                                        onChange={(e) => setMeasurement(row.id, e.target.value)}
                                                        className={CELL_INPUT_CLASS}
                                                    />
                                                ) : <span className="text-slate-300 dark:text-white/30">—</span>}
                                            </td>
                                        </tr>
                                    ))}
                            </Fragment>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <SectionCard title={t('projects.delivery.notes')}>
                <textarea
                    rows={2}
                    className="w-full resize-y bg-white px-4 py-3 text-[13.5px] text-slate-800 outline-none dark:bg-transparent dark:text-white"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </SectionCard>

            <div className="flex items-center justify-end border-t border-dashed border-slate-300 pt-3">
                <Button variant="primary" size="sm" icon={<Save size={13} />} loading={saving} onClick={() => void save()}>{t('common.save')}</Button>
            </div>
        </div>
    );
};
