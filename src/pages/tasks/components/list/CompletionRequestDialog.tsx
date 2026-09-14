import { t } from '@/i18n/translate';
import type { TaskRow } from '@/types/tasksModule';
import { ReasonDialog } from '../shared/ReasonDialog';

/**
 * «Tamamlama isteği» eines Teammitglieds (Görevly `V.requestCompletionSheet`):
 * Notiz freiwillig, der Hinweis sagt, dass die Uhr anhält. Offene
 * Checklistenpunkte stehen als Warnung darüber — gesendet werden darf trotzdem.
 */
export const CompletionRequestDialog = ({
    task,
    busy,
    onClose,
    onConfirm,
}: {
    task: Pick<TaskRow, 'checklist'> | null;
    busy: boolean;
    onClose: () => void;
    onConfirm: (note: string) => void;
}) => {
    const openItems = task ? task.checklist.total - task.checklist.done : 0;
    return (
        <ReasonDialog
            open={task !== null}
            onClose={onClose}
            onConfirm={onConfirm}
            title={t('tasksModule.list.completion.title')}
            subtitle={t('tasksModule.list.completion.callout')}
            label={t('tasksModule.list.completion.note')}
            confirmLabel={t('tasksModule.list.completion.confirm')}
            note={openItems > 0 ? t('tasksModule.list.completion.openItems', { count: openItems }) : undefined}
            busy={busy}
        />
    );
};
