import { LuCheck, LuPencil, LuTrash2 } from 'react-icons/lu';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { t } from '@/i18n/translate';
import type { LabelColor, LabelDto } from '@/types/tasksModule';
import { LABEL_COLORS, labelColorName } from '../../utils/taskFormat';

/**
 * Das Menü eines Etiketts (Görevly `people.js`): «Yeniden adlandır», die sechs
 * Farben (aktuelle angehakt) und «Sil».
 */
export const LabelMenu = ({
    label,
    anchorEl,
    onClose,
    onRename,
    onColor,
    onDelete,
}: {
    label: LabelDto | null;
    anchorEl: HTMLElement | null;
    onClose: () => void;
    onRename: (label: LabelDto) => void;
    onColor: (label: LabelDto, color: LabelColor) => void;
    onDelete: (label: LabelDto) => void;
}) => (
    <AnchoredPicker
        anchorEl={label ? anchorEl : null}
        onClose={onClose}
        width={210}
        maxHeight={380}
        panelClassName="ofi-gv-picker ofi-gv-board-menu"
    >
        {label && (
            <div className="ofi-gv-picker__list" role="menu" aria-label={label.name}>
                <button
                    type="button"
                    role="menuitem"
                    className="ofi-option-row ofi-gv-picker__row"
                    onClick={() => { onClose(); onRename(label); }}
                >
                    <LuPencil size={14} aria-hidden />
                    <span className="ofi-gv-picker__name">{t('tasksModule.people.labels.rename')}</span>
                </button>
                <div className="ofi-gv-board-menu__sep" role="separator" />
                <div className="ofi-gv-board-menu__caption">{t('tasksModule.people.labels.color')}</div>
                {LABEL_COLORS.map((color) => {
                    const checked = label.color === color;
                    return (
                        <button
                            key={color}
                            type="button"
                            role="menuitemradio"
                            aria-checked={checked}
                            className={`ofi-option-row ofi-gv-picker__row ${checked ? 'is-active' : ''}`}
                            onClick={() => { onClose(); if (!checked) onColor(label, color); }}
                        >
                            <span className={`ofi-gv-people-dot is-${color}`} aria-hidden />
                            <span className="ofi-gv-picker__name">{labelColorName(color)}</span>
                            {checked && <LuCheck size={13} aria-hidden />}
                        </button>
                    );
                })}
                <div className="ofi-gv-board-menu__sep" role="separator" />
                <button
                    type="button"
                    role="menuitem"
                    className="ofi-option-row ofi-gv-picker__row ofi-gv-board-menu__danger"
                    onClick={() => { onClose(); onDelete(label); }}
                >
                    <LuTrash2 size={14} aria-hidden />
                    <span className="ofi-gv-picker__name">{t('common.delete')}</span>
                </button>
            </div>
        )}
    </AnchoredPicker>
);
