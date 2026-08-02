import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { dayKey, type CalEvent } from '../calendarShared';

/* Outlook-style small month: picking a day moves the big calendar; the tiny
   dot row under a number marks days that have events. */
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
        <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-[#151616]">
            <div className="mb-2 flex items-center justify-between">
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10" onClick={() => setCursor((c) => c.subtract(1, 'month'))}><ChevronLeft size={15} /></button>
                <span className="text-[13px] font-semibold capitalize text-slate-800 dark:text-white/90">{cursor.format('MMMM YYYY')}</span>
                <button type="button" className="flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10" onClick={() => setCursor((c) => c.add(1, 'month'))}><ChevronRight size={15} /></button>
            </div>
            <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase text-slate-400 dark:text-white/40">
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
                            className={`relative flex h-8 flex-col items-center justify-center rounded-md text-[11.5px] font-medium transition-colors ${isSelected
                                ? 'bg-[#07145c] text-white dark:bg-[#d48f16] dark:text-[#151616]'
                                : isToday
                                    ? 'bg-[#07145c]/8 text-[#07145c] dark:bg-[#d48f16]/12 dark:text-[#d48f16]'
                                    : outside
                                        ? 'text-slate-300 hover:bg-slate-100 dark:text-white/25 dark:hover:bg-white/8'
                                        : 'text-slate-700 hover:bg-slate-100 dark:text-white/85 dark:hover:bg-white/8'}`}
                        >
                            {day.date()}
                            {hasEvents && !isSelected && (
                                <span className="absolute bottom-[3px] h-[3px] w-[3px] rounded-full bg-[#f59e0b]" />
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
