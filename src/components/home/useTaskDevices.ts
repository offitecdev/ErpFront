import { useEffect, useState } from 'react';

import { productionTasksApi } from '@/lib/api/productionTasks';
import type { TaskDeviceDirectory } from '@/types/productionTasks';

/**
 * Projekte und Einheiten mit Aufgaben (30.09.2026) — für «Anfragen & Aktivitäten»
 * und «Zuweisungen» auf der Startseite der Verwaltung. `reload` nach einer
 * erledigten Anfrage (die Zahlen stimmen dann nicht mehr).
 */
export const useTaskDevices = (enabled: boolean) => {
    const [directory, setDirectory] = useState<TaskDeviceDirectory | null>(null);
    const [failed, setFailed] = useState(false);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        if (!enabled) return undefined;
        let cancelled = false;
        void productionTasksApi.taskDevices().then(
            (value) => { if (!cancelled) { setDirectory(value); setFailed(false); } },
            () => { if (!cancelled) setFailed(true); },
        );
        return () => { cancelled = true; };
    }, [enabled, tick]);

    return { directory, failed, reload: () => setTick((value) => value + 1) };
};

/** Suchen ohne Gross/klein, auch über das türkische I und Akzente hinweg. */
export const fold = (value: string): string =>
    value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFD').replace(/[̀-ͯ]/g, '');
