import { Navigate } from 'react-router-dom';

import { ToggleGroup } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { ReportRangeKey } from '@/types/tasksModule';
import '@/styles/modules/tasksBoard.css';
import { LabelsPanel } from './components/people/LabelsPanel';
import { PeopleStatsTable } from './components/people/PeopleStatsTable';
import { usePeopleStats } from './components/people/usePeopleStats';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useIsTasksManager, useTasksModuleStore } from './store/tasksModuleStore';
import { TasksAdminOnly } from './components/shared/TasksAdminOnly';

/**
 * ── /tasks/people — «Kişiler» (nur Leitung) ──────────────────────────────────
 *
 * Görevly `views/people.js` ohne Personenverwaltung: Personen und Rollen
 * pflegt die Anwendung in Personal und Berechtigungen. Hier stehen die
 * Kennzahlen je Person im gewählten Zeitraum und die Etiketten der Firma.
 */

const RANGE_KEYS: ReportRangeKey[] = ['7', '30', '90', 'all'];

const TaskPeoplePageContent = () => {
    useLanguageTick();
    const ready = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const isManager = useIsTasksManager();
    const stats = usePeopleStats({ enabled: ready && isManager });

    if (ready && !isManager) return <Navigate to="/tasks" replace />;

    const rangeOptions = RANGE_KEYS.map((key) => ({ key, label: t(`tasksModule.people.range.${key}`) }));

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.people')}
            toolbar={(
                <div className="ofi-gv-people-toolbar">
                    <ToggleGroup options={rangeOptions} value={stats.range} onChange={stats.setRange} />
                </div>
            )}
        >
            <section className="ofi-gv-panel" aria-labelledby="ofi-gv-people-title">
                <header className="ofi-gv-panel__head">
                    <span id="ofi-gv-people-title">{t('tasksModule.people.team')}</span>
                    {stats.rows && <span className="ofi-gv-count">{stats.rows.length}</span>}
                </header>
                <PeopleStatsTable rows={stats.rows} loading={stats.loading} error={stats.error} />
            </section>
            <div className="ofi-gv-caption ofi-gv-people-hint">{t('tasksModule.people.managedElsewhere')}</div>

            <LabelsPanel enabled={ready && isManager} />
        </TasksModuleShell>
    );
};

/** Nur die Administratorrolle (siehe TasksAdminOnly). */
export const TaskPeoplePage = () => (
    <TasksAdminOnly>
        <TaskPeoplePageContent />
    </TasksAdminOnly>
);
