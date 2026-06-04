import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    Building02 as Building2,
    Calculator,
    Clipboard as ClipboardList,
    ClockRewind as History,
    FileCheck02 as FileCheck2,
    FileDownload02 as FileDown,
    GitBranch01 as GitBranch,
    LayersThree01 as Layers,
    List as ListTree,
    PieChart03 as PieChart,
    Plus,
    Settings01 as Settings,
    Tag01 as Tag,
    Trash01 as Trash2,
} from '@untitledui/icons';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/base/checkbox/checkbox';
import { Avatar } from '../../components/base/avatar/avatar';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { articleApi } from '../../lib/api/inventory';
import { tenderApi } from '../../lib/api/tender';
import { projectApi } from '../../lib/api/project';
import type { PositionDto } from '../../types/tender';
import type { ArticleStockSummary, InventoryArticle } from '../../types/inventory';

import {
    AddPositionModal,
    ExportModal,
    NewArticleModal,
    PositionDetailPanel,
    SummaryStat,
    TenderSettingsModal,
    TenderArticleFormModal,
    TenderLogsSheet,
    TreeRow,
} from './detail/TenderDetailComponents';
import {
    STATUS_LABEL,
    STATUS_VARIANT,
    buildTree,
    flattenTree,
    fmtMoney,
    mergeArticleMappingRemoval,
    mergeArticleMappingUpdate,
    mergePositionUpdate,
    type ArticleMappingUpdateResult,
    type TreeNode,
} from './detail/tenderDetailUtils';
import type { PositionArticleMappingDto } from '../../types/tender';

type InlinePositionPatch = Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'shortDescription' | 'longDescription'>;
type InlineMappingPatch = Pick<Partial<PositionArticleMappingDto>, 'quantityMultiplier' | 'discount'>;

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned) return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

export const TenderDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { settings: pdfSettings } = usePdfSettingsStore();
    const { permissions } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canCalc = permissions.length === 0 || permissions.includes('tenders.calculate');
    const canApprove = permissions.length === 0 || permissions.includes('tenders.approve');
    const canExport = permissions.length === 0 || permissions.includes('tenders.export');

    const {
        detail, loadingDetail, fetchDetail,
        stockArticles, stockArticlesLoading, stockArticlesLoaded, fetchStockArticles, createArticle,
        activities, fetchActivities,
        logs, fetchLogs,
        addPosition, saveCalculation, approveTender,
        createVersion,
    } = useTenderStore();

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [expanded, setExpanded] = useState<Record<string, boolean>>({});
    const [activeTab, setActiveTab] = useState<'calc' | 'articles' | 'meta'>('calc');
    const [addPosOpen, setAddPosOpen] = useState(false);
    const [newArticleOpen, setNewArticleOpen] = useState(false);
    const [exportOpen, setExportOpen] = useState(false);
    const [tenderSettingsOpen, setTenderSettingsOpen] = useState(false);
    const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(0);
    const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDiscountOpen, setBulkDiscountOpen] = useState(false);
    const [bulkDiscountValue, setBulkDiscountValue] = useState<number>(0);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [logsOpen, setLogsOpen] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [projectCreateLoading, setProjectCreateLoading] = useState(false);
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
    const [editingArticle, setEditingArticle] = useState<{
        article: Partial<ArticleStockSummary & InventoryArticle>;
        positionId?: string | null;
        mappingId?: string | null;
    } | null>(null);
    const [articleEditLoadingId, setArticleEditLoadingId] = useState<string | null>(null);
    const [localPositions, setLocalPositions] = useState<PositionDto[]>([]);
    const positionPatchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const positionPatchSeq = useRef<Record<string, number>>({});
    const pendingPositionPatches = useRef<Record<string, InlinePositionPatch>>({});
    const mappingPatchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const mappingPatchSeq = useRef<Record<string, number>>({});
    const pendingMappingPatches = useRef<Record<string, InlineMappingPatch>>({});

    useEffect(() => {
        const positions = detail?.positions ?? [];
        setLocalPositions(
            positions.map((position) => ({
                ...position,
                ...(pendingPositionPatches.current[position.id] ?? {}),
                articleMappings: position.articleMappings?.map((mapping) => ({
                    ...mapping,
                    ...(pendingMappingPatches.current[mapping.id] ?? {}),
                })),
            }))
        );
    }, [detail?.positions]);

    useEffect(() => {
        return () => {
            Object.values(positionPatchTimers.current).forEach(clearTimeout);
            Object.values(mappingPatchTimers.current).forEach(clearTimeout);
        };
    }, []);

    const handleInlinePositionChange = useCallback((positionId: string, patch: InlinePositionPatch) => {
        if (!id) return;

        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId ? { ...position, ...patch } : position
            )
        );

        pendingPositionPatches.current[positionId] = {
            ...(pendingPositionPatches.current[positionId] ?? {}),
            ...patch,
        };
        const seq = (positionPatchSeq.current[positionId] ?? 0) + 1;
        positionPatchSeq.current[positionId] = seq;

        clearTimeout(positionPatchTimers.current[positionId]);
        positionPatchTimers.current[positionId] = setTimeout(async () => {
            const payload = pendingPositionPatches.current[positionId];
            delete pendingPositionPatches.current[positionId];

            try {
                const updated = await tenderApi.updatePosition(id, positionId, payload);
                if (positionPatchSeq.current[positionId] !== seq) return;
                setLocalPositions((positions) =>
                    positions.map((position) =>
                        position.id === positionId
                            ? {
                                ...position,
                                ...updated,
                                calculation: updated.calculation ?? position.calculation,
                                articleMappings: updated.articleMappings ?? position.articleMappings,
                                materialMappings: updated.materialMappings ?? position.materialMappings,
                            }
                            : position
                    )
                );
            } catch (err: any) {
                toast.error(err.response?.data?.error || 'Satır güncellenemedi.');
            }
        }, 500);
    }, [id]);

    const handleInlineMappingChange = useCallback((positionId: string, mappingId: string, patch: InlineMappingPatch) => {
        if (!id || !positionId) return;

        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId
                    ? {
                        ...position,
                        articleMappings: position.articleMappings?.map((mapping) =>
                            mapping.id === mappingId ? { ...mapping, ...patch } : mapping
                        ),
                    }
                    : position
            )
        );

        pendingMappingPatches.current[mappingId] = {
            ...(pendingMappingPatches.current[mappingId] ?? {}),
            ...patch,
        };
        const seq = (mappingPatchSeq.current[mappingId] ?? 0) + 1;
        mappingPatchSeq.current[mappingId] = seq;

        clearTimeout(mappingPatchTimers.current[mappingId]);
        mappingPatchTimers.current[mappingId] = setTimeout(async () => {
            const payload = pendingMappingPatches.current[mappingId];
            delete pendingMappingPatches.current[mappingId];

            try {
                const result = await tenderApi.updateArticleMapping(id, positionId, mappingId, payload);
                if (mappingPatchSeq.current[mappingId] !== seq) return;
                setLocalPositions((positions) =>
                    positions.map((position) =>
                        position.id === positionId
                            ? {
                                ...position,
                                calculation: result.updatedCalculation !== undefined ? result.updatedCalculation : position.calculation,
                                articleMappings: position.articleMappings?.map((mapping) =>
                                    mapping.id === mappingId ? { ...mapping, ...result.mapping } : mapping
                                ),
                            }
                            : position
                    )
                );
            } catch (err: any) {
                toast.error(err.response?.data?.error || 'Ürün satırı güncellenemedi.');
            }
        }, 500);
    }, [id]);

    const handleLocalPositionChange = useCallback((positionId: string, patch: InlinePositionPatch) => {
        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId ? { ...position, ...patch } : position
            )
        );
    }, []);

    const handleLocalMappingChange = useCallback((positionId: string, mappingId: string, patch: InlineMappingPatch) => {
        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId
                    ? {
                        ...position,
                        articleMappings: position.articleMappings?.map((mapping) =>
                            mapping.id === mappingId ? { ...mapping, ...patch } : mapping
                        ),
                    }
                    : position
            )
        );
    }, []);

    useEffect(() => {
        if (id) {
            setCreatedProjectId(null);
            fetchDetail(id);
            fetchActivities(id);
            setLogsLoaded(false);
            useTenderStore.setState({ logs: [] });
        }
    }, [id, fetchDetail, fetchActivities]);

    useEffect(() => {
        if (activeTab !== 'articles' || stockArticlesLoaded || stockArticlesLoading) return;
        void fetchStockArticles();
/*
        setMaterialsLoading(true);
        projectApi.materials()
            .then((rows) => {
                setMaterials(rows);
                setMaterialsLoaded(true);
            })
            .catch((e: any) => toast.error(e.response?.data?.error || 'Malzemeler yüklenemedi.'))
            .finally(() => setMaterialsLoading(false));
*/
    }, [activeTab, stockArticlesLoaded, stockArticlesLoading, fetchStockArticles]);

    const handleOpenLogs = async () => {
        if (!id) return;
        setLogsOpen(true);
        setLogsLoading(true);
        try {
            await fetchLogs(id);
            setLogsLoaded(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Loglar yuklenemedi.');
        } finally {
            setLogsLoading(false);
        }
    };

    const handleOpenArticleEditor = async (articleId: string, positionId?: string | null, mappingId?: string | null) => {
        setArticleEditLoadingId(articleId);
        try {
            const summary = stockArticles.find((a) => a.id === articleId);
            const article = summary ?? await articleApi.getById(articleId);
            setEditingArticle({
                article,
                positionId: positionId ?? null,
                mappingId: mappingId ?? null,
            });
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Ürün bilgisi alınamadı.');
        } finally {
            setArticleEditLoadingId(null);
        }
    };

    const tree = useMemo(() => {
        if (!detail) return [];
        return buildTree(localPositions, pdfSettings.vatRate ?? 8.1);
    }, [detail, localPositions, pdfSettings.vatRate]);

    const selected = useMemo<TreeNode | null>(() => {
        let found: TreeNode | null = null;
        const findNode = (nodes: TreeNode[]) => {
            for (const n of nodes) {
                if (n.id === selectedId) found = n;
                else findNode(n.children);
            }
        };
        if (tree.length > 0) findNode(tree);
        return found;
    }, [tree, selectedId]);

    const grandTotal = useMemo(() => {
        return tree.reduce((s, n) => s + n.totalWithChildren, 0);
    }, [tree]);

    const flatRows = useMemo(() => flattenTree(tree), [tree]);
    const rowById = useMemo(() => new Map(flatRows.map((row) => [row.id, row])), [flatRows]);
    const selectedRows = useMemo(
        () => flatRows.filter((row) => selectedRowIds[row.id]),
        [flatRows, selectedRowIds]
    );
    const discountEligibleRows = useMemo(
        () => selectedRows.filter((row) => row.children.length === 0),
        [selectedRows]
    );
    const discountSkippedRows = useMemo(
        () => selectedRows.filter((row) => row.children.length > 0),
        [selectedRows]
    );
    const deleteTargetRows = useMemo(() => {
        const ids = new Set(selectedRows.map((row) => row.id));
        return selectedRows.filter((row) => {
            let parentId = row.parentPositionId || null;
            while (parentId) {
                if (ids.has(parentId)) return false;
                parentId = rowById.get(parentId)?.parentPositionId || null;
            }
            return true;
        });
    }, [rowById, selectedRows]);
    const allRowsSelected = flatRows.length > 0 && selectedRows.length === flatRows.length;
    const someRowsSelected = selectedRows.length > 0;

    useEffect(() => {
        if (tree.length > 0) {
            const next: Record<string, boolean> = {};
            const expand = (n: TreeNode) => {
                if (n.children.length > 0) {
                    next[n.id] = true;
                    n.children.forEach(expand);
                }
            };
            tree.forEach(expand);
            setExpanded(next);
        }
    }, [tree.length]);

    useEffect(() => {
        setSelectedRowIds((prev) => {
            const validIds = new Set(flatRows.map((row) => row.id));
            const next = Object.fromEntries(Object.entries(prev).filter(([id, checked]) => checked && validIds.has(id)));
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [flatRows]);

    if (loadingDetail || !detail) {
        return (
            <div className="animate-pulse flex flex-col gap-6">
                {/* Header Skeleton */}
                <div className="flex justify-between items-start">
                    <div>
                        <div className="h-4 w-40 bg-slate-200 rounded mb-3"></div>
                        <div className="flex gap-3 items-center mb-3">
                            <div className="h-7 w-48 bg-slate-200 rounded"></div>
                            <div className="h-5 w-16 bg-slate-200 rounded-full"></div>
                        </div>
                        <div className="h-3 w-72 bg-slate-200 rounded"></div>
                    </div>
                    <div className="flex gap-2">
                        <div className="h-9 w-28 bg-slate-200 rounded-md"></div>
                        <div className="h-9 w-24 bg-slate-200 rounded-md"></div>
                    </div>
                </div>

                {/* Top Summary Strip Skeleton */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-[88px] bg-slate-50 border border-slate-100/60 rounded-xl"></div>
                    ))}
                </div>

                {/* Main Content Skeleton */}
                <div className="grid grid-cols-1 2xl:grid-cols-12 gap-4">
                    <div className="min-w-0 2xl:col-span-7 h-[500px] bg-slate-50 border border-slate-100/60 rounded-xl"></div>
                    <div className="min-w-0 2xl:col-span-5 h-[500px] bg-slate-50 border border-slate-100/60 rounded-xl"></div>
                </div>
            </div>
        );
    }

    const tender = detail.tender;
    const isDraft = tender.status === 'Draft';
    const projectId = tender.projectId || createdProjectId;
    const tenderStatusLabel = projectId ? 'Siparişte' : STATUS_LABEL[tender.status];
    const tenderStatusVariant = projectId ? 'order' : STATUS_VARIANT[tender.status];
    const creatorName = tender.createdByName || tender.createdByEmail || tender.createdByEmployeeId || 'Bilinmiyor';
    const createdAtLabel = dayjs(tender.createdAt).format('DD.MM.YYYY HH:mm');

    const handleApprove = async () => {
        if (!confirm(`${tender.tenderNumber} teklifi onaylansın mı? Fiyatlar kilitlenecek.`)) return;
        try {
            await approveTender(tender.id);
            toast.success('Teklif onaylandı.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Onay başarısız.');
        }
    };

    const handleCreateVersion = async () => {
        try {
            const next = await createVersion(tender.id);
            toast.success(`Yeni versiyon (v${next.version}) oluşturuldu.`);
            navigate(`/crm/tenders/${next.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Versiyon oluşturulamadı.');
        }
    };

    const handleCreateProject = async () => {
        if (projectId) {
            navigate(`/projects/${projectId}`);
            return;
        }
        setProjectCreateLoading(true);
        try {
            const res = await projectApi.createFromTender(tender.id, undefined, overtimeHourlyRate);
            setCreatedProjectId(res.project.id);
            toast.success(res.message || 'Sipariş oluşturuldu.');
            await fetchDetail(tender.id, true);
            navigate(`/projects/${res.project.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Sipariş oluşturulamadı.');
        } finally {
            setProjectCreateLoading(false);
        }
    };

    const toggleAllRows = (checked: boolean) => {
        setSelectedRowIds(checked ? Object.fromEntries(flatRows.map((row) => [row.id, true])) : {});
    };

    const toggleRowSelection = (rowId: string, checked: boolean) => {
        setSelectedRowIds((prev) => {
            const next = { ...prev };
            if (checked) next[rowId] = true;
            else delete next[rowId];
            return next;
        });
    };

    const handleBulkDelete = async () => {
        if (deleteTargetRows.length === 0) return;
        setBulkActionLoading(true);
        try {
            const results = await Promise.all(deleteTargetRows.map(async (row) => {
                if (row.isArticleMapping && row.mappingId && row.parentPositionId) {
                    return {
                        row,
                        result: await tenderApi.removeArticleMapping(tender.id, row.parentPositionId, row.mappingId),
                    };
                }
                await tenderApi.deletePosition(tender.id, row.id);
                return { row, result: null };
            }));
            const needsFullRefresh = results.some(({ row }) => !row.isArticleMapping);
            if (needsFullRefresh) {
                await fetchDetail(tender.id, true);
            } else {
                results.forEach(({ row, result }) => {
                    if (row.mappingId && row.parentPositionId) {
                        mergeArticleMappingRemoval(row.parentPositionId, row.mappingId, result?.updatedCalculation);
                    }
                });
            }
            setSelectedRowIds({});
            setBulkDeleteOpen(false);
            toast.success('Seçili satırlar silindi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Toplu silme yapılamadı.');
        } finally {
            setBulkActionLoading(false);
        }
    };

    const handleBulkDiscount = async () => {
        if (discountEligibleRows.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkDiscountValue || 0));
        setBulkActionLoading(true);
        try {
            const results = await Promise.all(discountEligibleRows.map(async (row) => {
                if (row.isArticleMapping && row.mappingId && row.parentPositionId) {
                    return {
                        row,
                        result: await tenderApi.updateArticleMapping(tender.id, row.parentPositionId, row.mappingId, { discount: nextDiscount }),
                    };
                }
                return {
                    row,
                    result: await tenderApi.updatePosition(tender.id, row.id, { discount: nextDiscount }),
                };
            }));
            results.forEach(({ row, result }) => {
                if (row.isArticleMapping && row.mappingId && row.parentPositionId) {
                    mergeArticleMappingUpdate(row.parentPositionId, row.mappingId, result as ArticleMappingUpdateResult, { discount: nextDiscount });
                } else {
                    mergePositionUpdate(row.id, result as Partial<PositionDto>);
                }
            });
            setSelectedRowIds({});
            setBulkDiscountOpen(false);
            toast.success('Toplu indirim tabloya işlendi.');
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Toplu indirim uygulanamadı.');
        } finally {
            setBulkActionLoading(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={`CRM › Teklif › ${tender.tenderNumber}`}
                title={
                    <span className="flex items-center gap-3">
                        <span>{tender.tenderNumber}</span>
                        <span className="text-[12px] font-mono text-slate-400">v{tender.version}</span>
                        <StatusChip variant={tenderStatusVariant}>
                            {tenderStatusLabel}
                        </StatusChip>
                    </span>
                }
                description={
                    <span className="flex items-center gap-3 text-[12.5px]">
                        <span className="flex items-center gap-1"><Building2 size={11} />{tender.customerName || tender.customerId}</span>
                        <span className="text-slate-300">·</span>
                        <span className="font-mono text-[11.5px]">{tender.format}</span>
                        {tender.validUntil && (
                            <>
                                <span className="text-slate-300">·</span>
                                <span>Geçerli: {dayjs(tender.validUntil).format('DD.MM.YYYY')}</span>
                            </>
                        )}
                    </span>
                }
                actions={
                    <>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>
                            Listeye Dön
                        </Button>
                        {!isDraft && canManage && (
                            <Button variant="secondary" icon={<GitBranch size={13} />} onClick={handleCreateVersion}>
                                Yeni Versiyon
                            </Button>
                        )}
                        {canManage && (
                            <Button variant="secondary" icon={<Settings size={13} />} onClick={() => setTenderSettingsOpen(true)}>
                                Teklif Ayarları
                            </Button>
                        )}
                        {canExport && (
                            <Button variant="secondary" icon={<FileDown size={13} />} onClick={() => setExportOpen(true)}>
                                PDF / Dışa Aktar
                            </Button>
                        )}
                        {!isDraft && canManage && (
                            <Button
                                variant="primary"
                                icon={<BriefcaseBusiness size={13} />}
                                loading={projectCreateLoading}
                                onClick={handleCreateProject}
                            >
                                {projectId ? 'Siparişe Git' : 'Sipariş Oluştur'}
                            </Button>
                        )}
                        {isDraft && canApprove && (
                            <Button variant="primary" icon={<FileCheck2 size={13} />} onClick={handleApprove}>
                                Onayla
                            </Button>
                        )}
                    </>
                }
            />

            {/* Creator + Activity strip */}
            <div className="mb-4 flex flex-col gap-2 rounded-md border border-slate-200/70 bg-slate-50/60 px-3 py-2 text-[12px] sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 items-center gap-2.5 text-slate-600">
                    <Avatar
                        size="sm"
                        initials={initialsFromName(creatorName)}
                        alt={creatorName}
                        border
                        contentClassName="bg-white text-slate-700"
                    />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                            <span className="truncate font-medium text-slate-800">{creatorName}</span>
                            <StatusChip variant="neutral">Oluşturan</StatusChip>
                        </div>
                        <div className="mt-0.5 text-[11px] text-slate-500">
                            Oluşturuldu: <span className="font-mono text-slate-600">{createdAtLabel}</span>
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={handleOpenLogs}
                    className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11.5px] font-medium text-slate-600 hover:border-blue-200 hover:bg-blue-50 hover:text-blue-700 sm:ml-auto"
                    title="İşlem logları"
                >
                    <History size={13} />
                    Loglar
                    {logsLoaded && logs.length > 0 && <span className="font-mono text-[10px] text-slate-400">{logs.length}</span>}
                </button>
                {activities && activities.length > 0 && (
                    <div className="flex items-center gap-1.5 text-slate-600">
                        <History size={12} className="text-slate-400" />
                        <span className="text-slate-400 uppercase tracking-wider text-[10.5px] font-semibold">Son aktivite:</span>
                        <span className="text-slate-700">{activities[0].activityType}</span>
                        {activities[0].employeeName && (
                            <span className="text-slate-500">· {activities[0].employeeName}</span>
                        )}
                        <span className="text-slate-400">· {dayjs(activities[0].activityDate).format('DD.MM.YYYY HH:mm')}</span>
                    </div>
                )}
            </div>

            {/* Top Summary Strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <SummaryStat label="Pozisyon Sayısı" value={`${detail.positions.length}`} icon={<Layers size={14} />} />
                <SummaryStat
                    label="Maliyetlenmiş"
                    value={`${detail.positions.filter((p) => p.calculation).length}`}
                    icon={<Calculator size={14} />}
                />
                <SummaryStat
                    label="Hiyerarşi Derinliği"
                    value={`${detail.positions.reduce((m, p) => Math.max(m, p.hierarchyLevel), 0) + 1}`}
                    icon={<ListTree size={14} />}
                />
                <SummaryStat label="Genel Toplam" value={fmtMoney(grandTotal)} icon={<PieChart size={14} />} primary />
            </div>

            <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_360px] gap-3">
                {/* LEFT: Tree */}
                <div className="min-w-0">
                    <Card
                        title="Pozisyon Hiyerarşisi"
                        icon={<ListTree size={13} />}
                        noPadding
                        actions={
                            isDraft && canManage ? (
                                <div className="flex flex-wrap items-center justify-end gap-2">
                                    {someRowsSelected && (
                                        <>
                                            <span className="text-[11px] font-medium text-slate-500">
                                                {selectedRows.length} seçili
                                            </span>
                                            <Button
                                                variant="secondary"
                                                size="sm"
                                                onClick={() => setBulkDiscountOpen(true)}
                                            >
                                                Toplu İndirim
                                            </Button>
                                            <Button
                                                variant="danger"
                                                size="sm"
                                                icon={<Trash2 size={11} />}
                                                onClick={() => setBulkDeleteOpen(true)}
                                            >
                                                Sil
                                            </Button>
                                        </>
                                    )}
                                    <Button variant="secondary" size="sm" icon={<Plus size={11} />} onClick={() => setAddPosOpen(true)}>
                                        Pozisyon Ekle
                                    </Button>
                                </div>
                            ) : null
                        }
                    >
                        {tree.length === 0 ? (
                            <EmptyState
                                icon={<Layers size={28} />}
                                title="Pozisyon yok"
                                description="XML içe aktarın veya manuel pozisyon ekleyin."
                            />
                        ) : (
                            <div className="overflow-x-auto">
                                <table data-tender-detail-table className="w-full min-w-[640px] table-fixed text-[11px]">
                                    <colgroup>
                                        <col className="w-[30px]" />
                                        <col className="w-[38%]" />
                                        <col className="w-[54px]" />
                                        <col className="w-[44px]" />
                                        <col className="w-[76px]" />
                                        <col className="w-[54px]" />
                                        <col className="w-[46px]" />
                                        <col className="w-[92px]" />
                                    </colgroup>
                                    <thead className="text-[10px] text-slate-500 bg-slate-50/60 border-b border-slate-100 uppercase tracking-wider">
                                        <tr>
                                            <th className="px-1.5 py-2 font-semibold text-center">
                                                <Checkbox
                                                    aria-label="Tüm satırları seç"
                                                    size="sm"
                                                    isSelected={allRowsSelected}
                                                    isIndeterminate={someRowsSelected && !allRowsSelected}
                                                    onChange={toggleAllRows}
                                                    onClick={(e) => e.stopPropagation()}
                                                />
                                            </th>
                                            <th className="px-2 py-2 font-semibold text-left">Açıklama</th>
                                            <th className="px-1.5 py-2 font-semibold text-right" title="Miktar">Mik.</th>
                                            <th className="px-1.5 py-2 font-semibold text-left" title="Birim">Br.</th>
                                            <th className="px-1.5 py-2 font-semibold text-right" title="Birim Fiyat">B. Fiyat</th>
                                            <th className="px-1.5 py-2 font-semibold text-right" title="İndirim">İnd.</th>
                                            <th className="px-1.5 py-2 font-semibold text-right">KDV</th>
                                            <th className="px-2 py-2 font-semibold text-right">Tutar</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {tree.map((node) => (
                                            <TreeRow
                                                key={node.id}
                                                node={node}
                                                level={0}
                                                expanded={expanded}
                                                onToggle={(nid) =>
                                                    setExpanded((p) => ({ ...p, [nid]: !p[nid] }))
                                                }
                                                selectedId={selectedId}
                                                onSelect={(nid) => setSelectedId(nid)}
                                                checkedIds={selectedRowIds}
                                                onCheckedChange={toggleRowSelection}
                                                isDraft={isDraft}
                                                tenderId={tender.id}
                                                onInlinePositionChange={handleInlinePositionChange}
                                                onInlineMappingChange={handleInlineMappingChange}
                                                onUpdated={() => fetchDetail(tender.id, true)}
                                            />
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr className="border-t-2 border-slate-200 bg-slate-50/40">
                                            <td colSpan={7} className="px-2 py-2 text-right font-semibold text-slate-700">
                                                GENEL TOPLAM
                                            </td>
                                            <td className="px-2 py-2 text-right text-[11px] font-bold text-slate-900 font-mono whitespace-nowrap">
                                                {fmtMoney(grandTotal)}
                                            </td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        )}
                    </Card>
                </div>

                {/* RIGHT: Detail Pane */}
                <div className="min-w-0 flex flex-col gap-3">
                    {!selected ? (
                        <Card title="Pozisyon Detayı" icon={<Tag size={13} />}>
                            <EmptyState
                                icon={<ClipboardList size={28} />}
                                title="Pozisyon seçin"
                                description="Soldaki ağaçtan bir pozisyona tıklayarak maliyetlendirme paneline erişin."
                            />
                        </Card>
                    ) : (
                        <PositionDetailPanel
                            position={selected}
                            tenderId={tender.id}
                            isDraft={isDraft}
                            canCalc={canCalc}
                            stockArticles={stockArticles}
                            stockArticlesLoading={stockArticlesLoading}
                            stockArticlesLoaded={stockArticlesLoaded}
                            activeTab={activeTab}
                            setActiveTab={setActiveTab}
                            isRoot={selected.children && selected.children.length > 0}
                            onSaveCalc={(cost) => saveCalculation(tender.id, selected.id, cost)}
                            onLocalPositionChange={handleLocalPositionChange}
                            onLocalMappingChange={handleLocalMappingChange}
                            onRemoveArticleMapping={async (mappingId) => {
                                const res = await tenderApi.removeArticleMapping(tender.id, selected.parentPositionId || selected.id, mappingId);
                                mergeArticleMappingRemoval(selected.parentPositionId || selected.id, mappingId, res.updatedCalculation);
                            }}
                            onMapArticle={async (articleId, qty, opts) => {
                                const optimisticArticle = stockArticles.find((article) => article.id === articleId);
                                const tempMappingId = `tmp-${Date.now()}`;
                                if (optimisticArticle) {
                                    useTenderStore.setState((state) => ({
                                        detail: state.detail
                                            ? {
                                                ...state.detail,
                                                positions: state.detail.positions.map((p) =>
                                                    p.id === selected.id
                                                        ? {
                                                            ...p,
                                                            articleMappings: [
                                                                ...(p.articleMappings ?? []).filter((m) => m.articleId !== articleId),
                                                                {
                                                                    id: tempMappingId,
                                                                    positionId: selected.id,
                                                                    articleId,
                                                                    quantityMultiplier: qty,
                                                                    discount: opts?.discount ?? 0,
                                                                    article: optimisticArticle,
                                                                },
                                                            ],
                                                        }
                                                        : p
                                                ),
                                            }
                                            : state.detail,
                                    }));
                                }
                                try {
                                    const mappedResult = await tenderApi.mapArticle(tender.id, selected.id, articleId, qty, opts);
                                    const mapped = mappedResult?.mapping;
                                    useTenderStore.setState((state) => ({
                                        detail: state.detail
                                            ? {
                                                ...state.detail,
                                                positions: state.detail.positions.map((p) =>
                                                    p.id === selected.id
                                                        ? {
                                                            ...p,
                                                            calculation: mappedResult?.updatedCalculation ?? p.calculation,
                                                            articleMappings: mapped
                                                                ? [
                                                                    ...(p.articleMappings ?? []).filter((m) => m.id !== mapped.id && m.id !== tempMappingId && m.articleId !== mapped.articleId),
                                                                    mapped,
                                                                ]
                                                                : p.articleMappings,
                                                        }
                                                        : p
                                                ),
                                            }
                                            : state.detail,
                                    }));
                                    toast.success('Ürün bağlandı.');
                                } catch (e: any) {
                                    useTenderStore.setState((state) => ({
                                        detail: state.detail
                                            ? {
                                                ...state.detail,
                                                positions: state.detail.positions.map((p) =>
                                                    p.id === selected.id
                                                        ? { ...p, articleMappings: p.articleMappings?.filter((m) => m.id !== tempMappingId) }
                                                        : p
                                                ),
                                            }
                                            : state.detail,
                                    }));
                                    toast.error(e.response?.data?.error || 'Ürün bağlanamadı.');
                                }
                            }}
                            onOpenNewArticle={() => setNewArticleOpen(true)}
                            onEditArticle={(articleId, positionId, mappingId) => handleOpenArticleEditor(articleId, positionId, mappingId)}
                            onSelectArticleMapping={(mappingId) => setSelectedId(mappingId)}
                            articleEditLoadingId={articleEditLoadingId}
                        />
                    )}

                    {/* Activities mini panel */}
                    {activities && activities.length > 0 && (
                        <Card title="Aktivite Geçmişi" icon={<History size={13} />} noPadding>
                            <ul className="divide-y divide-slate-100 max-h-[220px] overflow-y-auto">
                                {activities.map((a) => (
                                    <li key={a.id} className="px-3 py-2 text-[12px]">
                                        <div className="flex items-center gap-1.5">
                                            <span className="text-[10px] font-mono uppercase tracking-wider px-1 py-px bg-blue-50 text-blue-700 rounded">
                                                {a.activityType}
                                            </span>
                                            <span className="text-slate-700 truncate">{a.employeeName || a.employeeId}</span>
                                            <span className="text-slate-400 text-[10.5px] ml-auto">{dayjs(a.activityDate).format('DD.MM.YYYY HH:mm')}</span>
                                        </div>
                                        {a.description && (
                                            <p className="text-slate-500 text-[11.5px] mt-0.5">{a.description}</p>
                                        )}
                                    </li>
                                ))}
                            </ul>
                        </Card>
                    )}
                </div>
            </div>

            {/* Add Position */}
            <AddPositionModal
                open={addPosOpen}
                onClose={() => setAddPosOpen(false)}
                positions={detail.positions}
                onSubmit={async (data) => {
                    try {
                        await addPosition(tender.id, data);
                        if (data.parentPositionId) {
                            await useTenderStore.getState().updatePosition(tender.id, data.parentPositionId, {
                                quantity: 0,
                                unit: null,
                                unitPrice: null,
                                discount: null,
                            });
                        }
                        toast.success('Pozisyon eklendi.');
                        setAddPosOpen(false);
                    } catch (e: any) {
                        toast.error(e.response?.data?.error || 'Pozisyon eklenemedi.');
                    }
                }}
            />

            {/* New Article */}
            <NewArticleModal
                open={newArticleOpen}
                onClose={() => setNewArticleOpen(false)}
                onSubmit={async (data) => {
                    try {
                        const created = await createArticle(data);
                        useTenderStore.setState((state) => ({
                            stockArticles: [
                                {
                                    ...created,
                                    totalQuantity: 0,
                                    reservedQuantity: 0,
                                    availableQuantity: 0,
                                    minStockLevel: 0,
                                    criticalStockLevel: 0,
                                    maxStockLevel: null,
                                    status: 'ACTIVE',
                                    isActive: true,
                                    locations: [],
                                } as any,
                                ...state.stockArticles,
                            ],
                            stockArticlesLoaded: true,
                        }));
                        toast.success('Ürün oluşturuldu.');
                        setNewArticleOpen(false);
                    } catch (e: any) {
                        toast.error(e.response?.data?.error || 'Ürün oluşturulamadı.');
                    }
                }}
            />

            <Modal
                open={bulkDeleteOpen}
                onClose={() => !bulkActionLoading && setBulkDeleteOpen(false)}
                title="Toplu Silme"
                description={`${selectedRows.length} satır seçildi. Üst pozisyon seçiliyse alt satırları tek işlemde silinir.`}
                width="sm"
                closeOnBackdrop={!bulkActionLoading}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)} disabled={bulkActionLoading}>
                            Vazgeç
                        </Button>
                        <Button variant="danger" loading={bulkActionLoading} onClick={handleBulkDelete}>
                            Sil
                        </Button>
                    </>
                }
            >
                <div className="space-y-3 text-[13px]">
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">
                        Silmek istediğinizden emin misiniz?
                    </div>
                    <div className="rounded-md border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            Silinecek satırlar ({deleteTargetRows.length})
                        </div>
                        <ul className="max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                            {deleteTargetRows.slice(0, 8).map((row) => (
                                <li key={row.id} className="px-3 py-2">
                                    <div className="font-medium text-slate-800">{row.shortDescription}</div>
                                    <div className="text-[11px] font-mono text-slate-500">{row.positionNumber}</div>
                                </li>
                            ))}
                            {deleteTargetRows.length > 8 && (
                                <li className="px-3 py-2 text-slate-500">+{deleteTargetRows.length - 8} satır daha</li>
                            )}
                        </ul>
                    </div>
                </div>
            </Modal>

            <Modal
                open={bulkDiscountOpen}
                onClose={() => !bulkActionLoading && setBulkDiscountOpen(false)}
                title="Toplu İndirim"
                description="İndirim yalnızca altında öğe bulunmayan seçili pozisyonlara ve ürün satırlarına uygulanır."
                width="sm"
                closeOnBackdrop={!bulkActionLoading}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkDiscountOpen(false)} disabled={bulkActionLoading}>
                            Vazgeç
                        </Button>
                        <Button
                            variant="primary"
                            loading={bulkActionLoading}
                            disabled={discountEligibleRows.length === 0}
                            onClick={handleBulkDiscount}
                        >
                            Toplu İndirim Yap
                        </Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Field label="İndirim (%)">
                        <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            value={bulkDiscountValue}
                            onChange={(e) => setBulkDiscountValue(parseFloat(e.target.value) || 0)}
                        />
                    </Field>
                    <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">Uygulanacak</div>
                            <div className="mt-1 font-mono text-lg font-semibold text-emerald-900">{discountEligibleRows.length}</div>
                        </div>
                        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
                            <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">Atlanacak</div>
                            <div className="mt-1 font-mono text-lg font-semibold text-slate-700">{discountSkippedRows.length}</div>
                        </div>
                    </div>
                    {discountSkippedRows.length > 0 && (
                        <div className="rounded-md border border-slate-200 bg-white">
                            <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                                Alt öğesi olduğu için indirim almayacak
                            </div>
                            <ul className="max-h-[140px] overflow-y-auto divide-y divide-slate-100">
                                {discountSkippedRows.slice(0, 6).map((row) => (
                                    <li key={row.id} className="px-3 py-2 text-[12px]">
                                        <span className="font-mono text-slate-500">{row.positionNumber}</span>
                                        <span className="ml-2 text-slate-700">{row.shortDescription}</span>
                                    </li>
                                ))}
                                {discountSkippedRows.length > 6 && (
                                    <li className="px-3 py-2 text-[12px] text-slate-500">+{discountSkippedRows.length - 6} satır daha</li>
                                )}
                            </ul>
                        </div>
                    )}
                </div>
            </Modal>

            {editingArticle && (
                <TenderArticleFormModal
                    initial={editingArticle.article}
                    onClose={() => setEditingArticle(null)}
                    onSubmit={async (data) => {
                        if (!editingArticle.article.id) return;
                        try {
                            const payload: any = {
                                ...data,
                                tenderId: tender.id,
                                positionId: editingArticle.positionId,
                                mappingId: editingArticle.mappingId,
                            };
                            // Remove stock-related fields — stock is managed independently
                            delete payload.adjustQty;
                            delete payload.adjustMovementType;
                            delete payload.adjustLocationId;

                            await articleApi.update(editingArticle.article.id, payload);
                            await Promise.all([
                                fetchStockArticles(true),
                                fetchDetail(tender.id, true),
                            ]);
                            toast.success('Ürün güncellendi.');
                            setEditingArticle(null);
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Ürün güncellenemedi.');
                        }
                    }}
                />
            )}

            <TenderLogsSheet
                open={logsOpen}
                logs={logs}
                loading={logsLoading}
                onClose={() => setLogsOpen(false)}
            />

            {/* Export */}
            <ExportModal
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                tenderId={tender.id}
                tenderNumber={tender.tenderNumber}
                tree={tree}
                grandTotal={grandTotal}
            />

            <TenderSettingsModal
                open={tenderSettingsOpen}
                onClose={() => setTenderSettingsOpen(false)}
                tenderId={tender.id}
                tree={tree}
                grandTotal={grandTotal}
                overtimeHourlyRate={overtimeHourlyRate}
                onOvertimeHourlyRateChange={setOvertimeHourlyRate}
                onChanged={() => fetchDetail(tender.id, true)}
            />
        </div>
    );
};
