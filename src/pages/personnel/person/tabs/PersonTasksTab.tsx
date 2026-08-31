import { t } from '@/i18n/translate';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import type { PersonTask } from '../../types/personnel';
import { Chip } from '../../components/primitives';
import { EMPTY_CELL, formatDate } from '../../utils/format';

/**
 * Reiter „Aufgaben": was dieser Person zugewiesen ist — Aufgaben UND
 * Erinnerungen (im CRM zwei Seiten, hier eine Liste mit Art-Spalte). Offene
 * stehen oben; das sortiert bereits der Server.
 */

const statusChipClass = (status: string): string => {
    if (status === 'DONE') return 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-500/10 dark:text-emerald-300 dark:ring-emerald-400/30';
    if (status === 'INCOMPLETE') return 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-500/10 dark:text-rose-300 dark:ring-rose-400/30';
    return 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/30';
};

/** Überfällig = offen und der Termin liegt vor heute. */
const isOverdue = (task: PersonTask): boolean =>
    task.status === 'OPEN' && Boolean(task.dueDate) && new Date(task.dueDate as string).getTime() < Date.now();

export const PersonTasksTab = ({ tasks }: { tasks: PersonTask[] }) => (
    <SectionCard title={t('personnel.person.tasksTitle', { count: tasks.length })}>
        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
            <colgroup>
                <col style={{ width: 110 }} />
                <col />
                <col style={{ width: '22%' }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 130 }} />
            </colgroup>
            <thead>
                <tr>
                    <th className="text-left">{t('personnel.person.colKind')}</th>
                    <th className="text-left">{t('personnel.person.colTitle')}</th>
                    <th className="text-left">{t('personnel.person.colCustomer')}</th>
                    <th className="text-left">{t('personnel.person.colDue')}</th>
                    <th className="text-left">{t('common.status')}</th>
                </tr>
            </thead>
            <tbody>
                {tasks.length === 0 && (
                    <TableStateRow colSpan={5} loading={false} emptyText={t('personnel.person.noTasks')} />
                )}
                {tasks.map((task) => (
                    <tr key={task.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                        <td className="text-[12px] text-slate-500 dark:text-white/60">
                            {t(`personnel.person.kind.${task.kind}`)}
                        </td>
                        <td className="truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">
                            {task.title || EMPTY_CELL}
                        </td>
                        <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                            {task.customerName || EMPTY_CELL}
                        </td>
                        <td className={`font-mono text-[12.5px] ${isOverdue(task)
                            ? 'font-bold text-red-600 dark:text-red-400'
                            : 'text-slate-600 dark:text-white/70'}`}>
                            {formatDate(task.dueDate)}
                        </td>
                        <td>
                            <Chip className={statusChipClass(task.status)}>
                                {t(`personnel.person.taskStatus.${task.status}`)}
                            </Chip>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    </SectionCard>
);
