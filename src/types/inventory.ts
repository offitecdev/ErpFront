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
    articleCode: string;
    name: string;
    unit: string;
    /** Biçimli metin (kalın/italik/madde) — sunucuda dar bir beyaz listeden geçer. */
    description?: string | null;
    salePrice: number;
    itemType: ItemType;
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
    salePrice?: number;
    /** Ürün/hizmet anahtarı — detay ekranındaki "Typ" satırı. */
    itemType?: ItemType;
    description?: string | null;
    imageUrl?: string | null;
}

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

export interface MovementListItem {
    id: string;
    transactionDate: string;
    movementType: MovementType;
    movementKind: MovementKind;
    quantity: number;
    unitCost?: number | null;
    totalCost: number;
    description?: string | null;
    article?: { articleCode: string; name: string } | null;
    supplier?: { companyName: string } | null;
    employee?: { firstName: string; lastName: string } | null;
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
}

export interface BulkRowError {
    index: number;
    articleCode: string;
    error: string;
}

export interface BulkArticlesResult {
    /** Geschriebene Zeilen INSGESAMT — die aktualisierten sind mitgezählt. */
    createdCount: number;
    /** Davon auf eine bereits vorhandene Artikelnummer getroffen (`overwrite`). */
    updatedCount?: number;
    created: Array<{ id: string; articleCode: string; name: string }>;
    errors: BulkRowError[];
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
     * GOSTERILEN net birim fiyat (tedarikci listesindeki / Excel'deki deger).
     * `netPrice` hesabin tam duyarlikli tabanidir; Excel'in kendi yuvarlamasi
     * yuzunden ikisi ayrilabilir (18.98 gorunur, 18.9766… ile carpilir).
     */
    displayNetPrice?: number | null;
    /** Mal kabulde stoga aktarilan miktar (receive endpoint'i yazar). */
    receivedQuantity?: number;
    /** Son mal kabul zamani (ISO). */
    receivedAt?: string | null;
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

export interface PurchaseOrderRow {
    id: string;
    tenantId: string;
    /** "Bestellung" — sipariş kodu (BE-2026-001), kullanıcı düzenleyebilir. */
    referenceNumber: string;
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
    /** KDV kipi — TOTAL ise `totalVat = (totalNet + totalFees) × orderVatRate`. */
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
    stockedAt?: string | null;
    createdByEmpId?: string | null;
    createdAt: string;
    updatedAt: string;
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
}

export interface CreatePurchaseOrderInput {
    /** Boş bırakılırsa sunucu BE-{yıl}-{sıra} üretir. */
    referenceNumber?: string | null;
    quoteNumber?: string | null;
    orderedByName?: string | null;
    projectName?: string | null;
    /** Alıcı adı (Empfänger) — opsiyonel, PDF alıcı bloğunda görünür. */
    recipientName?: string | null;
    /** Ön yazı (Anschreiben) — boş/null gönderilirse PDF standart metnini basar. */
    coverLetter?: string | null;
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
}

export interface UpdatePurchaseOrderInput {
    referenceNumber?: string;
    quoteNumber?: string | null;
    orderedByName?: string | null;
    projectName?: string | null;
    recipientName?: string | null;
    coverLetter?: string | null;
    supplierId?: string | null;
    supplierName?: string;
    supplierEmail?: string | null;
    currency?: string;
    vatMode?: OrderVatMode;
    orderVatRate?: number;
    orderVatCountry?: string | null;
    items?: PurchaseOrderItemInput[];
    additionalFees?: PurchaseOrderFee[];
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
