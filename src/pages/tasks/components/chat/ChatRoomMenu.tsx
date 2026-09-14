import { LuPencil, LuTrash2, LuUsers } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';

/** ⋯ des Raumkopfs: Teilnehmende für alle; Umbenennen und Löschen nur für die Leitung. */
export const ChatRoomMenu = ({
    anchorEl,
    onClose,
    canManage,
    onMembers,
    onRename,
    onDelete,
}: {
    anchorEl: HTMLElement | null;
    onClose: () => void;
    canManage: boolean;
    onMembers: () => void;
    onRename: () => void;
    onDelete: () => void;
}) => {
    const pick = (action: () => void) => () => {
        onClose();
        action();
    };
    return (
        <AnchoredPicker anchorEl={anchorEl} onClose={onClose} width={220} maxHeight={260} panelClassName="ofi-gv-picker ofi-gv-chat-menu">
            <div className="ofi-gv-picker__list" role="menu">
                <button type="button" role="menuitem" className="ofi-option-row ofi-gv-picker__row" onClick={pick(onMembers)}>
                    <LuUsers size={14} aria-hidden />
                    <span className="ofi-gv-picker__name">{t('tasksModule.chat.menu.members')}</span>
                </button>
                {canManage && (
                    <>
                        <div className="ofi-gv-chat-menu__sep" role="separator" />
                        <button type="button" role="menuitem" className="ofi-option-row ofi-gv-picker__row" onClick={pick(onRename)}>
                            <LuPencil size={14} aria-hidden />
                            <span className="ofi-gv-picker__name">{t('tasksModule.chat.menu.rename')}</span>
                        </button>
                        <button type="button" role="menuitem" className="ofi-option-row ofi-gv-picker__row ofi-gv-chat-menu__danger" onClick={pick(onDelete)}>
                            <LuTrash2 size={14} aria-hidden />
                            <span className="ofi-gv-picker__name">{t('tasksModule.chat.menu.delete')}</span>
                        </button>
                    </>
                )}
            </div>
        </AnchoredPicker>
    );
};
