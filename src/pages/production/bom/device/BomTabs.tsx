import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

export interface BomTab<K extends string> {
    key: K;
    label: string;
    count?: number;
}

/**
 * ── DIE REITER DER BOM (28.09.2026, Vorgabe Samet) ──────────────────────────
 *
 * «Malzemeler, satın alma talepleri, gelen mallar alt alta — öyle olmasın, en
 *  üstte tabler şeklinde olsun, macOS SwiftUI tabler.» Das Segment von SwiftUI
 * (`Picker(.segmented)`): die graue Kapsel der übrigen Produktionsreiter, die
 * weisse Plakette GLEITET zum gewählten Reiter. Pfeiltasten, Pos1 und Ende
 * wechseln wie in jeder Tableiste; die Zahl daneben zählt die Einträge.
 */
export const BomTabs = <K extends string,>({
    tabs,
    value,
    onChange,
    label,
    idPrefix,
}: {
    tabs: Array<BomTab<K>>;
    value: K;
    onChange: (key: K) => void;
    label: string;
    /** Kennungen für aria-controls/-labelledby: `<idPrefix>-tab-<key>`, `<idPrefix>-panel`. */
    idPrefix: string;
}) => {
    const railRef = useRef<HTMLDivElement>(null);
    const [thumb, setThumb] = useState<{ left: number; width: number } | null>(null);
    // Die erste Lage ohne Gleiten — sonst käme die Plakette beim Öffnen von links.
    const [glide, setGlide] = useState(false);
    const signature = tabs.map((tab) => `${tab.key}:${tab.label}:${tab.count ?? ''}`).join('|');

    useLayoutEffect(() => {
        const rail = railRef.current;
        if (!rail) return undefined;
        const place = () => {
            const button = rail.querySelector<HTMLElement>(`[data-tab="${value}"]`);
            if (!button) return;
            const next = { left: button.offsetLeft, width: button.offsetWidth };
            setThumb((current) => (current && current.left === next.left && current.width === next.width ? current : next));
        };
        place();
        if (typeof ResizeObserver === 'undefined') return undefined;
        /* Die Schrift lädt nach, die Zahlen wachsen — die Plakette misst nach.
           Jeder Reiter einzeln: auf dem Telefon ist die Leiste schmaler als
           ihr Inhalt (sie rollt) und behält ihre Breite, wenn ein Reiter wächst. */
        const observer = new ResizeObserver(place);
        observer.observe(rail);
        rail.querySelectorAll<HTMLElement>('[data-tab]').forEach((button) => observer.observe(button));
        return () => observer.disconnect();
    }, [value, signature]);

    useEffect(() => {
        if (!thumb || glide) return undefined;
        const frame = window.requestAnimationFrame(() => setGlide(true));
        return () => window.cancelAnimationFrame(frame);
    }, [thumb, glide]);

    const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
        const index = tabs.findIndex((tab) => tab.key === value);
        const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
            : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
                : event.key === 'Home' ? 0
                    : event.key === 'End' ? tabs.length - 1
                        : -1;
        if (next < 0 || next === index) return;
        event.preventDefault();
        onChange(tabs[next].key);
        railRef.current?.querySelector<HTMLElement>(`[data-tab="${tabs[next].key}"]`)?.focus();
    };

    return (
        <div ref={railRef} className="ofi-bom-tabs" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
            {thumb && (
                <span
                    className={`ofi-bom-tabs__thumb${glide ? ' is-gliding' : ''}`}
                    style={{ width: thumb.width, transform: `translateX(${thumb.left}px)` }}
                    aria-hidden
                />
            )}
            {tabs.map((tab) => {
                const on = tab.key === value;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        role="tab"
                        id={`${idPrefix}-tab-${tab.key}`}
                        aria-selected={on}
                        aria-controls={`${idPrefix}-panel`}
                        tabIndex={on ? 0 : -1}
                        data-tab={tab.key}
                        className={`ofi-bom-tabs__tab ofi-nosize${on ? ' is-on' : ''}`}
                        onClick={() => { if (!on) onChange(tab.key); }}
                    >
                        {/* Die fette Breite ist vorgehalten — beim Wechsel springt nichts. */}
                        <span className="ofi-bom-tabs__label" data-label={tab.label}><span>{tab.label}</span></span>
                        {tab.count ? <span className="ofi-bom-tabs__count">{tab.count}</span> : null}
                    </button>
                );
            })}
        </div>
    );
};
