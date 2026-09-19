import type { ArticleQuickPick } from '@/types/inventory';
import { buildProductDefaults } from '@/pages/sales/detail/utils/tenderProduct.utils';
import { applyDiscounts, type TenderDiscountEntry } from '@/pages/sales/detail/utils/tenderDiscounts.utils';

export interface DocumentLine {
    key: string;
    id?: string;
    articleId: string | null;
    description: string;
    longDescription: string;
    unit: string;
    quantity: string;
    unitPrice: string;
    discounts: TenderDiscountEntry[];
}

export const emptyDocumentLine = (): DocumentLine => ({
    key: crypto.randomUUID(), articleId: null, description: '', longDescription: '',
    unit: '', quantity: '1', unitPrice: '', discounts: [],
});
export const documentNumber = (value: string) => Number(value.replace(',', '.'));
export const documentRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export const documentLineBase = (line: DocumentLine) => documentRound((documentNumber(line.quantity) || 0) * (documentNumber(line.unitPrice) || 0));

/**
 * Nachlässe mit Vorzeichen (16.09.2026) — `applyDiscounts` kennt nur Beträge
 * ≥ 0 und machte aus einer Minderung still 0. Ein Minusbetrag wird über seinen
 * Betrag rabattiert und behält sein Vorzeichen (wie der Server,
 * `signedAfterDiscounts`).
 */
export const signedDiscounts = (base: number, list: TenderDiscountEntry[]) => {
    if (base >= 0) return applyDiscounts(base, list);
    const positive = applyDiscounts(-base, list);
    return {
        ...positive,
        remaining: -positive.remaining,
        applied: positive.applied.map((entry) => ({ ...entry, base: -entry.base, amount: -entry.amount, remaining: -entry.remaining })),
    };
};

export const documentLineAmount = (line: DocumentLine) => documentRound(signedDiscounts(documentLineBase(line), line.discounts).remaining);
/** Eine Minuszeile — das fällt im Nachtrag weg (Minderung). */
export const documentLineIsMinus = (line: DocumentLine) => documentNumber(line.quantity) < 0;
export const documentLineStarted = (line: DocumentLine) => Boolean(line.description.trim() || line.longDescription.trim() || line.articleId || line.unitPrice || line.quantity !== '1' || line.discounts.length);
const lineValid = (line: DocumentLine, allowMinus: boolean) => Boolean(line.description.trim())
    && Number.isFinite(documentNumber(line.quantity))
    && (allowMinus ? documentNumber(line.quantity) !== 0 : documentNumber(line.quantity) > 0)
    && line.unitPrice.trim() !== '' && Number.isFinite(documentNumber(line.unitPrice)) && documentNumber(line.unitPrice) >= 0;
/** Eine vollständige Zeile — Menge > 0 (Rechnung). Einargumentig, damit `.every(documentLineValid)` sicher bleibt. */
export const documentLineValid = (line: DocumentLine) => lineValid(line, false);
/** Dasselbe für den Nachtrag: auch eine Minusmenge (Minderung) ist gültig, nur 0 nicht. */
export const documentLineValidAllowMinus = (line: DocumentLine) => lineValid(line, true);

/** Use the proposal's catalogue defaults so descriptions, units and price fallback agree. */
export const documentArticlePatch = (article: ArticleQuickPick): Partial<DocumentLine> => {
    const defaults = buildProductDefaults(article);
    return {
        articleId: article.id, description: defaults.shortDescription || article.name,
        longDescription: defaults.longDescription || '', unit: defaults.unit || '',
        quantity: String(defaults.quantity ?? 1), unitPrice: String(defaults.unitPrice ?? 0),
    };
};
