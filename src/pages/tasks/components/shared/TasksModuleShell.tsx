import { useEffect, type ReactNode } from 'react';
import { LuClipboardList } from 'react-icons/lu';

import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/tasksModule.css';
import '@/styles/modules/tasksOnboarding.css';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { openDailyReport, preloadDailyReportPrompt } from '../dailyReport/dailyReportEvents';
import { useDailyReportWindow } from '../dailyReport/dailyReportWindow';
import { TaskSettingsButton } from '../settings/TaskSettingsButton';
import { TaskButton } from './TaskButton';
import { TaskOnboardingWelcome } from '../onboarding/TaskOnboardingWelcome';
import { WorkingBanner } from './WorkingBanner';

/**
 * ── HÜLLE JEDER SEITE DES GÖREVLER-MODULS ────────────────────────────────────
 *
 * Titel (wie im Lager), darunter die Karte «Şu an çalışılıyor», solange die
 * eigene Messung läuft (14.09.2026, Samet: «çalışılan görev üstte, başlık
 * şeklinde; kronometre olmayacak») — nur hier im Modul, nirgends sonst —, dann
 * EINE Zeile: die segmentierten Reiter des Moduls.
 * Die Reiter der Leitung (Freigaben, Kişiler) erscheinen nur, wenn der Server
 * die Person als Leitung meldet; das Menü der Seitenleiste kann das nicht
 * unterscheiden (das Rollenpaket gibt Seiten frei, nicht Stufen).
 *
 * Lädt einmal je Firma, was alle Seiten brauchen (Bootstrap), und frischt die
 * Zähler jede Minute und beim Zurückkehren in den Tab auf.
 */

const SUMMARY_POLL_MS = 60_000;

/** Gün sonu raporu von Hand — nur im Zeitfenster der Firma (Modül ayarları, 15.09.2026). */
const DailyReportButton = () => {
    const win = useDailyReportWindow();
    const range = { start: win.setting.promptTime, end: win.setting.endTime };
    return (
        <TaskButton
            title={win.isOpen ? undefined : t('tasksModule.dailyReport.openDisabled', range)}
            icon={<LuClipboardList size={14} />}
            disabled={!win.isOpen}
            onPointerEnter={preloadDailyReportPrompt}
            onFocus={preloadDailyReportPrompt}
            onClick={openDailyReport}
        >
            {t('tasksModule.dailyReport.open')}
        </TaskButton>
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
                    <div className="ofi-gv-head-actions">
                        {actions}
                        <DailyReportButton />
                        <TaskSettingsButton />
                    </div>
                )}
            />
            <WorkingBanner />
            {toolbar}
            {children}
            <TaskOnboardingWelcome onboarding={bootstrap.onboarding} />
        </div>
    );
};
