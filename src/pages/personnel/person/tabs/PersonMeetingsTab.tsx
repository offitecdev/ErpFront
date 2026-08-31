import { useState } from 'react';

import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import type { PersonMeeting } from '../../types/personnel';
import { Chip } from '../../components/primitives';
import { EMPTY_CELL, formatDateTime, formatTime } from '../../utils/format';
import { PersonJumpSheet, type JumpTarget } from '../PersonJumpSheet';

/**
 * ── REITER „BESPRECHUNGEN" ───────────────────────────────────────────────────
 *
 * Besprechungen, an denen die Person teilnimmt oder die sie angelegt hat — vom
 * Server auf 90 Tage zurück bis ein Jahr voraus begrenzt. Die Trennung
 * „Kommend / Vergangen" passiert hier im Browser: der Server liefert eine
 * Liste, und wo die Grenze liegt, entscheidet die Uhr des Geräts.
 *
 * Wie bei den Montageterminen öffnet ein Klick auf die Zeile das Sprungfenster
 * (Vorgabe 17.08.2026) — von dort geht es in den Kalender, zum Kunden oder in
 * den Schriftverkehr.
 */
export const PersonMeetingsTab = ({ meetings }: { meetings: PersonMeeting[] }) => {
    const [selected, setSelected] = useState<PersonMeeting | null>(null);

    const now = Date.now();
    const upcoming = meetings
        .filter((meeting) => new Date(meeting.startTime).getTime() >= now)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const past = meetings.filter((meeting) => new Date(meeting.startTime).getTime() < now);

    const targetsFor = (meeting: PersonMeeting): JumpTarget[] => {
        const targets: JumpTarget[] = [
            { key: 'calendar', label: t('personnel.person.jumpCalendar'), to: '/calendar' },
        ];
        if (meeting.customerId) {
            targets.push({
                key: 'customer',
                label: t('personnel.person.jumpCustomer'),
                hint: meeting.customerName ?? undefined,
                to: `/crm/customers/${meeting.customerId}`,
            });
        }
        targets.push({ key: 'communication', label: t('personnel.person.jumpCommunication'), to: '/crm/communication' });
        return targets;
    };

    const table = (rows: PersonMeeting[], emptyText: string) => (
        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
            <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: '24%' }} />
                <col style={{ width: 110 }} />
            </colgroup>
            <thead>
                <tr>
                    <th className="text-left">{t('personnel.person.colWhen')}</th>
                    <th className="text-left">{t('personnel.person.colTitle')}</th>
                    <th className="text-left">{t('personnel.person.colCustomer')}</th>
                    <th className="text-left">{t('personnel.person.colRoleInMeeting')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && <TableStateRow colSpan={4} loading={false} emptyText={emptyText} />}
                {rows.map((meeting) => (
                    <tr
                        key={meeting.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelected(meeting)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelected(meeting);
                            }
                        }}
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                        <td className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                            {formatDateTime(meeting.startTime)}
                            <span className="text-slate-400 dark:text-white/40"> – {formatTime(meeting.endTime)}</span>
                        </td>
                        <td className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">
                            {meeting.title || EMPTY_CELL}
                        </td>
                        <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                            {meeting.customerName || EMPTY_CELL}
                        </td>
                        <td>
                            <Chip className={meeting.isOwner
                                ? 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/80 dark:ring-white/15'
                                : 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-white/55 dark:ring-white/10'}>
                                {meeting.isOwner ? t('personnel.person.owner') : t('personnel.person.participant')}
                            </Chip>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="flex flex-col gap-4">
            <SectionCard title={t('personnel.person.upcomingMeetings', { count: upcoming.length })}>
                {table(upcoming, t('personnel.person.noMeetings'))}
            </SectionCard>
            <SectionCard title={t('personnel.person.pastMeetings', { count: past.length })} collapsible defaultOpen={false}>
                {table(past, t('personnel.person.noMeetings'))}
            </SectionCard>

            <PersonJumpSheet
                open={Boolean(selected)}
                title={selected?.title || t('personnel.person.tabMeetings')}
                description={selected ? formatDateTime(selected.startTime) : undefined}
                details={selected ? [
                    {
                        label: t('personnel.person.colWhen'),
                        value: `${formatDateTime(selected.startTime)} – ${formatTime(selected.endTime)}`,
                    },
                    { label: t('personnel.person.colCustomer'), value: selected.customerName ?? '' },
                    {
                        label: t('personnel.person.colRoleInMeeting'),
                        value: selected.isOwner ? t('personnel.person.owner') : t('personnel.person.participant'),
                    },
                    { label: t('personnel.person.colNotes'), value: selected.notes ?? '' },
                ] : []}
                targets={selected ? targetsFor(selected) : []}
                onClose={() => setSelected(null)}
            />
        </div>
    );
};
