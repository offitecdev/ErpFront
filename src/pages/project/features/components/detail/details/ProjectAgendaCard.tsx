import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { Clock } from '@/components/icons/antIconCompat';
import { PopupCaption, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { AppointmentDto, ProjectDto } from '@/types/project';

import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';

/** Keeps the list compact; anything beyond is reported as a "+N" count. */
const UPCOMING_LIMIT = 6;

const Row = ({ appointment, showDate }: { appointment: AppointmentDto; showDate?: boolean }) => {
    const start = dayjs(appointment.startTime);
    return (
        <li className="ofi-tp-row">
            <span className="ofi-tp-icon"><Clock size={13} /></span>
            <span className="ofi-tp-row__main">
                <span className="ofi-tp-row__title">
                    <span className="ofi-tp-num is-strong">
                        {showDate ? `${start.format('DD.MM.')} ` : ''}{start.format('HH:mm')}–{dayjs(appointment.endTime).format('HH:mm')}
                    </span>
                    {' '}
                    <span style={{ color: 'var(--ofi-cal-muted)', fontWeight: 400, fontSize: 11.5 }}>
                        {appointmentTechnicianNames(appointment)}
                    </span>
                </span>
                {appointment.notes && <span className="ofi-tp-row__meta">{appointment.notes}</span>}
            </span>
        </li>
    );
};

/**
 * The project's appointments as one agenda inside the details popup: today on
 * top, everything still ahead below, under their own captions (they are one
 * train of thought — "what is happening now", then "what is coming").
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
        <div>
            <PopupCaption className="!pt-0">{t('projects.bugun')}</PopupCaption>
            {today.length === 0
                ? <PopupEmpty className="is-inline">{t('projects.details.noToday')}</PopupEmpty>
                : <ul className="ofi-tp-list">{today.map((appointment) => <Row key={appointment.id} appointment={appointment} />)}</ul>}

            <PopupCaption>{t('projects.details.upcoming')}</PopupCaption>
            {upcoming.length === 0 ? (
                <PopupEmpty className="is-inline">{t('projects.details.noUpcoming')}</PopupEmpty>
            ) : (
                <>
                    <ul className="ofi-tp-list">
                        {upcoming.slice(0, UPCOMING_LIMIT).map((appointment) => (
                            <Row key={appointment.id} appointment={appointment} showDate />
                        ))}
                    </ul>
                    {/* Say what was cut rather than let the list look complete. */}
                    {upcoming.length > UPCOMING_LIMIT && (
                        <div className="ofi-tp-num" style={{ paddingTop: 6 }}>+{upcoming.length - UPCOMING_LIMIT}</div>
                    )}
                </>
            )}
        </div>
    );
});
