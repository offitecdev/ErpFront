import { useState } from 'react';
import { History, ImageIcon } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { TaskSubtaskFile } from '@/types/productionTasks';

import { FileDropZone } from './FileDropZone';
import { fileProblem, isPdf } from './subtaskFileModel';
import { SUBTASK_FILE_ACCEPT, SUBTASK_PHOTO_ACCEPT } from './taskModel';

/**
 * ── «UPLOAD A REVISION» (28.09.2026, Vorgabe Samet) ──────────────────────────
 *
 * «Each revision should have a revision note — when users or admins upload a
 * revision, ask for the revision note.» Die neue Fassung einer Datei: die Datei
 * wählen (oder ablegen) und in einer Notiz sagen, was sich geändert hat. Ohne
 * beides kein Hochladen — der Server verlangt die Notiz ebenso.
 */
export const RevisionUploadDialog = ({
    file,
    photoAllowed = false,
    onUpload,
    onClose,
}: {
    /** Die aktuelle Fassung, zu der eine neue kommt. */
    file: TaskSubtaskFile;
    /** «Fotoğraf yeterli» an der Unteraufgabe (02.10.2026): auch ein Foto als neue Fassung. */
    photoAllowed?: boolean;
    onUpload: (picked: File, note: string) => Promise<boolean>;
    onClose: () => void;
}) => {
    const [picked, setPicked] = useState<File | null>(null);
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const nextVersion = (file.version || 1) + 1;
    const ready = Boolean(picked) && Boolean(note.trim()) && !saving;

    const choose = (files: File[]) => {
        const first = files[0];
        if (!first) return;
        const problem = fileProblem(first, photoAllowed);
        if (problem) { toast.error(`${first.name}: ${problem}`); return; }
        setPicked(first);
    };

    const submit = async () => {
        if (!picked || !note.trim() || saving) return;
        setSaving(true);
        const done = await onUpload(picked, note.trim());
        setSaving(false);
        if (done) onClose();
    };

    return (
        <PopupDialog
            open
            closeOnBackdrop={false}
            onClose={() => { if (!saving) onClose(); }}
            title={t('productionTasks.files.reviseTitle')}
            subtitle={t('productionTasks.files.reviseSubtitle', { name: file.name, version: nextVersion })}
            icon={<History size={18} />}
            width={520}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose} disabled={saving}>{t('productionTasks.actions.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={saving} disabled={!ready} onClick={() => void submit()}>
                        {t('productionTasks.files.reviseConfirm', { version: nextVersion })}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-complete">
                <section className="ofi-ptk-complete__block">
                    <h3 className="ofi-ptk-complete__label">{t('productionTasks.files.reviseFile')}</h3>
                    <FileDropZone
                        title={t(photoAllowed ? 'productionTasks.complete.dropTitlePhoto' : 'productionTasks.complete.dropTitle')}
                        accept={photoAllowed ? SUBTASK_PHOTO_ACCEPT : SUBTASK_FILE_ACCEPT}
                        busy={saving}
                        onFiles={choose}
                    />
                    {picked && (
                        <span className="ofi-ptk-revision__picked">
                            {isPdf(picked)
                                ? <span className="ofi-ptk-fileglyph is-pdf" aria-hidden>PDF</span>
                                : <span className="ofi-ptk-fileglyph is-image" aria-hidden><ImageIcon /></span>}
                            <b>{picked.name}</b>
                        </span>
                    )}
                </section>
                <label className="ofi-ptk-complete__block">
                    <span className="ofi-ptk-complete__label">{t('productionTasks.files.reviseNote')}</span>
                    <textarea
                        className="ofi-ptk-input ofi-ptk-complete__note"
                        rows={3}
                        maxLength={500}
                        value={note}
                        placeholder={t('productionTasks.files.reviseNotePlaceholder')}
                        onChange={(event) => setNote(event.target.value)}
                    />
                    {!note.trim() && <span className="ofi-ptk-field__hint">{t('productionTasks.files.reviseNoteRequired')}</span>}
                </label>
            </div>
        </PopupDialog>
    );
};
