import { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { inventoryApi } from '@/lib/api/inventory';
import type { MovementKind, MovementListItem, MovementOrigin } from '@/types/inventory';
import { useDebouncedValue } from './useDebouncedValue';

export const MOVEMENTS_PAGE_SIZE = 20;

export interface MovementColumnFilters {
    code: string;
    name: string;
    description: string;
}

/** Schnellwahl des Zeitraums (10.09.2026): Heute, Diese Woche, Dieser Monat, Dieses Jahr, Gesamt. */
export type QuickRange = 'today' | 'week' | 'month' | 'year' | 'all';

const ISO = 'YYYY-MM-DD';
export const quickRangeBounds = (range: QuickRange): { from: string; to: string } => {
    const now = dayjs();
    switch (range) {
        case 'today': return { from: now.format(ISO), to: now.format(ISO) };
        case 'week': return { from: now.startOf('isoWeek').format(ISO), to: now.endOf('isoWeek').format(ISO) };
        case 'month': return { from: now.startOf('month').format(ISO), to: now.endOf('month').format(ISO) };
        case 'year': return { from: now.startOf('year').format(ISO), to: now.endOf('year').format(ISO) };
        default: return { from: '', to: '' };
    }
};

/**
 * Stok hareketleri: sunucu sayfalı, genel arama + kolon/tip/tarih filtreleri.
 * `articleId` verilirse liste tek ürüne daraltılır (ürün detayındaki hareketler
 * görünümü) — sorgu sunucuda daraltılır, tüm hareketler çekilip elenmez.
 *
 * Seit 10.09.2026 zusätzlich die HERKUNFT (Schnellerfassung, Wareneingang
 * Bestellung, Rapport/Projekt, manuell) und die Schnellwahl des Zeitraums;
 * das Suchfeld deckt ERP-Code, Bezeichnung, Modell, Serie und Barcode ab.
 */
export const useMovementsList = ({ articleId }: { articleId?: string } = {}) => {
    const [items, setItems] = useState<MovementListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [search, setSearch] = useState('');
    const [type, setType] = useState<MovementKind | ''>('');
    const [origin, setOrigin] = useState<MovementOrigin | ''>('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [filters, setFilters] = useState<MovementColumnFilters>({ code: '', name: '', description: '' });

    const debouncedSearch = useDebouncedValue(search);
    const debouncedFilters = useDebouncedValue(filters);

    useEffect(() => { setPage(1); }, [debouncedSearch, type, origin, dateFrom, dateTo, debouncedFilters]);

    const [reloadTick, setReloadTick] = useState(0);
    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    /** Welche Schnellwahl die Grenzen gerade beschreiben — oder keine, wenn von Hand gewählt. */
    const quickRange = useMemo<QuickRange | null>(() => {
        for (const range of ['today', 'week', 'month', 'year', 'all'] as QuickRange[]) {
            const bounds = quickRangeBounds(range);
            if (bounds.from === dateFrom && bounds.to === dateTo) return range;
        }
        return null;
    }, [dateFrom, dateTo]);
    const setQuickRange = useCallback((range: QuickRange) => {
        const bounds = quickRangeBounds(range);
        setDateFrom(bounds.from);
        setDateTo(bounds.to);
    }, []);

    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        setError(null);
        inventoryApi
            .listMovements({
                page,
                pageSize: MOVEMENTS_PAGE_SIZE,
                articleId,
                search: debouncedSearch || undefined,
                code: debouncedFilters.code || undefined,
                name: debouncedFilters.name || undefined,
                description: debouncedFilters.description || undefined,
                type: type || undefined,
                origin: origin || undefined,
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
    }, [articleId, page, debouncedSearch, type, origin, dateFrom, dateTo, debouncedFilters, reloadTick]);

    const totalPages = useMemo(() => Math.max(1, Math.ceil(total / MOVEMENTS_PAGE_SIZE)), [total]);

    return {
        items, total, totalPages, page, setPage, loading, error,
        search, setSearch, type, setType, origin, setOrigin,
        dateFrom, setDateFrom, dateTo, setDateTo, quickRange, setQuickRange,
        filters, setFilters, reload,
    };
};
