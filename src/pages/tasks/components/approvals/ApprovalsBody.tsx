import { LoadingPanel } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskDetail } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { ApprovalSection } from './ApprovalSection';
import { DeleteRequestCard } from './DeleteRequestCard';
import { approvalBusyKey, type TaskApprovalsState } from './useTaskApprovals';

/* Laden, Fehler, «Bekleyen onay yok» — sonst die Tafel der Löschanfragen. */
export const ApprovalsBody = ({
    approvals,
    onReject,
}: {
    approvals: TaskApprovalsState;
    onReject: (task: TaskDetail) => void;
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

    const { people } = data;
    const deleteRequests = data.deleteRequests ?? [];
    if (!deleteRequests.length) {
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
        <ApprovalSection title={t('tasksModule.deleteRequest.section')} count={deleteRequests.length}>
            {deleteRequests.map((task) => (
                <DeleteRequestCard
                    key={task.id}
                    task={task}
                    people={people}
                    nowMs={nowMs}
                    busy={busyKey === approvalBusyKey(task.id)}
                    onReject={() => onReject(task)}
                    onApprove={() => void decide(task, 'approve')}
                />
            ))}
        </ApprovalSection>
    );
};
