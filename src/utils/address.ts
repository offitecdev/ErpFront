/**
 * ── POSTA ADRESİ: AYRI BİLEŞENLER → EN FAZLA 2 SATIR ────────────────────────
 *
 * Adres, veri modelinde ayrı bileşenler olarak tutulur (firma/ad, sokak + bina
 * no, adres eki / daire, PLZ, şehir, eyalet, ülke). Hiçbir bileşen bir
 * diğeriyle aynı anlamı taşımaz ve tek bir serbest metin "Adres" alanı YOKTUR
 * — bu yüzden CRM, teklif, tedarikçi ve sipariş ekranlarında alanlar tek tek
 * girilir, ama GÖSTERİM her yerde (ekran + PDF) iki satıra indirgenir:
 *
 *     Bahnhofstrasse 12, 3. OG          ← sokak + bina no (+ adres eki)
 *     8001 Zürich, ZH, Schweiz          ← PLZ + şehir (+ eyalet, ülke)
 *
 * Metin sığmazsa (yalnızca o zaman) üçüncü satıra taşılır: önce adres eki kendi
 * satırına alınır, o da yetmezse taşan satır kendi ayıracından bölünür.
 *
 * Firma/ad bilinçli olarak DIŞARIDA bırakılır: çağıran ekranlar onu zaten
 * başlık (kalın alıcı satırı) olarak yazar, adres bloğunda tekrar etmesi
 * istenen "tekrarsızlık" kuralını bozardı.
 */

export interface PostalAddressParts {
    /** Sokak + bina numarası. */
    street?: string | null;
    /** Adres eki / daire (kat, daire no, "c/o" …). */
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    /** Eyalet / kanton / bölge. */
    state?: string | null;
    country?: string | null;
}

export interface FormatAddressOptions {
    /**
     * Satırın hedef genişliğe sığıp sığmadığını söyleyen ölçüm. Verilmezse
     * taşma denetimi yapılmaz ve sonuç her zaman ≤ 2 satırdır. PDF'te
     * `doc.getTextWidth`, ekranda karakter sayısı ile beslenir.
     */
    fits?: (line: string) => boolean;
    /** Taşmada izin verilen üst sınır (varsayılan 3). */
    maxLines?: number;
}

const SEPARATOR = ', ';

const clean = (value: string | null | undefined): string =>
    (value ?? '').toString().replace(/\s+/g, ' ').trim();

/**
 * Bileşenlerden görüntü satırlarını kurar. Sonuç normalde 2 satırdır; `fits`
 * verildiyse ve satır sığmıyorsa en fazla `maxLines` (varsayılan 3) satıra
 * çıkar. Hiçbir bileşen iki kez yazılmaz.
 */
export const formatAddressLines = (
    parts: PostalAddressParts,
    options: FormatAddressOptions = {},
): string[] => {
    const street = clean(parts.street);
    const supplement = clean(parts.addressSupplement);
    const postalCode = clean(parts.postalCode);
    const city = clean(parts.city);
    const state = clean(parts.state);
    const country = clean(parts.country);

    const streetLine = [street, supplement].filter(Boolean).join(SEPARATOR);
    const localityLine = [
        [postalCode, city].filter(Boolean).join(' '),
        state,
        country,
    ].filter(Boolean).join(SEPARATOR);

    const lines = [streetLine, localityLine].filter(Boolean);

    const { fits, maxLines = 3 } = options;
    if (!fits || lines.length === 0 || lines.every(fits) || lines.length >= maxLines) return lines;

    // 1) Doğal kırılma: adres eki kendi satırına iner.
    if (supplement && street && !fits(streetLine)) {
        const rebuilt = [street, supplement, localityLine].filter(Boolean);
        if (rebuilt.length <= maxLines && rebuilt.every(fits)) return rebuilt;
    }

    // 2) Taşan satırı kendi ayıracından böl (ör. "8001 Zürich, ZH, Schweiz").
    const index = lines.findIndex((line) => !fits(line));
    const target = lines[index] ?? '';
    const cut = target.lastIndexOf(SEPARATOR);
    if (cut <= 0) return lines;
    return [
        ...lines.slice(0, index),
        target.slice(0, cut),
        target.slice(cut + SEPARATOR.length),
        ...lines.slice(index + 1),
    ];
};

/** Tek satır gösterim (tablo hücresi, Excel, `title` ipucu). */
export const formatAddressOneLine = (parts: PostalAddressParts): string =>
    formatAddressLines(parts).join(SEPARATOR);

/** Adres bileşenlerinin hiçbiri dolu değil mi? */
export const isAddressEmpty = (parts: PostalAddressParts): boolean =>
    formatAddressLines(parts).length === 0;

/**
 * Ekran genişliğine göre ölçüm: yaklaşık karakter sınırı. PDF `getTextWidth`
 * kullandığı için bu yalnızca HTML tarafında gerekir.
 */
export const fitsInChars = (maxChars: number) => (line: string): boolean => line.length <= maxChars;
