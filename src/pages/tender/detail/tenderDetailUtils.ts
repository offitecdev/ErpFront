import { useTenderStore } from '../../../store/tenderStore';
import type { CalculationItemDto, PositionArticleMappingDto, PositionMaterialMappingDto, PositionDto } from '../../../types/tender';

import { t } from '@/i18n/translate';

import {
    applyDiscounts,
    discountDisplayName,
    lineDiscountBase,
    MAX_LINE_DISCOUNTS,
    parseDiscountList,
} from './utils/tenderDiscounts.utils';

export const STATUS_VARIANT: Record<string, 'passive' | 'warning' | 'approved' | 'info'> = {
    Draft: 'passive',
    Approved: 'approved',
    Exported: 'info',
};

export const getStatusLabel = (): Record<string, string> => ({
    Draft:t('crm.tenders.statusDraft'),
    Approved:t('crm.tenders.statusApproved'),
    Exported:t('crm.tenders.statusExported'),
});

// Currency/number formatters were relocated to `utils/formatters.ts`; re-exported
// here so existing `./tenderDetailUtils` importers keep working unchanged.
export { fmtMoney, fmtNumber, fmtVatRate } from './utils/formatters';

export interface TreeNode extends PositionDto {
    isArticleMapping?: boolean;
    mappingId?: string;
    articleId?: string;
    materialId?: string;
    children: TreeNode[];
    totalWithChildren: number;
}

const rowTypeOf = (value?: string | null) => (value || 'SECTION').toUpperCase();

export const FIXED_VAT = 8.1;

export const lineTotalWithTax = (amount: number, taxRate?: number | null) =>
    amount * (1 + ((taxRate != null && taxRate > 0 ? taxRate : FIXED_VAT) / 100));

export const buildTree = (positions: PositionDto[], fallbackTaxRate = 8.1): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    positions.forEach((p) => {
        const node: TreeNode = {
            ...p,
            rowType: rowTypeOf(p.rowType),
            taxRate: (p.taxRate != null && p.taxRate > 0) ? p.taxRate : fallbackTaxRate,
            children: [],
            totalWithChildren: 0
        };
        if (p.articleMappings && p.articleMappings.length > 0) {
            p.articleMappings.forEach((m, i) => {
                const articleNode: TreeNode = {
                    ...p,
                    id: m.id,
                    rowType: 'PRODUCT',
                    sourceArticleId: m.articleId,
                    displayOrder: (p.displayOrder ?? 0) + i + 1,
                    isArticleMapping: true,
                    mappingId: m.id,
                    articleId: m.articleId,
                    positionNumber: `${p.positionNumber}.M${i + 1}`,
                    shortDescription: m.article?.name ||t('tenders.product'),
                    longDescription: m.article?.description || null,
                    quantity: m.quantityMultiplier,
                    unit: m.article?.unit || 'adet',
                    unitPrice: m.article?.salePrice || m.article?.baseCost || 0,
                    discount: m.discount || 0,
                    taxRate: (p.taxRate != null && p.taxRate > 0) ? p.taxRate : fallbackTaxRate,
                    imageUrl: m.article?.imageUrl || null,
                    parentPositionId: p.id,
                    hierarchyLevel: p.hierarchyLevel + 1,
                    articleMappings: [],
                    materialMappings: [],
                    children: [],
                    totalWithChildren: 0,
                    calculation: null,
                };
                node.children.push(articleNode);
            });
        }
        map.set(p.id, node);
    });

    const roots: TreeNode[] = [];
    map.forEach((node) => {
        if (!node.isArticleMapping) {
            const parent = node.parentPositionId ? map.get(node.parentPositionId) : null;
            if (parent) parent.children.push(node);
            else roots.push(node);
        }
    });

    const compute = (n: TreeNode): number => {
        const qty = n.quantity || 0;
        const price = n.unitPrice ?? null;
        const disc = n.discount ?? 0;

        let self = 0;
        if (n.isArticleMapping) {
            const net = qty * (price || 0) * (1 - disc / 100);
            self = lineTotalWithTax(net, n.taxRate);
        } else {
            const additionalCost = n.calculation?.additionalCost ?? 0;
            const billableCalculationTotal = n.calculation
                ? Math.max(0, n.calculation.totalCalculatedPrice ?? 0)
                : 0;
            const net = price != null && price > 0 && qty > 0
                ? (qty * price * (1 - disc / 100)) + additionalCost
                : billableCalculationTotal;
            self = lineTotalWithTax(net, n.taxRate ?? fallbackTaxRate);
        }

        n.children.forEach(compute);
        const childSum = n.children.reduce((s, c) => s + c.totalWithChildren, 0);
        n.totalWithChildren = self + childSum;
        return n.totalWithChildren;
    };
    roots.forEach(compute);

    const sortRec = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => {
            const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
            const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
            if (orderA !== orderB) return orderA - orderB;
            return a.positionNumber.localeCompare(b.positionNumber, undefined, { numeric: true });
        });
        nodes.forEach((n) => sortRec(n.children));
    };
    sortRec(roots);
    return roots;
};

export type ArticleMappingUpdateResult = {
    mapping?: PositionArticleMappingDto;
    updatedCalculation?: CalculationItemDto | null;
};

export const mergeArticleMappingUpdate = (
    positionId: string,
    mappingId: string,
    result: ArticleMappingUpdateResult,
    fallbackPatch: Partial<PositionArticleMappingDto> = {}
) => {
    useTenderStore.setState((state) => ({
        detail: state.detail
            ? {
                ...state.detail,
                positions: state.detail.positions.map((p) => {
                    if (p.id !== positionId) return p;
                    return {
                        ...p,
                        calculation: result.updatedCalculation !== undefined ? result.updatedCalculation : p.calculation,
                        articleMappings: p.articleMappings?.map((m) => {
                            if (m.id !== mappingId) return m;
                            const incoming = result.mapping;
                            return {
                                ...m,
                                ...fallbackPatch,
                                ...(incoming ?? {}),
                                article: incoming?.article
                                    ? { ...(m.article ?? {}), ...incoming.article }
                                    : m.article,
                            };
                        }),
                    };
                }),
            }
            : state.detail,
    }));
};

export type MaterialMappingUpdateResult = {
    mapping?: PositionMaterialMappingDto;
    updatedCalculation?: CalculationItemDto | null;
};

export const mergeMaterialMappingUpdate = (
    positionId: string,
    mappingId: string,
    result: MaterialMappingUpdateResult,
    fallbackPatch: Partial<PositionMaterialMappingDto> = {}
) => {
    useTenderStore.setState((state) => ({
        detail: state.detail
            ? {
                ...state.detail,
                positions: state.detail.positions.map((p) => {
                    if (p.id !== positionId) return p;
                    return {
                        ...p,
                        calculation: result.updatedCalculation !== undefined ? result.updatedCalculation : p.calculation,
                        materialMappings: p.materialMappings?.map((m) => {
                            if (m.id !== mappingId) return m;
                            const incoming = result.mapping;
                            return {
                                ...m,
                                ...fallbackPatch,
                                ...(incoming ?? {}),
                                material: incoming?.material
                                    ? { ...(m.material ?? {}), ...incoming.material }
                                    : m.material,
                            };
                        }),
                    };
                }),
            }
            : state.detail,
    }));
};

export const mergeMaterialMappingRemoval = (
    positionId: string,
    mappingId: string,
    updatedCalculation?: CalculationItemDto | null
) => {
    useTenderStore.setState((state) => ({
        detail: state.detail
            ? {
                ...state.detail,
                positions: state.detail.positions.map((p) =>
                    p.id === positionId
                        ? {
                            ...p,
                            calculation: updatedCalculation !== undefined ? updatedCalculation : p.calculation,
                            materialMappings: p.materialMappings?.filter((m) => m.id !== mappingId),
                        }
                        : p
                ),
            }
            : state.detail,
    }));
};

export const mergePositionUpdate = (positionId: string, updated: Partial<PositionDto>) => {
    useTenderStore.setState((state) => ({
        detail: state.detail
            ? {
                ...state.detail,
                positions: state.detail.positions.map((p) =>
                    p.id === positionId
                        ? {
                            ...p,
                            ...updated,
                            calculation: updated.calculation ?? p.calculation,
                            articleMappings: updated.articleMappings ?? p.articleMappings,
                        }
                        : p
                ),
            }
            : state.detail,
    }));
};

export const mergeArticleMappingRemoval = (
    positionId: string,
    mappingId: string,
    updatedCalculation?: CalculationItemDto | null
) => {
    useTenderStore.setState((state) => ({
        detail: state.detail
            ? {
                ...state.detail,
                positions: state.detail.positions.map((p) =>
                    p.id === positionId
                        ? {
                            ...p,
                            calculation: updatedCalculation !== undefined ? updatedCalculation : p.calculation,
                            articleMappings: p.articleMappings?.filter((m) => m.id !== mappingId),
                        }
                        : p
                ),
            }
            : state.detail,
    }));
};

export const flattenTree = (nodes: TreeNode[]): TreeNode[] =>
    nodes.flatMap((node) => [node, ...flattenTree(node.children)]);

export const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const ownLineNet = (n: TreeNode) => {
    const rowType = (n.rowType || '').toUpperCase();
    if (rowType === 'SECTION' || rowType === 'TITLE' || rowType === 'DESCRIPTION') return 0;

    const qty = Number(n.quantity || 0);
    const price = n.unitPrice ?? null;
    const disc = n.discount ?? 0;
    if (price != null && price > 0 && qty > 0) {
        return qty * price * (1 - disc / 100) + (n.calculation?.additionalCost ?? 0);
    }
    return Math.max(0, n.calculation?.totalCalculatedPrice ?? 0);
};

/**
 * The line's stacked discounts resolved against their running base, in the
 * order they apply. The PDF prints one per line in the discount column — the
 * rates that were actually negotiated, not their combined equivalent.
 */
const pdfLineDiscounts = (node: TreeNode) => {
    const entries = parseDiscountList(node.discounts, MAX_LINE_DISCOUNTS);
    if (entries.length === 0) return undefined;
    const { applied } = applyDiscounts(lineDiscountBase(node), entries);
    const rows = applied
        .filter((entry) => entry.amount > 0)
        .map((entry, index) => ({
            name: discountDisplayName(entry, index),
            kind: entry.kind,
            percent: entry.percent,
            amount: entry.amount,
        }));
    return rows.length > 0 ? rows : undefined;
};

export const flattenTenderTreeForPdf = (tree: TreeNode[]) => {
    const flatTree: any[] = [];
    let rootIndex = 0;
    let activeTitleIndex: number | null = null;
    let childIndex = 0;

    const nextDisplayLabel = (n: TreeNode) => {
        const rowType = (n.rowType || '').toUpperCase();
        if (rowType === 'DESCRIPTION') return '';
        if (rowType === 'SECTION' || rowType === 'TITLE') {
            rootIndex += 1;
            activeTitleIndex = rootIndex;
            childIndex = 0;
            return String(rootIndex);
        }
        if (activeTitleIndex == null) {
            rootIndex += 1;
            return String(rootIndex);
        }
        childIndex += 1;
        return `${activeTitleIndex}.${childIndex}`;
    };

    const flatten = (nodes: TreeNode[], isRootLevel = false) => {
        nodes.forEach((n) => {
            const ownNet = ownLineNet(n);
            const hasOwnAmount = ownNet > 0;
            const effectiveTaxRate = n.taxRate ?? FIXED_VAT;
            const displayLabel = nextDisplayLabel(n);
            flatTree.push({
                rowKey: n.id,
                // The bare position id, kept next to `rowKey` because subtotal
                // rows below get a synthetic `rowKey` that is NOT a position id.
                // The PDF image fetch looks rows up by this id.
                id: n.id,
                sourceArticleId: (n as any).sourceArticleId ?? null,
                shortDescription: displayLabel ? `${displayLabel} ${n.shortDescription}` : n.shortDescription,
                longDescription: n.longDescription,
                rowType: n.rowType,
                quantity: hasOwnAmount ? n.quantity : undefined,
                unit: hasOwnAmount ? n.unit : undefined,
                npkCode: n.npkCode,
                imageUrl: n.imageUrl,
                discount: hasOwnAmount ? (n.discount ?? 0) : undefined,
                discounts: hasOwnAmount ? pdfLineDiscounts(n) : undefined,
                taxRate: hasOwnAmount ? effectiveTaxRate : undefined,
                unitPrice: hasOwnAmount ? n.unitPrice : undefined,
                lineTotal: hasOwnAmount ? lineTotalWithTax(ownNet, effectiveTaxRate) : undefined,
                total: n.totalWithChildren,
                isParent: n.children.length > 0,
                isTopLevel: isRootLevel,
                hierarchyLevel: n.hierarchyLevel,
            });
            flatten(n.children, false);
            if (isRootLevel && (n.rowType || '').toUpperCase() === 'SECTION' && n.children.length > 0) {
                flatTree.push({
                    rowKey: `${n.id}-subtotal`,
                    shortDescription: '',
                    quantity: 0,
                    total: n.totalWithChildren,
                    isSectionSubtotal: true,
                });
            }
        });
    };
    flatten(tree, true);
    return flatTree;
};
