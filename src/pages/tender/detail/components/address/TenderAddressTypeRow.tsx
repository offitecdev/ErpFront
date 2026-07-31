import type { ReactNode } from 'react';

import { t } from '@/i18n/translate';

export type TenderAddressType = 'INSTALLATION' | 'DELIVERY';

type TenderAddressTypeRowProps = {
    addressType: TenderAddressType;
    onTypeChange: (type: TenderAddressType) => void;
    picker: ReactNode;
};

const TYPES = ['INSTALLATION', 'DELIVERY'] as const;

// The quote carries ONE address of this kind: either the Projektadresse or the
// Lieferadresse — never both at once. The toggle chooses the type, the picker
// below selects the actual address (defaulting to the customer's main address).
//
// The selected side is marked by a solid pill that slides between the two
// segments (`translateX(index * 100%)`). With the track padded by 2px (`p-0.5`)
// each segment is exactly `50% - 2px` wide, so a 100% translate of the pill's
// own width lands it precisely on the other segment. `dark.css` restyles it via
// the `ofi-addr-toggle*` classes.
export const TenderAddressTypeRow = ({ addressType, onTypeChange, picker }: TenderAddressTypeRowProps) => {
    const activeIndex = TYPES.indexOf(addressType);

    return (
        <div className="space-y-1.5">
            <div className="ofi-addr-toggle relative inline-grid w-full grid-cols-2 rounded-[2px] border border-slate-300 bg-slate-100 p-0.5">
                <span
                    aria-hidden
                    className="ofi-addr-toggle-thumb pointer-events-none absolute inset-y-0.5 left-0.5 w-[calc(50%-2px)] rounded-[2px] border border-slate-300 bg-white transition-transform duration-200 ease-out"
                    style={{ transform: `translateX(${activeIndex * 100}%)` }}
                />
                {TYPES.map((type) => (
                    <button
                        key={type}
                        type="button"
                        onClick={() => onTypeChange(type)}
                        className={`relative z-10 truncate rounded-[2px] px-2 py-1 text-[11.5px] font-semibold transition-colors ${
                            addressType === type
                                ? 'text-[#1f2654]'
                                : 'text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {type === 'INSTALLATION' ? t('tenders.projektadresse') : t('tenders.lieferadresse')}
                    </button>
                ))}
            </div>
            {picker}
        </div>
    );
};
