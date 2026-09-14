import { apiClient, getShared } from '../axios';
import { itGateHeaders } from '../itGate';

/* CODE-EINSTELLUNGEN (Einstellungen → Module → Lager → Code-Einstellungen,
   10.09.2026). Der ERP-Code eines Artikels ist `KAT-UNTER-NNNNN`: Kategorie
   («Elektro» = ELK), Nummernkreis/Unterkategorie («PLC» = PLC) und eine
   fünfstellige Laufnummer je Kreis. Die IT bereitet Kreise vor; erst nach
   ihrer FREIGABE (IT-Schleuse) vergibt ein Kreis Codes und erscheint in der
   Schnellerfassung. */

export interface CodeScheme {
    id: string;
    categoryId: string;
    /** Kürzel der Unterkategorie («PLC»). */
    code: string;
    name: string;
    startNumber: number;
    /** Zuletzt vergebene Laufnummer (0 = noch keine). */
    lastNumber: number;
    /** Von der IT freigegeben — nur dann vergibt der Kreis Codes. */
    isActive: boolean;
    activatedAt?: string | null;
    sortOrder: number;
    /** `ELK-PLC-` */
    prefix: string;
    /** Der Code, den der Kreis als Nächstes vergeben würde. */
    nextCode: string;
}

export interface CodeCategory {
    id: string;
    /** Kürzel («ELK»). */
    code: string;
    name: string;
    sortOrder: number;
    schemes: CodeScheme[];
}

export const articleCodesApi = {
    /** Alle Kategorien mit Kreisen; `active: true` = nur freigegebene (Sicht der Schnellerfassung). */
    list: (options: { active?: boolean } = {}) => getShared<CodeCategory[]>(
        options.active ? '/settings/article-codes?active=true' : '/settings/article-codes',
    ).then((r) => r.data),

    createCategory: (input: { code: string; name: string }) =>
        apiClient.post<CodeCategory>('/settings/article-codes/categories', input).then((r) => r.data),
    updateCategory: (id: string, patch: { code?: string; name?: string }) =>
        apiClient.patch<CodeCategory>(`/settings/article-codes/categories/${id}`, patch).then((r) => r.data),
    removeCategory: (id: string) =>
        apiClient.delete(`/settings/article-codes/categories/${id}`).then(() => undefined),

    createScheme: (input: { categoryId: string; code: string; name: string; startNumber?: number }) =>
        apiClient.post<CodeScheme>('/settings/article-codes/schemes', input).then((r) => r.data),
    updateScheme: (id: string, patch: { code?: string; name?: string; startNumber?: number }) =>
        apiClient.patch<CodeScheme>(`/settings/article-codes/schemes/${id}`, patch).then((r) => r.data),
    removeScheme: (id: string) =>
        apiClient.delete(`/settings/article-codes/schemes/${id}`).then(() => undefined),

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
};
