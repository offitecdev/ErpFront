import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { LuFileText, LuPencilLine, LuSave, LuTrash2 } from 'react-icons/lu';
import { t } from '@/i18n/translate';
import { formsApi, type FormSubmissionDto } from '@/lib/api/forms';
import { computeFieldVisibility, isFormValueEmpty, type FormValues } from '@/lib/formFields';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { LoadingPanel } from '@/components/ui-shared/Loader';
import { FormRenderer } from './FormRenderer';
import { ChecklistLinkDialog, type ChecklistTarget } from './ChecklistLinkDialog';
import { apiErrorMessage, fmtDate, fmtDateTime, linkedCustomerLine, presetsFromLinks } from '../ui';

/**
 * ── EINE CHECKLISTE ANSEHEN / AUSFÜLLEN ─────────────────────────────────────
 * Lädt sich selbst über die Id (die Werte samt Fotos/Zeichnungen kommen NUR
 * hier, nie in Listen) und zeichnet den Inhalt im Apple-Kleid (`.ofi-chk`):
 * oben die Gruppe «Verknüpfungen», dann je Abschnitt eine Gruppe mit den
 * Feldern, unten die Bemerkungen.
 *
 * KEIN Status (Vorgabe 16.08.2026): weder «Entwurf» noch «Abgeschlossen» —
 * eine Checkliste wird erfasst, verknüpft und ausgefüllt. Sie ist darum immer
 * bearbeitbar.
 *
 *  • Gespeichert wird auf Knopfdruck UND von selbst: nach kurzer Ruhe schreibt
 *    der Editor still (keine Meldung — nur die Zeile «Gespeichert HH:MM»).
 *    Nur der Knopf meldet sich, weil ihn jemand gedrückt hat.
 *  • Der letzte Speicherstand gilt (Ersetzen wie beim Montage-Rapport).
 *  • PDF — Vorschau im Untenfenster + Download (formSubmissionPdf, dynamic
 *    import).
 *
 * Zwei Kleider, ein Editor: im FENSTER (`chrome="none"`, ChecklistFillWindow)
 * trägt die Karte Titel, Status und Knöpfe selbst und greift über
 * `handleRef`/`onState` hinein; als SEITE (`chrome="inline"`, Montage-Tablet
 * und /crm/forms/:id) steht eine schmale Werkzeugleiste oben.
 *
 * Techniker (Vorgabe 02.09.2026): `canEditLinks={false}` — sie füllen aus,
 * die Verknüpfung pflegt das Büro; löschen können sie ohnehin nicht.
 */
export interface FormFillHandle {
    dirty: boolean;
    saving: boolean;
    /** Still speichern (für Fenster, die beim Schliessen sichern). */
    save: () => Promise<boolean>;
    /** Speichern mit Meldung — der Knopf. */
    saveNow: () => Promise<void>;
    openPdf: () => void;
    requestDelete: () => void;
    editLinks: () => void;
}

/** Was das Fenster für Kopf und Fuss wissen muss. */
export interface FormFillState {
    submission: FormSubmissionDto | null;
    loading: boolean;
    dirty: boolean;
    saving: boolean;
    savedAt: Date | null;
    /** Ausgefüllte / sichtbare Felder (ohne Abschnitte). */
    done: number;
    total: number;
}

/** Ruhezeit, nach der von selbst gespeichert wird. */
const AUTOSAVE_DELAY_MS = 1500;

export const FormFillView = ({
    submissionId,
    onSaved,
    onDeleted,
    handleRef,
    onState,
    allowDelete = true,
    canEditLinks = true,
    showLinks = true,
    variant = 'default',
    chrome = 'inline',
}: {
    submissionId: string;
    onSaved?: (submission: FormSubmissionDto) => void;
    onDeleted?: () => void;
    handleRef?: MutableRefObject<FormFillHandle | null>;
    onState?: (state: FormFillState) => void;
    allowDelete?: boolean;
    /** Techniker: nein — die Verknüpfung pflegt das Büro. */
    canEditLinks?: boolean;
    showLinks?: boolean;
    /** montage: grössere Knöpfe für den Tablet-Bildschirm. */
    variant?: 'default' | 'montage';
    /** 'none' im Fenster (Kopf/Fuss gehören der Karte), 'inline' als Seite. */
    chrome?: 'inline' | 'none';
}) => {
    const [submission, setSubmission] = useState<FormSubmissionDto | null>(null);
    // Geladen für welche Id? Daraus leitet sich "lädt" ab — kein setState im
    // Effekt, und ein Wechsel der Id zeigt sofort wieder den Platzhalter.
    const [loadedFor, setLoadedFor] = useState<string | null>(null);
    const loading = loadedFor !== submissionId;
    const [values, setValues] = useState<FormValues>({});
    const [notes, setNotes] = useState('');
    const [baseline, setBaseline] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<Date | null>(null);
    const [linkOpen, setLinkOpen] = useState(false);
    const [linking, setLinking] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [pdfOpen, setPdfOpen] = useState(false);
    const [pdfBlob, setPdfBlob] = useState<Blob | null>(null);
    const [pdfLoading, setPdfLoading] = useState(false);

    const adopt = useCallback((next: FormSubmissionDto) => {
        setSubmission(next);
        const nextValues = (next.values && typeof next.values === 'object' ? next.values : {}) as FormValues;
        setValues(nextValues);
        setNotes(next.notes || '');
        setBaseline(JSON.stringify({ values: nextValues, notes: next.notes || '' }));
    }, []);

    useEffect(() => {
        let cancelled = false;
        formsApi.getSubmission(submissionId)
            .then((dto) => { if (!cancelled) adopt(dto); })
            .catch((error) => { if (!cancelled) { setSubmission(null); toast.error(apiErrorMessage(error, t('forms.errors.load'))); } })
            .finally(() => { if (!cancelled) setLoadedFor(submissionId); });
        return () => { cancelled = true; };
    }, [submissionId, adopt]);

    const dirty = useMemo(() => JSON.stringify({ values, notes }) !== baseline, [values, notes, baseline]);
    const fields = useMemo(() => (Array.isArray(submission?.templateFields) ? submission!.templateFields : []), [submission]);

    /* Fortschritt: sichtbare Felder ohne Abschnitte, davon die ausgefüllten. */
    const progress = useMemo(() => {
        const visibility = computeFieldVisibility(fields, values);
        const visible = fields.filter((field) => field.type !== 'SECTION' && visibility[field.id] !== false);
        return { total: visible.length, done: visible.filter((field) => !isFormValueEmpty(field, values[field.id])).length };
    }, [fields, values]);

    const setValue = useCallback((fieldId: string, value: unknown) => {
        setValues((current) => ({ ...current, [fieldId]: value }));
    }, []);

    /**
     * Schreiben. `silent` (automatisch) meldet nur FEHLER, und auch die nur
     * einmal je Fehlerlauf — sonst stünde bei abgerissener Verbindung alle
     * paar Sekunden dieselbe Meldung auf dem Bildschirm.
     */
    const errorShown = useRef(false);
    /** Der JETZIGE Stand — für den Vergleich nach dem Speichern (s. u.). */
    const latest = useRef({ values, notes });
    useEffect(() => { latest.current = { values, notes }; }, [values, notes]);

    const persist = useCallback(async (options: { silent?: boolean } = {}): Promise<boolean> => {
        if (!submission) return false;
        const sentValues = values;
        const sentNotes = notes;
        setSaving(true);
        try {
            const updated = await formsApi.updateSubmission(submission.id, { values: sentValues, notes: sentNotes || null });
            // Die Antwort ist die BLANKE Zeile (ohne Beschriftungen) — die
            // gezeigten Kettenangaben bleiben, die Werte kommen vom Server.
            const serverValues = (updated.values && typeof updated.values === 'object' ? updated.values : sentValues) as FormValues;
            const merged: FormSubmissionDto = {
                ...submission,
                ...updated,
                templateFields: submission.templateFields,
                values: serverValues,
            };
            setSubmission(merged);
            // WÄHREND des Speicherns weitergetippt? Dann bleibt das Getippte
            // stehen (die Antwort darf es nicht überschreiben) und der
            // Vergleichsstand ist das GESENDETE — "geändert" bleibt wahr, das
            // automatische Sichern schreibt gleich noch einmal.
            const typedMeanwhile = latest.current.values !== sentValues || latest.current.notes !== sentNotes;
            if (!typedMeanwhile) {
                setValues(serverValues);
                setNotes(sentNotes);
            }
            setBaseline(JSON.stringify({
                values: typedMeanwhile ? sentValues : serverValues,
                notes: sentNotes,
            }));
            setSavedAt(new Date());
            errorShown.current = false;
            onSaved?.(merged);
            return true;
        } catch (error) {
            if (!options.silent || !errorShown.current) {
                errorShown.current = true;
                toast.error(apiErrorMessage(error, t('forms.errors.save')));
            }
            return false;
        } finally {
            setSaving(false);
        }
    }, [submission, values, notes, onSaved]);

    // Automatisch sichern: der Aufruf liegt im Ref, damit die Ruhezeit nur an
    // TIPPEN hängt (values/notes) und nicht an jeder neuen Funktionsidentität.
    const persistRef = useRef(persist);
    useEffect(() => { persistRef.current = persist; }, [persist]);

    useEffect(() => {
        if (!submission || !dirty || saving) return;
        const timer = setTimeout(() => { void persistRef.current({ silent: true }); }, AUTOSAVE_DELAY_MS);
        return () => clearTimeout(timer);
    }, [submission, dirty, saving, values, notes]);

    const saveNow = useCallback(async () => {
        const ok = await persist();
        if (ok) toast.success(t('forms.toasts.saved'));
    }, [persist]);

    const openPdf = useCallback(async () => {
        if (!submission) return;
        setPdfOpen(true);
        setPdfLoading(true);
        setPdfBlob(null);
        try {
            const { exportFormSubmissionPdf } = await import('@/utils/pdf/formSubmissionPdf');
            const blob = await exportFormSubmissionPdf({ submission: { ...submission, values, notes }, output: 'blob' });
            setPdfBlob(blob);
        } catch {
            toast.error(t('forms.errors.pdf'));
        } finally {
            setPdfLoading(false);
        }
    }, [submission, values, notes]);

    const downloadPdf = async () => {
        if (!submission) return;
        try {
            const { exportFormSubmissionPdf } = await import('@/utils/pdf/formSubmissionPdf');
            await exportFormSubmissionPdf({ submission: { ...submission, values, notes }, output: 'download' });
        } catch {
            toast.error(t('forms.errors.pdf'));
        }
    };

    // Für das Fenster: Griffe (Speichern, PDF, Löschen, Verknüpfung) und Stand.
    useEffect(() => {
        if (!handleRef) return;
        handleRef.current = {
            dirty,
            saving,
            save: () => persist({ silent: true }),
            saveNow,
            openPdf: () => { void openPdf(); },
            requestDelete: () => setConfirmDelete(true),
            editLinks: () => setLinkOpen(true),
        };
        return () => { handleRef.current = null; };
    }, [handleRef, dirty, saving, persist, saveNow, openPdf]);

    useEffect(() => {
        onState?.({ submission, loading, dirty, saving, savedAt, done: progress.done, total: progress.total });
    }, [onState, submission, loading, dirty, saving, savedAt, progress.done, progress.total]);

    /**
     * Verknüpfung ändern: erst das Getippte sichern (sonst ginge es beim
     * Neuladen verloren), dann die Verknüpfungen schreiben und die Checkliste
     * frisch holen — der Server ergänzt Auftrag/Projekt/Termin je Verknüpfung
     * aus der Kette. Die Liste ERSETZT den bisherigen Satz.
     */
    const saveLinks = async (targets: ChecklistTarget[]) => {
        if (!submission || !targets.length) return;
        setLinking(true);
        try {
            if (dirty) await persist({ silent: true });
            await formsApi.updateSubmission(submission.id, {
                links: targets.map((target) => ({ customerId: target.customerId, tenderId: target.tenderId })),
            });
            const fresh = await formsApi.getSubmission(submission.id);
            adopt(fresh);
            onSaved?.(fresh);
            setLinkOpen(false);
            toast.success(t('forms.toasts.linked'));
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.save')));
        } finally {
            setLinking(false);
        }
    };

    const remove = async () => {
        if (!submission) return;
        setDeleting(true);
        try {
            await formsApi.deleteSubmission(submission.id);
            toast.success(t('forms.toasts.deleted'));
            setConfirmDelete(false);
            onDeleted?.();
        } catch (error) {
            toast.error(apiErrorMessage(error, t('forms.errors.delete')));
        } finally {
            setDeleting(false);
        }
    };

    if (loading) return <div className="ofi-chk ofi-chk-stage"><LoadingPanel rows={5} /></div>;
    if (!submission) return <div className="ofi-chk ofi-chk-stage"><div className="ofi-chk-empty">{t('forms.errors.notFound')}</div></div>;

    const customerLine = linkedCustomerLine(submission);
    const links: Array<{ key: string; label: string; value: string; muted?: boolean }> = [
        {
            key: 'customer',
            label: submission.customerCount > 1 ? t('forms.links.customerCount', { count: submission.customerCount }) : t('forms.links.customer'),
            value: customerLine || t('forms.fill.stepLinkEmpty'),
            muted: !customerLine,
        },
        {
            key: 'tender',
            label: t('forms.links.tender'),
            value: submission.tenderCount > 1
                ? t('forms.link.tenderCount', { count: submission.tenderCount })
                : (submission.tenderNumber || t('forms.link.noOffer')),
            muted: !submission.tenderNumber && submission.tenderCount <= 1,
        },
        submission.orderNumber ? { key: 'order', label: t('forms.links.order'), value: submission.orderNumber } : null,
        submission.projectNumber ? { key: 'project', label: t('forms.links.project'), value: submission.projectNumber } : null,
        submission.appointmentStart ? { key: 'appointment', label: t('forms.links.appointment'), value: fmtDate(submission.appointmentStart) } : null,
    ].filter((entry): entry is { key: string; label: string; value: string; muted?: boolean } => Boolean(entry));

    const statusText = saving
        ? t('forms.fill.saving')
        : dirty
            ? t('forms.fill.unsaved')
            : savedAt
                ? t('forms.fill.autoSaved', { time: savedAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) })
                : '';

    return (
        <div className={`ofi-chk ofi-chk-stage ${variant === 'montage' ? 'is-montage' : ''}`}>
            {/* Als SEITE: schmale Werkzeugleiste. Im Fenster trägt die Karte das. */}
            {chrome === 'inline' && (
                <div className="ofi-chk-toolbar">
                    <div className="min-w-0 flex-1">
                        <div className="ofi-chk-toolbar__title">{submission.templateName}</div>
                        <div className="ofi-chk-toolbar__meta">
                            {[customerLine, submission.tenderNumber].filter(Boolean).join(' · ')}
                            {statusText && <span className={`ofi-chk-status ${dirty ? 'is-dirty' : ''}`}>{statusText}</span>}
                        </div>
                    </div>
                    <div className="ofi-chk-toolbar__actions">
                        <button type="button" className="ofi-cal-btn" onClick={() => void openPdf()}>
                            <LuFileText size={15} />{t('forms.fill.pdf')}
                        </button>
                        <button type="button" className="ofi-cal-btn is-primary" disabled={!dirty || saving} onClick={() => void saveNow()}>
                            <LuSave size={15} />{t('forms.fill.saveDraft')}
                        </button>
                        {allowDelete && (
                            <button type="button" className="ofi-chk-iconbtn is-danger is-big" onClick={() => setConfirmDelete(true)} title={t('common.delete')} aria-label={t('common.delete')}>
                                <LuTrash2 size={17} />
                            </button>
                        )}
                    </div>
                </div>
            )}

            {showLinks && (
                <section className="ofi-chk-group">
                    <div className="ofi-ios-group__title">{t('forms.fill.linksTitle')}</div>
                    <div className="ofi-chk-card">
                        {links.map((link) => (
                            <div key={link.key} className="ofi-chk-kv">
                                <span className="ofi-chk-kv__label">{link.label}</span>
                                <span className={`ofi-chk-kv__value ${link.muted ? 'is-muted' : ''}`} title={link.value}>{link.value}</span>
                            </div>
                        ))}
                        {canEditLinks && (
                            <button type="button" className="ofi-ios-add" onClick={() => setLinkOpen(true)}>
                                <span className="ofi-ios-add__ring"><LuPencilLine size={12} /></span>
                                {t('forms.fill.editLink')}
                            </button>
                        )}
                    </div>
                    <div className="ofi-ios-group__footer">
                        {canEditLinks
                            ? `${submission.filledByName ? `${t('forms.fill.lastEditedBy')} ${submission.filledByName} · ` : ''}${fmtDateTime(submission.updatedAt)}`
                            : t('forms.fill.technicianHint')}
                    </div>
                </section>
            )}

            <FormRenderer fields={fields} values={values} onChange={setValue} />

            <section className="ofi-chk-group">
                <div className="ofi-ios-group__title">{t('forms.fill.notes')}</div>
                <div className="ofi-chk-card">
                    <textarea
                        value={notes}
                        onChange={(event) => setNotes(event.target.value)}
                        rows={4}
                        placeholder={t('forms.fill.notesPlaceholder')}
                        className="ofi-chk-input is-area is-block"
                    />
                </div>
            </section>

            {/* Verknüpfung nachträglich ändern: dasselbe Fenster wie beim
                Anlegen, mit allen bisherigen Kunden darin. Es liegt ÜBER dem
                Checklisten-Fenster (z 750 > 120). */}
            {linkOpen && (
                <ChecklistLinkDialog
                    open
                    submitLabel={t('forms.link.save')}
                    busy={linking}
                    initial={presetsFromLinks(submission.links || [])}
                    onSubmit={(targets) => void saveLinks(targets)}
                    onClose={() => setLinkOpen(false)}
                />
            )}

            <PdfPreviewSheet
                open={pdfOpen}
                title={submission.templateName}
                subtitle={customerLine || undefined}
                blob={pdfBlob}
                loading={pdfLoading}
                downloadLabel={t('forms.fill.downloadPdf')}
                onClose={() => setPdfOpen(false)}
                onDownload={() => void downloadPdf()}
            />

            <ConfirmDialog
                open={confirmDelete}
                title={t('forms.fill.deleteTitle')}
                message={submission.templateName}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void remove()}
                onCancel={() => setConfirmDelete(false)}
                zIndex={900}
            />
        </div>
    );
};
