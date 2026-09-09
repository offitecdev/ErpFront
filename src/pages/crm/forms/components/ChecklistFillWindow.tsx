import { useCallback, useRef, useState } from 'react';
import { LuFileText, LuLink2, LuTrash2 } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { FormSubmissionDto } from '@/lib/api/forms';
import { linkedCustomerLine } from '../ui';
import { ChecklistWindow } from './ChecklistWindow';
import { FormFillView, type FormFillHandle, type FormFillState } from './FormFillView';

/**
 * ── DIE CHECKLISTE ALS FENSTER ──────────────────────────────────────────────
 * Das schwebende Fenster (ChecklistWindow = Kalenderkarte) mit dem Editor
 * darin. Der Kopf trägt Vorlage und Kunde · Angebot, rechts den Speicherstand
 * und die Symbolknöpfe (PDF, Verknüpfung, Löschen); der Fuss den Fortschritt
 * und den Speichern-Knopf. Der Editor selbst zeichnet nur die Gruppen
 * (`chrome="none"`) und reicht Griffe und Stand über `handleRef`/`onState`.
 *
 * Schliessen mit ungesicherten Änderungen sichert STILL nach (der Editor
 * sichert ohnehin von selbst) — keine Meldung, sonst käme bei jedem
 * Schliessen eine (Vorgabe 16.08.2026).
 */
export const ChecklistFillWindow = ({
    submissionId,
    open,
    onClose,
    onSaved,
    onDeleted,
    allowDelete = true,
    canEditLinks = true,
}: {
    submissionId: string | null;
    open: boolean;
    onClose: () => void;
    onSaved?: (submission: FormSubmissionDto) => void;
    onDeleted?: () => void;
    allowDelete?: boolean;
    canEditLinks?: boolean;
}) => {
    const handle = useRef<FormFillHandle | null>(null);
    const [state, setState] = useState<FormFillState | null>(null);
    const onState = useCallback((next: FormFillState) => setState(next), []);

    const close = async () => {
        const current = handle.current;
        if (current?.dirty && !current.saving) await current.save();
        onClose();
    };

    if (!open || !submissionId) return null;

    const submission = state?.submission ?? null;
    const customerLine = submission ? linkedCustomerLine(submission) : '';
    const subtitle = submission
        ? [customerLine, submission.tenderCount > 1 ? t('forms.link.tenderCount', { count: submission.tenderCount }) : submission.tenderNumber].filter(Boolean).join(' · ') || t('forms.fill.stepLinkEmpty')
        : '';
    const statusText = !state
        ? ''
        : state.saving
            ? t('forms.fill.saving')
            : state.dirty
                ? t('forms.fill.unsaved')
                : state.savedAt
                    ? t('forms.fill.autoSaved', { time: state.savedAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) })
                    : t('forms.fill.saved');

    return (
        <ChecklistWindow
            open
            title={submission?.templateName || t('forms.fill.title')}
            subtitle={subtitle}
            onClose={() => void close()}
            headerActions={(
                <>
                    {statusText && <span className={`ofi-chk-status ${state?.dirty ? 'is-dirty' : ''}`}>{statusText}</span>}
                    <button type="button" className="ofi-float-card__iconbtn" title={t('forms.fill.pdf')} aria-label={t('forms.fill.pdf')} disabled={!submission} onClick={() => handle.current?.openPdf()}>
                        <LuFileText size={17} />
                    </button>
                    {canEditLinks && (
                        <button type="button" className="ofi-float-card__iconbtn" title={t('forms.fill.editLink')} aria-label={t('forms.fill.editLink')} disabled={!submission} onClick={() => handle.current?.editLinks()}>
                            <LuLink2 size={17} />
                        </button>
                    )}
                    {allowDelete && (
                        <button type="button" className="ofi-float-card__iconbtn is-danger" title={t('common.delete')} aria-label={t('common.delete')} disabled={!submission} onClick={() => handle.current?.requestDelete()}>
                            <LuTrash2 size={17} />
                        </button>
                    )}
                </>
            )}
            footer={(
                <div className="ofi-chk-foot">
                    <span className="ofi-chk-foot__progress">
                        {state && state.total > 0 && (
                            <>
                                <span className="ofi-chk-meter" aria-hidden>
                                    <span style={{ width: `${Math.round((state.done / state.total) * 100)}%` }} />
                                </span>
                                <span>{t('forms.fill.progress', { done: state.done, total: state.total })}</span>
                            </>
                        )}
                    </span>
                    <span className="ofi-chk-foot__actions">
                        <button type="button" className="ofi-cal-btn" onClick={() => void close()}>{t('common.close')}</button>
                        <button
                            type="button"
                            className="ofi-cal-btn is-primary"
                            disabled={!state?.dirty || state.saving}
                            onClick={() => void handle.current?.saveNow()}
                        >
                            {t('forms.fill.saveDraft')}
                        </button>
                    </span>
                </div>
            )}
        >
            <FormFillView
                submissionId={submissionId}
                handleRef={handle}
                onState={onState}
                onSaved={onSaved}
                onDeleted={() => { onDeleted?.(); onClose(); }}
                allowDelete={allowDelete}
                canEditLinks={canEditLinks}
                chrome="none"
            />
        </ChecklistWindow>
    );
};
