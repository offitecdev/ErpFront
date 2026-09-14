import { DangerConfirmDialog } from '@/components/ui-shared/DangerConfirmDialog';
import { t } from '@/i18n/translate';
import { ReasonDialog } from '../shared/ReasonDialog';
import { CompletionRequestDialog } from './CompletionRequestDialog';
import type { TaskRowDialogsState } from './useTaskRowActions';

/* Die Fenster der Zeilenhandlungen — EIN Ort, damit die Seite schlank bleibt. */
export const TaskRowDialogs = ({ dialogs }: { dialogs: TaskRowDialogsState }) => (
    <>
        <CompletionRequestDialog
            task={dialogs.completionFor}
            busy={dialogs.busy}
            onClose={dialogs.closeCompletion}
            onConfirm={(note) => void dialogs.confirmCompletion(note)}
        />
        <ReasonDialog
            open={dialogs.blockFor !== null}
            onClose={dialogs.closeBlock}
            onConfirm={(reason) => void dialogs.confirmBlock(reason)}
            title={t('tasksModule.list.block.title')}
            subtitle={dialogs.blockFor?.title}
            label={t('tasksModule.list.block.label')}
            confirmLabel={t('common.save')}
            initialValue={dialogs.blockFor?.blockReason ?? ''}
            required
            busy={dialogs.busy}
        />
        <ReasonDialog
            open={dialogs.deleteRequestFor !== null}
            onClose={dialogs.closeDeleteRequest}
            onConfirm={(note) => void dialogs.confirmDeleteRequest(note)}
            title={t('tasksModule.deleteRequest.dialogTitle')}
            subtitle={dialogs.deleteRequestFor?.title}
            label={t('tasksModule.deleteRequest.noteLabel')}
            confirmLabel={t('tasksModule.deleteRequest.send')}
            danger
            busy={dialogs.busy}
        />
        <DangerConfirmDialog
            open={dialogs.deleteFor !== null}
            title={t('tasksModule.list.delete.title')}
            message={dialogs.deleteFor?.title}
            confirmLabel={t('common.delete')}
            requirePassword={false}
            busy={dialogs.busy}
            onCancel={dialogs.closeDelete}
            onConfirm={() => void dialogs.confirmDelete()}
        />
    </>
);
