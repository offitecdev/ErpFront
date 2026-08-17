import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { LuTable2 as MdTableChart } from '@/components/icons/lucideLocal';
import {
    File05 as FileText,
    FileDownload02 as FileDown,
    Coins01 as CoinsIcon,
    User01 as User01Icon,
} from '@/components/icons/antIconCompat';

import { PlainButton as Button, PlainCard as Card } from './detail/components/common/PlainUi';

import { useTenderStore, isDetailFresh } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { apiClient } from '../../lib/axios';
import { onIdle } from '../../lib/utils/onIdle';
import { tenderApi } from '../../lib/api/tender';
import { customerApi, type CustomerLocationDto } from '../../lib/api/customer';
import type { PositionDto, TenderChangeLog, TenderDocumentDto } from '../../types/tender';

import {
    STATUS_VARIANT,
    buildTree,
    getStatusLabel,
} from './detail/tenderDetailUtils';
import { useMoneyFormat } from './detail/utils/useMoneyFormat';
import { toCurrencyCode } from '../../utils/currency';

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
import { DEFAULT_VAT } from './detail/utils/tenderDetail.constants';
import { buildSimpleTenderLines } from './detail/utils/tenderLine.utils';
import {
    isPdfDocument,
    normalizeDocumentName,
    inferDocumentType,
} from './detail/utils/tenderDocument.utils';
import {
    addressesEqual,
    EMPTY_TENDER_ADDRESS_FORM,
    EMPTY_TENDER_CUSTOMER_FORM,
    formatLocationAddress,
    locationKindOf,
    type TenderAddressCreateForm,
    type TenderAddressSlot,
    type TenderCustomerCreateForm,
} from './detail/utils/tenderAddress.utils';
import { buildProductDefaults, emptyManualProduct, parseClosingImages } from './detail/utils/tenderProduct.utils';
import { attachPdfPositionImages } from './detail/utils/tenderPdfImages.utils';
import { defaultTenderValidUntil } from './detail/utils/tenderDate.utils';
import { isSourceSalesOrder } from './detail/utils/tenderStatus.utils';
import { computeTenderPricingSummary } from './detail/utils/tenderPricing.utils';
import { discountDisplayName, formatDiscountValue, parseDiscountList, seedTotalDiscounts } from './detail/utils/tenderDiscounts.utils';
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
import { TenderCustomerContactPopup } from './detail/components/customer/TenderCustomerContactPopup';
import { QuoteDatePicker } from './detail/components/common/QuoteDatePicker';
import { TenderAddressPicker, TenderCustomAddressRow, TenderMainAddressRow } from './detail/components/address/TenderAddressSection';
import { toAddressForm, toAddressPayload } from '@/components/ui-shared/addressForm';
import { useUnsavedChangesGuard } from './detail/hooks/useUnsavedChangesGuard';
import { usePageScrollLock } from './detail/hooks/usePageScrollLock';
import { joinAddress, renderDetailLines, splitAddress, valueOrBlank } from './detail/components/info/TenderDetailInfoRows';
import { TenderPriceSummary } from './detail/components/info/TenderPriceSummary';
import { TenderCommissionInput } from './detail/components/info/TenderCommissionInput';
import { TenderCurrencySelect } from './detail/components/info/TenderCurrencySelect';
import { QUOTE_READONLY_CLASS } from './detail/utils/quoteField.constants';

// Toasts are only produced after a request or user action. Keeping Sonner out
// of the initial quote module removes its runtime from the LCP/main-thread
// path; App's delayed toaster and the first notification share this chunk.
const toast = {
    success: (message: string) => { void import('sonner').then((mod) => mod.toast.success(message)); },
    error: (message: string) => { void import('sonner').then((mod) => mod.toast.error(message)); },
};

const LazyTenderSettingsModal = lazy(() =>
    import('./detail/components/modals/TenderSettingsModal').then((mod) => ({ default: mod.TenderSettingsModal }))
);
const LazyTenderCreate = lazy(() => import('./TenderCreate'));
const LazyTenderPaymentTab = lazy(() =>
    import('./detail/components/payment/TenderPaymentTab').then((mod) => ({ default: mod.TenderPaymentTab }))
);
const LazyTenderProductSearchDropdown = lazy(() =>
    import('./detail/components/product/TenderProductSearchDropdown').then((mod) => ({ default: mod.TenderProductSearchDropdown }))
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
// The document-total discount editor: not on the quote's critical path and it
// pulls in the shared list editor — kept out of the page's own bundle. (Product
// lines have no stacked-discount editor; they carry a single percentage.)
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
        activities,
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
    // Every address slot follows the customer's Hauptadresse unless the user
    // ticked "andere Adresse verwenden" for it — that tick lives here, and the
    // slot's picker is only rendered while it is on.
    const [customAddrSlots, setCustomAddrSlots] = useState<Record<TenderAddressSlot, boolean>>({
        INSTALLATION: false,
        DELIVERY: false,
        BILLING: false,
    });
    const [addrForm, setAddrForm] = useState<TenderAddressCreateForm>(EMPTY_TENDER_ADDRESS_FORM);
    const [addrSaving, setAddrSaving] = useState(false);
    // Quick "+ add customer" popup launched from the tender's customer section.
    const [customerModalOpen, setCustomerModalOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState<TenderCustomerCreateForm>(EMPTY_TENDER_CUSTOMER_FORM);
    const [customerSaving, setCustomerSaving] = useState(false);
    // Kunden-/CC-Karte (Kalenderfenster): öffnet sich über den Kunden in der
    // Offertkarte und pflegt zugleich die CC-Empfänger der Offerte.
    const [contactPopupOpen, setContactPopupOpen] = useState(false);
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
    const noteSubmitLockRef = useRef(false);
    const documentSubmitLockRef = useRef(false);
    const localDocumentUrlsRef = useRef(new Set<string>());
    // Mehrere Anhänge dürfen zusammen gewählt und mit der Notiz abgeschickt
    // werden; hochgeladen wird erst beim Senden.
    const [pendingDocuments, setPendingDocuments] = useState<File[]>([]);
    // The document-total discount pop-up behind "Apply discount".
    const [totalDiscountOpen, setTotalDiscountOpen] = useState(false);
    // Bulk delete/discount are now staged instantly (persisted on Save), so this
    // never toggles — kept only so the bulk modals keep their (never-busy) state.
    const [bulkActionLoading] = useState(false);
    const {
        logsLoading,
        logsLoaded,
        setLogsLoaded,
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
    } = useTenderChatter({ activeTenderId: detail?.tender.id || id, isCreatingTender });
    useEffect(() => () => {
        localDocumentUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        localDocumentUrlsRef.current.clear();
    }, []);
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
        orderDeliveryDate,
        setOrderDeliveryDate,
        notifyRecipient,
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
    // On (re)opening a tender, a slot counts as "andere Adresse" when what it
    // stores differs from the customer's Hauptadresse — that is exactly what the
    // checkbox means. Ticks the user makes afterwards are not fought.
    useEffect(() => {
        const currentTender = detail?.tender;
        if (!currentTender) return;
        const main = String(currentTender.customerAddress ?? '').trim();
        // Without a main address there is nothing to differ from, so no slot can
        // be judged custom yet; a stored value then just shows in its own picker.
        const differsFromMain = (value?: string | null) => {
            const stored = String(value ?? '').trim();
            return Boolean(stored) && Boolean(main) && !addressesEqual(stored, main);
        };
        setCustomAddrSlots({
            INSTALLATION: differsFromMain(currentTender.installationAddress),
            DELIVERY: differsFromMain(currentTender.deliveryAddress),
            BILLING: differsFromMain((currentTender as any).billingAddress),
        });
    }, [detail?.tender.id]);
    const [workspaceTab, setWorkspaceTab] = useState<TenderWorkspaceTabKey>('lines');
    const [settingsInitialTab, setSettingsInitialTab] = useState<TenderSettingsTabKey>('mail');

    const handleWorkspaceTabSelect = (tab: TenderWorkspaceTabKey) => {
        setWorkspaceTab(tab);
        if (tab === 'logs' && !logsLoaded) void loadTenderChatter();
    };

    useEffect(() => {
        if (
            workspaceTab === 'pdf'
            && detail?.tender.id
            && detail.tender.pdfContentDeferred
        ) {
            void Promise.all([
                ensurePdfContent(detail.tender.id),
                import('./detail/components/pdf/TenderPdfContentPanel'),
            ]).catch((error: any) => {
                toast.error(error?.response?.data?.error || t('common.error'));
            });
        }
    }, [workspaceTab, detail?.tender.id, detail?.tender.pdfContentDeferred, ensurePdfContent]);

    useEffect(() => {
        if (id) {
            resetStaging();
            setCreatedProjectId(null);
            setTenderDocuments([]);
            setNoteText('');
            setPendingDocuments([]);
            useTenderStore.setState({
                logs: [],
                activities: [],
                detail: isCreatingTender ? null : useTenderStore.getState().detail,
            });
        }
        if (!id || isCreatingTender) {
            setLogsLoaded(false);
            setLocalPositions([]);
            return;
        }
        if (id) {
            const store = useTenderStore.getState();
            if (store.detail?.tender.id !== id || store.loadingDetail) {
                void fetchDetail(id);
            } else if (!isDetailFresh(id)) {
                // The cached copy renders instantly; still re-sync silently in
                // the background so a stale cache can never hide lines that
                // were saved on a previous visit. Skipped when the copy was
                // fetched seconds ago (deep-link prefetch) — re-requesting it
                // immediately doubled the tender API call on every cold load.
                void fetchDetail(id, true);
            }
            setLogsLoaded(false);
            useTenderStore.setState({ logs: [] });
        }
    }, [id, isCreatingTender, fetchDetail]);


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
        || totalDiscountOpen
        || addrModalOpen
        || customerModalOpen
        || exportOpen
        || deleteOfferOpen
        || orderDecisionOpen
        || documentPreview
        || navGuard.isOpen
        || projectCreatedModalId,
    ));


    if (isCreatingTender) {
        return (
            <Suspense fallback={<TenderDetailLoadingSkeleton />}>
                <LazyTenderCreate />
            </Suspense>
        );
    }


    if (loadingDetail || !detail) {
        return <TenderDetailLoadingSkeleton />;
    }

    const tender = detail.tender;
    const isDraft = tender.status === "Draft";
    // Bu tekliften doğmuş sipariş — ana düğme varsa hedefini DOĞRUDAN açar:
    // proje düzeyinde seçim yapılmışsa projeyi, teslimat siparişiyse siparişi.
    const salesOrderId = tender.salesOrder?.id ?? null;
    const orderProjectId = projectId || tender.salesOrder?.projectId || null;
    const isSalesOrderStatus = Boolean(projectId) || Boolean(salesOrderId) || isSourceSalesOrder(tender.sourceStatus);
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
        setWorkspaceTab('logs');
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
            navigate(`/sales/quotes/${next.id}`);
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
            navigate('/sales/quotes');
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
    // customer's Hauptadresse — which every slot still following it inherits).
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
                // The Hauptadresse is the default of every slot that has not been
                // switched to its own address — write it through to those, and show
                // the new main address on the quote right away.
                const inheritPatch: Record<string, string> = {};
                if (!customAddrSlots.INSTALLATION) inheritPatch.installationAddress = formatted;
                if (!customAddrSlots.DELIVERY) inheritPatch.deliveryAddress = formatted;
                if (!customAddrSlots.BILLING) inheritPatch.billingAddress = formatted;
                handleTenderMetaChange(inheritPatch, { customerAddress: formatted });
            } else {
                await customerApi.addLocation(customerId, {
                    name: addrForm.name || formatted, kind: addrTarget, ...toAddressPayload(addrForm),
                });
                const rows = await customerApi.listLocations(customerId);
                setCustomerLocations(rows);
                // A freshly created address is by definition "another" address for
                // its slot, so that slot stays open on the picker showing it.
                setCustomAddrSlots((prev) => ({ ...prev, [addrTarget]: true }));
                if (addrTarget === 'INSTALLATION') handleTenderMetaChange({ installationAddress: formatted });
                else if (addrTarget === 'DELIVERY') handleTenderMetaChange({ deliveryAddress: formatted });
                else handleTenderMetaChange({ billingAddress: formatted, billingSameAsInstallation: false });
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
        // A new customer means a new Hauptadresse: every slot falls back to it.
        setCustomAddrSlots({ INSTALLATION: false, DELIVERY: false, BILLING: false });

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
        setCustomAddrSlots({ INSTALLATION: false, DELIVERY: false, BILLING: false });
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
            onOpenInfo={tender.customerId ? () => setContactPopupOpen(true) : undefined}
        />
    ) : null;

    const customerLines = [
        valueOrBlank(tender.customerName || tender.customerId),
        ...splitAddress(tender.customerAddress),
    ];
    // Schreibgeschützte Offerte: die Kundenzeile SELBST ist der Knopf zur
    // Kunden-/CC-Karte (Benutzerwunsch: "Klick auf den Kunden") — Name und
    // Adresse stehen weiterhin genauso da wie zuvor.
    const customerFieldControl = tenderCustomerPicker ?? (
        <button
            type="button"
            onClick={() => setContactPopupOpen(true)}
            disabled={!tender.customerId}
            title={tender.customerId ? t('tenders.customer_details') : undefined}
            className={`${QUOTE_READONLY_CLASS} justify-between gap-2 transition-colors enabled:hover:border-[#1f2654] disabled:cursor-default`}
        >
            <span className="min-w-0 py-1">{renderDetailLines(customerLines)}</span>
            {tender.customerId && <User01Icon size={13} className="shrink-0 text-slate-400" />}
        </button>
    );
    const commissionNumber = valueOrBlank((tender as any).commissionNumber || (tender as any).commissionNo || (tender as any).referenceNumber);
    const customerReference = valueOrBlank((tender as any).customerReference);
    const currencyCode = toCurrencyCode((tender as any).currency);
    const tenderValidityValue = tender.validUntil ? dayjs(tender.validUntil).format('YYYY-MM-DD') : minimumTenderValidUntil;
    const tenderValidityLabel = dayjs(tenderValidityValue).format('DD.MM.YYYY');
    // Projekt-/Montageadresse (installation), Lieferadresse (delivery) and
    // Rechnungsadresse (billing) — three independent slots, each defaulting to
    // the Hauptadresse below.
    const installationAddressValue = valueOrBlank((tender as any).installationAddress);
    const deliveryAddressValue = valueOrBlank((tender as any).deliveryAddress);
    const billingAddressValue = valueOrBlank((tender as any).billingAddress);
    const internalDeliveryDateValue = tender.internalDeliveryDate
        ? dayjs(tender.internalDeliveryDate).format('YYYY-MM-DD')
        : '';
    // The customer's MAIN address (entered on the customer create/edit form) is
    // the Hauptadresse: the default of every address slot and the first entry of
    // every picker.
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
    // Each slot picks from the Hauptadresse (listed first, the default) plus the
    // saved locations that belong to it: the Rechnungsadresse from the billing
    // list, the Projekt- and Lieferadresse from everything else.
    const slotLocations = (slot: TenderAddressSlot) => [
        ...(mainAddressOption ? [mainAddressOption] : []),
        ...customerLocations.filter((loc) => (locationKindOf(loc) === 'BILLING') === (slot === 'BILLING')),
    ];
    // An address is one line — "Hofackerstrasse 75, 4132 Muttenz" reads as a
    // single postal line, not as a stack of fragments split on its commas.
    const renderAddressLines = (value: string) => renderDetailLines([joinAddress(value)]);

    // Legacy quotes could mirror the billing address off the project/delivery one
    // via `billingSameAsInstallation`; that flag is no longer written (every slot
    // holds its own address now) but is still read so old quotes show correctly.
    const legacyBillingMirror = (tender as any).billingSameAsInstallation
        ? (installationAddressValue || deliveryAddressValue)
        : '';
    // What each slot actually holds; an empty slot means "the Hauptadresse".
    const slotStored: Record<TenderAddressSlot, string> = {
        INSTALLATION: installationAddressValue,
        DELIVERY: deliveryAddressValue,
        BILLING: billingAddressValue || legacyBillingMirror,
    };
    const slotEffective = (slot: TenderAddressSlot) => slotStored[slot] || customerMainAddress;

    const slotPatch = (slot: TenderAddressSlot, value: string | null) => {
        if (slot === 'INSTALLATION') return { installationAddress: value };
        if (slot === 'DELIVERY') return { deliveryAddress: value };
        return { billingAddress: value, billingSameAsInstallation: false };
    };
    const handleUseCustomAddress = (slot: TenderAddressSlot, checked: boolean) => {
        setCustomAddrSlots((prev) => ({ ...prev, [slot]: checked }));
        setPendingAddrId((prev) => ({ ...prev, [slot]: null }));
        // Unticked, the slot follows the Hauptadresse again — so the address it
        // was pointed at is replaced right away instead of lingering unseen.
        if (!checked) handleAddressPick(slotPatch(slot, customerMainAddress || null));
    };
    const slotPicker = (slot: TenderAddressSlot) => (
        <TenderAddressPicker
            storedValue={slotStored[slot]}
            locations={slotLocations(slot)}
            onPick={(value) => handleAddressPick(slotPatch(slot, value))}
            onAdd={() => openAddrModal(slot)}
            hasCustomer={Boolean(tender.customerId)}
            locationsLoaded={customerLocationsLoaded}
            pendingId={pendingAddrId[slot]}
            onSelectPending={(id) => setPendingAddrId((prev) => ({ ...prev, [slot]: id }))}
            renderLines={renderAddressLines}
        />
    );
    // One row for all three deviating addresses instead of a field each: the
    // short captions keep the tick boxes on a single line.
    const customAddressRowContent = canEditTenderMeta ? (
        <TenderCustomAddressRow
            options={[
                { slot: 'INSTALLATION' as TenderAddressSlot, label:t('tenders.adresse_kurz_projekt'), active: customAddrSlots.INSTALLATION },
                { slot: 'DELIVERY' as TenderAddressSlot, label:t('tenders.adresse_kurz_lieferung'), active: customAddrSlots.DELIVERY },
                { slot: 'BILLING' as TenderAddressSlot, label:t('tenders.adresse_kurz_rechnung'), active: customAddrSlots.BILLING },
            ]}
            onToggle={handleUseCustomAddress}
            renderPicker={slotPicker}
        />
    ) : null;
    const mainAddressRowContent = canEditTenderMeta ? (
        <TenderMainAddressRow
            value={customerMainAddress}
            hasCustomer={Boolean(tender.customerId)}
            onAdd={() => openAddrModal('CUSTOMER')}
            renderLines={renderAddressLines}
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
                { key: 'customer', label:t('crm.customers.companyName'), control: customerFieldControl, lines: customerLines },
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
            // Two rows while editing — the Hauptadresse every slot uses, and the
            // one line that says which slots deviate. Read-only quotes have no
            // tick boxes to save space with, so there each address is spelled out.
            fields: canEditTenderMeta
                ? [
                    {
                        key: 'main',
                        label:t('tenders.hauptadresse'),
                        control: mainAddressRowContent,
                        lines: [joinAddress(customerMainAddress)],
                    },
                    {
                        key: 'custom',
                        label:t('tenders.andere_adresse'),
                        control: customAddressRowContent,
                    },
                ]
                : [
                    {
                        key: 'address',
                        label:t('tenders.projektadresse'),
                        lines: [joinAddress(slotEffective('INSTALLATION'))],
                    },
                    {
                        key: 'delivery',
                        label:t('tenders.lieferadresse'),
                        lines: [joinAddress(slotEffective('DELIVERY'))],
                    },
                    {
                        key: 'billing',
                        label:t('tenders.rechnungsadresse'),
                        lines: [joinAddress(slotEffective('BILLING') || tender.customerName || '')],
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
        grandTotal: t('tenders.total_incl_vat'),
        totalDiscounts: t('tenders.discounts'),
    };
    const formatLogValue = (fieldName?: string | null, value?: string | null) => {
        const raw = valueOrBlank(value);
        if (!raw) return t('tenders.empty');
        const numeric = Number(raw);
        if (fieldName === 'grandTotal' && Number.isFinite(numeric)) return fmtMoney(numeric);
        if (fieldName === 'totalDiscounts') {
            const discounts = parseDiscountList(raw);
            return discounts.length > 0
                ? discounts.map((entry, index) => `${discountDisplayName(entry, index)}: ${formatDiscountValue(entry, fmtMoney)}`).join(', ')
                : t('tenders.empty');
        }
        return raw;
    };
    const visibleChangeFields = new Set(['grandTotal', 'totalDiscounts']);
    const isVisibleLog = (log: TenderChangeLog) =>
        log.actionType === 'TENDER_CREATED'
        || log.actionType === 'TENDER_APPROVED'
        || log.actionType === 'TENDER_NOTE'
        || log.actionType === 'TENDER_ATTACHMENT'
        || Boolean(log.fieldName && visibleChangeFields.has(log.fieldName));

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
            return { id: log.id, date: log.createdAt, actor, tone: 'emerald', kind: 'event', title:t('tenders.tender_created'), body: log.description || tender.tenderNumber };
        }
        if (log.actionType === 'TENDER_APPROVED') {
            return { id: log.id, date: log.createdAt, actor, tone: 'blue', kind: 'event', title:t('tenders.tender_onaylandi'), body: log.description || tender.tenderNumber };
        }
        if (log.actionType === 'TENDER_NOTE') {
            return { id: log.id, date: log.createdAt, actor, tone: 'amber', kind: 'note', title:t('tenders.note_birakildi'), body: log.description || log.newValue || '' };
        }
        if (log.actionType === 'TENDER_ATTACHMENT') {
            return {
                id: log.id,
                date: log.createdAt,
                actor,
                tone: 'violet',
                kind: 'attachment',
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
            kind: 'change',
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
            kind: 'event',
            title:t('tenders.tender_onaylandi'),
            body: activity.description || tender.tenderNumber,
        }));
    const hasAttachmentLogs = logActionTypes.has('TENDER_ATTACHMENT');
    const documentTimelineItems: ChatterTimelineItem[] = hasAttachmentLogs ? [] : tenderDocuments.map((doc) => ({
        id: `document-${doc.id}`,
        date: tender.createdAt,
        actor:t('tenders.sistem'),
        tone: 'violet',
        kind: 'attachment',
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
            kind: 'event',
            title:t('tenders.tender_created'),
            body: tender.tenderNumber,
        }];
    const timelineItems = [...logTimelineItems, ...activityTimelineItems, ...documentTimelineItems, ...syntheticCreatedItem]
        .sort((a, b) => dayjs(b.date).valueOf() - dayjs(a.date).valueOf());
    const loadDocumentContent = async (document: TenderDocumentDto) => {
        if (document.fileUrl) return document;
        return tenderApi.getDocumentContent(tender.id, document.id);
    };
    const handlePreviewDocument = async (document: TenderDocumentDto) => {
        try {
            setDocumentPreview(await loadDocumentContent(document));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('common.error'));
        }
    };
    const handleDownloadDocument = async (document: TenderDocumentDto) => {
        try {
            const loaded = await loadDocumentContent(document);
            const link = window.document.createElement('a');
            link.href = loaded.fileUrl;
            link.download = loaded.fileName;
            link.click();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('common.error'));
        }
    };
    const renderDocumentTile = (document: TenderDocumentDto, compact = false) => {
        const pdf = isPdfDocument(document);
        const mediaClass = compact ?"h-9 w-9" :"h-16 w-24";

        return (
            <div className={`mt-2 flex min-w-0 items-center gap-2 ${compact ? '' : 'max-w-[420px]'}`}>
                <button
                    type="button"
                    onClick={() => void handlePreviewDocument(document)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-[2px] border border-slate-200 bg-white px-2 py-1.5 text-left text-[12px] font-medium text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10"
                    title={document.fileName}
                >
                    <span className={`${mediaClass} flex shrink-0 flex-col items-center justify-center rounded border ${pdf ?"border-rose-200 bg-rose-50 text-rose-700" :"border-slate-200 bg-slate-50 text-slate-500"}`}>
                        <FileText size={compact ? 14 : 18} />
                        {pdf && <span className="mt-0.5 text-[9px] font-bold leading-none">PDF</span>}
                    </span>
                    <span className="min-w-0 flex-1 truncate">{document.fileName}</span>
                </button>
                <button
                    type="button"
                    onClick={() => void handleDownloadDocument(document)}
                    title={t('common.download')}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[2px] border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#1f2654] hover:bg-[#1f2654] hover:text-white"
                >
                    <FileDown size={14} />
                </button>
            </div>
        );
    };

    const handleSubmitNote = async (): Promise<boolean> => {
        if (noteSubmitLockRef.current || noteSaving) return false;
        const content = noteText.trim();
        if (!content) {
            toast.error(t('crm.customers.errorNoteEmpty'));
            return false;
        }
        noteSubmitLockRef.current = true;
        setNoteSaving(true);
        try {
            const savedLog = await tenderApi.addNote(tender.id, { noteText: content });
            prependTenderLog({
                ...savedLog,
                employeeName: savedLog.employeeName || currentUserName || savedLog.employeeName,
                employeeEmail: savedLog.employeeEmail || user?.email || savedLog.employeeEmail,
            });
            setNoteText('');
            toast.success(t('crm.customers.successNoteAdded'));
            return true;
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.customers.errorNoteAdd'));
            return false;
        } finally {
            noteSubmitLockRef.current = false;
            setNoteSaving(false);
        }
    };

    // Dieselbe Datei zweimal zu wählen (etwa nach einem zweiten Klick auf "+")
    // soll sie nicht doppelt anhängen — Name und Grösse zusammen genügen als
    // Kennung für eine Auswahl, die noch gar nicht hochgeladen ist.
    const addPendingDocuments = (files: File[]) => {
        if (files.length === 0) return;
        setPendingDocuments((current) => {
            const identity = (file: File) => `${file.name}:${file.size}`;
            const known = new Set(current.map(identity));
            return [...current, ...files.filter((file) => !known.has(identity(file)))];
        });
    };

    const handleSubmitDocument = async (file?: File, options?: { silent?: boolean }): Promise<boolean> => {
        if (documentSubmitLockRef.current || documentSaving) return false;
        if (!file) {
            toast.error(t('tenders.bir_file_select'));
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            toast.error(`${file.name}: ${t('tenders.image_too_large').replace('6 MB', '5 MB')}`);
            return false;
        }
        const fileType = inferDocumentType(file);
        if (!fileType) {
            toast.error(t('tenders.desteklenmiyor_pdf_png_veya_jpg_yukleyin', { name: file.name }));
            return false;
        }

        documentSubmitLockRef.current = true;
        setDocumentSaving(true);
        try {
            const savedDocument = await tenderApi.addDocument(tender.id, {
                fileName: file.name,
                file,
                fileType,
                category: 'tender',
            });
            // The browser already has this exact File. Reusing it makes the
            // first preview instantaneous instead of downloading it again.
            const localFileUrl = URL.createObjectURL(file);
            localDocumentUrlsRef.current.add(localFileUrl);
            const locallyPreviewableDocument = { ...savedDocument, fileUrl: localFileUrl };
            setTenderDocuments((documents) => [
                locallyPreviewableDocument,
                ...documents.filter((document) => document.id !== savedDocument.id),
            ]);
            addLocalTenderLog({
                actionType: 'TENDER_ATTACHMENT',
                fieldName: 'attachment',
                value: file.name,
                description: `Ek dosya eklendi: ${file.name}`,
            });
            // Bei mehreren Dateien meldet der Aufrufer EINMAL zusammenfassend.
            if (!options?.silent) toast.success(t('tenders.additional_file_added'));
            return true;
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.additional_file_eklenemedi'));
            return false;
        } finally {
            documentSubmitLockRef.current = false;
            setDocumentSaving(false);
        }
    };

    const handleSubmitComposer = async () => {
        const hasNote = Boolean(noteText.trim());
        const files = pendingDocuments;
        if (!hasNote && files.length === 0) {
            toast.error(t('crm.customers.errorNoteEmpty'));
            return;
        }

        const notePromise = hasNote ? handleSubmitNote() : Promise.resolve(false);
        // Nacheinander: `handleSubmitDocument` lässt jeweils nur EINEN Upload zu
        // (Doppelklick-Sperre), parallel gestartete Dateien fielen still durch.
        // Was scheitert (zu gross, falscher Typ), bleibt mit seiner Meldung in
        // der Liste stehen — der Rest verschwindet.
        const rejected: File[] = [];
        let saved = 0;
        for (const file of files) {
            if (await handleSubmitDocument(file, { silent: true })) saved += 1;
            else rejected.push(file);
        }
        await notePromise;
        setPendingDocuments(rejected);
        if (saved === 1) toast.success(t('tenders.additional_file_added'));
        else if (saved > 1) toast.success(t('tenders.additional_files_added', { count: saved }));
    };

    return (
        <div>
            <TenderDetailHeader
                tender={tender}
                tenderStatusVariant={tenderStatusVariant}
                tenderStatusLabel={tenderStatusLabel}
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
                projectId={orderProjectId}
                salesOrderId={salesOrderId}
                projectCreateLoading={projectCreateLoading}
                onBack={() => navGuard.attempt(() => navigate('/sales/quotes'))}
                onCreateVersion={handleCreateVersion}
                onExport={() => setExportOpen(true)}
                onCreateProject={handleCreateProject}
                onOpenOrder={() => navGuard.attempt(() => navigate(
                    orderProjectId ? `/projects/${orderProjectId}` : `/sales/orders/${salesOrderId}`,
                ))}
                onCreateOrder={() => void openOrderDecision()}
                onApprove={handleApprove}
            />

            <TenderCustomerCard
                groups={tenderDetailGroups}
                summary={[tender.customerName, tenderValidityLabel].filter(Boolean).join(' · ')}
            />

            {/* Kundenkarte (Kalenderfenster) — nur Kontaktdaten; CC steht im
                Mailbereich der Offerte, nicht hier. */}
            <TenderCustomerContactPopup
                open={contactPopupOpen}
                onClose={() => setContactPopupOpen(false)}
                customerName={tender.customerName}
                customerEmail={tender.customerEmail}
                customerPhone={tender.customerPhone}
                customerAddress={tender.customerAddress}
            />

            <TenderWorkspaceTabs
                workspaceTab={workspaceTab}
                onSelectTab={handleWorkspaceTabSelect}
                onOpenSettingsTab={openSettingsTab}
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
                   they are edited: intro text below the title on page 1, images
                   after the totals. */
                <Card title={t('tenders.pdf_content')} icon={<FileText size={14} />}>
                    {/* Der gespeicherte Inhalt wird nachgeladen (pdfContentDeferred).
                        Das Panel darf erst danach mounten: es füllt einen leeren
                        Einleitungstext mit dem Standard-Textbaustein vor und würde
                        sonst den noch nicht eingetroffenen Text überschreiben. */}
                    {tender.pdfContentDeferred ? <LazyPanelFallback /> : (
                    <Suspense fallback={<LazyPanelFallback />}>
                        <LazyTenderPdfContentPanel
                            canEdit={canEditTenderMeta}
                            onError={(message) => toast.error(message)}
                            value={{
                                coverLetter: tender.coverLetter ?? null,
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
                    )}
                </Card>
            ) : workspaceTab === 'payment' ? (
                /* Ödeme planı tab — percentage stages (30/20/10/40) the customer
                   pays in. Staged like every other quote field: nothing is sent
                   until the user hits Save; the schedule is copied to the order
                   at conversion and drives stage-by-stage invoicing there. */
                <Card title={t('tenders.payment_schedule_tab')} icon={<CoinsIcon size={14} />}>
                    <Suspense fallback={<LazyPanelFallback />}>
                        <LazyTenderPaymentTab
                            tender={tender}
                            canEdit={canEditTenderMeta}
                            grossTotal={pricingSummary.grossTotal}
                            onMetaChange={(patch) => handleTenderMetaChange(patch)}
                        />
                    </Suspense>
                </Card>
            ) : workspaceTab === 'logs' ? (
                <Suspense fallback={<LazyPanelFallback />}>
                    <LazyTenderLogsPanel
                        open
                        embedded
                        onClose={() => setWorkspaceTab('lines')}
                        timelineItems={timelineItems}
                        logsLoading={logsLoading}
                        canManage={canManage}
                        noteText={noteText}
                        onNoteTextChange={setNoteText}
                        noteSaving={noteSaving}
                        onSubmitNote={handleSubmitComposer}
                        documentInputRef={documentInputRef}
                        documentSaving={documentSaving}
                        pendingDocuments={pendingDocuments}
                        onAddDocuments={addPendingDocuments}
                        onRemoveDocument={(index) => setPendingDocuments((current) => current.filter((_, position) => position !== index))}
                        documentsLoading={documentsLoading}
                        tenderDocuments={tenderDocuments}
                        renderDocumentTile={renderDocumentTile}
                    />
                </Suspense>
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
                deliveryDate={orderDeliveryDate}
                onDeliveryDateChange={setOrderDeliveryDate}
                notifyRecipient={notifyRecipient}
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
                <Suspense fallback={null}>
                <LazyTenderProductSearchDropdown
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
                />
                </Suspense>
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
