// Excel başlıklarını hedef alanlara eşlemek için bulanık ad benzerliği.
// Türkçe karakterler katlanır (ş→s, ı→i…), Dice bigram benzerliği kullanılır.

import type { ColumnMapping, ImportField } from '../types';

const TR_FOLD: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };

export const normalizeHeader = (value: string): string =>
    value
        .toLocaleLowerCase('tr')
        .replace(/[çğıöşü]/g, (ch) => TR_FOLD[ch] ?? ch)
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();

const bigrams = (value: string): Map<string, number> => {
    const grams = new Map<string, number>();
    const compact = value.replace(/\s+/g, ' ');
    for (let i = 0; i < compact.length - 1; i += 1) {
        const gram = compact.slice(i, i + 2);
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
    }
    return grams;
};

/** Dice katsayısı: 0..1 — 1 birebir aynı. */
export const similarity = (a: string, b: string): number => {
    const left = normalizeHeader(a);
    const right = normalizeHeader(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return 0.9;
    const leftGrams = bigrams(left);
    const rightGrams = bigrams(right);
    let overlap = 0;
    let leftTotal = 0;
    let rightTotal = 0;
    leftGrams.forEach((count) => { leftTotal += count; });
    rightGrams.forEach((count) => { rightTotal += count; });
    leftGrams.forEach((count, gram) => {
        const other = rightGrams.get(gram);
        if (other) overlap += Math.min(count, other);
    });
    if (!leftTotal || !rightTotal) return 0;
    return (2 * overlap) / (leftTotal + rightTotal);
};

/** Her alan için eş anlamlı aday adlar — öneri puanını yükseltir. */
const FIELD_SYNONYMS: Record<string, string[]> = {
    articleCode: ['ürün kodu', 'stok kodu', 'seri kod', 'kod', 'code', 'article code', 'sku', 'artikelnummer', 'serial'],
    // 'ürün / malzeme' üç dilde de eklenmiştir: sipariş dışa aktarımının İLK
    // sütunu bu başlığı taşır ve `name` bir ANAHTAR alan olduğu için eşleşmezse
    // geri içe aktarmada satırlar tanınmaz kalırdı.
    name: ['ürün adı', 'ad', 'isim', 'name', 'product name', 'bezeichnung', 'artikel',
        'ürün / malzeme', 'ürün malzeme', 'product / material', 'produkt / material', 'malzeme', 'material'],
    salePrice: ['satış fiyatı', 'satis fiyati', 'fiyat', 'sale price', 'price', 'verkaufspreis', 'vk'],
    purchasePrice: ['alış fiyatı', 'alis fiyati', 'maliyet', 'birim maliyet', 'purchase price', 'cost', 'einkaufspreis', 'ek'],
    quantity: ['miktar', 'adet', 'stok', 'quantity', 'qty', 'menge', 'anzahl'],
    supplierName: ['tedarikçi', 'tedarikci', 'firma', 'supplier', 'vendor', 'lieferant'],
    unit: ['birim', 'unit', 'einheit'],
    description: ['açıklama', 'aciklama', 'not', 'description', 'bemerkung'],
    // 'net fiyat' burada da geçerlidir: sipariş dışa aktarımı stok içe
    // aktarımına verildiğinde "Net Fiyat" sütunu birim maliyete eşlenir.
    unitCost: ['birim maliyet', 'maliyet', 'alış fiyatı', 'unit cost', 'cost', 'einkaufspreis', 'net fiyat', 'net price', 'nettopreis'],
    // Sipariş içe aktarımına özgü alanlar. Yüzde sütunlarında başlıklar sık sık
    // "(%)" taşır — `normalizeHeader` noktalama işaretlerini attığı için eşleşme
    // bozulmaz. Numaralı indirimler ("indirim 2") birebir eşleştiği için ana
    // indirimden daha yüksek puan alır ve sütunlar karışmaz.
    // Seri no HEDEF ALAN DEĞİLDİR (şablonda sütunu yok) — eş anlamlıları da
    // tutulmaz; ürünün kimliği `articleCode` (seri kod).
    grossPrice: ['brüt fiyat', 'brut fiyat', 'liste fiyatı', 'gross price', 'list price', 'bruttopreis', 'listenpreis'],
    netPrice: ['net fiyat', 'net price', 'nettopreis', 'birim fiyat', 'unit price'],
    discount: ['indirim', 'iskonto', 'discount', 'rabatt'],
    discount2: ['indirim 2', 'iskonto 2', 'discount 2', 'rabatt 2', 'ek indirim'],
    discount3: ['indirim 3', 'iskonto 3', 'discount 3', 'rabatt 3'],
    vatRate: ['kdv', 'kdv oranı', 'vat', 'vat rate', 'mwst', 'mehrwertsteuer', 'tax'],
};

/** Bir alan için tek başlığın puanı: alan etiketi + eş anlamlıların en iyisi. */
export const scoreHeader = (field: ImportField, header: string): number => {
    const candidates = [field.label, field.key, ...(FIELD_SYNONYMS[field.key] ?? [])];
    return candidates.reduce((best, candidate) => Math.max(best, similarity(candidate, header)), 0);
};

export interface HeaderSuggestion {
    headerIndex: number;
    header: string;
    score: number;
}

/** Alan başına en iyi 3 başlık önerisi (puana göre, 0.35 altı elenir). */
export const suggestForField = (field: ImportField, headers: string[]): HeaderSuggestion[] =>
    headers
        .map((header, headerIndex) => ({ headerIndex, header, score: scoreHeader(field, header) }))
        .filter((entry) => entry.score >= 0.35)
        .sort((a, b) => b.score - a.score)
        .slice(0, 3);

/**
 * Otomatik eşleme: her alan için en yüksek puanlı başlık (0.55 eşiği), bir başlık
 * yalnızca bir alana verilir (yüksek puanlı alan kazanır).
 */
export const autoMap = (fields: ImportField[], headers: string[]): ColumnMapping => {
    const scored: Array<{ fieldKey: string; headerIndex: number; score: number }> = [];
    fields.forEach((field) => {
        headers.forEach((header, headerIndex) => {
            const score = scoreHeader(field, header);
            if (score >= 0.55) scored.push({ fieldKey: field.key, headerIndex, score });
        });
    });
    scored.sort((a, b) => b.score - a.score);

    const mapping: ColumnMapping = {};
    fields.forEach((field) => { mapping[field.key] = -1; });
    const usedHeaders = new Set<number>();
    scored.forEach(({ fieldKey, headerIndex }) => {
        if (mapping[fieldKey] !== -1 || usedHeaders.has(headerIndex)) return;
        mapping[fieldKey] = headerIndex;
        usedHeaders.add(headerIndex);
    });
    return mapping;
};
