import { useEffect, useState } from 'react';

import { useTasksModuleStore } from '../store/tasksModuleStore';

/**
 * «Jetzt» nach der Uhr des SERVERS (Browseruhr + gemessener Versatz), im Takt
 * von `intervalMs`. Laufende Messungen zählen damit auf jedem Gerät gleich,
 * auch wenn die Uhr des Rechners ein paar Minuten danebenliegt.
 * `enabled = false` hält den Takt an (nichts läuft → kein Neuzeichnen).
 */
export const useNow = (intervalMs = 1000, enabled = true): number => {
    const offset = useTasksModuleStore((state) => state.serverOffsetMs);
    const [now, setNow] = useState(() => Date.now() + offset);

    useEffect(() => {
        setNow(Date.now() + offset);
        if (!enabled) return undefined;
        const id = window.setInterval(() => setNow(Date.now() + offset), intervalMs);
        return () => window.clearInterval(id);
    }, [intervalMs, enabled, offset]);

    return now;
};
