/* RETIRED 18.08.2026 — the project's appointment section is the calendar page
   now (see booking/AppointmentList.tsx). Kept for reference only: nothing
   imports this file any more.
   ------------------------------------------------------------------------ */
import { useMemo } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { ChevronLeft, ChevronRight, Mail01 as Mail, Plus } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { ensureMaintenanceLocale } from '../../../../../../maintenance/MaintenanceShared';
import { t } from '@/i18n/translate';
import type { PersonLite } from '@/types/maintenance';

import {
    SCHEDULE_END_HOUR,
    SCHEDULE_START_HOUR,
    appointmentStatusKind,
    dayKey,
    leadInstallerName,
    type CalendarView,
} from './scheduleShared';

dayjs.extend(isoWeek);

const HOUR_HEIGHT = 40;
const BAND_MINUTES = (SCHEDULE_END_HOUR - SCHEDULE_START_HOUR) * 60;

type CalendarEvent = {
    appointment: any;
    mine: boolean;
};

// Entry palette: flat fills that cover the whole slot (see .ofi-cal-chip-* in
// index.css / dark.css) — this order's plans in the brand navy (wheat in dark),
// completed in green, the rest of the tenant muted.
const chipClass = (event: CalendarEvent) => {
    const kind = appointmentStatusKind(event.appointment);
    if (kind === 'completed') return 'ofi-cal-chip-done';
    if (kind === 'cancelled') return 'ofi-cal-chip-cancelled';
    if (!event.mine) return 'ofi-cal-chip-other';
    return 'ofi-cal-chip-mine';
};

// Greedy side-by-side layout for overlapping blocks in one day column.
const layoutDayEvents = (events: CalendarEvent[]) => {
    const sorted = [...events].sort(
        (a, b) => dayjs(a.appointment.startTime).valueOf() - dayjs(b.appointment.startTime).valueOf(),
    );
    const lanes: number[] = []; // end time (ms) of the last event per lane
    const placed = sorted.map((event) => {
        const start = dayjs(event.appointment.startTime).valueOf();
        const end = Math.max(dayjs(event.appointment.endTime).valueOf(), start + 15 * 60_000);
        let lane = lanes.findIndex((laneEnd) => laneEnd <= start);
        if (lane === -1) {
            lane = lanes.length;
            lanes.push(end);
        } else {
            lanes[lane] = end;
        }
        return { event, lane };
    });
    return { placed, laneCount: Math.max(1, lanes.length) };
};

const minutesIntoBand = (iso: string) => {
    const time = dayjs(iso);
    const minutes = time.hour() * 60 + time.minute() - SCHEDULE_START_HOUR * 60;
    return Math.max(0, Math.min(BAND_MINUTES, minutes));
};

export const ScheduleCalendar = ({
    view,
    onViewChange,
    cursor,
    onCursorChange,
    appointments,
    otherAppointments,
    technicians,
    technicianFilter,
    onTechnicianFilter,
    clientLabel,
    onCreate,
    onSendMail,
    onDayClick,
    onAppointmentClick,
}: {
    view: CalendarView;
    onViewChange: (view: CalendarView) => void;
    /** First day of the visible period (any day inside it works). */
    cursor: string;
    onCursorChange: (isoDate: string) => void;
    /** This order's plans. */
    appointments: any[];
    /** The rest of the tenant's plans in the visible range (already deduped). */
    otherAppointments: any[];
    technicians: PersonLite[];
    technicianFilter: string;
    onTechnicianFilter: (id: string) => void;
    clientLabel: (appointment: any) => string;
    onCreate: () => void;
    onSendMail: () => void;
    onDayClick: (date: string) => void;
    onAppointmentClick: (appointment: any) => void;
}) => {
    ensureMaintenanceLocale();
    const cursorDay = dayjs(cursor);
    const today = dayjs();

    const events = useMemo<CalendarEvent[]>(
        () => [
            ...appointments.map((appointment) => ({ appointment, mine: true })),
            ...otherAppointments.map((appointment) => ({ appointment, mine: false })),
        ],
        [appointments, otherAppointments],
    );

    const byDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        events.forEach((event) => {
            const key = dayKey(dayjs(event.appointment.startTime));
            const bucket = map.get(key) || [];
            bucket.push(event);
            map.set(key, bucket);
        });
        map.forEach((bucket) => bucket.sort(
            (a, b) => dayjs(a.appointment.startTime).valueOf() - dayjs(b.appointment.startTime).valueOf(),
        ));
        return map;
    }, [events]);

    const weekStart = cursorDay.startOf('isoWeek');
    const weekDays = useMemo(
        () => Array.from({ length: 7 }, (_, index) => weekStart.add(index, 'day')),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [weekStart.valueOf()],
    );

    const monthGridStart = cursorDay.startOf('month').startOf('isoWeek');
    const monthDays = useMemo(
        () => Array.from({ length: 42 }, (_, index) => monthGridStart.add(index, 'day')),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [monthGridStart.valueOf()],
    );

    const periodLabel = view === 'week'
        ? `${weekStart.format('DD MMM')} – ${weekStart.add(6, 'day').format('DD MMM YYYY')}`
        : cursorDay.format('MMMM YYYY');

    const shift = (direction: 1 | -1) => {
        const next = view === 'week' ? cursorDay.add(direction, 'week') : cursorDay.add(direction, 'month');
        onCursorChange(dayKey(next));
    };

    const hourMarks = Array.from(
        { length: SCHEDULE_END_HOUR - SCHEDULE_START_HOUR },
        (_, index) => SCHEDULE_START_HOUR + index,
    );

    return (
        // Fluid: fills whatever the card gives it, so collapsing the app
        // sidebar lets the calendar grow into the freed space.
        <div className="w-full min-w-0 overflow-x-hidden">
            {/* Header: filters on the left, the period selector dead-centre with
                the create button right beside it. */}
            <div className="mb-4 grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:items-center">
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1 dark:border-white/15 dark:bg-white/5">
                        {(['week', 'month'] as CalendarView[]).map((key) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => onViewChange(key)}
                                className={`h-9 min-w-[78px] rounded-lg px-4 text-[13px] font-semibold transition-colors ${
                                    view === key
                                        ? 'bg-[#272f67] text-white'
                                        : 'text-slate-600 hover:bg-slate-50 dark:text-white/80'
                                }`}
                            >
                                {key === 'week' ? t('projects.schedule.week') : t('projects.schedule.month')}
                            </button>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => onCursorChange(dayKey(today))}
                        className="h-10 rounded-[10px] border border-slate-200 bg-white px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/80"
                    >
                        {t('projects.schedule.today')}
                    </button>
                    <select
                        value={technicianFilter}
                        onChange={(event) => onTechnicianFilter(event.target.value)}
                        className="h-10 max-w-full rounded-[10px] border border-slate-200 bg-white px-3 text-[13px] font-medium text-slate-600 outline-none dark:border-white/15"
                        aria-label={t('projects.schedule.allInstallers')}
                    >
                        <option value="">{t('projects.schedule.allInstallers')}</option>
                        {technicians.map((tech) => (
                            <option key={tech.id} value={tech.id}>{tech.firstName} {tech.lastName}</option>
                        ))}
                    </select>
                </div>
                <div className="flex items-center gap-2 xl:justify-self-center">
                    <div className="inline-flex overflow-hidden rounded-[10px] border border-slate-200 bg-white dark:border-white/15">
                        <button
                            type="button"
                            aria-label="previous"
                            className="flex h-10 w-10 items-center justify-center text-slate-500 hover:bg-slate-50"
                            onClick={() => shift(-1)}
                        >
                            <ChevronLeft size={15} />
                        </button>
                        <span className="flex h-10 min-w-[190px] items-center justify-center border-x border-slate-200 px-3 text-[13px] font-bold capitalize text-slate-800 dark:border-white/15">
                            {periodLabel}
                        </span>
                        <button
                            type="button"
                            aria-label="next"
                            className="flex h-10 w-10 items-center justify-center text-slate-500 hover:bg-slate-50"
                            onClick={() => shift(1)}
                        >
                            <ChevronRight size={15} />
                        </button>
                    </div>
                </div>
                {/* Actions on the right edge of the header. */}
                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                    <Button size="md" variant="primary" icon={<Plus size={19} />} onClick={onCreate}>
                        {t('projects.schedule.createAppointment')}
                    </Button>
                    <Button size="md" variant="secondary" icon={<Mail size={14} />} onClick={onSendMail}>
                        {t('projects.schedule.sendEmail')}
                    </Button>
                </div>
            </div>

            {view === 'week' ? (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/12">
                    {/* Day header row — no hour gutter: the entries carry their times. */}
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 dark:border-white/10">
                        {weekDays.map((day) => {
                            const isToday = dayKey(day) === dayKey(today);
                            return (
                                <button
                                    key={dayKey(day)}
                                    type="button"
                                    onClick={() => onDayClick(dayKey(day))}
                                    className="border-l border-slate-100 px-1 py-1.5 text-center transition-colors first:border-l-0 hover:bg-slate-100/70 dark:border-white/8"
                                >
                                    <div className="text-[10.5px] font-semibold uppercase text-slate-400">{day.format('dd')}</div>
                                    <div className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-[12.5px] font-bold ${
                                        isToday ? 'bg-[#272f67] text-white' : 'text-slate-700'
                                    }`}>
                                        {day.date()}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                    {/* Time grid */}
                    <div className="grid grid-cols-7">
                        {weekDays.map((day) => {
                            const key = dayKey(day);
                            const isToday = key === dayKey(today);
                            const { placed, laneCount } = layoutDayEvents(byDay.get(key) || []);
                            return (
                                <div
                                    key={key}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onDayClick(key)}
                                    onKeyDown={(event) => {
                                        if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            onDayClick(key);
                                        }
                                    }}
                                    className={`relative cursor-pointer border-l border-slate-100 transition-colors first:border-l-0 hover:bg-slate-50/60 dark:border-white/8 ${
                                        isToday ? 'bg-[#272f67]/[0.03]' : ''
                                    }`}
                                    style={{ height: BAND_MINUTES / 60 * HOUR_HEIGHT }}
                                >
                                    {hourMarks.slice(1).map((hour) => (
                                        <span
                                            key={hour}
                                            aria-hidden
                                            className="pointer-events-none absolute inset-x-0 border-t border-slate-100 dark:border-white/8"
                                            style={{ top: (hour - SCHEDULE_START_HOUR) * HOUR_HEIGHT }}
                                        />
                                    ))}
                                    {placed.map(({ event, lane }) => {
                                        const { appointment } = event;
                                        const top = minutesIntoBand(appointment.startTime) / 60 * HOUR_HEIGHT;
                                        const bottom = minutesIntoBand(appointment.endTime) / 60 * HOUR_HEIGHT;
                                        const height = Math.max(20, bottom - top);
                                        const width = 100 / laneCount;
                                        return (
                                            <button
                                                key={appointment.id}
                                                type="button"
                                                onClick={(clickEvent) => {
                                                    clickEvent.stopPropagation();
                                                    onAppointmentClick(appointment);
                                                }}
                                                title={`${dayjs(appointment.startTime).format('HH:mm')}–${dayjs(appointment.endTime).format('HH:mm')} · ${clientLabel(appointment)} · ${leadInstallerName(appointment)}`}
                                                className={`absolute overflow-hidden px-1 py-0.5 text-left text-[10px] font-semibold leading-tight transition-colors ${chipClass(event)}`}
                                                style={{
                                                    top,
                                                    height,
                                                    left: `${lane * width}%`,
                                                    width: `${width}%`,
                                                }}
                                            >
                                                <span className="block truncate tabular-nums">{dayjs(appointment.startTime).format('HH:mm')} {clientLabel(appointment)}</span>
                                                {height >= 34 && (
                                                    <span className="block truncate font-medium opacity-80">{leadInstallerName(appointment)}</span>
                                                )}
                                            </button>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/12">
                    <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-[10.5px] font-semibold uppercase text-slate-400 dark:border-white/10">
                        {Array.from({ length: 7 }, (_, index) => monthGridStart.add(index, 'day').format('dd')).map((label, index) => (
                            <div key={`${label}-${index}`} className="border-r border-slate-100 py-1.5 last:border-r-0 dark:border-white/8">{label}</div>
                        ))}
                    </div>
                    <div className="grid grid-cols-7">
                        {monthDays.map((day) => {
                            const key = dayKey(day);
                            const bucket = byDay.get(key) || [];
                            const outside = day.month() !== cursorDay.month();
                            const isToday = key === dayKey(today);
                            // Only the first three plans of the day, simplified;
                            // the rest collapses into a "+N" hint.
                            const visible = bucket.slice(0, 3);
                            const overflow = bucket.length - visible.length;
                            return (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => onDayClick(key)}
                                    className={`flex min-h-[92px] flex-col gap-1 border-b border-r border-slate-100 pb-1 text-left align-top transition-colors last:border-r-0 hover:bg-slate-50 dark:border-white/8 ${
                                        outside ? 'bg-slate-50/50' : 'bg-white'
                                    }`}
                                >
                                    <span className={`mx-1 mt-1 flex h-5 min-w-5 items-center justify-center self-start rounded-full px-1 text-[11px] font-semibold ${
                                        isToday ? 'bg-[#272f67] text-white' : outside ? 'text-slate-300' : 'text-slate-700'
                                    }`}>
                                        {day.date()}
                                    </span>
                                    {/* Entries span the full cell width — flat labels, no box. */}
                                    <span className="flex w-full flex-col gap-px">
                                        {visible.map((event) => (
                                            <span
                                                key={event.appointment.id}
                                                role="button"
                                                tabIndex={0}
                                                onClick={(clickEvent) => {
                                                    clickEvent.stopPropagation();
                                                    onAppointmentClick(event.appointment);
                                                }}
                                                onKeyDown={(keyEvent) => {
                                                    if (keyEvent.key === 'Enter' || keyEvent.key === ' ') {
                                                        keyEvent.preventDefault();
                                                        keyEvent.stopPropagation();
                                                        onAppointmentClick(event.appointment);
                                                    }
                                                }}
                                                title={`${dayjs(event.appointment.startTime).format('HH:mm')}–${dayjs(event.appointment.endTime).format('HH:mm')} · ${clientLabel(event.appointment)}`}
                                                className={`block w-full truncate px-1.5 py-0.5 text-[10px] font-semibold leading-tight transition-colors ${chipClass(event)}`}
                                            >
                                                <span className="tabular-nums">{dayjs(event.appointment.startTime).format('HH:mm')}</span> {clientLabel(event.appointment)}
                                            </span>
                                        ))}
                                        {overflow > 0 && (
                                            <span className="px-1 text-[9.5px] font-semibold text-slate-500">+{overflow}</span>
                                        )}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
