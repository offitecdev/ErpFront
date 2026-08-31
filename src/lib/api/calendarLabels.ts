import { apiClient } from '../axios';

/* KALENDER-ETIKETTEN (Kalender → Leiste «Etiketten», Zahnrad daneben).
   Je Mandant EINE Liste, aus der ein Kalendereintrag sein Etikett bekommt.
   Sie steht von Anfang an richtig da: je ROLLE ein Etikett mit eigener Farbe.
   Die Farbe der Karte im Raster kommt AUS dieser Liste; der Kalender leitet
   sie nicht mehr aus der Uhr ab (Vorgabe 25.08.2026). */

/** Wofür ein Etikett gedacht ist. `null` = ein reines Farbetikett. */
export type CalendarLabelRole = 'PLANNED' | 'ONGOING' | 'DONE' | 'MEETING';

export interface CalendarLabelDto {
    id: string;
    name: string;
    /** #rrggbb — die Fläche der Karte und der Punkt in der Leiste. */
    color: string;
    sortOrder: number;
    /** Sperrt nichts: sie sagt, welches Etikett beim Anlegen vorgeschlagen
        wird — und welche Rolle im «+» noch frei ist (je Rolle EIN sichtbares
        Etikett). Aufgaben haben keine Rolle: sie stehen nicht mehr im Raster. */
    role: CalendarLabelRole | null;
    /** Weggeräumt, aber nicht weggeworfen: raus aus Leiste und Auswahlfeld,
        die Einträge behalten es, das «+» holt es zurück. */
    hidden: boolean;
}

export interface CalendarLabelInput {
    name: string;
    color?: string;
    role?: CalendarLabelRole | null;
}

export interface CalendarLabelPatch {
    name?: string;
    color?: string;
    role?: CalendarLabelRole | null;
    hidden?: boolean;
    sortOrder?: number;
}

export const calendarLabelApi = {
    list: () => apiClient.get<CalendarLabelDto[]>('/calendar/labels').then((r) => (Array.isArray(r.data) ? r.data : [])),

    create: (input: CalendarLabelInput) =>
        apiClient.post<CalendarLabelDto>('/calendar/labels', input).then((r) => r.data),

    update: (id: string, patch: CalendarLabelPatch) =>
        apiClient.patch<CalendarLabelDto>(`/calendar/labels/${id}`, patch).then((r) => r.data),

    /**
     * ENDGÜLTIG löschen. Der gewöhnliche Weg ist `update(id, { hidden: true })`
     * — dabei geht nichts verloren und das «+» holt das Etikett zurück.
     *
     * Trägt es noch Einträge, antwortet der Server mit 409 und der Anzahl; die
     * Oberfläche fragt dann nach und wiederholt den Aufruf mit `force`. Die
     * Einträge selbst bleiben stehen und sind danach «ohne Etikett».
     */
    remove: (id: string, options: { force?: boolean } = {}) =>
        apiClient.delete(`/calendar/labels/${id}${options.force ? '?force=true' : ''}`).then(() => undefined),
};
