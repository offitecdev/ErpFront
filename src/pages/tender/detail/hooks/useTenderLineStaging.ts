import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';

import { tenderApi } from '../../../../lib/api/tender';
import { useTenderStore } from '../../../../store/tenderStore';
import type { PositionDto, TenderDetailDto, TenderListItem } from '../../../../types/tender';
import type {
    InlinePositionPatch,
    ManualProductForm,
    NumberField,
    ProductSource,
    TextField,
} from '../types/tenderDetail.types';
import { sortPositions, buildSimpleTenderLines } from '../utils/tenderLine.utils';
import { isInlinePatchConfirmed } from '../utils/tenderInlinePatch.utils';
import {
    toPlainMarkdown,
    buildProductDefaults,
    createTempPositionId,
} from '../utils/tenderProduct.utils';

// Staged tender-meta patch shape — mirrors the backend `updateMeta` input.
type TenderMetaPatch = Parameters<typeof tenderApi.updateMeta>[1];

type UseTenderLineStagingParams = {
    id: string | undefined;
    detail: TenderDetailDto | null;
    canManage: boolean;
    fallbackTaxRate: number;
    minimumTenderValidUntil: string;
    localPositions: PositionDto[];
    setLocalPositions: Dispatch<SetStateAction<PositionDto[]>>;
    selectedRowIds: Record<string, boolean>;
    setSelectedId: Dispatch<SetStateAction<string | null>>;
    setSelectedRowIds: Dispatch<SetStateAction<Record<string, boolean>>>;
    setBulkDeleteOpen: Dispatch<SetStateAction<boolean>>;
    setBulkDiscountOpen: Dispatch<SetStateAction<boolean>>;
    bulkDiscountValue: number;
};


export const useTenderLineStaging = ({
    id,
    detail,
    canManage,
    fallbackTaxRate,
    minimumTenderValidUntil,
    localPositions,
    setLocalPositions,
    selectedRowIds,
    setSelectedId,
    setSelectedRowIds,
    setBulkDeleteOpen,
    setBulkDiscountOpen,
    bulkDiscountValue,
}: UseTenderLineStagingParams) => {
    const tender = detail?.tender;
    const isDraft = tender?.status === 'Draft';

    const [pendingMeta, setPendingMeta] = useState<TenderMetaPatch>({});
    const [dirtyLineIds, setDirtyLineIds] = useState<Set<string>>(() => new Set());
    const [savingAll, setSavingAll] = useState(false);

    const [pendingAddrId, setPendingAddrId] = useState<{ INSTALLATION: string | null; BILLING: string | null }>({
        INSTALLATION: null,
        BILLING: null,
    });


    const pendingPositionPatches = useRef<Record<string, InlinePositionPatch>>({});
    const optimisticPositionIds = useRef<Record<string, string | null>>({});

    const stableRowKeys = useRef(new Map<string, string>());
   
    const pendingCreatePayloads = useRef<Record<string, Partial<PositionDto>>>({});
    const pendingCreateIds = useRef<Set<string>>(new Set());
    const pendingDeleteIds = useRef<Set<string>>(new Set());
    const pendingDeletePositions = useRef<Record<string, PositionDto>>({});

    const recomputeDirtyLineIds = useCallback(() => {
        const ids = new Set<string>([
            ...Object.keys(pendingPositionPatches.current),
            ...pendingCreateIds.current,
            ...pendingDeleteIds.current,
        ]);
        setDirtyLineIds((prev) => {
            if (prev.size === ids.size && [...ids].every((k) => prev.has(k))) return prev;
            return ids;
        });
    }, []);

    useEffect(() => {
        const positions = detail?.positions ?? [];
        const deleted = pendingDeleteIds.current;
        const merged = positions
            .filter((position) => !deleted.has(position.id))
            .map((position) => {
                const pendingPatch = pendingPositionPatches.current[position.id];
                if (!pendingPatch) return position;
                if (isInlinePatchConfirmed(position, pendingPatch)) {
                    delete pendingPositionPatches.current[position.id];
                    return position;
                }
                return {
                    ...position,
                    ...pendingPatch,
                };
            });

            
        setLocalPositions((prev) => {
            const stagedNew = prev.filter((position) => pendingCreateIds.current.has(position.id));
            return [...merged, ...stagedNew];
        });

        recomputeDirtyLineIds();
    }, [detail?.positions, recomputeDirtyLineIds, setLocalPositions]);


    const resetStaging = useCallback(() => {
        pendingPositionPatches.current = {};
        pendingCreatePayloads.current = {};
        pendingCreateIds.current = new Set();
        pendingDeleteIds.current = new Set();
        pendingDeletePositions.current = {};
        optimisticPositionIds.current = {};
        stableRowKeys.current = new Map();
        setPendingMeta({});
        setDirtyLineIds(new Set());
    }, []);


    const handleInlinePositionChange = useCallback((positionId: string, patch: InlinePositionPatch) => {
        if (!id) return;
        const resolvedPositionId = optimisticPositionIds.current[positionId];
        const isPendingCreate = positionId.startsWith('local-position-') && resolvedPositionId === null;
        // Buffer against the temp id while a create is still in flight; once resolved,
        // buffer against the real server id.
        const bufferId = isPendingCreate ? positionId : (resolvedPositionId || positionId);

        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId ? { ...position, ...patch } : position,
            ),
        );

        pendingPositionPatches.current[bufferId] = {
            ...(pendingPositionPatches.current[bufferId] ?? {}),
            ...patch,
        };
        setDirtyLineIds((prev) => {
            if (prev.has(bufferId)) return prev;
            const next = new Set(prev);
            next.add(bufferId);
            return next;
        });
    }, [id, setLocalPositions]);

    // Stable commit adapters so the memoized inline inputs don't get a fresh
    // onCommit closure every render (which previously re-rendered every input on
    // the page whenever any single cell committed).
    const commitTextField = useCallback((positionId: string, field: TextField, value: string) => {
        handleInlinePositionChange(positionId, { [field]: field === 'unit' ? (value || null) : value });
    }, [handleInlinePositionChange]);
    const commitNumberField = useCallback((positionId: string, field: NumberField, value: number) => {
        handleInlinePositionChange(positionId, { [field]: value });
    }, [handleInlinePositionChange]);
    const commitLongDescription = useCallback((positionId: string, value: string) => {
        handleInlinePositionChange(positionId, { longDescription: value || null });
    }, [handleInlinePositionChange]);

    // Autosave disabled: a header (meta) change is applied to the local view
    // immediately (so the picked value shows at once) and buffered in `pendingMeta`.
    // Nothing is persisted until the user clicks "Save" (see handleSaveAll).
    const handleTenderMetaChange = (
        patch: TenderMetaPatch,
        optimisticPatch: Partial<TenderListItem> = {},
    ): void => {
        if (!tender || !isDraft || !canManage) return;
        const safePatch: TenderMetaPatch = {
            ...patch,
            ...(patch.validUntil !== undefined
                ? {
                    validUntil: patch.validUntil && dayjs(patch.validUntil).isAfter(minimumTenderValidUntil, 'day')
                        ? patch.validUntil
                        : minimumTenderValidUntil,
                }
                : {}),
        };

        const currentState = useTenderStore.getState();
        const previousDetail = currentState.detail;
        if (!previousDetail || previousDetail.tender.id !== tender.id) return;

        const optimisticTenderPatch = { ...safePatch, ...optimisticPatch } as Record<string, unknown>;
        useTenderStore.setState({
            detail: { ...previousDetail, tender: { ...previousDetail.tender, ...optimisticTenderPatch } },
            list: currentState.list.map((item) => (item.id === tender.id ? { ...item, ...optimisticTenderPatch } : item)),
        });
        // Buffer only the persistable meta fields (not the derived optimistic ones).
        setPendingMeta((prev) => ({ ...prev, ...safePatch }));
    };

   
    const handleMetaFieldChange = (fieldKey: string, patch: TenderMetaPatch) => {
        handleTenderMetaChange(patch);
        if (fieldKey === 'installation') setPendingAddrId((prev) => ({ ...prev, INSTALLATION: null }));
        if (fieldKey === 'billing') setPendingAddrId((prev) => ({ ...prev, BILLING: null }));
    };

    const handleAddressPick = (patch: TenderMetaPatch) => handleTenderMetaChange(patch);

    // ── Manual Save flush ────────────────────────────────────────────────────
    const pendingMetaCount = Object.keys(pendingMeta).length;
    const pendingChangeCount = dirtyLineIds.size + (pendingMetaCount > 0 ? 1 : 0);
    const isDirty = pendingChangeCount > 0;

 
    const handleSaveAll = async () => {
        if (!id || savingAll || !isDirty) return;
        setSavingAll(true);
        try {
            let hadFailure = false;

            if (pendingMetaCount > 0) {
                const updated = await tenderApi.updateMeta(id, pendingMeta);
                const latest = useTenderStore.getState();
                if (latest.detail && latest.detail.tender.id === id) {
                    useTenderStore.setState({
                        detail: { ...latest.detail, tender: { ...latest.detail.tender, ...updated } },
                        list: latest.list.map((item) => (item.id === id ? { ...item, ...updated } : item)),
                    });
                }
                setPendingMeta({});
            }

   
            await Promise.all([...pendingCreateIds.current].map(async (tempId) => {
                const payload = {
                    ...(pendingCreatePayloads.current[tempId] ?? {}),
                    ...(pendingPositionPatches.current[tempId] ?? {}),
                };
                try {
                    const result = await tenderApi.addPosition(id, payload);
                    const serverPosition = result.position;
                    const serverId = result.positionId || serverPosition?.id;
                    if (!serverId) throw new Error(t('tenders.sata_r_id_info_ala_namada'));
                    // Pin the row's React key to its original temp id so the temp→real
                    // id swap doesn't remount the row.
                    stableRowKeys.current.set(serverId, stableRowKeys.current.get(tempId) ?? tempId);
                    setLocalPositions((positions) =>
                        positions.map((position) =>
                            position.id === tempId
                                ? {
                                    ...position,
                                    ...(serverPosition ?? {}),
                                    id: serverId,
                                    calculation: serverPosition?.calculation ?? position.calculation,
                                    articleMappings: serverPosition?.articleMappings ?? position.articleMappings,
                                    materialMappings: serverPosition?.materialMappings ?? position.materialMappings,
                                }
                                : position,
                        ),
                    );
                    setSelectedId((current) => (current === tempId ? serverId : current));
                    delete pendingCreatePayloads.current[tempId];
                    delete pendingPositionPatches.current[tempId];
                    delete optimisticPositionIds.current[tempId];
                    pendingCreateIds.current.delete(tempId);
                } catch {
                    hadFailure = true;
                }
            }));

            // Delete the rows the user removed; roll a failed delete back into view.
            await Promise.all([...pendingDeleteIds.current].map(async (pid) => {
                try {
                    await tenderApi.deletePosition(id, pid);
                    pendingDeleteIds.current.delete(pid);
                    delete pendingDeletePositions.current[pid];
                } catch {
                    hadFailure = true;
                    const snapshot = pendingDeletePositions.current[pid];
                    if (snapshot) {
                        setLocalPositions((positions) =>
                            positions.some((position) => position.id === pid)
                                ? positions
                                : sortPositions([...positions, snapshot]),
                        );
                    }
                }
            }));

            // Update existing rows with buffered edits. Temp ids were handled by the
            // create step above, so they are skipped here.
            const lineIds = Object.keys(pendingPositionPatches.current).filter(
                (pid) => !pid.startsWith('local-position-'),
            );
            const results = await Promise.allSettled(
                lineIds.map(async (pid) => {
                    const payload = pendingPositionPatches.current[pid];
                    if (!payload) return;
                    const updated = await tenderApi.updatePosition(id, pid, payload);
                    const localPatch = pendingPositionPatches.current[pid] ?? {};
                    setLocalPositions((positions) =>
                        positions.map((position) =>
                            position.id === pid
                                ? {
                                    ...position,
                                    ...updated,
                                    ...localPatch,
                                    calculation: updated.calculation ?? position.calculation,
                                    articleMappings: updated.articleMappings ?? position.articleMappings,
                                    materialMappings: updated.materialMappings ?? position.materialMappings,
                                }
                                : position,
                        ),
                    );
                    delete pendingPositionPatches.current[pid];
                }),
            );
            if (results.some((r) => r.status === 'rejected')) hadFailure = true;

            // Rebuild the dirty set from whatever is still staged (any failed
            // create / delete / edit remains buffered for the next Save).
            recomputeDirtyLineIds();

            if (hadFailure) {
                toast.error(t('tenders.line_guncellenemedi'));
            } else {
                toast.success(t('tenders.degisiklikler_kaydedildi'));
            }
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('tenders.tender_info_guncellenemedi'));
        } finally {
            setSavingAll(false);
        }
    };

    const getDisplayOrderForInsert = (afterRowId?: string) => {
        const rows = sortPositions(localPositions);
        const afterIndex = afterRowId ? rows.findIndex((row) => row.id === afterRowId) : -1;
        const afterRow = afterIndex >= 0 ? rows[afterIndex] : null;
        const nextRow = afterIndex >= 0 ? rows[afterIndex + 1] : null;

        if (!afterRow) return Number(rows.at(-1)?.displayOrder ?? 0) + 1000;
        const currentOrder = Number(afterRow.displayOrder ?? 0);
        const nextOrder = nextRow ? Number(nextRow.displayOrder ?? 0) : currentOrder + 1000;
        return nextOrder - currentOrder > 1
            ? currentOrder + Math.floor((nextOrder - currentOrder) / 2)
            : currentOrder + 1;
    };

    const buildFlatPositionMeta = (afterRowId?: string) => {
        const order = getDisplayOrderForInsert(afterRowId);
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        return {
            parentPositionId: null,
            hierarchyLevel: 0,
            displayOrder: order,
            positionNumber: String(simpleRows.length + 1),
        };
    };

    // Autosave disabled: adding a row/product only stages it locally. The optimistic
    // row is shown immediately and its create payload is buffered in
    // `pendingCreatePayloads`; nothing is persisted until the user clicks Save
    // (see handleSaveAll), which POSTs each staged row and swaps its temp id for the
    // real server id.
    const handleAddRow = (
        rowType: 'TITLE' | 'DESCRIPTION' | 'PRODUCT',
        article?: ProductSource,
        options?: Partial<ManualProductForm>,
        afterRowId?: string,
    ) => {
        if (!tender || !isDraft || !canManage) return;
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        const isProduct = rowType === 'PRODUCT';
        const titleLike = rowType === 'TITLE';
        const descriptionLike = rowType === 'DESCRIPTION';
        const optimisticId = createTempPositionId();
        const positionMeta = buildFlatPositionMeta(afterRowId);
        const localPositionNumber = String(simpleRows.length + 1);

        const resolvedArticle = article;
        const articleName = resolvedArticle?.name?.trim();
        const articleDescription = resolvedArticle?.description?.trim();
        const productDefaults = isProduct
            ? buildProductDefaults(resolvedArticle, options, fallbackTaxRate)
            : null;
        const createPayload = {
            ...positionMeta,
            rowType,
            sourceArticleId: isProduct ? (productDefaults?.sourceArticleId ?? null) : null,
            shortDescription: isProduct
                ? (productDefaults?.shortDescription || articleName || options?.name ||t('tenders.product'))
                : titleLike
                    ?t('tenders.baslik')
                    : ' ',
            longDescription: isProduct
                ? toPlainMarkdown(articleDescription || options?.description)
                : descriptionLike
                    ? ''
                    : null,
            quantity: isProduct ? productDefaults?.quantity : 0,
            unit: isProduct ? productDefaults?.unit : null,
            unitPrice: isProduct ? productDefaults?.unitPrice : null,
            discount: isProduct ? productDefaults?.discount : 0,
            taxRate: isProduct ? productDefaults?.taxRate : 0,
            imageUrl: isProduct || descriptionLike ? (productDefaults?.imageUrl || resolvedArticle?.imageUrl || options?.imageUrl || null) : null,
        } as Partial<PositionDto>;

        const optimisticPosition: PositionDto = {
            id: optimisticId,
            tenantId: tender.tenantId,
            tenderId: tender.id,
            parentPositionId: createPayload.parentPositionId ?? null,
            rowType,
            sourceArticleId: createPayload.sourceArticleId ?? null,
            displayOrder: createPayload.displayOrder,
            npkCode: null,
            positionNumber: createPayload.positionNumber || localPositionNumber,
            shortDescription: String(createPayload.shortDescription || ''),
            longDescription: createPayload.longDescription ?? null,
            quantity: Number(createPayload.quantity ?? 0),
            unit: createPayload.unit ?? null,
            hierarchyLevel: Number(createPayload.hierarchyLevel ?? 0),
            unitPrice: createPayload.unitPrice ?? null,
            discount: createPayload.discount ?? 0,
            taxRate: createPayload.taxRate ?? null,
            imageUrl: createPayload.imageUrl ?? null,
            calculation: null,
            articleMappings: [],
            materialMappings: [],
        };

        // Stage the new row: mark it as a pending create and keep its temp id
        // unresolved so inline edits before Save buffer against the same key.
        pendingCreatePayloads.current[optimisticId] = createPayload;
        pendingCreateIds.current.add(optimisticId);
        optimisticPositionIds.current[optimisticId] = null;
        setLocalPositions((positions) => sortPositions([...positions, optimisticPosition]));
        setSelectedId(optimisticId);
        recomputeDirtyLineIds();
    };

  
    const handleBulkDelete = () => {
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        const selectedRows = simpleRows.filter((row) => selectedRowIds[row.id]);
        if (selectedRows.length === 0) return;
        const rowsToDelete = selectedRows;
        const deleteIds = new Set(rowsToDelete.map((row) => row.id));
        const positionsById = new Map(localPositions.map((position) => [position.id, position]));

        setLocalPositions((positions) => positions.filter((position) => !deleteIds.has(position.id)));
        deleteIds.forEach((rowId) => {
            // Drop any buffered edits for the removed row.
            delete pendingPositionPatches.current[rowId];
            if (pendingCreateIds.current.has(rowId)) {
                // Never persisted — just discard the staged row, nothing to delete.
                pendingCreateIds.current.delete(rowId);
                delete pendingCreatePayloads.current[rowId];
                delete optimisticPositionIds.current[rowId];
            } else {
          
                pendingDeleteIds.current.add(rowId);
                const snapshot = positionsById.get(rowId);
                if (snapshot) pendingDeletePositions.current[rowId] = snapshot;
            }
        });
        recomputeDirtyLineIds();
        setSelectedRowIds({});
        setSelectedId((current) => current && deleteIds.has(current) ? null : current);
        setBulkDeleteOpen(false);
    };


    const handleBulkDiscount = () => {
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        const discountEligibleRows = simpleRows.filter((row) => selectedRowIds[row.id] && row.kind === 'PRODUCT');
        if (discountEligibleRows.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkDiscountValue || 0));
        discountEligibleRows.forEach((row) => handleInlinePositionChange(row.id, { discount: nextDiscount }));
        setSelectedRowIds({});
        setBulkDiscountOpen(false);
        toast.success(t('tenders.bulk_discount_applied_to_product_lines'));
    };

    return {
        pendingAddrId,
        setPendingAddrId,
        savingAll,
        isDirty,
        pendingChangeCount,
        stableRowKeys,
        resetStaging,
        handleInlinePositionChange,
        commitTextField,
        commitNumberField,
        commitLongDescription,
        handleTenderMetaChange,
        handleMetaFieldChange,
        handleAddressPick,
        handleSaveAll,
        handleAddRow,
        handleBulkDelete,
        handleBulkDiscount,
    };
};
