import { useEffect, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * Yazılan hücreye tutunan hızlı liste kabuğu. Hücrenin hemen ALTINDAN açılır ve
 * liste aşağı doğru büyür; yalnızca aşağıda yer kalmadığında yukarı çevrilir.
 * Genişlik hücreyi izler (dar tutulur), sayfa kaydıkça hücreyi takip eder.
 * Perde yok: dışarı tıklamak ya da Esc kapatır.
 *
 * Envanterdeki bütün satır içi seçiciler (ürün/malzeme, tedarikçi) bunu paylaşır.
 */
const EDGE = 8;

interface Placement {
    style: CSSProperties;
    /** Höhe, die der Inhalt (ohne Fusszeile) höchstens bekommt. */
    bodyMax: number;
}

/**
 * Natürliche Höhe des Inhalts: die Kinder des begrenzten Körpers einzeln
 * gemessen (scrollHeight zählt auch das, was eine scrollende Liste gerade
 * versteckt) plus die Fusszeile.
 */
const naturalHeight = (panelEl: HTMLDivElement | null): { body: number; footer: number } | null => {
    if (!panelEl) return null;
    const body = panelEl.firstElementChild as HTMLElement | null;
    if (!body) return null;
    let height = 0;
    for (const child of Array.from(body.children) as HTMLElement[]) height += Math.max(child.scrollHeight, child.offsetHeight);
    const footer = (panelEl.children[1] as HTMLElement | undefined)?.offsetHeight ?? 0;
    return { body: height, footer };
};

/*
 * Richtung nach Platz (13.09.2026, Samet: «ekrandan çıkmasın»): passt der
 * Inhalt unter den Auslöser, geht er nach unten; sonst nach oben, wenn er dort
 * passt; passt er nirgends ganz, auf die Seite mit mehr Platz — und die Liste
 * wird auf genau diesen Platz begrenzt und scrollt. Das Fenster verlässt den
 * Bildschirm nie.
 */
const computePlacement = (anchorEl: HTMLElement, width: number, maxHeight: number, panelEl: HTMLDivElement | null, exactWidth = false, arrow = false): Placement => {
    // Savunma: kopmuş bir çapa sayfayı çökertmemeli.
    if (!anchorEl?.isConnected) return { style: { position: 'fixed', top: -9999, left: -9999, width }, bodyMax: maxHeight };
    const rect = anchorEl.getBoundingClientRect();
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    const panelWidth = Math.min(exactWidth ? width : Math.max(rect.width, width), 420, viewportW - EDGE * 2);
    // Callouts open symmetrically around their trigger; clamp only at the viewport edge.
    const preferredLeft = arrow ? rect.left + (rect.width - panelWidth) / 2 : rect.left;
    const left = Math.min(Math.max(EDGE, preferredLeft), Math.max(EDGE, viewportW - panelWidth - EDGE));

    const measured = naturalHeight(panelEl);
    const footer = measured?.footer ?? 0;
    const gap = arrow ? 12 : 2;
    const frame = arrow ? 4 : 0;
    const wanted = Math.min(maxHeight, measured ? measured.body : maxHeight) + footer + frame;
    const spaceBelow = viewportH - rect.bottom - gap - EDGE;
    const spaceAbove = rect.top - gap - EDGE;

    let up: boolean;
    if (wanted <= spaceBelow) up = false;
    else if (wanted <= spaceAbove) up = true;
    else up = spaceAbove > spaceBelow;

    const room = Math.max(up ? spaceAbove : spaceBelow, 0);
    const bodyMax = Math.max(Math.min(maxHeight, room - footer - frame), 48);
    const style: CSSProperties = up
        ? { position: 'fixed', bottom: viewportH - rect.top + gap, left, width: panelWidth, maxHeight: room }
        : { position: 'fixed', top: rect.bottom + gap, left, width: panelWidth, maxHeight: room };
    if (arrow) Object.assign(style, { '--ofi-selection-arrow-x': `${Math.max(24, Math.min(rect.left + rect.width / 2 - left, panelWidth - 24))}px` });
    return { style, bodyMax };
};

export const AnchoredPicker = ({
    anchorEl,
    onClose,
    width = 360,
    maxHeight = 420,
    footer,
    panelClassName = '',
    exactWidth = false,
    arrow = false,
    ariaLabel,
    children,
}: {
    /** Seçicinin tutunduğu hücre; null ise seçici kapalıdır. */
    anchorEl: HTMLElement | null;
    onClose: () => void;
    width?: number;
    maxHeight?: number;
    footer?: ReactNode;
    /** Zusätzliche Klasse am Panel — für Oberflächen mit eigenem Kleid. */
    panelClassName?: string;
    /** true = genau `width`, nicht so breit wie der Auslöser (Kalender). */
    exactWidth?: boolean;
    /** Opt-in callout; used only by the task sheet's two selection fields. */
    arrow?: boolean;
    ariaLabel?: string;
    children: ReactNode;
}) => {
    const [placement, setPlacement] = useState<Placement>({ style: { position: 'fixed', top: -9999, left: -9999 }, bodyMax: maxHeight });
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

    // Hücreyi takip et: kaydırma/boyutlandırma başına tek ölçüm (kare başına
    // bir rAF) — her olayda getBoundingClientRect okumak zorunlu reflow demek.
    useEffect(() => {
        if (!anchorEl) return;
        let frame = 0;
        const measure = () => {
            frame = 0;
            setPlacement((current) => {
                const next = computePlacement(anchorEl, width, maxHeight, panelEl, exactWidth, arrow);
                const same = current.bodyMax === next.bodyMax
                    && JSON.stringify(current.style) === JSON.stringify(next.style);
                return same ? current : next;
            });
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(measure);
        };
        measure();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        // Sheets/modals slide in with a transform: a picker opened mid-animation
        // measures the anchor at its ORIGINAL (off-screen) spot. Re-measure when
        // any animation/transition settles so the panel snaps to the real place.
        window.addEventListener('animationend', schedule, true);
        window.addEventListener('transitionend', schedule, true);
        // Inhalt wächst/schrumpft (Suche filtert, Daten kommen an) → neu messen.
        const mutations = panelEl ? new MutationObserver(schedule) : null;
        mutations?.observe(panelEl as HTMLDivElement, { childList: true, subtree: true, characterData: true });
        return () => {
            mutations?.disconnect();
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
            window.removeEventListener('animationend', schedule, true);
            window.removeEventListener('transitionend', schedule, true);
        };
    }, [anchorEl, width, maxHeight, panelEl, exactWidth, arrow]);

    // Dışarı tıklama (panel ve çapa hariç) ya da Esc kapatır.
    useEffect(() => {
        if (!anchorEl) return;
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl.contains(target)) return;
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (arrow) { event.preventDefault(); event.stopPropagation(); anchorEl.focus(); }
            onClose();
        };
        document.addEventListener('mousedown', onPointerDown);
        window.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [anchorEl, panelEl, onClose, arrow]);

    if (!anchorEl) return null;

    return createPortal(
        <div
            ref={setPanelEl}
            role="dialog"
            aria-label={ariaLabel}
            data-callout-side={arrow ? (placement.style.bottom !== undefined ? 'above' : 'below') : undefined}
            style={placement.style}
            /* `.ofi-pop.is-list` = die Trefferliste der gemeinsamen
               Fensteroberfläche (index.css, "FENSTER-OBERFLÄCHE"): 10px, also
               eine Stufe weniger rund als ein Fenster — sie hängt an einem Feld
               und ist keine eigene Fläche. `rounded-md` kam vorher als 2px an,
               die Liste war das einzige scharfkantige Stück der Kundensuche. */
            className={`ofi-quick-pop ofi-pop is-list z-[1100] flex flex-col overflow-hidden ${panelClassName}`}
        >
            <div className="flex min-h-0 flex-col" style={{ maxHeight: placement.bodyMax }}>{children}</div>
            {footer && <div className="ofi-pop__rule border-t">{footer}</div>}
        </div>,
        document.body,
    );
};
