import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { toast } from 'sonner';
import { LuFileText, LuLink2 } from 'react-icons/lu';
import { Edit01, Save01, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { formsApi, type FormSubmissionDto } from '@/lib/api/forms';
import type { FormValues } from '@/lib/formFields';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { LoadingPanel } from '@/components/ui-shared/Loader';
import { FormRenderer } from './FormRenderer';
import { ChecklistLinkSheet } from './ChecklistLinkSheet';
import { apiErrorMessage, BTN_DANGER_OUTLINE, BTN_PRIMARY, BTN_SECONDARY, fmtDate, fmtDateTime, linkedCustomerLine, presetsFromLinks, TEXTAREA_CLASS } from '../ui';

/**
 * Eine Checkliste ansehen / ausfüllen. Lädt sich selbst über die Id (die Werte
 * samt Fotos/Zeichnungen kommen NUR hier, nie in Listen).
 *
 * KEIN Status (Vorgabe 16.08.2026): es gibt weder "Entwurf" noch
 * "Abgeschlossen" — eine Checkliste wird erfasst, verknüpft und ausgefüllt,
 * mehr nicht. Entsprechend ist sie immer bearbeitbar.
 *
 *  • Gespeichert wird auf Knopfdruck UND von selbst: nach kurzer Ruhe schreibt
 *    der Editor still (keine Meldung — nur die Zeile "Gespeichert HH:MM" im
 *    Kopf). Nur der Knopf meldet sich, weil ihn jemand gedrückt hat.
 *  • Der letzte Speicherstand gilt (Ersetzen wie beim Montage-Rapport).
 *  • PDF — Vorschau im Untenfenster + Download (formSubmissionPdf, dynamic
 *    import).
 *  • `saveHandleRef` — für Fenster, die beim Schliessen sichern (still).
 */
export interface FormFillHandle {
    dirty: boolean;
    saving: boolean;
    save: () => Promise<boolean>;
}

/** Ruhezeit, nach der von selbst gespeichert wird. */
const AUTOSAVE_DELAY_MS = 1500;

export const FormFillView = ({
    submissionId,
    onSaved,
    onDeleted,
    saveHandleRef,
    allowDelete = true,
    showLinks = true,
    variant = 'default',
}: {
    submissionId: string;
    onSaved?: (submission: FormSubmissionDto) => void;
    onDeleted?: () => void;
    saveHandleRef?: MutableRefObject<FormFillHandle | null>;
    allowDelete?: boolean;
    showLinks?: boolean;
    /** montage: grössere Knöpfe für den Tablet-Bildschirm. */
    variant?: 'default' | 'montage';
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
    const rootRef = useRef<HTMLDivElement>(null);

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

    const saveNow = async () => {
        const ok = await persist();
        if (ok) toast.success(t('forms.toasts.saved'));
    };

    // Für das Untenfenster: dirty/save nach aussen (Sichern beim Schliessen).
    useEffect(() => {
        if (!saveHandleRef) return;
        saveHandleRef.current = { dirty, saving, save: () => persist({ silent: true }) };
        return () => { saveHandleRef.current = null; };
    }, [saveHandleRef, dirty, saving, persist]);

    const openPdf = async () => {
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
    };

    const downloadPdf = async () => {
        if (!submission) return;
        try {
            const { exportFormSubmissionPdf } = await import('@/utils/pdf/formSubmissionPdf');
            await exportFormSubmissionPdf({ submission: { ...submission, values, notes }, output: 'download' });
        } catch {
            toast.error(t('forms.errors.pdf'));
        }
    };

    /**
     * Schritt 2 ändern: erst das Getippte sichern (sonst ginge es beim
     * Neuladen verloren), dann die Verknüpfungen schreiben und die Checkliste
     * frisch holen — der Server ergänzt Auftrag/Projekt/Termin je Verknüpfung
     * aus der Kette. Die Liste ERSETZT den bisherigen Satz: eine Checkliste
     * hängt an mehreren Kunden, hier kommen sie dazu oder fallen weg.
     */
    const saveLinks = async (targets: Array<{ customerId: string; tenderId: string }>) => {
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

    if (loading) return <LoadingPanel rows={5} />;
    if (!submission) return <div className="py-12 text-center text-[13px] text-slate-400">{t('forms.errors.notFound')}</div>;

    const big = variant === 'montage' ? ' !min-h-11 !px-5 !text-[13.5px]' : '';
    const customerLine = linkedCustomerLine(submission);
    const links: Array<{ key: string; label: string; value: string }> = [
        customerLine ? { key: 'customer', label: t('forms.links.customer'), value: customerLine } : null,
        submission.tenderNumber ? { key: 'tender', label: t('forms.links.tender'), value: submission.tenderNumber } : null,
        submission.orderNumber ? { key: 'order', label: t('forms.links.order'), value: submission.orderNumber } : null,
        submission.projectNumber ? { key: 'project', label: t('forms.links.project'), value: submission.projectNumber } : null,
        submission.appointmentStart ? { key: 'appointment', label: t('forms.links.appointment'), value: fmtDate(submission.appointmentStart) } : null,
    ].filter((entry): entry is { key: string; label: string; value: string } => Boolean(entry));

    return (
        <div ref={rootRef} className="space-y-4">
            {/* Die drei Schritte einer Checkliste — Schritt 2 ist von hier aus
                änderbar (Vorgabe 16.08.2026: alles bleibt nachträglich
                bearbeitbar). Die Vorlage bleibt stehen: ein Wechsel würde die
                bereits erfassten Werte entwerten. */}
            <ol className="flex flex-wrap items-stretch gap-2">
                <StepCard index={1} label={t('forms.fill.stepTemplate')} value={submission.templateName} />
                <StepCard
                    index={2}
                    label={t('forms.fill.stepLink')}
                    /* Mehrere Kunden: die Karte nennt sie alle, sonst wie bisher
                       "Kunde · Angebotsnummer". */
                    value={submission.customerCount > 1
                        ? t('forms.fill.stepLinkMany', { customers: submission.customerCount, count: submission.linkCount })
                        : [submission.customerName, submission.tenderNumber].filter(Boolean).join(' · ') || t('forms.fill.stepLinkEmpty')}
                    onEdit={showLinks ? () => setLinkOpen(true) : undefined}
                    editLabel={t('forms.fill.editLink')}
                />
                <StepCard index={3} label={t('forms.fill.stepFill')} value={t('forms.fill.stepFillHint', { count: fields.filter((field) => field.type !== 'SECTION').length })} />
            </ol>

            {/* Kopf: Vorlage, Speicherstand, Kette */}
            <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-4 py-3 dark:border-white/15 dark:bg-white/5">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-bold text-slate-900 dark:text-white">{submission.templateName}</span>
                        {/* Statt einer Meldung je Sicherung: eine ruhige Zeile. */}
                        <span className="text-[11px] font-semibold text-slate-400">
                            {saving
                                ? t('forms.fill.saving')
                                : dirty
                                    ? t('forms.fill.unsaved')
                                    : savedAt
                                        ? t('forms.fill.autoSaved', { time: savedAt.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' }) })
                                        : ''}
                        </span>
                    </div>
                    {showLinks && links.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-slate-600 dark:text-white/70">
                            <LuLink2 size={13} className="text-slate-400" />
                            {links.map((link) => (
                                <span key={link.key}><span className="text-slate-400">{link.label}:</span> <span className="font-semibold">{link.value}</span></span>
                            ))}
                        </div>
                    )}
                    <div className="mt-1 text-[11.5px] text-slate-400">
                        {submission.filledByName ? `${t('forms.fill.lastEditedBy')} ${submission.filledByName} · ` : ''}
                        {fmtDateTime(submission.updatedAt)}
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <button type="button" className={`${BTN_SECONDARY}${big}`} onClick={() => void openPdf()}>
                        <LuFileText size={14} />{t('forms.fill.pdf')}
                    </button>
                    <button type="button" className={`${BTN_PRIMARY}${big}`} disabled={!dirty || saving} onClick={() => void saveNow()}>
                        <Save01 size={14} />{t('forms.fill.saveDraft')}
                    </button>
                    {allowDelete && (
                        <button type="button" className={`${BTN_DANGER_OUTLINE}${big}`} onClick={() => setConfirmDelete(true)} title={t('common.delete')}>
                            <Trash01 size={14} />
                        </button>
                    )}
                </div>
            </div>

            <FormRenderer fields={fields} values={values} onChange={setValue} />

            <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 dark:border-white/15 dark:bg-white/5">
                <label className="mb-1.5 block text-[13px] font-semibold text-slate-800 dark:text-white">{t('forms.fill.notes')}</label>
                <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    rows={3}
                    placeholder={t('forms.fill.notesPlaceholder')}
                    className={TEXTAREA_CLASS}
                />
            </div>

            {/* Schritt 2 nachträglich ändern: dieselbe Tabelle wie beim Anlegen
                mit allen bisherigen Kunden darin. Sie liegt ÜBER diesem Fenster. */}
            {linkOpen && (
                <ChecklistLinkSheet
                    open
                    z={900}
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
                zIndex={200}
            />
        </div>
    );
};

/**
 * Eine Stufe im Kopf des Editors: Nummer, Bezeichnung, aktueller Wert — und
 * bei Schritt 2 ein Stift, der die Verknüpfung erneut öffnet.
 */
const StepCard = ({
    index,
    label,
    value,
    onEdit,
    editLabel,
}: {
    index: number;
    label: string;
    value: string;
    onEdit?: () => void;
    editLabel?: string;
}) => (
    <li className="flex min-w-[180px] flex-1 items-center gap-2.5 rounded-xl border border-slate-200 bg-white px-3 py-2 dark:border-white/15 dark:bg-white/5">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#eef2fb] text-[11.5px] font-bold text-[#1f2654] dark:bg-white/10 dark:text-amber-300">
            {index}
        </span>
        <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</span>
            <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-white">{value}</span>
        </span>
        {onEdit && (
            <button
                type="button"
                onClick={onEdit}
                title={editLabel}
                aria-label={editLabel}
                className="flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/15 dark:text-white/70 dark:hover:text-white"
            >
                <Edit01 size={13} />
            </button>
        )}
    </li>
);
