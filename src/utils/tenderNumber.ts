import i18n from '@/i18n';

// Dile özgü teklif ön eki: A(ngebot), O(ffer), T(eklif).
export const OFFER_PREFIX: Record<string, string> = { de: 'A', en: 'O', tr: 'T' };

// Dile özgü sipariş/Auftrag ön eki: AUF(trag) / ORD(er) / SIP(ariş).
// Sipariş numarası veritabanında tek bir ön ekle (AUF-…) saklanır; ekranda
// arayüz diline göre yeniden yazılır — kayıt değişmez.
export const ORDER_PREFIX: Record<string, string> = { de: 'AUF', en: 'ORD', tr: 'SIP' };

// Tanınan tüm sipariş ön ekleri (SPR eski derlemelerden kalma). Yalnızca
// arkasından bir teklif numarası (A-2026-1 gibi) gelen ön ekler çevrilir ki
// serbest metindeki başka kısaltmalara dokunulmasın.
const ORDER_PREFIX_ALTS = 'AUF|ORD|SIP|SPR';
const ORDER_PREFIX_IN_TEXT = new RegExp(`\\b(?:${ORDER_PREFIX_ALTS})-(?=(?:TKF|A|O|T)-\\d{4}-\\d+\\b)`, 'gi');

/**
 * Kayıtlı teklif numarasının harf ön ekini (T-, TKF-, A-, …) verilen dilin
 * teklif ön ekine çevirir; dil verilmezse aktif arayüz dili kullanılır.
 * Böylece aynı kayıt Almanca arayüzde "A-2026-7764", İngilizcede
 * "O-2026-7764" olarak okunur — veritabanındaki değer değişmez.
 */
export function localizeTenderNumber(tenderNumber: string, lang?: string): string {
    const base = (lang || i18n.language || 'de').split('-')[0];
    const prefix = OFFER_PREFIX[base] ?? 'A';
    return tenderNumber.replace(/^[A-Za-z]+(?=-)/, prefix);
}

// Bilinen teklif ön ekleri (tarihsel TKF dahil). Yalnızca bunlar değiştirilir
// ki serbest metindeki başka "XYZ-2026-1" benzeri kodlara dokunulmasın.
const TENDER_NUMBER_IN_TEXT = /\b(?:TKF|A|O|T)-(\d{4}-\d+)\b/g;

/**
 * Serbest bir etiketin İÇİNDE geçen teklif numaralarını aktif dilin ön ekiyle
 * yeniden yazar — örn. proje adı "TKF-2026-3684 - Kurulum Projesi" Almanca
 * arayüzde "A-2026-3684 - Kurulum Projesi" olarak görünür. Kayıt değişmez.
 */
export function localizeTenderNumbersInText(text: string, lang?: string): string {
    const base = (lang || i18n.language || 'de').split('-')[0];
    const prefix = OFFER_PREFIX[base] ?? 'A';
    const orderPrefix = ORDER_PREFIX[base] ?? 'AUF';
    // Önce sipariş ön ekini (AUF-/ORD-/SIP-/SPR-), sonra içteki teklif harfini çevir.
    return text
        .replace(ORDER_PREFIX_IN_TEXT, `${orderPrefix}-`)
        .replace(TENDER_NUMBER_IN_TEXT, `${prefix}-$1`);
}
