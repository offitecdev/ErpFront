import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { List } from '@/components/icons/antIconCompat';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { ColResizeHandle, ResizableCols, TableStateRow } from '../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../hooks/useColumnWidths';

import { tenderApi } from '../../lib/api/tender';
import type { ProjectDto } from '../../types/project';
import type { TenderDetailDto } from '../../types/tender';
import { usePdfSettings } from '../../store/pdfSettingsStore';
import { DEFAULT_VAT } from '../sales/detail/utils/tenderDetail.constants';
import { buildSimpleTenderLines } from '../sales/detail/utils/tenderLine.utils';
import { lineNetTotal } from '../sales/detail/utils/tenderCalculation.utils';
import { computeTenderPricingSummary, formatDiscountPercent } from '../sales/detail/utils/tenderPricing.utils';
import { discountDisplayName, seedTotalDiscounts } from '../sales/detail/utils/tenderDiscounts.utils';
import { formatMoney, toCurrencyCode } from '../../utils/currency';

import { t } from '@/i18n/translate';

const COLUMN_COUNT = 7;

// The tab unmounts whenever the user switches sections, so keep the last loaded
// detail per tender for the session: reopening renders instantly from cache while
// a background refetch keeps the figures current.
const detailCache = new Map<string, TenderDetailDto>();

const fmtQuantity = (value: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(Number(value) || 0);

// Position Summary tab on the project detail page: each linked offer position
// shown by product name plus its plain figures (no images, no long-description
// rows, no position number) plus the offer totals, in the app-wide table design.
export const ProjectPositionsTab = ({ project }: { project: ProjectDto }) => {
    // Kalem sütunu esnektir; diğerleri sürüklenerek genişletilir.
    const grid = useColumnWidths({
        storageKey: 'offitec:project-positions:col-widths:v1',
        defaults: { quantity: 112, unit: 96, unitPrice: 128, discount: 96, tax: 96, amount: 144 },
        minPx: 64,
    });
    // undefined = still loading, null = failed to load, otherwise the offer detail.
    const [detail, setDetail] = useState<TenderDetailDto | null | undefined>(() => {
        const id = project.tenderId || project.tender?.id;
        return id ? detailCache.get(id) : undefined;
    });
    const pdfSettings = usePdfSettings();
    const fallbackTaxRate = pdfSettings.vatRate ?? DEFAULT_VAT;

    const tenderId = project.tenderId || project.tender?.id || null;
    const loading = !!tenderId && detail === undefined;

    useEffect(() => {
        if (!tenderId) return;
        let cancelled = false;
        // light=true: the tab only shows plain figures, so skip the heavy article/
        // material joins and activities the full detail endpoint would load.
        tenderApi.getById(tenderId, { light: true })
            .then((data) => {
                detailCache.set(tenderId, data);
                if (!cancelled) setDetail(data);
            })
            .catch((e: unknown) => {
                if (cancelled || detailCache.has(tenderId)) return;
                setDetail(null);
                const message = (e as { response?: { data?: { error?: string } } })?.response?.data?.error;
                toast.error(message || t('tenders.tender_not_found'));
            });
        return () => { cancelled = true; };
    }, [tenderId]);

    const rows = useMemo(
        () => (detail ? buildSimpleTenderLines(detail.positions, fallbackTaxRate) : []),
        [detail, fallbackTaxRate],
    );
    const productRows = useMemo(() => rows.filter((row) => row.kind === 'PRODUCT'), [rows]);
    const summary = useMemo(
        () => computeTenderPricingSummary(rows, fallbackTaxRate, detail ? seedTotalDiscounts(detail.tender) : []),
        [rows, fallbackTaxRate, detail],
    );

    const currency = toCurrencyCode(detail?.tender.currency);
    const fmtMoney = (value: number) => formatMoney(value, currency);

    if (!tenderId) {
        return (
            <Card title={t('auto.pozisyon_ozeti')} icon={<List size={14} />}>
                <EmptyState
                    icon={<List size={32} />}
                    title={t('auto.pozisyon_ozeti')}
                    description={t('auto.bu_proje_bir_teklife_bagli_degil')}
                />
            </Card>
        );
    }

    return (
        <Card
            title={t('auto.pozisyon_ozeti')}
            icon={<List size={14} />}
            noPadding
            actions={detail?.tender.tenderNumber ? (
                <span className="font-mono text-[11.5px] text-slate-500">{detail.tender.tenderNumber}</span>
            ) : undefined}
        >
            <div className="overflow-x-auto">
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Kalem sütunu: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['quantity', 'unit', 'unitPrice', 'discount', 'tax', 'amount'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('nav.articles')}</th>
                            <th className="relative text-right">
                                {t('common.quantity')}
                                <ColResizeHandle {...grid.resizeProps('quantity')} />
                            </th>
                            <th className="relative text-left">
                                {t('tenders.unit')}
                                <ColResizeHandle {...grid.resizeProps('unit')} />
                            </th>
                            <th className="relative text-right">
                                {t('tenders.unit_price')}
                                <ColResizeHandle {...grid.resizeProps('unitPrice')} />
                            </th>
                            <th className="relative text-right">
                                {t('common.discount')}
                                <ColResizeHandle {...grid.resizeProps('discount')} />
                            </th>
                            <th className="relative text-right">
                                {t('common.tax')}
                                <ColResizeHandle {...grid.resizeProps('tax')} />
                            </th>
                            <th className="relative text-right">
                                {t('common.amount')}
                                <ColResizeHandle {...grid.resizeProps('amount')} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || productRows.length === 0) && (
                            <TableStateRow
                                colSpan={COLUMN_COUNT}
                                loading={loading}
                                emptyText={t('tenders.tender_line_not_found')}
                            />
                        )}
                        {!loading && productRows.map((row) => {
                            const { position } = row;
                            const unitPrice = position.unitPrice == null ? null : Number(position.unitPrice);
                            const discount = Number(position.discount || 0);
                            const taxRate = Number(position.taxRate ?? fallbackTaxRate);
                            return (
                                <tr key={row.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="text-slate-800 dark:text-white">
                                        {position.shortDescription || '—'}
                                    </td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-700 dark:text-white/80">{fmtQuantity(position.quantity)}</td>
                                    <td className="text-slate-500 dark:text-white/60">{position.unit || '—'}</td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-700 dark:text-white/80">
                                        {unitPrice != null ? fmtMoney(unitPrice) : '—'}
                                    </td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-500 dark:text-white/60">
                                        {discount > 0 ? formatDiscountPercent(discount) : '—'}
                                    </td>
                                    <td className="text-right font-mono text-[13px] tabular-nums text-slate-500 dark:text-white/60">{formatDiscountPercent(taxRate)}</td>
                                    <td className="text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                        {fmtMoney(lineNetTotal(position))}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            {/* Offer amount footer — same figures as the offer's price summary, read-only. */}
            {!loading && detail && (
                <div className="border-t border-slate-200 px-4 py-3 dark:border-white/10">
                    <div className="ml-auto w-full max-w-sm space-y-1 text-[13px]">
                        {/* Every document-level discount, named, in the order it
                            was applied — read-only mirror of the offer footer. */}
                        {summary.discounts.map((entry, index) => (
                            <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3">
                                <span className="text-slate-500 dark:text-white/60">{discountDisplayName(entry, index)}</span>
                                <span className="flex items-center gap-2">
                                    {entry.amount > 0 && (
                                        <span className="tabular-nums text-rose-600">−{fmtMoney(entry.amount)}</span>
                                    )}
                                    <span className="font-medium tabular-nums text-slate-700 dark:text-white/80">{formatDiscountPercent(entry.percent)}</span>
                                </span>
                            </div>
                        ))}
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-white/60">{t('tenders.subtotal_excl_vat')}</span>
                            <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-white">{fmtMoney(summary.netTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 dark:text-white/60">{t('tenders.vat_amount')}</span>
                            <span className="font-mono font-medium tabular-nums text-slate-800 dark:text-white">{fmtMoney(summary.vatTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200 pt-1 dark:border-white/10">
                            <span className="font-semibold text-slate-700 dark:text-white/80">{t('tenders.total_incl_vat')}</span>
                            <span className="font-mono text-[13.5px] font-bold tabular-nums text-slate-900 dark:text-white">{fmtMoney(summary.grossTotal)}</span>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};
