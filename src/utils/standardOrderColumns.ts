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
        stdErp: 'ERP Kodu',
        stdModel: 'Model',
        stdProduct: 'Ürün - Malzeme',
        stdQty: 'Miktar',
        stdUnitPrice: 'Birim Fiyat',
        stdNetPrice: 'Net Fiyat',
        stdAmount: 'Tutar',
        // Üretim şablonu (30.09.2026; adlar 01.10.2026 Samet'in yazdığı gibi)
        stdGroup: 'Malzeme Grubu',
        stdProductCode: 'Ürün kodu',
        // Tedarikçinin kendi numaraları, Depo kartındaki satırından (01.10.2026)
        // 01.10.2026 kısaltıldı (Samet: «Ürün Tip Num. · Ürün Sip Num.»)
        stdArticleNo: 'Ürün Tip Num.',
        stdOrderNo: 'Ürün Sip Num.',
        stdName: 'Malzeme Adı',
        stdUnit: 'Birim',
        stdDiscount: 'İndirim',
        stdLineTotal: 'Satır Fiyatı',
    },
    de: {
        stdErp: 'ERP-Code',
        stdModel: 'Modell',
        stdProduct: 'Produkt - Material',
        stdQty: 'Menge',
        stdUnitPrice: 'Einzelpreis',
        stdNetPrice: 'Nettopreis',
        stdAmount: 'Betrag',
        stdGroup: 'Materialgruppe',
        stdProductCode: 'Produktcode',
        stdArticleNo: 'Produkttyp-Nr.',
        stdOrderNo: 'Bestell-Nr.',
        stdName: 'Materialbezeichnung',
        stdUnit: 'Einheit',
        stdDiscount: 'Rabatt',
        stdLineTotal: 'Betrag',
    },
    en: {
        stdErp: 'ERP code',
        stdModel: 'Model',
        stdProduct: 'Product - Material',
        stdQty: 'Quantity',
        stdUnitPrice: 'Unit Price',
        stdNetPrice: 'Net Price',
        stdAmount: 'Amount',
        stdGroup: 'Material Group',
        stdProductCode: 'Product code',
        stdArticleNo: 'Product Type No.',
        stdOrderNo: 'Product Order No.',
        stdName: 'Material Name',
        stdUnit: 'Unit',
        stdDiscount: 'Discount',
        stdLineTotal: 'Line Price',
    },
};

const TITLES: Record<PurchaseDocLang, string> = {
    tr: 'Standart Şablon',
    de: 'Standardvorlage',
    en: 'Standard template',
};

const fold = (value: unknown): string => String(value ?? '').trim().toLocaleLowerCase('tr-TR');

/**
 * Frühere Schreibweisen, die ältere Belege gespeichert haben — sie gelten
 * weiter als «Standardname» und werden darum übersetzt statt wörtlich gedruckt.
 */
const LEGACY_NAMES: Record<string, string[]> = {
    stdGroup: ['Malzeme grubu', 'Material group'],
    stdName: ['Produktname', 'Ürün adı', 'Product name'],
    stdArticleNo: ['Produkttypnummer', 'Ürün Tip Numarası', 'Artikel-Nr.', 'Ürün No.', 'Item No.'],
    stdOrderNo: ['Bestellnummer', 'Ürün Sip. Numarası', 'Sipariş No.', 'Order No.'],
    stdLineTotal: ['Satır tutarı', 'Line total'],
};

/** Bir standart sütunun üç dildeki yazımı (karşılaştırma için katlanmış). */
const variantsOf = (key: string): Set<string> => new Set([
    ...LANGS.map((lang) => fold(NAMES[lang][key])),
    ...(LEGACY_NAMES[key] ?? []).map(fold),
].filter(Boolean));

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

/**
 * ── ÜRETİM ŞABLONU (Vorgabe Samet, 30.09.2026) ─────────────────────────────
 * «Fiyat talebi: malzeme grubu, ürün kodu (boş olabilir), ürün adı, birim,
 *  miktar. Siparişte: … birim fiyat, indirim, satır tutarı, en altta varsa
 *  KDV.» 01.10.2026 dazu die Artikel- und Bestellnummer DES Lieferanten
 * (`stdArticleNo` / `stdOrderNo`, von seiner Zeile auf der Depo-Karte). Nur die Belege der BOM tragen diese Spalten (Stok bleibt, wie er ist);
 * erkannt an `stdGroup` / `stdName`. Die Einheit steht als Wort in der Zeile
 * (`stdUnit`, «Adet» …) und wird im PDF und auf dem Schirm in die Sprache
 * übersetzt.
 */
export const PRODUCTION_COLUMN_KEYS = [
    'stdGroup', 'stdProductCode', 'stdArticleNo', 'stdOrderNo', 'stdName', 'stdUnit', 'stdDiscount', 'stdLineTotal',
] as const;

export const isProductionColumns = (columns: unknown): boolean =>
    Array.isArray(columns) && columns.some((column) => {
        const key = String((column as { key?: unknown })?.key ?? '');
        return key === 'stdGroup' || key === 'stdName';
    });

/** Die Einheiten der Karte (PCS · M · KG · SET · PACK) in den drei Sprachen. */
const UNIT_WORDS: Record<string, Record<PurchaseDocLang, string>> = {
    PCS: { tr: 'Adet', de: 'Stk', en: 'pcs' },
    M: { tr: 'm', de: 'm', en: 'm' },
    KG: { tr: 'kg', de: 'kg', en: 'kg' },
    SET: { tr: 'Set', de: 'Set', en: 'set' },
    PACK: { tr: 'Paket', de: 'Pack.', en: 'pack' },
};
const UNIT_OF_WORD: Record<string, string> = {
    pcs: 'PCS', pc: 'PCS', adet: 'PCS', stk: 'PCS', 'stk.': 'PCS', stück: 'PCS', stueck: 'PCS', piece: 'PCS', pieces: 'PCS',
    m: 'M', meter: 'M', metre: 'M',
    kg: 'KG',
    set: 'SET', satz: 'SET', takım: 'SET',
    pack: 'PACK', 'pack.': 'PACK', paket: 'PACK', packung: 'PACK',
};

/** «Adet» → «Stk» (de) · «pcs» (en); unbekannt bleibt, wie es ist. */
export const localizeUnitWord = (value: unknown, lang: PurchaseDocLang): string => {
    const text = String(value ?? '').trim();
    const code = UNIT_WORDS[text.toUpperCase()] ? text.toUpperCase() : UNIT_OF_WORD[fold(text)];
    return code ? UNIT_WORDS[code]![lang] : text;
};

/** Die Positionen mit der Einheit in der Sprache des Belegs (nur Zeilen mit `stdUnit`). */
export const localizeProductionCells = <T extends { extras?: Array<{ key: string; value?: unknown }> | null }>(
    items: T[],
    lang: PurchaseDocLang,
): T[] => items.map((item) => (item.extras?.some((entry) => entry?.key === 'stdUnit')
    ? { ...item, extras: item.extras.map((entry) => (entry?.key === 'stdUnit' ? { ...entry, value: localizeUnitWord(entry.value, lang) } : entry)) }
    : item));

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
