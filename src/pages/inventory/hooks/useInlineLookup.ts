import { useEffect, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleListItem, ItemType, SupplierSearchItem } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

/** Satır içi açılırda gösterilen sonuç sayısı (kısa liste). */
export const INLINE_LOOKUP_SIZE = 7;

/**
 * Satır içi ürün/malzeme araması: sorgu hücrenin kendisinden gelir (bileşenin
 * kendi arama kutusu yoktur). Kapalıyken istek atılmaz.
 */
export const useArticleLookup = (query: string, enabled: boolean, itemType?: ItemType) => {
    const [items, setItems] = useState<ArticleListItem[]>([]);
    const [loading, setLoading] = useState(false);
    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .articlesSummaryPaged({
                page: 1,
                pageSize: INLINE_LOOKUP_SIZE,
                search: debouncedQuery.trim() || undefined,
                itemType,
                status: 'ACTIVE',
            })
            .then((result) => { if (!cancelled) setItems(result.items); })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, debouncedQuery, itemType]);

    return { items, loading };
};

/** Satır içi tedarikçi araması — aynı desen, tedarikçi beslemesiyle. */
export const useSupplierLookup = (query: string, enabled: boolean) => {
    const [items, setItems] = useState<SupplierSearchItem[]>([]);
    const [loading, setLoading] = useState(false);
    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .searchSuppliers(debouncedQuery.trim(), INLINE_LOOKUP_SIZE)
            .then((rows) => { if (!cancelled) setItems(rows); })
            .catch(() => { if (!cancelled) setItems([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, debouncedQuery]);

    return { items, loading };
};
