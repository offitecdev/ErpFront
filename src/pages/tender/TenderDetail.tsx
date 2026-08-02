import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { LuTable2 as MdTableChart } from '@/components/icons/lucideLocal';
import {
    File05 as FileText,
    FileDownload02 as FileDown,
    Coins01 as CoinsIcon,
} from '@/components/icons/antIconCompat';

import { PlainButton as Button, PlainCard as Card } from './detail/components/common/PlainUi';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { apiClient } from '../../lib/axios';
import { onIdle } from '../../lib/utils/onIdle';
import { tenderApi } from '../../lib/api/tender';
import { customerApi, type CustomerLocationDto } from '../../lib/api/customer';
import type { PositionDto, TenderChangeLog, TenderDocumentDto } from '../../types/tender';

import TenderCreate from './TenderCreate';
import {
    STATUS_VARIANT,
    buildTree,
    getStatusLabel,
} from './detail/tenderDetailUtils';
import { useMoneyFormat } from './detail/utils/useMoneyFormat';
import { toCurrencyCode } from '../../utils/currency';
import { localizeTenderNumber } from '../../utils/tenderNumber';

import { t } from '@/i18n/translate';
import type { ArticleQuickPick } from '@/types/inventory';

import type {
    ManualProductForm,
    ProductSource,
    ChatterTimelineItem,
    CustomerOption,
    TenderSettingsTabKey,
    TenderWorkspaceTabKey,
} from './detail/types/tenderDetail.types';
import {
    DEFAULT_VAT,
    EMPTY_CHATTER_SUMMARY,
} from './detail/utils/tenderDetail.constants';
import { getLineKind } from './detail/utils/tenderCalculation.utils';
import { buildSimpleTenderLines } from './detail/utils/tenderLine.utils';
import {
    fileToDataUrl,
    isPreviewableDocument,
    isPdfDocument,
    normalizeDocumentName,
    inferDocumentType,
} from './detail/utils/tenderDocument.utils';
import {
    EMPTY_TENDER_ADDRESS_FORM,
    EMPTY_TENDER_CUSTOMER_FORM,
    formatLocationAddress,
    locationKindOf,
    type TenderAddressCreateForm,
    type TenderCustomerCreateForm,
} from './detail/utils/tenderAddress.utils';
import { buildProductDefaults, emptyManualProduct, parseClosingImages } from './detail/utils/tenderProduct.utils';
import { attachPdfPositionImages } from './detail/utils/tenderPdfImages.utils';
import { defaultTenderValidUntil } from './detail/utils/tenderDate.utils';
import { isSourceSalesOrder } from './detail/utils/tenderStatus.utils';
import { computeTenderPricingSummary } from './detail/utils/tenderPricing.utils';
import { discountDisplayName, seedTotalDiscounts } from './detail/utils/tenderDiscounts.utils';
import { useLanguageRefresh } from './detail/hooks/useLanguageRefresh';
import { useTenderCustomers } from './detail/hooks/useTenderCustomers';
import { useTenderCustomerLocations } from './detail/hooks/useTenderCustomerLocations';
import { useCustomerProductDiscounts } from './detail/hooks/useCustomerProductDiscounts';
import { useTenderAddressDefaults } from './detail/hooks/useTenderAddressDefaults';
import { useTenderProductPicker } from './detail/hooks/useTenderProductPicker';
import { useTenderLineKeyboardNavigation } from './detail/hooks/useTenderLineKeyboardNavigation';
import { useTenderProfitability } from './detail/hooks/useTenderProfitability';
import { useTenderChatter } from './detail/hooks/useTenderChatter';
import { useTenderOrderDecision } from './detail/hooks/useTenderOrderDecision';
import { useTenderLineStaging } from './detail/hooks/useTenderLineStaging';
import { TenderDetailLoadingSkeleton } from './detail/components/TenderDetailLoadingSkeleton';
import { TenderDetailHeader } from './detail/components/TenderDetailHeader';
import { TenderWorkspaceTabs } from './detail/components/TenderWorkspaceTabs';
import { TenderLineTable } from './detail/components/lines/TenderLineTable';
import { RESET_DRAFT_EVENT } from './detail/components/TenderLineInputs';
import { TenderCustomerSection } from './detail/components/customer/TenderCustomerSection';
import { TenderCustomerCard, type TenderCardGroup } from './detail/components/customer/TenderCustomerCard';
import { QuoteDatePicker } from './detail/components/common/QuoteDatePicker';
import { TenderAddressPicker, TenderBillingAddressRow } from './detail/components/address/TenderAddressSection';
import { TenderAddressTypeRow, type TenderAddressType } from './detail/components/address/TenderAddressTypeRow';
import { toAddressForm, toAddressPayload } from '@/components/ui-shared/addressForm';
import { TenderProductSearchDropdown } from './detail/components/product/TenderProductSearchDropdown';
import { useUnsavedChangesGuard } from './detail/hooks/useUnsavedChangesGuard';
import { usePageScrollLock } from './detail/hooks/usePageScrollLock';
import { joinAddress, renderDetailLines, splitAddress, valueOrBlank } from './detail/components/info/TenderDetailInfoRows';
import { TenderPriceSummary } from './detail/components/info/TenderPriceSummary';
import { TenderPaymentTab } from './detail/components/payment/TenderPaymentTab';
import { TenderCommissionInput } from './detail/components/info/TenderCommissionInput';
import { TenderCurrencySelect } from './detail/components/info/TenderCurrencySelect';

const LazyTenderSettingsModal = lazy(() =>
    import('./detail/components/modals/TenderSettingsModal').then((mod) => ({ default: mod.TenderSettingsModal }))
);
const LazyExportModal = lazy(() =>
    import('./detail/components/modals/ExportModal').then((mod) => ({ default: mod.ExportModal }))
);
// Lazily loaded: it pulls in the rich-text editor, which must not sit in the
// quote page's own bundle for a panel most offers never open.
const LazyTenderPdfContentPanel = lazy(() =>
    import('./detail/components/pdf/TenderPdfContentPanel').then((mod) => ({ default: mod.TenderPdfContentPanel }))
);
const LazyTenderLogsPanel = lazy(() =>
    import('./detail/TenderLogsPanel').then((mod) => ({ default: mod.TenderLogsPanel }))
);
const LazyTenderProductPickerModal = lazy(() =>
    import('./detail/components/product/TenderProductPickerModal').then((mod) => ({ default: mod.TenderProductPickerModal }))
);
const LazyTenderManualProductModal = lazy(() =>
    import('./detail/components/product/TenderManualProductModal').then((mod) => ({ default: mod.TenderManualProductModal }))
);
const LazyTenderBulkDeleteModal = lazy(() =>
    import('./detail/components/bulk/TenderBulkDeleteModal').then((mod) => ({ default: mod.TenderBulkDeleteModal }))
);
const LazyTenderBulkDiscountModal = lazy(() =>
    import('./detail/components/bulk/TenderBulkDiscountModal').then((mod) => ({ default: mod.TenderBulkDiscountModal }))
);
// Stacked-discount editors: neither is on the quote's critical path, and both
// pull in the shared list editor — kept out of the page's own bundle.
const LazyTenderLineDiscountModal = lazy(() =>
    import('./detail/components/discounts/TenderLineDiscountModal').then((mod) => ({ default: mod.TenderLineDiscountModal }))
);
const LazyTenderTotalDiscountModal = lazy(() =>
    import('./detail/components/discounts/TenderTotalDiscountModal').then((mod) => ({ default: mod.TenderTotalDiscountModal }))
);
const LazyTenderCustomerCreateModal = lazy(() =>
    import('./detail/components/customer/TenderCustomerCreateModal').then((mod) => ({ default: mod.TenderCustomerCreateModal }))
);
const LazyTenderAddressCreateModal = lazy(() =>
    import('./detail/components/address/TenderAddressCreateModal').then((mod) => ({ default: mod.TenderAddressCreateModal }))
);
const LazyTenderDocumentPreviewModal = lazy(() =>
    import('./detail/components/documents/TenderDocumentPreviewModal').then((mod) => ({ default: mod.TenderDocumentPreviewModal }))
);
const LazyTenderOrderDecisionModal = lazy(() =>
    import('./detail/components/order/TenderOrderDecisionModal').then((mod) => ({ default: mod.TenderOrderDecisionModal }))
);
const LazyUnsavedChangesModal = lazy(() =>
    import('./detail/components/UnsavedChangesModal').then((mod) => ({ default: mod.UnsavedChangesModal }))
);
const LazyProjectCreatedModal = lazy(() =>
    import('./detail/components/ProjectCreatedModal').then((mod) => ({ default: mod.ProjectCreatedModal }))
);
const LazyDeleteOfferModal = lazy(() =>
    import('./detail/components/modals/DeleteOfferModal').then((mod) => ({ default: mod.DeleteOfferModal }))
);

const LazyPanelFallback = () => (
    <div className="min-h-[280px] animate-pulse rounded-[2px] border border-slate-100 bg-slate-50" />
);






export const TenderDetail = () => {
    useLanguageRefresh();
    const fmtMoney = useMoneyFormat();
    const { id } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const isCreatingTender = id === 'new';
    // Initial-entry mode: set by TenderCreate's redirect. While active, leaving
    // the page auto-saves everything (no button press needed). The first
    // successful save — manual or automatic — turns it off, so subsequent edits
    // require the explicit Save button again. The sessionStorage marker keeps
    // the mode off even when Back/Forward restores the flagged history entry.
    const initialEntryDoneKey = `tender-initial-entry-done:${id}`;
    const [autoSaveOnExit, setAutoSaveOnExit] = useState(false);
    useEffect(() => {
        const flagged = Boolean((location.state as { autoSaveOnExit?: boolean } | null)?.autoSaveOnExit);
        setAutoSaveOnExit(flagged && !window.sessionStorage.getItem(initialEntryDoneKey));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id]);
    const { settings: pdfSettings } = usePdfSettingsStore();
    const { permissions, user } = useAuthStore();
    const canManage = permissions.length === 0 || permissions.includes('tenders.manage');
    const canApprove = permissions.length === 0 || permissions.includes('tenders.approve');
    const canExport = permissions.length === 0 || permissions.includes('tenders.export');

    const {
        detail,
        loadingDetail,
        fetchDetail,
        ensurePdfContent,
        stockArticles,
        stockArticlesLoading,
        stockArticlesLoaded,
        fetchStockArticles,
        activities,
        fetchActivities,
        logs,
        createVersion,
        deleteTender,
    } = useTenderStore();

    const fallbackTaxRate = pdfSettings.vatRate ?? DEFAULT_VAT;
    const minimumTenderValidUntil = useMemo(() => defaultTenderValidUntil(), []);
    const {
        newTenderCustomerQuery,
        setNewTenderCustomerQuery,
        newTenderCustomerOpen,
        setNewTenderCustomerOpen,
        setNewTenderCustomers,
        newTenderCustomersLoading,
        filteredNewTenderCustomers,
    } = useTenderCustomers({ canManage, isCreatingTender, detailCustomerName: detail?.tender.customerName });
    const {
        customerLocations,
        setCustomerLocations,
        customerLocationsLoaded,
    } = useTenderCustomerLocations({
        tenderCustomerId: detail?.tender.status === 'Draft' && canManage
            ? detail.tender.customerId
            : null,
    });
    // Quick "+ add address" popup launched from the tender's address section.
    const [addrModalOpen, setAddrModalOpen] = useState(false);
    const [addrTarget, setAddrTarget] = useState<'INSTALLATION' | 'DELIVERY' | 'BILLING' | 'CUSTOMER'>('INSTALLATION');
    // The quote's single address slot is EITHER Projekt- or Lieferadresse.
    const [tenderAddressType, setTenderAddressType] = useState<TenderAddressType>('INSTALLATION');
    const [addrForm, setAddrForm] = useState<TenderAddressCreateForm>(EMPTY_TENDER_ADDRESS_FORM);
    const [addrSaving, setAddrSaving] = useState(false);
    // Quick "+ add customer" popup launched from the tender's customer section.
    const [customerModalOpen, setCustomerModalOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState<TenderCustomerCreateForm>(EMPTY_TENDER_CUSTOMER_FORM);
    const [customerSaving, setCustomerSaving] = useState(false);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const {
        productPickerOpen,
        setProductPickerOpen,
        productPickerAfterRowId,
        setProductPickerAfterRowId,
        productSearch,
        setProductSearch,
        productPickerPage,
        setProductPickerPage,
        pickerItems,
        pickerTotal,
        pickerLoading,
    } = useTenderProductPicker();
    // Anchored product dropdown (portal overlay). Two modes:
    //  - 'add':   opened from an "Add Product" button — selecting stages a new row
    //  - 'combo': opened by clicking a product row's name — selecting swaps that
    //             row's product in place (Odoo-style combobox)
    // The article search is always anchored to a row's name cell now — "Add
    // product" appends a blank row and opens the combobox there, so there is no
    // longer a second "opened from a button" mode.
    const [productDropdown, setProductDropdown] = useState<
        { anchorEl: HTMLElement; rowId: string } | null
    >(null);
    // Search text for combo mode — mirrors what the user types into the row's
    // product name input.
    const [comboSearch, setComboSearch] = useState('');
    // Set when the full picker / manual-product modal is reached FROM a row's
    // combobox. Their result then fills that row instead of appending a new one,
    // which would otherwise leave the blank row stranded above it.
    const [comboTargetRowId, setComboTargetRowId] = useState<string | null>(null);
    // One-shot signal: the table focuses this row's name cell and opens its
    // article combobox. Cleared as soon as the combobox opens.
    const [autoFocusProductRowId, setAutoFocusProductRowId] = useState<string | null>(null);
    const [manualProductOpen, setManualProductOpen] = useState(false);
    const [manualProduct, setManualProduct] = useState<ManualProductForm>(() => emptyManualProduct('', fallbackTaxRate));
    const [exportOpen, setExportOpen] = useState(false);
    const [deleteOfferOpen, setDeleteOfferOpen] = useState(false);
    const [deletingOffer, setDeletingOffer] = useState(false);
    const [overtimeHourlyRate, setOvertimeHourlyRate] = useState(0);
    const [selectedRowIds, setSelectedRowIds] = useState<Record<string, boolean>>({});
    const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
    const [bulkDiscountOpen, setBulkDiscountOpen] = useState(false);
    const [bulkDiscountValue, setBulkDiscountValue] = useState<number>(0);
    // Stacked discounts: the product line whose editor is open (null = closed),
    // and the document-total pop-up behind "Apply discount".
    const [lineDiscountRowId, setLineDiscountRowId] = useState<string | null>(null);
    const [totalDiscountOpen, setTotalDiscountOpen] = useState(false);
    // Bulk delete/discount are now staged instantly (persisted on Save), so this
    // never toggles — kept only so the bulk modals keep their (never-busy) state.
    const [bulkActionLoading] = useState(false);
    const {
        chatterOpen,
        setChatterOpen,
        logsLoading,
        setLogsLoaded,
        setChatterSummary,
        tenderDocuments,
        setTenderDocuments,
        documentPreview,
        setDocumentPreview,
        documentsLoading,
        noteText,
        setNoteText,
        noteSaving,
        setNoteSaving,
        documentSaving,
        setDocumentSaving,
        documentInputRef,
        loadTenderChatter,
        handleOpenLogs,
        handleCloseLogs,
    } = useTenderChatter({ activeTenderId: detail?.tender.id || id, isCreatingTender });
    const handleOpenTenderLogs = () => {
        handleOpenLogs();
        if (id && id !== 'new') void fetchActivities(id);
    };
    const [localPositions, setLocalPositions] = useState<PositionDto[]>([]);
    const {
        pendingAddrId,
        setPendingAddrId,
        savingAll,
        isDirty,
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
    } = useTenderLineStaging({
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
    });
    // Every save funnels through this wrapper so the first successful one ends
    // the initial-entry auto-save mode (and records it for this session, so a
    // Back/Forward return to the flagged history entry can't resurrect it).
    const handleSaveAllTracked = async (): Promise<boolean> => {
        const ok = await handleSaveAll();
        if (ok && autoSaveOnExit) {
            setAutoSaveOnExit(false);
            window.sessionStorage.setItem(initialEntryDoneKey, '1');
        }
        return ok;
    };
    const {
        projectCreateLoading,
        setCreatedProjectId,
        projectId,
        orderDecisionOpen,
        setOrderDecisionOpen,
        orderDecisionLoading,
        orderMode,
        setOrderMode,
        attachExistingProject,
        setAttachExistingProject,
        orderProjectName,
        setOrderProjectName,
        projectSearch,
        setProjectSearch,
        projectSearchLoading,
        projectSearchResults,
        selectedExistingProject,
        setSelectedExistingProject,
        openOrderDecision,
        handleSubmitOrderDecision,
        handleApprove,
        handleCreateProject,
        projectCreatedModalId,
        goToCreatedProject,
        dismissProjectCreated,
    } = useTenderOrderDecision({
        tender: detail?.tender,
        isDirty,
        overtimeHourlyRate,
        fetchDetail,
        navigate,
        saveAll: handleSaveAllTracked,
    });
    // Customer-specific product discounts: auto-applied when one of the saved
    // articles is added to the quote.
    const { discountMap: customerDiscountMap } = useCustomerProductDiscounts({
        customerId: detail?.tender.status === 'Draft' && canManage
            ? detail.tender.customerId
            : null,
    });
    // Default the Projekt- and Lieferadresse to the customer's primary address
    // while they are empty (the user can still pick another one per row).
    useTenderAddressDefaults({
        tender: detail?.tender,
        canEdit: detail?.tender.status === 'Draft' && canManage,
        customerLocations,
        customerLocationsLoaded,
        onStageDefaults: (patch) => handleTenderMetaChange(patch),
    });
    // Derive the toggle position from which side holds the stored address when
    // (re)opening a tender; user toggles afterwards are not fought.
    useEffect(() => {
        const currentTender = detail?.tender;
        if (!currentTender) return;
        const hasInstallation = Boolean(String(currentTender.installationAddress ?? '').trim());
        const hasDelivery = Boolean(String(currentTender.deliveryAddress ?? '').trim());
        setTenderAddressType(hasDelivery && !hasInstallation ? 'DELIVERY' : 'INSTALLATION');
    }, [detail?.tender.id]);
    const [workspaceTab, setWorkspaceTab] = useState<TenderWorkspaceTabKey>('lines');
    const [settingsInitialTab, setSettingsInitialTab] = useState<TenderSettingsTabKey>('mail');

    useEffect(() => {
        if (
            workspaceTab === 'pdf'
            && detail?.tender.id
            && detail.tender.pdfContentDeferred
        ) {
            void ensurePdfContent(detail.tender.id).catch((error: any) => {
                toast.error(error?.response?.data?.error || t('common.error'));
            });
        }
    }, [workspaceTab, detail?.tender.id, detail?.tender.pdfContentDeferred, ensurePdfContent]);

    useEffect(() => {
        if (id) {
            resetStaging();
            setCreatedProjectId(null);
            setTenderDocuments([]);
            setChatterSummary(EMPTY_CHATTER_SUMMARY);
            setNoteText('');
            useTenderStore.setState({
                logs: [],
                activities: [],
                detail: isCreatingTender ? null : useTenderStore.getState().detail,
            });
        }
        if (!id || isCreatingTender) {
            setLogsLoaded(false);
            setChatterOpen(false);
            setLocalPositions([]);
            return;
        }
        if (id) {
            const store = useTenderStore.getState();
            if (store.detail?.tender.id !== id || store.loadingDetail) {
                void fetchDetail(id);
            } else {
                // The cached copy renders instantly; still re-sync silently in
                // the background so a stale cache can never hide lines that
                // were saved on a previous visit.
                void fetchDetail(id, true);
            }
            setLogsLoaded(false);
            setChatterOpen(false);
            useTenderStore.setState({ logs: [] });
        }
    }, [id, isCreatingTender, fetchDetail]);


    // Cost basis for the per-row profit/loss icon. This is the page's heaviest
    // request, so it is fetched only when a row can actually show a figure —
    // i.e. an article-linked product line exists. It used to fire for ANY draft,
    // including an empty one, putting a whole stock-article summary on the
    // critical path of a quote that had nothing to price. Scheduled on idle so
    // it never competes with the tender's own data for a connection.
    useEffect(() => {
        if (!detail?.tender.id || stockArticlesLoaded || stockArticlesLoading) return;
        if (detail.tender.status !== 'Draft' || !canManage) return;
        const hasProductRows = localPositions.some((position) => getLineKind(position) === 'PRODUCT' && !!position.sourceArticleId);
        if (!hasProductRows) return;
        return onIdle(() => { void fetchStockArticles(false, false); }, 3000);
    }, [detail?.tender.id, detail?.tender.status, canManage, fetchStockArticles, localPositions, stockArticlesLoaded, stockArticlesLoading]);

    // Read-only orders are the common PDF/export path. Warm their small PDF image
    // derivatives after the page is interactive, so export never waits for a
    // legacy multi-megabyte original. The helper de-duplicates an export click
    // against this in-flight request and keeps the result in the session cache.
    useEffect(() => {
        const currentTender = detail?.tender;
        if (!currentTender?.id) return;
        const isOrder = Boolean(currentTender.projectId)
            || isSourceSalesOrder(currentTender.sourceStatus);
        if (!isOrder || localPositions.length === 0) return;
        return onIdle(() => {
            void attachPdfPositionImages(currentTender.id, localPositions);
        }, 1200);
    }, [
        detail?.tender.id,
        detail?.tender.projectId,
        detail?.tender.sourceStatus,
        localPositions,
    ]);

    const tree = useMemo(() => buildTree(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const simpleRows = useMemo(() => buildSimpleTenderLines(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const displayRows = simpleRows;
    const grandTotal = useMemo(() => simpleRows.reduce((sum, row) => sum + row.total, 0), [simpleRows]);
    // Document-level discount stack. Offers saved before the stack existed are
    // seeded from the old directDiscount/extraDiscount pair, so nothing that was
    // already priced changes value just because the editor changed.
    const documentDiscounts = useMemo(
        () => (detail ? seedTotalDiscounts(detail.tender) : []),
        [detail?.tender.totalDiscounts, detail?.tender.directDiscount, detail?.tender.directDiscountLabel,
            detail?.tender.extraDiscount, detail?.tender.extraDiscountLabel],
    );
    // Offer footer figures: average line discount, document discounts, net/VAT/gross.
    const pricingSummary = useMemo(
        () => computeTenderPricingSummary(simpleRows, fallbackTaxRate, documentDiscounts),
        [simpleRows, fallbackTaxRate, documentDiscounts],
    );
    // PDF toplamları için indirim özeti: indirimler adlarıyla, uygulandıkları
    // sırayla listelenir; net/KDV/genel toplam ekrandaki özetle birebir olur.
    const pdfTotals = useMemo(
        () => ({
            subtotal: pricingSummary.netBeforeDiscounts,
            discounts: pricingSummary.discounts
                .filter((entry) => entry.amount > 0)
                .map((entry, index) => ({
                    name: discountDisplayName(entry, index),
                    percent: entry.percent,
                    amount: entry.amount,
                })),
            totalDiscountAmount: pricingSummary.totalDiscountAmount,
            combinedDiscountPercent: pricingSummary.combinedDiscountPercent,
            netTotal: pricingSummary.netTotal,
            vatTotal: pricingSummary.vatTotal,
            grossTotal: pricingSummary.grossTotal,
        }),
        [pricingSummary],
    );
    const selectedRows = useMemo(
        () => simpleRows.filter((row) => selectedRowIds[row.id]),
        [simpleRows, selectedRowIds],
    );
    // Per-row profit/loss for the icon in the amount column (cost from the
    // slim stock-article summary).
    const { profitabilityRows } = useTenderProfitability({ stockArticles, displayRows, selectedLine: null });
    const profitByRowId = useMemo(
        () => new Map(profitabilityRows.map((row) => [row.id, {
            revenue: row.revenue,
            cost: row.cost,
            result: row.result,
            resultRate: row.resultRate,
            unitCost: row.unitCost,
            costSource: row.costSource,
        }])),
        [profitabilityRows],
    );
    const lineDiscountRow = useMemo(
        () => (lineDiscountRowId ? localPositions.find((position) => position.id === lineDiscountRowId) ?? null : null),
        [lineDiscountRowId, localPositions],
    );
    const discountEligibleRows = selectedRows.filter((row) => row.kind === 'PRODUCT');
    const allRowsSelected = simpleRows.length > 0 && selectedRows.length === simpleRows.length;
    const someRowsSelected = selectedRows.length > 0;

    const { registerCellHandle, navigateCell } = useTenderLineKeyboardNavigation(displayRows);

    useEffect(() => {
        setSelectedRowIds((prev) => {
            const validIds = new Set(simpleRows.map((row) => row.id));
            const next = Object.fromEntries(Object.entries(prev).filter(([rowId, checked]) => checked && validIds.has(rowId)));
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [simpleRows]);
    // Guards against leaving with unsaved changes: shows our custom modal for
    // in-app navigation (menu switch / links / Back button) and falls back to the
    // browser's native prompt only for a hard refresh or tab close. During the
    // initial entry (fresh from TenderCreate) leaving auto-saves instead of asking.
    const navGuard = useUnsavedChangesGuard(isDirty, {
        autoSave: autoSaveOnExit ? handleSaveAllTracked : null,
    });
    const handleGuardSave = async () => {
        const ok = await handleSaveAllTracked();
        if (ok) navGuard.proceed();
    };

    // Every overlay on this page freezes the page behind it, so opening one — or
    // picking a product inside it — can never scroll the quote out from under the
    // pointer. Keep this list in step with the overlays rendered below.
    usePageScrollLock(Boolean(
        productDropdown
        || productPickerOpen
        || manualProductOpen
        || bulkDeleteOpen
        || bulkDiscountOpen
        || lineDiscountRowId
        || totalDiscountOpen
        || addrModalOpen
        || customerModalOpen
        || exportOpen
        || deleteOfferOpen
        || orderDecisionOpen
        || documentPreview
        || chatterOpen
        || navGuard.isOpen
        || projectCreatedModalId,
    ));


    if (isCreatingTender) {
        return <TenderCreate />;
    }


    if (loadingDetail || !detail) {
        return <TenderDetailLoadingSkeleton />;
    }

    const tender = detail.tender;
    const isDraft = tender.status === "Draft";
    const isSalesOrderStatus = Boolean(projectId) || isSourceSalesOrder(tender.sourceStatus);
    const tenderStatusLabel = isSalesOrderStatus ?t('crm.tenders.statusOrdered') : getStatusLabel()[tender.status];
    const tenderStatusVariant = isSalesOrderStatus ? 'order' : STATUS_VARIANT[tender.status];
    const currentUserName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
    // When the creator's display name isn't stored on the tender, fall back to the
    // current user's name if they are the creator (createdByEmployeeId matches), so
    // the quote bar shows e.g. "Admin User" instead of a raw email or "bilinmiyor".
    const creatorIsCurrentUser = !!user && tender.createdByEmployeeId === user.id;
    const creatorName = tender.createdByName
        || (creatorIsCurrentUser ? currentUserName : '')
        || tender.createdByEmail
        || tender.createdByEmployeeId
        ||t('tenders.bilinmiyor');
    const createdAtLabel = dayjs(tender.createdAt).format("DD.MM.YYYY HH:mm");
    // profitabilityRows / stockArticleById / profitability totals are memoized in
    // the hooks section above (they must run before the early-return guards).

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

    const handleCreateVersion = async () => {
        if (isDirty) { toast.error(t('tenders.once_kaydedin')); return; }
        try {
            const next = await createVersion(tender.id);
            toast.success(t('tenders.yeni_versiyon_olusturuldu', { version: next.version }));
            navigate(`/crm/tenders/${next.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.versiyon_olusturulamadi'));
        }
    };

    const handleDeleteOffer = async () => {
        setDeletingOffer(true);
        try {
            await deleteTender(tender.id);
            toast.success(t('tenders.tender_silindi'));
            setDeleteOfferOpen(false);
            navigate('/crm/tenders');
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('tenders.tender_silinemedi'));
        } finally {
            setDeletingOffer(false);
        }
    };

    // Open the "+ add address" popup, pre-targeted to installation, delivery, billing or the customer.
    const openAddrModal = (target: 'INSTALLATION' | 'DELIVERY' | 'BILLING' | 'CUSTOMER') => {
        setAddrTarget(target);
        setAddrForm(EMPTY_TENDER_ADDRESS_FORM);
        setAddrModalOpen(true);
    };

    // Persist the new address, then select it on the tender (or set it as the
    // customer's address). Installation + same-as also updates billing.
    const submitAddrModal = async () => {
        const customerId = detail?.tender.customerId;
        if (!customerId) { toast.error(t('tenders.address_info_not_found')); return; }
        const formatted = formatLocationAddress({
            id: '', name: addrForm.name, isPrimary: false, ...toAddressPayload(addrForm),
        } as CustomerLocationDto);
        try {
            setAddrSaving(true);
            if (addrTarget === 'CUSTOMER') {
                // Store the customer's primary address as separate fields so it
                // re-formats consistently wherever the main address is used.
                await apiClient.patch(`/customers/${customerId}`, {
                    addressName: addrForm.name || null,
                    ...toAddressPayload(addrForm),
                });
            } else {
                await customerApi.addLocation(customerId, {
                    name: addrForm.name || formatted, kind: addrTarget, ...toAddressPayload(addrForm),
                });
                const rows = await customerApi.listLocations(customerId);
                setCustomerLocations(rows);
                const sameAs = !!(detail?.tender as any)?.billingSameAsInstallation;
                if (addrTarget === 'INSTALLATION' || addrTarget === 'DELIVERY') {
                    // The new address takes over the single project/delivery slot:
                    // its type becomes active and the other side is cleared.
                    setTenderAddressType(addrTarget);
                    const fieldPatch = addrTarget === 'INSTALLATION'
                        ? { installationAddress: formatted, deliveryAddress: null }
                        : { deliveryAddress: formatted, installationAddress: null };
                    handleTenderMetaChange(sameAs ? { ...fieldPatch, billingAddress: formatted } : fieldPatch);
                } else {
                    handleTenderMetaChange({ billingAddress: formatted });
                }
            }
            toast.success(t('crm.addressSaved'));
            setAddrModalOpen(false);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('common.error'));
        } finally {
            setAddrSaving(false);
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

    const openManualProduct = () => {
        setManualProduct(emptyManualProduct(productSearch.trim(), fallbackTaxRate));
        setManualProductOpen(true);
    };

    // "Add product" no longer opens a pop-up. It appends a BLANK product row and
    // hands focus to that row's name cell; the article search then happens in the
    // row itself, filtering as the user types and offering the create-actions
    // when nothing matches. `autoFocusProductRowId` is the one-shot signal the
    // table uses to focus that cell and open its combobox.
    const addBlankProductRow = (afterRowId?: string) => {
        const newRowId = handleAddRow('PRODUCT', undefined, undefined, afterRowId);
        if (newRowId) setAutoFocusProductRowId(newRowId);
    };
    const closeProductDropdown = () => {
        setProductDropdown(null);
        setProductPickerAfterRowId(undefined);
    };
    // The product-name cell is a plain text field with a combobox readout:
    // focusing a BLANK cell lists the first products straight away, and typing
    // narrows that list. A product nobody stocks is simply a name that matched
    // nothing — the list vanishes on its own (the dropdown renders nothing for
    // an empty result set).
    const handleRowProductComboInput = (rowId: string, text: string, anchorEl: HTMLInputElement) => {
        setComboSearch(text);
        setAutoFocusProductRowId(null);
        setProductDropdown((current) => (current?.rowId === rowId ? current : { anchorEl, rowId }));
    };
    // Writes a product INTO an existing row: name, unit, price, tax, description
    // and the article link are staged as one inline patch (persisted with Save,
    // like any other cell edit). Used by the row combobox, by the full picker
    // when it was opened from a row, and by a manually created product.
    const fillRowFromProduct = (
        rowId: string,
        article: ProductSource,
        options?: Partial<ManualProductForm>,
    ) => {
        const defaults = buildProductDefaults(article, options, fallbackTaxRate);
        handleInlinePositionChange(rowId, {
            sourceArticleId: defaults.sourceArticleId ?? null,
            shortDescription: defaults.shortDescription,
            longDescription: defaults.longDescription ?? null,
            unit: defaults.unit,
            unitPrice: defaults.unitPrice,
            discount: defaults.discount,
            taxRate: defaults.taxRate,
            // Only a manually entered product states its own quantity. Swapping
            // the article on an existing row must leave the quantity alone.
            ...(options?.quantity != null ? { quantity: Number(options.quantity) } : {}),
        });
    };
    // Selecting an article from a row's combobox swaps the product in place,
    // carrying over any customer-specific discount for that article.
    const swapRowProduct = (rowId: string, article: ArticleQuickPick) => {
        const customerDiscount = customerDiscountMap[article.id];
        fillRowFromProduct(
            rowId,
            article,
            customerDiscount !== undefined ? { discount: customerDiscount } : undefined,
        );
    };

    // "Add new product" opens the full product creation page in a new window,
    // carrying the searched text as ?name= so the name field is pre-filled and
    // the user completes the rest of the card there.
    const openStockArticleCreateFor = (name: string) => {
        const query = name ? `?name=${encodeURIComponent(name)}` : '';
        window.open(`/inventory/articles/new${query}`, '_blank', 'noopener');
        setProductPickerOpen(false);
        setProductPickerAfterRowId(undefined);
    };
    const openStockArticleCreate = () => openStockArticleCreateFor(productSearch.trim());

    const handleCreateManualProduct = async () => {
        const name = manualProduct.name.trim();
        if (!name) {
            toast.error(t('tenders.product_adi_zorunludur'));
            return;
        }
        setManualProductOpen(false);
        setProductPickerOpen(false);
        const afterRowId = productPickerAfterRowId;
        const targetRowId = comboTargetRowId;
        setComboTargetRowId(null);
        const article = {
            name,
            description: manualProduct.description,
            unit: manualProduct.unit,
            baseCost: 0,
            salePrice: manualProduct.unitPrice,
            imageUrl: manualProduct.imageUrl,
        };
        if (targetRowId) {
            // Created from a row's combobox — write it into that row.
            fillRowFromProduct(targetRowId, article, manualProduct);
        } else {
            void handleAddRow('PRODUCT', article, manualProduct, afterRowId);
        }
        setProductPickerAfterRowId(undefined);
    };

    const openSettingsTab = (tab: TenderSettingsTabKey) => {
        setSettingsInitialTab(tab);
        setWorkspaceTab(tab);
    };

    const canEditTenderMeta = isDraft && canManage;

    const customerLoadingFlashLabel = t('common.loading').replace(/[.…\s]+$/, '');
    const tenderCustomerDropdownVisible = newTenderCustomerOpen && filteredNewTenderCustomers.length > 0;
    const handleSelectTenderCustomer = (customer: CustomerOption) => {
        if (!customer.id) return;
        // Default the tender's address slot from the customer's structured primary
        // address (street / postal + city / country), formatted like a saved
        // location. Falls back to the legacy single-line address for older records.
        const customerAddress = formatLocationAddress({
            id: '', name: '', isPrimary: true, ...toAddressForm(customer),
        } as CustomerLocationDto) || (customer.address ?? null);

        setNewTenderCustomerQuery(customer.companyName);
        setNewTenderCustomerOpen(false);
        setPendingAddrId({ INSTALLATION: null, DELIVERY: null, BILLING: null });
        setTenderAddressType('INSTALLATION');

        handleTenderMetaChange(
            {
                customerId: customer.id,
                installationAddress: null,
                deliveryAddress: null,
                billingAddress: null,
                billingSameAsInstallation: false,
            },
            {
                customerName: customer.companyName,
                customerAddress,
                customerEmail: customer.mainEmail ?? null,
                customerPhone: customer.mainPhone ?? null,
                customerTaxNumber: customer.taxNumber ?? null,
            },
        );
    };

    // Clear the selected customer from the tender: drops the customer link and all
    // the customer-derived fields (name/address/contact) plus the staged addresses,
    // so the row returns to its empty "pick a customer" state.
    const handleClearTenderCustomer = () => {
        setNewTenderCustomerQuery('');
        setNewTenderCustomerOpen(false);
        setPendingAddrId({ INSTALLATION: null, DELIVERY: null, BILLING: null });
        setTenderAddressType('INSTALLATION');
        handleTenderMetaChange(
            {
                customerId: null,
                installationAddress: null,
                deliveryAddress: null,
                billingAddress: null,
                billingSameAsInstallation: false,
            },
            {
                customerName: null,
                customerAddress: null,
                customerEmail: null,
                customerPhone: null,
                customerTaxNumber: null,
            },
        );
    };

    const openCustomerModal = () => {
        setCustomerForm(EMPTY_TENDER_CUSTOMER_FORM);
        setCustomerModalOpen(true);
    };
   
    const submitCustomerModal = async () => {
        if (!customerForm.companyName.trim()) { toast.error(t('crm.customers.companyNameRequired')); return; }
        try {
            setCustomerSaving(true);
            const created = await apiClient.post('/customers', {
                companyName: customerForm.companyName.trim(),
                mainEmail: customerForm.mainEmail.trim() || undefined,
                mainPhone: customerForm.mainPhone.trim() || undefined,
                // Adres bilesenleri tek tek gonderilir (birlesik alan yok).
                ...toAddressPayload(customerForm),
            }).then((res) => res.data);
            const option: CustomerOption = {
                id: created.id,
                companyName: created.companyName ?? customerForm.companyName.trim(),
                segment: created.segment ?? null,
                mainEmail: created.mainEmail ?? null,
                mainPhone: created.mainPhone ?? null,
                addressName: created.addressName ?? null,
                ...toAddressForm(created),
                taxNumber: created.taxNumber ?? null,
            };
            setNewTenderCustomers((prev) => [option, ...prev.filter((item) => item.id !== option.id)]);
            setCustomerModalOpen(false);
            toast.success(t('crm.customers.successAdd'));
            handleSelectTenderCustomer(option);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('crm.customers.errorAdd'));
        } finally {
            setCustomerSaving(false);
        }
    };
    const tenderCustomerPicker = canEditTenderMeta ? (
        <TenderCustomerSection
            query={newTenderCustomerQuery}
            onQueryChange={setNewTenderCustomerQuery}
            onOpenChange={setNewTenderCustomerOpen}
            loading={newTenderCustomersLoading}
            loadingFlashLabel={customerLoadingFlashLabel}
            dropdownVisible={tenderCustomerDropdownVisible}
            customers={filteredNewTenderCustomers}
            onSelectCustomer={handleSelectTenderCustomer}
            onClearCustomer={handleClearTenderCustomer}
            onAddCustomer={openCustomerModal}
        />
    ) : null;

    const customerLines = [
        valueOrBlank(tender.customerName || tender.customerId),
        ...splitAddress(tender.customerAddress),
    ];
    const commissionNumber = valueOrBlank((tender as any).commissionNumber || (tender as any).commissionNo || (tender as any).referenceNumber);
    const customerReference = valueOrBlank((tender as any).customerReference);
    const currencyCode = toCurrencyCode((tender as any).currency);
    const tenderValidityValue = tender.validUntil ? dayjs(tender.validUntil).format('YYYY-MM-DD') : minimumTenderValidUntil;
    const tenderValidityLabel = dayjs(tenderValidityValue).format('DD.MM.YYYY');
    const billingAddressValue = valueOrBlank((tender as any).billingAddress);
    // Projektadresse (installation); legacy tenders stored it in deliveryAddress.
    const installationAddressValue = valueOrBlank((tender as any).installationAddress);
    const deliveryAddressValue = valueOrBlank((tender as any).deliveryAddress);
    const internalDeliveryDateValue = tender.internalDeliveryDate
        ? dayjs(tender.internalDeliveryDate).format('YYYY-MM-DD')
        : '';
    // The customer's MAIN address (entered on the customer create/edit form) is
    // the base entry of both pickers and the default for both rows.
    const customerMainAddress = String(tender.customerAddress ?? '').trim();
    const mainAddressOption: CustomerLocationDto | null = customerMainAddress
        ? {
            id: '__customer-main-address__',
            customerId: tender.customerId ?? undefined,
            // No explicit "Hauptadresse" label — the picker just lists the address
            // itself, so an empty name makes locationOptionLabel fall back to it.
            name: '',
            address: customerMainAddress,
            isPrimary: true,
        }
        : null;
    // Both the Projekt- and Lieferadresse rows may pick the main address or any
    // of the customer's two non-billing address lists (installation or delivery).
    const selectableAddressLocations = [
        ...(mainAddressOption ? [mainAddressOption] : []),
        ...customerLocations.filter((loc) => locationKindOf(loc) !== 'BILLING'),
    ];
    // Billing may pick the customer's main address (listed first, the default) or
    // any of their dedicated billing locations.
    const billingLocations = [
        ...(mainAddressOption ? [mainAddressOption] : []),
        ...customerLocations.filter((loc) => locationKindOf(loc) === 'BILLING'),
    ];
    const sameAsInstallation = !!(tender as any).billingSameAsInstallation;
    // An address is one line — "Hofackerstrasse 75, 4132 Muttenz" reads as a
    // single postal line, not as a stack of fragments split on its commas.
    const renderAddressLines = (value: string) => renderDetailLines([joinAddress(value)]);

    // The single project/delivery address slot: exactly one of the two fields
    // holds the value — picking or toggling always nulls the other side.
    const activeAddressValue = installationAddressValue || deliveryAddressValue;
    const stageActiveAddress = (type: TenderAddressType, value: string | null) => {
        const fieldPatch = type === 'INSTALLATION'
            ? { installationAddress: value, deliveryAddress: null }
            : { deliveryAddress: value, installationAddress: null };
        handleAddressPick(sameAsInstallation ? { ...fieldPatch, billingAddress: value } : fieldPatch);
    };
    const handleAddressTypeChange = (type: TenderAddressType) => {
        if (type === tenderAddressType) return;
        setTenderAddressType(type);
        setPendingAddrId((prev) => ({ ...prev, INSTALLATION: null, DELIVERY: null }));
        // Carry the chosen address over to the other side so switching the type
        // never silently drops the selection; with no address picked yet there
        // is nothing to stage.
        if (activeAddressValue) stageActiveAddress(type, activeAddressValue);
    };
    const tenderAddressPicker = canEditTenderMeta ? (
        <TenderAddressPicker
            storedValue={activeAddressValue}
            locations={selectableAddressLocations}
            onPick={(value) => stageActiveAddress(tenderAddressType, value)}
            onAdd={() => openAddrModal(tenderAddressType)}
            hasCustomer={Boolean(tender.customerId)}
            locationsLoaded={customerLocationsLoaded}
            pendingId={pendingAddrId[tenderAddressType]}
            onSelectPending={(id) => setPendingAddrId((prev) => ({ ...prev, [tenderAddressType]: id }))}
            renderLines={renderAddressLines}
        />
    ) : null;
    const tenderAddressRowContent = canEditTenderMeta ? (
        <TenderAddressTypeRow
            addressType={tenderAddressType}
            onTypeChange={handleAddressTypeChange}
            picker={tenderAddressPicker}
        />
    ) : null;
    const billingAddressPicker = canEditTenderMeta ? (
        <TenderAddressPicker
            storedValue={billingAddressValue}
            locations={billingLocations}
            onPick={(value) => handleAddressPick({ billingAddress: value })}
            onAdd={() => openAddrModal('BILLING')}
            hasCustomer={Boolean(tender.customerId)}
            locationsLoaded={customerLocationsLoaded}
            pendingId={pendingAddrId.BILLING}
            onSelectPending={(id) => setPendingAddrId((prev) => ({ ...prev, BILLING: id }))}
            renderLines={renderAddressLines}
        />
    ) : null;
    const billingRowContent = canEditTenderMeta ? (
        <TenderBillingAddressRow
            label={t(tenderAddressType === 'INSTALLATION' ? 'crm.sameAsProject' : 'crm.sameAsDelivery')}
            sameAsInstallation={sameAsInstallation}
            onSameAsInstallationChange={(checked) => {
                // Unchecking must also drop the copied-over value: it was mirrored
                // from the installation/delivery address (line below), which isn't a
                // billing location, so it would otherwise linger in the preview while
                // the picker shows an empty "Select" — the input/preview mismatch.
                if (!checked) { void handleMetaFieldChange('billing', { billingSameAsInstallation: false, billingAddress: null }); return; }
                // Bidirectional mirror: copy whichever side is filled onto the other
                // so ticking "same as installation" always ends with both set,
                // regardless of which address the user entered first. The shared
                // value lands on the ACTIVE address type only.
                const shared = activeAddressValue || billingAddressValue || null;
                void handleMetaFieldChange('billing', {
                    billingSameAsInstallation: true,
                    ...(tenderAddressType === 'INSTALLATION'
                        ? { installationAddress: shared, deliveryAddress: null }
                        : { deliveryAddress: shared, installationAddress: null }),
                    billingAddress: shared,
                });
            }}
            billingPicker={billingAddressPicker}
        />
    ) : null;
    const internalDeliveryDatePicker = canEditTenderMeta ? (
        <QuoteDatePicker
            ariaLabel={t('tenders.lieferdatum_intern')}
            value={internalDeliveryDateValue}
            onChange={(value) => void handleMetaFieldChange('internalDate', { internalDeliveryDate: value || null })}
        />
    ) : null;
    const tenderValidityPicker = canEditTenderMeta ? (
        <QuoteDatePicker
            ariaLabel={t('tenders.gecerlilik_tarihi')}
            value={tenderValidityValue}
            min={minimumTenderValidUntil}
            onChange={(value) => void handleMetaFieldChange('validity', { validUntil: value || null })}
        />
    ) : null;
    // Quote-level fields grouped by the question they answer: who the quote is
    // for, on what terms, and where the work / invoice goes.
    const tenderDetailGroups: TenderCardGroup[] = [
        {
            key: 'customer',
            title:t('tenders.kunde'),
            fields: [
                { key: 'customer', label:t('crm.customers.companyName'), control: tenderCustomerPicker, lines: customerLines },
                {
                    key: 'commission',
                    label:t('tenders.kommission_nr'),
                    control: canEditTenderMeta
                        ? <TenderCommissionInput value={commissionNumber} onCommit={(value) => handleMetaFieldChange('commission', { commissionNumber: value })} />
                        : undefined,
                    lines: [commissionNumber],
                },
                {
                    key: 'customerReference',
                    label:t('tenders.referenz'),
                    control: canEditTenderMeta
                        ? <TenderCommissionInput value={customerReference} ariaLabel={t('tenders.referenz')} onCommit={(value) => handleMetaFieldChange('customerReference', { customerReference: value })} />
                        : undefined,
                    lines: [customerReference],
                },
            ],
        },
        {
            key: 'addresses',
            title:t('tenders.addresses'),
            fields: [
                {
                    key: 'address',
                    label: tenderAddressType === 'DELIVERY' ?t('tenders.lieferadresse') :t('tenders.projektadresse'),
                    control: tenderAddressRowContent,
                    lines: [joinAddress(activeAddressValue)],
                },
                {
                    key: 'billing',
                    label:t('tenders.rechnungsadresse'),
                    control: billingRowContent,
                    lines: [joinAddress((sameAsInstallation ? activeAddressValue : billingAddressValue) || tender.customerName || '')],
                },
            ],
        },
        {
            key: 'terms',
            title:t('tenders.terms'),
            fields: [
                { key: 'orderDate', label:t('tenders.auftragsdatum'), lines: [createdAtLabel] },
                { key: 'validity', label:t('tenders.gecerlilik'), control: tenderValidityPicker, lines: [tenderValidityLabel] },
                {
                    key: 'internalDate',
                    label:t('tenders.lieferdatum_intern'),
                    control: internalDeliveryDatePicker,
                    lines: [internalDeliveryDateValue ? dayjs(internalDeliveryDateValue).format('DD.MM.YYYY') : ''],
                },
                {
                    key: 'currency',
                    label:t('tenders.waehrung'),
                    control: canEditTenderMeta
                        ? <TenderCurrencySelect value={currencyCode} onChange={(value) => handleMetaFieldChange('currency', { currency: value })} />
                        : undefined,
                    lines: [currencyCode],
                },
            ],
        },
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
            return { id: log.id, date: log.createdAt, actor, tone: 'emerald', title:t('tenders.tender_created'), body: log.description || localizeTenderNumber(tender.tenderNumber) };
        }
        if (log.actionType === 'TENDER_APPROVED') {
            return { id: log.id, date: log.createdAt, actor, tone: 'blue', title:t('tenders.tender_onaylandi'), body: log.description || localizeTenderNumber(tender.tenderNumber) };
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
            body: activity.description || localizeTenderNumber(tender.tenderNumber),
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
            body: localizeTenderNumber(tender.tenderNumber),
        }];
    const timelineItems = [...logTimelineItems, ...activityTimelineItems, ...documentTimelineItems, ...syntheticCreatedItem]
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
    const renderDocumentTile = (document: TenderDocumentDto, compact = false) => {
        const image = isPreviewableDocument(document);
        const pdf = isPdfDocument(document);
        const mediaClass = compact ?"h-9 w-9" :"h-16 w-24";

        return (
            <div className={`mt-2 flex min-w-0 items-center gap-2 ${compact ? '' : 'max-w-[420px]'}`}>
                <button
                    type="button"
                    onClick={() => setDocumentPreview(document)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-[2px] border border-slate-200 bg-white px-2 py-1.5 text-left text-[12px] font-medium text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10"
                    title={document.fileName}
                >
                    {image ? (
                        <img src={document.fileUrl} alt="" loading="lazy" decoding="async" className={`${mediaClass} shrink-0 rounded border border-slate-200 object-cover`} />
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
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#1f2654] hover:bg-[#1f2654] hover:text-white"
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
            <TenderDetailHeader
                tender={tender}
                tenderStatusVariant={tenderStatusVariant}
                tenderStatusLabel={tenderStatusLabel}
                onOpenLogs={handleOpenTenderLogs}
                onDeleteOffer={() => setDeleteOfferOpen(true)}
                canSave={canEditTenderMeta}
                saving={savingAll}
                isDirty={isDirty}
                onSave={() => void handleSaveAllTracked()}
                creatorName={creatorName}
                isDraft={isDraft}
                canManage={canManage}
                canExport={canExport}
                canApprove={canApprove}
                isSalesOrderStatus={isSalesOrderStatus}
                projectId={projectId}
                projectCreateLoading={projectCreateLoading}
                onBack={() => navGuard.attempt(() => navigate('/crm/tenders'))}
                onCreateVersion={handleCreateVersion}
                onExport={() => setExportOpen(true)}
                onCreateProject={handleCreateProject}
                onOpenOrderDecision={openOrderDecision}
                onApprove={handleApprove}
            />

            <TenderCustomerCard
                groups={tenderDetailGroups}
                summary={[tender.customerName, tenderValidityLabel].filter(Boolean).join(' · ')}
            />

            {chatterOpen && (
                <Suspense fallback={null}>
                    <LazyTenderLogsPanel
                        open
                        onClose={handleCloseLogs}
                        timelineItems={timelineItems}
                        logsLoading={logsLoading}
                        canManage={canManage}
                        noteText={noteText}
                        onNoteTextChange={setNoteText}
                        noteSaving={noteSaving}
                        onSubmitNote={handleSubmitNote}
                        documentInputRef={documentInputRef}
                        documentSaving={documentSaving}
                        onSubmitDocument={handleSubmitDocument}
                        documentsLoading={documentsLoading}
                        tenderDocuments={tenderDocuments}
                        renderDocumentTile={renderDocumentTile}
                    />
                </Suspense>
            )}

            <TenderWorkspaceTabs
                workspaceTab={workspaceTab}
                onSelectTab={setWorkspaceTab}
                onOpenSettingsTab={openSettingsTab}
                lineCount={simpleRows.length}
            />

            {workspaceTab === 'lines' ? (
                <div className="grid grid-cols-1 gap-3">
                    <div className="min-w-0">
                        <Card
                            title={t('tenders.tender_satirlari')}
                            icon={<MdTableChart size={14} />}
                            noPadding
                            actions={
                                // Add-row actions live at the bottom of the table itself;
                                // the header only carries the bulk-selection actions.
                                isDraft && canManage && someRowsSelected ? (
                                    <div className="flex flex-wrap items-center justify-end gap-2">
                                        <span className="text-[11px] font-medium text-slate-500">{selectedRows.length}{t('tenders.selected')}</span>
                                        <Button size="sm" variant="secondary" onClick={() => setBulkDiscountOpen(true)}>{t('tenders.bulk_discount')}</Button>
                                        <Button size="sm" variant="danger" onClick={() => setBulkDeleteOpen(true)}>{t('common.delete')}</Button>
                                    </div>
                                ) : null
                            }
            >
                {/* Horizontal scrolling only, and only when the columns genuinely
                    do not fit; the slim bar keeps it from stealing row height. */}
                <div className="overflow-x-auto [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-slate-300 [&::-webkit-scrollbar-track]:bg-transparent">
                    <TenderLineTable
                        rows={displayRows}
                        isEmpty={simpleRows.length === 0}
                        isDraft={isDraft}
                        canManage={canManage}
                        fallbackTaxRate={fallbackTaxRate}
                        selectedId={selectedId}
                        selectedRowIds={selectedRowIds}
                        allRowsSelected={allRowsSelected}
                        someRowsSelected={someRowsSelected}
                        stableRowKeys={stableRowKeys.current}
                        lastRowId={lastRowId}
                        onSelectRow={setSelectedId}
                        onToggleAllRows={toggleAllRows}
                        onToggleRow={toggleRowSelection}
                        commitTextField={commitTextField}
                        commitNumberField={commitNumberField}
                        commitLongDescription={commitLongDescription}
                        registerCell={registerCellHandle}
                        onArrowNav={navigateCell}
                        onAddRow={handleAddRow}
                        onMoveRow={handleMoveRow}
                        onDeleteRow={handleDeleteRow}
                        onAddProductRow={addBlankProductRow}
                        autoFocusRowId={autoFocusProductRowId}
                        onProductComboInput={handleRowProductComboInput}
                        profitByRowId={profitByRowId}
                        onOpenLineDiscounts={setLineDiscountRowId}
                    />
                </div>
                {/* Bottom of the quote: discount on the price, amount excl. VAT,
                    VAT amount and the final total — inside the same card. */}
                <TenderPriceSummary
                    summary={pricingSummary}
                    canEdit={canEditTenderMeta}
                    onOpenDiscounts={() => setTotalDiscountOpen(true)}
                />
                        </Card>
                    </div>
                </div>
            ) : workspaceTab === 'pdf' ? (
                /* PDF version tab — the optional text/image blocks appended to the
                   offer's PDF. Their printed position is fixed regardless of where
                   they are edited: intro text after the cover page, final text and
                   images after the totals. */
                <Card title={t('tenders.pdf_content')} icon={<FileText size={14} />}>
                    <Suspense fallback={<LazyPanelFallback />}>
                        <LazyTenderPdfContentPanel
                            canEdit={canEditTenderMeta}
                            onError={(message) => toast.error(message)}
                            value={{
                                coverLetter: tender.coverLetter ?? null,
                                closingNote: tender.closingNote ?? null,
                                closingImages: parseClosingImages(tender.closingImages),
                            }}
                            // Staged like every other quote field: nothing is sent
                            // until the user hits Save. The images travel as an
                            // array and are stored as JSON, so the optimistic copy
                            // held in the store must be the serialised form too.
                            onChange={({ closingImages, ...rest }) => handleTenderMetaChange({
                                ...rest,
                                // The column stores JSON; the panel works with an
                                // array. Serialising at this boundary keeps one
                                // shape on the wire and in the optimistic copy.
                                ...(closingImages !== undefined
                                    ? { closingImages: closingImages.length ? JSON.stringify(closingImages) : null }
                                    : {}),
                            })}
                        />
                    </Suspense>
                </Card>
            ) : workspaceTab === 'payment' ? (
                /* Ödeme planı tab — percentage stages (30/20/10/40) the customer
                   pays in. Staged like every other quote field: nothing is sent
                   until the user hits Save; the schedule is copied to the order
                   at conversion and drives stage-by-stage invoicing there. */
                <Card title={t('tenders.payment_schedule_tab')} icon={<CoinsIcon size={14} />}>
                    <TenderPaymentTab
                        tender={tender}
                        canEdit={canEditTenderMeta}
                        grossTotal={pricingSummary.grossTotal}
                        onMetaChange={(patch) => handleTenderMetaChange(patch)}
                    />
                </Card>
            ) : (
                <Suspense fallback={<LazyPanelFallback />}>
                    <LazyTenderSettingsModal
                        open
                        inline
                        hideTabs
                        onClose={() => setWorkspaceTab('lines')}
                        tenderId={tender.id}
                        tree={tree}
                        grandTotal={grandTotal}
                        pdfTotals={pdfTotals}
                        initialTab={settingsInitialTab}
                        overtimeHourlyRate={overtimeHourlyRate}
                        onOvertimeHourlyRateChange={setOvertimeHourlyRate}
                        onChanged={() => fetchDetail(tender.id, true)}
                    />
                </Suspense>
            )}

            {orderDecisionOpen && (
            <Suspense fallback={null}>
            <LazyTenderOrderDecisionModal
                open={orderDecisionOpen}
                onClose={() => setOrderDecisionOpen(false)}
                loading={orderDecisionLoading}
                onSubmit={handleSubmitOrderDecision}
                mode={orderMode}
                onModeChange={setOrderMode}
                attachExisting={attachExistingProject}
                onAttachExistingChange={setAttachExistingProject}
                projectName={orderProjectName}
                onProjectNameChange={setOrderProjectName}
                projectSearch={projectSearch}
                onProjectSearchChange={setProjectSearch}
                projectSearchLoading={projectSearchLoading}
                projectSearchResults={projectSearchResults}
                selectedProject={selectedExistingProject}
                onSelectProject={setSelectedExistingProject}
            />
            </Suspense>
            )}

            {/* Article search, anchored to the row's own name cell. */}
            {productDropdown && (
                <TenderProductSearchDropdown
                    anchorEl={productDropdown.anchorEl}
                    search={comboSearch}
                    onClose={closeProductDropdown}
                    onSelectArticle={(article) => {
                        // Drop the search text the user typed into the cell before
                        // staging the swap — otherwise it is still the input's
                        // draft and gets committed over the article name on blur.
                        productDropdown.anchorEl.dispatchEvent(new CustomEvent(RESET_DRAFT_EVENT));
                        swapRowProduct(productDropdown.rowId, article);
                        setProductDropdown(null);
                    }}
                    onOpenAllProducts={(search) => {
                        // Remember the row so the big picker fills THIS row rather
                        // than appending a second one next to the blank one.
                        setComboTargetRowId(productDropdown.rowId);
                        setProductDropdown(null);
                        setProductSearch(search);
                        setProductPickerOpen(true);
                    }}
                    onClearSearch={() => setComboSearch('')}
                />
            )}

            {productPickerOpen && (
            <Suspense fallback={null}>
            <LazyTenderProductPickerModal
                open={productPickerOpen}
                onClose={() => {
                    setProductPickerOpen(false);
                    setProductPickerAfterRowId(undefined);
                }}
                productSearch={productSearch}
                onSearchChange={setProductSearch}
                loading={pickerLoading}
                items={pickerItems}
                total={pickerTotal}
                currentPage={productPickerPage}
                onPageChange={setProductPickerPage}
                onCreateManualProduct={openManualProduct}
                onCreateStockArticle={openStockArticleCreate}
                onSelectArticle={(article) => {
                    const afterRowId = productPickerAfterRowId;
                    const targetRowId = comboTargetRowId;
                    setProductPickerOpen(false);
                    setProductPickerAfterRowId(undefined);
                    setComboTargetRowId(null);
                    // The picker page already includes every field needed to stage
                    // the row, so selecting a product performs no second request.
                    if (targetRowId) {
                        swapRowProduct(targetRowId, article);
                        return;
                    }
                    const customerDiscount = customerDiscountMap[article.id];
                    handleAddRow(
                        'PRODUCT',
                        article,
                        customerDiscount !== undefined ? { discount: customerDiscount } : undefined,
                        afterRowId,
                    );
                }}
            />
            </Suspense>
            )}

            {manualProductOpen && (
            <Suspense fallback={null}>
            <LazyTenderManualProductModal
                open={manualProductOpen}
                onClose={() => setManualProductOpen(false)}
                manualProduct={manualProduct}
                onChange={setManualProduct}
                onSubmit={handleCreateManualProduct}
            />
            </Suspense>
            )}

            {bulkDeleteOpen && (
            <Suspense fallback={null}>
            <LazyTenderBulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                loading={bulkActionLoading}
                selectedRows={selectedRows}
                onConfirm={handleBulkDelete}
            />
            </Suspense>
            )}

            {bulkDiscountOpen && (
            <Suspense fallback={null}>
            <LazyTenderBulkDiscountModal
                open={bulkDiscountOpen}
                onClose={() => setBulkDiscountOpen(false)}
                loading={bulkActionLoading}
                eligibleCount={discountEligibleRows.length}
                value={bulkDiscountValue}
                onValueChange={setBulkDiscountValue}
                onConfirm={handleBulkDiscount}
            />
            </Suspense>
            )}

            {/* Per-product discounts. Mounted only while open so each opening
                seeds a fresh draft from the line's stored list. */}
            {lineDiscountRow && (
            <Suspense fallback={null}>
            <LazyTenderLineDiscountModal
                open
                onClose={() => setLineDiscountRowId(null)}
                position={lineDiscountRow}
                fallbackTaxRate={fallbackTaxRate}
                canEdit={isDraft && canManage}
                onSave={(patch) => handleInlinePositionChange(lineDiscountRow.id, patch)}
            />
            </Suspense>
            )}

            {totalDiscountOpen && detail && (
            <Suspense fallback={null}>
            <LazyTenderTotalDiscountModal
                open
                onClose={() => setTotalDiscountOpen(false)}
                tender={detail.tender}
                summary={pricingSummary}
                canEdit={canEditTenderMeta}
                onSave={(patch) => handleTenderMetaChange(patch)}
            />
            </Suspense>
            )}

            {documentPreview && (
            <Suspense fallback={null}>
            <LazyTenderDocumentPreviewModal
                document={documentPreview}
                onClose={() => setDocumentPreview(null)}
            />
            </Suspense>
            )}

            {exportOpen && (
                <Suspense fallback={null}>
                    <LazyExportModal
                        open={exportOpen}
                        onClose={() => setExportOpen(false)}
                        tenderId={tender.id}
                        tenderNumber={tender.tenderNumber}
                        tree={tree}
                        grandTotal={grandTotal}
                        pdfTotals={pdfTotals}
                    />
                </Suspense>
            )}

            {/* Inline "+ add address" popup (installation / billing / customer) */}
            {addrModalOpen && (
                <Suspense fallback={null}>
                    <LazyTenderAddressCreateModal
                        open
                        onClose={() => setAddrModalOpen(false)}
                        saving={addrSaving}
                        target={addrTarget}
                        onTargetChange={setAddrTarget}
                        form={addrForm}
                        onFormChange={setAddrForm}
                        onSubmit={submitAddrModal}
                    />
                </Suspense>
            )}

            {customerModalOpen && (
                <Suspense fallback={null}>
                    <LazyTenderCustomerCreateModal
                        open
                        onClose={() => setCustomerModalOpen(false)}
                        saving={customerSaving}
                        form={customerForm}
                        onChange={setCustomerForm}
                        onSubmit={submitCustomerModal}
                    />
                </Suspense>
            )}

            {/* Custom "unsaved changes" prompt shown when leaving via menu / links / Back. */}
            {navGuard.isOpen && (
                <Suspense fallback={null}>
                    <LazyUnsavedChangesModal
                        open
                        saving={savingAll}
                        autoSaving={navGuard.autoSaving}
                        onSave={handleGuardSave}
                        onDiscard={navGuard.proceed}
                        onCancel={navGuard.cancel}
                    />
                </Suspense>
            )}

            {/* "Project created successfully" popup with go-to / stay choices. */}
            {projectCreatedModalId && (
                <Suspense fallback={null}>
                    <LazyProjectCreatedModal
                        open
                        onGoToProject={goToCreatedProject}
                        onStay={dismissProjectCreated}
                    />
                </Suspense>
            )}

            {/* Destructive "are you sure?" confirmation for deleting the offer. */}
            {deleteOfferOpen && (
                <Suspense fallback={null}>
                    <LazyDeleteOfferModal
                        open
                        deleting={deletingOffer}
                        onConfirm={() => void handleDeleteOffer()}
                        onCancel={() => setDeleteOfferOpen(false)}
                    />
                </Suspense>
            )}

        </div>
    );
};
