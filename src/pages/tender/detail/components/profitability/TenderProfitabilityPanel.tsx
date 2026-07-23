import { useEffect, useState } from 'react';
import {
    ChevronLeft,
    ChevronRight,
    List as ListTree,
    TrendDown01 as TrendingDown,
    TrendUp01 as TrendingUp,
} from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { t } from '@/i18n/translate';

import { useMoneyFormat } from '../../utils/useMoneyFormat';
import type { SimpleTenderLine } from '../../types/tenderDetail.types';
import { plainTextPreview } from '../../utils/tenderLine.utils';
import { AutoFitAmount } from '../common/AutoFitAmount';

export type TenderProfitabilityRow = SimpleTenderLine & {
    unitCost: number;
    cost: number;
    revenue: number;
    result: number;
    resultRate: number;
    costSource: string;
};

type TenderProfitabilityPanelProps = {
    open: boolean;
    onToggleOpen: (open: boolean) => void;
    result: number;
    revenue: number;
    cost: number;
    rate: number;
    rows: TenderProfitabilityRow[];
    selectedLine: TenderProfitabilityRow | null;
    selectedId: string | null;
    onSelectRow: (rowId: string) => void;
};

const rowPreviewText = (row: SimpleTenderLine) => {
    if (row.kind === 'DESCRIPTION') return plainTextPreview(row.position.longDescription);
    return row.position.shortDescription?.trim() || '';
};

const PROFITABILITY_PAGE_SIZE = 8;

export const TenderProfitabilityPanel = ({
    open,
    onToggleOpen,
    result,
    revenue,
    cost,
    rate,
    rows,
    selectedLine,
    selectedId,
    onSelectRow,
}: TenderProfitabilityPanelProps) => {
    const fmtMoney = useMoneyFormat();
    const [page, setPage] = useState(1);
    const pageCount = Math.max(1, Math.ceil(rows.length / PROFITABILITY_PAGE_SIZE));
    const effectivePage = Math.min(page, pageCount);
    const pageRows = rows.slice(
        (effectivePage - 1) * PROFITABILITY_PAGE_SIZE,
        effectivePage * PROFITABILITY_PAGE_SIZE,
    );

    useEffect(() => {
        if (page > pageCount) setPage(pageCount);
    }, [page, pageCount]);

    useEffect(() => {
        if (!selectedId) return;
        const selectedIndex = rows.findIndex((row) => row.id === selectedId);
        if (selectedIndex < 0) return;
        const selectedPage = Math.floor(selectedIndex / PROFITABILITY_PAGE_SIZE) + 1;
        setPage((current) => current === selectedPage ? current : selectedPage);
    }, [rows, selectedId]);

    if (!open) {
        return (
            <div className="flex min-h-[104px] items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 2xl:flex-col 2xl:justify-start">
                <button
                    type="button"
                    aria-label={t('tenders.profit_loss_semasini_open')}
                    title={t('tenders.profit_loss_semasini_open')}
                    onClick={() => onToggleOpen(true)}
                    className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                    <ChevronLeft size={16} />
                </button>
                <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 2xl:flex-col">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${result >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {result >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                    </span>
                    <span className="whitespace-nowrap 2xl:[writing-mode:vertical-rl] 2xl:rotate-180">{t('tenders.profit_loss')}</span>
                </div>
            </div>
        );
    }

    const isProfit = result >= 0;
    const costShare = revenue > 0 ? Math.min(100, (cost / revenue) * 100) : 0;
    const marginShare = Math.max(0, 100 - costShare);
    return (
        <Card
            title={t('tenders.profit_loss_semasi')}
            icon={<ListTree size={13} />}
            className="bg-white"
            actions={
                <button
                    type="button"
                    aria-label={t('tenders.profit_loss_semasini_kapat')}
                    title={t('tenders.profit_loss_semasini_kapat')}
                    onClick={() => onToggleOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                >
                    <ChevronRight size={15} />
                </button>
            }
        >
        <div className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                            {t('tenders.profit')}
                        </div>
                        <AutoFitAmount
                            value={fmtMoney(result)}
                            basePx={22}
                            className={`mt-1 font-mono font-semibold leading-none tracking-tight ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}
                        />
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ring-1 ring-inset ${isProfit ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70' : 'bg-rose-50 text-rose-600 ring-rose-200/70'}`}>
                        {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                        {rate.toFixed(1)}%
                    </span>
                </div>
                <div className="mt-3">
                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                        <div className="h-full bg-slate-400" style={{ width: `${costShare}%` }} />
                        <div className={`h-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${marginShare}%` }} />
                    </div>
                    <div className="mt-2 flex items-center justify-between text-[10.5px] font-medium text-slate-500">
                        <span>{t('tenders.cost')} · {costShare.toFixed(0)}%</span>
                        <span className={isProfit ? 'text-emerald-700' : 'text-rose-600'}>{t('tenders.profit')} · {marginShare.toFixed(0)}%</span>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.sales')}</div>
                    <AutoFitAmount value={fmtMoney(revenue)} basePx={16} className="mt-1.5 font-mono font-semibold text-slate-900" />
                    <div className="mt-0.5 text-[10px] text-slate-400">{t('tenders.kdv_haric')}</div>
                </div>
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.cost')}</div>
                    <AutoFitAmount value={fmtMoney(cost)} basePx={16} className="mt-1.5 font-mono font-semibold text-slate-900" />
                    <div className="mt-0.5 text-[10px] text-slate-400">{costShare.toFixed(0)}%</div>
                </div>
            </div>

            {selectedLine && (
                <div className="rounded-xl border border-slate-200 bg-white p-3 ring-1 ring-inset ring-[#1f2654]/[0.04]">
                    <div className="flex items-baseline gap-2">
                        {selectedLine.label && (
                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">{selectedLine.label}</span>
                        )}
                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">
                            {rowPreviewText(selectedLine) ||t('tenders.selected_line')}
                        </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                        <div className="rounded-lg bg-slate-50 py-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.sales')}</div>
                            <AutoFitAmount value={fmtMoney(selectedLine.revenue)} basePx={12.5} className="mt-0.5 text-center font-mono font-semibold text-slate-800" />
                        </div>
                        <div className="rounded-lg bg-slate-50 py-1.5">
                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.cost')}</div>
                            <AutoFitAmount value={fmtMoney(selectedLine.cost)} basePx={12.5} className="mt-0.5 text-center font-mono font-semibold text-slate-800" />
                        </div>
                        <div className={`rounded-lg py-1.5 ${selectedLine.result >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                            <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedLine.result >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t('tenders.profit')}</div>
                            <AutoFitAmount value={fmtMoney(selectedLine.result)} basePx={12.5} className={`mt-0.5 text-center font-mono font-semibold ${selectedLine.result >= 0 ? 'text-emerald-700' : 'text-rose-600'}`} />
                            <div className={`text-[10px] font-semibold ${selectedLine.result >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{selectedLine.resultRate.toFixed(1)}%</div>
                        </div>
                    </div>
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-1 border-t border-slate-100 pt-2 text-[10.5px] text-slate-500">
                        <span>{t('tenders.unit_cost')}</span>
                        <span className="font-mono font-semibold text-slate-700">{fmtMoney(selectedLine.unitCost)}</span>
                        <span className="px-0.5 text-slate-300">·</span>
                        <span>{selectedLine.costSource}</span>
                    </div>
                </div>
            )}

            <div className="space-y-2">
                <div className="flex items-center justify-between">
                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.profit_loss_akisi')}</span>
                    <div className="flex items-center gap-1">
                        {rows.length > 0 && (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{rows.length}</span>
                        )}
                        {pageCount > 1 && (
                            <>
                                <button
                                    type="button"
                                    aria-label={t('common.onceki')}
                                    disabled={effectivePage === 1}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                >
                                    <ChevronLeft size={13} />
                                </button>
                                <span className="min-w-8 text-center text-[10px] font-semibold tabular-nums text-slate-500">
                                    {effectivePage}/{pageCount}
                                </span>
                                <button
                                    type="button"
                                    aria-label={t('common.sonraki')}
                                    disabled={effectivePage === pageCount}
                                    onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
                                    className="inline-flex h-6 w-6 items-center justify-center rounded text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                                >
                                    <ChevronRight size={13} />
                                </button>
                            </>
                        )}
                    </div>
                </div>
                {rows.length === 0 ? (
                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center">
                        <ListTree size={18} className="text-slate-300" />
                        <span className="text-[12px] text-slate-400">{t('tenders.no_product_line_for_profit_loss')}</span>
                    </div>
                ) : (
                    <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                        {pageRows.map((row) => {
                            const rowProfit = row.result >= 0;
                            const rowMargin = row.revenue > 0 ? Math.min(100, Math.max(0, (row.result / row.revenue) * 100)) : 0;
                            const active = selectedId === row.id;
                            return (
                                <button
                                    key={row.id}
                                    type="button"
                                    onClick={() => onSelectRow(row.id)}
                                    className={`flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left ${active ? 'border-[#1f2654]/30 bg-[#1f2654]/[0.04] ring-1 ring-[#1f2654]/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                >
                                    {row.label && (
                                        <span className={`mt-0.5 inline-flex h-5 min-w-[22px] shrink-0 items-center justify-center rounded-md px-1 font-mono text-[10.5px] font-semibold ${active ? 'bg-[#1f2654] text-white' : 'bg-slate-100 text-slate-500'}`}>
                                            {row.label}
                                        </span>
                                    )}
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center justify-between gap-2">
                                            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">{rowPreviewText(row)}</span>
                                            <span className={`shrink-0 font-mono text-[11.5px] font-bold ${rowProfit ? 'text-emerald-600' : 'text-rose-600'}`}>{row.resultRate.toFixed(1)}%</span>
                                        </span>
                                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                            <span className={`block h-full rounded-full ${rowProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${rowMargin}%` }} />
                                        </span>
                                        <span className="mt-1 flex items-center justify-between gap-2 text-[10.5px] text-slate-400">
                                            <AutoFitAmount value={fmtMoney(row.revenue)} basePx={10.5} className="tabular-nums" />
                                            <AutoFitAmount value={fmtMoney(row.result)} basePx={10.5} className={`text-right font-mono font-semibold ${rowProfit ? 'text-emerald-700' : 'text-rose-700'}`} />
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
        </Card>
    );
};
