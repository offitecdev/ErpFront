import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleListItem } from '@/types/inventory';
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
 * Ürün listesi: sunucu sayfalı; genel arama + kolon filtreleri eski listeyle
 * aynı kriterlerle DB'de uygulanır. Malzeme/ürün birleşmesinden (2026-08-14)
 * beri liste tektir — itemType (ürün/hizmet) filtre değildir, satır rozetidir.
 */
export const useArticlesList = () => {
    const [items, setItems] = useState<ArticleListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Durum (aktif/pasif) filtresi kaldırıldı — ürün ve malzemelerde aktiflik
    // kavramı yok (bkz. ArticleListView).
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState<ProductColumnFilters>({ code: '', name: '' });
    const [sort, setSort] = useState<ProductSort>({ by: 'createdAt', direction: 'desc' });

    const debouncedSearch = useDebouncedValue(search);
    const debouncedFilters = useDebouncedValue(filters);

    // Filtre/arama değişince ilk sayfaya dön.
    useEffect(() => { setPage(1); }, [debouncedSearch, debouncedFilters]);

    const [reloadTick, setReloadTick] = useState(0);
    // `silent: true` — tablo "yükleniyor" durumuna DÜŞMEDEN arkada tazelenir
    // (satır silme sonrası sayfa dolgusu için; ekran o sırada eldeki satırları
    // göstermeye devam eder).
    const silentRef = useRef(false);
    const reload = useCallback((options?: { silent?: boolean }) => {
        silentRef.current = Boolean(options?.silent);
        setReloadTick((tick) => tick + 1);
    }, []);

    /** Satırı BEKLEMEDEN listeden düşürür (silme sonrası anlık kaldırma). */
    const removeItem = useCallback((id: string) => {
        setItems((current) => current.filter((item) => item.id !== id));
        setTotal((current) => Math.max(0, current - 1));
    }, []);

    useEffect(() => {
        let cancelled = false;
        // Bayrak tek kullanımlıktır: sayfa/filtre kaynaklı normal yüklemeler
        // spinner'ını göstermeye devam eder.
        const silent = silentRef.current;
        silentRef.current = false;
        if (!silent) setLoading(true);
        setError(null);
        inventoryApi
            .articlesSummaryPaged({
                page,
                pageSize: PRODUCTS_PAGE_SIZE,
                search: debouncedSearch || undefined,
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
    }, [page, debouncedSearch, debouncedFilters, sort, reloadTick]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / PRODUCTS_PAGE_SIZE)), [total]);

    const toggleSort = useCallback((by: ProductSort['by']) => {
        setSort((current) => current.by === by
            ? { by, direction: current.direction === 'asc' ? 'desc' : 'asc' }
            : { by, direction: 'asc' });
    }, []);

    return {
        items, total, totalPages, page, setPage, loading, error,
        search, setSearch, filters, setFilters,
        sort, toggleSort, reload, removeItem,
    };
};
