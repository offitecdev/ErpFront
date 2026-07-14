import { useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle } from '@/components/icons/antIconCompat';

import { Modal } from '../../components/ui-shared/Modal';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { projectApi } from '../../lib/api/project';
import type { ProjectDto } from '../../types/project';

import { t } from '@/i18n/translate';

// The exact keyword the manager must type to confirm a special closure. It is a
// fixed all-caps token (like a "DELETE to confirm" gate), not translated, so the
// prompt shows the literal word to type in every language.
export const SPECIAL_CLOSURE_KEYWORD = 'CLOSED';

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
        <Modal
            open
            width="sm"
            title={t('projects.specialClosure.title')}
            description={t('projects.specialClosure.subtitle')}
            onClose={() => { if (!submitting) onClose(); }}
            closeOnBackdrop={!submitting}
            footer={(
                <>
                    <Button variant="ghost" onClick={onClose} disabled={submitting}>
                        {t('common.cancel')}
                    </Button>
                    <Button
                        variant="danger"
                        loading={submitting}
                        disabled={!keywordMatches}
                        onClick={() => void submitClosure()}
                    >
                        {t('projects.specialClosure.confirm')}
                    </Button>
                </>
            )}
        >
            <div className="space-y-4">
                <div className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5">
                    <AlertTriangle size={16} className="mt-0.5 shrink-0 text-red-600" />
                    <div>
                        <div className="text-[13px] font-semibold text-red-700">{t('projects.specialClosure.warningTitle')}</div>
                        <div className="mt-0.5 text-[12px] text-red-700/80">{t('projects.specialClosure.warningDesc')}</div>
                    </div>
                </div>

                <Field label={t('projects.specialClosure.confirmPrompt', { keyword: SPECIAL_CLOSURE_KEYWORD })}>
                    <Input
                        value={confirmText}
                        autoFocus
                        placeholder={SPECIAL_CLOSURE_KEYWORD}
                        spellCheck={false}
                        autoCapitalize="characters"
                        onChange={(e) => setConfirmText(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && keywordMatches) void submitClosure(); }}
                    />
                    {confirmText.length > 0 && !keywordMatches && (
                        <div className="mt-1 text-[11.5px] font-medium text-red-600">
                            {t('projects.specialClosure.mismatch', { keyword: SPECIAL_CLOSURE_KEYWORD })}
                        </div>
                    )}
                </Field>
            </div>
        </Modal>
    );
};
