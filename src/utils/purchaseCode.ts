/**
 * SATIN ALMA BELGE KODU — BACKEND'İN İKİZİ.
 *
 * Eş: `Erp_Backend/src/shared/purchaseDocumentCode.ts` — önek tablosu İKİSİNDE
 * BİRDEN değişmelidir, yoksa ekran bir kodu, depo başkasını söyler.
 *
 *              tr            de             en
 *   Fiyat talebi   FT-2026-001   PA-2026-001   PR-2026-001
 *   Sipariş        SP-2026-004   BE-2026-004   PO-2026-004
 *
 * Kayıtta hep ALMANCA yazım durur (`PA-` / `BE-`); burada yalnızca GÖSTERİM
 * için önek değiştirilir — yıl ve sıra asla değişmez. Bu yüzden ekranda
 * gördüğü kodu elle yazan kullanıcı da kaydı bulur: sunucu aramada öneki atar.
 *
 * ⚠ Bu kural YALNIZ satın alma belgelerine (fiyat talebi + tedarikçi siparişi)
 * aittir. Satış belgeleri (AN/PR/AB/NT/RE) HER DİLDE AYNIDIR — onların kodunu
 * asla çevirme. Buradaki `PR` de İngilizce FİYAT TALEBİ'dir, satıştaki `PR`
 * ise PROJE.
 */

export type PurchaseDocKind = 'PRICE_REQUEST' | 'ORDER';
export type PurchaseDocLang = 'tr' | 'de' | 'en';

export const PURCHASE_DOC_PREFIX: Record<PurchaseDocKind, Record<PurchaseDocLang, string>> = {
    PRICE_REQUEST: { tr: 'FT', de: 'PA', en: 'PR' },
    ORDER: { tr: 'SP', de: 'BE', en: 'PO' },
};

/** Görülebilecek her yazım — eski `AU-` kayıtları da sipariştir. */
const PREFIX_KIND: Record<string, PurchaseDocKind> = {
    FT: 'PRICE_REQUEST', PA: 'PRICE_REQUEST', PR: 'PRICE_REQUEST',
    SP: 'ORDER', BE: 'ORDER', PO: 'ORDER', AU: 'ORDER',
};

const CODE_RE = /^([A-Za-z]{2})-(\d{4})-(\d+)(.*)$/;

export interface ParsedPurchaseCode {
    kind: PurchaseDocKind;
    prefix: string;
    year: number;
    seq: number;
}

export const parsePurchaseCode = (value: unknown): ParsedPurchaseCode | null => {
    const code = String(value ?? '').trim();
    const match = CODE_RE.exec(code);
    if (!match) return null;
    const prefix = (match[1] ?? '').toUpperCase();
    const kind = PREFIX_KIND[prefix];
    if (!kind) return null;
    return { kind, prefix, year: Number(match[2]), seq: Number(match[3]) };
};

/** Arayüz dilini belge diline indirger (`de-CH` → `de`); tanımsızsa Almanca. */
export const purchaseLangOf = (language: unknown): PurchaseDocLang => {
    const lang = String(language ?? '').slice(0, 2).toLowerCase();
    return lang === 'tr' || lang === 'en' ? lang : 'de';
};

/**
 * `BE-2026-004` → Türkçe `SP-2026-004`. Elle girilmiş tanınmayan kodlar
 * olduğu gibi döner — kullanıcının yazdığı şey onun kodudur.
 */
export const localizePurchaseCode = (value: unknown, lang: PurchaseDocLang): string => {
    const code = String(value ?? '').trim();
    const parsed = parsePurchaseCode(code);
    if (!parsed) return code;
    return `${PURCHASE_DOC_PREFIX[parsed.kind][lang]}-${code.slice(parsed.prefix.length + 1)}`;
};
