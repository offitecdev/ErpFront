import { t } from '@/i18n/translate';
import { CURRENCY_CODES, CURRENCY_SYMBOLS, type CurrencyCode } from '../../../../../utils/currency';

type TenderCurrencySelectProps = {
    value: CurrencyCode;
    onChange: (value: CurrencyCode) => void;
};

// Inline currency picker for the tender info rows. Changing it stages a meta
// change (persisted on Save) and immediately re-denominates every amount in the
// offer via `useMoneyFormat`.
export const TenderCurrencySelect = ({ value, onChange }: TenderCurrencySelectProps) => (
    <select
        aria-label={t('tenders.waehrung')}
        value={value}
        onChange={(event) => onChange(event.target.value as CurrencyCode)}
        className="w-full max-w-[160px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
    >
        {CURRENCY_CODES.map((code) => (
            <option key={code} value={code}>
                {code === CURRENCY_SYMBOLS[code] ? code : `${code} (${CURRENCY_SYMBOLS[code]})`}
            </option>
        ))}
    </select>
);
