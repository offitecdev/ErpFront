import { useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { FileDownload02 as FileDown, Plus, Save01 as Save, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { CELL_INPUT_CLASS, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { MaterialPickerModal } from './MaterialPickerModal';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import { orderPayloadId } from '../../../utils/projectOrderScope';
import { appointmentDuration } from '../../../utils/projectAppointments';
// Shared field-report operations parser — keeps this editor and the technician
// screen reading/writing the exact same item list, in the same order.
import { operationItems as reportOperationItems } from '../../../installations/utils/installationScope';

const FIELD_EXPENSE_TYPES = [
    { key: 'transport', value: 'Nakliye' },
    { key: 'equipmentRental', value: 'Ekipman Kiralama' },
    { key: 'externalServices', value: 'Dış hizmetler' },
    { key: 'subcontractor', value: 'Taşeron' },
    { key: 'other', value: 'Diğer' },
] as const;

// One visual language for every editable grid in the popup: the app-wide CRM
// table (`data-inv-table` inside a `SectionCard`), with a trailing "+" on each
// row to append the next line.
const cellInput = CELL_INPUT_CLASS;

const RowPlusButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="ofi-rs-iconbtn inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors"
    >
        <Plus size={13} />
    </button>
);

// The section frame is the shared CRM one — a titled card wrapping the table.
const SectionTable = SectionCard;

/**
 * Field-report editor rendered inside the appointment popup. Everything is a
 * plain gray-bordered table (same rhythm as the planning-calendar popups):
 * work items, external expenses and the two material grids, each row closed by
 * a "+" that appends the next line — materials open the product picker popup.
 * Managers edit here too; only technicians keep their own montage screen.
 */
export const FieldReportEditorView = ({
    project,
    order,
    appointment,
    report,
    materials,
    onSaved,
    onBack,
    onPreviewPdf,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    appointment: any;
    report: any | null;
    materials: ProjectMaterial[];
    onSaved: () => Promise<void>;
    onBack: () => void;
    /** When set, the PDF button opens the in-sheet preview instead of downloading. */
    onPreviewPdf?: () => void;
}) => {
    const { user } = useAuthStore();
    const roleNames = [
        user?.roleName,
        ...((user as any)?.employeeRoles?.map((er: any) => er.role?.roleName) || []),
    ].filter(Boolean).map((r: string) => r.toLowerCase());
    // Managers edit order reports from here (per the reports redesign); only the
    // technician role is excluded — they work through the montage module.
    const canAddMaterials = !roleNames.some((r) => r.includes('teknisyen'));

    const apptDate = dayjs(appointment.startTime);
    const [start, setStart] = useState(report?.startedAt ? dayjs(report.startedAt).format('HH:mm') : apptDate.format('HH:mm'));
    const [end, setEnd] = useState(report?.endedAt ? dayjs(report.endedAt).format('HH:mm') : dayjs(appointment.endTime).format('HH:mm'));
    const [operations, setOperations] = useState<string[]>(() => {
        const items = report ? reportOperationItems(report) : [];
        return items.length ? items : [''];
    });
    const [technicalNotes, setTechnicalNotes] = useState(report?.technicalNotes || '');
    const [newExpenses, setNewExpenses] = useState<Array<{ expenseType: string; amount: number; description: string }>>([]);
    const [newUsedMaterials, setNewUsedMaterials] = useState<Array<{ materialId: string; quantity: number }>>([]);
    const [newExtraMaterials, setNewExtraMaterials] = useState<Array<{ materialId: string; quantity: number; description: string }>>([]);
    const [picker, setPicker] = useState<'used' | 'extra' | null>(null);
    const [saving, setSaving] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const existingExpenses = (project.expenses || []).filter((e: any) => e.appointmentId === appointment.id);
    const existingUsedMaterials = report?.usedMaterials || [];
    const existingExtraMaterials = (project.extraMaterials || []).filter((m: any) => m.appointmentId === appointment.id);

    const materialName = (id: string) => materials.find((m) => m.id === id)?.name || t('auto.malzeme');

    const plannedMin = appointmentDuration(appointment);
    const buildIso = (time: string) => {
        const [h, m] = time.split(':').map((x) => Number(x));
        return apptDate.hour(h || 0).minute(m || 0).second(0).millisecond(0);
    };
    const workedMin = Math.max(0, buildIso(end).diff(buildIso(start), 'minute'));
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    const overtimeMin = Math.max(0, Math.ceil(workedMin - plannedMin * (1 + tolerance / 100)));
    const overtimeCost = (overtimeMin / 60) * (Number(project.overtimeHourlyRate) || 0);

    const insertOperation = (index: number) =>
        setOperations((rows) => [...rows.slice(0, index + 1), '', ...rows.slice(index + 1)]);

    const addPickedMaterial = (material: ProjectMaterial) => {
        if (picker === 'used') setNewUsedMaterials((rows) => [...rows, { materialId: material.id, quantity: 1 }]);
        if (picker === 'extra') setNewExtraMaterials((rows) => [...rows, { materialId: material.id, quantity: 1, description: '' }]);
        setPicker(null);
    };

    const save = async () => {
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) return toast.error(t('projects.yapilan_isleri_girin'));
        // One item per line with a "- " prefix — the exact shape the technician
        // completion produces — so both sides parse back to the same list.
        const operationsDoneText = cleanOperations.map((item) => `- ${item}`).join('\n');
        const startedAt = buildIso(start).toISOString();
        const endedAt = buildIso(end).toISOString();
        if (dayjs(endedAt).valueOf() <= dayjs(startedAt).valueOf()) return toast.error(t('projects.bitis_baslangictan_sonra'));
        const cleanExpenses = newExpenses
            .filter((e) => e.expenseType && Number(e.amount) > 0)
            .map((e) => ({ expenseType: e.expenseType, amount: Number(e.amount), description: e.description.trim() }));
        const cleanUsed = newUsedMaterials
            .filter((m) => m.materialId && Number(m.quantity) > 0)
            .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity) }));
        const cleanExtra = newExtraMaterials
            .filter((m) => m.materialId && Number(m.quantity) > 0)
            .map((m) => ({ materialId: m.materialId, quantity: Number(m.quantity), description: m.description.trim() }));
        setSaving(true);
        try {
            // Saving only attaches the report to THIS appointment — completing the
            // montaj stays a separate, explicit action elsewhere.
            let reportId: string | undefined = report?.id;
            if (!report) {
                const res = await projectApi.addReport(project.id, {
                    salesOrderId: orderPayloadId(order),
                    appointmentId: appointment.id,
                    // Plain calendar date (no instant): an ISO timestamp gets re-read
                    // in the server's timezone and can shift the day.
                    workDate: apptDate.format('YYYY-MM-DD'),
                    startedAt,
                    endedAt,
                    operationsDone: operationsDoneText,
                    technicalNotes: technicalNotes.trim(),
                });
                reportId = res.report?.id;
            } else {
                await projectApi.updateReport(report.id, {
                    salesOrderId: report.salesOrderId ?? orderPayloadId(order),
                    workDate: dayjs(report.workDate).format('YYYY-MM-DD'),
                    startedAt,
                    endedAt,
                    operationsDone: operationsDoneText,
                    technicalNotes: technicalNotes.trim(),
                });
            }
            for (const e of cleanExpenses) {
                await projectApi.addExpense(project.id, { salesOrderId: orderPayloadId(order), appointmentId: appointment.id, expenseType: e.expenseType, amount: e.amount, description: e.description });
            }
            for (const m of cleanExtra) {
                await projectApi.requestVariation(project.id, { salesOrderId: orderPayloadId(order), appointmentId: appointment.id, materialId: m.materialId, quantity: m.quantity, description: m.description });
            }
            if (cleanUsed.length && reportId) {
                await projectApi.addReportMaterials(reportId, cleanUsed);
            }
            setNewExpenses([]);
            setNewUsedMaterials([]);
            setNewExtraMaterials([]);
            toast.success(t('projects.saha_raporu_kaydedildi'));
            await onSaved();
            onBack();
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.rapor_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const createPdf = async () => {
        if (!report) return toast.error(t('projects.raporu_once_kaydedin'));
        if (onPreviewPdf) return onPreviewPdf();
        setPdfBusy(true);
        try {
            const { exportFieldReportPdf } = await import('@/utils/pdf/fieldReportPdf');
            await exportFieldReportPdf(project, report, { appointment });
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.pdf_olusturulamadi'));
        } finally {
            setPdfBusy(false);
        }
    };

    // Delete a saved expense/extra-material, then refresh. Used materials have no
    // delete endpoint, so those saved rows stay read-only.
    const removeExisting = async (kind: 'expense' | 'extra', id: string) => {
        setDeletingId(id);
        try {
            if (kind === 'expense') await projectApi.deleteExpense(id);
            else await projectApi.deleteExtraMaterial(id);
            toast.success(t('projects.silindi'));
            await onSaved();
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.silinemedi'));
        } finally {
            setDeletingId(null);
        }
    };

    return (
        <div className="space-y-3">
            {/* Appointment times + overtime preview, as one thin-lined grid. */}
            <SectionTable title={t('projects.randevu_saatleri')}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('common.date')}</th>
                            <th className="text-left">{t('common.start')}</th>
                            <th className="text-left">{t('common.end')}</th>
                            <th className="text-left">{t('projects.calisilan_saat')}</th>
                            <th className="text-left">{t('projects.ek_calisma')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="font-semibold tabular-nums text-slate-800 dark:text-white">{apptDate.format('DD.MM.YYYY')}</td>
                            <td><input type="time" className={cellInput} value={start} onChange={(e) => setStart(e.target.value)} /></td>
                            <td><input type="time" className={cellInput} value={end} onChange={(e) => setEnd(e.target.value)} /></td>
                            <td className="tabular-nums text-slate-700 dark:text-white/80">{durationFmt(workedMin)} <span className="text-[11px] text-slate-400">({t('auto.plan')}: {durationFmt(plannedMin)})</span></td>
                            <td className="tabular-nums text-slate-700 dark:text-white/80">{durationFmt(overtimeMin)} · {money(overtimeCost)}</td>
                        </tr>
                    </tbody>
                </table>
            </SectionTable>

            {/* Work performed: one row per item, each row ending with "+". */}
            <SectionTable title={t('projects.yapilan_isler')}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-10 text-left">#</th>
                            <th className="text-left">{t('projects.yapilan_is')}</th>
                            <th className="w-20 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {operations.map((item, index) => (
                            <tr key={index}>
                                <td className="tabular-nums text-slate-400 dark:text-white/50">{index + 1}</td>
                                <td>
                                    <input
                                        className={cellInput}
                                        value={item}
                                        placeholder={t('projects.yapilan_is')}
                                        onChange={(e) => setOperations(operations.map((row, i) => (i === index ? e.target.value : row)))}
                                    />
                                </td>
                                <td>
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            disabled={operations.length === 1}
                                            onClick={() => setOperations(operations.filter((_, i) => i !== index))}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <RowPlusButton label={t('projects.madde')} onClick={() => insertOperation(index)} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionTable>

            {/* Technical notes stay a free-text block below the work grid. */}
            <SectionTable title={t('projects.teknik_notlar')}>
                <textarea
                    rows={2}
                    className="w-full resize-y bg-white px-4 py-3 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-300 dark:bg-transparent dark:text-white"
                    value={technicalNotes}
                    onChange={(e) => setTechnicalNotes(e.target.value)}
                />
            </SectionTable>

            {/* External expenses. */}
            <SectionTable
                title={t('auto.harici_giderler')}
                action={newExpenses.length === 0 ? <RowPlusButton label={t('auto.satir')} onClick={() => setNewExpenses((rows) => [...rows, { expenseType: 'Nakliye', amount: 0, description: '' }])} /> : undefined}
            >
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-44 text-left">{t('common.type')}</th>
                            <th className="w-28 text-right">{t('common.amount')}</th>
                            <th className="text-left">{t('common.description')}</th>
                            <th className="w-20 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {existingExpenses.map((e: any) => (
                            <tr key={e.id}>
                                <td className="text-slate-700 dark:text-white/80">{displayExpenseType(e.expenseType)}</td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{money(Number(e.amount) || 0)}</td>
                                <td className="text-slate-500 dark:text-white/60">{e.description || '—'}</td>
                                <td>
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            disabled={deletingId === e.id}
                                            onClick={() => void removeExisting('expense', e.id)}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {newExpenses.map((row, index) => (
                            <tr key={`new-${index}`}>
                                <td>
                                    <select
                                        className={cellInput}
                                        value={row.expenseType}
                                        onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => (i === index ? { ...r, expenseType: e.target.value } : r)))}
                                    >
                                        {FIELD_EXPENSE_TYPES.map((x) => <option key={x.value} value={x.value}>{t(`projects.expenseTypes.${x.key}`)}</option>)}
                                    </select>
                                </td>
                                <td>
                                    <input type="number" min={0} step="0.01" className={`${cellInput} text-right font-mono`} value={row.amount} onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => (i === index ? { ...r, amount: Number(e.target.value) } : r)))} />
                                </td>
                                <td>
                                    <input className={cellInput} value={row.description} placeholder={t('common.description')} onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))} />
                                </td>
                                <td>
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            onClick={() => setNewExpenses((rows) => rows.filter((_, i) => i !== index))}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <RowPlusButton label={t('auto.satir')} onClick={() => setNewExpenses((rows) => [...rows, { expenseType: 'Nakliye', amount: 0, description: '' }])} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {existingExpenses.length === 0 && newExpenses.length === 0 && (
                            <TableStateRow colSpan={4} loading={false} emptyText={t('auto.gider_yok')} />
                        )}
                    </tbody>
                </table>
            </SectionTable>

            {/* Used materials — "+" opens the product picker popup. */}
            <SectionTable
                title={t('projects.kullanilan_malzemeler')}
                action={canAddMaterials ? <RowPlusButton label={t('projects.reportsHub.selectMaterial')} onClick={() => setPicker('used')} /> : undefined}
            >
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('auto.malzeme')}</th>
                            <th className="w-28 text-right">{t('projects.adet')}</th>
                            <th className="w-20 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {existingUsedMaterials.map((m: any) => (
                            <tr key={m.id}>
                                <td className="text-slate-700 dark:text-white/80">{m.material?.name || m.article?.name || t('auto.malzeme')}</td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{numberFmt(m.quantity)}</td>
                                <td />
                            </tr>
                        ))}
                        {newUsedMaterials.map((row, index) => (
                            <tr key={`new-${index}`}>
                                <td className="font-medium text-slate-800 dark:text-white">{materialName(row.materialId)}</td>
                                <td>
                                    <input type="number" min={0} step="1" className={`${cellInput} text-right font-mono`} value={row.quantity} onChange={(e) => setNewUsedMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, quantity: Number(e.target.value) } : r)))} />
                                </td>
                                <td>
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            onClick={() => setNewUsedMaterials((rows) => rows.filter((_, i) => i !== index))}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <RowPlusButton label={t('projects.reportsHub.selectMaterial')} onClick={() => setPicker('used')} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {existingUsedMaterials.length === 0 && newUsedMaterials.length === 0 && (
                            <TableStateRow colSpan={3} loading={false} emptyText={t('projects.malzeme_yok')} />
                        )}
                    </tbody>
                </table>
            </SectionTable>

            {/* Additional (extra) materials — also via the product picker. */}
            <SectionTable
                title={t('projects.ek_malzemeler')}
                action={canAddMaterials ? <RowPlusButton label={t('projects.reportsHub.selectMaterial')} onClick={() => setPicker('extra')} /> : undefined}
            >
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('auto.malzeme')}</th>
                            <th className="w-24 text-right">{t('projects.adet')}</th>
                            <th className="text-left">{t('common.description')}</th>
                            <th className="w-20 text-right" />
                        </tr>
                    </thead>
                    <tbody>
                        {existingExtraMaterials.map((m: any) => (
                            <tr key={m.id}>
                                <td className="text-slate-700 dark:text-white/80">{m.material?.name || t('auto.malzeme')}</td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{numberFmt(m.quantity)} × {money(Number(m.unitPrice) || 0)}</td>
                                <td className="text-slate-500 dark:text-white/60">{m.description || '—'}</td>
                                <td>
                                    <div className="flex items-center justify-end">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            disabled={deletingId === m.id}
                                            onClick={() => void removeExisting('extra', m.id)}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {newExtraMaterials.map((row, index) => (
                            <tr key={`new-${index}`}>
                                <td className="font-medium text-slate-800 dark:text-white">{materialName(row.materialId)}</td>
                                <td>
                                    <input type="number" min={0} step="1" className={`${cellInput} text-right font-mono`} value={row.quantity} onChange={(e) => setNewExtraMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, quantity: Number(e.target.value) } : r)))} />
                                </td>
                                <td>
                                    <input className={cellInput} value={row.description} placeholder={t('common.description')} onChange={(e) => setNewExtraMaterials((rows) => rows.map((r, i) => (i === index ? { ...r, description: e.target.value } : r)))} />
                                </td>
                                <td>
                                    <div className="flex items-center justify-end gap-1">
                                        <button
                                            type="button"
                                            title={t('common.delete')}
                                            aria-label={t('common.delete')}
                                            onClick={() => setNewExtraMaterials((rows) => rows.filter((_, i) => i !== index))}
                                            className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                        <RowPlusButton label={t('projects.reportsHub.selectMaterial')} onClick={() => setPicker('extra')} />
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {existingExtraMaterials.length === 0 && newExtraMaterials.length === 0 && (
                            <TableStateRow colSpan={4} loading={false} emptyText={t('projects.ek_malzeme_yok')} />
                        )}
                    </tbody>
                </table>
            </SectionTable>

            <div className="flex items-center justify-end gap-2 border-t border-dashed border-slate-300 pt-3">
                <Button variant="secondary" size="sm" disabled={pdfBusy || !report} icon={<FileDown size={13} />} onClick={() => void createPdf()}>{pdfBusy ? '…' : t('projects.pdf_olustur')}</Button>
                <Button variant="primary" size="sm" loading={saving} icon={<Save size={13} />} onClick={() => void save()}>{t('common.save')}</Button>
            </div>

            <MaterialPickerModal
                open={picker !== null}
                materials={materials}
                onSelect={addPickedMaterial}
                onClose={() => setPicker(null)}
            />
        </div>
    );
};
