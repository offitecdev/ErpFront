import { useEffect, useState } from 'react';

import { apiClient } from '@/lib/axios';
import { readQuery } from '@/lib/api/queryCache';
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
    // 150 statt 250 ms: auf dem Produktivrechner kommen 150–200 ms Strecke dazu.
    const debouncedQuery = useDebouncedValue(query, 150);

    useEffect(() => {
        if (!enabled) return;
        const params = new URLSearchParams({ page: '1', pageSize: String(INLINE_LOOKUP_SIZE), fields: 'list' });
        const trimmed = debouncedQuery.trim();
        if (trimmed) params.set('search', trimmed);
        const url = `/customers?${params.toString()}`;
        setLoading(true);
        // Schon einmal gesucht: die Treffer stehen sofort da, der Server
        // bestätigt oder ersetzt sie dahinter (queryCache, Bereich `customers`).
        return readQuery(
            url,
            async () => (await apiClient.get<{ items?: LookupRow[] } | LookupRow[]>(url)).data,
            { freshMs: 60_000, staleMs: 10 * 60_000, tags: ['customers'] },
            (data, fresh) => {
                const rows = Array.isArray(data) ? data : data.items || [];
                setItems(rows.map((row) => ({
                    id: row.id,
                    companyName: row.companyName,
                    // Ansprechpartner der Kundenliste — als Unterzeile der Vorschläge.
                    responsibleName: [row.responsibleFirstName, row.responsibleLastName].filter(Boolean).join(' ').trim() || null,
                })));
                if (fresh) setLoading(false);
            },
            () => {
                setItems([]);
                setLoading(false);
            },
        );
    }, [enabled, debouncedQuery]);

    return { items, loading };
};
