import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { List } from '@/components/icons/antIconCompat';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';

import { tenderApi } from '../../lib/api/tender';
import type { ProjectDto } from '../../types/project';
import type { TenderDetailDto } from '../../types/tender';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { DEFAULT_VAT } from '../tender/detail/utils/tenderDetail.constants';
import { buildSimpleTenderLines } from '../tender/detail/utils/tenderLine.utils';
import { lineNetTotal } from '../tender/detail/utils/tenderCalculation.utils';
import { computeTenderPricingSummary, formatDiscountPercent } from '../tender/detail/utils/tenderPricing.utils';
import { formatMoney, toCurrencyCode } from '../../utils/currency';

import { t } from '@/i18n/translate';
import { localizeTenderNumber } from '@/utils/tenderNumber';

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
    // undefined = still loading, null = failed to load, otherwise the offer detail.
    const [detail, setDetail] = useState<TenderDetailDto | null | undefined>(() => {
        const id = project.tenderId || project.tender?.id;
        return id ? detailCache.get(id) : undefined;
    });
    const { settings: pdfSettings } = usePdfSettingsStore();
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
        () => computeTenderPricingSummary(rows, fallbackTaxRate, detail?.tender.directDiscount),
        [rows, fallbackTaxRate, detail?.tender.directDiscount],
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
                <span className="font-mono text-[11.5px] text-slate-500">{localizeTenderNumber(detail.tender.tenderNumber)}</span>
            ) : undefined}
        >
            <div className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <tr>
                            <th className="px-3 py-2 text-left font-semibold">{t('nav.articles')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('common.quantity')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('tenders.unit')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('tenders.unit_price')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('common.discount')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('common.tax')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('common.amount')}</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}>
                                <td colSpan={COLUMN_COUNT} className="px-3 py-3">
                                    <div className="h-4 w-full animate-pulse rounded bg-slate-100" />
                                </td>
                            </tr>
                        ))}
                        {!loading && productRows.length === 0 && (
                            <tr>
                                <td colSpan={COLUMN_COUNT} className="px-3 py-10 text-center text-[12px] text-slate-400">
                                    {t('tenders.tender_line_not_found')}
                                </td>
                            </tr>
                        )}
                        {!loading && productRows.map((row) => {
                            const { position } = row;
                            const unitPrice = position.unitPrice == null ? null : Number(position.unitPrice);
                            const discount = Number(position.discount || 0);
                            const taxRate = Number(position.taxRate ?? fallbackTaxRate);
                            return (
                                <tr key={row.id} className="hover:bg-slate-50/70">
                                    <td className="px-3 py-2 text-slate-700">
                                        {position.shortDescription || '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">{fmtQuantity(position.quantity)}</td>
                                    <td className="px-3 py-2 text-slate-600">{position.unit || '—'}</td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-700">
                                        {unitPrice != null ? fmtMoney(unitPrice) : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600">
                                        {discount > 0 ? formatDiscountPercent(discount) : '—'}
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono tabular-nums text-slate-600">{formatDiscountPercent(taxRate)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold tabular-nums text-slate-900">
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
                <div className="px-3 py-3">
                    <div className="ml-auto w-full max-w-sm space-y-1 text-[12.5px]">
                        <div className="flex items-center justify-between gap-3">
                            <span className="text-slate-500">{t('tenders.direct_discount')}</span>
                            <span className="flex items-center gap-2">
                                {summary.directDiscountAmount > 0 && (
                                    <span className="tabular-nums text-rose-600">−{fmtMoney(summary.directDiscountAmount)}</span>
                                )}
                                <span className="font-medium tabular-nums text-slate-700">{formatDiscountPercent(summary.directDiscount)}</span>
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">{t('tenders.subtotal_excl_vat')}</span>
                            <span className="font-mono font-medium tabular-nums text-slate-800">{fmtMoney(summary.netTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500">{t('tenders.vat_amount')}</span>
                            <span className="font-mono font-medium tabular-nums text-slate-800">{fmtMoney(summary.vatTotal)}</span>
                        </div>
                        <div className="flex items-center justify-between border-t border-slate-200 pt-1">
                            <span className="font-semibold text-slate-700">{t('tenders.total_incl_vat')}</span>
                            <span className="font-mono text-[13.5px] font-bold tabular-nums text-slate-900">{fmtMoney(summary.grossTotal)}</span>
                        </div>
                    </div>
                </div>
            )}
        </Card>
    );
};
