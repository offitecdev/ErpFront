import { useRef, useState, type ChangeEvent } from 'react';
import { CheckCircle2, ImageIcon, Loader2, Plus, X } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { canRemoveFile, canUploadTo, fileProblem, formatMoment, isPdf, type SubtaskActions } from './subtaskFileModel';
import { hasSubtaskDocument, isSubtaskCompleted, SUBTASK_FILE_ACCEPT } from './taskModel';

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

/** Ein Plättchen je Datei — ein Klick öffnet sie in einem neuen Tab. */
export const FileChip = ({
    file,
    context,
    onOpen,
    onRemove,
}: {
    file: TaskSubtaskFile;
    /** Z. B. «M-01.2 · Saha ölçüsü» in der Liste der Stufe. */
    context?: string;
    onOpen: () => void;
    onRemove?: () => void;
}) => {
    const meta = [formatMoment(file.uploadedAt), file.uploadedByName].filter(Boolean).join(' · ');
    return (
        <span className="ofi-ptk-filechip">
            <button
                type="button"
                className="ofi-ptk-filechip__open ofi-nosize"
                title={t('productionTasks.files.open', { name: file.name })}
                onClick={onOpen}
            >
                <FileGlyph type={file.type} />
                <span className="ofi-ptk-filechip__text">
                    <b>{file.name}</b>
                    <small>{context ? `${context} · ${meta}` : meta}</small>
                </span>
            </button>
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
    const completed = isSubtaskCompleted(subtask);
    const mayUpload = canUploadTo(actions, task, subtask);

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

    return (
        <div className="ofi-ptk-subdetail">
            <div className="ofi-ptk-files">
                <span className="ofi-ptk-files__label">{t('productionTasks.files.title')}</span>
                <div className="ofi-ptk-files__list">
                    {subtask.files.length === 0 && <span className="ofi-ptk-files__none">{t('productionTasks.files.none')}</span>}
                    {subtask.files.map((file) => (
                        <FileChip
                            key={file.id}
                            file={file}
                            onOpen={() => actions.openFile(task, subtask, file)}
                            onRemove={canRemoveFile(actions, task, subtask, file) ? () => void actions.removeFile(task, subtask, file) : undefined}
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
                <div className="ofi-ptk-subdetail__foot">
                    {subtask.requiresDocument && !hasSubtaskDocument(subtask) && (
                        <span className="ofi-ptk-subdetail__need">{t('productionTasks.files.needPdf')}</span>
                    )}
                    {actions.isAdmin && subtask.requiresApproval && (
                        <button type="button" className="ofi-ptk-completebtn ofi-nosize" onClick={onComplete}>
                            <CheckCircle2 aria-hidden />
                            {t('productionTasks.complete.button')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
