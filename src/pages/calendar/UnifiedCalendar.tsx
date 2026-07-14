import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { maintenanceApi } from '../../lib/api/maintenance';
import { projectApi } from '../../lib/api/project';
import { getRoleProfile } from '../../lib/access';
import { useAuthStore } from '../../store/authStore';
import { ensureMaintenanceLocale } from '../maintenance/MaintenanceShared';
import { EventDetailModal } from './EventDetailModal';

import { t } from '@/i18n/translate';
import { localizeTenderNumber } from '@/utils/tenderNumber';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

dayjs.extend(isoWeek);

type CalendarView = 'day' | 'week' | 'month' | 'year';
export type CalendarCategory = 'orders' | 'maintenance';

// A person shown in the popup's "participants" list. `tag` is a translation-key
// suffix (calendar.detail.tag*) so lead / alternative / technician stay localised.
export type Participant = {
    id?: string;
    name: string;
    tag: 'lead' | 'alternative' | 'technician';
    role?: string | null;
    email?: string | null;
    phone?: string | null;
};

// Normalised detail payload rendered by EventDetailModal. Fetched lazily when an
// event is clicked (via CalendarEvent.loadDetail) so the calendar list itself
// stays lightweight — the grid only needs the summary fields below.
export type EventDetail = {
    status?: string | null;
    notes?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    participants: Participant[];
    // orders / installation
    projectName?: string | null;
    manager?: string | null;
    orderNumber?: string | null;
    orderTotal?: number | null;
    tenderNumber?: string | null;
    // maintenance
    contractTitle?: string | null;
    contractCode?: string | null;
    siteName?: string | null;
    period?: string | null;
};

export type CalendarEvent = {
    id: string;
    category: CalendarCategory;
    title: string;
    subtitle?: string;
    meta?: string;
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
    allDay: boolean;
    navigateTo?: string;
    // Lazily fetches the popup detail when the event is clicked. Undefined events
    // (none currently) simply render header-only.
    loadDetail?: () => Promise<EventDetail>;
};

// Vibrant, high-contrast palette — one clear colour per category. No dots anywhere.
const CATEGORY_STYLE: Record<CalendarCategory, {
    swatch: string;       // filter square
    block: string;        // solid timed block (day / week)
    bar: string;          // all-day bar
    chip: string;         // month cell row
    accentBorder: string; // left accent for chips
}> = {
    orders: {
        swatch: 'bg-blue-600',
        block: 'bg-blue-600 text-white ring-blue-700 hover:bg-blue-700',
        bar: 'bg-blue-600 text-white hover:bg-blue-700',
        chip: 'bg-blue-50 text-blue-800 hover:bg-blue-100',
        accentBorder: 'border-l-blue-600',
    },
    maintenance: {
        swatch: 'bg-amber-500',
        block: 'bg-amber-500 text-white ring-amber-600 hover:bg-amber-600',
        bar: 'bg-amber-500 text-white hover:bg-amber-600',
        chip: 'bg-amber-50 text-amber-800 hover:bg-amber-100',
        accentBorder: 'border-l-amber-500',
    },
};

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const HOUR_HEIGHT = 48; // px per hour in the time grid
const dayKey = (value: dayjs.Dayjs) => value.format('YYYY-MM-DD');
const minutesOf = (value: dayjs.Dayjs) => value.hour() * 60 + value.minute();

const viewRange = (view: CalendarView, anchor: dayjs.Dayjs) => {
    if (view === 'day') return { start: anchor.startOf('day'), end: anchor.endOf('day') };
    if (view === 'week') {
        const start = anchor.startOf('isoWeek');
        return { start, end: start.add(6, 'day').endOf('day') };
    }
    if (view === 'month') {
        const gridStart = anchor.startOf('month').startOf('isoWeek');
        return { start: gridStart, end: gridStart.add(41, 'day').endOf('day') };
    }
    return { start: anchor.startOf('year'), end: anchor.endOf('year') };
};

// Greedy column layout so overlapping events sit side by side.
type Positioned = { event: CalendarEvent; top: number; height: number; left: number; width: number };
const positionEvents = (events: CalendarEvent[]): Positioned[] => {
    const sorted = [...events].sort(
        (a, b) => a.start.valueOf() - b.start.valueOf() || b.end.valueOf() - a.end.valueOf(),
    );
    const out: Positioned[] = [];
    let cluster: CalendarEvent[] = [];
    let clusterEnd = -Infinity;

    const flush = () => {
        if (cluster.length === 0) return;
        const colEnds: number[] = [];
        const colOf = new Map<string, number>();
        cluster.forEach((ev) => {
            let col = colEnds.findIndex((end) => ev.start.valueOf() >= end);
            if (col === -1) {
                col = colEnds.length;
                colEnds.push(ev.end.valueOf());
            } else {
                colEnds[col] = ev.end.valueOf();
            }
            colOf.set(ev.id, col);
        });
        const total = colEnds.length;
        cluster.forEach((ev) => {
            const startMin = minutesOf(ev.start);
            const endMin = ev.end.isAfter(ev.start.endOf('day')) ? 24 * 60 : Math.max(minutesOf(ev.end), startMin + 30);
            const col = colOf.get(ev.id) ?? 0;
            out.push({
                event: ev,
                top: (startMin / 60) * HOUR_HEIGHT,
                height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, 22),
                left: (col / total) * 100,
                width: (1 / total) * 100,
            });
        });
        cluster = [];
        clusterEnd = -Infinity;
    };

    sorted.forEach((ev) => {
        if (cluster.length > 0 && ev.start.valueOf() >= clusterEnd) flush();
        cluster.push(ev);
        clusterEnd = Math.max(clusterEnd, ev.end.valueOf());
    });
    flush();
    return out;
};

const personName = (person?: { firstName?: string; lastName?: string } | null) =>
    person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '';

// Drop blanks and repeats (a lead technician may also appear in the assignment
// list) keeping the first occurrence so lead/alternative tags win.
const dedupeParticipants = (list: Participant[]): Participant[] => {
    const seen = new Set<string>();
    const out: Participant[] = [];
    for (const person of list) {
        const key = person.id || person.name;
        if (!person.name || seen.has(key)) continue;
        seen.add(key);
        out.push(person);
    }
    return out;
};

// True when the current user is a technician assigned to this appointment (lead or
// co-technician). Such users open their own installation task screen even if they
// also hold manager permissions — the order stays editable on the project screen
// only for managers who are not assigned to the job.
const isAssignedTechnician = (appt: any, userId?: string | null) =>
    Boolean(userId) && (
        appt.assignedTechnician?.id === userId ||
        (appt.technicianAssignments || []).some((a: any) => a?.technician?.id === userId)
    );

// The lead technician sits first; assignment-list members follow. Works on both
// the trimmed list payload (names only, feeding the grid meta line) and the full
// detail payload (emails / phones / roles, feeding the popup participants list).
const orderParticipants = (appt: any): Participant[] => dedupeParticipants([
    ...(appt.assignedTechnician
        ? [{
            id: appt.assignedTechnician.id,
            name: personName(appt.assignedTechnician),
            tag: 'lead' as const,
            role: appt.assignedTechnician.roleName,
            email: appt.assignedTechnician.email,
            phone: appt.assignedTechnician.phone,
        }]
        : []),
    ...(appt.technicianAssignments || [])
        .map((a: any) => a.technician)
        .filter(Boolean)
        .map((tech: any) => ({
            id: tech.id,
            name: personName(tech),
            tag: 'technician' as const,
            role: tech.roleName,
            email: tech.email,
            phone: tech.phone,
        })),
]);

const maintenanceParticipants = (task: any): Participant[] => dedupeParticipants([
    ...(task.technician
        ? [{ id: task.technician.id, name: personName(task.technician), tag: 'lead' as const, role: task.technician.roleName, email: task.technician.email, phone: task.technician.phone }]
        : []),
    ...(task.alternativeTechnician
        ? [{ id: task.alternativeTechnician.id, name: personName(task.alternativeTechnician), tag: 'alternative' as const, role: task.alternativeTechnician.roleName, email: task.alternativeTechnician.email, phone: task.alternativeTechnician.phone }]
        : []),
    ...(task.assignments || [])
        .map((a: any) => a.technician)
        .filter(Boolean)
        .map((tech: any) => ({ id: tech.id, name: personName(tech), tag: 'technician' as const, role: tech.roleName, email: tech.email, phone: tech.phone })),
]);

// Map the lazily-fetched detail payloads to the popup's normalised EventDetail.
const buildOrderDetail = (appt: any): EventDetail => ({
    status: appt.status,
    notes: appt.notes,
    customerName: appt.project?.customer?.companyName,
    customerEmail: appt.project?.customer?.mainEmail,
    customerPhone: appt.project?.customer?.mainPhone,
    customerAddress: appt.project?.customer?.address,
    participants: orderParticipants(appt),
    projectName: appt.project?.projectName,
    manager: personName(appt.project?.manager) || undefined,
    orderNumber: appt.salesOrder?.orderNumber,
    orderTotal: appt.salesOrder?.totalAmount ?? null,
    tenderNumber: (() => {
        const raw = appt.salesOrder?.tender?.tenderNumber ?? appt.project?.tender?.tenderNumber ?? null;
        return raw ? localizeTenderNumber(raw) : null;
    })(),
});

const buildMaintenanceDetail = (task: any): EventDetail => ({
    status: task.status,
    customerName: task.contract?.customer?.companyName,
    customerEmail: task.contract?.customer?.mainEmail,
    customerPhone: task.contract?.customer?.mainPhone,
    customerAddress: task.contract?.customer?.address,
    participants: maintenanceParticipants(task),
    contractTitle: task.contract?.title,
    contractCode: task.contract?.contractCode,
    siteName: task.siteName || task.contract?.siteName,
    period: task.contract?.period,
});

export const UnifiedCalendar = () => {
    ensureMaintenanceLocale();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const user = useAuthStore((state) => state.user);
    const userId = user?.id;

    const [view, setView] = useState<CalendarView>('week');
    const [anchor, setAnchor] = useState(() => dayjs());
    const [selectedDay, setSelectedDay] = useState(() => dayjs());
    const [enabled, setEnabled] = useState<Record<CalendarCategory, boolean>>({ orders: true, maintenance: true });
    const [events, setEvents] = useState<CalendarEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(() => dayjs());
    const [activeEvent, setActiveEvent] = useState<CalendarEvent | null>(null);

    useEffect(() => {
        const id = window.setInterval(() => setNow(dayjs()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const has = useCallback((perm: string) => permissions.includes(perm), [permissions]);
    // Technicians must only ever see their own assigned tasks, never the whole
    // tenant's — even if they also carry a manager-level view permission. The
    // "all *" sources are therefore gated behind not being a technician so a
    // technician always falls through to the self-scoped endpoints below.
    const isTechnician = useMemo(() => getRoleProfile(user) === 'technician', [user]);
    const canAllOrders = !isTechnician && (has('projects.view') || has('projects.manage'));
    const canMyInstallations = has('projects.report');
    const canAllMaintenance = !isTechnician && has('maintenance.contracts.manage');
    const canMyMaintenance = has('maintenance.tasks.manage') || has('maintenance.reports.manage');

    const range = useMemo(() => viewRange(view, anchor), [view, anchor]);

    const load = useCallback(async () => {
        setLoading(true);
        const start = range.start.format('YYYY-MM-DD');
        const end = range.end.format('YYYY-MM-DD');

        const orderSource = canAllOrders
            ? projectApi.listAppointments(start, end, { calendar: true })
            : canMyInstallations
                ? projectApi.listMyInstallations(start, end, { calendar: true })
                : null;
        const maintenanceSource = canAllMaintenance
            ? maintenanceApi.listTasks(start, end, { calendar: true })
            : canMyMaintenance
                ? maintenanceApi.listMyTasks(start, end, { calendar: true })
                : null;
        const maintenanceDetail = canAllMaintenance ? '/maintenance/tasks' : '/maintenance/technician/tasks';
        // The popup fetches full detail on click via the appropriate single-item
        // endpoint (manager vs technician scope mirrors the list source above).
        const fetchOrderDetail = canAllOrders ? projectApi.getAppointmentDetail : projectApi.getMyInstallationDetail;
        const fetchMaintenanceDetail = canAllMaintenance ? maintenanceApi.getTaskDetail : maintenanceApi.getMyTaskDetail;

        const [orderResult, maintenanceResult] = await Promise.allSettled([
            orderSource ?? Promise.resolve([]),
            maintenanceSource ?? Promise.resolve([]),
        ]);

        const collected: CalendarEvent[] = [];

        if (orderResult.status === 'fulfilled') {
            (orderResult.value as any[]).forEach((appt) => {
                const startTime = dayjs(appt.startTime);
                const endTime = appt.endTime ? dayjs(appt.endTime) : startTime.add(1, 'hour');
                const orderNumber = appt.salesOrder?.orderNumber;
                const customer = appt.project?.customer?.companyName;
                // Technician names for the compact chip meta line (names are present
                // in the trimmed list payload; contacts arrive with the popup fetch).
                const techs = orderParticipants(appt).map((p) => p.name);
                // Admins/managers edit the order on the project admin screen; technicians
                // open their own installation task screen.
                const projectId = appt.project?.id;
                const appointmentId = appt.id;
                collected.push({
                    id: `order-${appt.id}`,
                    category: 'orders',
                    title: customer || (orderNumber ? t('calendar.order', { number: localizeTenderNumbersInText(orderNumber) }) : t('calendar.orders')),
                    subtitle: orderNumber ? t('calendar.order', { number: localizeTenderNumbersInText(orderNumber) }) : undefined,
                    meta: techs.length ? `${t('calendar.technician')}: ${techs.join(', ')}` : undefined,
                    start: startTime,
                    end: endTime,
                    allDay: false,
                    navigateTo: isAssignedTechnician(appt, userId)
                        ? `/projects/installation/tasks/${appt.id}`
                        : canAllOrders && projectId
                            ? `/projects/${projectId}`
                            : `/projects/installation/tasks/${appt.id}`,
                    loadDetail: () => fetchOrderDetail(appointmentId).then(buildOrderDetail),
                });
            });
        }

        if (maintenanceResult.status === 'fulfilled') {
            (maintenanceResult.value as any[]).forEach((task) => {
                const hasTime = Boolean(task.scheduledStartTime);
                const startTime = dayjs(task.scheduledStartTime || task.plannedDate);
                const endTime = task.scheduledEndTime ? dayjs(task.scheduledEndTime) : startTime.add(1, 'hour');
                const tech = maintenanceParticipants(task)[0]?.name || null;
                const taskId = task.id;
                collected.push({
                    id: `maintenance-${task.id}`,
                    category: 'maintenance',
                    title: task.contract?.customer?.companyName || task.contract?.title || t('calendar.maintenance'),
                    subtitle: task.contract?.contractCode || undefined,
                    meta: tech ? `${t('calendar.technician')}: ${tech}` : undefined,
                    start: startTime,
                    end: endTime,
                    allDay: !hasTime,
                    navigateTo: `${maintenanceDetail}/${task.id}`,
                    loadDetail: () => fetchMaintenanceDetail(taskId).then(buildMaintenanceDetail),
                });
            });
        }

        setEvents(collected);
        setLoading(false);
    }, [range.start.valueOf(), range.end.valueOf(), userId, canAllOrders, canMyInstallations, canAllMaintenance, canMyMaintenance]);

    useEffect(() => {
        void load();
    }, [load]);

    const visibleEvents = useMemo(() => events.filter((event) => enabled[event.category]), [events, enabled]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalendarEvent[]>();
        visibleEvents.forEach((event) => {
            const key = dayKey(event.start);
            map.set(key, [...(map.get(key) || []), event]);
        });
        map.forEach((list) => list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.valueOf() - b.start.valueOf()));
        return map;
    }, [visibleEvents]);

    const step = (direction: 1 | -1) => {
        const unit = view === 'day' ? 'day' : view === 'week' ? 'week' : view === 'month' ? 'month' : 'year';
        setAnchor((current) => current.add(direction, unit));
    };

    const goToday = () => {
        const today = dayjs();
        setAnchor(today);
        setSelectedDay(today);
    };

    const openDay = (day: dayjs.Dayjs) => {
        setSelectedDay(day);
        setAnchor(day);
        setView('day');
    };

    const pickDay = (day: dayjs.Dayjs) => {
        setSelectedDay(day);
        setAnchor(day);
    };

    // Clicking an event opens the detail popup; the popup itself offers a button
    // to jump to the full order / task screen via navigateTo.
    const openEvent = (event: CalendarEvent) => {
        setActiveEvent(event);
    };

    const openEventFull = (event: CalendarEvent) => {
        setActiveEvent(null);
        if (event.navigateTo) navigate(event.navigateTo);
    };

    const periodLabel = useMemo(() => {
        if (view === 'day') return anchor.format('dddd, DD MMMM YYYY');
        if (view === 'week') return `${range.start.format('DD MMM')} – ${range.end.format('DD MMM YYYY')}`;
        if (view === 'month') return anchor.format('MMMM YYYY');
        return anchor.format('YYYY');
    }, [view, anchor, range.start, range.end]);

    const views: Array<{ key: CalendarView; label: string }> = [
        { key: 'day', label: t('calendar.day') },
        { key: 'week', label: t('calendar.week') },
        { key: 'month', label: t('calendar.month') },
        { key: 'year', label: t('calendar.year') },
    ];

    return (
        <div>
            <PageHeader
                breadcrumb={t('calendar.breadcrumb')}
                title={t('calendar.title')}
                description={t('calendar.description')}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 bg-white">
                            <button type="button" className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50" onClick={() => step(-1)}><ChevronLeft size={15} /></button>
                            <button type="button" className="h-8 border-x border-slate-200 px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50" onClick={goToday}>{t('calendar.today')}</button>
                            <button type="button" className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50" onClick={() => step(1)}><ChevronRight size={15} /></button>
                        </div>
                        <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
                            {views.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setView(item.key)}
                                    className={`rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors ${view === item.key ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'}`}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    </div>
                }
            />

            <div className="mb-3 text-[13px] font-semibold capitalize text-slate-700">{periodLabel}</div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_288px]">
                <Card noPadding className="overflow-hidden">
                    {loading ? (
                        <div className="m-4 h-[560px] animate-pulse rounded-lg bg-slate-100" />
                    ) : view === 'day' ? (
                        <TimeGrid days={[anchor]} eventsByDay={eventsByDay} now={now} onOpenEvent={openEvent} onOpenDay={openDay} />
                    ) : view === 'week' ? (
                        <TimeGrid days={Array.from({ length: 7 }, (_, i) => range.start.add(i, 'day'))} eventsByDay={eventsByDay} now={now} onOpenEvent={openEvent} onOpenDay={openDay} />
                    ) : view === 'month' ? (
                        <MonthView anchor={anchor} range={range} eventsByDay={eventsByDay} selectedDay={selectedDay} now={now} onSelectDay={pickDay} onOpenDay={openDay} onOpenEvent={openEvent} />
                    ) : (
                        <YearView anchor={anchor} eventsByDay={eventsByDay} now={now} onOpenDay={openDay} />
                    )}
                </Card>

                <aside className="flex h-fit flex-col gap-4">
                    <MiniCalendar anchor={anchor} selectedDay={selectedDay} now={now} eventsByDay={eventsByDay} onPickDay={pickDay} />
                    <FilterPanel enabled={enabled} onToggle={(key) => setEnabled((cur) => ({ ...cur, [key]: !cur[key] }))} />
                </aside>
            </div>

            <EventDetailModal
                event={activeEvent}
                onClose={() => setActiveEvent(null)}
                onOpenFull={openEventFull}
            />
        </div>
    );
};

const TimeBlock = ({ position, onOpen }: { position: Positioned; onOpen: (event: CalendarEvent) => void }) => {
    const { event } = position;
    const style = CATEGORY_STYLE[event.category];
    const compact = position.height < 36;
    return (
        <button
            type="button"
            onClick={() => onOpen(event)}
            disabled={!event.navigateTo}
            style={{ top: position.top, height: position.height, left: `calc(${position.left}% + 2px)`, width: `calc(${position.width}% - 4px)` }}
            className={`absolute z-10 flex flex-col overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm ring-1 transition-colors ${style.block} ${event.navigateTo ? 'cursor-pointer' : 'cursor-default'}`}
            title={`${event.start.format('HH:mm')} – ${event.end.format('HH:mm')} · ${event.title}`}
        >
            <span className="truncate font-semibold">{event.title}</span>
            {!compact && (
                <span className="truncate text-[10px] font-medium text-white/85">
                    {event.start.format('HH:mm')}–{event.end.format('HH:mm')}{event.subtitle ? ` · ${event.subtitle}` : ''}
                </span>
            )}
        </button>
    );
};

const TimeGrid = ({ days, eventsByDay, now, onOpenEvent, onOpenDay }: {
    days: dayjs.Dayjs[];
    eventsByDay: Map<string, CalendarEvent[]>;
    now: dayjs.Dayjs;
    onOpenEvent: (event: CalendarEvent) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
}) => {
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 7 * HOUR_HEIGHT;
    }, []);

    const today = dayjs();
    const nowTop = (minutesOf(now) / 60) * HOUR_HEIGHT;
    const cols = days.length;
    const allDayByDay = days.map((day) => (eventsByDay.get(dayKey(day)) || []).filter((e) => e.allDay));
    const hasAllDay = allDayByDay.some((list) => list.length > 0);
    // Shared track definition: the gutter + one column per day. Headings, the
    // all-day band and the time grid must all use the exact same template.
    const gridTemplateColumns = `56px repeat(${cols}, minmax(0, 1fr))`;

    return (
        // Headings, all-day band and the grid live inside one scroll container so
        // the vertical day borders line up — the scrollbar narrows them together.
        <div ref={scrollRef} className="max-h-[600px] overflow-y-auto">
            <div className="sticky top-0 z-30 bg-white">
                {/* Day headings */}
                <div className="grid border-b border-slate-200 bg-slate-50/70" style={{ gridTemplateColumns }}>
                <div />
                {days.map((day) => {
                    const isToday = dayKey(day) === dayKey(today);
                    return (
                        <button
                            key={dayKey(day)}
                            type="button"
                            onClick={() => onOpenDay(day)}
                            className="flex flex-col items-center gap-0.5 border-l border-slate-200 py-2 hover:bg-slate-100/70"
                        >
                            <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{day.format('ddd')}</span>
                            <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[14px] font-semibold ${isToday ? 'bg-blue-600 text-white' : 'text-slate-800'}`}>
                                {day.format(cols === 1 ? 'DD MMM' : 'DD')}
                            </span>
                        </button>
                    );
                })}
            </div>

            {/* All-day band */}
            {hasAllDay && (
                <div className="grid border-b border-slate-200 bg-white" style={{ gridTemplateColumns }}>
                    <div className="flex items-center justify-end pr-2 text-[10px] font-medium uppercase text-slate-400">{t('calendar.allDay')}</div>
                    {days.map((day, index) => (
                        <div key={dayKey(day)} className="space-y-1 border-l border-slate-100 p-1">
                            {allDayByDay[index].map((event) => {
                                const style = CATEGORY_STYLE[event.category];
                                return (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => onOpenEvent(event)}
                                        disabled={!event.navigateTo}
                                        className={`block w-full truncate rounded-md px-2 py-1 text-left text-[11px] font-semibold transition-colors ${style.bar} ${event.navigateTo ? '' : 'cursor-default'}`}
                                    >
                                        {event.title}
                                    </button>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
            </div>

            {/* Time grid */}
            <div className="grid" style={{ gridTemplateColumns }}>
                    {/* Hour gutter */}
                    <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                        {HOURS.map((hour) => (
                            <div key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400" style={{ top: hour * HOUR_HEIGHT }}>
                                {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                            </div>
                        ))}
                    </div>
                    {/* Day columns */}
                    {days.map((day) => {
                        const timed = (eventsByDay.get(dayKey(day)) || []).filter((e) => !e.allDay);
                        const positioned = positionEvents(timed);
                        const isToday = dayKey(day) === dayKey(today);
                        return (
                            <div key={dayKey(day)} className="relative border-l border-slate-200" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                                {HOURS.map((hour) => (
                                    <div key={hour} className="absolute inset-x-0 border-t border-slate-100" style={{ top: hour * HOUR_HEIGHT }} />
                                ))}
                                {isToday && (
                                    <div className="absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
                                        <span className="rounded-r bg-red-500 px-1 py-px text-[9px] font-bold text-white">{now.format('HH:mm')}</span>
                                        <span className="h-px flex-1 bg-red-500" />
                                    </div>
                                )}
                                {positioned.map((position) => (
                                    <TimeBlock key={position.event.id} position={position} onOpen={onOpenEvent} />
                                ))}
                            </div>
                        );
                    })}
                </div>
            </div>
        );
};

const MonthView = ({ anchor, range, eventsByDay, selectedDay, now, onSelectDay, onOpenDay, onOpenEvent }: {
    anchor: dayjs.Dayjs;
    range: { start: dayjs.Dayjs; end: dayjs.Dayjs };
    eventsByDay: Map<string, CalendarEvent[]>;
    selectedDay: dayjs.Dayjs;
    now: dayjs.Dayjs;
    onSelectDay: (day: dayjs.Dayjs) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
    onOpenEvent: (event: CalendarEvent) => void;
}) => {
    const days = Array.from({ length: 42 }, (_, index) => range.start.add(index, 'day'));
    const weekDays = Array.from({ length: 7 }, (_, index) => range.start.add(index, 'day').format('ddd'));
    return (
        <div>
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/70 text-center text-[11px] font-semibold uppercase capitalize text-slate-400">
                {weekDays.map((day) => <div key={day} className="border-r border-slate-200 py-2 last:border-r-0">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
                {days.map((day) => {
                    const key = dayKey(day);
                    const dayEvents = eventsByDay.get(key) || [];
                    const isSelected = key === dayKey(selectedDay);
                    const isToday = key === dayKey(now);
                    const outside = day.month() !== anchor.month();
                    return (
                        <div
                            key={key}
                            onClick={() => onSelectDay(day)}
                            className={`min-h-[120px] cursor-pointer border-b border-r border-slate-200 p-1.5 align-top transition-colors last:border-r-0 hover:bg-slate-50 ${isSelected ? 'bg-blue-50/60' : outside ? 'bg-slate-50/40' : 'bg-white'}`}
                        >
                            <div className="mb-1 flex items-center justify-end">
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onOpenDay(day); }}
                                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold transition-colors hover:bg-slate-100 ${isToday ? 'bg-blue-600 text-white hover:bg-blue-700' : outside ? 'text-slate-300' : 'text-slate-700'}`}
                                >
                                    {day.date()}
                                </button>
                            </div>
                            <div className="space-y-1">
                                {dayEvents.slice(0, 3).map((event) => {
                                    const style = CATEGORY_STYLE[event.category];
                                    return (
                                        <button
                                            key={event.id}
                                            type="button"
                                            onClick={(e) => { e.stopPropagation(); onOpenEvent(event); }}
                                            disabled={!event.navigateTo}
                                            className={`block w-full truncate rounded border-l-[3px] px-1.5 py-0.5 text-left text-[11px] font-medium leading-tight transition-colors ${style.chip} ${style.accentBorder} ${event.navigateTo ? '' : 'cursor-default'}`}
                                        >
                                            {!event.allDay && <span className="tabular-nums">{event.start.format('HH:mm')} </span>}{event.title}
                                        </button>
                                    );
                                })}
                                {dayEvents.length > 3 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onOpenDay(day); }}
                                        className="px-1.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800"
                                    >
                                        {t('calendar.more', { count: dayEvents.length - 3 })}
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const YearView = ({ anchor, eventsByDay, now, onOpenDay }: {
    anchor: dayjs.Dayjs;
    eventsByDay: Map<string, CalendarEvent[]>;
    now: dayjs.Dayjs;
    onOpenDay: (day: dayjs.Dayjs) => void;
}) => {
    const months = Array.from({ length: 12 }, (_, index) => anchor.startOf('year').add(index, 'month'));
    const heat = (count: number) => {
        if (count === 0) return '';
        if (count === 1) return 'bg-blue-100 text-blue-900';
        if (count <= 3) return 'bg-blue-300 text-blue-950';
        return 'bg-blue-600 text-white';
    };
    return (
        <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {months.map((month) => {
                const gridStart = month.startOf('month').startOf('isoWeek');
                const days = Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
                return (
                    <div key={month.format('YYYY-MM')} className="rounded-lg border border-slate-200 p-2">
                        <div className="mb-1.5 px-1 text-[12px] font-semibold capitalize text-slate-800">{month.format('MMMM')}</div>
                        <div className="grid grid-cols-7 gap-0.5">
                            {days.map((day) => {
                                const key = dayKey(day);
                                const count = (eventsByDay.get(key) || []).length;
                                const outside = day.month() !== month.month();
                                const isToday = key === dayKey(now);
                                return (
                                    <button
                                        key={key}
                                        type="button"
                                        onClick={() => onOpenDay(day)}
                                        className={`flex h-6 items-center justify-center rounded text-[10px] font-medium transition-colors hover:ring-1 hover:ring-blue-400 ${outside ? 'text-slate-300' : heat(outside ? 0 : count) || 'text-slate-600'} ${isToday ? 'ring-2 ring-red-500' : ''}`}
                                    >
                                        {day.date()}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

const MiniCalendar = ({ anchor, selectedDay, now, eventsByDay, onPickDay }: {
    anchor: dayjs.Dayjs;
    selectedDay: dayjs.Dayjs;
    now: dayjs.Dayjs;
    eventsByDay: Map<string, CalendarEvent[]>;
    onPickDay: (day: dayjs.Dayjs) => void;
}) => {
    const [cursor, setCursor] = useState(() => anchor.startOf('month'));
    useEffect(() => { setCursor(anchor.startOf('month')); }, [anchor.format('YYYY-MM')]); // eslint-disable-line react-hooks/exhaustive-deps

    const gridStart = cursor.startOf('month').startOf('isoWeek');
    const days = Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
    const weekDays = Array.from({ length: 7 }, (_, index) => gridStart.add(index, 'day').format('dd'));

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <div className="mb-2 flex items-center justify-between">
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setCursor((c) => c.subtract(1, 'month'))}><ChevronLeft size={15} /></button>
                <span className="text-[13px] font-semibold capitalize text-slate-800">{cursor.format('MMMM YYYY')}</span>
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => setCursor((c) => c.add(1, 'month'))}><ChevronRight size={15} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-slate-400">
                {weekDays.map((day, index) => <div key={`${day}-${index}`} className="py-1">{day}</div>)}
            </div>
            <div className="grid grid-cols-7 gap-0.5">
                {days.map((day) => {
                    const key = dayKey(day);
                    const isSelected = key === dayKey(selectedDay);
                    const isToday = key === dayKey(now);
                    const outside = day.month() !== cursor.month();
                    const hasEvents = (eventsByDay.get(key) || []).length > 0;
                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onPickDay(day)}
                            className={`flex h-7 items-center justify-center rounded-md text-[11px] font-medium transition-colors ${isSelected ? 'bg-blue-600 text-white' : isToday ? 'bg-blue-50 text-blue-700' : outside ? 'text-slate-300 hover:bg-slate-100' : `text-slate-700 hover:bg-slate-100 ${hasEvents ? 'font-bold' : ''}`}`}
                        >
                            {day.date()}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const FilterPanel = ({ enabled, onToggle }: {
    enabled: Record<CalendarCategory, boolean>;
    onToggle: (key: CalendarCategory) => void;
}) => {
    const items: Array<{ key: CalendarCategory; label: string }> = [
        { key: 'orders', label: t('calendar.orders') },
        { key: 'maintenance', label: t('calendar.maintenance') },
    ];
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
            <h3 className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{t('calendar.filters')}</h3>
            <div className="space-y-1">
                {items.map((item) => {
                    const active = enabled[item.key];
                    const style = CATEGORY_STYLE[item.key];
                    return (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => onToggle(item.key)}
                            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50"
                        >
                            <span className={`flex h-4 w-4 items-center justify-center rounded-[5px] transition-colors ${active ? style.swatch : 'border border-slate-300 bg-white'}`}>
                                {active && <span className="h-1.5 w-1.5 rounded-[2px] bg-white" />}
                            </span>
                            <span className={`text-[13px] font-medium ${active ? 'text-slate-800' : 'text-slate-400'}`}>{item.label}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
