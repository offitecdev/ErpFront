import type { ProductionPurchaseAssignment, ProductionSelection } from './production';

export type LocationType = 'MAIN_WAREHOUSE' | 'SUB_WAREHOUSE' | 'STATION_BUFFER' | 'PROJECT_RESERVE';

export type MovementType = 'IN' | 'OUT' | 'TRANSFER' | 'RETURN' | 'ADJUSTMENT';

export type ProposalStatus = 'PENDING' | 'APPROVED' | 'CONVERTED' | 'REJECTED';

export type ArticleStatus = 'ACTIVE' | 'INACTIVE' | 'IN_SUPPLY' | 'IN_PRODUCTION';

/**
 * Ürün/hizmet sınıflandırması. Eski PRODUCT|MATERIAL ayrımı 2026-08-14'te
 * kaldırıldı: malzemeler ürün listesine taşındı, itemType artık ürün detayındaki
 * "Produkt / Dienstleistung" anahtarıdır (varsayılan PRODUCT).
 */
export type ItemType = 'PRODUCT' | 'SERVICE';

/**
 * ÜRÜN TÜRÜ (23.09.2026) — yeni ürün formundaki üçlü seçim: Üretilecek /
 * Satın Alınacak / Ek Hizmet. `itemType` bundan türer (SERVICE → SERVICE, diğer
 * ikisi → PRODUCT); sunucudaki `shared/articleKind.ts` ile aynı liste.
 */
export const ARTICLE_KINDS = ['MANUFACTURED', 'RESALE', 'SERVICE'] as const;
export type ArticleKind = typeof ARTICLE_KINDS[number];

export interface InventoryLocation {
    id: string;
    tenantId: string;
    locationName: string;
    locationType: LocationType;
    parentLocationId?: string | null;
    isActive: boolean;
}

export interface InventoryArticle {
    id: string;
    tenantId: string;
    articleCode: string;
    name: string;
    description?: string | null;
    baseCost: number;
    salePrice?: number;
    defaultSupplierId?: string | null;
    unit: string;
    systemBarcode?: string | null;
    supplierBarcode?: string | null;
    imageUrl?: string | null;
    category?: string | null;
    itemType?: ItemType;
    status: ArticleStatus;
    isActive: boolean;
    minStockLevel: number;
    criticalStockLevel: number;
    maxStockLevel?: number | null;
    lastPurchaseDate?: string | null;
    weightedAverageCost?: number;
    costBasisQuantity?: number;
    costBasisValue?: number;
    supplierCostQuantity?: number;
    supplierCostValue?: number;
    manualCostQuantity?: number;
    manualCostValue?: number;
    suppliers?: ArticleSupplierRow[];
}

export interface ArticleStockSummary extends InventoryArticle {
    totalQuantity: number;
    totalReserved: number;
    balances: {
        locationId: string;
        locationName?: string;
        locationType?: LocationType;
        currentQuantity: number;
        reservedQuantity: number;
    }[];
}

// Lean row for the products list and tender picker. Description is optional for
// consumers that can stage a row directly; images, suppliers and movements stay out.
/**
 * The subset of an article that a quote line actually consumes: name and
 * description become the line text, unit and price become its figures, and the
 * id links the line back to stock. Requested with `lean=true`, which also skips
 * the per-row stock-balance JOIN the full list needs for its "in stock" column.
 */
export interface ArticleQuickPick {
    id: string;
    /** Artikelnummer — skalar, kostet den schlanken Pfad keinen JOIN. */
    articleCode?: string | null;
    name: string;
    description?: string | null;
    unit: string;
    salePrice?: number;
    // Price fallback: articles priced only through their cost carry 0 salePrice.
    baseCost?: number;
}

export interface ArticleQuickPickPage {
    items: ArticleQuickPick[];
    total: number;
    page: number;
    pageSize: number;
}

export interface ArticleListItem {
    id: string;
    articleCode: string;
    name: string;
    description?: string | null;
    category?: string | null;
    itemType?: ItemType;
    systemBarcode?: string | null;
    supplierBarcode?: string | null;
    /** Modellnummer (freiwillig) — die Rolle des alten Produktcodes. */
    modelNumber?: string | null;
    /** Seriennummer (freiwillig, je Mandant eindeutig). */
    serialNumber?: string | null;
    unit: string;
    salePrice?: number;
    baseCost: number;
    status: ArticleStatus;
    minStockLevel: number;
    criticalStockLevel: number;
    totalQuantity: number;
    createdAt: string;
}

// Stok hareketi ekranı için tek ürünün yalın canlı stok bilgisi. Depo/lokasyon
// verisi taşımaz — yalnızca sayaç (totalQuantity) ve ortalama maliyet dökümü.
export interface ArticleStockInfo {
    id: string;
    totalQuantity: number;
    minStockLevel: number;
    criticalStockLevel: number;
    maxStockLevel?: number | null;
    weightedAverageCost: number;
    costBasisQuantity: number;
    costBasisValue: number;
    supplierCostQuantity: number;
    supplierCostValue: number;
    manualCostQuantity: number;
    manualCostValue: number;
}

/**
 * Ürün detay ekranının BAŞLIK tablosu — ekranda gerçekten görünen alanlar.
 * Tedarikçi listesi ve hareket geçmişi burada YOKTUR: ikisi de kendi
 * uçlarından, yalnızca kullanıcı ilgili düğmeye bastığında yüklenir.
 */
export interface ArticleDetail {
    id: string;
    /** ERP-Code `KAT-UNTER-NNNNN` (Altbestand kann davon abweichen). */
    articleCode: string;
    name: string;
    unit: string;
    /* Reihenfolge im Detail (10.09.2026): ERP-Code, Bezeichnung,
       Modellnummer, Seriennummer, Barcode. */
    modelNumber?: string | null;
    serialNumber?: string | null;
    /** Gescannter Lieferantenbarcode — bearbeitbar. */
    supplierBarcode?: string | null;
    /** Vom System erzeugter Barcode — nur per Knopf «Barcode erzeugen». */
    systemBarcode?: string | null;
    /** Biçimli metin (kalın/italik/madde) — sunucuda dar bir beyaz listeden geçer. */
    description?: string | null;
    salePrice: number;
    itemType: ItemType;
    /** Üçlü ürün türü; null = seçilmemiş (eski kayıtlar). */
    articleKind?: ArticleKind | null;
    /**
     * Ürünün tedarikçileri (23.09.2026) — detay formundaki çoklu seçim.
     * Tercih edilen önce; `locked` = alım geçmişi var, formdan çıkarılamaz.
     */
    suppliers?: ArticleSupplierLink[];
    /**
     * GÖRSELİN KALICI ADRESİ (assets.demo.offitec.ch) — takvimdeki randevu
     * belgeleriyle aynı yol. Dosya R2'de durur; bu alan doğrudan <img src>
     * içine girer, ikinci bir istek gerekmez ve tarayıcı önbelleğe alır.
     *
     * Henüz taşınmamış eski bir kayıtta `null` gelir; o zaman görsel aşağıdaki
     * `imageVersion` ile binary uçtan çekilir.
     */
    imageUrl?: string | null;
    /** Görsel binary URL'sinin cache-busting sürümü; base64 bu yanıta girmez. */
    imageVersion: string;
    totalQuantity: number;
    /** Σ(tedarikçi birim maliyeti × adet) / Σ(adet). */
    averageUnitCost?: number;
    supplierCount?: number;
    /** Henüz stoğa alınmamış sipariş satırlarının toplamı — sipariş yoksa 0. */
    openOrderQuantity?: number;
}

/** Detay başlığı açılırken paralel hesaplanan, kritik olmayan alanlar. */
export interface ArticleDetailStats {
    averageUnitCost: number;
    supplierCount: number;
    openOrderQuantity: number;
}

/**
 * Detay ekranındaki tek "Kaydet" işleminin gövdesi. Yalnızca DEĞİŞEN alanlar
 * gönderilir; `imageUrl` yoksa görsel korunur, `null` ise silinir.
 */
export interface ArticleDetailPatch {
    articleCode?: string;
    name?: string;
    unit?: string;
    modelNumber?: string | null;
    serialNumber?: string | null;
    supplierBarcode?: string | null;
    salePrice?: number;
    /** Ürün/hizmet anahtarı — detay ekranındaki "Typ" satırı. */
    itemType?: ItemType;
    /** Üçlü ürün türü; sunucu `itemType`'ı da ondan türetir. */
    articleKind?: ArticleKind | null;
    /** Tedarikçilerin TAM listesi; ilki tercih edilen (bkz. SingleArticleInput). */
    suppliers?: SupplierRefInput[];
    description?: string | null;
    imageUrl?: string | null;
}

/** Ürünün bağlı tedarikçisi — detay formundaki bir belirteç. */
export interface ArticleSupplierLink {
    supplierId: string;
    companyName: string;
    /** Alım geçmişi var: formdan çıkarılamaz. */
    locked: boolean;
}

/** Formdan giden tedarikçi: kayıtlı olan kimliğiyle, yeni yazılan adıyla. */
export type SupplierRefInput = { supplierId: string } | { supplierName: string };

/** Ürün görseli üst sınırı — sunucudaki denetimle aynı değer. */
export const ARTICLE_IMAGE_MAX_BYTES = 2 * 1024 * 1024;
export const ARTICLE_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

/** Tedarikçi popup'ındaki tek satır: o tedarikçiden alınan toplam ve ortalaması. */
export interface ArticleSupplierCostRow {
    supplierId: string;
    companyName: string;
    quantity: number;
    totalCost: number;
    averageUnitCost: number;
    lastPurchaseDate?: string | null;
}

export interface ArticleSuppliersSummary {
    suppliers: ArticleSupplierCostRow[];
    totalQuantity: number;
    totalCost: number;
    averageUnitCost: number;
}

export interface ArticleListPage {
    items: ArticleListItem[];
    total: number;
    page: number;
    pageSize: number;
}

export interface StockBalanceRow {
    id: string;
    tenantId: string;
    articleId: string;
    locationId: string;
    currentQuantity: number;
    reservedQuantity: number;
    updatedAt: string;
    article?: {
        id: string;
        articleCode: string;
        name: string;
        unit: string;
        baseCost: number;
        minStockLevel: number;
        criticalStockLevel: number;
        imageUrl?: string | null;
        systemBarcode?: string | null;
    };
    location?: {
        locationName: string;
        locationType: LocationType;
    };
}

export interface StockMovementRow {
    id: string;
    tenantId: string;
    articleId: string;
    movementType: MovementType;
    quantity: number;
    unitCost?: number | null;
    supplierId?: string | null;
    sourceLocationId?: string | null;
    destinationLocationId?: string | null;
    transactionDate: string;
    employeeId: string;
    referenceId?: string | null;
    description?: string | null;
    employee?: { firstName: string; lastName: string };
    supplier?: { companyName: string } | null;
}

// Stok hareketi seçiminde kullanılan ürün arama sonucu.
export interface SearchItem {
    kind: 'PRODUCT';
    id: string;
    code: string;
    name: string;
    barcode?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
    unit?: string;
    salePrice: number;
    baseCost?: number;
    imageUrl?: string | null;
    itemType?: ItemType;
    minStockLevel?: number;
    criticalStockLevel?: number;
    maxStockLevel?: number | null;
    stockQuantity?: number;
}

export interface PurchaseProposalRow {
    id: string;
    tenantId: string;
    articleId: string;
    proposedQuantity: number;
    supplierId?: string | null;
    status: ProposalStatus;
    createdAt: string;
    resolvedAt?: string | null;
    resolvedByEmpId?: string | null;
    article?: { articleCode: string; name: string; imageUrl?: string | null };
}

export interface SupplierRow {
    id: string;
    tenantId: string;
    companyName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    /**
     * Adres AYRI BILESENLER olarak tutulur; birlesik bir "adres" alani yoktur.
     * `address` = sokak + bina no. Gosterim (ekran/PDF) `utils/address.ts`
     * icindeki `formatAddressLines()` ile en fazla 2 satira indirgenir.
     */
    address?: string | null;
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
    notes?: string | null;
    /** KDV: null = belirtilmedi, false = KDV yok, true = ülke + oran siparişe aktarılır. */
    vatLiable?: boolean | null;
    vatCountry?: string | null;
    vatRate?: number | null;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    articleSuppliers?: ArticleSupplierRow[];
    articleCount?: number;
    purchaseCount?: number;
    totalPurchaseQuantity?: number;
    totalPurchaseAmount?: number;
    latestPurchaseDate?: string | null;
}

export interface ArticleSupplierRow {
    id: string;
    tenantId: string;
    articleId: string;
    supplierId: string;
    locationId?: string | null;
    supplierSku?: string | null;
    purchasePrice: number;
    quantity: number;
    remainingQuantity: number;
    currency: string;
    lastPurchaseDate?: string | null;
    stockMovementId?: string | null;
    notes?: string | null;
    isPreferred: boolean;
    createdAt: string;
    updatedAt: string;
    supplier?: SupplierRow;
    location?: Pick<InventoryLocation, 'id' | 'locationName' | 'locationType'>;
    article?: Pick<InventoryArticle, 'id' | 'articleCode' | 'name' | 'unit' | 'baseCost' | 'imageUrl'>;
}

// --- YENİ TABLO TABANLI ENVANTER MODÜLÜ ---

// "Tanım" (DEFINITION) hareketi: quantity=0 olan IN kaydı — ürün ilk tanımlanırken
// tedarikçiyi hareket geçmişine yazar. Backend movementKind alanında türetir.
export type MovementKind = MovementType | 'DEFINITION';

/**
 * Herkunft einer Lagerbewegung (10.09.2026): Schnellerfassung (Zugang /
 * Löschen per Scan), Wareneingang einer Bestellung, Rapport/Projekt, manuell.
 * Altbestand ohne Herkunft kommt als MANUAL.
 */
export type MovementOrigin = 'QUICK_ADD' | 'QUICK_DELETE' | 'ORDER_RECEIPT' | 'REPORT' | 'MANUAL';

export interface MovementListItem {
    id: string;
    transactionDate: string;
    movementType: MovementType;
    movementKind: MovementKind;
    quantity: number;
    unitCost?: number | null;
    totalCost: number;
    description?: string | null;
    origin: MovementOrigin;
    /** Beim Scan gelesener Barcode / Seriennummer des bewegten Geräts. */
    scannedBarcode?: string | null;
    serialNumber?: string | null;
    article?: {
        articleCode: string;
        name: string;
        modelNumber?: string | null;
        serialNumber?: string | null;
        supplierBarcode?: string | null;
        systemBarcode?: string | null;
    } | null;
    supplier?: { companyName: string } | null;
    employee?: { firstName: string; lastName: string } | null;
    /** Das betroffene Lager (Ziel beim Zugang, Quelle beim Abgang). */
    location?: string | null;
}

export interface MovementListPage {
    items: MovementListItem[];
    total: number;
    page: number;
    pageSize: number;
}

export interface MovementListQuery {
    page?: number;
    pageSize?: number;
    /** Tek ürüne daraltır (ürün detayındaki hareketler görünümü). */
    articleId?: string;
    search?: string;
    code?: string;
    name?: string;
    description?: string;
    type?: MovementKind | '';
    origin?: MovementOrigin | '';
    dateFrom?: string;
    dateTo?: string;
}

// Tedarikçi seçici için yalın satır (GET /inventory/suppliers/search).
export interface SupplierSearchItem {
    id: string;
    companyName: string;
    contactName?: string | null;
    email?: string | null;
    phone?: string | null;
    purchaseCount: number;
}

export interface BulkArticleItemInput {
    articleCode: string;
    name: string;
    salePrice?: number;
    quantity?: number;
    purchasePrice?: number;
    supplierId?: string | null;
    supplierName?: string | null;
    unit?: string | null;
    /** Ürün kartının açıklaması (biçimli metin) — hareket notu DEĞİLDİR. */
    description?: string | null;
    /** Ürün görseli (data URL, en fazla 2 MB) — kartın tek görseli olur. */
    imageUrl?: string | null;
    modelNumber?: string | null;
    serialNumber?: string | null;
    supplierBarcode?: string | null;
}

/**
 * Schnellerfassung (10.09.2026): OHNE Code — den zieht der Server aus dem
 * gewählten, freigegebenen Nummernkreis (`KAT-UNTER-NNNNN`). Ein Scan = ein
 * Stück, darum ist die Menge freiwillig (Standard 1).
 */
export interface QuickArticleItemInput {
    name: string;
    quantity?: number;
    modelNumber?: string | null;
    serialNumber?: string | null;
    /** Gescannter Lieferantenbarcode. */
    barcode?: string | null;
    unit?: string | null;
    purchasePrice?: number;
    salePrice?: number;
    supplierId?: string | null;
    supplierName?: string | null;
    description?: string | null;
    imageUrl?: string | null;
}

/** Treffer der Schnellerfassung auf einen gescannten Code. */
export interface ScanLookupResult {
    found: boolean;
    ambiguous?: boolean;
    stockUnit?: { id: string; barcode: string; serialNumber: string | null } | null;
    matchedBy?: 'serial' | 'barcode' | 'code';
    article?: {
        id: string;
        articleCode: string;
        name: string;
        unit: string;
        modelNumber?: string | null;
        serialNumber?: string | null;
        supplierBarcode?: string | null;
        systemBarcode?: string | null;
        totalQuantity: number;
    };
}

export interface QuickStockUnitInput {
    barcode: string;
    serialNumber?: string | null;
    articleId?: string;
    /** Explicit user action only; an unknown scan must never supply this automatically. */
    newArticle?: { schemeId: string; name: string; modelNumber?: string | null };
}

export interface QuickStockUnitResult {
    article: NonNullable<ScanLookupResult['article']>;
    stockUnit: NonNullable<ScanLookupResult['stockUnit']>;
    createdArticle: boolean;
}

export interface BulkRowError {
    index: number;
    articleCode: string;
    error: string;
    /** `CODE_TAKEN` | `SERIAL_TAKEN` | `DUPLICATE_IN_FILE` | `VALUE_TOO_LONG` | `WRITE_FAILED` */
    code?: string;
}

export interface BulkArticlesResult {
    /** Geschriebene Zeilen INSGESAMT — die aktualisierten sind mitgezählt. */
    createdCount: number;
    /** Davon auf eine bereits vorhandene Artikelnummer getroffen (`overwrite`). */
    updatedCount?: number;
    created: Array<{ id: string; articleCode: string; name: string }>;
    errors: BulkRowError[];
}

/**
 * YENİ ÜRÜN FORMU (23.09.2026) — `/articles/single`. ERP kodu yoktur: sunucu
 * geçici AA-BB kodunu verir. Tedarikçilerin ilki tercih edilen tedarikçidir;
 * kayıtlı olan kimliğiyle, yeni yazılan adıyla gider.
 */
export interface SingleArticleInput {
    name: string;
    articleKind?: ArticleKind | null;
    suppliers: SupplierRefInput[];
    modelNumber?: string | null;
    serialNumber?: string | null;
    barcode?: string | null;
    unit?: string | null;
    salePrice?: number;
    purchasePrice?: number;
    /** Başlangıç stoğu — varsayılan 0 (ürün yalnızca tanımlanır). */
    quantity?: number;
    description?: string | null;
    imageUrl?: string | null;
}

export interface SingleArticleResult extends BulkArticlesResult {
    /** Kaydedilen ürün, detay ucuyla aynı gövdede (birim, fiyat, açıklama). */
    article?: ArticleDetail | null;
}

export interface BulkMovementItemInput {
    articleId?: string | null;
    articleCode?: string | null;
    movementType: 'IN' | 'OUT';
    quantity: number;
    unitCost?: number | null;
    supplierId?: string | null;
    supplierName?: string | null;
    description?: string | null;
    referenceId?: string | null;
    /** Herkunft (Schnellerfassung setzt QUICK_ADD / QUICK_DELETE); sonst MANUAL. */
    origin?: MovementOrigin;
    scannedBarcode?: string | null;
    serialNumber?: string | null;
}

export interface BulkMovementsResult {
    processedCount: number;
    movements: Array<{ id: string; articleId: string; articleCode: string; movementType: 'IN' | 'OUT'; quantity: number }>;
    errors: BulkRowError[];
}

// --- TEDARİK TALEPLERİ (Supply Requests) ---

// Minimum/kritik seviyeye düşmüş tek bir ürün (yalın liste satırı).
export interface LowStockItem {
    kind: 'PRODUCT';
    id: string;
    code: string;
    name: string;
    unit: string;
    totalQuantity: number;
    minStockLevel: number;
    criticalStockLevel: number;
    isCritical: boolean;
    isBelowMin: boolean;
}

export interface LowStockResponse {
    minimum: LowStockItem[];
    critical: LowStockItem[];
}

// Bir kalemin daha önce alım yaptığı tedarikçi + son alım özeti.
export interface ItemSupplier {
    supplierId: string;
    companyName: string;
    email?: string | null;
    phone?: string | null;
    lastPurchaseDate?: string | null;
    lastPurchasePrice?: number | null;
    lastPurchaseQuantity?: number | null;
    currency?: string | null;
    purchaseCount: number;
}

export interface ItemSuppliersResponse {
    item: { kind: 'PRODUCT'; id: string; code: string; name: string; unit: string };
    suppliers: ItemSupplier[];
}

export type SupplyRequestStatus = 'PENDING' | 'RECEIVED' | 'CANCELLED';

export interface SupplyRequestRow {
    id: string;
    tenantId: string;
    itemType: ItemType;
    articleId?: string | null;
    itemName: string;
    itemCode?: string | null;
    unit?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    requestedQuantity: number;
    emailSubject?: string | null;
    emailBody?: string | null;
    emailSent: boolean;
    status: SupplyRequestStatus;
    createdByEmpId?: string | null;
    createdAt: string;
    receivedAt?: string | null;
    receivedByEmpId?: string | null;
}

export interface CreateSupplyRequestInput {
    itemType?: ItemType;
    articleId?: string | null;
    itemName: string;
    itemCode?: string | null;
    unit?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    supplierEmail?: string | null;
    requestedQuantity: number;
    emailSubject?: string;
    emailBody?: string;
    sendEmail?: boolean;
}

// --- SATIN ALMA SİPARİŞLERİ (Purchase Orders) ---
// Tek sipariş = tek tedarikçi; satırlar backend'de JSON snapshot olarak durur.

/**
 * Sipariş yaşam döngüsü (2026-08-01 genişletildi, 2026-08-03 ORDERED eklendi):
 * DRAFT (talep taslağı) → PRICE_REQUEST (gönderilmiş fiyat talebi) →
 * PENDING (sipariş onaylandı, mail HENÜZ gitmedi) → ORDERED (sipariş maili
 * gönderildi = sipariş verildi) → TO_BE_STOCKED (mal kabul) → COMPLETED
 * (stoğa aktarıldı).
 * UPDATED durumu KALDIRILDI: mail sonrası içerik değişikliği yalnızca `revision`ı
 * artırır (arayüzde "Güncellendi · Rev. n" etiketi).
 * AWAITING_CONFIRMATION ("onay bekleniyor") da KALDIRILDI (kullanıcı isteği
 * 2026-08-03): gönderilmiş talep artık PRICE_REQUEST'te durur.
 */
export type PurchaseOrderStatus =
    /** TALEP TASLAĞI: fiyatsız, kaydedilmiş ama henüz gönderilmemiş talep. */
    | 'DRAFT'
    /** SİPARİŞ TASLAĞI: fiyatlı, kaydedilmiş ama onaylanmamış — "Kaydet" bunu yazar. */
    | 'ORDER_DRAFT'
    /** GÖNDERİLMİŞ fiyat talebi (talep maili taslağı buraya ilerletir). */
    | 'PRICE_REQUEST'
    /** SİPARİŞ ONAYLANDI: resmîleşti ve kilitlendi, tedarikçiye mail henüz gitmedi. */
    | 'PENDING'
    /** SİPARİŞ VERİLDİ: sipariş maili tedarikçiye gerçekten gönderildi. */
    | 'ORDERED'
    | 'TO_BE_STOCKED'
    | 'COMPLETED';

/** Satır hesap kipi: AUTO hesaplar, DIRECT gönderileni saklar (eski directCopy),
 *  SUPPLIER tedarikçi hesabındaki SABİT net birim fiyatla çarpar (indirim kilitli). */
export type OrderCalcMode = 'AUTO' | 'DIRECT' | 'SUPPLIER';

/** Sipariş KDV kipi: LINE = satır başına oran, TOTAL = tek oran genel toplamda. */
export type OrderVatMode = 'LINE' | 'TOTAL';

export interface PurchaseOrderItem {
    itemType: ItemType;
    articleId?: string | null;
    code?: string | null;
    serialNumber?: string | null;
    name: string;
    quantity: number;
    unit?: string | null;
    grossPrice: number;
    netPrice: number;
    /** SIRAYLA uygulanan indirim yuzdeleri (teklifteki direct/extra deseni). */
    discount: number;
    discount2: number;
    discount3: number;
    /** Satir KDV orani (%) — ulkeye gore secilir. */
    vatRate: number;
    /** Indirimler uygulandiktan sonraki NET satir tutari. */
    lineTotal: number;
    /** `lineTotal` uzerinden hesaplanan KDV tutari. */
    lineVat: number;
    /**
     * DOGRUDAN KOPYALA ile kaydedildi mi: net fiyat ve satir tutari HESAPLANMADI,
     * ekranda/Excel'de ne yaziyorsa oyle saklandi. Eski kayitlarda YOKTUR.
     * Yeni kayitlarda `calcMode: 'DIRECT'` ile birlikte yazilir (geriye uyum).
     */
    directCopy?: boolean;
    /** Satirin hesap kipi — eski kayitlarda yoktur (directCopy'den turetilir). */
    calcMode?: OrderCalcMode;
    /**
     * DIE EIGENEN SPALTEN der Vorlage — rechts neben dem Produktnamen, hoechstens
     * drei. Als LISTE MIT NAMEN, nicht als Objekt: die Reihenfolge der Liste IST
     * die Reihenfolge der Spalten, und die Ueberschrift reist mit, damit eine in
     * einem Jahr geoeffnete Bestellung ihre Spalten noch benennen kann.
     */
    extras?: Array<{ key: string; name: string; value: string; width?: number }>;
    /**
     * GOSTERILEN net birim fiyat (tedarikci listesindeki / Excel'deki deger).
     * `netPrice` hesabin tam duyarlikli tabanidir; Excel'in kendi yuvarlamasi
     * yuzunden ikisi ayrilabilir (18.98 gorunur, 18.9766… ile carpilir).
     */
    displayNetPrice?: number | null;
    /** Mal kabulde stoga aktarilan miktar (receive endpoint'i yazar). */
    receivedQuantity?: number;
    /** Son mal kabul zamani (ISO). */
    receivedAt?: string | null;
    /** Produktion (19.09.2026): das Gerät des Projekts, für das die Zeile bestellt wird. */
    productionItemId?: string | null;
    /** Proje kaynağı (24.09.2026) — projenin pozisyonundan «Siparişe Git». */
    source?: PurchaseLineSource | null;
}

/**
 * SATIRIN PROJE KAYNAĞI (24.09.2026): proje + pozisyon; üretim şirketine
 * giden satırda üretim şirketinin kimliği de.
 */
export interface PurchaseLineSource {
    projectId: string;
    positionId: string | null;
    producerTenantId: string | null;
    /** «Siparişlerim»de Türsüzler'den ELLE açılan siparişin satırı (U1, U2 …). */
    manual?: boolean;
}

/**
 * EK ÜCRET — sipariş düzeyinde ad + tutar (nakliye, ambalaj, montaj…).
 * Kalem değildir: miktarı, indirimi ve KDV oranı yoktur; tutar NET kabul edilir
 * ve genel toplama eklenir.
 */
export interface PurchaseOrderFee {
    name: string;
    amount: number;
}

/** Eine Spalte der Vorlage, wie die Bestellung sie sich merkt. */
export interface PurchaseOrderTableColumn {
    key: string;
    /** Der Name aus der Vorlage — im PDF der Spaltentitel. */
    name: string;
    /** Die Rolle in der Bestellzeile; null = freie Spalte (eigene Angabe). */
    label: TemplateLabel | null;
    type: 'text' | 'number';
}

export interface PurchaseOrderRow {
    id: string;
    tenantId: string;
    /**
     * GÜNCEL belgenin kodu — talep aşamasında `priceRequestNumber`, sipariş
     * aşamasından itibaren `orderNumber` ile aynıdır. Kayıtta ALMANCA yazım
     * durur (`PA-2026-001` / `BE-2026-001`); ekranda ve PDF'te dile göre önek
     * değişir — göstermeden önce `utils/purchaseCode.ts` üzerinden geçir.
     * Kullanıcı elle değiştirebilir.
     */
    referenceNumber: string;
    /**
     * Hangi aşamaların KENDİ belgesi var (1 talep · 2 sipariş · 3 mal kabul).
     * Birleştirme ayrı belgeleri yan yana koyar; Şerit bunu gösterir.
     */
    documentStages?: number[];
    /** Fiyat talebi kodu (`PA-2026-001`) — siparişe dönüşse de kalır, aranabilir. */
    priceRequestNumber?: string | null;
    /** Sipariş kodu (`BE-2026-001`) — ilk kez sipariş aşamasına geçince verilir. */
    orderNumber?: string | null;
    /** Opsiyonel teklif numarası (PDF'te görünür). */
    quoteNumber?: string | null;
    /** "Besteller" — siparişi veren kişi. */
    orderedByName?: string | null;
    /** Tedarik edilen projenin adı (PDF kapak kartında). */
    projectName?: string | null;
    /**
     * ALICI ADI ("Empfänger" / z.Hd.) — OPSİYONEL. Doluysa PDF'in alıcı
     * bloğunda firma adının ALTINDA tek küçük satır olarak basılır.
     */
    recipientName?: string | null;
    /**
     * ANSCHREIBEN (ön yazı) — PDF'in ilk sayfasında pozisyon tablosundan ÖNCE
     * basılan hitap + giriş metni (düz metin, satır sonları korunur).
     * BOŞ/NULL = PDF şablonunun kendi standart metni basılır.
     */
    coverLetter?: string | null;
    /**
     * Die Spalten, die die Vorlage beim Erfassen AUSGEBLENDET hatte (Auge in
     * «Meine Vorlagen») — Vorlagenschlüssel wie `priceGross`, `discount`, `x2`.
     * Das PDF wird später ohne die Vorlage neu gebaut und richtet sich danach;
     * die Werte selbst bleiben an den Positionen stehen.
     */
    hiddenColumnKeys?: string[] | null;
    /**
     * DIE SPALTEN DER VORLAGE, mit der die Bestellung erfasst wurde — in ihrer
     * Reihenfolge, mit Zuordnung und Namen (Vorgabe Samet, 11.09.2026: «tabloda
     * böyleyse PDF'e de böyle aktarılmalı»). Das PDF schreibt diese Namen als
     * Spaltentitel («GESAMTMENGE» statt «Menge») und stellt die Spalten so auf.
     * Fehlt der Schnappschuss (alte Bestellung), nimmt das PDF seine eigenen Titel.
     */
    tableColumns?: PurchaseOrderTableColumn[] | null;
    status: PurchaseOrderStatus;
    supplierId?: string | null;
    supplierName: string;
    supplierEmail?: string | null;
    supplierAddress?: string | null;
    items: PurchaseOrderItem[];
    /** Sipariş düzeyindeki ek ücretler (eski kayıtlarda boş dizi). */
    additionalFees: PurchaseOrderFee[];
    itemCount: number;
    currency: string;
    /**
     * KDV kipi. TOTAL (07.09.2026 sonrası): oran HER SATIRA ayrı ayrı
     * uygulanır ve satır KDV'leri TOPLANIR; ek ücretler matraha GİRMEZ,
     * genel toplama ayrıca eklenir. LINE: kayıtlı satır KDV'lerinin toplamı.
     * ⚠ Tek kaynak: `orderPricing.ts` → `computeOrderTotals` ve sunucudaki
     * `purchaseOrderTotalVat` — üçü birlikte güncellenir.
     */
    vatMode: OrderVatMode;
    /** TOTAL kipindeki oran (%). */
    orderVatRate: number;
    /** TOTAL kipinde seçilen ülke etiketi (yalnızca gösterim). */
    orderVatCountry?: string | null;
    totalNet: number;
    totalGross: number;
    /** Satır KDV tutarlarının toplamı. */
    totalVat: number;
    /** Ek ücretlerin toplamı — genel toplam = totalNet + totalFees + totalVat. */
    totalFees: number;
    revision: number;
    emailSentAt?: string | null;
    emailRecipient?: string | null;
    /** Das Häkchen «Mail manuell gesendet» hat die Mail als gesendet markiert. */
    emailSentManually?: boolean;
    stockedAt?: string | null;
    createdByEmpId?: string | null;
    createdAt: string;
    updatedAt: string;
    /** Produktion (19.09.2026): Projekt + Geräte — nur wo das Modul läuft. */
    production?: ProductionPurchaseAssignment | null;
}

export interface PurchaseOrderListPage {
    items: PurchaseOrderRow[];
    total: number;
    page: number;
    pageSize: number;
}

export interface PurchaseOrderListQuery {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: PurchaseOrderStatus | '';
    /* HANGİ MODÜL (22.09.2026): fiyat talepleri ve siparişler AYRI listelerdir.
       Belirli bir durum süzgeci varsa o daha dardır ve bunun yerine geçer. */
    kind?: 'PRICE_REQUEST' | 'ORDER';
    supplierId?: string;
    // Kolon filtreleri (tablo filtre satırı).
    reference?: string;
    quote?: string;
    project?: string;
    supplier?: string;
    dateFrom?: string;
    dateTo?: string;
}

export interface PurchaseOrderItemInput {
    itemType?: ItemType;
    articleId?: string | null;
    code?: string | null;
    serialNumber?: string | null;
    name: string;
    quantity?: number;
    unit?: string | null;
    grossPrice?: number;
    netPrice?: number;
    discount?: number;
    discount2?: number;
    discount3?: number;
    vatRate?: number;
    /**
     * DOGRUDAN KOPYALA: sunucu net fiyati ve satir tutarini YENIDEN HESAPLAMAZ,
     * gonderilenleri saklar (bayrak yoksa indirimlerden turetir — eski davranis).
     */
    directCopy?: boolean;
    /** Hesap kipi — verilmezse sunucu directCopy bayragindan turetir. */
    calcMode?: OrderCalcMode;
    /** Yalnizca GOSTERIM icin saklanan net fiyat (tutari etkilemez). */
    displayNetPrice?: number | null;
    /** Yalnizca `directCopy`/DIRECT ile birlikte anlamlidir: satirin NET tutari. */
    lineTotal?: number;
    /** Mal kabul durumu — duzenlemede aynen geri gonderilir ki kaybolmasin. */
    receivedQuantity?: number;
    receivedAt?: string | null;
    /** Ordered template columns, including their relative width for PDF parity. */
    extras?: Array<{ key: string; name: string; value: string; width?: number }>;
    /** Produktion (19.09.2026): das Gerät der Zeile (Pflicht, wenn mehrere gewählt sind). */
    productionItemId?: string | null;
}

/**
 * Ein Vorgang, mit dem sich DIESER zusammenführen lässt — der Server gibt nur
 * die Nachbarstufe heraus (Anfrage ↔ Bestellung, Bestellung ↔ Wareneingang).
 */
export interface PurchaseOrderMergeCandidate {
    id: string;
    referenceNumber: string;
    priceRequestNumber?: string | null;
    orderNumber?: string | null;
    status: PurchaseOrderStatus;
    stage: 1 | 2 | 3;
    supplierName: string;
    projectName?: string | null;
    currency: string;
    totalNet: number;
    itemCount: number;
    createdAt: string;
}

export interface CreatePurchaseOrderInput {
    /**
     * Boş bırakılırsa sunucu aşamaya göre üretir: fiyat talebi `PA-{yıl}-{sıra}`,
     * sipariş `BE-{yıl}-{sıra}`. Başka bir dilde yazılan kod (FT-/SP-/PR-/PO-)
     * sunucuda depo yazımına çevrilir.
     */
    referenceNumber?: string | null;
    quoteNumber?: string | null;
    orderedByName?: string | null;
    projectName?: string | null;
    /** Alıcı adı (Empfänger) — opsiyonel, PDF alıcı bloğunda görünür. */
    recipientName?: string | null;
    /** Ön yazı (Anschreiben) — boş/null gönderilirse PDF standart metnini basar. */
    coverLetter?: string | null;
    /** Was die Vorlage ausgeblendet hatte — fährt mit, damit das PDF es weiss. */
    hiddenColumnKeys?: string[] | null;
    /** Die Spalten der Vorlage (Name + Reihenfolge) — das PDF trägt genau diese Titel. */
    tableColumns?: PurchaseOrderTableColumn[] | null;
    /** Giriş yolları: DRAFT (fiyat talebi taslağı), ORDER_DRAFT (sipariş taslağı),
     *  PRICE_REQUEST, PENDING (doğrudan onaylanmış sipariş). */
    status?: Extract<PurchaseOrderStatus, 'DRAFT' | 'ORDER_DRAFT' | 'PRICE_REQUEST' | 'PENDING'>;
    supplierId?: string | null;
    supplierName?: string;
    supplierEmail?: string | null;
    currency?: string;
    vatMode?: OrderVatMode;
    orderVatRate?: number;
    orderVatCountry?: string | null;
    items: PurchaseOrderItemInput[];
    /** Ad + tutar; adı ve tutarı boş olan satırlar sunucuda atılır. */
    additionalFees?: PurchaseOrderFee[];
    /** Produktion (19.09.2026): Projekt + Geräte — Pflicht, wo das Modul läuft. */
    production?: ProductionSelection | null;
}

export interface UpdatePurchaseOrderInput {
    referenceNumber?: string;
    quoteNumber?: string | null;
    orderedByName?: string | null;
    projectName?: string | null;
    recipientName?: string | null;
    coverLetter?: string | null;
    /** Was die Vorlage ausgeblendet hatte — fährt mit, damit das PDF es weiss. */
    hiddenColumnKeys?: string[] | null;
    /** Die Spalten der Vorlage (Name + Reihenfolge) — das PDF trägt genau diese Titel. */
    tableColumns?: PurchaseOrderTableColumn[] | null;
    supplierId?: string | null;
    supplierName?: string;
    supplierEmail?: string | null;
    currency?: string;
    vatMode?: OrderVatMode;
    orderVatRate?: number;
    orderVatCountry?: string | null;
    items?: PurchaseOrderItemInput[];
    additionalFees?: PurchaseOrderFee[];
    /** Produktion (19.09.2026): eine neue Auswahl; ohne sie gilt die gespeicherte. */
    production?: ProductionSelection | null;
}

// ── Ön yazı (Anschreiben) taslakları ─────────────────────────────────────────
// Tenant genelinde paylaşılan metin şablonları: sipariş detayındaki "Taslaklar"
// penceresinden kaydedilir ve başka siparişlerde tek tıkla uygulanır. Sipariş
// kaydına DEĞİL tenant'a bağlıdır — teklif tarafındaki `TenderTextTemplate`
// emsali. Standart metin bu listede DEĞİLDİR: o PDF şablonunda yaşar.

export interface PurchaseOrderTextTemplate {
    id: string;
    title: string;
    content: string | null;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
}

/** Ein Mail-Entwurf aus dem Mailfenster der Auftragsseite (je Auftrag). */
export interface PurchaseOrderMailDraft {
    id: string;
    orderId: string;
    toEmail: string | null;
    ccEmails: string[];
    subject: string;
    message: string | null;
    createdBy?: string | null;
    createdAt: string;
    updatedAt: string;
}

export interface PurchaseOrderMailDraftInput {
    toEmail: string | null;
    ccEmails: string[];
    subject: string;
    message: string;
}

export interface PurchaseOrderTextTemplatePage {
    items: PurchaseOrderTextTemplate[];
    total: number;
    page: number;
    pageSize: number;
}

// ── Mal kabul (goods receipt) ────────────────────────────────────────────────

export interface ReceivePurchaseOrderLine {
    /** Sipariş satırının indeksi (items dizisinde). */
    index: number;
    /** Verilmezse satırın KALAN miktarı aktarılır. */
    quantity?: number;
    /** Verilmezse siparişteki net birim fiyat maliyet olarak kullanılır. */
    unitCost?: number;
}

export interface ReceivePurchaseOrderInput {
    lines?: ReceivePurchaseOrderLine[];
    /** "Mal kabulü tamamla": kalan TÜM satırlar aktarılır, sipariş COMPLETED olur. */
    complete?: boolean;
    /** Nummernkreis für Zeilen ohne Produktcode — der Artikel entsteht erst im Wareneingang. */
    codeSchemeId?: string;
}

export interface ReceivePurchaseOrderResult {
    processedCount: number;
    received: Array<{ index: number; quantity: number }>;
    errors: Array<{ index: number; error: string }>;
    order: PurchaseOrderRow;
}

export interface SendPurchaseOrderMailInput {
    to?: string;
    /**
     * KOPYA (CC) adresleri. `to` yalnızca siparişin TEDARİKÇİSİNE ait bir adres
     * olabilir (açık relay engeli); CC serbesttir — sunucu biçimi doğrular,
     * alıcının kendisini eler, tekrarları atar ve 10 adresle sınırlar.
     */
    ccEmails?: string[];
    subject: string;
    message?: string;
    attachments?: Array<{ filename: string; contentType: string; contentBase64: string }>;
}

export interface SendPurchaseOrderMailResult {
    message: string;
    accepted: string[];
    preview: boolean;
    order: PurchaseOrderRow;
}

// ── BELEG-IMPORT DER LIEFERANTENBESTELLUNG (07.09.2026) ─────────────────────
// Ein PDF, ein Foto oder eine Tabelle wird auf dem SERVER in Text gewandelt und
// dort einem Sprachmodell vorgelegt; zurueck kommen Positionen genau in den
// Spalten der Vorlage. Die Typen hier sind die Gegenstuecke zu
// `Erp_Backend/src/presentation/routes/purchaseOrderImport.routes.ts`.

/** Steht die Erkennung bereit? Die Oberflaeche fragt das VOR dem Hochladen. */
export interface AiImportStatus {
    configured: boolean;
    model: string;
    maxChars: number;
    chunkChars: number;
    maxChunks: number;
    /** Wie viele Spalten hoechstens an das Modell gehen. */
    maxColumns: number;
    minColumns: number;
    /** Die Zuordnungen, die der Server kennt. */
    labels?: string[];
}

/**
 * Eine erkannte Position. Die Schluessel sind die Spaltenschluessel der
 * Vorlage (`c1` …) — welche dabei sind, entscheidet die Anfrage, darum ein
 * offener Datensatz.
 *
 * `sourceLine` ist KEINE Spalte, sondern der ZEILENANKER: die gedruckte Zeile
 * des Belegs, aus der diese Position stammt. Das Modell schreibt sie ab, bevor
 * es sie zerlegt — daher weiss man zu jedem Wert, aus welcher Zeile er kommt
 * (Vorgabe Samet 08.09.2026: die Zuordnung geschieht Zeile fuer Zeile).
 */
export type AiExtractedRow = Record<string, string | number | null | undefined>;

/** Kopfdaten des Belegs (Lieferant, Nummer, Waehrung, Steuersatz). */
export interface AiDocumentHeader {
    supplierName: string | null;
    documentNumber: string | null;
    documentDate: string | null;
    currency: string | null;
    vatRate: number | null;
    totalNet: number | null;
}

/** Was der Vorgang wirklich gekostet hat — steht am Ende auf dem Bildschirm. */
export interface AiUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    /** Geschaetzt in US-Dollar; `null`, wenn das Modell unbekannt ist. */
    estimatedUsd: number | null;
    /** Wie viele Durchgaenge der Beleg gebraucht hat. */
    chunks: number;
}

export interface AiExtractResponse {
    source: 'pdf' | 'image' | 'text';
    engine: 'pdf-text' | 'ocr-space' | 'gpt-vision' | 'client-text';
    model: string;
    language: string;
    /** Die Spaltenschluessel, die wirklich gelesen wurden. */
    columns: string[];
    document: AiDocumentHeader;
    rows: AiExtractedRow[];
    /**
     * DIE ABRECHNUNG DER ZEILEN (08.09.2026). Niemand sagt eine Zahl an und
     * niemand schaetzt: die Abschrift hat so viele Zeilen, wie sie hat, und
     * dagegen steht, was die Zuordnung daraus gemacht hat.
     */
    rowCount: {
        /** Was wirklich zurueckkommt. */
        returned: number;
        /** Zeilen der abgeschriebenen Tabelle — null ohne Abschrift (Excel/PDF). */
        table: number | null;
        /** Was auf dem Weg wegfiel (leere Zeile, Ueberlappung). */
        dropped: number;
    };
    /**
     * DIE ORDENTLICHE UMWANDLUNG (Vorgabe Samet, 08.09.2026): Bei einer
     * Aufnahme wird die Tabelle ZUERST abgeschrieben und erst danach
     * zugeordnet. Was abgeschrieben wurde, steht hier — es laesst sich mit
     * dem Blatt vergleichen. Bei Excel und PDF ist es null: die kommen schon
     * als Text.
     */
    transcript: {
        header: string | null;
        lines: string[];
        /**
         * Nur beim Bild (seit 11.09.2026, zweite Runde): das RASTER je
         * Aufnahme — alle gedruckten Spalten, null = leere Zelle — und
         * welche davon welcher Vorlagenspalte zugeordnet wurde
         * (Vorlagenschluessel → Index in `headers`, null = nicht gefunden).
         */
        pages?: Array<{
            index: number;
            headers: string[];
            rows: Array<Array<string | null>>;
            mapping: Record<string, number | null>;
        }>;
    } | null;
    /** Vorlagenspalten (Schluessel), die auf keiner Aufnahme gefunden wurden — nur beim Bild. */
    missingColumns?: string[];
    usage: AiUsage;
    text: {
        rawChars: number;
        chars: number;
        approxTokens: number;
        truncated: boolean;
        chunks: number;
        chunksRead: number;
    };
}

export interface AiExtractInput {
    /** `data:…;base64,…` oder reiner Base64-Inhalt. */
    data?: string;
    /** Fertiger Text — der Weg fuer xlsx/csv, die der Browser selbst liest. */
    text?: string;
    fileName?: string;
    mimeType?: string;
    /** Multiple camera/upload images. Each image is transcribed on its own page. */
    images?: Array<{
        data: string;
        fileName?: string;
        mimeType?: string;
    }>;
    /** Lets goods receipt omit supplier/product identity that is already known. */
    documentType?: PurchaseTemplateDocumentType;
    language: string;
    /** DIE SPALTEN DER VORLAGE — Name, Art und Zuordnung; hoechstens zwoelf. */
    columns: TemplateColumn[];
}

/**
 * ── DIE VORLAGE (Stand 11.09.2026, Vorgabe Samet) ───────────────────────────
 * «Es gibt einen Vorlagennamen, aber keinen Lieferanten und keine Rechenart
 *  mehr; auch keine Mehrwertsteuer — die steht in den Bestelldetails. Bis zu
 *  dreizehn Spalten (12+1): eine davon ist der ERP-Code, fest, in den
 *  Tabellen, aber nicht im PDF und nicht in der KI-Anfrage. Jede Spalte
 *  bekommt einen Namen, eine Art und eine Zuordnung; Produktname und Menge
 *  sind Pflicht, die uebrigen Zuordnungen gibt es je einmal. Ohne Vorlage
 *  gibt es keine Tabelle.»
 *
 * Die Vorlage ist damit NUR NOCH ihre Spaltenliste. `key` ist der stabile
 * Bezug (`c1` … `c12`), `name` das, was der Anwender sieht UND was dem Modell
 * als Spaltenueberschrift gesagt wird, `label` die Rolle in der Bestellzeile
 * (null = eine freie Spalte, deren Wert als eigene Angabe gespeichert wird).
 */
export const TEMPLATE_LABELS = ['productName', 'quantity', 'grossPrice', 'netPrice', 'discount', 'discount2', 'total'] as const;
export type TemplateLabel = (typeof TEMPLATE_LABELS)[number];
/** Ohne diese beiden laesst sich aus dem Gelesenen keine Bestellzeile machen. */
export const REQUIRED_TEMPLATE_LABELS: TemplateLabel[] = ['productName', 'quantity'];
/** Zwoelf Spalten — plus den festen ERP-Code, der nicht in der Vorlage steht. */
export const TEMPLATE_MAX_COLUMNS = 12;

export interface TemplateColumn {
    key: string;
    name: string;
    type: 'text' | 'number';
    /** Die Rolle in der Bestellzeile; null = freie Spalte. */
    label?: TemplateLabel | null;
    /** Relative screen width; PDF export scales the same proportion onto A4. */
    width?: number;
}

/** Die Vorlage in einem Objekt — genau das, was gespeichert wird. */
export interface OrderTemplateConfig {
    columns: TemplateColumn[];
}
/** Der alte Name lebt in den Seiten weiter; die Gestalt ist die neue. */
export type SupplierCalcConfig = OrderTemplateConfig;

export interface SupplierOrderTemplate {
    id: string;
    /** Seit dem 11.09.2026 immer null — eine Vorlage gehoert keinem Lieferanten. */
    supplierId: string | null;
    supplierName: string;
    title: string;
    documentType: PurchaseTemplateDocumentType;
    /** Die Vorgabe ihrer Dokumentart — die, die beim Oeffnen gilt. */
    isDefault: boolean;
    usageCount: number;
    config: SupplierCalcConfig;
    createdAt: string;
    updatedAt: string;
}

export type PurchaseTemplateDocumentType = 'ORDER' | 'PRICE_REQUEST' | 'GOODS_RECEIPT';

export interface InventoryDashboard {
    kpis: {
        totalArticles: number;
        activeArticles: number;
        totalLocations: number;
        pendingProposals: number;
        criticalCount: number;
        belowMinCount: number;
        inventoryValue: number;
    };
    criticalArticles: ArticleStockSummary[];
    proposals: PurchaseProposalRow[];
    locations: InventoryLocation[];
}
