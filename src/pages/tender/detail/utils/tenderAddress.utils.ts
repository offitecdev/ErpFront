import { EMPTY_ADDRESS, addressParts } from '../../../../components/ui-shared/addressForm';
import type { AddressFormValue } from '../../../../components/ui-shared/addressForm';
import { formatAddressLines } from '../../../../utils/address';
import type { CustomerLocationDto } from '../../../../lib/api/customer';

export type TenderAddressTarget = 'INSTALLATION' | 'DELIVERY' | 'BILLING' | 'CUSTOMER';

/**
 * "+ adres ekle" formu. Adres AYRI BILESENLERLE girilir (`AddressFormValue`) —
 * "Adres" diye tek bir serbest metin alani YOKTUR. `name` yalnizca kaydin liste
 * etiketidir (or. "Montaj yeri"), posta adresinin parcasi degildir.
 *
 * Tip ve bos deger BURADA yasar: pencerenin kendisi `lazy()` ile yuklendigi icin
 * o dosyadan bir sabit import etmek parcayi ana pakete geri cekerdi.
 */
export type TenderAddressCreateForm = AddressFormValue & {
    name: string;
};

export const EMPTY_TENDER_ADDRESS_FORM: TenderAddressCreateForm = { name: '', ...EMPTY_ADDRESS };

/**
 * Teklifin "+ musteri ekle" penceresinin formu. Adres yine AYRI BILESENLERDIR —
 * teklif arayuzunde de tek bir "Adres" alani yoktur.
 */
export type TenderCustomerCreateForm = AddressFormValue & {
    companyName: string;
    mainEmail: string;
    mainPhone: string;
};

export const EMPTY_TENDER_CUSTOMER_FORM: TenderCustomerCreateForm = {
    companyName: '',
    mainEmail: '',
    mainPhone: '',
    ...EMPTY_ADDRESS,
};


/**
 * Adres bileşenleri → teklifin adres yuvasında saklanan metin. Sonuç EN FAZLA
 * İKİ SATIRDIR (`utils/address.ts` / `formatAddressLines`): sokak + bina no
 * (+ adres eki) ilk satır, PLZ + şehir (+ eyalet, ülke) ikinci satır. Aynı
 * anlamı taşıyan ikinci bir satır asla yazılmaz; teklif PDF'i bu metni satır
 * satır basar.
 *
 * `name` (kaydın liste etiketi) posta adresinin parçası DEĞİLDİR — yalnızca
 * hiçbir bileşen girilmediğinde yedek olarak kullanılır: adres yuvası boş
 * kalırsa sipariş oluşturma engellenir.
 */
export const formatLocationAddress = (loc: CustomerLocationDto): string => {
    const formatted = formatAddressLines(addressParts(loc)).join('\n');
    return formatted || String(loc.name || '').trim();
};

export const locationOptionLabel = (loc: CustomerLocationDto): string => {
    const place = [loc.postalCode, loc.city].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    return [loc.name, place || String(loc.address || '').trim()].filter(Boolean).join(' · ') || loc.name;
};


export const normalizeAddressText = (value?: string | null) =>
    String(value ?? '').replace(/[\s,]+/g, ' ').trim().toLowerCase();
export const addressesEqual = (a?: string | null, b?: string | null) => {
    const na = normalizeAddressText(a);
    return na.length > 0 && na === normalizeAddressText(b);
};


export const locationKindOf = (loc: CustomerLocationDto): 'INSTALLATION' | 'DELIVERY' | 'BILLING' => {
    const kind = loc.kind ?? 'INSTALLATION';
    if (kind === 'BILLING') return 'BILLING';
    if (kind === 'DELIVERY') return 'DELIVERY';
    return 'INSTALLATION';
};
