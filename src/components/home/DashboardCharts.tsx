import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { DashboardMonthlyPoint } from '../../lib/api/dashboard';
import { SwiftDonut, SwiftSplit } from '../charts/swiftChart';
import { SWIFT_COLORS, barPath, niceMax, useElementWidth, useFirstReveal, useProgress, type SwiftMode } from '../charts/swiftChartCore';

/* The dashboard's charts in the Swift Charts idiom (10.09.2026) — see
   components/charts/swiftChart.tsx for the rules. The palette is the iOS
   system set: blue leads, orange is the second series, red is the reserved
   attention accent (open receivables) and the remainder wears the track grey.
   Validated with the dataviz six-checks validator against #ffffff / #1c1c1e:
   blue/orange pass every check; the orange's contrast on white is relieved by
   the legend figures and the annotation. */
export const CHART_PALETTE = {
    light: { navy: SWIFT_COLORS.light.blue, orange: SWIFT_COLORS.light.orange, red: SWIFT_COLORS.light.red, rest: SWIFT_COLORS.light.rest },
    dark: { navy: SWIFT_COLORS.dark.blue, orange: SWIFT_COLORS.dark.orange, red: SWIFT_COLORS.dark.red, rest: SWIFT_COLORS.dark.rest },
} as const;

export type ChartMode = SwiftMode;

/** Swiss francs, whole numbers — the dashboard's compact money format. */
export const chf0 = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(value);

/** Auto-compact figure for stat tiles (1'284 / 12.9k / 1.2 Mio.). */
export const compactNumber = (value: number) =>
    new Intl.NumberFormat('de-CH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const CHART_H = 236;
/* The value axis sits on the TRAILING side, as Swift draws it. */
const PAD = { top: 12, bottom: 26, left: 6, right: 40 };

interface MonthlyChartProps {
    points: DashboardMonthlyPoint[];
    mode: ChartMode;
}

/**
 * 12-month grouped bars: quotes (blue) vs orders (orange). Hovering a month
 * drops a dashed rule through it and shows the annotation; clicking pins the
 * month (it keeps full colour, the rest fade) and a detail line with the
 * money figures opens underneath.
 */
export const MonthlyBarChart: React.FC<MonthlyChartProps> = ({ points, mode }) => {
    const { t } = useTranslation();
    const { ref, width } = useElementWidth();
    const [revealRef, shown] = useFirstReveal<HTMLDivElement>();
    const grow = useProgress(shown, 720);
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const colors = CHART_PALETTE[mode];

    const series = [
        { key: 'tenders' as const, label: t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' }), color: colors.navy },
        { key: 'orders' as const, label: t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' }), color: colors.orange },
    ];

    const yMax = useMemo(() => niceMax(Math.max(0, ...points.map((p) => Math.max(p.tenders, p.orders)))), [points]);

    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = CHART_H - PAD.top - PAD.bottom;
    const slotW = points.length > 0 ? plotW / points.length : 0;
    const barW = Math.min(12, Math.max(4, slotW * 0.28));
    const groupW = barW * 2 + 2;
    const y = (v: number) => PAD.top + plotH * (1 - (v * grow) / yMax);
    const labelStep = slotW < 34 ? 2 : 1;

    const hovered = hoverIdx != null ? points[hoverIdx] : null;
    const selected = selectedIdx != null ? points[selectedIdx] : null;
    const monthShort = (m: string) => dayjs(`${m}-01`).format('MMM');
    const monthLong = (m: string) => dayjs(`${m}-01`).format('MMMM YYYY');

    if (points.length === 0) {
        return <div className="ofi-swc ofi-swc-empty ofi-home-empty">{t('dash.noData', { defaultValue: 'Keine Daten' })}</div>;
    }

    return (
        <div ref={revealRef} className={`ofi-swc ofi-swc-bars ${selectedIdx != null ? 'is-picking' : ''}`}>
            <div className="ofi-swc-legendline">
                {series.map((s) => (
                    <span key={s.key}><i className="ofi-swc-swatch" style={{ background: s.color }} />{s.label}</span>
                ))}
            </div>

            <div ref={ref} className="relative" onMouseLeave={() => setHoverIdx(null)}>
                {width > 0 && (
                    <svg width={width} height={CHART_H} role="img"
                        aria-label={t('dash.monthly.title', { defaultValue: 'Angebote & Aufträge — 12 Monate' })}>
                        {[0, 1, 2, 3, 4].map((i) => {
                            const value = (yMax * i) / 4;
                            const yy = PAD.top + plotH * (1 - value / yMax);
                            return (
                                <g key={i}>
                                    <line className={i === 0 ? 'ofi-swc-bars__baseline' : 'ofi-swc-bars__grid'}
                                        x1={PAD.left} x2={width - PAD.right} y1={yy} y2={yy} />
                                    <text className="ofi-swc-bars__axis" x={width - PAD.right + 8} y={yy + 3.5} textAnchor="start">
                                        {value}
                                    </text>
                                </g>
                            );
                        })}

                        {hoverIdx != null && (
                            <line className="ofi-swc-bars__rule"
                                x1={PAD.left + slotW * hoverIdx + slotW / 2} x2={PAD.left + slotW * hoverIdx + slotW / 2}
                                y1={PAD.top} y2={PAD.top + plotH} />
                        )}

                        {points.map((point, i) => {
                            const slotX = PAD.left + slotW * i;
                            const x0 = slotX + (slotW - groupW) / 2;
                            const active = selectedIdx === i;
                            return (
                                <g key={point.month}>
                                    <path className={`ofi-swc-bars__bar ${active ? 'is-active' : ''}`}
                                        d={barPath(x0, y(point.tenders), barW, PAD.top + plotH - y(point.tenders))} fill={colors.navy} />
                                    <path className={`ofi-swc-bars__bar ${active ? 'is-active' : ''}`}
                                        d={barPath(x0 + barW + 2, y(point.orders), barW, PAD.top + plotH - y(point.orders))} fill={colors.orange} />
                                    {i % labelStep === 0 && (
                                        <text className="ofi-swc-bars__axis" x={slotX + slotW / 2} y={CHART_H - 8} textAnchor="middle">
                                            {monthShort(point.month)}
                                        </text>
                                    )}
                                    <rect className="ofi-swc-bars__hit" x={slotX} y={PAD.top} width={slotW} height={plotH + 18} fill="transparent"
                                        tabIndex={0} role="button"
                                        aria-label={`${monthLong(point.month)}: ${point.tenders} ${series[0].label}, ${point.orders} ${series[1].label}`}
                                        aria-pressed={selectedIdx === i}
                                        onMouseEnter={() => setHoverIdx(i)}
                                        onFocus={() => setHoverIdx(i)}
                                        onBlur={() => setHoverIdx((cur) => (cur === i ? null : cur))}
                                        onClick={() => setSelectedIdx((cur) => (cur === i ? null : i))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter' || e.key === ' ') {
                                                e.preventDefault();
                                                setSelectedIdx((cur) => (cur === i ? null : i));
                                            }
                                        }} />
                                </g>
                            );
                        })}
                    </svg>
                )}

                {hovered && hoverIdx != null && width > 0 && (
                    <div className="ofi-swc-callout" style={{
                        top: 0,
                        left: (() => {
                            const center = PAD.left + slotW * hoverIdx + slotW / 2;
                            return center < width / 2 ? center + 14 : center - 146;
                        })(),
                    }}>
                        <div className="ofi-swc-callout__title">{monthLong(hovered.month)}</div>
                        {series.map((s) => (
                            <div key={s.key} className="ofi-swc-callout__row">
                                <i className="ofi-swc-swatch" style={{ background: s.color }} />
                                <b>{hovered[s.key]}</b>
                                <span>{s.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <div className="ofi-swc-detail">
                    <b>{monthLong(selected.month)}</b>
                    <span><b>{selected.tenders}</b> {series[0].label}</span>
                    <span><b>{selected.orders}</b> {series[1].label}</span>
                    <span>{t('dash.monthly.orderValue', { defaultValue: 'Auftragswert' })} <b>{chf0(selected.orderValue)}</b></span>
                    <span>{t('dash.monthly.invoiced', { defaultValue: 'Fakturiert' })} <b>{chf0(selected.invoiced)}</b></span>
                </div>
            )}
        </div>
    );
};

export interface DonutSlice {
    key: string;
    label: string;
    count: number;
    color: string;
}

/** The conversion donut — a SectorMark ring with the legend underneath. */
export const ConversionDonut: React.FC<{
    slices: DonutSlice[];
    centerLabel: string;
    mode: ChartMode;
}> = ({ slices, centerLabel }) => {
    const { t } = useTranslation();
    return (
        <SwiftDonut
            slices={slices.map((slice) => ({ key: slice.key, label: slice.label, value: slice.count, color: slice.color }))}
            centerLabel={centerLabel}
            emptyLabel={t('dash.noData', { defaultValue: 'Keine Daten' })}
            size={172}
            thickness={26}
        />
    );
};

export interface SplitSegment {
    key: string;
    label: string;
    value: number;
    color: string;
}

interface StackedSplitProps {
    segments: SplitSegment[];
    format?: (value: number) => string;
}

/** Part-to-whole bar (the honest pie replacement) in the iOS Storage idiom. */
export const StackedSplit: React.FC<StackedSplitProps> = ({ segments, format = chf0 }) => {
    const { t } = useTranslation();
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    return (
        <SwiftSplit
            segments={segments}
            format={format}
            emptyLabel={t('dash.noData', { defaultValue: 'Keine Daten' })}
            caption={total > 0 ? `${t('dash.total', { defaultValue: 'Total' })} ${format(total)}` : undefined}
        />
    );
};
