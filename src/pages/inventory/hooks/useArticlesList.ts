import { useCallback, useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleListItem, ItemType } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

export const PRODUCTS_PAGE_SIZE = 15;

export interface ProductColumnFilters {
    code: string;
    name: string;
}

export interface ProductSort {
    by: 'articleCode' | 'name' | 'totalQuantity' | 'salePrice' | 'createdAt';
    direction: 'asc' | 'desc';
}

/**
 * Ürün/malzeme listesi: sunucu sayfalı; genel arama + durum + kolon filtreleri
 * eski listeyle aynı kriterlerle DB'de uygulanır. İki ekran da aynı Article
 * tablosunu kullanır, yalnızca `itemType` değişir.
 */
export const useArticlesList = (itemType: ItemType) => {
    const [items, setItems] = useState<ArticleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [filters, setFilters] = useState<ProductColumnFilters>({ code: '', name: '' });
    const [sort, setSort] = useState<ProductSort>({ by: 'createdAt', direction: 'desc' });

    const debouncedSearch = useDebouncedValue(search);
    const debouncedFilters = useDebouncedValue(filters);

    // Filtre/arama değişince ilk sayfaya dön.
    useEffect(() => { setPage(1); }, [itemType, debouncedSearch, status, debouncedFilters]);

    const [reloadTick, setReloadTick] = useState(0);
    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        inventoryApi
            .articlesSummaryPaged({
                page,
                pageSize: PRODUCTS_PAGE_SIZE,
                search: debouncedSearch || undefined,
                status: status || undefined,
                itemType,
                code: debouncedFilters.code || undefined,
                name: debouncedFilters.name || undefined,
                sortBy: sort.by,
                sortDirection: sort.direction,
            })
            .then((result) => {
                if (cancelled) return;
                setItems(result.items);
                setTotal(result.total);
            })
            .catch((err) => {
                if (!cancelled) setError(err?.response?.data?.error || err?.message || 'error');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [itemType, page, debouncedSearch, status, debouncedFilters, sort, reloadTick]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)), [total]);

    const toggleSort = useCallback((by: ProductSort['by']) => {
        setSort((current) => current.by === by
            ? { by, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { by, direction: 'asc' });
    }, []);

    return {
        items, total, totalPages, page, setPage, loading, error,
        search, setSearch, status, setStatus, filters, setFilters,
        sort, toggleSort, reload,
    };
};
