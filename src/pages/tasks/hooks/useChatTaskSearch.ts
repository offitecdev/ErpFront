import { useEffect, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { TaskSearchHit } from '@/types/tasksModule';
import { isOnboardingTaskId } from '../utils/taskFormat';

const DEBOUNCE_MS = 250;

/**
 * Aufgabensuche für «Görev bağla» und das Fenster «Yeni oda»: schlanke Treffer
 * (id, Titel, Zustand) über `view=search`. Ohne Suchwort liefert der Server die
 * nächsten fälligen Aufgaben — sie stehen als Vorschläge da.
 */
export const useChatTaskSearch = (query: string, enabled: boolean) => {
    const [hits, setHits] = useState<TaskSearchHit[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        setLoading(true);
        const needle = query.trim();
        const timer = window.setTimeout(() => {
            tasksApi.search(needle, 'all')
                .then((result) => { if (!cancelled) setHits(result.filter((hit) => !isOnboardingTaskId(hit.id))); })
                .catch(() => { if (!cancelled) setHits([]); })
                .finally(() => { if (!cancelled) setLoading(false); });
        }, needle ? DEBOUNCE_MS : 0);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query, enabled]);

    return { hits, loading };
};
