import { useEffect, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierSearchItem } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

/** Tedarikçi seçici beslemesi: yalın arama, ilk 10 kayıt. */
export const useSupplierSearch = (enabled: boolean) => {
    const [items, setItems] = useState<SupplierSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');

    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .searchSuppliers(debouncedQuery.trim(), 10)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, debouncedQuery]);

    return { items, loading, query, setQuery };
};
