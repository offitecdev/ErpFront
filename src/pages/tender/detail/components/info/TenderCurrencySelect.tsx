import { useMemo } from 'react';

import { t } from '@/i18n/translate';
import { CURRENCY_CODES, CURRENCY_SYMBOLS, type CurrencyCode } from '../../../../../utils/currency';
import { QuoteSelect } from '../common/QuoteSelect';

type TenderCurrencySelectProps = {
    value: CurrencyCode;
    onChange: (value: CurrencyCode) => void;
};

// Inline currency picker for the tender info rows. Changing it stages a meta
// change (persisted on Save) and immediately re-denominates every amount in the
// offer via `useMoneyFormat`.
export const TenderCurrencySelect = ({ value, onChange }: TenderCurrencySelectProps) => {
    const options = useMemo(
        () => CURRENCY_CODES.map((code) => ({
            value: code,
            label: code === CURRENCY_SYMBOLS[code] ? code : `${code} (${CURRENCY_SYMBOLS[code]})`,
        })),
        [],
    );

    return (
        <QuoteSelect
            ariaLabel={t('tenders.waehrung')}
            value={value}
            options={options}
            onChange={(next) => onChange(next as CurrencyCode)}
        />
    );
};
