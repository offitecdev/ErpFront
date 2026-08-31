import { useEffect, useState } from 'react';

import { fetchStaffDirectory } from '@/lib/api/directory';
import type { StaffDirectoryRow } from '@/lib/api/directory';

/**
 * Personalliste für die CRM-Auswahlfelder (Verantwortlich, Mitarbeiterfilter).
 * Quelle ist bewusst `/employees/directory`: die HR-Liste hängt an
 * `employees.view` und lieferte Kolleginnen und Kollegen ohne HR-Recht eine
 * leere Auswahl.
 *
 * `enabled` hält die Anfrage zurück, solange das Feld gar nicht sichtbar ist.
 *
 * `loading` wird NICHT im Rumpf des Effekts gesetzt, sondern aus "gefragt, aber
 * noch keine Antwort" abgeleitet. Das ist nicht nur sauberer, es ist auch der
 * Unterschied zwischen "wird geladen …" und einem falschen "nichts gefunden"
 * im ersten Moment, in dem die Liste aufklappt.
 */
export const useStaffDirectory = (enabled = true) => {
    const [staff, setStaff] = useState<StaffDirectoryRow[]>([]);
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        if (!enabled || loaded) return;
        let cancelled = false;
        fetchStaffDirectory()
            .then((rows) => { if (!cancelled) setStaff(rows); })
            .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
    }, [enabled, loaded]);

    return { staff, loading: enabled && !loaded };
};
