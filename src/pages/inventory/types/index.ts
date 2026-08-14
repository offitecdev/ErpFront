// UI-seviyesi tipler — yeni tablo tabanlı envanter modülü.
// API/veri tipleri src/types/inventory.ts içinde yaşar; burada yalnızca
// sayfaların ve bileşenlerin kendi satır/sihirbaz modelleri tutulur.

import type { ItemType, OrderCalcMode } from '@/types/inventory';

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
     * BRÜT birim fiyat — NORMAL kipte satırın TEK fiyat girişi. İndirimler bunun
     * üzerine iner; net birim fiyat ve satır tutarı `computeOrderLine` ile
     * TÜRETİLİR. "Doğrudan kopyala" kipinde ise türetme yoktur: aşağıdaki
     * `netPrice` ve `lineTotal` da elle girilir / dosyadan olduğu gibi gelir.
     */
    grossPrice: string;
    /**
     * DOĞRUDAN KOPYALA kipinin alanları (kullanıcı isteği 2026-07-31). Normal
     * kipte ikisi de BOŞ kalır ve kullanılmaz — net fiyat ile satır tutarı
     * indirimlerden türetilir. Kip açıkken hücreler düzenlenebilir olur ve buraya
     * yazılan değerler hiçbir hesaba sokulmadan kaydedilir.
     */
    netPrice: string;
    /**
     * TEDARIKCI kipinde carpimin TAM DUYARLIKLI tabani. `netPrice` ekranda
     * Excel'deki fiyati gosterir (18.98); tutar ise belgedeki tutardan turetilen
     * bu tabanla hesaplanir (56.93 / 3 = 18.9766…) — Excel'in kendi yuvarlamasi
     * ikisini ayirabilir. Bos ise `netPrice` taban kabul edilir.
     */
    supplierUnitBase?: string;
    lineTotal: string;
    /**
     * Sıralı indirim yüzdeleri: ana indirim + TEK ek indirim (kullanıcı isteği
     * 2026-08-02 — "İndirim 3" kaldırıldı). Eski kayıtlardaki üçüncü indirim
     * yüklenirken ek indirime KATLANIR (tutar korunur), API alanı 0 gider.
     */
    discount: string;
    discount2: string;
    /** Satır KDV oranı (%) — başlıktan ülkeye göre seçilir. */
    vatRate: string;
    /**
     * SATIRIN hesap kipi (kullanıcı isteği 2026-08-02 — satır satır çalışma):
     * DIRECT (varsayılan) / AUTO / SUPPLIER. Üstteki kip anahtarı SEÇİLİ
     * satırlara uygular (seçim yoksa yalnızca varsayılanı değiştirir — liste
     * karışık kipler taşıyabilir); kayıt satır başına saklanır.
     */
    calcMode: OrderCalcMode;
    /**
     * SATIRA ÖZGÜ seçim (kullanıcı isteği 2026-08-02): satırın sağındaki daire
     * BOŞ başlar; tıklandıkça D → A → T → boş döngüsüyle satıra ÖZGÜ kip
     * seçilir. `true` iken toplu (tablo geneli) kip değişimleri bu satırı
     * ETKİLEMEZ; boşken satır toplu ayarı izler.
     */
    modePinned: boolean;
    /**
     * Kip DEĞİŞTİRİLİRKEN terk edilen kipin elle girilmiş/sabit değerleri
     * (net fiyat + satır tutarı) buraya saklanır; aynı kipe GERİ dönüldüğünde
     * satır ÖNCEKİ hâline döner (kullanıcı isteği 2026-08-02: AUTO'ya girip
     * çıkmak DIRECT/SUPPLIER değerlerini ezmemeli). AUTO saklanmaz — girdileri
     * (brüt fiyat + indirimler) zaten satırda durur.
     */
    modeStash?: Partial<Record<'DIRECT' | 'SUPPLIER', {
        netPrice: string;
        lineTotal: string;
        /** Tedarikci kipinin tam duyarlikli carpim tabani (varsa). */
        base?: string;
        /**
         * Tutarın YAKALANDIĞI miktar. Birim fiyat tutardan türetilirken bu
         * kullanılır (tutar / o günkü miktar): aradan miktar değişmişse güncel
         * miktara bölmek yanlış birim fiyat verirdi.
         */
        quantity: string;
    }>>;
    /**
     * SATIRIN İLK (ÖZGÜN) FİYATI — Excel'den içe aktarıldığı ya da kayıttan
     * yüklendiği andaki hâli. Fiyat kutusunun yanındaki GERİ ÇAĞIR düğmesi
     * satırı bu değerlere döndürür: kipler arasında gidip gelirken fiyat
     * değiştiğinde özgün hâle tek tıkla dönülür (kullanıcı isteği 2026-08-02).
     */
    origin?: {
        grossPrice: string;
        netPrice: string;
        lineTotal: string;
        discount: string;
        discount2: string;
        calcMode: OrderCalcMode;
    };
    /**
     * MAL KABUL durumu — tabloda sütunu yoktur; mevcut sipariş düzenlenirken
     * yüklenir ve AYNEN geri gönderilir ki bir düzenleme, satırın stoğa
     * aktarılmış miktarını sıfırlamasın (receive endpoint'i yazar).
     */
    receivedQuantity: number;
    receivedAt: string | null;
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
    /** Ürün kartına yazılacak açıklama (serbest metin). */
    description: string;
    /** Ürün görseli (data URL) — satırdaki küçük seçiciyle eklenir. */
    imageUrl: string | null;
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
