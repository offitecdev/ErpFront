import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check } from 'lucide-react';

import '@/styles/globalMacSelect.css';

type MenuOption = {
    value: string;
    label: string;
    disabled: boolean;
    group: string | null;
};

type OpenMenu = {
    select: HTMLSelectElement;
    options: MenuOption[];
    selectedIndex: number;
    top: number;
    left: number;
    width: number;
    openAbove: boolean;
};

const selectable = (element: Element | null): HTMLSelectElement | null => {
    if (!element?.closest('[data-production-select-scope]')) return null;
    const select = element?.closest('select');
    if (!(select instanceof HTMLSelectElement)) return null;
    if (select.multiple || select.disabled || select.dataset.nativeSelect === 'true') return null;
    if (select.size > 1) return null;
    return select;
};

const menuFor = (select: HTMLSelectElement): OpenMenu => {
    const rect = select.getBoundingClientRect();
    const options = Array.from(select.options).map((option) => ({
        value: option.value,
        label: option.label || option.text,
        disabled: option.disabled || Boolean(option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled),
        group: option.parentElement instanceof HTMLOptGroupElement ? option.parentElement.label : null,
    }));
    const estimatedHeight = Math.min(292, Math.max(36, options.length * 29 + 10));
    const openAbove = rect.bottom + estimatedHeight > window.innerHeight && rect.top > estimatedHeight;
    const width = Math.min(Math.max(rect.width, 210), Math.max(210, window.innerWidth - 24));
    const left = Math.max(12, Math.min(rect.left, window.innerWidth - width - 12));
    return {
        select,
        options,
        selectedIndex: Math.max(0, select.selectedIndex),
        top: openAbove ? rect.top - 4 : rect.bottom + 4,
        left,
        width,
        openAbove,
    };
};

/**
 * Yalnızca Üretim sayfasının içindeki klasik <select> alanlarını ortak
 * macOS/SwiftUI menüsüyle açar. Diğer modüllerin tasarımı değişmez.
 */
export const ProductionMacSelectMenu = () => {
    const [menu, setMenu] = useState<OpenMenu | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const pointerDown = (event: PointerEvent) => {
            if (menuRef.current?.contains(event.target as Node)) return;
            const select = selectable(event.target as Element | null);
            if (!select) { setMenu(null); return; }
            event.preventDefault();
            select.focus({ preventScroll: true });
            setMenu(menuFor(select));
        };
        const keyDown = (event: globalThis.KeyboardEvent) => {
            const select = selectable(event.target as Element | null);
            if (!select) return;
            if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
                event.preventDefault();
                setMenu(menuFor(select));
            } else if (event.key === 'Escape') setMenu(null);
        };
        const close = () => setMenu(null);
        document.addEventListener('pointerdown', pointerDown, true);
        document.addEventListener('keydown', keyDown, true);
        window.addEventListener('resize', close);
        document.addEventListener('scroll', close, true);
        return () => {
            document.removeEventListener('pointerdown', pointerDown, true);
            document.removeEventListener('keydown', keyDown, true);
            window.removeEventListener('resize', close);
            document.removeEventListener('scroll', close, true);
        };
    }, []);

    useEffect(() => {
        if (!menu) return;
        window.requestAnimationFrame(() => {
            const buttons = menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]');
            buttons?.[menu.selectedIndex]?.focus({ preventScroll: true });
        });
    }, [menu]);

    const choose = (option: MenuOption) => {
        if (!menu || option.disabled) return;
        const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
        setter?.call(menu.select, option.value);
        menu.select.dispatchEvent(new Event('input', { bubbles: true }));
        menu.select.dispatchEvent(new Event('change', { bubbles: true }));
        menu.select.focus({ preventScroll: true });
        setMenu(null);
    };

    const navigateOptions = (event: KeyboardEvent<HTMLDivElement>) => {
        if (!menu) return;
        if (event.key === 'Escape') {
            event.preventDefault();
            menu.select.focus({ preventScroll: true });
            setMenu(null);
            return;
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
        event.preventDefault();
        const rows = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]:not(:disabled)') ?? []);
        const current = rows.indexOf(document.activeElement as HTMLButtonElement);
        const step = event.key === 'ArrowDown' ? 1 : -1;
        rows[(current + step + rows.length) % rows.length]?.focus();
    };

    if (!menu) return null;
    let previousGroup: string | null = null;
    return createPortal(
        <div
            ref={menuRef}
            className={`ofi-production-mac-menu ${menu.openAbove ? 'is-above' : ''}`}
            role="listbox"
            aria-label={menu.select.getAttribute('aria-label') || menu.select.title || undefined}
            style={{ top: menu.top, left: menu.left, width: menu.width }}
            onKeyDown={navigateOptions}
        >
            {menu.options.map((option, index) => {
                const showGroup = option.group && option.group !== previousGroup;
                previousGroup = option.group;
                return (
                    <div key={`${option.value}-${index}`}>
                        {showGroup && <div className="ofi-production-mac-menu__group">{option.group}</div>}
                        <button
                            type="button"
                            role="option"
                            aria-selected={index === menu.selectedIndex}
                            disabled={option.disabled}
                            className={index === menu.selectedIndex ? 'is-selected' : ''}
                            onClick={() => choose(option)}
                        >
                            <span className="ofi-production-mac-menu__check">{index === menu.selectedIndex && <Check size={13} strokeWidth={2.4} />}</span>
                            <span>{option.label}</span>
                        </button>
                    </div>
                );
            })}
        </div>,
        document.body,
    );
};

export default ProductionMacSelectMenu;
