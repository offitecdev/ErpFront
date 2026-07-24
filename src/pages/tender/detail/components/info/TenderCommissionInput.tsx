import { t } from '@/i18n/translate';

type TenderCommissionInputProps = {
    value: string;
    onCommit: (value: string | null) => void;
};

// Inline commission input for the tender info rows — a plain bordered box with
// no placeholder or hover chrome. Commits on blur/Enter so typing doesn't
// stage a meta change per keystroke.
export const TenderCommissionInput = ({ value, onCommit }: TenderCommissionInputProps) => (
    <input
        key={value}
        aria-label={t('tenders.kommission_nr')}
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
        className="w-full max-w-[240px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800 outline-none focus:border-[#1f2654] dark:border-white/15 dark:bg-white/5 dark:text-white dark:focus:border-[#e6cf9e]"
    />
);
