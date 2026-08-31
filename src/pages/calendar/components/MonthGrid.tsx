import { useRef, useState } from 'react';
import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import {
    anchorFromPoint,
    anchorFromRect,
    beginPointerGesture,
    chipClass,
    chipStyle,
    dayKey,
    draftDays,
    justDragged,
    markDragEnd,
    type CalEvent,
    type CalStatus,
    type DraftEntry,
    type FloatAnchor,
} from '../calendarShared';
import { ChipLabel } from './ChipLabel';

/* Wie im Wochenraster: der Entwurf traegt nie den Kreis der Aufgaben. */
const DRAFT_STATUS: CalStatus = 'planned';
/* Chips je Tageszelle, bevor "+n weitere" uebernimmt (Vorgabe 19.08.2026:
   nur ZWEI stehen da). */
const MONTH_VISIBLE = 2;

type DragTarget = { kind: 'event'; event: CalEvent } | { kind: 'draft' };

/* Month grid. Entries move between days by dragging them onto another cell —
   the cell under the pointer is found by hit-testing, so the card follows the
   pointer across rows as well as columns. Clicking empty space in a cell starts
   a new entry on that day. Drags run on window listeners (see TimeGrid). */
export const MonthGrid = ({ anchor, range, eventsByDay, selectedDay, now, draft, onSelectDay, onOpenDay, onOpenEvent, onCreateDay, onReschedule, onDraftChange }: {
    anchor: dayjs.Dayjs;
    range: { start: dayjs.Dayjs; end: dayjs.Dayjs };
    eventsByDay: Map<string, CalEvent[]>;
    selectedDay: dayjs.Dayjs;
    now: dayjs.Dayjs;
    draft: DraftEntry | null;
    onSelectDay: (day: dayjs.Dayjs) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
    onOpenEvent: (event: CalEvent, popupAnchor: FloatAnchor) => void;
    /**
     * Ein Klick legt einen Eintrag auf DIESEN Tag. Ein Zug über mehrere Zellen
     * gibt zusätzlich `throughDay` mit — dann entsteht ein mehrtägiger Einsatz
     * von `day` bis `throughDay` (Vorgabe 24.08.2026).
     */
    onCreateDay?: (day: dayjs.Dayjs, popupAnchor: FloatAnchor, throughDay?: dayjs.Dayjs) => void;
    onReschedule?: (event: CalEvent, start: dayjs.Dayjs, end: dayjs.Dayjs) => void;
    onDraftChange?: (start: dayjs.Dayjs, end: dayjs.Dayjs) => void;
}) => {
    const days = Array.from({ length: 42 }, (_, index) => range.start.add(index, 'day'));
    const weekDays = Array.from({ length: 7 }, (_, index) => range.start.add(index, 'day').format('ddd'));

    const dragging = useRef(false);
    const [dropKey, setDropKey] = useState<string | null>(null);

    const beginDrag = (pointerEvent: React.PointerEvent<HTMLElement>, target: DragTarget, span: { start: dayjs.Dayjs; end: dayjs.Dayjs }) => {
        if (dragging.current) return;
        const element = pointerEvent.currentTarget as HTMLElement;
        const movable = target.kind === 'draft' ? Boolean(onDraftChange) : Boolean(target.event.editable && onReschedule);
        let targetKey: string | null = null;

        /* Maus: ziehen ab dem ersten Ruck. Finger: tippen oeffnet, wischen
           scrollt (siehe `beginPointerGesture`). */
        const started = beginPointerGesture(pointerEvent, {
            onDrag: (moveEvent) => {
                if (!movable) return;
                // The cell under the pointer is hit-tested: the chip itself does not
                // move, so `target` of the event would always be the chip.
                const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
                const cell = under?.closest('[data-month-day]') as HTMLElement | null;
                targetKey = cell?.dataset.monthDay || null;
                setDropKey(targetKey);
            },
            onDrop: (dragged) => {
                dragging.current = false;
                setDropKey(null);
                // Eine Karte, die diese Person nicht verschieben darf, kennt nur
                // eine Geste: die Karte oeffnen.
                if (!dragged || !movable) {
                    if (target.kind === 'event') onOpenEvent(target.event, anchorFromRect(element.getBoundingClientRect()));
                    return;
                }
                markDragEnd();
                if (!targetKey) return;
                const shift = dayjs(targetKey).startOf('day').diff(span.start.startOf('day'), 'day');
                if (!shift) return;
                if (target.kind === 'event') onReschedule?.(target.event, span.start.add(shift, 'day'), span.end.add(shift, 'day'));
                else onDraftChange?.(span.start.add(shift, 'day'), span.end.add(shift, 'day'));
            },
            onAbandon: () => {
                dragging.current = false;
                setDropKey(null);
            },
        });
        if (started) dragging.current = true;
    };

    /* MEHRERE TAGE AUF EINMAL (24.08.2026): über die Zellen ziehen. Ein Klick
       bleibt ein Klick — unterschieden wird an der Strecke, nicht an der Zeit
       (derselbe Zeigergriff wie bei den Karten: Maus zieht, Finger tippt). */
    const [span, setSpan] = useState<{ from: string; to: string } | null>(null);

    const beginSelect = (pointerEvent: React.PointerEvent<HTMLElement>, day: dayjs.Dayjs) => {
        if (dragging.current || !onCreateDay) return;
        const from = dayKey(day);
        let to = from;
        const started = beginPointerGesture(pointerEvent, {
            onDragStart: () => setSpan({ from, to }),
            onDrag: (moveEvent) => {
                const under = document.elementFromPoint(moveEvent.clientX, moveEvent.clientY) as HTMLElement | null;
                const cell = under?.closest('[data-month-day]') as HTMLElement | null;
                if (!cell?.dataset.monthDay) return;
                to = cell.dataset.monthDay;
                setSpan({ from, to });
            },
            onDrop: (dragged) => {
                dragging.current = false;
                setSpan(null);
                if (!dragged) return;
                // Ein Zug ist kein Klick — sonst öffnete das Loslassen zusätzlich
                // den Eintrag für den einen Tag darunter.
                markDragEnd();
                const first = dayjs(from).isAfter(dayjs(to)) ? dayjs(to) : dayjs(from);
                const last = dayjs(from).isAfter(dayjs(to)) ? dayjs(from) : dayjs(to);
                onSelectDay(first);
                onCreateDay(first, anchorFromPoint(pointerEvent.clientX, pointerEvent.clientY), last.isSame(first, 'day') ? undefined : last);
            },
            onAbandon: () => {
                dragging.current = false;
                setSpan(null);
            },
        });
        if (started) dragging.current = true;
    };

    const inSpan = (key: string) => {
        if (!span) return false;
        const first = span.from <= span.to ? span.from : span.to;
        const last = span.from <= span.to ? span.to : span.from;
        return key >= first && key <= last;
    };

    /* Der Entwurf steht auf JEDEM seiner Tage — bei einem mehrtägigen Einsatz
       sieht man die ganze Reihe im Blatt, nicht nur den ersten Tag. */
    const draftSpans = draftDays(draft);
    const draftIndexByKey = new Map(draftSpans.map((entry, index) => [dayKey(entry.start), index]));
    const draftTitle = draft?.title?.trim() || t('calendar.create.untitled');

    return (
        <div>
            <div className="ofi-cal-monthhead">
                {weekDays.map((day) => <div key={day}>{day}</div>)}
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
                            data-month-day={key}
                            onPointerDown={(pointerEvent) => beginSelect(pointerEvent, day)}
                            onClick={(clickEvent) => {
                                if (justDragged()) return;
                                onSelectDay(day);
                                onCreateDay?.(day, anchorFromPoint(clickEvent.clientX, clickEvent.clientY));
                            }}
                            className={`ofi-cal-monthcell ${isSelected ? 'is-selected' : ''} ${outside ? 'is-outside' : ''} ${dropKey === key || inSpan(key) ? 'is-drop' : ''}`}
                        >
                            <div className="mb-1 flex items-center justify-center">
                                <button
                                    type="button"
                                    onClick={(clickEvent) => { clickEvent.stopPropagation(); onOpenDay(day); }}
                                    className={`ofi-cal-monthcell__num ${isToday ? 'is-today' : ''}`}
                                >
                                    {day.date()}
                                </button>
                            </div>
                            <div className="space-y-[3px]">
                                {draftIndexByKey.has(key) && (() => {
                                    const index = draftIndexByKey.get(key)!;
                                    const entry = draftSpans[index]!;
                                    // Nur der EINTÄGIGE Entwurf lässt sich ziehen:
                                    // ein mehrtägiger hat je Tag eigene Zeiten,
                                    // und ein Zug müsste raten, was mit den
                                    // übrigen Tagen geschieht. Sie werden im
                                    // Fenster daneben verstellt.
                                    const movable = draftSpans.length === 1;
                                    return (
                                        <div
                                            role="button"
                                            tabIndex={0}
                                            onPointerDown={(pointerEvent) => {
                                                if (!movable) { pointerEvent.stopPropagation(); return; }
                                                beginDrag(pointerEvent, { kind: 'draft' }, { start: entry.start, end: entry.end });
                                            }}
                                            onClick={(clickEvent) => clickEvent.stopPropagation()}
                                            className={`ofi-ucal-chip ofi-ucal-chip--draft is-allday ${movable ? 'is-draggable' : ''}`}
                                        >
                                            <ChipLabel
                                                status={DRAFT_STATUS}
                                                title={movable ? draftTitle : t('calendar.days.dayNumber', { index: index + 1 })}
                                                time={draft!.allDay ? null : entry.start.format('HH:mm')}
                                            />
                                        </div>
                                    );
                                })()}
                                {dayEvents.slice(0, MONTH_VISIBLE).map((event) => (
                                    <div
                                        key={event.id}
                                        role="button"
                                        tabIndex={0}
                                        onPointerDown={(pointerEvent) => beginDrag(pointerEvent, { kind: 'event', event }, { start: event.start, end: event.end })}
                                        onClick={(clickEvent) => clickEvent.stopPropagation()}
                                        className={`${chipClass(event)} is-allday ${event.editable && onReschedule ? 'is-draggable' : ''}`}
                                        style={chipStyle(event)}
                                    >
                                        <ChipLabel
                                            status={event.status}
                                            title={event.title}
                                            time={event.allDay ? null : event.start.format('HH:mm')}
                                        />
                                    </div>
                                ))}
                                {dayEvents.length > MONTH_VISIBLE && (
                                    <button
                                        type="button"
                                        onClick={(clickEvent) => { clickEvent.stopPropagation(); onOpenDay(day); }}
                                        className="ofi-cal-monthcell__more"
                                    >
                                        {t('calendar.more', { count: dayEvents.length - MONTH_VISIBLE })}
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
