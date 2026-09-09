import { useState } from 'react';
import { LuBuilding2, LuList, LuSearch } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { CustomerPickerModal } from '../../components/CustomerPickerModal';
import { useCustomerLookup } from '../../hooks/useCustomerLookup';
import type { CrmCustomerOption } from '../../types/crm.types';

/**
 * Das Kundenfeld einer Zeile im Verknüpfungsfenster: ein Suchfeld im Kleid
 * der Checklisten (`.ofi-chk-input`), unter dem beim Tippen die Treffer
 * aufklappen (`.ofi-option-row`, die app-weite Auswahlzeile). Ganz unten steht
 * «Alle Kunden …», das die grosse Kundenwahl öffnet.
 *
 * Gebunden ist die Zeile erst, wenn ein Kunde GEWÄHLT wurde — blosser Text
 * zählt nicht; ein Tippen nach der Wahl löst die Bindung wieder.
 */
export const CustomerSearchField = ({
    value,
    linked,
    onChange,
    onPick,
    autoFocus,
    z = 800,
}: {
    value: string;
    linked: boolean;
    onChange: (next: string) => void;
    onPick: (customer: CrmCustomerOption) => void;
    autoFocus?: boolean;
    /** Stapelhöhe der grossen Kundenwahl (über dem Verknüpfungsfenster). */
    z?: number;
}) => {
    const [open, setOpen] = useState(false);
    const [allOpen, setAllOpen] = useState(false);
    const [inputEl, setInputEl] = useState<HTMLInputElement | null>(null);
    const { items, loading } = useCustomerLookup(value, open && !linked);

    return (
        <>
            <div className={`ofi-chk-search ${linked ? 'is-linked' : ''}`}>
                {linked ? <LuBuilding2 size={15} aria-hidden /> : <LuSearch size={15} aria-hidden />}
                <input
                    ref={setInputEl}
                    value={value}
                    autoFocus={autoFocus}
                    placeholder={t('forms.link.customerPlaceholder')}
                    onChange={(event) => { onChange(event.target.value); setOpen(true); }}
                    onFocus={() => { if (!linked) setOpen(true); }}
                    onKeyDown={(event) => {
                        if (event.key === 'Escape' && open) { event.stopPropagation(); setOpen(false); }
                        if (event.key === 'Enter' && open && items.length > 0) { event.preventDefault(); onPick(items[0]); setOpen(false); }
                    }}
                    className="ofi-chk-search__input"
                />
            </div>

            <AnchoredPicker
                anchorEl={open && !linked ? inputEl : null}
                onClose={() => setOpen(false)}
                width={360}
                maxHeight={320}
                footer={(
                    <button
                        type="button"
                        className="ofi-option-action ofi-chk-menu__action"
                        onPointerDown={(event) => { event.preventDefault(); setOpen(false); setAllOpen(true); }}
                    >
                        <LuList size={13} />{t('forms.link.allCustomers')}
                    </button>
                )}
            >
                <div role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
                    {loading && items.length === 0 && (
                        <div className="ofi-chk-menu__empty">{t('common.loading')}</div>
                    )}
                    {!loading && items.length === 0 && (
                        <div className="ofi-chk-menu__empty">{t('crm.quick.noCustomer')}</div>
                    )}
                    {items.map((customer) => (
                        <button
                            key={customer.id}
                            type="button"
                            role="option"
                            aria-selected={false}
                            className="ofi-option-row ofi-chk-menu__row"
                            onPointerDown={(event) => {
                                if (event.button !== 0) return;
                                event.preventDefault();
                                onPick(customer);
                                setOpen(false);
                            }}
                        >
                            <span className="ofi-chk-menu__title">{customer.companyName}</span>
                            {customer.responsibleName && <span className="ofi-chk-menu__meta">{customer.responsibleName}</span>}
                        </button>
                    ))}
                </div>
            </AnchoredPicker>

            <CustomerPickerModal
                open={allOpen}
                onClose={() => setAllOpen(false)}
                onSelect={(pick) => { onPick(pick.customer); setAllOpen(false); }}
                z={z}
            />
        </>
    );
};
