import type { BomCategory, BomProduct, BomTemplate, BomTemplateInput, BomUnit } from '@/types/productionBom';

import type { BomTableRow } from '../BomLinesTable';
import { parseQuantityText, quantityToText, tempKey } from '../bomFormat';

/**
 * ── DER ENTWURF EINER BOM-VORLAGE (27.09.2026) ───────────────────────────────
 * Was der Editor hält, bis gespeichert wird: Kopf + Zeilen (Karte, Menge als
 * getippter Text, Einheit, Notiz). Die Anzeige der Karte (Code, Name, Marke …)
 * reist mit, damit neue Zeilen sofort wie im Depo aussehen.
 */

export interface DraftLine {
    key: string;
    productId: string;
    product: BomProduct | null;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    quantityText: string;
    unit: BomUnit;
    note: string | null;
}

export interface TemplateDraft {
    id: string | null;
    name: string;
    category: BomCategory;
    mainCard: string;
    codePrefix: string;
    description: string;
    lines: DraftLine[];
}

export const emptyDraft = (category: BomCategory = 'MACHINE'): TemplateDraft => ({
    id: null,
    name: '',
    category,
    mainCard: '',
    codePrefix: '',
    description: '',
    lines: [],
});

export const draftFromTemplate = (template: BomTemplate): TemplateDraft => ({
    id: template.id,
    name: template.name,
    category: template.category,
    mainCard: template.mainCard,
    codePrefix: template.codePrefix,
    description: template.description ?? '',
    lines: template.lines.map((line) => ({
        key: line.id,
        productId: line.productId,
        product: line.product,
        erpCode: line.erpCode,
        name: line.name,
        brand: line.brand,
        modelNumber: line.modelNumber,
        quantityText: quantityToText(line.quantity),
        unit: line.unit,
        note: line.note,
    })),
});

export const lineFromProduct = (product: BomProduct, quantity = 1): DraftLine => ({
    key: tempKey(),
    productId: product.id,
    product,
    erpCode: product.erpCode,
    name: product.name,
    brand: product.brand,
    modelNumber: product.modelNumber,
    quantityText: quantityToText(quantity),
    // «Her ürünün birim türü … bom listede oraya otomatik gelmesi gerekmektedir» (30.09.2026).
    unit: unitOfCard(product.unit),
    note: null,
});

/** Die Einheit der Karte als Einheit der Zeile — ohne Angabe «Adet». */
const unitOfCard = (unit: string | null | undefined): DraftLine['unit'] =>
    (unit === 'PCS' || unit === 'M' || unit === 'KG' || unit === 'SET' || unit === 'PACK' ? unit : 'PCS');

/** Eine Karte, die schon in der Liste steht, erhöht ihre Menge statt einer zweiten Zeile. */
export const addProduct = (lines: DraftLine[], product: BomProduct): { lines: DraftLine[]; merged: boolean } => {
    const existing = lines.find((line) => line.productId === product.id);
    if (!existing) return { lines: [...lines, lineFromProduct(product)], merged: false };
    const current = parseQuantityText(existing.quantityText);
    return {
        merged: true,
        lines: lines.map((line) => (line === existing
            ? { ...line, quantityText: quantityToText((Number.isFinite(current) ? current : 0) + 1) }
            : line)),
    };
};

/**
 * «Şablonlardan biz direkt satırların altında da ekleme yapabilelim» (27.09.2026):
 * die Zeilen einer Vorlage UNTER die bestehenden. Eine Karte, die schon in der
 * Liste steht, erhöht ihre Menge (wie beim Suchen); die Menge der Vorlage gilt
 * für EIN Gerät und wird mit der Stückzahl der Position malgenommen.
 */
export const insertTemplateLines = (
    lines: DraftLine[],
    template: BomTemplate,
    factor: number,
): { lines: DraftLine[]; added: number; merged: number } => {
    let next = [...lines];
    let added = 0;
    let merged = 0;
    for (const line of template.lines) {
        const quantity = Math.round(line.quantity * (factor > 0 ? factor : 1) * 1000) / 1000;
        const existing = next.find((entry) => entry.productId === line.productId);
        if (existing) {
            const current = parseQuantityText(existing.quantityText);
            next = next.map((entry) => (entry === existing
                ? { ...entry, quantityText: quantityToText((Number.isFinite(current) ? current : 0) + quantity) }
                : entry));
            merged += 1;
        } else {
            next = [...next, {
                key: tempKey(),
                productId: line.productId,
                product: line.product,
                erpCode: line.erpCode,
                name: line.name,
                brand: line.brand,
                modelNumber: line.modelNumber,
                quantityText: quantityToText(quantity),
                unit: line.unit,
                note: line.note,
            }];
            added += 1;
        }
    }
    return { lines: next, added, merged };
};

export const draftInput = (draft: TemplateDraft): BomTemplateInput => ({
    name: draft.name.trim(),
    category: draft.category,
    mainCard: draft.mainCard.trim().toUpperCase(),
    codePrefix: draft.codePrefix.trim().toUpperCase(),
    description: draft.description.trim() || null,
    lines: draft.lines.map((line) => ({
        productId: line.productId,
        quantity: parseQuantityText(line.quantityText),
        unit: line.unit,
        note: line.note,
    })),
});

const fingerprint = (draft: TemplateDraft | null): string => (draft ? JSON.stringify({
    ...draftInput(draft),
    // Leere Eingaben sind noch keine Änderung am Namen.
}) : '');

export const draftDirty = (draft: TemplateDraft | null, saved: BomTemplate | null): boolean => {
    if (!draft) return false;
    if (!saved) return Boolean(draft.name.trim() || draft.mainCard.trim() || draft.codePrefix.trim() || draft.lines.length);
    return fingerprint(draft) !== fingerprint(draftFromTemplate(saved));
};

export const linesValid = (lines: DraftLine[]): boolean =>
    lines.every((line) => {
        const value = parseQuantityText(line.quantityText);
        return Number.isFinite(value) && value > 0;
    });

/** «MAK-COOL-XXXX» → Vorschau der ersten Nummer (MAK-COOL-00001). */
export const prefixPreview = (prefix: string): string => {
    const clean = prefix.trim().toUpperCase().replace(/\s+/g, '-').replace(/-X{3,}$/, '').replace(/-+/g, '-').replace(/^-|-$/g, '');
    return clean ? `${clean}-00001` : '—';
};

export const draftRows = (lines: DraftLine[]): BomTableRow[] => lines.map((line) => ({
    key: line.key,
    productId: line.productId,
    erpCode: line.product?.erpCode ?? line.erpCode,
    name: line.product?.name ?? line.name,
    brand: line.product?.brand ?? line.brand,
    modelNumber: line.product?.modelNumber ?? line.modelNumber,
    description: line.product?.description ?? null,
    supplierName: line.product?.supplierName ?? null,
    serialRequired: Boolean(line.product?.serialRequired),
    stock: line.product ? line.product.quantity : null,
    free: line.product ? line.product.free : null,
    minimum: line.product?.minimumOrderQuantity ?? null,
    quantityText: line.quantityText,
    quantity: parseQuantityText(line.quantityText) || 0,
    consumed: 0,
    unit: line.unit,
    note: line.note,
    missingProduct: !line.product,
}));
