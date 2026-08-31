import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from '@/components/icons/antIconCompat';

import {
    PopupActions,
    PopupButton,
    PopupDialog,
    PopupField,
    PopupNote,
} from '../../components/ui-shared/PopupKit';
import { projectApi } from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

// The exact keyword the manager must type to confirm a special closure. It is a
// fixed all-caps token (like a "DELETE to confirm" gate), not translated, so the
// prompt shows the literal word to type in every language.
export const SPECIAL_CLOSURE_KEYWORD = 'CLOSED';

/* Opened from the completion wizard (dialog z 150) — it has to sit above it. */
const Z = 210;

/**
 * Manager-only "Special Closure" (Sonderabschluss) confirmation dialog. Force-closes
 * the project into the distinct SPECIALLY_CLOSED status once the manager types the
 * exact confirmation keyword. Kept in its own file and opened from the Complete
 * Project pop-up (see {@link ProjectProcessModal}).
 */
export const SpecialClosureModal = ({
    project,
    onClose,
    onClosed,
}: {
    project: ProjectDto;
    onClose: () => void;
    /** Called after the project is successfully specially closed. */
    onClosed?: () => void;
}) => {
    const [confirmText, setConfirmText] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const keywordMatches = confirmText === SPECIAL_CLOSURE_KEYWORD;

    const submitClosure = async () => {
        if (!keywordMatches) return;
        setSubmitting(true);
        try {
            await projectApi.update(project.id, { status: 'SPECIALLY_CLOSED' });
            toast.success(t('projects.specialClosure.success'));
            (onClosed ?? onClose)();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.specialClosure.error'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <PopupDialog
            open
            title={t('projects.specialClosure.title')}
            subtitle={t('projects.specialClosure.subtitle')}
            icon={<AlertTriangle size={20} />}
            tone="danger"
            width={460}
            z={Z}
            onClose={() => { if (!submitting) onClose(); }}
            closeOnBackdrop={!submitting}
            closeOnEscape={!submitting}
            footer={(
                <PopupActions>
                    <PopupButton disabled={submitting} onClick={onClose}>{t('common.cancel')}</PopupButton>
                    <PopupButton
                        variant="danger"
                        loading={submitting}
                        disabled={!keywordMatches}
                        onClick={() => void submitClosure()}
                    >
                        {t('projects.specialClosure.confirm')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <PopupNote tone="danger">
                <b>{t('projects.specialClosure.warningTitle')}</b>
                <div>{t('projects.specialClosure.warningDesc')}</div>
            </PopupNote>

            <PopupField
                className="pt-3"
                label={t('projects.specialClosure.confirmPrompt', { keyword: SPECIAL_CLOSURE_KEYWORD })}
                required
            >
                <input
                    className="ofi-cal-input ofi-tp-keyword w-full"
                    value={confirmText}
                    autoFocus
                    placeholder={SPECIAL_CLOSURE_KEYWORD}
                    spellCheck={false}
                    autoCapitalize="characters"
                    onChange={(e) => setConfirmText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && keywordMatches) void submitClosure(); }}
                />
            </PopupField>
            {confirmText.length > 0 && !keywordMatches && (
                <div className="ofi-tp-required pt-1 text-[11.5px] font-medium">
                    {t('projects.specialClosure.mismatch', { keyword: SPECIAL_CLOSURE_KEYWORD })}
                </div>
            )}
        </PopupDialog>
    );
};
