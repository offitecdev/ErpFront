import { t } from '@/i18n/translate';
import { ReasonDialog } from '../shared/ReasonDialog';

/**
 * «Tamamlama isteği gönder» (Görevly V.requestCompletionSheet): die Messung
 * hält an, die Aufgabe geht zur Freigabe an die Leitung. Offene Punkte der
 * Checkliste werden erwähnt, sperren aber nicht.
 */
export const CompletionRequestDialog = ({
    open,
    openItems,
    busy,
    onClose,
    onConfirm,
}: {
    open: boolean;
    openItems: number;
    busy: boolean;
    onClose: () => void;
    onConfirm: (note: string) => void;
}) => (
    <ReasonDialog
        open={open}
        onClose={onClose}
        onConfirm={onConfirm}
        title={t('tasksModule.detail.requestTitle')}
        subtitle={t('tasksModule.detail.requestCallout')}
        label={t('tasksModule.detail.requestNote')}
        confirmLabel={t('tasksModule.detail.requestSend')}
        busy={busy}
        note={openItems > 0 ? t('tasksModule.detail.openItems', { count: openItems }) : undefined}
    />
);
