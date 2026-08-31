import { useRef } from 'react';
import { t } from '@/i18n/translate';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import type { FormSubmissionDto } from '@/lib/api/forms';
import { FormFillView, type FormFillHandle } from './FormFillView';

/**
 * Untenfenster mit dem Checklisten-Editor. Schliessen mit ungesicherten
 * Änderungen sichert STILL nach (der Editor sichert ohnehin von selbst) —
 * keine Meldung: sonst käme bei jedem Schliessen eine (Vorgabe 16.08.2026).
 */
export const FormFillSheet = ({
    submissionId,
    open,
    onClose,
    onSaved,
    onDeleted,
    title,
}: {
    submissionId: string | null;
    open: boolean;
    onClose: () => void;
    onSaved?: (submission: FormSubmissionDto) => void;
    onDeleted?: () => void;
    title?: string;
}) => {
    const handle = useRef<FormFillHandle | null>(null);

    const close = async () => {
        const current = handle.current;
        if (current?.dirty && !current.saving) await current.save();
        onClose();
    };

    if (!open || !submissionId) return null;
    return (
        <BottomSheet open title={title || t('forms.fill.title')} onClose={() => void close()} width={1100} height={860} zIndex={120}>
            <div className="p-5">
                <FormFillView
                    submissionId={submissionId}
                    saveHandleRef={handle}
                    onSaved={onSaved}
                    onDeleted={() => { onDeleted?.(); onClose(); }}
                />
            </div>
        </BottomSheet>
    );
};
