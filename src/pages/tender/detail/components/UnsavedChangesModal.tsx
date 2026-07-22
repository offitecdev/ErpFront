import React from 'react';
import Modal from 'antd/es/modal';
import { AlertTriangle } from '@/components/icons/antIconCompat';

import { Button } from '../../../../components/ui-shared/Button';
import { t } from '@/i18n/translate';

interface UnsavedChangesModalProps {
    open: boolean;
    /** Persist the pending edits, then continue navigating. Left button. */
    onSave: () => void;
    /** Throw the pending edits away and continue navigating. Right button. */
    onDiscard: () => void;
    /** Dismiss the popup and stay on the page (backdrop / X). */
    onCancel: () => void;
    /** True while the save is in flight, so the left button shows a spinner. */
    saving?: boolean;
}

/**
 * In-app replacement for Chrome's native "Leave site?" bar. Shown when the user
 * tries to leave a tender with unsaved changes by switching menus / following a
 * link / using the browser Back button. (A hard refresh or tab close still uses
 * the browser's own dialog — custom UI is not allowed there.)
 */
export const UnsavedChangesModal: React.FC<UnsavedChangesModalProps> = ({
    open,
    onSave,
    onDiscard,
    onCancel,
    saving = false,
}) => {
    return (
        <Modal
            open={open}
            onCancel={onCancel}
            centered
            footer={null}
            mask={{ closable: !saving }}
            keyboard={!saving}
            width={456}
            destroyOnHidden
        >
            <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                    <AlertTriangle size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">{t('tenders.unsaved_modal_title')}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t('tenders.unsaved_modal_desc')}</p>
                </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" onClick={onSave} loading={saving} className="flex-1">
                    {t('tenders.unsaved_save_yes')}
                </Button>
                <Button variant="secondary" onClick={onDiscard} disabled={saving} className="flex-1">
                    {t('tenders.unsaved_discard_no')}
                </Button>
            </div>
        </Modal>
    );
};
