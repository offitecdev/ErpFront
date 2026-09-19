import { memo } from 'react';

import { t } from '@/i18n/translate';
import type { ContentBlock, TaskAttachment } from '@/types/tasksModule';
import { AttachmentChip } from '../detail/AttachmentChip';
import { ImageBlock, type ImageMetaPatch } from './ImageBlock';

/**
 * Bild- oder Dateiblock (`meta.attId` → Datei der Aufgabe). Wurde die Datei
 * im Reiter «Dosyalar» entfernt, steht ein ruhiger Hinweis an ihrer Stelle;
 * die nächste Speicherung räumt den Block auf (der Server verwirft ihn).
 */
export const MediaBlock = memo(({
    block,
    attachment,
    editable,
    onImageChange,
}: {
    block: ContentBlock;
    attachment: TaskAttachment | undefined;
    editable: boolean;
    onImageChange: (blockId: string, patch: ImageMetaPatch) => void;
}) => {
    if (!attachment) {
        return (
            <div className="ofi-gv-editor-missing">
                {block.type === 'image' ? t('tasksModule.editor.imageMissing') : t('tasksModule.editor.fileMissing')}
            </div>
        );
    }
    // Nur das Bild — kein Link, keine Hand, kein Vergrössern beim Klick; ziehen/kırpma im ImageBlock.
    if (block.type === 'image') {
        return <ImageBlock block={block} attachment={attachment} editable={editable} onChange={onImageChange} />;
    }
    return (
        <div className="ofi-gv-editor-file">
            <AttachmentChip attachment={attachment} />
        </div>
    );
});

MediaBlock.displayName = 'MediaBlock';
