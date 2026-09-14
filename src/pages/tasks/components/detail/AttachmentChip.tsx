import type { ReactNode } from 'react';
import { LuDownload, LuFile, LuFileArchive, LuFileImage, LuFileSpreadsheet, LuFileText } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { attachmentUrl } from '@/lib/api/tasksModule';
import type { TaskAttachment } from '@/types/tasksModule';
import { formatBytes } from '../../utils/taskFormat';

/** Symbol nach Dateiart — neutral grau, keine bunten Dateikacheln. */
export const AttachmentIcon = ({ attachment, size = 16 }: { attachment: Pick<TaskAttachment, 'contentType' | 'fileName' | 'isImage' | 'isPdf'>; size?: number }) => {
    const type = `${attachment.contentType} ${attachment.fileName}`.toLowerCase();
    if (attachment.isImage) return <LuFileImage size={size} />;
    if (attachment.isPdf) return <LuFileText size={size} />;
    if (/sheet|excel|csv|\.xlsx?\b|numbers/.test(type)) return <LuFileSpreadsheet size={size} />;
    if (/zip|rar|7z|tar|gzip/.test(type)) return <LuFileArchive size={size} />;
    if (/word|document|text|rtf|\.docx?\b/.test(type)) return <LuFileText size={size} />;
    return <LuFile size={size} />;
};

/**
 * Datei als ruhige Zeile: Symbol, Name, Grösse — ein Klick öffnet sie im neuen
 * Tab, der Pfeil lädt sie herunter. `extra` hängt z. B. einen Entfernen-Knopf an.
 */
export const AttachmentChip = ({
    attachment,
    meta,
    extra,
}: {
    attachment: TaskAttachment;
    meta?: ReactNode;
    extra?: ReactNode;
}) => (
    <div className="ofi-gv-files-chip">
        <span className="ofi-gv-files-chip__icon"><AttachmentIcon attachment={attachment} /></span>
        <a
            className="ofi-gv-files-chip__main"
            href={attachmentUrl(attachment)}
            target="_blank"
            rel="noopener noreferrer"
            title={attachment.fileName}
        >
            <span className="ofi-gv-files-chip__name">{attachment.fileName}</span>
            <span className="ofi-gv-files-chip__meta">{meta ?? formatBytes(attachment.sizeBytes)}</span>
        </a>
        <a
            className="ofi-gv-iconbtn ofi-btn-plain is-small"
            href={attachmentUrl(attachment, true)}
            aria-label={t('tasksModule.files.download')}
            title={t('tasksModule.files.download')}
        >
            <LuDownload size={14} />
        </a>
        {extra}
    </div>
);
