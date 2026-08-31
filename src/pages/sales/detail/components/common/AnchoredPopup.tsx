import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type AnchoredPopupProps = {
    /** Element the popup attaches to — usually the trigger button. */
    anchorEl: HTMLElement;
    onClose: () => void;
    children: ReactNode;
    /** Fixed width; defaults to matching the anchor. */
    width?: number;
    /** Extra room to reserve below before the popup flips above the anchor. */
    estimatedHeight?: number;
    className?: string;
};

const GAP = 4;
const EDGE = 8;

/**
 * Portal-mounted panel pinned to an anchor element. Rendered into `document.body`
 * with `position: fixed`, so it is never clipped by a card's `overflow: hidden`
 * or by the table's horizontal scroll container, and it stacks above the page
 * instead of pushing rows down.
 *
 * Repositioning is throttled to one animation frame: reading the anchor's
 * geometry directly in a scroll handler forces the browser to flush layout on
 * every event, which is a measurable stall on long pages.
 */
export const AnchoredPopup = ({
    anchorEl,
    onClose,
    children,
    width,
    estimatedHeight = 280,
    className = '',
}: AnchoredPopupProps) => {
    const [panelEl, setPanelEl] = useState<HTMLDivElement | null>(null);

    const compute = (): React.CSSProperties => {
        if (!anchorEl?.isConnected) return { position: 'fixed', top: -9999, left: -9999 };
        const rect = anchorEl.getBoundingClientRect();
        const panelWidth = width ?? rect.width;
        const left = Math.min(Math.max(EDGE, rect.left), Math.max(EDGE, window.innerWidth - panelWidth - EDGE));
        const openUp = window.innerHeight - rect.bottom < estimatedHeight && rect.top > estimatedHeight;
        return openUp
            ? { position: 'fixed', bottom: window.innerHeight - rect.top + GAP, left, width: panelWidth }
            : { position: 'fixed', top: rect.bottom + GAP, left, width: panelWidth };
    };

    const [style, setStyle] = useState<React.CSSProperties>(compute);

    useEffect(() => {
        let frame = 0;
        const measure = () => {
            frame = 0;
            setStyle(compute());
        };
        const schedule = () => {
            if (frame) return;
            frame = window.requestAnimationFrame(measure);
        };
        measure();
        window.addEventListener('scroll', schedule, true);
        window.addEventListener('resize', schedule);
        return () => {
            if (frame) window.cancelAnimationFrame(frame);
            window.removeEventListener('scroll', schedule, true);
            window.removeEventListener('resize', schedule);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [anchorEl, width, estimatedHeight]);

    useEffect(() => {
        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (panelEl?.contains(target) || anchorEl?.contains(target)) return;
            onClose();
        };
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.stopPropagation();
                onClose();
            }
        };
        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [anchorEl, panelEl, onClose]);

    return createPortal(
        <div
            ref={setPanelEl}
            style={style}
            // `.ofi-tp-menu` — the quote popups' menu surface (index.css "TENDER
            // POPUPS"): rounded card, soft shadow, token colours (dark mode swap).
            className={`ofi-tp-menu z-[999] overflow-hidden ${className}`}
        >
            {children}
        </div>,
        document.body,
    );
};
