import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { File05, Image01, Paperclip, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { crmApi, type CrmTaskDocument } from '@/lib/api/crm';

/**
 * ANHÄNGE EINER AUFGABE — BILDER UND PDF (11.09.2026, Vorgabe Samet: «beim
 * Anlegen dieser kleinen Zeichen-Knöpfe und ebenso beim Ändern sollen wir
 * nicht nur PNG, sondern auch PDF anhängen können»).
 *
 * EIN Bauteil für beide Wege, darum kennt es zwei Zustände nebeneinander:
 *
 *   • `staged`  — Dateien, die noch NIRGENDS liegen. Beim Anlegen gibt es die
 *                 Aufgabe noch nicht, an die sie gehen könnten; sie warten
 *                 also im Fenster und reisen los, sobald sie eine Id hat.
 *   • `saved`   — Anhänge, die schon an der Aufgabe hängen. Sie zeigen Name
 *                 und Grösse; ihr INHALT kommt erst beim Öffnen über die
 *                 Leitung (`getTaskDocument`) — eine Liste, die zehn PDF
 *                 mitschleppt, wäre beim Aufklappen minutenlang unterwegs.
 *
 * Geöffnet wird in einem NEUEN Blatt, nicht im Fenster: ein PDF gehört in den
 * Betrachter des Browsers, und ein Bild in voller Grösse würde die Karte
 * sprengen.
 */

/** Was angenommen wird — dieselbe Liste wie auf dem Server (LocalFileStorage). */
export const TASK_FILE_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/heic,application/pdf';
/** Je Datei 12 MB, wie bei den Terminunterlagen: ein Plan als PDF liegt darunter. */
const FILE_LIMIT_BYTES = 12 * 1024 * 1024;

const isImage = (contentType: string) => contentType.startsWith('image/');

/** Grösse in der Schreibweise, die auf eine Zeile passt. */
const humanSize = (bytes: number): string => (bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`);

export const TaskFilesPane = ({ staged, onStaged, saved, onDeleted, readOnly }: {
    /** Dateien, die noch auf das Speichern der Aufgabe warten. */
    staged: File[];
    onStaged: (next: File[]) => void;
    /** Schon abgelegte Anhänge (nur beim Ändern). */
    saved?: CrmTaskDocument[];
    onDeleted?: (documentId: string) => void;
    readOnly?: boolean;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [busyId, setBusyId] = useState<string | null>(null);

    const take = (list: FileList | null) => {
        if (!list?.length) return;
        const accepted: File[] = [];
        for (const file of Array.from(list)) {
            if (file.size > FILE_LIMIT_BYTES) {
                toast.error(t('crm.tasks.fileTooBig', { name: file.name }));
                continue;
            }
            accepted.push(file);
        }
        if (accepted.length) onStaged([...staged, ...accepted]);
        if (inputRef.current) inputRef.current.value = '';
    };

    /* Der Inhalt kommt erst hier über die Leitung und wird als Blob geöffnet:
       eine Daten-URI von zehn Megabyte in `window.open` lassen manche Browser
       stillschweigend fallen. */
    const openSaved = async (document_: CrmTaskDocument) => {
        setBusyId(document_.id);
        try {
            const full = await crmApi.getTaskDocument(document_.id);
            const response = await fetch(full.data);
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener');
            // Der Betrachter hat die Daten dann schon; freigeben verhindert,
            // dass jeder geöffnete Anhang bis zum Neuladen im Speicher bleibt.
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
        } catch {
            toast.error(t('crm.tasks.fileOpenError'));
        } finally {
            setBusyId(null);
        }
    };

    const removeSaved = async (documentId: string) => {
        setBusyId(documentId);
        try {
            await crmApi.deleteTaskDocument(documentId);
            onDeleted?.(documentId);
        } catch {
            toast.error(t('crm.tasks.fileDeleteError'));
        } finally {
            setBusyId(null);
        }
    };

    const nothing = staged.length === 0 && (saved ?? []).length === 0;

    return (
        <div className="ofi-taskfiles">
            {nothing && <p className="ofi-taskfiles__empty">{t('crm.tasks.filesEmpty')}</p>}

            <ul className="ofi-taskfiles__list">
                {(saved ?? []).map((document_) => (
                    <li key={document_.id} className="ofi-taskfiles__row">
                        <span className="ofi-taskfiles__icon" aria-hidden>
                            {isImage(document_.contentType) ? <Image01 size={14} /> : <File05 size={14} />}
                        </span>
                        <button
                            type="button"
                            disabled={busyId === document_.id}
                            onClick={() => void openSaved(document_)}
                            title={document_.fileName}
                            className="ofi-taskfiles__name"
                        >
                            {document_.fileName}
                        </button>
                        <span className="ofi-taskfiles__size">{humanSize(document_.sizeBytes)}</span>
                        {!readOnly && onDeleted && (
                            <button
                                type="button"
                                disabled={busyId === document_.id}
                                onClick={() => void removeSaved(document_.id)}
                                aria-label={t('common.delete')}
                                title={t('common.delete')}
                                className="ofi-taskfiles__del"
                            >
                                <Trash01 size={13} />
                            </button>
                        )}
                    </li>
                ))}

                {staged.map((file, index) => (
                    <li key={`${file.name}:${index}`} className="ofi-taskfiles__row is-staged">
                        <span className="ofi-taskfiles__icon" aria-hidden>
                            {isImage(file.type) ? <Image01 size={14} /> : <File05 size={14} />}
                        </span>
                        <span className="ofi-taskfiles__name is-plain" title={file.name}>{file.name}</span>
                        <span className="ofi-taskfiles__size">{humanSize(file.size)}</span>
                        <button
                            type="button"
                            onClick={() => onStaged(staged.filter((_, position) => position !== index))}
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                            className="ofi-taskfiles__del"
                        >
                            <Trash01 size={13} />
                        </button>
                    </li>
                ))}
            </ul>

            {!readOnly && (
                <>
                    <button type="button" onClick={() => inputRef.current?.click()} className="ofi-taskfiles__add">
                        <UploadCloud02 size={14} />
                        {t('crm.tasks.fileAdd')}
                        <span className="ofi-taskfiles__hint"><Paperclip size={11} />{t('crm.tasks.fileKinds')}</span>
                    </button>
                    <input
                        ref={inputRef}
                        type="file"
                        multiple
                        accept={TASK_FILE_ACCEPT}
                        onChange={(event) => take(event.target.files)}
                        className="hidden"
                    />
                </>
            )}
        </div>
    );
};
