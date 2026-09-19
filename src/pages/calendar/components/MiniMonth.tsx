import { useEffect, useState } from 'react';
import dayjs from 'dayjs';

import { ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { dayKey, type CalEvent } from '../calendarShared';

/**
 * DAS KLEINE MONATSBLATT — UNTEN IN DER SEITENLEISTE (14.09.2026, Vorgabe
 * Samet: «takvimi sol tarafta alta al», Vorlage: Apples Kalender).
 *
 * Monatsname fett links, die Pfeile rechts daneben, darunter die
 * Wochentagskürzel und die Tage: heute im roten Kreis, der gewählte Tag im
 * grauen — genau wie am Mac. Ein Klick blättert den grossen Kalender auf
 * diesen Tag; ein Punkt unter der Zahl sagt, dass dort Einträge stehen.
 * Das Blatt folgt dem angezeigten Monat, blättert aber auch selbst vor und
 * zurück, ohne den grossen Kalender mitzuziehen.
 */
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
        <div className="ofi-cal-minimonth">
            <div className="ofi-cal-minimonth__head">
                <span className="ofi-cal-minimonth__title">{cursor.format('MMMM YYYY')}</span>
                <span className="ofi-cal-minimonth__nav">
                    <button
                        type="button"
                        aria-label={cursor.subtract(1, 'month').format('MMMM YYYY')}
                        className="ofi-cal-minimonth__navbtn"
                        onClick={() => setCursor((current) => current.subtract(1, 'month'))}
                    >
                        <ChevronLeft size={14} />
                    </button>
                    <button
                        type="button"
                        aria-label={cursor.add(1, 'month').format('MMMM YYYY')}
                        className="ofi-cal-minimonth__navbtn"
                        onClick={() => setCursor((current) => current.add(1, 'month'))}
                    >
                        <ChevronRight size={14} />
                    </button>
                </span>
            </div>
            <div className="ofi-cal-minimonth__dow">
                {weekDays.map((day, index) => <div key={`${day}-${index}`}>{day}</div>)}
            </div>
            <div className="ofi-cal-minimonth__days">
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
                            aria-label={day.format('dddd, D. MMMM YYYY')}
                            aria-current={isToday ? 'date' : undefined}
                            className={`ofi-cal-mini-day ${isSelected ? 'is-selected' : ''} ${isToday ? 'is-today' : ''} ${outside ? 'is-outside' : ''}`}
                        >
                            {day.date()}
                            {hasEvents && <span className="ofi-cal-mini-day__dot" />}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};
