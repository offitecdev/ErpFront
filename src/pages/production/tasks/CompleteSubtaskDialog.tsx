import { useState, type ReactNode } from 'react';
import { Bell, Check, CheckCircle2, FileSearch } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask } from '@/types/productionTasks';

import { FileDropZone } from './FileDropZone';
import { FileReviewDialog } from './FileReviewDialog';
import type { PersonNames } from './PeopleCell';
import { FileChip } from './SubtaskFiles';
import { fileProblem, filesLocked, isImage, isPdf, latestFiles, type SubtaskActions } from './subtaskFileModel';
import { hasSubtaskDocument } from './taskModel';

/** Eine Zeile der Prüfliste: grüner Haken oder oranges Zeichen, Text, rechts der Wert (und ggf. ein Knopf). */
const CheckRow = ({ ok, title, detail, value, action }: { ok: boolean; title: string; detail: string; value: string; action?: ReactNode }) => (
    <li className={`ofi-ptk-checkrow ${ok ? 'is-ok' : 'is-warn'}`}>
        {/* Gefüllter Kreis: grün mit weissem Haken bzw. orange mit weissem «!». */}
        <span className="ofi-ptk-checkrow__icon" aria-hidden>{ok ? <Check strokeWidth={3} /> : <span>!</span>}</span>
        <span className="ofi-ptk-checkrow__text">
            <b>{title}</b>
            <small>{detail}</small>
        </span>
        <span className="ofi-ptk-checkrow__value">{value}</span>
        {action}
    </li>
);

/**
 * ── «COMPLETE THE TASK» (28.09.2026, Vorgabe Samet) ────────────────────────
 *
 * «Instead of Approve show Complete the task. When they click on it show
 * this modal» — oben die Prüfliste (wie viele Unteraufgaben der Aufgabe
 * markiert sind, also erledigt oder wartend; das Dokument als PDF, wenn die
 * Unteraufgabe «Document» trägt: «if document is required at least one pdf
 * should be uploaded»; wer verantwortlich ist), darunter die Fläche für das
 * PDF und eine kurze Notiz. «Tamamla» bleibt gesperrt, solange das PDF fehlt.
 * Danach ist die Unteraufgabe gesperrt: den Stand ändert niemand mehr,
 * Dateien nur noch die Verwaltung.
 */
export const CompleteSubtaskDialog = ({
    task,
    subtask,
    code,
    stageName,
    names,
    actions,
    onClose,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    /** Das Kürzel der Unteraufgabe, z. B. «M-01.2». */
    code: string;
    stageName: string;
    names: PersonNames;
    actions: SubtaskActions;
    onClose: () => void;
}) => {
    const [note, setNote] = useState('');
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);
    // «Approve the files» (28.09.2026): die Prüfansicht der Dateien darüber.
    const [reviewing, setReviewing] = useState(false);
    const hasFiles = subtask.files.length > 0;
    /* Freigegeben gilt für GENAU diese Dateien: kommt danach eine dazu (oder
       fällt eine weg), ist wieder zu prüfen. Erst dann schliesst «Complete» ab
       (28.09.2026: «after they approve the files they also should click on
       the complete button»). */
    const filesKey = subtask.files.map((file) => file.id).join(',');
    const [approvedKey, setApprovedKey] = useState<string | null>(null);
    const filesApproved = hasFiles && approvedKey === filesKey;
    // Die Freigabe-Checkliste (28.09.2026: «we will show them when admins approves the subtasks»).
    // Mit Dateien wird sie in der Prüfansicht abgehakt — hier nur ohne Dateien.
    const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set());
    const checklist = subtask.requiresApproval ? subtask.approvalChecklist : [];
    const checklistHere = !hasFiles && checklist.length > 0;
    const checklistOk = hasFiles ? filesApproved : checklist.every((item) => ticked.has(item.id));
    const toggleTick = (id: string) =>
        setTicked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    // Die Unteraufgaben der Aufgabe: «markiert» = erledigt oder wartet auf Freigabe (28.09.2026).
    const siblings = task.subtasks.length;
    const marked = task.subtasks.filter((entry) => entry.status === 'DONE' || entry.status === 'PENDING').length;
    // Je Datei die aktuelle Fassung (28.09.2026) — gezählt und gezeigt wird die, nicht jede Fassung.
    const current = latestFiles(subtask.files);
    const docCount = current.length;
    const pdfs = current.filter(isPdf);
    const images = current.filter(isImage);
    const documentOk = !subtask.requiresDocument || hasSubtaskDocument(subtask);
    const people = task.assigneeIds.map((id) => {
        const name = names.get(id)?.name ?? '—';
        return id === actions.meId ? `${name} ${t('productionTasks.complete.you')}` : name;
    });

    const upload = async (files: File[]) => {
        setUploading(true);
        for (const file of files) {
            const problem = fileProblem(file);
            if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
            if (!(await actions.upload(task, subtask, file))) break;
        }
        setUploading(false);
    };

    // «Approve the files» — in der Zeile «Dokument» der Prüfliste (28.09.2026).
    const reviewButton = hasFiles ? (
        <button
            type="button"
            className={`ofi-ptk-btn is-small ofi-nosize ofi-ptk-reviewbtn ${filesApproved ? 'is-approved' : ''}`}
            // Freigegeben lässt sich die Prüfung wieder öffnen — mit den Häkchen und der Notiz von vorher.
            title={filesApproved ? t('productionTasks.review.reopen') : undefined}
            onClick={() => setReviewing(true)}
        >
            {filesApproved ? <CheckCircle2 aria-hidden /> : <FileSearch aria-hidden />}
            {filesApproved
                ? t('productionTasks.review.approved')
                : t('productionTasks.review.open', { count: docCount })}
        </button>
    ) : null;

    const submit = async () => {
        if (!documentOk || !checklistOk || saving) return;
        setSaving(true);
        const done = await actions.complete(task, subtask, note, [...ticked]);
        setSaving(false);
        if (done) onClose();
    };

    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={onClose}
            title={t('productionTasks.complete.title')}
            subtitle={`${code} · ${subtask.name} — ${[actions.deviceName, stageName].filter(Boolean).join(' · ')}`}
            icon={<Check size={18} strokeWidth={2.6} />}
            width={620}
            // Solange die Prüfansicht offen ist, gehört Escape ihr.
            closeOnEscape={!reviewing}
            footer={(
                <PopupActions
                    start={(
                        <span className="ofi-ptk-complete__hint">
                            <Bell aria-hidden />
                            {t('productionTasks.complete.footer')}
                        </span>
                    )}
                >
                    <PopupButton onClick={onClose}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={!documentOk || !checklistOk || uploading} loading={saving} onClick={() => void submit()}>
                        {t('productionTasks.complete.confirm')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-complete">
                <ul className="ofi-ptk-checklist">
                    <CheckRow
                        ok={marked === siblings}
                        title={t('productionTasks.complete.subtasksRow')}
                        detail={marked === siblings
                            ? t('productionTasks.complete.subtasksAll', { count: siblings })
                            : t('productionTasks.complete.subtasksSome', { done: marked, total: siblings })}
                        value={`${marked} / ${siblings}`}
                    />
                    {/* Mit Pflichtdokument immer; sonst, sobald Dateien da sind — dann mit «Approve the files». */}
                    {(subtask.requiresDocument || hasFiles) && (
                        <CheckRow
                            // Mit Dateien erst grün, wenn sie freigegeben sind.
                            ok={documentOk && (!hasFiles || filesApproved)}
                            title={t('productionTasks.complete.documentRow')}
                            detail={!documentOk
                                ? images.length
                                    ? t('productionTasks.complete.documentMissingImages', { count: images.length })
                                    : t('productionTasks.complete.documentMissing')
                                : hasFiles && !filesApproved
                                    ? t('productionTasks.review.approveFirst', { count: docCount })
                                    : filesApproved
                                        ? t('productionTasks.review.approvedDetail', { count: docCount })
                                        : t('productionTasks.complete.documentOk', { count: pdfs.length })}
                            value={!documentOk
                                ? t('productionTasks.complete.missing')
                                : hasFiles && !filesApproved
                                    ? t('productionTasks.review.toReview')
                                    : filesApproved
                                        ? t('productionTasks.review.approvedValue')
                                        : t('productionTasks.complete.attached')}
                            action={reviewButton}
                        />
                    )}
                    <CheckRow
                        ok={people.length > 0}
                        title={t('productionTasks.complete.peopleRow')}
                        detail={people.length ? people.join(' · ') : t('productionTasks.complete.nobody')}
                        value={t('productionTasks.complete.peopleCount', { count: people.length })}
                    />
                </ul>

                {checklistHere && (
                    <section className="ofi-ptk-complete__block">
                        <h3 className="ofi-ptk-complete__label">{t('productionTasks.complete.checklistLabel')}</h3>
                        <ul className="ofi-ptk-checklist ofi-ptk-apticks">
                            {checklist.map((item) => (
                                <li key={item.id}>
                                    <label className="ofi-ptk-flag ofi-ptk-aptick">
                                        <input
                                            type="checkbox"
                                            className="ofi-ptk-check"
                                            checked={ticked.has(item.id)}
                                            onChange={() => toggleTick(item.id)}
                                        />
                                        <span>{item.text}</span>
                                    </label>
                                </li>
                            ))}
                        </ul>
                        {!checklistOk && (
                            <span className="ofi-ptk-field__hint">
                                {t('productionTasks.complete.checklistTodo', {
                                    done: checklist.filter((item) => ticked.has(item.id)).length,
                                    total: checklist.length,
                                })}
                            </span>
                        )}
                    </section>
                )}

                <section className="ofi-ptk-complete__block">
                    <h3 className="ofi-ptk-complete__label">{t('productionTasks.complete.documentLabel')}</h3>
                    {hasFiles && (
                        <span className="ofi-ptk-field__hint">
                            {filesApproved ? t('productionTasks.review.nowComplete') : t('productionTasks.review.checklistThere')}
                        </span>
                    )}
                    {/* Wartet sie auf die Freigabe, sind die Dateien zu (28.09.2026) — nichts hochzuladen. */}
                    {!filesLocked(subtask) && (
                        <FileDropZone
                            title={t('productionTasks.complete.dropTitle')}
                            accept="application/pdf"
                            multiple
                            busy={uploading}
                            onFiles={(files) => void upload(files)}
                        />
                    )}
                    {pdfs.length > 0 && (
                        <div className="ofi-ptk-files__list is-dialog">
                            {pdfs.map((file) => (
                                <FileChip
                                    key={file.id}
                                    file={file}
                                    showVersion={(file.version || 1) > 1}
                                    onOpen={() => actions.openFile(task, subtask, file)}
                                />
                            ))}
                        </div>
                    )}
                </section>

                <label className="ofi-ptk-complete__block">
                    <span className="ofi-ptk-complete__label">
                        {t('productionTasks.complete.note')} <em>{t('productionTasks.complete.optional')}</em>
                    </span>
                    <textarea
                        className="ofi-ptk-input ofi-ptk-complete__note"
                        rows={3}
                        maxLength={500}
                        value={note}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
            </div>
            {reviewing && (
                <FileReviewDialog
                    task={task}
                    subtask={subtask}
                    code={code}
                    actions={actions}
                    initialTicked={ticked}
                    initialNote={note}
                    onClose={() => setReviewing(false)}
                    onApproved={(reviewTicked, reviewNote) => {
                        setTicked(reviewTicked);
                        // Die Notiz der Prüfung wird die Notiz des Abschlusses (hier weiter änderbar).
                        setNote(reviewNote);
                        setApprovedKey(filesKey);
                        setReviewing(false);
                    }}
                    onRevisionSent={() => { setReviewing(false); onClose(); }}
                />
            )}
        </PopupDialog>
    );
};
