import { useCallback, useEffect, useState } from 'react';

import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchState } from '@/types/purchasing';

/**
 * Sendungen und Antworten der Belege eines Talep (30.09.2026) — wann, an wen,
 * ob die Antwort mit PDF kam. Ein Fehler lässt die Seite in Ruhe (die Zeilen
 * zeigen dann einfach keinen Mailstand). `reload()` nach einer Sendung.
 */
export const useDispatchStatus = (purchaseOrderIds: string[]) => {
    const key = purchaseOrderIds.join(',');
    const [items, setItems] = useState<Record<string, DispatchState>>({});
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let alive = true;
        const ids = key ? key.split(',') : [];
        if (!ids.length) return undefined;
        purchasingApi.dispatchStatus(ids)
            .then((value) => { if (alive) setItems(value); })
            .catch(() => undefined);
        return () => { alive = false; };
    }, [key, tick]);

    const reload = useCallback(() => setTick((value) => value + 1), []);
    return { items, reload };
};
