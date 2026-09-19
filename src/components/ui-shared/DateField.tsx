import { useState } from 'react';
import dayjs from 'dayjs';

import { Calendar } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from './AnchoredPicker';
import { MacCalendar } from './MacCalendar';

/**
 * ── DATUMSFELD (hausweit) ────────────────────────────────────────────────────
 *
 * Der Ersatz für `<input type="date">`: ein Feld im Kleid der übrigen Eingaben
 * (`.ofi-cal-input`), das beim Öffnen einen selbst gezeichneten Monat zeigt —
 * dieselbe Bauart wie der Kalender der Angebotsseite (`QuoteDatePicker`), aber
 * auf der gemeinsamen `AnchoredPicker`-Fläche und mit `max`, damit die
 * Personalfilter «höchstens ein Monat» durchsetzen können.
 *
 * Das Systemsteuerelement zeichnete den Kalender des BETRIEBSSYSTEMS: eigene
 * Grösse, eigene Sprache, im Dunkelmodus weiss, in Safari gar keiner. Dieses
 * Feld gehorcht der Sprache der Anwendung und sieht überall gleich aus.
 */

type DateFieldProps = {
    /** ISO-Tag `YYYY-MM-DD` oder '' für leer. */
    value: string;
    onChange: (value: string) => void;
    /** Frühester wählbarer Tag, `YYYY-MM-DD`. */
    min?: string;
    /** Spätester wählbarer Tag, `YYYY-MM-DD`. */
    max?: string;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    /** true = das Feld bietet «Leeren» an (Filter dürfen leer sein). */
    clearable?: boolean;
    /** Klasse des Feldes selbst; Vorgabe ist das Formularfeld-Kleid. */
    buttonClassName?: string;
    className?: string;
};

export const DateField = ({
    value,
    onChange,
    min,
    max,
    ariaLabel,
    placeholder,
    disabled = false,
    clearable = false,
    buttonClassName = 'ofi-cal-input',
    className = '',
}: DateFieldProps) => {
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const selected = value ? dayjs(value) : null;

    return (
        <div className={`relative min-w-0 ${className}`}>
            <button
                ref={setAnchorEl}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`${buttonClassName} flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
            >
                <span className={`min-w-0 flex-1 truncate tabular-nums ${selected ? '' : 'text-slate-400 dark:text-white/45'}`}>
                    {selected ? selected.format('DD.MM.YYYY') : (placeholder ?? '')}
                </span>
                <Calendar size={13} aria-hidden className="shrink-0 text-slate-400 dark:text-white/40" />
            </button>

            {open && !disabled && (
                <AnchoredPicker
                    anchorEl={anchorEl}
                    onClose={() => setOpen(false)}
                    width={236}
                    maxHeight={320}
                    panelClassName="ofi-macdp-pop"
                    exactWidth
                >
                    {/* Der eine Kalender der Anwendung (16.09.2026). */}
                    <MacCalendar
                        value={value}
                        min={min}
                        max={max}
                        onPick={(day) => {
                            onChange(day);
                            setOpen(false);
                            anchorEl?.focus({ preventScroll: true });
                        }}
                        onClear={clearable && value ? () => { onChange(''); setOpen(false); } : undefined}
                    />
                </AnchoredPicker>
            )}
        </div>
    );
};
