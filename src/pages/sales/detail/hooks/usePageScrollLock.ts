import { useEffect } from 'react';

/**
 * Freezes the page while an overlay (modal, anchored dropdown, popover) is open,
 * so opening one — or picking something inside it — can never scroll the page
 * out from under the user.
 *
 * The app scrolls in MainLayout's content column, not the window, so the lock
 * targets the element marked `data-page-scrollport`. MainLayout permanently
 * reserves its scrollbar gutter, so freezing it needs no synchronous geometry
 * or computed-style reads.
 *
 * Nested overlays are safe: each lock records the inline values it replaced and
 * restores exactly those, so an inner overlay closing cannot unfreeze a page an
 * outer one still wants held.
 */
export const usePageScrollLock = (active: boolean) => {
    useEffect(() => {
        if (!active) return;
        const scrollport = document.querySelector<HTMLElement>('[data-page-scrollport]');
        if (!scrollport) return;

        const previousOverflow = scrollport.style.overflow;
        scrollport.style.overflow = 'hidden';

        return () => {
            scrollport.style.overflow = previousOverflow;
        };
    }, [active]);
};
