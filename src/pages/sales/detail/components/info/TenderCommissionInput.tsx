import { t } from '@/i18n/translate';

import { QUOTE_CONTROL_CLASS } from '../../utils/quoteField.constants';

type TenderCommissionInputProps = {
    value: string;
    onCommit: (value: string | null) => void;
    /** Accessible name — defaults to "Kommission"; the Referenz row overrides it. */
    ariaLabel?: string;
};

// Inline commission input for the tender info rows — a plain bordered box with
// no placeholder or hover chrome. Commits on blur/Enter so typing doesn't
// stage a meta change per keystroke. Also reused for the Referenz row, which
// behaves identically.
export const TenderCommissionInput = ({ value, onCommit, ariaLabel }: TenderCommissionInputProps) => (
    <input
        key={value}
        aria-label={ariaLabel ?? t('tenders.kommission_nr')}
        type="text"
        defaultValue={value}
        onBlur={(event) => {
            const next = event.target.value.trim();
            if (next !== value.trim()) onCommit(next || null);
        }}
        onKeyDown={(event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                (event.target as HTMLInputElement).blur();
            }
        }}
        className={`${QUOTE_CONTROL_CLASS} dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#e6cf9e]`}
    />
);
