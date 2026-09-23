import { apiClient, getShared } from '../axios';
import { itGateHeaders } from '../itGate';

/* CODE-EINSTELLUNGEN (Einstellungen → Module → Lager → Code-Einstellungen,
   10.09.2026; auf 2–4 Zellen erweitert 22.09.2026).

   Der ERP-Code besteht aus ZELLEN und einem Zähler:
       ELK-PLC-00001            (2 Zellen + Zähler)
       ELK-PANO-PLC-H-00400     (4 Zellen + Zähler)
   Die erste Zelle stellt die KATEGORIE, die übrigen (1–3) der NUMMERNKREIS.
   Die IT bereitet Kreise vor; erst nach ihrer FREIGABE (IT-Schleuse) vergibt
   ein Kreis Codes und erscheint in der Schnellerfassung.

   Alles, was VERGEBENE Codes berührt (Zellen tauschen, löschen, zurücksetzen,
   neu durchnummerieren), antwortet ohne Ausweis der Schleuse mit 403 — der
   Aufrufer holt dann das IT-Kennwort und versucht es erneut. */

/** Zellen INSGESAMT, Kategorie mitgezählt — Vorgabe Samet 22.09.2026. */
export const MIN_CODE_CELLS = 2;
export const MAX_CODE_CELLS = 4;
/** Zellen, die der Nummernkreis stellt (die Kategorie stellt die erste). */
export const MAX_SCHEME_CELLS = MAX_CODE_CELLS - 1;
export const MIN_CODE_DIGITS = 1;
export const MAX_CODE_DIGITS = 10;

export interface CodeScheme {
    id: string;
    categoryId: string;
    /** Die Zellen des Kreises, verbunden: «PANO-PLC-H». */
    code: string;
    /** Dieselben Zellen einzeln: ["PANO","PLC","H"]. */
    cells: string[];
    name: string;
    startNumber: number;
    /** Zuletzt vergebene Laufnummer (0 = noch keine). */
    lastNumber: number;
    /** Breite des Zählers (Vorgabe 5 → 00001). */
    digits: number;
    /** Von der IT freigegeben — nur dann vergibt der Kreis Codes. */
    isActive: boolean;
    activatedAt?: string | null;
    sortOrder: number;
    /** `ELK-PANO-PLC-H-` */
    prefix: string;
    /** Der Code, den der Kreis als Nächstes vergeben würde. */
    nextCode: string;
    /** Wie viele Artikel diesen Kreis tragen (nur in der Einstellungssicht). */
    articleCount?: number;
    /** Antwort einer Änderung: so viele Artikel sind mitgewandert. */
    migratedArticles?: number;
    /** Antwort des Neudurchnummerierens. */
    renumbered?: number;
    nextNumber?: number;
}

export interface CodeCategory {
    id: string;
    /** Die erste Zelle («ELK»). */
    code: string;
    name: string;
    sortOrder: number;
    schemes: CodeScheme[];
    /** Artikel über alle Kreise der Kategorie (nur in der Einstellungssicht). */
    articleCount?: number;
    migratedArticles?: number;
}

export interface SchemeInput {
    cells: string[];
    name: string;
    startNumber?: number;
    digits?: number;
    /** true = bestehende Artikel bekommen den neuen Code, false = sie behalten ihren. */
    migrateArticles?: boolean;
}

export const articleCodesApi = {
    /** Alle Kategorien mit Kreisen; `active: true` = nur freigegebene (Sicht der Schnellerfassung). */
    list: (options: { active?: boolean } = {}) => getShared<CodeCategory[]>(
        options.active ? '/settings/article-codes?active=true' : '/settings/article-codes',
    ).then((r) => r.data),

    createCategory: (input: { code: string; name: string }) =>
        apiClient.post<CodeCategory>('/settings/article-codes/categories', input).then((r) => r.data),
    updateCategory: (id: string, patch: { code?: string; name?: string; migrateArticles?: boolean }) =>
        apiClient.patch<CodeCategory>(`/settings/article-codes/categories/${id}`, patch, { headers: itGateHeaders() }).then((r) => r.data),
    /** Löscht die Kategorie SAMT ihren Nummernkreisen; vergebene Codes bleiben auf den Artikeln. */
    removeCategory: (id: string) =>
        apiClient.delete<{ removedSchemes: number; keptArticles: number }>(
            `/settings/article-codes/categories/${id}`,
            { headers: itGateHeaders() },
        ).then((r) => r.data),

    createScheme: (input: SchemeInput & { categoryId: string }) =>
        apiClient.post<CodeScheme>('/settings/article-codes/schemes', input).then((r) => r.data),
    updateScheme: (id: string, patch: Partial<SchemeInput>) =>
        apiClient.patch<CodeScheme>(`/settings/article-codes/schemes/${id}`, patch, { headers: itGateHeaders() }).then((r) => r.data),
    removeScheme: (id: string) =>
        apiClient.delete<{ keptArticles: number }>(
            `/settings/article-codes/schemes/${id}`,
            { headers: itGateHeaders() },
        ).then((r) => r.data),

    /**
     * FREIGABE durch die IT — der Ausweis der IT-Schleuse reist im Kopf mit.
     * Ohne gültigen Ausweis antwortet der Server 403; der Aufrufer fragt dann
     * das IT-Kennwort ab und versucht es erneut.
     */
    setActivation: (id: string, active: boolean) =>
        apiClient.post<CodeScheme>(
            `/settings/article-codes/schemes/${id}/activation`,
            { active },
            { headers: itGateHeaders() },
        ).then((r) => r.data),

    /**
     * Die Nummerierung zurücksetzen (immer hinter der IT-Schleuse):
     *   counter  — der Zähler fängt wieder bei der Startnummer an (oder bei
     *              `value`); vergebene Nummern werden übersprungen.
     *   renumber — die Artikel des Kreises bekommen ihre Codes neu, lückenlos.
     */
    reset: (id: string, input: { mode: 'counter' | 'renumber'; value?: number }) =>
        apiClient.post<CodeScheme>(
            `/settings/article-codes/schemes/${id}/reset`,
            input,
            { headers: itGateHeaders() },
        ).then((r) => r.data),
};
