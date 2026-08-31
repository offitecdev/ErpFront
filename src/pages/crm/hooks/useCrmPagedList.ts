import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import type { PagedResult } from '@/lib/api/crm';

/**
 * Serverseitig paginierte CRM-Liste — die Mechanik, die die Kundenliste
 * vormacht, in einem Haken:
 *
 *  • Filterwechsel setzt die Seite auf 1 zurück und ÜBERSPRINGT diese
 *    Fetch-Runde (sonst zwei Anfragen pro Tastendruck),
 *  • `reload()` lädt neu, OHNE die Seite zurückzusetzen (nach dem Anlegen),
 *  • abgebrochene Runden schreiben nichts mehr in den Zustand,
 *  • `mutateRows()` ändert die geladene Seite ÖRTLICH (Status umschalten,
 *    Zeile entfernen) — ohne Neuladen und ohne Flackern; die Liste baut sich
 *    nach einer Aktion nicht von vorn auf (Vorgabe 15.08.2026).
 *
 * `fetcher` muss stabil sein (useCallback), `filterKey` die serialisierten
 * Filter — sie entscheiden gemeinsam, wann neu geladen wird.
 */
export const useCrmPagedList = <T>({
    fetcher,
    filterKey,
    pageSize,
    errorMessageKey,
}: {
    fetcher: (page: number) => Promise<PagedResult<T>>;
    filterKey: string;
    pageSize: number;
    errorMessageKey: string;
}) => {
    const [rows, setRows] = useState<T[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [loading, setLoading] = useState(true);
    const [reloadTick, setReloadTick] = useState(0);

    const filterKeyRef = useRef<string | null>(null);
    useEffect(() => {
        const filtersChanged = filterKeyRef.current !== null && filterKeyRef.current !== filterKey;
        filterKeyRef.current = filterKey;
        if (filtersChanged && page !== 1) {
            setPage(1);
            return;
        }

        let cancelled = false;
        (async () => {
            try {
                setLoading(true);
                const result = await fetcher(page);
                if (cancelled) return;
                setRows(result.data);
                setTotal(result.total);
            } catch {
                if (cancelled) return;
                toast.error(t(errorMessageKey));
                setRows([]);
                setTotal(0);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // `fetcher` schließt die Filter ein; `filterKey` ist ihr stabiler Abdruck.
    }, [page, filterKey, reloadTick, fetcher, errorMessageKey]);

    const reload = useCallback(() => setReloadTick((n) => n + 1), []);

    /** Zeilen der geladenen Seite örtlich umschreiben (kein Neuladen). */
    const mutateRows = useCallback((updater: (current: T[]) => T[]) => setRows(updater), []);

    /** Eine Zeile örtlich entfernen und den Zähler mitziehen. */
    const removeRow = useCallback((predicate: (row: T) => boolean) => {
        setRows((current) => {
            const next = current.filter((row) => !predicate(row));
            if (next.length !== current.length) setTotal((count) => Math.max(0, count - (current.length - next.length)));
            return next;
        });
    }, []);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    return {
        rows,
        total,
        page: Math.min(page, totalPages),
        totalPages,
        loading,
        setPage,
        reload,
        mutateRows,
        removeRow,
    };
};
