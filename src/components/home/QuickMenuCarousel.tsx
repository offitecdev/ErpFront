import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    Box as AppstoreOutlined,
    ChevronLeft,
    ChevronRight,
    ArrowRight,
} from '@/components/icons/antIconCompat';

export type QuickMenuTile = {
    key: string;
    label: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
};

/**
 * Swipeable quick-menu row beside the greeting — plain CSS scroll-snap, no
 * carousel library. Touch swipes natively; mouse users get the chevrons (and
 * the strip stays a normal scroll area, so trackpads work too). Boxes turn
 * the dark hover-navy on hover, with the title underlined as the interactive
 * cue used across the dashboard.
 */
export const QuickMenuCarousel: React.FC<{ tiles: QuickMenuTile[] }> = ({ tiles }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const trackRef = useRef<HTMLDivElement>(null);
    const [canPrev, setCanPrev] = useState(false);
    const [canNext, setCanNext] = useState(false);

    const updateArrows = useCallback(() => {
        const el = trackRef.current;
        if (!el) return;
        setCanPrev(el.scrollLeft > 4);
        setCanNext(el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
    }, []);

    useEffect(() => {
        updateArrows();
        // Arrow state also moves when the viewport (not the strip) resizes.
        window.addEventListener('resize', updateArrows);
        return () => window.removeEventListener('resize', updateArrows);
    }, [updateArrows, tiles.length]);

    const scrollBy = (direction: 1 | -1) => {
        const el = trackRef.current;
        if (!el) return;
        el.scrollBy({ left: direction * Math.max(240, el.clientWidth * 0.8), behavior: 'smooth' });
    };

    /* The menus stay navy: hover is the house dark hover-navy #1f2654 (white
       text 13.9:1) — orange is reserved for the charts and dark-mode icons. */
    const arrowCls = (enabled: boolean) =>
        `flex size-7 items-center justify-center rounded-lg border transition-colors ${
            enabled
                ? 'border-[#D5D7DB] text-[#3F4350] hover:border-[#1f2654] hover:bg-[#1f2654] hover:text-white dark:border-white/20 dark:text-white/80 dark:hover:border-[#1f2654] dark:hover:bg-[#1f2654]'
                : 'cursor-default border-[#EAEAEC] text-[#C4C7CE] dark:border-white/10 dark:text-white/25'
        }`;

    return (
        <div className="min-w-0 flex-1">
            <div className="mb-2.5 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <AppstoreOutlined size={15} className="text-slate-400 dark:text-[#e8873a]" />
                    <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8f95a1]">
                        {t('home.quickAccess', { defaultValue: 'Schnellzugriff' })}
                    </h2>
                </div>
                <div className="flex items-center gap-1.5">
                    <button type="button" aria-label={t('dash.carousel.prev', { defaultValue: 'Zurück' })}
                        onClick={() => scrollBy(-1)} disabled={!canPrev} className={arrowCls(canPrev)}>
                        <ChevronLeft size={16} />
                    </button>
                    <button type="button" aria-label={t('dash.carousel.next', { defaultValue: 'Weiter' })}
                        onClick={() => scrollBy(1)} disabled={!canNext} className={arrowCls(canNext)}>
                        <ChevronRight size={16} />
                    </button>
                </div>
            </div>

            {tiles.length === 0 ? (
                <div className="rounded-xl border border-[#EAEAEC] bg-white px-4 py-10 text-center text-[13px] text-[#98A0AE] dark:border-white/10 dark:bg-[#151616] dark:text-[#8f95a1]">
                    {t('home.noModules', { defaultValue: 'Keine zugänglichen Module gefunden.' })}
                </div>
            ) : (
                <div
                    ref={trackRef}
                    onScroll={updateArrows}
                    className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                >
                    {tiles.map((tile) => {
                        const Icon = tile.icon;
                        return (
                            <button
                                key={tile.key}
                                type="button"
                                onClick={() => navigate(tile.key)}
                                className="group flex h-[136px] w-[218px] shrink-0 snap-start flex-col justify-between rounded-xl border border-[#EAEAEC] bg-white p-4 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors duration-150 hover:border-[#1f2654] hover:bg-[#1f2654] focus:outline-none focus-visible:ring-2 focus-visible:ring-[#272f67]/40 dark:border-white/10 dark:bg-[#151616] dark:hover:border-[#1f2654] dark:hover:bg-[#1f2654]"
                            >
                                <span className="flex size-10 items-center justify-center rounded-lg bg-[#F3F4F6] text-[#3F4350] transition-colors duration-150 group-hover:bg-white/15 group-hover:text-white dark:bg-[#e8873a]/12 dark:text-[#e8873a] dark:group-hover:bg-white/15 dark:group-hover:text-white">
                                    <Icon size={20} />
                                </span>
                                <span className="min-w-0">
                                    <span className="flex items-center justify-between gap-2">
                                        <span className="truncate text-[14.5px] font-semibold text-[#1A1A1A] underline-offset-4 transition-colors duration-150 group-hover:text-white group-hover:underline dark:text-white">
                                            {tile.label}
                                        </span>
                                        <ArrowRight size={15} className="shrink-0 text-[#C4C7CE] transition-colors duration-150 group-hover:text-white dark:text-white/25" />
                                    </span>
                                    <span className="mt-0.5 block truncate text-[12.5px] text-[#6B7280] transition-colors duration-150 group-hover:text-white/90 dark:text-[#aab0bb]">
                                        {tile.description}
                                    </span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
