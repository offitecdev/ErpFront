import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

type IndicatorPosition = {
    left: number;
    width: number;
};

type SlidingTopTabsProps = ComponentPropsWithoutRef<'div'> & {
    activeKey: string;
};

/** A tab rail whose single top indicator glides between active items. */
export const SlidingTopTabs = ({ activeKey, className = '', children, onClickCapture, ...props }: SlidingTopTabsProps) => {
    const railRef = useRef<HTMLDivElement>(null);
    const previousActiveKeyRef = useRef(activeKey);
    const pendingTabClickRef = useRef(false);
    const lastPositionRef = useRef<IndicatorPosition | null>(null);
    const [indicator, setIndicator] = useState<IndicatorPosition | null>(null);
    const [shouldAnimate, setShouldAnimate] = useState(false);

    const updateIndicator = useCallback((animate: boolean) => {
        const rail = railRef.current;
        if (!rail) return;

        const activeTab = Array.from(rail.children).find(
            (child) => child instanceof HTMLElement && child.dataset.tabKey === activeKey,
        );
        if (!(activeTab instanceof HTMLElement)) return;

        const next = { left: activeTab.offsetLeft, width: activeTab.offsetWidth };
        const previous = lastPositionRef.current;
        if (previous && previous.left === next.left && previous.width === next.width) return;

        lastPositionRef.current = next;
        setShouldAnimate(animate);
        setIndicator(next);
    }, [activeKey]);

    useLayoutEffect(() => {
        const activeChanged = previousActiveKeyRef.current !== activeKey;
        previousActiveKeyRef.current = activeKey;
        updateIndicator(activeChanged && pendingTabClickRef.current);
        pendingTabClickRef.current = false;

        const rail = railRef.current;
        if (!rail) return;
        const activeTab = Array.from(rail.children).find(
            (child) => child instanceof HTMLElement && child.dataset.tabKey === activeKey,
        );

        if (typeof ResizeObserver !== 'undefined') {
            const observer = new ResizeObserver(() => updateIndicator(false));
            observer.observe(rail);
            if (activeTab instanceof HTMLElement) observer.observe(activeTab);
            return () => observer.disconnect();
        }

        const handleResize = () => updateIndicator(false);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, [activeKey, updateIndicator]);

    const handleClickCapture: NonNullable<ComponentPropsWithoutRef<'div'>['onClickCapture']> = (event) => {
        const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tab-key]') : null;
        pendingTabClickRef.current = Boolean(target && target.dataset.tabKey !== activeKey);
        onClickCapture?.(event);
    };

    return (
        <div ref={railRef} className={`relative ${className}`} onClickCapture={handleClickCapture} {...props}>
            <span
                aria-hidden="true"
                className={`pointer-events-none absolute left-0 top-0 z-10 h-1 bg-gradient-to-r from-[#1f2654] via-[#303b78] to-[#1f2654] motion-reduce:transition-none dark:from-[#f59e0b] dark:via-[#f6ad24] dark:to-[#f59e0b] ${
                    shouldAnimate ? 'transition-[transform,width,opacity] duration-300 ease-out' : 'transition-none'
                }`}
                style={{
                    width: indicator?.width ?? 0,
                    opacity: indicator ? 1 : 0,
                    transform: `translate3d(${indicator?.left ?? 0}px, 0, 0)`,
                }}
            />
            {children}
        </div>
    );
};
