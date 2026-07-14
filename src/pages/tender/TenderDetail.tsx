import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { LuTable2 as MdTableChart } from '@/components/icons/lucideLocal';
import {
    File05 as FileText,
    FileDownload02 as FileDown,
    Package,
    Plus,
} from '@/components/icons/antIconCompat';

import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';

import { useTenderStore } from '../../store/tenderStore';
import { useAuthStore } from '../../store/authStore';
import { usePdfSettingsStore } from '../../store/pdfSettingsStore';
import { apiClient } from '../../lib/axios';
import { tenderApi } from '../../lib/api/tender';
import { customerApi, type CustomerLocationDto } from '../../lib/api/customer';
import type { PositionDto, TenderChangeLog, TenderDocumentDto } from '../../types/tender';

import TenderCreate from './TenderCreate';
import { TenderLogsPanel } from './detail/TenderLogsPanel';
import {
    STATUS_VARIANT,
    buildTree,
    getStatusLabel,
} from './detail/tenderDetailUtils';
import { useMoneyFormat } from './detail/utils/useMoneyFormat';
import { toCurrencyCode } from '../../utils/currency';
import { localizeTenderNumber } from '../../utils/tenderNumber';

import { t } from '@/i18n/translate';

import type {
    ManualProductForm,
    ChatterTimelineItem,
    DetailInfoRow,
    CustomerOption,
    TenderSettingsTabKey,
    TenderWorkspaceTabKey,
} from './detail/types/tenderDetail.types';
import {
    DEFAULT_VAT,
    SECTION_SCHEMA_STORAGE_KEY,
    EMPTY_CHATTER_SUMMARY,
    lineActionButtonClass,
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
    formatLocationAddress,
    locationKindOf,
} from './detail/utils/tenderAddress.utils';
import { emptyManualProduct } from './detail/utils/tenderProduct.utils';
import { defaultTenderValidUntil } from './detail/utils/tenderDate.utils';
import { isSourceSalesOrder, formatTenderFormatLabel } from './detail/utils/tenderStatus.utils';
import { computeTenderPricingSummary, formatDiscountPercent } from './detail/utils/tenderPricing.utils';
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
import { TenderQuoteTopBar } from './detail/components/TenderQuoteTopBar';
import { TenderWorkspaceTabs } from './detail/components/TenderWorkspaceTabs';
import { TenderProductPickerModal } from './detail/components/product/TenderProductPickerModal';
import { TenderManualProductModal } from './detail/components/product/TenderManualProductModal';
import { TenderLineTable } from './detail/components/lines/TenderLineTable';
import { TenderBulkDeleteModal } from './detail/components/bulk/TenderBulkDeleteModal';
import { TenderBulkDiscountModal } from './detail/components/bulk/TenderBulkDiscountModal';
import { TenderCustomerSection } from './detail/components/customer/TenderCustomerSection';
import { TenderCustomerCreateModal } from './detail/components/customer/TenderCustomerCreateModal';
import { TenderAddressPicker, TenderBillingAddressRow } from './detail/components/address/TenderAddressSection';
import { TenderAddressCreateModal } from './detail/components/address/TenderAddressCreateModal';
import { TenderAddressTypeRow, type TenderAddressType } from './detail/components/address/TenderAddressTypeRow';
import { TenderProfitabilityPanel } from './detail/components/profitability/TenderProfitabilityPanel';
import { TenderDocumentPreviewModal } from './detail/components/documents/TenderDocumentPreviewModal';
import { TenderOrderDecisionModal } from './detail/components/order/TenderOrderDecisionModal';
import { UnsavedChangesModal } from './detail/components/UnsavedChangesModal';
import { DeleteOfferModal } from './detail/components/modals/DeleteOfferModal';
import { ProjectCreatedModal } from './detail/components/ProjectCreatedModal';
import { useUnsavedChangesGuard } from './detail/hooks/useUnsavedChangesGuard';
import { renderDetailLines, splitAddress, valueOrBlank } from './detail/components/info/TenderDetailInfoRows';
import { TenderPriceSummary } from './detail/components/info/TenderPriceSummary';
import { TenderCommissionInput } from './detail/components/info/TenderCommissionInput';
import { TenderCurrencySelect } from './detail/components/info/TenderCurrencySelect';

const LazyTenderSettingsModal = lazy(() =>
    import('./detail/components/modals/TenderSettingsModal').then((mod) => ({ default: mod.TenderSettingsModal }))
);
const LazyExportModal = lazy(() =>
    import('./detail/components/modals/ExportModal').then((mod) => ({ default: mod.ExportModal }))
);
const LazyTenderTechnicianTab = lazy(() =>
    import('./detail/TenderTechnicianTab').then((mod) => ({ default: mod.TenderTechnicianTab }))
);

const LazyPanelFallback = () => (
    <div className="min-h-[280px] animate-pulse rounded-lg border border-slate-100 bg-slate-50" />
);






export const TenderDetail = () => {
    useLanguageRefresh();
    const fmtMoney = useMoneyFormat();
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
    } = useTenderCustomerLocations({ tenderCustomerId: detail?.tender.customerId });
    // Quick "+ add address" popup launched from the tender's address section.
    const [addrModalOpen, setAddrModalOpen] = useState(false);
    const [addrTarget, setAddrTarget] = useState<'INSTALLATION' | 'DELIVERY' | 'BILLING' | 'CUSTOMER'>('INSTALLATION');
    // The quote's single address slot is EITHER Projekt- or Lieferadresse.
    const [tenderAddressType, setTenderAddressType] = useState<TenderAddressType>('INSTALLATION');
    const [addrForm, setAddrForm] = useState({ name: '', address: '', postalCode: '', city: '', country: '' });
    const [addrSaving, setAddrSaving] = useState(false);
    // Quick "+ add customer" popup launched from the tender's customer section.
    const [customerModalOpen, setCustomerModalOpen] = useState(false);
    const [customerForm, setCustomerForm] = useState({ companyName: '', mainEmail: '', mainPhone: '', address: '' });
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
        openProductPicker,
    } = useTenderProductPicker();
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
        loadTenderChatterSummary,
        loadTenderChatter,
        handleOpenLogs,
        handleCloseLogs,
    } = useTenderChatter({ activeTenderId: detail?.tender.id || id, isCreatingTender });
    const [localPositions, setLocalPositions] = useState<PositionDto[]>([]);
    const {
        pendingAddrId,
        setPendingAddrId,
        savingAll,
        isDirty,
        stableRowKeys,
        resetStaging,
        commitTextField,
        commitNumberField,
        commitLongDescription,
        handleTenderMetaChange,
        handleMetaFieldChange,
        handleAddressPick,
        handleSaveAll,
        handleAddRow,
        handleMoveRow,
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
        saveAll: handleSaveAll,
    });
    // Customer-specific product discounts: auto-applied when one of the saved
    // articles is added to the quote.
    const { discountMap: customerDiscountMap } = useCustomerProductDiscounts({ customerId: detail?.tender.customerId });
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
    const [sectionSchemaOpen, setSectionSchemaOpen] = useState(() => {
        if (typeof window === 'undefined') return true;
        return window.localStorage.getItem(SECTION_SCHEMA_STORAGE_KEY) !== 'false';
    });

    useEffect(() => {
        if (id) {
            resetStaging();
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
            const store = useTenderStore.getState();
            if (store.detail?.tender.id !== id || store.loadingDetail) {
                void fetchDetail(id);
            }
            setLogsLoaded(false);
            setChatterOpen(false);
            useTenderStore.setState({ logs: [] });
        }
    }, [id, isCreatingTender, fetchDetail]);


    useEffect(() => {
        if (!detail?.tender.id || stockArticlesLoaded || stockArticlesLoading) return;
        const hasProductRows = localPositions.some((position) => getLineKind(position) === 'PRODUCT' && !!position.sourceArticleId);
        if (!hasProductRows && detail.tender.status !== "Draft") return;
        const timer = window.setTimeout(() => {
            // Profitability/cost columns only need prices, not images — keep this
            // background preload on the slim (image-less) summary.
            void fetchStockArticles(false, false);
        }, 250);
        return () => window.clearTimeout(timer);
    }, [detail?.tender.id, detail?.tender.status, fetchStockArticles, localPositions, stockArticlesLoaded, stockArticlesLoading]);

    const tree = useMemo(() => buildTree(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const simpleRows = useMemo(() => buildSimpleTenderLines(localPositions, fallbackTaxRate), [localPositions, fallbackTaxRate]);
    const displayRows = simpleRows;
    // The quote lines load all at once now (no pagination) — text-only rows are light.
    const pagedRows = displayRows;
    const grandTotal = useMemo(() => simpleRows.reduce((sum, row) => sum + row.total, 0), [simpleRows]);
    // Offer footer figures: average line discount, direct discount, net/VAT/gross.
    const pricingSummary = useMemo(
        () => computeTenderPricingSummary(simpleRows, fallbackTaxRate, detail?.tender.directDiscount),
        [simpleRows, fallbackTaxRate, detail?.tender.directDiscount],
    );
    const selectedRows = useMemo(
        () => simpleRows.filter((row) => selectedRowIds[row.id]),
        [simpleRows, selectedRowIds],
    );
    const selectedLine = useMemo(
        () => simpleRows.find((row) => row.id === selectedId) ?? null,
        [simpleRows, selectedId],
    );
    const {
        profitabilityRows,
        profitabilityRevenue,
        profitabilityCost,
        profitabilityResult,
        profitabilityRate,
        selectedProfitabilityLine,
    } = useTenderProfitability({ stockArticles, displayRows, selectedLine });
    const discountEligibleRows = selectedRows.filter((row) => row.kind === 'PRODUCT');
    const allRowsSelected = simpleRows.length > 0 && selectedRows.length === simpleRows.length;
    const someRowsSelected = selectedRows.length > 0;

    const { registerCellHandle, navigateCell } = useTenderLineKeyboardNavigation(pagedRows);

    useEffect(() => {
        setSelectedRowIds((prev) => {
            const validIds = new Set(simpleRows.map((row) => row.id));
            const next = Object.fromEntries(Object.entries(prev).filter(([rowId, checked]) => checked && validIds.has(rowId)));
            return Object.keys(next).length === Object.keys(prev).length ? prev : next;
        });
    }, [simpleRows]);

    useEffect(() => {
        if (!id || detail?.tender.id !== id) return;

        const timer = window.setTimeout(() => {
            fetchActivities(id);
            void loadTenderChatterSummary();
        }, 100);
        return () => window.clearTimeout(timer);
    }, [id, detail?.tender.id, fetchActivities, loadTenderChatterSummary]);


    // Guards against leaving with unsaved changes: shows our custom modal for
    // in-app navigation (menu switch / links / Back button) and falls back to the
    // browser's native prompt only for a hard refresh or tab close.
    const navGuard = useUnsavedChangesGuard(isDirty);
    const handleGuardSave = async () => {
        const ok = await handleSaveAll();
        if (ok) navGuard.proceed();
    };


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
        setAddrForm({ name: '', address: '', postalCode: '', city: '', country: '' });
        setAddrModalOpen(true);
    };

    // Persist the new address, then select it on the tender (or set it as the
    // customer's address). Installation + same-as also updates billing.
    const submitAddrModal = async () => {
        const customerId = detail?.tender.customerId;
        if (!customerId) { toast.error(t('tenders.address_info_not_found')); return; }
        const formatted = formatLocationAddress({
            id: '', name: addrForm.name, address: addrForm.address,
            postalCode: addrForm.postalCode, city: addrForm.city, country: addrForm.country, isPrimary: false,
        } as CustomerLocationDto);
        try {
            setAddrSaving(true);
            if (addrTarget === 'CUSTOMER') {
                // Store the customer's primary address as separate fields so it
                // re-formats consistently wherever the main address is used.
                await apiClient.patch(`/customers/${customerId}`, {
                    addressName: addrForm.name || null,
                    address: addrForm.address || null,
                    postalCode: addrForm.postalCode || null,
                    city: addrForm.city || null,
                    country: addrForm.country || null,
                });
            } else {
                await customerApi.addLocation(customerId, {
                    name: addrForm.name || formatted, address: addrForm.address, postalCode: addrForm.postalCode,
                    city: addrForm.city, country: addrForm.country, kind: addrTarget,
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

    const setSectionSchemaOpenPersisted = (open: boolean) => {
        setSectionSchemaOpen(open);
        window.localStorage.setItem(SECTION_SCHEMA_STORAGE_KEY, String(open));
    };

    const openManualProduct = () => {
        setManualProduct(emptyManualProduct(productSearch.trim(), fallbackTaxRate));
        setManualProductOpen(true);
    };

    // "Add new product" opens the full product creation page in a new window,
    // carrying the searched text as ?name= so the name field is pre-filled and
    // the user completes the rest of the card there.
    const openStockArticleCreate = () => {
        const name = productSearch.trim();
        const query = name ? `?name=${encodeURIComponent(name)}` : '';
        window.open(`/inventory/articles/new${query}`, '_blank', 'noopener');
        setProductPickerOpen(false);
        setProductPickerAfterRowId(undefined);
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
            id: '', name: '', address: customer.address ?? '',
            postalCode: customer.postalCode ?? '', city: customer.city ?? '', country: customer.country ?? '',
            isPrimary: true,
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
        setCustomerForm({ companyName: '', mainEmail: '', mainPhone: '', address: '' });
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
                address: customerForm.address.trim() || undefined,
            }).then((res) => res.data);
            const option: CustomerOption = {
                id: created.id,
                companyName: created.companyName ?? customerForm.companyName.trim(),
                segment: created.segment ?? null,
                mainEmail: created.mainEmail ?? null,
                mainPhone: created.mainPhone ?? null,
                addressName: created.addressName ?? null,
                address: created.address ?? null,
                postalCode: created.postalCode ?? null,
                city: created.city ?? null,
                country: created.country ?? null,
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
    // The currency now has its own row, so it is no longer folded into Preisliste.
    const priceList = valueOrBlank((tender as any).priceList);
    const currencyCode = toCurrencyCode((tender as any).currency);
    const tenderFormatLabel = formatTenderFormatLabel(tender.format);
    const tenderValidityValue = tender.validUntil ? dayjs(tender.validUntil).format('YYYY-MM-DD') : minimumTenderValidUntil;
    const tenderValidityLabel = dayjs(tenderValidityValue).format('DD.MM.YYYY');
    
    const tenderHeaderMeta = (
        <span className="inline-flex flex-wrap items-center gap-2 text-[12.5px] text-slate-500">
            <span className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-2.5 font-semibold text-slate-700">
                {tenderFormatLabel ||t('tenders.sia_451')}
            </span>
            {canEditTenderMeta ? (
                <label className="relative inline-flex h-7 cursor-pointer items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 font-medium text-emerald-800 transition-colors hover:border-emerald-300 hover:bg-emerald-100">
                    <span className="text-[11px] font-semibold uppercase text-emerald-700">{t('tenders.gecerlilik')}</span>
                    <span className="font-semibold tabular-nums text-slate-900">{tenderValidityLabel}</span>
                    <input
                        aria-label={t('tenders.gecerlilik_tarihi')}
                        type="date"
                        value={tenderValidityValue}
                        min={minimumTenderValidUntil}
                        onChange={(event) => void handleMetaFieldChange('validity', { validUntil: event.target.value || null })}
                        className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
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
    const renderAddressLines = (value: string) => renderDetailLines(splitAddress(value));

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
        <div className="flex items-center gap-1.5">
            <input
                aria-label={t('tenders.lieferdatum_intern')}
                type="date"
                value={internalDeliveryDateValue}
                onChange={(event) => void handleMetaFieldChange('internalDate', { internalDeliveryDate: event.target.value || null })}
                className="w-full max-w-[180px] rounded-md border border-slate-200 bg-white px-2 py-1 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#1f2654]"
            />
        </div>
    ) : null;
    const tenderDetailLeft: DetailInfoRow[] = [
        { label:t('tenders.kunde'), content: tenderCustomerPicker, lines: customerLines },
        {
            label: tenderAddressType === 'DELIVERY' ?t('tenders.lieferadresse') :t('tenders.projektadresse'),
            content: tenderAddressRowContent,
            lines: splitAddress(activeAddressValue),
        },
        { label:t('tenders.rechnungsadresse'), content: billingRowContent, lines: splitAddress((sameAsInstallation ? activeAddressValue : billingAddressValue) || tender.customerName || '') },
        { label:t('tenders.lieferdatum_intern'), content: internalDeliveryDatePicker, lines: [internalDeliveryDateValue ? dayjs(internalDeliveryDateValue).format('DD.MM.YYYY') : ''] },
    ];
    const tenderDetailRight: DetailInfoRow[] = [
        { label:t('tenders.auftragsdatum'), lines: [createdAtLabel] },
        // Preisliste reflects the average of all product-line discounts.
        { label:t('tenders.preisliste'), lines: [`Ø ${formatDiscountPercent(pricingSummary.averageDiscount)}${priceList ? ` · ${priceList}` : ''}`] },
        {
            label:t('tenders.waehrung'),
            content: canEditTenderMeta
                ? <TenderCurrencySelect value={currencyCode} onChange={(value) => handleMetaFieldChange('currency', { currency: value })} />
                : undefined,
            lines: [currencyCode],
        },
        {
            label:t('tenders.kommission_nr'),
            content: canEditTenderMeta
                ? <TenderCommissionInput value={commissionNumber} onCommit={(value) => handleMetaFieldChange('commission', { commissionNumber: value })} />
                : undefined,
            lines: [commissionNumber],
        },
        { label:t('tenders.subtotal_excl_vat'), content: <span className="font-semibold tabular-nums text-slate-900">{fmtMoney(pricingSummary.netTotal)}</span> },
        { label:t('tenders.total_incl_vat'), content: <span className="font-semibold tabular-nums text-slate-900">{fmtMoney(pricingSummary.grossTotal)}</span> },
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
                    className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-[12px] font-medium text-slate-700 transition-colors hover:border-[#1f2654] hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#1f2654]/10"
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
            <TenderQuoteTopBar
                onOpenLogs={handleOpenLogs}
                onDeleteOffer={() => setDeleteOfferOpen(true)}
                canSave={canEditTenderMeta}
                saving={savingAll}
                isDirty={isDirty}
                onSave={() => void handleSaveAll()}
                creatorName={creatorName}
            />

            {/* Clears the fixed TenderQuoteTopBar so the tender number sits just below it. */}
            <div aria-hidden className="h-5" />

            <TenderDetailHeader
                tender={tender}
                tenderStatusVariant={tenderStatusVariant}
                tenderStatusLabel={tenderStatusLabel}
                tenderHeaderMeta={tenderHeaderMeta}
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

            <div className="relative z-10 mb-4 rounded-xl border border-slate-200/80 bg-white shadow-sm">
                <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-slate-100">
                    <div className="divide-y divide-slate-100 px-4 lg:pr-6">
                        {tenderDetailLeft.map((item) => (
                            <div key={item.label} className="grid grid-cols-[112px_minmax(0,1fr)] items-start gap-3 py-2 text-[12.5px]">
                                <div className="pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                                <div className={`font-medium leading-[1.15rem] text-slate-800 ${item.content ? '' : 'px-3'}`}>{item.content ?? renderDetailLines(item.lines ?? [])}</div>
                            </div>
                        ))}
                    </div>
                    <div className="divide-y divide-slate-100 px-4 lg:pl-6">
                        {tenderDetailRight.map((item) => (
                            <div key={item.label} className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-3 py-2 text-[12.5px]">
                                <div className="pt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-slate-400">{item.label}</div>
                                <div className={`font-medium leading-[1.15rem] text-slate-800 ${item.content ? '' : 'px-3'}`}>{item.content ?? renderDetailLines(item.lines ?? [])}</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <TenderLogsPanel
                open={chatterOpen}
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

            <TenderWorkspaceTabs
                workspaceTab={workspaceTab}
                onSelectTab={setWorkspaceTab}
                onOpenSettingsTab={openSettingsTab}
            />

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
                    <TenderLineTable
                        pagedRows={pagedRows}
                        isEmpty={simpleRows.length === 0}
                        isDraft={isDraft}
                        canManage={canManage}
                        sectionSchemaOpen={sectionSchemaOpen}
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
                        onOpenProductPicker={openProductPicker}
                    />
                </div>
                {/* Bottom of the quote: discount on the price, amount excl. VAT,
                    VAT amount and the final total — inside the same card. */}
                <TenderPriceSummary
                    summary={pricingSummary}
                    canEdit={canEditTenderMeta}
                    onDirectDiscountChange={(value) => handleTenderMetaChange({ directDiscount: value })}
                />
                        </Card>
                    </div>

                    <TenderProfitabilityPanel
                        open={sectionSchemaOpen}
                        onToggleOpen={setSectionSchemaOpenPersisted}
                        result={profitabilityResult}
                        revenue={profitabilityRevenue}
                        cost={profitabilityCost}
                        rate={profitabilityRate}
                        rows={profitabilityRows}
                        selectedLine={selectedProfitabilityLine}
                        selectedId={selectedId}
                        onSelectRow={setSelectedId}
                    />
                </div>
            ) : workspaceTab === 'technician' ? (
                <Suspense fallback={<LazyPanelFallback />}>
                    <LazyTenderTechnicianTab
                        tenderId={tender.id}
                        projectId={projectId}
                        hasCustomer={Boolean(tender.customerId)}
                        canManage={canManage}
                        onChanged={() => fetchDetail(tender.id, true)}
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
                        initialTab={settingsInitialTab}
                        overtimeHourlyRate={overtimeHourlyRate}
                        onOvertimeHourlyRateChange={setOvertimeHourlyRate}
                        onChanged={() => fetchDetail(tender.id, true)}
                    />
                </Suspense>
            )}

            <TenderOrderDecisionModal
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

            <TenderProductPickerModal
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
                    setProductPickerOpen(false);
                    setProductPickerAfterRowId(undefined);
                    // The picker page already includes every field needed to stage
                    // the row, so selecting a product performs no second request.
                    const customerDiscount = customerDiscountMap[article.id];
                    handleAddRow(
                        'PRODUCT',
                        article,
                        customerDiscount !== undefined ? { discount: customerDiscount } : undefined,
                        afterRowId,
                    );
                }}
            />

            <TenderManualProductModal
                open={manualProductOpen}
                onClose={() => setManualProductOpen(false)}
                manualProduct={manualProduct}
                onChange={setManualProduct}
                onSubmit={handleCreateManualProduct}
            />

            <TenderBulkDeleteModal
                open={bulkDeleteOpen}
                onClose={() => setBulkDeleteOpen(false)}
                loading={bulkActionLoading}
                selectedRows={selectedRows}
                onConfirm={handleBulkDelete}
            />

            <TenderBulkDiscountModal
                open={bulkDiscountOpen}
                onClose={() => setBulkDiscountOpen(false)}
                loading={bulkActionLoading}
                eligibleCount={discountEligibleRows.length}
                value={bulkDiscountValue}
                onValueChange={setBulkDiscountValue}
                onConfirm={handleBulkDiscount}
            />

            <TenderDocumentPreviewModal
                document={documentPreview}
                onClose={() => setDocumentPreview(null)}
            />

            {exportOpen && (
                <Suspense fallback={null}>
                    <LazyExportModal
                        open={exportOpen}
                        onClose={() => setExportOpen(false)}
                        tenderId={tender.id}
                        tenderNumber={tender.tenderNumber}
                        tree={tree}
                        grandTotal={grandTotal}
                    />
                </Suspense>
            )}

            {/* Inline "+ add address" popup (installation / billing / customer) */}
            <TenderAddressCreateModal
                open={addrModalOpen}
                onClose={() => setAddrModalOpen(false)}
                saving={addrSaving}
                target={addrTarget}
                onTargetChange={setAddrTarget}
                form={addrForm}
                onFormChange={setAddrForm}
                onSubmit={submitAddrModal}
            />

       
            <TenderCustomerCreateModal
                open={customerModalOpen}
                onClose={() => setCustomerModalOpen(false)}
                saving={customerSaving}
                form={customerForm}
                onChange={setCustomerForm}
                onSubmit={submitCustomerModal}
            />

            {/* Custom "unsaved changes" prompt shown when leaving via menu / links / Back. */}
            <UnsavedChangesModal
                open={navGuard.isOpen}
                saving={savingAll}
                onSave={handleGuardSave}
                onDiscard={navGuard.proceed}
                onCancel={navGuard.cancel}
            />

            {/* "Project created successfully" popup with go-to / stay choices. */}
            <ProjectCreatedModal
                open={!!projectCreatedModalId}
                onGoToProject={goToCreatedProject}
                onStay={dismissProjectCreated}
            />

            {/* Destructive "are you sure?" confirmation for deleting the offer. */}
            <DeleteOfferModal
                open={deleteOfferOpen}
                deleting={deletingOffer}
                onConfirm={() => void handleDeleteOffer()}
                onCancel={() => setDeleteOfferOpen(false)}
            />

        </div>
    );
};
