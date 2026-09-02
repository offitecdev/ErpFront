import { apiClient } from '../axios';

/* ── OSP (Offitec Selection Platform, 04.09.2026) ────────────────────────────
   Offertanfragen, die drüben mit "Get Offer" ausgelöst und per Webhook zu uns
   gebracht werden. Die Seite /sales/osp listet sie, vergibt die zuständige
   Verkäuferin / den zuständigen Verkäufer, erzeugt daraus Offerten ("Offerte
   erstellen") und meldet den Stand an die OSP zurück.

   EINE ANFRAGE IST EIN PROJEKT (vierte Vertragsfassung, 20.09.2026). Wer
   drüben "Get Offer" drückt, fragt nicht eine Einheit an, sondern sein ganzes
   Projekt — und bekommt darauf EINE Antwort. Die angefragten Einheiten hängen
   als `units` an der Anfrage, jede mit eigenem Datenblatt und eigenen Zahlen;
   der Import macht daraus eine Offertposition je Einheit.

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

/**
 * EINE angefragte Einheit (§1 `projectDetails`). Ihre Zahlen sind BERECHNET —
 * am eingegebenen Betriebspunkt, nicht am Katalogwert —, und ihr Datenblatt
 * ist die Datei, aus der offeriert wird.
 */
export interface OspUnitDto {
    id: string;
    /** Die eigene Dokument-Id der OSP — über alle Projekte eindeutig. */
    ospDocumentId: string;
    /** §1 nennt sie nicht; sie kommen aus dem Aktivitätsstrom (§1c). */
    unitName: string | null;
    unitModel: string | null;
    /** Adresse drüben. Sie stirbt bei der nächsten Neuberechnung. */
    pdfUrl: string | null;
    /** Gesetzt, sobald das PDF bei uns liegt — erst dann ist es zu öffnen. */
    datasheetFile: string | null;
    datasheetFetchedAt: string | null;
    datasheetError: string | null;
    datasheetSpecs: OspDatasheetSpecs | null;
    /** §1a: was an DIESER Einheit passiert ist. `[]` heisst: neu gerendert
        durch eine Änderung am Projekt, an der Einheit selbst nichts. */
    changes: string[] | null;
    receivedAt: string | null;
}

export interface OspDocumentDto {
    id: string;
    /** Die Projektnummer — der Schlüssel jeder Statusmeldung (§0). */
    reference: string;
    projectNumber: string;
    /** VERALTET: die Dokument-Id, als eine Anfrage noch eine Einheit war. */
    documentId: string | null;
    /** Die eigene Projekt-Id der OSP. */
    ospProjectId: number | null;
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
    /** Überarbeitet (§1a): dieselbe Anfrage kam geändert noch einmal. */
    revisedAt: string | null;
    revisionCount: number;
    /** Wann die Überarbeitung an der Offerte zur Kenntnis genommen wurde — die
        Warnung steht, solange `revisedAt` jünger ist als dieser Stempel. */
    revisionSeenAt: string | null;
    /** §1a: was am PROJEKT bewegt wurde ("project name", "phone" …). */
    changes: string[] | null;
    /** §1c: der Aktivitätsstrom hat gemeldet, dass ein Datenblatt dieser
        Anfrage drüben NEU GERENDERT wurde — ohne dass jemand neu angefragt
        hätte. Keine Anfrage, kein Stand: nur der Hinweis, dass die alte Datei
        drüben gelöscht ist. */
    feedRevisedAt: string | null;
    feedRevisedSource: string | null;
    tenderId: string | null;
    tenderNumber: string | null;
    /** Die angefragten Einheiten — eine Offertposition je Stück. */
    units?: OspUnitDto[];
    lastReportedStatus: string | null;
    lastReportAt: string | null;
    lastReportError: string | null;
    createdAt: string;
    /** VERALTET (20.09.2026): das Datenblatt hing an der Anfrage, als sie noch
        eine Einheit war. Es steht jetzt an der Einheit (`units`). */
    datasheetUrl?: string | null;
    datasheetFile?: string | null;
    datasheetError?: string | null;
    datasheetSpecs?: OspDatasheetSpecs | null;
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

/**
 * EIN Eintrag des Aktivitätsstroms (§1c): eine Berechnung, die drüben in ein
 * Projekt abgelegt wurde. KEINE Anfrage — niemand hat um eine Offerte gebeten,
 * es hängt kein Stand daran, und beantwortet wird hier nichts. Der Strom sagt,
 * was gerechnet wird; ob daraus je eine Anfrage wird, sagt er nicht.
 */
export interface OspFeedEntryDto {
    id: string;
    ospDocumentId: string;
    ospProjectId: number | null;
    projectNumber: string | null;
    projectName: string | null;
    projectCreatedAt: string | null;
    requesterFirstName: string | null;
    requesterLastName: string | null;
    requesterEmail: string | null;
    company: string | null;
    unitName: string | null;
    unitModel: string | null;
    pdfUrl: string | null;
    /** CALCULATION / ADDED_TO_PROJECT = neu; die übrigen fünf = Änderung. */
    source: string;
    filedAt: string | null;
    coolingCapacityKw: string | null;
    heatingCapacityKw: string | null;
    eer: string | null;
    cop: string | null;
    firstSeenAt: string;
    /** Halten wir zu diesem Beleg eine Anfrage? Der Strom sagt es nicht — das
        beantwortet der Server aus unseren eigenen Aufzeichnungen. */
    requestId: string | null;
    requestStatus: OspStatus | null;
    tenderId: string | null;
    tenderNumber: string | null;
}

export interface OspFeedResponse {
    items: OspFeedEntryDto[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

export interface OspSettingsDto {
    rootTenantId: string;
    tenantIds: string[];
    webhookKey: string;
    ospBaseUrl: string;
    hasApiKey: boolean;
    /** §1: die neue Anfrage (OFFER_WEBHOOK_URL). */
    webhookPath: string;
    /** §1a: dieselbe Anfrage, geändert (OFFER_REVISION_WEBHOOK_URL). */
    revisionWebhookPath?: string;
    /** §1b: die anfragende Person zieht zurück (OFFER_WITHDRAWAL_WEBHOOK_URL). */
    withdrawalWebhookPath?: string;
    /** §1c: der Aktivitätsstrom (PROJECT_WEBHOOK_URL) — keine Anfragen. */
    projectWebhookPath?: string;
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

    /** Der Aktivitätsstrom (§1c) — was drüben gerechnet wird. Zum ANSCHAUEN:
        hier ist nichts zu tun und nichts zu beantworten. */
    listFeed: (params: { page?: number; pageSize?: number; q?: string } = {}) =>
        apiClient.get<OspFeedResponse>('/osp/feed', {
            params: {
                page: params.page || 1,
                pageSize: params.pageSize || 15,
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

    /** Das abgelegte Datenblatt EINER EINHEIT — es kommt aus UNSEREM Programm,
        nicht von der OSP: die Adresse drüben stirbt bei der nächsten
        Neuberechnung, unsere Kopie nicht. */
    datasheet: (unitId: string) =>
        apiClient.get<Blob>(`/osp/units/${unitId}/datasheet`, { responseType: 'blob' }).then((r) => r.data),

    /** Erneut holen — z. B. wenn die OSP beim ersten Versuch nicht antwortete
        oder der Aktivitätsstrom eine neue Adresse gebracht hat. */
    refetchDatasheet: (unitId: string, pdfUrl?: string) =>
        apiClient.post<OspUnitDto>(
            `/osp/units/${unitId}/datasheet`,
            pdfUrl ? { pdfUrl } : {},
        ).then((r) => r.data),

    getSettings: () => apiClient.get<OspSettingsDto>('/osp/settings').then((r) => r.data),

    saveSettings: (input: { tenantIds?: string[]; webhookKey?: string | null; ospBaseUrl?: string | null; ospApiKey?: string | null }) =>
        apiClient.put<OspSettingsDto>('/osp/settings', input).then((r) => r.data),
};
