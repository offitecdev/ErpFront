import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { Calendar, ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { AnchoredPicker } from './AnchoredPicker';

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

const ISO = 'YYYY-MM-DD';

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
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const selected = value ? dayjs(value) : null;
    const minDay = min ? dayjs(min).startOf('day') : null;
    const maxDay = max ? dayjs(max).startOf('day') : null;
    const [viewMonth, setViewMonth] = useState(() => (selected ?? dayjs()).startOf('month'));
    /* Die JAHRESWAHL (Vorgabe 27.08.2026: «im Kalender direkt das Jahr
       wählen»): ein Klick auf die Monatszeile blättert auf ein Jahresgitter
       um; ein Jahr wählt, die Tagesansicht kommt zurück. */
    const [view, setView] = useState<'days' | 'years'>('days');
    const [yearBase, setYearBase] = useState(() => (selected ?? dayjs()).year() - 5);

    const locale = i18n.language || 'de-CH';
    const monthLabel = useMemo(
        () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth.toDate()),
        [locale, viewMonth],
    );

    // Montag zuerst, beschriftet in der aktiven Sprache (2024-01-01 war ein Montag).
    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        return Array.from({ length: 7 }, (_, index) =>
            formatter.format(dayjs('2024-01-01').add(index, 'day').toDate()));
    }, [locale]);

    // Sechs Reihen à sieben Tage — das Gitter ändert beim Blättern nie die Höhe.
    const days = useMemo(() => {
        const firstOfMonth = viewMonth.startOf('month');
        const leading = (firstOfMonth.day() + 6) % 7;
        const gridStart = firstOfMonth.subtract(leading, 'day');
        return Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
    }, [viewMonth]);

    const openPicker = () => {
        if (disabled) return;
        const anchor = (selected ?? maxDay ?? dayjs()).startOf('month');
        setViewMonth(anchor);
        setYearBase(anchor.year() - 5);
        setView('days');
        setOpen(true);
    };

    /** Ein Jahr ist wählbar, wenn irgendein Tag darin im erlaubten Bereich liegt. */
    const yearDisabled = (year: number): boolean =>
        Boolean((minDay && year < minDay.year()) || (maxDay && year > maxDay.year()));

    const outOfRange = (day: dayjs.Dayjs): boolean =>
        Boolean((minDay && day.isBefore(minDay, 'day')) || (maxDay && day.isAfter(maxDay, 'day')));

    const commit = (day: dayjs.Dayjs) => {
        if (outOfRange(day)) return;
        onChange(day.format(ISO));
        setOpen(false);
        anchorEl?.focus({ preventScroll: true });
    };

    const today = dayjs().startOf('day');

    return (
        <div className={`relative min-w-0 ${className}`}>
            <button
                ref={setAnchorEl}
                type="button"
                disabled={disabled}
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={() => (open ? setOpen(false) : openPicker())}
                className={`${buttonClassName} flex w-full items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-60`}
            >
                <span className={`min-w-0 flex-1 truncate tabular-nums ${selected ? '' : 'text-slate-400 dark:text-white/45'}`}>
                    {selected ? selected.format('DD.MM.YYYY') : (placeholder ?? '')}
                </span>
                <Calendar size={13} aria-hidden className="shrink-0 text-slate-400 dark:text-white/40" />
            </button>

            <AnchoredPicker
                anchorEl={open && !disabled ? anchorEl : null}
                onClose={() => setOpen(false)}
                width={256}
                maxHeight={340}
            >
                <div className="p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-1">
                        <button
                            type="button"
                            aria-label={t('common.previous')}
                            onClick={() => (view === 'days'
                                ? setViewMonth((current) => current.subtract(1, 'month'))
                                : setYearBase((current) => current - 12))}
                            className="flex h-6 w-6 items-center justify-center rounded-[3px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <ChevronLeft size={14} />
                        </button>
                        {/* Die Monatszeile ist ein KNOPF: sie blättert auf das
                            Jahresgitter um (und zurück). */}
                        <button
                            type="button"
                            aria-expanded={view === 'years'}
                            onClick={() => {
                                setYearBase(viewMonth.year() - 5);
                                setView((current) => (current === 'days' ? 'years' : 'days'));
                            }}
                            className="rounded-[3px] px-2 py-0.5 text-[12.5px] font-semibold capitalize text-slate-800 transition-colors hover:bg-slate-100 dark:text-white/90 dark:hover:bg-white/10"
                        >
                            {view === 'days' ? monthLabel : `${yearBase} – ${yearBase + 11}`}
                        </button>
                        <button
                            type="button"
                            aria-label={t('common.next')}
                            onClick={() => (view === 'days'
                                ? setViewMonth((current) => current.add(1, 'month'))
                                : setYearBase((current) => current + 12))}
                            className="flex h-6 w-6 items-center justify-center rounded-[3px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1f2654] dark:text-white/60 dark:hover:bg-white/10 dark:hover:text-white"
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                    {view === 'years' ? (
                        <div className="grid grid-cols-3 gap-1 py-1">
                            {Array.from({ length: 12 }, (_, index) => yearBase + index).map((year) => {
                                const isDisabled = yearDisabled(year);
                                const isCurrent = year === viewMonth.year();
                                return (
                                    <button
                                        key={year}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => {
                                            setViewMonth((current) => current.year(year));
                                            setView('days');
                                        }}
                                        className={`flex h-8 items-center justify-center rounded-[3px] text-[12.5px] tabular-nums transition-colors ${
                                            isCurrent
                                                ? 'bg-[#1f2654] font-semibold text-white dark:bg-[#e6cf9e] dark:text-[#140f05]'
                                                : isDisabled
                                                    ? 'cursor-not-allowed text-slate-200 dark:text-white/15'
                                                    : 'text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10'
                                        }`}
                                    >
                                        {year}
                                    </button>
                                );
                            })}
                        </div>
                    ) : (
                    <div className="grid grid-cols-7 gap-px">
                        {weekdayLabels.map((label) => (
                            <span
                                key={label}
                                className="flex h-6 items-center justify-center text-[10.5px] font-semibold uppercase text-slate-400 dark:text-white/40"
                            >
                                {label.slice(0, 2)}
                            </span>
                        ))}
                        {days.map((day) => {
                            const inMonth = day.month() === viewMonth.month();
                            const isSelected = Boolean(selected && day.isSame(selected, 'day'));
                            const isToday = day.isSame(today, 'day');
                            const isDisabled = outOfRange(day);
                            return (
                                <button
                                    key={day.format(ISO)}
                                    type="button"
                                    disabled={isDisabled}
                                    onClick={() => commit(day)}
                                    className={`flex h-7 items-center justify-center rounded-[3px] text-[12px] tabular-nums transition-colors ${
                                        isSelected
                                            ? 'bg-[#1f2654] font-semibold text-white dark:bg-[#e6cf9e] dark:text-[#140f05]'
                                            : isDisabled
                                                ? 'cursor-not-allowed text-slate-200 dark:text-white/15'
                                                : inMonth
                                                    ? 'text-slate-700 hover:bg-slate-100 dark:text-white/80 dark:hover:bg-white/10'
                                                    : 'text-slate-300 hover:bg-slate-50 dark:text-white/30 dark:hover:bg-white/5'
                                    } ${isToday && !isSelected ? 'font-bold text-[#1f2654] ring-1 ring-inset ring-[#1f2654]/35 dark:text-[#e6cf9e] dark:ring-[#e6cf9e]/40' : ''}`}
                                >
                                    {day.date()}
                                </button>
                            );
                        })}
                    </div>
                    )}
                    <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2 dark:border-white/10">
                        <button
                            type="button"
                            disabled={outOfRange(today)}
                            onClick={() => commit(today)}
                            className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#1f2654] transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-[#e6cf9e] dark:hover:bg-white/10"
                        >
                            {t('common.today')}
                        </button>
                        {clearable && value && (
                            <button
                                type="button"
                                onClick={() => { onChange(''); setOpen(false); }}
                                className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600 dark:text-white/60 dark:hover:bg-white/10"
                            >
                                {t('common.clear')}
                            </button>
                        )}
                    </div>
                </div>
            </AnchoredPicker>
        </div>
    );
};
