import { apiClient, getShared } from '../axios';

/* MENGENEINHEITEN (Einstellungen → Module → Lager → Einheiten).
   Je Mandant EINE pflegbare Liste — Stück, Meter, Kilogramm, Liter, Set,
   Packung … —, aus der beim Artikel gewählt wird. Auf dem Artikel steht
   weiterhin nur der kurze Code (`unit`); die Liste sagt, was zur Auswahl steht
   und wie es ausgeschrieben heisst. */

/** Wo eine Einheit heute steckt — die Einstellungsseite zeigt es je Zeile. */
export interface UnitUsage {
    /** Angebots- und Auftragszeilen, die in dieser Einheit rechnen. */
    salesPositions: number;
    /** Artikel, die die Einheit tragen. */
    articles: number;
    /** Menge, die in dieser Einheit am Lager liegt. */
    stockQuantity: number;
}

export interface MeasurementUnit {
    id: string;
    /** Das kurze Zeichen neben der Menge ("Stk") — DAS steht auf dem Artikel. */
    code: string;
    /** Der ausgeschriebene Name im Auswahlfeld ("Stück"). */
    name: string;
    sortOrder: number;
    /** Stillgelegte Einheiten stehen nicht mehr zur Auswahl, bleiben aber lesbar. */
    isActive: boolean;
    /** Vorgabe für neue Artikel — genau eine Einheit trägt sie. */
    isDefault: boolean;
    /** Nur bei `list({ usage: true })` dabei — sonst undefined. */
    usage?: UnitUsage;
}

export interface UnitPatch {
    code?: string;
    name?: string;
    isActive?: boolean;
    isDefault?: boolean;
}

export const unitsApi = {
    /**
     * Die Liste. `usage: true` hängt je Einheit an, wo sie steckt (Verkauf,
     * Lager, Bestand) — das fragt NUR die Einstellungsseite; das Auswahlfeld
     * holt die nackte Liste.
     */
    list: (options: { usage?: boolean } = {}) => getShared<MeasurementUnit[]>(
        options.usage ? '/settings/units?usage=true' : '/settings/units',
    ).then((r) => r.data),

    create: (input: { code: string; name: string }) =>
        apiClient.post<MeasurementUnit>('/settings/units', input).then((r) => r.data),

    update: (id: string, patch: UnitPatch) =>
        apiClient.patch<MeasurementUnit>(`/settings/units/${id}`, patch).then((r) => r.data),

    /** Nur möglich, solange kein Artikel die Einheit trägt — sonst 409. */
    remove: (id: string) => apiClient.delete(`/settings/units/${id}`).then(() => undefined),
};
