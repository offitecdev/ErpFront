import { useRef, useState, type DragEvent } from 'react';
import { Loader2, Upload } from 'lucide-react';

import { t } from '@/i18n/translate';

/**
 * Eine Fläche zum Ablegen von Dateien (28.09.2026) — ziehen und loslassen
 * oder «Datei wählen». Gestrichelt, blau, sobald etwas darüber schwebt.
 */
export const FileDropZone = ({
    title,
    accept,
    multiple = false,
    busy = false,
    disabled = false,
    compact = false,
    onFiles,
}: {
    title: string;
    accept: string;
    multiple?: boolean;
    busy?: boolean;
    disabled?: boolean;
    /** Flach, für die Liste der Stufe. */
    compact?: boolean;
    onFiles: (files: File[]) => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    const blocked = busy || disabled;

    const onDragOver = (event: DragEvent<HTMLDivElement>) => {
        if (blocked || ![...event.dataTransfer.types].includes('Files')) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = 'copy';
        setOver(true);
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        setOver(false);
        if (blocked) return;
        const files = [...event.dataTransfer.files];
        if (files.length) onFiles(multiple ? files : files.slice(0, 1));
    };

    return (
        <div
            className={`ofi-ptk-drop ${over ? 'is-over' : ''} ${compact ? 'is-compact' : ''} ${blocked ? 'is-blocked' : ''}`}
            onDragOver={onDragOver}
            onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(false); }}
            onDrop={onDrop}
        >
            <span className="ofi-ptk-drop__icon" aria-hidden>
                {busy ? <Loader2 className="is-spinning" /> : <Upload />}
            </span>
            <span className="ofi-ptk-drop__text">
                <b>{busy ? t('productionTasks.files.adding') : title}</b>
                <small>
                    {t('productionTasks.drop.or')}{' '}
                    <button
                        type="button"
                        className="ofi-ptk-drop__pick ofi-nosize"
                        disabled={blocked}
                        onClick={() => inputRef.current?.click()}
                    >
                        {t('productionTasks.drop.choose')}
                    </button>
                    {' · '}
                    {t('productionTasks.drop.max')}
                </small>
            </span>
            <input
                ref={inputRef}
                type="file"
                hidden
                multiple={multiple}
                accept={accept}
                onChange={(event) => {
                    const files = [...(event.target.files ?? [])];
                    event.target.value = '';
                    if (files.length) onFiles(files);
                }}
            />
        </div>
    );
};
