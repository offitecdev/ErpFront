import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import type { MovementKind } from '@/types/inventory';
import { FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, TableStateRow } from './components/primitives';
import { useLanguageTick } from './hooks/useLanguageTick';
import { MOVEMENTS_PAGE_SIZE, useMovementsList } from './hooks/useMovementsList';
import { fmtDateTime, fmtMoney, fmtQty } from './utils/format';

const KIND_META: Record<string, { labelKey: string; className: string }> = {
    IN: { labelKey: 'inv.movement.in', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    OUT: { labelKey: 'inv.movement.out', className: 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300' },
    DEFINITION: { labelKey: 'inv.movement.definition', className: 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/70' },
    TRANSFER: { labelKey: 'inv.movement.transfer', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    RETURN: { labelKey: 'inv.movement.return', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
    ADJUSTMENT: { labelKey: 'inv.movement.adjustment', className: 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300' },
};

const FILTERABLE_KINDS: MovementKind[] = ['IN', 'OUT', 'DEFINITION', 'RETURN', 'ADJUSTMENT', 'TRANSFER'];

/**
 * Stok hareketleri — stok ekranından açılan tam sayfa liste (geri butonlu).
 * Tanım (DEFINITION) hareketi, ürün 0 adetle tanımlanırken atılan giriş kaydıdır;
 * tedarikçi bilgisini taşır ama stok değiştirmez.
 */
export const StockMovementsPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useMovementsList();

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={(
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={t('common.back')}
                            onClick={() => navigate('/inventory/stock')}
                            className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        {t('inv.movements.title')}
                    </span>
                )}
            />

            <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t('inv.movements.searchPlaceholder')}
                    className="w-64"
                />
                <select
                    value={list.type}
                    onChange={(event) => list.setType(event.target.value as MovementKind | '')}
                    aria-label={t('inv.columns.movementType')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t('inv.movements.allTypes')}</option>
                    {FILTERABLE_KINDS.map((kind) => (
                        <option key={kind} value={kind}>{t(KIND_META[kind].labelKey)}</option>
                    ))}
                </select>
                <input
                    type="date"
                    value={list.dateFrom}
                    onChange={(event) => list.setDateFrom(event.target.value)}
                    aria-label={t('inv.movements.dateFrom')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                />
                <span className="text-[12px] text-slate-400">—</span>
                <input
                    type="date"
                    value={list.dateTo}
                    onChange={(event) => list.setDateTo(event.target.value)}
                    aria-label={t('inv.movements.dateTo')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                />
            </div>

            <SectionCard title={t('inv.movements.sectionTitle', { count: list.total })}>
                <div className="overflow-x-auto">
                    <table data-inv-table data-unstyled-table className="w-full min-w-[880px]">
                        <thead>
                            <tr>
                                <th className="w-40 text-left">{t('common.date')}</th>
                                <th className="w-32 text-left">{t('inv.columns.serialCode')}</th>
                                <th className="text-left">{t('inv.columns.productName')}</th>
                                <th className="w-36 text-left">{t('inv.columns.movementType')}</th>
                                <th className="w-24 text-right">{t('inv.columns.quantity')}</th>
                                <th className="w-32 text-right">{t('inv.columns.unitCost')}</th>
                                <th className="w-32 text-right">{t('inv.columns.total')}</th>
                                <th className="w-56 text-left">{t('inv.columns.description')}</th>
                            </tr>
                            {/* Kolon filtreleri: seri kod / ürün adı / açıklama. */}
                            <tr data-filter-row>
                                <th />
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.code}
                                        onChange={(event) => list.setFilters({ ...list.filters, code: event.target.value })}
                                        placeholder={t('inv.filters.code')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.name}
                                        onChange={(event) => list.setFilters({ ...list.filters, name: event.target.value })}
                                        placeholder={t('inv.filters.name')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                                <th colSpan={4} />
                                <th className="pb-1.5">
                                    <input
                                        value={list.filters.description}
                                        onChange={(event) => list.setFilters({ ...list.filters, description: event.target.value })}
                                        placeholder={t('inv.filters.description')}
                                        className={FILTER_INPUT_CLASS}
                                    />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(list.loading || list.items.length === 0) && (
                                <TableStateRow colSpan={8} loading={list.loading} emptyText={list.error || t('inv.movements.empty')} />
                            )}
                            {!list.loading && list.items.map((movement) => {
                                const meta = KIND_META[movement.movementKind] ?? KIND_META.IN;
                                const isDefinition = movement.movementKind === 'DEFINITION';
                                return (
                                    <tr key={movement.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">{fmtDateTime(movement.transactionDate)}</td>
                                        <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{movement.article?.articleCode || '—'}</td>
                                        <td className="text-slate-800 dark:text-white">{movement.article?.name || '—'}</td>
                                        <td>
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                                                {t(meta.labelKey)}
                                            </span>
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {isDefinition ? '—' : fmtQty(movement.quantity)}
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {movement.unitCost ? fmtMoney(movement.unitCost) : '—'}
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {movement.totalCost ? fmtMoney(movement.totalCost) : '—'}
                                        </td>
                                        <td className="max-w-0 truncate text-[12px] text-slate-500 dark:text-white/60" title={movement.description || undefined}>
                                            {[movement.supplier?.companyName, movement.description].filter(Boolean).join(' · ') || '—'}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={MOVEMENTS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
