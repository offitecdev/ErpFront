import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import '@/styles/modules/tasksBoard.css';
import { LivePersonRow } from './components/live/LivePersonRow';
import { useLiveOverview } from './components/live/useLiveOverview';
import { TaskButton } from './components/shared/TaskButton';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useIsTasksManager } from './store/tasksModuleStore';
import { localeTag } from './utils/taskFormat';
import { TasksAdminOnly } from './components/shared/TasksAdminOnly';

/**
 * ── /tasks/board — «Canlı» (13.09.2026, Vorgabe Samet) ──────────────────────
 *
 * «panoda sürükleme olmayacak, sadece günlük kim ne yapıyor canlı izleme» —
 * und danach «daha sade»: EINE ruhige Tabelle, eine Zeile je Person. Wer
 * arbeitet, steht oben (Uhr läuft), dann wer heute gearbeitet hat, zuletzt wer
 * noch nichts gemessen hat (blass). Die Aufgaben des Tages klappt ein Klick
 * auf die Zeile auf. Ein Teammitglied sieht nur sich selbst (der Server
 * grenzt ein).
 */

const TaskBoardPageContent = () => {
    useLanguageTick();
    const isManager = useIsTasksManager();
    const live = useLiveOverview({ enabled: true });
    const { data, error } = live;

    const people = data?.people ?? [];
    const workingCount = people.filter((person) => person.running).length;
    const activeCount = people.filter((person) => person.running || person.todayMs > 0).length;
    const dayLabel = data
        ? new Intl.DateTimeFormat(localeTag(), { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(data.day.from))
        : '';

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.board')}
            toolbar={data ? (
                <div className="ofi-gv-live-toolbar">
                    <span className="ofi-gv-live-toolbar__day">{dayLabel}</span>
                    <span className="ofi-gv-live-toolbar__stat">
                        {workingCount > 0 && <i className="ofi-gv-working__dot" aria-hidden />}
                        {t('tasksModule.live.workingCount', { count: workingCount })}
                    </span>
                    {isManager && (
                        <span className="ofi-gv-live-toolbar__stat">
                            {t('tasksModule.live.activeCount', { count: activeCount, total: people.length })}
                        </span>
                    )}
                    <span className={`ofi-gv-live-toolbar__sync ${live.refreshing ? 'is-busy' : ''}`}>
                        {t('tasksModule.live.autoRefresh')}
                    </span>
                </div>
            ) : undefined}
        >
            {data === null && !error && <LoadingPanel />}
            {data === null && Boolean(error) && (
                <div className="ofi-gv-panel">
                    <div className="ofi-gv-empty">
                        <div className="ofi-gv-empty__title">{t('tasksModule.errors.loadFailed')}</div>
                        <div className="mb-3">{tasksErrorMessage(error)}</div>
                        <TaskButton disabled={live.refreshing} onClick={() => void live.reload()}>{t('tasksModule.live.retry')}</TaskButton>
                    </div>
                </div>
            )}
            {data && (
                <section className="ofi-gv-panel ofi-gv-live-table" aria-label={t('tasksModule.live.todayTitle')}>
                    {people.length === 0 ? (
                        <div className="ofi-gv-empty">
                            <div className="ofi-gv-empty__title">{t('tasksModule.live.emptyTitle')}</div>
                            <div>{t('tasksModule.live.emptyText')}</div>
                        </div>
                    ) : (
                        <>
                            <div className="ofi-gv-live-head" aria-hidden>
                                <span>{t('tasksModule.live.colPerson')}</span>
                                <span>{t('tasksModule.live.colStatus')}</span>
                                <span>{t('tasksModule.live.colTask')}</span>
                                <span className="is-right">{t('tasksModule.live.colToday')}</span>
                                <span />
                            </div>
                            <ul className="ofi-gv-live-list">
                                {people.map((person) => (
                                    <LivePersonRow
                                        key={person.employeeId}
                                        person={person}
                                        labels={data.taskLabels}
                                    />
                                ))}
                            </ul>
                        </>
                    )}
                </section>
            )}
            {data && !isManager && <div className="ofi-gv-caption">{t('tasksModule.live.memberHint')}</div>}
        </TasksModuleShell>
    );
};

/** Nur die Administratorrolle (siehe TasksAdminOnly). */
export const TaskBoardPage = () => (
    <TasksAdminOnly>
        <TaskBoardPageContent />
    </TasksAdminOnly>
);
