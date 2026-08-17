import type { PositionDto } from '@/types/tender';
import {
    FIXED_VAT,
    fmtVatRate,
    type TreeNode,
} from '../../tenderDetailUtils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import { t } from '@/i18n/translate';

type TreeRowPricingCellsProps = {
    node: TreeNode;
    canInlineEdit: boolean;
    inlineInputClass: string;
    inlineTextInputClass: string;
    qty: number;
    displayUnitPrice: number | null;
    hasOwnAmount: boolean;
    showRowTotal: boolean;
    displayTotal: number;
    updateInlineNumber: (field: 'quantity' | 'unitPrice' | 'discount', value: string) => void;
    onInlinePositionChange?: (positionId: string, patch: Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'shortDescription' | 'longDescription' | 'rowType' | 'imageUrl'>) => void;
};

export const TreeRowPricingCells = ({
    node,
    canInlineEdit,
    inlineInputClass,
    inlineTextInputClass,
    qty,
    displayUnitPrice,
    hasOwnAmount,
    showRowTotal,
    displayTotal,
    updateInlineNumber,
    onInlinePositionChange,
}: TreeRowPricingCellsProps) => {
    const fmtMoney = useMoneyFormat();
    return (
    <>
        {/* Qty (read-only) */}
        <td className="px-1.5 py-2 text-right align-top">
            {canInlineEdit ? (
                <input
                    aria-label={t('common.quantity')}
                    className={inlineInputClass}
                    inputMode="decimal"
                    min={0}
                    step="any"
                    type="number"
                    value={qty > 0 ? qty : ''}
                    onChange={(e) => updateInlineNumber('quantity', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="font-mono text-[11px] text-slate-700">
                    {qty > 0 ? qty : ''}
                </span>
            )}
        </td>

        {/* Unit (read-only) */}
        <td className="min-w-[64px] px-1.5 py-2 text-left align-top">
            {canInlineEdit && !node.isArticleMapping ? (
                <input
                    aria-label={t('tenders.unit')}
                    className={inlineTextInputClass}
                    value={node.unit ?? ''}
                    onChange={(e) => onInlinePositionChange?.(node.id, { unit: e.target.value || null })}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="text-[11px] text-slate-500">
                    {node.unit ? node.unit : ''}
                </span>
            )}
        </td>

        {/* Unit Price (read-only) */}
        <td className="min-w-[88px] px-1.5 py-2 text-right align-top">
            {canInlineEdit && !node.isArticleMapping ? (
                <input
                    aria-label={t('tenders.unit_price')}
                    className={inlineInputClass}
                    inputMode="decimal"
                    min={0}
                    step="any"
                    type="number"
                    value={displayUnitPrice != null ? displayUnitPrice : ''}
                    onChange={(e) => updateInlineNumber('unitPrice', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="font-mono text-[11px] text-slate-600">
                    {displayUnitPrice != null ? fmtMoney(displayUnitPrice) : ''}
                </span>
            )}
        </td>

        {/* Discount (read-only) */}
        <td className="min-w-[64px] px-1.5 py-2 text-right align-top">
            {canInlineEdit ? (
                <input
                    aria-label={t('common.discount')}
                    className={inlineInputClass}
                    inputMode="decimal"
                    max={100}
                    min={0}
                    step="any"
                    type="number"
                    value={node.discount ?? ''}
                    onChange={(e) => updateInlineNumber('discount', e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                />
            ) : (
                <span className="font-mono text-[11px] text-slate-600">
                    {node.discount && node.discount > 0 ? `${node.discount}%` : ''}
                </span>
            )}
        </td>

        {/* KDV - her urun/satir icin sabit %8.1, gri badge */}
        <td className="min-w-[72px] px-1.5 py-2 text-right align-top">
            {hasOwnAmount ? (
                <span
                    className="inline-flex items-center px-1 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 font-mono whitespace-nowrap"
                    title={t('tenders.fixed_kdv_orani')}
                >
                    %{fmtVatRate(node.taxRate != null && node.taxRate > 0 ? node.taxRate : FIXED_VAT)}
                </span>
            ) : (
                <span className="text-slate-300">â€”</span>
            )}
        </td>

        {/* Total (read-only) */}
        <td className="px-2 py-2 text-right font-mono text-[10.5px] align-top">
            {showRowTotal ? (
                <span className="font-semibold text-slate-800">
                    {fmtMoney(displayTotal)}
                </span>
            ) : <span className="text-slate-300">â€”</span>}
        </td>
    </>
    );
};
