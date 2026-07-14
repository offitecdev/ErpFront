import { t } from '@/i18n/translate';

type TenderCommissionInputProps = {
    value: string;
    onCommit: (value: string | null) => void;
};

// Inline "Kommissionsnummer – Kommission" input for the tender info rows.
// Commits on blur/Enter so typing doesn't stage a meta change per keystroke.
export const TenderCommissionInput = ({ value, onCommit }: TenderCommissionInputProps) => (
    <input
        key={value}
        aria-label={t('tenders.kommission_nr')}
        type="text"
        defaultValue={value}
        placeholder={t('tenders.kommission_placeholder')}
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
        className="w-full max-w-[240px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
    />
);
