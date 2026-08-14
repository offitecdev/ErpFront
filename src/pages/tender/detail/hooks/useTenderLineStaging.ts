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
import { isInlinePatchConfirmed, normalizeInlinePatchValue } from '../utils/tenderInlinePatch.utils';
import { deriveLineDiscountPercent, seedTotalDiscounts } from '../utils/tenderDiscounts.utils';
import { computeTenderPricingSummary } from '../utils/tenderPricing.utils';
import {
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
    const committedTenderRef = useRef(tender);
    const [dirtyLineIds, setDirtyLineIds] = useState<Set<string>>(() => new Set());
    const [savingAll, setSavingAll] = useState(false);
    // React state is not synchronous. This ref closes the small window in which
    // a double click can enter handleSaveAll twice before savingAll re-renders.
    const savingAllRef = useRef(false);

    useEffect(() => {
        if (tender && Object.keys(pendingMeta).length === 0) committedTenderRef.current = tender;
    }, [pendingMeta, tender]);

    const [pendingAddrId, setPendingAddrId] = useState<{ INSTALLATION: string | null; DELIVERY: string | null; BILLING: string | null }>({
        INSTALLATION: null,
        DELIVERY: null,
        BILLING: null,
    });


    // Latest lines, readable from the stable inline-change callback without
    // putting `localPositions` in its dependency list (which would hand every
    // memoized cell input a fresh onCommit on every keystroke).
    // Written in an effect (not during render): every reader is an event
    // handler, which always runs after the effects of the render it came from.
    const localPositionsRef = useRef(localPositions);
    useEffect(() => { localPositionsRef.current = localPositions; }, [localPositions]);

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


    const handleInlinePositionChange = useCallback((positionId: string, rawPatch: InlinePositionPatch) => {
        if (!id) return;
        // A stacked discount is stored as a list but PRICED through the single
        // `discount` percentage, which is a percentage OF THE LINE'S BASE. Move
        // the quantity or the unit price and that base moves with it, so the
        // percentage has to be recomputed — otherwise a "CHF 50 off" silently
        // becomes "CHF 80 off" the moment the quantity changes.
        const current = localPositionsRef.current.find((position) => position.id === positionId);
        const touchesBase = rawPatch.quantity !== undefined || rawPatch.unitPrice !== undefined;
        const derived = current && touchesBase && rawPatch.discounts === undefined && rawPatch.discount === undefined
            ? deriveLineDiscountPercent({ ...current, ...rawPatch })
            : null;
        const patch: InlinePositionPatch = derived == null ? rawPatch : { ...rawPatch, discount: derived };
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
        // A typed discount REPLACES whatever the line carried, including a
        // stacked list left over from the removed per-line discount editor —
        // otherwise the stack would keep driving the total while the cell shows
        // the number the user just typed (same rule as the bulk discount).
        handleInlinePositionChange(
            positionId,
            field === 'discount' ? { discount: value, discounts: null } : { [field]: value },
        );
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
        if (fieldKey === 'delivery') setPendingAddrId((prev) => ({ ...prev, DELIVERY: null }));
        if (fieldKey === 'billing') setPendingAddrId((prev) => ({ ...prev, BILLING: null }));
    };

    // Picking (or inline-creating) an address only stages it, like every other
    // meta edit — nothing is persisted until the user presses the top-bar Save
    // (see handleSaveAll). The optimistic update makes the picked value show at
    // once so the pending change is visible before it is saved.
    const handleAddressPick = (patch: TenderMetaPatch) => handleTenderMetaChange(patch);

    // ── Manual Save flush ────────────────────────────────────────────────────
    const pendingMetaCount = Object.keys(pendingMeta).length;
    const pendingChangeCount = dirtyLineIds.size + (pendingMetaCount > 0 ? 1 : 0);
    const isDirty = pendingChangeCount > 0;

 
    const handleSaveAll = async (): Promise<boolean> => {
        if (!id || savingAllRef.current || !isDirty) return true;
        savingAllRef.current = true;
        setSavingAll(true);
        try {
            let hadFailure = false;
            let failureReason: string | null = null;
            const sentMeta = pendingMeta;

   
            // Persist creates, edits and deletes as one atomic unit of work.
            const pendingCreateTempIds = [...pendingCreateIds.current];
            const pendingUpdateIds = Object.keys(pendingPositionPatches.current).filter(
                (positionId) => !positionId.startsWith('local-position-') && !pendingDeleteIds.current.has(positionId),
            );
            const pendingDeletePositionIds = [...pendingDeleteIds.current];
            const createEntries = pendingCreateTempIds.map((tempId) => ({
                clientId: tempId,
                position: {
                    ...(pendingCreatePayloads.current[tempId] ?? {}),
                    ...(pendingPositionPatches.current[tempId] ?? {}),
                },
            }));
            const updateEntries = pendingUpdateIds.flatMap((positionId) => {
                const patch = pendingPositionPatches.current[positionId];
                return patch ? [{ positionId, patch }] : [];
            });
            const sentCreateByClientId = new Map(createEntries.map((entry) => [entry.clientId, entry.position]));
            const sentUpdateById = new Map(updateEntries.map((entry) => [entry.positionId, entry.patch]));
            const hasNewerPatch = (sent: Partial<PositionDto> | undefined, latest: InlinePositionPatch | undefined) =>
                Boolean(latest && Object.entries(latest).some(([field, value]) =>
                    normalizeInlinePatchValue(sent?.[field as keyof PositionDto]) !== normalizeInlinePatchValue(value),
                ));

            if (
                pendingMetaCount > 0
                || createEntries.length > 0
                || updateEntries.length > 0
                || pendingDeletePositionIds.length > 0
            ) {
                try {
                    const committedTender = committedTenderRef.current ?? tender!;
                    const nextTender = { ...committedTender, ...sentMeta };
                    const previousDiscounts = seedTotalDiscounts(committedTender);
                    const nextDiscounts = seedTotalDiscounts(nextTender);
                    const previousSummary = computeTenderPricingSummary(
                        buildSimpleTenderLines(detail?.positions ?? [], fallbackTaxRate),
                        fallbackTaxRate,
                        previousDiscounts,
                    );
                    const nextSummary = computeTenderPricingSummary(
                        buildSimpleTenderLines(localPositions, fallbackTaxRate),
                        fallbackTaxRate,
                        nextDiscounts,
                    );
                    const result = await tenderApi.savePositions(id, {
                        positions: createEntries,
                        updates: updateEntries,
                        deleteIds: pendingDeletePositionIds,
                        meta: sentMeta,
                        summary: {
                            previousGrandTotal: previousSummary.grossTotal,
                            nextGrandTotal: nextSummary.grossTotal,
                            previousTotalDiscounts: JSON.stringify(previousDiscounts),
                            nextTotalDiscounts: JSON.stringify(nextDiscounts),
                        },
                    });
                    const createdByClientId = new Map(
                        result.positions.map((created) => [created.clientId, created]),
                    );
                    const updatedById = new Map(
                        result.updatedPositions.map((position) => [position.id, position]),
                    );
                    const tempToServerId = new Map<string, string>();
                    const remainingCreatePatches = new Map<string, InlinePositionPatch>();
                    const remainingUpdatePatches = new Map<string, InlinePositionPatch>();

                    pendingCreateTempIds.forEach((tempId) => {
                        const created = createdByClientId.get(tempId);
                        const serverPosition = created?.position;
                        const serverId = created?.positionId || serverPosition?.id;
                        if (!serverId) {
                            hadFailure = true;
                            return;
                        }

                        // Preserve an input commit made while the request was in
                        // flight by moving it from the temp id to the server id.
                        const latestPatch = pendingPositionPatches.current[tempId];
                        const keepLatestPatch = hasNewerPatch(sentCreateByClientId.get(tempId), latestPatch);
                        if (keepLatestPatch && latestPatch) {
                            pendingPositionPatches.current[serverId] = latestPatch;
                            remainingCreatePatches.set(serverId, latestPatch);
                        }

                        stableRowKeys.current.set(serverId, stableRowKeys.current.get(tempId) ?? tempId);
                        tempToServerId.set(tempId, serverId);
                        delete pendingCreatePayloads.current[tempId];
                        delete pendingPositionPatches.current[tempId];
                        delete optimisticPositionIds.current[tempId];
                        pendingCreateIds.current.delete(tempId);
                    });

                    pendingUpdateIds.forEach((positionId) => {
                        const updated = updatedById.get(positionId);
                        if (!updated) {
                            hadFailure = true;
                            return;
                        }
                        const latestPatch = pendingPositionPatches.current[positionId];
                        const keepLatestPatch = hasNewerPatch(sentUpdateById.get(positionId), latestPatch);
                        if (keepLatestPatch && latestPatch) {
                            remainingUpdatePatches.set(positionId, latestPatch);
                        } else {
                            delete pendingPositionPatches.current[positionId];
                        }
                    });

                    pendingDeletePositionIds.forEach((positionId) => {
                        pendingDeleteIds.current.delete(positionId);
                        delete pendingDeletePositions.current[positionId];
                    });

                    // Mirror the persisted unit of work into the store's cached
                    // detail. Re-opening this tender skips the refetch when the
                    // cached id matches, and the staging sync effect rebuilds the
                    // lines from `detail.positions` — with a stale cache the
                    // just-saved rows disappeared on the next visit.
                    const cachedState = useTenderStore.getState();
                    if (cachedState.detail && cachedState.detail.tender.id === id) {
                        const deletedIdSet = new Set(pendingDeletePositionIds);
                        const createdPositions: PositionDto[] = [];
                        tempToServerId.forEach((serverId, tempId) => {
                            const created = createdByClientId.get(tempId)?.position;
                            const local = localPositions.find((position) => position.id === tempId);
                            const base = created ?? local;
                            if (base) createdPositions.push({ ...base, id: serverId });
                        });
                        const cachedIds = new Set(cachedState.detail.positions.map((position) => position.id));
                        useTenderStore.setState({
                            detail: {
                                ...cachedState.detail,
                                positions: sortPositions([
                                    ...cachedState.detail.positions
                                        .filter((position) => !deletedIdSet.has(position.id))
                                        .map((position) => {
                                            const updated = updatedById.get(position.id);
                                            if (!updated) return position;
                                            return {
                                                ...position,
                                                ...updated,
                                                calculation: updated.calculation ?? position.calculation,
                                                articleMappings: updated.articleMappings ?? position.articleMappings,
                                            };
                                        }),
                                    ...createdPositions.filter((position) => !cachedIds.has(position.id)),
                                ]),
                            },
                        });
                    }

                    if (pendingMetaCount > 0) {
                        if (!result.updatedTender) {
                            hadFailure = true;
                        } else {
                            const latest = useTenderStore.getState();
                            if (latest.detail && latest.detail.tender.id === id) {
                                useTenderStore.setState({
                                    detail: {
                                        ...latest.detail,
                                        tender: { ...latest.detail.tender, ...result.updatedTender },
                                    },
                                    list: latest.list.map((item) =>
                                        item.id === id ? { ...item, ...result.updatedTender } : item,
                                    ),
                                });
                            }
                            setPendingMeta((current) => Object.fromEntries(
                                Object.entries(current).filter(([field, value]) =>
                                    normalizeInlinePatchValue(value)
                                    !== normalizeInlinePatchValue(sentMeta[field as keyof TenderMetaPatch]),
                                ),
                            ) as TenderMetaPatch);
                            committedTenderRef.current = { ...committedTender, ...result.updatedTender };
                        }
                    }

                    setLocalPositions((positions) => positions.map((position) => {
                        const serverId = tempToServerId.get(position.id);
                        if (serverId) {
                            const created = createdByClientId.get(position.id)?.position;
                            const latestPatch = remainingCreatePatches.get(serverId);
                            return {
                                ...position,
                                ...(created ?? {}),
                                ...(latestPatch ?? {}),
                                id: serverId,
                                calculation: created?.calculation ?? position.calculation,
                                articleMappings: created?.articleMappings ?? position.articleMappings,
                            };
                        }
                        const updated = updatedById.get(position.id);
                        if (!updated) return position;
                        return {
                            ...position,
                            ...updated,
                            ...(remainingUpdatePatches.get(position.id) ?? {}),
                            calculation: updated.calculation ?? position.calculation,
                            articleMappings: updated.articleMappings ?? position.articleMappings,
                        };
                    }));
                    setSelectedId((current) => current ? (tempToServerId.get(current) ?? current) : current);
                } catch (error: any) {
                    hadFailure = true;
                    // Keep the server's reason: a bare "row could not be updated"
                    // hides which line failed and why (validation, permission, a
                    // stale field), which makes the failure unreportable.
                    failureReason = error?.response?.data?.error || error?.message || null;
                    const snapshots = pendingDeletePositionIds
                        .map((positionId) => pendingDeletePositions.current[positionId])
                        .filter((position): position is PositionDto => Boolean(position));
                    if (snapshots.length > 0) {
                        setLocalPositions((positions) => sortPositions([
                            ...positions,
                            ...snapshots.filter((snapshot) => !positions.some((position) => position.id === snapshot.id)),
                        ]));
                    }
                }
            }

            // Rebuild the dirty set from whatever is still staged (any failed
            // create / delete / edit remains buffered for the next Save).
            recomputeDirtyLineIds();

            // Success is signalled by the save button's spinner stopping — no
            // "saved" toast; only failures surface a notification.
            if (hadFailure) {
                toast.error(failureReason
                    ? `${t('tenders.line_guncellenemedi')} ${failureReason}`
                    : t('tenders.line_guncellenemedi'));
            }
            return !hadFailure;
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('tenders.tender_info_guncellenemedi'));
            return false;
        } finally {
            savingAllRef.current = false;
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
    // (see handleSaveAll), which sends the complete unit of work once and swaps
    // each temporary id for its real server id.
    const handleAddRow = (
        rowType: 'TITLE' | 'DESCRIPTION' | 'PRODUCT',
        article?: ProductSource,
        options?: Partial<ManualProductForm>,
        afterRowId?: string,
    ): string | null => {
        if (!tender || !isDraft || !canManage) return null;
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
        const stagedSourceArticleId = isProduct ? (productDefaults?.sourceArticleId ?? null) : null;
        // Shown on the optimistic row only. Article-linked products never SEND the
        // image with the save: it's a base64 LONGTEXT the backend/PDF already resolve
        // from the article via sourceArticleId — uploading it made saves take seconds.
        const displayImageUrl = isProduct || descriptionLike
            ? (productDefaults?.imageUrl || resolvedArticle?.imageUrl || options?.imageUrl || null)
            : null;
        const createPayload = {
            ...positionMeta,
            rowType,
            sourceArticleId: isProduct ? (productDefaults?.sourceArticleId ?? null) : null,
            shortDescription: isProduct
                ? (resolvedArticle || options?.name
                    ? (productDefaults?.shortDescription || articleName || options?.name || t('tenders.product'))
                    : '')
                : titleLike
                    ?t('tenders.baslik')
                    : ' ',
            longDescription: isProduct
                ? (articleDescription || options?.description || '')
                : descriptionLike
                    ? ''
                    : null,
            quantity: isProduct ? productDefaults?.quantity : 0,
            unit: isProduct ? productDefaults?.unit : null,
            unitPrice: isProduct ? productDefaults?.unitPrice : null,
            discount: isProduct ? productDefaults?.discount : 0,
            taxRate: isProduct ? productDefaults?.taxRate : 0,
            imageUrl: stagedSourceArticleId ? undefined : displayImageUrl,
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
            imageUrl: displayImageUrl,
            calculation: null,
            articleMappings: [],
        };

        // Stage the new row: mark it as a pending create and keep its temp id
        // unresolved so inline edits before Save buffer against the same key.
        pendingCreatePayloads.current[optimisticId] = createPayload;
        pendingCreateIds.current.add(optimisticId);
        optimisticPositionIds.current[optimisticId] = null;
        setLocalPositions((positions) => sortPositions([...positions, optimisticPosition]));
        setSelectedId(optimisticId);
        recomputeDirtyLineIds();
        // Returned so the caller can focus the new row — an empty product row is
        // only useful if the cursor lands in its name field.
        return optimisticId;
    };

    // Move a quote line one slot up or down by swapping its displayOrder with the
    // adjacent sibling. Both rows are staged as ordinary inline `displayOrder`
    // patches, so the new order persists with the next Save and re-sorts the
    // local view immediately.
    const handleMoveRow = (rowId: string, direction: 'up' | 'down') => {
        if (!tender || !isDraft || !canManage) return;
        const rows = sortPositions(localPositions);
        const index = rows.findIndex((row) => row.id === rowId);
        if (index < 0) return;
        const targetIndex = direction === 'up' ? index - 1 : index + 1;
        if (targetIndex < 0 || targetIndex >= rows.length) return;

        const current = rows[index];
        const target = rows[targetIndex];
        // Fall back to the sorted position for legacy rows with a null order.
        const orderOf = (row: PositionDto, idx: number) =>
            row.displayOrder == null ? (idx + 1) * 1000 : Number(row.displayOrder);
        let currentOrder = orderOf(current, index);
        let targetOrder = orderOf(target, targetIndex);
        // Legacy rows can share an order; derive distinct values from their
        // sorted positions so the swap actually changes the sequence.
        if (currentOrder === targetOrder) {
            currentOrder = (index + 1) * 1000;
            targetOrder = (targetIndex + 1) * 1000;
        }

        handleInlinePositionChange(current.id, { displayOrder: targetOrder });
        handleInlinePositionChange(target.id, { displayOrder: currentOrder });
    };

    // Shared by the per-row trash button and the bulk-delete modal: drops the
    // rows locally and stages the deletion (persisted on Save).
    const stageRowDeletion = (rowIds: string[]) => {
        if (rowIds.length === 0) return;
        const deleteIds = new Set(rowIds);
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
        setSelectedRowIds((current) => {
            const next = Object.fromEntries(Object.entries(current).filter(([rowId]) => !deleteIds.has(rowId)));
            return Object.keys(next).length === Object.keys(current).length ? current : next;
        });
        setSelectedId((current) => current && deleteIds.has(current) ? null : current);
    };

    const handleDeleteRow = (rowId: string) => stageRowDeletion([rowId]);

    const handleBulkDelete = () => {
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        const selectedRows = simpleRows.filter((row) => selectedRowIds[row.id]);
        if (selectedRows.length === 0) return;
        stageRowDeletion(selectedRows.map((row) => row.id));
        setBulkDeleteOpen(false);
    };


    const handleBulkDiscount = () => {
        const simpleRows = buildSimpleTenderLines(localPositions, fallbackTaxRate);
        const discountEligibleRows = simpleRows.filter((row) => selectedRowIds[row.id] && row.kind === 'PRODUCT');
        if (discountEligibleRows.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkDiscountValue || 0));
        // A bulk rate REPLACES whatever the line had, including a stacked list —
        // leaving the JSON behind would make the green badge disagree with the
        // percentage the bulk action just wrote.
        discountEligibleRows.forEach((row) => handleInlinePositionChange(row.id, { discount: nextDiscount, discounts: null }));
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
        handleMoveRow,
        handleDeleteRow,
        handleBulkDelete,
        handleBulkDiscount,
    };
};
