import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { CalendarCheck01 as CalendarClock, Clock } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { AppointmentDto, ProjectDto } from '@/types/project';

import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';

/** Keeps the card compact; anything beyond is reported as a "+N" count. */
const UPCOMING_LIMIT = 6;

const Row = ({ appointment, showDate }: { appointment: AppointmentDto; showDate?: boolean }) => {
    const start = dayjs(appointment.startTime);
    return (
        <li className="flex items-start gap-2.5 py-1.5">
            <span className="mt-0.5 shrink-0 text-slate-400"><Clock size={12} /></span>
            <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="font-mono text-[12px] font-semibold text-slate-900">
                        {showDate ? start.format('DD.MM.') : ''} {start.format('HH:mm')}–{dayjs(appointment.endTime).format('HH:mm')}
                    </span>
                    <span className="truncate text-[11.5px] text-slate-500">{appointmentTechnicianNames(appointment)}</span>
                </div>
                {appointment.notes && <div className="truncate text-[11px] text-slate-400">{appointment.notes}</div>}
            </div>
        </li>
    );
};

/**
 * The project's appointments as one agenda: today on top, everything still
 * ahead below, separated by a single rule inside the SAME card (deliberately
 * not two cards — they are one train of thought, "what is happening now" then
 * "what is coming").
 *
 * Cancelled appointments are excluded; past ones only ever appear under Today.
 */
export const ProjectAgendaCard = memo(({ project }: { project: ProjectDto }) => {
    const { today, upcoming } = useMemo(() => {
        const all = (project.appointments || [])
            .filter((a) => a.status !== 'CANCELLED')
            .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
        const startOfToday = dayjs().startOf('day');
        const endOfToday = dayjs().endOf('day');
        return {
            today: all.filter((a) => {
                const start = dayjs(a.startTime);
                return !start.isBefore(startOfToday) && !start.isAfter(endOfToday);
            }),
            upcoming: all.filter((a) => dayjs(a.startTime).isAfter(endOfToday)),
        };
    }, [project.appointments]);

    return (
        <section className="rounded-xl border border-slate-200">
            <header className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2.5">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-[#272f67]/10 text-[#272f67]">
                    <CalendarClock size={13} />
                </span>
                <span className="text-[12.5px] font-semibold text-slate-800">{t('projects.details.agenda')}</span>
            </header>

            <div className="px-3.5 py-2.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t('projects.bugun')}</div>
                {today.length === 0 ? (
                    <p className="py-1.5 text-[12px] text-slate-400">{t('projects.details.noToday')}</p>
                ) : (
                    <ul className="divide-y divide-slate-50">
                        {today.map((appointment) => <Row key={appointment.id} appointment={appointment} />)}
                    </ul>
                )}
            </div>

            {/* The divider that keeps this one card instead of two. */}
            <div className="mx-3.5 border-t border-slate-200" />

            <div className="px-3.5 py-2.5">
                <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t('projects.details.upcoming')}</div>
                {upcoming.length === 0 ? (
                    <p className="py-1.5 text-[12px] text-slate-400">{t('projects.details.noUpcoming')}</p>
                ) : (
                    <>
                        <ul className="divide-y divide-slate-50">
                            {upcoming.slice(0, UPCOMING_LIMIT).map((appointment) => (
                                <Row key={appointment.id} appointment={appointment} showDate />
                            ))}
                        </ul>
                        {/* Say what was cut rather than let the list look complete. */}
                        {upcoming.length > UPCOMING_LIMIT && (
                            <div className="pt-1 text-[11px] text-slate-400">
                                +{upcoming.length - UPCOMING_LIMIT}
                            </div>
                        )}
                    </>
                )}
            </div>
        </section>
    );
});
