import { useMemo } from 'react';

import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { LabelDto, TaskRow as TaskRowDto } from '@/types/tasksModule';
import type { TaskListState } from '../../hooks/useTaskList';
import { useNow } from '../../hooks/useNow';
import { useIsTasksManager, useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { TaskButton } from '../shared/TaskButton';
import { groupTaskRows } from './taskListRules';
import { TaskRow } from './TaskRow';

const NO_LABELS: LabelDto[] = [];

/**
 * Körper der Liste: EINE Tafel mit den Datumsgruppen (Gecikenler, Bugün, …),
 * darunter «Daha fazla yükle». Beim Filterwechsel bleiben die alten Zeilen
 * gedimmt stehen, bis die Antwort da ist — die Seite springt nicht.
 */
export const TaskListGroups = ({
    list,
    busyIds,
    onCheck,
    onMenu,
}: {
    list: TaskListState;
    busyIds: ReadonlySet<string>;
    onCheck: (row: TaskRowDto) => void;
    onMenu: (row: TaskRowDto, anchor: HTMLElement) => void;
}) => {
    const isManager = useIsTasksManager();
    const me = useTasksActorId();
    const labels = useTasksModuleStore((state) => state.bootstrap?.labels) ?? NO_LABELS;
    const onboarding = useTasksModuleStore((state) => state.bootstrap?.onboarding);
    // Minutentakt reicht für «3 sa kaldı»; laufende Zeiten ticken in der Zeile selbst.
    const nowMs = useNow(60_000);

    const labelsById = useMemo(() => new Map(labels.map((label) => [label.id, label])), [labels]);
    const groups = useMemo(() => groupTaskRows(list.rows, nowMs), [list.rows, nowMs]);

    if (!list.loaded) {
        if (!list.error) return <LoadingPanel />;
        return (
            <div className="ofi-gv-panel">
                <div className="ofi-gv-empty">
                    <div className="ofi-gv-empty__title">{t('tasksModule.errors.loadFailed')}</div>
                    <div>{tasksErrorMessage(list.error)}</div>
                </div>
            </div>
        );
    }

    if (!list.rows.length) {
        const text = list.anyTasks === false
            ? (isManager ? t('tasksModule.list.empty.managerNone') : t('tasksModule.list.empty.memberNone'))
            : t('tasksModule.list.empty.filtered');
        return (
            <div className={`ofi-gv-panel ofi-gv-list-body ${list.fetching ? 'is-fetching' : ''}`}>
                <div className="ofi-gv-empty">{text}</div>
            </div>
        );
    }

    return (
        <div className={`ofi-gv-panel ofi-gv-list-body ${list.fetching ? 'is-fetching' : ''}`} aria-busy={list.fetching || undefined}>
            {groups.map((group) => (
                <section key={group.key} className="ofi-gv-group ofi-gv-list-group" aria-label={t(`tasksModule.list.groups.${group.key}`)}>
                    <div className="ofi-gv-group__head">
                        <span>{t(`tasksModule.list.groups.${group.key}`)}</span>
                        <span className="ofi-gv-count">{group.rows.length}</span>
                    </div>
                    <div className="ofi-gv-list">
                        {group.rows.map((row) => (
                            <TaskRow
                                key={row.id}
                                row={row}
                                people={list.people}
                                labelsById={labelsById}
                                nowMs={nowMs}
                                loadedAtMs={list.loadedAtMs}
                                isManager={isManager}
                                me={me}
                                busy={busyIds.has(row.id)}
                                guidePath={row.id === onboarding?.taskId ? `/tasks/guide/${onboarding.guide}` : undefined}
                                onCheck={onCheck}
                                onMenu={onMenu}
                            />
                        ))}
                    </div>
                </section>
            ))}
            {list.hasMore && (
                <div className="ofi-gv-list-more">
                    <span className="ofi-gv-caption">
                        {t('tasksModule.list.shownOfTotal', { shown: list.rows.length, total: list.total })}
                    </span>
                    <TaskButton disabled={list.loadingMore} onClick={() => void list.loadMore()}>
                        {list.loadingMore ? t('common.loading') : t('tasksModule.list.loadMore')}
                    </TaskButton>
                </div>
            )}
        </div>
    );
};
