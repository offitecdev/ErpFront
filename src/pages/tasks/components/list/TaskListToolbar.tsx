import { useEffect } from 'react';

import { SelectMenu, type SelectMenuOption } from '@/components/ui-shared/SelectMenu';
import { FilterBar, FilterSlot, SearchBox, ToggleGroup } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import type { LabelDto, TaskListFilter, TaskListPeriod } from '@/types/tasksModule';
import type { TaskListQuery } from '../../hooks/useTaskList';
import { TASK_LIST_PERIODS } from './taskListRules';
import { useIsTasksManager, useTasksModuleStore } from '../../store/tasksModuleStore';

const FILTERS: TaskListFilter[] = ['open', 'done', 'late', 'all'];
const NO_LABELS: LabelDto[] = [];

/**
 * Werkzeugzeile der Liste: Suche (Titel, am Server), Zustandssegment, für die
 * Leitung die Person, dann das Etikett. Ein Teammitglied sieht keinen
 * Personenfilter — seine Liste ist ohnehin nur seine.
 */
export const TaskListToolbar = ({
    query,
    onChange,
    busy,
}: {
    query: TaskListQuery;
    onChange: (patch: Partial<TaskListQuery>) => void;
    busy: boolean;
}) => {
    const isManager = useIsTasksManager();
    const labels = useTasksModuleStore((state) => state.bootstrap?.labels) ?? NO_LABELS;
    const directory = useTasksModuleStore((state) => state.directory);
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);

    useEffect(() => { if (isManager) void loadDirectory(); }, [isManager, loadDirectory]);

    // Ohne useMemo: die Beschriftungen folgen so auch einem Sprachwechsel.
    const filterOptions: Array<{ key: TaskListFilter; label: string }> = FILTERS.map((key) => ({
        key,
        label: t(`tasksModule.list.filters.${key}`),
    }));

    const periodOptions: SelectMenuOption[] = TASK_LIST_PERIODS.map((key) => ({
        value: key,
        label: t(`tasksModule.list.periods.${key}`),
    }));

    const personOptions: SelectMenuOption[] = [
        { value: '', label: t('tasksModule.list.everyone') },
        ...(directory ?? []).map((person) => ({ value: person.id, label: person.name, hint: person.title ?? undefined })),
    ];

    const labelOptions: SelectMenuOption[] = [
        { value: '', label: t('tasksModule.list.allLabels') },
        ...labels.map((label) => ({ value: label.id, label: label.name })),
    ];

    return (
        <FilterBar>
            <SearchBox
                value={query.q}
                onChange={(q) => onChange({ q })}
                placeholder={t('tasksModule.list.search')}
                busy={busy}
            />
            <ToggleGroup options={filterOptions} value={query.filter} onChange={(filter) => onChange({ filter })} />
            <FilterSlot>
                <SelectMenu
                    value={query.period}
                    options={periodOptions}
                    onChange={(period) => onChange({ period: period as TaskListPeriod })}
                    ariaLabel={t('tasksModule.list.periodFilter')}
                    panelClassName="ofi-gv-select"
                />
            </FilterSlot>
            {isManager && (
                <FilterSlot>
                    <SelectMenu
                        value={query.assigneeId}
                        options={personOptions}
                        onChange={(assigneeId) => onChange({ assigneeId })}
                        ariaLabel={t('tasksModule.list.assigneeFilter')}
                        panelClassName="ofi-gv-select"
                        listWidth={260}
                    />
                </FilterSlot>
            )}
            {/* Ohne Etiketten gäbe es nichts zu wählen — ein gesetzter Filter bleibt aber sichtbar. */}
            {(labels.length > 0 || query.labelId) && (
                <FilterSlot>
                    <SelectMenu
                        value={query.labelId}
                        options={labelOptions}
                        onChange={(labelId) => onChange({ labelId })}
                        ariaLabel={t('tasksModule.list.labelFilter')}
                        panelClassName="ofi-gv-select"
                    />
                </FilterSlot>
            )}
        </FilterBar>
    );
};
