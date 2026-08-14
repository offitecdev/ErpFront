import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    ArrowLeft,
    Check,
    CheckCircle as CheckCircle2,
    ChevronDown,
    InfoCircle,
    Plus,
    Receipt as ReceiptText,
    Settings01 as Settings,
    Trash01,
    User01 as UserRound,
} from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { money } from '../../utils/projectFormatters';
import { ProjectStatusBadge } from '../common/ProjectStatusBadge';
import { calculateTotals } from '../../utils/projectTotals';

const LazyProjectSettingsMenu = lazy(() =>
    import('./ProjectSettingsMenu').then((module) => ({ default: module.ProjectSettingsMenu })),
);

const OrderRow = ({
    order,
    total,
    isMain,
    selected,
    attention,
    canManage,
    onClick,
    onDelete,
}: {
    order: ProjectSalesOrder;
    total: number;
    isMain?: boolean;
    selected: boolean;
    attention?: boolean;
    canManage?: boolean;
    onClick: () => void;
    onDelete?: (order: ProjectSalesOrder) => void;
}) => {
    // Synthetic "project-main-*" orders have no real row to delete.
    const deletable = Boolean(canManage && onDelete && !order.id.startsWith('project-main-'));

    return (
        <div className={`relative flex w-full items-center transition-colors ${selected ? 'bg-[#eef4ff]' : 'hover:bg-slate-50'}`}>
            <button
                type="button"
                onClick={onClick}
                className={`flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-1 text-left ${isMain ? 'pl-3' : 'pl-8'}`}
            >
                <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${isMain ? 'bg-[#272f67] text-white' : 'bg-amber-100 text-amber-700'}`}>
                    {isMain ? <ReceiptText size={14} /> : <Plus size={14} />}
                </span>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className={`truncate text-[13px] font-semibold ${selected ? 'text-[#272f67]' : 'text-slate-800'}`}>{order.orderNumber}</span>
                        <span className={`shrink-0 rounded px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide ${isMain ? 'bg-slate-100 text-slate-500' : 'bg-amber-100 text-amber-700'}`}>
                            {isMain ? t('projects.mainOrder') : t('projects.addonOrder')}
                        </span>
                        {attention && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />}
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400">{dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}</div>
                </div>
                <div className="shrink-0 font-mono text-[12px] font-semibold text-slate-700">{money(total)}</div>
                {selected && <CheckCircle2 size={15} className="shrink-0 text-[#272f67]" />}
            </button>

            {deletable && (
                <div className="relative flex shrink-0 items-center pl-1 pr-2">
                    {/* Both main and additional orders: a dedicated delete button. */}
                    <button
                        type="button"
                        aria-label={t('projects.deleteOrder')}
                        title={t('projects.deleteOrder')}
                        onClick={() => onDelete!(order)}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                        <Trash01 size={15} />
                    </button>
                </div>
            )}
        </div>
    );
};

const OrderDropdown = ({
    orders,
    project,
    selectedOrderId,
    addonAttention,
    canManageOrders,
    onSelectOrder,
    onCreateAddon,
    onDeleteOrder,
}: {
    orders: ProjectSalesOrder[];
    project: ProjectDto;
    selectedOrderId: string | null;
    addonAttention: boolean;
    canManageOrders?: boolean;
    onSelectOrder: (orderId: string) => void;
    onCreateAddon: (parentOrderId: string) => void;
    onDeleteOrder?: (order: ProjectSalesOrder) => void;
}) => {
    const navigate = useNavigate();
    const [open, setOpen] = useState(false);
    // Split the flat order list into base orders + addons-by-parent once per list change
    // rather than re-filtering/reducing on every render (including each open toggle).
    const baseOrders = useMemo(() => orders.filter((order) => !order.parentSalesOrderId), [orders]);
    const addonsByParent = useMemo(
        () => orders
            .filter((order) => order.parentSalesOrderId)
            .reduce<Record<string, ProjectSalesOrder[]>>((acc, order) => {
                const parentId = order.parentSalesOrderId || '';
                acc[parentId] = [...(acc[parentId] || []), order];
                return acc;
            }, {}),
        [orders],
    );
    // calculateTotals scans the project's scoped records; compute each order's total
    // once into a lookup instead of recomputing per row (and per selected-order render).
    const totalsByOrderId = useMemo(() => {
        const map = new Map<string, number>();
        orders.forEach((order, index) => {
            map.set(order.id, calculateTotals(project, order, index <= 0, orders).total);
        });
        return map;
    }, [project, orders]);
    const selectedOrder = orders.find((order) => order.id === selectedOrderId) || orders[0] || null;
    const selectedIsAddon = Boolean(selectedOrder?.parentSalesOrderId);
    const selectedBaseId = selectedOrder?.parentSalesOrderId || selectedOrder?.id || baseOrders[0]?.id || '';
    const orderTotal = (order: ProjectSalesOrder) => totalsByOrderId.get(order.id) ?? 0;

    return (
        <div className="relative w-full max-w-md">
            <div className="flex items-stretch gap-2">
                <button
                    type="button"
                    onClick={() => setOpen((value) => !value)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-left shadow-xs transition-colors hover:border-slate-300"
                >
                    <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${selectedIsAddon ? 'bg-amber-100 text-amber-700' : 'bg-[#272f67] text-white'}`}>
                        {selectedIsAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                            <span className="truncate text-[13px] font-bold text-slate-900">{selectedOrder?.orderNumber ? selectedOrder.orderNumber : '-'}</span>
                            <span className={`shrink-0 rounded px-1.5 py-px text-[8.5px] font-semibold uppercase tracking-wide ${selectedIsAddon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                                {selectedIsAddon ? t('projects.addonOrder') : t('projects.mainOrder')}
                            </span>
                            {addonAttention && !selectedIsAddon && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-600" />}
                        </div>
                        <div className="mt-0.5 truncate text-[10.5px] text-slate-400">
                            {selectedOrder ? dayjs(selectedOrder.orderDate || selectedOrder.createdAt).format('DD.MM.YYYY') : ''} · {orders.length} {t('projects.orders')}
                        </div>
                    </div>
                    <ChevronDown size={16} className={`shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                </button>
                <div className="flex shrink-0 flex-col items-end justify-center rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5">
                    <div className="font-mono text-[13px] font-bold text-[#272f67]">{selectedOrder ? money(orderTotal(selectedOrder)) : '-'}</div>
                    <div className="text-[8.5px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.orderTotal')}</div>
                </div>
            </div>

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="absolute inset-x-0 z-30 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
                        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2">
                            <span className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">{t('projects.orders')}</span>
                            <button
                                type="button"
                                onClick={() => { setOpen(false); navigate('/crm/my-orders'); }}
                                className="text-[11px] font-medium text-slate-400 transition-colors hover:text-[#272f67]"
                            >{t('projects.myOrdersCrm')}</button>
                        </div>
                        <div className="max-h-[360px] overflow-y-auto py-1">
                            {baseOrders.map((order) => (
                                <div key={order.id}>
                                    <OrderRow
                                        order={order}
                                        total={orderTotal(order)}
                                        isMain
                                        selected={selectedOrderId === order.id}
                                        attention={addonAttention && selectedOrderId === order.id}
                                        canManage={canManageOrders}
                                        onClick={() => { onSelectOrder(order.id); setOpen(false); }}
                                        onDelete={onDeleteOrder}
                                    />
                                    {(addonsByParent[order.id] || []).map((addon) => (
                                        <OrderRow
                                            key={addon.id}
                                            order={addon}
                                            total={orderTotal(addon)}
                                            selected={selectedOrderId === addon.id}
                                            canManage={canManageOrders}
                                            onClick={() => { onSelectOrder(addon.id); setOpen(false); }}
                                            onDelete={onDeleteOrder}
                                        />
                                    ))}
                                </div>
                            ))}
                        </div>
                        <button
                            type="button"
                            onClick={() => { if (selectedBaseId) onCreateAddon(selectedBaseId); setOpen(false); }}
                            disabled={!selectedBaseId}
                            className="flex w-full items-center gap-2 border-t border-slate-100 px-4 py-3 text-[12.5px] font-semibold text-[#272f67] transition-colors hover:bg-[#eef4ff] disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            <Plus size={15} />{t('projects.createAddonOrder')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

// ERP-style detail header: project identity on the left, the order selector in
// the middle and the primary actions on the right.
export const ProjectDetailHeader = memo(({
    project,
    orders,
    selectedOrder,
    addonAttention,
    canManageOrders,
    deletingProject,
    onSelectOrder,
    onCreateAddon,
    onDeleteOrder,
    onDeleteProject,
    onOpenDetails,
    onComplete,
    onBack,
}: {
    project: ProjectDto;
    orders: ProjectSalesOrder[];
    selectedOrder: ProjectSalesOrder | null;
    addonAttention: boolean;
    canManageOrders?: boolean;
    deletingProject: boolean;
    onSelectOrder: (orderId: string) => void;
    onCreateAddon: (parentOrderId: string) => void;
    onDeleteOrder?: (order: ProjectSalesOrder) => void;
    /** Dişli menüsündeki "Projeyi sil" — onay ("DELETE") popup'tan sonra çağrılır. */
    onDeleteProject: () => Promise<void> | void;
    onOpenDetails: () => void;
    onComplete: () => void;
    onBack: () => void;
}) => {
    const detailsLabel = t('common.detail');
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    return (
        // Başlığın altındaki ayraç çizgisi de kaldırıldı (kullanıcı isteği).
        // Üç sütunlu grid: yan sütunlar eşit (1fr) olduğundan sipariş seçici
        // ÜSTTE ve ekranın TAM ortasında durur (kullanıcı isteği; seçicinin
        // kendisi — kutu + fiyat — olduğu gibi kaldı).
        <div className="mb-4 flex flex-col gap-4 pb-1 lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(auto,28rem)_minmax(0,1fr)] lg:items-center">
            {/* Identity — BÜYÜK proje adı/numarası ve hemen yanında bilgi +
                dişli (kullanıcı isteği); sorumlu kişi satırdan kaldırıldı.
                Altında küçük satırda müşteri + durum. Geri ok yerine sağdaki
                "Projektliste" bağlantısı kullanılır. */}
            <div className="flex min-w-0 flex-col justify-center gap-0.5">
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-[19px] font-bold leading-tight text-slate-900">{project.projectNumber || project.projectName}</span>
                    {/* Bilgi düğmesi dişlinin SOLUNDA (kullanıcı isteği). */}
                    <button
                        type="button"
                        aria-label={detailsLabel}
                        title={detailsLabel}
                        className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#272f67]"
                        onClick={onOpenDetails}
                    >
                        <InfoCircle size={16} strokeWidth={1.9} />
                    </button>
                    {canManageOrders && (settingsLoaded ? (
                        <Suspense fallback={<span className="size-7 shrink-0" />}>
                            <LazyProjectSettingsMenu
                                deleting={deletingProject}
                                onDeleteProject={onDeleteProject}
                                initiallyOpen
                            />
                        </Suspense>
                    ) : (
                        <button
                            type="button"
                            aria-label={t('nav.settings')}
                            title={t('nav.settings')}
                            onClick={() => setSettingsLoaded(true)}
                            className="flex size-7 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#272f67]"
                        >
                            <Settings size={16} />
                        </button>
                    ))}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-slate-600">
                    <span className="inline-flex items-center gap-1"><UserRound size={12} /> {project.customer?.companyName || project.customerId}</span>
                    <ProjectStatusBadge status={project.status} />
                </div>
            </div>

            {/* Order selector — the middle grid column, exactly centered. */}
            <div className="flex items-center justify-center">
                <OrderDropdown
                    orders={orders}
                    project={project}
                    selectedOrderId={selectedOrder?.id || null}
                    addonAttention={addonAttention}
                    canManageOrders={canManageOrders}
                    onSelectOrder={onSelectOrder}
                    onCreateAddon={onCreateAddon}
                    onDeleteOrder={onDeleteOrder}
                />
            </div>

            {/* Actions — tamamlama/durum + sağda ürün listesindeki geri
                düğmesiyle aynı biçimde "Projektliste" bağlantısı. */}
            <div className="flex items-center gap-2 lg:justify-end">
                {project.status === 'COMPLETED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2 text-[13px] font-semibold text-[#059669]">
                        <Check size={26} strokeWidth={3} />
                        {t('projects.complete.projectCompleted')}
                    </span>
                ) : project.status === 'SPECIALLY_CLOSED' ? (
                    <span className="inline-flex items-center gap-1.5 px-2 text-[13px] font-semibold text-[#dc2626]">
                        <AlertTriangle size={18} strokeWidth={2.5} />
                        {t('projects.specialClosure.closedIndicator')}
                    </span>
                ) : (
                    <button
                        type="button"
                        onClick={onComplete}
                        className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        <CheckCircle2 size={14} />
                        {t('projects.complete.completeProject')}
                    </button>
                )}
                <button
                    type="button"
                    onClick={onBack}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                >
                    <ArrowLeft size={14} />
                    {t('projects.projectList')}
                </button>
            </div>
        </div>
    );
});
