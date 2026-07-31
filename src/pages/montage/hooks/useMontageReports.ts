import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import type { MontageReportOrderListItem, MontageReportOrdersPageDto } from '@/types/project';

const REPORT_PAGE_CACHE_TTL_MS = 15_000;
const reportPageCache = new Map<string, { at: number; data: MontageReportOrdersPageDto }>();
const inFlightReportPages = new Map<string, Promise<MontageReportOrdersPageDto>>();

const requestReportPage = (key: string, page: number, search?: string) => {
    const existing = inFlightReportPages.get(key);
    if (existing) return existing;
    const request = projectApi.listMontageReportOrdersPage({ page, search })
        .then((data) => {
            reportPageCache.set(key, { at: Date.now(), data });
            return data;
        })
        .finally(() => inFlightReportPages.delete(key));
    inFlightReportPages.set(key, request);
    return request;
};

/** Server-paged order registry containing only orders with field reports. */
export const useMontageReports = () => {
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const userId = useAuthStore((state) => state.user?.id);
    const [rows, setRows] = useState<MontageReportOrderListItem[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPageState] = useState(1);
    const [loading, setLoading] = useState(true);
    const [search, setSearchState] = useState('');
    const deferredSearch = useDeferredValue(search);
    const loadSeq = useRef(0);

    const setPage = useCallback((value: number) => setPageState(Math.max(1, value)), []);
    const setSearch = useCallback((value: string) => {
        setSearchState(value);
        setPageState(1);
    }, []);

    useEffect(() => {
        if (!userId || !selectedTenantId) return;
        const seq = ++loadSeq.current;
        const normalizedSearch = deferredSearch.trim() || undefined;
        const cacheKey = `${selectedTenantId}:${userId}:${page}:${normalizedSearch || ''}`;
        const cached = reportPageCache.get(cacheKey);
        if (cached && Date.now() - cached.at < REPORT_PAGE_CACHE_TTL_MS) {
            setRows(cached.data.items);
            setTotal(cached.data.total);
            setLoading(false);
            return;
        }
        setLoading(true);
        requestReportPage(cacheKey, page, normalizedSearch)
            .then((data) => {
                if (seq !== loadSeq.current) return;
                setRows(data.items);
                setTotal(data.total);
                if (page > data.totalPages) setPageState(data.totalPages);
            })
            .catch((error) => {
                if (seq !== loadSeq.current) return;
                toast.error(error.response?.data?.error || t('montage.reports.emptyHint'));
                setRows([]);
                setTotal(0);
            })
            .finally(() => {
                if (seq === loadSeq.current) setLoading(false);
            });
    }, [deferredSearch, page, selectedTenantId, userId]);

    return useMemo(() => ({
        loading,
        rows,
        total,
        page,
        setPage,
        search,
        setSearch,
    }), [loading, page, rows, search, setPage, setSearch, total]);
};
