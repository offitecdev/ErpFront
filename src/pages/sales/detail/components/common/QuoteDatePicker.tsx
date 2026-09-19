import { useState } from 'react';
import dayjs from 'dayjs';

import { Calendar } from '@/components/icons/antIconCompat';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { MacCalendar } from '@/components/ui-shared/MacCalendar';
import { t } from '@/i18n/translate';

import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';

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
    const [open, setOpen] = useState(false);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const selected = value ? dayjs(value) : null;
    return (
        <>
            <button
                ref={setAnchorEl}
                type="button"
                aria-label={ariaLabel}
                aria-expanded={open}
                onClick={() => setOpen((current) => !current)}
                className={`${QUOTE_CONTROL_CLASS} flex items-center justify-between gap-2 ${open ? 'border-[#0066e0] ring-2 ring-[#0066e0]/15' : ''} ${className}`}
            >
                <Calendar size={13} className="order-2 shrink-0 text-slate-400" />
                <span className={`min-w-0 flex-1 truncate text-left tabular-nums ${selected ? '' : 'font-normal text-slate-400'}`}>
                    {selected ? selected.format('DD.MM.YYYY') : (placeholder ?? t('tenders.select_date'))}
                </span>
            </button>
            {open && anchorEl && (
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
                        onPick={(day) => {
                            onChange(day);
                            setOpen(false);
                            anchorEl.focus({ preventScroll: true });
                        }}
                        onClear={value ? () => { onChange(''); setOpen(false); } : undefined}
                    />
                </AnchoredPicker>
            )}
        </>
    );
};
