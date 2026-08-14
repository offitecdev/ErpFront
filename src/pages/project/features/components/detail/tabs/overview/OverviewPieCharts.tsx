import { memo } from 'react';

import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { useThemeStore } from '@/store/themeStore';

import { money } from '../../../../utils/projectFormatters';

/* Two slots in fixed order — billed, then open — used identically by BOTH
   donuts, so the same colour always means the same thing. Validated with the
   dataviz script against each surface (light #ffffff, dark #151616): lightness
   band, chroma floor, CVD separation and normal-vision floor all pass. The light
   amber sits below 3:1 contrast, which the always-present legend (label and
   figure beside every colour) relieves. */
const BILLING_LIGHT = ['#2a78d6', '#eda100'];
const BILLING_DARK = ['#3987e5', '#c98500'];

// Plain SVG geometry: one stroked arc per slice around a quiet track. A donut
// needs no charting library — this is the whole implementation.
const SIZE = 116;
const RADIUS = 49;
const STROKE = 10;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/**
 * Gap between the two slices, in path units. Round caps extend an arc by half
 * the stroke width at BOTH ends, so the visible gap is this value minus
 * `STROKE` — hence the generous number for a ~4px gap on screen.
 */
const SLICE_GAP = STROKE + 4;

type Slice = { key: string; label: string; value: number; display: string };

/**
 * One donut: chart left, legend right, so two of them stack inside a narrow
 * column without either becoming unreadable. Identity is never colour alone —
 * the legend is always present and every slice carries its own amount, so the
 * chart survives greyscale printing and colour-vision deficiency.
 */
const Donut = memo(({ title, slices, colors, trackColor, empty }: {
    title: string;
    slices: Slice[];
    colors: string[];
    trackColor: string;
    empty?: string;
}) => {
    const data = slices.filter((slice) => slice.value > 0);
    const total = data.reduce((sum, slice) => sum + slice.value, 0);
    const percent = total > 0 ? Math.round((slices[0].value / total) * 100) : 0;

    // Running start offset per slice, walked once at render time.
    let walked = 0;
    const arcs = data.map((slice) => {
        const length = (slice.value / total) * CIRCUMFERENCE;
        const arc = { key: slice.key, color: colors[slices.indexOf(slice)], length, offset: walked };
        walked += length;
        return arc;
    });

    return (
        <div className="flex items-center gap-4">
            <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
                <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="presentation">
                    {/* -90° so the billed slice starts at twelve o'clock. */}
                    <g transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}>
                        <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke={trackColor} strokeWidth={STROKE} />
                        {arcs.map((arc) => {
                            // A lone slice gets no gap — it would notch a full ring.
                            const drawn = arcs.length > 1 ? Math.max(0, arc.length - SLICE_GAP) : arc.length;
                            return (
                                <circle
                                    key={arc.key}
                                    cx={SIZE / 2}
                                    cy={SIZE / 2}
                                    r={RADIUS}
                                    fill="none"
                                    stroke={arc.color}
                                    strokeWidth={STROKE}
                                    strokeLinecap="round"
                                    strokeDasharray={`${drawn} ${CIRCUMFERENCE - drawn}`}
                                    strokeDashoffset={-arc.offset}
                                />
                            );
                        })}
                    </g>
                </svg>
                <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                    <span className="text-[21px] font-bold leading-none tabular-nums text-slate-900 dark:text-white">
                        {total > 0 ? `${percent}%` : '–'}
                    </span>
                    <span className="mt-1 max-w-full truncate px-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                        {t('billing.billed')}
                    </span>
                </div>
            </div>

            <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-semibold text-slate-700 dark:text-white">{title}</p>
                {total === 0 && empty ? (
                    <p className="mt-2 text-[12px] text-slate-400">{empty}</p>
                ) : (
                    <ul className="mt-2 space-y-1.5">
                        {slices.map((slice, index) => (
                            <li key={slice.key} className="flex items-baseline gap-2 text-[12.5px]">
                                <span
                                    className="size-2.5 shrink-0 translate-y-px rounded-full"
                                    style={{ background: colors[index] }}
                                />
                                <span className="min-w-0 flex-1 truncate text-slate-500 dark:text-white/65">{slice.label}</span>
                                <span className="shrink-0 font-mono text-[12px] font-semibold tabular-nums text-slate-900 dark:text-white">
                                    {slice.display}
                                </span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
});

/**
 * Two donuts, kept deliberately apart: the order's own money on top, the money
 * its add-on orders added on below. Mixing them into one ring would hide exactly
 * the thing the overview exists to show — how much of the extra work is billed.
 */
export const OverviewPieCharts = memo(({ order, addons, bare = false }: {
    order: { billed: number; unbilled: number };
    addons: { billed: number; unbilled: number };
    /** Ohne SectionCard-Rahmen — für Popups, deren Kopfzeile den Titel schon trägt. */
    bare?: boolean;
}) => {
    const isDark = useThemeStore((state) => state.isDarkMode);
    const colors = isDark ? BILLING_DARK : BILLING_LIGHT;
    const trackColor = isDark ? 'rgba(255,255,255,0.08)' : '#eef1f6';

    const toSlices = (figures: { billed: number; unbilled: number }): Slice[] => [
        { key: 'billed', label: t('billing.billed'), value: figures.billed, display: money(figures.billed) },
        { key: 'unbilled', label: t('projects.detail.overview.unbilled'), value: figures.unbilled, display: money(figures.unbilled) },
    ];

    const content = (
        <div className="divide-y divide-slate-200 dark:divide-white/10">
            <div className="px-4 py-4">
                <Donut
                    title={t('projects.mainOrder')}
                    slices={toSlices(order)}
                    colors={colors}
                    trackColor={trackColor}
                />
            </div>
            <div className="px-4 py-4">
                <Donut
                    title={t('projects.detail.overview.addonsTitle')}
                    slices={toSlices(addons)}
                    colors={colors}
                    trackColor={trackColor}
                    empty={t('projects.detail.overview.noAddons')}
                />
            </div>
        </div>
    );

    if (bare) return content;

    return (
        <SectionCard title={t('projects.detail.overview.chartsTitle')}>
            {content}
        </SectionCard>
    );
});
