import { memo } from 'react';

import { t } from '@/i18n/translate';
import { attachmentUrl } from '@/lib/api/tasksModule';
import type { ContentBlock, TaskAttachment } from '@/types/tasksModule';
import { AttachmentChip } from '../detail/AttachmentChip';

/**
 * Bild- oder Dateiblock (`meta.attId` → Datei der Aufgabe). Wurde die Datei
 * im Reiter «Dosyalar» entfernt, steht ein ruhiger Hinweis an ihrer Stelle;
 * die nächste Speicherung räumt den Block auf (der Server verwirft ihn).
 */
export const MediaBlock = memo(({ block, attachment }: { block: ContentBlock; attachment: TaskAttachment | undefined }) => {
    if (!attachment) {
        return (
            <div className="ofi-gv-editor-missing">
                {block.type === 'image' ? t('tasksModule.editor.imageMissing') : t('tasksModule.editor.fileMissing')}
            </div>
        );
    }
    if (block.type === 'image') {
        return (
            <figure className="ofi-gv-editor-image">
                <a href={attachmentUrl(attachment)} target="_blank" rel="noopener noreferrer" title={attachment.fileName}>
                    <img src={attachmentUrl(attachment)} alt={attachment.fileName} loading="lazy" draggable={false} />
                </a>
            </figure>
        );
    }
    return (
        <div className="ofi-gv-editor-file">
            <AttachmentChip attachment={attachment} />
        </div>
    );
});

MediaBlock.displayName = 'MediaBlock';
