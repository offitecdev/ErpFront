import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { t } from '@/i18n/translate';

import type { MontageOrderRow } from '../types/montage';
import { montageRowFromListItem } from '../utils/montageStatus';
import type { MontageOrdersPageDto } from '@/types/project';

// Active work keeps an operational window; completed work covers all history.
const WINDOW_START = (mode: 'active' | 'completed') =>
    mode === 'completed' ? '2000-01-01' : dayjs().subtract(1, 'year').format('YYYY-MM-DD');
const WINDOW_END = () => dayjs().add(6, 'month').format('YYYY-MM-DD');
const PAGE_CACHE_TTL_MS = 15_000;
const pageCache = new Map<string, { at: number; data: MontageOrdersPageDto }>();
const inFlightPages = new Map<string, Promise<MontageOrdersPageDto>>();

const requestPage = (
    key: string,
    mode: 'active' | 'completed',
    page: number,
    start: string,
    end: string,
    pageSize: number,
) => {
    const existing = inFlightPages.get(key);
    if (existing) return existing;
    const request = projectApi.listMontageOrdersPage(mode, page, start, end, pageSize)
        .then((data) => {
            pageCache.set(key, { at: Date.now(), data });
            return data;
        })
        .finally(() => inFlightPages.delete(key));
    inFlightPages.set(key, request);
    return request;
};

/**
 * Sunucuda sayfalanan montaj listesi: her sayfa yalnızca 10 satırlık düz tablo
 * verisini indirir (kolon başına gerekli alanlar; rapor/pop-up yükü yok).
 * Mod değişince sayfa 1'e döner.
 */
export const useMontageOrdersPaged = (mode: 'active' | 'completed') => {
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);

    const [rows, setRows] = useState<MontageOrderRow[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    // Mod başına ayrı sayfa tutulur; mod değişimi efekt gerektirmeden 1'den başlar.
    const [pageFor, setPageFor] = useState<{ mode: string; page: number }>({ mode, page: 1 });
    const page = pageFor.mode === mode ? pageFor.page : 1;
    const setPage = useCallback((next: number) => setPageFor({ mode, page: next }), [mode]);

    // Yalnızca en yeni istek state yazar.
    const loadSeq = useRef(0);

    useEffect(() => {
        // Auth profili gelmeden istek atma (X-Tenant-Id başlığı için).
        if (!userId || !selectedTenantId) return;
        const seq = ++loadSeq.current;
        const start = WINDOW_START(mode);
        const end = WINDOW_END();
        const pageSize = mode === 'completed' ? 5 : 10;
        const cacheKey = `${selectedTenantId}:${userId}:${mode}:${page}:${start}:${end}:${pageSize}`;
        const cached = pageCache.get(cacheKey);
        if (cached && Date.now() - cached.at < PAGE_CACHE_TTL_MS) {
            setRows(cached.data.items.map(montageRowFromListItem));
            setTotal(cached.data.total);
            setLoading(false);
        } else {
            setLoading(true);
        }
        requestPage(cacheKey, mode, page, start, end, pageSize)
            .then((data) => {
                if (seq !== loadSeq.current) return;
                setRows(data.items.map(montageRowFromListItem));
                setTotal(data.total);
            })
            .catch((error) => {
                if (seq !== loadSeq.current) return;
                toast.error(error.response?.data?.error || t('projects.montajlar_yuklenemedi'));
                setRows([]);
                setTotal(0);
            })
            .finally(() => {
                if (seq === loadSeq.current) setLoading(false);
            });
    }, [mode, page, userId, selectedTenantId]);

    return useMemo(() => ({ rows, total, loading, page, setPage }), [rows, total, loading, page, setPage]);
};
