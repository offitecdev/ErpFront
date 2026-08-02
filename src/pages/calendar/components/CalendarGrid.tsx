import { useEffect, useRef } from 'react';
import dayjs from 'dayjs';

import { Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import {
    HOUR_HEIGHT,
    chipClass,
    dayKey,
    minutesOf,
    positionEvents,
    type CalEvent,
    type Positioned,
} from '../calendarShared';

const HOURS = Array.from({ length: 24 }, (_, index) => index);
/* Half-hour click targets: slot 0 = 00:00, slot 1 = 00:30, … */
const SLOTS = Array.from({ length: 48 }, (_, index) => index);

/* ── day / week time grid ────────────────────────────────────────────────── */

const TimeBlock = ({ position, onOpen }: { position: Positioned; onOpen: (event: CalEvent) => void }) => {
    const { event } = position;
    const compact = position.height < 40;
    return (
        <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(event); }}
            style={{ top: position.top, height: position.height, left: `calc(${position.left}% + 2px)`, width: `calc(${position.width}% - 4px)` }}
            className={`absolute z-10 ${chipClass(event.status)}`}
            title={`${event.start.format('HH:mm')} – ${event.end.format('HH:mm')} · ${event.title}`}
        >
            <span className="truncate text-[11.5px] font-bold">{event.title}</span>
            {!compact && (
                <span className="truncate text-[10.5px] font-semibold opacity-85">
                    {event.start.format('HH:mm')}–{event.end.format('HH:mm')}{event.subtitle ? ` · ${event.subtitle}` : ''}
                </span>
            )}
        </button>
    );
};

export const TimeGrid = ({ days, eventsByDay, now, onOpenEvent, onOpenDay, onCreateAt }: {
    days: dayjs.Dayjs[];
    eventsByDay: Map<string, CalEvent[]>;
    now: dayjs.Dayjs;
    onOpenEvent: (event: CalEvent) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
    /* Clicking an empty half-hour slot starts the appointment wizard there. */
    onCreateAt?: (start: dayjs.Dayjs) => void;
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
    // One shared track definition: gutter + a column per day. Headings, all-day
    // band and grid must use the same template so vertical lines align.
    const gridTemplateColumns = `56px repeat(${cols}, minmax(0, 1fr))`;

    return (
        <div ref={scrollRef} className="max-h-[calc(100vh-210px)] min-h-[480px] overflow-y-auto">
            <div className="sticky top-0 z-30 bg-white dark:bg-[#151616]">
                <div className="grid border-b border-slate-200 bg-[#EEF1F7] dark:border-white/10 dark:bg-white/6" style={{ gridTemplateColumns }}>
                    <div />
                    {days.map((day) => {
                        const isToday = dayKey(day) === dayKey(today);
                        return (
                            <button
                                key={dayKey(day)}
                                type="button"
                                onClick={() => onOpenDay(day)}
                                className="flex flex-col items-center gap-0.5 border-l border-slate-200 py-2 hover:bg-slate-100/70 dark:border-white/10 dark:hover:bg-white/8"
                            >
                                <span className="text-[11px] font-medium uppercase tracking-wide text-slate-400 dark:text-white/45">{day.format('ddd')}</span>
                                <span className={`flex h-7 min-w-7 items-center justify-center rounded-full px-1.5 text-[14px] font-semibold ${isToday ? 'bg-[#07145c] text-white dark:bg-[#d48f16] dark:text-[#151616]' : 'text-slate-800 dark:text-white/90'}`}>
                                    {day.format(cols === 1 ? 'DD MMM' : 'DD')}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {hasAllDay && (
                    <div className="grid border-b border-slate-200 bg-white dark:border-white/10 dark:bg-[#151616]" style={{ gridTemplateColumns }}>
                        <div className="flex items-center justify-end pr-2 text-[10px] font-medium uppercase text-slate-400 dark:text-white/40">{t('calendar.allDay')}</div>
                        {days.map((day, index) => (
                            <div key={dayKey(day)} className="space-y-1 border-l border-slate-100 p-1 dark:border-white/8">
                                {allDayByDay[index].map((event) => (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={() => onOpenEvent(event)}
                                        className={`w-full ${chipClass(event.status)}`}
                                    >
                                        <span className="truncate">{event.title}</span>
                                    </button>
                                ))}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="grid" style={{ gridTemplateColumns }}>
                <div className="relative" style={{ height: HOURS.length * HOUR_HEIGHT }}>
                    {HOURS.map((hour) => (
                        <div key={hour} className="absolute right-2 -translate-y-1/2 text-[10px] font-medium text-slate-400 dark:text-white/40" style={{ top: hour * HOUR_HEIGHT }}>
                            {hour > 0 ? `${String(hour).padStart(2, '0')}:00` : ''}
                        </div>
                    ))}
                </div>
                {days.map((day) => {
                    const timed = (eventsByDay.get(dayKey(day)) || []).filter((e) => !e.allDay);
                    const positioned = positionEvents(timed);
                    const isToday = dayKey(day) === dayKey(today);
                    return (
                        <div
                            key={dayKey(day)}
                            className="relative border-l border-slate-200 dark:border-white/10"
                            style={{ height: HOURS.length * HOUR_HEIGHT }}
                        >
                            {HOURS.map((hour) => (
                                <div key={hour} className="absolute inset-x-0 border-t border-slate-100 dark:border-white/5" style={{ top: hour * HOUR_HEIGHT }} />
                            ))}
                            {/* Empty half-hour slots are the create surface: one click
                                opens the appointment wizard at exactly that time. */}
                            {onCreateAt && SLOTS.map((slot) => (
                                <button
                                    key={slot}
                                    type="button"
                                    title={t('calendar.slotHint')}
                                    onClick={() => onCreateAt(day.hour(Math.floor(slot / 2)).minute(slot % 2 ? 30 : 0).second(0).millisecond(0))}
                                    className="ofi-ucal-slot group absolute inset-x-0 flex items-center justify-center"
                                    style={{ top: (slot * HOUR_HEIGHT) / 2, height: HOUR_HEIGHT / 2 }}
                                >
                                    <span className="flex size-5 items-center justify-center rounded-full bg-[#07145c] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-[#d48f16] dark:text-[#151616]">
                                        <Plus size={12} />
                                    </span>
                                </button>
                            ))}
                            {isToday && (
                                <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: nowTop }}>
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

/* ── month grid ──────────────────────────────────────────────────────────── */

export const MonthGrid = ({ anchor, range, eventsByDay, selectedDay, now, onSelectDay, onOpenDay, onOpenEvent, onCreateDay }: {
    anchor: dayjs.Dayjs;
    range: { start: dayjs.Dayjs; end: dayjs.Dayjs };
    eventsByDay: Map<string, CalEvent[]>;
    selectedDay: dayjs.Dayjs;
    now: dayjs.Dayjs;
    onSelectDay: (day: dayjs.Dayjs) => void;
    onOpenDay: (day: dayjs.Dayjs) => void;
    onOpenEvent: (event: CalEvent) => void;
    /* Clicking a day cell (outside a chip / the date number) creates there. */
    onCreateDay?: (day: dayjs.Dayjs) => void;
}) => {
    const days = Array.from({ length: 42 }, (_, index) => range.start.add(index, 'day'));
    const weekDays = Array.from({ length: 7 }, (_, index) => range.start.add(index, 'day').format('ddd'));
    return (
        <div>
            <div className="grid grid-cols-7 border-b border-slate-200 bg-[#EEF1F7] text-center text-[11px] font-semibold uppercase capitalize text-slate-400 dark:border-white/10 dark:bg-white/6 dark:text-white/45">
                {weekDays.map((day) => <div key={day} className="border-r border-slate-200 py-2 last:border-r-0 dark:border-white/10">{day}</div>)}
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
                            title={onCreateDay ? t('calendar.slotHint') : undefined}
                            onClick={() => {
                                onSelectDay(day);
                                onCreateDay?.(day);
                            }}
                            className={`group min-h-[118px] cursor-pointer border-b border-r border-slate-200 p-1.5 align-top transition-colors last:border-r-0 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5 ${isSelected ? 'bg-[#07145c]/5 dark:bg-[#d48f16]/10' : outside ? 'bg-[#F7F8FC] dark:bg-white/4' : 'bg-white dark:bg-[#151616]'}`}
                        >
                            <div className="mb-1 flex items-center justify-between">
                                {onCreateDay ? (
                                    <span className="flex size-5 items-center justify-center rounded-full bg-[#07145c] text-white opacity-0 transition-opacity group-hover:opacity-100 dark:bg-[#d48f16] dark:text-[#151616]">
                                        <Plus size={11} />
                                    </span>
                                ) : <span />}
                                <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); onOpenDay(day); }}
                                    className={`flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-[12px] font-semibold transition-colors hover:bg-slate-100 dark:hover:bg-white/10 ${isToday ? 'bg-[#07145c] text-white hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]' : outside ? 'text-slate-300 dark:text-white/25' : 'text-slate-700 dark:text-white/85'}`}
                                >
                                    {day.date()}
                                </button>
                            </div>
                            <div className="space-y-1">
                                {dayEvents.slice(0, 3).map((event) => (
                                    <button
                                        key={event.id}
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onOpenEvent(event); }}
                                        className={`w-full ${chipClass(event.status)}`}
                                    >
                                        <span className="truncate">
                                            {!event.allDay && <span className="tabular-nums">{event.start.format('HH:mm')} </span>}
                                            {event.title}
                                        </span>
                                    </button>
                                ))}
                                {dayEvents.length > 3 && (
                                    <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); onOpenDay(day); }}
                                        className="px-1.5 text-[10px] font-semibold text-slate-500 hover:text-slate-800 dark:text-white/50 dark:hover:text-white"
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
