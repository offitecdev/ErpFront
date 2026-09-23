import React, { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import type { DashboardMonthlyPoint } from '../../lib/api/dashboard';
import { SwiftDonut, SwiftSplit } from '../charts/swiftChart';
import { SWIFT_COLORS, capsuleBarPath, niceMax, useElementBox, type SwiftMode } from '../charts/swiftChartCore';

/* The dashboard's charts in the Swift Charts idiom (10.09.2026) — see
   components/charts/swiftChart.tsx for the rules. The palette is the iOS
   system set: blue leads, orange is the second series, red is the reserved
   attention accent (open receivables) and the remainder wears the track grey.
   Validated with the dataviz six-checks validator against #ffffff / #1c1c1e:
   blue/orange pass every check; the orange's contrast on white is relieved by
   the legend figures and the annotation.

   21.09.2026 — the bars follow Samet's reference (barchart.png): capsule
   marks with both ends rounded, wide and few to the group, dotted rules
   between the categories, solid gridlines and the value axis trailing. */
export const CHART_PALETTE = {
    light: { navy: SWIFT_COLORS.light.blue, orange: SWIFT_COLORS.light.orange, red: SWIFT_COLORS.light.red, rest: SWIFT_COLORS.light.rest, gray: SWIFT_COLORS.light.gray },
    dark: { navy: SWIFT_COLORS.dark.blue, orange: SWIFT_COLORS.dark.orange, red: SWIFT_COLORS.dark.red, rest: SWIFT_COLORS.dark.rest, gray: SWIFT_COLORS.dark.gray },
} as const;

export type ChartMode = SwiftMode;

/** Swiss francs, whole numbers — the dashboard's compact money format. */
export const chf0 = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(value);

/** Auto-compact figure for stat tiles (1'284 / 12.9k / 1.2 Mio.). */
export const compactNumber = (value: number) =>
    new Intl.NumberFormat('de-CH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

/* The plot grows with its card — this is the floor, not the height. */
const CHART_MIN_H = 248;
/* The value axis sits on the TRAILING side, as Swift draws it. */
const PAD = { top: 14, bottom: 30, left: 8, right: 46 };
/* Capsules want room: a group is at most this share of its month's slot. */
const GROUP_SHARE = 0.62;
const BAR_GAP = 3;
const BAR_MAX = 24;
const BAR_MIN = 5;

/** The four series the monthly history can draw. */
export type MonthlyKey = 'tenders' | 'orders' | 'orderValue' | 'invoiced';

export interface MonthlySeries {
    key: MonthlyKey;
    label: string;
    color: string;
}

interface MonthlyChartProps {
    points: DashboardMonthlyPoint[];
    mode: ChartMode;
    /** Which lines are drawn — the section's filter decides ([[salesFilters]]). */
    series?: MonthlySeries[];
    /** How a figure reads in the legend, the callout and the detail line. */
    format?: (value: number) => string;
    /** How the trailing value axis reads. */
    axisFormat?: (value: number) => string;
    /** Spoken title of the chart. */
    title?: string;
}

const defaultAxisFormat = (value: number) =>
    (Number.isInteger(value) ? String(value) : String(Math.round(value * 10) / 10));

/**
 * The monthly history as capsule bars, one group per month. Hovering a month
 * lights its slot and shows the annotation; clicking pins the month (it keeps
 * full colour, the rest fade) and a detail line with the money figures opens
 * underneath.
 */
export const MonthlyBarChart: React.FC<MonthlyChartProps> = ({ points, mode, series, format, axisFormat, title }) => {
    const { t } = useTranslation();
    const { ref, width, height } = useElementBox();
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const colors = CHART_PALETTE[mode];
    // A gradient id per chart instance; the colons React puts in useId() have
    // no business inside url(#…).
    const gid = useId().replace(/:/g, '');

    const lines: MonthlySeries[] = series && series.length > 0 ? series : [
        { key: 'tenders', label: t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' }), color: colors.navy },
        { key: 'orders', label: t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' }), color: colors.orange },
    ];
    const readValue = (point: DashboardMonthlyPoint, key: MonthlyKey) => point[key] ?? 0;
    const figure = format ?? ((value: number) => String(value));
    const axis = axisFormat ?? defaultAxisFormat;
    const chartTitle = title ?? t('dash.monthly.title', { defaultValue: 'Angebote & Aufträge — 12 Monate' });

    // The drawn keys as one string — the series array is rebuilt on every
    // render, its contents are not.
    const seriesKeys = lines.map((line) => line.key).join();
    const yMax = useMemo(
        () => niceMax(Math.max(0, ...points.map((point) => Math.max(...lines.map((line) => readValue(point, line.key)))))),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [points, seriesKeys],
    );

    const chartH = Math.max(CHART_MIN_H, Math.round(height));
    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = chartH - PAD.top - PAD.bottom;
    const baseline = PAD.top + plotH;
    const slotW = points.length > 0 ? plotW / points.length : 0;
    const barW = Math.min(
        BAR_MAX,
        Math.max(BAR_MIN, (slotW * GROUP_SHARE - BAR_GAP * (lines.length - 1)) / lines.length),
    );
    const groupW = barW * lines.length + BAR_GAP * (lines.length - 1);
    const y = (value: number) => PAD.top + plotH * (1 - value / yMax);
    const labelStep = slotW < 34 ? 2 : 1;

    const hovered = hoverIdx != null ? points[hoverIdx] : null;
    const selected = selectedIdx != null ? points[selectedIdx] : null;
    const monthShort = (m: string) => dayjs(`${m}-01`).format('MMM');
    const monthLong = (m: string) => dayjs(`${m}-01`).format('MMMM YYYY');

    if (points.length === 0) {
        return <div className="ofi-swc ofi-swc-empty ofi-home-empty">{t('dash.noData', { defaultValue: 'Keine Daten' })}</div>;
    }

    return (
        <div className={`ofi-swc ofi-swc-bars ${selectedIdx != null ? 'is-picking' : ''}`}>
            <div className="ofi-swc-legendline">
                {lines.map((line) => (
                    <span key={line.key}><i className="ofi-swc-swatch" style={{ background: line.color }} />{line.label}</span>
                ))}
            </div>

            <div ref={ref} className="ofi-swc-bars__plot" onMouseLeave={() => setHoverIdx(null)}>
                {width > 0 && (
                    <svg width={width} height={chartH} role="img" aria-label={chartTitle}>
                        <defs>
                            {/* A capsule catches the light at its cap — the fill
                                lightens a touch towards the baseline. */}
                            {lines.map((line) => (
                                <linearGradient key={line.key} id={`${gid}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0" stopColor={line.color} stopOpacity="1" />
                                    <stop offset="1" stopColor={line.color} stopOpacity="0.78" />
                                </linearGradient>
                            ))}
                        </defs>

                        {[0, 1, 2, 3, 4].map((i) => {
                            const value = (yMax * i) / 4;
                            const yy = PAD.top + plotH * (1 - value / yMax);
                            return (
                                <g key={i}>
                                    <line className={i === 0 ? 'ofi-swc-bars__baseline' : 'ofi-swc-bars__grid'}
                                        x1={PAD.left} x2={width - PAD.right} y1={yy} y2={yy} />
                                    <text className="ofi-swc-bars__axis" x={width - PAD.right + 9} y={yy + 3.5} textAnchor="start">
                                        {axis(value)}
                                    </text>
                                </g>
                            );
                        })}

                        {/* Dotted rules part the months, the way the reference
                            separates its categories. */}
                        {points.map((point, i) => (
                            i === 0 ? null : (
                                <line key={`sep-${point.month}`} className="ofi-swc-bars__sep"
                                    x1={PAD.left + slotW * i} x2={PAD.left + slotW * i}
                                    y1={PAD.top - 2} y2={baseline} />
                            )
                        ))}
                        <line className="ofi-swc-bars__sep"
                            x1={width - PAD.right} x2={width - PAD.right} y1={PAD.top - 2} y2={baseline} />

                        {hoverIdx != null && (
                            <rect className="ofi-swc-bars__slot"
                                x={PAD.left + slotW * hoverIdx + 2} y={PAD.top - 2}
                                width={Math.max(0, slotW - 4)} height={plotH + 2} rx="9" />
                        )}

                        {points.map((point, i) => {
                            const slotX = PAD.left + slotW * i;
                            const x0 = slotX + (slotW - groupW) / 2;
                            const active = selectedIdx === i;
                            return (
                                <g key={point.month}>
                                    {lines.map((line, index) => {
                                        const value = readValue(point, line.key);
                                        const top = y(value);
                                        const height = baseline - top;
                                        if (height <= 0.4) return null;
                                        return (
                                            <path key={line.key}
                                                className={`ofi-swc-bars__bar ${active ? 'is-active' : ''}`}
                                                d={capsuleBarPath(x0 + (barW + BAR_GAP) * index, top, barW, height)}
                                                fill={`url(#${gid}-${line.key})`} />
                                        );
                                    })}
                                    {i % labelStep === 0 && (
                                        <text className="ofi-swc-bars__axis" x={slotX + slotW / 2} y={chartH - 10} textAnchor="middle">
                                            {monthShort(point.month)}
                                        </text>
                                    )}
                                    <rect className="ofi-swc-bars__hit" x={slotX} y={PAD.top} width={slotW} height={plotH + 18} fill="transparent"
                                        tabIndex={0} role="button"
                                        aria-label={`${monthLong(point.month)}: ${lines.map((line) => `${figure(readValue(point, line.key))} ${line.label}`).join(', ')}`}
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
                            return center < width / 2 ? center + 14 : center - 162;
                        })(),
                    }}>
                        <div className="ofi-swc-callout__title">{monthLong(hovered.month)}</div>
                        {lines.map((line) => (
                            <div key={line.key} className="ofi-swc-callout__row">
                                <i className="ofi-swc-swatch" style={{ background: line.color }} />
                                <b>{figure(readValue(hovered, line.key))}</b>
                                <span>{line.label}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {selected && (
                <div className="ofi-swc-detail">
                    <b>{monthLong(selected.month)}</b>
                    <span><b>{selected.tenders}</b> {t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' })}</span>
                    <span><b>{selected.orders}</b> {t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' })}</span>
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
            animate={false}
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
            animate={false}
            segments={segments}
            format={format}
            emptyLabel={t('dash.noData', { defaultValue: 'Keine Daten' })}
            caption={total > 0 ? `${t('dash.total', { defaultValue: 'Total' })} ${format(total)}` : undefined}
        />
    );
};
