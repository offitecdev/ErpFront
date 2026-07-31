import { useCallback, useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { MovementKind, MovementListItem } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

export const MOVEMENTS_PAGE_SIZE = 20;

export interface MovementColumnFilters {
    code: string;
    name: string;
    description: string;
}

/** Stok hareketleri sayfası: sunucu sayfalı, genel arama + kolon/tip/tarih filtreleri. */
export const useMovementsList = () => {
    const [items, setItems] = useState<MovementListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [type, setType] = useState<MovementKind | ''>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filters, setFilters] = useState<MovementColumnFilters>({ code: '', name: '', description: '' });

    const debouncedSearch = useDebouncedValue(search);
    const debouncedFilters = useDebouncedValue(filters);

    useEffect(() => { setPage(1); }, [debouncedSearch, type, dateFrom, dateTo, debouncedFilters]);

    const [reloadTick, setReloadTick] = useState(0);
    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        inventoryApi
            .listMovements({
                page,
                pageSize: MOVEMENTS_PAGE_SIZE,
                search: debouncedSearch || undefined,
                code: debouncedFilters.code || undefined,
                name: debouncedFilters.name || undefined,
                description: debouncedFilters.description || undefined,
                type: type || undefined,
                dateFrom: dateFrom || undefined,
                dateTo: dateTo || undefined,
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
    }, [page, debouncedSearch, type, dateFrom, dateTo, debouncedFilters, reloadTick]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE)), [total]);

    return {
        items, total, totalPages, page, setPage, loading, error,
        search, setSearch, type, setType,
        dateFrom, setDateFrom, dateTo, setDateTo,
        filters, setFilters, reload,
    };
};
