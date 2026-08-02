import { useCallback, useEffect, useState } from 'react';

import { inventoryApi } from '@/lib/api/inventory';
import type { ArticleDetail } from '@/types/inventory';

/**
 * Kritik başlık ve hesaplanan istatistikler paralel istenir. Başlık hazır olur
 * olmaz ekran açılır; maliyet/açık sipariş taraması render'ı bloke etmez.
 */
export const useArticleDetail = (id: string | undefined) => {
    const [detail, setDetail] = useState<ArticleDetail | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [reloadTick, setReloadTick] = useState(0);

    const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

    useEffect(() => {
        if (!id) return;
        let cancelled = false;
        let core: ArticleDetail | null = null;
        let stats: Awaited<ReturnType<typeof inventoryApi.getArticleDetailStats>> | null = null;

        setDetail(null);
        setLoading(true);
        setError(null);
        inventoryApi
            .getArticleDetail(id)
            .then((result) => {
                core = result;
                if (!cancelled) setDetail(stats ? { ...result, ...stats } : result);
            })
            .catch((err) => { if (!cancelled) setError(err?.response?.data?.error || err?.message || 'error'); })
            .finally(() => { if (!cancelled) setLoading(false); });

        inventoryApi
            .getArticleDetailStats(id)
            .then((result) => {
                stats = result;
                if (!cancelled) {
                    // Kullanıcı istatistikler gelmeden kayıt yaptıysa güncel ana
                    // alanları eski `core` kopyasıyla ezme; yalnızca stats'i ekle.
                    setDetail((current) => current
                        ? { ...current, ...result }
                        : core ? { ...core, ...result } : current);
                }
            })
            // İstatistik hatası ana ürün kartını kullanılmaz hale getirmemeli.
            .catch(() => undefined);

        return () => { cancelled = true; };
    }, [id, reloadTick]);

    return { detail, setDetail, loading, error, reload };
};
