import { useState } from 'react';

import { ChevronDown, ChevronUp } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

/**
 * MENGENFELD MIT MAC-STEPPER (11.09.2026, Vorgabe Samet: «die Menge soll man
 * von Hand eingeben können — anfangs 1, dann alles markieren und eine Zahl
 * tippen, oder daneben die macOS-Pfeile»).
 *
 * Ein 34px-Feld wie die anderen Felder der Schnellerfassung, rechts daran
 * der zweigeteilte NSStepper (Pfeil hoch / Pfeil runter, Haarlinie dazwischen).
 * Das Feld ist ein Textfeld, kein `type=number`: der Fokus markiert den
 * ganzen Inhalt, damit «1» durch eine getippte Zahl ersetzt wird, ohne erst
 * zu löschen. Pfeiltasten ↑/↓ steppen ebenso. Beim Verlassen wird gerundet
 * und auf `min` gehoben — eine leere oder ungültige Eingabe fällt auf `min`
 * zurück, nie auf 0.
 *
 * Der Text ist nur WÄHREND des Tippens eigener Zustand (`draft`); sonst zeigt
 * das Feld den Wert von aussen. So braucht es keinen Effekt, der den Wert
 * nachzieht, und ein Zurücksetzen auf 1 nach der Buchung landet sofort im Feld.
 */
export const QuantityStepper = ({
    value,
    onChange,
    min = 1,
    step = 1,
    id,
    disabled = false,
    autoFocus = false,
    unit,
    onSubmit,
}: {
    value: number;
    onChange: (next: number) => void;
    min?: number;
    step?: number;
    id?: string;
    disabled?: boolean;
    autoFocus?: boolean;
    /** Einheit hinter dem Feld (Stk, m …) — freiwillig. */
    unit?: string;
    /** Enter im Feld — z. B. «Buchen». */
    onSubmit?: () => void;
}) => {
    const [draft, setDraft] = useState<string | null>(null);
    const text = draft ?? formatQty(value);

    const clamp = (next: number) => Math.max(min, roundQty(next));

    /** Tippen beendet: runden, auf `min` heben, Entwurf verwerfen. */
    const commit = () => {
        if (draft === null) return;
        const parsed = parseQty(draft);
        const next = parsed === null ? min : clamp(parsed);
        setDraft(null);
        if (next !== value) onChange(next);
    };

    const nudge = (direction: 1 | -1) => {
        if (disabled) return;
        const base = (draft === null ? null : parseQty(draft)) ?? value;
        setDraft(null);
        onChange(clamp(base + direction * step));
    };

    return (
        <div className={`ofi-qe-stepper ${disabled ? 'is-disabled' : ''}`}>
            <input
                id={id}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                autoFocus={autoFocus}
                disabled={disabled}
                value={text}
                aria-label={t('inv.quickEntry.quantity')}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => {
                    const raw = event.target.value;
                    setDraft(raw);
                    const parsed = parseQty(raw);
                    if (parsed !== null && parsed >= min) onChange(roundQty(parsed));
                }}
                onBlur={commit}
                onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') { event.preventDefault(); nudge(1); }
                    else if (event.key === 'ArrowDown') { event.preventDefault(); nudge(-1); }
                    else if (event.key === 'Enter') {
                        event.preventDefault();
                        commit();
                        onSubmit?.();
                    }
                }}
            />
            {unit && <span className="ofi-qe-stepper__unit">{unit}</span>}
            <div className="ofi-qe-stepper__arrows" aria-hidden={disabled}>
                <button type="button" tabIndex={-1} disabled={disabled} aria-label="+" onMouseDown={(event) => event.preventDefault()} onClick={() => nudge(1)}>
                    <ChevronUp />
                </button>
                <button type="button" tabIndex={-1} disabled={disabled || value <= min} aria-label="−" onMouseDown={(event) => event.preventDefault()} onClick={() => nudge(-1)}>
                    <ChevronDown />
                </button>
            </div>
        </div>
    );
};

/** «1,5» und «1.5» sind beide eine Zahl; alles andere ist keine. */
const parseQty = (raw: string): number | null => {
    const normalised = raw.trim().replace(',', '.');
    if (!normalised || !/^\d*(?:\.\d*)?$/.test(normalised)) return null;
    const number = Number(normalised);
    return Number.isFinite(number) ? number : null;
};

/** Höchstens drei Nachkommastellen — Meter und Kilo dürfen Brüche sein. */
const roundQty = (value: number) => Math.round(value * 1000) / 1000;

const formatQty = (value: number) => String(roundQty(value)).replace('.', ',');
