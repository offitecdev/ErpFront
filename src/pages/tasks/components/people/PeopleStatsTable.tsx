import { Link, useNavigate } from 'react-router-dom';

import { TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { PersonStats } from '@/types/tasksModule';
import { formatDuration } from '../../utils/taskFormat';
import { personReportHref } from '../reports/reportQuery';

/**
 * Die Tabelle «Kişiler»: je Person offene, erledigte und verspätete Aufgaben,
 * gemessene Zeit, erledigte Punkte und verlorene Zeit. Wer gerade misst, trägt
 * den roten Punkt und den Titel der laufenden Aufgabe. Ein Klick auf die Zeile
 * öffnet den Personenbericht.
 */

const COLUMN_COUNT = 8;

const reportPath = (employeeId: string) => personReportHref(employeeId);

export const PeopleStatsTable = ({
    rows,
    loading,
    error,
}: {
    rows: PersonStats[] | null;
    loading: boolean;
    error: unknown;
}) => {
    const navigate = useNavigate();

    return (
        <div className="ofi-gv-people-tablewrap">
            <table data-inv-table data-unstyled-table className="w-full ofi-gv-people-table">
                <thead>
                    <tr>
                        <th className="text-left">{t('tasksModule.people.columns.person')}</th>
                        <th className="text-left">{t('tasksModule.people.columns.role')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.open')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.completed')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.overdue')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.time')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.checkDone')}</th>
                        <th className="text-right">{t('tasksModule.people.columns.wasted')}</th>
                    </tr>
                </thead>
                <tbody>
                    {(rows === null || rows.length === 0) && (
                        <TableStateRow
                            colSpan={COLUMN_COUNT}
                            loading={rows === null && (loading || !error)}
                            emptyText={error ? tasksErrorMessage(error) : t('tasksModule.people.empty')}
                            skeletonRows={4}
                        />
                    )}
                    {(rows ?? []).map((person) => (
                        <tr
                            key={person.employeeId}
                            className="ofi-gv-people-row"
                            onClick={() => navigate(reportPath(person.employeeId))}
                        >
                            <td>
                                <div className="ofi-gv-people-person">
                                    <div className="ofi-gv-people-person__text">
                                        <div className="ofi-gv-people-person__name">
                                            {/* Der Name ist der echte Link (Tastatur, neuer Tab); die Zeile klickt mit. */}
                                            <Link
                                                to={reportPath(person.employeeId)}
                                                className="ofi-gv-people-person__link"
                                                title={t('tasksModule.people.openReport')}
                                                onClick={(event) => event.stopPropagation()}
                                            >
                                                {person.name}
                                            </Link>
                                            {person.activeTask && <i className="ofi-gv-live" aria-label={t('tasksModule.people.working')} />}
                                        </div>
                                        {(person.title || person.activeTask) && (
                                            <div className="ofi-gv-people-person__sub">
                                                {person.title && <span className="ofi-gv-people-person__title">{person.title}</span>}
                                                {person.activeTask && (
                                                    <Link
                                                        to={`/tasks/${person.activeTask.taskId}`}
                                                        className="ofi-gv-people-person__task"
                                                        title={person.activeTask.title}
                                                        onClick={(event) => event.stopPropagation()}
                                                    >
                                                        {person.activeTask.title}
                                                    </Link>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </td>
                            <td className="ofi-gv-people-muted">
                                {person.roleName || (person.isManager ? t('tasksModule.people.manager') : t('tasksModule.people.member'))}
                            </td>
                            <td className="text-right ofi-gv-people-num">{person.openCount}</td>
                            <td className="text-right ofi-gv-people-num">{person.completedCount}</td>
                            <td className={`text-right ofi-gv-people-num ${person.overdueCount > 0 ? 'is-late' : ''}`}>{person.overdueCount}</td>
                            <td className="text-right ofi-gv-people-num">{formatDuration(person.ms)}</td>
                            <td className="text-right ofi-gv-people-num">{person.checkDone}</td>
                            <td className="text-right ofi-gv-people-num">
                                {person.wastedMs > 0 ? formatDuration(person.wastedMs) : <span className="ofi-gv-people-muted">—</span>}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
};
