/* RETIRED 18.08.2026 — the project's appointment section is the calendar page
   now (see booking/AppointmentList.tsx). Kept for reference only: nothing
   imports this file any more.
   ------------------------------------------------------------------------ */
import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { CalendarCheck01 as CalendarClock, CheckCircle as CheckCircle2 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { maintenanceApi } from '@/lib/api/maintenance';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';
import type { PersonLite } from '@/types/maintenance';
import type { ProjectDto } from '@/types/project';

import { money } from '../../../../utils/projectFormatters';
import {
    appointmentTechIds,
    dayKey,
    FIXED_TOLERANCE_PERCENT,
    perMinuteRate,
    rangesOverlap,
    readLastHourlyRate,
    saveLastHourlyRate,
} from './scheduleShared';

type WizardStep = 1 | 2 | 3;

type WizardForm = {
    date: string;
    start: string;
    end: string;
    technicianIds: string[];
    notes: string;
    hourlyRate: number;
};

const emptyForm = (project: ProjectDto, initialDate?: string): WizardForm => ({
    date: initialDate || dayKey(dayjs()),
    start: '09:00',
    end: '17:00',
    technicianIds: [],
    notes: '',
    hourlyRate: readLastHourlyRate(project),
});

const formFromAppointment = (project: ProjectDto, appointment: any): WizardForm => ({
    date: dayKey(dayjs(appointment.startTime)),
    start: dayjs(appointment.startTime).format('HH:mm'),
    end: dayjs(appointment.endTime).format('HH:mm'),
    technicianIds: appointmentTechIds(appointment),
    notes: appointment.notes || '',
    hourlyRate: readLastHourlyRate(project),
});

const getStepTitles = (): Record<WizardStep, string> => ({
    1: t('projects.schedule.stepDate'),
    2: t('projects.schedule.stepTechs'),
    3: t('projects.schedule.stepRate'),
});

// Step-by-step appointment creation (and edit): date/time with the customer
// already fixed, then the technicians who are actually free in that window,
// then the overtime hourly rate (the tolerance itself is fixed at 15%). Ends on
// a centred "completed" screen; the calendar refreshes behind the sheet, no
// page reload.
export const AppointmentWizard = ({
    project,
    salesOrderId,
    technicians,
    editing,
    initialDate,
    onSaved,
    onClose,
    onExit,
}: {
    project: ProjectDto;
    salesOrderId: string | null;
    technicians: PersonLite[];
    /** When set, the wizard updates this appointment instead of creating one. */
    editing?: any | null;
    initialDate?: string;
    /** Refreshes the calendar data (project + tenant plans) after a save. */
    onSaved: () => Promise<void>;
    onClose: () => void;
    /** Embedded in the day pop-up: "back" on the first step leaves the wizard. */
    onExit?: () => void;
}) => {
    const { permissions } = useAuthStore();
    const canManageProject = permissions.includes('projects.manage');
    const [step, setStep] = useState<WizardStep>(1);
    const [direction, setDirection] = useState<'forward' | 'back'>('forward');
    const [success, setSuccess] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [form, setForm] = useState<WizardForm>(() =>
        editing ? formFromAppointment(project, editing) : emptyForm(project, initialDate));

    // Who is already booked in the selected window: order appointments across the
    // tenant plus maintenance visits. Either fetch may be denied by role — then it
    // simply contributes no busy ids.
    const [busyLoading, setBusyLoading] = useState(false);
    const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

    const windowStart = dayjs(`${form.date}T${form.start}`).valueOf();
    const windowEnd = dayjs(`${form.date}T${form.end}`).valueOf();

    useEffect(() => {
        if (step !== 2) return;
        let cancelled = false;
        setBusyLoading(true);
        Promise.all([
            projectApi.listAppointments(form.date, form.date, { calendar: true }).catch(() => []),
            maintenanceApi.listTasks(form.date, form.date, { calendar: true }).catch(() => []),
        ]).then(([appointments, tasks]) => {
            if (cancelled) return;
            const ids = new Set<string>();
            (appointments as any[]).forEach((appointment) => {
                if (editing && appointment.id === editing.id) return;
                if (appointment.status === 'CANCELLED') return;
                const start = dayjs(appointment.startTime).valueOf();
                const end = dayjs(appointment.endTime).valueOf();
                if (!rangesOverlap(start, end, windowStart, windowEnd)) return;
                appointmentTechIds(appointment).forEach((id) => ids.add(id));
            });
            (tasks as any[]).forEach((task) => {
                const startIso = task.scheduledStartTime || task.startTime;
                const endIso = task.scheduledEndTime || task.endTime;
                if (!startIso || !endIso) return;
                const start = dayjs(startIso).valueOf();
                const end = dayjs(endIso).valueOf();
                if (!rangesOverlap(start, end, windowStart, windowEnd)) return;
                const techId = task.assignedTechId || task.technician?.id;
                if (techId) ids.add(techId);
            });
            setBusyIds(ids);
            setBusyLoading(false);
        });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [step, form.date, form.start, form.end]);

    const freeTechnicians = useMemo(
        () => technicians.filter((tech) => !busyIds.has(tech.id)),
        [technicians, busyIds],
    );
    const busyCount = technicians.length - freeTechnicians.length;
    // A previously selected technician who became busy after a time change is
    // silently dropped from the selection.
    useEffect(() => {
        if (step !== 2) return;
        setForm((prev) => {
            const kept = prev.technicianIds.filter((id) => !busyIds.has(id));
            return kept.length === prev.technicianIds.length ? prev : { ...prev, technicianIds: kept };
        });
    }, [busyIds, step]);

    const goForward = () => {
        if (step === 1) {
            if (!(dayjs(`${form.date}T${form.end}`).isAfter(dayjs(`${form.date}T${form.start}`)))) {
                toast.error(t('auto.bitis_saati_baslangictan_sonra_olmalidir'));
                return;
            }
        }
        if (step === 2 && form.technicianIds.length === 0) {
            toast.error(t('auto.en_az_bir_teknisyen_secin'));
            return;
        }
        setDirection('forward');
        setStep((prev) => Math.min(3, prev + 1) as WizardStep);
    };

    const goBack = () => {
        if (step === 1) {
            onExit?.();
            return;
        }
        setDirection('back');
        setStep((prev) => Math.max(1, prev - 1) as WizardStep);
    };

    const toggleTechnician = (id: string) => {
        setForm((prev) => ({
            ...prev,
            technicianIds: prev.technicianIds.includes(id)
                ? prev.technicianIds.filter((item) => item !== id)
                : [...prev.technicianIds, id],
        }));
    };

    const submit = async () => {
        const technicianIds = [...new Set(form.technicianIds)];
        const payload = {
            salesOrderId,
            assignedTechId: technicianIds[0] || null,
            technicianIds,
            startTime: dayjs(`${form.date}T${form.start}`).toISOString(),
            endTime: dayjs(`${form.date}T${form.end}`).toISOString(),
            notes: form.notes,
        };
        setSubmitting(true);
        try {
            if (editing) {
                await projectApi.updateAppointment(editing.id, payload);
            } else {
                await projectApi.createAppointment(project.id, payload);
            }
            // The rate is remembered locally so the next appointment starts from
            // it, and pushed onto the project so the backend bills overtime with
            // it (per minute = rate / 60). The tolerance is not sent: it is fixed
            // at 15% and `PATCH /projects/:id` does not accept it anyway.
            const hourlyRate = Math.max(0, Number(form.hourlyRate) || 0);
            saveLastHourlyRate(hourlyRate);
            if (canManageProject && hourlyRate !== (Number(project.overtimeHourlyRate) || 0)) {
                await projectApi.update(project.id, { overtimeHourlyRate: hourlyRate }).catch(() => undefined);
            }
            // Refresh the calendar behind the sheet before showing "completed".
            await onSaved();
            setSuccess(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('auto.saat_plani_kaydedilemedi'));
        } finally {
            setSubmitting(false);
        }
    };

    if (success) {
        return (
            <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
                <span className="flex size-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                    <CheckCircle2 size={30} />
                </span>
                <div className="text-[16px] font-bold text-slate-900">{t('projects.schedule.completedTitle')}</div>
                <div className="text-[12.5px] text-slate-500">
                    {editing ? t('projects.schedule.updated') : t('projects.schedule.created')}
                </div>
                <Button className="mt-2 min-w-[140px]" variant="primary" onClick={onClose}>
                    {t('common.close')}
                </Button>
            </div>
        );
    }

    const stepTitles = getStepTitles();

    return (
        <div className="flex min-h-0 flex-1 flex-col">
            {/* Step rail */}
            <div className="flex items-center justify-center gap-1.5 border-b border-slate-100 px-4 py-2.5 dark:border-white/10">
                {([1, 2, 3] as WizardStep[]).map((key, index) => (
                    <div key={key} className="flex items-center gap-1.5">
                        {index > 0 && <span className="h-px w-6 bg-slate-200 dark:bg-white/15" />}
                        <span className={`flex h-5 w-5 items-center justify-center rounded-full text-[10.5px] font-bold ${
                            step === key
                                ? 'bg-[#272f67] text-white'
                                : step > key
                                    ? 'bg-emerald-500 text-white'
                                    : 'bg-slate-100 text-slate-400 dark:bg-white/10'
                        }`}>
                            {step > key ? '✓' : key}
                        </span>
                        <span className={`text-[11.5px] font-semibold ${step === key ? 'text-slate-900' : 'text-slate-400'}`}>
                            {stepTitles[key]}
                        </span>
                    </div>
                ))}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto">
                <div
                    key={`${step}-${direction}`}
                    className={`mx-auto w-full px-5 py-5 md:px-8 ${step === 2 ? 'max-w-6xl' : 'max-w-3xl'} ${direction === 'forward' ? 'ofi-slide-in-right' : 'ofi-slide-in-left'}`}
                >
                    {step === 1 && (
                        <div className="space-y-3">
                            {/* Customer is fixed by the project — shown, not chosen. */}
                            <div className="flex items-center gap-2.5 rounded-lg border border-[#272f67]/20 bg-[#272f67]/[0.04] px-3 py-2">
                                <CalendarClock size={15} className="shrink-0 text-[#272f67]" />
                                <div className="min-w-0">
                                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[#272f67]/70">
                                        {t('projects.schedule.customer')}
                                    </div>
                                    <div className="truncate text-[12.5px] font-semibold text-[#272f67]">
                                        {project.customer?.companyName || (project as any).projectName || '—'}
                                    </div>
                                </div>
                            </div>
                            <Field label={t('common.date')}>
                                <Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                            </Field>
                            <div className="grid grid-cols-2 gap-3">
                                <Field label={t('common.start')}>
                                    <Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} />
                                </Field>
                                <Field label={t('common.end')}>
                                    <Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} />
                                </Field>
                            </div>
                            <Field label={t('auto.not')}>
                                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
                            </Field>
                        </div>
                    )}

                    {step === 2 && (
                        <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                                <div className="text-[12px] font-semibold text-slate-700">
                                    {t('projects.schedule.availableInstallers')}
                                    <span className="ml-1.5 font-normal text-slate-400 tabular-nums">
                                        {dayjs(`${form.date}T${form.start}`).format('DD.MM.YYYY HH:mm')} – {form.end}
                                    </span>
                                </div>
                                {form.technicianIds.length > 0 && (
                                    <span className="rounded-full bg-[#272f67]/[0.08] px-2 py-0.5 text-[11px] font-bold text-[#272f67]">
                                        {form.technicianIds.length}
                                    </span>
                                )}
                            </div>
                            {busyLoading ? (
                                <div className="space-y-1.5 py-1">
                                    {[0, 1, 2].map((row) => (
                                        <div key={row} className="h-8 animate-pulse rounded bg-slate-100" />
                                    ))}
                                </div>
                            ) : freeTechnicians.length === 0 ? (
                                <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-4 text-center text-[12px] font-medium text-amber-800">
                                    {t('projects.schedule.noAvailableInstallers')}
                                </div>
                            ) : (
                                /* Full width, low rows: the picker spans the sheet so
                                   every column keeps its own single line — the height
                                   comes down, not the reach. */
                                <div className="w-full overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
                                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                                        <thead>
                                            <tr>
                                                <th className="w-7 text-left" />
                                                <th className="text-left">{t('projects.schedule.installer')}</th>
                                                <th className="text-left">{t('common.email')}</th>
                                                {/* Sized for the longest label the column
                                                    carries — German "Verantwortlich" needs
                                                    ~110px as an uppercase badge; w-24 clipped it. */}
                                                <th className="w-[140px] text-left">{t('projects.schedule.lead')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {freeTechnicians.map((tech) => {
                                                const selected = form.technicianIds.includes(tech.id);
                                                const isLead = form.technicianIds[0] === tech.id;
                                                return (
                                                    <tr
                                                        key={tech.id}
                                                        onClick={() => toggleTechnician(tech.id)}
                                                        className={`cursor-pointer transition-colors ${selected ? 'bg-[#272f67]/[0.05] dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}
                                                    >
                                                        <td>
                                                            <input
                                                                type="checkbox"
                                                                checked={selected}
                                                                onChange={() => toggleTechnician(tech.id)}
                                                                onClick={(event) => event.stopPropagation()}
                                                            />
                                                        </td>
                                                        <td className="truncate font-semibold text-slate-800 dark:text-white">
                                                            {tech.firstName} {tech.lastName}
                                                        </td>
                                                        <td className="truncate text-slate-500 dark:text-white/60">{tech.email || '—'}</td>
                                                        <td>
                                                            {isLead && (
                                                                <span className="inline-block whitespace-nowrap rounded border border-[#272f67]/25 bg-[#272f67]/[0.07] px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-[#272f67] dark:border-white/25 dark:bg-white/10 dark:text-white">
                                                                    {t('projects.schedule.lead')}
                                                                </span>
                                                            )}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                            {!busyLoading && busyCount > 0 && (
                                <div className="text-[11px] text-slate-400">
                                    {t('projects.schedule.busyCount', { count: busyCount })}
                                </div>
                            )}
                        </div>
                    )}

                    {step === 3 && (
                        <div className="space-y-3">
                            {/* The tolerance is a fixed rule, so it is stated, not
                                asked. What is billed past it is the hourly rate. */}
                            <div className="rounded-md border border-[#272f67]/20 bg-[#272f67]/[0.04] px-3 py-2 text-[12px] text-[#272f67]">
                                {t('projects.schedule.toleranceFixed', { tolerance: FIXED_TOLERANCE_PERCENT })}
                            </div>
                            <div className="max-w-[220px]">
                                <Field label={t('projects.settings.laborFeeLabel')}>
                                    <Input
                                        type="number"
                                        min={0}
                                        step="0.01"
                                        value={form.hourlyRate}
                                        placeholder="0"
                                        onChange={(e) => setForm({ ...form, hourlyRate: Number(e.target.value) || 0 })}
                                    />
                                </Field>
                            </div>
                            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                                {t('projects.schedule.perMinuteHint', { perMinute: money(perMinuteRate(form.hourlyRate)) })}
                            </div>
                            <div className="rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-600 dark:border-white/10">
                                <div className="flex justify-between py-0.5">
                                    <span>{t('common.date')}</span>
                                    <span className="font-semibold tabular-nums">{dayjs(form.date).format('DD.MM.YYYY')} · {form.start}–{form.end}</span>
                                </div>
                                <div className="flex justify-between py-0.5">
                                    <span>{t('projects.schedule.installer')}</span>
                                    <span className="font-semibold">
                                        {form.technicianIds
                                            .map((id) => technicians.find((tech) => tech.id === id))
                                            .filter(Boolean)
                                            .map((tech) => `${tech!.firstName} ${tech!.lastName}`)
                                            .join(', ')}
                                    </span>
                                </div>
                                <div className="flex justify-between py-0.5">
                                    <span>{t('projects.settings.laborFeeLabel')}</span>
                                    <span className="font-semibold tabular-nums">{money(form.hourlyRate)}</span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="border-t border-slate-100 px-4 py-3 dark:border-white/10">
                <div className={`mx-auto flex w-full items-center justify-between gap-2 ${step === 2 ? 'max-w-6xl' : 'max-w-3xl'}`}>
                    <Button variant="ghost" size="sm" disabled={(step === 1 && !onExit) || submitting} onClick={goBack}>
                        {t('common.back')}
                    </Button>
                    {step < 3 ? (
                        <Button variant="primary" size="sm" onClick={goForward}>
                            {t('common.next')}
                        </Button>
                    ) : (
                        <Button
                            variant="primary"
                            size="sm"
                            loading={submitting}
                            icon={<CheckCircle2 size={13} />}
                            onClick={() => void submit()}
                        >
                            {editing ? t('common.update') : t('common.create')}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};
