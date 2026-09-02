import { useCallback, useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Check, File05, Link02, ListChecks, Paperclip, Trash01 } from '@/components/icons/antIconCompat';
import { PersonAvatar } from '@/components/ui-shared/PersonAvatar';
import { ReportImageUploader } from '@/components/ui-shared/ReportImageUploader';
import { inputClass } from '@/components/ui-shared/Field';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { FloatingCard } from '@/pages/calendar/components/FloatingCard';
import type { FloatAnchor } from '@/pages/calendar/calendarShared';
import { t } from '@/i18n/translate';
import { crmApi, type CrmTaskDetail, type CrmTaskDocument, type CrmTaskNote, type CrmTaskRow, type CrmTaskStep } from '@/lib/api/crm';
import { useAuthStore } from '@/store/authStore';
import { formatCrmDateTime, personName } from '../utils/crmFormat.utils';
import { taskOrigin } from './taskBoardModel';
import { TaskFilesPane } from './TaskFilesPane';
import { TaskStepsEditor, type TaskStepChange, type TaskStepDraft } from './TaskStepsEditor';
import { TaskTenderCombo, type TaskTenderPick } from './TaskTenderCombo';
import { isoToSpan, spanToIso, type TaskSpanFields } from './taskSchedule';

/**
 * Die ERLEDIGUNGSKARTE (19.08.2026) — ein Popup ÜBER dem Kalender, keine neue
 * Seite (Vorgabe): eine laufende Aufgabe wird hier abgehakt, mit Notizen und
 * BILDERN belegt und ihr Termin verschoben. Sie ist eine `FloatingCard` wie
 * alles im Kalendermodul: öffnet neben der angeklickten Karte, wird am
 * Kopfstreifen verschoben, hat keinen Hintergrundschleier — das Raster bleibt
 * daneben lesbar.
 *
 * ══ ERWEITERT AM 11.09.2026 (Vorgabe Samet) ══════════════════════════════
 *
 * «… und ebenso beim Ändern.» Was das Anlegen-Fenster kann, kann diese Karte
 * jetzt auch, und mit DENSELBEN Zeichen an derselben Stelle: Anleitung und
 * Anhänge stehen hinter der Zeichenreihe oben, ein Klick tauscht das Blatt.
 * Zwei verschiedene Bedienungen für dasselbe Ding wären der Grund, warum man
 * eine davon nie findet.
 *
 * Die Reiter «Angaben / Notizen» sind darin aufgegangen — sie waren schon
 * dieselbe Geste, nur in einem anderen Kleid.
 *
 * Der Termin ist zur SPANNE geworden: Beginn und Ende, beide verschiebbar.
 *
 * Der Kopf der Karte kommt fertig mit (die Liste hat ihn schon), Notizen,
 * Anleitung und Anhänge lädt das Popup in EINEM Zug nach — sie hängen nicht
 * an der Listenzeile.
 *
 * Ein Klick daneben schliesst NICHT: hier wird geschrieben, ein halb getippter
 * Text darf nicht durch einen Streifschuss verschwinden.
 */
interface CompletionProps {
    /** Die Zeile aus der Liste — Titel, Kunde, Verantwortliche stehen sofort da. */
    task: CrmTaskRow | null;
    anchor: FloatAnchor | null;
    open: boolean;
    onClose: () => void;
    /** Erledigt / wieder offen — dieselbe Hand wie der Kreis auf der Karte. */
    onSetDone: (task: CrmTaskRow, done: boolean) => void;
    /**
     * Spanne verstellt — Anfang UND Ende zusammen. Sie geht durch das Brett,
     * nicht durch die Karte: dort steht die Regel, dass eine verstrichene
     * Aufgabe wieder offen ist, sobald ihr Ende in der Zukunft liegt.
     */
    onSaveSpan: (task: CrmTaskRow, next: { startAt: string | null; dueDate: string | null; allDay: boolean }) => void;
    onDeleted?: (task: CrmTaskRow) => void;
    /** Notiz gespeichert/gelöscht — die Liste zieht ihren Zähler nach. */
    onChanged?: (taskId: string, noteCount: number) => void;
    /** Was sonst am Kopf der Zeile hängt (Spanne, Anleitung, Anhänge). */
    onPatched?: (taskId: string, patch: Partial<CrmTaskRow>) => void;
}

/** Die Blätter hinter der Zeichenreihe — `info` ist das Grundblatt. */
type Sheet = 'info' | 'steps' | 'files' | 'notes';

const draftFrom = (steps: Array<{ id: string; text: string; done: boolean }>): TaskStepDraft[] =>
    steps.map((step) => ({ key: step.id, id: step.id, text: step.text, done: step.done }));

/** Was auf der Listenzeile über die Anleitung steht — «3/5». */
const stepCounts = (steps: TaskStepDraft[]) => {
    const filled = steps.filter((step) => step.text.trim());
    return { stepCount: filled.length, stepDoneCount: filled.filter((step) => step.done).length };
};

/** Wie lange nach dem letzten Tastendruck gewartet wird, ehe die Liste reist. */
const STEP_SAVE_DELAY = 600;

/**
 * Die Hülle bleibt stehen, der INHALT wird je Aufgabe neu aufgebaut: der `key`
 * unten sorgt dafür, dass Notizfeld, Bilder und Löschabfrage bei jedem Öffnen
 * leer beginnen — ohne einen Effekt, der beim Öffnen fünf Zustände zurücksetzt.
 */
export const TaskCompletionCard = (props: CompletionProps) => {
    if (!props.task) return null;
    return <CompletionBody key={`${props.task.id}:${String(props.open)}`} {...props} task={props.task} />;
};

const CompletionBody = ({ task, anchor, open, onClose, onSetDone, onSaveSpan, onDeleted, onChanged, onPatched }: CompletionProps & { task: CrmTaskRow }) => {
    const user = useAuthStore((state) => state.user);
    const permissions = useAuthStore((state) => state.permissions);
    const canManage = permissions.includes('crm.activities.create');

    const [detail, setDetail] = useState<CrmTaskDetail | null>(null);
    const [loading, setLoading] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteImages, setNoteImages] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [lightbox, setLightbox] = useState<string | null>(null);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [sheet, setSheet] = useState<Sheet>('info');

    /* Anleitung und Anhänge liegen ÖRTLICH, damit das Häkchen sofort sitzt und
       die Karte nicht bei jedem Schritt auf den Server wartet. */
    const [steps, setSteps] = useState<TaskStepDraft[]>([]);
    /* Der Stand der Anleitung ALS MERKER daneben — die Sendungen unten lesen
       ihn, ohne auf das nächste Zeichnen zu warten (siehe `writeSteps`). */
    const stepsRef = useRef<TaskStepDraft[]>([]);
    /** Steht noch etwas aus, das nur die ganze Liste übertragen kann? */
    const stepsDirty = useRef(false);
    const stepTimer = useRef<number | null>(null);
    /** Laufende Nummer der Sendung: nur die JÜNGSTE Antwort darf etwas sagen. */
    const stepSeq = useRef(0);
    const [documents, setDocuments] = useState<CrmTaskDocument[]>([]);
    /* Die Spanne wird im Feld bearbeitet und ERST beim Verlassen des Feldes
       geschickt — ein Kalenderklick je Tastendruck wäre eine Anfrage zu viel. */
    const [span, setSpan] = useState(() => isoToSpan(task));

    /* ══ DIE OFFERTE AUCH HIER (13.09.2026, Vorgabe Samet) ═══════════════════
     *
     * «Sie muss sich im Aufgabenmodus hinzufügen lassen.» Bisher liess sich
     * eine Offerte NUR beim Anlegen anhängen: wer eine bestehende Aufgabe
     * öffnete, sah die Nummer bestenfalls als Text und hatte keinen Weg, eine
     * nachzutragen oder die falsche zu ersetzen — die Aufgabe musste gelöscht
     * und neu erfasst werden. Jetzt steht dasselbe Feld wie im
     * Anlegen-Fenster in den Angaben.
     *
     * Die Liste ist hier NICHT auf den Kunden der Aufgabe eingeschränkt: die
     * Karte kennt kein Kundenfeld, eine Einschränkung liesse sich also nicht
     * aufheben und die gesuchte Offerte wäre unerreichbar. */
    const [quote, setQuote] = useState<TaskTenderPick | null>(
        () => (task.tender ? { id: task.tender.id, tenderNumber: task.tender.tenderNumber } : null),
    );
    /** Von Hand verändert? Dann darf das Nachladen sie nicht überschreiben. */
    const quoteDirty = useRef(false);
    /* Derselbe Stand ALS MERKER: der Schreibweg unten liest ihn, ohne auf die
       nächste Zeichnung zu warten — sonst hätte er beim Rücksprung nach einem
       Fehlschlag den Stand VOR der vorletzten Wahl in der Hand. */
    const quoteRef = useRef<TaskTenderPick | null>(
        task.tender ? { id: task.tender.id, tenderNumber: task.tender.tenderNumber } : null,
    );

    const taskId = task.id;

    /* Notizen, Anleitung und Anhänge hängen nicht an der Listenzeile — sie
       werden hier in EINEM Zug nachgeladen. Mit Abbruchmerker: wer schnell von
       Karte zu Karte klickt, löst mehrere Runden aus, und nur die letzte darf
       schreiben. */
    useEffect(() => {
        let cancelled = false;
        (async () => {
            if (!open) return;
            setLoading(true);
            try {
                const loaded = await crmApi.getTask(taskId);
                if (cancelled) return;
                setDetail(loaded);
                /* Was hier schon abgehakt oder getippt wurde, GILT: der
                   Nachladeweg darf ein Häkchen, das während des Ladens gesetzt
                   wurde, nicht wieder wegnehmen. */
                if (!stepsDirty.current) {
                    const fresh = draftFrom(loaded.steps ?? []);
                    stepsRef.current = fresh;
                    setSteps(fresh);
                }
                setDocuments(loaded.documents ?? []);
                setSpan(isoToSpan(loaded));
                if (!quoteDirty.current) {
                    const fresh = loaded.tender ? { id: loaded.tender.id, tenderNumber: loaded.tender.tenderNumber } : null;
                    quoteRef.current = fresh;
                    setQuote(fresh);
                }
            } catch {
                if (!cancelled) setDetail(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [open, taskId]);

    const addNote = useCallback(async () => {
        if (!task || (!noteText.trim() && noteImages.length === 0)) return;
        setSaving(true);
        try {
            const note = await crmApi.addTaskNote(task.id, { text: noteText.trim(), images: noteImages });
            setDetail((current) => {
                const next = current ? { ...current, notes: [...current.notes, note] } : current;
                onChanged?.(task.id, next?.notes.length ?? 0);
                return next;
            });
            setNoteText('');
            setNoteImages([]);
        } catch {
            toast.error(t('crm.tasks.noteSaveError'));
        } finally {
            setSaving(false);
        }
    }, [task, noteText, noteImages, onChanged]);

    const removeNote = useCallback(async (note: CrmTaskNote) => {
        if (!task || !detail) return;
        const previous = detail.notes;
        setDetail((current) => (current ? { ...current, notes: current.notes.filter((row) => row.id !== note.id) } : current));
        onChanged?.(task.id, Math.max(0, previous.length - 1));
        try {
            await crmApi.deleteTaskNote(task.id, note.id);
        } catch {
            setDetail((current) => (current ? { ...current, notes: previous } : current));
            onChanged?.(task.id, previous.length);
            toast.error(t('crm.tasks.updateError'));
        }
    }, [task, detail, onChanged]);

    /* ── DIE ANLEITUNG: ERST DAS BLATT, DANN DER SERVER ────────────────────
       (12.09.2026, Vorgabe Samet: «beim Abhaken dieser Listen soll das Häkchen
       zuerst auf dem Bildschirm sitzen und die Daten danach gehen».)

       Vorher schickte JEDE Änderung die ganze Liste — auch jeder Buchstabe —
       und schrieb die Antwort über den örtlichen Stand. Zwei Klicks kurz
       hintereinander hoben sich damit gegenseitig auf: die Antwort auf den
       ersten kam nach dem zweiten an und trug den alten Stand zurück. Das
       Häkchen «kam nicht an».

       Jetzt gilt: der Zustand auf dem Blatt ist der Zustand. Der Server
       bekommt ihn nachgereicht und darf nur noch die KENNUNGEN zurückgeben —
       niemals Text oder Häkchen.
         · Häkchen  → sofort, und allein (PATCH auf die eine Zeile).
         · Zeile weg → sofort, ganze Liste.
         · Tippen   → gesammelt, 600 ms nach dem letzten Anschlag. */
    /** Blatt und Merker in einem Zug — und der Zähler der Listenzeile dazu. */
    const applySteps = useCallback((next: TaskStepDraft[]) => {
        stepsRef.current = next;
        setSteps(next);
        onPatched?.(task.id, stepCounts(next));
    }, [task.id, onPatched]);

    /** Die zurückgemeldeten Kennungen übernehmen — sonst NICHTS. */
    const adoptStepIds = useCallback((saved: CrmTaskStep[]) => {
        const filled = stepsRef.current.filter((step) => step.text.trim());
        // Hat sich die Liste inzwischen weiterbewegt, kommen die Kennungen mit
        // der nächsten Sendung; bis dahin läuft das Häkchen über die Liste.
        if (filled.length !== saved.length) return;
        let index = 0;
        const next = stepsRef.current.map((step) => (
            step.text.trim() ? { ...step, id: saved[index++].id } : step
        ));
        stepsRef.current = next;
        setSteps(next);
    }, []);

    /** Die ganze Anleitung losschicken — die Liste ist kurz, ein Zug genügt. */
    const flushSteps = useCallback(async () => {
        if (stepTimer.current !== null) { window.clearTimeout(stepTimer.current); stepTimer.current = null; }
        if (!stepsDirty.current) return;
        stepsDirty.current = false;
        const payload = stepsRef.current
            .map((step) => ({ text: step.text.trim(), done: step.done }))
            .filter((step) => step.text);
        const seq = ++stepSeq.current;
        try {
            const saved = await crmApi.saveTaskSteps(task.id, payload);
            if (seq !== stepSeq.current) return;
            adoptStepIds(saved);
        } catch {
            toast.error(t('crm.tasks.updateError'));
        }
    }, [task.id, adoptStepIds]);

    /** EIN Häkchen — der Griff des Alltags hat seinen eigenen, billigen Weg. */
    const saveStepDone = useCallback(async (step: TaskStepDraft) => {
        const seq = ++stepSeq.current;
        try {
            await crmApi.setTaskStepDone(task.id, step.id!, step.done);
        } catch {
            // Nur diese eine Zeile zurück — und nur, wenn sie seither niemand
            // wieder angefasst hat.
            if (seq !== stepSeq.current) return;
            applySteps(stepsRef.current.map((row) => (row.key === step.key ? { ...row, done: !step.done } : row)));
            toast.error(t('crm.tasks.updateError'));
        }
    }, [task.id, applySteps]);

    /** Was der Editor meldet: erst aufs Blatt, dann — je nachdem — auf die Reise. */
    const writeSteps = useCallback((next: TaskStepDraft[], change?: TaskStepChange) => {
        applySteps(next);
        const toggled = change?.toggledKey ? next.find((step) => step.key === change.toggledKey) : undefined;
        /* Ein Häkchen auf einer bereits gespeicherten Zeile geht allein raus —
           aber nur, wenn nicht ohnehin die ganze Liste ansteht: die ersetzt
           die Zeilen und damit ihre Kennungen. */
        if (toggled?.id && toggled.text.trim() && !stepsDirty.current) {
            void saveStepDone(toggled);
            return;
        }
        stepsDirty.current = true;
        if (change?.immediate) { void flushSteps(); return; }
        if (stepTimer.current !== null) window.clearTimeout(stepTimer.current);
        stepTimer.current = window.setTimeout(() => { void flushSteps(); }, STEP_SAVE_DELAY);
    }, [applySteps, saveStepDone, flushSteps]);

    /* Beim Schliessen (die Karte wird je Aufgabe neu gebaut) geht nach, was
       noch im Wartestand liegt — ein getippter Schritt darf nicht daran
       hängen bleiben, dass das Fenster schneller zu war als die Frist. */
    useEffect(() => () => { void flushSteps(); }, [flushSteps]);

    /** Neue Anhänge — sie reisen sofort los, die Aufgabe gibt es ja schon. */
    const uploadFiles = useCallback(async (files: File[]) => {
        if (!files.length) return;
        try {
            const saved = await crmApi.addTaskDocuments(task.id, files);
            setDocuments(saved);
            onPatched?.(task.id, { documentCount: saved.length });
        } catch {
            toast.error(t('crm.tasks.fileSaveError'));
        }
    }, [task.id, onPatched]);

    /**
     * Beginn oder Ende verstellt — beide Zeitpunkte gehen ZUSAMMEN raus, und
     * zwar durchs Brett: dort sitzt die Regel, dass eine verstrichene Aufgabe
     * wieder offen ist, sobald ihr Ende in der Zukunft liegt.
     */
    const writeSpan = useCallback((next: TaskSpanFields) => {
        setSpan(next);
        onSaveSpan(task, { ...spanToIso(next), allDay: next.allDay });
    }, [task, onSaveSpan]);

    /**
     * OFFERTE ANGEHÄNGT ODER GELÖST — sie geht sofort raus (es gibt keinen
     * «Speichern»-Knopf an dieser Karte), und die Listenzeile dahinter zieht
     * mit: die Nummer steht dort neben dem Kunden. Scheitert die Sendung,
     * springt das Feld auf den vorherigen Stand zurück und es gibt EINE
     * Meldung — dieselbe Hand wie beim Umterminieren.
     */
    const writeQuote = useCallback(async (next: TaskTenderPick | null) => {
        quoteDirty.current = true;
        const previous = quoteRef.current;
        const lite = next ? { id: next.id, tenderNumber: next.tenderNumber } : null;
        quoteRef.current = next;
        setQuote(next);
        try {
            await crmApi.updateTask(taskId, { tenderId: next?.id ?? null });
            setDetail((current) => (current ? { ...current, tenderId: lite?.id ?? null, tender: lite } : current));
            onPatched?.(taskId, { tenderId: lite?.id ?? null, tender: lite });
        } catch {
            quoteRef.current = previous;
            setQuote(previous);
            toast.error(t('crm.tasks.updateError'));
        }
    }, [taskId, onPatched]);

    const done = task.status === 'DONE';
    const origin = taskOrigin(task, user?.id);
    const assignees = detail?.assignees ?? task.assignees;
    const participant = origin !== 'plain';
    const canWrite = participant || canManage;
    // Solange die Notizen laden, zählt der Wert der Listenzeile.
    const noteCount = detail?.notes.length ?? Number(task.noteCount ?? 0);
    const linkedQuote = quote;

    /* Ein zweiter Klick auf dasselbe Zeichen führt zurück auf die Angaben. */
    const goTo = (next: Sheet) => setSheet((current) => (current === next ? 'info' : next));

    const marks: Array<{ key: Sheet; icon: React.ReactNode; label: string; count: number }> = [
        {
            key: 'steps',
            icon: <ListChecks size={16} />,
            label: t('crm.tasks.sheetSteps'),
            count: steps.filter((step) => step.text.trim()).length,
        },
        {
            key: 'files',
            icon: <Paperclip size={16} />,
            label: t('crm.tasks.sheetFiles'),
            count: documents.length,
        },
        {
            key: 'notes',
            icon: <Link02 size={16} />,
            label: t('crm.tasks.tabNotes'),
            count: noteCount,
        },
    ];

    return (
        <FloatingCard
            open={open}
            onClose={onClose}
            /* Zurück (Browser-Pfeil, Telefontaste) schliesst die KARTE und
               verlässt nicht das Brett darunter — Vorgabe 12.09.2026. */
            closeOnBack
            anchor={anchor}
            /* RECHTS neben der Karte, nie links davon (Vorgabe Samet,
               29.08.2026): eine Aufgabe aus der rechten Spalte des Bretts
               öffnete ihr Fenster sonst über der LINKEN Spalte. */
            prefer="right"
            width={470}
            className="ofi-newtask-card"
            title={task.title}
            subtitle={task.customer?.companyName || undefined}
            headerActions={canManage && onDeleted ? (
                <button
                    type="button"
                    aria-label={t('common.delete')}
                    title={t('common.delete')}
                    onClick={() => setConfirmDelete(true)}
                    className="ofi-float-card__iconbtn"
                >
                    <Trash01 size={16} />
                </button>
            ) : undefined}
        >
            <div className="ofi-taskcard-pop">
                {/* Der Abhak-Streifen: die eine Sache, für die dieses Popup da ist. */}
                <button
                    type="button"
                    disabled={!canWrite}
                    onClick={() => onSetDone(task, !done)}
                    className={`ofi-taskcard-pop__done ${done ? 'is-done' : ''}`}
                >
                    <span className={`ofi-taskrow__check ${done ? 'is-done' : ''}`}>{done && <Check size={12} />}</span>
                    {done ? t('crm.tasks.reopen') : t('crm.tasks.markDone')}
                </button>

                {/* ── Die Zeichenreihe — dieselbe wie im Anlegen-Fenster ───── */}
                <div className="ofi-newtask__marks" role="tablist" aria-label={t('crm.tasks.sheetsLabel')}>
                    {marks.map((mark) => (
                        <button
                            key={mark.key}
                            type="button"
                            role="tab"
                            aria-selected={sheet === mark.key}
                            onClick={() => goTo(mark.key)}
                            title={mark.label}
                            aria-label={mark.label}
                            className={`ofi-newtask__mark ${sheet === mark.key ? 'is-active' : ''}`}
                        >
                            {mark.icon}
                            {mark.count > 0 && <span className="ofi-newtask__markdot">{mark.count}</span>}
                        </button>
                    ))}
                    <span className="ofi-newtask__marklabel">
                        {sheet === 'info' ? t('crm.tasks.tabInfo') : marks.find((mark) => mark.key === sheet)?.label}
                    </span>
                </div>

                {/* Die Angaben stehen in EINEM weichen Kasten (Vorgabe): Spanne,
                    Zuweisung und Verantwortliche gehören zusammen und trennen
                    sich so sichtbar vom Rest. */}
                {sheet === 'info' && (
                    <dl className="ofi-taskcard-pop__rows is-boxed">
                        <div>
                            <dt>{t('crm.tasks.spanStart')}</dt>
                            <dd>
                                {canWrite ? (
                                    <span className="ofi-newtask__when">
                                        <QuoteDatePicker
                                            ariaLabel={t('crm.tasks.spanStart')}
                                            value={span.startDate}
                                            onChange={(value) => writeSpan({
                                                ...span,
                                                startDate: value,
                                                // Ein Ende vor dem Anfang ist ein Versehen,
                                                // kein Wunsch — es zieht mit.
                                                endDate: span.endDate && dayjs(span.endDate).isBefore(dayjs(value)) ? value : span.endDate,
                                            })}
                                            className="h-8 rounded-lg text-[12.5px]"
                                        />
                                        {!span.allDay && (
                                            <input
                                                type="time"
                                                value={span.startTime}
                                                onChange={(event) => setSpan({ ...span, startTime: event.target.value })}
                                                onBlur={() => writeSpan(span)}
                                                aria-label={t('crm.tasks.spanStart')}
                                                className="ofi-cal-input ofi-newtask__time"
                                            />
                                        )}
                                    </span>
                                ) : (
                                    <span>{span.startDate || '—'}</span>
                                )}
                            </dd>
                        </div>
                        <div>
                            <dt>{t('crm.tasks.spanEnd')}</dt>
                            <dd>
                                {canWrite ? (
                                    <span className="ofi-newtask__when">
                                        <QuoteDatePicker
                                            ariaLabel={t('crm.tasks.spanEnd')}
                                            value={span.endDate}
                                            min={span.startDate || undefined}
                                            onChange={(value) => writeSpan({ ...span, endDate: value })}
                                            className="h-8 rounded-lg text-[12.5px]"
                                        />
                                        {!span.allDay && (
                                            <input
                                                type="time"
                                                value={span.endTime}
                                                onChange={(event) => setSpan({ ...span, endTime: event.target.value })}
                                                onBlur={() => writeSpan(span)}
                                                aria-label={t('crm.tasks.spanEnd')}
                                                className="ofi-cal-input ofi-newtask__time"
                                            />
                                        )}
                                    </span>
                                ) : (
                                    <span>{span.endDate || '—'}</span>
                                )}
                            </dd>
                        </div>
                        {canWrite && (
                            <div>
                                <dt>{t('crm.tasks.allDay')}</dt>
                                <dd>
                                    <span className="ofi-newtask__allday">
                                        <input
                                            type="checkbox"
                                            checked={span.allDay}
                                            onChange={(event) => writeSpan({ ...span, allDay: event.target.checked })}
                                        />
                                    </span>
                                </dd>
                            </div>
                        )}
                        {(canManage || linkedQuote) && (
                            <div className={canManage ? 'is-tall' : undefined}>
                                <dt>{t('crm.tasks.colQuote')}</dt>
                                <dd>
                                    {canManage ? (
                                        <TaskTenderCombo
                                            value={quote}
                                            onChange={(next) => void writeQuote(next)}
                                        />
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5">
                                            <File05 size={13} />
                                            {linkedQuote?.tenderNumber}
                                        </span>
                                    )}
                                </dd>
                            </div>
                        )}
                        <div>
                            <dt>{t('crm.tasks.assignedByLabel')}</dt>
                            <dd>
                                <span className="inline-flex items-center gap-1.5">
                                    <PersonAvatar id={task.createdBy?.id} name={personName(task.createdBy)} size={18} ring={false} tone="subtle" />
                                    {personName(task.createdBy) || '—'}
                                    {origin === 'self' && <span className="ofi-taskcard-pop__tag">{t('crm.tasks.assignedSelf')}</span>}
                                </span>
                            </dd>
                        </div>
                        <div>
                            <dt>{t('crm.tasks.colAssignee')}</dt>
                            <dd>
                                {assignees.length === 0 ? <span>—</span> : (
                                    /* Jede Verantwortliche in einem eigenen weichen
                                       Feld (Vorgabe 19.08.2026) — als lose Namen
                                       nebeneinander sah die Karte unruhig aus. */
                                    <span className="ofi-taskcard-pop__chips">
                                        {assignees.map((person) => (
                                            <span key={person.id}>
                                                <PersonAvatar id={person.id} name={personName(person)} size={18} ring={false} tone="subtle" />
                                                {personName(person)}
                                            </span>
                                        ))}
                                    </span>
                                )}
                            </dd>
                        </div>
                        {task.completedAt && (
                            <div>
                                <dt>{t('crm.tasks.completedAt')}</dt>
                                <dd><span>{formatCrmDateTime(task.completedAt)}</span></dd>
                            </div>
                        )}
                    </dl>
                )}

                {/* ── Anleitung: dieselbe Liste wie beim Anlegen ─────────────
                    `__pane` rückt sie auf die Feldkante der Karte ein — die
                    Nummern der Schritte sitzen dann in der Beschriftungsspalte
                    (sie holen sich den Platz mit einem negativen Rand zurück,
                    siehe index.css). Ohne diesen Einzug stünden sie neben der
                    Karte. */}
                {sheet === 'steps' && (
                    <div className="ofi-newtask__pane">
                        <TaskStepsEditor steps={steps} onChange={writeSteps} disabled={!canWrite} />
                    </div>
                )}

                {/* ── Anhänge: Bild UND PDF, auch NACHTRÄGLICH ─────────────── */}
                {sheet === 'files' && (
                    <div className="ofi-newtask__pane">
                    <TaskFilesPane
                        staged={[]}
                        onStaged={(next) => void uploadFiles(next)}
                        saved={documents}
                        onDeleted={(documentId) => {
                            setDocuments((current) => {
                                const next = current.filter((row) => row.id !== documentId);
                                onPatched?.(task.id, { documentCount: next.length });
                                return next;
                            });
                        }}
                        readOnly={!canWrite}
                    />
                    </div>
                )}

                {/* Verlauf: Notizen mit Bildern — der Beleg, DASS erledigt wurde. */}
                {sheet === 'notes' && (
                    <section className="ofi-taskcard-pop__notes">
                        {loading && !detail && <div className="ofi-shimmer h-12 rounded-lg bg-slate-100 dark:bg-white/5" />}
                        {detail && detail.notes.length === 0 && (
                            <p className="ofi-taskcard-pop__empty">{t('crm.tasks.notesEmpty')}</p>
                        )}
                        {detail?.notes.map((note) => (
                            <article key={note.id} className="ofi-taskcard-pop__note">
                                <PersonAvatar id={note.author?.id} name={note.author ? personName(note.author) : ''} size={24} ring={false} tone="subtle" />
                                <div className="min-w-0 flex-1">
                                    <div className="ofi-taskcard-pop__notehead">
                                        <span>{note.author ? personName(note.author) : '—'}</span>
                                        <span>{formatCrmDateTime(note.createdAt)}</span>
                                        {(note.author?.id === user?.id || canManage) && (
                                            <button
                                                type="button"
                                                onClick={() => void removeNote(note)}
                                                aria-label={t('common.delete')}
                                                title={t('common.delete')}
                                            >
                                                <Trash01 size={12} />
                                            </button>
                                        )}
                                    </div>
                                    {note.text && <p>{note.text}</p>}
                                    {note.images.length > 0 && (
                                        <div className="ofi-taskcard-pop__thumbs">
                                            {note.images.map((src, index) => (
                                                <button key={index} type="button" onClick={() => setLightbox(src)}>
                                                    <img src={src} alt="" />
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </article>
                        ))}

                        {canWrite && (
                            <div className="ofi-taskcard-pop__compose">
                                <textarea
                                    value={noteText}
                                    onChange={(event) => setNoteText(event.target.value)}
                                    rows={2}
                                    placeholder={t('crm.tasks.notePlaceholder')}
                                    className={`${inputClass} resize-y px-2.5 py-1.5 text-[12.5px]`}
                                />
                                <ReportImageUploader value={noteImages} onChange={setNoteImages} max={6} />
                                <div className="flex justify-end">
                                    <button
                                        type="button"
                                        disabled={saving || (!noteText.trim() && noteImages.length === 0)}
                                        onClick={() => void addNote()}
                                        className="ofi-btn-brand inline-flex h-8 items-center rounded-md bg-[#272f67] px-3 text-[12px] font-semibold text-white hover:bg-[#1f2654] disabled:opacity-50"
                                    >
                                        {saving ? t('common.saving') : t('crm.tasks.addNote')}
                                    </button>
                                </div>
                            </div>
                        )}
                    </section>
                )}

                {confirmDelete && (
                    <div className="ofi-taskcard-pop__confirm">
                        <span>{t('crm.tasks.deleteTitle')}</span>
                        <button type="button" onClick={() => setConfirmDelete(false)}>{t('common.cancel')}</button>
                        <button type="button" className="is-danger" onClick={() => { onDeleted?.(task); onClose(); }}>
                            {t('common.delete')}
                        </button>
                    </div>
                )}
            </div>

            {/* Bild gross — im Portal über der Karte, ohne sie zu verlassen. */}
            {lightbox && (
                <div className="ofi-taskcard-pop__lightbox" role="presentation" onClick={() => setLightbox(null)}>
                    <img src={lightbox} alt="" />
                </div>
            )}
        </FloatingCard>
    );
};
