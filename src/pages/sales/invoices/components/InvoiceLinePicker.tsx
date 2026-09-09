import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';

/**
 * ── DAS EMPFÄNGERFELD DER DIREKTRECHNUNG ─────────────────────────────────────
 *
 * Es ist dasselbe Feld wie im Angebot: man tippt HINEIN, darunter klappt eine
 * kurze Trefferliste auf. Wird nichts gewählt, bleibt das Getippte stehen — ein
 * Empfänger, der (noch) kein Kunde ist, ist auf einer Direktrechnung erlaubt.
 *
 * Die PRODUKTZELLE der Positionen stand früher auch hier; sie ist nach
 * `components/sales-document/DocumentProductCell.tsx` gezogen und benutzt
 * seither dieselbe Liste wie die Offertdetails (Vorgabe Samet 05.09.2026).
 */

const LOOKUP_SIZE = 7;

/** Ein Kunde, so weit ihn der Empfängerblock braucht. */
export interface CustomerPick {
    id: string;
    companyName: string;
    address?: string | null;
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
}

/**
 * Empfängersuche — derselbe Feed, aus dem die Angebots- und Sendungsmasken
 * ihre Kunden holen (`GET /customers` OHNE `fields=list`, weil der Block die
 * Adressbestandteile braucht).
 */
export const CustomerPickCell = ({
    value,
    onChange,
    onPick,
}: {
    value: string;
    onChange: (next: string) => void;
    onPick: (customer: CustomerPick) => void;
}) => {
    const [open, setOpen] = useState(false);
    const [items, setItems] = useState<CustomerPick[]>([]);
    const [loading, setLoading] = useState(false);
    const query = useDebouncedValue(value, 250);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        const params = new URLSearchParams({ page: '1', pageSize: String(LOOKUP_SIZE) });
        if (query.trim()) params.set('search', query.trim());
        apiClient
            .get(`/customers?${params.toString()}`)
            .then((response) => {
                if (cancelled) return;
                const data = response.data;
                setItems(Array.isArray(data) ? data : (data?.items || []));
            })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, query]);

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={value}
            onChange={onChange}
            loading={loading}
            options={items.map((customer) => ({
                id: customer.id,
                label: customer.companyName,
                meta: [customer.postalCode, customer.city].filter(Boolean).join(' '),
            }))}
            onSelect={(option) => {
                const customer = items.find((item) => item.id === option.id);
                if (customer) onPick(customer);
            }}
            placeholder={t('invoices.recipientName')}
            emptyText={t('invoices.recipientPickNone')}
            invalid={false}
            listWidth={340}
        />
    );
};
