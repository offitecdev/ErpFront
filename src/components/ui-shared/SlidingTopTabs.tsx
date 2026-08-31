import type { ComponentPropsWithoutRef } from 'react';

type SlidingTopTabsProps = ComponentPropsWithoutRef<'div'> & {
    activeKey: string;
};

/**
 * Tab rail with a CSS-painted active indicator.
 *
 * Every caller marks its active button with `aria-current="page"`, so CSS can
 * paint the indicator without offsetWidth/offsetLeft reads, a ResizeObserver,
 * or a follow-up React render after the large detail page has committed.
 */
export const SlidingTopTabs = ({ activeKey, className = '', children, ...props }: SlidingTopTabsProps) => (
    <div data-sliding-tabs data-active-key={activeKey} className={`relative ${className}`} {...props}>
        {children}
    </div>
);
