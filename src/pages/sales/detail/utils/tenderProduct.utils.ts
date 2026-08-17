import { t } from '@/i18n/translate';
import type { PositionDto } from '../../../../types/tender';
import type { ManualProductForm, ProductSource } from '../types/tenderDetail.types';
import { DEFAULT_VAT } from './tenderDetail.constants';

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
    longDescription: article?.description?.trim() || options?.description || '',
    quantity: Number(options?.quantity ?? 1),
    unit: article?.unit || options?.unit ||t('tenders.stk'),
    unitPrice: getArticleSalePrice(article, Number(options?.unitPrice ?? 0)),
    discount: Number(options?.discount ?? 0),
    taxRate: Number(options?.taxRate ?? fallbackTaxRate),
    imageUrl: article?.imageUrl || options?.imageUrl || null,
});

export const createTempPositionId = () => `local-position-${Date.now()}-${Math.random().toString(36).slice(2)}`;

/**
 * The offer's closing images are stored as a JSON array of data URIs in one
 * LONGTEXT column. Parsing is tolerant: a legacy single URI, malformed JSON or
 * a null all resolve to an empty list rather than breaking the panel.
 */
export const parseClosingImages = (raw?: string | null): string[] => {
    if (!raw) return [];
    try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((item) => String(item)).filter(Boolean);
    } catch {
        // Not JSON — treat a bare data URI as a single image.
        if (raw.startsWith('data:')) return [raw];
    }
    return [];
};
