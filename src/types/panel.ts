/**
 * ── SCHALTSCHRÄNKE / PANOLAR (20.09.2026, Vorgabe Baris) ────────────────────
 *
 * Drei Nummern, drei Fragen — sie werden nie vermischt:
 *   Produktnummer  `PNO-CP-00001`  unser ERP-Code, EINE Karte je MODELL
 *   Modellnummer   `OT-CP-250`     der Typ; gebildet, nie getippt
 *   Seriennummer   `2026-000157`   EIN gebauter Schrank
 *
 * Die Zwillinge der Serverseite: Erp_Backend/src/shared/panelModelNumber.ts,
 * panelSerial.ts und application/services/panelCatalog.ts.
 */

/** Die Einheit der Zahl in der Modellnummer — sagt die Typenfamilie (FRAGE 2). */
export type PanelRatingUnit = 'KW' | 'A' | 'KVAR' | 'NONE';

/** Der Lebenslauf eines Schranks. */
export type PanelUnitStatus =
    | 'PLANNED'
    | 'IN_PRODUCTION'
    | 'TESTED'
    | 'STOCKED'
    | 'RESERVED'
    | 'SHIPPED'
    | 'INSTALLED'
    | 'CANCELLED';

export const PANEL_UNIT_STATUSES: PanelUnitStatus[] = [
    'PLANNED', 'IN_PRODUCTION', 'TESTED', 'STOCKED', 'RESERVED', 'SHIPPED', 'INSTALLED', 'CANCELLED',
];

/** FRAGE 5 — wann ein Variantenkürzel Pflicht ist. */
export interface PanelVariantRules {
    ip?: boolean;
    voltage?: boolean;
    custom?: boolean;
}

/** Die acht offenen Entscheidungen, als Einstellung statt als Programmzeile. */
export interface PanelSettings {
    id: string;
    tenantId: string;
    manufacturerName: string;
    modelPrefix: string;
    /** FRAGE 3 — GROUP: eine Serie für ganz OffiTec; COMPANY: je Firma eine. */
    serialScope: 'GROUP' | 'COMPANY' | string;
    /** FRAGE 4 — beginnt die Serie am 1. Januar wieder bei 000001? */
    serialYearlyReset: boolean;
    serialDigits: number;
    /** FRAGE 7 — eigener Block für nachgetragene Altschränke (z.B. 900001). */
    retroBlockStart: number | null;
    variantRules: PanelVariantRules | null;
    defaultStandard: string;
    defaultIpRating: string | null;
    defaultVoltage: number | null;
    defaultPhases: number | null;
    defaultHz: number | null;
    warrantyMonths: number;
    /** FRAGE 8 — die Physik des Schilds. */
    labelWidthMm: number;
    labelHeightMm: number;
    labelMaterial: string | null;
    labelPrinter: string | null;
    labelQrBaseUrl: string | null;
}

export interface PanelSettingsPage {
    settings: PanelSettings;
    /** In wessen Reihe diese Firma zählt (bei GROUP die Wurzel des Baums). */
    scopeTenantId: string;
    /** Was die nächste Seriennummer wäre — gezeigt, nichts gezogen. */
    nextSerialPreview: string;
    ratingUnits: Array<{ value: PanelRatingUnit; label: string }>;
}

/** FRAGE 1 + 2 + 6 — die Typenfamilie aus dem Katalog. */
export interface PanelTypeFamily {
    id: string;
    code: string;
    name: string;
    nameDe: string | null;
    ratingUnit: PanelRatingUnit | string;
    /** Muss Icw auf dem Schild dieser Familie stehen? */
    requiresShortCircuit: boolean;
    codeSchemeId: string | null;
    standard: string | null;
    sortOrder: number;
    isActive: boolean;
}

/** Die Produktkarte hinter einem Modell. */
export interface PanelModelArticle {
    id: string;
    articleCode: string;
    name: string;
    unit: string;
    salePrice: number;
}

export interface PanelModel {
    id: string;
    tenantId: string;
    articleId: string;
    typeFamilyId: string;
    typeCode: string;
    ratingValue: number;
    ratingUnit: PanelRatingUnit | string;
    variantCode: string | null;
    /** `OT-CP-250` — gebildet, nie getippt. */
    modelNumber: string;
    manufacturer: string;
    ratedVoltage: number | null;
    ratedCurrent: number | null;
    phaseCount: number | null;
    frequency: number | null;
    shortCircuitIcw: number | null;
    shortCircuitTime: number | null;
    shortCircuitIpk: number | null;
    ipRating: string | null;
    standard: string | null;
    ceMarking: boolean;
    notes: string | null;
    isActive: boolean;
    typeFamily?: PanelTypeFamily;
    article?: PanelModelArticle | null;
    unitCount?: number;
    /** Was dem Typenschild noch fehlt (leer = druckbar). */
    missingNameplate?: Array<{ field: string; label: string }>;
}

/** Die Vorschau der Maske, während getippt wird. */
export interface PanelModelPreview {
    modelNumber: string;
    taken: boolean;
    takenBy: string | null;
    ratingUnit: PanelRatingUnit | string;
    ratingUnitLabel: string;
    requiresShortCircuit: boolean;
}

/** Die eingefrorene Kopie der Schildwerte eines Schranks. */
export interface PanelNameplate {
    manufacturer: string;
    modelNumber: string;
    serialNumber: string;
    productionYear: number | null;
    ratedVoltage: number | null;
    ratedCurrent: number | null;
    phaseCount: number | null;
    frequency: number | null;
    shortCircuitIcw: number | null;
    shortCircuitTime: number | null;
    shortCircuitIpk: number | null;
    ipRating: string | null;
    standard: string | null;
    ceMarking: boolean;
    orderNumber: string | null;
    frozenAt: string;
}

/** Die Lagerbewegungen, die die Seriennummer dieses Schranks tragen. */
export interface PanelUnitMovement {
    id: string;
    movementType: 'IN' | 'OUT' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT' | string;
    quantity: number;
    transactionDate: string;
    origin: string | null;
    description: string | null;
}

export interface PanelUnit {
    id: string;
    tenantId: string;
    serialTenantId: string;
    /** `2026-000157` — die Nummer auf dem Schild. */
    serialNumber: string;
    serialYear: number;
    serialSeq: number;
    isRetro: boolean;
    panelModelId: string;
    articleId: string | null;
    modelNumberSnapshot: string | null;
    nameplate: PanelNameplate | null;
    status: PanelUnitStatus | string;
    productionProjectId: string | null;
    productionItemId: string | null;
    projectId: string | null;
    salesOrderId: string | null;
    orderNumber: string | null;
    customerId: string | null;
    customerName: string | null;
    siteName: string | null;
    schemaNumber: string | null;
    schemaRevision: string | null;
    schemaFileUrl: string | null;
    manufacturedAt: string | null;
    productionYear: number | null;
    testedAt: string | null;
    labelPrintedAt: string | null;
    deliveredAt: string | null;
    warrantyUntil: string | null;
    stockMovementId: string | null;
    notes: string | null;
    createdAt: string;
    model?: Pick<PanelModel, 'modelNumber' | 'typeCode' | 'ratingValue' | 'ratingUnit'> & Partial<PanelModel>;
    movements?: PanelUnitMovement[];
    missingNameplate?: Array<{ field: string; label: string }>;
}

export interface PanelUnitsPage {
    rows: PanelUnit[];
    total: number;
}

/** Die Antwort des Etikettendrucks: eingefrorene Werte + Schildmass. */
export interface PanelLabelResult {
    unit: PanelUnit;
    nameplate: PanelNameplate;
    label: { widthMm: number; heightMm: number; qrBaseUrl: string | null };
}
