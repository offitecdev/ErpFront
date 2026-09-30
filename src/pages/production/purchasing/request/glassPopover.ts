import { useLayoutEffect, useState, type RefObject } from 'react';

/** Wie weit die Spitze des Pfeils aus der Blase ragt — und wie breit sein Fuss ist (halb). */
export const ARROW_HEIGHT = 9;
const ARROW_HALF = 11;
const RADIUS = 16;
const GAP = 6;
const MARGIN = 16;
const WIDTH = 360;

export interface PopoverPlacement {
    /** Die Blase steht ÜBER dem Knopf (Pfeil unten) oder DARUNTER (Pfeil oben). */
    side: 'above' | 'below';
    left: number;
    width: number;
    /** `top` für unten, `bottom` für oben — die Höhe wächst vom Knopf weg. */
    top: number | null;
    bottom: number | null;
    maxHeight: number;
    /** Die Spitze, gemessen von der linken Kante der Blase. */
    arrowX: number;
}

/**
 * ── DIE BLASE ZEIGT AUF IHREN KNOPF (30.09.2026, Skizze Samet) ─────────────
 * «Apple'daki gibi, o artıya doğru işaret edecek.» Die Seite mit mehr Platz
 * gewinnt; der Pfeil steht immer genau über der Mitte des Knopfs, auch wenn
 * die Blase am Rand des Fensters anstösst.
 */
export const useAnchoredPlacement = (open: boolean, anchor: HTMLElement | null): PopoverPlacement | null => {
    const [placement, setPlacement] = useState<PopoverPlacement | null>(null);
    useLayoutEffect(() => {
        if (!open) return undefined;
        const place = () => {
            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const width = Math.min(WIDTH, vw - 2 * MARGIN);
            const rect = anchor?.getBoundingClientRect() ?? new DOMRect(vw / 2, vh / 2, 0, 0);
            const centre = rect.left + rect.width / 2;
            const left = Math.min(Math.max(centre - width / 2, MARGIN), vw - width - MARGIN);
            const spaceBelow = vh - rect.bottom - GAP - ARROW_HEIGHT - MARGIN;
            const spaceAbove = rect.top - GAP - ARROW_HEIGHT - MARGIN;
            const side = spaceBelow >= Math.min(spaceAbove, 420) ? 'below' : 'above';
            const arrowX = Math.min(Math.max(centre - left, RADIUS + ARROW_HALF), width - RADIUS - ARROW_HALF);
            setPlacement({
                side,
                left,
                width,
                top: side === 'below' ? rect.bottom + GAP + ARROW_HEIGHT : null,
                bottom: side === 'above' ? vh - rect.top + GAP + ARROW_HEIGHT : null,
                maxHeight: Math.max(220, Math.min(440, side === 'below' ? spaceBelow : spaceAbove)),
                arrowX,
            });
        };
        place();
        window.addEventListener('resize', place);
        window.addEventListener('scroll', place, true);
        return () => {
            window.removeEventListener('resize', place);
            window.removeEventListener('scroll', place, true);
        };
    }, [open, anchor]);
    return open ? placement : null;
};

/** Die gemessene Höhe der Blase (ohne Pfeil) — für den Umriss. */
export const useBoxHeight = (ref: RefObject<HTMLElement | null>, active: boolean): number => {
    const [height, setHeight] = useState(0);
    useLayoutEffect(() => {
        const node = ref.current;
        if (!active || !node) return undefined;
        setHeight(node.offsetHeight);
        const observer = new ResizeObserver(() => setHeight(node.offsetHeight));
        observer.observe(node);
        return () => observer.disconnect();
    }, [ref, active]);
    return height;
};

/**
 * Der Umriss der Blase MIT Pfeil als EIN Pfad — so gibt es keine Naht zwischen
 * Blase und Pfeil (Glas, Rand und Verlauf laufen durch). Die Box ist `h + Pfeil`
 * hoch; für «below» wird der Pfeil-unten-Umriss gespiegelt.
 */
export const bubblePath = (w: number, h: number, side: 'above' | 'below', ax: number): string => {
    const a = ARROW_HEIGHT;
    const r = RADIUS;
    const k = ARROW_HALF;
    const Y = (y: number) => (side === 'above' ? y : h + a - y);
    const p = (x: number, y: number) => `${x.toFixed(1)} ${Y(y).toFixed(1)}`;
    return [
        `M ${p(r, 0)}`,
        `H ${w - r}`,
        `Q ${p(w, 0)} ${p(w, r)}`,
        `V ${Y(h - r).toFixed(1)}`,
        `Q ${p(w, h)} ${p(w - r, h)}`,
        `H ${ax + k}`,
        // Weich wie bei Apple: breiter Fuss, runde Spitze.
        `C ${p(ax + k * 0.55, h)} ${p(ax + 3.2, h + a - 0.6)} ${p(ax, h + a)}`,
        `C ${p(ax - 3.2, h + a - 0.6)} ${p(ax - k * 0.55, h)} ${p(ax - k, h)}`,
        `H ${r}`,
        `Q ${p(0, h)} ${p(0, h - r)}`,
        `V ${Y(r).toFixed(1)}`,
        `Q ${p(0, 0)} ${p(r, 0)}`,
        'Z',
    ].join(' ');
};
