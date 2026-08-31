import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import {
    HOUR_HEIGHT,
    MIN_EVENT_MINUTES,
    SNAP_MINUTES,
    anchorFromRect,
    beginPointerGesture,
    chipClass,
    chipStyle,
    clamp,
    dayKey,
    draftDays,
    eventBox,
    gmtOffsetLabel,
    justDragged,
    markDragEnd,
    minutesOf,
    pixelsToMinutes,
    positionEvents,
    timeZoneId,
    useCalViewport,
    type CalEvent,
    type CalStatus,
    type DraftEntry,
    type FloatAnchor,
} from '../calendarShared';
import { ChipLabel } from './ChipLabel';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
const GUTTER = 58;
/* Telefon: sieben Spalten auf 360px waeren 43px je Tag — darin steht kein
   Titel mehr, nur noch ein Farbklecks. Ab hier bekommt jede Spalte ihre
   Mindestbreite und das Raster wird stattdessen SEITWAERTS geschoben; die
   Stundenspalte bleibt dabei am linken Rand stehen. */
const PHONE_MIN_COLUMN = 104;
/* Die schmale Stundenspalte des Telefons — "08:00" braucht keine 58px. */
const PHONE_GUTTER = 48;
/* A slot click creates a one-hour block, like the reference calendar. */
const DEFAULT_MINUTES = 60;
/* Einträge je Tag in der ganztägigen Zeile, bevor "+n weitere" übernimmt
   (Vorgabe 19.08.2026: nur ZWEI stehen da, der Rest auf Klick). */
const ALL_DAY_VISIBLE = 2;

type DragMode = 'move' | 'start' | 'end';
type DragTarget = { kind: 'event'; event: CalEvent } | { kind: 'draft' };

type DragState = {
    target: DragTarget;
    mode: DragMode;
    originX: number;
    originY: number;
    colWidth: number;
    dayIndex: number;
    baseStart: dayjs.Dayjs;
    baseEnd: dayjs.Dayjs;
    allDay: boolean;
    /* Gesetzt vom Zeigergriff: `false` heisst geklickt/getippt, nicht gezogen. */
    moved: boolean;
    preview: { start: dayjs.Dayjs; end: dayjs.Dayjs } | null;
    /* The element the drag started on — a plain click opens its detail. */
    element: HTMLElement;
};

/* What is currently being dragged, mirrored into state so the target column
   can draw the moving card wherever it lands. */
type Preview = { id: string; event: CalEvent | null; start: dayjs.Dayjs; end: dayjs.Dayjs; allDay: boolean };

const DRAFT_ID = '__draft__';
/* NACHTMONTAGE (24.08.2026, Vorgabe Samet: «eine Karte über zwei Tage soll EINE
   Karte bleiben»). Ein Termin von 20:00 bis 02:00 ist EIN Termin — im Raster
   wird er trotzdem zweimal gezeichnet: bis Mitternacht in seiner Spalte, ab
   Mitternacht oben in der nächsten. Das Anhängsel trägt diese Kennung; es ist
   kein eigener Eintrag, sondern die Fortsetzung desselben, und es lässt sich
   deshalb weder ziehen noch anfassen — angeklickt öffnet es die Karte, zu der
   es gehört. */
const CONTINUED = '__cont';
const isContinuation = (id: string) => id.endsWith(CONTINUED);
/* Der Entwurfsblock trägt seine eigene Farbe (Peacock) und nie den Kreis der
   Aufgaben: was gerade entsteht, ist noch keine Aufgabe — die Art wählt man
   erst im Fenster daneben. */
const DRAFT_STATUS: CalStatus = 'planned';

const timeLabel = (event: { start: dayjs.Dayjs; end: dayjs.Dayjs }) =>
    `${event.start.format('HH:mm')}–${event.end.format('HH:mm')}`;

/* Day / week time grid.
   Entries are draggable cards: grab the body to move an entry in time and
   ACROSS days, grab the top or bottom edge to shorten or lengthen it. Nothing
   is written until the pointer is released; a card that did not travel further
   than a few pixels counts as a click and opens its detail popup instead.

   The drag runs on WINDOW listeners, not pointer capture: the card that is
   being dragged is re-rendered (and may unmount from its source column) while
   the pointer is down, and an unmounted element cannot hold a capture. */
export const TimeGrid = ({ days, eventsByDay, now, draft, onOpenEvent, onOpenDay, onCreateAt, onReschedule, onDraftChange, onExtendDays, onExtendDraft }: {
    days: dayjs.Dayjs[];
    eventsByDay: Map<string, CalEvent[]>;
    now: dayjs.Dayjs;
    /* The entry being composed in the create popup — drawn live in the grid
       and dragged/resized like a real card; the popup follows. */
    draft: DraftEntry | null;
    onOpenEvent: (event: CalEvent, anchor: FloatAnchor) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
    /**
     * Clicking empty space places a one-hour block there and opens the popup.
     * DRAGGING sideways across the day columns picks SEVERAL days at once with
     * the same hours (user request 24.08.2026: "pick more than one day") — the
     * spans then arrive in `days`, one per picked day, and the popup lets each
     * of them have its own times afterwards.
     */
    onCreateAt?: (
        start: dayjs.Dayjs,
        end: dayjs.Dayjs,
        anchor: FloatAnchor,
        days?: Array<{ start: dayjs.Dayjs; end: dayjs.Dayjs }>,
    ) => void;
    /* Drop / resize result — the page persists it and reloads. */
    onReschedule?: (event: CalEvent, start: dayjs.Dayjs, end: dayjs.Dayjs) => void;
    onDraftChange?: (start: dayjs.Dayjs, end: dayjs.Dayjs) => void;
    /**
     * Seitlich an der Kante gezogen: der Einsatz soll von `firstDay` bis
     * `lastDay` laufen. Die neuen Tage übernehmen die Zeiten der gezogenen
     * Karte. Es wird nur AUSGEDEHNT, nie gekürzt (siehe `beginExtend`).
     */
    onExtendDays?: (event: CalEvent, firstDay: dayjs.Dayjs, lastDay: dayjs.Dayjs) => void;
    /** Dasselbe für den Entwurf, der noch gar nicht gespeichert ist. */
    onExtendDraft?: (firstDay: dayjs.Dayjs, lastDay: dayjs.Dayjs) => void;
}) => {
    const { phone } = useCalViewport();
    const scrollRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<DragState | null>(null);
    const [preview, setPreview] = useState<Preview | null>(null);
    /** Welcher Tag seine ganztägige Zeile aufgeklappt hat (Tagesschlüssel). */
    const [expandedDay, setExpandedDay] = useState<string | null>(null);

    useEffect(() => {
        // Open on the working day, not on midnight.
        if (scrollRef.current) scrollRef.current.scrollTop = Math.round(7.5 * HOUR_HEIGHT);
    }, []);


    const today = dayjs();
    const nowTop = (minutesOf(now) / 60) * HOUR_HEIGHT;
    const cols = days.length;
    /* Auf dem Telefon behaelt jede Tagesspalte ihre Mindestbreite: passen die
       sieben nicht mehr nebeneinander, wird das Raster seitwaerts geschoben
       statt die Titel wegzuquetschen. Der Tag (eine Spalte) braucht das nie. */
    const gutter = phone ? PHONE_GUTTER : GUTTER;
    const hscroll = phone && cols > 1;
    const gridMinWidth = hscroll ? gutter + cols * PHONE_MIN_COLUMN : undefined;
    const gridTemplateColumns = `${gutter}px repeat(${cols}, minmax(0, 1fr))`;
    const allDayByDay = days.map((day) => (eventsByDay.get(dayKey(day)) || []).filter((event) => event.allDay));
    const draftAllDayKey = draft?.allDay ? dayKey(preview?.id === DRAFT_ID ? preview.start : draft.start) : null;
    const hasAllDay = allDayByDay.some((list) => list.length > 0) || Boolean(draftAllDayKey);

    /* While an all-day chip is being dragged it leaves its own column and is
       drawn in the one under the pointer, so the target day is visible. */
    const allDayInColumn = (index: number): CalEvent[] => {
        const list = allDayByDay[index].filter((event) => event.id !== preview?.id);
        if (!preview?.event?.allDay || dayKey(preview.start) !== dayKey(days[index])) return list;
        return [...list, preview.event];
    };

    /* Die ganztägige Zeile zeigt je Tag nur ZWEI Einträge (Vorgabe 19.08.2026:
       vorher standen fünf, sechs oder mehr Aufgaben untereinander und drückten
       das Stundenraster nach unten). Der Rest steckt hinter "+n weitere"; ein
       Klick klappt genau diesen Tag auf, ein zweiter wieder zu. */
    const visible = (index: number, list: CalEvent[]) =>
        (expandedDay === dayKey(days[index]) ? list : list.slice(0, ALL_DAY_VISIBLE));

    /* ── dragging ─────────────────────────────────────────────────────────── */

    const finishDrag = useCallback((drag: DragState) => {
        setPreview(null);
        if (!drag.moved) {
            if (drag.target.kind === 'event') {
                const card = drag.element.closest('[data-cal-card]') as HTMLElement | null;
                onOpenEvent(drag.target.event, anchorFromRect((card ?? drag.element).getBoundingClientRect()));
            }
            return;
        }
        markDragEnd();
        const next = drag.preview;
        if (!next) return;
        if (next.start.isSame(drag.baseStart) && next.end.isSame(drag.baseEnd)) return;
        if (drag.target.kind === 'event') onReschedule?.(drag.target.event, next.start, next.end);
        else onDraftChange?.(next.start, next.end);
    }, [onOpenEvent, onReschedule, onDraftChange]);

    const beginDrag = (
        pointerEvent: React.PointerEvent<HTMLElement>,
        target: DragTarget,
        mode: DragMode,
        dayIndex: number,
        base: { start: dayjs.Dayjs; end: dayjs.Dayjs; allDay: boolean },
    ) => {
        if (dragRef.current) return;
        const element = pointerEvent.currentTarget as HTMLElement;
        const column = element.closest('[data-day-col]') as HTMLElement | null;
        const drag: DragState = {
            target,
            mode,
            originX: pointerEvent.clientX,
            originY: pointerEvent.clientY,
            colWidth: column?.getBoundingClientRect().width || 0,
            dayIndex,
            baseStart: base.start,
            baseEnd: base.end,
            allDay: base.allDay,
            moved: false,
            preview: null,
            element,
        };
        const id = target.kind === 'event' ? target.event.id : DRAFT_ID;
        const eventRef = target.kind === 'event' ? target.event : null;

        const onMove = (moveEvent: PointerEvent) => {
            const dx = moveEvent.clientX - drag.originX;
            const dy = moveEvent.clientY - drag.originY;

            // An all-day entry has no clock time — it only ever changes its day.
            const minutes = drag.allDay ? 0 : pixelsToMinutes(dy);
            let start = drag.baseStart;
            let end = drag.baseEnd;

            if (drag.mode === 'move') {
                const shift = drag.colWidth > 0
                    ? clamp(Math.round(dx / drag.colWidth), -drag.dayIndex, cols - 1 - drag.dayIndex)
                    : 0;
                const length = drag.baseEnd.diff(drag.baseStart, 'minute');
                start = drag.baseStart.add(shift, 'day').add(minutes, 'minute');
                // A card never spills into the next day — the last possible start
                // is the one that lets it end at midnight.
                const dayStart = start.startOf('day');
                const latest = dayStart.add(24 * 60 - length, 'minute');
                if (start.isBefore(dayStart)) start = dayStart;
                if (start.isAfter(latest)) start = latest;
                end = start.add(length, 'minute');
            } else if (drag.mode === 'start') {
                const limit = drag.baseEnd.subtract(MIN_EVENT_MINUTES, 'minute');
                start = drag.baseStart.add(minutes, 'minute');
                if (start.isBefore(drag.baseStart.startOf('day'))) start = drag.baseStart.startOf('day');
                if (start.isAfter(limit)) start = limit;
            } else {
                /* NACHTSCHICHT (24.08.2026): das untere Ende darf über
                   Mitternacht hinaus — die Karte läuft dann in der nächsten
                   Spalte weiter und bleibt EIN Termin. Die Grenze ist die
                   Länge (24 Stunden), nicht der Tageswechsel; dieselbe Regel
                   prüft der Server. */
                const limit = drag.baseStart.add(MIN_EVENT_MINUTES, 'minute');
                const longest = drag.baseStart.add(24, 'hour');
                end = drag.baseEnd.add(minutes, 'minute');
                if (end.isAfter(longest)) end = longest;
                if (end.isBefore(limit)) end = limit;
            }

            drag.preview = { start, end };
            setPreview({ id, event: eventRef, start, end, allDay: drag.allDay });
        };

        /* Maus: der Zug beginnt beim ersten Ruck. Finger: getippt wird die
           Karte geoeffnet, gewischt wird gescrollt (siehe
           `beginPointerGesture`). */
        const started = beginPointerGesture(pointerEvent, {
            onDrag: onMove,
            onDrop: (dragged) => {
                dragRef.current = null;
                drag.moved = dragged;
                finishDrag(drag);
            },
            onAbandon: () => {
                dragRef.current = null;
                setPreview(null);
            },
        });
        if (started) dragRef.current = drag;
    };

    /* ── mehrere Tage auf einmal wählen ───────────────────────────────────
       Ziehen über die leere Fläche: nach UNTEN wächst die Zeitspanne, zur
       SEITE kommen weitere Tage dazu (Vorgabe 24.08.2026 — «man soll mehrere
       Tage auf einmal auswählen können»). Alle gewählten Tage bekommen
       zunächst dieselben Zeiten; im Fenster daneben lässt sich danach jeder
       Tag einzeln verstellen — das ist der übliche Weg («Mo–Do, jeweils
       08:00–17:00, freitags nur bis 12:00»).

       Ein KLICK bleibt, was er war: ein Block von einer Stunde. Unterschieden
       wird an der zurückgelegten Strecke, nicht an der Zeit — deshalb derselbe
       Zeigergriff wie bei den Karten (Maus zieht, Finger tippt und wischt). */
    const selectRef = useRef<{ fromDay: number; toDay: number; fromMin: number; toMin: number } | null>(null);
    const [selection, setSelection] = useState<{ fromDay: number; toDay: number; fromMin: number; toMin: number } | null>(null);

    const snapMinutes = (value: number) =>
        clamp(Math.round(value / SNAP_MINUTES) * SNAP_MINUTES, 0, 24 * 60);

    const beginSelect = (pointerEvent: React.PointerEvent<HTMLElement>, dayIndex: number) => {
        if (dragRef.current || selectRef.current) return;
        const column = (pointerEvent.currentTarget as HTMLElement).closest('[data-day-col]') as HTMLElement | null;
        if (!column) return;
        const rect = column.getBoundingClientRect();
        const originMinute = snapMinutes(((pointerEvent.clientY - rect.top) / HOUR_HEIGHT) * 60);
        const state = { fromDay: dayIndex, toDay: dayIndex, fromMin: originMinute, toMin: originMinute + 60 };

        const started = beginPointerGesture(pointerEvent, {
            onDragStart: () => {
                selectRef.current = state;
                setSelection({ ...state });
            },
            onDrag: (moveEvent) => {
                const shift = rect.width > 0
                    ? clamp(Math.round((moveEvent.clientX - pointerEvent.clientX) / rect.width), -dayIndex, cols - 1 - dayIndex)
                    : 0;
                const minute = snapMinutes(((moveEvent.clientY - rect.top) / HOUR_HEIGHT) * 60);
                state.toDay = dayIndex + shift;
                // Nach oben ziehen ist erlaubt; getauscht wird beim Loslassen.
                state.toMin = minute <= originMinute
                    ? Math.min(minute, originMinute - MIN_EVENT_MINUTES)
                    : Math.max(minute, originMinute + MIN_EVENT_MINUTES);
                selectRef.current = state;
                setSelection({ ...state });
            },
            onDrop: (dragged) => {
                selectRef.current = null;
                setSelection(null);
                if (!dragged) return;
                // Ein Zug endet NICHT als Klick: sonst legte das Loslassen
                // zusätzlich den Ein-Stunden-Block der leeren Fläche an.
                markDragEnd();
                const firstDay = Math.min(state.fromDay, state.toDay);
                const lastDay = Math.max(state.fromDay, state.toDay);
                const startMin = clamp(Math.min(state.fromMin, state.toMin), 0, 24 * 60 - MIN_EVENT_MINUTES);
                const endMin = clamp(Math.max(state.fromMin, state.toMin), startMin + MIN_EVENT_MINUTES, 24 * 60);
                const spans = [];
                for (let index = firstDay; index <= lastDay; index += 1) {
                    const base = days[index]!.startOf('day');
                    spans.push({ start: base.add(startMin, 'minute'), end: base.add(endMin, 'minute') });
                }
                const top = (startMin / 60) * HOUR_HEIGHT;
                onCreateAt?.(
                    spans[0]!.start,
                    spans[0]!.end,
                    {
                        left: rect.left,
                        right: rect.right,
                        top: rect.top + top,
                        bottom: rect.top + top + ((endMin - startMin) / 60) * HOUR_HEIGHT,
                    },
                    spans.length > 1 ? spans : undefined,
                );
            },
            onAbandon: () => {
                selectRef.current = null;
                setSelection(null);
            },
        });
        if (!started) return;
    };

    /* Was in einer Spalte gerade markiert ist — beim Ziehen der Vorschlag, sonst
       der Entwurf, der schon im Fenster steht. */
    const selectionBox = (dayIndex: number) => {
        if (!selection) return null;
        const first = Math.min(selection.fromDay, selection.toDay);
        const last = Math.max(selection.fromDay, selection.toDay);
        if (dayIndex < first || dayIndex > last) return null;
        const startMin = Math.min(selection.fromMin, selection.toMin);
        const endMin = Math.max(selection.fromMin, selection.toMin);
        const base = days[dayIndex]!.startOf('day');
        return { start: base.add(startMin, 'minute'), end: base.add(endMin, 'minute') };
    };

    /* ── seitwärts ausdehnen: aus einem Tag werden mehrere ────────────────
       Vorgabe 24.08.2026 («die Möglichkeit, seitlich zu erweitern»): die
       schmale Kante links und rechts an einer Karte zieht den Einsatz auf
       WEITERE TAGE. Die neuen Tage übernehmen die Zeiten der gezogenen Karte;
       verstellt werden sie danach einzeln — im Fenster «Tage», wo jeder Tag
       seine eigene Zeile hat.

       AUSGEDEHNT WIRD NUR, NIE GEKÜRZT. Am Kürzen hinge das Streichen eines
       Tages, und an einem Tag hängen Rapport, Spesen und Material — das darf
       kein Zug am Kartenrand nebenbei erledigen. Wer einen Tag loswerden will,
       nimmt den Papierkorb in der Tagesliste. */
    const beginExtend = (
        pointerEvent: React.PointerEvent<HTMLElement>,
        target: DragTarget,
        dayIndex: number,
        side: 'left' | 'right',
        span: { start: dayjs.Dayjs; end: dayjs.Dayjs },
    ) => {
        if (dragRef.current || selectRef.current) return;
        const column = (pointerEvent.currentTarget as HTMLElement).closest('[data-day-col]') as HTMLElement | null;
        if (!column) return;
        const rect = column.getBoundingClientRect();
        let reach = dayIndex;

        const started = beginPointerGesture(pointerEvent, {
            onDragStart: () => setSelection(null),
            onDrag: (moveEvent) => {
                const shift = rect.width > 0
                    ? clamp(Math.round((moveEvent.clientX - pointerEvent.clientX) / rect.width), -dayIndex, cols - 1 - dayIndex)
                    : 0;
                // Nach der falschen Seite ziehen tut nichts — die Karte bleibt,
                // wie sie ist, statt sich zu verkürzen.
                reach = side === 'right'
                    ? Math.max(dayIndex, dayIndex + shift)
                    : Math.min(dayIndex, dayIndex + shift);
                const minute = minutesOf(span.start);
                const endMinute = minutesOf(span.end) || 24 * 60;
                setSelection({
                    fromDay: Math.min(dayIndex, reach),
                    toDay: Math.max(dayIndex, reach),
                    fromMin: minute,
                    toMin: Math.max(endMinute, minute + MIN_EVENT_MINUTES),
                });
            },
            onDrop: (dragged) => {
                setSelection(null);
                if (!dragged) return;
                markDragEnd();
                if (reach === dayIndex) return;
                const first = days[Math.min(dayIndex, reach)]!;
                const last = days[Math.max(dayIndex, reach)]!;
                if (target.kind === 'event') onExtendDays?.(target.event, first, last);
                else onExtendDraft?.(first, last);
            },
            onAbandon: () => setSelection(null),
        });
        if (!started) return;
    };

    /* ── one positioned card ──────────────────────────────────────────────── */

    const renderCard = (
        key: string,
        target: DragTarget,
        box: { top: number; height: number; left: number; width: number },
        dayIndex: number,
        span: { start: dayjs.Dayjs; end: dayjs.Dayjs },
        options: { ghost?: boolean; draggable: boolean; extendable?: boolean; className: string; style?: CSSProperties; status: CalStatus; title: string; subtitle?: string; onKeyOpen?: (element: HTMLElement) => void },
    ) => {
        const compact = box.height < 42;
        const base = { start: span.start, end: span.end, allDay: false };
        return (
            <div
                key={key}
                data-cal-card
                style={{
                    top: box.top,
                    height: box.height,
                    left: `calc(${box.left}% + 2px)`,
                    width: `calc(${box.width}% - 4px)`,
                }}
                className={`ofi-cal-card ${options.ghost ? 'is-ghost' : ''} ${options.draggable ? 'is-draggable' : ''}`}
            >
                <div
                    role="button"
                    tabIndex={0}
                    title={`${timeLabel(span)} · ${options.title}`}
                    onPointerDown={(pointerEvent) => beginDrag(pointerEvent, target, 'move', dayIndex, base)}
                    onKeyDown={(keyEvent) => {
                        if (keyEvent.key !== 'Enter' && keyEvent.key !== ' ') return;
                        keyEvent.preventDefault();
                        options.onKeyOpen?.(keyEvent.currentTarget);
                    }}
                    className={options.className}
                    style={options.style}
                >
                    <ChipLabel
                        status={options.status}
                        title={options.title}
                        meta={compact ? null : `${timeLabel(span)}${options.subtitle ? ` · ${options.subtitle}` : ''}`}
                    />
                </div>
                {options.draggable && (
                    <>
                        <span
                            className="ofi-cal-card__handle is-top"
                            title={t('calendar.grid.resizeHint')}
                            onPointerDown={(pointerEvent) => beginDrag(pointerEvent, target, 'start', dayIndex, base)}
                        />
                        <span
                            className="ofi-cal-card__handle is-bottom"
                            title={t('calendar.grid.resizeHint')}
                            onPointerDown={(pointerEvent) => beginDrag(pointerEvent, target, 'end', dayIndex, base)}
                        />
                    </>
                )}
                {options.extendable && cols > 1 && (
                    <>
                        <span
                            className="ofi-cal-card__handle is-left"
                            title={t('calendar.days.extendHint')}
                            onPointerDown={(pointerEvent) => beginExtend(pointerEvent, target, dayIndex, 'left', span)}
                        />
                        <span
                            className="ofi-cal-card__handle is-right"
                            title={t('calendar.days.extendHint')}
                            onPointerDown={(pointerEvent) => beginExtend(pointerEvent, target, dayIndex, 'right', span)}
                        />
                    </>
                )}
            </div>
        );
    };

    const draftTitle = draft?.title?.trim() || t('calendar.create.untitled');

    return (
        <div ref={scrollRef} className={`ofi-cal-scroll ${hscroll ? 'is-hscroll' : ''}`}>
            <div className="ofi-cal-head" style={{ minWidth: gridMinWidth }}>
                <div className="ofi-cal-headrow grid" style={{ gridTemplateColumns }}>
                    {/* Time zone read-out — taken from the browser, so a traveller
                        or a tenant abroad sees the zone the times are shown in. */}
                    <div className="ofi-cal-tz ofi-cal-gutter" title={timeZoneId() || undefined}>
                        <span>{gmtOffsetLabel()}</span>
                    </div>
                    {days.map((day) => {
                        const isToday = dayKey(day) === dayKey(today);
                        return (
                            <button
                                key={dayKey(day)}
                                type="button"
                                onClick={() => onOpenDay(day)}
                                className="ofi-cal-daybtn"
                            >
                                <span className={`ofi-cal-daybtn__name ${isToday ? 'is-today' : ''}`}>{day.format('ddd')}</span>
                                <span className={`ofi-cal-daybtn__num ${isToday ? 'is-today' : ''}`}>
                                    {day.format(cols === 1 ? 'DD MMM' : 'D')}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {hasAllDay && (
                    <div className="ofi-cal-allday grid" style={{ gridTemplateColumns }}>
                        <div className="ofi-cal-allday__label ofi-cal-gutter">{t('calendar.allDay')}</div>
                        {days.map((day, index) => (
                            <div key={dayKey(day)} data-day-col className="ofi-cal-allday__col">
                                {visible(index, allDayInColumn(index)).map((event) => (
                                    <div
                                        key={event.id}
                                        data-cal-card
                                        role="button"
                                        tabIndex={0}
                                        title={event.title}
                                        onPointerDown={(pointerEvent) => beginDrag(
                                            pointerEvent,
                                            { kind: 'event', event },
                                            'move',
                                            index,
                                            { start: event.start, end: event.end, allDay: true },
                                        )}
                                        className={`${chipClass(event)} is-allday ${event.editable && onReschedule ? 'is-draggable' : ''} ${preview?.id === event.id ? 'is-dragging' : ''}`}
                                        style={chipStyle(event)}
                                    >
                                        <ChipLabel status={event.status} title={event.title} />
                                    </div>
                                ))}
                                {draft && draftAllDayKey === dayKey(day) && (
                                    <div
                                        data-cal-card
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={(pointerEvent) => beginDrag(
                                            pointerEvent,
                                            { kind: 'draft' },
                                            'move',
                                            index,
                                            { start: draft.start, end: draft.end, allDay: true },
                                        )}
                                        className="ofi-ucal-chip ofi-ucal-chip--draft is-allday is-draggable"
                                    >
                                        <ChipLabel status={DRAFT_STATUS} title={draftTitle} />
                                    </div>
                                )}
                                {/* "+n weitere" bzw. "weniger" — klappt NUR diesen Tag. */}
                                {allDayInColumn(index).length > ALL_DAY_VISIBLE && (
                                    <button
                                        type="button"
                                        onPointerDown={(pointerEvent) => pointerEvent.stopPropagation()}
                                        onClick={(clickEvent) => {
                                            clickEvent.stopPropagation();
                                            const key = dayKey(day);
                                            setExpandedDay((current) => (current === key ? null : key));
                                        }}
                                        className="ofi-cal-allday__more"
                                    >
                                        {expandedDay === dayKey(day)
                                            ? t('calendar.less')
                                            : t('calendar.more', { count: allDayInColumn(index).length - ALL_DAY_VISIBLE })}
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid" style={{ gridTemplateColumns, minWidth: gridMinWidth }}>
                <div className="ofi-cal-gutter relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                    {HOURS.map((hour) => (
                        <div key={hour} className="ofi-cal-hourlabel" style={{ top: hour * HOUR_HEIGHT }}>
                            {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                        </div>
                    ))}
                </div>

                {days.map((day, dayIndex) => {
                    const key = dayKey(day);
                    const timed = (eventsByDay.get(key) || []).filter((event) => !event.allDay);
                    /* Was aus dem Vortag herüberreicht: eine Schicht, die über
                       Mitternacht läuft, gehört als Fortsetzung an den Anfang
                       dieser Spalte — dieselbe Karte, nur weitergezeichnet. */
                    const midnight = day.startOf('day');
                    const spilling = (eventsByDay.get(dayKey(day.subtract(1, 'day'))) || [])
                        .filter((event) => !event.allDay && event.end.isAfter(midnight) && event.id !== preview?.id);
                    const originals = new Map(spilling.map((event) => [`${event.id}${CONTINUED}`, event]));
                    const continued = spilling.map((event) => ({ ...event, id: `${event.id}${CONTINUED}`, start: midnight, editable: false }));
                    const positioned = positionEvents([
                        ...(preview ? timed.filter((event) => event.id !== preview.id) : timed),
                        ...continued,
                    ]);
                    const isToday = key === dayKey(today);
                    const ghostHere = preview && preview.event && !preview.allDay && dayKey(preview.start) === key ? preview.event : null;
                    /* Die Blöcke des Entwurfs. Ein EINTÄGIGER Entwurf lässt sich
                       im Raster ziehen (beim Ziehen steht er an der Vorschau-
                       stelle); ein mehrtägiger nicht: seine Tage haben eigene
                       Zeiten, und ein Zug müsste raten, was mit den anderen
                       geschieht. Er wird im Fenster daneben verstellt, Tag für
                       Tag — dort steht die Zeile ohnehin schon. */
                    const spans = draft && !draft.allDay ? draftDays(draft) : [];
                    const multiDay = spans.length > 1;
                    const draftHere = spans
                        .map((span, index) => (
                            !multiDay && preview?.id === DRAFT_ID ? { start: preview.start, end: preview.end, index } : { ...span, index }
                        ))
                        .find((span) => dayKey(span.start) === key) || null;
                    const marquee = selectionBox(dayIndex);
                    /* Auch ein ENTWURF darf über Mitternacht laufen: sein Rest
                       steht oben in dieser Spalte, damit man beim Anlegen
                       sieht, dass es EIN Block über zwei Tage ist. */
                    const draftSpill = spans.find((span) => !span.end.isSame(span.start, 'day') && dayKey(span.start.add(1, 'day')) === key) || null;

                    return (
                        <div key={key} data-day-col className="ofi-cal-col" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                            {HOURS.map((hour) => (
                                <div key={hour} className="ofi-cal-hourline" style={{ top: hour * HOUR_HEIGHT }} />
                            ))}

                            {/* Empty space is the create surface: one click drops a
                                one-hour block on that half hour and opens the popup
                                beside it. No hover decoration — the block IS the cue. */}
                            {onCreateAt && (
                                <div
                                    className="ofi-cal-newlayer"
                                    onPointerDown={(pointerEvent) => beginSelect(pointerEvent, dayIndex)}
                                    onClick={(clickEvent) => {
                                        if (justDragged()) return;
                                        const rect = clickEvent.currentTarget.getBoundingClientRect();
                                        const slot = clamp(Math.floor((clickEvent.clientY - rect.top) / (HOUR_HEIGHT / 2)), 0, 47);
                                        const start = day.hour(Math.floor(slot / 2)).minute(slot % 2 ? 30 : 0).second(0).millisecond(0);
                                        const latest = day.startOf('day').add(24 * 60 - DEFAULT_MINUTES, 'minute');
                                        const clampedStart = start.isAfter(latest) ? latest : start;
                                        const end = clampedStart.add(DEFAULT_MINUTES, 'minute');
                                        const top = (minutesOf(clampedStart) / 60) * HOUR_HEIGHT;
                                        onCreateAt(clampedStart, end, {
                                            left: rect.left,
                                            right: rect.right,
                                            top: rect.top + top,
                                            bottom: rect.top + top + (DEFAULT_MINUTES / 60) * HOUR_HEIGHT,
                                        });
                                    }}
                                />
                            )}

                            {isToday && (
                                <div className="ofi-cal-now" style={{ top: nowTop }}>
                                    <span className="ofi-cal-now__dot" />
                                    <span className="ofi-cal-now__line" />
                                </div>
                            )}

                            {positioned.map((position) => (isContinuation(position.event.id)
                                /* Die Fortsetzung einer Nachtmontage: keine Griffe,
                                   kein Ziehen — ein Klick öffnet die Karte, zu der
                                   sie gehört. Oben ist sie offen (kein Rand), damit
                                   sie mit dem Stück von gestern eine Karte ergibt. */
                                ? (
                                    <div
                                        key={position.event.id}
                                        data-cal-card
                                        style={{
                                            top: position.top,
                                            height: position.height,
                                            left: `calc(${position.left}% + 2px)`,
                                            width: `calc(${position.width}% - 4px)`,
                                        }}
                                        className="ofi-cal-card"
                                    >
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            title={`${timeLabel({ start: position.event.start, end: position.event.end })} · ${position.event.title}`}
                                            onClick={(clickEvent) => {
                                                if (justDragged()) return;
                                                clickEvent.stopPropagation();
                                                const source = originals.get(position.event.id);
                                                if (source) onOpenEvent(source, anchorFromRect(clickEvent.currentTarget.getBoundingClientRect()));
                                            }}
                                            className={`${chipClass(position.event)} is-continued`}
                                            style={chipStyle(position.event)}
                                        >
                                            <ChipLabel
                                                status={position.event.status}
                                                title={position.event.title}
                                                meta={position.height < 42 ? null : `${t('calendar.days.continued')} · ${position.event.end.format('HH:mm')}`}
                                            />
                                        </div>
                                    </div>
                                )
                                : renderCard(
                                position.event.id,
                                { kind: 'event', event: position.event },
                                { top: position.top, height: position.height, left: position.left, width: position.width },
                                dayIndex,
                                { start: position.event.start, end: position.event.end },
                                {
                                    draggable: Boolean(position.event.editable && onReschedule),
                                    /* Nur ein EINSATZ kennt weitere Tage: eine
                                       Besprechung oder eine Wartung hat keine
                                       Serie, an die sich etwas anhängen liesse. */
                                    extendable: Boolean(position.event.editable && onExtendDays && position.event.category === 'appointments'),
                                    // Läuft die Karte über Mitternacht, endet sie
                                    // hier ohne untere Kante — sie geht in der
                                    // nächsten Spalte weiter.
                                    className: `${chipClass(position.event)}${position.event.end.isAfter(position.event.start.endOf('day')) ? ' is-continues' : ''}`,
                                    style: chipStyle(position.event),
                                    status: position.event.status,
                                    title: position.event.title,
                                    subtitle: position.event.subtitle,
                                    onKeyOpen: (element) => onOpenEvent(position.event, anchorFromRect(element.getBoundingClientRect())),
                                },
                            )))}

                            {/* The card under the pointer, drawn where it would land
                                (it may have travelled here from another column). */}
                            {ghostHere && preview && renderCard(
                                `${ghostHere.id}-ghost`,
                                { kind: 'event', event: ghostHere },
                                { ...eventBox(preview), left: 0, width: 100 },
                                dayIndex,
                                { start: preview.start, end: preview.end },
                                { ghost: true, draggable: false, className: chipClass(ghostHere), style: chipStyle(ghostHere), status: ghostHere.status, title: ghostHere.title, subtitle: ghostHere.subtitle },
                            )}

                            {/* Der Zug über die leere Fläche: die künftigen Tage
                                stehen schon da, während der Zeiger noch läuft. */}
                            {marquee && (
                                <div
                                    className="ofi-cal-card is-ghost"
                                    style={{ ...eventBox(marquee), left: 2, right: 2 }}
                                >
                                    <div className="ofi-ucal-chip ofi-ucal-chip--draft">
                                        <ChipLabel status={DRAFT_STATUS} title={draftTitle} meta={timeLabel(marquee)} />
                                    </div>
                                </div>
                            )}

                            {draftSpill && !marquee && (
                                <div
                                    className="ofi-cal-card"
                                    style={{ ...eventBox({ start: midnight, end: draftSpill.end }), left: 2, right: 2 }}
                                >
                                    <div className="ofi-ucal-chip ofi-ucal-chip--draft is-continued">
                                        <ChipLabel status={DRAFT_STATUS} title={draftTitle} meta={`${t('calendar.days.continued')} · ${draftSpill.end.format('HH:mm')}`} />
                                    </div>
                                </div>
                            )}

                            {draftHere && !marquee && renderCard(
                                `${DRAFT_ID}-${draftHere.index}`,
                                { kind: 'draft' },
                                { ...eventBox(draftHere), left: 0, width: 100 },
                                dayIndex,
                                draftHere,
                                {
                                    draggable: Boolean(onDraftChange) && !multiDay,
                                    // Auch der noch nicht gespeicherte Entwurf
                                    // lässt sich seitlich auf weitere Tage ziehen.
                                    extendable: Boolean(onExtendDraft) && draftHere.index === (multiDay ? spans.length - 1 : 0),
                                    className: `ofi-ucal-chip ofi-ucal-chip--draft${draftHere.end.isAfter(draftHere.start.endOf('day')) ? ' is-continues' : ''}`,
                                    status: DRAFT_STATUS,
                                    title: draftTitle,
                                    // "Tag 2" statt der blossen Uhrzeit: bei vier
                                    // gleich aussehenden Blöcken ist die Nummer
                                    // die einzige Auskunft, die noch fehlt.
                                    subtitle: multiDay ? t('calendar.days.dayNumber', { index: draftHere.index + 1 }) : undefined,
                                },
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
