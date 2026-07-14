import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { CalendarCheck01 as CalendarClock, ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';

import { Card } from '../../../../../components/ui-shared/Card';
import { projectApi } from '../../../../../lib/api/project';
import { ensureMaintenanceLocale } from '../../../../maintenance/MaintenanceShared';
import { t } from '@/i18n/translate';

dayjs.extend(isoWeek);

const dayKey = (value: dayjs.Dayjs) => value.format('YYYY-MM-DD');

type DayBucket = {
    mine: any[];
    // Appointments outside the current order scope (other orders / other projects),
    // rendered as muted chips so the scheduler sees what else is planned that day.
    others: any[];
    // Distinct technicians already occupied on this day (mine + others).
    busyTechIds: Set<string>;
};

const collectTechnicianIds = (appointment: any, into: Set<string>) => {
    if (appointment.assignedTechId) into.add(appointment.assignedTechId);
    if (appointment.assignedTechnician?.id) into.add(appointment.assignedTechnician.id);
    (appointment.technicianAssignments || []).forEach((assignment: any) => {
        const id = assignment.technicianId || assignment.technician?.id;
        if (id) into.add(id);
    });
};

const otherChipLabel = (appointment: any) =>
    appointment.project?.projectName
    || appointment.project?.customer?.companyName
    || appointment.salesOrder?.orderNumber
    || t('projects.cal_others');

// Attendee names straight from the appointment payload (lead + assignment list),
// deduped, first names only so they fit a calendar chip.
export const appointmentAttendees = (appointment: any): string[] => {
    const names = new Map<string, string>();
    if (appointment?.assignedTechnician) {
        names.set(
            appointment.assignedTechnician.id,
            `${appointment.assignedTechnician.firstName || ''} ${appointment.assignedTechnician.lastName || ''}`.trim(),
        );
    }
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technician) {
            names.set(
                assignment.technician.id,
                `${assignment.technician.firstName || ''} ${assignment.technician.lastName || ''}`.trim(),
            );
        }
    });
    return Array.from(names.values()).filter(Boolean);
};

const shortAttendees = (appointment: any) => appointmentAttendees(appointment).map((name) => name.split(' ')[0]).join(', ');

const chipTooltip = (appointment: any, label?: string) => {
    const time = `${dayjs(appointment.startTime).format('HH:mm')} – ${dayjs(appointment.endTime).format('HH:mm')}`;
    const attendees = appointmentAttendees(appointment).join(', ');
    return [time, label, attendees, appointment.notes].filter(Boolean).join(' · ');
};

export const AppointmentSchedulerCalendar = ({
    appointments,
    technicianCount,
    selectedDate,
    onSelectDate,
    onEditAppointment,
    onTenantAppointments,
}: {
    appointments: any[];
    technicianCount: number;
    selectedDate: string;
    onSelectDate: (date: string) => void;
    onEditAppointment: (appointment: any) => void;
    /** Reports the tenant-wide appointments of the visible month up to the parent
     *  (feeds the day-agenda panel) — called with [] when the fetch is not permitted. */
    onTenantAppointments?: (list: any[]) => void;
}) => {
    ensureMaintenanceLocale();
    const [cursor, setCursor] = useState(() => (selectedDate ? dayjs(selectedDate) : dayjs()).startOf('month'));
    const [tenantAppointments, setTenantAppointments] = useState<any[]>([]);

    const gridStart = useMemo(() => cursor.startOf('month').startOf('isoWeek'), [cursor]);
    const days = useMemo(() => Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day')), [gridStart]);
    const weekDays = useMemo(() => Array.from({ length: 7 }, (_, index) => gridStart.add(index, 'day').format('dd')), [gridStart]);
    const today = dayjs();

    // Tenant-wide appointments for the visible grid, so busy days across other
    // orders/projects surface while planning. Fails silently for users whose role
    // cannot list all appointments — the calendar then only shows this order's plans.
    useEffect(() => {
        let cancelled = false;
        const start = gridStart.format('YYYY-MM-DD');
        const end = gridStart.add(41, 'day').format('YYYY-MM-DD');
        projectApi.listAppointments(start, end, { calendar: true })
            .then((list) => {
                if (cancelled) return;
                setTenantAppointments(list as any[]);
                onTenantAppointments?.(list as any[]);
            })
            .catch(() => {
                if (cancelled) return;
                setTenantAppointments([]);
                onTenantAppointments?.([]);
            });
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [gridStart]);

    const byDay = useMemo(() => {
        const map = new Map<string, DayBucket>();
        const ensure = (key: string) => {
            const existing = map.get(key);
            if (existing) return existing;
            const bucket: DayBucket = { mine: [], others: [], busyTechIds: new Set() };
            map.set(key, bucket);
            return bucket;
        };
        const mineIds = new Set(appointments.map((appointment) => appointment.id));
        appointments.forEach((appointment) => {
            const bucket = ensure(dayKey(dayjs(appointment.startTime)));
            bucket.mine.push(appointment);
            collectTechnicianIds(appointment, bucket.busyTechIds);
        });
        tenantAppointments.forEach((appointment) => {
            if (mineIds.has(appointment.id)) return;
            const bucket = ensure(dayKey(dayjs(appointment.startTime)));
            bucket.others.push(appointment);
            collectTechnicianIds(appointment, bucket.busyTechIds);
        });
        map.forEach((bucket) => {
            bucket.mine.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
            bucket.others.sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
        });
        return map;
    }, [appointments, tenantAppointments]);

    const isFullyBooked = (bucket?: DayBucket) =>
        Boolean(bucket && technicianCount > 0 && bucket.busyTechIds.size >= technicianCount);

    const mineChipClass = (appointment: any) => {
        if (appointment.status === 'COMPLETED') return 'border-l-emerald-500 bg-emerald-50 text-emerald-800 hover:bg-emerald-100';
        if (appointment.status === 'CANCELLED') return 'border-l-slate-300 bg-slate-50 text-slate-400 line-through hover:bg-slate-100';
        return 'border-l-[#272f67] bg-[#272f67]/[0.06] text-[#272f67] hover:bg-[#272f67]/[0.12]';
    };

    return (
        <Card
            title={t('projects.cal_title')}
            icon={<CalendarClock size={14} />}
            noPadding
            actions={(
                <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                    <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50"
                        onClick={() => setCursor((current) => current.subtract(1, 'month'))}
                    >
                        <ChevronLeft size={15} />
                    </button>
                    <button
                        type="button"
                        className="h-8 min-w-[120px] border-x border-slate-200 px-3 text-[12px] font-semibold capitalize text-slate-700 hover:bg-slate-50"
                        onClick={() => { setCursor(today.startOf('month')); onSelectDate(dayKey(today)); }}
                    >
                        {cursor.format('MMMM YYYY')}
                    </button>
                    <button
                        type="button"
                        className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50"
                        onClick={() => setCursor((current) => current.add(1, 'month'))}
                    >
                        <ChevronRight size={15} />
                    </button>
                </div>
            )}
        >
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-[10.5px] font-semibold uppercase text-slate-400">
                {weekDays.map((day, index) => <div key={`${day}-${index}`} className="border-r border-slate-100 py-1.5 last:border-r-0">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {days.map((day) => {
                    const key = dayKey(day);
                    const bucket = byDay.get(key);
                    const outside = day.month() !== cursor.month();
                    const isToday = key === dayKey(today);
                    const isSelected = key === selectedDate;
                    const full = isFullyBooked(bucket);
                    // Mine first, then the rest of the tenant's plans for the day.
                    const chips = [...(bucket?.mine || []), ...(bucket?.others || [])];
                    const visibleChips = chips.slice(0, 3);
                    const overflow = chips.length - visibleChips.length;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onSelectDate(key)}
                            className={`flex min-h-[86px] flex-col gap-1 border-b border-r border-slate-100 p-1 text-left align-top transition-colors last:border-r-0 hover:bg-slate-50 ${
                                isSelected
                                    ? 'bg-[#272f67]/[0.05] ring-2 ring-inset ring-[#272f67]'
                                    : full
                                        ? 'bg-rose-100/60 dark:bg-rose-500/10'
                                        : outside ? 'bg-slate-50/50' : 'bg-white'
                            }`}
                        >
                            <span className="flex items-center justify-between gap-1">
                                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold ${
                                    isToday ? 'ofi-cal-today bg-[#272f67] text-white' : full ? 'text-rose-600' : outside ? 'text-slate-300' : 'text-slate-700'
                                }`}>
                                    {day.date()}
                                </span>
                                {full && (
                                    <span
                                        className="truncate rounded bg-rose-100 px-1 py-px text-[9px] font-bold uppercase tracking-wide text-rose-600 dark:bg-rose-500/15 dark:text-rose-300"
                                        title={t('projects.cal_full_hint')}
                                    >
                                        {t('projects.cal_full')}
                                    </span>
                                )}
                            </span>
                            <span className="flex flex-col gap-0.5">
                                {visibleChips.map((appointment) => {
                                    const mine = (bucket?.mine || []).includes(appointment);
                                    const time = dayjs(appointment.startTime).format('HH:mm');
                                    if (!mine) {
                                        return (
                                            <span
                                                key={appointment.id}
                                                className="block w-full truncate rounded border-l-[3px] border-l-slate-300 bg-slate-200/60 px-1 py-0.5 text-[10px] font-medium leading-tight text-slate-600"
                                                title={chipTooltip(appointment, otherChipLabel(appointment))}
                                            >
                                                <span className="tabular-nums">{time}</span> {otherChipLabel(appointment)}
                                            </span>
                                        );
                                    }
                                    const attendees = shortAttendees(appointment);
                                    return (
                                        <span
                                            key={appointment.id}
                                            role="button"
                                            tabIndex={0}
                                            onClick={(event) => { event.stopPropagation(); onEditAppointment(appointment); }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter' || event.key === ' ') {
                                                    event.preventDefault();
                                                    event.stopPropagation();
                                                    onEditAppointment(appointment);
                                                }
                                            }}
                                            className={`block w-full truncate rounded border-l-[3px] px-1 py-0.5 text-[10px] font-semibold leading-tight transition-colors ${mineChipClass(appointment)}`}
                                            title={chipTooltip(appointment, t('projects.cal_this_order'))}
                                        >
                                            <span className="tabular-nums">{time}</span>
                                            {attendees ? ` ${attendees}` : appointment.notes ? ` ${appointment.notes}` : ''}
                                        </span>
                                    );
                                })}
                                {overflow > 0 && (
                                    <span className="px-1 text-[9.5px] font-semibold text-slate-500">+{overflow}</span>
                                )}
                            </span>
                        </button>
                    );
                })}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 px-3 py-2 text-[11px] text-slate-500">
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-[#272f67]/80 dark:bg-white/60" />{t('projects.cal_this_order')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />{t('projects.flow.stateCompleted')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-slate-300 dark:bg-white/25" />{t('projects.cal_others')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-sm bg-rose-400/70 dark:bg-rose-400/40" />{t('projects.cal_full')}
                </span>
                <span className="ml-auto hidden text-slate-400 sm:inline">{t('projects.cal_hint')}</span>
            </div>
        </Card>
    );
};
