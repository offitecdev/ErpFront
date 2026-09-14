import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
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
 * the strip stays a normal scroll area, so trackpads work too). Since
 * 10.09.2026 a tile is a hairline panel whose hover is a quiet fill — the
 * navy block hover went with the Mac look (styles/home.css).
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

    return (
        <div className="ofi-home-qm">
            <div className="ofi-home-qm__head">
                <h2 className="ofi-home-h2">{t('home.quickAccess', { defaultValue: 'Schnellzugriff' })}</h2>
                <div className="ofi-home-qm__arrows">
                    <button type="button" aria-label={t('dash.carousel.prev', { defaultValue: 'Zurück' })}
                        onClick={() => scrollBy(-1)} disabled={!canPrev} className="ofi-home-glyph">
                        <ChevronLeft size={15} />
                    </button>
                    <button type="button" aria-label={t('dash.carousel.next', { defaultValue: 'Weiter' })}
                        onClick={() => scrollBy(1)} disabled={!canNext} className="ofi-home-glyph">
                        <ChevronRight size={15} />
                    </button>
                </div>
            </div>

            {tiles.length === 0 ? (
                <div className="ofi-home-qm__none">
                    {t('home.noModules', { defaultValue: 'Keine zugänglichen Module gefunden.' })}
                </div>
            ) : (
                <div ref={trackRef} onScroll={updateArrows} className="ofi-home-qm__track">
                    {tiles.map((tile) => {
                        const Icon = tile.icon;
                        return (
                            <button
                                key={tile.key}
                                type="button"
                                onClick={() => navigate(tile.key)}
                                className="ofi-home-qm__tile"
                            >
                                <span className="ofi-home-qm__icon"><Icon size={17} /></span>
                                <span className="min-w-0">
                                    <span className="ofi-home-qm__title">
                                        <b>{tile.label}</b>
                                        <ArrowRight size={14} />
                                    </span>
                                    <span className="ofi-home-qm__desc">{tile.description}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
