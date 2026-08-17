import { useEffect } from 'react';

/**
 * Freezes the page while an overlay (modal, anchored dropdown, popover) is open,
 * so opening one — or picking something inside it — can never scroll the page
 * out from under the user.
 *
 * The app scrolls in MainLayout's content column, not the window, so the lock
 * targets the element marked `data-page-scrollport`. Its scrollbar width is
 * added back as padding while frozen: without that the content would jump
 * sideways by the scrollbar's width the moment the overflow is hidden.
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
        const previousPaddingRight = scrollport.style.paddingRight;
        const scrollbarWidth = scrollport.offsetWidth - scrollport.clientWidth;

        if (scrollbarWidth > 0) {
            const currentPadding = Number.parseFloat(window.getComputedStyle(scrollport).paddingRight) || 0;
            scrollport.style.paddingRight = `${currentPadding + scrollbarWidth}px`;
        }
        scrollport.style.overflow = 'hidden';

        return () => {
            scrollport.style.overflow = previousOverflow;
            scrollport.style.paddingRight = previousPaddingRight;
        };
    }, [active]);
};
