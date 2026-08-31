import { useEffect, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

import { t } from '@/i18n/translate';

dayjs.extend(isoWeek);

/* Shared foundation of the calendar module: event model, ranges, layout math,
   status→colour mapping, the time-zone read-out and the "recent customers" MRU
   used by the pickers. */

export type CalendarView = 'day' | 'week' | 'month';
/* Four sources feed one grid. `tasks` are CRM tasks (kind TASK) — they own a
   due DATE only, so they always render in the all-day band. */
export type CalCategory = 'appointments' | 'meetings' | 'maintenance' | 'tasks';

/* NOTNAGEL-FARBEN. Seit dem 25.08.2026 kommt die Farbe einer Karte aus ihrem
   ETIKETT (CalLabel weiter unten) — diese Palette färbt nur noch, was keines
   trägt: ein Altbestand aus der Zeit davor, ein Eintrag, dessen Etikett
   gelöscht wurde, und der Entwurfsblock im Raster.

   Chip colour contract — Google Calendar's own event palette
   (see .ofi-ucal-chip-* in index.css + dark.css):
   planned   → Peacock #039be5 (the default card, still ahead)
   ongoing   → Blueberry #3f51b5 (window started, not finished)
   done      → Basil #0b8043 (window over / completed)
   cancelled → grey, struck through
   meeting   → Grape #8e24aa
   maintenance → Tangerine #f4511e
   task      → Sage #33b679, taskDone → grey, muted and struck */
export type CalStatus =
    | 'planned'
    | 'ongoing'
    | 'done'
    | 'cancelled'
    | 'meeting'
    | 'maintenance'
    | 'task'
    | 'taskDone';

export type CalParticipant = {
    id?: string;
    name: string;
    role?: string | null;
    email?: string | null;
    phone?: string | null;
    /* Employee (technician / staff participant) — these form the CC of an
       invitation; customer participants never do. */
    isStaff?: boolean;
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
    /* When the calendar invitation was last sent to the customer (null = never). */
    inviteSentAt?: string | null;
    /* Entries that arrived AS a mail invitation (Outlook/Teams). They are kept
       up to date from the mail and belong to the organiser out there — the ERP
       neither edits nor invites for them. `meetingUrl` is the join link. */
    externalOrigin?: string | null;
    externalOrganizer?: string | null;
    meetingUrl?: string | null;
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
    /* DAS ETIKETT (25.08.2026). Es allein bestimmt die Farbe der Karte; der
       `status` daneben bleibt nur der Notnagel für einen Eintrag, der keines
       trägt (Altbestand, gelöschtes Etikett) — und für die Wartung, die im
       Kalender nur gelesen wird. */
    labelId?: string | null;
    labelName?: string | null;
    labelColor?: string | null;
    navigateTo?: string;
    /* Dragging/resizing writes back through the page — an entry the signed-in
       person may not reschedule renders without handles. */
    editable?: boolean;
    /* Prefill context for "create another appointment like this one". */
    customerId?: string | null;
    customerName?: string | null;
    projectId?: string | null;
    salesOrderId?: string | null;
    loadDetail?: () => Promise<CalEventDetail>;
};

/* The entry being composed in the create popup, drawn live in the grid (the
   "(Untitled) 10:00–11:00" block of the reference calendar). Tasks are all-day. */
export type DraftEntry = {
    start: dayjs.Dayjs;
    end: dayjs.Dayjs;
    allDay: boolean;
    title: string;
    /**
     * MEHRTÄGIGER EINSATZ (24.08.2026). Jeder Tag hat EIGENE Zeiten, deshalb ist
     * das eine Liste von Spannen und keine Spanne über mehrere Tage. Der ERSTE
     * Eintrag ist immer derselbe wie `start`/`end` — alles, was nur einen Tag
     * kennt (Ziehen im Raster, die Kopfzeile des Fensters), bleibt dadurch
     * unverändert richtig. Ein einzelner Tag lässt das Feld leer.
     */
    days?: Array<{ start: dayjs.Dayjs; end: dayjs.Dayjs }>;
};

/** Die Tage eines Entwurfs — immer mindestens einer. */
export const draftDays = (draft: DraftEntry | null): Array<{ start: dayjs.Dayjs; end: dayjs.Dayjs }> => {
    if (!draft) return [];
    return draft.days?.length ? draft.days : [{ start: draft.start, end: draft.end }];
};

/**
 * Dieselbe Uhrzeit auf einen anderen Tag legen. Ein Einsatz wird fast immer so
 * geplant — «Montag bis Donnerstag, jeweils 08:00 bis 17:00» —, und die Zeiten
 * eines einzelnen Tages werden danach nachgezogen, nicht alle einzeln getippt.
 *
 * Die LÄNGE reist mit, auch über Mitternacht: eine Nachtmontage von 20:00 bis
 * 02:00 bleibt beim Verschieben eine Nachtmontage und wird nicht am
 * Tagesende abgeschnitten (Vorgabe 24.08.2026 — eine Karte über zwei Tage ist
 * EINE Karte).
 */
export const spanOnDay = (
    span: { start: dayjs.Dayjs; end: dayjs.Dayjs },
    day: dayjs.Dayjs,
): { start: dayjs.Dayjs; end: dayjs.Dayjs } => {
    const start = day.startOf('day').hour(span.start.hour()).minute(span.start.minute()).second(0).millisecond(0);
    const length = Math.max(15, span.end.diff(span.start, 'minute'));
    return { start, end: start.add(length, 'minute') };
};

/** Läuft dieser Block über Mitternacht? Dann trägt seine Endzeit ein «+1». */
export const crossesMidnight = (span: { start: dayjs.Dayjs; end: dayjs.Dayjs }) =>
    !span.end.isSame(span.start, 'day');

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

/* ---- time zone read-out --------------------------------------------------- */

/* The browser's IANA zone ("Europe/Zurich"), empty when the engine hides it. */
export const timeZoneId = (): string => {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    } catch {
        return '';
    }
};

/* "GMT+02" / "GMT+05:30" for the moment given — read from the runtime, never
   hard-coded, and re-read per render so a DST switch shows up by itself. */
export const gmtOffsetLabel = (at: Date = new Date()): string => {
    const minutes = -at.getTimezoneOffset();
    const sign = minutes < 0 ? '-' : '+';
    const hours = Math.floor(Math.abs(minutes) / 60);
    const rest = Math.abs(minutes) % 60;
    return `GMT${sign}${String(hours).padStart(2, '0')}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
};

/* ---- status ---------------------------------------------------------------- */

/* Appointment status → chip colour. "Past" = the planned window is over OR the
   job is completed → Basil green; a window that has STARTED but not ended →
   Blueberry (ongoing); everything still ahead → Peacock (planned). */
export const appointmentCalStatus = (raw: { status?: string | null }, start: dayjs.Dayjs, end: dayjs.Dayjs): CalStatus => {
    if (raw.status === 'CANCELLED') return 'cancelled';
    if (raw.status === 'COMPLETED' || end.valueOf() < Date.now()) return 'done';
    if (start.valueOf() <= Date.now()) return 'ongoing';
    return 'planned';
};

/* ---- Etiketten ------------------------------------------------------------

   Ein Etikett ist ein Name und eine Farbe (CalendarLabel, je Mandant). Die
   Karte trägt SEINE Farbe — nicht mehr die, die aus der Uhr fiel. */

export type CalLabel = {
    id: string;
    name: string;
    /** #rrggbb */
    color: string;
    sortOrder: number;
    role: CalLabelRole | null;
    /** Weggeräumt, aber nicht weggeworfen — raus aus Leiste und Auswahlfeld. */
    hidden: boolean;
};

/**
 * WOFÜR ein Etikett gedacht ist. Es sperrt nichts — jedes Etikett lässt sich
 * an jeden Eintrag hängen —, es sagt, was beim Anlegen VORGESCHLAGEN wird und
 * welche Rolle im «+» noch frei ist: je Rolle steht EIN sichtbares Etikett.
 * Eine Aufgabe hat keine Rolle: sie steht seit dem 25.08.2026 nicht mehr im
 * Raster.
 */
export type CalLabelRole = 'PLANNED' | 'ONGOING' | 'DONE' | 'MEETING';

export const CAL_LABEL_ROLES: ReadonlyArray<CalLabelRole> = ['PLANNED', 'ONGOING', 'DONE', 'MEETING'];

/**
 * Name und Farbe, mit denen ein Etikett DIESER Rolle anfängt — dieselben vier
 * Zeilen wie der Erstbestand auf dem Server (shared/calendarLabels.ts). Wird
 * eine Rolle im «+» neu vergeben, steht sie damit sofort richtig da.
 */
export const CAL_LABEL_ROLE_DEFAULTS: Record<CalLabelRole, { nameKey: string; color: string }> = {
    PLANNED: { nameKey: 'calendar.labels.rolePlanned', color: '#039be5' },
    ONGOING: { nameKey: 'calendar.labels.roleOngoing', color: '#3f51b5' },
    DONE: { nameKey: 'calendar.labels.roleDone', color: '#0b8043' },
    MEETING: { nameKey: 'calendar.labels.roleMeeting', color: '#8e24aa' },
};

/**
 * DER NAME EINES ETIKETTS STEHT IN DER DATENBANK — nicht in den
 * Übersetzungen (26.08.2026).
 *
 * Der Erstbestand legt ihn auf Deutsch an («Geplanter Termin»), und damit
 * stand die Leiste bisher auch dann deutsch da, wenn die Anwendung türkisch
 * lief: die vier Zeilen sind Daten des Mandanten, kein Text der Oberfläche.
 *
 * Darum die Unterscheidung: einen Namen, den KEIN Mensch gewählt hat — der
 * also noch genau so heisst, wie ihn der Server oder das «+» vorgeschlagen
 * haben —, zeigen wir in der Sprache des Benutzers. Wurde er umbenannt,
 * steht er, wie er getippt wurde: eine eigene Benennung wird nicht übersetzt.
 *
 * Die Liste führt die Vorgaben in ALLEN drei Sprachen, nicht nur der
 * deutschen: wer türkisch arbeitet und ein Etikett über das «+» anlegt,
 * speichert «Planlanan randevu» — und das soll dem deutschen Kollegen wieder
 * «Geplanter Termin» heissen.
 */
const CAL_LABEL_SEED_NAMES: Record<CalLabelRole, ReadonlyArray<string>> = {
    PLANNED: ['Geplanter Termin', 'Scheduled appointment', 'Planlanan randevu'],
    ONGOING: ['Laufender Termin', 'Ongoing appointment', 'Devam eden randevu'],
    DONE: ['Abgeschlossener Termin', 'Completed appointment', 'Tamamlanan randevu'],
    MEETING: ['Besprechung', 'Meeting', 'Toplantı'],
};

const foldLabelName = (value: string): string => value.trim().replace(/\s+/g, ' ').toLowerCase();

const CAL_LABEL_ROLE_BY_SEED = new Map<string, CalLabelRole>(
    CAL_LABEL_ROLES.flatMap((role) =>
        CAL_LABEL_SEED_NAMES[role].map((name) => [foldLabelName(name), role] as [string, CalLabelRole]),
    ),
);

/** Wie eine Rolle in der Sprache des Benutzers heisst. */
export const calLabelRoleName = (role: CalLabelRole): string => t(CAL_LABEL_ROLE_DEFAULTS[role].nameKey);

/**
 * Der Name eines Etiketts, wie er auf den Bildschirm gehört. `role` ist
 * freiwillig — ein Eintrag trägt nur seinen `labelName` mit sich, und auch
 * der soll übersetzt dastehen.
 */
export const calLabelName = (name: string | null | undefined, role: CalLabelRole | null = null): string => {
    const raw = (name ?? '').trim();
    const seeded = CAL_LABEL_ROLE_BY_SEED.get(foldLabelName(raw));
    if (seeded) return calLabelRoleName(seeded);
    return raw || (role ? calLabelRoleName(role) : '');
};

/** Dasselbe für ein ganzes Etikett. */
export const calLabelDisplayName = (label: { name: string; role: CalLabelRole | null }): string =>
    calLabelName(label.name, label.role);

const hexChannels = (hex: string): [number, number, number] | null => {
    const value = hex.trim().toLowerCase();
    const full = /^#[0-9a-f]{3}$/.test(value)
        ? `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`
        : value;
    if (!/^#[0-9a-f]{6}$/.test(full)) return null;
    return [
        parseInt(full.slice(1, 3), 16),
        parseInt(full.slice(3, 5), 16),
        parseInt(full.slice(5, 7), 16),
    ];
};

/**
 * SCHRIFT AUF EINER FREI GEWÄHLTEN FARBE. Wer ein Etikett gelb macht, darf
 * darauf keine weisse Schrift bekommen — die Karte wäre unlesbar. Gerechnet
 * wird mit der wahrgenommenen Helligkeit (Rec. 709), nicht mit dem Mittelwert
 * der drei Kanäle: Grün wirkt weit heller als Blau.
 */
export const labelInk = (color: string): string => {
    const rgb = hexChannels(color);
    if (!rgb) return '#ffffff';
    const [r, g, b] = rgb.map((channel) => channel / 255) as [number, number, number];
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return luminance > 0.62 ? '#202124' : '#ffffff';
};

/** Dieselbe Farbe eine Spur dunkler (bzw. heller) — die Fläche unter dem Zeiger. */
export const shadeColor = (color: string, amount: number): string => {
    const rgb = hexChannels(color);
    if (!rgb) return color;
    const shifted = rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel + amount))));
    return `#${shifted.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
};

/* Was die Karte an Etikett kennt — mehr braucht weder die Klasse noch der Stil. */
type LabelledEvent = { status: CalStatus; labelColor?: string | null };

/**
 * Die Klasse der Karte. Trägt der Eintrag ein Etikett, ist es IMMER dieselbe
 * (`--labelled`) und die Farbe reist als Eigenschaft mit; erst ohne Etikett
 * fällt sie auf die alte, aus dem Stand abgeleitete Klasse zurück.
 */
export const chipClass = (event: LabelledEvent) =>
    `ofi-ucal-chip ofi-ucal-chip--${event.labelColor ? 'labelled' : event.status}`;

/** Die Farbe der Karte als Stil — leer, wo die Klasse allein reicht. */
export const chipStyle = (event: LabelledEvent): CSSProperties | undefined => (
    event.labelColor ? labelSurface(event.labelColor) : undefined
);

/** Fläche, Schrift und Zeigerfläche einer Etikettfarbe — für Karte und Pille. */
export const labelSurface = (color: string): CSSProperties => ({
    ['--ofi-chip-bg' as string]: color,
    ['--ofi-chip-hover' as string]: shadeColor(color, -18),
    ['--ofi-chip-fg' as string]: labelInk(color),
});

/** Der Punkt vor einem Etikettnamen (Leiste, Auswahlfeld). */
export const dotStyle = (color: string): CSSProperties => ({ background: color });

export const dotClass = (status: CalStatus) => `ofi-ucal-dot ofi-ucal-dot--${status}`;

/* Eine AUFGABE ist im Raster kein Termin, und sie soll auch nicht wie einer
   aussehen: sie trägt einen Kreis vor dem Titel — offen ein Ring, erledigt ein
   Häkchen —, genau wie im Referenzkalender. Die Farbe allein reicht dafür
   nicht: Sage und Basil liegen dicht beieinander, und wer Farben schlecht
   unterscheidet, sähe zwei gleiche Balken. */
export const isTaskStatus = (status: CalStatus) => status === 'task' || status === 'taskDone';

/* ---- floating-card geometry ------------------------------------------------ */

/* Where a floating card should open. Only the STARTING point — once the card
   is dragged, its own position takes over and the anchor is never re-read. */
export type FloatAnchor = { left: number; top: number; right: number; bottom: number };

export const anchorFromRect = (rect: DOMRect): FloatAnchor => ({
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
});

/* Anchor at a bare pointer position (month cells, empty space). */
export const anchorFromPoint = (x: number, y: number): FloatAnchor => ({ left: x, top: y, right: x, bottom: y });

/* ---- Bildschirmgroesse ------------------------------------------------------
   Der Kalender baut sich auf drei Breiten unterschiedlich auf und die Bauteile
   muessen das WISSEN — nicht nur anders aussehen: unter 1024px wandert die
   Leiste in eine Schublade, auf dem Telefon startet die Ansicht beim TAG statt
   bei der Woche, und auf einem Finger-Bildschirm wird eine Karte erst nach
   einem HALTEN aufgenommen (sonst frisst jede Karte das Wischen).

   Die Schwellen sind dieselben, die die Anwendung sonst benutzt (index.css:
   639px Telefon, 1023px alles Schmale) — eine zweite Zahl waere ein zweiter
   Umbruchpunkt, den niemand pflegt. */
export type CalViewport = {
    /** < 640px — ein Telefon. */
    phone: boolean;
    /** < 1024px — Telefon ODER Tablet: die Leiste hat keinen Platz mehr. */
    compact: boolean;
    /** Finger statt Maus (auch auf einem grossen Tablet). */
    coarse: boolean;
};

const VIEWPORT_QUERIES: Record<keyof CalViewport, string> = {
    phone: '(max-width: 639px)',
    compact: '(max-width: 1023px)',
    coarse: '(pointer: coarse)',
};

const readViewport = (): CalViewport => {
    if (typeof window === 'undefined' || !window.matchMedia) return { phone: false, compact: false, coarse: false };
    return {
        phone: window.matchMedia(VIEWPORT_QUERIES.phone).matches,
        compact: window.matchMedia(VIEWPORT_QUERIES.compact).matches,
        coarse: window.matchMedia(VIEWPORT_QUERIES.coarse).matches,
    };
};

export const useCalViewport = (): CalViewport => {
    const [viewport, setViewport] = useState<CalViewport>(readViewport);
    useEffect(() => {
        if (!window.matchMedia) return;
        const lists = Object.values(VIEWPORT_QUERIES).map((query) => window.matchMedia(query));
        // Ein Zustand aus drei Abfragen: jede Aenderung liest ALLE neu, sonst
        // zerfaellt die Drehung eines Tablets in zwei Renderdurchgaenge mit
        // widerspruechlichen Werten (`compact` schon um, `phone` noch nicht).
        const onChange = () => setViewport(readViewport());
        for (const list of lists) list.addEventListener('change', onChange);
        return () => { for (const list of lists) list.removeEventListener('change', onChange); };
    }, []);
    return viewport;
};

/* ---- time-grid geometry ---------------------------------------------------- */

export const HOUR_HEIGHT = 54; // px per hour in the time grid
export const SNAP_MINUTES = 15; // drag/resize granularity
export const MIN_EVENT_MINUTES = 15;

/* Greedy column layout so overlapping events sit side by side in day/week. */
export type Positioned = { event: CalEvent; top: number; height: number; left: number; width: number };

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
            const box = eventBox(ev);
            const col = colOf.get(ev.id) ?? 0;
            out.push({
                event: ev,
                top: box.top,
                height: box.height,
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

/* Pixel box of one event inside a day column. Snapped to whole pixels: 54px per
   hour puts most starts on a fractional offset, and a block on a half pixel
   renders its 11px text blurry. The top and the BOTTOM round (not the height),
   so back-to-back events still meet exactly instead of drifting apart. */
export const eventBox = (event: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
    const startMin = minutesOf(event.start);
    const endMin = event.end.isAfter(event.start.endOf('day'))
        ? 24 * 60
        : Math.max(minutesOf(event.end), startMin + MIN_EVENT_MINUTES);
    const top = Math.round((startMin / 60) * HOUR_HEIGHT);
    const bottom = Math.round((endMin / 60) * HOUR_HEIGHT);
    return { top, height: Math.max(bottom - top - 2, 22) };
};

/* Pixel delta → snapped minutes. */
export const pixelsToMinutes = (pixels: number) =>
    Math.round((pixels / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;

export const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

/* A finished drag still produces a `click` on whatever the pointer was released
   over. Without this guard, dropping a card on empty space would immediately
   open the "new entry" popup underneath it. */
let lastDragEndAt = 0;
export const markDragEnd = () => { lastDragEndAt = Date.now(); };
export const justDragged = () => Date.now() - lastDragEndAt < 300;

/* ---- Zeigergeste: ziehen mit der MAUS, tippen und wischen mit dem FINGER ----

   Mit der Maus beginnt ein Zug beim ersten Ruck — vier Pixel genuegen, weil
   eine Maus nichts anderes tun kann.

   Mit dem FINGER wird eine Karte NICHT gezogen, und das ist eine bewusste
   Entscheidung, keine Luecke:

     · Damit eine Karte am Finger haengt, muesste auf ihr `touch-action: none`
       liegen. Dann laesst sich das Raster genau dort nicht mehr wischen, wo
       Termine stehen — und das ist die Flaeche, auf die man schaut. Auf einem
       Telefon ist Scrollen die Geste, die dauernd gebraucht wird.
     · Der uebliche Ausweg (nach einem HALTEN mit einem nicht-passiven
       `touchmove` das Scrollen unterdruecken) traegt hier nicht: Chrome
       entscheidet beim `touchstart` ein fuer alle Mal ueber die Geste und
       reicht sie an den Compositor. Das `preventDefault` DANACH wird zwar
       angenommen (`cancelable: true`, `defaultPrevented: true`) — der Browser
       schickt trotzdem `pointercancel` und scrollt weiter. Gemessen am
       19.08.2026 auf Chrome, mit und ohne im Voraus angemeldeten Zuhoerer.

   Also: Finger = tippen (Karte oeffnen) oder wischen (Raster scrollen).
   Verschieben und Verlaengern bleiben Mausgriffe — auf einem Tablet mit Maus
   oder Trackpad funktionieren sie unveraendert, denn entschieden wird pro
   Geste am `pointerType` und nicht am Geraet. */

/* Mit der Maus: ab hier ist es ein Zug und kein Klick. */
const MOUSE_THRESHOLD = 4;
/* Ein Daumen liegt nie ganz still. Unter diesen Pixeln bleibt es ein Tippen,
   darueber hat der Finger gewischt und die Geste gehoert dem Browser. */
const TAP_SLOP = 9;

export type PointerGesture = {
    /** Der Zug beginnt wirklich (nur Maus, beim ersten Ruck). */
    onDragStart?: () => void;
    /** Nur waehrend eines laufenden Zugs. */
    onDrag: (event: PointerEvent) => void;
    /** Ende. `dragged=false` heisst: getippt/geklickt, nichts verschoben. */
    onDrop: (dragged: boolean) => void;
    /** Der Finger hat gewischt: die Seite scrollt, die Karte bleibt liegen.
        `onDrop` kommt in diesem Fall NICHT — sonst oeffnete jedes Scrollen die
        Karte, ueber der der Finger startete. Der Aufrufer raeumt hier nur
        seinen eigenen Zustand ab. */
    onAbandon?: () => void;
};

/* Startet die Geste an einer Karte. Gibt `false` zurueck, wenn sie gar nicht
   erst angenommen wurde (falsche Maustaste) — der Aufrufer laesst dann alles
   wie es war. */
export const beginPointerGesture = (event: ReactPointerEvent<HTMLElement>, gesture: PointerGesture): boolean => {
    if (event.button !== 0) return false;
    const touch = event.pointerType !== 'mouse';
    const originX = event.clientX;
    const originY = event.clientY;

    event.stopPropagation();
    // Bei der Maus verhindert das die Textauswahl. Beim Finger NICHT: dort
    // gehoert die Geste dem Browser, der damit scrollt.
    if (!touch) event.preventDefault();

    let dragging = false;
    /* Nur fuer den Finger: hat er sich weiter bewegt als ein Tippen darf? */
    let swiped = false;

    const cleanup = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onCancel);
    };

    function onMove(moveEvent: PointerEvent) {
        const dx = Math.abs(moveEvent.clientX - originX);
        const dy = Math.abs(moveEvent.clientY - originY);
        if (touch) {
            if (dx > TAP_SLOP || dy > TAP_SLOP) swiped = true;
            return;
        }
        if (!dragging) {
            if (dx < MOUSE_THRESHOLD && dy < MOUSE_THRESHOLD) return;
            dragging = true;
            gesture.onDragStart?.();
        }
        gesture.onDrag(moveEvent);
    }

    function onUp() {
        cleanup();
        if (swiped) gesture.onAbandon?.();
        else gesture.onDrop(dragging);
    }

    /* Abbruch von aussen — beim Finger IMMER dann, wenn der Browser die Geste
       zum Scrollen an sich zieht. Nichts verschieben, nichts oeffnen. */
    function onCancel() {
        cleanup();
        if (dragging) gesture.onDrop(true);
        else gesture.onAbandon?.();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return true;
};

export const personName = (person?: { firstName?: string | null; lastName?: string | null } | null) =>
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

/* A CC entry from a plain address — an EMPLOYEE row when the staff id is known
   (so the picker recognises it), otherwise a free EMAIL entry. */
export const ccPersonFromEmail = (email: string, name?: string | null, id?: string | null): PickedPerson => (
    id
        ? { key: personKey('EMPLOYEE', id), type: 'EMPLOYEE', id, name: name || email, email }
        : { key: personKey('EMAIL', email.toLowerCase()), type: 'EMAIL', name: name || email, email }
);

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
