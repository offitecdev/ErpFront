import { useId, useLayoutEffect, useRef, useState } from 'react';

type Side = 'left' | 'right' | 'top' | 'bottom';

/* A single outline includes the pointer, so neither the glass nor its border
   has a seam where the pointer joins the card. Coordinates include a 14px gutter. */
const outline = (width: number, height: number, side: Side, target: number) => {
    const l = 14, t = 14, r = width + 14, b = height + 14, radius = 24;
    const a = target + 14;
    const top = side === 'top' ? `L ${a - 14} ${t} Q ${a - 11} ${t} ${a - 8} ${t - 4} L ${a - 2} ${t - 11} Q ${a} ${t - 13} ${a + 2} ${t - 11} L ${a + 8} ${t - 4} Q ${a + 11} ${t} ${a + 14} ${t}` : '';
    const right = side === 'right' ? `L ${r} ${a - 14} Q ${r} ${a - 11} ${r + 4} ${a - 8} L ${r + 11} ${a - 2} Q ${r + 13} ${a} ${r + 11} ${a + 2} L ${r + 4} ${a + 8} Q ${r} ${a + 11} ${r} ${a + 14}` : '';
    const bottom = side === 'bottom' ? `L ${a + 14} ${b} Q ${a + 11} ${b} ${a + 8} ${b + 4} L ${a + 2} ${b + 11} Q ${a} ${b + 13} ${a - 2} ${b + 11} L ${a - 8} ${b + 4} Q ${a - 11} ${b} ${a - 14} ${b}` : '';
    const left = side === 'left' ? `L ${l} ${a + 14} Q ${l} ${a + 11} ${l - 4} ${a + 8} L ${l - 11} ${a + 2} Q ${l - 13} ${a} ${l - 11} ${a - 2} L ${l - 4} ${a - 8} Q ${l} ${a - 11} ${l} ${a - 14}` : '';
    return `M ${l + radius} ${t} ${top} L ${r - radius} ${t} Q ${r} ${t} ${r} ${t + radius} ${right} L ${r} ${b - radius} Q ${r} ${b} ${r - radius} ${b} ${bottom} L ${l + radius} ${b} Q ${l} ${b} ${l} ${b - radius} ${left} L ${l} ${t + radius} Q ${l} ${t} ${l + radius} ${t} Z`;
};

export const PopoverSurface = ({ side, target }: { side: Side; target: number }) => {
    const ref = useRef<HTMLDivElement>(null);
    const rimId = useId();
    const [size, setSize] = useState({ width: 0, height: 0 });
    useLayoutEffect(() => {
        const card = ref.current?.parentElement;
        if (!card) return;
        const measure = () => setSize(current => {
            const width = card.offsetWidth, height = card.offsetHeight;
            return current.width === width && current.height === height ? current : { width, height };
        });
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(card);
        return () => observer.disconnect();
    }, []);
    const path = outline(size.width, size.height, side, target);
    return (
        <div ref={ref} className="ofi-cal-popover-surface" aria-hidden style={{ width: size.width + 28, height: size.height + 28 }}>
            {size.width > 0 && <>
                <div className="ofi-cal-popover-surface__glass" style={{ clipPath: `path('${path}')` }} />
                <svg width="100%" height="100%" className="ofi-cal-popover-surface__outline">
                    <defs>
                        <linearGradient id={rimId} x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0" stopColor="white" stopOpacity="0.92" />
                            <stop offset="0.45" stopColor="white" stopOpacity="0.28" />
                            <stop offset="1" stopColor="white" stopOpacity="0.6" />
                        </linearGradient>
                    </defs>
                    <path d={path} className="ofi-cal-popover-surface__rim" stroke={`url(#${rimId})`} strokeWidth="3" />
                    <path d={path} className="ofi-cal-popover-surface__edge" />
                </svg>
            </>}
        </div>
    );
};
