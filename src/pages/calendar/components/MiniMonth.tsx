import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { dayKey, type CalEvent } from '../calendarShared';

/* Compact month picker at the top of the rail. Picking a day moves the big
   calendar; a dot under a number marks a day that has entries. Deliberately
   small (28px rows) — the rail is chrome, not a second calendar. */
export const MiniMonth = ({ anchor, selectedDay, now, eventsByDay, onPickDay }: {
    anchor: dayjs.Dayjs;
    selectedDay: dayjs.Dayjs;
    now: dayjs.Dayjs;
    eventsByDay: Map<string, CalEvent[]>;
    onPickDay: (day: dayjs.Dayjs) => void;
}) => {
    const [cursor, setCursor] = useState(() => anchor.startOf('month'));
    useEffect(() => { setCursor(anchor.startOf('month')); }, [anchor.format('YYYY-MM')]); // eslint-disable-line react-hooks/exhaustive-deps

    const gridStart = cursor.startOf('month').startOf('isoWeek');
    const days = Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
    const weekDays = Array.from({ length: 7 }, (_, index) => gridStart.add(index, 'day').format('dd'));

    return (
        <div className="ofi-cal-rail-block px-1.5 pb-1.5 pt-1">
            <div className="mb-0.5 flex items-center justify-between">
                <button
                    type="button"
                    aria-label={cursor.subtract(1, 'month').format('MMMM YYYY')}
                    className="flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={() => setCursor((current) => current.subtract(1, 'month'))}
                >
                    <ChevronLeft size={13} />
                </button>
                <span className="text-[11.5px] font-bold capitalize text-slate-800 dark:text-white/90">{cursor.format('MMMM YYYY')}</span>
                <button
                    type="button"
                    aria-label={cursor.add(1, 'month').format('MMMM YYYY')}
                    className="flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:text-white/45 dark:hover:bg-white/10 dark:hover:text-white"
                    onClick={() => setCursor((current) => current.add(1, 'month'))}
                >
                    <ChevronRight size={13} />
                </button>
            </div>
            <div className="grid grid-cols-7 text-center text-[9px] font-semibold uppercase text-slate-400 dark:text-white/35">
                {weekDays.map((day, index) => <div key={`${day}-${index}`} className="py-0.5">{day}</div>)}
            </div>
            <div className="grid grid-cols-7">
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
                            className={`ofi-cal-mini-day ${isSelected ? 'is-selected' : ''} ${isToday && !isSelected ? 'is-today' : ''} ${outside ? 'is-outside' : ''}`}
                        >
                            {day.date()}
                            {hasEvents && !isSelected && <span className="ofi-cal-mini-day__dot" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
