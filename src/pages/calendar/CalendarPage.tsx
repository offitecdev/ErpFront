import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import dayjs from 'dayjs';

import {
    Calendar as CalendarIcon,
    CheckCircle,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    Plus,
    RefreshCcw01,
    SearchLg,
    X,
} from '@/components/icons/antIconCompat';
/* Der Griff zur Kalenderleiste: das SEITENFELD, nicht das Hauptmenue. Der
   Balkenstapel der Anwendung sitzt eine Zeile darueber — zweimal dasselbe
   Zeichen untereinander waeren zwei Menues, die dasselbe zu oeffnen scheinen. */
import { LuPanelLeft } from 'react-icons/lu';
import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { maintenanceApi } from '@/lib/api/maintenance';
import { meetingApi, meetingParticipantName, type MeetingActivityDto } from '@/lib/api/meetings';
import { projectApi } from '@/lib/api/project';
import { getRoleProfile, MONTAGE_PERMISSIONS } from '@/lib/access';
import { isPathAllowed } from '@/lib/pageAccess';
import { useAuthStore } from '@/store/authStore';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { ensureMaintenanceLocale } from '@/pages/maintenance/MaintenanceShared';

import { MonthGrid } from './components/MonthGrid';
import { TimeGrid } from './components/TimeGrid';
import { SectionSplash } from '@/components/ui-shared/SectionSplash';
import { NewTaskCard } from '@/pages/crm/tasks/NewTaskCard';
import { TaskBoard } from '@/pages/crm/tasks/TaskBoard';
import { TaskBoardBar } from '@/pages/crm/tasks/TaskBoardBar';
import { TaskCustomerFilter, type TaskCustomerPick } from '@/pages/crm/tasks/TaskCustomerFilter';
import type { TaskStaffPick } from '@/pages/crm/tasks/TaskStaffFilter';
import { TaskCompletionCard } from '@/pages/crm/tasks/TaskCompletionCard';
import { useTaskBoard } from '@/pages/crm/tasks/useTaskBoard';
import { defaultRange, type TaskRange, type TaskScope } from '@/pages/crm/tasks/taskBoardModel';
import { DetailPopup } from './components/DetailPopup';
import { CreatePopup, type CreateKind, type CreatePrefill } from './components/CreatePopup';
import { LabelRail } from './components/LabelRail';
import { LabelSettingsCard } from './components/LabelSettingsCard';
import { useCalendarLabels } from './useCalendarLabels';
import { extendDays, type DaySpan } from './components/DayPlanRows';
import {
    anchorFromPoint,
    anchorFromRect,
    appointmentCalStatus,
    dayKey,
    draftDays,
    personName,
    useCalViewport,
    viewRange,
    type CalEvent,
    type CalEventDetail,
    type CalParticipant,
    type CalendarView,
    type DraftEntry,
    type FloatAnchor,
} from './calendarShared';

/* ── payload → event mapping ─────────────────────────────────────────────── */

const dedupeParticipants = (list: CalParticipant[]): CalParticipant[] => {
    const seen = new Set<string>();
    const out: CalParticipant[] = [];
    for (const person of list) {
        const key = person.id || person.name;
        if (!person.name || seen.has(key)) continue;
        seen.add(key);
        out.push(person);
    }
    return out;
};

const orderParticipants = (appointment: any): CalParticipant[] => dedupeParticipants([
    ...(appointment.assignedTechnician
        ? [{ id: appointment.assignedTechnician.id, name: personName(appointment.assignedTechnician), role: appointment.assignedTechnician.roleName, email: appointment.assignedTechnician.email, phone: appointment.assignedTechnician.phone, isStaff: true }]
        : []),
    ...(appointment.technicianAssignments || [])
        .map((assignment: any) => assignment.technician)
        .filter(Boolean)
        .map((tech: any) => ({ id: tech.id, name: personName(tech), role: tech.roleName, email: tech.email, phone: tech.phone, isStaff: true })),
]);

const maintenanceParticipants = (task: any): CalParticipant[] => dedupeParticipants([
    ...(task.technician ? [{ id: task.technician.id, name: personName(task.technician), role: task.technician.roleName, email: task.technician.email, phone: task.technician.phone }] : []),
    ...(task.alternativeTechnician ? [{ id: task.alternativeTechnician.id, name: personName(task.alternativeTechnician), role: task.alternativeTechnician.roleName, email: task.alternativeTechnician.email, phone: task.alternativeTechnician.phone }] : []),
    ...(task.assignments || [])
        .map((assignment: any) => assignment.technician)
        .filter(Boolean)
        .map((tech: any) => ({ id: tech.id, name: personName(tech), role: tech.roleName, email: tech.email, phone: tech.phone })),
]);

const buildOrderDetail = (appointment: any): CalEventDetail => ({
    status: appointment.status,
    notes: appointment.notes,
    customerName: appointment.project?.customer?.companyName,
    customerEmail: appointment.project?.customer?.mainEmail,
    customerPhone: appointment.project?.customer?.mainPhone,
    customerAddress: appointment.project?.customer?.address,
    participants: orderParticipants(appointment),
    ccEmails: Array.isArray(appointment.ccEmails) ? appointment.ccEmails : [],
    projectName: appointment.project?.projectName,
    manager: personName(appointment.project?.manager) || undefined,
    orderNumber: appointment.salesOrder?.orderNumber,
    tenderNumber: appointment.salesOrder?.tender?.tenderNumber ?? appointment.project?.tender?.tenderNumber ?? null,
    inviteSentAt: appointment.inviteSentAt ?? null,
});

const buildMaintenanceDetail = (task: any): CalEventDetail => ({
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

const isAssignedTechnician = (appointment: any, userId?: string | null) =>
    Boolean(userId) && (
        appointment.assignedTechnician?.id === userId ||
        (appointment.technicianAssignments || []).some((assignment: any) => assignment?.technician?.id === userId)
    );

/* Die Leiste filtert seit dem 25.08.2026 nach ETIKETT und nicht mehr nach
   Herkunft und abgeleitetem Stand — die Zeilen dafür stehen in LabelRail. */

/* ── page ────────────────────────────────────────────────────────────────── */

/* Embedding the page inside another screen (the project detail's appointment
   section, 18.08.2026 — "make it exactly the calendar view"). The grid, the
   rail, the popups and every gesture stay the same; only three things go:
   the task board ("Checkliste"), "add task" and "add meeting". What is left is
   ONE create action — an appointment for the host's project/order, which is why
   the scope travels with the embed instead of being asked for again. */
export type CalendarEmbed = {
    /* Customer / project / order every new appointment belongs to. */
    prefill: CreatePrefill;
    /* Named context shown in the create card in place of the scope step. */
    scope: { label: string; projectName?: string | null; orderNumber?: string | null };
    /* A create/move/delete happened. The calendar has already refreshed its own
       list in the background; the host only has to invalidate whatever it keeps
       (counts, badges) — it must NOT rebuild its page for this. */
    onChanged?: () => void;
};

/* The calendar: a narrow rail (create, month picker, search, visibility) beside
   one large grid. Everything else happens in free-floating cards — no bottom
   sheets anywhere in this module (user request 17.08.2026). */
export const CalendarPage = ({ embed }: { embed?: CalendarEmbed } = {}) => {
    ensureMaintenanceLocale();
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const pageAccess = useAuthStore((state) => state.pageAccess);
    const user = useAuthStore((state) => state.user);
    const userId = user?.id;

    // Technicians only ever see their own schedule — even with manager-level
    // view permissions the "all *" sources stay off for them.
    const isTechnician = useMemo(() => getRoleProfile(user) === 'technician', [user]);
    const has = useCallback((permission: string) => permissions.includes(permission), [permissions]);
    const canAllOrders = !isTechnician && (has('projects.view') || has('projects.manage'));
    // Dieselbe Menge, die der Server auf /projects/technician/installations
    // durchlaesst (MONTAGE_PERMISSIONS). Vorher stand hier nur
    // `projects.report`, also Stufe 2 der Seite «Montage» — eine Rolle auf
    // Stufe 1 (nur ansehen) sah einen leeren Kalender, obwohl der Server ihre
    // Termine herausgegeben haette.
    const canMyInstallations = MONTAGE_PERMISSIONS.some((name) => has(name));
    const canAllMaintenance = !isTechnician && has('maintenance.contracts.manage');
    const canMyMaintenance = has('maintenance.tasks.manage') || has('maintenance.reports.manage');
    const canCreateAppointment = !isTechnician && has('projects.manage');
    /* Die Etikettenliste gilt für ALLE, die auf denselben Kalender schauen —
       umbenennen und löschen ist deshalb kein persönlicher Handgriff. Dieselbe
       Menge lässt der Server durch (calendarLabel.routes.ts, MANAGE). */
    const canManageLabels = has('projects.manage') || has('crm.activities.create') || has('roles.manage') || has('tenants.update');
    /* Eingebettet (Projekt → Termine): keine Aufgaben — weder das Brett noch die
       Zeile in der Leiste, und angelegt wird dort ausschliesslich ein Termin. */
    const embedded = Boolean(embed);
    // Aufgaben: jede Person sieht die eigenen — was ihr zugewiesen wurde und was
    // sie zugewiesen hat. Anlegen braucht crm.activities.create.
    const canViewTasks = !embedded && isPathAllowed(pageAccess, '/crm/tasks');
    const canWriteTasks = canViewTasks && has('crm.activities.create');
    /* Der Kundenfilter des Aufgabenbretts steht — wie auf /crm/tasks — nur
       denen offen, die die Kundenkartei sehen dürfen. */
    const canSeeCustomers = canViewTasks && has('crm.customers.view');

    /* DIE AUFGABE IST AUS DEM ANLEGEMENÜ DES KALENDERS GEFALLEN (12.09.2026,
       Vorgabe Samet: «die Aufgaben dort sollen genau die der Anwendung sein …
       und ein Knopf ‹Neue Aufgabe›»). Sie hatte im Kalenderfenster einen
       eigenen, ärmeren Reiter — nur Titel, Kunde, ein Datum. Jetzt legt der
       Aufgabenmodus mit DEMSELBEN Fenster an wie /crm/tasks (`NewTaskCard`),
       samt Spanne, Anleitung und Anhängen; zwei Wege zur selben Sache, von
       denen einer weniger kann, sind ein Weg zu viel. */
    const createKinds = useMemo<CreateKind[]>(() => (embedded
        ? (canCreateAppointment ? ['appointment' as const] : [])
        : [
            ...(canCreateAppointment ? ['appointment' as const] : []),
            'meeting' as const,
        ]), [embedded, canCreateAppointment]);

    /* Telefon / Tablet / Schreibtisch — der Kalender baut sich auf allen dreien
       anders auf, siehe `useCalViewport`. */
    const { phone, compact } = useCalViewport();
    /* Unter 1024px hat die Leiste keinen Platz mehr NEBEN dem Raster: sie wuerde
       darueber liegen und das Raster unter den Bildschirmrand schieben (auf dem
       Telefon fing das Raster erst nach dem Monatsblatt, der Suche und der
       Kalenderliste an). Sie wird darum zu einer Schublade, die ueber die Seite
       faehrt und sich hinter sich wieder schliesst. */
    const [railOpen, setRailOpen] = useState(false);
    /* Offen ist die Schublade nur dort, wo es sie GIBT: wird der Schirm wieder
       breit (Tablet gedreht, Fenster aufgezogen), steht die Leiste ohnehin
       wieder fest daneben. Abgeleitet und nicht zurueckgesetzt — sonst braeuchte
       es dafuer einen Effekt, der bei jedem Umbruch nachtraeglich aufraeumt. */
    const drawerOpen = compact && railOpen;

    const [mode, setMode] = useState<'calendar' | 'tasks'>('calendar');
    /* Auf dem Telefon steht die WOCHE nicht: sieben Spalten waeren 43px breit.
       Der Kalender oeffnet dort auf dem TAG — die Woche bleibt waehlbar und
       wird dann seitwaerts geschoben (TimeGrid). */
    const [view, setView] = useState<CalendarView>(() => (
        typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)').matches ? 'day' : 'week'
    ));
    /* Aufgaben: "mir zugewiesen" oder "von mir zugewiesen" — ein "Alle" gibt es
       nicht mehr (Vorgabe 19.08.2026). */
    const [taskScope, setTaskScope] = useState<TaskScope>('me');
    /* AUS DEN AKTIVITAETEN HERAUS (01.09.2026, Vorgabe Samet): `/calendar?
       meeting=…&at=…` schlaegt GENAU DIESE Besprechung auf. `at` ist der volle
       Zeitstempel des Termins — er entscheidet, welches Blatt der Kalender
       ueberhaupt laedt (geholt wird immer nur der sichtbare Zeitraum), und
       wird darum schon als ANFANGSZUSTAND gelesen und nicht erst in einem
       Effekt: sonst laedt die Seite zweimal, einmal fuer heute und einmal fuer
       den Termin. Dieselbe Bauart wie im Postfach (`/crm/mail?id=…`). */
    const deepLinkParams = useSearchParams()[0];
    const deepLinkMeetingId = deepLinkParams.get('meeting');
    const deepLinkDay = useMemo(() => {
        const raw = deepLinkParams.get('at');
        const day = raw ? dayjs(raw) : null;
        return day?.isValid() ? day : null;
        // Nur der Anfangswert zaehlt — die Adresse aendert sich danach nicht mehr.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    const [anchor, setAnchor] = useState(() => deepLinkDay ?? dayjs());
    const [selectedDay, setSelectedDay] = useState(() => deepLinkDay ?? dayjs());
    /* DIE ETIKETTEN (25.08.2026). Sie ersetzen die alten Filterschalter der
       Leiste: gefiltert wird nach dem Etikett am Eintrag, nicht mehr nach
       Herkunft (Termine/Besprechungen/Wartung/Aufgaben) und schon gar nicht
       nach einem aus der Uhr abgeleiteten Stand. */
    const labels = useCalendarLabels();
    /* Das Fenster hinter dem Zahnrad. `startNew` öffnet es gleich auf dem
       Blatt eines NEUEN Etiketts — das Plus in der Leiste tut genau das. */
    const [labelSettings, setLabelSettings] = useState<{ anchor: FloatAnchor; startNew: boolean } | null>(null);
    const [labelBusy, setLabelBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [meetingEvents, setMeetingEvents] = useState<CalEvent[]>([]);
    /* Das Aufgabenbrett teilt Daten und Handgriffe mit /crm/tasks. Es hat seine
       EIGENE Schnellwahl (Woche / 2 Wochen / Monat / Quartal) und nicht den
       Datumszeiger des Kalenders: hier wird nicht Woche für Woche geblättert
       (Vorgabe 19.08.2026). */
    const [taskRange, setTaskRange] = useState<TaskRange>(() => defaultRange());
    /* Der Mitarbeiterfilter der Leiste — dasselbe Feld wie auf /crm/tasks; leer
       heisst alle. */
    /* MEHRERE Personen oder alle (11.09.2026) — leer heisst alle. */
    const [taskStaff, setTaskStaff] = useState<TaskStaffPick[]>([]);
    /* … und derselbe Kundenfilter wie auf /crm/tasks (12.09.2026): der
       Aufgabenmodus soll die Aufgaben der Anwendung zeigen, nicht eine
       abgespeckte Fassung davon. */
    const [taskCustomers, setTaskCustomers] = useState<TaskCustomerPick[]>([]);
    const [newTaskOpen, setNewTaskOpen] = useState(false);
    const taskBoard = useTaskBoard({
        range: taskRange,
        scope: taskScope,
        assigneeIds: taskStaff.map((row) => row.id),
        customerIds: taskCustomers.map((row) => row.id),
        enabled: canViewTasks,
    });
    const { tasks, setTasks, loading: tasksLoading, busyIds: taskBusyIds, reload: loadTasks } = taskBoard;
    const [pickedTask, setPickedTask] = useState<{ id: string; anchor: FloatAnchor } | null>(null);
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(() => dayjs());

    const [detail, setDetail] = useState<{ event: CalEvent; anchor: FloatAnchor } | null>(null);
    const [createOpen, setCreateOpen] = useState(false);
    const [createAnchor, setCreateAnchor] = useState<FloatAnchor | null>(null);
    const [createPrefill, setCreatePrefill] = useState<CreatePrefill | null>(null);
    const [createMenuOpen, setCreateMenuOpen] = useState(false);
    const createButtonRef = useRef<HTMLButtonElement>(null);
    /* The entry being composed: drawn in the grid as a live block AND edited in
       the popup — one state, two views. */
    const [draft, setDraft] = useState<DraftEntry | null>(null);
    /* Expanded creation: the page turns into a full-screen split — the create
       panel docked on the LEFT, the grid on the right; the rail and the app
       chrome disappear until the panel is closed or collapsed. */
    const [expanded, setExpanded] = useState(false);
    /* Die aufgeklappte Anlage ist ein Bildschirm aus ZWEI Spalten (Formular
       links 520px, Raster rechts) — dafuer fehlt einem Telefon oder einem
       hochkant gehaltenen Tablet die Breite. Auch das wird abgeleitet: der
       Umschalter ist dort gar nicht erst da (siehe `onToggleExpand` unten). */
    const splitView = expanded && !compact;

    const updateDraft = useCallback((patch: Partial<DraftEntry>) => {
        setDraft((current) => {
            if (!current) return current;
            const merged = { ...current, ...patch };
            /* `days` und `start`/`end` sind dieselbe Sache aus zwei Blickwinkeln:
               der ERSTE Tag IST der Entwurf. Wer das eine ändert, zieht das
               andere nach — sonst zeigte das Raster einen anderen Tag als die
               Kopfzeile des Fensters. */
            const next: DraftEntry = patch.days
                ? { ...merged, start: patch.days[0]?.start ?? merged.start, end: patch.days[0]?.end ?? merged.end }
                : (patch.start || patch.end) && merged.days?.length
                    ? { ...merged, days: [{ start: merged.start, end: merged.end }, ...merged.days.slice(1)] }
                    : merged;
            const before = draftDays(current);
            const after = draftDays(next);
            const sameDays = before.length === after.length
                && before.every((span, index) => span.start.isSame(after[index].start) && span.end.isSame(after[index].end));
            if (sameDays && next.title === current.title && next.allDay === current.allDay) return current;
            return next;
        });
    }, []);

    // The mini month follows the draft's day (the navy square marks where the
    // entry will land), so moving the block also moves the highlight.
    useEffect(() => {
        if (draft) setSelectedDay((current) => (current.isSame(draft.start, 'day') ? current : draft.start));
    }, [draft?.start.valueOf()]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        const id = window.setInterval(() => setNow(dayjs()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    useEffect(() => {
        if (!createMenuOpen) return;
        const close = (event: PointerEvent) => {
            if ((event.target as HTMLElement)?.closest('[data-create-menu]')) return;
            setCreateMenuOpen(false);
        };
        window.addEventListener('pointerdown', close);
        return () => window.removeEventListener('pointerdown', close);
    }, [createMenuOpen]);

    useEffect(() => {
        if (!railOpen) return;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setRailOpen(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [railOpen]);

    const range = useMemo(() => viewRange(view, anchor), [view, anchor]);
    // Plain numbers for effect deps — a dayjs instance is a new object every render.
    const rangeStartMs = range.start.valueOf();
    const rangeEndMs = range.end.valueOf();

    /* ── loading ─────────────────────────────────────────────────────────── */

    /* `background` = im Hintergrund nachladen: KEINE Ladefläche. Nach dem
       Speichern oder Löschen bleibt das Raster stehen und tauscht nur seine
       Einträge aus — die Seite wird nicht neu aufgebaut (Vorgabe 19.08.2026). */
    const load = useCallback(async (background = false) => {
        if (!background) setLoading(true);
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
        const maintenanceDetailPath = canAllMaintenance ? '/maintenance/tasks' : '/maintenance/technician/tasks';
        const fetchOrderDetail = canAllOrders ? projectApi.getAppointmentDetail : projectApi.getMyInstallationDetail;
        const fetchMaintenanceDetail = canAllMaintenance ? maintenanceApi.getTaskDetail : maintenanceApi.getMyTaskDetail;

        const [orderResult, maintenanceResult] = await Promise.allSettled([
            orderSource ?? Promise.resolve([]),
            maintenanceSource ?? Promise.resolve([]),
        ]);

        const collected: CalEvent[] = [];

        if (orderResult.status === 'fulfilled') {
            (orderResult.value as any[]).forEach((appointment) => {
                const startTime = dayjs(appointment.startTime);
                const endTime = appointment.endTime ? dayjs(appointment.endTime) : startTime.add(1, 'hour');
                const orderNumber = appointment.salesOrder?.orderNumber;
                const customerName = appointment.project?.customer?.companyName;
                const technicians = orderParticipants(appointment).map((person) => person.name);
                const projectId = appointment.project?.id;
                const appointmentId = appointment.id;
                collected.push({
                    id: `appt-${appointment.id}`,
                    category: 'appointments',
                    refId: appointment.id,
                    title: customerName || (orderNumber ? t('calendar.order', { number: orderNumber }) : t('calendar.orders')),
                    subtitle: orderNumber ? t('calendar.order', { number: orderNumber }) : undefined,
                    meta: technicians.length ? `${t('calendar.technician')}: ${technicians.join(', ')}` : undefined,
                    start: startTime,
                    end: endTime,
                    allDay: false,
                    status: appointmentCalStatus(appointment, startTime, endTime),
                    labelId: appointment.labelId ?? null,
                    editable: canCreateAppointment,
                    customerId: appointment.project?.customer?.id ?? null,
                    customerName: customerName ?? null,
                    projectId: projectId ?? null,
                    salesOrderId: appointment.salesOrder?.id ?? null,
                    navigateTo: isAssignedTechnician(appointment, userId)
                        ? `/projects/installation/tasks/${appointment.id}`
                        : canAllOrders && projectId
                            ? `/projects/${projectId}`
                            : `/projects/installation/tasks/${appointment.id}`,
                    loadDetail: () => fetchOrderDetail(appointmentId).then(buildOrderDetail),
                });
            });
        }

        if (maintenanceResult.status === 'fulfilled') {
            (maintenanceResult.value as any[]).forEach((task) => {
                const hasTime = Boolean(task.scheduledStartTime);
                const startTime = dayjs(task.scheduledStartTime || task.plannedDate);
                const endTime = task.scheduledEndTime ? dayjs(task.scheduledEndTime) : startTime.add(1, 'hour');
                const taskId = task.id;
                collected.push({
                    id: `maintenance-${task.id}`,
                    category: 'maintenance',
                    refId: task.id,
                    title: task.contract?.customer?.companyName || task.contract?.title || t('calendar.maintenance'),
                    subtitle: task.contract?.contractCode || undefined,
                    start: startTime,
                    end: endTime,
                    allDay: !hasTime,
                    status: 'maintenance',
                    // Maintenance dates are bound to the contract's service plan —
                    // rescheduling belongs to the maintenance module, not here.
                    editable: false,
                    navigateTo: `${maintenanceDetailPath}/${task.id}`,
                    loadDetail: () => fetchMaintenanceDetail(taskId).then(buildMaintenanceDetail),
                });
            });
        }

        setEvents(collected);
        setLoading(false);
    }, [rangeStartMs, rangeEndMs, userId, canAllOrders, canMyInstallations, canAllMaintenance, canMyMaintenance, canCreateAppointment]); // eslint-disable-line react-hooks/exhaustive-deps

    // Meetings are their own slice: saving one never reloads the whole calendar.
    // TASK rows of that table are dropped — tasks come from the CRM.
    const loadMeetings = useCallback(async () => {
        const rows = await meetingApi.list(range.start.toISOString(), range.end.toISOString()).catch(() => [] as MeetingActivityDto[]);
        setMeetingEvents(
            rows
                .filter((meeting) => meeting.kind !== 'TASK' && dayjs(meeting.startTime).isValid())
                .map((meeting) => {
                    const startTime = dayjs(meeting.startTime);
                    const endTime = dayjs(meeting.endTime);
                    const people = meeting.participants.map(meetingParticipantName).filter(Boolean);
                    return {
                        id: `meeting-${meeting.id}`,
                        category: 'meetings' as const,
                        refId: meeting.id,
                        title: meeting.customer?.companyName ? `${meeting.title} · ${meeting.customer.companyName}` : meeting.title,
                        subtitle: people.length ? people.slice(0, 3).join(', ') : meeting.notes || undefined,
                        start: startTime,
                        end: endTime.isValid() ? endTime : startTime.add(1, 'hour'),
                        allDay: false,
                        status: 'meeting' as const,
                        labelId: meeting.labelId ?? null,
                        /* Aus der Mail übernommene Termine werden nicht
                           gezogen und nicht geschoben: die nächste Fassung der
                           Einladung überschreibt jede Änderung ohnehin. */
                        editable: !meeting.externalOrigin,
                        customerId: meeting.customerId ?? null,
                        customerName: meeting.customer?.companyName ?? null,
                        loadDetail: () => Promise.resolve({
                            notes: meeting.notes || null,
                            customerName: meeting.customer?.companyName || null,
                            customerEmail: meeting.customer?.mainEmail || null,
                            ccEmails: Array.isArray(meeting.ccEmails) ? meeting.ccEmails : [],
                            inviteSentAt: meeting.inviteSentAt ?? null,
                            externalOrigin: meeting.externalOrigin ?? null,
                            externalOrganizer: meeting.externalOrganizer ?? null,
                            meetingUrl: meeting.meetingUrl ?? null,
                            participants: meeting.participants.map((participant) => ({
                                id: participant.participantType === 'EMPLOYEE' ? (participant.employeeId || participant.id) : participant.id,
                                name: meetingParticipantName(participant),
                                role: participant.participantType === 'CUSTOMER'
                                    ? t('calendar.picker.customer')
                                    : participant.employee?.roleName || null,
                                email: participant.participantType === 'CUSTOMER' ? participant.customer?.mainEmail : participant.employee?.email,
                                phone: participant.participantType === 'CUSTOMER' ? participant.customer?.mainPhone : null,
                                isStaff: participant.participantType === 'EMPLOYEE',
                            })).filter((participant) => participant.name),
                        }),
                    };
                }),
        );
    }, [rangeStartMs, rangeEndMs]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { void loadMeetings(); }, [loadMeetings]);

    /* DAS ÖFFNEN DES KALENDERS HOLT DIE EINLADUNGEN NACH (31.08.2026).
       Bis hierher sah man beim Aufschlagen den Stand des letzten Postfach-
       Durchgangs; ein Termin, den jemand gerade in Outlook angesetzt hat,
       fehlte. Der Server entscheidet, ob wirklich gelesen wird (Schalter,
       Mindestabstand, ein laufender Durchgang) — hier wird nur angeklopft.

       EINMAL JE AUFSCHLAG, nicht bei jedem Blättern: der Abruf hängt am
       Postfach, nicht am angezeigten Zeitraum. `loadMeetings` steht darum in
       einer Ref — die Fassung des Callbacks wechselt mit dem Bereich, und der
       Effekt soll deswegen nicht erneut laufen.

       Im eingebetteten Kalender (Projekt-Randevu) bleibt es aus: dort zählt
       der Termin des Projekts, und ein IMAP-Abruf beim Öffnen einer
       Projektseite wäre eine Überraschung an der falschen Stelle. */
    const loadMeetingsRef = useRef(loadMeetings);
    useEffect(() => { loadMeetingsRef.current = loadMeetings; }, [loadMeetings]);
    useEffect(() => {
        if (embedded) return;
        let cancelled = false;
        void meetingApi.sync()
            .then((result) => {
                // Nur nachladen, wenn der Abruf etwas gebracht haben KANN:
                // sonst zöge jedes Öffnen dieselbe Liste ein zweites Mal.
                if (cancelled || !result.started) return;
                if (result.calendar > 0 || result.pending) void loadMeetingsRef.current();
            })
            .catch(() => { /* Der Kalender steht auch ohne frische Post. */ });
        return () => { cancelled = true; };
    }, [embedded]);

    /* ALLE TERMINE NACHHOLEN (14.09.2026, Vorgabe Samet: «alle Besprechungen
       aus dem Posteingang gehören in den Kalender — personenbezogen, ein- und
       ausgehend»).

       Der Abruf beim Öffnen liest nur, was seit dem letzten Durchgang
       dazugekommen ist; was schon im Postfach lag, sah er nie an. Dieser Knopf
       geht das ganze Fenster noch einmal durch — Posteingang UND Gesendet —
       und trägt dabei die Zuordnung schon übernommener Termine nach.

       Er kann Minuten dauern, darum die eigene Rückmeldung: der Server
       antwortet nach zwölf Sekunden mit `pending`, wenn er noch liest. */
    const [pulling, setPulling] = useState(false);
    const pullFromMailbox = useCallback(async () => {
        if (pulling) return;
        setPulling(true);
        try {
            const result = await meetingApi.backfill();
            if (!result.started) {
                if (result.reason === 'running') toast.info(t('calendar.mailbox.pulling'));
                else if (result.reason === 'not_configured') toast.error(t('calendar.mailbox.pullDisabled'));
                else toast.error(result.error || t('calendar.mailbox.pullFailed'));
                return;
            }
            await loadMeetingsRef.current();
            if (result.pending) toast.info(t('calendar.mailbox.pullPending'));
            else if (result.calendar > 0) toast.success(t('calendar.mailbox.pulled', { count: result.calendar }));
            else toast.success(t('calendar.mailbox.pullEmpty'));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('calendar.mailbox.pullFailed'));
        } finally {
            setPulling(false);
        }
    }, [pulling]);

    /* AUFGABEN IM RASTER — GESTRICHEN (25.08.2026, Vorgabe Samet: «Aufgaben
       raus, sie machen den Kalender voll»). Sie standen als ganztägige Karten
       in der obersten Zeile und drückten an vollen Tagen die Termine nach
       unten. Ihr Ort ist das BRETT daneben (Modus «Aufgaben»), das dieselbe
       Liste liest — geladen werden sie deshalb weiterhin, gezeichnet wird
       hier keine mehr. */

    /**
     * DIE FARBE KOMMT AUS DEM ETIKETT (25.08.2026).
     *
     * Die Quellen liefern nur die Kennung (`labelId`); Name und Farbe werden
     * HIER angehängt — an einer Stelle, damit ein umbenanntes oder umgefärbtes
     * Etikett sofort auf jeder Karte steht, ohne dass eine der Listen neu
     * geholt werden müsste. Ohne Etikett behält die Karte ihre alte,
     * abgeleitete Farbe; solange die Etikettenliste leer ist, sieht der
     * Kalender darum genau aus wie vorher.
     *
     * AUFGABEN STEHEN NICHT MEHR IM RASTER (Vorgabe 25.08.2026: «Aufgaben
     * raus, sie machen den Kalender voll»). Sie sind darum hier nicht mehr
     * dabei — geladen werden sie weiterhin, denn der Aufgabenmodus daneben
     * (das Brett) lebt von derselben Liste.
     */
    const allEvents = useMemo(() => {
        const paint = (event: CalEvent): CalEvent => {
            const label = event.labelId ? labels.byId.get(event.labelId) ?? null : null;
            if (!label) return event.labelName || event.labelColor ? { ...event, labelName: null, labelColor: null } : event;
            if (event.labelName === label.name && event.labelColor === label.color) return event;
            return { ...event, labelName: label.name, labelColor: label.color };
        };
        return [...events, ...meetingEvents].map(paint);
    }, [events, meetingEvents, labels.byId]);

    const visibleEvents = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return allEvents.filter((event) => {
            /* Der Haken vor dem Etikett entscheidet. Ein Eintrag OHNE Etikett
               steht immer da: es gibt keine Zeile, über die man ihn wegnehmen
               könnte (Vorgabe 25.08.2026 — «ohne Etikett» gibt es nicht mehr),
               und verschwinden soll er deswegen erst recht nicht. */
            if (event.labelId && labels.muted.has(event.labelId)) return false;
            if (!needle) return true;
            return event.title.toLowerCase().includes(needle)
                || (event.subtitle || '').toLowerCase().includes(needle)
                || (event.meta || '').toLowerCase().includes(needle);
        });
    }, [allEvents, labels.muted, search]);

    /* Wie viele Einträge im gezeigten Zeitraum je Etikett stehen — die Zahl am
       rechten Rand jeder Zeile der Leiste. */
    const labelCounts = useMemo(() => {
        const counts = new Map<string, number>();
        allEvents.forEach((event) => {
            if (!event.labelId) return;
            counts.set(event.labelId, (counts.get(event.labelId) ?? 0) + 1);
        });
        return counts;
    }, [allEvents]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalEvent[]>();
        visibleEvents.forEach((event) => {
            const key = dayKey(event.start);
            map.set(key, [...(map.get(key) || []), event]);
        });
        map.forEach((list) => list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.valueOf() - b.start.valueOf()));
        return map;
    }, [visibleEvents]);

    /* ── actions ─────────────────────────────────────────────────────────── */

    const step = (direction: 1 | -1) => {
        // Im Aufgabenmodus blättern die Pfeile Woche für Woche — es gibt dort
        // keine andere Ansicht (Vorgabe 19.08.2026).
        const unit = mode === 'tasks' ? 'week' : view === 'day' ? 'day' : view === 'week' ? 'week' : 'month';
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
        setRailOpen(false);
    };

    const pickDay = (day: dayjs.Dayjs) => {
        setSelectedDay(day);
        setAnchor(day);
        // Die Schublade hat ihre Aufgabe erledigt: sie gibt das Raster frei.
        setRailOpen(false);
    };

    /* Open the popup with a block already on the grid: `start`/`end` from a
       slot click, or a default 09:00–10:00 on the selected day from the rail.
       `spans` (a sideways drag across the day columns) starts the entry as a
       MULTI-DAY assignment — one block per picked day, same hours to begin
       with, each adjustable in the popup afterwards. */
    const openCreate = (
        prefill: CreatePrefill | null,
        popupAnchor: FloatAnchor | null,
        span?: { start: dayjs.Dayjs; end: dayjs.Dayjs },
        spans?: Array<{ start: dayjs.Dayjs; end: dayjs.Dayjs }>,
    ) => {
        if (createKinds.length === 0) return;
        setRailOpen(false);
        // Embedded: the host owns customer/project/order — a prefill from a
        // clicked entry must never drag another project's scope in.
        const merged = embed ? { ...embed.prefill, kind: 'appointment' as const } : prefill;
        const kind = merged?.kind && createKinds.includes(merged.kind) ? merged.kind : createKinds[0];
        const start = span?.start ?? selectedDay.hour(9).minute(0).second(0).millisecond(0);
        const end = span?.end ?? start.add(1, 'hour');
        setDetail(null);
        setDraft({
            start,
            end,
            allDay: kind === 'task',
            title: '',
            // Nur ein Einsatz kennt mehrere Tage — eine Aufgabe oder eine
            // Besprechung bleibt bei ihrem einen Termin.
            ...(spans && spans.length > 1 && kind === 'appointment' ? { days: spans } : {}),
        });
        setCreatePrefill(merged);
        setCreateAnchor(popupAnchor);
        setCreateOpen(true);
        setCreateMenuOpen(false);
    };

    /* Der Rückruf der Gastgeberseite — einzeln herausgezogen, damit die
       Rückrufe unten nicht am ganzen `embed`-Objekt hängen. */
    const hostChanged = embed?.onChanged;

    const closeCreate = () => {
        setCreateOpen(false);
        setExpanded(false);
        setDraft(null);
    };

    /* Nach Speichern/Löschen wird NUR die betroffene Liste nachgeladen, und zwar
       im Hintergrund: eine Meldung, das Fenster zu, die Tabelle frischt sich
       auf. Die Seite selbst wird nie neu aufgebaut (Vorgabe 19.08.2026).

       Hängt am AKTUELLEN `load` — wer eine Woche weitergeblättert hat und dort
       löscht, muss auch diese Woche zurückbekommen, nicht die vom Seitenaufbau. */
    const reloadFor = useCallback((kind: CreateKind) => {
        if (kind === 'appointment') void load(true);
        else if (kind === 'meeting') void loadMeetings();
        else void loadTasks();
        // The host page keeps its own copy of the project (overview counts,
        // badges) — it has to hear about this, but only to drop its cached copy.
        // Nothing on screen is torn down or refetched underneath the calendar.
        if (kind === 'appointment') hostChanged?.();
    }, [load, loadMeetings, loadTasks, hostChanged]);

    /* Drop / resize. The move is shown immediately and rolled back if the
       server refuses it (a double-booked technician, a busy project slot). */
    const reschedule = useCallback(async (event: CalEvent, start: dayjs.Dayjs, end: dayjs.Dayjs) => {
        const apply = (list: CalEvent[]) => list.map((row) => (row.id === event.id ? { ...row, start, end } : row));
        const revert = (list: CalEvent[]) => list.map((row) => (row.id === event.id ? { ...row, start: event.start, end: event.end } : row));

        if (event.category === 'appointments') setEvents(apply);
        else if (event.category === 'meetings') setMeetingEvents(apply);
        else if (event.category === 'tasks') {
            setTasks((current) => current.map((row) => (row.id === event.refId ? { ...row, dueDate: start.startOf('day').toISOString() } : row)));
        }

        try {
            if (event.category === 'appointments') {
                await projectApi.updateAppointment(event.refId, {
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                });
                hostChanged?.();
            } else if (event.category === 'meetings') {
                await meetingApi.update(event.refId, {
                    startTime: start.toISOString(),
                    endTime: end.toISOString(),
                });
            } else if (event.category === 'tasks') {
                await crmApi.updateTask(event.refId, { dueDate: start.startOf('day').toISOString() });
            }
        } catch {
            toast.error(t('calendar.grid.moveFailed'));
            if (event.category === 'appointments') { setEvents(revert); void load(true); }
            else if (event.category === 'meetings') { setMeetingEvents(revert); void loadMeetings(); }
            else void loadTasks();
        }
    }, [load, loadMeetings, loadTasks, setTasks, hostChanged]);

    /**
     * SEITWÄRTS AUSGEDEHNT (24.08.2026, Vorgabe Samet). An der linken oder
     * rechten Kante einer Einsatzkarte gezogen: der Einsatz läuft danach über
     * mehrere Tage. Die neuen Tage übernehmen die Zeiten der gezogenen Karte;
     * verstellt werden sie einzeln im Fenster «Tage».
     *
     * Schon geplante Tage bleiben, wie sie sind — ausgedehnt wird nur, nie
     * gekürzt: an einem Tag hängen Rapport, Spesen und Material, und die
     * verschwinden nicht durch einen Zug am Kartenrand.
     */
    const extendAppointment = useCallback(async (event: CalEvent, firstDay: dayjs.Dayjs, lastDay: dayjs.Dayjs) => {
        try {
            const series = await projectApi.getAppointmentSeries(event.refId);
            const current: DaySpan[] = series.days.map((day) => ({
                appointmentId: day.id,
                start: dayjs(day.startTime),
                end: dayjs(day.endTime),
            }));
            const next = extendDays(current.length ? current : [{ appointmentId: event.refId, start: event.start, end: event.end }], firstDay, lastDay);
            if (next.length === current.length) return;
            await projectApi.saveAppointmentDays(event.refId, {
                days: next.map((day) => ({
                    ...(day.appointmentId ? { appointmentId: day.appointmentId } : {}),
                    startTime: day.start.toISOString(),
                    endTime: day.end.toISOString(),
                })),
            });
            toast.success(t('calendar.days.extended', { count: next.length }));
            void load(true);
            hostChanged?.();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('calendar.days.extendFailed'));
        }
    }, [load, hostChanged]);

    /* Dasselbe am ENTWURF, der noch gar nicht gespeichert ist: hier wandert die
       Ausdehnung nur in den Entwurf, gespeichert wird sie mit dem Fenster. */
    const extendDraft = useCallback((firstDay: dayjs.Dayjs, lastDay: dayjs.Dayjs) => {
        setDraft((current) => {
            if (!current) return current;
            const next = extendDays(draftDays(current), firstDay, lastDay);
            if (next.length <= 1) return current;
            return { ...current, days: next.map((day) => ({ start: day.start, end: day.end })), start: next[0].start, end: next[0].end };
        });
    }, []);

    /* Ein Eintrag im Raster wurde angeklickt. Aufgaben bekommen ihre
       ERLEDIGUNGSKARTE (abhaken, Notizen, Bilder), alles andere die
       Auskunftskarte — beides Popups über dem Kalender, keine neue Seite. */
    const openEvent = useCallback((event: CalEvent, popupAnchor: FloatAnchor) => {
        if (event.category === 'tasks') {
            setDetail(null);
            setPickedTask({ id: event.refId, anchor: popupAnchor });
            return;
        }
        setPickedTask(null);
        setDetail({ event, anchor: popupAnchor });
    }, []);

    /* Die Karte zum Sprung aus den Aktivitaeten. Sie kann erst aufgehen, wenn
       die Besprechungen des Blattes da sind — darum haengt der Effekt an der
       Liste und nicht am Aufbau der Seite. `deepLink` ist ein Merker: er wird
       beim ersten Treffer geleert, damit ein spaeteres Nachladen die Karte
       nicht wieder aufschlaegt, nachdem man sie zugemacht hat. Die Karte hat
       hier keinen Griff im Raster, an dem sie sitzen koennte — sie oeffnet in
       der Bildmitte. */
    const deepLinkMeeting = useRef(embed ? null : deepLinkMeetingId);
    useEffect(() => {
        if (!deepLinkMeeting.current) return;
        const wanted = allEvents.find((event) => event.category === 'meetings' && event.refId === deepLinkMeeting.current);
        if (!wanted) return;
        deepLinkMeeting.current = null;
        openEvent(wanted, anchorFromPoint(window.innerWidth / 2, window.innerHeight / 2));
    }, [allEvents, openEvent]);

    const removeEvent = useCallback(async (event: CalEvent, scope: 'day' | 'series' = 'day') => {
        setDetail(null);
        try {
            // `series` nimmt den GANZEN mehrtägigen Einsatz zurück, sonst nur
            // diesen einen Tag (24.08.2026).
            if (event.category === 'appointments') await projectApi.deleteAppointment(event.refId, scope);
            else if (event.category === 'meetings') await meetingApi.remove(event.refId);
            else if (event.category === 'tasks') await crmApi.deleteTask(event.refId);
            else return;
            toast.success(t('calendar.detail.deleted'));
            reloadFor(event.category === 'appointments' ? 'appointment' : event.category === 'meetings' ? 'meeting' : 'task');
        } catch {
            toast.error(t('calendar.detail.deleteFailed'));
        }
    }, [reloadFor]);

    /* ── header ──────────────────────────────────────────────────────────── */

    /* Monat + Jahr, NIE die genaue Tagesspanne (Vorgabe 17.08.2026) — eine Woche
       über den Monatswechsel liest "Aug – Sep 2026". Im Aufgabenmodus steht der
       Zeitraum in der Leiste des Stapels, darum bleibt die Kopfzeile dort leer. */
    const periodLabel = view === 'day'
        ? anchor.format('D. MMMM YYYY')
        : view === 'week'
            ? (range.start.isSame(range.end, 'month')
                ? range.start.format('MMMM YYYY')
                : range.start.isSame(range.end, 'year')
                    ? `${range.start.format('MMM')} – ${range.end.format('MMM YYYY')}`
                    : `${range.start.format('MMM YYYY')} – ${range.end.format('MMM YYYY')}`)
            : anchor.format('MMMM YYYY');

    const views: Array<{ key: CalendarView; label: string }> = [
        { key: 'day', label: t('calendar.day') },
        { key: 'week', label: t('calendar.week') },
        { key: 'month', label: t('calendar.month') },
    ];

    const createItems = ([
        { key: 'appointment' as const, label: t('calendar.create.tabAppointment'), dot: 'ofi-ucal-dot--ongoing' },
        { key: 'meeting' as const, label: t('calendar.create.tabMeeting'), dot: 'ofi-ucal-dot--meeting' },
        { key: 'task' as const, label: t('calendar.create.tabTask'), dot: 'ofi-ucal-dot--task' },
    ]).filter((item) => createKinds.includes(item.key));

    /* One kind to create — then the button IS that action: no chevron, no menu
       to pick from a list of one (the project's appointment section, and any
       role that may only create appointments). */
    const singleKind = createItems.length === 1 ? createItems[0].key : null;
    const createLabel = singleKind === 'appointment'
        ? t('calendar.newAppointment')
        : singleKind === 'meeting'
            ? t('calendar.newMeeting')
            : singleKind === 'task'
                ? t('calendar.create.newTask')
                : t('calendar.create.button');

    /* Der Anlegeknopf sitzt auf dem Schreibtisch OBEN IN DER LEISTE und auf
       schmalen Schirmen in der Kopfzeile — dort, wo die Leiste weg ist. Ein
       Bauteil, zwei Plaetze: gerendert wird immer nur EINES davon, deshalb
       teilen sich beide `createButtonRef` gefahrlos. */
    /* «NEUE AUFGABE» (12.09.2026, Vorgabe Samet). Im Aufgabenmodus steht er
       an DER Stelle, an der im Kalender der Anlegeknopf steht — dieselbe Ecke,
       dieselbe Form. Er öffnet `NewTaskCard`, also genau das Fenster von
       /crm/tasks; der Kalender hat dafür keine eigene, ärmere Fassung mehr. */
    const taskCreateControl = canWriteTasks ? (
        <button
            type="button"
            onClick={() => setNewTaskOpen(true)}
            aria-label={t('crm.tasks.newTask')}
            title={phone ? t('crm.tasks.newTask') : undefined}
            className={`ofi-cal-createbtn ${compact ? 'is-compact' : ''}`}
        >
            <Plus size={18} />
            {!phone && t('crm.tasks.newTask')}
        </button>
    ) : null;

    const createControl = createItems.length > 0 ? (
        <div className="relative" data-create-menu>
            <button
                ref={createButtonRef}
                type="button"
                onClick={() => {
                    if (!singleKind) { setCreateMenuOpen((current) => !current); return; }
                    const rect = createButtonRef.current?.getBoundingClientRect();
                    openCreate({ kind: singleKind }, rect ? anchorFromRect(rect) : null);
                }}
                /* Auf dem Telefon bleibt vom Knopf das Pluszeichen: die Zeile
                   traegt schon Datum, Ansicht und Modus. Der Name steht als
                   `aria-label`/`title` weiter da. */
                aria-label={createLabel}
                title={compact ? createLabel : undefined}
                className={`ofi-cal-createbtn ${compact ? 'is-compact' : ''}`}
            >
                <Plus size={18} />
                {!phone && createLabel}
                {!singleKind && !phone && <ChevronDown size={14} className="opacity-60" />}
            </button>
            {createMenuOpen && !singleKind && (
                <div className={`ofi-cal-createmenu ${compact ? 'is-right' : ''}`}>
                    {createItems.map((item) => (
                        <button
                            key={item.key}
                            type="button"
                            onClick={() => {
                                const rect = createButtonRef.current?.getBoundingClientRect();
                                openCreate({ kind: item.key }, rect ? anchorFromRect(rect) : null);
                            }}
                        >
                            <span className={`ofi-ucal-dot ${item.dot}`} />
                            {item.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    ) : null;

    return (
        <div className={`ofi-cal-page ${createOpen && splitView ? 'is-expanded' : ''}`}>
            {/* ── header: today · arrows · month, then view + mode ─────────── */}
            <header className="ofi-cal-topbar">
                {/* Datumszeiger und Ansichtswahl gehören dem KALENDER. Der
                    Aufgabenmodus bringt seinen eigenen Zeitraum in der Leiste
                    des Stapels mit — beides gleichzeitig wären zwei Regler für
                    dieselbe Frage. */}
                <div className="flex min-w-0 items-center gap-1">
                    {/* Schmaler Schirm: der Griff zur Leiste. Auf dem
                        Schreibtisch steht sie ohnehin offen daneben — und im
                        Aufgabenmodus gibt es sie gar nicht (12.09.2026), also
                        auch keinen Griff dorthin. */}
                    {compact && mode === 'calendar' && (
                        <button
                            type="button"
                            aria-label={t('calendar.myCalendars')}
                            title={t('calendar.myCalendars')}
                            aria-expanded={drawerOpen}
                            onClick={() => setRailOpen((current) => !current)}
                            className="ofi-cal-navbtn"
                        >
                            <LuPanelLeft size={17} />
                        </button>
                    )}
                    {mode === 'calendar' && (
                        <>
                            <button type="button" className="ofi-cal-todaybtn" onClick={goToday}>{t('calendar.today')}</button>
                            <button type="button" aria-label={t('common.back')} className="ofi-cal-navbtn" onClick={() => step(-1)}><ChevronLeft size={18} /></button>
                            <button type="button" aria-label={t('common.next')} className="ofi-cal-navbtn" onClick={() => step(1)}><ChevronRight size={18} /></button>
                            <span className="ofi-cal-period">{periodLabel}</span>
                        </>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                    {/* Termine aus dem Postfach nachholen. Steht neben der
                        Ansichtswahl, weil es den KALENDER füllt und nicht die
                        Aufgaben; im eingebetteten Projektkalender entfällt er,
                        dort zählt der Termin des Projekts. */}
                    {mode === 'calendar' && !embedded && (
                        <button
                            type="button"
                            aria-label={t('calendar.mailbox.pull')}
                            title={t('calendar.mailbox.pull')}
                            aria-busy={pulling}
                            disabled={pulling}
                            onClick={() => { void pullFromMailbox(); }}
                            className="ofi-cal-navbtn"
                        >
                            <RefreshCcw01 size={17} className={pulling ? 'animate-spin' : undefined} />
                        </button>
                    )}
                    {mode === 'calendar' && (
                        <div className="ofi-cal-viewgroup">
                            {views.map((item) => (
                                <button
                                    key={item.key}
                                    type="button"
                                    onClick={() => setView(item.key)}
                                    className={view === item.key ? 'is-active' : ''}
                                >
                                    {item.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {canViewTasks && (
                        <div className="ofi-cal-modegroup">
                            <button
                                type="button"
                                aria-label={t('calendar.title')}
                                title={t('calendar.title')}
                                onClick={() => setMode('calendar')}
                                className={mode === 'calendar' ? 'is-active' : ''}
                            >
                                <CalendarIcon size={16} />
                            </button>
                            <button
                                type="button"
                                aria-label={t('calendar.tasks.title')}
                                title={t('calendar.tasks.title')}
                                /* Aufgaben sind IMMER die Woche: der Umstieg
                                   stellt die Ansicht mit um, damit der Rückweg
                                   in den Kalender nicht im Monat landet. */
                                onClick={() => { setView('week'); setMode('tasks'); }}
                                className={mode === 'tasks' ? 'is-active' : ''}
                            >
                                <CheckCircle size={16} />
                            </button>
                        </div>
                    )}

                    {/* Je Modus EIN Anlegeknopf. Im Kalender sitzt er auf dem
                        Schreibtisch in der Leiste und nur auf schmalen Schirmen
                        hier; im Aufgabenmodus gibt es keine Leiste, also steht
                        er immer hier. */}
                    {mode === 'calendar' && compact && createControl}
                    {mode === 'tasks' && taskCreateControl}
                </div>
            </header>

            {/* IM AUFGABENMODUS GIBT ES KEINE LEISTE (12.09.2026, Vorgabe
                Samet: «die Aufgaben dort sollen genau die der Anwendung
                sein»). Auf /crm/tasks steht das Brett über die ganze Breite;
                stand daneben eine Leiste mit Suche und Etiketten — beides
                Sachen des Kalenders —, war es eben nicht dieselbe Seite. */}
            <div className={`ofi-cal-body ${mode === 'tasks' ? 'is-tasks' : ''}`}>
                {/* Die Schublade liegt UEBER dem Raster; ein Griff daneben legt
                    sie wieder weg. */}
                {mode === 'calendar' && drawerOpen && (
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={() => setRailOpen(false)}
                        className="ofi-cal-railscrim"
                    />
                )}

                {/* ── rail ──────────────────────────────────────────────── */}
                {mode === 'calendar' && <aside
                    className={`ofi-cal-rail ${compact ? 'is-drawer' : ''} ${drawerOpen ? 'is-open' : ''}`}
                    /* Zu ist zu: die geschlossene Schublade nimmt keine Klicks
                       an und liegt auch nicht in der Tabulatorreihenfolge. */
                    inert={compact && !drawerOpen ? true : undefined}
                >
                    {!compact && createControl}

                    {/* Die Schublade sagt, was sie ist, und wie man sie wieder
                        zumacht — der Griff daneben ist auf einem Telefon nur ein
                        schmaler Streifen. */}
                    {compact && (
                        <div className="ofi-cal-railhead">
                            <span className="ofi-cal-railhead__title">{t('calendar.title')}</span>
                            <button
                                type="button"
                                aria-label={t('common.close')}
                                onClick={() => setRailOpen(false)}
                                className="ofi-cal-navbtn"
                            >
                                <X size={18} />
                            </button>
                        </div>
                    )}

                    {/* DAS KLEINE MONATSBLATT IST WEG (12.09.2026, Vorgabe
                        Samet: «entfernt die kleine Kalenderansicht»). Es war
                        eine ZWEITE Datumswahl neben der Kopfzeile, die schon
                        Monat, Pfeile und «Heute» trägt — und im Aufgabenmodus
                        wählte es etwas ganz anderes (die Woche des Bretts) als
                        im Kalender, mit demselben Griff. Die Leiste trägt jetzt
                        nur noch, was ihr allein gehört: Suche und Etiketten. */}
                    <label className="ofi-cal-search">
                        <SearchLg size={13} className="shrink-0 text-slate-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('calendar.searchPlaceholder')}
                        />
                    </label>

                    {/* DIE ETIKETTEN (25.08.2026, Vorgabe Samet): EINE flache
                        Reihe. Kein Sammelbegriff «Termine» mehr, unter dem die
                        Stände als Unterpunkte hingen — jedes Etikett ist ein
                        Etikett, und das Anlegefenster wählt aus derselben
                        Liste. */}
                    <div className="ofi-cal-rail-block">
                        <LabelRail
                            labels={labels.visible}
                            counts={labelCounts}
                            hidden={labels.muted}
                            canManage={canManageLabels}
                            onToggle={labels.toggleMuted}
                            onOpenSettings={(popupAnchor) => setLabelSettings({ anchor: popupAnchor, startNew: false })}
                            onAdd={(popupAnchor) => setLabelSettings({ anchor: popupAnchor, startNew: true })}
                        />
                    </div>
                </aside>}

                {/* ── main surface ──────────────────────────────────────── */}
                <div className="min-w-0">
                    {mode === 'tasks' ? (
                        /* GENAU DIE SEITE /crm/tasks (12.09.2026, Vorgabe
                           Samet): dieselbe Filterzeile samt Kundenfilter,
                           dasselbe FÜLLENDE Brett, dasselbe Anlegefenster.
                           `ofi-taskpage` ist die Klasse, an der die Masse der
                           Seite hängen (Leistenbreite, Kartenhöhe) — sie muss
                           hier mit, sonst sähe dasselbe Brett anders aus. */
                        <div className="ofi-taskpage relative flex flex-col gap-3">
                            {/* Häkchen-Splash beim Wechsel in den Aufgabenmodus — einmal
                                je Tab (Vorgabe 18.08.2026), nur über dem Brett. */}
                            <SectionSplash scope="calendar-tasks" loading={tasksLoading} />
                            <TaskBoardBar
                                range={taskRange}
                                onRange={setTaskRange}
                                scope={taskScope}
                                onScope={setTaskScope}
                                staff={taskStaff}
                                onStaff={setTaskStaff}
                            >
                                {canSeeCustomers && <TaskCustomerFilter values={taskCustomers} onChange={setTaskCustomers} />}
                            </TaskBoardBar>
                            <TaskBoard
                                key={`${taskRange.from}:${taskRange.to}:${taskScope}:${taskStaff.map((row) => row.id).join('|')}:${taskCustomers.map((row) => row.id).join('|')}`}
                                tasks={tasks}
                                loading={tasksLoading}
                                busyIds={taskBusyIds}
                                userId={userId}
                                fill
                                onSetDone={taskBoard.setDone}
                                onOpen={(task, popupAnchor) => { setDetail(null); setPickedTask({ id: task.id, anchor: popupAnchor }); }}
                            />
                        </div>
                    ) : (
                        <div className="ofi-cal-surface">
                            {loading ? (
                                <div className="ofi-shimmer m-3 h-[560px] rounded-lg bg-slate-100 dark:bg-white/5" />
                            ) : view === 'month' ? (
                                <MonthGrid
                                    anchor={anchor}
                                    range={range}
                                    eventsByDay={eventsByDay}
                                    selectedDay={selectedDay}
                                    now={now}
                                    draft={createOpen ? draft : null}
                                    onSelectDay={pickDay}
                                    onOpenDay={openDay}
                                    onOpenEvent={openEvent}
                                    onCreateDay={createKinds.length
                                        ? (day, popupAnchor, throughDay) => {
                                            const start = day.hour(9).minute(0).second(0).millisecond(0);
                                            const end = start.add(1, 'hour');
                                            /* Über mehrere Zellen gezogen: je Tag ein
                                               Block mit denselben Zeiten. Die Zeiten
                                               je Tag stellt das Fenster daneben. */
                                            const count = throughDay ? throughDay.startOf('day').diff(day.startOf('day'), 'day') + 1 : 1;
                                            const spans = count > 1
                                                ? Array.from({ length: count }, (_, index) => ({
                                                    start: start.add(index, 'day'),
                                                    end: end.add(index, 'day'),
                                                }))
                                                : undefined;
                                            openCreate(null, popupAnchor, { start, end }, spans);
                                        }
                                        : undefined}
                                    onReschedule={reschedule}
                                    onDraftChange={(start, end) => updateDraft({ start, end })}
                                />
                            ) : (
                                <TimeGrid
                                    days={view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, index) => range.start.add(index, 'day'))}
                                    eventsByDay={eventsByDay}
                                    now={now}
                                    draft={createOpen ? draft : null}
                                    onOpenEvent={openEvent}
                                    onOpenDay={openDay}
                                    onCreateAt={createKinds.length ? (start, end, popupAnchor, spans) => openCreate(null, popupAnchor, { start, end }, spans) : undefined}
                                    onReschedule={reschedule}
                                    onDraftChange={(start, end) => updateDraft({ start, end })}
                                    onExtendDays={canCreateAppointment ? extendAppointment : undefined}
                                    onExtendDraft={createKinds.includes('appointment') ? extendDraft : undefined}
                                />
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Die Erledigungskarte einer Aufgabe — Popup ÜBER dem Kalender,
                keine neue Seite (Vorgabe 19.08.2026). */}
            <TaskCompletionCard
                open={Boolean(pickedTask)}
                task={pickedTask ? tasks.find((row) => row.id === pickedTask.id) ?? null : null}
                anchor={pickedTask?.anchor ?? null}
                onClose={() => setPickedTask(null)}
                onSetDone={taskBoard.setDone}
                onSaveSpan={taskBoard.saveSpan}
                onPatched={taskBoard.patchRow}
                onDeleted={canWriteTasks ? (task) => void taskBoard.remove(task) : undefined}
                onChanged={taskBoard.setNoteCount}
            />

            {/* DASSELBE Anlegefenster wie auf /crm/tasks — mit Spanne,
                Anleitung und Anhängen. */}
            <NewTaskCard open={newTaskOpen} onClose={() => setNewTaskOpen(false)} onSaved={() => loadTasks()} />

            <DetailPopup
                event={detail?.event ?? null}
                anchor={detail?.anchor ?? null}
                onClose={() => setDetail(null)}
                onNavigate={(event) => {
                    setDetail(null);
                    if (event.navigateTo) navigate(event.navigateTo);
                }}
                onCreateFrom={(event) => openCreate(embed ? embed.prefill : {
                    kind: 'appointment',
                    customer: event.customerId ? { id: event.customerId, companyName: event.customerName || '' } : null,
                    projectId: event.projectId ?? null,
                    salesOrderId: event.salesOrderId ?? null,
                }, detail?.anchor ?? null)}
                onDelete={removeEvent}
                /* Einsatzplan und Unterlagen klappen IN der Auskunftskarte auf,
                   als Spalte neben den Angaben — kein zweites Fenster (Vorgabe
                   24.08.2026). Planen darf, wer Termine setzen darf; lesen und
                   die Unterlagen sehen darf auch die Monteurin. */
                canEditDays={canCreateAppointment}
                canOpenDocs
                onDaysChanged={() => { void load(true); hostChanged?.(); }}
                technicianScope={!canAllOrders}
                canCreate={canCreateAppointment}
                deletable={Boolean(detail?.event && (
                    (detail.event.category === 'appointments' && canCreateAppointment)
                    || detail.event.category === 'meetings'
                    || (detail.event.category === 'tasks' && canWriteTasks)
                ))}
                /* «An Kunden senden» — the invitation leaves only from here (or the
                   wizard's send step); saving never mails. */
                canSendInvite={Boolean(detail?.event && (
                    (detail.event.category === 'appointments' && canCreateAppointment)
                    || detail.event.category === 'meetings'
                ))}
                onInviteSent={() => reloadFor(detail?.event?.category === 'meetings' ? 'meeting' : 'appointment')}
            />

            <CreatePopup
                open={createOpen}
                anchor={createAnchor}
                prefill={createPrefill}
                kinds={createKinds}
                draft={draft}
                onDraftChange={updateDraft}
                onClose={closeCreate}
                onSaved={reloadFor}
                lockedScope={embed?.scope ?? null}
                docked={splitView}
                expanded={splitView}
                /* Der Vollbild-Umschalter baut die Seite in ZWEI Spalten um
                   (Formular links 520px, Raster rechts) — dafuer fehlt einem
                   Telefon oder hochkant gehaltenen Tablet die Breite. Ohne
                   Rueckruf zeigt die Karte den Knopf gar nicht erst. */
                onToggleExpand={compact ? undefined : () => setExpanded((current) => !current)}
                labels={labels.visible}
                /* Der Vorschlag kommt aus der ROLLE: ein neu gesetzter Termin
                   steht bevor, ist also «geplant». Aufgabe und Besprechung
                   bekommen KEINEN Vorschlag mehr (26.08.2026): die Aufgabe
                   steht nicht im Raster, und die Besprechung fragt nicht —
                   ihr Etikett setzt der Server aus der Rolle MEETING. */
                defaultLabelId={(kind) => (kind === 'appointment'
                    ? labels.byRole('PLANNED')?.id ?? null
                    : null)}
            />

            {/* Das Zahnrad neben «Etiketten»: ausblenden, umbenennen, umfärben,
                Rolle setzen, löschen — und das Plus für ein neues. Alles in
                EINEM Fenster mit zwei Ansichten (Liste ⇄ Blatt). */}
            <LabelSettingsCard
                open={Boolean(labelSettings)}
                anchor={labelSettings?.anchor ?? null}
                labels={labels.list}
                freeRoles={labels.freeRoles}
                busy={labelBusy}
                startNew={labelSettings?.startNew ?? false}
                onClose={() => setLabelSettings(null)}
                /* AUSBLENDEN IST ANSICHTSSACHE (26.08.2026, Vorgabe Samet):
                   es geschieht im Browser, nicht am Etikett des Mandanten.
                   Also kein `labelBusy` — es gibt nichts abzuwarten und
                   nichts, was scheitern könnte. Und KEINE Meldung (Vorgabe
                   26.08.2026: «nicht bei jedem Druck aufs Auge eine
                   Benachrichtigung»): die Zeile wandert sichtbar in die
                   Gruppe «Ausgeblendet» bzw. zurück — das IST die Antwort,
                   ein Zettel dazu sagte dasselbe noch einmal. Endgültig ist
                   allein der Papierkorb weiter unten, und der geht an den
                   Server. */
                onSetHidden={(label, hide) => labels.retire(label.id, hide)}
                onSave={async (label, input) => {
                    setLabelBusy(true);
                    const saved = label ? await labels.update(label.id, input) : await labels.create(input);
                    setLabelBusy(false);
                    return Boolean(saved);
                }}
                onDelete={async (label) => {
                    setLabelBusy(true);
                    /* Erst ohne, dann — falls es noch klebt — mit `force`: die
                       Zeile hat bereits nachgefragt, ein zweiter Kasten wäre
                       einer zu viel. Die Einträge bleiben stehen und sind
                       danach ohne Etikett. */
                    let result = await labels.remove(label.id);
                    if (result === 'inUse') result = await labels.remove(label.id, { force: true });
                    setLabelBusy(false);
                    if (result === 'ok') toast.success(t('calendar.labels.deleted'));
                    return result === 'ok';
                }}
            />

        </div>
    );
};
