import { useId, useState, type ReactNode } from 'react';

import './swiftChart.css';
import {
    TAU,
    sectorPath,
    useFirstReveal,
    useProgress,
    useTweenValues,
    type SwiftSlice,
} from './swiftChartCore';

export type { SwiftSlice } from './swiftChartCore';

/* ─────────────────────────────────────────────────────────────────────────────
   Swift Charts — the app's chart idiom since 10.09.2026 (Samet: «die Charts
   im iOS/SwiftUI-Stil»). Hand-rolled SVG + CSS, no chart library
   ([[no-antd-new-ui]]); this file is the geometry and the behaviour, the
   look lives in swiftChart.css (`.ofi-swc-*`).

   What "SwiftUI" means here, in one list — the defaults of Apple's Charts
   framework, not a marketing chart:
     · SectorMark donuts: flat sectors with an ANGULAR INSET (a hairline of
       surface between two sectors) and a small corner radius on every
       sector end; no plate, no shadow, no rim badges;
     · BarMark bars with a 3px corner, faint SOLID gridlines, the value axis
       on the TRAILING side (Swift's default `.chartYAxis` position), axis
       labels in the secondary ink at 11px;
     · selection answers in OPACITY only (the selected mark keeps its colour,
       the rest fade) — nothing moves on hover ([[analysis-dial-rebuild]]);
     · legends are rows of a small rounded swatch + label + figure, the figure
       ALWAYS in text ink (never the series colour);
     · iOS system colours (blue #0a7aff, orange #ff9500, …), dark mode takes
       the system's dark steps.

   Validated with the dataviz six-checks validator (10.09.2026): blue/orange
   pass every check in both modes; the grey is a de-emphasis remainder slot,
   never a series; the orange sits below 3:1 on white, which the always-
   present legend figures and direct labels relieve.
   ───────────────────────────────────────────────────────────────────────── */

/* ── The ring ─────────────────────────────────────────────────────────────── */

export type SectorRingProps = {
    slices: SwiftSlice[];
    /** Rendered size in px; the drawing scales with it. */
    size?: number;
    /** Band width in px. */
    thickness?: number;
    /** Gap between two sectors, in degrees (Swift's `angularInset`). */
    inset?: number;
    corner?: number;
    /** The slice that is hovered/focused/pinned — the others fade. */
    active?: string | null;
    onHover?: (key: string | null) => void;
    onPick?: (key: string) => void;
    /** Draws itself on first visibility (sweep) and glides on data changes. */
    animate?: boolean;
    /** What sits in the hole. */
    children?: ReactNode;
    className?: string;
    label?: string;
};

export const SectorRing = ({
    slices,
    size = 180,
    thickness = 26,
    inset = 2,
    corner = 3,
    active = null,
    onHover,
    onPick,
    animate = true,
    children,
    className,
    label,
}: SectorRingProps) => {
    const [rootRef, shown] = useFirstReveal<HTMLDivElement>(animate);
    const sweep = useProgress(shown, animate ? 760 : 0);
    const targets: Record<string, number> = {};
    slices.forEach((slice) => { targets[slice.key] = Math.max(0, slice.value); });
    const tweened = useTweenValues(targets, animate ? 320 : 0);
    const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

    const c = size / 2;
    const r1 = c;
    const r0 = c - thickness;
    const total = slices.reduce((sum, slice) => sum + (tweened[slice.key] ?? slice.value), 0);
    const visible = slices.filter((slice) => (tweened[slice.key] ?? slice.value) > 0);
    const gap = visible.length > 1 ? (inset * Math.PI) / 180 : 0;
    const drawnEnd = -Math.PI / 2 + TAU * (animate ? sweep : 1);
    const isEmpty = total <= 0;

    const spans = visible.map((slice) => ((tweened[slice.key] ?? slice.value) / total) * TAU);
    const arcs = visible.map((slice, index) => {
        const start = -Math.PI / 2 + spans.slice(0, index).reduce((sum, span) => sum + span, 0);
        return { slice, a0: start + gap / 2, a1: Math.min(start + spans[index] - gap / 2, drawnEnd) };
    });

    return (
        <div
            ref={rootRef}
            className={`ofi-swc-ring ${isEmpty ? 'is-empty' : ''} ${active ? 'is-picking' : ''} ${className || ''}`}
            style={{ width: size, height: size }}
            onMouseLeave={() => onHover?.(null)}
        >
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label} aria-hidden={label ? undefined : true}>
                <defs>
                    <pattern id={`ofi-swc-hatch-${uid}`} width="7" height="7" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                        <line className="ofi-swc-ring__hatch" x1="0" y1="0" x2="0" y2="7" strokeWidth="2" />
                    </pattern>
                </defs>
                {/* The track is always there — it is what an empty chart shows,
                    and it is the ground the sectors draw themselves onto. */}
                <path className="ofi-swc-ring__track" d={sectorPath(c, c, r0, r1, 0, TAU, 0)} />
                {isEmpty && <path d={sectorPath(c, c, r0, r1, 0, TAU, 0)} fill={`url(#ofi-swc-hatch-${uid})`} />}
                {arcs.map(({ slice, a0, a1 }) => (a1 - a0 > 0.002 ? (
                    <path
                        key={slice.key}
                        className={`ofi-swc-ring__sector ${active === slice.key ? 'is-active' : ''}`}
                        d={sectorPath(c, c, r0, r1, a0, a1, corner)}
                        fill={slice.color}
                        tabIndex={onPick ? 0 : undefined}
                        role={onPick ? 'button' : undefined}
                        aria-label={`${slice.label}: ${slice.value}`}
                        onMouseEnter={() => onHover?.(slice.key)}
                        onFocus={() => onHover?.(slice.key)}
                        onBlur={() => onHover?.(null)}
                        onClick={() => onPick?.(slice.key)}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onPick?.(slice.key); }
                        }}
                    />
                ) : null))}
            </svg>
            {children && <div className="ofi-swc-ring__hole">{children}</div>}
        </div>
    );
};

/* ── The legend ───────────────────────────────────────────────────────────── */

export type SwiftLegendProps = {
    slices: SwiftSlice[];
    total?: number;
    format?: (value: number) => string;
    /** Show each row's share of the total. */
    share?: boolean;
    active?: string | null;
    pinned?: string | null;
    onHover?: (key: string | null) => void;
    onPick?: (key: string) => void;
    className?: string;
};

export const SwiftLegend = ({ slices, total, format = (v) => String(v), share = true, active, pinned, onHover, onPick, className }: SwiftLegendProps) => {
    const sum = total ?? slices.reduce((acc, slice) => acc + slice.value, 0);
    return (
        <ul className={`ofi-swc-legend ${className || ''}`}>
            {slices.map((slice) => {
                const void_ = slice.value <= 0;
                return (
                    <li key={slice.key}>
                        <button
                            type="button"
                            className={`ofi-swc-row ${active === slice.key ? 'is-active' : ''} ${pinned === slice.key ? 'is-pinned' : ''} ${void_ ? 'is-void' : ''}`}
                            aria-pressed={pinned === slice.key}
                            onMouseEnter={() => !void_ && onHover?.(slice.key)}
                            onMouseLeave={() => onHover?.(null)}
                            onFocus={() => !void_ && onHover?.(slice.key)}
                            onBlur={() => onHover?.(null)}
                            onClick={() => !void_ && onPick?.(slice.key)}
                        >
                            <span className="ofi-swc-swatch" style={{ background: slice.color }} />
                            <span className="ofi-swc-row__label">{slice.label}</span>
                            {share && <span className="ofi-swc-row__share">{sum > 0 ? `${Math.round((slice.value / sum) * 100)} %` : '–'}</span>}
                            <span className="ofi-swc-row__value">{format(slice.value)}</span>
                        </button>
                    </li>
                );
            })}
        </ul>
    );
};

/* ── Ring + hole + legend, as one instrument ──────────────────────────────── */

export type SwiftDonutProps = {
    slices: SwiftSlice[];
    /** Disable geometry tweening for dashboards with several simultaneous charts. */
    animate?: boolean;
    /** Headline under the total in the hole (e.g. "Angebote"). */
    centerLabel: string;
    format?: (value: number) => string;
    /** Formats the hole's big number (defaults to `format`). */
    formatTotal?: (value: number) => string;
    size?: number;
    thickness?: number;
    /** Legend beside the ring (row) or under it (column). */
    layout?: 'row' | 'column';
    emptyLabel?: string;
    className?: string;
    /** Extra content between ring and legend (scope switches …). */
    aside?: ReactNode;
};

/**
 * Hovering a sector, a legend row or the hole's figure highlights ONE part:
 * the others fade, the hole shows that part's figure and share. Clicking pins
 * it (a second click releases). Nothing moves.
 */
export const SwiftDonut = ({ slices, centerLabel, format = (v) => String(v), formatTotal, size = 176, thickness = 26, layout = 'column', emptyLabel, className, aside, animate = true }: SwiftDonutProps) => {
    const [hot, setHot] = useState<string | null>(null);
    const [pinned, setPinned] = useState<string | null>(null);
    const activeKey = hot ?? pinned;
    const total = slices.reduce((sum, slice) => sum + slice.value, 0);
    const active = slices.find((slice) => slice.key === activeKey && slice.value > 0) || null;
    const bigFormat = formatTotal ?? format;
    const togglePin = (key: string) => setPinned((current) => (current === key ? null : key));

    return (
        <div className={`ofi-swc ofi-swc-donut is-${layout} ${className || ''}`}>
            <SectorRing
                animate={animate}
                slices={slices}
                size={size}
                thickness={thickness}
                active={activeKey}
                onHover={setHot}
                onPick={togglePin}
                label={centerLabel}
            >
                {total <= 0 ? (
                    <>
                        <span className="ofi-swc-hole__big is-empty">–</span>
                        <span className="ofi-swc-hole__label">{emptyLabel ?? centerLabel}</span>
                    </>
                ) : active ? (
                    <>
                        <span className="ofi-swc-hole__big">{bigFormat(active.value)}</span>
                        <span className="ofi-swc-hole__label">{active.label}</span>
                        <span className="ofi-swc-hole__sub">{Math.round((active.value / total) * 100)} %</span>
                    </>
                ) : (
                    <>
                        <span className="ofi-swc-hole__big">{bigFormat(total)}</span>
                        <span className="ofi-swc-hole__label">{centerLabel}</span>
                    </>
                )}
            </SectorRing>
            <div className="ofi-swc-donut__side">
                {aside}
                <SwiftLegend
                    slices={slices}
                    total={total}
                    format={format}
                    active={activeKey}
                    pinned={pinned}
                    onHover={setHot}
                    onPick={togglePin}
                />
            </div>
        </div>
    );
};

/* ── A single-value gauge (Activity-ring style, round caps) ──────────────── */

export const SwiftGauge = ({ percent, size = 96, thickness = 10, color, children, label }: {
    percent: number;
    size?: number;
    thickness?: number;
    color?: string;
    children?: ReactNode;
    label?: string;
}) => {
    const [rootRef, shown] = useFirstReveal<HTMLDivElement>();
    const progress = useProgress(shown, 700);
    const value = Math.max(0, Math.min(100, percent)) * progress;
    const c = size / 2;
    const r = c - thickness / 2;
    const circumference = TAU * r;
    return (
        <div ref={rootRef} className="ofi-swc ofi-swc-gauge" style={{ width: size, height: size }}>
            <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label={label}>
                <circle className="ofi-swc-gauge__track" cx={c} cy={c} r={r} fill="none" strokeWidth={thickness} />
                <circle
                    className="ofi-swc-gauge__arc"
                    cx={c}
                    cy={c}
                    r={r}
                    fill="none"
                    stroke={color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                    strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
                    transform={`rotate(-90 ${c} ${c})`}
                />
            </svg>
            {children && <div className="ofi-swc-ring__hole">{children}</div>}
        </div>
    );
};

/* ── Part-to-whole bar ────────────────────────────────────────────────────── */

export type SwiftSplitProps = {
    segments: SwiftSlice[];
    animate?: boolean;
    format?: (value: number) => string;
    emptyLabel?: string;
    /** A line under the bar that names the whole (e.g. the total). */
    caption?: ReactNode;
};

/**
 * The stacked horizontal bar of iOS Storage settings: a thin capsule cut into
 * segments by a hairline of surface, legend rows underneath. Hover or click a
 * segment (or its row) and the others fade; the row carries the figure.
 */
export const SwiftSplit = ({ segments, format = (v) => String(v), emptyLabel, caption, animate = true }: SwiftSplitProps) => {
    const [hot, setHot] = useState<string | null>(null);
    const [pinned, setPinned] = useState<string | null>(null);
    const [rootRef, shown] = useFirstReveal<HTMLDivElement>(animate);
    const progress = useProgress(shown, animate ? 640 : 0);
    const activeKey = hot ?? pinned;
    const total = segments.reduce((sum, segment) => sum + segment.value, 0);
    const visible = segments.filter((segment) => segment.value > 0);
    const togglePin = (key: string) => setPinned((current) => (current === key ? null : key));

    return (
        <div ref={rootRef} className={`ofi-swc ofi-swc-split ${activeKey ? 'is-picking' : ''}`}>
            {total <= 0 ? (
                <div className="ofi-swc-split__bar is-empty"><span /></div>
            ) : (
                <div className="ofi-swc-split__bar" onMouseLeave={() => setHot(null)}>
                    {visible.map((segment) => (
                        <button
                            key={segment.key}
                            type="button"
                            className={`ofi-swc-split__seg ${activeKey === segment.key ? 'is-active' : ''}`}
                            style={{ flexGrow: segment.value * progress, background: segment.color }}
                            aria-label={`${segment.label}: ${format(segment.value)}`}
                            aria-pressed={pinned === segment.key}
                            onMouseEnter={() => setHot(segment.key)}
                            onFocus={() => setHot(segment.key)}
                            onBlur={() => setHot(null)}
                            onClick={() => togglePin(segment.key)}
                        />
                    ))}
                    {progress < 1 && <span className="ofi-swc-split__seg is-filler" style={{ flexGrow: total * (1 - progress) }} />}
                </div>
            )}
            {caption && <div className="ofi-swc-split__caption">{caption}</div>}
            {total <= 0 && emptyLabel && <div className="ofi-swc-empty">{emptyLabel}</div>}
            <SwiftLegend
                slices={segments}
                total={total}
                format={format}
                active={activeKey}
                pinned={pinned}
                onHover={setHot}
                onPick={togglePin}
            />
        </div>
    );
};
