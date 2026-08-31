import { useState } from 'react';

import { t } from '@/i18n/translate';
import { isMontageTechnician } from '@/lib/access';
import { useAuthStore } from '@/store/authStore';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import type { PersonAppointment } from '../../types/personnel';
import { Chip } from '../../components/primitives';
import {
    EMPTY_CELL,
    appointmentStatusChipClass,
    appointmentStatusLabel,
    formatDateTime,
    formatTime,
} from '../../utils/format';
import { PersonJumpSheet, type JumpTarget } from '../PersonJumpSheet';

/**
 * ── REITER „TERMINE" ─────────────────────────────────────────────────────────
 *
 * Die MONTAGETERMINE, auf die diese Person besetzt ist — geführt (der
 * zugewiesene Monteur) oder mitbesetzt. Getrennt von den Besprechungen
 * (Vorgabe 17.08.2026: „Termine und Besprechungen als eigene Reiter"), weil es
 * zwei verschiedene Dinge sind: der eine Eintrag führt auf eine Baustelle, der
 * andere an einen Tisch.
 *
 * Ein Klick auf eine Zeile öffnet das Sprungfenster: dort stehen die
 * Einzelheiten und die Wege zum Projekt, zum Auftrag, zum Kunden, in den
 * Kalender oder in die Montageansicht. Die Personenseite selbst bleibt eine
 * Übersicht — entschieden und gearbeitet wird in den Bereichen.
 */

export const PersonAppointmentsTab = ({ appointments }: { appointments: PersonAppointment[] }) => {
    const [selected, setSelected] = useState<PersonAppointment | null>(null);
    // Die Montageansicht steht NUR Monteuren offen (MontageGuard wirft alle
    // anderen auf die Startseite) — deshalb erscheint der Weg dorthin auch nur
    // bei ihnen. Ein Knopf, der zurückspringt, wäre schlimmer als keiner.
    const isTechnician = useAuthStore((state) => isMontageTechnician(state.user));

    const now = Date.now();
    const upcoming = appointments
        .filter((appointment) => new Date(appointment.startTime).getTime() >= now)
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
    const past = appointments.filter((appointment) => new Date(appointment.startTime).getTime() < now);

    const targetsFor = (appointment: PersonAppointment): JumpTarget[] => {
        const targets: JumpTarget[] = [];
        if (appointment.projectId) {
            targets.push({
                key: 'project',
                label: t('personnel.person.jumpProject'),
                hint: [appointment.projectNumber, appointment.projectName].filter(Boolean).join(' · ') || undefined,
                to: `/projects/${appointment.projectId}`,
            });
        }
        if (appointment.salesOrderId) {
            targets.push({
                key: 'order',
                label: t('personnel.person.jumpOrder'),
                to: `/sales/orders/${appointment.salesOrderId}`,
            });
        }
        if (appointment.customerId) {
            targets.push({
                key: 'customer',
                label: t('personnel.person.jumpCustomer'),
                hint: appointment.customerName ?? undefined,
                to: `/crm/customers/${appointment.customerId}`,
            });
        }
        targets.push({ key: 'calendar', label: t('personnel.person.jumpCalendar'), to: '/calendar' });
        if (isTechnician) {
            targets.push({
                key: 'montage',
                label: t('personnel.person.jumpMontage'),
                to: `/montage/orders/${appointment.id}`,
            });
        }
        return targets;
    };

    const table = (rows: PersonAppointment[], emptyText: string) => (
        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
            <colgroup>
                <col style={{ width: 160 }} />
                <col />
                <col style={{ width: '24%' }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 110 }} />
            </colgroup>
            <thead>
                <tr>
                    <th className="text-left">{t('personnel.person.colWhen')}</th>
                    <th className="text-left">{t('personnel.person.colProject')}</th>
                    <th className="text-left">{t('personnel.person.colCustomer')}</th>
                    <th className="text-left">{t('common.status')}</th>
                    <th className="text-left">{t('personnel.person.colRoleInMeeting')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && <TableStateRow colSpan={5} loading={false} emptyText={emptyText} />}
                {rows.map((appointment) => (
                    <tr
                        key={appointment.id}
                        tabIndex={0}
                        role="button"
                        onClick={() => setSelected(appointment)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                setSelected(appointment);
                            }
                        }}
                        className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                    >
                        <td className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                            {formatDateTime(appointment.startTime)}
                            <span className="text-slate-400 dark:text-white/40"> – {formatTime(appointment.endTime)}</span>
                        </td>
                        <td className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">
                            {appointment.projectNumber || appointment.projectName || t('personnel.person.noProject')}
                            {appointment.projectNumber && appointment.projectName && (
                                <span className="ml-1.5 font-normal text-slate-500 dark:text-white/55">
                                    {appointment.projectName}
                                </span>
                            )}
                        </td>
                        <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                            {appointment.customerName || EMPTY_CELL}
                        </td>
                        <td>
                            <Chip className={appointmentStatusChipClass(appointment.status)}>
                                {appointmentStatusLabel(appointment.status)}
                            </Chip>
                        </td>
                        <td>
                            <Chip className={appointment.isLead
                                ? 'bg-[#eef2fb] text-[#1f2654] ring-[#c9d5f0] dark:bg-white/10 dark:text-white/80 dark:ring-white/15'
                                : 'bg-slate-50 text-slate-500 ring-slate-200 dark:bg-white/5 dark:text-white/55 dark:ring-white/10'}>
                                {appointment.isLead ? t('personnel.person.lead') : t('personnel.person.assisting')}
                            </Chip>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );

    return (
        <div className="flex flex-col gap-4">
            <SectionCard title={t('personnel.person.upcomingAppointments', { count: upcoming.length })}>
                {table(upcoming, t('personnel.person.noAppointments'))}
            </SectionCard>
            <SectionCard
                title={t('personnel.person.pastAppointments', { count: past.length })}
                collapsible
                defaultOpen={false}
            >
                {table(past, t('personnel.person.noAppointments'))}
            </SectionCard>

            <PersonJumpSheet
                open={Boolean(selected)}
                title={selected?.projectNumber || selected?.projectName || t('personnel.person.tabAppointments')}
                description={selected ? formatDateTime(selected.startTime) : undefined}
                details={selected ? [
                    {
                        label: t('personnel.person.colWhen'),
                        value: `${formatDateTime(selected.startTime)} – ${formatTime(selected.endTime)}`,
                    },
                    { label: t('personnel.person.colCustomer'), value: selected.customerName ?? '' },
                    { label: t('personnel.person.colProject'), value: selected.projectName ?? '' },
                    { label: t('common.status'), value: appointmentStatusLabel(selected.status) },
                    {
                        label: t('personnel.person.colRoleInMeeting'),
                        value: selected.isLead ? t('personnel.person.lead') : t('personnel.person.assisting'),
                    },
                    { label: t('personnel.person.colNotes'), value: selected.notes ?? '' },
                ] : []}
                targets={selected ? targetsFor(selected) : []}
                onClose={() => setSelected(null)}
            />
        </div>
    );
};
