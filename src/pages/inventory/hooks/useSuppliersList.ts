import { useCallback, useEffect, useMemo, useState } from 'react';
import { inventoryApi } from '@/lib/api/inventory';
import type { SupplierRow } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

export const SUPPLIERS_PAGE_SIZE = 20;

/** Tedarikçi listesi: tümü tek seferde çekilir, arama/sayfalama istemcide. */
export const useSuppliersList = () => {
    const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

    const debouncedSearch = useDebouncedValue(search);

    const [reloadTick, setReloadTick] = useState(0);
    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        inventoryApi
            .listSuppliers()
            .then((rows) => { if (!cancelled) setSuppliers(rows); })
            .catch((err) => { if (!cancelled) setError(err?.response?.data?.error || err?.message || 'error'); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [reloadTick]);

    useEffect(() => { setPage(1); }, [debouncedSearch]);

    const filtered = useMemo(() => {
        const query = debouncedSearch.trim().toLocaleLowerCase('tr');
        if (!query) return suppliers;
        return suppliers.filter((supplier) =>
            [supplier.companyName, supplier.contactName, supplier.email, supplier.phone]
                .some((field) => (field || '').toLocaleLowerCase('tr').includes(query)));
    }, [suppliers, debouncedSearch]);

    const totalPages = Math.max(1, Math.ceil(filtered.length / SUPPLIERS_PAGE_SIZE));
    const pageItems = useMemo(
        () => filtered.slice((page - 1) * SUPPLIERS_PAGE_SIZE, page * SUPPLIERS_PAGE_SIZE),
        [filtered, page],
    );

    return {
        suppliers, pageItems, totalCount: filtered.length, totalPages,
        page, setPage, loading, error, search, setSearch, reload,
    };
};
