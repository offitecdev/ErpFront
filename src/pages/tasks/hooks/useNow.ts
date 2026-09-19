import { useEffect, useReducer } from 'react';

import { useTasksModuleStore } from '../store/tasksModuleStore';
import { clockNow, subscribeClock } from './liveClock';

/**
 * «Jetzt» nach der Uhr des SERVERS (Browseruhr + gemessener Versatz).
 * Laufende Messungen zählen damit auf jedem Gerät gleich, auch wenn die Uhr
 * des Rechners ein paar Minuten danebenliegt.
 *
 * Alle Aufrufer hängen am EINEN Takt des Moduls (`liveClock`): sie werden im
 * selben Tick geweckt und lesen denselben Stand — die Sekunden springen überall
 * gleichzeitig um. `intervalMs` ≥ 60 s = nur beim Minutenwechsel wecken;
 * `enabled = false` hält den Takt für diesen Aufrufer an (nichts läuft → kein
 * Neuzeichnen).
 */
export const useNow = (intervalMs = 60_000, enabled = true): number => {
    const offset = useTasksModuleStore((state) => state.serverOffsetMs);
    const [, wake] = useReducer((count: number) => count + 1, 0);
    const quantum = intervalMs >= 60_000 ? 'minute' : 'second';

    useEffect(() => (enabled ? subscribeClock(wake, quantum) : undefined), [enabled, quantum]);

    return clockNow() + offset;
};
