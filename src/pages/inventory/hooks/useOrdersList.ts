import { useCallback, useEffect, useMemo, useState } from 'react';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import type { PurchaseOrderRow, PurchaseOrderStatus } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

export const ORDERS_PAGE_SIZE = 20;

export interface OrderColumnFilters {
    reference: string;
    quote: string;
    project: string;
    supplier: string;
}

/** Satın alma siparişleri: sunucu sayfalı, genel arama + durum/tedarikçi/tarih filtreleri. */
export const useOrdersList = () => {
    const [items, setItems] = useState<PurchaseOrderRow[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [status, setStatus] = useState<PurchaseOrderStatus | ''>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filters, setFilters] = useState<OrderColumnFilters>({ reference: '', quote: '', project: '', supplier: '' });

    const debouncedSearch = useDebouncedValue(search);
    const debouncedFilters = useDebouncedValue(filters);

    useEffect(() => { setPage(1); }, [debouncedSearch, status, dateFrom, dateTo, debouncedFilters]);

    const [reloadTick, setReloadTick] = useState(0);
    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        purchaseOrdersApi
            .list({
                page,
                pageSize: ORDERS_PAGE_SIZE,
                search: debouncedSearch || undefined,
                status: status || undefined,
                reference: debouncedFilters.reference || undefined,
                quote: debouncedFilters.quote || undefined,
                project: debouncedFilters.project || undefined,
                supplier: debouncedFilters.supplier || undefined,
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
    }, [page, debouncedSearch, status, dateFrom, dateTo, debouncedFilters, reloadTick]);

    // Popup içindeki eylemler (ad/durum/mail) listeyi yeniden çekmeden günceller.
    const replaceItem = useCallback((updated: PurchaseOrderRow) => {
        setItems((current) => current.map((row) => (row.id === updated.id ? updated : row)));
    }, []);

    const removeItem = useCallback((id: string) => {
        setItems((current) => current.filter((row) => row.id !== id));
        setTotal((current) => Math.max(0, current - 1));
    }, []);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / ORDERS_PAGE_SIZE)), [total]);

    return {
        items, total, totalPages, page, setPage, loading, error,
        search, setSearch, status, setStatus,
        dateFrom, setDateFrom, dateTo, setDateTo,
        filters, setFilters, reload, replaceItem, removeItem,
    };
};
