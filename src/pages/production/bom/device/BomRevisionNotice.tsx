import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { FilePen } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { BomRevisionDraft } from '@/types/productionBom';

import { shortDate } from '../bomFormat';
import type { ChangeCounts } from './bomRevision';
import { ChangeChips } from './BomRevisionsView';

/**
 * ── DIE REVISION IM ENTWURF: GLASFENSTER → GEDANKENBLASE (28.09.2026) ────────
 *
 * Samet: «Rev.8 hazırlanıyor — Rev.7 geçerli … bu uyarı şeklinde çıksın, glass
 * modal, sonra küçülsün — yorum, küçük bulut şeklinde, düşünce balonu gibi,
 * glass.» Statt des Bandes über der Tabelle:
 *
 *   1. ein gläsernes Warnfenster in der Mitte (wie ein macOS-Hinweis: Symbol,
 *      Titel, Text, der Grund der Revision, «Anladım»);
 *   2. nach ein paar Sekunden (unter dem Zeiger wartet es; «Anladım», Escape
 *      oder ein Klick daneben sofort) FLIEGT das Fenster zu seinem Platz rechts
 *      neben den Reitern und wird dort zur Kapsel — aus der die Wolke wächst:
 *      zwei Beulen oben (wie «cloud» der SF Symbols), zwei kleine Glaskreise
 *      als Gedankenspur;
 *   3. ein Klick auf die Wolke fliegt das Fenster wieder auf.
 *
 * Von selbst erscheint das Fenster einmal je Seitenaufruf und Revision — wer
 * zwischen den Ansichten wechselt, sieht danach nur noch die Wolke.
 */

type Mode = 'modal' | 'bubble';
interface Box { left: number; top: number; width: number; height: number }
interface Cloud { contentWidth: number; width: number; height: number; d: string }

const shownOnce = new Set<string>();

/** So lange steht der Hinweis, bevor er schrumpft — nach einem Blick darauf etwas kürzer. */
const HOLD_MS = 5200;
const HOLD_AFTER_HOVER_MS = 1800;
const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';
const CARD_RADIUS = 22;
/**
 * Der Leib der Wolke ist eine Kapsel so hoch wie die Reiter; oben ragen die
 * Beulen bis RISE darüber, unten die flachen bis DIP darunter.
 */
const BODY_H = 32;
const RISE = 10;
const DIP = 4;
const MIN_WIDTH = 132;
/** Oben vier Beulen (Anteil an der geraden Kante, Höhe), unten drei flache — eine Gedankenwolke. */
const UPPER: ReadonlyArray<readonly [number, number]> = [[0.22, 7], [0.3, 10], [0.27, 9], [0.21, 6]];
const LOWER: ReadonlyArray<readonly [number, number]> = [[0.36, 3], [0.3, 4], [0.34, 3]];

const reducedMotion = (): boolean =>
    typeof window !== 'undefined' && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

const fx = (value: number): number => Math.round(value * 100) / 100;

/**
 * Der Umriss: links und rechts Halbkreise, dazwischen oben eine Kette von
 * Beulen (Spitzen dazwischen, wie eine Wolke), unten flache Wellen. Jede Beule
 * ist eine kubische Kurve, deren Griffe über der Kante stehen; `puff` 0 legt
 * die Griffe auf die Kante — dieselben Befehle ergeben die glatte Kapsel. So
 * wächst die Wolke gleichmässig aus der gelandeten Kapsel.
 */
const cloudOf = (contentWidth: number, puff = 1): Cloud => {
    const width = Math.max(contentWidth, MIN_WIDTH);
    const r = BODY_H / 2;
    const top = RISE;
    const bottom = RISE + BODY_H;
    const span = width - 2 * r;
    // Die Griffe einer kubischen Kurve auf gleicher Höhe h heben sie um ¾ h.
    const lift = (height: number) => (height * puff) / 0.75;
    const parts = [`M ${r} ${bottom}`, `A ${r} ${r} 0 0 1 ${r} ${top}`];
    let x = r;
    UPPER.forEach(([share, height], index) => {
        const next = index === UPPER.length - 1 ? width - r : x + span * share;
        const chord = next - x;
        const y = fx(top - lift(height));
        parts.push(`C ${fx(x + chord * 0.04)} ${y} ${fx(next - chord * 0.04)} ${y} ${fx(next)} ${top}`);
        x = next;
    });
    parts.push(`A ${r} ${r} 0 0 1 ${fx(width - r)} ${bottom}`);
    LOWER.forEach(([share, height], index) => {
        const next = index === LOWER.length - 1 ? r : x - span * share;
        const chord = x - next;
        const y = fx(bottom + lift(height));
        parts.push(`C ${fx(x - chord * 0.1)} ${y} ${fx(next + chord * 0.1)} ${y} ${fx(next)} ${bottom}`);
        x = next;
    });
    parts.push('Z');
    return { contentWidth, width, height: bottom + DIP, d: parts.join(' ') };
};

const frame = (box: Box, radius: number, shadow: string): Keyframe => ({
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    borderRadius: `${radius}px`,
    boxShadow: shadow,
});

/** Der grosse Schatten des Fensters und der kleine der Kapsel (CSS: --note-shadow / --note-shadow-small). */
const shadowsOf = (card: HTMLElement) => {
    const style = window.getComputedStyle(card);
    return { big: style.boxShadow, small: style.getPropertyValue('--note-shadow-small').trim() || 'none' };
};

/** Das Fenster verlässt für den Flug die Mitte und steht dort, wo es gerade ist. */
const pin = (element: HTMLElement, box: Box) => {
    Object.assign(element.style, {
        position: 'fixed',
        left: `${box.left}px`,
        top: `${box.top}px`,
        width: `${box.width}px`,
        height: `${box.height}px`,
        margin: '0',
    });
};
const unpin = (element: HTMLElement) => {
    for (const key of ['position', 'left', 'top', 'width', 'height', 'margin'] as const) element.style[key] = '';
};

export const BomRevisionNotice = ({
    bomId,
    draft,
    current,
    counts,
}: {
    bomId: string;
    draft: BomRevisionDraft;
    /** Die geltende Revision (Rev.7, solange Rev.8 im Entwurf ist). */
    current: number;
    counts: ChangeCounts | null;
}) => {
    const onceKey = `${bomId}:${draft.revision}`;
    const [mode, setMode] = useState<Mode>(() => (shownOnce.has(onceKey) ? 'bubble' : 'modal'));
    // Nur der erste Auftritt schrumpft von selbst; wer die Wolke öffnet, schliesst selbst.
    const [auto, setAuto] = useState(() => !shownOnce.has(onceKey));
    const [hovered, setHovered] = useState(false);
    const [cloud, setCloud] = useState<Cloud | null>(null);
    // Gerade aus dem Fenster gelandet: die Wolke bläst sich aus der Kapsel auf.
    const [landed, setLanded] = useState(false);
    const bubbleRef = useRef<HTMLButtonElement>(null);
    const contentRef = useRef<HTMLSpanElement>(null);
    const cardRef = useRef<HTMLElement>(null);
    const scrimRef = useRef<HTMLDivElement>(null);
    const okRef = useRef<HTMLButtonElement>(null);
    const flying = useRef(false);
    const inflated = useRef(false);
    const expandFrom = useRef<Box | null>(null);
    const lingered = useRef(false);
    const refocus = useRef(false);
    const titleId = useId();
    const textId = useId();

    useEffect(() => {
        shownOnce.add(onceKey);
    }, [onceKey]);

    // Die Wolke misst ihren Inhalt (und misst nach, wenn die Schrift nachlädt).
    useLayoutEffect(() => {
        const content = contentRef.current;
        if (!content) return undefined;
        const measure = () => {
            const width = Math.ceil(content.offsetWidth);
            if (width > 0) setCloud((shown) => (shown && shown.contentWidth === width ? shown : cloudOf(width)));
        };
        if (typeof ResizeObserver === 'undefined') {
            measure();
            return undefined;
        }
        const observer = new ResizeObserver(measure);
        observer.observe(content);
        return () => observer.disconnect();
    }, []);

    /** Wo die Kapsel der Wolke steht — Ziel und Start des Flugs. */
    const capsule = (): Box | null => {
        const rect = bubbleRef.current?.getBoundingClientRect();
        if (!rect || rect.width === 0) return null;
        return { left: rect.left, top: rect.top + RISE, width: rect.width, height: BODY_H };
    };

    const shrink = useCallback(() => {
        if (flying.current) return;
        const card = cardRef.current;
        const target = capsule();
        refocus.current = Boolean(card?.contains(document.activeElement));
        if (!card || !target || reducedMotion() || typeof card.animate !== 'function') {
            setMode('bubble');
            return;
        }
        flying.current = true;
        // Der Auftritt (CSS) ist fertig, bevor der Flug beginnt.
        card.getAnimations({ subtree: true }).forEach((animation) => animation.finish());
        const from = card.getBoundingClientRect();
        const shadow = shadowsOf(card);
        pin(card, from);
        card.querySelector<HTMLElement>('.ofi-bom-revnote__content')?.animate(
            [{ opacity: 1 }, { opacity: 0 }],
            { duration: 150, easing: 'ease-out', fill: 'forwards' },
        );
        scrimRef.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 420, easing: 'ease', fill: 'forwards' });
        const flight = card.animate(
            [frame(from, CARD_RADIUS, shadow.big), frame(target, BODY_H / 2, shadow.small)],
            { duration: 560, delay: 40, easing: EASE, fill: 'forwards' },
        );
        flight.onfinish = () => {
            flying.current = false;
            inflated.current = false;
            setLanded(true);
            setMode('bubble');
        };
        flight.oncancel = () => { flying.current = false; };
    }, []);

    const expand = () => {
        if (flying.current) return;
        expandFrom.current = capsule();
        setAuto(false);
        setHovered(false);
        setLanded(false);
        setMode('modal');
    };

    /* Gelandet: dieselbe Kapsel wie das Fenster im letzten Bild — dann wachsen
       die Beulen (Umriss, Glas, Glanz und Schatten zugleich) und die Spur. */
    useLayoutEffect(() => {
        if (mode !== 'bubble' || !landed || !cloud || inflated.current) return;
        inflated.current = true;
        const bubble = bubbleRef.current;
        if (!bubble || reducedMotion() || typeof bubble.animate !== 'function') return;
        const flat = cloudOf(cloud.contentWidth, 0).d;
        const timing: KeyframeAnimationOptions = { duration: 540, easing: 'cubic-bezier(0.3, 1.4, 0.5, 1)' };
        bubble.querySelectorAll<HTMLElement>('.ofi-bom-revbubble__glass, .ofi-bom-revbubble__shine').forEach((layer) => {
            layer.animate([{ clipPath: `path('${flat}')` }, { clipPath: `path('${cloud.d}')` }], timing);
        });
        bubble.querySelectorAll('path').forEach((path) => {
            path.animate([{ d: `path('${flat}')` }, { d: `path('${cloud.d}')` }], timing);
        });
    }, [mode, landed, cloud]);

    // Aus der Wolke auf: dieselbe Kapsel fliegt zurück in die Mitte.
    useLayoutEffect(() => {
        if (mode !== 'modal') return;
        const from = expandFrom.current;
        expandFrom.current = null;
        if (!from) return;
        okRef.current?.focus({ preventScroll: true });
        const card = cardRef.current;
        if (!card || reducedMotion() || typeof card.animate !== 'function') return;
        flying.current = true;
        const to = card.getBoundingClientRect();
        const shadow = shadowsOf(card);
        pin(card, to);
        card.querySelector<HTMLElement>('.ofi-bom-revnote__content')?.animate(
            [{ opacity: 0 }, { opacity: 1 }],
            { duration: 220, delay: 270, easing: 'ease-out', fill: 'backwards' },
        );
        scrimRef.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 320, easing: 'ease', fill: 'backwards' });
        const flight = card.animate(
            [frame(from, BODY_H / 2, shadow.small), frame(to, CARD_RADIUS, shadow.big)],
            { duration: 500, easing: EASE },
        );
        const settle = () => {
            flying.current = false;
            unpin(card);
        };
        flight.onfinish = settle;
        flight.oncancel = settle;
    }, [mode]);

    // Wer im Fenster war, landet mit der Tastatur auf der Wolke.
    useEffect(() => {
        if (mode !== 'bubble' || !refocus.current) return;
        refocus.current = false;
        bubbleRef.current?.focus({ preventScroll: true });
    }, [mode]);

    // Von selbst klein — nicht, solange der Zeiger auf dem Fenster ruht.
    useEffect(() => {
        if (mode !== 'modal' || !auto || hovered) return undefined;
        const timer = window.setTimeout(shrink, lingered.current ? HOLD_AFTER_HOVER_MS : HOLD_MS);
        return () => window.clearTimeout(timer);
    }, [mode, auto, hovered, shrink]);

    useEffect(() => {
        if (mode !== 'modal') return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            event.stopPropagation();
            shrink();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [mode, shrink]);

    const bubbleStyle = {
        '--rise': `${RISE}px`,
        '--body': `${BODY_H}px`,
        '--dip': `${DIP}px`,
        width: cloud?.width,
        height: cloud?.height ?? RISE + BODY_H + DIP,
    } as CSSProperties;
    const clip = cloud ? `path('${cloud.d}')` : undefined;
    const open = t('productionBom.revision.bubbleOpen');

    return (
        <>
            <button
                ref={bubbleRef}
                type="button"
                className={`ofi-bom-revbubble ofi-nosize ${mode === 'bubble' && cloud ? `is-shown${landed ? ' is-landing' : ''}` : 'is-hidden'}`}
                style={bubbleStyle}
                aria-haspopup="dialog"
                aria-expanded={mode === 'modal'}
                aria-label={`${t('productionBom.revision.drafting', { revision: draft.revision, current })} — ${open}`}
                title={open}
                tabIndex={mode === 'bubble' ? 0 : -1}
                onClick={expand}
            >
                {cloud && (
                    <svg className="ofi-bom-revbubble__shade" width={cloud.width} height={cloud.height} viewBox={`0 0 ${cloud.width} ${cloud.height}`} aria-hidden>
                        <path d={cloud.d} />
                    </svg>
                )}
                <span className="ofi-bom-revbubble__glass" style={clip ? { clipPath: clip } : undefined} aria-hidden />
                {cloud && (
                    <svg className="ofi-bom-revbubble__shine" width={cloud.width} height={cloud.height} viewBox={`0 0 ${cloud.width} ${cloud.height}`} style={{ clipPath: clip }} aria-hidden>
                        <path d={cloud.d} transform="translate(0 1)" />
                    </svg>
                )}
                {cloud && (
                    <svg className="ofi-bom-revbubble__edge" width={cloud.width} height={cloud.height} viewBox={`0 0 ${cloud.width} ${cloud.height}`} aria-hidden>
                        <path d={cloud.d} />
                    </svg>
                )}
                <span ref={contentRef} className="ofi-bom-revbubble__content" aria-hidden>
                    <FilePen />
                    <b>{t('productionBom.revision.draftPill', { revision: draft.revision })}</b>
                    <small>{t('productionBom.revision.bubbleCurrent', { current })}</small>
                </span>
                <i className="ofi-bom-revbubble__dot is-a" aria-hidden />
                <i className="ofi-bom-revbubble__dot is-b" aria-hidden />
            </button>

            {mode === 'modal' && createPortal(
                <div className={`ofi-bom-pop ofi-bom-revnote${auto ? ' is-auto' : ''}`}>
                    <div ref={scrimRef} className="ofi-bom-revnote__scrim" onMouseDown={shrink} aria-hidden />
                    <section
                        ref={cardRef}
                        role="alertdialog"
                        aria-modal="true"
                        aria-labelledby={titleId}
                        aria-describedby={textId}
                        className="ofi-bom-revnote__card"
                        onPointerEnter={() => {
                            lingered.current = true;
                            setHovered(true);
                        }}
                        onPointerLeave={() => setHovered(false)}
                    >
                        <div className="ofi-bom-revnote__content">
                            <span className="ofi-bom-revnote__icon" aria-hidden><FilePen /></span>
                            <h2 id={titleId} className="ofi-bom-revnote__title">
                                {t('productionBom.revision.drafting', { revision: draft.revision, current })}
                            </h2>
                            <p id={textId} className="ofi-bom-revnote__text">
                                {t('productionBom.revision.draftingHint', { current })}
                            </p>
                            {draft.reason && (
                                <div className="ofi-bom-revnote__reason">
                                    <small>{t('productionBom.revision.reasonLabel')}</small>
                                    <p>{draft.reason}</p>
                                    {draft.createdByName && (
                                        <small className="is-meta">{draft.createdByName} · {shortDate(draft.createdAt)}</small>
                                    )}
                                </div>
                            )}
                            {counts && <ChangeChips counts={counts} />}
                            <button ref={okRef} type="button" className="ofi-bom-revnote__ok ofi-nosize" onClick={shrink}>
                                {t('productionBom.revision.noticeOk')}
                            </button>
                        </div>
                    </section>
                </div>,
                document.body,
            )}
        </>
    );
};
