/**
 * ── SİPARİŞ SATIRI FİYAT MATEMATİĞİ ─────────────────────────────────────────
 *
 * ⚠ Bu dosya backend'in `normalizePurchaseOrderItems()` fonksiyonunun (
 * `Erp_Backend/src/presentation/routes/inventory.routes.ts`) BİREBİR eşidir.
 * Sunucu frontend'e güvenmez ve toplamları kendi hesaplar; iki taraf birlikte
 * güncellenmelidir, yoksa ekranda görünen tutar kaydedilenden farklı olur.
 *
 * İNDİRİMLER: `discount`, `discount2`, `discount3` yüzdeleri SIRAYLA uygulanır —
 * teklif tarafındaki `directDiscount` + `extraDiscount` deseniyle aynı
 * (100 → −20% → 80 → −10% → 72), toplamları toplanmaz. Kullanıcı ana indirimin
 * yanına en fazla iki ek indirim açabilir (İndirim 2 / İndirim 3).
 *
 * KDV satır düzeyindedir: ülkeye göre hazır oranlardan seçilir ya da elle
 * girilir; tutar indirimli NET satır tutarı üzerinden hesaplanır.
 */

/**
 * Ek indirim sütunu — ana indirimin yanında YALNIZCA BİR tane (kullanıcı
 * isteği 2026-08-02: "normal indirim + ek indirim, daha karmaşığı değil").
 * `discount3` veri modelinde ve eski kayıtlarda durur ama arayüzde SUNULMAZ;
 * kaydetmede 0 gönderilir.
 */
export const EXTRA_DISCOUNT_KEYS = ['discount2'] as const;
export type ExtraDiscountKey = (typeof EXTRA_DISCOUNT_KEYS)[number];

/** Para yuvarlaması (2 hane) — sipariş tarafındaki TEK yuvarlama kuralı. */
export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Yüzde alanı: 0–100 aralığına kırpılır, geçersiz değer 0 sayılır. */
export const clampPercent = (value: unknown): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return 0;
    return round2(Math.min(100, Math.max(0, parsed)));
};

/** Sıralı indirimlerin bileşik çarpanı (1 = indirim yok). */
export const discountFactor = (...percentages: Array<number | undefined>): number =>
    percentages.reduce<number>((factor, percentage) => factor * (1 - clampPercent(percentage) / 100), 1);

/** Sıralı indirimlerin TEK bir yüzdeye indirgenmiş hâli (başlık ipucunda gösterilir). */
export const combinedDiscountPercent = (...percentages: Array<number | undefined>): number =>
    round2(100 * (1 - discountFactor(...percentages)));

/**
 * Eski kayıtların ÜÇÜNCÜ indirimi ek indirime katlanır: arayüzde artık tek ek
 * indirim sütunu var (kullanıcı isteği 2026-08-02), üçüncü yüzde sessizce
 * düşerse satır tutarı ARTARDI. İki yüzde sırayla uygulandığı için birleşik
 * oran tutarı birebir korur (%10 sonra %5 → tek %14.5).
 * Dönen değer tablo hücresi metnidir ('' = ek indirim yok).
 */
export const foldedExtraDiscount = (item: {
    discount2?: number | null;
    discount3?: number | null;
}): string => {
    const second = clampPercent(item.discount2);
    const third = clampPercent(item.discount3);
    if (!second && !third) return '';
    if (!third) return String(second);
    // ⚠ Birleşik oran 2 haneye YUVARLANMAZ: %12.5 + %7.5 = %19.0625'tir ve
    // %19.06'ya yuvarlanırsa büyük tutarlarda satır birkaç rappen kayar.
    // Kayan nokta artığı için 6 haneye kırpılır (0.1+0.2 gürültüsü kalmasın).
    const exact = 100 * (1 - discountFactor(second, third));
    return String(Math.round(exact * 1e6) / 1e6);
};

export interface OrderLineFigures {
    /** BRÜT satır tutarı: miktar × brüt birim fiyat (indirim uygulanmadan). */
    subtotal: number;
    /** İndirimler uygulandıktan sonraki net satır tutarı. */
    lineTotal: number;
    /** İndirimli BİRİM fiyat — "Net Fiyat" sütununda gösterilen türetilmiş değer. */
    netUnitPrice: number;
    /** İndirimin para cinsinden karşılığı. */
    discountAmount: number;
    /** Net tutar üzerinden KDV. */
    lineVat: number;
    /** Net + KDV. */
    lineGross: number;
}

/**
 * Tek satırın tüm tutarları — tabloda, toplamlarda ve backend'de aynı sıra.
 *
 * SIRA (kullanıcı isteği 2026-07-30 — önceki davranış HATALIYDI):
 *   1. birim fiyat × miktar          → BRÜT satır tutarı
 *   2. brüt tutar − indirim          → ilk indirim brüt üzerine iner
 *   3. − indirim 2 / 3               → her ek indirim ZATEN İNDİRİMLİ tutara iner
 *   4. net tutar × KDV oranı         → satır KDV'si
 *
 * Eskiden indirimler ELLE GİRİLEN net fiyatın üzerine inerdi: brüt 100 / net 90
 * / indirim %20 satırı 72 verirdi, oysa doğru sonuç 80'dir. Artık **brüt birim
 * fiyat tek giriştir**; net birim fiyat (`netUnitPrice`) indirimlerden TÜRETİLİR
 * ve iki değer birbiriyle çelişemez.
 *
 * `netPrice` yalnızca GERİYE DÖNÜK tabandır: brüt fiyatı olmayan eski kayıtlar ve
 * tek fiyat taşıyan Excel dosyaları için kullanılır.
 *
 * HESAP KİPLERİ (`calcMode`, 2026-08-01 — `directCopy`'nin genellemesi):
 *   AUTO     → yukarıdaki hesap (varsayılan).
 *   DIRECT   → hesap yok: net fiyat + satır tutarı GÖNDERİLDİĞİ GİBİ (eski
 *              directCopy — OrderCreatePage kendi rowFigures dalını kullanır).
 *   SUPPLIER → tedarikçi hesabı: NET BİRİM FİYAT SABİT, indirim kilitli; satır
 *              tutarı miktarla orantılı (miktar × sabit net fiyat).
 */
export type OrderLineCalcMode = 'AUTO' | 'DIRECT' | 'SUPPLIER';

export const computeOrderLine = (input: {
    quantity: number;
    grossPrice: number;
    netPrice?: number;
    discount?: number;
    discount2?: number;
    discount3?: number;
    vatRate?: number;
    calcMode?: OrderLineCalcMode;
}): OrderLineFigures => {
    if (input.calcMode === 'SUPPLIER') {
        // Sabit net birim fiyat; miktar değişince tutar orantılı ölçeklenir.
        // ⚠ Birim fiyat ASLA yuvarlanmaz (kullanıcı isteği 2026-08-02): tedarikçi
        // fiyatı 3 ondalık taşıyabilir ve 2 haneye yuvarlanmış fiyatla çarpmak
        // tutarı kaydırıyordu (18.9766 × 3 = 56.93, ama 18.98 × 3 = 56.94).
        // Yalnızca SONUÇ tutarlar (satır tutarı / KDV) para olarak yuvarlanır.
        const netUnit = input.netPrice || 0;
        const quantity = input.quantity || 0;
        const gross = input.grossPrice || netUnit;
        const subtotal = round2(quantity * gross);
        const lineTotal = round2(quantity * netUnit);
        const lineVat = round2(lineTotal * (clampPercent(input.vatRate) / 100));
        return {
            subtotal,
            lineTotal,
            netUnitPrice: netUnit,
            discountAmount: round2(subtotal - lineTotal),
            lineVat,
            lineGross: round2(lineTotal + lineVat),
        };
    }
    const unitPrice = input.grossPrice || input.netPrice || 0;
    const subtotal = round2((input.quantity || 0) * unitPrice);
    const factor = discountFactor(input.discount, input.discount2, input.discount3);
    const lineTotal = round2(subtotal * factor);
    const lineVat = round2(lineTotal * (clampPercent(input.vatRate) / 100));
    return {
        subtotal,
        lineTotal,
        netUnitPrice: round2(unitPrice * factor),
        discountAmount: round2(subtotal - lineTotal),
        lineVat,
        lineGross: round2(lineTotal + lineVat),
    };
};

/**
 * Eski kayıtlarda brüt ve net fiyat birbirinden BAĞIMSIZ girilebiliyordu; yüzde
 * yazılmadan net fiyat düşürülerek indirim verilmiş olabilir. Yeni matematik
 * indirimi brütten hesapladığı için böyle bir satır düzenlemeye açıldığında
 * tutarı kendiliğinden ARTARDI. Bu fonksiyon o gizli indirimi yüzdeye çevirir:
 * tutar korunur, indirim artık görünür olur. Yüzde zaten girilmişse dokunulmaz.
 */
export const impliedDiscountPercent = (item: {
    grossPrice?: number | null;
    netPrice?: number | null;
    discount?: number | null;
    discount2?: number | null;
    discount3?: number | null;
}): number => {
    const gross = Number(item.grossPrice) || 0;
    const net = Number(item.netPrice) || 0;
    const hasPercent = (Number(item.discount) || 0) > 0
        || (Number(item.discount2) || 0) > 0
        || (Number(item.discount3) || 0) > 0;
    if (hasPercent || gross <= 0 || net <= 0 || net >= gross) return 0;
    return clampPercent(100 * (1 - net / gross));
};

/**
 * Bir sipariş satırının GÖSTERİLECEK net birim fiyatı: tedarikçi kipinde
 * ekranda ve belgelerde TEDARİKÇİ LİSTESİNDEKİ / Excel'den gelen fiyat durur
 * (kullanıcı isteği 2026-08-02 — "yüklenen fiyat ne ise o görünsün").
 * `netPrice` hesabın tam duyarlıklı tabanıdır ve Excel'in kendi yuvarlaması
 * yüzünden bundan ayrılabilir; tutarlar HER ZAMAN `netPrice` ile hesaplanır.
 */
export const itemDisplayNetPrice = (item: {
    netPrice?: number | null;
    displayNetPrice?: number | null;
}): number => {
    const display = Number(item.displayNetPrice);
    return Number.isFinite(display) && display > 0 ? display : (Number(item.netPrice) || 0);
};

// ── Ek ücretler ─────────────────────────────────────────────────────────────
// Sipariş düzeyinde ad + tutar (nakliye, ambalaj, montaj…). Kalem değildir:
// miktarı, indirimi ve KDV oranı yoktur — tutar NET kabul edilir ve genel
// toplama olduğu gibi eklenir. Backend eşi: `normalizePurchaseOrderFees()`.

/** Ek ücret tutarları toplamı (geçersiz değer 0 sayılır). */
export const sumOrderFees = (fees?: Array<{ amount?: number | null }> | null): number => {
    if (!Array.isArray(fees)) return 0;
    return round2(fees.reduce((sum, fee) => {
        const amount = Number(fee?.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
    }, 0));
};

/**
 * ── SİPARİŞ TOPLAMI: TEK VE KESİN SIRA (kullanıcı isteği 2026-08-02) ────────
 *
 *   1. satır tutarları toplanır            → net toplam
 *   2. + ek ücretler (nakliye, ambalaj…)   → KDV MATRAHI
 *   3. matrah × KDV oranı                  → KDV (tek oran, tüm ürünler için)
 *   4. matrah + KDV                        → genel toplam
 *   5. sonuç İKİ ONDALIĞA yuvarlanır       (43'721.34768 → 43'721.35)
 *
 * KDV artık satır başına DEĞİL sipariş düzeyindedir: aynı oran bütün ürünlere
 * uygulandığı için tabloda KDV sütunu yoktur, oran sipariş detaylarından
 * seçilir. Eski (LINE kipli) kayıtlar satır KDV'leriyle okunmaya devam eder.
 */
export interface OrderTotals {
    /** Satır tutarlarının toplamı. */
    net: number;
    /** Ek ücretlerin toplamı. */
    fees: number;
    /** KDV matrahı = net + ek ücretler. */
    vatBase: number;
    /** Matrah × oran. */
    vat: number;
    /** Matrah + KDV — ödenecek tutar. */
    grand: number;
}

export const computeOrderTotals = (input: {
    net: number;
    fees?: number;
    vatRate?: number;
}): OrderTotals => {
    const net = round2(input.net || 0);
    const fees = round2(input.fees || 0);
    const vatBase = round2(net + fees);
    const vat = round2(vatBase * (clampPercent(input.vatRate) / 100));
    return { net, fees, vatBase, vat, grand: round2(vatBase + vat) };
};

/**
 * Sipariş düzeyi KDV (TOTAL kipi): tek oran, (net kalemler + ek ücretler)
 * üzerinden. LINE kipinde satır KDV'lerinin toplamı geçerlidir.
 *
 * ⚠ Backend eşi: `inventory.routes.ts` → `purchaseOrderTotalVat` — birlikte
 * güncellenmelidir.
 */
export const orderVatTotal = (order: {
    vatMode?: 'LINE' | 'TOTAL' | null;
    orderVatRate?: number | null;
    totalNet: number;
    totalFees?: number | null;
    totalVat?: number | null;
}): number => {
    if (order.vatMode === 'TOTAL') {
        const fees = Number.isFinite(Number(order.totalFees)) ? Number(order.totalFees) : 0;
        return round2(((order.totalNet || 0) + fees) * (clampPercent(order.orderVatRate) / 100));
    }
    return order.totalVat || 0;
};

/**
 * Siparişin ödenecek genel toplamı: net kalem toplamı + ek ücretler + KDV.
 * Tablo altbilgisi, Excel ve PDF aynı fonksiyonu kullanır ki üç yerde farklı
 * tutar görünmesin. (`totalVat` sunucuda kipe göre zaten doğru yazılır;
 * taze düzenlemelerde `orderVatTotal` ile önceden hesaplanabilir.)
 */
export const orderGrandTotal = (order: {
    totalNet: number;
    totalVat?: number | null;
    totalFees?: number | null;
    additionalFees?: Array<{ amount?: number | null }> | null;
}): number => {
    // `totalFees` sunucudan gelir; eski kayıtlarda yoksa listeden hesaplanır.
    const fees = Number.isFinite(Number(order.totalFees))
        ? Number(order.totalFees)
        : sumOrderFees(order.additionalFees);
    return round2((order.totalNet || 0) + fees + (order.totalVat || 0));
};

// ── Ülkeye göre KDV oranları ────────────────────────────────────────────────
// KDV sütununun başlığına tıklandığında açılan pencerede bu liste gösterilir:
// ülke seçilir, hazır oranlardan biri (ya da elle girilen bir oran) satırlara
// uygulanır. Liste yalnızca ÖNERİDİR — her satır kendi oranını taşır.

export interface CountryVatRates {
    /** ISO 3166-1 alpha-2. */
    code: string;
    label: string;
    /** Standart oran ilk sırada; 0 her zaman sonda (muaf/ihracat). */
    rates: number[];
}

export const COUNTRY_VAT_RATES: CountryVatRates[] = [
    { code: 'CH', label: 'Schweiz', rates: [8.1, 3.8, 2.6, 0] },
    { code: 'LI', label: 'Liechtenstein', rates: [8.1, 3.8, 2.6, 0] },
    { code: 'DE', label: 'Deutschland', rates: [19, 7, 0] },
    { code: 'AT', label: 'Österreich', rates: [20, 13, 10, 0] },
    { code: 'FR', label: 'France', rates: [20, 10, 5.5, 2.1, 0] },
    { code: 'IT', label: 'Italia', rates: [22, 10, 5, 4, 0] },
    { code: 'TR', label: 'Türkiye', rates: [20, 10, 1, 0] },
];

/** Ülke adı/kodu → oran listesi. Bulunamazsa varsayılan ülke (CH) döner. */
export const vatRatesForCountry = (country?: string | null): CountryVatRates => {
    const needle = (country || '').trim().toLowerCase();
    return COUNTRY_VAT_RATES.find((entry) => entry.code.toLowerCase() === needle
        || entry.label.toLowerCase() === needle)
        ?? COUNTRY_VAT_RATES[0];
};

// ── Kullanıcı tanımlı KDV ülkeleri ──────────────────────────────────────────
// KDV ayarları penceresinden "ülke adı + oran" eklenebilir; liste tarayıcıda
// saklanır (tenant verisi değildir — seçilen oran siparişin kendisine yazılır,
// bu liste yalnızca seçim önerisidir).

const CUSTOM_VAT_KEY = 'offitec:order-custom-vat';

export const loadCustomVatCountries = (): CountryVatRates[] => {
    try {
        const parsed = JSON.parse(localStorage.getItem(CUSTOM_VAT_KEY) || '[]');
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((entry) => entry && typeof entry.label === 'string' && Array.isArray(entry.rates))
            .map((entry) => ({
                code: String(entry.code || entry.label).slice(0, 8),
                label: String(entry.label).slice(0, 80),
                rates: entry.rates.map((rate: unknown) => clampPercent(rate)).slice(0, 10),
            }));
    } catch {
        return [];
    }
};

/** Ülke ekle ya da mevcut ülkeye oran ekle; güncel özel listeyi döndürür. */
export const saveCustomVatCountry = (label: string, rate: number): CountryVatRates[] => {
    const cleanLabel = label.trim().replace(/\s+/g, ' ').slice(0, 80);
    if (!cleanLabel) return loadCustomVatCountries();
    const cleanRate = clampPercent(rate);
    const list = loadCustomVatCountries();
    const existing = list.find((entry) => entry.label.toLowerCase() === cleanLabel.toLowerCase());
    if (existing) {
        if (!existing.rates.includes(cleanRate)) existing.rates = [...existing.rates, cleanRate].sort((a, b) => b - a);
    } else {
        list.push({ code: cleanLabel.slice(0, 2).toUpperCase(), label: cleanLabel, rates: [cleanRate] });
    }
    try { localStorage.setItem(CUSTOM_VAT_KEY, JSON.stringify(list)); } catch { /* dolu depolama seçim listesini bozmasın */ }
    return list;
};

/** Hazır + kullanıcı tanımlı ülkelerin birleşimi (seçim penceresi listesi). */
export const allVatCountries = (): CountryVatRates[] => [...COUNTRY_VAT_RATES, ...loadCustomVatCountries()];

/** "8.1%" — oran gösterimi (tablo hücresi ve pencere düğmeleri). */
export const fmtPercent = (value: number): string =>
    `${(Math.round((value || 0) * 100) / 100).toLocaleString('de-CH')}%`;
