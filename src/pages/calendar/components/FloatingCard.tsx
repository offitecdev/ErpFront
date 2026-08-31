import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { LuMaximize2, LuMinimize2 } from 'react-icons/lu';

import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { useBackDismiss } from '@/lib/backDismiss';
import type { FloatAnchor } from '../calendarShared';

/* The one popup shape of the calendar module (replaces the old bottom sheets,
   user request 17.08.2026): a free-floating card that opens BESIDE the thing it
   belongs to — to the LEFT when there is room, like the reference calendar —
   and is dragged anywhere by its header strip. Its height follows its content;
   the top/bottom edges can also be pulled to stretch it.

   `docked` renders the very same card as a static full-height panel instead
   (the expanded "calendar left, form right" layout) — no portal, no dragging.
   The header's leading icon is the expand/collapse toggle when the caller
   provides one.

   No backdrop: the grid stays readable and clickable behind it, which is the
   whole point of a floating card. Stacked pickers (CenterModal, z 150) still
   open above it. z 120 sits above the app header (z 50), so the card may
   cover it. */

const MARGIN = 10;
const MIN_HEIGHT = 160;
/* `openAt: 'top'` — how far under the viewport edge such a card starts. */
const TOP_MARGIN = 22;
/* Telefon und Tablet sind schmaler als die Karten, die hier bestellt werden
   (440-560px, der Rapport-Editor 1080px). Auf einem solchen Schirm wird die
   Karte KLEINER als die Bestellung, steht MITTIG und still: Verschieben und
   Strecken sind Griffe fuer eine Maus, und eine gezogene Karte haengt auf dem
   kleinen Schirm sofort halb neben dem Bildrand.
   Die Breite MUSS hier fallen und nicht erst im Stilblatt: `placeCard` rechnet
   mit ihr, und mit 500px auf einem 390px-Schirm landet die halbe Karte
   (Schliessen, Weiter) neben dem Bildrand. */
const readViewport = () => (typeof window === 'undefined'
    ? { w: 1280, h: 900 }
    : { w: window.innerWidth, h: window.innerHeight });

/* Ab hier ist der Schirm ein Telefon bzw. ein Tablet (20.08.2026, Vorgabe:
   "die Fenster auf Tablet und Telefon kleiner und mittig, die Knoepfe gleich
   gross und alle auf EINEM Schirm sichtbar"). */
const PHONE_MAX = 640;
const TABLET_MAX = 1024;

/* Luft rund um die Karte. Auf dem Telefon nur ein Rand, auf dem Tablet ein
   sichtbarer Rahmen: dort soll die Karte KLEINER sein als der Schirm, sonst
   liest sie sich wie eine zweite Seite und nicht mehr wie ein Fenster. */
const gutterFor = (vw: number) => (vw <= PHONE_MAX ? 12 : vw <= TABLET_MAX ? 32 : MARGIN);

/* Place the card beside its anchor: LEFT of it if it fits, otherwise right,
   otherwise pinned to the viewport edge. Vertically it starts at the anchor's
   top and slides up just enough to stay fully visible. */
const placeCard = (anchor: FloatAnchor | null, width: number, height: number, openAt: 'center' | 'top' = 'center', prefer: 'left' | 'right' = 'left') => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (!anchor) {
        return {
            x: Math.max(MARGIN, (vw - width) / 2),
            y: openAt === 'top' ? TOP_MARGIN : Math.max(MARGIN, (vh - height) / 2),
        };
    }
    const y0 = Math.min(Math.max(MARGIN, anchor.top - 8), Math.max(MARGIN, vh - height - MARGIN));
    /* `prefer: 'right'` — die Karte steht RECHTS neben ihrem Anker und springt
       nie auf dessen linke Seite (Vorgabe Samet, 29.08.2026: eine Aufgabe aus
       der rechten Spalte des Bretts öffnete ihr Fenster über der LINKEN
       Spalte, weit weg von der Karte, zu der es gehört). Reicht der Platz
       rechts nicht, rückt sie an den rechten Bildrand — sie bleibt damit auf
       der Seite, auf der man geklickt hat. */
    if (prefer === 'right') {
        const x = Math.max(MARGIN, Math.min(anchor.right + 14, vw - width - MARGIN));
        return { x, y: y0 };
    }
    let x = anchor.left - width - 14;
    // Left with a comfortable gap; else left flush against the viewport edge as
    // long as it still clears the block; else to the right; else pinned.
    if (x < MARGIN && MARGIN + width <= anchor.left - 4) x = MARGIN;
    if (x < MARGIN) x = anchor.right + 14;
    if (x + width > vw - MARGIN) x = Math.min(Math.max(MARGIN, anchor.left), vw - width - MARGIN);
    return { x: Math.max(MARGIN, x), y: y0 };
};

export const FloatingCard = ({
    open,
    onClose,
    title,
    subtitle,
    anchor,
    width = 480,
    headerActions,
    footer,
    closeOnOutside = false,
    closeOnEscape = true,
    closeOnBack = false,
    bodyClassName,
    docked = false,
    expanded = false,
    onToggleExpand,
    centered = false,
    openAt = 'center',
    prefer = 'left',
    leading,
    initialHeight,
    className,
    children,
}: {
    open: boolean;
    onClose: () => void;
    title: ReactNode;
    subtitle?: ReactNode;
    /* Where the card should appear; it is only the STARTING point — dragging
       moves it from there and the anchor is not consulted again. */
    anchor?: FloatAnchor | null;
    width?: number;
    headerActions?: ReactNode;
    footer?: ReactNode;
    /* Read-only cards close when the grid is clicked; forms never do — a
       half-typed appointment must not vanish on a stray click. */
    closeOnOutside?: boolean;
    closeOnEscape?: boolean;
    /* Der Zurück-Griff (Browser-Pfeil, Telefontaste, Wischgeste) schliesst
       DIESES Fenster, statt die Seite darunter zu verlassen — siehe
       lib/backDismiss.ts. Bewusst bestellt und nicht überall an: eine Seite,
       die selbst am Verlauf arbeitet (die Angebotsmaske mit ihrer Schranke für
       ungespeicherte Änderungen), soll sich diesen Griff nicht teilen müssen. */
    closeOnBack?: boolean;
    bodyClassName?: string;
    /* Static full-height panel instead of a floating card. */
    docked?: boolean;
    /* Shown as the leading header icon (expand <-> collapse) when provided. */
    expanded?: boolean;
    onToggleExpand?: () => void;
    /* Open in the middle of the viewport instead of beside the anchor (the
       quote popups, user request 17.08.2026); dragging still moves it. */
    centered?: boolean;
    /* Where a centred card starts vertically. 'top' parks it just under the
       viewport edge instead of in the middle — for a card whose content GROWS
       while it is used (the delivery report gains a block per checklist): a
       middle-placed card would be pushed up step by step as it fills, so the
       work surface would move under the pointer. Horizontal centring is
       unaffected, and dragging still overrides it. */
    openAt?: 'center' | 'top';
    /* Auf WELCHER Seite des Ankers die Karte aufgeht. Vorgabe bleibt 'left'
       (der Kalender öffnet seine Fenster links neben dem Block, wie das
       Vorbild); 'right' hält sie auf der rechten Seite und rückt sie notfalls
       an den Bildrand, statt auf die andere Hälfte des Schirms zu springen —
       siehe placeCard. */
    prefer?: 'left' | 'right';
    /* Rendered between the grip icon and the title — the reports popup puts
       its "back" arrow there so the card keeps ONE header strip. */
    leading?: ReactNode;
    /* Start at a fixed height instead of following the content (work surfaces
       that must open big); the edges still resize it from there. */
    initialHeight?: number;
    /* Extra class on the card itself (a module's own paint). */
    className?: string;
    children: ReactNode;
}) => {
    const cardRef = useRef<HTMLElement | null>(null);
    const [viewport, setViewport] = useState(readViewport);
    const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
    /* null = follow the content; a number once the user pulled an edge. */
    const [height, setHeight] = useState<number | null>(null);
    const dragRef = useRef<{ offsetX: number; offsetY: number } | null>(null);
    const resizeRef = useRef<{ edge: 'top' | 'bottom'; originY: number; baseY: number; baseHeight: number } | null>(null);

    /* Re-place on open (and whenever the anchor changes), never while dragging:
       the first pass guesses from the requested width, the layout effect below
       corrects it once the real height is known. */
    /* Centred cards: the first layout pass re-centres on the REAL height, and
       only that once — afterwards the card stays where it is (or where the
       user dragged it) and is merely kept inside the viewport. */
    const centerPendingRef = useRef(false);

    /* Drehen des Tablets / Fenster ziehen: die Karte muss beim naechsten Mal mit
       der NEUEN Breite rechnen, sonst haengt sie halb neben dem Schirm. */
    useEffect(() => {
        const onResize = () => setViewport(readViewport());
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    /* Die tatsaechliche Breite der Karte: die bestellte, hoechstens aber der
       Schirm abzueglich seines Randes. */
    const gutter = gutterFor(viewport.w);
    const cardWidth = Math.min(width, Math.max(240, viewport.w - 2 * gutter));
    /* Telefon und Tablet: die Karte steht MITTIG und still. Ziehen und Strecken
       sind Mausgriffe (die 7px-Kante trifft kein Finger), und eine gezogene
       Karte haengt auf dem kleinen Schirm sofort halb neben dem Bildrand. */
    const compact = viewport.w <= TABLET_MAX;
    /* "Der Schirm hat entschieden": die bestellte Breite hat nicht gepasst —
       auch am Schreibtisch, wenn das Fenster kleiner gezogen wird. */
    const narrow = cardWidth < width;
    const movable = !docked && !compact && !narrow;

    useEffect(() => {
        if (!open) { setPos(null); setHeight(null); return; }
        // Eine stillstehende Karte wird IMMER mittig gesetzt, eine ziehbare nur,
        // wenn sie es bestellt hat.
        centerPendingRef.current = centered || !movable;
        // A changed `initialHeight` (the maximise toggle) re-sizes and, for a
        // centred card, re-centres — the user's own drag/stretch is only
        // dropped when the caller actually asks for a new size.
        // Eine bestellte Hoehe darf nie hoeher sein als der Schirm — sonst
        // faellt die Fusszeile mit den Knoepfen unter den Bildrand. Gemessen
        // wird am `window`, nicht am Zustand oben: sonst haenge die Wirkung an
        // `viewport.h`, und JEDES Ziehen am Fensterrand setzte eine gezogene
        // oder gestreckte Karte wieder in die Mitte zurueck.
        const startHeight = initialHeight
            ? Math.min(initialHeight, Math.max(MIN_HEIGHT, window.innerHeight - 2 * gutter))
            : null;
        setHeight(startHeight);
        // Kleiner Schirm (oder angedockt): kein Anker mehr. Es gibt kein
        // "daneben" — die Karte steht mittig, und die Messung unten rueckt sie
        // auf ihre echte Hoehe nach.
        if (!movable) setPos({ x: Math.max(gutter, (window.innerWidth - cardWidth) / 2), y: gutter });
        else setPos(placeCard(centered ? null : (anchor ?? null), cardWidth, startHeight ?? 460, openAt, prefer));
    }, [open, anchor, cardWidth, movable, centered, initialHeight, openAt, prefer, gutter]);

    useLayoutEffect(() => {
        if (!open || !cardRef.current || dragRef.current || resizeRef.current) return;
        const actual = cardRef.current.offsetHeight;
        /* Mittig setzen: einmal beim Oeffnen — und bei einer STILLSTEHENDEN
           Karte (Telefon/Tablet) nach jeder Inhaltsaenderung, damit sie auch
           beim Wachsen mittig bleibt. 'top' bleibt oben, rutscht aber hoch,
           sobald die Karte sonst unten hinausliefe. */
        if (centerPendingRef.current || !movable) {
            centerPendingRef.current = false;
            const measured = cardRef.current.offsetWidth || cardWidth;
            const x = Math.max(gutter, (window.innerWidth - measured) / 2);
            const y = openAt === 'top'
                ? Math.max(gutter, Math.min(TOP_MARGIN, window.innerHeight - actual - gutter))
                : Math.max(gutter, (window.innerHeight - actual) / 2);
            setPos((current) => (
                current && Math.abs(current.x - x) < 0.5 && Math.abs(current.y - y) < 0.5 ? current : { x, y }
            ));
            return;
        }
        setPos((current) => {
            if (!current) return current;
            const maxY = window.innerHeight - actual - MARGIN;
            const y = Math.min(Math.max(MARGIN, current.y), Math.max(MARGIN, maxY));
            return y === current.y ? current : { ...current, y };
        });
        // `pos` is a dependency on purpose: the card only exists once `pos` is
        // set, so the pass that measures the real height must run right after
        // that first placement (the deps above alone would not fire it).
    }, [open, children, width, pos, openAt, movable, gutter, cardWidth]);

    /* Zurück-Griff = dieses Fenster zu (Vorgabe 12.09.2026). Er steht neben
       Escape, nicht an seiner Stelle: die Taste hat die Maus, den Griff hat
       das Telefon. */
    useBackDismiss(Boolean(open && closeOnBack), onClose);

    useEffect(() => {
        if (!open || !closeOnEscape) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            // A stacked picker (CenterModal) owns Escape while it is open.
            if (document.querySelector('[data-cal-stacked="1"]')) return;
            onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, closeOnEscape, onClose]);

    useEffect(() => {
        if (!open || !closeOnOutside) return;
        const onDown = (event: PointerEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('.ofi-float-card')) return;
            /* Angeheftete Auswahlflächen (SelectMenu-Liste, DateField-Kalender)
               liegen als PORTAL auf document.body — sie gehören zur Karte,
               stehen im Baum aber ausserhalb. Ein Klick auf ihre Monatspfeile
               darf die Karte nicht schliessen (Vorfall 27.08.2026). */
            if (target?.closest('.ofi-quick-pop')) return;
            /* Dasselbe für ein Untenfenster über der Karte (Sprungfenster aus
               einer Liste heraus): solange es offen ist, gehört jeder Klick ihm. */
            if (target?.closest('.ofi-sheet') || document.querySelector('.ofi-sheet-backdrop')) return;
            onClose();
        };
        // `capture` so a chip's own pointerdown does not race the close.
        window.addEventListener('pointerdown', onDown, true);
        return () => window.removeEventListener('pointerdown', onDown, true);
    }, [open, closeOnOutside, onClose]);

    /* Move by the grip. Window listeners (not pointer capture) so a re-render
       mid-drag cannot drop the pointer. */
    const startDrag = useCallback((event: React.PointerEvent<HTMLElement>) => {
        if (event.button !== 0 || !pos || !movable) return;
        if ((event.target as HTMLElement).closest('button')) return;
        event.preventDefault();
        dragRef.current = { offsetX: event.clientX - pos.x, offsetY: event.clientY - pos.y };
        const onMove = (moveEvent: PointerEvent) => {
            const drag = dragRef.current;
            if (!drag) return;
            const measured = cardRef.current?.offsetWidth ?? cardWidth;
            // Keep at least the grip strip on screen in every direction.
            const x = Math.min(Math.max(-measured + 80, moveEvent.clientX - drag.offsetX), window.innerWidth - 80);
            const y = Math.min(Math.max(0, moveEvent.clientY - drag.offsetY), window.innerHeight - 44);
            setPos({ x, y });
        };
        const onUp = () => {
            dragRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [pos, cardWidth, movable]);

    /* Stretch by an edge: the bottom edge changes the height, the top edge
       changes the height AND keeps the bottom where it was. */
    const startResize = useCallback((event: React.PointerEvent<HTMLElement>, edge: 'top' | 'bottom') => {
        if (event.button !== 0 || !pos || !cardRef.current || !movable) return;
        event.preventDefault();
        event.stopPropagation();
        resizeRef.current = { edge, originY: event.clientY, baseY: pos.y, baseHeight: cardRef.current.offsetHeight };
        const onMove = (moveEvent: PointerEvent) => {
            const resize = resizeRef.current;
            if (!resize) return;
            const dy = moveEvent.clientY - resize.originY;
            if (resize.edge === 'bottom') {
                setHeight(Math.max(MIN_HEIGHT, Math.min(resize.baseHeight + dy, window.innerHeight - resize.baseY - MARGIN)));
            } else {
                const nextHeight = Math.max(MIN_HEIGHT, resize.baseHeight - dy);
                const nextY = Math.max(0, resize.baseY + (resize.baseHeight - nextHeight));
                setHeight(nextHeight);
                setPos((current) => (current ? { ...current, y: nextY } : current));
            }
        };
        const onUp = () => {
            resizeRef.current = null;
            window.removeEventListener('pointermove', onMove);
            window.removeEventListener('pointerup', onUp);
            window.removeEventListener('pointercancel', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
        window.addEventListener('pointercancel', onUp);
    }, [pos, movable]);

    if (!open || (!docked && !pos)) return null;

    const header = (
        <header className={`ofi-float-card__grip ${docked ? 'is-docked' : ''} ${movable ? '' : 'is-static'}`} onPointerDown={movable ? startDrag : undefined}>
            {/* Der Griffbalken faellt weg, wo nichts zu greifen ist. */}
            {onToggleExpand ? (
                <button
                    type="button"
                    aria-label={expanded ? t('calendar.create.collapse') : t('calendar.create.expand')}
                    title={expanded ? t('calendar.create.collapse') : t('calendar.create.expand')}
                    onClick={onToggleExpand}
                    className="ofi-float-card__iconbtn"
                >
                    {expanded ? <LuMinimize2 size={16} /> : <LuMaximize2 size={16} />}
                </button>
            ) : movable ? (
                <span className="ofi-float-card__gripicon" aria-hidden><i /><i /></span>
            ) : null}
            {leading}
            <span className="min-w-0 flex-1">
                <span className="ofi-float-card__title">{title}</span>
                {subtitle && <span className="ofi-float-card__subtitle">{subtitle}</span>}
            </span>
            {/* Eigenes Element, damit die Knopfreihe auf dem kleinen Schirm als
                GANZES unter den Titel rutschen kann (index.css, "FENSTER AUF
                TELEFON UND TABLET") — im selben <span> wie das Kreuz waere sie
                mit ihm zusammen gewandert. */}
            {headerActions ? <span className="ofi-float-card__actions">{headerActions}</span> : null}
            <span className="flex shrink-0 items-center gap-1">
                <button
                    type="button"
                    aria-label={t('common.close')}
                    onClick={onClose}
                    className="ofi-float-card__iconbtn"
                >
                    <X size={18} />
                </button>
            </span>
        </header>
    );

    if (docked) {
        return (
            <section role="dialog" aria-label={typeof title === 'string' ? title : undefined} className={`ofi-float-card is-docked ${className || ''}`}>
                {header}
                <div className={`ofi-float-card__body ${bodyClassName || ''}`}>{children}</div>
                {footer && <div className="ofi-float-card__footer">{footer}</div>}
            </section>
        );
    }

    return createPortal(
        <section
            ref={cardRef}
            role="dialog"
            aria-label={typeof title === 'string' ? title : undefined}
            className={`ofi-float-card ${compact ? 'is-compact' : ''} ${narrow ? 'is-narrow' : ''} ${className || ''}`}
            style={{ left: pos!.x, top: pos!.y, width: cardWidth, height: height ?? undefined }}
        >
            {movable && <span className="ofi-float-card__edge is-top" onPointerDown={(event) => startResize(event, 'top')} aria-hidden />}
            {header}
            <div className={`ofi-float-card__body ${bodyClassName || ''}`}>{children}</div>
            {footer && <div className="ofi-float-card__footer">{footer}</div>}
            {movable && <span className="ofi-float-card__edge is-bottom" onPointerDown={(event) => startResize(event, 'bottom')} aria-hidden />}
        </section>,
        document.body,
    );
};
