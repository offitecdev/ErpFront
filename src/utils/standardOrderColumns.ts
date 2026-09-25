/**
 * ── STANDART ŞABLON, ÜÇ DİLDE (Vorgabe Samet, 24.09.2026) ──────────────────
 *
 * «Varsayılan sipariş şablonumuz, 3 dilde de: ÜRÜN - MALZEME / MİKTAR /
 *  BİRİM FİYAT / NET FİYAT / TUTAR; fiyat talebi: ÜRÜN - MALZEME / MİKTAR.»
 * «Standart şablon Türkçe, İngilizce ve Almanca seçeneklerine göre değişmeli.»
 *
 * Sunucu her şirkete bu şablonu kendisi kurar (`shared/standardOrderTemplate.ts`,
 * anahtarlar `std…`). Şablonun ADI ve sütun BAŞLIKLARI seçili dile göre okunur:
 * ekranda arayüz dili, PDF'te belgenin dili. Böylece aynı sipariş Türkçe
 * ekranda «Ürün - Malzeme», Almanca PDF'te «Produkt - Material» yazar.
 *
 * Kural: kayıtta duran ad bu tablodaki ÜÇ yazımdan biriyse (ya da boşsa) dile
 * çevrilir; kullanıcı sütunu ya da şablonu KENDİ adıyla yeniden adlandırdıysa
 * o ad her dilde aynen kalır.
 */
import type { PurchaseDocLang } from './purchaseCode';

const LANGS: PurchaseDocLang[] = ['tr', 'de', 'en'];

const NAMES: Record<PurchaseDocLang, Record<string, string>> = {
    tr: {
        stdProduct: 'Ürün - Malzeme',
        stdQty: 'Miktar',
        stdUnitPrice: 'Birim Fiyat',
        stdNetPrice: 'Net Fiyat',
        stdAmount: 'Tutar',
    },
    de: {
        stdProduct: 'Produkt - Material',
        stdQty: 'Menge',
        stdUnitPrice: 'Einzelpreis',
        stdNetPrice: 'Nettopreis',
        stdAmount: 'Betrag',
    },
    en: {
        stdProduct: 'Product - Material',
        stdQty: 'Quantity',
        stdUnitPrice: 'Unit Price',
        stdNetPrice: 'Net Price',
        stdAmount: 'Amount',
    },
};

const TITLES: Record<PurchaseDocLang, string> = {
    tr: 'Standart Şablon',
    de: 'Standardvorlage',
    en: 'Standard template',
};

const fold = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase('tr-TR');

/** Bir standart sütunun üç dildeki yazımı (karşılaştırma için katlanmış). */
const variantsOf = (key: string): Set<string> => new Set(LANGS.map((lang) => fold(NAMES[lang][key])).filter(Boolean));

/** Sunucunun kurduğu ad («Standard») ve üç dildeki başlık. */
const TITLE_VARIANTS = new Set(['standard', ...LANGS.map((lang) => fold(TITLES[lang]))]);

/** Standart sütunun o dildeki adı; standart değilse `null`. */
export const standardColumnName = (key: unknown, lang: PurchaseDocLang): string | null =>
    NAMES[lang]?.[String(key ?? '')] ?? null;

/**
 * Gösterilecek sütun adı: standart sütun hâlâ standart adını taşıyorsa seçili
 * dilde, kullanıcı yeniden adlandırdıysa onun adı.
 */
export const displayColumnName = (key: unknown, storedName: unknown, lang: PurchaseDocLang): string => {
    const stored = String(storedName ?? '').trim();
    const localized = standardColumnName(key, lang);
    if (!localized) return stored;
    return !stored || variantsOf(String(key)).has(fold(stored)) ? localized : stored;
};

/** Bir sütun listesi standart şablonun mu? (`stdProduct` anahtarından tanınır) */
export const isStandardColumns = (columns: unknown): boolean =>
    Array.isArray(columns) && columns.some((column) => String((column as { key?: unknown })?.key ?? '') === 'stdProduct');

/** Şablonun gösterilecek adı: standart şablonun adı seçili dilde. */
export const displayTemplateTitle = (title: unknown, columns: unknown, lang: PurchaseDocLang): string => {
    const stored = String(title ?? '').trim();
    if (!isStandardColumns(columns)) return stored;
    return !stored || TITLE_VARIANTS.has(fold(stored)) ? TITLES[lang] : stored;
};

/**
 * Bir şablonu seçili dile çevirir (adı + standart sütun başlıkları). Standart
 * olmayan şablon olduğu gibi döner. Aynı şablona iki kez uygulanabilir.
 */
export const localizeStandardTemplate = <T extends { title: string; config: { columns: Array<{ key: string; name: string }> } }>(
    template: T,
    lang: PurchaseDocLang,
): T => {
    const columns = template.config?.columns ?? [];
    if (!isStandardColumns(columns)) return template;
    return {
        ...template,
        title: displayTemplateTitle(template.title, columns, lang),
        config: {
            ...template.config,
            columns: columns.map((column) => ({ ...column, name: displayColumnName(column.key, column.name, lang) })),
        },
    };
};
