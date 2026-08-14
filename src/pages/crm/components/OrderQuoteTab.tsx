import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { t } from '@/i18n/translate';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { tenderApi } from '@/lib/api/tender';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import { formatMoney, toCurrencyCode, type CurrencyCode } from '@/utils/currency';
import type { SimpleTenderLine } from '@/pages/tender/detail/types/tenderDetail.types';
import { lineNetTotal } from '@/pages/tender/detail/utils/tenderCalculation.utils';
import { discountDisplayName, seedTotalDiscounts } from '@/pages/tender/detail/utils/tenderDiscounts.utils';
import { buildSimpleTenderLines, plainTextPreview } from '@/pages/tender/detail/utils/tenderLine.utils';
import {
    computeTenderPricingSummary,
    formatDiscountPercent,
    type TenderPricingSummary,
} from '@/pages/tender/detail/utils/tenderPricing.utils';
import { money, numberFmt } from '@/pages/project/features/utils/projectFormatters';
import type { MyOrderDetailDto } from '@/types/billing';

import { QuotePdfButton } from './QuotePdfButton';

/**
 * Teklif ekranındaki dipnotun salt okunur eşi: ara toplam, SIRAYLA uygulanan
 * belge iskontoları, net, KDV ve brüt. Tender'daki `TenderPriceSummary`
 * KULLANILMAZ, çünkü o para birimini açık teklifin store'undan okur — sipariş
 * sayfasında o store bayattır; burada birim teklifin kendisinden gelir.
 */
const QuoteTotalsFooter = ({ summary, fmt }: { summary: TenderPricingSummary; fmt: (v: number) => string }) => {
    const visibleDiscounts = summary.discounts.filter((entry) => entry.amount > 0);
    return (
        <div className="flex justify-end border-t border-slate-200 bg-slate-50 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="w-full max-w-[330px] space-y-0.5 border-l border-slate-200 bg-white px-3 py-2 text-[12.5px] dark:border-white/10 dark:bg-transparent">
                {visibleDiscounts.length > 0 && (
                    <div className="flex items-center justify-between gap-3">
                        <span className="text-slate-500 dark:text-white/60">{t('tenders.subtotal_excl_vat')}</span>
                        <span className="tabular-nums text-slate-600 dark:text-white/70">{fmt(summary.netBeforeDiscounts)}</span>
                    </div>
                )}
                {summary.discounts.map((entry, index) => (
                    entry.amount > 0 ? (
                        <div key={`${entry.name}-${index}`} className="flex items-center justify-between gap-3">
                            <span className="min-w-0 truncate text-slate-500 dark:text-white/60" title={discountDisplayName(entry, index)}>
                                {discountDisplayName(entry, index)}
                            </span>
                            <span className="flex shrink-0 items-center gap-2">
                                <span className="whitespace-nowrap tabular-nums text-rose-600">−{fmt(entry.amount)}</span>
                                <span className="font-medium tabular-nums text-slate-500 dark:text-white/60">{formatDiscountPercent(entry.percent)}</span>
                            </span>
                        </div>
                    ) : null
                ))}
                {visibleDiscounts.length > 1 && (
                    <div className="flex items-center justify-between gap-3 border-t border-dashed border-slate-200 pt-1 dark:border-white/15">
                        <span className="font-medium text-slate-600 dark:text-white/70">{t('tenders.total_discount')}</span>
                        <span className="flex items-center gap-2">
                            <span className="whitespace-nowrap font-medium tabular-nums text-rose-600">−{fmt(summary.totalDiscountAmount)}</span>
                            <span className="font-medium tabular-nums text-slate-700 dark:text-white/80">
                                {formatDiscountPercent(summary.combinedDiscountPercent)}
                            </span>
                        </span>
                    </div>
                )}
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-white/60">{t('tenders.net_total')}</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-white/90">{fmt(summary.netTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                    <span className="text-slate-500 dark:text-white/60">{t('tenders.vat_amount')}</span>
                    <span className="font-medium tabular-nums text-slate-800 dark:text-white/90">{fmt(summary.vatTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-2 pb-0.5 dark:border-white/15">
                    <span className="text-[13px] font-bold text-slate-700 dark:text-white">{t('tenders.total_incl_vat')}</span>
                    <span className="text-[17px] font-extrabold tabular-nums text-slate-900 dark:text-white">{fmt(summary.grossTotal)}</span>
                </div>
            </div>
        </div>
    );
};

/**
 * "Auftrag" sekmesi — sipariş açılınca İLK görünen bölüm (kullanıcı isteği):
 * solda teklifin pozisyon satırları (başlıklar, açıklamalar, ürünler) teklif
 * ekranındaki fiyat mantığıyla birebir aynı yardımcılarla; tablonun altında
 * teklif dipnotu. Sağda maliyet özeti (sipariş tutarı + saha giderleri + ek
 * siparişler → genel toplam).
 */
export const OrderQuoteTab = ({ order }: { order: MyOrderDetailDto }) => {
    const navigate = useNavigate();
    const { settings } = usePdfSettingsStore();
    const tender = order.tender || null;
    const cost = order.costSummary;
    // Ek siparişin maliyet özetinde "Zusatzmaterial" satırı GÖSTERİLMEZ
    // (kullanıcı isteği): raporla toplanan malzemeler ancak "Ek sipariş
    // oluştur" adımıyla siparişe dönüşür; ek siparişte bu satır ya sıfırdır
    // ya da tutarı zaten sipariş tutarının içinde tekrar sayar.
    const isAddon = Boolean(order.parentSalesOrder);

    const [lines, setLines] = useState<SimpleTenderLine[]>([]);
    const [summary, setSummary] = useState<TenderPricingSummary | null>(null);
    const [currency, setCurrency] = useState<CurrencyCode>('CHF');
    const [loading, setLoading] = useState(Boolean(tender));

    // Pozisyonlar sipariş yükünde TAŞINMAZ (detay ucu yalın kalır); teklif
    // detayından okunur — fatura PDF'inin kullandığı çağrının aynısı, böylece
    // buradaki rakamlar PDF'tekilerle asla ayrışamaz.
    useEffect(() => {
        if (!tender?.id) return;
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const detail = await tenderApi.getById(tender.id, { includeActivities: false, deferOrderPdfContent: true });
                if (cancelled) return;
                const vatRate = Number(settings.vatRate) || 8.1;
                const rows = buildSimpleTenderLines(detail.positions || [], vatRate);
                setLines(rows);
                setSummary(computeTenderPricingSummary(rows, vatRate, seedTotalDiscounts(detail.tender)));
                setCurrency(toCurrencyCode((detail.tender as { currency?: string | null } | undefined)?.currency));
            } catch {
                if (!cancelled) {
                    setLines([]);
                    setSummary(null);
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [tender?.id, settings.vatRate]);

    const fmt = (value: number) => formatMoney(value, currency);

    const CostRow = ({ label, value, strong }: { label: string; value?: number | null; strong?: boolean }) => (
        <div className={`flex items-center justify-between ${strong ? 'mt-2 border-t border-slate-100 pt-2 dark:border-white/10' : ''}`}>
            <span className={strong ? 'font-semibold text-secondary' : 'text-tertiary'}>{label}</span>
            <span className={`font-mono tabular-nums ${strong ? 'font-semibold text-[#272f67] dark:text-white' : 'font-medium text-primary'}`}>
                {money(Number(value) || 0)}
            </span>
        </div>
    );

    return (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
            <SectionCard
                title={t('projects.tender')}
                action={tender ? (
                    // Nummer öffnet die Offerte, das Auge das Angebots-PDF
                    // (Vorschau + Download) — ohne die Seite zu verlassen.
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => navigate(`/crm/tenders/${tender.id}`)}
                            className="font-mono text-[12px] font-semibold text-[#272f67] underline-offset-2 hover:underline dark:text-sky-300"
                        >
                            {tender.tenderNumber}
                        </button>
                        <QuotePdfButton tenderId={tender.id} tenderNumber={tender.tenderNumber} label="PDF" />
                    </div>
                ) : undefined}
            >
                {loading ? (
                    <div className="m-4 h-48 animate-pulse rounded-lg bg-slate-50 dark:bg-white/5" />
                ) : !tender || lines.length === 0 ? (
                    <div className="py-6">
                        <EmptyState title={t('auto.bu_siparis_bir_teklife_bagli_degil')} />
                    </div>
                ) : (
                    <>
                        <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                            <thead>
                                <tr>
                                    <th className="w-14 text-left">{t('tenders.pos')}</th>
                                    <th className="text-left">{t('tenders.description')}</th>
                                    <th className="w-20 text-right">{t('common.quantity')}</th>
                                    <th className="w-20 text-left">{t('tenders.unit')}</th>
                                    <th className="w-28 text-right">{t('tenders.unit_price')}</th>
                                    <th className="w-20 text-right">{t('tenders.discount')}</th>
                                    <th className="w-32 text-right">{t('common.total')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {lines.map((line) => {
                                    const position = line.position;
                                    if (line.kind === 'TITLE') {
                                        return (
                                            <tr key={line.id} className="bg-slate-50/70 dark:bg-white/[0.04]">
                                                <td className="font-mono text-[12px] font-bold text-slate-500 dark:text-white/60">{line.label}</td>
                                                <td colSpan={6} className="font-bold text-slate-800 dark:text-white">
                                                    {plainTextPreview(position.shortDescription)}
                                                </td>
                                            </tr>
                                        );
                                    }
                                    if (line.kind === 'DESCRIPTION') {
                                        return (
                                            <tr key={line.id}>
                                                <td />
                                                <td colSpan={6} className="text-[12.5px] italic text-slate-500 dark:text-white/60">
                                                    {plainTextPreview(position.shortDescription)}
                                                </td>
                                            </tr>
                                        );
                                    }
                                    const discount = Number(position.discount || 0);
                                    return (
                                        <tr key={line.id}>
                                            <td className="font-mono text-[12px] text-slate-500 dark:text-white/60">{line.label}</td>
                                            <td className="text-[13px] text-slate-800 dark:text-white/90">{plainTextPreview(position.shortDescription)}</td>
                                            <td className="text-right font-mono tabular-nums text-slate-700 dark:text-white/80">{numberFmt(position.quantity)}</td>
                                            <td className="text-[12.5px] text-slate-500 dark:text-white/60">{position.unit || '—'}</td>
                                            <td className="text-right font-mono tabular-nums text-slate-700 dark:text-white/80">
                                                {position.unitPrice != null ? fmt(Number(position.unitPrice)) : '—'}
                                            </td>
                                            <td className="text-right font-mono tabular-nums text-slate-500 dark:text-white/60">
                                                {discount > 0 ? `${numberFmt(discount)}%` : '—'}
                                            </td>
                                            {/* Satır toplamı KDV'siz — dipnottaki "Zwischensumme
                                                exkl. MwSt." bu sütunun toplamıdır. */}
                                            <td className="text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                                                {fmt(lineNetTotal(position))}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                        {summary && <QuoteTotalsFooter summary={summary} fmt={fmt} />}
                    </>
                )}
            </SectionCard>

            <Card title={t('crm.cost_summary')}>
                {cost ? (
                    <div className="space-y-2 text-sm">
                        <CostRow label={t('crm.order_amount')} value={cost.orderAmount} />
                        <CostRow label={t('crm.external_expenses')} value={cost.expensesTotal} />
                        {!isAddon && <CostRow label={t('crm.additional_materials')} value={cost.extraMaterialsTotal} />}
                        <CostRow label={t('nav.attendance')} value={cost.overtimeTotal} />
                        <CostRow label={t('crm.additional_orders')} value={cost.addonTotal} />
                        <CostRow label={t('crm.general_total')} value={cost.grandTotal} strong />
                    </div>
                ) : (
                    <p className="text-sm text-tertiary">{t('crm.cost_info_not_found')}</p>
                )}
            </Card>
        </div>
    );
};
