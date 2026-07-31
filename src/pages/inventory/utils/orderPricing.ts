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

/** Ek indirim sütunları — ana indirimin yanında en fazla iki tane. */
export const EXTRA_DISCOUNT_KEYS = ['discount2', 'discount3'] as const;
export type ExtraDiscountKey = (typeof EXTRA_DISCOUNT_KEYS)[number];

const round2 = (value: number) => Math.round(value * 100) / 100;

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
 */
export const computeOrderLine = (input: {
    quantity: number;
    grossPrice: number;
    netPrice?: number;
    discount?: number;
    discount2?: number;
    discount3?: number;
    vatRate?: number;
}): OrderLineFigures => {
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
 * Siparişin ödenecek genel toplamı: net kalem toplamı + ek ücretler + KDV.
 * Tablo altbilgisi, Excel ve PDF aynı fonksiyonu kullanır ki üç yerde farklı
 * tutar görünmesin.
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

/** "8.1%" — oran gösterimi (tablo hücresi ve pencere düğmeleri). */
export const fmtPercent = (value: number): string =>
    `${(Math.round((value || 0) * 100) / 100).toLocaleString('de-CH')}%`;
