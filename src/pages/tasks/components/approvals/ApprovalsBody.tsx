import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskDetail } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { ApprovalSection } from './ApprovalSection';
import { CompletionRequestCard } from './CompletionRequestCard';
import { DeleteRequestCard } from './DeleteRequestCard';
import { ProposalCard } from './ProposalCard';
import { approvalBusyKey, type ApprovalKind, type TaskApprovalsState } from './useTaskApprovals';

/* Laden, Fehler, «Bekleyen onay yok» — sonst die zwei Tafeln (leere fallen weg). */
export const ApprovalsBody = ({
    approvals,
    onReject,
}: {
    approvals: TaskApprovalsState;
    onReject: (kind: ApprovalKind, task: TaskDetail) => void;
}) => {
    const nowMs = useNow(60_000);
    const { data, error, busyKey, decide } = approvals;

    if (!data) {
        if (!error) return <LoadingPanel />;
        return (
            <div className="ofi-gv-panel">
                <div className="ofi-gv-empty">
                    <div className="ofi-gv-empty__title">{t('tasksModule.errors.loadFailed')}</div>
                    <div>{tasksErrorMessage(error)}</div>
                </div>
            </div>
        );
    }

    const { completionRequests, reviewRequests, people } = data;
    const deleteRequests = data.deleteRequests ?? [];
    if (!completionRequests.length && !reviewRequests.length && !deleteRequests.length) {
        return (
            <div className="ofi-gv-panel">
                <div className="ofi-gv-empty">
                    <div className="ofi-gv-empty__title">{t('tasksModule.approvals.empty')}</div>
                    <div>{t('tasksModule.approvals.emptyHint')}</div>
                </div>
            </div>
        );
    }

    return (
        <>
            {deleteRequests.length > 0 && (
                <ApprovalSection title={t('tasksModule.deleteRequest.section')} count={deleteRequests.length}>
                    {deleteRequests.map((task) => (
                        <DeleteRequestCard
                            key={task.id}
                            task={task}
                            people={people}
                            nowMs={nowMs}
                            busy={busyKey === approvalBusyKey('delete', task.id)}
                            onReject={() => onReject('delete', task)}
                            onApprove={() => void decide('delete', task, 'approve')}
                        />
                    ))}
                </ApprovalSection>
            )}
            {completionRequests.length > 0 && (
                <ApprovalSection title={t('tasksModule.approvals.completions')} count={completionRequests.length}>
                    {completionRequests.map((task) => (
                        <CompletionRequestCard
                            key={task.id}
                            task={task}
                            people={people}
                            nowMs={nowMs}
                            busy={busyKey === approvalBusyKey('completion', task.id)}
                            onReject={() => onReject('completion', task)}
                            onApprove={() => void decide('completion', task, 'approve')}
                        />
                    ))}
                </ApprovalSection>
            )}
            {reviewRequests.length > 0 && (
                <ApprovalSection title={t('tasksModule.approvals.proposals')} count={reviewRequests.length}>
                    {reviewRequests.map((task) => (
                        <ProposalCard
                            key={task.id}
                            task={task}
                            people={people}
                            nowMs={nowMs}
                            busy={busyKey === approvalBusyKey('review', task.id)}
                            onReject={() => onReject('review', task)}
                            onApprove={() => void decide('review', task, 'approve')}
                        />
                    ))}
                </ApprovalSection>
            )}
        </>
    );
};
