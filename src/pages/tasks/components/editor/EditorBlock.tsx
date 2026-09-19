import { memo } from 'react';
import { LuEllipsis } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { Checklist, ContentBlock, TaskAttachment } from '@/types/tasksModule';
import { ChecklistGroup } from '../checklist/ChecklistGroup';
import { TaskIconButton } from '../shared/TaskButton';
import { isTextBlock } from './blockModel';
import type { ImageMetaPatch } from './ImageBlock';
import { MediaBlock } from './MediaBlock';
import { TableBlock } from './TableBlock';
import type { TableMeta } from './tableModel';
import { TextBlock, type TextBlockHandlers } from './TextBlock';

export interface EditorBlockHandlers extends TextBlockHandlers {
    onMenu: (blockId: string, anchor: HTMLElement) => void;
    /** null = Tabelle entfernen. */
    onTableChange: (blockId: string, table: TableMeta | null) => void;
    /** Bild: Breite/Ausschnitt geändert. */
    onImageChange: (blockId: string, patch: ImageMetaPatch) => void;
}

const PLACEHOLDER_KEY: Record<string, string> = {
    p: 'tasksModule.editor.placeholder.p',
    h2: 'tasksModule.editor.placeholder.h2',
    h3: 'tasksModule.editor.placeholder.h3',
    bullet: 'tasksModule.editor.placeholder.list',
    number: 'tasksModule.editor.placeholder.list',
    quote: 'tasksModule.editor.placeholder.quote',
};

/**
 * Eine Zeile des Editors: links (beim Überfahren) das ⋯ des Blocks, rechts der
 * Block selbst — Text, Trenner, Tabelle, Checkliste, Bild oder Datei.
 */
export const EditorBlock = memo(({
    block,
    number,
    editable,
    rev,
    showPlaceholder,
    attachment,
    checklist,
    autoFocusChecklist,
    handlers,
}: {
    block: ContentBlock;
    number: number;
    editable: boolean;
    rev: string;
    showPlaceholder: boolean;
    attachment: TaskAttachment | undefined;
    checklist: Checklist | undefined;
    autoFocusChecklist: boolean;
    handlers: EditorBlockHandlers;
}) => {
    let body;
    if (isTextBlock(block.type)) {
        body = (
            <TextBlock
                block={block}
                number={number}
                editable={editable}
                rev={rev}
                placeholder={t(PLACEHOLDER_KEY[block.type] ?? PLACEHOLDER_KEY.p)}
                showPlaceholder={showPlaceholder}
                handlers={handlers}
            />
        );
    } else if (block.type === 'divider') {
        body = <hr className="ofi-gv-editor-divider" />;
    } else if (block.type === 'table') {
        body = <TableBlock block={block} editable={editable} rev={rev} onTableChange={handlers.onTableChange} />;
    } else if (block.type === 'checklist') {
        body = checklist
            ? <ChecklistGroup checklist={checklist} autoFocusNew={autoFocusChecklist} />
            : <div className="ofi-gv-editor-missing">{t('tasksModule.editor.checklistMissing')}</div>;
    } else {
        body = <MediaBlock block={block} attachment={attachment} editable={editable} onImageChange={handlers.onImageChange} />;
    }

    return (
        <div className={`ofi-gv-editor-block is-${block.type}`} data-block-id={block.id}>
            {editable && (
                <div className="ofi-gv-editor-block__gutter">
                    <TaskIconButton
                        small
                        label={t('tasksModule.editor.blockMenu')}
                        data-block-menu={block.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={(event) => handlers.onMenu(block.id, event.currentTarget)}
                    >
                        <LuEllipsis size={14} />
                    </TaskIconButton>
                </div>
            )}
            <div className="ofi-gv-editor-block__body">{body}</div>
        </div>
    );
});

EditorBlock.displayName = 'EditorBlock';
