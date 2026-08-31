import { useState } from 'react';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { CELL_INPUT_CLASS } from '@/components/ui-shared/TableKit';

/**
 * Ansprechpartner-Zelle: eine schlichte Auswahl, die erst greift, wenn die
 * Zeile an einen Kunden gebunden ist — vorher gibt es nichts auszuwählen.
 * Geladen wird beim ersten Aufklappen und je Kunde nur einmal.
 */
export const ContactCell = ({
    customerId,
    value,
    onChange,
}: {
    customerId: string | null;
    value: string;
    onChange: (next: string) => void;
}) => {
    const [contacts, setContacts] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
    const [loadedFor, setLoadedFor] = useState<string | null>(null);

    const load = () => {
        if (!customerId || loadedFor === customerId) return;
        setLoadedFor(customerId);
        crmApi.listContacts({ customerId, pageSize: 50 })
            .then((result) => setContacts(result.data.map((contact) => ({
                id: contact.id,
                firstName: contact.firstName,
                lastName: contact.lastName,
            }))))
            .catch(() => setContacts([]));
    };

    return (
        <select
            value={value}
            disabled={!customerId}
            onFocus={load}
            onMouseDown={load}
            onChange={(event) => onChange(event.target.value)}
            aria-label={t('crm.quick.contact')}
            className={CELL_INPUT_CLASS}
        >
            <option value="">—</option>
            {contacts.map((contact) => (
                <option key={contact.id} value={contact.id}>
                    {contact.firstName} {contact.lastName}
                </option>
            ))}
        </select>
    );
};
