import { useState } from 'react';

import { Check, ChevronDown } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';
import { AnchoredPopup } from './AnchoredPopup';

export type QuoteSelectOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

type QuoteSelectProps = {
    value: string;
    options: QuoteSelectOption[];
    onChange: (value: string) => void;
    ariaLabel: string;
    placeholder?: string;
    disabled?: boolean;
    /** Text shown while the option set is still loading. */
    loadingLabel?: string;
};

/**
 * Dropdown written in plain TypeScript — no native `<select>`, no component
 * library. A native select renders its list with the OS's own chrome, which
 * ignores the app's type, spacing and dark theme entirely and cannot be aligned
 * with the rest of the form; this keeps the closed control and the open list in
 * the same design language.
 */
export const QuoteSelect = ({
    value,
    options,
    onChange,
    ariaLabel,
    placeholder,
    disabled,
    loadingLabel,
}: QuoteSelectProps) => {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(-1);
    const [anchorEl, setAnchorEl] = useState<HTMLButtonElement | null>(null);

    const selected = options.find((option) => option.value === value);
    const label = loadingLabel ?? selected?.label ?? placeholder ?? t('common.select');

    const commit = (option: QuoteSelectOption) => {
        if (option.disabled) return;
        onChange(option.value);
        setOpen(false);
        anchorEl?.focus({ preventScroll: true });
    };

    const openList = () => {
        if (disabled) return;
        setActiveIndex(options.findIndex((option) => option.value === value));
        setOpen(true);
    };

    const onTriggerKeyDown = (event: React.KeyboardEvent) => {
        if (disabled) return;
        if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openList();
        }
    };

    const onListKeyDown = (event: React.KeyboardEvent) => {
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            setActiveIndex((current) => {
                const next = current + direction;
                if (next < 0) return options.length - 1;
                if (next >= options.length) return 0;
                return next;
            });
            return;
        }
        if (event.key === 'Enter' && activeIndex >= 0) {
            event.preventDefault();
            commit(options[activeIndex]);
        }
    };

    return (
        <>
            <button
                ref={setAnchorEl}
                type="button"
                role="combobox"
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => (open ? setOpen(false) : openList())}
                onKeyDown={onTriggerKeyDown}
                className={`${QUOTE_CONTROL_CLASS} flex items-center justify-between gap-2 ${open ? 'border-[#1f2654] ring-2 ring-[#1f2654]/15' : ''}`}
            >
                <span className={`min-w-0 flex-1 truncate text-left ${selected ? '' : 'font-normal text-slate-400'}`}>
                    {label}
                </span>
                <ChevronDown
                    size={13}
                    className={`shrink-0 text-slate-400 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
                />
            </button>
            {open && anchorEl && (
                <AnchoredPopup
                    anchorEl={anchorEl}
                    onClose={() => setOpen(false)}
                    estimatedHeight={240}
                >
                    <ul
                        role="listbox"
                        aria-label={ariaLabel}
                        tabIndex={-1}
                        ref={(node) => node?.focus({ preventScroll: true })}
                        onKeyDown={onListKeyDown}
                        className="max-h-60 overflow-y-auto py-0.5 outline-none"
                    >
                        {options.length === 0 && (
                            <li className="px-2.5 py-2 text-[12.5px] text-slate-400">{t('common.noData')}</li>
                        )}
                        {options.map((option, index) => {
                            const isSelected = option.value === value;
                            return (
                                <li
                                    key={option.value || `empty-${index}`}
                                    role="option"
                                    aria-selected={isSelected}
                                    aria-disabled={option.disabled}
                                    data-active={index === activeIndex && !option.disabled ? 'true' : undefined}
                                    onMouseEnter={() => setActiveIndex(index)}
                                    // Select on pointerdown: the whole row is the hit
                                    // target and the choice lands before any blur can
                                    // re-render the list out from under the cursor.
                                    onPointerDown={(event) => {
                                        if (event.button !== 0) return;
                                        event.preventDefault();
                                        commit(option);
                                    }}
                                    // The highlighted row must NOT also carry
                                    // `text-slate-800`: index.css re-declares that
                                    // utility with !important, and against a static
                                    // `text-white` (same layer, same specificity, but
                                    // declared later) it wins — which painted dark
                                    // text on the navy fill. The hover variant beats
                                    // it on specificity, so only the state-painted
                                    // row needs the swap.
                                    className={`ofi-option-row flex cursor-pointer items-center justify-between gap-2 px-2.5 py-1.5 text-[13px] transition-colors ${
                                        option.disabled
                                            ? 'cursor-not-allowed text-slate-300'
                                            : index === activeIndex
                                                ? 'bg-[#1f2654] text-white'
                                                : 'text-slate-800 hover:bg-[#1f2654] hover:!text-white'
                                    }`}
                                >
                                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                                    {isSelected && <Check size={13} className="shrink-0" />}
                                </li>
                            );
                        })}
                    </ul>
                </AnchoredPopup>
            )}
        </>
    );
};
