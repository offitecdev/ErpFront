import { useState } from 'react';
import { List as ListIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { CustomerPickerModal } from './CustomerPickerModal';
import { useCustomerLookup } from '../hooks/useCustomerLookup';
import type { CrmCustomerOption } from '../types/crm.types';

/**
 * Kundenzelle der Tabellen-Erfassung — dieselbe Bedienung wie die Produktzelle
 * im Lagermodul: die Zelle IST das Suchfeld, unter ihr klappt eine kurze
 * Trefferliste auf, ein Klick übernimmt den Kunden. Ganz unten steht "Alle
 * Kunden …", das die grosse Auswahl öffnet.
 *
 * Solange die Zelle nicht an einen echten Kunden gebunden ist (`linked`),
 * zeichnet ComboCell sie gestrichelt — der Text allein reicht zum Speichern
 * nicht, es muss ein Kunde gewählt sein.
 */
export const CustomerComboCell = ({
    value,
    linked,
    onChange,
    onPick,
    autoFocus,
    pickerZ,
}: {
    /** Angezeigter Text — der Firmenname des gewählten Kunden oder das Getippte. */
    value: string;
    linked: boolean;
    onChange: (next: string) => void;
    onPick: (customer: CrmCustomerOption) => void;
    autoFocus?: boolean;
    /** Stapelhöhe der grossen Auswahl, wenn die Zelle selbst in einem Fenster steht. */
    pickerZ?: number;
}) => {
    const [open, setOpen] = useState(false);
    const [allOpen, setAllOpen] = useState(false);
    // Geladen wird NUR, solange die Liste offen ist.
    const { items, loading } = useCustomerLookup(value, open);

    return (
        <>
            <ComboCell
                open={open}
                onOpenChange={setOpen}
                value={value}
                onChange={onChange}
                loading={loading}
                invalid={!linked}
                placeholder={t('crm.quick.customerSearch')}
                emptyText={t('crm.quick.noCustomer')}
                autoFocus={autoFocus}
                options={items.map((customer) => ({ id: customer.id, label: customer.companyName, meta: customer.responsibleName || undefined }))}
                onSelect={(option) => {
                    const picked = items.find((customer) => customer.id === option.id);
                    if (picked) onPick(picked);
                }}
                actions={[
                    {
                        key: 'all',
                        label: t('crm.quick.customerPickTitle'),
                        icon: <ListIcon size={12} />,
                        onSelect: () => { setOpen(false); setAllOpen(true); },
                    },
                ]}
            />

            {/* Die Zelle wählt nur den Kunden; der Ansprechpartner hat in der
                Tabelle seine eigene Zelle (ContactCell). */}
            <CustomerPickerModal open={allOpen} onClose={() => setAllOpen(false)} onSelect={(pick) => onPick(pick.customer)} z={pickerZ} />
        </>
    );
};
