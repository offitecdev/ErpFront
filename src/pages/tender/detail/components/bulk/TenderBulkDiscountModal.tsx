import { Button } from '@/components/ui-shared/Button';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';

import { parseInlineNumber } from '../../utils/tenderLine.utils';

type TenderBulkDiscountModalProps = {
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

export const TenderBulkDiscountModal = ({
    open,
    onClose,
    loading,
    eligibleCount,
    value,
    onValueChange,
    onConfirm,
}: TenderBulkDiscountModalProps) => (
    <Modal
        open={open}
        onClose={() => !loading && onClose()}
        title={t('tenders.bulk_discount')}
        description={t('tenders.discount_applies_to_selected_product_lines')}
        width="sm"
        closeOnBackdrop={!loading}
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={loading}>{t('tenders.vazgec')}</Button>
                <Button
                    variant="primary"
                    loading={loading}
                    disabled={eligibleCount === 0}
                    onClick={onConfirm}
                >{t('tenders.bulk_discount_yap')}</Button>
            </>
        }
    >
        <div className="space-y-3">
            {/* Frosted panel: the rate is the one thing this dialog is about, so
                it gets the whole card — oversized numeric field, unit baked in. */}
            <div className="ofi-glass-panel rounded-xl border border-white/70 bg-white/60 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.9),0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-slate-900/5 backdrop-blur-md backdrop-saturate-150">
                <label
                    htmlFor="bulk-discount-rate"
                    className="block text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"
                >
                    {t('tenders.discount')}
                </label>
                <div className="mt-1.5 flex items-baseline gap-1">
                    <input
                        id="bulk-discount-rate"
                        type="number"
                        step="0.1"
                        min={0}
                        max={100}
                        value={value}
                        onChange={(event) => onValueChange(parseInlineNumber(event.target.value, 100))}
                        className="w-full min-w-0 border-0 bg-transparent p-0 font-mono text-3xl font-semibold text-slate-900 tabular-nums outline-none [appearance:textfield] focus:ring-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <span className="text-xl font-semibold text-slate-400">%</span>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                    {PRESETS.map((preset) => (
                        <button
                            key={preset}
                            type="button"
                            onClick={() => onValueChange(preset)}
                            className={`rounded-full px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                                value === preset
                                    ? 'bg-[#1f2654] text-white'
                                    : 'border border-slate-200/80 bg-white/70 text-slate-600 hover:border-[#1f2654] hover:text-[#1f2654]'
                            }`}
                        >
                            {preset}%
                        </button>
                    ))}
                </div>
            </div>

            {/* Scope readout — quiet by default, amber when nothing is eligible
                (the confirm button is disabled in that case, so say why). */}
            <div
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 ${
                    eligibleCount === 0
                        ? 'border-amber-200/80 bg-amber-50/70'
                        : 'border-slate-200/70 bg-slate-50/70'
                }`}
            >
                <span className="text-[11.5px] font-medium text-slate-600">{t('tenders.product_to_apply')}</span>
                <span
                    className={`font-mono text-lg font-semibold tabular-nums ${
                        eligibleCount === 0 ? 'text-amber-700' : 'text-slate-900'
                    }`}
                >
                    {eligibleCount}
                </span>
            </div>
        </div>
    </Modal>
);
