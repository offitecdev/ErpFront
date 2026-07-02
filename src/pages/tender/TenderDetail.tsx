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
import { articleApi as inventoryArticleApi } from '../../lib/api/inventory';
import type { PositionDto, TenderChangeLog, TenderDocumentDto } from '../../types/tender';
import type { InventoryArticle } from '../../types/inventory';

import TenderCreate from './TenderCreate';
import { TenderLogsPanel } from './detail/TenderLogsPanel';
import {
    STATUS_VARIANT,
    buildTree,
    fmtMoney,
    getStatusLabel,
} from './detail/tenderDetailUtils';

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
import {
    emptyManualProduct,
    emptyStockArticle,
} from './detail/utils/tenderProduct.utils';
import { defaultTenderValidUntil } from './detail/utils/tenderDate.utils';
import { isSourceSalesOrder, formatTenderFormatLabel } from './detail/utils/tenderStatus.utils';
import { useLanguageRefresh } from './detail/hooks/useLanguageRefresh';
import { useTenderCustomers } from './detail/hooks/useTenderCustomers';
import { useTenderCustomerLocations } from './detail/hooks/useTenderCustomerLocations';
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
import { TenderStockArticleModal } from './detail/components/product/TenderStockArticleModal';
import { TenderLineTable } from './detail/components/lines/TenderLineTable';
import { TenderBulkDeleteModal } from './detail/components/bulk/TenderBulkDeleteModal';
import { TenderBulkDiscountModal } from './detail/components/bulk/TenderBulkDiscountModal';
import { TenderCustomerSection } from './detail/components/customer/TenderCustomerSection';
import { TenderCustomerCreateModal } from './detail/components/customer/TenderCustomerCreateModal';
import { TenderAddressPicker, TenderBillingAddressRow } from './detail/components/address/TenderAddressSection';
import { TenderAddressCreateModal } from './detail/components/address/TenderAddressCreateModal';
import { TenderProfitabilityPanel } from './detail/components/profitability/TenderProfitabilityPanel';
import { TenderDocumentPreviewModal } from './detail/components/documents/TenderDocumentPreviewModal';
import { TenderOrderDecisionModal } from './detail/components/order/TenderOrderDecisionModal';
import { renderDetailLines, splitAddress, valueOrBlank } from './detail/components/info/TenderDetailInfoRows';

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
    const [addrTarget, setAddrTarget] = useState<'INSTALLATION' | 'BILLING' | 'CUSTOMER'>('INSTALLATION');
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
    const [stockArticleInitial, setStockArticleInitial] = useState<Partial<InventoryArticle> | null>(null);
    const [exportOpen, setExportOpen] = useState(false);
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
        logsLoaded,
        setLogsLoaded,
        chatterSummary,
        setChatterSummary,
        chatterSummaryLoading,
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
        pendingChangeCount,
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
    } = useTenderOrderDecision({
        tender: detail?.tender,
        isDirty,
        overtimeHourlyRate,
        fetchDetail,
        navigate,
    });
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
            fetchDetail(id);
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


    useEffect(() => {
        if (!isDirty) return;
        const handler = (event: BeforeUnloadEvent) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
    }, [isDirty]);


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
    const creatorName = tender.createdByName || tender.createdByEmail || tender.createdByEmployeeId ||t('tenders.bilinmiyor');
    const currentUserName = user ? `${user.firstName} ${user.lastName}`.trim() || user.email : '';
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

    // Open the "+ add address" popup, pre-targeted to installation, billing or the customer.
    const openAddrModal = (target: 'INSTALLATION' | 'BILLING' | 'CUSTOMER') => {
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
                await apiClient.patch(`/customers/${customerId}`, { address: formatted });
            } else {
                await customerApi.addLocation(customerId, {
                    name: addrForm.name || formatted, address: addrForm.address, postalCode: addrForm.postalCode,
                    city: addrForm.city, country: addrForm.country, kind: addrTarget,
                });
                const rows = await customerApi.listLocations(customerId);
                setCustomerLocations(rows);
                const sameAs = !!(detail?.tender as any)?.billingSameAsInstallation;
                if (addrTarget === 'INSTALLATION') {
                    await handleTenderMetaChange(sameAs ? { deliveryAddress: formatted, billingAddress: formatted } : { deliveryAddress: formatted });
                } else {
                    await handleTenderMetaChange({ billingAddress: formatted });
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

    const openStockArticleCreate = () => {
        setStockArticleInitial(emptyStockArticle(productSearch.trim()));
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

    const openSettingsTab = (tab: TenderSettingsTabKey) => {
        setSettingsInitialTab(tab);
        setWorkspaceTab(tab);
    };

    const canEditTenderMeta = isDraft && canManage;

    const customerLoadingFlashLabel = t('common.loading').replace(/[.…\s]+$/, '');
    const tenderCustomerDropdownVisible = newTenderCustomerOpen && filteredNewTenderCustomers.length > 0;
    const handleSelectTenderCustomer = (customer: CustomerOption) => {
        if (!customer.id) return;
        const customerAddress = customer.address ?? null;
   
        setNewTenderCustomerQuery(customer.companyName);
        setNewTenderCustomerOpen(false);
        setPendingAddrId({ INSTALLATION: null, BILLING: null });
    
        handleTenderMetaChange(
            {
                customerId: customer.id,
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
                address: created.address ?? null,
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
            onAddCustomer={openCustomerModal}
        />
    ) : null;

    const customerLines = [
        valueOrBlank(tender.customerName || tender.customerId),
        ...splitAddress(tender.customerAddress),
    ];
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
    const deliveryAddressValue = valueOrBlank((tender as any).deliveryAddress);
    const internalDeliveryDateValue = (tender as any).internalDeliveryDate
        ? dayjs((tender as any).internalDeliveryDate).format('YYYY-MM-DD')
        : '';
    const installationLocations = customerLocations.filter((loc) => locationKindOf(loc) === 'INSTALLATION');
    const billingLocations = customerLocations.filter((loc) => locationKindOf(loc) === 'BILLING');
    const sameAsInstallation = !!(tender as any).billingSameAsInstallation;
    const renderAddressLines = (value: string) => renderDetailLines(splitAddress(value));
   
    const installationAddressPicker = canEditTenderMeta ? (
        <TenderAddressPicker
            storedValue={deliveryAddressValue}
            locations={installationLocations}
            onPick={(value) => handleAddressPick(sameAsInstallation ? { deliveryAddress: value, billingAddress: value } : { deliveryAddress: value })}
            onAdd={() => openAddrModal('INSTALLATION')}
            hasCustomer={Boolean(tender.customerId)}
            locationsLoaded={customerLocationsLoaded}
            pendingId={pendingAddrId.INSTALLATION}
            onSelectPending={(id) => setPendingAddrId((prev) => ({ ...prev, INSTALLATION: id }))}
            renderLines={renderAddressLines}
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
            sameAsInstallation={sameAsInstallation}
            onSameAsInstallationChange={(checked) => void handleMetaFieldChange('billing',
                checked
                    ? { billingSameAsInstallation: true, billingAddress: deliveryAddressValue || null }
                    : { billingSameAsInstallation: false },
            )}
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
        { label:t('tenders.lieferungsadresse'), content: installationAddressPicker, lines: splitAddress(deliveryAddressValue) },
        { label:t('tenders.rechnungsadresse'), content: billingRowContent, lines: splitAddress((sameAsInstallation ? deliveryAddressValue : billingAddressValue) || tender.customerName || '') },
        { label:t('tenders.lieferdatum_intern'), content: internalDeliveryDatePicker, lines: [internalDeliveryDateValue ? dayjs(internalDeliveryDateValue).format('DD.MM.YYYY') : ''] },
    ];
    const tenderDetailRight: DetailInfoRow[] = [
        { label:t('tenders.auftragsdatum'), lines: [createdAtLabel] },
        { label:t('tenders.preisliste'), lines: [priceList] },
        { label:t('tenders.zahlungsbedingung'), lines: [paymentTerms] },
        { label:t('tenders.kommission_nr'), lines: [commissionNumber] },
        { label:t('tenders.general_total'), content: <span className="font-semibold tabular-nums text-slate-900">{fmtMoney(grandTotal)}</span> },
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
    const previewLogCount = logsLoaded ? logs.filter(isVisibleLog).length : chatterSummary.logCount;
    const logCountLabel = chatterSummaryLoading && previewLogCount === 0
        ?t('common.loading')
        : String(previewLogCount);
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
                logCountLabel={logCountLabel}
                canSave={canEditTenderMeta}
                saving={savingAll}
                isDirty={isDirty}
                pendingChangeCount={pendingChangeCount}
                onSave={() => void handleSaveAll()}
                creatorName={creatorName}
            />

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
                onBack={() => { if (isDirty && !window.confirm(t('tenders.once_kaydedin'))) return; navigate('/crm/tenders'); }}
                onCreateVersion={handleCreateVersion}
                onExport={() => setExportOpen(true)}
                onCreateProject={handleCreateProject}
                onOpenOrderDecision={openOrderDecision}
                onApprove={handleApprove}
            />

            <div className="mb-4 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
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
                        grandTotal={grandTotal}
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
                        onOpenProductPicker={openProductPicker}
                    />
                </div>
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
                    // The list row is lean (no description/cost detail); fetch the
                    // full product once, on selection, so the line is complete.
                    void (async () => {
                        const full = await inventoryArticleApi.getById(article.id).catch(() => null);
                        void handleAddRow('PRODUCT', full ?? article, undefined, afterRowId);
                    })();
                }}
            />

            <TenderManualProductModal
                open={manualProductOpen}
                onClose={() => setManualProductOpen(false)}
                manualProduct={manualProduct}
                onChange={setManualProduct}
                onSubmit={handleCreateManualProduct}
            />

            <TenderStockArticleModal
                initial={stockArticleInitial}
                onClose={() => setStockArticleInitial(null)}
                onSubmit={handleCreateStockArticle}
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

        </div>
    );
};
