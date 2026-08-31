import { t } from '@/i18n/translate';
import { SectionCard } from '@/components/ui-shared/TableKit';
import type { PersonOverview } from '../../types/personnel';
import { Chip, Labelled } from '../../components/primitives';
import {
    EMPTY_CELL,
    formatDate,
    formatDateTime,
    leaveStatusChipClass,
    leaveStatusLabel,
    leaveTypeLabel,
} from '../../utils/format';

/**
 * Reiter „Übersicht": die Stammdaten links, rechts was gerade ansteht —
 * offene Aufgaben, der nächste Termin, der letzte Antrag. Die Zahlen oben
 * sind die vier Reiter in Kurzform, damit man nicht klicken muss, um zu
 * sehen, ob es überhaupt etwas zu sehen gibt.
 */

const Stat = ({ label, value }: { label: string; value: number }) => (
    <div className="flex min-w-[92px] flex-1 flex-col gap-0.5 rounded-lg border border-slate-200 bg-white px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
        <span className="font-mono text-[19px] font-bold leading-none text-slate-900 dark:text-white">{value}</span>
        <span className="text-[11px] font-medium text-slate-500 dark:text-white/55">{label}</span>
    </div>
);

const Row = ({ label, value }: { label: string; value: string }) => (
    <Labelled label={label}>
        <span className="text-[13px] text-slate-800 dark:text-white/85">{value || EMPTY_CELL}</span>
    </Labelled>
);

export const PersonOverviewTab = ({ data }: { data: PersonOverview }) => {
    const { person } = data;
    const appointments = data.appointments ?? [];
    const openTasks = data.tasks.filter((task) => task.status !== 'DONE').length;
    const upcoming = data.meetings
        .filter((meeting) => new Date(meeting.startTime).getTime() >= Date.now())
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
    const nextAppointment = appointments
        .filter((appointment) => new Date(appointment.startTime).getTime() >= Date.now())
        .sort((a, b) => a.startTime.localeCompare(b.startTime))[0] ?? null;
    const lastLeave = data.leaves[0] ?? null;

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap gap-2">
                <Stat label={t('personnel.person.statOpenTasks')} value={openTasks} />
                <Stat label={t('personnel.person.statAppointments')} value={appointments.length} />
                <Stat label={t('personnel.person.statMeetings')} value={data.meetings.length} />
                <Stat label={t('personnel.person.statLeaves')} value={data.leaves.length} />
                <Stat label={t('personnel.person.statApprovals')} value={data.approvals.length} />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
                <SectionCard title={t('personnel.person.masterData')}>
                    <div className="grid gap-3 p-3 sm:grid-cols-2">
                        <Row label={t('personnel.field.email')} value={person.email} />
                        <Row label={t('personnel.person.phone')} value={person.phone ?? ''} />
                        <Row label={t('personnel.person.jobTitle')} value={person.title ?? ''} />
                        <Row label={t('personnel.person.hireDate')} value={formatDate(person.hireDate)} />
                        <Row label={t('personnel.field.createdAt')} value={formatDate(person.createdAt)} />
                        <Row label={t('settings.roles.colRole')} value={person.roleName ?? ''} />
                    </div>
                </SectionCard>

                <SectionCard title={t('personnel.person.whatsNext')}>
                    <div className="flex flex-col gap-3 p-3">
                        <div>
                            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                {t('personnel.person.nextAppointment')}
                            </span>
                            {nextAppointment ? (
                                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                                    <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                                        {nextAppointment.projectNumber
                                            || nextAppointment.projectName
                                            || t('personnel.person.noProject')}
                                    </span>
                                    <span className="text-[12px] text-slate-500 dark:text-white/60">
                                        {formatDateTime(nextAppointment.startTime)}
                                        {nextAppointment.customerName ? ` · ${nextAppointment.customerName}` : ''}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {t('personnel.person.noAppointments')}
                                </span>
                            )}
                        </div>

                        <div>
                            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                {t('personnel.person.nextMeeting')}
                            </span>
                            {upcoming ? (
                                <div className="rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                                    <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                                        {upcoming.title}
                                    </span>
                                    <span className="text-[12px] text-slate-500 dark:text-white/60">
                                        {formatDateTime(upcoming.startTime)}
                                        {upcoming.customerName ? ` · ${upcoming.customerName}` : ''}
                                    </span>
                                </div>
                            ) : (
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {t('personnel.person.noMeetings')}
                                </span>
                            )}
                        </div>

                        <div>
                            <span className="mb-1 block text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/40">
                                {t('personnel.person.lastLeave')}
                            </span>
                            {lastLeave ? (
                                <div className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 dark:border-white/10">
                                    <span className="min-w-0">
                                        <span className="block truncate text-[13px] font-semibold text-slate-800 dark:text-white">
                                            {leaveTypeLabel(lastLeave.leaveType, lastLeave.leaveTypeLabel)}
                                        </span>
                                        <span className="text-[12px] text-slate-500 dark:text-white/60">
                                            {formatDate(lastLeave.startDate)} – {formatDate(lastLeave.endDate)}
                                        </span>
                                    </span>
                                    <Chip className={leaveStatusChipClass(lastLeave.status)}>
                                        {leaveStatusLabel(lastLeave.status)}
                                    </Chip>
                                </div>
                            ) : (
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {t('personnel.person.noLeaves')}
                                </span>
                            )}
                        </div>
                    </div>
                </SectionCard>
            </div>
        </div>
    );
};
