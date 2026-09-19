import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { TaskDetail } from '@/types/tasksModule';
import '@/styles/modules/tasksList.css';
import { ApprovalsBody } from './components/approvals/ApprovalsBody';
import { useTaskApprovals } from './components/approvals/useTaskApprovals';
import { ReasonDialog } from './components/shared/ReasonDialog';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useIsTasksManager, useTasksModuleStore } from './store/tasksModuleStore';
import { TasksAdminOnly } from './components/shared/TasksAdminOnly';

/**
 * ── GÖREVLER: FREIGABEN (/tasks/approvals) ───────────────────────────────────
 *
 * Nur für die Administratorrolle: die offenen LÖSCHANFRAGEN. Abschluss- und
 * Görev-Talepe gibt es nicht mehr (16.09.2026). Ein Teammitglied landet in der
 * Liste — der Server würde die Daten ohnehin verweigern.
 */
const TaskApprovalsPageContent = () => {
    useLanguageTick();
    const hasBootstrap = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const isManager = useIsTasksManager();
    const approvals = useTaskApprovals(hasBootstrap && isManager);
    const [rejecting, setRejecting] = useState<TaskDetail | null>(null);

    if (hasBootstrap && !isManager) return <Navigate to="/tasks" replace />;

    const { data } = approvals;
    const pendingCount = data ? (data.deleteRequests ?? []).length : null;

    const confirmReject = async (note: string) => {
        if (!rejecting) return;
        const done = await approvals.decide(rejecting, 'reject', note);
        if (done) setRejecting(null);
    };

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.approvals')}
            toolbar={pendingCount !== null && pendingCount > 0 ? (
                <p className="ofi-gv-caption ofi-gv-approvals-subtitle">
                    {t('tasksModule.approvals.pendingCount', { count: pendingCount })}
                </p>
            ) : undefined}
        >
            <ApprovalsBody approvals={approvals} onReject={(task) => setRejecting(task)} />
            <ReasonDialog
                open={rejecting !== null}
                onClose={() => setRejecting(null)}
                onConfirm={(note) => void confirmReject(note)}
                title={t('tasksModule.deleteRequest.rejectTitle')}
                subtitle={rejecting?.title}
                label={t('tasksModule.approvals.reason')}
                confirmLabel={t('tasksModule.approvals.reject')}
                danger
                busy={approvals.busyKey !== null}
            />
        </TasksModuleShell>
    );
};

/** Nur die Administratorrolle (siehe TasksAdminOnly). */
export const TaskApprovalsPage = () => (
    <TasksAdminOnly>
        <TaskApprovalsPageContent />
    </TasksAdminOnly>
);
