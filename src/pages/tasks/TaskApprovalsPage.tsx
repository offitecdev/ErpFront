import { useState } from 'react';
import { Navigate } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { TaskDetail } from '@/types/tasksModule';
import '@/styles/modules/tasksList.css';
import { ApprovalsBody } from './components/approvals/ApprovalsBody';
import { useTaskApprovals, type ApprovalKind } from './components/approvals/useTaskApprovals';
import { ReasonDialog } from './components/shared/ReasonDialog';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useIsTasksManager, useTasksModuleStore } from './store/tasksModuleStore';
import { TasksAdminOnly } from './components/shared/TasksAdminOnly';

/**
 * ── GÖREVLER: FREIGABEN (/tasks/approvals) ───────────────────────────────────
 *
 * Nur für die Leitung (Görevly `V.approvals`): Abschlussanfragen und
 * Aufgabenvorschläge der Teammitglieder. Ein Teammitglied landet in der
 * Liste — der Server würde die Daten ohnehin verweigern.
 */
const TaskApprovalsPageContent = () => {
    useLanguageTick();
    const hasBootstrap = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const isManager = useIsTasksManager();
    const approvals = useTaskApprovals(hasBootstrap && isManager);
    const [rejecting, setRejecting] = useState<{ kind: ApprovalKind; task: TaskDetail } | null>(null);

    if (hasBootstrap && !isManager) return <Navigate to="/tasks" replace />;

    const { data } = approvals;
    // Eine Aufgabe kann in beiden Listen stehen — gezählt wird sie einmal.
    const pendingCount = data
        ? new Set([...data.completionRequests, ...data.reviewRequests, ...(data.deleteRequests ?? [])].map((task) => task.id)).size
        : null;

    const confirmReject = async (note: string) => {
        if (!rejecting) return;
        const done = await approvals.decide(rejecting.kind, rejecting.task, 'reject', note);
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
            <ApprovalsBody approvals={approvals} onReject={(kind, task) => setRejecting({ kind, task })} />
            <ReasonDialog
                open={rejecting !== null}
                onClose={() => setRejecting(null)}
                onConfirm={(note) => void confirmReject(note)}
                title={rejecting?.kind === 'review'
                    ? t('tasksModule.approvals.rejectProposalTitle')
                    : rejecting?.kind === 'delete'
                        ? t('tasksModule.deleteRequest.rejectTitle')
                        : t('tasksModule.approvals.rejectCompletionTitle')}
                subtitle={rejecting?.task.title}
                label={t('tasksModule.approvals.reason')}
                confirmLabel={t('tasksModule.approvals.reject')}
                required={rejecting?.kind !== 'delete'}
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
