import { useState } from 'react';
import { Bell, Check } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProductionTask, TaskSubtask } from '@/types/productionTasks';

import { FileDropZone } from './FileDropZone';
import type { PersonNames } from './PeopleCell';
import { FileChip } from './SubtaskFiles';
import { fileProblem, isImage, isPdf, type SubtaskActions } from './subtaskFileModel';
import { hasSubtaskDocument } from './taskModel';

/** Eine Zeile der Prüfliste: grüner Haken oder oranges Zeichen, Text, rechts der Wert. */
const CheckRow = ({ ok, title, detail, value }: { ok: boolean; title: string; detail: string; value: string }) => (
    <li className={`ofi-ptk-checkrow ${ok ? 'is-ok' : 'is-warn'}`}>
        {/* Gefüllter Kreis: grün mit weissem Haken bzw. orange mit weissem «!». */}
        <span className="ofi-ptk-checkrow__icon" aria-hidden>{ok ? <Check strokeWidth={3} /> : <span>!</span>}</span>
        <span className="ofi-ptk-checkrow__text">
            <b>{title}</b>
            <small>{detail}</small>
        </span>
        <span className="ofi-ptk-checkrow__value">{value}</span>
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

    // Die Unteraufgaben der Aufgabe: «markiert» = erledigt oder wartet auf Freigabe (28.09.2026).
    const siblings = task.subtasks.length;
    const marked = task.subtasks.filter((entry) => entry.status === 'DONE' || entry.status === 'PENDING').length;
    const pdfs = subtask.files.filter(isPdf);
    const images = subtask.files.filter(isImage);
    const documentOk = !subtask.requiresDocument || hasSubtaskDocument(subtask);
    const people = task.assigneeIds.map((id) => {
        const name = names.get(id)?.name ?? '—';
        return id === actions.meId ? `${name} ${t('productionTasks.complete.you')}` : name;
    });

    const upload = async (files: File[]) => {
        setUploading(true);
        for (const file of files) {
            const problem = fileProblem(file, true);
            if (problem) { toast.error(`${file.name}: ${problem}`); continue; }
            if (!(await actions.upload(task, subtask, file))) break;
        }
        setUploading(false);
    };

    const submit = async () => {
        if (!documentOk || saving) return;
        setSaving(true);
        const done = await actions.complete(task, subtask, note);
        setSaving(false);
        if (done) onClose();
    };

    return (
        <PopupDialog
            open
            onClose={onClose}
            title={t('productionTasks.complete.title')}
            subtitle={`${code} · ${subtask.name} — ${[actions.deviceName, stageName].filter(Boolean).join(' · ')}`}
            icon={<Check size={18} strokeWidth={2.6} />}
            width={620}
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
                    <PopupButton variant="primary" disabled={!documentOk || uploading} loading={saving} onClick={() => void submit()}>
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
                    {subtask.requiresDocument && (
                        <CheckRow
                            ok={documentOk}
                            title={t('productionTasks.complete.documentRow')}
                            detail={documentOk
                                ? t('productionTasks.complete.documentOk', { count: pdfs.length })
                                : images.length
                                    ? t('productionTasks.complete.documentMissingImages', { count: images.length })
                                    : t('productionTasks.complete.documentMissing')}
                            value={documentOk ? t('productionTasks.complete.attached') : t('productionTasks.complete.missing')}
                        />
                    )}
                    <CheckRow
                        ok={people.length > 0}
                        title={t('productionTasks.complete.peopleRow')}
                        detail={people.length ? people.join(' · ') : t('productionTasks.complete.nobody')}
                        value={t('productionTasks.complete.peopleCount', { count: people.length })}
                    />
                </ul>

                <section className="ofi-ptk-complete__block">
                    <h3 className="ofi-ptk-complete__label">{t('productionTasks.complete.documentLabel')}</h3>
                    <FileDropZone
                        title={t('productionTasks.complete.dropTitle')}
                        accept="application/pdf"
                        multiple
                        busy={uploading}
                        onFiles={(files) => void upload(files)}
                    />
                    {pdfs.length > 0 && (
                        <div className="ofi-ptk-files__list is-dialog">
                            {pdfs.map((file) => (
                                <FileChip key={file.id} file={file} onOpen={() => actions.openFile(task, subtask, file)} />
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
        </PopupDialog>
    );
};
