import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleSuppliersSummary } from '@/types/inventory';
import { BottomSheet } from '../components/BottomSheet';
import { SectionCard, TableStateRow } from '../components/primitives';
import { fmtDate, fmtMoney, fmtQty, fmtUnitCost } from '../utils/format';

/**
 * Ürünün tedarikçi listesi — ürünün ALTINDAN açılan popup. Veri yalnızca popup
 * açıldığında istenir: bu bileşen açıkken monte edilir, kapanınca sökülür, bu
 * yüzden aşağıdaki `useEffect` her açılışta bir kez çalışır.
 *
 * Tablo aynı zamanda ortalama birim maliyetin DÖKÜMÜDÜR: satırlar
 * (adet × birim maliyet) katkılarını, alt satır da
 * Σ(birim maliyet × adet) / Σ(adet) sonucunu gösterir.
 */
export const ArticleSuppliersSheet = ({
    articleId,
    articleName,
    unit,
    onClose,
}: {
    articleId: string;
    articleName: string;
    unit: string;
    onClose: () => void;
}) => {
    const [summary, setSummary] = useState<ArticleSuppliersSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

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
        <BottomSheet
            open
            title={t('inv.detail.suppliersTitle')}
            subtitle={articleName}
            onClose={onClose}
            width={860}
            height={560}
        >
            <div className="p-4">
                <SectionCard title={t('inv.detail.suppliersSectionTitle', { count: rows.length })}>
                    <div className="overflow-x-auto">
                        <table data-inv-table data-unstyled-table className="w-full min-w-[640px]">
                            <thead>
                                <tr>
                                    <th className="text-left">{t('inv.columns.supplier')}</th>
                                    <th className="w-28 text-right">{t('inv.columns.quantity')}</th>
                                    <th className="w-32 text-right">{t('inv.columns.unitCost')}</th>
                                    <th className="w-32 text-right">{t('inv.columns.total')}</th>
                                    <th className="w-32 text-left">{t('inv.detail.lastPurchase')}</th>
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
            </div>
        </BottomSheet>
    );
};
