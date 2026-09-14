import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { LuPause } from 'react-icons/lu';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/tasksModule.css';
import '@/styles/modules/tasksOnboarding.css';
import { useNow } from '../../hooks/useNow';
import { useTaskTimer } from '../../hooks/useTaskTimer';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { formatClock } from '../../utils/taskFormat';
import { TaskSettingsButton } from '../settings/TaskSettingsButton';
import { TaskOnboardingWelcome } from '../onboarding/TaskOnboardingWelcome';
import { TaskIconButton } from './TaskButton';

/**
 * ── HÜLLE JEDER SEITE DES GÖREVLER-MODULS ────────────────────────────────────
 *
 * Titel (wie im Lager), darunter EINE Zeile: die segmentierten Reiter des
 * Moduls und — solange die eigene Messung läuft — die laufende Uhr mit Pause.
 * Die Reiter der Leitung (Freigaben, Kişiler) erscheinen nur, wenn der Server
 * die Person als Leitung meldet; das Menü der Seitenleiste kann das nicht
 * unterscheiden (das Rollenpaket gibt Seiten frei, nicht Stufen).
 *
 * Lädt einmal je Firma, was alle Seiten brauchen (Bootstrap), und frischt die
 * Zähler jede Minute und beim Zurückkehren in den Tab auf.
 */

const SUMMARY_POLL_MS = 60_000;

const ActiveTimerChip = () => {
    const activeTimer = useTasksModuleStore((state) => state.bootstrap?.summary.activeTimer ?? null);
    const now = useNow(1000, Boolean(activeTimer));
    const { pause } = useTaskTimer();
    if (!activeTimer) return null;
    const elapsed = now - Date.parse(activeTimer.startedAt);
    return (
        <span className="ofi-gv-timerchip" role="status" aria-live="off">
            <i className="ofi-gv-live" aria-hidden />
            <span className="ofi-gv-clock">{formatClock(elapsed)}</span>
            <Link to={`/tasks/${activeTimer.taskId}`} className="ofi-gv-timerchip__title" title={activeTimer.taskTitle}>
                {activeTimer.taskTitle}
            </Link>
            <TaskIconButton label={t('tasksModule.timer.pause')} onClick={() => void pause()}>
                <LuPause size={14} />
            </TaskIconButton>
        </span>
    );
};

export const TasksModuleShell = ({
    title,
    actions,
    children,
    toolbar,
}: {
    title: ReactNode;
    /** Rechts im Titel: die Handlungen der Seite (z. B. «Yeni görev»). */
    actions?: ReactNode;
    /** Unter den Reitern: Filter und Suche der Seite. */
    toolbar?: ReactNode;
    children: ReactNode;
}) => {
    useLanguageTick();
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const bootstrap = useTasksModuleStore((state) => state.bootstrap);
    const loading = useTasksModuleStore((state) => state.loading);
    const error = useTasksModuleStore((state) => state.error);
    const ensure = useTasksModuleStore((state) => state.ensure);
    const refreshSummary = useTasksModuleStore((state) => state.refreshSummary);

    useEffect(() => { void ensure(); }, [ensure, selectedTenantId]);

    useEffect(() => {
        const id = window.setInterval(() => { if (!document.hidden) void refreshSummary(); }, SUMMARY_POLL_MS);
        const onVisible = () => { if (!document.hidden) void refreshSummary(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [refreshSummary]);

    if (!bootstrap) {
        if (loading || !error) return <LoadingPanel />;
        const code = tasksErrorCode(error);
        return (
            <div className="ofi-gv">
                <div className="ofi-gv-panel">
                    <div className="ofi-gv-empty">
                        <div className="ofi-gv-empty__title">
                            {code === 'TASKS_MODULE_DISABLED' ? t('tasksModule.errors.TASKS_MODULE_DISABLED')
                                : code === 'TASKS_NO_ACCESS' ? t('tasksModule.errors.TASKS_NO_ACCESS')
                                    : t('tasksModule.errors.loadFailed')}
                        </div>
                        {!code && <div>{tasksErrorMessage(error)}</div>}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="ofi-gv">
            <InventoryListHeader
                title={title}
                action={(
                    <div className="flex items-center gap-2">
                        {actions}
                        <ActiveTimerChip />
                        <TaskSettingsButton />
                    </div>
                )}
            />
            {toolbar}
            {children}
            <TaskOnboardingWelcome onboarding={bootstrap.onboarding} />
        </div>
    );
};
