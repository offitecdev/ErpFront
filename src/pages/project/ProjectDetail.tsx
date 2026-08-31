import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Briefcase01 as BriefcaseBusiness } from '@/components/icons/antIconCompat';
import { SkeletonBar } from '@/components/ui-shared/Loader';

import { projectApi } from '../../lib/api/project';
import { useAuthStore } from '../../store/authStore';
import type { ProjectSalesOrder } from '../../types/project';
import { ProjectTopNav } from './features/components/detail/ProjectTopNav';
import { ProjectDetailHeader } from './features/components/detail/ProjectDetailHeader';
import { renderProjectSection } from './features/components/detail/ProjectSectionRenderer';
import { useProjectDetailData } from './features/hooks/useProjectDetailData';
import { getProjectDisplayOrders } from './features/utils/projectOrderScope';
import {
    calculateProjectTotals,
    calculateTotals,
    hasAddonAttention,
} from './features/utils/projectTotals';
import { getAwaitingTechnicianAppointments } from './features/utils/projectAppointments';
import { type ProjectDetailView, viewForSection, viewFromSearch } from './features/types/projectDetailNavigation';

import { t } from '@/i18n/translate';
import { lazyToast as toast } from '@/lib/lazyToast';

const LazyProjectProcessModal = lazy(() =>
    import('./ProjectProcessModal').then((module) => ({ default: module.ProjectProcessModal })),
);
const LazyProjectDetailsModal = lazy(() =>
    import('./features/components/detail/ProjectDetailsModal').then((module) => ({ default: module.ProjectDetailsModal })),
);
const LazyProjectDeleteOrderModal = lazy(() =>
    import('./features/components/detail/ProjectDeleteOrderModal').then((module) => ({ default: module.ProjectDeleteOrderModal })),
);

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { search } = useLocation();
    const { user, permissions } = useAuthStore();
    // ?section=&sub= — Benachrichtigungen landen direkt im passenden Bereich.
    const [activeView, setActiveView] = useState<ProjectDetailView>(() => viewFromSearch(search));
    // Ein weiterer Sprung (andere Benachrichtigung, gleiche Seite) wechselt den
    // Bereich mit — Zustand beim Rendern nachziehen, wie React es für "Wert
    // hängt an einer Prop" vorsieht (kein Effekt, kein Zusatz-Render).
    const [seenSearch, setSeenSearch] = useState(search);
    if (seenSearch !== search) {
        setSeenSearch(search);
        if (new URLSearchParams(search).has('section')) setActiveView(viewFromSearch(search));
    }
    const { project, materials, mailSettings, loading, sectionLoading, loadError, load, invalidate } = useProjectDetailData(id, activeView);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [showComplete, setShowComplete] = useState(false);
    const [showDetails, setShowDetails] = useState(false);
    const [orderToDelete, setOrderToDelete] = useState<ProjectSalesOrder | null>(null);
    const [deletingOrder, setDeletingOrder] = useState(false);
    const [deletingProject, setDeletingProject] = useState(false);

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
            toast.success(t('projects.orderDeleted', { orderNumber: orderToDelete.orderNumber }));
            if (selectedOrderId === orderToDelete.id) setSelectedOrderId(null);
            setOrderToDelete(null);
            await load(true);
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('projects.orderDeleteFailed'));
        } finally {
            setDeletingOrder(false);
        }
    }, [orderToDelete, project, selectedOrderId, load]);

    // Stable handlers passed down to the header and the section renderer so memo()'d
    // children don't re-render on unrelated ProjectDetail state changes.
    // Sipariş değiştirmek sekmeyi DEĞİŞTİRMEZ: kullanıcı hangi bölümdeyse orada
    // kalır (kullanıcı isteği). Tek istisna ek siparişler — onlarda yalnızca
    // Übersicht ve Abrechnung anlamlı olduğundan diğer bölümlerden Übersicht'e
    // düşülür, yoksa kullanıcı "bu bölüm uygun değil" boş ekranında kalırdı.
    const handleSelectOrder = useCallback((orderId: string) => {
        setSelectedOrderId(orderId);
        const target = salesOrders.find((candidate) => candidate.id === orderId);
        if (target?.parentSalesOrderId) {
            setActiveView((view) => (
                view.section === 'overview' || view.section === 'billing' ? view : { section: 'overview' }
            ));
        }
    }, [salesOrders]);

    const handleCreateAddon = useCallback((parentOrderId: string) => {
        setSelectedOrderId(parentOrderId);
        setActiveView(viewForSection('addons'));
    }, []);

    const handleReload = useCallback(() => load(true), [load]);

    /* Der Terminbereich IST der Kalender: er lädt seine Termine selbst nach. Die
       Seite entwertet darum nur ihren Zwischenspeicher, statt das ganze Projekt
       neu zu holen — sonst frischte hinter dem geschlossenen Fenster die ganze
       Seite auf (Vorgabe 19.08.2026). */
    const handleAppointmentChanged = useCallback(() => { invalidate(); }, [invalidate]);

    const handleOrderCreated = useCallback(async (orderId: string) => {
        await load(true);
        setSelectedOrderId(orderId);
    }, [load]);

    // Stable header action handlers so the memo()'d header doesn't re-render (and
    // re-run its per-order totals) when unrelated modal state toggles.
    const handleOpenDetails = useCallback(() => setShowDetails(true), []);
    const handleComplete = useCallback(() => setShowComplete(true), []);

    // Dişli menüsünden, "DELETE" yazılarak onaylanmış proje silme. Faturalanmış
    // projeyi sunucu reddeder; başarıda listeye dönülür.
    const handleDeleteProject = useCallback(async () => {
        if (!project) return;
        setDeletingProject(true);
        try {
            await projectApi.deleteProject(project.id);
            toast.success(t('projects.projectDeleted'));
            navigate('/projects');
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t('projects.projectDeleteFailed'));
        } finally {
            setDeletingProject(false);
        }
    }, [project, navigate]);

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
        return (
            <div className="flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center" role="alert">
                <BriefcaseBusiness size={32} className="text-slate-400" />
                <h2 className="mt-3 text-base font-semibold text-slate-900">{t('auto.proje_bulunamadi')}</h2>
                <p className="mt-1 max-w-lg text-sm text-slate-500">
                    {loadError || t('auto.proje_silinmis_ya_da_erisiminiz_olmayabilir')}
                </p>
            </div>
        );
    }

    return (
        <div className="min-w-0 overflow-x-hidden">
            <ProjectDetailHeader
                project={project}
                orders={salesOrders}
                selectedOrder={selectedOrder}
                addonAttention={addonAttention}
                canManageOrders={canManageOrders}
                deletingProject={deletingProject}
                onDeleteOrder={requestDeleteOrder}
                onDeleteProject={handleDeleteProject}
                onSelectOrder={handleSelectOrder}
                onCreateAddon={handleCreateAddon}
                onOpenDetails={handleOpenDetails}
                onComplete={handleComplete}
            />

            {/* Top workflow menu with hover sub-menus; content spans the full width. */}
            <ProjectTopNav
                activeView={activeView}
                onChange={setActiveView}
                addonAttention={addonAttention}
            />
            <div className="ofi-prj-stage">
                {sectionLoading ? (
                    <div className="space-y-3" aria-busy="true">
                        <SkeletonBar className="h-10 rounded-md" />
                        <SkeletonBar className="h-64 rounded-md" delayMs={120} />
                    </div>
                ) : renderProjectSection({
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
                    onAppointmentChanged: handleAppointmentChanged,
                    onOrderCreated: handleOrderCreated,
                })}
            </div>

            {showComplete && (
                <Suspense fallback={null}>
                    <LazyProjectProcessModal
                        project={project}
                        mode="complete"
                        onClose={() => setShowComplete(false)}
                        onCompleted={() => {
                            setShowComplete(false);
                            void load(true);
                        }}
                    />
                </Suspense>
            )}

            {showDetails && (
                <Suspense fallback={null}>
                    <LazyProjectDetailsModal project={project} totals={projectTotals} onClose={() => setShowDetails(false)} />
                </Suspense>
            )}

            {orderToDelete && (
                <Suspense fallback={null}>
                    <LazyProjectDeleteOrderModal
                        order={orderToDelete}
                        hasAddons={orderToDeleteHasAddons}
                        deleting={deletingOrder}
                        onClose={() => setOrderToDelete(null)}
                        onConfirm={() => { void confirmDeleteOrder(); }}
                    />
                </Suspense>
            )}
        </div>
    );
};
