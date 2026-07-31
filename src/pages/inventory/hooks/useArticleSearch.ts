import { useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleListItem, ItemType } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

/**
 * Ürün/malzeme seçici beslemesi: kod/ad ile arar, sayfalı döner.
 * `enabled` false iken (modal kapalı) istek atılmaz. `itemType` verilmezse
 * ürünler ve malzemeler birlikte döner — stok ekranı ikisini de kabul eder.
 */
export const useArticleSearch = (pageSize: number, enabled = true, itemType?: ItemType) => {
    const [items, setItems] = useState<ArticleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [query, setQuery] = useState('');

    const debouncedQuery = useDebouncedValue(query, 250);

    useEffect(() => { setPage(1); }, [debouncedQuery, pageSize, itemType]);

    useEffect(() => {
        if (!enabled) return;
        let cancelled = false;
        setLoading(true);
        inventoryApi
            .articlesSummaryPaged({
                page,
                pageSize,
                search: debouncedQuery || undefined,
                itemType,
                status: 'ACTIVE',
            })
            .then((result) => {
                if (cancelled) return;
                setItems(result.items);
                setTotal(result.total);
            })
            .catch(() => { if (!cancelled) { setItems([]); setTotal(0); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [enabled, page, pageSize, debouncedQuery, itemType]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

    return { items, total, totalPages, page, setPage, loading, query, setQuery };
};
