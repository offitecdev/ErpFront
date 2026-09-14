import React, { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SwiftDonut } from '@/components/charts/swiftChart';
import { SWIFT_COLORS } from '@/components/charts/swiftChartCore';
import { PieChart03 } from '@/components/icons/antIconCompat';
import { useThemeStore } from '../../../../store/themeStore';
import { formatMoney, type CurrencyCode } from '../../../../utils/currency';
import type { TenderListItem } from '../../../../types/tender';
import type { SalesOrderDto } from '../../../../lib/api/project';
import { isOfferOpen, offerStage } from '../overviewShared';
import { OverviewCard } from './OverviewCard';

/* iOS system colours in fixed slot order (never cycled) — blue, orange,
   indigo, teal; the fourth slot is the "Other" bucket. */
const SLOTS_LIGHT = [SWIFT_COLORS.light.blue, SWIFT_COLORS.light.orange, SWIFT_COLORS.light.indigo, SWIFT_COLORS.light.teal];
const SLOTS_DARK = [SWIFT_COLORS.dark.blue, SWIFT_COLORS.dark.orange, SWIFT_COLORS.dark.indigo, SWIFT_COLORS.dark.teal];

interface Slice {
    key: string;
    label: string;
    count: number;
    amount: number;
}

interface PipelineChartsProps {
    tenders: TenderListItem[];
    orders: SalesOrderDto[];
    orderedIds: Set<string>;
    currency: CurrencyCode;
    convert: (amount: number, from?: string | null) => number;
}

/* One donut per question — the Swift chart kit draws it: flat sectors with
   an angular inset, hover/pin answers in opacity, the figure in the hole. */
const Donut: React.FC<{
    title: string;
    subtitle?: string;
    slices: Slice[];
    colors: string[];
    currency: CurrencyCode;
    centerLabel: string;
}> = ({ title, subtitle, slices, colors, currency, centerLabel }) => {
    const { t } = useTranslation();
    const colorOf = (key: string) => colors[slices.findIndex((s) => s.key === key) % colors.length];
    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-[13px] font-semibold text-[#1A1A1A] dark:text-white">{title}</p>
            {subtitle && <p className="mb-3 text-[11.5px] text-[#98A0AE] dark:text-[#8f95a1]">{subtitle}</p>}
            <SwiftDonut
                slices={slices.map((slice) => ({ key: slice.key, label: slice.label, value: slice.count, color: colorOf(slice.key) }))}
                centerLabel={centerLabel}
                emptyLabel={t('crmOverview.charts.noData', { defaultValue: 'Veri yok' })}
                format={(value) => String(value)}
                size={168}
                thickness={24}
            />
            <p className="mt-2 text-right text-[11.5px] tabular-nums text-[#98A0AE] dark:text-[#8f95a1]">
                {formatMoney(slices.reduce((acc, s) => acc + s.amount, 0), currency)}
            </p>
        </div>
    );
};

/** Three animated donuts: offer stages, order pipeline, offers e-mailed. */
export const PipelineCharts: React.FC<PipelineChartsProps> = ({ tenders, orders, orderedIds, currency, convert }) => {
    const { t } = useTranslation();
    const isDark = useThemeStore((s) => s.isDarkMode);
    const colors = isDark ? SLOTS_DARK : SLOTS_LIGHT;

    const stageSlices = useMemo<Slice[]>(() => {
        const make = (key: string, label: string): Slice => ({ key, label, count: 0, amount: 0 });
        const map: Record<string, Slice> = {
            draft: make('draft', t('crmOverview.charts.stageDraft', { defaultValue: 'Taslak' })),
            sent: make('sent', t('crmOverview.charts.stageSent', { defaultValue: 'E-posta gönderildi' })),
            ordered: make('ordered', t('crmOverview.charts.stageOrdered', { defaultValue: 'Sipariş oluşturuldu' })),
        };
        for (const tender of tenders) {
            const slice = map[offerStage(tender, orderedIds)];
            slice.count += 1;
            slice.amount += convert(tender.grandTotal || 0, tender.currency);
        }
        return Object.values(map);
    }, [tenders, orderedIds, convert, t]);

    const orderSlices = useMemo<Slice[]>(() => {
        const byStatus = new Map<string, Slice>();
        for (const order of orders) {
            const key = order.status || 'OTHER';
            if (!byStatus.has(key)) byStatus.set(key, { key, label: key, count: 0, amount: 0 });
            const slice = byStatus.get(key)!;
            slice.count += 1;
            slice.amount += convert(order.totalAmount || 0, 'CHF');
        }
        // Fixed alphabetical order so a filter change never repaints survivors.
        const rows = [...byStatus.values()].sort((a, b) => a.key.localeCompare(b.key));
        if (rows.length <= 4) return rows;
        const top = rows.slice(0, 3);
        const rest = rows.slice(3);
        return [
            ...top,
            {
                key: 'other',
                label: t('crmOverview.charts.other', { defaultValue: 'Diğer' }),
                count: rest.reduce((a, r) => a + r.count, 0),
                amount: rest.reduce((a, r) => a + r.amount, 0),
            },
        ];
    }, [orders, convert, t]);

    const mailSlices = useMemo<Slice[]>(() => {
        const open = tenders.filter((tender) => isOfferOpen(tender, orderedIds));
        const sent: Slice = { key: 'mailed', label: t('crmOverview.charts.mailed', { defaultValue: 'E-posta ile gönderildi' }), count: 0, amount: 0 };
        const notSent: Slice = { key: 'notMailed', label: t('crmOverview.charts.notMailed', { defaultValue: 'Henüz gönderilmedi' }), count: 0, amount: 0 };
        for (const tender of open) {
            const slice = tender.offerMailSentAt ? sent : notSent;
            slice.count += 1;
            slice.amount += convert(tender.grandTotal || 0, tender.currency);
        }
        return [sent, notSent];
    }, [tenders, orderedIds, convert, t]);

    return (
        <OverviewCard
            title={t('crmOverview.charts.title', { defaultValue: 'Teklif ve sipariş analizi' })}
            subtitle={t('crmOverview.charts.clickHint', { defaultValue: 'Detay için bir dilime veya etikete tıklayın' })}
            icon={<PieChart03 size={16} />}
            bodyClassName="pt-3"
        >
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3 2xl:gap-8">
                <Donut
                    title={t('crmOverview.charts.stagesTitle', { defaultValue: 'Teklif aşamaları' })}
                    subtitle={t('crmOverview.charts.stagesSubtitle', { defaultValue: 'Tüm teklifler' })}
                    slices={stageSlices}
                    colors={colors}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOffers', { defaultValue: 'Teklif' })}
                />
                <Donut
                    title={t('crmOverview.charts.ordersTitle', { defaultValue: 'Sipariş durumu' })}
                    subtitle={t('crmOverview.charts.ordersSubtitle', { defaultValue: 'Taslak ve aktif siparişler' })}
                    slices={orderSlices}
                    colors={colors}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOrders', { defaultValue: 'Sipariş' })}
                />
                <Donut
                    title={t('crmOverview.charts.mailTitle', { defaultValue: 'E-posta ile gönderim' })}
                    subtitle={t('crmOverview.charts.mailSubtitle', { defaultValue: 'Açık teklifler' })}
                    slices={mailSlices}
                    colors={colors}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOpen', { defaultValue: 'Açık' })}
                />
            </div>
        </OverviewCard>
    );
};
