import { useState, type KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import type { PersonApproval, PersonLeave } from '../../types/personnel';
import { Chip } from '../../components/primitives';
import {
    EMPTY_CELL,
    formatDate,
    formatDateTime,
    formatDays,
    leaveKindLabel,
    leaveStatusChipClass,
    leaveStatusLabel,
    leaveTypeLabel,
} from '../../utils/format';
import { PersonJumpSheet, type JumpTarget } from '../PersonJumpSheet';

/**
 * ── REITER „URLAUB" ──────────────────────────────────────────────────────────
 *
 * ZWEI Listen (Vorgabe „Urlaub — Anträge und Freigaben"): oben die eigenen
 * Anträge mit ihrem Stand, darunter die Anträge, die auf DIESE Person warten.
 *
 * Entschieden wird weiterhin auf der Antragsseite — und genau dorthin führt
 * der Klick (Vorgabe 17.08.2026: „auf Urlaubsanträge klicken soll den Bereich
 * öffnen"): eine Zeile öffnet das Sprungfenster mit den Einzelheiten und dem
 * Weg in den zuständigen Reiter.
 *
 * Diese beiden Listen stehen seit dem 26.08.2026 UNTER dem Urlaubskonto
 * (PersonLeaveYearTab) — Anspruch oben, Anträge darunter.
 */

/**
 * Der Bereich, in dem dieser Antrag bearbeitet wird.
 *
 * Seit dem 26.08.2026 ist das EINE Seite mit Reitern; der Stand entscheidet
 * nur noch über die Beschriftung, nicht mehr über die Adresse. Die alten
 * Adressen (/personnel/approvals, /personnel/incoming) leiten zwar hierher,
 * aber ein Sprung soll nicht durch eine Weiterleitung laufen.
 */
const inboxFor = (status: string): { label: string; to: string } => ({
    label: status === 'PENDING_ACCOUNTING'
        ? t('personnel.person.jumpIncoming')
        : t('personnel.person.jumpApprovals'),
    to: '/personnel/requests?tab=incoming',
});

type Selection =
    | { mode: 'own'; leave: PersonLeave }
    | { mode: 'approval'; request: PersonApproval };

export const PersonLeavesTab = ({
    leaves,
    approvals,
}: {
    leaves: PersonLeave[];
    approvals: PersonApproval[];
}) => {
    const [selected, setSelected] = useState<Selection | null>(null);

    const rowProps = (selection: Selection) => ({
        tabIndex: 0,
        role: 'button' as const,
        onClick: () => setSelected(selection),
        onKeyDown: (event: KeyboardEvent<HTMLTableRowElement>) => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelected(selection);
            }
        },
        className: 'cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5',
    });

    const sheetTitle = !selected
        ? ''
        : selected.mode === 'own'
            ? leaveTypeLabel(selected.leave.leaveType, selected.leave.leaveTypeLabel)
            : selected.request.employeeName || t('personnel.person.tabLeaves');

    const sheetDetails: Array<{ label: string; value: string }> = !selected
        ? []
        : selected.mode === 'own'
            ? [
                { label: t('personnel.person.colKind'), value: leaveKindLabel(selected.leave.kind) },
                {
                    label: t('personnel.person.colLeaveType'),
                    value: leaveTypeLabel(selected.leave.leaveType, selected.leave.leaveTypeLabel),
                },
                {
                    label: t('personnel.person.colPeriod'),
                    value: `${formatDate(selected.leave.startDate)} – ${formatDate(selected.leave.endDate)}`,
                },
                { label: t('personnel.person.colDays'), value: formatDays(selected.leave.totalDays) },
                { label: t('common.status'), value: leaveStatusLabel(selected.leave.status) },
                { label: t('personnel.person.colApprover'), value: selected.leave.approverName ?? '' },
                { label: t('personnel.field.createdAt'), value: formatDateTime(selected.leave.createdAt) },
                { label: t('personnel.person.colNotes'), value: selected.leave.note ?? '' },
            ]
            : [
                { label: t('personnel.field.name'), value: selected.request.employeeName ?? '' },
                { label: t('personnel.person.colKind'), value: leaveKindLabel(selected.request.kind) },
                {
                    label: t('personnel.person.colLeaveType'),
                    value: leaveTypeLabel(selected.request.leaveType, selected.request.leaveTypeLabel),
                },
                {
                    label: t('personnel.person.colPeriod'),
                    value: `${formatDate(selected.request.startDate)} – ${formatDate(selected.request.endDate)}`,
                },
                { label: t('personnel.person.colDays'), value: formatDays(selected.request.totalDays) },
                { label: t('common.status'), value: leaveStatusLabel(selected.request.status) },
            ];

    const sheetTargets: JumpTarget[] = !selected
        ? []
        : selected.mode === 'own'
            ? [{ key: 'leaves', label: t('personnel.person.jumpLeaves'), to: '/personnel/requests?tab=mine' }]
            : [{ key: 'inbox', ...inboxFor(selected.request.status) }];

    return (
        <div className="flex flex-col gap-4">
            <SectionCard title={t('personnel.person.ownLeaves', { count: leaves.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col style={{ width: 110 }} />
                        <col />
                        <col style={{ width: 200 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 160 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('personnel.person.colKind')}</th>
                            <th className="text-left">{t('personnel.person.colLeaveType')}</th>
                            <th className="text-left">{t('personnel.person.colPeriod')}</th>
                            <th className="text-right">{t('personnel.person.colDays')}</th>
                            <th className="text-left">{t('common.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {leaves.length === 0 && (
                            <TableStateRow colSpan={5} loading={false} emptyText={t('personnel.person.noLeaves')} />
                        )}
                        {leaves.map((leave) => (
                            <tr key={leave.id} {...rowProps({ mode: 'own', leave })}>
                                <td className="text-[12px] text-slate-500 dark:text-white/60">{leaveKindLabel(leave.kind)}</td>
                                <td className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">
                                    {leaveTypeLabel(leave.leaveType, leave.leaveTypeLabel)}
                                </td>
                                <td className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                                    {formatDate(leave.startDate)} – {formatDate(leave.endDate)}
                                </td>
                                <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                    {formatDays(leave.totalDays)}
                                </td>
                                <td>
                                    <Chip className={leaveStatusChipClass(leave.status)}>{leaveStatusLabel(leave.status)}</Chip>
                                    {leave.approverName && (
                                        <span className="mt-0.5 block truncate text-[11px] text-slate-400 dark:text-white/40">
                                            {leave.approverName}
                                        </span>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <SectionCard title={t('personnel.person.waitingOnMe', { count: approvals.length })}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col style={{ width: 160 }} />
                        <col style={{ width: 200 }} />
                        <col style={{ width: 90 }} />
                        <col style={{ width: 160 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('personnel.field.name')}</th>
                            <th className="text-left">{t('personnel.person.colLeaveType')}</th>
                            <th className="text-left">{t('personnel.person.colPeriod')}</th>
                            <th className="text-right">{t('personnel.person.colDays')}</th>
                            <th className="text-left">{t('common.status')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {approvals.length === 0 && (
                            <TableStateRow colSpan={5} loading={false} emptyText={t('personnel.person.noApprovals')} />
                        )}
                        {approvals.map((request) => (
                            <tr key={request.id} {...rowProps({ mode: 'approval', request })}>
                                <td className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">
                                    {request.employeeName || EMPTY_CELL}
                                </td>
                                <td className="truncate text-[12.5px] text-slate-600 dark:text-white/70">
                                    {leaveTypeLabel(request.leaveType, request.leaveTypeLabel)}
                                </td>
                                <td className="font-mono text-[12px] text-slate-600 dark:text-white/70">
                                    {formatDate(request.startDate)} – {formatDate(request.endDate)}
                                </td>
                                <td className="text-right font-mono text-[12.5px] text-slate-600 dark:text-white/70">
                                    {formatDays(request.totalDays)}
                                </td>
                                <td>
                                    <Chip className={leaveStatusChipClass(request.status)}>
                                        {leaveStatusLabel(request.status)}
                                    </Chip>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </SectionCard>

            <PersonJumpSheet
                open={Boolean(selected)}
                title={sheetTitle}
                details={sheetDetails.map((detail) => ({ label: detail.label, value: detail.value }))}
                targets={sheetTargets}
                onClose={() => setSelected(null)}
            />
        </div>
    );
};
