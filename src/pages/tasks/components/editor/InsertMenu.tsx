import { t } from '@/i18n/translate';
import type { BlockType } from '@/types/tasksModule';
import { PopoverMenu, type MenuEntry } from '../detail/PopoverMenu';
import { INSERT_ORDER, MANAGER_ONLY_BLOCKS } from './blockModel';
import { blockIcon, blockLabel } from './blockIcons';

/**
 * «Ekle» — und dasselbe Menü, wenn ein Block nur aus «/» besteht. Tabelle und
 * Trenner nur für die Leitung (der Server lehnt sie sonst mit
 * CONTENT_BLOCK_FORBIDDEN ab).
 */
export const InsertMenu = ({
    anchorEl,
    isManager,
    focusFirst,
    onClose,
    onPick,
}: {
    anchorEl: HTMLElement | null;
    isManager: boolean;
    focusFirst: boolean;
    onClose: () => void;
    onPick: (type: BlockType) => void;
}) => {
    const entries: MenuEntry[] = INSERT_ORDER
        .filter((type) => isManager || !MANAGER_ONLY_BLOCKS.includes(type))
        .flatMap((type): MenuEntry[] => {
            const item: MenuEntry = { key: type, label: blockLabel(type), icon: blockIcon(type), onSelect: () => onPick(type) };
            // Trenner vor den Medien, damit die Liste in Gruppen gelesen wird.
            return type === 'image' ? [{ kind: 'separator', key: 'sep-media' }, item] : [item];
        });

    return (
        <PopoverMenu
            anchorEl={anchorEl}
            onClose={onClose}
            entries={entries}
            width={230}
            focusFirst={focusFirst}
            label={t('tasksModule.editor.insert')}
        />
    );
};
