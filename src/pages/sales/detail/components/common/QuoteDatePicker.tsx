import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

import { Calendar, ChevronLeft, ChevronRight } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';
import { AnchoredPopup } from './AnchoredPopup';

type QuoteDatePickerProps = {
    /** ISO day, `YYYY-MM-DD`, or '' for empty. */
    value: string;
    onChange: (value: string) => void;
    /** Earliest selectable day, `YYYY-MM-DD`. */
    min?: string;
    ariaLabel: string;
    placeholder?: string;
    /** Appended to the trigger — how callers outside the quote form (dense rows,
     *  dark surfaces) adjust height and colours without restyling the calendar. */
    className?: string;
};

const ISO = 'YYYY-MM-DD';

/**
 * Calendar written in plain TypeScript, replacing `<input type="date">`.
 *
 * The native control renders the browser's own picker: its size, language and
 * first-day-of-week come from the OS rather than the app, it cannot be themed
 * (so it stayed white in dark mode), and Safari shows no picker at all. This
 * draws the month grid itself, so the control matches every other field on the
 * quote and honours the app's language for month and weekday names.
 */
export const QuoteDatePicker = ({ value, onChange, min, ariaLabel, placeholder, className = '' }: QuoteDatePickerProps) => {
    const { i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const selected = value ? dayjs(value) : null;
    const minDay = min ? dayjs(min).startOf('day') : null;
    const [viewMonth, setViewMonth] = useState(() => (selected ?? dayjs()).startOf('month'));

    const locale = i18n.language || 'de-CH';
    const monthLabel = useMemo(
        () => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(viewMonth.toDate()),
        [locale, viewMonth],
    );

    // Monday-first week, labelled in the active language.
    const weekdayLabels = useMemo(() => {
        const formatter = new Intl.DateTimeFormat(locale, { weekday: 'short' });
        // 2024-01-01 was a Monday — a stable anchor for generating the header.
        return Array.from({ length: 7 }, (_, index) =>
            formatter.format(dayjs('2024-01-01').add(index, 'day').toDate()),
        );
    }, [locale]);

    // Six rows of seven, starting on the Monday on or before the 1st, so the
    // grid never changes height as the user pages through months.
    const days = useMemo(() => {
        const firstOfMonth = viewMonth.startOf('month');
        // dayjs day(): 0 = Sunday. Shift so Monday is 0.
        const leading = (firstOfMonth.day() + 6) % 7;
        const gridStart = firstOfMonth.subtract(leading, 'day');
        return Array.from({ length: 42 }, (_, index) => gridStart.add(index, 'day'));
    }, [viewMonth]);

    const openPicker = () => {
        setViewMonth((selected ?? dayjs()).startOf('month'));
        setOpen(true);
    };

    const commit = (day: dayjs.Dayjs) => {
        if (minDay && day.isBefore(minDay, 'day')) return;
        onChange(day.format(ISO));
        setOpen(false);
        anchorEl?.focus({ preventScroll: true });
    };

    const today = dayjs().startOf('day');

    return (
        <>
            <button
                ref={setAnchorEl}
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={() => (open ? setOpen(false) : openPicker())}
                className={`${QUOTE_CONTROL_CLASS} flex items-center justify-between gap-2 ${open ? 'border-[#1f2654] ring-2 ring-[#1f2654]/15' : ''} ${className}`}
            >
                <Calendar size={13} className="order-2 shrink-0 text-slate-400" />
                <span className={`min-w-0 flex-1 truncate text-left tabular-nums ${selected ? '' : 'font-normal text-slate-400'}`}>
                    {selected ? selected.format('DD.MM.YYYY') : (placeholder ?? t('tenders.select_date'))}
                </span>
            </button>
            {open && anchorEl && (
                <AnchoredPopup
                    anchorEl={anchorEl}
                    onClose={() => setOpen(false)}
                    width={252}
                    estimatedHeight={300}
                >
                    <div className="p-2">
                        <div className="mb-1.5 flex items-center justify-between gap-1">
                            <button
                                type="button"
                                aria-label={t('common.previous')}
                                onClick={() => setViewMonth((current) => current.subtract(1, 'month'))}
                                className="flex h-6 w-6 items-center justify-center rounded-[3px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1f2654]"
                            >
                                <ChevronLeft size={14} />
                            </button>
                            <span className="text-[12.5px] font-semibold capitalize text-slate-800">{monthLabel}</span>
                            <button
                                type="button"
                                aria-label={t('common.next')}
                                onClick={() => setViewMonth((current) => current.add(1, 'month'))}
                                className="flex h-6 w-6 items-center justify-center rounded-[3px] text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#1f2654]"
                            >
                                <ChevronRight size={14} />
                            </button>
                        </div>
                        <div className="grid grid-cols-7 gap-px">
                            {weekdayLabels.map((label) => (
                                <span
                                    key={label}
                                    className="flex h-6 items-center justify-center text-[10.5px] font-semibold uppercase text-slate-400"
                                >
                                    {label.slice(0, 2)}
                                </span>
                            ))}
                            {days.map((day) => {
                                const inMonth = day.month() === viewMonth.month();
                                const isSelected = Boolean(selected && day.isSame(selected, 'day'));
                                const isToday = day.isSame(today, 'day');
                                const isDisabled = Boolean(minDay && day.isBefore(minDay, 'day'));
                                return (
                                    <button
                                        key={day.format(ISO)}
                                        type="button"
                                        disabled={isDisabled}
                                        onClick={() => commit(day)}
                                        className={`flex h-7 items-center justify-center rounded-[3px] text-[12px] tabular-nums transition-colors ${
                                            isSelected
                                                ? 'bg-[#1f2654] font-semibold text-white'
                                                : isDisabled
                                                    ? 'cursor-not-allowed text-slate-200'
                                                    : inMonth
                                                        ? 'text-slate-700 hover:bg-slate-100'
                                                        : 'text-slate-300 hover:bg-slate-50'
                                        } ${isToday && !isSelected ? 'font-bold text-[#1f2654] ring-1 ring-inset ring-[#1f2654]/35' : ''}`}
                                    >
                                        {day.date()}
                                    </button>
                                );
                            })}
                        </div>
                        <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2">
                            <button
                                type="button"
                                onClick={() => commit(today)}
                                className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-[#1f2654] transition-colors hover:bg-slate-100"
                            >
                                {t('common.today')}
                            </button>
                            {value && (
                                <button
                                    type="button"
                                    onClick={() => { onChange(''); setOpen(false); }}
                                    className="rounded-[3px] px-2 py-1 text-[12px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-rose-600"
                                >
                                    {t('common.clear')}
                                </button>
                            )}
                        </div>
                    </div>
                </AnchoredPopup>
            )}
        </>
    );
};
