import { lazy, Suspense, useCallback, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Briefcase01 as BriefcaseBusiness } from '@/components/icons/antIconCompat';
import { SkeletonBar } from '@/components/ui-shared/Loader';

import { useOrderLifecycle } from '@/components/orders/useOrderLifecycle';
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

// Native-macOS look of the page (10.09.2026) — the quote detail's palette and
// shapes, scoped to `.ofi-prj-page.ofi-prj-apple`; chunk-local like the quote's.
import '@/styles/projectDetail.css';
import '@/styles/modules/projectDetail.css';

const LazyProjectProcessModal = lazy(() =>
    import('./ProjectProcessModal').then((module) => ({ default: module.ProjectProcessModal })),
);
const LazyProjectDetailsModal = lazy(() =>
    import('./features/components/detail/ProjectDetailsModal').then((module) => ({ default: module.ProjectDetailsModal })),
);
const LazyProjectOrderPickerModal = lazy(() =>
    import('./features/components/detail/ProjectOrderPickerModal').then((module) => ({ default: module.ProjectOrderPickerModal })),
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
    const [orderPickerOpen, setOrderPickerOpen] = useState(false);
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

    /* ── §5: DER KNOPF STEHT HIER, GEHANDELT WIRD AM AUFTRAG ──────────────────
       Vorgabe Samet (06.09.2026): «Auf dem Projektbildschirm darf ein Knopf
       stehen, aber er handelt am jeweiligen Auftrag — bei mehreren Aufträgen
       muss die Person wählen, welchen sie meint.» Genau das tut das Fenster:
       es nimmt EINEN Auftrag zurück (Entwurf oder Storno), und das Projekt
       fällt nur mit seinem letzten aktiven Auftrag. */
    const { requestAction, dialog: lifecycleDialog } = useOrderLifecycle(async (order, outcome) => {
        if (selectedOrderId === order.id) setSelectedOrderId(null);
        // ZURÜCK IN ENTWURF: der Auftrag ist weg und seine Offerte wieder ein
        // Entwurf. War es der letzte, steht das Projekt weiter da — als leere
        // Planung —, also bleibt die Seite, wo sie ist, und lädt neu.
        if (outcome.action === 'REVERT' && outcome.tenderId && outcome.projectReverted) {
            await load(true);
            return;
        }
        await load(true);
    });

    const requestOrderAction = useCallback((order: ProjectSalesOrder) => {
        requestAction({
            id: order.id,
            orderNumber: order.orderNumber,
            isAddon: Boolean(order.parentSalesOrderId),
            cancelled: Boolean(order.cancelledAt),
        });
    }, [requestAction]);

    /* Aus dem Zahnrad heraus: bei genau einem Auftrag geht es direkt, bei
       mehreren fragt eine Liste zuerst, welcher gemeint ist. */
    const requestOrderActionFromMenu = useCallback(() => {
        if (salesOrders.length === 1 && salesOrders[0]) {
            requestOrderAction(salesOrders[0]);
            return;
        }
        setOrderPickerOpen(true);
    }, [salesOrders, requestOrderAction]);

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
            <div className="ofi-prj-page ofi-prj-apple space-y-4">
                <div className="h-24 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
                <div className="h-12 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />
                <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            </div>
        );
    }

    if (!project) {
        return (
            <div className="ofi-prj-page ofi-prj-apple flex min-h-64 flex-col items-center justify-center rounded-xl border border-slate-200 bg-white px-6 text-center" role="alert">
                <BriefcaseBusiness size={32} className="text-slate-400" />
                <h2 className="mt-3 text-base font-semibold text-slate-900">{t('auto.proje_bulunamadi')}</h2>
                <p className="mt-1 max-w-lg text-sm text-slate-500">
                    {loadError || t('auto.proje_silinmis_ya_da_erisiminiz_olmayabilir')}
                </p>
            </div>
        );
    }

    return (
        <div className="ofi-prj-page ofi-prj-apple min-w-0 overflow-x-hidden">
            <ProjectDetailHeader
                project={project}
                orders={salesOrders}
                selectedOrder={selectedOrder}
                addonAttention={addonAttention}
                canManageOrders={canManageOrders}
                deletingProject={deletingProject}
                onOrderAction={requestOrderAction}
                // Ohne Auftrag gibt es nichts zurueckzunehmen: der Eintrag
                // verschwindet dann aus dem Zahnrad.
                onOrderActionFromMenu={salesOrders.length ? requestOrderActionFromMenu : undefined}
                onProjectChanged={handleReload}
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

            {/* §5: erst die Frage «welcher Auftrag?», dann das Fenster, das
                sagt, was mit ihm geschehen darf. */}
            {orderPickerOpen && (
                <Suspense fallback={null}>
                    <LazyProjectOrderPickerModal
                        orders={salesOrders}
                        onClose={() => setOrderPickerOpen(false)}
                        onPick={(order) => { setOrderPickerOpen(false); requestOrderAction(order); }}
                    />
                </Suspense>
            )}

            {lifecycleDialog}
        </div>
    );
};
