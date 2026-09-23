import { Check } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import '@/styles/macSelection.css';

export const MacSelectionCheck = ({ selected }: { selected: boolean }) => (
    <span className={`ofi-mac-selection__check${selected ? ' is-selected' : ''}`} aria-hidden="true">
        {selected && <Check size={12} />}
    </span>
);

export const MacSelectionFooter = ({ onSelectAll, onClose, allSelected }: {
    onSelectAll: () => void;
    onClose: () => void;
    allSelected: boolean;
}) => (
    <div className="ofi-mac-selection__footer">
        <button type="button" disabled={allSelected} onClick={onSelectAll}>{t('common.selectAll')}</button>
        <button type="button" onClick={onClose}>{t('common.done')}</button>
    </div>
);
