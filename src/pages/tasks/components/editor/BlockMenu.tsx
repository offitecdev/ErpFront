import { LuChevronDown, LuChevronUp, LuTrash2 } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ContentBlock } from '@/types/tasksModule';
import { PopoverMenu, type MenuEntry } from '../detail/PopoverMenu';
import { CONVERTIBLE_TYPES, isTextBlock, type TextBlockType } from './blockModel';
import { blockIcon, blockLabel } from './blockIcons';

/**
 * ⋯ am linken Rand eines Blocks (Görevly `blockMenu`): Dönüştür (nur
 * Textblöcke), Yukarı/Aşağı taşı, Sil. Das Löschen einer Checkliste fragt
 * vorher nach — das entscheidet der Editor.
 */
export const BlockMenu = ({
    anchorEl,
    block,
    isFirst,
    isLast,
    onClose,
    onConvert,
    onMove,
    onDelete,
}: {
    anchorEl: HTMLElement | null;
    block: ContentBlock | null;
    isFirst: boolean;
    isLast: boolean;
    onClose: () => void;
    onConvert: (type: TextBlockType) => void;
    onMove: (direction: -1 | 1) => void;
    onDelete: () => void;
}) => {
    const entries: MenuEntry[] = [];
    if (block && isTextBlock(block.type)) {
        entries.push({ kind: 'caption', key: 'convert', label: t('tasksModule.editor.convert') });
        for (const type of CONVERTIBLE_TYPES) {
            entries.push({
                key: `convert-${type}`,
                label: blockLabel(type),
                icon: blockIcon(type),
                checked: block.type === type,
                onSelect: () => { if (block.type !== type) onConvert(type); },
            });
        }
        entries.push({ kind: 'separator', key: 'sep-move' });
    }
    entries.push(
        { key: 'up', label: t('tasksModule.editor.moveUp'), icon: <LuChevronUp size={15} />, disabled: isFirst, onSelect: () => onMove(-1) },
        { key: 'down', label: t('tasksModule.editor.moveDown'), icon: <LuChevronDown size={15} />, disabled: isLast, onSelect: () => onMove(1) },
        { kind: 'separator', key: 'sep-delete' },
        { key: 'delete', label: t('tasksModule.editor.deleteBlock'), icon: <LuTrash2 size={15} />, danger: true, onSelect: onDelete },
    );

    return (
        <PopoverMenu
            anchorEl={block ? anchorEl : null}
            onClose={onClose}
            entries={entries}
            width={220}
            label={t('tasksModule.editor.blockMenu')}
        />
    );
};
