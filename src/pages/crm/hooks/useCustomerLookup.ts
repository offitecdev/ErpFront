import { useEffect, useState } from 'react';

import { getShared } from '@/lib/axios';
import { useDebouncedValue } from './useDebouncedValue';
import type { CrmCustomerOption } from '../types/crm.types';

interface LookupRow {
    id: string;
    companyName: string;
    responsibleFirstName?: string | null;
    responsibleLastName?: string | null;
}

/** Zeilen der Zeilen-Auswahlliste (Kurzliste unter der Zelle). */
export const INLINE_LOOKUP_SIZE = 7;

/**
 * Kundensuche für die Zeilenzelle: die Anfrage kommt aus der Zelle selbst
 * (die Liste hat kein eigenes Suchfeld). Solange die Liste zu ist, wird
 * NICHT geladen — genau wie die Produktsuche im Lagermodul.
 *
 * Die Abfrage geht über die schlanke Kundenliste (`fields=list`); mehr als
 * Name und Id braucht die Zeile nicht.
 */
export const useCustomerLookup = (query: string, enabled: boolean) => {
    const [items, setItems] = useState<CrmCustomerOption[]>([]);
    const [loading, setLoading] = useState(false);
    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        const params = new URLSearchParams({ page: '1', pageSize: String(INLINE_LOOKUP_SIZE), fields: 'list' });
        const trimmed = debouncedQuery.trim();
        if (trimmed) params.set('search', trimmed);
        getShared<{ items?: LookupRow[] } | LookupRow[]>(`/customers?${params.toString()}`)
            .then((res) => {
                if (cancelled) return;
                const rows = Array.isArray(res.data) ? res.data : res.data.items || [];
                setItems(rows.map((row) => ({
                    id: row.id,
                    companyName: row.companyName,
                    // Ansprechpartner der Kundenliste — als Unterzeile der Vorschläge.
                    responsibleName: [row.responsibleFirstName, row.responsibleLastName].filter(Boolean).join(' ').trim() || null,
                })));
            })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, debouncedQuery]);

    return { items, loading };
};
