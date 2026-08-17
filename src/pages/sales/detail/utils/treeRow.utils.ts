import {
    lineTotalWithTax,
    type TreeNode,
} from '../tenderDetailUtils';

export const getTreeRowFlags = (node: TreeNode, level: number) => {
    const rowType = (node.rowType || (node.isArticleMapping ? 'PRODUCT' : 'SECTION')).toUpperCase();
    const isSectionRow = !node.isArticleMapping && rowType === 'SECTION';
    const isRootSection = isSectionRow && level === 0;
    const isInlineContentRow = !node.isArticleMapping && (rowType === 'DESCRIPTION' || rowType === 'CUSTOM');
    const isTitleRow = !node.isArticleMapping && rowType === 'TITLE';
    const isSeparatedContentRow = rowType === 'PRODUCT' || rowType === 'DESCRIPTION' || rowType === 'CUSTOM';

    return { rowType, isSectionRow, isRootSection, isInlineContentRow, isTitleRow, isSeparatedContentRow };
};

export const getTreeRowDisplayValues = (node: TreeNode, hasChildren: boolean, isSectionRow: boolean) => {
    const qty = node.quantity;
    const effectivePrice = node.unitPrice ?? null;
    const calcTotal = node.calculation?.totalCalculatedPrice ?? 0;
    const derivedNetTotal = effectivePrice != null && effectivePrice > 0 && qty > 0
        ? qty * effectivePrice * (1 - (node.discount ?? 0) / 100) + (node.calculation?.additionalCost ?? 0)
        : calcTotal;
    const derivedTotal = lineTotalWithTax(derivedNetTotal, node.taxRate);
    const displayTotal = hasChildren ? node.totalWithChildren : (derivedTotal > 0 ? derivedTotal : node.totalWithChildren);
    const showRowTotal = !isSectionRow && displayTotal > 0;
    const displayUnitPrice = effectivePrice != null
        ? effectivePrice
        : (qty > 0 && calcTotal > 0 ? calcTotal / qty : null);
    const hasOwnAmount = (qty > 0 && displayUnitPrice != null) || calcTotal > 0;

    return { qty, displayTotal, showRowTotal, displayUnitPrice, hasOwnAmount };
};

export const getTreeRowTitleClass = (rowType: string, level: number, isSectionRow: boolean, isRootSection: boolean) =>
    rowType === 'TITLE'
        ? (level === 0 ?"text-[15px] font-bold text-slate-900" :"text-[14px] font-bold text-slate-800")
        : rowType === 'CUSTOM'
            ?"text-[13px] font-semibold text-slate-800"
            : rowType === 'DESCRIPTION'
                ?"text-[12.5px] leading-5 text-slate-600"
                : rowType === 'PRODUCT'
                    ?"text-[13px] font-semibold text-slate-900"
                    : isSectionRow
                        ? (isRootSection ?"text-[13px] font-semibold text-slate-900" :"text-[12.5px] font-semibold text-slate-800")
                        :"text-[13px] text-slate-800";

export const getTreeRowBorderClass = (
    isRootSection: boolean,
    isSectionRow: boolean,
    isTitleRow: boolean,
    isSeparatedContentRow: boolean,
) => isRootSection
    ?"border-b border-slate-200"
    : isSectionRow
        ?"border-b border-slate-200"
        : isTitleRow
            ?"border-b border-slate-100"
            : isSeparatedContentRow
                ?"border-b border-slate-100"
                :"border-b border-slate-100";

export const parseTreeRowInlineNumber = (value: string) => {
    const normalized = value.replace(/'/g, '').replace(',', '.');
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
};
