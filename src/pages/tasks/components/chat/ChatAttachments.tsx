import { LuDownload, LuFile, LuFileText } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { attachmentUrl } from '@/lib/api/tasksModule';
import type { TaskAttachment } from '@/types/tasksModule';
import { formatBytes } from '../../utils/taskFormat';

/**
 * Dateien einer Nachricht: Bilder als Vorschau in festem Rahmen (Klick öffnet
 * das Original in einem neuen Tab), alles andere als Dateichip mit Grösse und
 * Herunterladen.
 */
export const ChatAttachments = ({ attachments }: { attachments: TaskAttachment[] }) => {
    const images = attachments.filter((attachment) => attachment.isImage);
    const files = attachments.filter((attachment) => !attachment.isImage);
    return (
        <div className="ofi-gv-chat-atts">
            {images.length > 0 && (
                <div className="ofi-gv-chat-atts__images">
                    {images.map((image) => (
                        <a
                            key={image.id}
                            href={attachmentUrl(image)}
                            target="_blank"
                            rel="noreferrer"
                            className="ofi-gv-chat-atts__image"
                            title={image.fileName}
                            aria-label={t('tasksModule.chat.messages.openImage', { name: image.fileName })}
                        >
                            <img src={attachmentUrl(image)} alt={image.fileName} loading="lazy" decoding="async" />
                        </a>
                    ))}
                </div>
            )}
            {files.map((file) => (
                <a
                    key={file.id}
                    href={attachmentUrl(file, true)}
                    className="ofi-gv-chat-file"
                    title={file.fileName}
                    aria-label={t('tasksModule.chat.messages.download', { name: file.fileName })}
                >
                    <span className="ofi-gv-chat-file__icon" aria-hidden>
                        {file.isPdf ? <LuFileText size={16} /> : <LuFile size={16} />}
                    </span>
                    <span className="ofi-gv-chat-file__body">
                        <span className="ofi-gv-chat-file__name">{file.fileName}</span>
                        <span className="ofi-gv-chat-file__size">{formatBytes(file.sizeBytes)}</span>
                    </span>
                    <LuDownload size={14} className="ofi-gv-chat-file__download" aria-hidden />
                </a>
            ))}
        </div>
    );
};
