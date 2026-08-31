import { AlertTriangle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupActions, PopupButton, TenderDialog } from './shell/TenderPopupShell';

type UnsavedChangesPopupProps = {
    open: boolean;
    /** Persist the pending edits, then continue navigating. */
    onSave: () => void;
    /** Throw the pending edits away and continue navigating. */
    onDiscard: () => void;
    /** Stay on the page (X / scrim / Escape). */
    onCancel: () => void;
    /** True while the save is in flight. */
    saving?: boolean;
    /**
     * Initial-entry auto-save: the exit already triggered the save itself, so
     * only a "Saving…" panel is shown — no buttons, no way to dismiss.
     */
    autoSaving?: boolean;
};

/**
 * In-app replacement for the browser's "Leave site?" bar, shown when the user
 * leaves a quote with unsaved changes via the menu, a link or Back. (A hard
 * refresh or tab close still uses the browser's own dialog.)
 */
export const UnsavedChangesPopup = ({
    open,
    onSave,
    onDiscard,
    onCancel,
    saving = false,
    autoSaving = false,
}: UnsavedChangesPopupProps) => {
    const locked = saving || autoSaving;
    return (
        <TenderDialog
            open={open}
            onClose={() => { if (!locked) onCancel(); }}
            title={autoSaving ? t('tenders.unsaved_autosave_title') : t('tenders.unsaved_modal_title')}
            subtitle={autoSaving ? t('tenders.unsaved_autosave_desc') : t('tenders.unsaved_modal_desc')}
            icon={autoSaving ? <span className="ofi-tp-spinner" style={{ width: 18, height: 18 }} /> : <AlertTriangle size={20} />}
            tone={autoSaving ? 'neutral' : 'warning'}
            width={460}
            closeOnBackdrop={!locked}
            closeOnEscape={!locked}
            hideClose={autoSaving}
            footer={autoSaving ? undefined : (
                <PopupActions>
                    <PopupButton onClick={onDiscard} disabled={saving}>{t('tenders.unsaved_discard_no')}</PopupButton>
                    <PopupButton variant="primary" onClick={onSave} loading={saving}>{t('tenders.unsaved_save_yes')}</PopupButton>
                </PopupActions>
            )}
        />
    );
};
