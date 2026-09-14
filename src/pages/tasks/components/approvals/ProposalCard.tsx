import { t } from '@/i18n/translate';
import type { PeopleMap, TaskDetail } from '@/types/tasksModule';
import { formatDuration, personName, relativeTime } from '../../utils/taskFormat';
import { ApprovalCard } from './ApprovalCard';

/**
 * Aufgabenvorschlag eines Teammitglieds. Wurde daran schon gearbeitet, sagt
 * eine Warnzeile, dass ein Ablehnen diese Zeit als verloren in den Rapport
 * schreibt (der Server schliesst die Messungen dabei ab).
 */
export const ProposalCard = ({
    task,
    people,
    nowMs,
    busy,
    onReject,
    onApprove,
}: {
    task: TaskDetail;
    people: PeopleMap;
    nowMs: number;
    busy: boolean;
    onReject: () => void;
    onApprove: () => void;
}) => {
    const creatorId = task.review.requestedById || task.createdById;
    const worked = task.work?.totalMs ?? 0;
    const workedText = formatDuration(worked);
    return (
        <ApprovalCard
            task={task}
            meta={[
                t('tasksModule.approvals.createdBy', { name: personName(people, creatorId) }),
                relativeTime(task.createdAt, nowMs),
                worked > 0 && t('tasksModule.approvals.worked', { time: workedText }),
            ]}
            quote={task.description}
            warning={worked > 0 ? t('tasksModule.approvals.wasteWarning', { time: workedText }) : null}
            busy={busy}
            onReject={onReject}
            onApprove={onApprove}
            approveLabel={t('tasksModule.review.suitable')}
            rejectLabel={t('tasksModule.review.notSuitable')}
        />
    );
};
