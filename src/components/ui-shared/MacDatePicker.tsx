import { useState } from 'react';

import { AnchoredPicker } from './AnchoredPicker';
import { MacCalendar } from './MacCalendar';
import '@/styles/macDatePicker.css';

/**
 * ── DATUMSFELD IM iOS-/macOS-KLEID (16.09.2026) ─────────────────────────────
 *
 * Die graue iOS-Kapsel mit dem Datum; ein Klick öffnet den gemeinsamen
 * Kalender (`MacCalendar`). Man kann auch TIPPEN (16.9.2026, 16.09.26,
 * 16092026) — Enter oder Verlassen übernimmt.
 *
 * Grössen über `className`: (ohne) 104×32 · `is-compact` 96×30 für Tabellen ·
 * `is-block` volle Breite · `is-field` volle Breite in Formularhöhe (wie die
 * übrigen Eingabefelder des Formulars). Das ist der Ersatz für jedes
 * `<input type="date">` der Anwendung.
 */

type Props = {
    /** ISO-Tag `YYYY-MM-DD` oder ''. */
    value: string;
    onChange: (value: string) => void;
    min?: string;
    max?: string;
    disabled?: boolean;
    /** true = «Leeren» im Kalender (Filter). */
    clearable?: boolean;
    ariaLabel?: string;
    placeholder?: string;
    className?: string;
    id?: string;
    required?: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const display = (value: string) => (/^\d{4}-\d{2}-\d{2}/.test(value) ? `${value.slice(8, 10)}.${value.slice(5, 7)}.${value.slice(0, 4)}` : '');

/** Getippte Daten lesen: T.M.JJJJ, T.M.JJ, TTMMJJJJ, T.M. (laufendes Jahr). */
const parseTypedDate = (raw: string): string | null => {
    const text = raw.trim();
    let d: number; let m: number; let y: number;
    const compact = text.match(/^(\d{2})(\d{2})(\d{2}|\d{4})$/);
    const split = text.match(/^(\d{1,2})[./\-\s](\d{1,2})(?:[./\-\s](\d{2}|\d{4}))?\.?$/);
    const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoMatch) { y = +isoMatch[1]; m = +isoMatch[2]; d = +isoMatch[3]; }
    else if (compact) { d = +compact[1]; m = +compact[2]; y = +compact[3]; }
    else if (split) { d = +split[1]; m = +split[2]; y = split[3] ? +split[3] : new Date().getFullYear(); }
    else return null;
    if (y < 100) y += 2000;
    if (m < 1 || m > 12 || d < 1 || d > daysIn(y, m - 1)) return null;
    return `${y}-${pad(m)}-${pad(d)}`;
};

export const MacDatePicker = ({
    value,
    onChange,
    min,
    max,
    disabled = false,
    clearable = false,
    ariaLabel,
    placeholder,
    className = '',
    id,
    required,
}: Props) => {
    const [anchorEl, setAnchorEl] = useState<HTMLSpanElement | null>(null);
    const [open, setOpen] = useState(false);
    const [text, setText] = useState<string | null>(null);
    const current = (value || '').slice(0, 10);

    const openPicker = () => { if (!disabled) setOpen(true); };
    const outOfRange = (day: string) => Boolean((min && day < min.slice(0, 10)) || (max && day > max.slice(0, 10)));

    const pick = (day: string) => {
        setText(null);
        if (day !== current) onChange(day);
        setOpen(false);
    };

    const commitText = () => {
        if (text === null) return;
        setText(null);
        if (!text.trim()) { if (clearable && current) onChange(''); return; }
        const parsed = parseTypedDate(text);
        if (parsed && !outOfRange(parsed) && parsed !== current) onChange(parsed);
    };

    return (
        <span
            ref={setAnchorEl}
            className={`ofi-macdp ${open ? 'is-open' : ''} ${disabled ? 'is-disabled' : ''} ${className}`}
            onClick={(event) => {
                event.stopPropagation();
                // Klicks im Kalender (Portal) laufen im React-Baum hier durch —
                // sie dürfen das eben geschlossene Fenster nicht wieder öffnen.
                if (event.currentTarget.contains(event.target as Node)) openPicker();
            }}
        >
            <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                required={required}
                className="ofi-macdp__input"
                aria-label={ariaLabel}
                aria-expanded={open}
                disabled={disabled}
                value={text ?? display(current)}
                placeholder={placeholder ?? '__.__.____'}
                onFocus={openPicker}
                onChange={(event) => setText(event.target.value)}
                onBlur={commitText}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') { event.preventDefault(); commitText(); setOpen(false); (event.target as HTMLInputElement).blur(); }
                    if (event.key === 'Escape') { setText(null); setOpen(false); }
                    if (event.key === 'Tab') setOpen(false);
                }}
            />

            {open && (
                <AnchoredPicker
                    anchorEl={anchorEl}
                    onClose={() => setOpen(false)}
                    width={236}
                    maxHeight={320}
                    panelClassName="ofi-macdp-pop"
                    exactWidth
                >
                    <MacCalendar
                        value={current}
                        min={min}
                        max={max}
                        onPick={pick}
                        onClear={clearable && current ? () => { setText(null); onChange(''); setOpen(false); } : undefined}
                    />
                </AnchoredPicker>
            )}
        </span>
    );
};
