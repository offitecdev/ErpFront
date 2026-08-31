import { apiClient } from '../axios';

/* ── OSP (Offitec Selection Platform, 04.09.2026) ────────────────────────────
   Offertanfragen, die drüben mit "Get Offer" ausgelöst und per Webhook zu uns
   gebracht werden. Die Seite /sales/osp listet sie, vergibt die zuständige
   Verkäuferin / den zuständigen Verkäufer, erzeugt daraus Offerten ("Offerte
   erstellen") und meldet den Stand an die OSP zurück.

   EINE Zuständigkeit (19.09.2026): die Projektleitung als zweites Feld ist
   weg — an der Anfrage steht die Person, die die Offerte macht, und genau die
   geht als `salesman` an die OSP.

   Der STAND wird nie gewählt, er folgt der Arbeit: ohne Zuständige "Gelistet",
   mit "Verkäufer zugewiesen" (drüben `under review`), nach dem Versand der
   Angebotsmail "Gesendet" (drüben `offer has been sent`).

   ⚠ OSP-Zeilen legen NIE Artikel oder Bestand an — der Import erzeugt reine
   Textpositionen, gültig nur für diese eine Offerte. */

/** WITHDRAWN steht neben der Reihe: drüben zurückgezogen (§1b). */
export type OspStatus = 'LISTED' | 'IN_OFFER' | 'SENT' | 'APPROVED' | 'WITHDRAWN';

export interface OspDocumentDto {
    id: string;
    reference: string;
    projectNumber: string;
    documentId: string | null;
    projectName: string;
    requesterFirstName: string | null;
    requesterLastName: string | null;
    requesterEmail: string | null;
    company: string | null;
    /** Rufnummer für DIESES Projekt — nicht zwingend die des OSP-Kontos. */
    phone: string | null;
    country: string | null;
    city: string | null;
    /** Die Projektadresse: wo die Einheiten stehen werden. */
    address: string | null;
    /** Liefer- und Rechnungsadresse kommen aufgelöst an — wo die anfragende
        Person "gleich wie Projekt" wählte, wiederholen sie die Projektadresse. */
    shippingAddress: string | null;
    billingAddress: string | null;
    postalCode: string | null;
    userType: string | null;
    category: string | null;
    unitType: string | null;
    model: string | null;
    ospCreatedAt: string | null;
    status: OspStatus;
    salespersonId: string | null;
    salespersonEmail: string | null;
    salespersonName: string | null;
    /** VERALTET (19.09.2026): die Projektleitung wird nicht mehr gewählt. Die
        Felder kommen weiterhin mit, damit alte Zeilen ihre Herkunft behalten. */
    projectManagerId: string | null;
    projectManagerEmail: string | null;
    projectManagerName: string | null;
    /** Zurückgezogen (§1b): die Zeile behält alles, arbeitet aber niemand mehr. */
    withdrawnAt: string | null;
    withdrawnByName: string | null;
    withdrawnByEmail: string | null;
    withdrawnFromStatus: string | null;
    /** Überarbeitet (§1a): dieselbe Anfrage kam neu gerechnet noch einmal. */
    revisedAt: string | null;
    revisionCount: number;
    /** Wann die Überarbeitung an der Offerte zur Kenntnis genommen wurde — die
        Warnung steht, solange `revisedAt` jünger ist als dieser Stempel. */
    revisionSeenAt: string | null;
    tenderId: string | null;
    tenderNumber: string | null;
    /** Adresse des ECHTEN Datenblatt-PDF drüben (nicht der Offerten-Link). */
    datasheetUrl: string | null;
    /** Gesetzt, sobald das PDF bei uns liegt — erst dann ist es zu öffnen. */
    datasheetFile: string | null;
    datasheetFetchedAt: string | null;
    datasheetError: string | null;
    /** Aus dem PDF gelesene Angaben; füllen das Import-Fenster vor. */
    datasheetSpecs: OspDatasheetSpecs | null;
    lastReportedStatus: string | null;
    lastReportAt: string | null;
    lastReportError: string | null;
    createdAt: string;
}

/**
 * Die Angaben der Einheit (siehe ospDatasheet.ts). Sie kommen seit der dritten
 * Vertragsfassung im Webhook selbst — berechnet am eingegebenen Betriebspunkt;
 * das Datenblatt-PDF füllt nur noch auf, was der Vertrag nicht kennt.
 */
export interface OspDatasheetSpecs {
    power?: string;
    /** true = die gefundene Leistung ist eine KÜHL-Leistung (Chiller). */
    powerIsCooling?: boolean;
    /** Eine Wärmepumpe hat beides — dann steht die Kühlleistung daneben. */
    coolingPower?: string;
    cop?: string;
    /** Kühl-Wirkungsgrad; ein Chiller nennt nur ihn, keinen COP. */
    eer?: string;
    medium?: string;
    technology?: string;
    sound1m?: string;
    sound10m?: string;
    dimensions?: string;
    weight?: string;
}

export interface OspListResponse {
    items: OspDocumentDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    counts: Record<OspStatus, number>;
    configured: boolean;
}

export interface OspSettingsDto {
    rootTenantId: string;
    tenantIds: string[];
    webhookKey: string;
    ospBaseUrl: string;
    hasApiKey: boolean;
    /** §1: die neue Anfrage (OFFER_WEBHOOK_URL). */
    webhookPath: string;
    /** §1a: dieselbe Anfrage, neu gerechnet (OFFER_REVISION_WEBHOOK_URL). */
    revisionWebhookPath?: string;
    /** §1b: die anfragende Person zieht zurück (OFFER_WITHDRAWAL_WEBHOOK_URL). */
    withdrawalWebhookPath?: string;
    /** Die Adresse der zweiten Vertragsfassung (DOCUMENT_CHANGE_WEBHOOK_URL);
        sie nimmt dieselben Überarbeitungen an wie die Revisionsadresse. */
    changeWebhookPath?: string;
}

export interface OspImportPosition {
    title: string;
    descriptionHtml: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    taxRate?: number;
}

export interface OspImportInput {
    customerId?: string | null;
    manualCustomer?: {
        name: string;
        email?: string | null;
        country?: string | null;
        city?: string | null;
        address?: string | null;
        postalCode?: string | null;
    } | null;
    positions: OspImportPosition[];
    salespersonId?: string | null;
}

export const ospApi = {
    /** Die Liste — Seiten zu 15 (Vorgabe: "in Gruppen von 15 ziehen"). */
    listDocuments: (params: { page?: number; pageSize?: number; status?: OspStatus | ''; q?: string } = {}) =>
        apiClient.get<OspListResponse>('/osp/documents', {
            params: {
                page: params.page || 1,
                pageSize: params.pageSize || 15,
                ...(params.status ? { status: params.status } : {}),
                ...(params.q ? { q: params.q } : {}),
            },
        }).then((r) => r.data),

    /** Die einzige Pflege an einer Zeile: WER zuständig ist. Der Stand folgt
        daraus und wird darum nicht mitgeschickt. */
    updateDocument: (id: string, patch: { salespersonId?: string | null }) =>
        apiClient.patch<OspDocumentDto>(`/osp/documents/${id}`, patch).then((r) => r.data),

    /** Die Anfrage löschen — meldet der OSP zuerst den Rückzug (§4b) und
        entfernt die Zeile erst, wenn drüben quittiert wurde. Die Offerte, die
        daraus entstanden ist, bleibt bestehen. */
    deleteDocument: (id: string) =>
        apiClient.delete<{ deleted: boolean; reference: string; reported: boolean }>(
            `/osp/documents/${id}`,
        ).then((r) => r.data),

    /** Die OSP-Anfrage einer OFFERTE — `null`, wenn die Offerte nicht aus der
        OSP kommt (der Normalfall, kein Fehler). */
    byTender: (tenderId: string) =>
        apiClient.get<{ document: OspDocumentDto | null }>(`/osp/documents/by-tender/${tenderId}`)
            .then((r) => r.data.document),

    /** Die Überarbeitung (§1a) zur Kenntnis nehmen — die Warnung an der
        Offerte verschwindet, `revisedAt` bleibt als Verlauf stehen. */
    markRevisionSeen: (id: string) =>
        apiClient.post<OspDocumentDto>(`/osp/documents/${id}/revision-seen`).then((r) => r.data),

    importDocument: (id: string, input: OspImportInput) =>
        apiClient.post<{ tenderId: string; tenderNumber: string; document: OspDocumentDto }>(
            `/osp/documents/${id}/import`, input,
        ).then((r) => r.data),

    /** Abgleich mit der OSP — liest die Stände drüben zurück (Gruppen von 15). */
    sync: () => apiClient.post<{ checked: number; updated: number; failed: number }>('/osp/sync').then((r) => r.data),

    /** Das abgelegte Datenblatt — kommt aus UNSEREM Programm, nicht von der OSP. */
    datasheet: (id: string) =>
        apiClient.get<Blob>(`/osp/documents/${id}/datasheet`, { responseType: 'blob' }).then((r) => r.data),

    /** Erneut holen — z. B. wenn die OSP beim ersten Versuch nicht antwortete. */
    refetchDatasheet: (id: string, datasheetUrl?: string) =>
        apiClient.post<OspDocumentDto>(
            `/osp/documents/${id}/datasheet`,
            datasheetUrl ? { datasheetUrl } : {},
        ).then((r) => r.data),

    getSettings: () => apiClient.get<OspSettingsDto>('/osp/settings').then((r) => r.data),

    saveSettings: (input: { tenantIds?: string[]; webhookKey?: string | null; ospBaseUrl?: string | null; ospApiKey?: string | null }) =>
        apiClient.put<OspSettingsDto>('/osp/settings', input).then((r) => r.data),
};
