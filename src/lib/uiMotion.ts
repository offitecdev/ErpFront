/** CSS is the source of truth for the delegated press interaction. */
export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function readMotion(element: Element = document.documentElement) {
    const style = getComputedStyle(element);
    const number = (name: string, fallback: number) => parseFloat(style.getPropertyValue(name)) || fallback;
    const easing = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
    return {
        pressDuration: number('--motion-press-duration', 85),
        releaseDuration: number('--motion-release-duration', 240),
        pressScale: number('--motion-press-scale', 0.98),
        pressEase: easing('--motion-press-ease', 'cubic-bezier(0.2, 0.8, 0.2, 1)'),
        releaseEase: easing('--motion-release-ease', 'cubic-bezier(0.2, 1.25, 0.3, 1)'),
    };
}
