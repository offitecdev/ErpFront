import { t } from '@/i18n/translate';

import { parseInlineNumber } from '../utils/tenderLine.utils';
import { PopupActions, PopupButton, PopupNote, TenderFloatCard } from './shell/TenderPopupShell';

type BulkDiscountPopupProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    eligibleCount: number;
    value: number;
    onValueChange: (value: number) => void;
    onConfirm: () => void;
};

// Common rates, offered as one-tap chips so the usual case needs no typing.
const PRESETS = [5, 10, 15, 20] as const;

/**
 * One rate for every selected product line. Floats beside the toolbar button
 * that opened it; the selection stays visible behind the card.
 */
export const BulkDiscountPopup = ({
    open,
    onClose,
    loading,
    eligibleCount,
    value,
    onValueChange,
    onConfirm,
}: BulkDiscountPopupProps) => (
    <TenderFloatCard
        open={open}
        onClose={() => { if (!loading) onClose(); }}
        title={t('tenders.bulk_discount')}
        subtitle={t('tenders.discount_applies_to_selected_product_lines')}
        width={380}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose} disabled={loading}>{t('tenders.vazgec')}</PopupButton>
                <PopupButton variant="primary" onClick={onConfirm} loading={loading} disabled={eligibleCount === 0}>
                    {t('tenders.bulk_discount_yap')}
                </PopupButton>
            </PopupActions>
        )}
    >
        <div className="ofi-tp-bigfield">
            <input
                id="bulk-discount-rate"
                type="number"
                step="0.1"
                min={0}
                max={100}
                autoFocus
                aria-label={t('tenders.discount')}
                value={value}
                onChange={(event) => onValueChange(parseInlineNumber(event.target.value, 100))}
            />
            <span className="ofi-tp-bigfield__unit">%</span>
        </div>
        <div className="flex flex-wrap gap-1.5 pt-3">
            {PRESETS.map((preset) => (
                <button
                    key={preset}
                    type="button"
                    onClick={() => onValueChange(preset)}
                    className={`ofi-tp-chip ${value === preset ? 'is-on' : ''}`}
                >
                    {preset}%
                </button>
            ))}
        </div>
        {/* Scope readout — quiet by default, amber when nothing is eligible
            (the confirm button is disabled in that case, so say why). */}
        <PopupNote tone={eligibleCount === 0 ? 'warning' : 'neutral'} className="mt-3 flex items-center justify-between gap-3">
            <span>{t('tenders.product_to_apply')}</span>
            <b className="tabular-nums">{eligibleCount}</b>
        </PopupNote>
    </TenderFloatCard>
);
