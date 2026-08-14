import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

/* Shared foundation of the calendar module: event model, ranges, layout math,
   status→color mapping and the "recent customers" MRU used by the pickers. */

export type CalendarView = 'day' | 'week' | 'month';
export type CalCategory = 'appointments' | 'maintenance' | 'meetings';

/* Chip color contract (see .ofi-ucal-chip-* in index.css) — flat blocks like
   the project-view calendar (user request 2026-08-07):
   ongoing   → solid navy (the DEFAULT look; window started, not finished)
   planned   → navy OUTLINE on white (upcoming appointment)
   done      → green (appointment whose window is over / completed)
   cancelled → muted, struck through
   meeting   → violet
   maintenance → amber */
export type CalStatus = 'planned' | 'ongoing' | 'done' | 'cancelled' | 'meeting' | 'maintenance';

export type CalParticipant = {
    id?: string;
    name: string;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
};

export type CalEventDetail = {
    status?: string | null;
    notes?: string | null;
    customerName?: string | null;
    customerEmail?: string | null;
    customerPhone?: string | null;
    customerAddress?: string | null;
    participants: CalParticipant[];
    ccEmails?: string[];
    projectName?: string | null;
    manager?: string | null;
    orderNumber?: string | null;
    tenderNumber?: string | null;
    contractTitle?: string | null;
    contractCode?: string | null;
    siteName?: string | null;
    period?: string | null;
};

export type CalEvent = {
    id: string;
    category: CalCategory;
    refId: string;
    title: string;
    subtitle?: string;
    meta?: string;
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
    allDay: boolean;
    status: CalStatus;
    navigateTo?: string;
    /* Prefill context for "create a new appointment like this one". */
    customerId?: string | null;
    customerName?: string | null;
    projectId?: string | null;
    salesOrderId?: string | null;
    loadDetail?: () => Promise<CalEventDetail>;
};

export const dayKey = (value: dayjs.Dayjs) => value.format('YYYY-MM-DD');
export const minutesOf = (value: dayjs.Dayjs) => value.hour() * 60 + value.minute();

export const viewRange = (view: CalendarView, anchor: dayjs.Dayjs) => {
    if (view === 'day') return { start: anchor.startOf('day'), end: anchor.endOf('day') };
    if (view === 'week') {
        const start = anchor.startOf('isoWeek');
        return { start, end: start.add(6, 'day').endOf('day') };
    }
    const gridStart = anchor.startOf('month').startOf('isoWeek');
    return { start: gridStart, end: gridStart.add(41, 'day').endOf('day') };
};

/* Appointment status → chip color. "Past" = the planned window is over OR the
   job is completed → green; a window that has STARTED but not ended → solid
   navy (ongoing); everything still ahead → outlined navy (planned). */
export const appointmentCalStatus = (raw: { status?: string | null }, start: dayjs.Dayjs, end: dayjs.Dayjs): CalStatus => {
    if (raw.status === 'CANCELLED') return 'cancelled';
    if (raw.status === 'COMPLETED' || end.valueOf() < Date.now()) return 'done';
    if (start.valueOf() <= Date.now()) return 'ongoing';
    return 'planned';
};

export const chipClass = (status: CalStatus) => `ofi-ucal-chip ofi-ucal-chip--${status}`;
export const dotClass = (status: CalStatus) => `ofi-ucal-dot ofi-ucal-dot--${status}`;

/* Greedy column layout so overlapping events sit side by side in day/week. */
export type Positioned = { event: CalEvent; top: number; height: number; left: number; width: number };

export const HOUR_HEIGHT = 52; // px per hour in the time grid

export const positionEvents = (events: CalEvent[]): Positioned[] => {
    const sorted = [...events].sort(
        (a, b) => a.start.valueOf() - b.start.valueOf() || b.end.valueOf() - a.end.valueOf(),
    );
    const out: Positioned[] = [];
    let cluster: CalEvent[] = [];
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
                height: Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT - 2, 24),
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

export const personName = (person?: { firstName?: string; lastName?: string } | null) =>
    person ? `${person.firstName || ''} ${person.lastName || ''}`.trim() : '';

/* ---- picker payloads ------------------------------------------------------ */

export type CustomerLite = {
    id: string;
    companyName: string;
    mainEmail?: string | null;
    mainPhone?: string | null;
    city?: string | null;
};

export type EmployeeLite = {
    id: string;
    firstName: string;
    lastName: string;
    email?: string | null;
    roleName?: string | null;
    title?: string | null;
};

/* A row picked in the people/CC modal. EMAIL = free-typed address. */
export type PickedPerson = {
    key: string;
    type: 'EMPLOYEE' | 'CUSTOMER' | 'EMAIL';
    id?: string;
    name: string;
    email?: string | null;
};

export const personKey = (type: PickedPerson['type'], idOrEmail: string) => `${type}:${idOrEmail}`;

/* ---- recent customers MRU (Customer has no timestamps → local list) ------- */

const RECENT_CUSTOMERS_KEY = 'ofi:calendarRecentCustomers';
const RECENT_LIMIT = 7;

export const readRecentCustomers = (): CustomerLite[] => {
    try {
        const raw = localStorage.getItem(RECENT_CUSTOMERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed.filter((row) => row && row.id && row.companyName).slice(0, RECENT_LIMIT) : [];
    } catch {
        return [];
    }
};

export const pushRecentCustomer = (customer: CustomerLite) => {
    try {
        const next = [customer, ...readRecentCustomers().filter((row) => row.id !== customer.id)].slice(0, RECENT_LIMIT);
        localStorage.setItem(RECENT_CUSTOMERS_KEY, JSON.stringify(next));
    } catch { /* storage unavailable — recents simply stay empty */ }
};
