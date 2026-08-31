import { useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Check, ChevronDown } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from './AnchoredPicker';

/**
 * ── AUSWAHLFELD (SelectMenu) ─────────────────────────────────────────────────
 *
 * Der hausweite Ersatz für `<select>`: ein Feld im Kleid der übrigen Eingaben
 * (`.ofi-cal-input`), das beim Öffnen die gemeinsame Trefferliste zeigt —
 * `.ofi-pop.is-list` mit `.ofi-option-row`-Zeilen, dieselbe Fläche wie die
 * Zeilenauswahl im Lager und die Kundensuche. Das Systemsteuerelement sah in
 * den Fenstern und Filterleisten nach Betriebssystem aus, nicht nach der
 * Anwendung — und liess sich weder färben noch mit Zusatzzeilen versehen.
 *
 * Die gewählte Zeile trägt den Haken; Pfeile, Enter und Escape funktionieren
 * wie im alten Feld, ein getippter Buchstabe springt zur ersten passenden
 * Zeile. Auf dem Telefon hängt die Liste am Feld und bleibt scrollbar — kein
 * eigenes Vollbild nötig.
 */

export interface SelectMenuOption {
    value: string;
    label: string;
    /** Graue Zusatzzeile rechts vom Namen (z. B. Personalnummer). */
    hint?: string;
    disabled?: boolean;
}

export const SelectMenu = ({
    value,
    options,
    onChange,
    placeholder = '—',
    disabled = false,
    ariaLabel,
    className = '',
    /** Klasse des Feldes selbst; Vorgabe ist das Formularfeld-Kleid. */
    buttonClassName = 'ofi-cal-input',
    listWidth = 240,
    /** Etwas, das vor dem Namen der gewählten Zeile steht (z. B. ein Zeichen). */
    prefix,
}: {
    value: string;
    options: SelectMenuOption[];
    onChange: (next: string) => void;
    placeholder?: string;
    disabled?: boolean;
    ariaLabel?: string;
    className?: string;
    buttonClassName?: string;
    listWidth?: number;
    prefix?: ReactNode;
}) => {
    const [open, setOpen] = useState(false);
    const [buttonEl, setButtonEl] = useState<HTMLButtonElement | null>(null);
    const [activeIndex, setActiveIndex] = useState(-1);
    /* Buchstabensprung: kurz hintereinander Getipptes wird gesammelt
       («Bu» → Buchhaltung), nach einer Pause beginnt die Suche neu. */
    const typeahead = useRef<{ text: string; at: number }>({ text: '', at: 0 });

    const selectable = useMemo(() => options.filter((option) => !option.disabled), [options]);
    const selected = options.find((option) => option.value === value) ?? null;

    const openList = () => {
        if (disabled) return;
        setActiveIndex(options.findIndex((option) => option.value === value));
        setOpen(true);
    };

    const close = () => {
        setOpen(false);
        setActiveIndex(-1);
    };

    const commit = (next: string) => {
        onChange(next);
        close();
        buttonEl?.focus();
    };

    const move = (direction: 1 | -1) => {
        if (!selectable.length) return;
        const currentValue = activeIndex >= 0 ? options[activeIndex]?.value : value;
        const position = selectable.findIndex((option) => option.value === currentValue);
        const next = position < 0
            ? (direction === 1 ? 0 : selectable.length - 1)
            : Math.min(selectable.length - 1, Math.max(0, position + direction));
        setActiveIndex(options.indexOf(selectable[next]));
    };

    const jumpTo = (character: string) => {
        const now = Date.now();
        const previous = now - typeahead.current.at < 700 ? typeahead.current.text : '';
        const needle = (previous + character).toLowerCase();
        typeahead.current = { text: needle, at: now };
        const hit = selectable.find((option) => option.label.toLowerCase().startsWith(needle));
        if (!hit) return;
        if (open) setActiveIndex(options.indexOf(hit));
        else onChange(hit.value);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
        if (disabled) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) { openList(); return; }
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            if (!open) { openList(); return; }
            const target = activeIndex >= 0 ? options[activeIndex] : null;
            if (target && !target.disabled) commit(target.value);
            return;
        }
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
            return;
        }
        if (event.key === 'Tab' && open) { close(); return; }
        if (event.key.length === 1 && event.key !== ' ') jumpTo(event.key);
    };

    return (
        <div className={`relative min-w-0 ${className}`}>
            <button
                ref={setButtonEl}
                type="button"
                disabled={disabled}
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
                onClick={() => (open ? close() : openList())}
                onKeyDown={onKeyDown}
                className={`${buttonClassName} flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
            >
                {prefix}
                <span className={`min-w-0 flex-1 truncate ${selected ? '' : 'text-slate-400 dark:text-white/45'}`}>
                    {selected ? selected.label : placeholder}
                </span>
                <ChevronDown
                    size={13}
                    aria-hidden
                    className={`shrink-0 text-slate-400 transition-transform dark:text-white/40 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            <AnchoredPicker
                anchorEl={open && !disabled ? buttonEl : null}
                onClose={close}
                width={listWidth}
                maxHeight={320}
            >
                <div role="listbox" aria-label={ariaLabel} className="min-h-0 flex-1 overflow-y-auto py-1">
                    {options.map((option, index) => {
                        const isSelected = option.value === value;
                        return (
                            <button
                                key={option.value || `empty-${index}`}
                                type="button"
                                role="option"
                                aria-selected={isSelected}
                                disabled={option.disabled}
                                // pointerdown statt click: läuft vor dem Blur des Feldes.
                                onPointerDown={(event) => {
                                    if (event.button !== 0 || option.disabled) return;
                                    event.preventDefault();
                                    commit(option.value);
                                }}
                                className={`ofi-option-row flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors disabled:opacity-45 ${
                                    index === activeIndex ? 'is-active' : ''
                                }`}
                            >
                                <span className={`min-w-0 flex-1 truncate text-[12.5px] ${
                                    isSelected
                                        ? 'font-semibold text-slate-900 dark:text-white'
                                        : 'text-slate-700 dark:text-white/80'
                                }`}
                                >
                                    {option.label}
                                </span>
                                {option.hint && (
                                    <span className="shrink-0 text-[11px] text-slate-400 dark:text-white/45">
                                        {option.hint}
                                    </span>
                                )}
                                {isSelected && <Check size={13} className="shrink-0 text-[#272f67] dark:text-[#e6cf9e]" />}
                            </button>
                        );
                    })}
                </div>
            </AnchoredPicker>
        </div>
    );
};
