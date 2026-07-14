import { useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard as ClipboardPenLine, FileDownload02 as FileDown, Plus, Save01 as Save, Trash01 as Trash2, X } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select, Textarea } from '@/components/ui-shared/Field';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { MaterialSearchSelect } from '../../common/MaterialSearchSelect';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import { orderPayloadId } from '../../../utils/projectOrderScope';
import { appointmentDuration } from '../../../utils/projectAppointments';
// Shared field-report operations parser — keeps the manager editor and the technician
// screen reading/writing the exact same item list, in the same order.
import { operationItems as reportOperationItems } from '../../../installations/utils/installationScope';
// appointmentTechnicianNames stays in ProjectDetail.tsx (shared with staying components);
// referenced only at render time, so this back-import is safe despite the module cycle.
import { appointmentTechnicianNames } from '../../../../ProjectDetail';

const FIELD_EXPENSE_TYPES = [
    { key: 'transport', value: 'Nakliye' },
    { key: 'equipmentRental', value: 'Ekipman Kiralama' },
    { key: 'externalServices', value: 'Dış hizmetler' },
    { key: 'subcontractor', value: 'Taşeron' },
    { key: 'other', value: 'Diğer' },
] as const;

// Detail editor shown in place of the appointment list when a "Saha" line is opened. Captures date,
// work done, technical notes, external expenses, used + additional materials, previews the
// additional-work (overtime) calculation, and saves then returns to the list.
type FieldReportTab = 'times' | 'work' | 'expenses' | 'materials';

// Slide-over covering the right half of the screen for viewing/updating a single field
// report. Sharp corners, a shadow along its inner (left) edge, and a transparent backdrop so
// the page stays fully visible (no dim, no blur) behind it. Appointment/customer/technician
// details sit at the top for reference; a single light-gray bar switches between the editable
// sections (appointment times / work performed / external expenses / materials).
export const FieldReportPanel = ({ project, order, appointment, report, materials, open, onSaved, onClose }: { project: ProjectDto; order: ProjectSalesOrder | null; appointment: any; report: any | null; materials: ProjectMaterial[]; open: boolean; onSaved: () => Promise<void>; onClose: () => void }) => {
    const { user } = useAuthStore();
    const roleNames = [
        user?.roleName,
        ...((user as any)?.employeeRoles?.map((er: any) => er.role?.roleName) || []),
    ].filter(Boolean).map((r: string) => r.toLowerCase());
    const isTechnician = roleNames.some((r) => r.includes('teknisyen'));
    const isManager = roleNames.some((r) => r.includes('müdür') || r.includes('mudur') || r.includes('yönetici') || r.includes('yonetici') || r.includes('manager'));
    // Managers and technicians may report work but must not add used/extra materials.
    const canAddMaterials = !isTechnician && !isManager;

    const apptDate = dayjs(appointment.startTime);
    const [start, setStart] = useState(report?.startedAt ? dayjs(report.startedAt).format('HH:mm') : apptDate.format('HH:mm'));
    const [end, setEnd] = useState(report?.endedAt ? dayjs(report.endedAt).format('HH:mm') : dayjs(appointment.endTime).format('HH:mm'));
    // Work performed is entered item by item (same model as the technician screen), so
    // the same lines render in the same order on both sides. Seed from any existing report.
    const [operations, setOperations] = useState<string[]>(() => {
        const items = report ? reportOperationItems(report) : [];
        return items.length ? items : [''];
    });
    const [technicalNotes, setTechnicalNotes] = useState(report?.technicalNotes || '');
    const [newExpenses, setNewExpenses] = useState<Array<{ expenseType: string; amount: number; description: string }>>([]);
    const [newUsedMaterials, setNewUsedMaterials] = useState<Array<{ materialId: string; quantity: number }>>([]);
    const [newExtraMaterials, setNewExtraMaterials] = useState<Array<{ materialId: string; quantity: number; description: string }>>([]);
    const [saving, setSaving] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);
    const [tab, setTab] = useState<FieldReportTab>('times');
    const [deletingId, setDeletingId] = useState<string | null>(null);

    const existingExpenses = (project.expenses || []).filter((e: any) => e.appointmentId === appointment.id);
    const existingUsedMaterials = report?.usedMaterials || [];
    const existingExtraMaterials = (project.extraMaterials || []).filter((m: any) => m.appointmentId === appointment.id);
    const plannedMin = appointmentDuration(appointment);
    const buildIso = (time: string) => {
        const [h, m] = time.split(':').map((x) => Number(x));
        return apptDate.hour(h || 0).minute(m || 0).second(0).millisecond(0);
    };
    const workedMin = Math.max(0, buildIso(end).diff(buildIso(start), 'minute'));
    const tolerance = Number(project.overtimeTolerancePercent ?? 15);
    const overtimeMin = Math.max(0, Math.ceil(workedMin - plannedMin * (1 + tolerance / 100)));
    const overtimeCost = (overtimeMin / 60) * (Number(project.overtimeHourlyRate) || 0);

    const save = async () => {
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) return toast.error(t('projects.yapilan_isleri_girin'));
        // Store one item per line with a "- " prefix — the exact shape the technician
        // completion produces — so both sides parse back to the same ordered item list.
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
            // Saving a field report only attaches it to THIS appointment — it never
            // completes/closes the montaj (that stays a separate, explicit "Finish"
            // action). The appointmentId keeps the report scoped to this appointment so
            // it can't surface on sibling appointments of the same order, and leaves the
            // job open for the technician to keep working.
            let reportId: string | undefined = report?.id;
            if (!report) {
                const res = await projectApi.addReport(project.id, {
                    salesOrderId: orderPayloadId(order),
                    appointmentId: appointment.id,
                    workDate: apptDate.startOf('day').toISOString(),
                    startedAt,
                    endedAt,
                    operationsDone: operationsDoneText,
                    technicalNotes: technicalNotes.trim(),
                });
                reportId = res.report?.id;
            } else {
                await projectApi.updateReport(report.id, {
                    salesOrderId: report.salesOrderId ?? orderPayloadId(order),
                    workDate: report.workDate,
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
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.rapor_kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    const createPdf = async () => {
        if (!report) return toast.error(t('projects.raporu_once_kaydedin'));
        setPdfBusy(true);
        try {
            const { exportFieldReportPdf } = await import("@/utils/pdf/fieldReportPdf");
            await exportFieldReportPdf(project, report, { appointment });
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.pdf_olusturulamadi'));
        } finally {
            setPdfBusy(false);
        }
    };

    if (!open) return null;

    // Delete a saved expense/extra-material, then refresh the project data. Used materials have
    // no delete endpoint, so those existing rows stay read-only.
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

    const tabs: Array<{ key: FieldReportTab; label: string }> = [
        { key: 'times', label: t('projects.randevu_saatleri') },
        { key: 'work', label: t('projects.yapilan_isler') },
        { key: 'expenses', label: t('auto.harici_giderler') },
        { key: 'materials', label: t('nav.materials') },
    ];
    const tabClass = (active: boolean) =>
        `-mb-px shrink-0 border-b-2 px-3 py-2.5 text-[13px] font-medium transition-colors ${
            active ? 'border-[#272f67] text-[#272f67]' : 'border-transparent text-slate-900 hover:text-[#272f67]'
        }`;

    return (
        <div className="fixed inset-0 z-50">
            {/* Transparent backdrop: overlays the page without dimming or blurring it; click to close. */}
            <div className="absolute inset-0" onClick={onClose} role="presentation" />

            {/* Right-half panel: sharp corners, shadow along its inner (left) edge, slides in from the right. */}
            <div className="absolute inset-y-0 right-0 flex h-full w-full flex-col bg-white shadow-[-10px_0_30px_-8px_rgba(15,23,42,0.28)] duration-300 animate-in slide-in-from-right md:w-1/2">
                {/* Header + field report title with a close (X) button. */}
                <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
                    <div className="min-w-0">
                        <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{t('projects.saha_raporu')}</div>
                        <h2 className="mt-0.5 flex items-center gap-2 truncate text-[16px] font-semibold text-slate-900">
                            <ClipboardPenLine size={16} className="shrink-0 text-slate-400" />
                            {apptDate.format('DD.MM.YYYY')} · {apptDate.format('HH:mm')}-{dayjs(appointment.endTime).format('HH:mm')}
                        </h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        aria-label={t('common.close')}
                        className="flex size-9 shrink-0 items-center justify-center text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                    >
                        <X size={22} />
                    </button>
                </div>

                {/* Reference strip: appointment time, customer and technician shown read-only at the top. */}
                <div className="grid grid-cols-1 gap-3 border-b border-slate-200 px-5 py-3 sm:grid-cols-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.randevu_saati')}</div>
                        <div className="mt-0.5 text-[12.5px] font-medium text-slate-800">{apptDate.format('DD.MM.YYYY')} · {apptDate.format('HH:mm')}-{dayjs(appointment.endTime).format('HH:mm')}</div>
                        <div className="text-[11px] text-slate-500">{durationFmt(plannedMin)}</div>
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.musteri')}</div>
                        <div className="mt-0.5 truncate text-[12.5px] font-medium text-slate-800">{project.customer?.companyName || project.customerId || '-'}</div>
                        {project.customer?.mainPhone && <div className="truncate text-[11px] text-slate-500">{project.customer.mainPhone}</div>}
                    </div>
                    <div className="min-w-0">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.teknisyen')}</div>
                        <div className="mt-0.5 truncate text-[12.5px] font-medium text-slate-800">{appointmentTechnicianNames(appointment)}</div>
                    </div>
                </div>

                {/* Single solid light-gray bar: active tab is dark navy with an underline, others stay black. */}
                <div className="flex items-center gap-1 overflow-x-auto border-b border-slate-200 bg-slate-100 px-3">
                    {tabs.map((tb) => (
                        <button key={tb.key} type="button" onClick={() => setTab(tb.key)} className={tabClass(tab === tb.key)}>
                            {tb.label}
                        </button>
                    ))}
                </div>

                {/* Scrollable content. */}
                <div className="flex-1 overflow-y-auto px-5 py-4">
                    {tab === 'times' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <Field label={t('common.date')}><Input value={apptDate.format('DD.MM.YYYY')} disabled readOnly /></Field>
                                <Field label={t('common.start')}><Input type="time" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
                                <Field label={t('common.end')}><Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} /></Field>
                            </div>

                            {/* Additional-work (overtime) calculation preview. */}
                            <div className="flex flex-wrap gap-2 text-[11.5px]">
                                <div className="w-[120px] rounded-md border border-slate-200 bg-white px-2 py-1">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('projects.randevu_saati')}</div>
                                    <div className="font-medium text-slate-800">{durationFmt(plannedMin)}</div>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('projects.calisilan_saat')}</div>
                                    <div className="font-medium text-slate-800">{durationFmt(workedMin)}</div>
                                </div>
                                <div className="rounded-md border border-slate-200 bg-white px-2 py-1">
                                    <div className="text-[10px] uppercase tracking-wide text-slate-400">{t('projects.ek_calisma')}</div>
                                    <div className="font-medium text-slate-800">{durationFmt(overtimeMin)} · {money(overtimeCost)}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    {tab === 'work' && (
                        <div className="space-y-3">
                            <div className="rounded-lg border border-slate-200">
                                <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                                    <span>{t('projects.yapilan_isler')}</span>
                                    <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setOperations([...operations, ''])}>{t('projects.madde')}</Button>
                                </div>
                                <div className="space-y-2 p-3">
                                    {operations.map((item, index) => (
                                        <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                            <Input value={item} placeholder={t('projects.yapilan_is')} onChange={(e) => setOperations(operations.map((row, i) => i === index ? e.target.value : row))} />
                                            <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={operations.length === 1} onClick={() => setOperations(operations.filter((_, i) => i !== index))} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <Field label={t('projects.teknik_notlar')}>
                                <Textarea rows={3} value={technicalNotes} onChange={(e) => setTechnicalNotes(e.target.value)} />
                            </Field>
                        </div>
                    )}

                    {tab === 'expenses' && (
                        <div className="rounded-md border border-slate-200 bg-white p-3">
                            <div className="mb-2 flex items-center justify-between">
                                <div className="text-[12px] font-semibold text-slate-700">{t('auto.harici_giderler')}</div>
                                <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setNewExpenses((rows) => [...rows, { expenseType: 'Nakliye', amount: 0, description: '' }])}>{t('auto.satir')}</Button>
                            </div>
                            {existingExpenses.length > 0 && (
                                <div className="mb-2 space-y-1">
                                    {existingExpenses.map((e: any) => (
                                        <div key={e.id} className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                                            <span className="min-w-0 truncate">{displayExpenseType(e.expenseType)}{e.description ? ` · ${e.description}` : ''}</span>
                                            <div className="flex shrink-0 items-center gap-1">
                                                <span className="font-mono">{money(Number(e.amount) || 0)}</span>
                                                <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} loading={deletingId === e.id} onClick={() => void removeExisting('expense', e.id)} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                            {newExpenses.length === 0 && existingExpenses.length === 0 && <p className="text-[12px] text-slate-500">{t('auto.gider_yok')}</p>}
                            <div className="space-y-2">
                                {newExpenses.map((row, index) => (
                                    <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[160px_110px_1fr_40px]">
                                        <Select value={row.expenseType} onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => i === index ? { ...r, expenseType: e.target.value } : r))}>
                                            {FIELD_EXPENSE_TYPES.map((x) => <option key={x.value} value={x.value}>{t(`projects.expenseTypes.${x.key}`)}</option>)}
                                        </Select>
                                        <Input type="number" min={0} step="0.01" value={row.amount} onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => i === index ? { ...r, amount: Number(e.target.value) } : r))} />
                                        <Input value={row.description} placeholder={t('common.description')} onChange={(e) => setNewExpenses((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
                                        <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setNewExpenses((rows) => rows.filter((_, i) => i !== index))} />
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {tab === 'materials' && (
                        <div className="space-y-3">
                            <div className="rounded-md border border-slate-200 bg-white p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[12px] font-semibold text-slate-700">{t('projects.kullanilan_malzemeler')}</div>
                                    {canAddMaterials && (
                                        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setNewUsedMaterials((rows) => [...rows, { materialId: '', quantity: 1 }])}>{t('auto.satir')}</Button>
                                    )}
                                </div>
                                {existingUsedMaterials.length > 0 && (
                                    <div className="mb-2 space-y-1">
                                        {existingUsedMaterials.map((m: any) => (
                                            <div key={m.id} className="flex items-center justify-between text-[12px] text-slate-600">
                                                <span>{m.material?.name || t('auto.malzeme')}</span>
                                                <span className="font-mono">{numberFmt(m.quantity)} {t('projects.adet')}</span>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {newUsedMaterials.length === 0 && existingUsedMaterials.length === 0 && <p className="text-[12px] text-slate-500">{t('projects.malzeme_yok')}</p>}
                                <div className="space-y-2">
                                    {newUsedMaterials.map((row, index) => (
                                        <div key={index} className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_90px_36px]">
                                            <MaterialSearchSelect value={row.materialId} materials={materials} onChange={(materialId) => setNewUsedMaterials((rows) => rows.map((r, i) => i === index ? { ...r, materialId } : r))} />
                                            <Input type="number" min={0} step="1" value={row.quantity} onChange={(e) => setNewUsedMaterials((rows) => rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
                                            <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setNewUsedMaterials((rows) => rows.filter((_, i) => i !== index))} />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="rounded-md border border-slate-200 bg-white p-3">
                                <div className="mb-2 flex items-center justify-between">
                                    <div className="text-[12px] font-semibold text-slate-700">{t('projects.ek_malzemeler')}</div>
                                    {canAddMaterials && (
                                        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => setNewExtraMaterials((rows) => [...rows, { materialId: '', quantity: 1, description: '' }])}>{t('auto.satir')}</Button>
                                    )}
                                </div>
                                {existingExtraMaterials.length > 0 && (
                                    <div className="mb-2 space-y-1">
                                        {existingExtraMaterials.map((m: any) => (
                                            <div key={m.id} className="flex items-center justify-between gap-2 text-[12px] text-slate-600">
                                                <span className="min-w-0 truncate">{m.material?.name || t('auto.malzeme')}{m.description ? ` · ${m.description}` : ''}</span>
                                                <div className="flex shrink-0 items-center gap-1">
                                                    <span className="font-mono">{numberFmt(m.quantity)} × {money(Number(m.unitPrice) || 0)}</span>
                                                    <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} loading={deletingId === m.id} onClick={() => void removeExisting('extra', m.id)} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                                {newExtraMaterials.length === 0 && existingExtraMaterials.length === 0 && <p className="text-[12px] text-slate-500">{t('projects.ek_malzeme_yok')}</p>}
                                <div className="space-y-2">
                                    {newExtraMaterials.map((row, index) => (
                                        <div key={index} className="grid grid-cols-1 gap-2">
                                            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_90px_36px]">
                                                <MaterialSearchSelect value={row.materialId} materials={materials} onChange={(materialId) => setNewExtraMaterials((rows) => rows.map((r, i) => i === index ? { ...r, materialId } : r))} />
                                                <Input type="number" min={0} step="1" value={row.quantity} onChange={(e) => setNewExtraMaterials((rows) => rows.map((r, i) => i === index ? { ...r, quantity: Number(e.target.value) } : r))} />
                                                <Button variant="ghost" size="sm" icon={<Trash2 size={13} />} onClick={() => setNewExtraMaterials((rows) => rows.filter((_, i) => i !== index))} />
                                            </div>
                                            <Input value={row.description} placeholder={t('common.description')} onChange={(e) => setNewExtraMaterials((rows) => rows.map((r, i) => i === index ? { ...r, description: e.target.value } : r))} />
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer: Generate PDF sits to the left of Save, anchored bottom-right. */}
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
                    <Button variant="secondary" size="sm" disabled={pdfBusy || !report} icon={<FileDown size={13} />} onClick={() => void createPdf()}>{pdfBusy ? '…' : t('projects.pdf_olustur')}</Button>
                    <Button variant="primary" size="sm" loading={saving} icon={<Save size={13} />} onClick={() => void save()}>{t('common.save')}</Button>
                </div>
            </div>
        </div>
    );
};
