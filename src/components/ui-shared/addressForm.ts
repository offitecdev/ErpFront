/**
 * ── ADRES FORMU: AYRI BİLEŞENLER (veri katmanı) ─────────────────────────────
 *
 * Uygulamada tek bir serbest metin "Adres" alanı YOKTUR. Adres her yerde (CRM
 * müşteri profili, müşteri/teklif adresleri, tedarikçi kaydı) aynı ayrı
 * bileşenlerle girilir ve hiçbir bileşen bir diğeriyle aynı anlamı taşımaz:
 *
 *   Firma / Ad          → kaydın kendi ad alanı (companyName) — bu sette
 *                         TEKRARLANMAZ, formun kendi başlık alanıdır.
 *   Sokak / Bina No     → `address`
 *   Adres eki / Daire   → `addressSupplement`
 *   Posta Kodu / Şehir  → `postalCode` / `city`
 *   Eyalet / Ülke       → `state` / `country`
 *
 * GÖSTERİM her zaman iki satıra iner (taşarsa üç): `utils/address.ts` içindeki
 * `formatAddressLines()`. Girişte ayrı, çıktıda iki satır.
 *
 * Bileşenler (`AddressFields`, `AddressLines`) `AddressFields.tsx` içindedir;
 * saf yardımcılar burada yaşar (fast-refresh bir dosyada bileşen + sabit
 * karışımını sevmiyor).
 */

export interface AddressFormValue {
    /** Sokak + bina numarası. */
    address: string;
    addressSupplement: string;
    postalCode: string;
    city: string;
    state: string;
    country: string;
}

export const EMPTY_ADDRESS: AddressFormValue = {
    address: '',
    addressSupplement: '',
    postalCode: '',
    city: '',
    state: '',
    country: '',
};

/** API gövdesine giden alan adları — form ve payload aynı isimleri kullanır. */
export const ADDRESS_FIELD_KEYS = Object.keys(EMPTY_ADDRESS) as Array<keyof AddressFormValue>;

type AddressSource = Partial<Record<keyof AddressFormValue, string | null | undefined>>;

/** Kayıttan forma: eksik/null alanlar boş metne iner. */
export const toAddressForm = (source: AddressSource): AddressFormValue => ({
    address: source.address ?? '',
    addressSupplement: source.addressSupplement ?? '',
    postalCode: source.postalCode ?? '',
    city: source.city ?? '',
    state: source.state ?? '',
    country: source.country ?? '',
});

/** Formdan API'ye: boş metinler null olur (kolonlar nullable). */
export const toAddressPayload = (value: AddressFormValue): Record<keyof AddressFormValue, string | null> =>
    Object.fromEntries(ADDRESS_FIELD_KEYS.map((key) => [key, value[key].trim() || null])) as Record<keyof AddressFormValue, string | null>;

/** Bileşenleri `formatAddressLines`'ın beklediği şekle çevirir. */
export const addressParts = (value: AddressSource) => ({
    street: value.address,
    addressSupplement: value.addressSupplement,
    postalCode: value.postalCode,
    city: value.city,
    state: value.state,
    country: value.country,
});
