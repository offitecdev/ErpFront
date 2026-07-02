import { t } from '@/i18n/translate';
import type { PositionDto } from '../../../../types/tender';
import type { InventoryArticle } from '../../../../types/inventory';
import type { ManualProductForm, ProductSource } from '../types/tenderDetail.types';
import { DEFAULT_VAT } from './tenderDetail.constants';

export const toPlainMarkdown = (value?: string | null) => {
    const lines = String(value || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return '';
    return lines
        .map((line) => line.replace(/^[-•]\s*/, ''))
        .join('\n');
};

export const emptyManualProduct = (name = '', taxRate = DEFAULT_VAT): ManualProductForm => ({
    name,
    quantity: 1,
    unit:t('tenders.stk'),
    unitPrice: 0,
    discount: 0,
    taxRate,
    description: '',
    imageUrl: '',
});

const suggestArticleCode = () => {
    const year = new Date().getFullYear();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    return `ART-${year}-${rand}`;
};

export const emptyStockArticle = (name = ''): Partial<InventoryArticle> => ({
    articleCode: suggestArticleCode(),
    name,
    description: '',
    baseCost: 0,
    salePrice: 0,
    unit:t('tenders.stk'),
    systemBarcode: '',
    supplierBarcode: '',
    imageUrl: '',
    category: '',
    status: 'ACTIVE',
    isActive: true,
    minStockLevel: 10,
    criticalStockLevel: 5,
    maxStockLevel: 100,
    lastPurchaseDate: null,
});

export const getArticleSalePrice = (article?: ProductSource | null, fallback = 0) => {
    const salePrice = Number(article?.salePrice ?? 0);
    if (salePrice > 0) return salePrice;
    const baseCost = Number(article?.baseCost ?? 0);
    return baseCost > 0 ? baseCost : fallback;
};

export const getArticleUnitCost = (article?: ProductSource | null) => {
    const weightedAverageCost = Number(article?.weightedAverageCost ?? 0);
    if (weightedAverageCost > 0) return weightedAverageCost;
    return Math.max(0, Number(article?.baseCost ?? 0));
};

export const getArticleCostSourceLabel = (article?: ProductSource | null) => {
    if (!article) return t('tenders.cost_info_not_found');
    const supplierQty = Number(article.supplierCostQuantity ?? 0);
    const manualQty = Number(article.manualCostQuantity ?? 0);
    const basisQty = Number(article.costBasisQuantity ?? 0);
    if (basisQty > 0 && supplierQty > 0 && manualQty > 0) return t('tenders.agirlikli_average_supply_manual_stock');
    if (basisQty > 0 && supplierQty > 0) return t('tenders.agirlikli_average_supply_kayitlari');
    if (basisQty > 0 && manualQty > 0) return t('tenders.manual_stock_cost');
    return t('tenders.product_karti_cost');
};

export const buildProductDefaults = (
    article?: ProductSource,
    options?: Partial<ManualProductForm>,
    fallbackTaxRate = DEFAULT_VAT,
): Partial<PositionDto> => ({
    sourceArticleId: article?.id ?? null,
    shortDescription: article?.name?.trim() || options?.name ||t('tenders.product'),
    longDescription: toPlainMarkdown(article?.description?.trim() || options?.description),
    quantity: Number(options?.quantity ?? 1),
    unit: article?.unit || options?.unit ||t('tenders.stk'),
    unitPrice: getArticleSalePrice(article, Number(options?.unitPrice ?? 0)),
    discount: Number(options?.discount ?? 0),
    taxRate: Number(options?.taxRate ?? fallbackTaxRate),
    imageUrl: article?.imageUrl || options?.imageUrl || null,
});

export const createTempPositionId = () => `local-position-${Date.now()}-${Math.random().toString(36).slice(2)}`;
