import { useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ChevronDown, Clock3, ImageIcon, Loader2, Plus, RotateCcw, Send, Upload, X } from 'lucide-react';
import { toast } from 'sonner';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { AiReportButton } from './AiAnalysis';
import { RevisionUploadDialog } from './RevisionUploadDialog';
import { canRemoveFile, canReviseFile, canUploadTo, fileGroups, fileProblem, formatMoment, isAnalysisActive, isPdf, type SubtaskActions } from './subtaskFileModel';
import { BOM_SUBTASK_ID, hasSubtaskDocument, isSubtaskCompleted, needsPdfFirst, submitsWithDialog, subtaskFileAccept } from './taskModel';

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

/** So lang darf ein Dateiname im Plättchen sein (01.10.2026: «max 15 characters») — der ganze steht im Tooltip. */
const FILE_NAME_MAX = 15;
const shortFileName = (name: string): string =>
    (name.length > FILE_NAME_MAX ? `${name.slice(0, FILE_NAME_MAX - 1).trimEnd()}…` : name);

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
    reserveHistory = false,
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
    /**
     * Den Platz des Fassungs-Knopfs auch ohne frühere Fassungen freihalten (01.10.2026: «use the
     * same width always like if the clock icon always in them») — die Knöpfe stehen in jeder
     * Zeile an derselben Stelle. Die früheren Fassungen selbst halten keinen frei.
     */
    reserveHistory?: boolean;
}) => {
    const meta = [formatMoment(file.uploadedAt), file.uploadedByName].filter(Boolean).join(' · ');
    // Die früheren Fassungen: auf und zu mit dem Knopf am Ende der Datei (01.10.2026).
    const [historyOpen, setHistoryOpen] = useState(false);
    return (
        /* Die früheren Fassungen stehen UNTER der Datei im Fluss (28.09.2026: «it goes under the
           table bottom border») — so wächst die Zeile und mit ihr die Tabelle. Seit dem 01.10.2026
           («the clock icon moves the pdf content … the previous version looks very different»):
           der Knopf sitzt am ENDE der Datei, und jede frühere Fassung ist dieselbe Datei-Karte,
           nur gedämpft, eingerückt an einer Leitlinie. */
        <span className={`ofi-ptk-filechipwrap ${historyOpen ? 'is-open' : ''} ${reserveHistory ? 'is-current' : ''}`}>
        <span className={`ofi-ptk-filechip ${older ? 'is-older' : ''}`}>
            <button
                type="button"
                className="ofi-ptk-filechip__open ofi-nosize"
                title={t('productionTasks.files.open', { name: file.name })}
                onClick={onOpen}
            >
                <FileGlyph type={file.type} />
                <span className="ofi-ptk-filechip__text">
                    <b>
                        <span className="ofi-ptk-filechip__name">{shortFileName(file.name)}</span>
                        {showVersion && <VersionTag version={file.version || 1} older={older} />}
                    </b>
                    <small>{context ? `${context} · ${meta}` : meta}</small>
                    {older && file.revisionNote && <q>{file.revisionNote}</q>}
                </span>
            </button>
            {history.length > 0 && (
                <button
                    type="button"
                    className={`ofi-ptk-filechip__history ofi-nosize ${historyOpen ? 'is-open' : ''}`}
                    aria-expanded={historyOpen}
                    aria-label={t('productionTasks.files.olderVersions', { count: history.length })}
                    title={t('productionTasks.files.olderVersions', { count: history.length })}
                    onClick={() => setHistoryOpen((open) => !open)}
                >
                    <Clock3 aria-hidden />
                    <span>{history.length}</span>
                    <ChevronDown className="ofi-ptk-filechip__chev" aria-hidden />
                </button>
            )}
            {history.length === 0 && reserveHistory && <span className="ofi-ptk-filechip__history is-slot" aria-hidden />}
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
                <span className="ofi-ptk-versionlist" role="group" aria-label={t('productionTasks.review.versions')}>
                    {history.map((entry) => (
                        <FileChip
                            key={entry.id}
                            file={entry}
                            showVersion
                            older
                            onOpen={() => onOpenVersion?.(entry)}
                            onRemove={onRemoveVersion && canRemoveVersion?.(entry) ? () => onRemoveVersion(entry) : undefined}
                        />
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
    onSubmit,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    actions: SubtaskActions;
    onComplete: () => void;
    /** «Görevi tamamla» mit Fotos, kurzer Notiz und Betrag (02.10.2026, «Fotoğraf yeterli» / «Ücret») — öffnet das Fenster. */
    onSubmit?: () => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    // Entfernen fragt immer nach (28.09.2026).
    const [removing, setRemoving] = useState<TaskSubtaskFile | null>(null);
    const completed = isSubtaskCompleted(subtask);
    const mayUpload = canUploadTo(actions, subtask);
    // Prüft die KI gerade ein PDF hier, wartet das nächste (02.10.2026) — der Server sichert es ebenso.
    const analysing = subtask.files.some((file) => isAnalysisActive(file.analysis));
    // «Complete the task» dürfen dieselben wie den Stand setzen: nur wer an der Unteraufgabe steht —
    // die Verwaltung nicht von Hand (29.09.2026); sie gibt frei («Approve the task»).
    // «BOM Creation» (02.10.2026): den Stand führt die BOM — hier weder abschliessen noch freigeben.
    const bomDriven = subtask.id === BOM_SUBTASK_ID;
    const mayMark = !completed && !bomDriven && Boolean(actions.meId && subtask.assigneeIds.includes(actions.meId));
    const [marking, setMarking] = useState(false);
    const withDialog = submitsWithDialog(subtask) && Boolean(onSubmit);
    const markComplete = async () => {
        // «Fotoğraf yeterli» / «Ücret girilsin» (02.10.2026): ein Fenster mit Fotos, Notiz und Betrag — sonst wie bisher.
        if (withDialog) { onSubmit?.(); return; }
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
            const problem = fileProblem(file, subtask.photoAllowed);
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
                {/* Eine Datei je Zeile (01.10.2026), daneben nur «KI-Bericht ansehen». */}
                <div className="ofi-ptk-files__list is-lines">
                    {subtask.files.length === 0 && <span className="ofi-ptk-files__none">{t('productionTasks.files.none')}</span>}
                    {/* Je Datei die aktuelle Fassung mit «Upload a revision»; die früheren Fassungen
                        hinter der Uhr links in der Datei — eine Auswahlliste (28.09.2026). */}
                    {fileGroups(subtask.files).map(({ latest, older }) => (
                        <div key={latest.groupId || latest.id} className="ofi-ptk-fileline">
                            <FileChip
                                file={latest}
                                reserveHistory
                                showVersion={older.length > 0 || (latest.version || 1) > 1}
                                onOpen={() => actions.openFile(task, subtask, latest)}
                                onRemove={canRemoveFile(actions, subtask, latest) ? () => setRemoving(latest) : undefined}
                                onRevise={canReviseFile(actions, subtask, { latest, older }) && !analysing ? () => pickRevision(latest) : undefined}
                                history={older}
                                onOpenVersion={(file) => actions.openFile(task, subtask, file)}
                                canRemoveVersion={(file) => canRemoveFile(actions, subtask, file)}
                                onRemoveVersion={(file) => setRemoving(file)}
                            />
                            <AiReportButton task={task} subtask={subtask} file={latest} actions={actions} />
                        </div>
                    ))}
                    {mayUpload && (
                        <>
                            <button
                                type="button"
                                className="ofi-ptk-files__add ofi-nosize"
                                disabled={uploading || analysing}
                                title={analysing ? t('productionTasks.ai.uploadWait') : undefined}
                                onClick={() => inputRef.current?.click()}
                            >
                                {uploading || analysing ? <Loader2 className="is-spinning" aria-hidden /> : <Plus aria-hidden />}
                                {uploading
                                    ? t('productionTasks.files.adding')
                                    : analysing ? t('productionTasks.ai.analysing') : t('productionTasks.files.add')}
                            </button>
                            <input
                                ref={inputRef}
                                type="file"
                                hidden
                                multiple
                                accept={subtaskFileAccept(subtask)}
                                onChange={(event) => void onPick(event)}
                            />
                        </>
                    )}
                    {revisionOf && (
                        <RevisionUploadDialog file={revisionOf} photoAllowed={subtask.photoAllowed} onUpload={uploadRevision} onClose={() => setRevisionOf(null)} />
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
                        <span className="ofi-ptk-subdetail__need">{t(subtask.photoAllowed ? 'productionTasks.files.needDocument' : 'productionTasks.files.needPdf')}</span>
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
                            // Mit dem Fenster kommen Fotos/PDF dort dazu — der Knopf ist dann nie gesperrt.
                            disabled={marking || (needsPdfFirst(subtask) && !withDialog)}
                            title={needsPdfFirst(subtask) && !withDialog
                                ? t('productionTasks.files.needPdf')
                                : subtask.requiresApproval ? t('productionTasks.subtask.completeHint') : undefined}
                            onClick={() => void markComplete()}
                        >
                            {marking ? <Loader2 className="is-spinning" aria-hidden /> : <Send aria-hidden />}
                            {t('productionTasks.subtask.completeTask')}
                        </button>
                    )}
                    {subtask.requiresApproval && subtask.status === 'PENDING' && (actions.canApprove ?? actions.isAdmin) && !bomDriven && (
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
