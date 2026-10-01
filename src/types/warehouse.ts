/**
 * ── DEPO (26.09.2026) — die Antworten von /warehouse ────────────────────────
 * Spiegel von Erp_Backend `application/use-cases/warehouse/warehouseReadModel.ts`.
 */

/** Die Gruppe einer Karte samt Kürzeln (ELK · PLC). */
export interface WarehouseGroupRef {
    id: string;
    name: string;
    code: string | null;
    category: { id: string; name: string; code: string } | null;
}

export interface WarehouseProduct {
    id: string;
    /** Vom System vergeben (ELK-PLC-00001), sobald die Karte eine Gruppe hat. */
    erpCode: string | null;
    materialGroup: WarehouseGroupRef | null;
    name: string;
    brand: string | null;
    /** «Üretici kodu» (30.09.2026, früher «Model numarası») — nie gedruckt. */
    modelNumber: string | null;
    /** «Ürün kodu» (30.09.2026) — steht im PDF der Preisanfrage und der Bestellung. */
    productCode?: string | null;
    /** Einheit der Karte: PCS · M · KG · SET · PACK (ältere Karten: keine). */
    unit?: WarehouseUnit | null;
    /** Taslak — es fehlt, was `missing` nennt. */
    isDraft?: boolean;
    /** Was einer fertigen Karte fehlt: name · unit · supplier · supplierEmail (leer = fertig). */
    missing?: WarehouseMissingField[];
    /** Der erste Lieferant (Liste, Sortierung) — oder keiner. */
    supplier: { id: string | null; name: string } | null;
    /** Alle Lieferanten, jeder mit seinem Barcode des Produkts; `id` fehlt bei einem frei geschriebenen Namen. */
    suppliers: WarehouseSupplierEntry[];
    description: string | null;
    quantity: number;
    purchasePrice: number | null;
    /** Mindestbestellmenge — darunter wird nie bestellt (BOM). Leer = keine. */
    minimumOrderQuantity: number | null;
    currency: string | null;
    /** Unser GS1-Barcode (EAN-13, 04…) — mit dem ersten ERP-Code vergeben. */
    barcode: string | null;
    /** Der Herstellerbarcode, dessen Lieferant (noch) nicht gewählt ist — die der Lieferanten stehen in `suppliers`. */
    manufacturerBarcode: string | null;
    serialRequired: boolean;
    createdAt: string;
    updatedAt: string;
}

/** Ein Lieferant einer Karte mit SEINEM Barcode des Produkts (vierter Durchgang). */
export interface WarehouseSupplierEntry {
    id: string | null;
    name: string;
    barcode: string | null;
    /** Seine E-Mail für diese Karte — an sie geht die automatische Preisanfrage (30.09.2026). */
    email?: string | null;
    /** Seine Artikel- und Bestellnummer für das Produkt — stehen in SEINER Anfrage/Bestellung (01.10.2026). */
    articleNumber?: string | null;
    orderNumber?: string | null;
}

/** Die Einheiten einer Karte — dieselben wie die BOM-Zeile. */
export const WAREHOUSE_UNITS = ['PCS', 'M', 'KG', 'SET', 'PACK'] as const;
export type WarehouseUnit = typeof WAREHOUSE_UNITS[number];

/** Was eine fertige (nicht-Taslak) Karte braucht. */
export type WarehouseMissingField = 'name' | 'unit' | 'supplier' | 'supplierEmail';

export interface WarehouseSerial {
    id: string;
    productId: string;
    serialNumber: string;
    project: { id: string; number: string; name: string; isActive: boolean } | null;
    device: { id: string; name: string; positionNumber: string | null; isActive: boolean } | null;
    createdAt: string;
}

export interface WarehouseProductDetail {
    product: WarehouseProduct;
    serials: WarehouseSerial[];
}

export type WarehouseSortKey =
    | 'erpCode'
    | 'name'
    | 'brand'
    | 'modelNumber'
    | 'supplierName'
    | 'description'
    | 'quantity'
    | 'barcode'
    | 'updatedAt';

export interface WarehouseListQuery {
    search?: string;
    /** Kennungen; `none` = ohne Gruppe. */
    groups?: string[];
    barcode?: string;
    sort?: WarehouseSortKey;
    dir?: 'asc' | 'desc';
    page?: number;
    pageSize?: number;
}

export interface WarehouseProductPage {
    items: WarehouseProduct[];
    total: number;
    page: number;
    pageSize: number;
}

export interface WarehouseExport {
    items: WarehouseProduct[];
    total: number;
    truncated: boolean;
}

/* ── Hauptkategorien und Materialgruppen ───────────────────────────────── */

export interface WarehouseGroup {
    id: string;
    categoryId: string;
    name: string;
    code: string | null;
    /** «ELK-PLC-» — leer, solange die Gruppe kein Kürzel hat. */
    prefix: string | null;
    lastNumber: number;
    nextCode: string | null;
    productCount: number;
    uncodedCount: number;
    /** Kürzel und Kategorie stehen fest: es gibt schon Karten mit Code. */
    locked: boolean;
}

/**
 * BOM-Bereich eines Kod türü (01.10.2026, Samet: «bomda mekanik olan sadece
 * kendi MAK kodlarını görebilecek … mekanik, elektrik ve ikisi de»).
 */
export type WarehouseBomArea = 'MECHANICAL' | 'ELECTRICAL' | 'BOTH';
export const WAREHOUSE_BOM_AREAS: WarehouseBomArea[] = ['MECHANICAL', 'ELECTRICAL', 'BOTH'];

export interface WarehouseCategory {
    id: string;
    name: string;
    code: string;
    /** In welchen BOMs ihre Karten in der Suche erscheinen (älterer Server: fehlt = beide). */
    bomArea?: WarehouseBomArea;
    productCount: number;
    locked: boolean;
    groups: WarehouseGroup[];
}

export interface WarehouseCatalog {
    categories: WarehouseCategory[];
    ungroupedCount: number;
}

/* ── Etikett ───────────────────────────────────────────────────────────── */

export type WarehouseLabelLayout = 'roll' | 'a4';

export interface WarehouseLabelSettings {
    widthMm: number;
    heightMm: number;
    layout: WarehouseLabelLayout;
    showName: boolean;
}

export interface WarehouseSettings {
    label: WarehouseLabelSettings;
    barcodePrefix: string;
    barcodesIssued: number;
}

/* ── Auswahlen ─────────────────────────────────────────────────────────── */

export interface WarehouseSupplierOption {
    id: string | null;
    name: string;
    /** Die E-Mail aus der Lieferantenliste — die Karte übernimmt sie in die leere Zeile. */
    email?: string | null;
}

export type WarehouseMatchKind = 'serial' | 'barcode' | 'manufacturerBarcode' | 'supplierBarcode' | 'erpCode';

export interface WarehouseLookupMatch {
    matchedBy: WarehouseMatchKind;
    product: WarehouseProduct;
    serial: WarehouseSerial | null;
    /** Nur bei `supplierBarcode`: der Lieferant, dessen Barcode gelesen wurde. */
    supplier?: { id: string | null; name: string } | null;
}

export interface WarehouseLookup {
    code: string;
    matches: WarehouseLookupMatch[];
}

/** Was eine Karte beim Speichern schickt (PATCH: nur geänderte Felder). ERP-Code und Barcode vergibt der Server. */
export interface WarehouseProductInput {
    materialGroupId?: string | null;
    name?: string;
    brand?: string | null;
    modelNumber?: string | null;
    productCode?: string | null;
    unit?: WarehouseUnit | null;
    /** false = «Kaydet» (Pflichtangaben nötig), true = «Taslak olarak kaydet»; fehlt = der Server entscheidet. */
    isDraft?: boolean;
    /** Alle Lieferanten der Karte, in ihrer Reihenfolge, jeder mit seinem Barcode und seiner E-Mail. */
    suppliers?: Array<{
        supplierId: string | null;
        name: string;
        barcode: string | null;
        email?: string | null;
        articleNumber?: string | null;
        orderNumber?: string | null;
    }>;
    description?: string | null;
    quantity?: number;
    purchasePrice?: number | null;
    minimumOrderQuantity?: number | null;
    currency?: string | null;
    /** Ein Herstellerbarcode, dessen Lieferant noch nicht gewählt ist. */
    manufacturerBarcode?: string | null;
    serialRequired?: boolean;
    /** Nur beim Anlegen: Seriennummern, die mit der Karte entstehen. */
    serials?: WarehouseSerialInput[];
}

export interface WarehouseSerialInput {
    serialNumber: string;
    productionProjectId?: string | null;
    productionItemId?: string | null;
    /** «Ürün ekle»: das Stück ist Wareneingang (28.09.2026) — `code` = der Barcode, der die Karte nannte. */
    goodsIn?: boolean;
    code?: string | null;
}

/**
 * «Ürün ekle» = Wareneingang (28.09.2026): eine bestätigte BOM-Bestellung
 * (MAL KABULDE), der eine Buchung gutgeschrieben wurde — der früheste
 * Liefertermin des Projekts zuerst. Spiegel von Erp_Backend
 * `shared/warehouseGoodsIn.ts`.
 */
export interface WarehouseGoodsInCredit {
    /** Kennung der Buchung an dieser Bestellung — «Geri al» nennt sie. */
    receiptId: string;
    purchaseOrderId: string;
    referenceNumber: string;
    quantity: number;
    serials: string[];
    /** Die Positionen dieser Karte in der Bestellung: bestellt / jetzt da. */
    ordered: number;
    received: number;
    completed: boolean;
    projectNumber: string | null;
    projectName: string | null;
    deviceName: string | null;
}

export interface WarehouseGoodsIn {
    credits: WarehouseGoodsInCredit[];
    /** Stück, auf die keine Bestellung wartete — freier Bestand. */
    free: number;
    /** Wohin die eben gelesenen Seriennummern reserviert wurden. */
    reservations: Array<{ serialNumber: string; projectNumber: string | null; projectName: string | null; deviceName: string | null }>;
}

export interface WarehouseAvailability {
    available: boolean;
    companyType: string | null;
    productionEnabled: boolean;
}

/* ── Excel-Aktarım ─────────────────────────────────────────────────────── */

/** Eine Zeile, wie die Oberfläche sie aus der Datei liest. */
export interface WarehouseImportRowInput {
    row: number;
    group?: string | null;
    name?: string | null;
    brand?: string | null;
    modelNumber?: string | null;
    unit?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    /** Artikel- und Bestellnummer DES Lieferanten der Zeile (01.10.2026). */
    supplierArticleNumber?: string | null;
    supplierOrderNumber?: string | null;
    description?: string | null;
    quantity?: string | number | null;
    purchasePrice?: string | number | null;
    currency?: string | null;
    /** Gehört dem Lieferanten der Zeile (ohne Lieferant: der Karte). */
    manufacturerBarcode?: string | null;
    serialRequired?: string | boolean | null;
}

export interface WarehouseImportIssue {
    level: 'error' | 'warning';
    code: string;
    field?: string;
    params?: Record<string, string | number>;
}

export interface WarehouseImportRow {
    row: number;
    group: string | null;
    groupId: string | null;
    groupLabel: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    supplierName: string | null;
    description: string | null;
    quantity: number;
    purchasePrice: number | null;
    currency: string | null;
    manufacturerBarcode: string | null;
    serialRequired: boolean;
    issues: WarehouseImportIssue[];
}

export interface WarehouseImportPreview {
    rows: WarehouseImportRow[];
    valid: number;
    invalid: number;
    warnings: number;
}

export type WarehouseImportStatus = 'PENDING' | 'DONE' | 'REJECTED' | 'CANCELLED';

export interface WarehouseImportResult {
    created: number;
    skipped: number;
    failed: Array<{ row: number; code: string }>;
    firstCode: string | null;
    lastCode: string | null;
}

export interface WarehouseImportSummary {
    id: string;
    status: WarehouseImportStatus;
    fileName: string | null;
    rowCount: number;
    requestedBy: { id: string | null; name: string | null };
    decidedBy: { id: string | null; name: string | null } | null;
    decidedAt: string | null;
    note: string | null;
    result: WarehouseImportResult | null;
    createdAt: string;
}

export interface WarehouseImportDetail extends WarehouseImportSummary {
    rows: WarehouseImportRow[];
}

export interface WarehouseImportList {
    items: WarehouseImportSummary[];
    pendingCount: number;
}
