import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleSuppliersSummary } from '@/types/inventory';
import { ColResizeHandle, ResizableCols, SectionCard, TableStateRow } from '../components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { fmtDate, fmtMoney, fmtQty, fmtUnitCost } from '../utils/format';

/**
 * Ürünün tedarikçi listesi — detay ekranının "Lieferanten" SEKMESİ (eski popup
 * kaldırıldı, kullanıcı isteği). Veri yalnızca sekme açıkken istenir: bileşen
 * sekmeye geçince monte edilir, ayrılınca sökülür, bu yüzden aşağıdaki
 * `useEffect` her açılışta bir kez çalışır.
 *
 * Tablo aynı zamanda ortalama birim maliyetin DÖKÜMÜDÜR: satırlar
 * (adet × birim maliyet) katkılarını, alt satır da
 * Σ(birim maliyet × adet) / Σ(adet) sonucunu gösterir.
 */
export const ArticleSuppliersView = ({
    articleId,
    unit,
}: {
    articleId: string;
    unit: string;
}) => {
    const [summary, setSummary] = useState<ArticleSuppliersSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    // Sürüklenebilir sütunlar; tedarikçi sütununun genişliği yoktur, kalanı o emer.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-article-suppliers:col-widths:v1',
        defaults: { quantity: 112, unitCost: 128, total: 128, lastPurchase: 128 },
        minPx: 72,
    });

    useEffect(() => {
        let cancelled = false;
        inventoryApi
            .getArticleSuppliersSummary(articleId)
            .then((result) => { if (!cancelled) setSummary(result); })
            .catch((err) => { if (!cancelled) setError(err?.response?.data?.error || err?.message || 'error'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [articleId]);

    const rows = summary?.suppliers ?? [];

    return (
        <SectionCard title={t('inv.detail.suppliersSectionTitle', { count: rows.length })}>
            <div className="overflow-x-auto">
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[640px]">
                    <colgroup>
                        {/* Tedarikçi sütunu: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['quantity', 'unitCost', 'total', 'lastPurchase'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('inv.columns.supplier')}</th>
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
                            <th className="relative text-left">
                                {t('inv.detail.lastPurchase')}
                                <ColResizeHandle {...grid.resizeProps('lastPurchase')} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow
                                colSpan={5}
                                loading={loading}
                                emptyText={error || t('inv.detail.suppliersEmpty')}
                            />
                        )}
                        {!loading && rows.map((row) => (
                            <tr key={row.supplierId} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                <td className="text-slate-800 dark:text-white">{row.companyName}</td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {fmtQty(row.quantity)} {unit}
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {fmtUnitCost(row.averageUnitCost)}
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {fmtMoney(row.totalCost)}
                                </td>
                                <td className="text-[12.5px] text-slate-500 dark:text-white/60">
                                    {row.lastPurchaseDate ? fmtDate(row.lastPurchaseDate) : '—'}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    {!loading && rows.length > 0 && summary && (
                        <tfoot>
                            <tr className="border-t border-slate-200 dark:border-white/10">
                                <td className="text-[12.5px] font-semibold text-slate-700 dark:text-white/80">
                                    {t('inv.detail.averageUnitCost')}
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {fmtQty(summary.totalQuantity)} {unit}
                                </td>
                                <td className="text-right font-mono text-[13px] font-bold text-slate-900 dark:text-white">
                                    {fmtUnitCost(summary.averageUnitCost)}
                                </td>
                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                    {fmtMoney(summary.totalCost)}
                                </td>
                                <td />
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </SectionCard>
    );
};
