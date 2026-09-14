import { t } from '@/i18n/translate';
import type { PeopleMap, TaskDetail } from '@/types/tasksModule';
import { personName, relativeTime } from '../../utils/taskFormat';
import { ApprovalCard } from './ApprovalCard';

/* Löschanfrage (nur Admins sehen sie): wer fragt · wann, der Grund als Zitat. «Onayla» löscht die Aufgabe. */
export const DeleteRequestCard = ({
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
            personName(people, task.deleteRequest.requestedById),
            relativeTime(task.deleteRequest.requestedAt, nowMs),
        ]}
        quote={task.deleteRequest.note}
        warning={t('tasksModule.deleteRequest.cardWarning')}
        busy={busy}
        onReject={onReject}
        onApprove={onApprove}
    />
);
