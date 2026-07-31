// UI-seviyesi tipler — yeni tablo tabanlı envanter modülü.
// API/veri tipleri src/types/inventory.ts içinde yaşar; burada yalnızca
// sayfaların ve bileşenlerin kendi satır/sihirbaz modelleri tutulur.

import type { ItemType } from '@/types/inventory';

/**
 * Sipariş oluşturma/düzenleme tablosundaki tek taslak satır. Tedarikçi satırda
 * DEĞİL, sipariş düzeyinde tutulur (tek sipariş = tek tedarikçi) — üstteki
 * tedarikçi alanından seçilir.
 *
 * `serialNumber` veri modelinde KALIR — mevcut siparişler düzenlenirken yüklenip
 * geri kaydedilir ve PDF'te ürün adının altında görünür — ama artık hiçbir
 * arayüzde girilmez: sipariş tablosunda sütunu yoktur (yerini indirim ve KDV
 * sütunları aldı) ve Excel şablonunda da yer almaz (kullanıcı isteği
 * 2026-07-30: ürünün tek kimliği SERİ KOD'dur).
 */
export interface DraftOrderRow {
    key: string;
    itemType: ItemType;
    articleId: string | null;
    code: string;
    /** Excel'den gelir; tabloda sütunu yoktur, kayıtta korunur. */
    serialNumber: string;
    name: string;
    unit: string;
    quantity: string;
    /**
     * BRÜT birim fiyat — satırın TEK fiyat girişi. İndirimler bunun üzerine iner;
     * net birim fiyat ve satır tutarı `computeOrderLine` ile TÜRETİLİR (bu yüzden
     * taslakta `netPrice` YOKTUR — iki fiyat birbiriyle çelişemesin).
     */
    grossPrice: string;
    /** Sıralı indirim yüzdeleri — 2 ve 3 yalnızca kullanıcı açtıysa görünür. */
    discount: string;
    discount2: string;
    discount3: string;
    /** Satır KDV oranı (%) — başlıktan ülkeye göre seçilir. */
    vatRate: string;
    error?: string | null;
}

/**
 * Sipariş detay penceresindeki tek EK ÜCRET satırı (nakliye, ambalaj, montaj…).
 * Ürün satırı değildir: yalnızca ad ve tutar taşır, tutar genel toplama net
 * olarak eklenir.
 */
export interface DraftOrderFee {
    key: string;
    name: string;
    /** Serbest metin girişi — kaydetmede sayıya çevrilir. */
    amount: string;
}

/** Sipariş → stok aktarımı: OrderSheet'in stok sayfasına taşıdığı router state yükü. */
export interface OrderStockPrefill {
    orderId: string;
    orderReference: string;
    supplierId: string | null;
    supplierName: string;
    rows: Array<{
        itemType: ItemType;
        articleId: string | null;
        articleCode: string;
        name: string;
        quantity: number;
        unitCost: number;
        unit: string;
    }>;
}

/** Toplu ürün ekleme tablosundaki tek satır (henüz kaydedilmemiş taslak). */
export interface DraftProductRow {
    key: string;
    articleCode: string;
    name: string;
    salePrice: string;
    quantity: string;
    purchasePrice: string;
    supplierId: string | null;
    /** Elle girilen tedarikçi adı (listeden seçilmediyse). */
    supplierName: string;
    /** Sunucudan dönen satır hatası (kaydetme denemesi sonrası). */
    error?: string | null;
}

/**
 * Toplu stok giriş/çıkış tablosundaki tek satır. Satır önce boş (ürünsüz)
 * eklenir; ürün hücresine tıklanınca sağdan açılan seçiciyle doldurulur.
 */
export interface DraftStockRow {
    key: string;
    articleId: string | null;
    articleCode: string;
    name: string;
    unit: string;
    currentStock: number;
    quantity: string;
    unitCost: string;
    supplierId: string | null;
    supplierName: string;
    description: string;
    error?: string | null;
}

export type StockDirection = 'IN' | 'OUT';

/** Tedarikçi seçiminin sonucu: listeden id ile ya da elle yazılan ad ile. */
export interface SupplierChoice {
    supplierId: string | null;
    supplierName: string;
    /** Satır hücresinde gösterilecek etiket. */
    label: string;
}

// --- Excel içe aktarma sihirbazı ---

/**
 * Sihirbazın hedef kolonu: Excel başlıkları bu alanlara eşlenir.
 * İçe aktarma esnektir: hücre doğru tipteyse alınır, değilse boş bırakılır —
 * satır yine eklenir. `keyField` işaretli kolonlardan en az biri doluysa satır
 * "tanınmış" sayılır; hiçbiri dolu değilse satır (isteğe bağlı) atlanır.
 */
export interface ImportField {
    key: string;
    label: string;
    /** Satırı tanımlayan kolon (ör. ürün kodu / adı). */
    keyField?: boolean;
    numeric?: boolean;
}

/** Ayrıştırılmış çalışma sayfası. */
export interface ParsedSheet {
    fileName: string;
    headers: string[];
    rows: Array<Array<string | number | null>>;
    /**
     * Başlık indeksi → sütun Excel'de YÜZDE biçimli mi. Yüzde biçimli hücrenin
     * ham değeri 0.2'dir ("%20"), bu yüzden sihirbaz o sütunu 100 ile çarpar.
     */
    percentColumns: boolean[];
}

/** field.key → Excel başlık indexi (-1 = eşlenmedi / boş bırak). */
export type ColumnMapping = Record<string, number>;

/** Sihirbazdan dönen tek kayıt: field.key → hücre değeri. */
export type ImportedRecord = Record<string, string | number | null>;
