import { Fragment, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import { t } from '@/i18n/translate';

import { AdminGlyph, FlagGlyph, StepChevron } from './deviceGlyphs';
import type { DeviceStage, DeviceStageId } from './deviceStages';

type Props = {
    stages: DeviceStage[];
    current: DeviceStageId;
    onSelect: (id: DeviceStageId) => void;
};

/**
 * ── DIE PROZESSLEISTE DES GERÄTS (24.09.2026) ───────────────────────────────
 *
 * Vorgabe Samet: «ince bir process olacak ama güzel görünsün ve macOS tab gibi
 * görünmeli … final bayrak olsun, bir tane bayrak noktası şeklinde».
 *
 * Ein segmentierter Schalter wie in macOS — eine flache Rinne, die gewählte
 * Stufe als weisses Segment darauf —, der aber einen WEG zeigt: die Stufen
 * tragen ihre Nummer, zwischen ihnen steht eine feine Spitze nach rechts, und
 * hinter der Rinne führt eine gepunktete Linie zur Fahne, dem Zielpunkt.
 * Die Leiste behauptet keinen Fortschritt (Haken kämen erst mit echten
 * Zuständen); sie zeigt den Weg und wo man steht. Pfeiltasten wechseln die
 * Stufe wie in jeder Reiterleiste.
 *
 * WAS NICHT PASST, RÜCKT ZUSAMMEN, statt die Fahne abzuschneiden: gemessen,
 * nicht geschätzt (die Namen sind je Sprache verschieden lang — Deutsch
 * braucht 1185px, Türkisch 1007px). Stufe 1 verengt die Abstände, Stufe 2
 * zeigt bei den nicht gewählten Stufen nur noch die Nummer (der Name steht im
 * Tipp). Erst wenn auch das nicht reicht (Telefon), läuft die Leiste seitlich.
 */
export const DeviceProcessBar = ({ stages, current, onSelect }: Props) => {
    const listRef = useRef<HTMLDivElement>(null);
    const trackRef = useRef<HTMLDivElement>(null);
    const steps = stages.filter((stage) => !stage.finish);
    const finish = stages.find((stage) => stage.finish) ?? null;

    /* 0 = voll · 1 = eng · 2 = nur Nummern. `natural` hält, wie breit die
       Leiste auf der vorigen Stufe war — erst wenn so viel Platz da ist, geht
       sie wieder eine Stufe zurück (sonst pendelte sie hin und her). */
    const [fit, setFit] = useState(0);
    const naturalRef = useRef<{ sig: string; widths: number[] }>({ sig: '', widths: [0, 0] });
    const signature = stages.map((stage) => t(stage.labelKey)).join('|');

    useLayoutEffect(() => {
        const scroll = listRef.current;
        const track = trackRef.current;
        if (!scroll || !track || typeof ResizeObserver === 'undefined') return undefined;
        let frame = 0;
        const apply = (next: number) => {
            setFit(next);
            // Passt die Leiste auf der neuen Stufe, ändert sich ihre Grösse
            // nicht mehr — also nach dem Zeichnen selbst noch einmal messen.
            window.cancelAnimationFrame(frame);
            frame = window.requestAnimationFrame(() => { frame = window.requestAnimationFrame(check); });
        };
        const check = () => {
            const level = Number(scroll.dataset.fit || 0);
            // Andere Namen (Sprache, Rolle): alles neu messen, von vorn.
            if (naturalRef.current.sig !== signature) {
                naturalRef.current = { sig: signature, widths: [0, 0] };
                if (level !== 0) { apply(0); return; }
            }
            if (scroll.scrollWidth > scroll.clientWidth + 1) {
                if (level < 2) {
                    naturalRef.current.widths[level] = scroll.scrollWidth;
                    apply(level + 1);
                }
            } else if (level > 0 && scroll.clientWidth >= naturalRef.current.widths[level - 1]) {
                apply(level - 1);
            }
        };
        const observer = new ResizeObserver(check);
        observer.observe(scroll);
        observer.observe(track);
        return () => {
            observer.disconnect();
            window.cancelAnimationFrame(frame);
        };
    }, [signature]);

    // Auf schmalen Schirmen läuft die Leiste seitlich — die gewählte Stufe
    // bleibt im Blick.
    useEffect(() => {
        const active = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
        active?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }, [current]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = stages.findIndex((stage) => stage.id === current);
        const last = stages.length - 1;
        const target = event.key === 'ArrowRight' ? Math.min(last, index + 1)
            : event.key === 'ArrowLeft' ? Math.max(0, index - 1)
                : event.key === 'Home' ? 0
                    : event.key === 'End' ? last
                        : -1;
        if (target < 0 || target === index) return;
        event.preventDefault();
        onSelect(stages[target].id);
        window.requestAnimationFrame(() => {
            listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
        });
    };

    const tabProps = (stage: DeviceStage) => {
        const selected = stage.id === current;
        return {
            id: `ofi-pdev-tab-${stage.id}`,
            role: 'tab' as const,
            type: 'button' as const,
            'aria-selected': selected,
            'aria-controls': 'ofi-pdev-panel',
            tabIndex: selected ? 0 : -1,
            onClick: () => onSelect(stage.id),
        };
    };

    return (
        <nav className="ofi-pdev-steps" aria-label={t('production.deviceStages.title')}>
            <div
                ref={listRef}
                className="ofi-pdev-steps__scroll"
                role="tablist"
                aria-orientation="horizontal"
                data-fit={fit}
                onKeyDown={onKeyDown}
            >
                <div ref={trackRef} className="ofi-pdev-steps__track">
                    {steps.map((stage, index) => (
                        <Fragment key={stage.id}>
                            {index > 0 && (
                                <span className="ofi-pdev-steps__sep" aria-hidden="true">
                                    <StepChevron size={11} />
                                </span>
                            )}
                            <button {...tabProps(stage)} title={t(stage.labelKey)} className="ofi-pdev-steps__seg ofi-nosize">
                                <span className="ofi-pdev-steps__num" aria-hidden="true">{index + 1}</span>
                                <span className="ofi-pdev-steps__label">{t(stage.labelKey)}</span>
                                {stage.adminOnly && (
                                    <span className="ofi-pdev-steps__admin" title={t('production.deviceStages.adminOnly')}>
                                        <AdminGlyph size={12} />
                                    </span>
                                )}
                            </button>
                        </Fragment>
                    ))}
                </div>

                {finish && (
                    <>
                        <span className="ofi-pdev-steps__rope" aria-hidden="true" />
                        <button {...tabProps(finish)} className="ofi-pdev-steps__finish ofi-nosize">
                            <span className="ofi-pdev-steps__flag" aria-hidden="true">
                                <FlagGlyph size={12} strokeWidth={2} />
                            </span>
                            <span className="ofi-pdev-steps__label">{t(finish.labelKey)}</span>
                        </button>
                    </>
                )}
            </div>
        </nav>
    );
};
