import { t } from '@/i18n/translate';
import type { PeopleMap, TaskDetail } from '@/types/tasksModule';
import { formatDuration, personName, relativeTime } from '../../utils/taskFormat';
import { ApprovalCard } from './ApprovalCard';

/* Abschlussanfrage: wer fragt · wann · gemessene Zeit · Checklistenstand, die Notiz als Zitat. */
export const CompletionRequestCard = ({
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
}) => (
    <ApprovalCard
        task={task}
        meta={[
            personName(people, task.approval.requestedById),
            relativeTime(task.approval.requestedAt, nowMs),
            formatDuration(task.work?.totalMs ?? 0),
            t('tasksModule.approvals.items', { done: task.checklist.done, total: task.checklist.total }),
        ]}
        quote={task.approval.note}
        busy={busy}
        onReject={onReject}
        onApprove={onApprove}
    />
);
