import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, Clock3, ImageIcon, Loader2, Plus, RotateCcw, Send, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { RevisionUploadDialog } from './RevisionUploadDialog';
import { canRemoveFile, canUploadTo, fileGroups, fileProblem, formatMoment, isPdf, type SubtaskActions } from './subtaskFileModel';
import { hasSubtaskDocument, isSubtaskCompleted, needsPdfFirst, SUBTASK_FILE_ACCEPT } from './taskModel';

/**
 * ── DATEIEN EINER UNTERAUFGABE (28.09.2026, Vorgabe Samet) ──────────────────
 *
 * «When the admin clicks on a subtask, show its files» — unter der Zeile der
 * Unteraufgabe eine Leiste «Dateien»: je Datei ein Plättchen (PDF rot, Foto
 * als Bild, Name, «heute 08:50 · Enver»), dahinter «+ Datei hinzufügen».
 *
 *   hochladen   die Verwaltung und wer in der Aufgabe steht; abgeschlossen
 *               nur noch die Verwaltung
 *   entfernen   die Verwaltung; sonst die eigene Datei, solange offen
 *   abschliessen «Complete the task» — nur die Verwaltung, nur mit «Approval»
 */

/** Das Zeichen einer Datei: PDF als rotes Plättchen, ein Foto als Bild. */
export const FileGlyph = ({ type }: { type: string }) =>
    (isPdf({ type })
        ? <span className="ofi-ptk-fileglyph is-pdf" aria-hidden>PDF</span>
        : <span className="ofi-ptk-fileglyph is-image" aria-hidden><ImageIcon /></span>);

/** Die Fassung einer Datei als kleines Zeichen — «v2» (28.09.2026). */
export const VersionTag = ({ version, older = false }: { version: number; older?: boolean }) => (
    <span
        className={`ofi-ptk-versiontag ${older ? 'is-older' : ''}`}
        title={t('productionTasks.files.versionHint', { version })}
    >
        {t('productionTasks.files.versionShort', { version })}
    </span>
);

/** Ein Plättchen je Datei — ein Klick öffnet sie in einem neuen Tab. */
export const FileChip = ({
    file,
    context,
    showVersion = false,
    older = false,
    onOpen,
    onRemove,
    onRevise,
    history = [],
    onOpenVersion,
    canRemoveVersion,
    onRemoveVersion,
}: {
    file: TaskSubtaskFile;
    /** Z. B. «M-01.2 · Saha ölçüsü» in der Liste der Stufe. */
    context?: string;
    /** «v2» zeigen — sobald es von der Datei mehr als eine Fassung gibt. */
    showVersion?: boolean;
    /** Eine frühere Fassung: grau. */
    older?: boolean;
    onOpen: () => void;
    onRemove?: () => void;
    /** «Upload a revision» (28.09.2026): eine neue Fassung dieser Datei hochladen. */
    onRevise?: () => void;
    /** Die früheren Fassungen (neueste zuerst) — hinter der Uhr links in der Datei (28.09.2026). */
    history?: TaskSubtaskFile[];
    onOpenVersion?: (file: TaskSubtaskFile) => void;
    canRemoveVersion?: (file: TaskSubtaskFile) => boolean;
    onRemoveVersion?: (file: TaskSubtaskFile) => void;
}) => {
    const meta = [formatMoment(file.uploadedAt), file.uploadedByName].filter(Boolean).join(' · ');
    // Die Auswahlliste der früheren Fassungen: auf mit der Uhr, zu mit Klick daneben oder Escape.
    const [historyOpen, setHistoryOpen] = useState(false);
    const chipRef = useRef<HTMLSpanElement>(null);
    useEffect(() => {
        if (!historyOpen) return undefined;
        const onDown = (event: MouseEvent) => {
            if (!chipRef.current?.contains(event.target as Node)) setHistoryOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            setHistoryOpen(false);
        };
        document.addEventListener('mousedown', onDown);
        window.addEventListener('keydown', onKey, true);
        return () => {
            document.removeEventListener('mousedown', onDown);
            window.removeEventListener('keydown', onKey, true);
        };
    }, [historyOpen]);
    return (
        /* Die Liste der früheren Fassungen steht UNTER der Datei im Fluss (28.09.2026: «it goes
           under the table bottom border») — so wächst die Zeile und mit ihr die Tabelle, statt
           dass der Rand der Tabelle die Liste abschneidet. */
        <span ref={chipRef} className={`ofi-ptk-filechipwrap ${historyOpen ? 'is-open' : ''}`}>
        <span className={`ofi-ptk-filechip ${older ? 'is-older' : ''}`}>
            {history.length > 0 && (
                <button
                    type="button"
                    className={`ofi-ptk-filechip__history ofi-nosize ${historyOpen ? 'is-open' : ''}`}
                    aria-haspopup="listbox"
                    aria-expanded={historyOpen}
                    aria-label={t('productionTasks.files.olderVersions', { count: history.length })}
                    title={t('productionTasks.files.olderVersions', { count: history.length })}
                    onClick={() => setHistoryOpen((open) => !open)}
                >
                    <Clock3 aria-hidden />
                </button>
            )}
            <button
                type="button"
                className="ofi-ptk-filechip__open ofi-nosize"
                title={t('productionTasks.files.open', { name: file.name })}
                onClick={onOpen}
            >
                <FileGlyph type={file.type} />
                <span className="ofi-ptk-filechip__text">
                    <b>
                        {file.name}
                        {showVersion && <VersionTag version={file.version || 1} older={older} />}
                    </b>
                    <small>{context ? `${context} · ${meta}` : meta}</small>
                </span>
            </button>
            {onRevise && (
                <button
                    type="button"
                    className="ofi-ptk-filechip__revise ofi-nosize"
                    title={t('productionTasks.files.reviseHint', { name: file.name })}
                    onClick={onRevise}
                >
                    <Upload aria-hidden />
                    {t('productionTasks.files.revise')}
                </button>
            )}
            {onRemove && (
                <button
                    type="button"
                    className="ofi-ptk-filechip__remove ofi-nosize"
                    aria-label={t('productionTasks.files.remove', { name: file.name })}
                    title={t('productionTasks.files.remove', { name: file.name })}
                    onClick={onRemove}
                >
                    <X aria-hidden />
                </button>
            )}
        </span>
            {historyOpen && (
                <span className="ofi-ptk-versionmenu" role="listbox" aria-label={t('productionTasks.review.versions')}>
                    {history.map((entry) => (
                        <span key={entry.id} className="ofi-ptk-versionmenu__row" role="option" aria-selected={false}>
                            <button
                                type="button"
                                className="ofi-ptk-versionmenu__open ofi-nosize"
                                title={t('productionTasks.files.open', { name: entry.name })}
                                onClick={() => { setHistoryOpen(false); onOpenVersion?.(entry); }}
                            >
                                <b>
                                    <VersionTag version={entry.version || 1} older />
                                    <span>{entry.name}</span>
                                </b>
                                <small>{[formatMoment(entry.uploadedAt), entry.uploadedByName].filter(Boolean).join(' · ')}</small>
                                {entry.revisionNote && <q>{entry.revisionNote}</q>}
                            </button>
                            {onRemoveVersion && canRemoveVersion?.(entry) && (
                                <button
                                    type="button"
                                    className="ofi-ptk-filechip__remove ofi-nosize"
                                    aria-label={t('productionTasks.files.remove', { name: entry.name })}
                                    title={t('productionTasks.files.remove', { name: entry.name })}
                                    onClick={() => { setHistoryOpen(false); onRemoveVersion(entry); }}
                                >
                                    <X aria-hidden />
                                </button>
                            )}
                        </span>
                    ))}
                </span>
            )}
        </span>
    );
};

/**
 * Unter der Zeile einer Unteraufgabe: ihre Dateien, «+ Datei hinzufügen»,
 * der Abschluss (wer, wann, Notiz) oder «Complete the task».
 */
export const SubtaskDetail = ({
    task,
    subtask,
    actions,
    onComplete,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    actions: SubtaskActions;
    onComplete: () => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    // Entfernen fragt immer nach (28.09.2026).
    const [removing, setRemoving] = useState<TaskSubtaskFile | null>(null);
    const completed = isSubtaskCompleted(subtask);
    const mayUpload = canUploadTo(actions, task, subtask);
    // «Complete the task» dürfen dieselben wie den Stand setzen: die Verwaltung und wer in der Aufgabe steht.
    const mayMark = !completed && (actions.isAdmin || Boolean(actions.meId && task.assigneeIds.includes(actions.meId)));
    const [marking, setMarking] = useState(false);
    const markComplete = async () => {
        setMarking(true);
        // Mit «Approval» wartet sie dann auf die Freigabe, sonst ist sie erledigt.
        await actions.setStatus(task, subtask, subtask.requiresApproval ? 'PENDING' : 'DONE');
        setMarking(false);
    };

    const onPick = async (event: ChangeEvent<HTMLInputElement>) => {
        const picked = [...(event.target.files ?? [])];
        event.target.value = '';
        if (!picked.length) return;
        setUploading(true);
        for (const file of picked) {
            const problem = fileProblem(file);
            if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
            if (!(await actions.upload(task, subtask, file))) break;
        }
        setUploading(false);
    };

    /* «Upload a revision» (28.09.2026): ein Fenster fragt nach der Datei UND einer Notiz,
       was sich geändert hat; die Datei wird die nächste Fassung (Gruppe und Nummer vergibt
       der Server). */
    const [revisionOf, setRevisionOf] = useState<TaskSubtaskFile | null>(null);
    const pickRevision = (file: TaskSubtaskFile) => setRevisionOf(file);
    const uploadRevision = async (picked: File, note: string): Promise<boolean> => {
        const target = revisionOf;
        if (!target) return false;
        const done = await actions.upload(task, subtask, picked, target.id, note);
        if (done) toast.success(t('productionTasks.files.revised', { name: target.name, version: (target.version || 1) + 1 }));
        return done;
    };
    return (
        <div className="ofi-ptk-subdetail">
            <div className="ofi-ptk-files">
                <span className="ofi-ptk-files__label">{t('productionTasks.files.title')}</span>
                <div className="ofi-ptk-files__list">
                    {subtask.files.length === 0 && <span className="ofi-ptk-files__none">{t('productionTasks.files.none')}</span>}
                    {/* Je Datei die aktuelle Fassung mit «Upload a revision»; die früheren Fassungen
                        hinter der Uhr links in der Datei — eine Auswahlliste (28.09.2026). */}
                    {fileGroups(subtask.files).map(({ latest, older }) => (
                        <FileChip
                            key={latest.groupId || latest.id}
                            file={latest}
                            showVersion={older.length > 0 || (latest.version || 1) > 1}
                            onOpen={() => actions.openFile(task, subtask, latest)}
                            onRemove={canRemoveFile(actions, task, subtask, latest) ? () => setRemoving(latest) : undefined}
                            onRevise={mayUpload ? () => pickRevision(latest) : undefined}
                            history={older}
                            onOpenVersion={(file) => actions.openFile(task, subtask, file)}
                            canRemoveVersion={(file) => canRemoveFile(actions, task, subtask, file)}
                            onRemoveVersion={(file) => setRemoving(file)}
                        />
                    ))}
                    {mayUpload && (
                        <>
                            <button
                                type="button"
                                className="ofi-ptk-files__add ofi-nosize"
                                disabled={uploading}
                                onClick={() => inputRef.current?.click()}
                            >
                                {uploading ? <Loader2 className="is-spinning" aria-hidden /> : <Plus aria-hidden />}
                                {uploading ? t('productionTasks.files.adding') : t('productionTasks.files.add')}
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                hidden
                                multiple
                                accept={SUBTASK_FILE_ACCEPT}
                                onChange={(event) => void onPick(event)}
                            />
                        </>
                    )}
                    {revisionOf && (
                        <RevisionUploadDialog file={revisionOf} onUpload={uploadRevision} onClose={() => setRevisionOf(null)} />
                    )}
                </div>
            </div>
            {completed ? (
                <p className="ofi-ptk-subdetail__done">
                    <CheckCircle2 aria-hidden />
                    <span>
                        {t('productionTasks.complete.completedBy', { name: subtask.completedByName ?? '—', when: formatMoment(subtask.completedAt) })}
                        {subtask.completionNote && <q>{subtask.completionNote}</q>}
                    </span>
                </p>
            ) : (
                <>
                {/* Zurück zur Überarbeitung (28.09.2026) — wer, wann, was zu ändern ist. */}
                {subtask.revisionAt && (
                    <p className="ofi-ptk-subdetail__revision" role="status">
                        <RotateCcw aria-hidden />
                        <span>
                            {t('productionTasks.review.revisionBy', { name: subtask.revisionByName ?? '—', when: formatMoment(subtask.revisionAt) })}
                            {subtask.revisionNote && <q>{subtask.revisionNote}</q>}
                        </span>
                    </p>
                )}
                <div className="ofi-ptk-subdetail__foot">
                    {subtask.requiresDocument && !hasSubtaskDocument(subtask) && (
                        <span className="ofi-ptk-subdetail__need">{t('productionTasks.files.needPdf')}</span>
                    )}
                    {/* Der Weg (28.09.2026) — den Stand setzt niemand von Hand: offen — kein
                        Knopf (▶ vorne startet); in Arbeit oder zur Überarbeitung zurück —
                        «Complete the task» (mit «Approval»
                        wartet sie dann auf Freigabe, sonst erledigt); wartend — «Approve the
                        task» für die Verwaltung. */}
                    {(subtask.status === 'IN_PROGRESS' || subtask.status === 'REVISION') && mayMark && (
                        <button
                            type="button"
                            className="ofi-ptk-completebtn is-submit ofi-nosize"
                            disabled={marking || needsPdfFirst(subtask)}
                            title={needsPdfFirst(subtask)
                                ? t('productionTasks.files.needPdf')
                                : subtask.requiresApproval ? t('productionTasks.subtask.completeHint') : undefined}
                            onClick={() => void markComplete()}
                        >
                            {marking ? <Loader2 className="is-spinning" aria-hidden /> : <Send aria-hidden />}
                            {t('productionTasks.subtask.completeTask')}
                        </button>
                    )}
                    {subtask.requiresApproval && subtask.status === 'PENDING' && actions.isAdmin && (
                        <button type="button" className="ofi-ptk-completebtn ofi-nosize" onClick={onComplete}>
                            <CheckCircle2 aria-hidden />
                            {t('productionTasks.complete.button')}
                        </button>
                    )}
                </div>
                </>
            )}
            <ConfirmDialog
                closeOnBackdrop={false}
                open={removing !== null}
                tone="danger"
                title={t('productionTasks.files.removeTitle')}
                message={removing ? t('productionTasks.files.removeText', { name: removing.name, subtask: subtask.name }) : undefined}
                confirmLabel={t('productionTasks.actions.delete')}
                cancelLabel={t('productionTasks.actions.cancel')}
                onCancel={() => setRemoving(null)}
                onConfirm={() => {
                    if (removing) void actions.removeFile(task, subtask, removing);
                    setRemoving(null);
                }}
            />
        </div>
    );
};
