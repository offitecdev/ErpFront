import { useEffect, useRef, useState } from 'react';

/* The geometry and the motion of components/charts/swiftChart.tsx — kept in
   a file of its own so the component file exports only components (Vite's
   fast refresh) and the maths can be tested without React. */

export type SwiftMode = 'light' | 'dark';

/** iOS system colours — light steps on white, dark steps on #1c1c1e. */
export const SWIFT_COLORS = {
    light: {
        blue: '#0a7aff',
        orange: '#ff9500',
        green: '#34c759',
        red: '#ff3b30',
        purple: '#af52de',
        teal: '#30b0c7',
        indigo: '#5856d6',
        pink: '#ff2d55',
        gray: '#8e8e93',
        /** The remainder slot of a part-to-whole chart. */
        rest: '#e5e5ea',
    },
    dark: {
        blue: '#0a84ff',
        orange: '#ff9f0a',
        green: '#30d158',
        red: '#ff453a',
        purple: '#bf5af2',
        teal: '#40c8e0',
        indigo: '#5e5ce6',
        pink: '#ff375f',
        gray: '#98989d',
        rest: '#3a3a3c',
    },
} as const;

export type SwiftSlice = { key: string; label: string; value: number; color: string };

export const TAU = Math.PI * 2;

const polar = (cx: number, cy: number, r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(3)} ${(cy + r * Math.sin(a)).toFixed(3)}`;

/**
 * One annulus sector with rounded corners — SwiftUI's `SectorMark` with a
 * `cornerRadius`. Angles in radians, 0 = three o'clock, growing clockwise
 * (SVG's y grows downward). Corners are quarter-turns of radius `corner`,
 * clamped so they always fit the band and the sector's own span.
 */
export const sectorPath = (cx: number, cy: number, r0: number, r1: number, a0: number, a1: number, corner: number) => {
    const span = a1 - a0;
    if (span <= 0.0001) return '';
    if (span >= TAU - 0.0005) {
        // A lone 100 % sector: two full circles (outer clockwise, inner reversed).
        return [
            `M ${polar(cx, cy, r1, 0)} A ${r1} ${r1} 0 1 1 ${polar(cx, cy, r1, Math.PI)} A ${r1} ${r1} 0 1 1 ${polar(cx, cy, r1, TAU)}`,
            `M ${polar(cx, cy, r0, 0)} A ${r0} ${r0} 0 1 0 ${polar(cx, cy, r0, Math.PI)} A ${r0} ${r0} 0 1 0 ${polar(cx, cy, r0, TAU)} Z`,
        ].join(' ');
    }
    // The corner circle sits `rc` inside the band; its angular offset from the
    // radial edge follows from the right triangle it makes with the origin.
    let rc = Math.min(corner, (r1 - r0) / 2);
    const fits = (r: number) => Math.asin(Math.min(1, r / (r0 + r))) * 2 < span * 0.92;
    while (rc > 0.3 && !fits(rc)) rc *= 0.8;
    if (rc < 0.3) {
        const large = span > Math.PI ? 1 : 0;
        return `M ${polar(cx, cy, r1, a0)} A ${r1} ${r1} 0 ${large} 1 ${polar(cx, cy, r1, a1)} L ${polar(cx, cy, r0, a1)} A ${r0} ${r0} 0 ${large} 0 ${polar(cx, cy, r0, a0)} Z`;
    }
    const dOut = Math.asin(rc / (r1 - rc));
    const dIn = Math.asin(rc / (r0 + rc));
    const tOut = Math.sqrt((r1 - rc) ** 2 - rc ** 2);
    const tIn = Math.sqrt((r0 + rc) ** 2 - rc ** 2);
    const largeOut = span - 2 * dOut > Math.PI ? 1 : 0;
    const largeIn = span - 2 * dIn > Math.PI ? 1 : 0;
    return [
        `M ${polar(cx, cy, r1, a0 + dOut)}`,
        `A ${r1} ${r1} 0 ${largeOut} 1 ${polar(cx, cy, r1, a1 - dOut)}`,
        `A ${rc} ${rc} 0 0 1 ${polar(cx, cy, tOut, a1)}`,
        `L ${polar(cx, cy, tIn, a1)}`,
        `A ${rc} ${rc} 0 0 1 ${polar(cx, cy, r0, a1 - dIn)}`,
        `A ${r0} ${r0} 0 ${largeIn} 0 ${polar(cx, cy, r0, a0 + dIn)}`,
        `A ${rc} ${rc} 0 0 1 ${polar(cx, cy, tIn, a0)}`,
        `L ${polar(cx, cy, tOut, a0)}`,
        `A ${rc} ${rc} 0 0 1 ${polar(cx, cy, r1, a0 + dOut)}`,
        'Z',
    ].join(' ');
};

const prefersStill = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const easeOut = (p: number) => 1 - (1 - p) ** 3;

/**
 * First visibility, exactly once: a chart draws itself when it comes into
 * view, not while it is still under the fold.
 */
export const useFirstReveal = <T extends Element>() => {
    const ref = useRef<T | null>(null);
    const [shown, setShown] = useState(false);
    useEffect(() => {
        const node = ref.current;
        const paint = () => requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)));
        if (!node || typeof IntersectionObserver === 'undefined') { paint(); return; }
        const observer = new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) { observer.disconnect(); paint(); }
        }, { threshold: 0.25 });
        observer.observe(node);
        return () => observer.disconnect();
    }, []);
    return [ref, shown] as const;
};

/** 0 → 1 once `run` turns true; ease-out; instant under reduced motion. */
export const useProgress = (run: boolean, ms: number) => {
    const [progress, setProgress] = useState(0);
    useEffect(() => {
        if (!run) return;
        if (prefersStill()) { setProgress(1); return; }
        const started = performance.now();
        let frame = requestAnimationFrame(function step(now: number) {
            const p = Math.min(1, (now - started) / ms);
            setProgress(easeOut(p));
            if (p < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [run, ms]);
    return progress;
};

/**
 * Numbers that glide to their new value instead of jumping — a scope switch
 * on a donut redraws as one motion. Keyed so a slice keeps its own tween.
 */
export const useTweenValues = (target: Record<string, number>, ms: number) => {
    const [values, setValues] = useState(target);
    const shown = useRef(target);
    const key = JSON.stringify(target);
    useEffect(() => {
        const from = { ...shown.current };
        const to = target;
        const keys = Array.from(new Set([...Object.keys(from), ...Object.keys(to)]));
        if (prefersStill() || keys.every((k) => (from[k] || 0) === (to[k] || 0))) {
            shown.current = to;
            setValues(to);
            return;
        }
        const started = performance.now();
        let frame = requestAnimationFrame(function step(now: number) {
            const p = easeOut(Math.min(1, (now - started) / ms));
            const next: Record<string, number> = {};
            keys.forEach((k) => { next[k] = (from[k] || 0) + ((to[k] || 0) - (from[k] || 0)) * p; });
            shown.current = next;
            setValues(next);
            if (p < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, ms]);
    return values;
};

export const useCountUp = (target: number, run: boolean, ms: number) => {
    const [value, setValue] = useState(0);
    const current = useRef(0);
    useEffect(() => {
        if (!run) return;
        if (prefersStill()) { current.current = target; setValue(target); return; }
        const from = current.current;
        if (from === target) return;
        const started = performance.now();
        let frame = requestAnimationFrame(function step(now: number) {
            const p = easeOut(Math.min(1, (now - started) / ms));
            const next = from + (target - from) * p;
            current.current = next;
            setValue(next);
            if (p < 1) frame = requestAnimationFrame(step);
        });
        return () => cancelAnimationFrame(frame);
    }, [target, run, ms]);
    return value;
};

/* ── Bars ─────────────────────────────────────────────────────────────────── */

/** A bar with a 3px corner on its data end, square on the baseline. */
export const barPath = (x: number, y: number, w: number, h: number, corner = 3) => {
    if (h <= 0 || w <= 0) return '';
    const r = Math.min(corner, w / 2, h);
    return `M ${x} ${y + h} L ${x} ${y + r} Q ${x} ${y} ${x + r} ${y} L ${x + w - r} ${y} Q ${x + w} ${y} ${x + w} ${y + r} L ${x + w} ${y + h} Z`;
};

/** Clean axis steps — 4 gridlines between 0 and a rounded maximum. */
export const niceMax = (raw: number, steps = 4) => {
    if (raw <= 0) return steps;
    const rough = raw / steps;
    const magnitude = 10 ** Math.floor(Math.log10(rough));
    const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude);
    const step = candidates.find((candidate) => candidate >= rough) ?? candidates[candidates.length - 1];
    return step * steps;
};

export const useElementWidth = () => {
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

