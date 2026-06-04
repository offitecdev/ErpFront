import { useTenderStore } from '../../../store/tenderStore';
import type { CalculationItemDto, PositionArticleMappingDto, PositionMaterialMappingDto, PositionDto } from '../../../types/tender';

export const STATUS_VARIANT: Record<string, 'warning' | 'approved' | 'info'> = {
    Draft: 'warning',
    Approved: 'approved',
    Exported: 'info',
};

export const STATUS_LABEL: Record<string, string> = {
    Draft: 'Taslak',
    Approved: 'Onaylı',
    Exported: 'Dışa Aktarıldı',
};

export const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v);

export const fmtNumber = (v: number) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 4 }).format(v);

export const fmtVatRate = (v: number) =>
    new Intl.NumberFormat('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

export interface TreeNode extends PositionDto {
    isArticleMapping?: boolean;
    mappingId?: string;
    articleId?: string;
    materialId?: string;
    children: TreeNode[];
    totalWithChildren: number;
}

export const FIXED_VAT = 8.1;

export const lineTotalWithTax = (amount: number, taxRate?: number | null) =>
    amount * (1 + ((taxRate != null && taxRate > 0 ? taxRate : FIXED_VAT) / 100));

export const buildTree = (positions: PositionDto[], fallbackTaxRate = 8.1): TreeNode[] => {
    const map = new Map<string, TreeNode>();
    positions.forEach((p) => {
        const node: TreeNode = { ...p, taxRate: (p.taxRate != null && p.taxRate > 0) ? p.taxRate : fallbackTaxRate, children: [], totalWithChildren: 0 };
        if (p.articleMappings && p.articleMappings.length > 0) {
            p.articleMappings.forEach((m, i) => {
                const articleNode: TreeNode = {
                    ...p,
                    id: m.id,
                    isArticleMapping: true,
                    mappingId: m.id,
                    articleId: m.articleId,
                    positionNumber: `${p.positionNumber}.M${i + 1}`,
                    shortDescription: m.article?.name || 'Ürün',
                    longDescription: m.article?.description || null,
                    quantity: m.quantityMultiplier,
                    unit: m.article?.unit || 'adet',
                    unitPrice: m.article?.baseCost || 0,
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
        const structuralChildren = n.children.filter((child) => !child.isArticleMapping);

        let self = 0;
        if (n.isArticleMapping) {
            const net = qty * (price || 0) * (1 - disc / 100);
            self = lineTotalWithTax(net, n.taxRate);
        } else if (structuralChildren.length > 0) {
            self = 0;
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
        n.totalWithChildren = n.children.length > 0 ? childSum : self;
        return n.totalWithChildren;
    };
    roots.forEach(compute);

    const sortRec = (nodes: TreeNode[]) => {
        nodes.sort((a, b) => a.positionNumber.localeCompare(b.positionNumber, undefined, { numeric: true }));
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

export const flattenTenderTreeForPdf = (tree: TreeNode[]) => {
    const flatTree: any[] = [];
    const flatten = (nodes: TreeNode[], isRootLevel = false) => {
        nodes.forEach((n) => {
            flatTree.push({
                positionNumber: n.positionNumber,
                shortDescription: n.shortDescription,
                longDescription: n.longDescription,
                quantity: n.children.length > 0 ? undefined : n.quantity,
                unit: n.children.length > 0 ? undefined : n.unit,
                npkCode: n.npkCode,
                imageUrl: n.imageUrl,
                discount: n.children.length > 0 ? undefined : (n.discount ?? 0),
                taxRate: n.children.length > 0 ? undefined : FIXED_VAT,
                unitPrice: n.children.length > 0 ? undefined : n.unitPrice,
                total: n.totalWithChildren,
                isParent: n.children.length > 0,
                isTopLevel: isRootLevel,
                hierarchyLevel: n.hierarchyLevel,
            });
            flatten(n.children, false);
            if (isRootLevel) {
                flatTree.push({
                    positionNumber: `${n.positionNumber}-subtotal`,
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
