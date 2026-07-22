import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Briefcase01 as BriefcaseBusiness } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Modal } from '../../components/ui-shared/Modal';
import { projectApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { ProjectSalesOrder } from '../../types/project';
import { ProjectProcessModal } from './ProjectProcessModal';
import { ProjectTopNav } from './features/components/detail/ProjectTopNav';
import { ProjectDetailHeader } from './features/components/detail/ProjectDetailHeader';
import { renderProjectSection } from './features/components/detail/ProjectSectionRenderer';
import { ProjectDetailsModal } from './features/components/detail/ProjectDetailsModal';
import { CustomerContactModal } from './features/components/detail/CustomerContactModal';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import { useProjectDetailData } from './features/hooks/useProjectDetailData';
import { getProjectDisplayOrders } from './features/utils/projectOrderScope';
import {
    calculateProjectTotals,
    calculateTotals,
    hasAddonAttention,
} from './features/utils/projectTotals';
import { getAwaitingTechnicianAppointments } from './features/utils/projectAppointments';
import { type ProjectDetailView, viewForSection } from './features/types/projectDetailNavigation';

import { t } from '@/i18n/translate';

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, permissions } = useAuthStore();
    const { project, materials, mailSettings, loading, loadError, load } = useProjectDetailData(id);
    const [activeView, setActiveView] = useState<ProjectDetailView>({ section: 'overview' });
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showComplete, setShowComplete] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [showContact, setShowContact] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<ProjectSalesOrder | null>(null);
    const [deletingOrder, setDeletingOrder] = useState(false);

    const salesOrders = useMemo(() => getProjectDisplayOrders(project), [project]);
    // Memoized so downstream memo() tabs and callbacks see a stable `order` reference
    // when neither the order list nor the selection changed.
    const selectedOrder = useMemo(
        () => salesOrders.find((order) => order.id === selectedOrderId) || salesOrders[0] || null,
        [salesOrders, selectedOrderId],
    );
    const selectedOrderIndex = useMemo(
        () => Math.max(0, salesOrders.findIndex((order) => order.id === selectedOrder?.id)),
        [salesOrders, selectedOrder],
    );
    const selectedOrderIsPrimary = selectedOrderIndex <= 0;
    const selectedOrderIsAddon = Boolean(selectedOrder?.parentSalesOrderId);
    const totals = useMemo(() => calculateTotals(project, selectedOrder, selectedOrderIsPrimary, salesOrders), [project, selectedOrder, selectedOrderIsPrimary, salesOrders]);
    const projectTotals = useMemo(() => calculateProjectTotals(project, salesOrders), [project, salesOrders]);
    const addonAttention = useMemo(() => project ? hasAddonAttention(project, selectedOrder, salesOrders) : false, [project, selectedOrder, salesOrders]);
    const awaitingTechnicianAppointments = useMemo(
        () => project ? getAwaitingTechnicianAppointments(project, selectedOrder, selectedOrderIsPrimary, salesOrders) : [],
        [project, selectedOrder, selectedOrderIsPrimary, salesOrders],
    );

    useEffect(() => {
        if (!salesOrders.length) {
            setSelectedOrderId(null);
            return;
        }
        if (!selectedOrderId || !salesOrders.some((order) => order.id === selectedOrderId)) {
            setSelectedOrderId(salesOrders[0].id);
        }
    }, [salesOrders, selectedOrderId]);

    const canManageOrders = permissions.includes('projects.manage');

    // Deleting a main order cascades to its addon orders (backend removes them and
    // every captured record in one transaction) — the confirm text says so.
    const orderToDeleteHasAddons = useMemo(
        () => Boolean(orderToDelete && !orderToDelete.parentSalesOrderId
            && salesOrders.some((candidate) => candidate.parentSalesOrderId === orderToDelete.id)),
        [orderToDelete, salesOrders],
    );

    const requestDeleteOrder = useCallback((order: ProjectSalesOrder) => {
        setOrderToDelete(order);
    }, []);

    const confirmDeleteOrder = useCallback(async () => {
        if (!orderToDelete || !project) return;
        setDeletingOrder(true);
        try {
            await projectApi.deleteSalesOrder(project.id, orderToDelete.id);
            toast.success(t('projects.orderDeleted', { orderNumber: localizeTenderNumbersInText(orderToDelete.orderNumber) }));
            if (selectedOrderId === orderToDelete.id) setSelectedOrderId(null);
            setOrderToDelete(null);
            await load(true);
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('projects.orderDeleteFailed'));
        } finally {
            setDeletingOrder(false);
        }
    }, [orderToDelete, project, selectedOrderId, load]);

    // Stable handlers passed down to the header and the section renderer so memo()'d
    // children don't re-render on unrelated ProjectDetail state changes.
    const handleSelectOrder = useCallback((orderId: string) => {
        setSelectedOrderId(orderId);
        setActiveView({ section: 'overview' });
    }, []);

    const handleCreateAddon = useCallback((parentOrderId: string) => {
        setSelectedOrderId(parentOrderId);
        setActiveView(viewForSection('addons'));
    }, []);

    const handleReload = useCallback(() => load(true), [load]);

    const handleOrderCreated = useCallback(async (orderId: string) => {
        await load(true);
        setSelectedOrderId(orderId);
    }, [load]);

    // Stable header action handlers so the memo()'d header doesn't re-render (and
    // re-run its per-order totals) when unrelated modal state toggles.
    const handleOpenDetails = useCallback(() => setShowDetails(true), []);
    const handleOpenContact = useCallback(() => setShowContact(true), []);
    const handleComplete = useCallback(() => setShowComplete(true), []);
    const handleBack = useCallback(() => navigate('/projects'), [navigate]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
                <div className="h-12 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            </div>
        );
    }

    if (!project) {
        return <EmptyState icon={<BriefcaseBusiness size={32} />} title={t('auto.proje_bulunamadi')} description={loadError || t('auto.proje_silinmis_ya_da_erisiminiz_olmayabilir')} />;
    }

    return (
        <div>
            <ProjectDetailHeader
                project={project}
                orders={salesOrders}
                selectedOrder={selectedOrder}
                addonAttention={addonAttention}
                canManageOrders={canManageOrders}
                onDeleteOrder={requestDeleteOrder}
                onSelectOrder={handleSelectOrder}
                onCreateAddon={handleCreateAddon}
                onOpenDetails={handleOpenDetails}
                onOpenContact={handleOpenContact}
                onComplete={handleComplete}
                onBack={handleBack}
            />

            {/* Top workflow menu with hover sub-menus; content spans the full width. */}
            <ProjectTopNav
                activeView={activeView}
                onChange={setActiveView}
                addonAttention={addonAttention}
            />
            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6">
                {renderProjectSection({
                    view: activeView,
                    project,
                    order: selectedOrder,
                    orders: salesOrders,
                    isPrimary: selectedOrderIsPrimary,
                    isAddon: selectedOrderIsAddon,
                    totals,
                    materials,
                    mailSettings,
                    userEmail: user?.email || '',
                    awaitingAppointments: awaitingTechnicianAppointments,
                    addonAttention,
                    canCreateAddon: permissions.includes('projects.createAddonOrder'),
                    onNavigate: setActiveView,
                    onSelectOrder: handleSelectOrder,
                    onReload: handleReload,
                    onOrderCreated: handleOrderCreated,
                })}
            </div>

            {showComplete && (
                <ProjectProcessModal
                    project={project}
                    mode="complete"
                    onClose={() => setShowComplete(false)}
                    onCompleted={() => {
                        setShowComplete(false);
                        void load(true);
                    }}
                />
            )}

            {showDetails && (
                <ProjectDetailsModal project={project} totals={projectTotals} onClose={() => setShowDetails(false)} />
            )}

            <CustomerContactModal project={project} open={showContact} onClose={() => setShowContact(false)} />

            {orderToDelete && (
                <Modal
                    open
                    width="sm"
                    title={t('projects.deleteOrderTitle')}
                    onClose={() => { if (!deletingOrder) setOrderToDelete(null); }}
                    closeOnBackdrop={!deletingOrder}
                    footer={(
                        <>
                            <Button variant="ghost" onClick={() => setOrderToDelete(null)} disabled={deletingOrder}>
                                {t('common.cancel')}
                            </Button>
                            <Button variant="danger" onClick={confirmDeleteOrder} loading={deletingOrder}>
                                {t('common.delete')}
                            </Button>
                        </>
                    )}
                >
                    <p className="text-[13px] text-slate-600">
                        {t(
                            orderToDelete.parentSalesOrderId
                                ? 'projects.deleteAddonConfirm'
                                : orderToDeleteHasAddons
                                    ? 'projects.detail.deleteMainCascadeConfirm'
                                    : 'projects.deleteMainConfirm',
                            { orderNumber: localizeTenderNumbersInText(orderToDelete.orderNumber) },
                        )}
                    </p>
                </Modal>
            )}
        </div>
    );
};
