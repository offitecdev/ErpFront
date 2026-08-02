import { useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { CalendarPlus01, ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { SheetShell } from './shells';
import { dayKey, dotClass, type CalEvent, type CalStatus } from '../calendarShared';

const STATUS_LABEL_KEY: Record<CalStatus, string> = {
    planned: 'calendar.status.planned',
    done: 'calendar.status.done',
    cancelled: 'calendar.status.cancelled',
    meeting: 'calendar.status.meeting',
    maintenance: 'calendar.status.maintenance',
};

/* "Today's events" — a bottom sheet with its own little day navigation; rows
   open the detail popup, the header can start a new appointment right away. */
export const TodaySheet = ({ open, onClose, events, onOpenEvent, onCreate, canCreate = true }: {
    open: boolean;
    onClose: () => void;
    events: CalEvent[];
    onOpenEvent: (event: CalEvent) => void;
    onCreate: (day: dayjs.Dayjs) => void;
    canCreate?: boolean;
}) => {
    const [day, setDay] = useState(() => dayjs());

    const rows = useMemo(
        () => events
            .filter((event) => dayKey(event.start) === dayKey(day))
            .sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.valueOf() - b.start.valueOf()),
        [events, day],
    );

    const isToday = dayKey(day) === dayKey(dayjs());

    return (
        <SheetShell
            open={open}
            onClose={onClose}
            title={isToday ? t('calendar.todaySheet.title') : day.format('DD MMMM YYYY, dddd')}
            subtitle={isToday ? day.format('DD MMMM YYYY, dddd') : undefined}
            headerActions={(
                <>
                    {canCreate && (
                        <button
                            type="button"
                            onClick={() => onCreate(day)}
                            className="flex h-8 items-center gap-1.5 rounded-md border border-[#E3E7F0] bg-white px-3 text-[12px] font-semibold text-[#07145c] transition-colors hover:bg-[#F7F8FC] dark:border-white/10 dark:bg-white/6 dark:text-[#d48f16] dark:hover:bg-white/10"
                        >
                            <CalendarPlus01 size={13} />
                            {t('calendar.newAppointment')}
                        </button>
                    )}
                    <div className="inline-flex overflow-hidden rounded-md border border-slate-200 dark:border-white/15">
                        <button type="button" aria-label={t('common.back')} className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/10" onClick={() => setDay((d) => d.subtract(1, 'day'))}><ChevronLeft size={14} /></button>
                        <button type="button" className="h-8 border-x border-slate-200 px-2.5 text-[11.5px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/15 dark:text-white/85 dark:hover:bg-white/10" onClick={() => setDay(dayjs())}>{t('calendar.today')}</button>
                        <button type="button" aria-label={t('common.next')} className="flex h-8 w-8 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/10" onClick={() => setDay((d) => d.add(1, 'day'))}><ChevronRight size={14} /></button>
                    </div>
                </>
            )}
        >
            {rows.length === 0 ? (
                <div className="flex flex-1 items-center justify-center p-8">
                    <p className="rounded-lg border border-dashed border-slate-200 px-6 py-8 text-center text-[13px] text-slate-400 dark:border-white/15 dark:text-white/40">
                        {t('calendar.todaySheet.empty')}
                    </p>
                </div>
            ) : (
                <div className="p-3">
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="w-28 text-left">{t('calendar.todaySheet.time')}</th>
                                <th className="text-left">{t('calendar.todaySheet.event')}</th>
                                <th className="w-32 text-left">{t('calendar.todaySheet.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((event) => (
                                <tr
                                    key={event.id}
                                    onClick={() => onOpenEvent(event)}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                    <td className="font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                        {event.allDay ? t('calendar.allDay') : `${event.start.format('HH:mm')}–${event.end.format('HH:mm')}`}
                                    </td>
                                    <td>
                                        <span className="flex items-center gap-2.5">
                                            <span className={dotClass(event.status)} />
                                            <span className="min-w-0">
                                                <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white/90">{event.title}</span>
                                                {event.subtitle && <span className="block truncate text-[11px] text-slate-500 dark:text-white/50">{event.subtitle}</span>}
                                            </span>
                                        </span>
                                    </td>
                                    <td className="text-[12px] font-semibold text-slate-500 dark:text-white/60">{t(STATUS_LABEL_KEY[event.status])}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </SheetShell>
    );
};
