import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import {
    AlertTriangle,
    CalendarCheck01 as CalendarClock,
    CheckCircle as CheckCircle2,
    Edit01 as Pencil,
    List,
    Save01 as Save,
    Trash01 as Trash2,
    X,
} from '@/components/icons/antIconCompat';
import { SlidePanel } from '@/components/layout/SlidePanel';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { Modal } from '@/components/ui-shared/Modal';
import { Field, Input, Select } from '@/components/ui-shared/Field';
import { projectApi, type CompleteInstallationInput } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { PersonLite } from '@/types/maintenance';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AppointmentSchedulerCalendar } from '../AppointmentSchedulerCalendar';
import { durationFmt } from '../../../utils/projectFormatters';
import { orderPayloadId, scopedRecords } from '../../../utils/projectOrderScope';
import {
    appointmentDuration,
    canManagerFinishAppointment,
    findAppointmentReport,
    isAppointmentAwaitingTechnician,
} from '../../../utils/projectAppointments';
import { appointmentToForm, appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import {
    ManagerCompletionPanel,
    emptyManagerCompletionForm,
    type ManagerCompletionFormState,
} from './ManagerCompletionPanel';

// Appointment planning: month calendar + day agenda + create/edit form, with the
// full plan list (and the manager-finish workflows) in a slide-out panel.
export const AppointmentList = ({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
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
            toast.error(e.response?.data?.error || t('auto.saat_plani_kaydedilemedi'));
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

    // Position on the 06:00–20:00 schedule strip, as a percentage.
    const SCHEDULE_START = 6 * 60;
    const SCHEDULE_END = 20 * 60;
    const dayPercent = (iso: string) => {
        const time = dayjs(iso);
        const minutes = time.hour() * 60 + time.minute();
        return Math.max(0, Math.min(100, ((minutes - SCHEDULE_START) / (SCHEDULE_END - SCHEDULE_START)) * 100));
    };
    const scheduleSegment = (appointment: any) => {
        const left = dayPercent(appointment.startTime);
        const width = Math.max(1.5, dayPercent(appointment.endTime) - left);
        return { left: `${left}%`, width: `${width}%` };
    };

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
            toast.success(result.message || t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) {
                toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            }
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            setCompletionAppointmentId(null);
            setConfirmFinishAppointment(null);
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.montaj_bitirilemedi'));
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
            toast.success(result.message || t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) {
                toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            }
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            setCompletionAppointmentId(null);
            setCompletionForm(emptyManagerCompletionForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.montaj_bitirilemedi'));
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
                            <div className={`w-full rounded-md border px-3 py-2 ${managerCanFinish ? t('auto.border_red_200_bg_red_50') : t('auto.border_amber_200_bg_amber_50')}`}>
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

            {/* Day schedule — same card, split off by a line instead of a new card. */}
            <div className="border-t border-slate-100 px-4 py-3 dark:border-white/10">
                <div className="mb-2 flex items-center justify-between text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    <span>{t('projects.detail.daySchedule')}</span>
                    <span className="font-mono normal-case">06:00 – 20:00</span>
                </div>
                <div className="relative h-6 overflow-hidden rounded-md bg-slate-100 dark:bg-white/10">
                    {[8, 10, 12, 14, 16, 18].map((hour) => (
                        <span
                            key={hour}
                            className="absolute inset-y-0 w-px bg-white/80 dark:bg-white/15"
                            style={{ left: `${((hour * 60 - SCHEDULE_START) / (SCHEDULE_END - SCHEDULE_START)) * 100}%` }}
                        />
                    ))}
                    {selectedDayOthers.map((appointment: any) => (
                        <span
                            key={appointment.id}
                            title={`${dayjs(appointment.startTime).format('HH:mm')}–${dayjs(appointment.endTime).format('HH:mm')} · ${appointment.project?.projectName || appointment.salesOrder?.orderNumber || t('projects.cal_others')}`}
                            className="absolute inset-y-1 rounded-sm bg-slate-300/80 ring-1 ring-white dark:bg-white/25 dark:ring-black/40"
                            style={scheduleSegment(appointment)}
                        />
                    ))}
                    {selectedDayAppointments.map((appointment: any) => (
                        <span
                            key={appointment.id}
                            title={`${dayjs(appointment.startTime).format('HH:mm')}–${dayjs(appointment.endTime).format('HH:mm')} · ${appointmentTechnicianNames(appointment)}`}
                            className="absolute inset-y-1 rounded-sm bg-[#272f67] ring-1 ring-white dark:ring-black/40"
                            style={scheduleSegment(appointment)}
                        />
                    ))}
                </div>
                <div className="mt-1 flex justify-between font-mono text-[9px] text-slate-400">
                    <span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>20</span>
                </div>
            </div>
        </Card>
        <Card
            title={editing ? t('auto.saat_planini_duzenle') : t('auto.saat_plani_ekle')}
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
                    {editing ? t('common.update') : t('common.add')}
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
