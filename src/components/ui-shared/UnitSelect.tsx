import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { selectableUnits, useUnitStore } from '@/store/unitStore';
import { AnchoredPicker } from './AnchoredPicker';
import { CELL_INPUT_CLASS } from './TableKit';

/**
 * MENGENEINHEIT WÄHLEN — Stück, Meter, Kilogramm, Liter, Set, Packung …
 *
 * Die Einheit wird nicht mehr getippt, sondern aus der Liste des Mandanten
 * gewählt (früher ein freies Textfeld: dieselbe Einheit stand als "Stk", "stk"
 * und "Stueck" im Bestand). Das Feld IST das Suchfeld — beim Tippen fällt
 * darunter die Trefferliste auf, wie bei den Zeilenauswahlfeldern im Lager.
 *
 * GESPEICHERT wird nur, was die Liste kennt: beim Verlassen wird ein getippter
 * Text auf die Einheit gebracht, die er benennt, und Text, der KEINE Einheit
 * benennt, wird verworfen. Eine Einheit, die die Liste (noch) nicht kennt —
 * etwa eine stillgelegte auf einem alten Artikel — bleibt sichtbar und geht
 * beim Speichern nicht verloren.
 *
 * Fehlt die passende Einheit, wird sie in den Einstellungen angelegt
 * (Einstellungen → Module → Lager → Einheiten). Das Auswahlfeld trägt dafür
 * KEINE Verknüpfung: es wählt, es verwaltet nicht.
 */

export const UnitSelect = ({
    value,
    onChange,
    disabled = false,
    className = '',
    ariaLabel,
    placeholder,
    listWidth = 260,
}: {
    /** Der gespeicherte Code ("Stk"); leer = noch nichts gewählt. */
    value: string;
    onChange: (next: string) => void;
    disabled?: boolean;
    /** Zusätzliche Klasse am Feld (Breite in der Formulartabelle). */
    className?: string;
    ariaLabel?: string;
    placeholder?: string;
    listWidth?: number;
}) => {
    const units = useUnitStore((state) => state.units);
    const ensure = useUnitStore((state) => state.ensure);
    const loading = useUnitStore((state) => state.loading);

    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState<string | null>(null);
    const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
    const [activeId, setActiveId] = useState<string | null>(null);

    useEffect(() => { void ensure(); }, [ensure]);

    // Wählbar sind die aktiven Einheiten — dazu die bereits gespeicherte, auch
    // wenn sie stillgelegt wurde: sonst wäre der eigene Wert nicht im Feld.
    const options = useMemo(() => {
        const active = selectableUnits(units);
        const current = value.trim();
        const known = active.some((unit) => unit.code.toLowerCase() === current.toLowerCase());
        const own = current && !known ? units.find((unit) => unit.code.toLowerCase() === current.toLowerCase()) : null;
        return own ? [own, ...active] : active;
    }, [units, value]);

    const filtered = useMemo(() => {
        const needle = (query ?? '').trim().toLowerCase();
        if (!needle) return options;
        return options.filter((unit) => `${unit.code} ${unit.name}`.toLowerCase().includes(needle));
    }, [options, query]);

    // Solange nicht getippt wird, zeigt das Feld den gespeicherten Wert.
    const text = query ?? value;
    const activeIndex = activeId ? filtered.findIndex((unit) => unit.id === activeId) : -1;

    const commit = (code: string) => {
        onChange(code);
        setQuery(null);
        setActiveId(null);
        setOpen(false);
    };

    const close = () => {
        setQuery(null);
        setActiveId(null);
        setOpen(false);
    };

    const move = (direction: 1 | -1) => {
        if (!filtered.length) return;
        const next = Math.min(filtered.length - 1, Math.max(0, (activeIndex < 0 ? -1 : activeIndex) + direction));
        setActiveId(filtered[next].id);
    };

    const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            if (!open) { setOpen(true); return; }
            event.preventDefault();
            move(event.key === 'ArrowDown' ? 1 : -1);
            return;
        }
        if (event.key === 'Enter') {
            const target = activeIndex >= 0 ? filtered[activeIndex] : filtered[0];
            if (open && target && (activeIndex >= 0 || query !== null)) {
                event.preventDefault();
                commit(target.code);
            }
            return;
        }
        if (event.key === 'Escape' && open) {
            event.stopPropagation();
            close();
        }
        if (event.key === 'Tab' && open) close();
    };

    const label = ariaLabel ?? t('inv.columns.unit');

    return (
        <div className={`relative ${className}`}>
            <input
                ref={setInputEl}
                value={text}
                disabled={disabled}
                autoComplete="off"
                role="combobox"
                aria-expanded={open}
                aria-label={label}
                placeholder={placeholder ?? t('inv.units.pick')}
                onChange={(event) => {
                    setQuery(event.target.value);
                    setActiveId(null);
                    setOpen(true);
                }}
                onFocus={() => setOpen(true)}
                onBlur={() => {
                    // Beim Verlassen entscheidet die Liste: Getipptes, das genau
                    // eine Einheit benennt, wird auf deren Schreibweise gebracht;
                    // alles andere wird verworfen. Blosses Hineinklicken
                    // (`query === null`) fasst den gespeicherten Wert nicht an.
                    if (query !== null) {
                        const needle = query.trim().toLowerCase();
                        const match = options.find((unit) => unit.code.toLowerCase() === needle)
                            ?? options.find((unit) => unit.name.toLowerCase() === needle);
                        if (match) onChange(match.code);
                        setQuery(null);
                    }
                }}
                onKeyDown={onKeyDown}
                className={`${CELL_INPUT_CLASS} pr-7`}
            />
            <ChevronDown
                size={13}
                aria-hidden
                className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 dark:text-white/40"
            />

            <AnchoredPicker anchorEl={open && !disabled ? inputEl : null} onClose={close} width={listWidth} maxHeight={320}>
                <div className="min-h-0 flex-1 overflow-y-auto py-0.5">
                    {loading && !filtered.length && (
                        <div className="px-2 py-3 text-center text-[12px] text-slate-400 dark:text-white/50">
                            {t('common.loading')}
                        </div>
                    )}
                    {!loading && !filtered.length && (
                        <div className="px-2 py-3 text-center text-[12px] text-slate-400 dark:text-white/50">
                            {t('inv.units.noMatch')}
                        </div>
                    )}
                    {filtered.map((unit, index) => (
                        <button
                            key={unit.id}
                            type="button"
                            title={unit.name}
                            // pointerdown statt click: läuft vor dem Blur des Feldes.
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                commit(unit.code);
                            }}
                            className={`ofi-option-row group flex w-full items-center gap-2 px-2 py-1 text-left transition-colors ${
                                index === activeIndex ? 'is-active' : ''
                            }`}
                        >
                            <span className="w-16 shrink-0 truncate font-mono text-[12px] font-semibold text-slate-900 group-hover:!text-white dark:text-white">
                                {unit.code}
                            </span>
                            <span className="min-w-0 flex-1 truncate text-[12.5px] text-slate-600 group-hover:!text-white/85 dark:text-white/70">
                                {unit.name}
                            </span>
                            {unit.isDefault && (
                                <span className="shrink-0 text-[10.5px] uppercase tracking-wide text-slate-400 group-hover:!text-white/70">
                                    {t('inv.units.defaultShort')}
                                </span>
                            )}
                        </button>
                    ))}
                </div>
            </AnchoredPicker>
        </div>
    );
};
