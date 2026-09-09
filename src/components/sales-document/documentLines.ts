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
export const documentLineAmount = (line: DocumentLine) => documentRound(applyDiscounts(documentLineBase(line), line.discounts).remaining);
export const documentLineStarted = (line: DocumentLine) => Boolean(line.description.trim() || line.longDescription.trim() || line.articleId || line.unitPrice || line.quantity !== '1' || line.discounts.length);
export const documentLineValid = (line: DocumentLine) => Boolean(line.description.trim())
    && Number.isFinite(documentNumber(line.quantity)) && documentNumber(line.quantity) > 0
    && line.unitPrice.trim() !== '' && Number.isFinite(documentNumber(line.unitPrice)) && documentNumber(line.unitPrice) >= 0;

/** Use the proposal's catalogue defaults so descriptions, units and price fallback agree. */
export const documentArticlePatch = (article: ArticleQuickPick): Partial<DocumentLine> => {
    const defaults = buildProductDefaults(article);
    return {
        articleId: article.id, description: defaults.shortDescription || article.name,
        longDescription: defaults.longDescription || '', unit: defaults.unit || '',
        quantity: String(defaults.quantity ?? 1), unitPrice: String(defaults.unitPrice ?? 0),
    };
};
