import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import { ArrowRight, Calendar } from '@/components/icons/antIconCompat';
import type { AppointmentDto } from '../../../../types/project';
import type { MaintenanceTaskDto } from '../../../../types/maintenance';
import type { MeetingActivityDto } from '../../../../lib/api/meetings';
import { OverviewCard } from './OverviewCard';

dayjs.extend(isoWeek);

interface StripEvent {
    id: string;
    kind: 'order' | 'maintenance' | 'meeting' | 'task';
    label: string;
    time?: string;
    start: dayjs.Dayjs;
}

interface WeekStripProps {
    appointments: AppointmentDto[];
    tasks: MaintenanceTaskDto[];
    meetings: MeetingActivityDto[];
}

/* Meetings are purple, tasks green. In the overview the meeting/task chips show
   only the tint — the colored side stripe belongs to the calendar module. */
const KIND_STYLE: Record<StripEvent['kind'], string> = {
    order: 'border-l-2 border-l-sky-300 bg-sky-50/80 text-sky-900 dark:bg-sky-400/10 dark:text-sky-200',
    maintenance: 'border-l-2 border-l-amber-300 bg-amber-50/80 text-amber-900 dark:bg-amber-400/10 dark:text-amber-200',
    meeting: 'bg-violet-50/80 text-violet-900 dark:bg-violet-400/10 dark:text-violet-200',
    task: 'bg-emerald-50/80 text-emerald-900 dark:bg-emerald-400/10 dark:text-emerald-200',
};

/** Compact Monday→Sunday strip of this week's calendar; opens the full calendar. */
export const WeekStrip: React.FC<WeekStripProps> = ({ appointments, tasks, meetings }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const days = useMemo(() => {
        const start = dayjs().startOf('isoWeek');
        const events: StripEvent[] = [];

        for (const appt of appointments) {
            const s = dayjs(appt.startTime);
            events.push({
                id: `a-${appt.id}`,
                kind: 'order',
                label: appt.notes || t('crmOverview.week.order', { defaultValue: 'Montaj / randevu' }),
                time: s.format('HH:mm'),
                start: s,
            });
        }
        for (const task of tasks) {
            const s = task.scheduledStartTime ? dayjs(task.scheduledStartTime) : dayjs(task.plannedDate);
            events.push({
                id: `t-${task.id}`,
                kind: 'maintenance',
                label: task.contract?.title || task.siteName || t('crmOverview.week.maintenance', { defaultValue: 'Bakım' }),
                time: task.scheduledStartTime ? s.format('HH:mm') : undefined,
                start: s,
            });
        }
        for (const meeting of meetings) {
            const s = dayjs(meeting.startTime);
            events.push({
                id: `m-${meeting.id}`,
                kind: meeting.kind === 'TASK' ? 'task' : 'meeting',
                label: meeting.title,
                time: s.format('HH:mm'),
                start: s,
            });
        }

        return Array.from({ length: 7 }, (_, i) => {
            const day = start.add(i, 'day');
            return {
                day,
                isToday: day.isSame(dayjs(), 'day'),
                events: events
                    .filter((e) => e.start.isSame(day, 'day'))
                    .sort((a, b) => a.start.valueOf() - b.start.valueOf()),
            };
        });
    }, [appointments, tasks, meetings, t]);

    return (
        <OverviewCard
            title={t('crmOverview.week.title', { defaultValue: 'Bu haftanın takvimi' })}
            subtitle={t('crmOverview.week.subtitle', { defaultValue: 'Montajlar, toplantılar ve görevler' })}
            icon={<Calendar size={16} />}
            actions={
                <button
                    type="button"
                    onClick={() => navigate('/calendar')}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[#07145c] transition-colors hover:bg-[#07145c]/6 dark:text-[#e6cf9e] dark:hover:bg-[#e6cf9e]/10"
                >
                    {t('crmOverview.week.openCalendar', { defaultValue: 'Takvimi aç' })}
                    <ArrowRight size={14} />
                </button>
            }
            bodyClassName="pt-3"
        >
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {days.map(({ day, isToday, events }) => (
                    <button
                        key={day.format('YYYY-MM-DD')}
                        type="button"
                        onClick={() => navigate('/calendar')}
                        className={`flex min-h-[118px] flex-col rounded-xl border p-2 text-left transition-colors hover:border-[#C9D0DF] ${
                            isToday
                                ? 'border-[#07145c]/30 bg-[#07145c]/4 dark:border-[#e6cf9e]/30 dark:bg-[#e6cf9e]/6'
                                : 'border-[#E3E7F0] bg-[#F7F8FC] dark:border-white/8 dark:bg-white/4'
                        }`}
                    >
                        <span className="flex items-baseline justify-between">
                            <span className={`text-[11px] font-semibold uppercase tracking-wide ${isToday ? 'text-[#07145c] dark:text-[#e6cf9e]' : 'text-[#98A0AE]'}`}>
                                {day.format('ddd')}
                            </span>
                            <span
                                className={`flex size-6 items-center justify-center rounded-full text-[12px] font-bold tabular-nums ${
                                    isToday ? 'bg-[#07145c] text-white dark:bg-[#e6cf9e] dark:text-[#151616]' : 'text-[#3F4350] dark:text-[#d9dce3]'
                                }`}
                            >
                                {day.format('D')}
                            </span>
                        </span>
                        <span className="mt-1.5 flex flex-1 flex-col gap-1 overflow-hidden">
                            {events.slice(0, 3).map((event) => (
                                <span
                                    key={event.id}
                                    className={`truncate rounded-md px-1.5 py-0.5 text-[10.5px] font-medium leading-tight ${KIND_STYLE[event.kind]}`}
                                >
                                    {event.time && <span className="mr-1 tabular-nums font-semibold">{event.time}</span>}
                                    {event.label}
                                </span>
                            ))}
                            {events.length > 3 && (
                                <span className="px-1 text-[10.5px] font-semibold text-[#98A0AE]">
                                    +{events.length - 3} {t('crmOverview.week.more', { defaultValue: 'daha' })}
                                </span>
                            )}
                            {events.length === 0 && <span className="px-1 text-[10.5px] text-[#C4C7CE] dark:text-white/20">—</span>}
                        </span>
                    </button>
                ))}
            </div>
        </OverviewCard>
    );
};
