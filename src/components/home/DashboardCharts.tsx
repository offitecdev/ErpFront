import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';
import { cx } from '../../lib/utils/cx';
import type { DashboardMonthlyPoint } from '../../lib/api/dashboard';

/* Hand-rolled chart marks — plain TypeScript + SVG/CSS, no chart library.
   Palette validated with the dataviz six-checks validator against the real
   card surfaces (#ffffff light, #151616 dark): lightness band, chroma floor,
   CVD separation and the normal-vision floor pass in both modes. Navy leads,
   orange is the second series; red is the reserved attention accent and never
   sits next to orange in a chart (the warm pair misses the normal-vision
   floor inside the dark lightness band). Remainders wear de-emphasis gray. */
export const CHART_PALETTE = {
    light: { navy: '#3e4b91', orange: '#e5730b', red: '#d30f15', rest: '#d8dbe3', grid: '#eceef2', baseline: '#d5d7db', axis: '#98A0AE' },
    dark: { navy: '#6977c7', orange: '#d47016', red: '#e5484d', rest: '#3a3b3e', grid: '#26272a', baseline: '#3a3b3e', axis: '#8f95a1' },
} as const;

export type ChartMode = keyof typeof CHART_PALETTE;

/** Swiss francs, whole numbers — the dashboard's compact money format. */
export const chf0 = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 0 }).format(value);

/** Auto-compact figure for stat tiles (1'284 / 12.9k / 1.2 Mio.). */
export const compactNumber = (value: number) =>
    new Intl.NumberFormat('de-CH', { notation: 'compact', maximumFractionDigits: 1 }).format(value);

const useElementWidth = () => {
    const ref = useRef<HTMLDivElement>(null);
    const [width, setWidth] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new ResizeObserver((entries) => setWidth(entries[0]?.contentRect.width ?? 0));
        observer.observe(el);
        setWidth(el.clientWidth);
        return () => observer.disconnect();
    }, []);
    return { ref, width };
};

/** Bar with a 4px rounded data-end and a square baseline end. */
const roundedTopRect = (x: number, y: number, w: number, h: number) => {
    if (h <= 0) return '';
    const r = Math.min(4, w / 2, h);
    return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
};

const CHART_H = 240;
const PAD = { top: 14, bottom: 24, left: 38, right: 10 };

interface MonthlyChartProps {
    points: DashboardMonthlyPoint[];
    mode: ChartMode;
}

/**
 * 12-month grouped bar chart: quotes (navy) vs orders (orange). Hovering a
 * month lifts it and shows the tooltip; clicking selects the month — it keeps
 * full color while the rest dim, and a detail line with the money figures
 * expands underneath (the same click-to-detail contract as the CRM donuts).
 */
export const MonthlyBarChart: React.FC<MonthlyChartProps> = ({ points, mode }) => {
    const { t } = useTranslation();
    const { ref, width } = useElementWidth();
    const [hoverIdx, setHoverIdx] = useState<number | null>(null);
    const [selectedIdx, setSelectedIdx] = useState<number | null>(null);
    const colors = CHART_PALETTE[mode];

    const series = [
        { key: 'tenders' as const, label: t('dash.monthly.seriesQuotes', { defaultValue: 'Angebote' }), color: colors.navy },
        { key: 'orders' as const, label: t('dash.monthly.seriesOrders', { defaultValue: 'Aufträge' }), color: colors.orange },
    ];

    const yMax = useMemo(() => {
        const raw = Math.max(0, ...points.map((p) => Math.max(p.tenders, p.orders)));
        return Math.max(4, Math.ceil(raw / 4) * 4);
    }, [points]);

    const plotW = Math.max(0, width - PAD.left - PAD.right);
    const plotH = CHART_H - PAD.top - PAD.bottom;
    const slotW = points.length > 0 ? plotW / points.length : 0;
    const barW = Math.min(10, Math.max(4, slotW * 0.26));
    const groupW = barW * 2 + 2;
    const y = (v: number) => PAD.top + plotH * (1 - v / yMax);
    const labelStep = slotW < 32 ? 2 : 1;

    const hovered = hoverIdx != null ? points[hoverIdx] : null;
    const selected = selectedIdx != null ? points[selectedIdx] : null;
    const monthShort = (m: string) => dayjs(`${m}-01`).format('MMM');
    const monthLong = (m: string) => dayjs(`${m}-01`).format('MMMM YYYY');

    if (points.length === 0) {
        return (
            <div className="flex h-[240px] items-center justify-center rounded-xl border border-dashed border-black/10 text-[12.5px] text-[#98A0AE] dark:border-white/15">
                {t('dash.noData', { defaultValue: 'Keine Daten' })}
            </div>
        );
    }

    return (
        <div>
            {/* Legend — always present for two series; swatches mirror the marks. */}
            <div className="mb-2 flex items-center justify-end gap-4">
                {series.map((s) => (
                    <span key={s.key} className="flex items-center gap-1.5 text-[12px] text-[#6B7280] dark:text-[#aab0bb]">
                        <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
                        {s.label}
                    </span>
                ))}
            </div>

            <div ref={ref} className="relative" onMouseLeave={() => setHoverIdx(null)}>
                {width > 0 && (
                    <svg width={width} height={CHART_H} role="img"
                        aria-label={t('dash.monthly.title', { defaultValue: 'Angebote & Aufträge — 12 Monate' })}>
                        {/* Hairline solid gridlines + y ticks (clean quarters of the max) */}
                        {[0, 1, 2, 3, 4].map((i) => {
                            const value = (yMax * i) / 4;
                            const yy = y(value);
                            return (
                                <g key={i}>
                                    <line x1={PAD.left} x2={width - PAD.right} y1={yy} y2={yy}
                                        stroke={i === 0 ? colors.baseline : colors.grid} strokeWidth={1} />
                                    <text x={PAD.left - 6} y={yy + 3.5} textAnchor="end" fontSize={10.5}
                                        fill={colors.axis} className="tabular-nums">
                                        {value}
                                    </text>
                                </g>
                            );
                        })}

                        {points.map((point, i) => {
                            const slotX = PAD.left + slotW * i;
                            const x0 = slotX + (slotW - groupW) / 2;
                            const dimmed = selectedIdx != null && selectedIdx !== i;
                            return (
                                <g key={point.month}>
                                    {hoverIdx === i && (
                                        <rect x={slotX} y={PAD.top} width={slotW} height={plotH}
                                            fill={mode === 'dark' ? 'rgba(255,255,255,0.05)' : 'rgba(31,38,84,0.05)'} />
                                    )}
                                    <path d={roundedTopRect(x0, y(point.tenders), barW, PAD.top + plotH - y(point.tenders))}
                                        fill={colors.navy} fillOpacity={dimmed ? 0.35 : 1} style={{ transition: 'fill-opacity 200ms' }} />
                                    <path d={roundedTopRect(x0 + barW + 2, y(point.orders), barW, PAD.top + plotH - y(point.orders))}
                                        fill={colors.orange} fillOpacity={dimmed ? 0.35 : 1} style={{ transition: 'fill-opacity 200ms' }} />
                                    {i % labelStep === 0 && (
                                        <text x={slotX + slotW / 2} y={CHART_H - 7} textAnchor="middle" fontSize={10.5}
                                            fill={colors.axis}>
                                            {monthShort(point.month)}
                                        </text>
                                    )}
                                    {/* Hit target: the whole month slot, far bigger than the marks. */}
                                    <rect x={slotX} y={PAD.top} width={slotW} height={plotH + 18} fill="transparent"
                                        style={{ cursor: 'pointer' }} tabIndex={0} role="button"
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

                {/* One tooltip, every series — values lead, line-keys follow. */}
                {hovered && hoverIdx != null && width > 0 && (
                    <div className="pointer-events-none absolute top-2 z-10 w-[150px] rounded-lg border border-black/8 bg-white/95 px-3 py-2 shadow-[0_4px_16px_rgba(16,24,40,0.12)] dark:border-white/10 dark:bg-[#1d1f22]/95"
                        style={{
                            left: (() => {
                                const center = PAD.left + slotW * hoverIdx + slotW / 2;
                                return center < width / 2 ? center + 12 : center - 162;
                            })(),
                        }}>
                        <p className="text-[11px] font-medium text-[#98A0AE] dark:text-[#8f95a1]">{monthLong(hovered.month)}</p>
                        {series.map((s) => (
                            <p key={s.key} className="mt-0.5 flex items-center gap-1.5 text-[12px]">
                                <span className="h-[3px] w-3 rounded-full" style={{ background: s.color }} />
                                <span className="font-bold tabular-nums text-[#1A1A1A] dark:text-white">{hovered[s.key]}</span>
                                <span className="truncate text-[#6B7280] dark:text-[#aab0bb]">{s.label}</span>
                            </p>
                        ))}
                    </div>
                )}
            </div>

            {/* Click-detail: the "expanded" month with its money figures. */}
            {selected && (
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1 rounded-lg bg-[#F4F5F7] px-3.5 py-2.5 text-[12.5px] dark:bg-white/6">
                    <span className="font-semibold text-[#1A1A1A] dark:text-white">{monthLong(selected.month)}</span>
                    <span className="text-[#3F4350] dark:text-[#d9dce3]">
                        <span className="font-bold tabular-nums">{selected.tenders}</span> {series[0].label}
                    </span>
                    <span className="text-[#3F4350] dark:text-[#d9dce3]">
                        <span className="font-bold tabular-nums">{selected.orders}</span> {series[1].label}
                    </span>
                    <span className="text-[#3F4350] dark:text-[#d9dce3]">
                        {t('dash.monthly.orderValue', { defaultValue: 'Auftragswert' })}{' '}
                        <span className="font-bold tabular-nums">{chf0(selected.orderValue)}</span>
                    </span>
                    <span className="text-[#3F4350] dark:text-[#d9dce3]">
                        {t('dash.monthly.invoiced', { defaultValue: 'Fakturiert' })}{' '}
                        <span className="font-bold tabular-nums">{chf0(selected.invoiced)}</span>
                    </span>
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

/** Donut slice between angles a0→a1 (radians), inner r0 / outer r1. */
const arcPath = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) => {
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const px = (r: number, a: number) => `${cx + r * Math.cos(a)} ${cy + r * Math.sin(a)}`;
    return `M ${px(r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${px(r1, a1)} L ${px(r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${px(r0, a0)} Z`;
};

const DONUT_SIZE = 210;
const DONUT_R0 = 62;
const DONUT_R1 = 90;

/**
 * Interactive donut, hand-rolled SVG. Hovering (or focusing) a slice slides it
 * outward along its mid-angle and puts its numbers in the hole; clicking pins
 * the slice (the pinned slice keeps full color, the rest dim). The legend rows
 * below carry every count, so the chart never gates a value.
 */
export const ConversionDonut: React.FC<{
    slices: DonutSlice[];
    centerLabel: string;
    mode: ChartMode;
}> = ({ slices, centerLabel, mode }) => {
    const { t } = useTranslation();
    const [hoverKey, setHoverKey] = useState<string | null>(null);
    const [pinnedKey, setPinnedKey] = useState<string | null>(null);

    const surface = mode === 'dark' ? '#151616' : '#ffffff';
    const total = slices.reduce((sum, s) => sum + s.count, 0);
    const visible = slices.filter((s) => s.count > 0);
    const activeKey = hoverKey ?? pinnedKey;
    const active = slices.find((s) => s.key === activeKey && s.count > 0) || null;
    const share = (count: number) => (total > 0 ? Math.round((count / total) * 100) : 0);
    const togglePin = (key: string) => setPinnedKey((cur) => (cur === key ? null : key));

    if (total <= 0) {
        return (
            <div className="flex h-[210px] items-center justify-center rounded-xl border border-dashed border-black/10 text-[12.5px] text-[#98A0AE] dark:border-white/15">
                {t('dash.noData', { defaultValue: 'Keine Daten' })}
            </div>
        );
    }

    const c = DONUT_SIZE / 2;
    let angle = -Math.PI / 2;
    const arcs = visible.map((slice) => {
        const sweep = (slice.count / total) * Math.PI * 2;
        // A lone 100% slice would close on its own start point — clamp just short.
        const a0 = angle;
        const a1 = angle + Math.min(sweep, Math.PI * 2 - 0.0001);
        angle += sweep;
        return { slice, a0, a1, mid: (a0 + a1) / 2 };
    });

    return (
        <div>
            <div className="relative mx-auto" style={{ width: DONUT_SIZE, height: DONUT_SIZE }} onMouseLeave={() => setHoverKey(null)}>
                <svg width={DONUT_SIZE} height={DONUT_SIZE} role="img" aria-label={centerLabel}>
                    {arcs.map(({ slice, a0, a1, mid }) => {
                        const expanded = activeKey === slice.key;
                        const dimmed = pinnedKey != null && pinnedKey !== slice.key;
                        return (
                            <path
                                key={slice.key}
                                d={arcPath(c, c, DONUT_R0, DONUT_R1, a0, a1)}
                                fill={slice.color}
                                fillOpacity={dimmed ? 0.35 : 1}
                                stroke={surface}
                                strokeWidth={2}
                                tabIndex={0}
                                role="button"
                                aria-pressed={pinnedKey === slice.key}
                                aria-label={`${slice.label}: ${slice.count} (${share(slice.count)}%)`}
                                style={{
                                    cursor: 'pointer',
                                    outline: 'none',
                                    transition: 'transform 200ms ease, fill-opacity 200ms',
                                    transform: expanded ? `translate(${Math.cos(mid) * 7}px, ${Math.sin(mid) * 7}px)` : 'translate(0, 0)',
                                }}
                                onMouseEnter={() => setHoverKey(slice.key)}
                                onFocus={() => setHoverKey(slice.key)}
                                onBlur={() => setHoverKey((cur) => (cur === slice.key ? null : cur))}
                                onClick={() => togglePin(slice.key)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        togglePin(slice.key);
                                    }
                                }}
                            />
                        );
                    })}
                </svg>
                {/* Donut hole: totals by default, the active slice's numbers on hover/pin */}
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8 text-center">
                    {active ? (
                        <>
                            <span className="ofi-dashboard-number text-[26px] font-bold leading-none text-[#1A1A1A] dark:text-white">{active.count}</span>
                            <span className="mt-1 max-w-full truncate text-[10.5px] font-medium text-[#6B7280] dark:text-[#aab0bb]">{active.label}</span>
                            <span className="mt-0.5 text-[11px] font-semibold tabular-nums text-[#98A0AE]">{share(active.count)}%</span>
                        </>
                    ) : (
                        <>
                            <span className="ofi-dashboard-number text-[26px] font-bold leading-none text-[#1A1A1A] dark:text-white">{total}</span>
                            <span className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-[#98A0AE]">{centerLabel}</span>
                        </>
                    )}
                </div>
            </div>

            {/* Direct labels: identity + count + share, readable without hover. */}
            <ul className="mt-3 flex flex-col gap-0.5">
                {slices.map((slice) => {
                    const pinned = pinnedKey === slice.key;
                    return (
                        <li key={slice.key}>
                            <button
                                type="button"
                                onClick={() => slice.count > 0 && togglePin(slice.key)}
                                onMouseEnter={() => slice.count > 0 && setHoverKey(slice.key)}
                                onMouseLeave={() => setHoverKey(null)}
                                aria-pressed={pinned}
                                className={cx(
                                    'group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12.5px] transition-colors',
                                    pinned && 'bg-black/5 dark:bg-white/8',
                                    slice.count === 0 && 'cursor-default opacity-50',
                                )}
                            >
                                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: slice.color }} />
                                <span className={cx(
                                    'min-w-0 flex-1 truncate text-[#3F4350] underline-offset-4 dark:text-[#d9dce3]',
                                    slice.count > 0 && 'group-hover:underline',
                                )}>
                                    {slice.label}
                                </span>
                                <span className="shrink-0 text-[11.5px] tabular-nums text-[#98A0AE]">{share(slice.count)}%</span>
                                <span className="w-10 shrink-0 text-right font-semibold tabular-nums text-[#1A1A1A] dark:text-white">{slice.count}</span>
                            </button>
                        </li>
                    );
                })}
            </ul>
        </div>
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
    /** Formats a segment value for the legend rows and the detail line. */
    format?: (value: number) => string;
}

/**
 * Horizontal part-to-whole bar (the honest pie replacement): segments in the
 * validated palette, separated by 2px surface gaps. Clicking a segment or its
 * legend row expands the segment (it grows taller, the rest dim) and shows a
 * share detail. Values are always visible in the rows — the bar never gates.
 */
export const StackedSplit: React.FC<StackedSplitProps> = ({ segments, format = chf0 }) => {
    const { t } = useTranslation();
    const [selectedKey, setSelectedKey] = useState<string | null>(null);
    const [hoverKey, setHoverKey] = useState<string | null>(null);

    const total = segments.reduce((sum, s) => sum + s.value, 0);
    const visible = segments.filter((s) => s.value > 0);
    const selected = segments.find((s) => s.key === selectedKey && s.value > 0) || null;
    const toggle = (key: string) => setSelectedKey((cur) => (cur === key ? null : key));
    const share = (v: number) => (total > 0 ? Math.round((v / total) * 100) : 0);

    if (total <= 0) {
        return (
            <div className="flex h-[96px] items-center justify-center rounded-xl border border-dashed border-black/10 text-[12.5px] text-[#98A0AE] dark:border-white/15">
                {t('dash.noData', { defaultValue: 'Keine Daten' })}
            </div>
        );
    }

    return (
        <div>
            {/* 2px surface gaps do the separating — no strokes around marks. */}
            <div className="flex h-9 items-center gap-[2px]">
                {visible.map((segment) => {
                    const active = selectedKey === segment.key;
                    const dimmed = selectedKey != null && !active;
                    return (
                        <button
                            key={segment.key}
                            type="button"
                            onClick={() => toggle(segment.key)}
                            onMouseEnter={() => setHoverKey(segment.key)}
                            onMouseLeave={() => setHoverKey(null)}
                            aria-pressed={active}
                            aria-label={`${segment.label}: ${format(segment.value)} (${share(segment.value)}%)`}
                            title={`${segment.label} · ${format(segment.value)}`}
                            className={cx(
                                'min-w-[10px] rounded-[3px] transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#272f67]/40',
                                active ? 'h-9' : 'h-5',
                                hoverKey === segment.key && !active && 'h-7',
                            )}
                            style={{
                                flexGrow: segment.value,
                                flexBasis: 0,
                                background: segment.color,
                                opacity: dimmed ? 0.35 : 1,
                            }}
                        />
                    );
                })}
            </div>

            {/* Direct labels: every segment's value is readable without hover. */}
            <ul className="mt-3 flex flex-col gap-0.5">
                {segments.map((segment) => {
                    const active = selectedKey === segment.key;
                    return (
                        <li key={segment.key}>
                            <button
                                type="button"
                                onClick={() => segment.value > 0 && toggle(segment.key)}
                                onMouseEnter={() => setHoverKey(segment.key)}
                                onMouseLeave={() => setHoverKey(null)}
                                aria-pressed={active}
                                className={cx(
                                    'group flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left text-[12.5px] transition-colors',
                                    active && 'bg-black/5 dark:bg-white/8',
                                    segment.value === 0 && 'cursor-default opacity-50',
                                )}
                            >
                                <span className="size-2.5 shrink-0 rounded-[3px]" style={{ background: segment.color }} />
                                <span className={cx(
                                    'min-w-0 flex-1 truncate text-[#3F4350] underline-offset-4 dark:text-[#d9dce3]',
                                    segment.value > 0 && 'group-hover:underline',
                                )}>
                                    {segment.label}
                                </span>
                                <span className="shrink-0 text-[11.5px] tabular-nums text-[#98A0AE]">{share(segment.value)}%</span>
                                <span className="w-[92px] shrink-0 text-right font-semibold tabular-nums text-[#1A1A1A] dark:text-white">
                                    {format(segment.value)}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ul>

            {selected && (
                <p className="mt-2 flex flex-wrap items-center gap-x-1.5 rounded-lg bg-[#F4F5F7] px-3.5 py-2 text-[12.5px] text-[#3F4350] dark:bg-white/6 dark:text-[#d9dce3]">
                    <span className="inline-block size-2.5 rounded-[3px]" style={{ background: selected.color }} />
                    <span className="font-semibold text-[#1A1A1A] dark:text-white">{selected.label}</span>
                    {' — '}
                    <span className="font-bold tabular-nums">{format(selected.value)}</span>
                    {' · '}
                    {t('dash.shareOfTotal', { defaultValue: '{{share}}% des Totals', share: share(selected.value) })}
                </p>
            )}
        </div>
    );
};
