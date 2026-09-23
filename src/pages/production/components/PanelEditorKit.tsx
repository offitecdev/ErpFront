import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';

/**
 * Die Pano-Seiten tragen KEINEN eigenen Zurück-Knopf (Vorgabe Samet,
 * 21.09.2026 — dieselbe Regel wie im übrigen Programm, siehe lib/backNav.ts):
 * hier stand ein Pfeil links vor dem Titel, der den Inhalt einrückte und an
 * einer anderen Stelle sass als der Rückweg aller anderen Seiten. Der Rückweg
 * wohnt in der Leiste (Blitz ⇄ Pfeil), die Seite beginnt mit ihrem Titel.
 */
export const PanelEditorPage = ({ title, subtitle, children }: {
    title: ReactNode;
    subtitle?: ReactNode;
    children: ReactNode;
}) => (
    <div className="ofi-panel-editor-page">
        <header className="ofi-panel-page-head">
            <div>
                <h1>{title}</h1>
                {subtitle && <p>{subtitle}</p>}
            </div>
        </header>
        {children}
    </div>
);

export const PanelPageSection = ({ title, description, children }: {
    title?: ReactNode;
    description?: ReactNode;
    children: ReactNode;
}) => (
    <section className="ofi-panel-page-section">
        {(title || description) && (
            <header>
                {title && <h2>{title}</h2>}
                {description && <p>{description}</p>}
            </header>
        )}
        {children}
    </section>
);

export const PanelPageField = ({ label, required, hint, wide = false, children }: {
    label: ReactNode;
    required?: boolean;
    hint?: ReactNode;
    wide?: boolean;
    children: ReactNode;
}) => (
    <label className={`ofi-panel-page-field ${wide ? 'is-wide' : ''}`}>
        <span>{label}{required && <b aria-hidden="true">*</b>}</span>
        {children}
        <small aria-hidden={!hint}>{hint ?? '\u00a0'}</small>
    </label>
);

export const PanelPageNotice = ({ children, danger = false }: { children: ReactNode; danger?: boolean }) => (
    <div className={`ofi-panel-page-notice ${danger ? 'is-danger' : ''}`}>{children}</div>
);

export const PanelPageActions = ({ children }: { children: ReactNode }) => (
    <div className="ofi-panel-page-actions">{children}</div>
);

export interface PanelSelectOption {
    value: string;
    label: string;
}

/**
 * SwiftUI/macOS popup-button görünümü. Tarayıcının işletim sistemine göre
 * değişen select menüsünü kullanmaz; Windows'ta da seçili satır tiki ve mavi
 * odak satırı aynı görünür.
 */
export const PanelMacSelect = ({ value, options, onChange, disabled = false, ariaLabel }: {
    value: string;
    options: PanelSelectOption[];
    onChange: (value: string) => void;
    disabled?: boolean;
    ariaLabel: string;
}) => {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const selected = options.find((option) => option.value === value) ?? options[0] ?? null;

    useEffect(() => {
        if (!open) return undefined;
        const close = (event: PointerEvent) => {
            if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
        };
        document.addEventListener('pointerdown', close);
        return () => document.removeEventListener('pointerdown', close);
    }, [open]);

    const keyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        if (event.key === 'Escape') { setOpen(false); return; }
        if (event.key === 'Enter' || event.key === ' ' || event.key === 'ArrowDown') {
            event.preventDefault();
            setOpen(true);
        }
    };

    return (
        <div className={`ofi-panel-mac-select ${open ? 'is-open' : ''}`} ref={rootRef}>
            <button
                type="button"
                className="ofi-panel-mac-select__trigger"
                aria-label={ariaLabel}
                aria-haspopup="listbox"
                aria-expanded={open}
                disabled={disabled}
                onClick={() => setOpen((current) => !current)}
                onKeyDown={keyDown}
            >
                <span>{selected?.label ?? '—'}</span><ChevronsUpDown size={12} aria-hidden="true" />
            </button>
            {open && (
                <div className="ofi-panel-mac-select__menu" role="listbox" aria-label={ariaLabel}>
                    {options.map((option) => (
                        <button
                            type="button"
                            role="option"
                            aria-selected={option.value === value}
                            className={option.value === value ? 'is-selected' : ''}
                            key={option.value}
                            onClick={() => { onChange(option.value); setOpen(false); }}
                        >
                            <span className="ofi-panel-mac-select__check">{option.value === value && <Check size={13} strokeWidth={2.4} />}</span>
                            <span>{option.label}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
