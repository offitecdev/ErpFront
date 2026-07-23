import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PieChart, Pie, Cell } from 'recharts';
import { PieChart03 } from '@/components/icons/antIconCompat';
import { useThemeStore } from '../../../../store/themeStore';
import { formatMoney, type CurrencyCode } from '../../../../utils/currency';
import type { TenderListItem } from '../../../../types/tender';
import type { SalesOrderDto } from '../../../../lib/api/project';
import { isOfferOpen, offerStage } from '../overviewShared';
import { OverviewCard } from './OverviewCard';

/* Validated categorical palette (dataviz skill, adjacent-pair CVD ΔE ≥ 8 in both
   modes). Slots are assigned in fixed order per chart, never cycled. */
const SLOTS_LIGHT = ['#2a78d6', '#008300', '#e87ba4', '#eda100'];
const SLOTS_DARK = ['#3987e5', '#008300', '#d55181', '#c98500'];

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

/* Quiet donut: no hover tooltip (hover styling is disabled on purpose) — the
   details appear on CLICK, in the donut hole and the detail line below. */
const Donut: React.FC<{
    title: string;
    subtitle?: string;
    slices: Slice[];
    colors: string[];
    surface: string;
    currency: CurrencyCode;
    centerLabel: string;
}> = ({ title, subtitle, slices, colors, surface, currency, centerLabel }) => {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);

    const total = slices.reduce((acc, s) => acc + s.count, 0);
    const totalAmount = slices.reduce((acc, s) => acc + s.amount, 0);
    const data = slices.filter((s) => s.count > 0);
    const selected = slices.find((s) => s.key === selectedKey && s.count > 0) || null;
    const colorOf = (key: string) => colors[slices.findIndex((s) => s.key === key) % colors.length];

    const toggle = (key: string) => setSelectedKey((cur) => (cur === key ? null : key));

    return (
        <div className="flex min-w-0 flex-1 flex-col">
            <p className="text-[13px] font-semibold text-[#1A1A1A] dark:text-white">{title}</p>
            {subtitle && <p className="text-[11.5px] text-[#98A0AE] dark:text-[#8f95a1]">{subtitle}</p>}

            {total === 0 ? (
                <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-black/10 text-[12.5px] text-[#98A0AE] dark:border-white/15">
                    {t('crmOverview.charts.noData', { defaultValue: 'Veri yok' })}
                </div>
            ) : (
                <>
                    {/* Fixed-size centered chart — no ResponsiveContainer, so recharts
                        never measures a not-yet-laid-out parent (the -1×-1 warning). */}
                    <div className="relative mx-auto h-[240px] w-[240px]">
                        <PieChart width={240} height={240}>
                                <Pie
                                    data={data}
                                    dataKey="count"
                                    nameKey="label"
                                    innerRadius="62%"
                                    outerRadius="92%"
                                    paddingAngle={2}
                                    stroke={surface}
                                    strokeWidth={2}
                                    cornerRadius={4}
                                    animationDuration={700}
                                    onClick={(entry) => {
                                        const key = (entry as { payload?: Slice } | undefined)?.payload?.key;
                                        if (key) toggle(key);
                                    }}
                                    style={{ cursor: 'pointer', outline: 'none' }}
                                >
                                    {data.map((slice) => (
                                        <Cell
                                            key={slice.key}
                                            fill={colorOf(slice.key)}
                                            // Selection is the only visual state — no hover effect.
                                            fillOpacity={selected && selected.key !== slice.key ? 0.35 : 1}
                                            style={{ outline: 'none', transition: 'fill-opacity 200ms' }}
                                        />
                                    ))}
                                </Pie>
                        </PieChart>
                        {/* Donut hole: totals by default, the clicked slice's details when selected */}
                        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-6 text-center">
                            {selected ? (
                                <>
                                    <span className="text-[26px] font-bold leading-none tabular-nums" style={{ color: colorOf(selected.key) }}>
                                        {selected.count}
                                    </span>
                                    <span className="mt-0.5 max-w-full truncate text-[10.5px] font-medium text-[#6B7280] dark:text-[#aab0bb]">
                                        {selected.label}
                                    </span>
                                    <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#1A1A1A] dark:text-white">
                                        {formatMoney(selected.amount, currency)}
                                    </span>
                                    <span className="text-[10px] tabular-nums text-[#98A0AE]">
                                        %{total ? Math.round((selected.count / total) * 100) : 0}
                                    </span>
                                </>
                            ) : (
                                <>
                                    <span className="text-[26px] font-bold leading-none tabular-nums text-[#1A1A1A] dark:text-white">{total}</span>
                                    <span className="mt-0.5 text-[10.5px] font-medium uppercase tracking-wide text-[#98A0AE]">{centerLabel}</span>
                                    <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#6B7280] dark:text-[#aab0bb]">
                                        {formatMoney(totalAmount, currency)}
                                    </span>
                                </>
                            )}
                        </div>
                    </div>

                    {/* Quiet legend: identity + count only; amounts live in the click detail */}
                    <ul className="mt-1 flex flex-col gap-0.5">
                        {slices.map((slice) => (
                            <li key={slice.key}>
                                <button
                                    type="button"
                                    onClick={() => toggle(slice.key)}
                                    aria-pressed={selectedKey === slice.key}
                                    className={`flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12px] transition-colors ${
                                        selectedKey === slice.key ? 'bg-black/5 dark:bg-white/8' : ''
                                    }`}
                                >
                                    <span className="size-2.5 shrink-0 rounded-[4px]" style={{ background: colorOf(slice.key) }} />
                                    <span className="min-w-0 flex-1 truncate text-[#3F4350] dark:text-[#d9dce3]">{slice.label}</span>
                                    <span className="shrink-0 tabular-nums font-semibold text-[#1A1A1A] dark:text-white">{slice.count}</span>
                                </button>
                            </li>
                        ))}
                    </ul>
                </>
            )}
        </div>
    );
};

/** Three animated donuts: offer stages, order pipeline, offers e-mailed. */
export const PipelineCharts: React.FC<PipelineChartsProps> = ({ tenders, orders, orderedIds, currency, convert }) => {
    const { t } = useTranslation();
    const isDark = useThemeStore((s) => s.isDarkMode);
    const colors = isDark ? SLOTS_DARK : SLOTS_LIGHT;
    const surface = isDark ? '#151616' : '#ffffff';

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
                    surface={surface}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOffers', { defaultValue: 'Teklif' })}
                />
                <Donut
                    title={t('crmOverview.charts.ordersTitle', { defaultValue: 'Sipariş durumu' })}
                    subtitle={t('crmOverview.charts.ordersSubtitle', { defaultValue: 'Taslak ve aktif siparişler' })}
                    slices={orderSlices}
                    colors={colors}
                    surface={surface}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOrders', { defaultValue: 'Sipariş' })}
                />
                <Donut
                    title={t('crmOverview.charts.mailTitle', { defaultValue: 'E-posta ile gönderim' })}
                    subtitle={t('crmOverview.charts.mailSubtitle', { defaultValue: 'Açık teklifler' })}
                    slices={mailSlices}
                    colors={colors}
                    surface={surface}
                    currency={currency}
                    centerLabel={t('crmOverview.charts.centerOpen', { defaultValue: 'Açık' })}
                />
            </div>
        </OverviewCard>
    );
};
