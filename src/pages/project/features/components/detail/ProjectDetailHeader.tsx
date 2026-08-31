import { lazy, memo, Suspense, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AlertTriangle,
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
import { ProjectStatusChip } from './tabs/overview/overviewChips';
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
        <div className="ofi-prj-menu__item">
            <button
                type="button"
                onClick={onClick}
                className={`ofi-prj-menu__row ${selected ? 'is-selected' : ''} ${isMain ? '' : 'is-addon'}`}
            >
                <span className={`ofi-prj-order__mark ${isMain ? '' : 'is-addon'}`}>
                    {isMain ? <ReceiptText size={14} /> : <Plus size={14} />}
                </span>
                <span className="ofi-prj-order__main">
                    <span className="ofi-prj-order__num">
                        <span>{order.orderNumber}</span>
                        <span className={`ofi-prj-tag ${isMain ? 'is-main' : 'is-addon'}`}>
                            {isMain ? t('projects.mainOrder') : t('projects.addonOrder')}
                        </span>
                        {attention && <span className="ofi-prj-dot" />}
                    </span>
                    <span className="ofi-prj-order__meta">
                        {dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}
                    </span>
                </span>
                <span className="ofi-prj-menu__amount">{money(total)}</span>
            </button>

            {deletable && (
                <button
                    type="button"
                    aria-label={t('projects.deleteOrder')}
                    title={t('projects.deleteOrder')}
                    onClick={() => onDelete!(order)}
                    className="ofi-prj-glyph"
                >
                    <Trash01 size={15} />
                </button>
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
        <div className="ofi-prj-picker">
            {/* One quiet pill: the order, its date and its total — the only
                chrome is a hairline, the way the calendar's controls look. */}
            <button
                type="button"
                aria-expanded={open}
                onClick={() => setOpen((value) => !value)}
                className={`ofi-prj-order ${open ? 'is-open' : ''}`}
            >
                <span className={`ofi-prj-order__mark ${selectedIsAddon ? 'is-addon' : ''}`}>
                    {selectedIsAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                </span>
                <span className="ofi-prj-order__main">
                    <span className="ofi-prj-order__num">
                        <span>{selectedOrder?.orderNumber ? selectedOrder.orderNumber : '-'}</span>
                        <span className={`ofi-prj-tag ${selectedIsAddon ? 'is-addon' : 'is-main'}`}>
                            {selectedIsAddon ? t('projects.addonOrder') : t('projects.mainOrder')}
                        </span>
                        {addonAttention && !selectedIsAddon && <span className="ofi-prj-dot" />}
                    </span>
                    <span className="ofi-prj-order__meta">
                        {selectedOrder ? dayjs(selectedOrder.orderDate || selectedOrder.createdAt).format('DD.MM.YYYY') : ''} · {orders.length} {t('projects.orders')}
                    </span>
                </span>
                <span className="ofi-prj-order__sum">
                    <span className="ofi-prj-order__amount">{selectedOrder ? money(orderTotal(selectedOrder)) : '-'}</span>
                    <span className="ofi-prj-order__label">{t('projects.orderTotal')}</span>
                </span>
                <ChevronDown size={16} className="ofi-prj-order__chev" />
            </button>

            {open && (
                <>
                    <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />
                    <div className="ofi-prj-menu">
                        <div className="ofi-prj-menu__head">
                            <span>{t('projects.orders')}</span>
                            <button
                                type="button"
                                onClick={() => { setOpen(false); navigate('/sales/orders'); }}
                                className="ofi-prj-menu__link"
                            >{t('projects.myOrdersCrm')}</button>
                        </div>
                        <div className="ofi-prj-menu__list">
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
                            className="ofi-prj-menu__foot"
                        >
                            <Plus size={15} />{t('projects.createAddonOrder')}
                        </button>
                    </div>
                </>
            )}
        </div>
    );
};

/**
 * Detail header, Google-clean (19.08.2026): project identity on the left, the
 * order selector exactly centred, the actions on the right. There is no fill
 * and no coloured block up here — a hairline, quiet grey type and the brand
 * navy as the single accent, all of it painted from the `--ofi-cal-*` tokens
 * so dark mode is a variable swap.
 */
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
}) => {
    const detailsLabel = t('common.detail');
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    return (
        // Kein Trennstrich unter dem Kopf (Benutzerwunsch) und weiterhin drei
        // gleich breite Spalten, damit der Auftragswähler mittig steht.
        <div className="ofi-prj-head">
            {/* Identität — grosse Projektnummer, daneben Info und Zahnrad als
                runde, randlose Symbolknöpfe; darunter Kunde und Zustand. */}
            <div className="min-w-0">
                <div className="ofi-prj-head__id">
                    <span className="ofi-prj-head__num">{project.projectNumber || project.projectName}</span>
                    {/* Bilgi düğmesi dişlinin SOLUNDA (kullanıcı isteği). */}
                    <button
                        type="button"
                        aria-label={detailsLabel}
                        title={detailsLabel}
                        className="ofi-prj-glyph"
                        onClick={onOpenDetails}
                    >
                        <InfoCircle size={17} strokeWidth={1.8} />
                    </button>
                    {canManageOrders && (settingsLoaded ? (
                        <Suspense fallback={<span className="size-8 shrink-0" />}>
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
                            className="ofi-prj-glyph"
                        >
                            <Settings size={16} />
                        </button>
                    ))}
                </div>
                <div className="ofi-prj-head__sub">
                    <span className="ofi-prj-head__cust">
                        <UserRound size={13} />
                        <span>{project.customer?.companyName || project.customerId}</span>
                    </span>
                    <ProjectStatusChip status={project.status} />
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

            {/* Aktionen — Abschluss bzw. Zustand des Projekts. Der Weg zurück
                zur Projektliste stand hier daneben; er sitzt jetzt im Blitz
                ganz vorn in der Kopfleiste, der auf jeder Unterseite zum Pfeil
                wird (QuickBackButton). */}
            <div className="ofi-prj-head__actions">
                {project.status === 'COMPLETED' ? (
                    <span className="ofi-prj-head__state is-done">
                        <Check size={17} strokeWidth={3} />
                        {t('projects.complete.projectCompleted')}
                    </span>
                ) : project.status === 'SPECIALLY_CLOSED' ? (
                    <span className="ofi-prj-head__state is-closed">
                        <AlertTriangle size={16} strokeWidth={2.4} />
                        {t('projects.specialClosure.closedIndicator')}
                    </span>
                ) : (
                    <button type="button" onClick={onComplete} className="ofi-prj-btn is-primary">
                        <CheckCircle2 size={15} />
                        {t('projects.complete.completeProject')}
                    </button>
                )}
            </div>
        </div>
    );
});
