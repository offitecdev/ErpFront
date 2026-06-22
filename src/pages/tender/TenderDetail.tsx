import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Pagination } from 'antd';
import { LuTable2 as MdTableChart } from 'react-icons/lu';
import {
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    Calculator,
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ClockRewind as History,
    FileCheck02 as FileCheck2,
    File05 as FileText,
    FileDownload02 as FileDown,
    GitBranch01 as GitBranch,
    Image01 as ImageIcon,
    List as ListTree,
    Package,
    Plus,
    Send01 as Send,
    Trash01 as Trash2,
    TrendDown01 as TrendingDown,
    TrendUp01 as TrendingUp,
    UploadCloud02 as Upload,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { Checkbox } from '../../components/ui-shared/Checkbox';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { apiClient } from '../../lib/axios';
import { tenderApi } from '../../lib/api/tender';
import { projectApi, type SalesOrderMode } from '../../lib/api/project';
import { articleApi as inventoryArticleApi } from '../../lib/api/inventory';
import type { PositionDto, TenderChangeLog, TenderChatterSummary, TenderDocumentDto, TenderFormat, TenderListItem } from '../../types/tender';
import type { ArticleStockSummary, InventoryArticle } from '../../types/inventory';
import type { ProjectDto } from '../../types/project';

import {
    ExportModal,
    RichTextMarkdownEditor,
    TenderArticleFormModal,
    TenderSettingsModal,
    markdownToHtml,
} from './detail/TenderDetailComponents';
import {
    STATUS_VARIANT,
    buildTree,
    fmtMoney,
    getStatusLabel,
    mergePositionUpdate,
} from './detail/tenderDetailUtils';

import { t } from '@/i18n/translate';
import i18n from '@/i18n';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick((t: number) => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

type InlinePositionPatch = Pick<
    Partial<PositionDto>,
    'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate' | 'shortDescription' | 'longDescription' | 'rowType' | 'imageUrl'
>;

type ProductSource = {
    id?: string | null;
    articleCode?: string | null;
    name?: string | null;
    description?: string | null;
    unit?: string | null;
    baseCost?: number | null;
    salePrice?: number | null;
    weightedAverageCost?: number | null;
    costBasisQuantity?: number | null;
    supplierCostQuantity?: number | null;
    manualCostQuantity?: number | null;
    imageUrl?: string | null;
};

type ManualProductForm = {
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
    discount: number;
    taxRate: number;
    description: string;
    imageUrl: string;
};

type SimpleTenderLine = {
    id: string;
    label: string;
    kind: 'TITLE' | 'DESCRIPTION' | 'PRODUCT';
    position: PositionDto;
    total: number;
};

type ChatterTimelineItem = {
    id: string;
    date: string;
    actor: string;
    tone: string;
    title: string;
    body: string;
    document?: TenderDocumentDto;
};

type DetailInfoRow = {
    label: string;
    lines?: Array<string | null | undefined>;
    content?: ReactNode;
};

type CustomerOption = {
    id: string;
    companyName: string;
    segment?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    taxNumber?: string | null;
};

type TenderLineColumnKey = 'select' | 'description' | 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate' | 'total';

const DEFAULT_VAT = 8.1;
const SECTION_SCHEMA_STORAGE_KEY = 'offitec:tender-detail:section-schema-open';
const EMPTY_CHATTER_SUMMARY: TenderChatterSummary = { noteCount: 0, documentCount: 0, logCount: 0 };
const DEFAULT_TENDER_LINE_COLUMN_WIDTHS: Record<TenderLineColumnKey, number> = {
    select: 34,
    description: 720,
    quantity: 88,
    unit: 88,
    unitPrice: 96,
    discount: 70,
    taxRate: 70,
    total: 104,
};

type TenderSettingsTabKey = 'mail' | 'schedule' | 'overtime' | 'materials';
type TenderWorkspaceTabKey = 'lines' | TenderSettingsTabKey | 'technician' | 'assets';

const getTenderWorkspaceTabs = (): Array<{
    key: TenderWorkspaceTabKey;
    label: string;
    settingsTab?: TenderSettingsTabKey;
    disabled?: boolean;
}> => [
    { key: 'lines', label:t('tenders.tender_satirlari') },
    { key: 'mail', label:t('tenders.tender_maili'), settingsTab: 'mail' },
    { key: 'overtime', label:t('tenders.additional_fee'), settingsTab: 'overtime' },
    { key: 'schedule', label:t('tenders.appointment_saatleri'), settingsTab: 'schedule' },
    { key: 'materials', label:t('nav.materials'), settingsTab: 'materials' },
    { key: 'technician', label:t('tenders.technician_ata'), disabled: true },
    { key: 'assets', label:t('tenders.yazilar_gorseller'), disabled: true },
];

const initialsFromName = (value?: string | null) => {
    const cleaned = value?.trim();
    if (!cleaned) return '?';
    const parts = cleaned.split(/\s+/).filter(Boolean);
    const source = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : [cleaned];
    return source.map((part) => part.charAt(0)).join('').slice(0, 2).toUpperCase();
};

const normalizeRowType = (value?: string | null) => String(value || '').toUpperCase();

const getLineKind = (position: PositionDto): SimpleTenderLine['kind'] => {
    const normalized = normalizeRowType(position.rowType);
    if (normalized === 'DESCRIPTION') return 'DESCRIPTION';
    if (normalized === 'TITLE' || normalized === 'SECTION') return 'TITLE';
    if (normalized === 'PRODUCT' || normalized === 'CUSTOM') return 'PRODUCT';

    const hasProductData = Boolean(position.sourceArticleId)
        || position.unitPrice != null
        || Number(position.quantity || 0) > 0
        || Boolean(position.unit);
    return hasProductData ? 'PRODUCT' : 'TITLE';
};

const parseInlineNumber = (value: string, max?: number) => {
    const normalized = value.replace(/'/g, '').replace(',', '.');
    const parsed = Number(normalized);
    const safe = Number.isFinite(parsed) ? Math.max(parsed, 0) : 0;
    return max == null ? safe : Math.min(safe, max);
};

const lineTotal = (position: PositionDto, fallbackTaxRate: number) => {
    if (getLineKind(position) !== 'PRODUCT') return 0;

    const net = lineNetTotal(position);
    const taxRate = Number(position.taxRate || fallbackTaxRate || DEFAULT_VAT);
    return net * (1 + taxRate / 100);
};

const lineNetTotal = (position: PositionDto) => {
    if (getLineKind(position) !== 'PRODUCT') return 0;

    const quantity = Number(position.quantity || 0);
    const unitPrice = position.unitPrice == null ? null : Number(position.unitPrice);
    const discount = Number(position.discount || 0);
    const calculationTotal = Math.max(0, Number(position.calculation?.totalCalculatedPrice || 0));
    return unitPrice != null && quantity > 0
        ? quantity * unitPrice * (1 - discount / 100)
        : calculationTotal;
};

const plainTextPreview = (value?: string | null) =>
    String(value || '')
        .replace(/^#{1,6}\s+/gm, '')
        .replace(/^\s*-\s+/gm, '')
        .replace(/[*_`]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

const importedMetaLinePattern = /^(Auftragspositionen:|Auftragspositionen\/|Nettobetrag:|Steuern:|Marge:|Mitteilungen\/|Auftragsreferenz:|Kunde:)/i;

const cleanImportedProductDescription = (value?: string | null) => {
    const lines = String(value || '').split(/\r?\n/);
    const firstMetaIndex = lines.findIndex((line) => importedMetaLinePattern.test(line.trim()));
    const kept = firstMetaIndex >= 0 ? lines.slice(0, firstMetaIndex) : lines;
    return kept.join('\n').replace(/\n{3,}/g, '\n\n').trim();
};

const fileToDataUrl = (file: File) =>
    new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error || new Error(t('tenders.file_okunamadi')));
        reader.readAsDataURL(file);
    });

const isPreviewableDocument = (doc: Pick<TenderDocumentDto, 'fileType' | 'fileUrl'>) =>
    doc.fileType.startsWith('image/') || /^data:image\//i.test(doc.fileUrl);

const isPdfDocument = (doc: Pick<TenderDocumentDto, 'fileType' | 'fileName' | 'fileUrl'>) =>
    doc.fileType === 'application/pdf' || /\.pdf$/i.test(doc.fileName) || /^data:application\/pdf/i.test(doc.fileUrl);

const normalizeDocumentName = (value?: string | null) =>
    String(value || '')
        .replace(/^Ek dosya eklendi:\s*/i, '')
        .trim()
        .toLocaleLowerCase('tr-TR');

const logMergeKey = (log: TenderChangeLog) =>
    [log.actionType, log.fieldName || '', log.newValue || '', log.description || ''].join('|');

const mergeTenderLogs = (incoming: TenderChangeLog[], existing: TenderChangeLog[], preserveExisting = false) => {
    const incomingKeys = new Set(incoming.map(logMergeKey));
    const merged = new Map<string, TenderChangeLog>();

    incoming.forEach((log) => merged.set(log.id, log));
    if (preserveExisting) {
        existing.forEach((log) => {
            if (log.id.startsWith('local-') && incomingKeys.has(logMergeKey(log))) return;
            if (!merged.has(log.id)) merged.set(log.id, log);
        });
    }

    return Array.from(merged.values()).sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf());
};

const sortPositions = (positions: PositionDto[]) =>
    [...positions].sort((a, b) => {
        const orderA = a.displayOrder ?? Number.MAX_SAFE_INTEGER;
        const orderB = b.displayOrder ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) return orderA - orderB;
        return String(a.positionNumber || '').localeCompare(String(b.positionNumber || ''), undefined, { numeric: true });
    });

const buildSimpleTenderLines = (positions: PositionDto[], fallbackTaxRate: number): SimpleTenderLine[] => {
    let rootIndex = 0;
    let activeTitleIndex: number | null = null;
    let childIndex = 0;

    return sortPositions(positions).map((position) => {
        const kind = getLineKind(position);

        let label = '';
        if (kind === 'TITLE') {
            rootIndex += 1;
            activeTitleIndex = rootIndex;
            childIndex = 0;
            label = String(rootIndex);
        } else if (kind === 'PRODUCT') {
            if (activeTitleIndex == null) {
                rootIndex += 1;
                label = String(rootIndex);
            } else {
                childIndex += 1;
                label = `${activeTitleIndex}.${childIndex}`;
            }
        }

        return {
            id: position.id,
            label,
            kind,
            position,
            total: lineTotal(position, fallbackTaxRate),
        };
    });
};

const LINE_PAGE_SIZE = 10;
const lineActionButtonClass = '!border-slate-200 !bg-white !text-slate-700 transition-colors hover:!border-[#272f67] hover:!bg-slate-50 hover:!text-[#272f67]';

const toPlainMarkdown = (value?: string | null) => {
    const lines = String(value || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);

    if (lines.length === 0) return '';
    return lines
        .map((line) => line.replace(/^[-•]\s*/, ''))
        .join('\n');
};

const emptyManualProduct = (name = '', taxRate = DEFAULT_VAT): ManualProductForm => ({
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

const suggestTenderNumber = () => {
    const year = dayjs().year();
    const rand = Math.floor(Math.random() * 9000) + 1000;
    const lang = i18n.language;
    const prefix = lang === 'de' ? 'T' : lang === 'en' ? 'A' : 'TKF';
    return `${prefix}-${year}-${rand}`;
};

const defaultTenderValidUntil = () => dayjs().add(1, 'month').format('YYYY-MM-DD');
const formatTenderFormatLabel = (format?: TenderFormat | string | null) => (format === 'SIA451' ?t('tenders.sia_451') : String(format || ''));

const isSourceSalesOrder = (value?: string | null) => {
    const normalized = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    return ['verkaufsauftrag','sales_order','sale_order', 'sipariste', 'siparis', 'auftrag'].includes(normalized);
};

const normalizeRows = <T,>(value: any): T[] => {
    if (Array.isArray(value)) return value;
    if (Array.isArray(value?.items)) return value.items;
    if (Array.isArray(value?.customers)) return value.customers;
    if (Array.isArray(value?.data)) return value.data;
    return [];
};

const loadCustomerOptions = async () => {
    const res = await apiClient.get('/customers?page=1&pageSize=200');
    return normalizeRows<CustomerOption>(res.data);
};

const emptyStockArticle = (name = ''): Partial<InventoryArticle> => ({
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

const getArticleSalePrice = (article?: ProductSource | null, fallback = 0) => {
    const salePrice = Number(article?.salePrice ?? 0);
    if (salePrice > 0) return salePrice;
    const baseCost = Number(article?.baseCost ?? 0);
    return baseCost > 0 ? baseCost : fallback;
};

const getArticleUnitCost = (article?: ProductSource | null) => {
    const weightedAverageCost = Number(article?.weightedAverageCost ?? 0);
    if (weightedAverageCost > 0) return weightedAverageCost;
    return Math.max(0, Number(article?.baseCost ?? 0));
};

const getArticleCostSourceLabel = (article?: ProductSource | null) => {
    if (!article) return t('tenders.cost_info_not_found');
    const supplierQty = Number(article.supplierCostQuantity ?? 0);
    const manualQty = Number(article.manualCostQuantity ?? 0);
    const basisQty = Number(article.costBasisQuantity ?? 0);
    if (basisQty > 0 && supplierQty > 0 && manualQty > 0) return t('tenders.agirlikli_average_supply_manual_stock');
    if (basisQty > 0 && supplierQty > 0) return t('tenders.agirlikli_average_supply_kayitlari');
    if (basisQty > 0 && manualQty > 0) return t('tenders.manual_stock_cost');
    return t('tenders.product_karti_cost');
};

const buildProductDefaults = (
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

const buildMissingStockDefaultsPatch = (
    position: PositionDto,
    article: InventoryArticle,
): Partial<PositionDto> => {
    const patch: Partial<PositionDto> = {};
    const currentTitle = position.shortDescription?.trim();

    if ((!currentTitle || currentTitle === t('tenders.product')) && article.name) patch.shortDescription = article.name;
    if (!position.longDescription && article.description) patch.longDescription = article.description;
    if (!position.unit && article.unit) patch.unit = article.unit;
    const salePrice = getArticleSalePrice(article);
    if ((position.unitPrice == null || Number(position.unitPrice) <= 0) && salePrice > 0) {
        patch.unitPrice = salePrice;
    }
    if (!position.imageUrl && article.imageUrl) patch.imageUrl = article.imageUrl;

    return patch;
};

const createTempPositionId = () => `local-position-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const normalizeInlinePatchValue = (value: unknown) => (value == null || value === '' ? null : value);

const isInlinePatchConfirmed = (position: PositionDto, patch: InlinePositionPatch) =>
    (Object.entries(patch) as Array<[keyof InlinePositionPatch, InlinePositionPatch[keyof InlinePositionPatch]]>).every(([field, value]) =>
        normalizeInlinePatchValue(position[field]) === normalizeInlinePatchValue(value),
    );

export const TenderDetail = () => {
    useLanguageRefresh();
    const { id } = useParams();
    const navigate = useNavigate();
    const isCreatingTender = id === 'new';
    const { settings: pdfSettings } = usePdfSettingsStore();
    const { permissions, user } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canApprove = permissions.length === 0 || permissions.includes('tenders.approve');
    const canExport = permissions.length === 0 || permissions.includes('tenders.export');

    const {
        detail,
        loadingDetail,
        fetchDetail,
        stockArticles,
        stockArticlesLoading,
        stockArticlesLoaded,
        fetchStockArticles,
        activities,
        fetchActivities,
        logs,
        createTender,
        createVersion,
    } = useTenderStore();

    const fallbackTaxRate = pdfSettings.vatRate ?? DEFAULT_VAT;
    const minimumTenderValidUntil = useMemo(() => defaultTenderValidUntil(), []);
    const [newTenderForm, setNewTenderForm] = useState({
        customerId: '',
        tenderNumber: suggestTenderNumber(),
        format: 'SIA451' as TenderFormat,
        validUntil: defaultTenderValidUntil(),
    });
    const [newTenderCustomerQuery, setNewTenderCustomerQuery] = useState('');
    const [newTenderCustomerOpen, setNewTenderCustomerOpen] = useState(false);
    const [newTenderCustomers, setNewTenderCustomers] = useState<CustomerOption[]>([]);
    const [newTenderCustomersLoading, setNewTenderCustomersLoading] = useState(false);
    const [newTenderSubmitting, setNewTenderSubmitting] = useState(false);
    const [metaSaving, setMetaSaving] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [productPickerOpen, setProductPickerOpen] = useState(false);
    const [productPickerAfterRowId, setProductPickerAfterRowId] = useState<string | undefined>(undefined);
    const [productSearch, setProductSearch] = useState('');
    const [manualProductOpen, setManualProductOpen] = useState(false);
    const [manualProduct, setManualProduct] = useState<ManualProductForm>(() => emptyManualProduct('', fallbackTaxRate));
    const [stockArticleInitial, setStockArticleInitial] = useState<Partial<InventoryArticle> | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
    const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(0);
    const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDiscountOpen, setBulkDiscountOpen] = useState(false);
    const [bulkDiscountValue, setBulkDiscountValue] = useState<number>(0);
    const [bulkActionLoading, setBulkActionLoading] = useState(false);
    const [chatterOpen, setChatterOpen] = useState(false);
    const [logsLoading, setLogsLoading] = useState(false);
    const [logsLoaded, setLogsLoaded] = useState(false);
    const [chatterSummary, setChatterSummary] = useState<TenderChatterSummary>(EMPTY_CHATTER_SUMMARY);
    const [chatterSummaryLoading, setChatterSummaryLoading] = useState(false);
    const [tenderDocuments, setTenderDocuments] = useState<TenderDocumentDto[]>([]);
    const [documentPreview, setDocumentPreview] = useState<TenderDocumentDto | null>(null);
    const [documentsLoading, setDocumentsLoading] = useState(false);
    const [noteText, setNoteText] = useState('');
    const [noteSaving, setNoteSaving] = useState(false);
    const [documentSaving, setDocumentSaving] = useState(false);
    const [projectCreateLoading, setProjectCreateLoading] = useState(false);
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
    const [orderDecisionOpen, setOrderDecisionOpen] = useState(false);
    const [orderDecisionLoading, setOrderDecisionLoading] = useState(false);
    const [orderMode, setOrderMode] = useState<SalesOrderMode>('PROJECT_NEW');
    const [attachExistingProject, setAttachExistingProject] = useState(false);
    const [orderProjectName, setOrderProjectName] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [projectSearchLoading, setProjectSearchLoading] = useState(false);
    const [projectSearchResults, setProjectSearchResults] = useState<ProjectDto[]>([]);
    const [selectedExistingProject, setSelectedExistingProject] = useState<ProjectDto | null>(null);
    const [localPositions, setLocalPositions] = useState<PositionDto[]>([]);
    const [linePage, setLinePage] = useState(1);
    const [workspaceTab, setWorkspaceTab] = useState<TenderWorkspaceTabKey>('lines');
    const [settingsInitialTab, setSettingsInitialTab] = useState<TenderSettingsTabKey>('mail');
    const [sectionSchemaOpen, setSectionSchemaOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.localStorage.getItem(SECTION_SCHEMA_STORAGE_KEY) !== 'false';
    });
    const positionPatchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
    const positionPatchSeq = useRef<Record<string, number>>({});
    const pendingPositionPatches = useRef<Record<string, InlinePositionPatch>>({});
    const optimisticPositionIds = useRef<Record<string, string | null>>({});
    const stockDefaultSyncChecked = useRef<Record<string, boolean>>({});
    const createDraftStarted = useRef(false);
    const documentInputRef = useRef<HTMLInputElement>(null);
    const prevRowCountRef = useRef(0);

    useEffect(() => {
        const positions = detail?.positions ?? [];
        setLocalPositions(
            positions.map((position) => {
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
            }),
        );
    }, [detail?.positions]);

    useEffect(() => {
        return () => {
            Object.values(positionPatchTimers.current).forEach(clearTimeout);
        };
    }, []);

    useEffect(() => {
        if (!orderDecisionOpen || !attachExistingProject) return;
        const timer = window.setTimeout(() => {
            setProjectSearchLoading(true);
            projectApi.list({ search: projectSearch.trim() || undefined })
                .then((projects) => setProjectSearchResults(projects.slice(0, 8)))
                .catch(() => setProjectSearchResults([]))
                .finally(() => setProjectSearchLoading(false));
        }, 220);

        return () => window.clearTimeout(timer);
    }, [attachExistingProject, orderDecisionOpen, projectSearch]);

    useEffect(() => {
        if (id) {
            stockDefaultSyncChecked.current = {};
            prevRowCountRef.current = 0;
            setLinePage(1);
            setCreatedProjectId(null);
            setTenderDocuments([]);
            setChatterSummary(EMPTY_CHATTER_SUMMARY);
            setNoteText('');
            useTenderStore.setState({ logs: [], detail: isCreatingTender ? null : useTenderStore.getState().detail });
        }
        if (!id || isCreatingTender) {
            setLogsLoaded(false);
            setChatterOpen(false);
            setLocalPositions([]);
            return;
        }
        if (id) {
            fetchDetail(id);
            fetchActivities(id);
            setLogsLoaded(false);
            setChatterOpen(false);
            useTenderStore.setState({ logs: [] });
        }
    }, [id, isCreatingTender, fetchDetail, fetchActivities]);

    useEffect(() => {
        if (!isCreatingTender || createDraftStarted.current) return;
        if (!canManage) {
            toast.error(t('tenders.bu_action_icin_yetkiniz_not_found'));
            navigate('/crm/tenders');
            return;
        }
        createDraftStarted.current = true;
        setNewTenderSubmitting(true);
        const tenderNumber = suggestTenderNumber();
        createTender({
            tenderNumber,
            format: 'SIA451',
            validUntil: minimumTenderValidUntil,
        })
            .then((created) => {
                toast.success(t('tenders.tender_taslagi_created', { number: tenderNumber }));
                navigate(`/crm/tenders/${created.id}`, { replace: true });
            })
            .catch(async (error: any) => {
                const message = String(error.response?.data?.error || '');
                const needsCustomerFallback = error.response?.status === 400 && /müşteri|musteri|customer/i.test(message);
                if (needsCustomerFallback) {
                    try {
                        const customers = newTenderCustomers.length ? newTenderCustomers : await loadCustomerOptions();
                        const fallbackCustomer = customers[0];
                        if (!fallbackCustomer) throw new Error(t('tenders.customer_not_found'));
                        setNewTenderCustomers(customers);
                        const created = await createTender({
                            customerId: fallbackCustomer.id,
                            tenderNumber,
                            format: 'SIA451',
                            validUntil: minimumTenderValidUntil,
                        });
                        toast.success(t('tenders.tender_taslagi_created', { number: tenderNumber }));
                        navigate(`/crm/tenders/${created.id}`, { replace: true });
                        return;
                    } catch (fallbackError: any) {
                        error = fallbackError;
                    }
                }
                createDraftStarted.current = false;
                toast.error(error.response?.data?.error || error.message ||t('tenders.tender_olusturulamadi'));
                navigate('/crm/tenders', { replace: true });
            })
            .finally(() => setNewTenderSubmitting(false));
    }, [canManage, createTender, isCreatingTender, minimumTenderValidUntil, navigate]);

    useEffect(() => {
        if (!isCreatingTender) return;
        setNewTenderForm({
            customerId: '',
            tenderNumber: suggestTenderNumber(),
            format: 'SIA451',
            validUntil: defaultTenderValidUntil(),
        });
        setNewTenderCustomerQuery('');
    }, [isCreatingTender]);

    useEffect(() => {
        if (!canManage) return;
        let cancelled = false;
        setNewTenderCustomersLoading(true);
        loadCustomerOptions()
            .then((rows) => {
                if (!cancelled) setNewTenderCustomers(rows);
            })
            .catch(() => {
                if (!cancelled) setNewTenderCustomers([]);
            })
            .finally(() => {
                if (!cancelled) setNewTenderCustomersLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [canManage]);

    useEffect(() => {
        if (isCreatingTender || newTenderCustomerOpen) return;
        setNewTenderCustomerQuery(detail?.tender.customerName || '');
    }, [detail?.tender.customerName, isCreatingTender, newTenderCustomerOpen]);

    useEffect(() => {
        if (!productPickerOpen || stockArticlesLoaded || stockArticlesLoading) return;
        void fetchStockArticles();
    }, [productPickerOpen, stockArticlesLoaded, stockArticlesLoading, fetchStockArticles]);

    useEffect(() => {
        if (!detail?.tender.id || stockArticlesLoaded || stockArticlesLoading) return;
        const hasProductRows = localPositions.some((position) => getLineKind(position) === 'PRODUCT' && !!position.sourceArticleId);
        if (!hasProductRows && detail.tender.status !== "Draft") return;
        const timer = window.setTimeout(() => {
            void fetchStockArticles();
        }, 250);
        return () => window.clearTimeout(timer);
    }, [detail?.tender.id, detail?.tender.status, fetchStockArticles, localPositions, stockArticlesLoaded, stockArticlesLoading]);

    const tree = useMemo(() => buildTree(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const simpleRows = useMemo(() => buildSimpleTenderLines(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const displayRows = simpleRows;
    const linePageCount = Math.max(1, Math.ceil(displayRows.length / LINE_PAGE_SIZE));
    const currentLinePage = Math.min(linePage, linePageCount);
    const pagedRows = useMemo(
        () => displayRows.slice((currentLinePage - 1) * LINE_PAGE_SIZE, currentLinePage * LINE_PAGE_SIZE),
        [currentLinePage, displayRows],
    );
    const grandTotal = useMemo(() => simpleRows.reduce((sum, row) => sum + row.total, 0), [simpleRows]);
    const selectedRows = useMemo(
        () => simpleRows.filter((row) => selectedRowIds[row.id]),
        [simpleRows, selectedRowIds],
    );
    const selectedLine = useMemo(
        () => simpleRows.find((row) => row.id === selectedId) ?? null,
        [simpleRows, selectedId],
    );
    const discountEligibleRows = selectedRows.filter((row) => row.kind === 'PRODUCT');
    const allRowsSelected = simpleRows.length > 0 && selectedRows.length === simpleRows.length;
    const someRowsSelected = selectedRows.length > 0;
    const filteredStockArticles = useMemo(() => {
        const query = productSearch.trim().toLocaleLowerCase('tr-TR');
        const rows = stockArticles.filter((article) => {
            if (!query) return true;
            return [
                article.articleCode,
                article.name,
                article.description,
                article.systemBarcode,
                article.supplierBarcode,
                article.category,
            ].some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(query));
        });
        return rows.slice(0, 80);
    }, [productSearch, stockArticles]);
    const selectedNewTenderCustomer = useMemo(
        () => newTenderCustomers.find((customer) => customer.id === newTenderForm.customerId) || null,
        [newTenderCustomers, newTenderForm.customerId],
    );
    const currentTenderCustomerName = String(detail?.tender.customerName || '').trim().toLocaleLowerCase('tr-TR');
    const filteredNewTenderCustomers = useMemo(() => {
        const query = newTenderCustomerQuery.trim().toLocaleLowerCase('tr-TR');
        const shouldFilter = query && query !== currentTenderCustomerName;
        const rows = shouldFilter
            ? newTenderCustomers.filter((customer) => [
                customer.companyName,
                customer.segment,
                customer.address,
                customer.mainEmail,
                customer.mainPhone,
            ].some((value) => String(value || '').toLocaleLowerCase('tr-TR').includes(query)))
            : newTenderCustomers;
        return rows.slice(0, 30);
    }, [currentTenderCustomerName, newTenderCustomerQuery, newTenderCustomers]);
    const fixedLineColumnStyle = (key: TenderLineColumnKey) => ({ width: DEFAULT_TENDER_LINE_COLUMN_WIDTHS[key] });
    const renderLineHeader = (
        label: string,
        options: { align?: 'left' | 'right' | 'center'; className?: string; noTruncate?: boolean } = {},
    ) => {
        const align = options.align ?? 'right';
        return (
            <th
                className={`border-l border-slate-200/70 px-1.5 py-2 font-semibold ${align === 'left' ? 'text-left' : align === 'center' ? 'text-center' : 'text-right'} ${options.className || ''}`}
            >
                <span className={`block ${options.noTruncate ? 'whitespace-nowrap' : 'truncate'}`}>{label}</span>
            </th>
        );
    };

    const handleInlinePositionChange = useCallback((positionId: string, patch: InlinePositionPatch) => {
        if (!id) return;
        const resolvedPositionId = optimisticPositionIds.current[positionId];
        const isPendingCreate = positionId.startsWith('local-position-') && resolvedPositionId === null;
        const targetPositionId = resolvedPositionId || positionId;

        setLocalPositions((positions) =>
            positions.map((position) =>
                position.id === positionId ? { ...position, ...patch } : position,
            ),
        );

        if (isPendingCreate) {
            pendingPositionPatches.current[positionId] = {
                ...(pendingPositionPatches.current[positionId] ?? {}),
                ...patch,
            };
            return;
        }

        pendingPositionPatches.current[targetPositionId] = {
            ...(pendingPositionPatches.current[targetPositionId] ?? {}),
            ...patch,
        };
        const seq = (positionPatchSeq.current[targetPositionId] ?? 0) + 1;
        positionPatchSeq.current[targetPositionId] = seq;

        clearTimeout(positionPatchTimers.current[targetPositionId]);
        positionPatchTimers.current[targetPositionId] = setTimeout(async () => {
            const payload = pendingPositionPatches.current[targetPositionId];
            if (!payload) return;

            try {
                const updated = await tenderApi.updatePosition(id, targetPositionId, payload);
                if (positionPatchSeq.current[targetPositionId] !== seq) return;
                const localPatch = pendingPositionPatches.current[targetPositionId] ?? {};
                setLocalPositions((positions) =>
                    positions.map((position) =>
                        position.id === targetPositionId
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
            } catch (err: any) {
                toast.error(err.response?.data?.error ||t('tenders.line_guncellenemedi'));
            }
        }, 500);
    }, [id]);

    useEffect(() => {
        setSelectedRowIds((prev) => {
            const validIds = new Set(simpleRows.map((row) => row.id));
            const next = Object.fromEntries(Object.entries(prev).filter(([rowId, checked]) => checked && validIds.has(rowId)));
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [simpleRows]);

    useEffect(() => {
        const count = simpleRows.length;
        const pageCount = Math.max(1, Math.ceil(count / LINE_PAGE_SIZE));
        // Only jump to the last page when the user appends rows after the
        // initial load — on first load (or tender switch) stay on page 1.
        if (prevRowCountRef.current > 0 && count > prevRowCountRef.current) {
            setLinePage(pageCount);
        } else {
            setLinePage((prev) => Math.min(Math.max(1, prev), pageCount));
        }
        prevRowCountRef.current = count;
    }, [simpleRows.length]);

    useEffect(() => {
        if (!id || !canManage || detail?.tender.status !== "Draft") return;

        const rowsToSync = localPositions.filter((position) => {
            if (stockDefaultSyncChecked.current[position.id]) return false;
            if (getLineKind(position) !== 'PRODUCT' || !position.sourceArticleId) return false;
            return !position.imageUrl
                || !position.longDescription
                || !position.unit
                || position.unitPrice == null
                || Number(position.unitPrice) <= 0
                || !position.shortDescription?.trim()
                || position.shortDescription.trim() === t('tenders.product');
        });
        if (rowsToSync.length === 0) return;

        rowsToSync.forEach((position) => {
            stockDefaultSyncChecked.current[position.id] = true;
        });

        void (async () => {
            const updates = await Promise.all(rowsToSync.map(async (position) => {
                try {
                    const article = await inventoryArticleApi.getById(position.sourceArticleId!);
                    const patch = buildMissingStockDefaultsPatch(position, article);
                    if (Object.keys(patch).length === 0) return null;
                    const updated = await tenderApi.updatePosition(id, position.id, patch);
                    return { positionId: position.id, updated };
                } catch {
                    return null;
                }
            }));

            const applied = updates.filter((item): item is { positionId: string; updated: PositionDto } => Boolean(item));
            if (applied.length === 0) return;

            setLocalPositions((positions) =>
                positions.map((position) => {
                    const appliedUpdate = applied.find((item) => item.positionId === position.id);
                    return appliedUpdate ? { ...position, ...appliedUpdate.updated } : position;
                }),
            );
        })();
    }, [id, canManage, detail?.tender.status, localPositions]);

    const activeTenderId = detail?.tender.id || id;
    const loadTenderChatterSummary = useCallback(async () => {
        if (!activeTenderId || isCreatingTender) return;
        setChatterSummaryLoading(true);
        try {
            const summary = await tenderApi.getChatterSummary(activeTenderId);
            setChatterSummary({
                noteCount: Number(summary.noteCount || 0),
                documentCount: Number(summary.documentCount || 0),
                logCount: Number(summary.logCount || 0),
            });
        } catch {
            setChatterSummary(EMPTY_CHATTER_SUMMARY);
        } finally {
            setChatterSummaryLoading(false);
        }
    }, [activeTenderId, isCreatingTender]);

    useEffect(() => {
        void loadTenderChatterSummary();
    }, [loadTenderChatterSummary]);

    const loadTenderChatter = useCallback(async (options?: { silent?: boolean }) => {
        if (!activeTenderId) return;
        const silent = Boolean(options?.silent);
        if (!silent) {
            setLogsLoading(true);
            setDocumentsLoading(true);
        }
        try {
            const [documentsResult, logsResult] = await Promise.allSettled([
                tenderApi.getDocuments(activeTenderId),
                tenderApi.getLogs(activeTenderId),
            ]);

            if (documentsResult.status === 'fulfilled') {
                setTenderDocuments(documentsResult.value);
            } else {
                if (!silent) setTenderDocuments([]);
            }

            if (logsResult.status === 'fulfilled') {
                useTenderStore.setState((state) => ({
                    logs: mergeTenderLogs(logsResult.value, state.logs, silent),
                }));
                setLogsLoaded(true);
            } else {
                const error = logsResult.reason as any;
                if (!silent) toast.error(error?.response?.data?.error ||t('tenders.loglar_yuklenemedi'));
            }
            await loadTenderChatterSummary();
        } finally {
            if (!silent) {
                setLogsLoading(false);
                setDocumentsLoading(false);
            }
        }
    }, [activeTenderId, loadTenderChatterSummary]);

    const handleToggleChatter = async () => {
        const nextOpen = !chatterOpen;
        setChatterOpen(nextOpen);
        if (nextOpen) await loadTenderChatter();
    };

    const handleCreateNewTender = async (customerIdOverride?: string) => {
        if (newTenderSubmitting) return;
        if (!canManage) {
            toast.error(t('tenders.bu_action_icin_yetkiniz_not_found'));
            return;
        }
        const customerId = customerIdOverride || newTenderForm.customerId;
        if (!customerId) {
            toast.error(t('tenders.lutfen_bir_customer_select'));
            return;
        }
        if (!newTenderForm.tenderNumber.trim()) {
            toast.error(t('tenders.tender_numarasi_zorunludur'));
            return;
        }

        try {
            setNewTenderSubmitting(true);
            const validUntil = newTenderForm.validUntil && dayjs(newTenderForm.validUntil).isAfter(minimumTenderValidUntil, 'day')
                ? newTenderForm.validUntil
                : minimumTenderValidUntil;
            const created = await createTender({
                customerId,
                tenderNumber: newTenderForm.tenderNumber.trim(),
                format: newTenderForm.format,
                validUntil,
            });
            toast.success(t('tenders.tender_taslagi_created', { number: newTenderForm.tenderNumber.trim() }));
            navigate(`/crm/tenders/${created.id}`);
        } catch (error: any) {
            toast.error(error.response?.data?.error ||t('tenders.tender_olusturulamadi'));
        } finally {
            setNewTenderSubmitting(false);
        }
    };

    const handleSelectNewTenderCustomer = (customer: CustomerOption) => {
        setNewTenderForm((form) => ({ ...form, customerId: customer.id }));
        setNewTenderCustomerQuery(customer.companyName);
        setNewTenderCustomerOpen(false);
        void handleCreateNewTender(customer.id);
    };

    if (isCreatingTender) {
        return (
            <div>
                <PageHeader
                    breadcrumb={t('tenders.crm_teklif_yeni')}
                    title={t('tenders.new_tender')}
                    actions={
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>{t('tenders.list_back')}</Button>
                    }
                />
                <div className="flex min-h-[360px] items-center justify-center rounded-md border border-slate-200 bg-white">
                    <div className="w-full max-w-sm rounded-md border border-slate-200 bg-white px-6 py-5 text-center">
                        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-md bg-[#1f2654]/10">
                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654]" />
                        </div>
                        <div className="text-[14px] font-semibold text-slate-900">{t('tenders.tender_olusturuluyor')}</div>
                        <div className="mt-1 text-[12px] text-slate-500">{t('tenders.empty_taslak_hazirlaniyor')}</div>
                    </div>
                </div>
            </div>
        );
    }

    if (false && isCreatingTender) {
        const selectedAddress = selectedNewTenderCustomer?.address || '';
        const customerDropdownVisible = newTenderCustomerOpen && filteredNewTenderCustomers.length > 0;
        const newTenderCreatedAtLabel = dayjs().format("DD.MM.YYYY HH:mm");

        return (
            <div>
                <PageHeader
                    breadcrumb={t('tenders.crm_teklif_yeni')}
                    title={newTenderForm.tenderNumber ||t('tenders.new_tender')}
                    description={
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                            <span>{t('tenders.v1')}</span>
                            <span className="text-slate-300">·</span>
                            <StatusChip variant="warning">{t('crm.tenders.statusDraft')}</StatusChip>
                        </span>
                    }
                    actions={
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>{t('tenders.list_back')}</Button>
                    }
                />

                <div className="mb-4 rounded-md border border-slate-200 bg-white px-5 py-4">
                    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
                        <div className="space-y-4">
                            <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.kunde')}</div>
                                <div className="relative">
                                    <Input
                                        size="sm"
                                        value={newTenderCustomerQuery}
                                        onChange={(event) => {
                                            setNewTenderCustomerQuery(event.target.value);
                                            setNewTenderForm((form) => ({ ...form, customerId: '' }));
                                            setNewTenderCustomerOpen(true);
                                        }}
                                        onFocus={() => setNewTenderCustomerOpen(true)}
                                        onBlur={() => window.setTimeout(() => setNewTenderCustomerOpen(false), 120)}
                                        placeholder={newTenderCustomersLoading ?t('tenders.musteriler_loading') :t('tenders.customer_adi_yazin')}
                                        disabled={newTenderCustomersLoading || newTenderSubmitting}
                                    />
                                    {customerDropdownVisible && (
                                        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-md border border-slate-200 bg-white p-1">
                                            {filteredNewTenderCustomers.map((customer) => (
                                                <button
                                                    key={customer.id}
                                                    type="button"
                                                    onMouseDown={(event) => event.preventDefault()}
                                                    onClick={() => handleSelectNewTenderCustomer(customer)}
                                                    className="flex w-full flex-col rounded-2xl px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-blue-50"
                                                >
                                                    <span className="font-semibold text-slate-900">{customer.companyName}</span>
                                                    <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                                        {[customer.address, customer.mainEmail, customer.mainPhone].filter(Boolean).join(' · ') ||t('tenders.address_info_not_found')}
                                                    </span>
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                            <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.rechnungsadresse')}</div>
                                <div className="leading-5 text-slate-900">{selectedNewTenderCustomer?.companyName || <span className="block min-h-[18px]" aria-hidden="true" />}</div>
                            </div>
                            <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.lieferungsadresse')}</div>
                                <div className="whitespace-pre-wrap leading-5 text-slate-900">{selectedAddress || <span className="block min-h-[18px]" aria-hidden="true" />}</div>
                            </div>
                            <div className="grid grid-cols-[132px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.lieferdatum_intern')}</div>
                                <div className="leading-5 text-slate-900"><span className="block min-h-[18px]" aria-hidden="true" /></div>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.auftragsdatum')}</div>
                                <div className="leading-5 text-slate-900">{newTenderCreatedAtLabel}</div>
                            </div>
                            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.tender_no')}</div>
                                <Input
                                    size="sm"
                                    value={newTenderForm.tenderNumber}
                                    onChange={(event) => setNewTenderForm((form) => ({ ...form, tenderNumber: event.target.value }))}
                                    disabled={newTenderSubmitting}
                                />
                            </div>
                            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.format')}</div>
                                <Select
                                    size="sm"
                                    value={newTenderForm.format}
                                    onChange={(event) => setNewTenderForm((form) => ({ ...form, format: event.target.value as TenderFormat }))}
                                    disabled={newTenderSubmitting}
                                >
                                    <option value="SIA451">{t('tenders.sia_451')}</option>
                                    <option value="CRBX">CRBX</option>
                                </Select>
                            </div>
                            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.gecerlilik')}</div>
                                <Input
                                    size="sm"
                                    type="date"
                                    value={newTenderForm.validUntil}
                                    min={minimumTenderValidUntil}
                                    onChange={(event) => {
                                        const nextValue = event.target.value && dayjs(event.target.value).isAfter(minimumTenderValidUntil, 'day')
                                            ? event.target.value
                                            : minimumTenderValidUntil;
                                        setNewTenderForm((form) => ({ ...form, validUntil: nextValue }));
                                    }}
                                    disabled={newTenderSubmitting}
                                />
                            </div>
                            <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-4 text-[13px]">
                                <div className="font-semibold text-slate-500">{t('tenders.preisliste')}</div>
                                <div className="leading-5 text-slate-900">{t('tenders.chf')}</div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="mt-4 rounded-md border border-slate-200 bg-white">
                    <div className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
                        <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#1f2654] text-white">
                            <Calculator size={13} />
                        </span>
                        <div>
                            <div className="text-[13px] font-semibold text-slate-900">{t('tenders.tender_satirlari')}</div>
                            {newTenderSubmitting && <div className="text-[11.5px] text-slate-500">{t('tenders.taslak_aciliyor')}</div>}
                        </div>
                    </div>
                    <table className="w-full table-fixed text-[12px]">
                        <colgroup>
                            <col style={{ width: 34 }} />
                            <col />
                            <col style={{ width: 74 }} />
                            <col style={{ width: 88 }} />
                            <col style={{ width: 96 }} />
                        </colgroup>
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-1.5 py-2" />
                                <th className="px-3 py-2 text-left font-semibold">{t('nav.articles')}</th>
                                <th className="border-l border-slate-200/70 px-1.5 py-2 text-right font-semibold">{t('common.quantity')}</th>
                                <th className="border-l border-slate-200/70 px-1.5 py-2 text-right font-semibold">{t('tenders.unit')}</th>
                                <th className="border-l border-slate-200/70 px-1.5 py-2 text-right font-semibold">{t('tenders.unit_price')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colSpan={5} className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.tender_line_not_found')}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    if (loadingDetail || !detail) {
        return (
            <div className="animate-pulse flex flex-col gap-6">
                <div className="flex justify-between items-start">
                    <div>
                        <div className="h-4 w-40 bg-slate-200 rounded mb-3" />
                        <div className="h-7 w-56 bg-slate-200 rounded mb-3" />
                        <div className="h-3 w-72 bg-slate-200 rounded" />
                    </div>
                    <div className="flex gap-2">
                        <div className="h-9 w-28 bg-slate-200 rounded-md" />
                        <div className="h-9 w-24 bg-slate-200 rounded-md" />
                    </div>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((item) => (
                        <div key={item} className="h-[88px] rounded-md border border-slate-100/60 bg-slate-50" />
                    ))}
                </div>
                <div className="h-[520px] rounded-md border border-slate-100/60 bg-slate-50" />
            </div>
        );
    }

    const tender = detail.tender;
    const isDraft = tender.status === "Draft";
    const projectId = tender.projectId || createdProjectId;
    const isSalesOrderStatus = Boolean(projectId) || isSourceSalesOrder(tender.sourceStatus);
    const tenderStatusLabel = isSalesOrderStatus ?t('crm.tenders.statusOrdered') : getStatusLabel()[tender.status];
    const tenderStatusVariant = isSalesOrderStatus ? 'order' : STATUS_VARIANT[tender.status];
    const creatorName = tender.createdByName || tender.createdByEmail || tender.createdByEmployeeId ||t('tenders.bilinmiyor');
    const currentUserName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
    const createdAtLabel = dayjs(tender.createdAt).format("DD.MM.YYYY HH:mm");
    const stockArticleById = new Map(stockArticles.map((article) => [article.id, article]));
    const profitabilityRows = displayRows
        .filter((row) => row.kind === 'PRODUCT')
        .map((row) => {
            const article = row.position.sourceArticleId ? stockArticleById.get(row.position.sourceArticleId) : undefined;
            const quantity = Number(row.position.quantity || 0);
            const unitCost = getArticleUnitCost(article);
            const cost = quantity * unitCost;
            const revenue = lineNetTotal(row.position);
            const result = revenue - cost;
            const resultRate = revenue > 0 ? (result / revenue) * 100 : 0;
            return {
                ...row,
                article,
                unitCost,
                cost,
                revenue,
                result,
                resultRate,
                costSource: getArticleCostSourceLabel(article),
            };
        });
    const profitabilityRevenue = profitabilityRows.reduce((sum, row) => sum + row.revenue, 0);
    const profitabilityCost = profitabilityRows.reduce((sum, row) => sum + row.cost, 0);
    const profitabilityResult = profitabilityRevenue - profitabilityCost;
    const profitabilityRate = profitabilityRevenue > 0 ? (profitabilityResult / profitabilityRevenue) * 100 : 0;
    const selectedProfitabilityLine = selectedLine
        ? profitabilityRows.find((row) => row.id === selectedLine.id) || null
        : null;

    const prependTenderLog = (log: TenderChangeLog) => {
        useTenderStore.setState((state) => ({
            logs: [
                log,
                ...state.logs.filter((existing) => existing.id !== log.id),
            ],
        }));
        setLogsLoaded(true);
        setChatterOpen(true);
    };

    const addLocalTenderLog = (input: {
        actionType: 'TENDER_NOTE' | 'TENDER_ATTACHMENT';
        fieldName: string;
        value: string;
        description: string;
    }) => {
        const createdAt = new Date().toISOString();
        const actorName = currentUserName ||t('tenders.sistem');
        const localLog: TenderChangeLog = {
            id: `local-${input.actionType}-${createdAt}-${Math.random().toString(36).slice(2)}`,
            tenantId: tender.tenantId,
            tenderId: tender.id,
            employeeId: user?.id || 'local',
            employeeName: actorName,
            employeeEmail: user?.email || null,
            actionType: input.actionType,
            fieldName: input.fieldName,
            oldValue: null,
            newValue: input.value,
            description: input.description,
            createdAt,
        };
        prependTenderLog(localLog);
    };

    const lastRowId = simpleRows.at(-1)?.id;

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
        return {
            parentPositionId: null,
            hierarchyLevel: 0,
            displayOrder: order,
            positionNumber: String(simpleRows.length + 1),
        };
    };

    const openOrderDecision = () => {
        setOrderMode('PROJECT_NEW');
        setAttachExistingProject(false);
        setSelectedExistingProject(null);
        setProjectSearch('');
        setProjectSearchResults([]);
        setOrderProjectName(tender.tenderNumber);
        setOrderDecisionOpen(true);
    };

    const handleSubmitOrderDecision = async () => {
        const finalMode: SalesOrderMode = orderMode === 'PROJECT_NEW' && attachExistingProject ? 'PROJECT_EXISTING' : orderMode;
        if (finalMode === 'PROJECT_NEW' && !orderProjectName.trim()) {
            toast.error(t('tenders.project_ismi_zorunludur'));
            return;
        }
        if (finalMode === 'PROJECT_EXISTING' && !selectedExistingProject) {
            toast.error(t('tenders.add_istediginiz_projeyi_select'));
            return;
        }

        setProjectCreateLoading(true);
        setOrderDecisionLoading(true);
        try {
            const res = await projectApi.createSalesOrderFromTender({
                tenderId: tender.id,
                mode: finalMode,
                projectName: finalMode === 'PROJECT_NEW' ? orderProjectName.trim() : undefined,
                projectId: finalMode === 'PROJECT_EXISTING' ? selectedExistingProject?.id : undefined,
                overtimeHourlyRate,
            });
            if (res.project?.id) setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            setOrderDecisionOpen(false);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
            setOrderDecisionLoading(false);
        }
    };

    const handleApprove = async () => {
        openOrderDecision();
    };

    const handleCreateVersion = async () => {
        try {
            const next = await createVersion(tender.id);
            toast.success(t('tenders.yeni_versiyon_olusturuldu', { version: next.version }));
            navigate(`/crm/tenders/${next.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.versiyon_olusturulamadi'));
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
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            navigate(`/projects/${res.project.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
        }
    };

    const handleTenderMetaChange = async (
        patch: { customerId?: string | null; format?: TenderFormat; validUntil?: string | null },
        optimisticPatch: Partial<TenderListItem> = {},
    ) => {
        if (!isDraft || !canManage || metaSaving) return;
        const safePatch = {
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
        const previousList = currentState.list;
        if (!previousDetail || previousDetail.tender.id !== tender.id) return;

        const optimisticTenderPatch = { ...safePatch, ...optimisticPatch };
        const nextTender = { ...previousDetail.tender, ...optimisticTenderPatch };
        useTenderStore.setState({
            detail: { ...previousDetail, tender: nextTender },
            list: previousList.map((item) => (item.id === tender.id ? { ...item, ...optimisticTenderPatch } : item)),
        });

        try {
            setMetaSaving(true);
            const updated = await tenderApi.updateMeta(tender.id, safePatch);
            if (safePatch.customerId !== undefined && updated.customerId !== safePatch.customerId) {
                throw new Error(t('tenders.customer_backend_tarafindan_guncellenmedi_backend'));
            }
            const latestState = useTenderStore.getState();
            const latestDetail = latestState.detail;
            useTenderStore.setState({
                detail: latestDetail?.tender.id === tender.id
                    ? { ...latestDetail, tender: { ...latestDetail.tender, ...updated } }
                    : latestDetail,
                list: latestState.list.map((item) => (item.id === tender.id ? { ...item, ...updated } : item)),
            });
            toast.success(t('tenders.tender_info_updated'));
        } catch (error: any) {
            useTenderStore.setState({ detail: previousDetail, list: previousList });
            toast.error(error.response?.data?.error ||t('tenders.tender_info_guncellenemedi'));
        } finally {
            setMetaSaving(false);
        }
    };

    const toggleAllRows = (checked: boolean) => {
        setSelectedRowIds(checked ? Object.fromEntries(simpleRows.map((row) => [row.id, true])) : {});
    };

    const toggleRowSelection = (rowId: string, checked: boolean) => {
        setSelectedRowIds((prev) => {
            const next = { ...prev };
            if (checked) next[rowId] = true;
            else delete next[rowId];
            return next;
        });
    };

    const setSectionSchemaOpenPersisted = (open: boolean) => {
        setSectionSchemaOpen(open);
        window.localStorage.setItem(SECTION_SCHEMA_STORAGE_KEY, String(open));
    };

    const handleAddRow = async (
        rowType: 'TITLE' | 'DESCRIPTION' | 'PRODUCT',
        article?: ProductSource,
        options?: Partial<ManualProductForm>,
        afterRowId?: string,
    ) => {
        if (!isDraft || !canManage) return;
        const isProduct = rowType === 'PRODUCT';
        const titleLike = rowType === 'TITLE';
        const descriptionLike = rowType === 'DESCRIPTION';
        const optimisticId = createTempPositionId();
        const positionMeta = buildFlatPositionMeta(afterRowId);
        const localPositionNumber = String(simpleRows.length + 1);

        try {
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

            optimisticPositionIds.current[optimisticId] = null;
            setLocalPositions((positions) => sortPositions([...positions, optimisticPosition]));
            setSelectedId(optimisticId);

            const result = await tenderApi.addPosition(tender.id, createPayload);
            const serverPosition = result.position;
            const serverPositionId = result.positionId || serverPosition?.id;
            optimisticPositionIds.current[optimisticId] = serverPositionId ?? null;
            const pendingCreatePatch = pendingPositionPatches.current[optimisticId];
            delete pendingPositionPatches.current[optimisticId];
            if (!serverPositionId) throw new Error(t('tenders.sata_r_id_info_ala_namada'));
            if (pendingCreatePatch) {
                pendingPositionPatches.current[serverPositionId] = {
                    ...(pendingPositionPatches.current[serverPositionId] ?? {}),
                    ...pendingCreatePatch,
                };
            }

            setLocalPositions((positions) =>
                positions.map((position) =>
                    position.id === optimisticId
                        ? {
                            ...position,
                            ...(serverPosition ?? {}),
                            ...(pendingCreatePatch ?? {}),
                            id: serverPositionId,
                            calculation: serverPosition?.calculation ?? position.calculation,
                            articleMappings: serverPosition?.articleMappings ?? position.articleMappings,
                            materialMappings: serverPosition?.materialMappings ?? position.materialMappings,
                        }
                        : position,
                ),
            );
            setSelectedId(serverPositionId);
            if (pendingCreatePatch && Object.keys(pendingCreatePatch).length > 0) {
                void tenderApi.updatePosition(tender.id, serverPositionId, pendingCreatePatch)
                    .then((updated) => {
                        const localPatch = pendingPositionPatches.current[serverPositionId] ?? {};
                        setLocalPositions((positions) =>
                            positions.map((position) =>
                                position.id === serverPositionId
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
                    })
                    .catch((err: any) => toast.error(err.response?.data?.error ||t('tenders.sata_r_ga_ncellenemedi')));
            }
        } catch (e: any) {
            delete optimisticPositionIds.current[optimisticId];
            delete pendingPositionPatches.current[optimisticId];
            setLocalPositions((positions) => positions.filter((position) => position.id !== optimisticId));
            setSelectedId((current) => current === optimisticId ? null : current);
            toast.error(e.response?.data?.error ||t('tenders.line_eklenemedi'));
        }
    };

    const openProductPicker = (afterRowId?: string) => {
        setProductPickerAfterRowId(afterRowId);
        setProductSearch('');
        setProductPickerOpen(true);
    };

    const openManualProduct = () => {
        setManualProduct(emptyManualProduct(productSearch.trim(), fallbackTaxRate));
        setManualProductOpen(true);
    };

    const openStockArticleCreate = () => {
        setStockArticleInitial(emptyStockArticle(productSearch.trim()));
    };

    const handleImageFileChange = (rowId: string, file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('tenders.lutfen_bir_gorsel_file_select'));
            return;
        }

        const reader = new FileReader();
        reader.onload = () => {
            const imageUrl = typeof reader.result === 'string' ? reader.result : null;
            handleInlinePositionChange(rowId, { imageUrl });
        };
        reader.onerror = () => toast.error(t('tenders.gorsel_okunamadi'));
        reader.readAsDataURL(file);
    };

    const handleManualProductImage = async (file?: File | null) => {
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('tenders.lutfen_bir_gorsel_file_select'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2mb_sinirini_asiyor'));
            return;
        }
        try {
            const imageUrl = await fileToDataUrl(file);
            setManualProduct((current) => ({ ...current, imageUrl }));
        } catch {
            toast.error(t('tenders.gorsel_okunamadi'));
        }
    };

    const handleCreateManualProduct = async () => {
        const name = manualProduct.name.trim();
        if (!name) {
            toast.error(t('tenders.product_adi_zorunludur'));
            return;
        }
        setManualProductOpen(false);
        setProductPickerOpen(false);
        const afterRowId = productPickerAfterRowId;
        void handleAddRow(
            'PRODUCT',
            {
                name,
                description: manualProduct.description,
                unit: manualProduct.unit,
                baseCost: 0,
                salePrice: manualProduct.unitPrice,
                imageUrl: manualProduct.imageUrl,
            },
            manualProduct,
            afterRowId,
        );
        setProductPickerAfterRowId(undefined);
    };

    const handleCreateStockArticle = async (data: Partial<InventoryArticle>) => {
        const created = await inventoryArticleApi.create(data);
        const afterRowId = productPickerAfterRowId;
        setStockArticleInitial(null);
        setProductPickerOpen(false);
        setProductPickerAfterRowId(undefined);
        void fetchStockArticles(true);
        void handleAddRow(
            'PRODUCT',
            {
                id: created.id,
                articleCode: created.articleCode,
                name: created.name,
                description: created.description,
                unit: created.unit,
                baseCost: created.baseCost,
                salePrice: created.salePrice,
                imageUrl: created.imageUrl,
            },
            { quantity: 1, discount: 0, taxRate: fallbackTaxRate },
            afterRowId,
        );
        toast.success(t('tenders.product_to_stock_added_and_to_tender_copied'));
    };

    const handleBulkDelete = () => {
        if (selectedRows.length === 0) return;
        const rowsToDelete = selectedRows;
        const deleteIds = new Set(rowsToDelete.map((row) => row.id));
        const positionsToRestore = localPositions.filter((position) => deleteIds.has(position.id));

        setLocalPositions((positions) => positions.filter((position) => !deleteIds.has(position.id)));
        setSelectedRowIds({});
        setSelectedId((current) => current && deleteIds.has(current) ? null : current);
        setBulkDeleteOpen(false);
        toast.success(t('tenders.selected_satirlar_silindi'));

        void Promise.allSettled(rowsToDelete.map((row) => tenderApi.deletePosition(tender.id, row.id)))
            .then((results) => {
                const failedIds = new Set<string>();
                results.forEach((result, index) => {
                    if (result.status === 'rejected') {
                        failedIds.add(rowsToDelete[index].id);
                    }
                });
                if (failedIds.size === 0) return;

                const restorePositions = positionsToRestore.filter((position) => failedIds.has(position.id));
                setLocalPositions((positions) =>
                    sortPositions([
                        ...positions.filter((position) => !failedIds.has(position.id)),
                        ...restorePositions,
                    ]),
                );
                toast.error(`${failedIds.size} satır silinemedi, geri alındı.`);
            });
    };

    const handleBulkDiscount = async () => {
        if (discountEligibleRows.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkDiscountValue || 0));
        setBulkActionLoading(true);
        try {
            const results = await Promise.all(discountEligibleRows.map(async (row) => ({
                row,
                result: await tenderApi.updatePosition(tender.id, row.id, { discount: nextDiscount }),
            })));
            results.forEach(({ row, result }) => mergePositionUpdate(row.id, result));
            setSelectedRowIds({});
            setBulkDiscountOpen(false);
            toast.success(t('tenders.bulk_discount_applied_to_product_lines'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.bulk_discount_could_not_apply'));
        } finally {
            setBulkActionLoading(false);
        }
    };

    const renderPriceInput = (
        row: SimpleTenderLine,
        field: 'quantity' | 'unitPrice' | 'discount' | 'taxRate',
        value: number | null | undefined,
        options?: { max?: number; suffix?: string },
    ) => {
        if (row.kind !== 'PRODUCT') return <span className="text-slate-300" />;
        return isDraft ? (
            <input
                aria-label={field}
                type="number"
                min={0}
                max={options?.max}
                step="any"
                value={value != null && Number(value) > 0 ? Number(value) : ''}
                onChange={(event) => {
                    const next = parseInlineNumber(event.target.value, options?.max);
                    handleInlinePositionChange(row.id, { [field]: next });
                }}
                onClick={(event) => event.stopPropagation()}
                className="w-full min-w-0 rounded-md border border-transparent bg-slate-50 px-1.5 py-1 text-right font-mono text-[11.5px] text-slate-700 outline-none transition-colors hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
            />
        ) : (
            <span className="font-mono text-[12px] text-slate-700">
                {value != null && Number(value) > 0 ? `${value}${options?.suffix ?? ''}` : ''}
            </span>
        );
    };

    const renderImagePicker = (row: SimpleTenderLine, position: PositionDto, sizeClass = "h-24 w-28") => {
        const canEdit = isDraft && row.kind !== 'TITLE';
        if (!canEdit && !position.imageUrl) return null;

        const imageAlt = position.shortDescription ||t('tenders.line_gorseli');
        const imageFrameClass = `${sizeClass} flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-white`;

        if (canEdit && !position.imageUrl) {
            return (
                <label
                    aria-label={t('tenders.gorsel_add')}
                    onClick={(event) => event.stopPropagation()}
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-slate-200 bg-white text-slate-500"
                >
                    <ImageIcon size={14} />
                    <input
                        type="file"
                        accept="image/*"
                        className="sr-only"
                        onChange={(event) => {
                            const input = event.currentTarget;
                            handleImageFileChange(row.id, input.files?.[0]);
                            input.value = '';
                        }}
                    />
                </label>
            );
        }

        return (
            <div className="inline-flex shrink-0 items-center gap-1.5 overflow-visible">
                <label
                    aria-label={canEdit ?t('tenders.gorseli_degistir') : imageAlt}
                    title={canEdit ?t('tenders.gorseli_degistir') : imageAlt}
                    onClick={(event) => event.stopPropagation()}
                    className={`${imageFrameClass} ${canEdit ? 'cursor-pointer' : ''}`}
                >
                    <img src={position.imageUrl || ''} alt={imageAlt} className="h-full w-full object-cover" />
                    {canEdit && (
                        <input
                            type="file"
                            accept="image/*"
                            className="sr-only"
                            onChange={(event) => {
                                const input = event.currentTarget;
                                handleImageFileChange(row.id, input.files?.[0]);
                                input.value = '';
                            }}
                        />
                    )}
                </label>
                {canEdit && position.imageUrl && (
                    <button
                        type="button"
                        aria-label={t('tenders.gorseli_kaldir')}
                        title={t('tenders.gorseli_kaldir')}
                        onClick={(event) => {
                            event.stopPropagation();
                            handleInlinePositionChange(row.id, { imageUrl: null });
                        }}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-rose-100 bg-rose-50 text-rose-600 [&_svg]:text-rose-600"
                    >
                        <Trash2 size={13} />
                    </button>
                )}
            </div>
        );
    };

    const rowPreviewText = (row: SimpleTenderLine) => {
        if (row.kind === 'DESCRIPTION') return plainTextPreview(row.position.longDescription);
        return row.position.shortDescription?.trim() || '';
    };

    const openSettingsTab = (tab: TenderSettingsTabKey) => {
        setSettingsInitialTab(tab);
        setWorkspaceTab(tab);
    };

    const valueOrBlank = (value?: string | number | null) => String(value ?? '').trim();
    const splitAddress = (value?: string | null) =>
        valueOrBlank(value).split(/\r?\n|,\s*/).map((line) => line.trim()).filter(Boolean);
    const renderDetailLines = (lines: Array<string | null | undefined>) => {
        const cleanLines = lines.map(valueOrBlank).filter(Boolean);
        if (cleanLines.length === 0) return <span className="block min-h-[18px]" aria-hidden="true" />;
        return cleanLines.map((line, index) => (
            <span key={`${line}-${index}`} className="block">{line}</span>
        ));
    };
    const canEditTenderMeta = isDraft && canManage;
    const tenderCustomerDropdownVisible = newTenderCustomerOpen && filteredNewTenderCustomers.length > 0;
    const handleSelectTenderCustomer = (customer: CustomerOption) => {
        if (!customer.id || metaSaving) return;
        setNewTenderCustomerQuery(customer.companyName);
        setNewTenderCustomerOpen(false);
        void handleTenderMetaChange(
            { customerId: customer.id },
            {
                customerName: customer.companyName,
                customerAddress: customer.address ?? null,
                customerEmail: customer.mainEmail ?? null,
                customerPhone: customer.mainPhone ?? null,
                customerTaxNumber: customer.taxNumber ?? null,
            },
        );
    };
    const tenderCustomerPicker = canEditTenderMeta ? (
        <div className="relative">
            <Input
                size="sm"
                value={newTenderCustomerQuery}
                onChange={(event) => {
                    setNewTenderCustomerQuery(event.target.value);
                    setNewTenderCustomerOpen(true);
                }}
                onFocus={() => setNewTenderCustomerOpen(true)}
                onBlur={() => window.setTimeout(() => setNewTenderCustomerOpen(false), 120)}
                placeholder={newTenderCustomersLoading ?t('tenders.musteriler_loading') :t('tenders.customer_adi_yazin')}
                disabled={newTenderCustomersLoading || metaSaving}
            />
            {tenderCustomerDropdownVisible && (
                <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/[0.02]">
                    {filteredNewTenderCustomers.map((customer) => (
                        <button
                            key={customer.id}
                            type="button"
                            onMouseDown={(event) => {
                                event.preventDefault();
                                handleSelectTenderCustomer(customer);
                            }}
                            onClick={(event) => event.preventDefault()}
                            onKeyDown={(event) => {
                                if (event.key === "Enter" || event.key === ' ') {
                                    event.preventDefault();
                                    handleSelectTenderCustomer(customer);
                                }
                            }}
                            className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-slate-100"
                        >
                            <span className="font-semibold text-slate-900">{customer.companyName}</span>
                            <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                                {[customer.address, customer.mainEmail, customer.mainPhone].filter(Boolean).join(' · ') ||t('tenders.address_info_not_found')}
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    ) : null;

    const customerLines = [
        valueOrBlank(tender.customerName || tender.customerId),
        ...splitAddress(tender.customerAddress),
    ];
    const deliveryDate = valueOrBlank((tender as any).deliveryDate || (tender as any).internalDeliveryDate);
    const paymentTerms = valueOrBlank((tender as any).paymentTerms || (tender as any).paymentTerm);
    const commissionNumber = valueOrBlank((tender as any).commissionNumber || (tender as any).commissionNo || (tender as any).referenceNumber);
    const priceList = valueOrBlank((tender as any).priceList || (tender as any).currency ||t('tenders.chf'));
    const tenderFormatLabel = formatTenderFormatLabel(tender.format);
    const tenderValidityValue = tender.validUntil ? dayjs(tender.validUntil).format('YYYY-MM-DD') : minimumTenderValidUntil;
    const tenderValidityLabel = dayjs(tenderValidityValue).format('DD.MM.YYYY');
    const tenderHeaderMeta = (
        <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 font-semibold text-slate-700">
                {tenderFormatLabel ||t('tenders.sia_451')}
            </span>
            {canEditTenderMeta ? (
                <label className={`relative inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 font-medium transition-colors ${metaSaving ?"cursor-wait border-slate-200 bg-slate-50 text-slate-400" :"cursor-pointer border-emerald-200 bg-emerald-50 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-100"}`}>
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">{t('tenders.gecerlilik')}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{tenderValidityLabel}</span>
                    <input
                        aria-label={t('tenders.gecerlilik_tarihi')}
                        type="date"
                        value={tenderValidityValue}
                        min={minimumTenderValidUntil}
                        disabled={metaSaving}
                        onChange={(event) => void handleTenderMetaChange({ validUntil: event.target.value || null })}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-wait"
                    />
                </label>
            ) : (
                <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 font-medium text-emerald-800">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">{t('tenders.gecerlilik')}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{tenderValidityLabel}</span>
                </span>
            )}
        </span>
    );
    const tenderDetailLeft: DetailInfoRow[] = [
        { label:t('tenders.kunde'), content: tenderCustomerPicker, lines: customerLines },
        { label:t('tenders.rechnungsadresse'), lines: [tender.customerName || ''] },
        { label:t('tenders.lieferungsadresse'), lines: [valueOrBlank((tender as any).deliveryAddress)] },
        { label:t('tenders.lieferdatum_intern'), lines: [deliveryDate ? dayjs(deliveryDate).format('DD.MM.YYYY') : ''] },
    ];
    const tenderDetailRight: DetailInfoRow[] = [
        { label:t('tenders.auftragsdatum'), lines: [createdAtLabel] },
        { label:t('tenders.preisliste'), lines: [priceList] },
        { label:t('tenders.zahlungsbedingung'), lines: [paymentTerms] },
        { label:t('tenders.kommission_nr'), lines: [commissionNumber] },
    ];

    const priceLogLabels: Record<string, string> = {
        quantity:t('common.quantity'),
        unitPrice:t('tenders.unit_price'),
        discount:t('common.discount'),
        taxRate: 'KDV',
    };
    const formatLogValue = (fieldName?: string | null, value?: string | null) => {
        const raw = valueOrBlank(value);
        if (!raw) return t('tenders.empty');
        const numeric = Number(raw);
        if (fieldName === 'unitPrice' && Number.isFinite(numeric)) return fmtMoney(numeric);
        if ((fieldName === 'discount' || fieldName === 'taxRate') && Number.isFinite(numeric)) return `${numeric}%`;
        return raw;
    };
    const isVisibleLog = (log: TenderChangeLog) =>
        log.actionType === 'TENDER_CREATED'
        || log.actionType === 'TENDER_APPROVED'
        || log.actionType === 'TENDER_NOTE'
        || log.actionType === 'TENDER_ATTACHMENT'
        || log.actionType === 'POSITION_PRICE_UPDATED'
        || Boolean(log.fieldName && priceLogLabels[log.fieldName]);

    const documentsByName = new Map<string, TenderDocumentDto>();
    tenderDocuments.forEach((document) => {
        const key = normalizeDocumentName(document.fileName);
        if (key && !documentsByName.has(key)) documentsByName.set(key, document);
    });
    const resolveLogDocument = (log: TenderChangeLog) => {
        const candidates = [log.newValue, log.description]
            .map(normalizeDocumentName)
            .filter(Boolean);
        for (const candidate of candidates) {
            const document = documentsByName.get(candidate);
            if (document) return document;
        }
        return undefined;
    };
    const displayLogActor = (log: TenderChangeLog) =>
        log.employeeName
        || log.employeeEmail
        || (user && log.employeeId === user.id ? currentUserName : '')
        ||t('tenders.sistem');

    const logActionTypes = new Set(logs.map((log) => log.actionType));
    const logTimelineItems: ChatterTimelineItem[] = logs.filter(isVisibleLog).map((log) => {
        const actor = displayLogActor(log);
        if (log.actionType === 'TENDER_CREATED') {
            return { id: log.id, date: log.createdAt, actor, tone: 'emerald', title:t('tenders.tender_created'), body: log.description || tender.tenderNumber };
        }
        if (log.actionType === 'TENDER_APPROVED') {
            return { id: log.id, date: log.createdAt, actor, tone: 'blue', title:t('tenders.tender_onaylandi'), body: log.description || tender.tenderNumber };
        }
        if (log.actionType === 'TENDER_NOTE') {
            return { id: log.id, date: log.createdAt, actor, tone: 'amber', title:t('tenders.note_birakildi'), body: log.description || log.newValue || '' };
        }
        if (log.actionType === 'TENDER_ATTACHMENT') {
            return {
                id: log.id,
                date: log.createdAt,
                actor,
                tone: 'violet',
                title:t('tenders.additional_file_added'),
                body: log.newValue || log.description || '',
                document: resolveLogDocument(log),
            };
        }
        const label = priceLogLabels[log.fieldName || ''] || log.fieldName ||t('common.price');
        return {
            id: log.id,
            date: log.createdAt,
            actor,
            tone: 'cyan',
            title:t('tenders.price_degisikligi'),
            body: `${label}: ${formatLogValue(log.fieldName, log.oldValue)} -> ${formatLogValue(log.fieldName, log.newValue)}`,
        };
    });
    const activityTimelineItems: ChatterTimelineItem[] = activities
        .filter((activity) => activity.activityType === 'TENDER_APPROVED' && !logActionTypes.has('TENDER_APPROVED'))
        .map((activity) => ({
            id: activity.id,
            date: activity.activityDate,
            actor: activity.employeeName ||t('tenders.sistem'),
            tone: 'blue',
            title:t('tenders.tender_onaylandi'),
            body: activity.description || tender.tenderNumber,
        }));
    const hasAttachmentLogs = logActionTypes.has('TENDER_ATTACHMENT');
    const documentTimelineItems: ChatterTimelineItem[] = hasAttachmentLogs ? [] : tenderDocuments.map((doc) => ({
        id: `document-${doc.id}`,
        date: tender.createdAt,
        actor:t('tenders.sistem'),
        tone: 'violet',
        title:t('tenders.additional_file'),
        body: doc.fileName,
        document: doc,
    }));
    const syntheticCreatedItem: ChatterTimelineItem[] = logActionTypes.has('TENDER_CREATED')
        ? []
        : [{
            id: `${tender.id}-created`,
            date: tender.createdAt,
            actor: creatorName,
            tone: 'emerald',
            title:t('tenders.tender_created'),
            body: tender.tenderNumber,
        }];
    const timelineItems = [...logTimelineItems, ...activityTimelineItems, ...documentTimelineItems, ...syntheticCreatedItem]
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
    const previewNoteCount = logsLoaded
        ? logs.filter((log) => log.actionType === 'TENDER_NOTE').length
        : chatterSummary.noteCount;
    const previewDocumentCount = logsLoaded ? tenderDocuments.length : chatterSummary.documentCount;
    const previewLogCount = logsLoaded ? logs.filter(isVisibleLog).length : chatterSummary.logCount;
    const chatterPreviewLabel = chatterSummaryLoading && previewNoteCount === 0 && previewDocumentCount === 0 && previewLogCount === 0
        ?t('common.loading')
        : `${previewNoteCount} not · ${previewDocumentCount} belge${previewLogCount > 0 ? ` · ${previewLogCount} log` : ''}`;
    const timelineToneClass = (tone: string) => {
        if (tone === 'emerald') return 'bg-emerald-600 text-white';
        if (tone === 'blue') return 'bg-blue-700 text-white';
        if (tone === 'amber') return 'bg-amber-500 text-white';
        if (tone === 'violet') return 'bg-violet-600 text-white';
        return 'bg-cyan-600 text-white';
    };

    const renderDocumentTile = (document: TenderDocumentDto, compact = false) => {
        const image = isPreviewableDocument(document);
        const pdf = isPdfDocument(document);
        const mediaClass = compact ?"h-9 w-9" :"h-16 w-24";

        return (
            <div className={`mt-2 flex min-w-0 items-center gap-2 ${compact ? '' : 'max-w-[420px]'}`}>
                <button
                    type="button"
                    onClick={() => setDocumentPreview(document)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[12px] font-medium text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10"
                    title={document.fileName}
                >
                    {image ? (
                        <img src={document.fileUrl} alt="" className={`${mediaClass} shrink-0 rounded border border-slate-200 object-cover`} />
                    ) : (
                        <span className={`${mediaClass} flex shrink-0 flex-col items-center justify-center rounded border ${pdf ?"border-rose-200 bg-rose-50 text-rose-700" :"border-slate-200 bg-slate-50 text-slate-500"}`}>
                            <FileText size={compact ? 14 : 18} />
                            {pdf && <span className="mt-0.5 text-[9px] font-bold leading-none">PDF</span>}
                        </span>
                    )}
                    <span className="min-w-0 flex-1 truncate">{document.fileName}</span>
                </button>
                <a
                    href={document.fileUrl}
                    download={document.fileName}
                    target="_blank"
                    rel="noreferrer"
                    title={t('common.download')}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#1f2654] hover:bg-[#1f2654] hover:text-white"
                >
                    <FileDown size={14} />
                </a>
            </div>
        );
    };

    const handleSubmitNote = async () => {
        if (noteSaving) return;
        const content = noteText.trim();
        if (!content) {
            toast.error(t('crm.customers.errorNoteEmpty'));
            return;
        }
        setNoteSaving(true);
        try {
            const savedLog = await tenderApi.addNote(tender.id, { noteText: content });
            prependTenderLog({
                ...savedLog,
                employeeName: savedLog.employeeName || currentUserName || savedLog.employeeName,
                employeeEmail: savedLog.employeeEmail || user?.email || savedLog.employeeEmail,
            });
            setNoteText('');
            void loadTenderChatter({ silent: true });
            toast.success(t('crm.customers.successNoteAdded'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.customers.errorNoteAdd'));
        } finally {
            setNoteSaving(false);
        }
    };

    const inferDocumentType = (file: File) => {
        if (file.type) return file.type;
        const fileName = file.name;
        if (/\.pdf$/i.test(fileName)) return 'application/pdf';
        if (/\.png$/i.test(fileName)) return 'image/png';
        if (/\.(jpe?g)$/i.test(fileName)) return 'image/jpeg';
        return '';
    };
    const handleSubmitDocument = async (file?: File) => {
        if (documentSaving) return;
        if (!file) {
            toast.error(t('tenders.bir_file_select'));
            return;
        }
        const fileType = inferDocumentType(file);
        if (!fileType) {
            toast.error(t('tenders.desteklenmiyor_pdf_png_veya_jpg_yukleyin', { name: file.name }));
            return;
        }

        setDocumentSaving(true);
        try {
            const fileUrl = await fileToDataUrl(file);
            const savedDocument = await tenderApi.addDocument(tender.id, {
                fileName: file.name,
                fileUrl,
                fileType,
                category: 'tender',
            });
            setTenderDocuments((documents) => [
                savedDocument,
                ...documents.filter((document) => document.id !== savedDocument.id),
            ]);
            addLocalTenderLog({
                actionType: 'TENDER_ATTACHMENT',
                fieldName: 'attachment',
                value: file.name,
                description: `Ek dosya eklendi: ${file.name}`,
            });
            void loadTenderChatter({ silent: true });
            toast.success(t('tenders.additional_file_added'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.additional_file_eklenemedi'));
        } finally {
            setDocumentSaving(false);
        }
    };

    return (
        <div>
            <PageHeader
                breadcrumb={t('tenders.crm_teklif_number', { number: tender.tenderNumber })}
                title={
                    <span className="flex items-center gap-3">
                        <span>{tender.tenderNumber}</span>
                        <span className="text-[12px] font-mono text-slate-400">v{tender.version}</span>
                        <StatusChip variant={tenderStatusVariant}>
                            {tenderStatusLabel}
                        </StatusChip>
                    </span>
                }
                description={tenderHeaderMeta}
                actions={
                    <>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/tenders')}>{t('tenders.list_back')}</Button>
                        {!isDraft && canManage && (!isSalesOrderStatus || projectId) && (
                            <Button variant="secondary" icon={<GitBranch size={13} />} onClick={handleCreateVersion}>{t('tenders.new_versiyon')}</Button>
                        )}
                        {canExport && (
                            <Button variant="secondary" icon={<FileDown size={13} />} onClick={() => setExportOpen(true)}>{t('tenders.pdf_export')}</Button>
                        )}
                        {!isDraft && canManage && (
                            <Button
                                variant="primary"
                                icon={<BriefcaseBusiness size={13} />}
                                loading={projectCreateLoading}
                                onClick={projectId ? handleCreateProject : openOrderDecision}
                            >
                                {projectId ?t('tenders.siparise_git') :t('tenders.order_create')}
                            </Button>
                        )}
                        {isDraft && canApprove && (
                            <Button variant="primary" icon={<FileCheck2 size={13} />} onClick={handleApprove}>{t('common.confirm')}</Button>
                        )}
                    </>
                }
            />

            <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
                <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-100">
                    <div className="divide-y divide-slate-100 px-5 lg:pr-7">
                        {tenderDetailLeft.map((item) => (
                            <div key={item.label} className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-4 py-2.5 text-[13px]">
                                <div className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                                <div className={`font-medium leading-5 text-slate-800 ${item.content ? '' : 'px-3'}`}>{item.content ?? renderDetailLines(item.lines ?? [])}</div>
                            </div>
                        ))}
                    </div>
                    <div className="divide-y divide-slate-100 px-5 lg:pl-7">
                        {tenderDetailRight.map((item) => (
                            <div key={item.label} className="grid grid-cols-[130px_minmax(0,1fr)] items-start gap-4 py-2.5 text-[13px]">
                                <div className="pt-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                                <div className={`font-medium leading-5 text-slate-800 ${item.content ? '' : 'px-3'}`}>{item.content ?? renderDetailLines(item.lines ?? [])}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white">
                <button
                    type="button"
                    onClick={handleToggleChatter}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                >
                    <span className="flex min-w-0 items-center gap-2">
                        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-[#272f67]">
                            <History size={14} />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[13px] font-semibold text-slate-900">{"Log / Not / Ek"}</span>
                            <span className="block truncate text-[11.5px] text-slate-500">{t('tenders.price_degisiklikleri_approval_olusturma_ve_tender_no')}</span>
                        </span>
                    </span>
                    <span className="flex items-center gap-2 text-[11.5px] font-medium text-slate-500">
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-slate-600">
                            {chatterPreviewLabel}
                        </span>
                        <ChevronDown size={15} className={`transition-transform ${chatterOpen ? 'rotate-180' : ''}`} />
                    </span>
                </button>

                {chatterOpen && (
                    <div className="grid gap-0 border-t border-slate-200 lg:grid-cols-[minmax(0,1fr)_360px]">
                        <div className="max-h-[520px] overflow-y-auto px-4 py-4">
                            {logsLoading && timelineItems.length === 0 ? (
                                <div className="py-8 text-center text-[12px] text-slate-400">{t('tenders.loglar_loading')}</div>
                            ) : timelineItems.length === 0 ? (
                                <div className="rounded-md border border-dashed border-slate-200 px-3 py-8 text-center text-[12px] text-slate-400">{t('tenders.price_approval_record_not_found')}</div>
                            ) : (
                                <div className="space-y-5">
                                    {timelineItems.map((item) => (
                                        <div key={item.id} className="grid grid-cols-[36px_minmax(0,1fr)] gap-3">
                                            <div className={`flex h-9 w-9 items-center justify-center rounded-md text-[11px] font-bold ${timelineToneClass(item.tone)}`}>
                                                {initialsFromName(item.actor)}
                                            </div>
                                            <div className="min-w-0 border-b border-slate-100 pb-4">
                                                <div className="flex flex-wrap items-center gap-1.5 text-[12px]">
                                                    <span className="font-semibold text-slate-900">{item.actor}</span>
                                                    <span className="text-slate-300">·</span>
                                                    <span className="font-mono text-[11px] text-slate-400">{dayjs(item.date).format("DD.MM.YYYY HH:mm")}</span>
                                                </div>
                                                <div className="mt-1 text-[12.5px] font-semibold text-slate-800">{item.title}</div>
                                                {item.body && !item.document && (
                                                    <div className="mt-1 whitespace-pre-wrap text-[12.5px] leading-5 text-slate-600">{item.body}</div>
                                                )}
                                                {item.document && renderDocumentTile(item.document)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="border-t border-slate-200 bg-slate-50/70 p-4 lg:border-l lg:border-t-0">
                            <div className="space-y-4">
                                {canManage && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-colors focus-within:border-slate-300">
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-amber-400" />{t('tenders.note_birak')}</div>
                                        <textarea
                                            value={noteText}
                                            onChange={(event) => setNoteText(event.target.value)}
                                            rows={3}
                                            className="mt-2 w-full resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[12.5px] text-slate-900 outline-none transition-colors hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
                                        />
                                        <Button size="sm" variant="primary" icon={<Send size={12} />} loading={noteSaving} onClick={handleSubmitNote} className="mt-2.5">{t('common.send')}</Button>
                                    </div>
                                )}

                                {canManage && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300">
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-violet-400" />{t('tenders.pdf_gorsel_add')}</div>
                                        <input
                                            ref={documentInputRef}
                                            type="file"
                                            accept="application/pdf,image/png,image/jpeg,.pdf,.png,.jpg,.jpeg"
                                            className="sr-only"
                                            disabled={documentSaving}
                                            onChange={(event) => {
                                                const input = event.currentTarget;
                                                const file = input.files?.[0];
                                                input.value = '';
                                                void handleSubmitDocument(file);
                                            }}
                                        />
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant="secondary"
                                            icon={<Upload size={13} />}
                                            loading={documentSaving}
                                            disabled={documentSaving}
                                            onClick={() => documentInputRef.current?.click()}
                                            className="mt-2.5 w-full"
                                        >{t('tenders.file_select')}</Button>
                                    </div>
                                )}

                                {(documentsLoading || tenderDocuments.length > 0) && (
                                    <div className="rounded-xl border border-slate-200 bg-white p-3.5">
                                        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-500"><span className="h-1.5 w-1.5 rounded-full bg-sky-400" />{t('tenders.ekler')}</div>
                                        {documentsLoading ? (
                                            <div className="mt-2 text-[12px] text-slate-500">{t('common.loading')}</div>
                                        ) : (
                                            <div>
                                                {tenderDocuments.map((doc) => (
                                                    <div key={doc.id}>
                                                        {renderDocumentTile(doc, true)}
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="mb-4 min-w-0 overflow-x-auto">
                <div className="min-w-0 overflow-x-auto">
                    <div className="inline-flex min-w-max items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white p-1.5 dark:border-white/15 dark:bg-white/5">
                        {getTenderWorkspaceTabs().map((tab) => {
                            const active = workspaceTab === tab.key;
                            return (
                                <button
                                    key={tab.label}
                                    type="button"
                                    disabled={tab.disabled}
                                    onClick={() => {
                                        if (tab.settingsTab) {
                                            openSettingsTab(tab.settingsTab);
                                            return;
                                        }
                                        setWorkspaceTab(tab.key);
                                    }}
                                    className={`rounded-lg px-4 py-2 text-[13px] font-semibold transition-all ${
                                        active
                                            ? 'bg-[#1f2654] text-white shadow-sm'
                                            : tab.disabled
                                                ? 'cursor-not-allowed text-slate-300 dark:text-white/35'
                                                : 'text-slate-600 hover:bg-slate-100 hover:text-[#1f2654] dark:text-white dark:hover:bg-white/10 dark:hover:text-white'
                                    }`}
                                >
                                    {tab.label}
                                    {tab.disabled && tab.label === t('tenders.technician_ata') && (
                                        <span className="ml-1 text-[11px] font-medium text-slate-300 dark:text-white/35">{t('tenders.eklenecek')}</span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            </div>

            {workspaceTab === 'lines' ? (
                <div className={`grid grid-cols-1 gap-3 ${sectionSchemaOpen ?"2xl:grid-cols-[minmax(0,1fr)_335px] min-[1800px]:grid-cols-[minmax(0,1fr)_460px] min-[2200px]:grid-cols-[minmax(0,1fr)_520px]" :"2xl:grid-cols-[minmax(0,1fr)_72px] min-[1800px]:grid-cols-[minmax(0,1fr)_84px]"}`}>
                    <div className="min-w-0">
                        <Card
                            title={t('tenders.tender_satirlari')}
                            icon={<MdTableChart size={14} />}
                            noPadding
                            actions={
                                isDraft && canManage ? (
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <Button size="sm" variant="secondary" icon={<Package size={12} />} onClick={() => openProductPicker(lastRowId)} className={lineActionButtonClass}>{t('tenders.product_add')}</Button>
                                        <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => handleAddRow('TITLE', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.baslik_add')}</Button>
                                        <Button size="sm" variant="secondary" icon={<FileText size={12} />} onClick={() => handleAddRow('DESCRIPTION', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.description_add')}</Button>
                                        {someRowsSelected && (
                                            <>
                                                <span className="text-[11px] font-medium text-slate-500">{selectedRows.length}{t('tenders.selected')}</span>
                                                <Button size="sm" variant="secondary" onClick={() => setBulkDiscountOpen(true)}>{t('tenders.bulk_discount')}</Button>
                                                <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>{t('common.delete')}</Button>
                                            </>
                                        )}
                                    </div>
                                ) : null
                            }
            >
                <div className="overflow-x-auto">
                    <table data-tender-detail-table className="min-w-[1160px] w-full table-fixed text-[12px]">
                        <colgroup>
                            <col style={fixedLineColumnStyle('select')} />
                            <col />
                            <col style={fixedLineColumnStyle('quantity')} />
                            <col style={fixedLineColumnStyle('unit')} />
                            <col style={fixedLineColumnStyle('unitPrice')} />
                            <col style={fixedLineColumnStyle('discount')} />
                            <col style={fixedLineColumnStyle('taxRate')} />
                            <col style={fixedLineColumnStyle('total')} />
                        </colgroup>
                        <thead className="border-b border-slate-200 bg-slate-50 text-[10.5px] uppercase tracking-wider text-slate-500">
                            <tr>
                                <th className="px-1.5 py-2 text-center font-semibold">
                                    <Checkbox
                                        aria-label={t('tenders.all_satirlari_select')}
                                        size="sm"
                                        isSelected={allRowsSelected}
                                        isIndeterminate={someRowsSelected && !allRowsSelected}
                                        onChange={toggleAllRows}
                                        onClick={(event) => event.stopPropagation()}
                                    />
                                </th>
                                {renderLineHeader(t('nav.articles'), { align: 'left', className: '!border-l-0 px-3' })}
                                {renderLineHeader(t('common.quantity'), { noTruncate: true })}
                                {renderLineHeader(t('tenders.unit'))}
                                {renderLineHeader(sectionSchemaOpen ?t('tenders.unit_price') :t('tenders.unit_price'))}
                                {renderLineHeader(sectionSchemaOpen ?t('tenders.ind') :t('common.discount'))}
                                {renderLineHeader('KDV')}
                                {renderLineHeader(t('common.amount'))}
                            </tr>
                        </thead>
                        <tbody>
                            {simpleRows.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="px-3 py-10 text-center text-[12px] text-slate-400">{t('tenders.tender_line_not_found')}</td>
                                </tr>
                            )}
                            {pagedRows.map((row) => {
                                const position = row.position;
                                const isSelected = selectedId === row.id;
                                const isProduct = row.kind === 'PRODUCT';
                                const isDescription = row.kind === 'DESCRIPTION';
                                const taxRate = Number(position.taxRate || fallbackTaxRate);
                                const visibleLongDescription = isProduct
                                    ? cleanImportedProductDescription(position.longDescription)
                                    : position.longDescription || '';

                                return (
                                    <tr
                                        key={row.id}
                                        onClick={() => setSelectedId(row.id)}
                                        className={`group border-b border-slate-100 transition-colors ${isSelected ? 'bg-[#1f2654]/[0.045]' : row.kind === 'TITLE' ? 'bg-slate-50/70' : 'hover:bg-slate-50/60'}`}
                                    >
                                        <td className="px-1.5 py-2 text-center align-top">
                                            <Checkbox
                                                aria-label={t('tenders.line_select')}
                                                size="sm"
                                                isSelected={!!selectedRowIds[row.id]}
                                                onChange={(checked) => toggleRowSelection(row.id, checked)}
                                                onClick={(event) => event.stopPropagation()}
                                            />
                                        </td>
                                        <td className="px-3 py-2 align-top">
                                            <div className={`flex min-w-0 ${row.label ? 'gap-2' : ''}`}>
                                                {row.label && (
                                                    <span className={`mt-0.5 w-10 shrink-0 font-mono ${row.kind === 'TITLE' ?"text-[13px] font-semibold text-slate-900" :"text-[12px] text-slate-700"}`}>
                                                        {row.label}
                                                    </span>
                                                )}
                                                <div className="min-w-0 flex-1">
                                                    {!isDescription && (
                                                        isDraft ? (
                                                            <input
                                                                aria-label={row.kind === 'TITLE' ?t('tenders.baslik') :t('tenders.product_adi')}
                                                                value={position.shortDescription || ''}
                                                                onChange={(event) => handleInlinePositionChange(row.id, { shortDescription: event.target.value })}
                                                                onClick={(event) => event.stopPropagation()}
                                                                className={`w-full rounded-md border border-transparent bg-transparent px-1.5 py-1 outline-none transition-colors hover:border-slate-200 hover:bg-slate-50 focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10 ${row.kind === 'TITLE' ?"text-[14px] font-semibold text-slate-900" :"text-[13px] font-medium text-slate-900"}`}
                                                            />
                                                        ) : (
                                                            <div className={`${row.kind === 'TITLE' ?"text-[14px] font-semibold text-slate-900" :"text-[13px] font-medium text-slate-900"}`}>
                                                                {position.shortDescription}
                                                            </div>
                                                        )
                                                    )}

                                                    {isDescription && (
                                                        <div className="flex min-w-0 flex-col gap-2">
                                                            {renderImagePicker(row, position)}
                                                            {isDraft ? (
                                                                <RichTextMarkdownEditor
                                                                    value={position.longDescription || ''}
                                                                    onChange={(value) => handleInlinePositionChange(row.id, { longDescription: value || null })}
                                                                    minHeight={82}
                                                                    variant="inline"
                                                                    placeholder=""
                                                                    className="w-full rounded-lg border-slate-200 bg-white px-2 py-1 focus-within:border-[#1f2654] focus-within:ring-2 focus-within:ring-[#1f2654]/10"
                                                                />
                                                            ) : position.longDescription ? (
                                                                <div
                                                                    className="rich-text-preview text-[12.5px] leading-5 text-slate-700 [&_ul]:list-disc [&_ul]:pl-7 [&_li]:my-0.5 [&_li]:pl-1"
                                                                    dangerouslySetInnerHTML={{ __html: markdownToHtml(position.longDescription) }}
                                                                />
                                                            ) : null}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            {isProduct && (
                                                <div className="mt-2 flex min-w-0 flex-col gap-2">
                                                    {renderImagePicker(row, position)}
                                                    {isDraft ? (
                                                        <RichTextMarkdownEditor
                                                            value={visibleLongDescription}
                                                            onChange={(value) => handleInlinePositionChange(row.id, { longDescription: value || null })}
                                                                    minHeight={132}
                                                            variant="inline"
                                                            placeholder=""
                                                            className="w-full rounded-lg border-slate-200 bg-white px-2 py-1 focus-within:border-[#1f2654] focus-within:ring-2 focus-within:ring-[#1f2654]/10"
                                                        />
                                                    ) : visibleLongDescription ? (
                                                        <div
                                                            className="rich-text-preview text-[12.5px] leading-5 text-slate-700 [&_ul]:list-disc [&_ul]:pl-7 [&_li]:my-0.5 [&_li]:pl-1"
                                                            dangerouslySetInnerHTML={{ __html: markdownToHtml(visibleLongDescription) }}
                                                        />
                                                    ) : null}
                                                </div>
                                            )}
                                        </td>
                                        <td className="border-l border-slate-100 px-1.5 py-2 text-right align-top">
                                            {renderPriceInput(row, 'quantity', position.quantity)}
                                        </td>
                                        <td className="border-l border-slate-100 px-1.5 py-2 text-right align-top">
                                            {isProduct && isDraft ? (
                                                <input
                                                    aria-label={t('tenders.unit')}
                                                    value={position.unit || ''}
                                                    onChange={(event) => handleInlinePositionChange(row.id, { unit: event.target.value || null })}
                                                    onClick={(event) => event.stopPropagation()}
                                                    className="w-full min-w-0 rounded-md border border-transparent bg-slate-50 px-1.5 py-1 text-right text-[11.5px] text-slate-700 outline-none transition-colors hover:border-slate-300 hover:bg-white focus:border-[#1f2654] focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10"
                                                />
                                            ) : (
                                                <span className="block text-right text-[11.5px] text-slate-600">{isProduct ? position.unit : ''}</span>
                                            )}
                                        </td>
                                        <td className="border-l border-slate-100 px-1.5 py-2 text-right align-top">
                                            {renderPriceInput(row, 'unitPrice', position.unitPrice)}
                                        </td>
                                        <td className="border-l border-slate-100 px-1.5 py-2 text-right align-top">
                                            {renderPriceInput(row, 'discount', position.discount, { max: 100 })}
                                        </td>
                                        <td className="border-l border-slate-100 px-1.5 py-2 text-right align-top">
                                            {renderPriceInput(row, 'taxRate', taxRate, { max: 100 })}
                                        </td>
                                        <td className="border-l border-slate-100 px-2 py-2 text-right align-top">
                                            <span className="font-mono text-[12px] font-semibold text-slate-900">
                                                {isProduct && row.total > 0 ? fmtMoney(row.total) : ''}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            {isDraft && canManage && (
                                <tr className="border-t border-slate-200 bg-white">
                                    <td />
                                    <td colSpan={7} className="px-2 py-2">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <Button size="sm" variant="secondary" icon={<Package size={12} />} onClick={() => openProductPicker(lastRowId)} className={lineActionButtonClass}>{t('tenders.product_add')}</Button>
                                            <Button size="sm" variant="secondary" icon={<Plus size={12} />} onClick={() => handleAddRow('TITLE', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.baslik_add')}</Button>
                                            <Button size="sm" variant="secondary" icon={<FileText size={12} />} onClick={() => handleAddRow('DESCRIPTION', undefined, undefined, lastRowId)} className={lineActionButtonClass}>{t('tenders.description_add')}</Button>
                                        </div>
                                    </td>
                                </tr>
                            )}
                            <tr className="border-t-2 border-slate-200 bg-slate-50/60">
                                <td colSpan={7} className="px-2 py-2 text-right font-semibold text-slate-700">{t('tenders.general_total')}</td>
                                <td className="px-2 py-2 text-right font-mono text-[12px] font-bold text-slate-900">
                                    {fmtMoney(grandTotal)}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
                {displayRows.length > LINE_PAGE_SIZE && (
                    <div className="flex items-center justify-end border-t border-slate-100 bg-white px-4 py-3">
                        <Pagination
                            current={currentLinePage}
                            pageSize={LINE_PAGE_SIZE}
                            total={displayRows.length}
                            showSizeChanger={false}
                            size="small"
                            onChange={setLinePage}
                        />
                    </div>
                )}
                        </Card>
                    </div>

                    {sectionSchemaOpen ? (
                        (() => {
                            const isProfit = profitabilityResult >= 0;
                            const costShare = profitabilityRevenue > 0 ? Math.min(100, (profitabilityCost / profitabilityRevenue) * 100) : 0;
                            const marginShare = Math.max(0, 100 - costShare);
                            return (
                        <Card
                            title={t('tenders.profit_loss_semasi')}
                            icon={<ListTree size={13} />}
                            className="bg-white"
                            actions={
                                <button
                                    type="button"
                                    aria-label={t('tenders.profit_loss_semasini_kapat')}
                                    title={t('tenders.profit_loss_semasini_kapat')}
                                    onClick={() => setSectionSchemaOpenPersisted(false)}
                                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                                >
                                    <ChevronRight size={15} />
                                </button>
                            }
                        >
                        <div className="space-y-4">
                            <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                                            {t('tenders.profit')}
                                        </div>
                                        <div className={`mt-1.5 font-mono text-[26px] font-semibold leading-none tracking-tight ${isProfit ? 'text-emerald-700' : 'text-rose-600'}`}>
                                            {fmtMoney(profitabilityResult)}
                                        </div>
                                    </div>
                                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold tabular-nums ring-1 ring-inset ${isProfit ? 'bg-emerald-50 text-emerald-700 ring-emerald-200/70' : 'bg-rose-50 text-rose-600 ring-rose-200/70'}`}>
                                        {isProfit ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                        {profitabilityRate.toFixed(1)}%
                                    </span>
                                </div>
                                <div className="mt-4">
                                    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                                        <div className="h-full bg-slate-400" style={{ width: `${costShare}%` }} />
                                        <div className={`h-full ${isProfit ? 'bg-emerald-500' : 'bg-rose-400'}`} style={{ width: `${marginShare}%` }} />
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-[10.5px] font-medium text-slate-500">
                                        <span>{t('tenders.cost')} · {costShare.toFixed(0)}%</span>
                                        <span className={isProfit ? 'text-emerald-700' : 'text-rose-600'}>{t('tenders.profit')} · {marginShare.toFixed(0)}%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5">
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.sales')}</div>
                                    <div className="mt-1.5 font-mono text-[16px] font-semibold text-slate-900">{fmtMoney(profitabilityRevenue)}</div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">{t('tenders.kdv_haric')}</div>
                                </div>
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                    <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.cost')}</div>
                                    <div className="mt-1.5 font-mono text-[16px] font-semibold text-slate-900">{fmtMoney(profitabilityCost)}</div>
                                    <div className="mt-0.5 text-[10px] text-slate-400">{costShare.toFixed(0)}%</div>
                                </div>
                            </div>

                            {selectedProfitabilityLine && (
                                <div className="rounded-xl border border-slate-200 bg-white p-3 ring-1 ring-inset ring-[#1f2654]/[0.04]">
                                    <div className="flex items-baseline gap-2">
                                        {selectedProfitabilityLine.label && (
                                            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-slate-500">{selectedProfitabilityLine.label}</span>
                                        )}
                                        <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-slate-800">
                                            {rowPreviewText(selectedProfitabilityLine) ||t('tenders.selected_line')}
                                        </span>
                                    </div>
                                    <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                        <div className="rounded-lg bg-slate-50 py-1.5">
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.sales')}</div>
                                            <div className="mt-0.5 font-mono text-[12.5px] font-semibold text-slate-800">{fmtMoney(selectedProfitabilityLine.revenue)}</div>
                                        </div>
                                        <div className="rounded-lg bg-slate-50 py-1.5">
                                            <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.cost')}</div>
                                            <div className="mt-0.5 font-mono text-[12.5px] font-semibold text-slate-800">{fmtMoney(selectedProfitabilityLine.cost)}</div>
                                        </div>
                                        <div className={`rounded-lg py-1.5 ${selectedProfitabilityLine.result >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}`}>
                                            <div className={`text-[10px] font-semibold uppercase tracking-wider ${selectedProfitabilityLine.result >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{t('tenders.profit')}</div>
                                            <div className={`mt-0.5 font-mono text-[12.5px] font-semibold ${selectedProfitabilityLine.result >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                                                {fmtMoney(selectedProfitabilityLine.result)}
                                            </div>
                                            <div className={`text-[10px] font-semibold ${selectedProfitabilityLine.result >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>{selectedProfitabilityLine.resultRate.toFixed(1)}%</div>
                                        </div>
                                    </div>
                                    <div className="mt-2.5 flex flex-wrap items-center gap-x-1 border-t border-slate-100 pt-2 text-[10.5px] text-slate-500">
                                        <span>{t('tenders.unit_cost')}</span>
                                        <span className="font-mono font-semibold text-slate-700">{fmtMoney(selectedProfitabilityLine.unitCost)}</span>
                                        <span className="px-0.5 text-slate-300">·</span>
                                        <span>{selectedProfitabilityLine.costSource}</span>
                                    </div>
                                </div>
                            )}

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">{t('tenders.profit_loss_akisi')}</span>
                                    {profitabilityRows.length > 0 && (
                                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">{profitabilityRows.length}</span>
                                    )}
                                </div>
                                {profitabilityRows.length === 0 ? (
                                    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-3 py-8 text-center">
                                        <ListTree size={18} className="text-slate-300" />
                                        <span className="text-[12px] text-slate-400">{t('tenders.no_product_line_for_profit_loss')}</span>
                                    </div>
                                ) : (
                                    <div className="max-h-[520px] space-y-1.5 overflow-y-auto pr-1">
                                        {profitabilityRows.map((row) => {
                                            const rowProfit = row.result >= 0;
                                            const rowMargin = row.revenue > 0 ? Math.min(100, Math.max(0, (row.result / row.revenue) * 100)) : 0;
                                            const active = selectedId === row.id;
                                            return (
                                                <button
                                                    key={row.id}
                                                    type="button"
                                                    onClick={() => setSelectedId(row.id)}
                                                    className={`flex w-full items-start gap-2.5 rounded-xl border px-2.5 py-2.5 text-left transition-all ${active ? 'border-[#1f2654]/30 bg-[#1f2654]/[0.04] ring-1 ring-[#1f2654]/10' : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'}`}
                                                >
                                                    {row.label && (
                                                        <span className={`mt-0.5 inline-flex h-5 min-w-[22px] shrink-0 items-center justify-center rounded-md px-1 font-mono text-[10.5px] font-semibold ${active ? 'bg-[#1f2654] text-white' : 'bg-slate-100 text-slate-500'}`}>
                                                            {row.label}
                                                        </span>
                                                    )}
                                                    <span className="min-w-0 flex-1">
                                                        <span className="flex items-center justify-between gap-2">
                                                            <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">{rowPreviewText(row)}</span>
                                                            <span className={`shrink-0 font-mono text-[11.5px] font-bold ${rowProfit ? 'text-emerald-600' : 'text-rose-600'}`}>{row.resultRate.toFixed(1)}%</span>
                                                        </span>
                                                        <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                                                            <span className={`block h-full rounded-full ${rowProfit ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${rowMargin}%` }} />
                                                        </span>
                                                        <span className="mt-1 flex items-center justify-between text-[10.5px] text-slate-400">
                                                            <span className="tabular-nums">{fmtMoney(row.revenue)}</span>
                                                            <span className={`font-mono font-semibold ${rowProfit ? 'text-emerald-700' : 'text-rose-700'}`}>{fmtMoney(row.result)}</span>
                                                        </span>
                                                    </span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}
                            </div>
                        </div>
                        </Card>
                            );
                        })()
                    ) : (
                        <div className="flex min-h-[104px] items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-white p-3 2xl:flex-col 2xl:justify-start">
                            <button
                                type="button"
                                aria-label={t('tenders.profit_loss_semasini_open')}
                                title={t('tenders.profit_loss_semasini_open')}
                                onClick={() => setSectionSchemaOpenPersisted(true)}
                                className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition-colors hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700"
                            >
                                <ChevronLeft size={16} />
                            </button>
                            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 2xl:flex-col">
                                <span className={`flex h-8 w-8 items-center justify-center rounded-lg ${profitabilityResult >= 0 ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                                    {profitabilityResult >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                </span>
                                <span className="whitespace-nowrap 2xl:[writing-mode:vertical-rl] 2xl:rotate-180">{t('tenders.profit_loss')}</span>
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                <TenderSettingsModal
                    open
                    inline
                    hideTabs
                    onClose={() => setWorkspaceTab('lines')}
                    tenderId={tender.id}
                    tree={tree}
                    grandTotal={grandTotal}
                    initialTab={settingsInitialTab}
                    overtimeHourlyRate={overtimeHourlyRate}
                    onOvertimeHourlyRateChange={setOvertimeHourlyRate}
                    onChanged={() => fetchDetail(tender.id, true)}
                />
            )}

            <Modal
                open={orderDecisionOpen}
                onClose={() => {
                    if (!orderDecisionLoading) setOrderDecisionOpen(false);
                }}
                title={t('tenders.order_turunu_select')}
                description={t('tenders.tender_onaylandiktan_sonra_order_record_create')}
                width="lg"
                closeOnBackdrop={false}
                footer={
                    <>
                        <Button variant="secondary" disabled={orderDecisionLoading} onClick={() => setOrderDecisionOpen(false)}>{t('tenders.vazgec')}</Button>
                        <Button variant="primary" loading={orderDecisionLoading} onClick={handleSubmitOrderDecision}>{t('tenders.order_create')}</Button>
                    </>
                }
            >
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                        <button
                            type="button"
                            onClick={() => setOrderMode('PROJECT_NEW')}
                            className={`rounded-md border px-3 py-3 text-left transition-colors ${orderMode === 'PROJECT_NEW' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            <div className="text-[13px] font-semibold">{t('tenders.project_icin_order_create')}</div>
                            <div className="mt-1 text-[11.5px] text-slate-500">{t('tenders.create_project_or_link_existing')}</div>
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                setOrderMode('INVOICE');
                                setAttachExistingProject(false);
                                setSelectedExistingProject(null);
                            }}
                            className={`rounded-md border px-3 py-3 text-left transition-colors ${orderMode === 'INVOICE' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                        >
                            <div className="text-[13px] font-semibold">{t('tenders.invoice_icin_order_create')}</div>
                            <div className="mt-1 text-[11.5px] text-slate-500">{t('tenders.project_olusturulmaz_crm_order_listesine_duser')}</div>
                        </button>
                    </div>

                    {orderMode === 'PROJECT_NEW' && (
                        <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
                            <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
                                <input
                                    type="checkbox"
                                    checked={attachExistingProject}
                                    onChange={(event) => {
                                        setAttachExistingProject(event.target.checked);
                                        setSelectedExistingProject(null);
                                    }}
                                />{t('tenders.add_to_existing_project')}</label>

                            {!attachExistingProject ? (
                                <Field label={t('tenders.project_ismi')}>
                                    <Input value={orderProjectName} onChange={(event) => setOrderProjectName(event.target.value)} />
                                </Field>
                            ) : (
                                <div className="space-y-2 transition-all duration-200 ease-out">
                                    <Field label={t('tenders.project_search')}>
                                        <Input
                                            value={projectSearch}
                                            onChange={(event) => setProjectSearch(event.target.value)}
                                            placeholder={t('tenders.project_adi_customer_veya_tender_no')}
                                        />
                                    </Field>
                                    <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white">
                                        {projectSearchLoading ? (
                                            <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('tenders.projects_araniyor')}</div>
                                        ) : projectSearchResults.length === 0 ? (
                                            <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('tenders.project_not_found')}</div>
                                        ) : (
                                            <div className="divide-y divide-slate-100">
                                                {projectSearchResults.map((project) => (
                                                    <button
                                                        key={project.id}
                                                        type="button"
                                                        onClick={() => setSelectedExistingProject(project)}
                                                        className={`w-full px-3 py-2 text-left transition-colors ${selectedExistingProject?.id === project.id ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}
                                                    >
                                                        <div className="text-[13px] font-semibold">{project.projectName}</div>
                                                        <div className="mt-0.5 text-[11.5px] text-slate-500">{project.customer?.companyName ||t('tenders.customer_not_found')}</div>
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </Modal>

            <Modal
                open={productPickerOpen}
                onClose={() => {
                    setProductPickerOpen(false);
                    setProductPickerAfterRowId(undefined);
                }}
                title={t('tenders.product_add')}
                description={t('tenders.stock_product_select_info_tender_kopyalanir')}
                width="xl"
                closeOnBackdrop
            >
                <div className="space-y-3">
                    <Field label={t('common.search')}>
                        <Input
                            autoFocus
                            value={productSearch}
                            onChange={(event) => setProductSearch(event.target.value)}
                            placeholder={t('tenders.product_name_stock_code_barcode_or_category')}
                        />
                    </Field>
                    <div className="max-h-[520px] overflow-y-auto rounded-md border border-slate-200 bg-white">
                        {stockArticlesLoading ? (
                            <div className="px-4 py-10 text-center text-[12px] text-slate-400">{t('tenders.productler_loading')}</div>
                        ) : filteredStockArticles.length === 0 ? (
                            <div className="space-y-4 px-4 py-8 text-center">
                                <div>
                                    <div className="text-[13px] font-semibold text-slate-800">{t('tenders.product_not_found')}</div>
                                    <div className="mt-1 text-[12px] text-slate-500">{t('tenders.bu_product_only_bu_tender_icin_yazabilir_veya')}</div>
                                </div>
                                <div className="flex flex-wrap justify-center gap-2">
                                    <Button variant="secondary" icon={<FileText size={13} />} onClick={openManualProduct}>{t('tenders.create_tender_only_product')}</Button>
                                    <Button variant="primary" icon={<Package size={13} />} onClick={openStockArticleCreate}>{t('tenders.productu_to_stock_add')}</Button>
                                </div>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {filteredStockArticles.map((article: ArticleStockSummary) => (
                                    <button
                                        key={article.id}
                                        type="button"
                                        onClick={() => {
                                            const afterRowId = productPickerAfterRowId;
                                            setProductPickerOpen(false);
                                            setProductPickerAfterRowId(undefined);
                                            void handleAddRow('PRODUCT', article, undefined, afterRowId);
                                        }}
                                        className="group flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-[#1f2654] hover:text-white hover:[&_*]:!text-white"
                                    >
                                        <div className="shrink-0">
                                            {article.imageUrl ? (
                                                <img
                                                    src={article.imageUrl}
                                                    alt={article.name}
                                                    className="h-12 w-12 rounded-md border border-slate-200 object-cover"
                                                />
                                            ) : (
                                                <div className="flex h-12 w-12 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-300">
                                                    <Package size={18} />
                                                </div>
                                            )}
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                <span className="font-mono text-[10.5px] text-slate-400 transition-colors group-hover:text-white">{article.articleCode}</span>
                                                {article.category && (
                                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 transition-colors group-hover:bg-white/15 group-hover:text-white">{article.category}</span>
                                                )}
                                            </div>
                                            <div className="mt-0.5 truncate text-[13px] font-semibold text-slate-900 transition-colors group-hover:text-white">{article.name}</div>
                                            {article.description && (
                                                <div className="mt-0.5 line-clamp-1 text-[11.5px] text-slate-500 transition-colors group-hover:text-white">{article.description}</div>
                                            )}
                                            <div className="mt-1 text-[11px] text-slate-400 transition-colors group-hover:text-white">{t('tenders.stock')}<span className="font-mono font-medium text-slate-600 transition-colors group-hover:text-white">{article.totalQuantity ?? 0} {article.unit}</span>
                                            </div>
                                            <div className="mt-0.5 text-[10.5px] text-slate-400 transition-colors group-hover:text-white">{"Ort. maliyet:"}<span className="font-mono">{fmtMoney(getArticleUnitCost(article))}</span>
                                            </div>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            <div className="font-mono text-[14px] font-bold text-slate-900 transition-colors group-hover:text-white">{fmtMoney(getArticleSalePrice(article))}</div>
                                            <div className="mt-0.5 text-[10px] text-slate-400 transition-colors group-hover:text-white">{"satis /"}{article.unit ?? ''}</div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </Modal>

            <Modal
                open={manualProductOpen}
                onClose={() => setManualProductOpen(false)}
                title={t('tenders.tender_only_product')}
                description={t('tenders.bu_product_stock_card_yazilmaz_only_bu_tender')}
                width="lg"
                closeOnBackdrop
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setManualProductOpen(false)}>{t('common.cancel')}</Button>
                        <Button variant="primary" onClick={handleCreateManualProduct}>{t('tenders.tender_add')}</Button>
                    </>
                }
            >
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('tenders.product_adi')} required className="col-span-2">
                        <Input value={manualProduct.name} onChange={(event) => setManualProduct({ ...manualProduct, name: event.target.value })} />
                    </Field>
                    <Field label={t('common.quantity')}>
                        <Input type="number" min={0} step="any" value={manualProduct.quantity} onChange={(event) => setManualProduct({ ...manualProduct, quantity: parseInlineNumber(event.target.value) })} />
                    </Field>
                    <Field label={t('tenders.unit')}>
                        <Input value={manualProduct.unit} onChange={(event) => setManualProduct({ ...manualProduct, unit: event.target.value })} />
                    </Field>
                    <Field label={t('tenders.unit_price')}>
                        <Input type="number" min={0} step="any" value={manualProduct.unitPrice} onChange={(event) => setManualProduct({ ...manualProduct, unitPrice: parseInlineNumber(event.target.value) })} />
                    </Field>
                    <Field label={t('tenders.discount')}>
                        <Input type="number" min={0} max={100} step="any" value={manualProduct.discount} onChange={(event) => setManualProduct({ ...manualProduct, discount: parseInlineNumber(event.target.value, 100) })} />
                    </Field>
                    <Field label={t('tenders.kdv')}>
                        <Input type="number" min={0} max={100} step="any" value={manualProduct.taxRate} onChange={(event) => setManualProduct({ ...manualProduct, taxRate: parseInlineNumber(event.target.value, 100) })} />
                    </Field>
                    <Field label={t('tenders.gorsel')}>
                        <div className="flex items-center gap-3 rounded-md border border-slate-200 bg-white p-2">
                            {manualProduct.imageUrl ? (
                                <img src={manualProduct.imageUrl} alt="" className="h-14 w-14 rounded-md border border-slate-200 object-cover" />
                            ) : (
                                <div className="flex h-14 w-14 items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50 text-slate-300">
                                    <ImageIcon size={18} />
                                </div>
                            )}
                            <div className="min-w-0 flex-1">
                                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] font-medium text-slate-700 hover:bg-slate-100">
                                    <Upload size={12} />{t('tenders.gorsel_select')}<input
                                        type="file"
                                        accept="image/*"
                                        className="sr-only"
                                        onChange={(event) => {
                                            const input = event.currentTarget;
                                            void handleManualProductImage(input.files?.[0]);
                                            input.value = '';
                                        }}
                                    />
                                </label>
                                {manualProduct.imageUrl && (
                                    <button
                                        type="button"
                                        className="ml-2 text-[11px] font-medium text-rose-600 hover:text-rose-700"
                                        onClick={() => setManualProduct({ ...manualProduct, imageUrl: '' })}
                                    >{t('common.remove')}</button>
                                )}
                            </div>
                        </div>
                    </Field>
                    <Field label={t('tenders.product_content')} className="col-span-2">
                        <RichTextMarkdownEditor
                            value={manualProduct.description}
                            onChange={(description) => setManualProduct({ ...manualProduct, description })}
                            minHeight={140}
                            placeholder=""
                        />
                    </Field>
                </div>
            </Modal>

            {stockArticleInitial && (
                <TenderArticleFormModal
                    initial={stockArticleInitial}
                    onClose={() => setStockArticleInitial(null)}
                    onSubmit={handleCreateStockArticle}
                />
            )}

            <Modal
                open={bulkDeleteOpen}
                onClose={() => !bulkActionLoading && setBulkDeleteOpen(false)}
                title={t('tenders.bulk_silme')}
                description={`${selectedRows.length} satır seçildi.`}
                width="sm"
                closeOnBackdrop={!bulkActionLoading}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkDeleteOpen(false)} disabled={bulkActionLoading}>{t('tenders.vazgec')}</Button>
                        <Button variant="danger" loading={bulkActionLoading} onClick={handleBulkDelete}>{t('common.delete')}</Button>
                    </>
                }
            >
                <div className="space-y-3 text-[13px]">
                    <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-rose-800">{t('tenders.silmek_istediginizden_emin_misiniz')}</div>
                    <div className="rounded-md border border-slate-200 bg-white">
                        <div className="border-b border-slate-100 px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{t('tenders.silinecek_satirlar')}{selectedRows.length})
                        </div>
                        <ul className="max-h-[180px] overflow-y-auto divide-y divide-slate-100">
                            {selectedRows.slice(0, 8).map((row) => (
                                <li key={row.id} className="px-3 py-2">
                                    <div className="font-medium text-slate-800">{row.position.shortDescription}</div>
                                </li>
                            ))}
                            {selectedRows.length > 8 && (
                                <li className="px-3 py-2 text-slate-500">+{selectedRows.length - 8}{t('tenders.line_daha')}</li>
                            )}
                        </ul>
                    </div>
                </div>
            </Modal>

            <Modal
                open={bulkDiscountOpen}
                onClose={() => !bulkActionLoading && setBulkDiscountOpen(false)}
                title={t('tenders.bulk_discount')}
                description={t('tenders.discount_applies_to_selected_product_lines')}
                width="sm"
                closeOnBackdrop={!bulkActionLoading}
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setBulkDiscountOpen(false)} disabled={bulkActionLoading}>{t('tenders.vazgec')}</Button>
                        <Button
                            variant="primary"
                            loading={bulkActionLoading}
                            disabled={discountEligibleRows.length === 0}
                            onClick={handleBulkDiscount}
                        >{t('tenders.bulk_discount_yap')}</Button>
                    </>
                }
            >
                <div className="space-y-3">
                    <Field label={t('tenders.discount')}>
                        <Input
                            type="number"
                            step="0.1"
                            min={0}
                            max={100}
                            value={bulkDiscountValue}
                            onChange={(event) => setBulkDiscountValue(parseInlineNumber(event.target.value, 100))}
                        />
                    </Field>
                    <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px]">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wider text-emerald-700">{t('tenders.product_to_apply')}</div>
                        <div className="mt-1 font-mono text-lg font-semibold text-emerald-900">{discountEligibleRows.length}</div>
                    </div>
                </div>
            </Modal>

            <Modal
                open={Boolean(documentPreview)}
                onClose={() => setDocumentPreview(null)}
                title={documentPreview?.fileName ||t('tenders.additional_file')}
                width="xl"
                footer={documentPreview && (
                    <a
                        href={documentPreview.fileUrl}
                        download={documentPreview.fileName}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-2 rounded-md border border-[#1f2654] bg-[#1f2654] px-3 py-2 text-[12px] font-semibold text-white transition-colors hover:bg-[#151a3b]"
                    >
                        <FileDown size={14} />{t('common.download')}</a>
                )}
            >
                {documentPreview && (
                    <div className="flex min-h-[320px] items-center justify-center rounded-md border border-slate-200 bg-slate-50 p-2">
                        {isPreviewableDocument(documentPreview) ? (
                            <img
                                src={documentPreview.fileUrl}
                                alt={documentPreview.fileName}
                                className="max-h-[70vh] w-full object-contain"
                            />
                        ) : isPdfDocument(documentPreview) ? (
                            <iframe
                                src={documentPreview.fileUrl}
                                title={documentPreview.fileName}
                                className="h-[70vh] w-full rounded border border-slate-200 bg-white"
                            />
                        ) : (
                            <div className="flex flex-col items-center justify-center gap-2 text-slate-500">
                                <FileText size={36} />
                                <span className="max-w-full truncate text-[13px] font-medium">{documentPreview.fileName}</span>
                            </div>
                        )}
                    </div>
                )}
            </Modal>

            <ExportModal
                open={exportOpen}
                onClose={() => setExportOpen(false)}
                tenderId={tender.id}
                tenderNumber={tender.tenderNumber}
                tree={tree}
                grandTotal={grandTotal}
            />

        </div>
    );
};
