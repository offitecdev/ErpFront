import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { t } from '@/i18n/translate';
import '@/styles/macDatePicker.css';

/**
 * ── DER EINE KALENDER DER ANWENDUNG (16.09.2026) ────────────────────────────
 *
 * Vorgabe Samet: «dasselbe Datumsfenster überall im System» — Vorlage
 * `pickers-date-picker-inline-expanded@2x.png` (iOS/macOS). Dieser Körper
 * steckt in jedem Datumsfenster: `MacDatePicker`, `DateField`,
 * `QuoteDatePicker`. Wer ein neues Datumsfeld baut, nimmt einen von diesen —
 * nie `<input type="date">`.
 *
 * «Monat Jahr ›» öffnet die Monatswahl (‹ › blättern dort das Jahr). Blättern
 * rechnet mit Jahr·12+Monat als ganzen Zahlen, der 31. springt nie in den
 * übernächsten Monat. Montag zuerst, Namen in der Sprache der Anwendung.
 */

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const daysIn = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const localeOf = (lng: string) => (lng.startsWith('de') ? 'de-CH' : lng.startsWith('tr') ? 'tr-TR' : 'en-GB');
const todayIso = () => { const d = new Date(); return iso(d.getFullYear(), d.getMonth(), d.getDate()); };

export const MacCalendar = ({
    value,
    min,
    max,
    onPick,
    onClear,
}: {
    /** ISO-Tag `YYYY-MM-DD` oder ''. */
    value: string;
    min?: string;
    max?: string;
    onPick: (day: string) => void;
    /** Wenn gesetzt: «Leeren» im Fuss. */
    onClear?: () => void;
}) => {
    const { i18n } = useTranslation();
    const locale = localeOf(i18n.language || 'de');
    const [mode, setMode] = useState<'days' | 'months'>('days');
    const [view, setView] = useState(() => {
        const base = /^\d{4}-\d{2}/.test(value) ? value : (max && max < todayIso() ? max : todayIso());
        return { y: +base.slice(0, 4), m: +base.slice(5, 7) - 1 };
    });

    const monthNames = useMemo(() => {
        const f = new Intl.DateTimeFormat(locale, { month: 'long' });
        return Array.from({ length: 12 }, (_, i) => f.format(new Date(2024, i, 1)));
    }, [locale]);
    const monthShort = useMemo(() => {
        const f = new Intl.DateTimeFormat(locale, { month: 'short' });
        return Array.from({ length: 12 }, (_, i) => f.format(new Date(2024, i, 1)).replace('.', ''));
    }, [locale]);
    // Montag zuerst (1.1.2024 war ein Montag).
    const weekdays = useMemo(() => {
        const f = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        return Array.from({ length: 7 }, (_, i) => f.format(new Date(2024, 0, 1 + i)).replace('.', '').slice(0, 3).toLocaleUpperCase(locale));
    }, [locale]);

    const day = value.slice(0, 10);
    const outOfRange = (d: string) => Boolean((min && d < min.slice(0, 10)) || (max && d > max.slice(0, 10)));
    const step = (delta: number) => setView(({ y, m }) => {
        const total = y * 12 + m + delta;
        return { y: Math.floor(total / 12), m: ((total % 12) + 12) % 12 };
    });

    const today = todayIso();
    const lead = (new Date(view.y, view.m, 1).getDay() + 6) % 7;
    const cells: Array<number | null> = [
        ...Array.from({ length: lead }, () => null),
        ...Array.from({ length: daysIn(view.y, view.m) }, (_, i) => i + 1),
    ];

    return (
        <div className="ofi-macdp-cal" onMouseDown={(event) => event.preventDefault()}>
            <div className="ofi-macdp-head">
                <button
                    type="button"
                    className={`ofi-macdp-title ${mode === 'months' ? 'is-open' : ''}`}
                    aria-expanded={mode === 'months'}
                    onClick={() => setMode((current) => (current === 'days' ? 'months' : 'days'))}
                >
                    <span>{monthNames[view.m]} {view.y}</span>
                    <svg viewBox="0 0 10 16" width="6" height="10" aria-hidden><path d="M2 2l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                <span className="ofi-macdp-nav">
                    <button type="button" aria-label={t('common.previous')} onClick={() => step(mode === 'days' ? -1 : -12)}>
                        <svg viewBox="0 0 12 20" width="8" height="13" aria-hidden><path d="M10 2L2 10l8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                    <button type="button" aria-label={t('common.next')} onClick={() => step(mode === 'days' ? 1 : 12)}>
                        <svg viewBox="0 0 12 20" width="8" height="13" aria-hidden><path d="M2 2l8 8-8 8" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    </button>
                </span>
            </div>

            {mode === 'days' ? (
                <>
                    <div className="ofi-macdp-week">
                        {weekdays.map((label, index) => <span key={`${label}${index}`}>{label}</span>)}
                    </div>
                    <div className="ofi-macdp-grid">
                        {cells.map((n, index) => {
                            if (n === null) return <span key={`e${index}`} />;
                            const d = iso(view.y, view.m, n);
                            return (
                                <button
                                    key={d}
                                    type="button"
                                    disabled={outOfRange(d)}
                                    aria-pressed={d === day}
                                    className={`ofi-macdp-day ${d === day ? 'is-selected' : ''} ${d === today ? 'is-today' : ''}`}
                                    onClick={() => { if (!outOfRange(d)) onPick(d); }}
                                >
                                    {n}
                                </button>
                            );
                        })}
                    </div>
                    <div className={`ofi-macdp-foot ${onClear ? 'has-clear' : ''}`}>
                        <button type="button" disabled={outOfRange(today)} onClick={() => onPick(today)}>
                            {t('common.today')}
                        </button>
                        {onClear && (
                            <button type="button" className="is-clear" onClick={onClear}>
                                {t('common.clear')}
                            </button>
                        )}
                    </div>
                </>
            ) : (
                <div className="ofi-macdp-months">
                    {monthShort.map((label, index) => (
                        <button
                            key={`${label}${index}`}
                            type="button"
                            className={index === view.m ? 'is-on' : ''}
                            onClick={() => { setView(({ y }) => ({ y, m: index })); setMode('days'); }}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};
