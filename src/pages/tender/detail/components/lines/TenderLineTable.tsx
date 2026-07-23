
import { lazy, Suspense } from 'react';
import {
    ChevronDown,
    ChevronUp,
    File05 as FileText,
    Package,
    Tag01,
} from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { t } from '@/i18n/translate';

import { richTextToHtml } from '../../utils/markdown.utils';
import { useMoneyFormat } from '../../utils/useMoneyFormat';
import type {
    ManualProductForm,
    NumberField,
    ProductSource,
    SimpleTenderLine,
    TenderLineColumnKey,
    TextField,
} from '../../types/tenderDetail.types';
import {
    DEFAULT_TENDER_LINE_COLUMN_WIDTHS,
    INLINE_NAME_INPUT_CLASS,
    INLINE_TITLE_INPUT_CLASS,
    lineActionButtonClass,
} from '../../utils/tenderDetail.constants';
import { cleanImportedProductDescription } from '../../utils/tenderLine.utils';
import { AutoFitAmount } from '../common/AutoFitAmount';
import { BufferedTextInput } from '../TenderLineInputs';
import { TenderLineHeaderCell } from './TenderLineTableHeader';
import { TenderLinePriceInput } from './TenderLinePriceInput';

const LazyInlineDescriptionEditor = lazy(() =>
    import('../InlineDescriptionEditor').then((mod) => ({ default: mod.InlineDescriptionEditor })),
);

type TenderLineTableProps = {
    pagedRows: SimpleTenderLine[];
    rowOffset: number;
    totalRowCount: number;
    isEmpty: boolean;
    isDraft: boolean;
    canManage: boolean;
    sectionSchemaOpen: boolean;
    fallbackTaxRate: number;
    selectedId: string | null;
    selectedRowIds: Record<string, boolean>;
    allRowsSelected: boolean;
    someRowsSelected: boolean;
    stableRowKeys: Map<string, string>;
    lastRowId?: string;
    onSelectRow: (rowId: string) => void;
    onToggleAllRows: (checked: boolean) => void;
    onToggleRow: (rowId: string, checked: boolean) => void;
    commitTextField: (positionId: string, field: TextField, value: string) => void;
    commitNumberField: (positionId: string, field: NumberField, value: number) => void;
    commitLongDescription: (positionId: string, value: string) => void;
    registerCell: (key: string, handle: { focus: () => void } | null) => void;
    onArrowNav: (col: string, rowIndex: number, dir: 1 | -1) => boolean;
    onAddRow: (rowType: 'TITLE' | 'DESCRIPTION' | 'PRODUCT', article?: ProductSource, options?: Partial<ManualProductForm>, afterRowId?: string) => void;
    onMoveRow: (rowId: string, direction: 'up' | 'down') => void;
    onOpenProductPicker: (afterRowId?: string) => void;
};

export const TenderLineTable = ({
    pagedRows,
    rowOffset,
    totalRowCount,
    isEmpty,
    isDraft,
    canManage,
    sectionSchemaOpen,
    fallbackTaxRate,
    selectedId,
    selectedRowIds,
    allRowsSelected,
    someRowsSelected,
    stableRowKeys,
    lastRowId,
    onSelectRow,
    onToggleAllRows,
    onToggleRow,
    commitTextField,
    commitNumberField,
    commitLongDescription,
    registerCell,
    onArrowNav,
    onAddRow,
    onMoveRow,
    onOpenProductPicker,
}: TenderLineTableProps) => {
    // Row totals follow the offer's selected currency (symbol-only display).
    const fmtMoney = useMoneyFormat();
    const fixedLineColumnStyle = (key: TenderLineColumnKey) => ({ width: DEFAULT_TENDER_LINE_COLUMN_WIDTHS[key] });

    const canReorder = isDraft && canManage;

    // The numeric columns are fixed (~578px); the description column takes the
    // rest. 860px keeps it usable on laptops without forcing the whole card
    // into horizontal scroll the way the old 1160px minimum did.
    return (
        <table data-tender-detail-table className="min-w-[860px] w-full table-fixed text-[12px]">
            <colgroup>
                <col style={fixedLineColumnStyle('select')} />
                <col />
                <col style={fixedLineColumnStyle('quantity')} />
                <col style={fixedLineColumnStyle('unit')} />
                <col style={fixedLineColumnStyle('unitPrice')} />
                <col style={fixedLineColumnStyle('discount')} />
                <col style={fixedLineColumnStyle('taxRate')} />
                <col style={fixedLineColumnStyle('total')} />
            </colgroup>
            <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
                <tr>
                    <th className="px-1.5 py-2 text-center font-semibold">
                        <Checkbox
                            aria-label={t('tenders.all_satirlari_select')}
                            size="sm"
                            isSelected={allRowsSelected}
                            isIndeterminate={someRowsSelected && !allRowsSelected}
                            onChange={onToggleAllRows}
                            onClick={(event) => event.stopPropagation()}
                        />
                    </th>
                    <TenderLineHeaderCell label={t('nav.articles')} align="left" className="!border-l-0 px-3" />
                    <TenderLineHeaderCell label={t('common.quantity')} noTruncate />
                    <TenderLineHeaderCell label={t('tenders.unit')} />
                    <TenderLineHeaderCell label={sectionSchemaOpen ?t('tenders.unit_price') :t('tenders.unit_price')} />
                    <TenderLineHeaderCell label={sectionSchemaOpen ?t('tenders.ind') :t('common.discount')} />
                    <TenderLineHeaderCell label="KDV" />
                    <TenderLineHeaderCell label={t('common.amount')} />
                </tr>
            </thead>
            <tbody>
                {isEmpty && (
                    <tr>
                        <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.tender_line_not_found')}</td>
                    </tr>
                )}
                {pagedRows.map((row, rowIndex) => {
                    const position = row.position;
                    const isSelected = selectedId === row.id;
                    const isProduct = row.kind === 'PRODUCT';
                    const isDescription = row.kind === 'DESCRIPTION';
                    const taxRate = Number(position.taxRate || fallbackTaxRate);
                    const visibleLongDescription = isProduct
                        ? cleanImportedProductDescription(position.longDescription)
                        : position.longDescription || '';

                    return (
                        <tr
                            key={stableRowKeys.get(row.id) ?? row.id}
                            onClick={() => onSelectRow(row.id)}
                            className={`group border-b border-slate-100 ${isSelected ? 'bg-[#1f2654]/[0.045]' : row.kind === 'TITLE' ? 'bg-slate-50/70' : 'hover:bg-slate-50/60'}`}
                        >
                            <td className="px-1.5 py-1.5 text-center align-top">
                                <div className="flex flex-col items-center gap-1">
                                    <Checkbox
                                        aria-label={t('tenders.line_select')}
                                        size="sm"
                                        isSelected={!!selectedRowIds[row.id]}
                                        onChange={(checked) => onToggleRow(row.id, checked)}
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                    {canReorder && (
                                        <div className="flex flex-col items-center opacity-40 transition-opacity group-hover:opacity-100">
                                            <button
                                                type="button"
                                                aria-label={t('tenders.move_up')}
                                                title={t('tenders.move_up')}
                                                disabled={rowOffset + rowIndex === 0}
                                                onClick={(event) => { event.stopPropagation(); onMoveRow(row.id, 'up'); }}
                                                className="inline-flex h-4 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            >
                                                <ChevronUp size={13} />
                                            </button>
                                            <button
                                                type="button"
                                                aria-label={t('tenders.move_down')}
                                                title={t('tenders.move_down')}
                                                disabled={rowOffset + rowIndex === totalRowCount - 1}
                                                onClick={(event) => { event.stopPropagation(); onMoveRow(row.id, 'down'); }}
                                                className="inline-flex h-4 w-5 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                                            >
                                                <ChevronDown size={13} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </td>
                            <td className="px-3 py-1.5 align-top">
                                <div className={`flex min-w-0 ${row.label ? 'gap-1.5' : ''}`}>
                                    {row.label && (
                                        <span className={`mt-0.5 shrink-0 whitespace-nowrap font-mono tabular-nums ${row.kind === 'TITLE' ?"text-[13px] font-semibold text-slate-900" :"text-[12px] text-slate-700"}`}>
                                            {row.label}
                                        </span>
                                    )}
                                    {isProduct && position.sourceArticleId && (
                                        <button
                                            type="button"
                                            aria-label={t('tenders.product_detayina_git')}
                                            title={t('tenders.product_detayina_git')}
                                            onClick={(event) => {
                                                event.stopPropagation();
                                                window.open(`/inventory/articles/${position.sourceArticleId}`, '_blank', 'noopener');
                                            }}
                                            className="-mt-px inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded text-blue-500 transition-colors hover:bg-blue-50 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                                        >
                                            <Tag01 size={13} />
                                        </button>
                                    )}
                                    <div className="min-w-0 flex-1">
                                        {!isDescription && (
                                            isDraft ? (
                                                <BufferedTextInput
                                                    ariaLabel={row.kind === 'TITLE' ?t('tenders.baslik') :t('tenders.product_adi')}
                                                    value={position.shortDescription || ''}
                                                    field="shortDescription"
                                                    commit={commitTextField}
                                                    positionId={row.id}
                                                    rowIndex={rowIndex}
                                                    navCol="shortDescription"
                                                    registerCell={registerCell}
                                                    onArrowNav={onArrowNav}
                                                    className={row.kind === 'TITLE' ? INLINE_TITLE_INPUT_CLASS : INLINE_NAME_INPUT_CLASS}
                                                />
                                            ) : (
                                                <div className={`${row.kind === 'TITLE' ?"text-[14px] font-semibold text-slate-900" :"text-[13px] font-medium text-slate-900"}`}>
                                                    {position.shortDescription}
                                                </div>
                                            )
                                        )}

                                        {isDescription && (
                                            <div className="flex min-w-0 flex-col gap-2">
                                                {isDraft ? (
                                                    <Suspense fallback={<div className="min-h-[82px] rounded bg-slate-50" />}>
                                                        <LazyInlineDescriptionEditor
                                                            positionId={row.id}
                                                            value={position.longDescription || ''}
                                                            minHeight={82}
                                                            commit={commitLongDescription}
                                                        />
                                                    </Suspense>
                                                ) : position.longDescription ? (
                                                    <div
                                                        className="rich-text-preview text-[12.5px] leading-5 text-slate-700 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5"
                                                        dangerouslySetInnerHTML={{ __html: richTextToHtml(position.longDescription) }}
                                                    />
                                                ) : null}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                {isProduct && (
                                    <div className="mt-2 flex min-w-0 flex-col gap-2">
                                        {isDraft ? (
                                            <Suspense fallback={<div className="min-h-[132px] rounded bg-slate-50" />}>
                                                <LazyInlineDescriptionEditor
                                                    positionId={row.id}
                                                    value={visibleLongDescription}
                                                    minHeight={132}
                                                    commit={commitLongDescription}
                                                />
                                            </Suspense>
                                        ) : visibleLongDescription ? (
                                            <div
                                                className="rich-text-preview text-[12.5px] leading-5 text-slate-700 [&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-0.5 [&_li]:pl-0.5"
                                                dangerouslySetInnerHTML={{ __html: richTextToHtml(visibleLongDescription) }}
                                            />
                                        ) : null}
                                    </div>
                                )}
                            </td>
                            <td className="border-l border-slate-100 px-1.5 py-1.5 text-right align-top">
                                <TenderLinePriceInput row={row} field="quantity" value={position.quantity} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={onArrowNav} />
                            </td>
                            <td className="border-l border-slate-100 px-1.5 py-1.5 text-right align-top">
                                {isProduct && isDraft ? (
                                    <BufferedTextInput
                                        ariaLabel={t('tenders.unit')}
                                        value={position.unit || ''}
                                        field="unit"
                                        commit={commitTextField}
                                        positionId={row.id}
                                        rowIndex={rowIndex}
                                        navCol="unit"
                                        registerCell={registerCell}
                                        onArrowNav={onArrowNav}
                                        className="w-full min-w-0 rounded-md border border-transparent bg-transparent text-right text-[11.5px] text-slate-700 transition-colors hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
                                    />
                                ) : (
                                    <span className="block text-right text-[11.5px] text-slate-600">{isProduct ? position.unit : ''}</span>
                                )}
                            </td>
                            <td className="border-l border-slate-100 px-1.5 py-1.5 text-right align-top">
                                <TenderLinePriceInput row={row} field="unitPrice" value={position.unitPrice} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={onArrowNav} />
                            </td>
                            <td className="border-l border-slate-100 px-1.5 py-1.5 text-right align-top">
                                <TenderLinePriceInput row={row} field="discount" value={position.discount} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={onArrowNav} max={100} />
                            </td>
                            <td className="border-l border-slate-100 px-1.5 py-1.5 text-right align-top">
                                <TenderLinePriceInput row={row} field="taxRate" value={taxRate} rowIndex={rowIndex} isDraft={isDraft} commit={commitNumberField} registerCell={registerCell} onArrowNav={onArrowNav} max={100} />
                            </td>
                            <td className="border-l border-slate-100 px-2 py-1.5 text-right align-top">
                                {isProduct && row.total > 0 ? (
                                    <AutoFitAmount value={fmtMoney(row.total)} basePx={12} scrollbar="thin" className="font-mono font-semibold text-slate-900" />
                                ) : null}
                            </td>
                        </tr>
                    );
                })}
                {isDraft && canManage && (
                    <tr data-tender-line-actions className="border-0">
                        <td colSpan={8} className="px-3 py-2">
                            <div className="flex flex-wrap items-center gap-2">
                                <Button size="sm" variant="secondary" icon={<Package size={12} />} onClick={() => onOpenProductPicker(lastRowId)} className={lineActionButtonClass}>{t('tenders.product_add')}</Button>
                                <Button size="sm" variant="secondary" onClick={() => onAddRow('TITLE', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.baslik')}</Button>
                                <Button size="sm" variant="secondary" icon={<FileText size={12} />} onClick={() => onAddRow('DESCRIPTION', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.description_add')}</Button>
                            </div>
                        </td>
                    </tr>
                )}
            </tbody>
        </table>
    );
};
