import { t } from '@/i18n/translate';
import type { MovementKind } from '@/types/inventory';
import { ColResizeHandle, Pager, ResizableCols, SectionCard, TableStateRow } from '../components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { MOVEMENTS_PAGE_SIZE, useMovementsList } from '../hooks/useMovementsList';
import { fmtDateTime, fmtMoney, fmtQty } from '../utils/format';

/** Hareket türü rozetleri — genel hareketler sayfasıyla aynı renk dili. */
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
 * Tek ürünün stok hareketleri — detay ekranının "Lagerbewegungen" SEKMESİ
 * (ayrı görünüm + geri düğmesi kalktı, kullanıcı isteği). Bileşen yalnızca
 * sekmeye geçildiğinde monte edildiği için istek de o an atılır; ürün sayfası
 * açılırken hareket geçmişi çekilmez. Sorgu sunucuda `articleId` ile daraltılır.
 */
export const ArticleMovementsView = ({
    articleId,
    unit,
}: {
    articleId: string;
    unit: string;
}) => {
    const list = useMovementsList({ articleId });
    // Sürüklenebilir sütunlar; açıklama sütununun genişliği yoktur, kalanı o
    // emer — bu yüzden ondan öncekiler SAĞ kenarlarından tutulur.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-article-movements:col-widths:v1',
        defaults: { date: 160, kind: 144, quantity: 112, unitCost: 128, total: 128 },
        minPx: 72,
    });

    return (
        <div className="flex w-full flex-col gap-3">
            {/* Sekme başlığı üstte zaten durur — burada yalnızca filtreler kalır. */}
            <div className="flex flex-wrap items-center justify-end gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={list.type}
                        onChange={(event) => list.setType(event.target.value as MovementKind | '')}
                        aria-label={t('inv.columns.movementType')}
                        className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
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
                        className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                    />
                    <span className="text-[12px] text-slate-400">—</span>
                    <input
                        type="date"
                        value={list.dateTo}
                        onChange={(event) => list.setDateTo(event.target.value)}
                        aria-label={t('inv.movements.dateTo')}
                        className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                    />
                </div>
            </div>

            <SectionCard title={t('inv.detail.movementsSectionTitle', { count: list.total })}>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[720px]">
                        <colgroup>
                            <ResizableCols keys={['date', 'kind', 'quantity', 'unitCost', 'total'] as const} grid={grid} />
                            {/* Açıklama sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('common.date')}
                                    <ColResizeHandle {...grid.resizeProps('date')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.columns.movementType')}
                                    <ColResizeHandle {...grid.resizeProps('kind')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.quantity')}
                                    <ColResizeHandle {...grid.resizeProps('quantity')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.unitCost')}
                                    <ColResizeHandle {...grid.resizeProps('unitCost')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.total')}
                                    <ColResizeHandle {...grid.resizeProps('total')} />
                                </th>
                                <th className="text-left">{t('inv.columns.description')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(list.loading || list.items.length === 0) && (
                                <TableStateRow
                                    colSpan={6}
                                    loading={list.loading}
                                    emptyText={list.error || t('inv.detail.movementsEmpty')}
                                />
                            )}
                            {!list.loading && list.items.map((movement) => {
                                const meta = KIND_META[movement.movementKind] ?? KIND_META.IN;
                                const isDefinition = movement.movementKind === 'DEFINITION';
                                return (
                                    <tr key={movement.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                        <td className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                            {fmtDateTime(movement.transactionDate)}
                                        </td>
                                        <td>
                                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
                                                {t(meta.labelKey)}
                                            </span>
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {isDefinition ? '—' : `${fmtQty(movement.quantity)} ${unit}`}
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
