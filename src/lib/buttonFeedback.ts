import { readMotion, prefersReducedMotion } from './uiMotion';

// Delegation includes portals and controls mounted after startup. No event
// cancellation, pointer capture, DOM scanning or per-control listeners.
const PRESSABLE = 'button, a[href], summary, [role="button"], [role="tab"], [role="option"], [role^="menuitem"], [role="switch"], [role="checkbox"], [role="radio"], input[type="checkbox"], input[type="radio"], [data-motion-press]';
const EXCLUDED = '[data-motion="off"], [inert], [aria-disabled="true"], [disabled], .ant-btn-loading, [draggable="true"], [data-dragging], .ofi-col-grip, [role="slider"], [role="separator"]';
const EDITABLE = 'textarea, select, input:not([type="checkbox"]):not([type="radio"]), [contenteditable]:not([contenteditable="false"])';
type Feedback = { element: HTMLElement; animation: Animation; baseScale: string; baseFilter: string; x: number; y: number };
let installed = false;

const isDismiss = (element: HTMLElement) =>
    element.matches('.ant-modal-close, .ant-drawer-close, [data-motion-dismiss]')
    || Boolean(element.querySelector('[data-motion-dismiss], .lucide-x, .anticon-close'))
    || /^[×✕✖]$/.test(element.textContent?.trim() ?? '')
    || /(?:\bclose\b|\bdismiss\b|schlie[ßs]sen|schließen|kapat)/i.test(`${element.getAttribute('aria-label') ?? ''} ${element.title}`);

export function findPressTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof Element) || target.closest(EDITABLE) || target.closest(EXCLUDED)) return null;
    const label = target.closest('label');
    const control = target instanceof HTMLInputElement ? target : label?.control;
    if (control instanceof HTMLInputElement && control.matches('[type="checkbox"], [type="radio"]')) {
        if (control.matches(':disabled') || control.closest(EXCLUDED)) return null;
        // AntD's input is transparent; animate its visible control, not the label.
        return control.closest<HTMLElement>('.ant-checkbox, .ant-radio') ?? control;
    }
    for (let node: Element | null = target; node && node !== document.body; node = node.parentElement) {
        if (!(node instanceof HTMLElement)) continue;
        if (node.matches(':disabled') || node.matches(EXCLUDED)) return null;
        const cursor = getComputedStyle(node).cursor;
        if (/^(grab|grabbing|.*-resize)$/.test(cursor)) return null;
        if (node.matches(PRESSABLE)) return isDismiss(node) ? null : node;
        // Legacy clickable cards/rows require a click handler AND pointer cursor.
        // A card/section or inherited cursor alone isn't enough.
        if (node.onclick && cursor === 'pointer'
            && !node.matches('label, [role="dialog"], [role="alertdialog"]')) return isDismiss(node) ? null : node;
    }
    return null;
}

export function installButtonFeedback(): void {
    if (installed || typeof document === 'undefined') return;
    installed = true;
    const presses = new Map<number | string, Feedback>();
    const releases = new Map<HTMLElement, Animation>();
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const release = (id: number | string, immediate = false) => {
        const press = presses.get(id);
        if (!press) return;
        presses.delete(id);
        const { element, animation, baseScale, baseFilter } = press;
        const current = getComputedStyle(element);
        const from = { scale: current.scale, filter: current.filter };
        animation.cancel();
        if (immediate || !element.isConnected || prefersReducedMotion()) return;
        const tokens = readMotion(element);
        const out = element.animate([from, { scale: baseScale, filter: baseFilter }], {
            duration: tokens.releaseDuration, easing: tokens.releaseEase,
        });
        releases.set(element, out);
        void out.finished.catch(() => undefined).then(() => {
            if (releases.get(element) === out) releases.delete(element);
        });
    };
    const clear = () => {
        for (const id of presses.keys()) release(id, true);
        for (const animation of releases.values()) animation.cancel();
        releases.clear();
    };
    const press = (element: HTMLElement, id: number | string, x = 0, y = 0) => {
        if (prefersReducedMotion() || !element.animate) return;
        release(id, true);
        for (const [otherId, active] of presses) if (active.element === element) release(otherId, true);
        const returning = releases.has(element) ? getComputedStyle(element) : null;
        const from = returning ? { scale: returning.scale, filter: returning.filter } : null;
        releases.get(element)?.cancel();
        releases.delete(element);
        const css = getComputedStyle(element);
        const baseScale = css.scale === 'none' ? '1' : css.scale;
        const baseFilter = css.filter;
        const tokens = readMotion(element);
        const bounds = element.getBoundingClientRect();
        // At most 1.5px compression on the longest edge, including large rows.
        const ratio = Math.max(tokens.pressScale, 1 - 1.5 / Math.max(bounds.width, bounds.height, 1));
        const compressed = baseScale.split(' ').map(value => Number(value) * ratio).join(' ');
        const animation = element.animate([
            from ?? { scale: baseScale, filter: baseFilter },
            { scale: compressed, filter: `${baseFilter === 'none' ? '' : baseFilter} brightness(1.035)` },
        ], { duration: tokens.pressDuration, easing: tokens.pressEase, fill: 'forwards' });
        presses.set(id, { element, animation, baseScale, baseFilter, x, y });
    };
    const passive = { passive: true, capture: true };
    document.addEventListener('pointerdown', event => {
        if (event.button !== 0 || !event.isPrimary) return;
        const element = findPressTarget(event.target);
        if (!element) return;
        press(element, event.pointerId, event.clientX, event.clientY);
        if (event.pointerType === 'touch' || event.pointerType === 'pen') navigator.vibrate?.(10);
    }, passive);
    document.addEventListener('pointerup', event => release(event.pointerId), passive);
    document.addEventListener('pointercancel', event => release(event.pointerId, true), passive);
    document.addEventListener('pointerout', event => {
        const active = presses.get(event.pointerId);
        if (active && (!(event.relatedTarget instanceof Node) || !active.element.contains(event.relatedTarget))) release(event.pointerId);
    }, passive);
    document.addEventListener('lostpointercapture', event => release(event.pointerId, true), passive);
    document.addEventListener('pointermove', event => {
        const active = presses.get(event.pointerId);
        if (active && Math.hypot(event.clientX - active.x, event.clientY - active.y) > 7) release(event.pointerId, true);
    }, passive);
    document.addEventListener('dragstart', clear, passive);
    document.addEventListener('scroll', clear, passive);
    document.addEventListener('keydown', event => {
        if (event.repeat || (event.key !== 'Enter' && event.key !== ' ')) return;
        const element = findPressTarget(event.target);
        if (element && !(event.key === ' ' && element.matches('a[href]'))) press(element, event.key);
    }, passive);
    document.addEventListener('keyup', event => release(event.key), passive);
    document.addEventListener('focusout', () => { release('Enter', true); release(' ', true); }, passive);
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', clear);
    media.addEventListener('change', clear);
}
