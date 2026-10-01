import { useState } from 'react';
import { LockOpen } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';

/**
 * ── BITTE UM ENTSPERREN (30.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * «The normal employees should be able to send unlock requests to the admins
 * for tasks by clicking on the lock icon.» Ein Klick auf das Schloss einer
 * gesperrten Unteraufgabe (freigegeben oder wartend) öffnet dieses Fenster:
 * warum entsperren (frei lassbar) — die Verwaltung sieht die Bitte unter
 * «Requests» der Stufe und bekommt eine Nachricht.
 */
export const UnlockRequestDialog = ({
    subtaskLabel,
    awaiting,
    onSend,
    onClose,
}: {
    /** «M-01.2 · Verdrahtung». */
    subtaskLabel: string;
    /** Wartet sie auf die Freigabe (sonst: freigegeben)? */
    awaiting: boolean;
    onSend: (note: string) => Promise<boolean>;
    onClose: () => void;
}) => {
    const [note, setNote] = useState('');
    const [sending, setSending] = useState(false);

    const submit = async () => {
        if (sending) return;
        setSending(true);
        const done = await onSend(note.trim());
        setSending(false);
        if (done) onClose();
    };

    return (
        <PopupDialog
            open
            closeOnBackdrop={false}
            onClose={() => { if (!sending) onClose(); }}
            title={t('productionTasks.requests.unlockTitle')}
            subtitle={t(awaiting ? 'productionTasks.requests.unlockTextAwaiting' : 'productionTasks.requests.unlockText', { subtask: subtaskLabel })}
            icon={<LockOpen size={18} />}
            width={480}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={sending}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={sending} onClick={() => void submit()}>
                        {t('productionTasks.requests.unlockSend')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-complete">
                <label className="ofi-ptk-complete__block">
                    <span className="ofi-ptk-complete__label">{t('productionTasks.requests.unlockReason')}</span>
                    <textarea
                        className="ofi-ptk-input ofi-ptk-complete__note"
                        rows={3}
                        maxLength={500}
                        value={note}
                        autoFocus
                        placeholder={t('productionTasks.requests.unlockReasonPlaceholder')}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
            </div>
        </PopupDialog>
    );
};
