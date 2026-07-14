import { memo, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    AlertTriangle,
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    Check,
    CheckCircle as CheckCircle2,
    ChevronDown,
    InfoCircle,
    Plus,
    Receipt as ReceiptText,
    Trash01,
    User01 as UserRound,
} from '@/components/icons/antIconCompat';

import { Button } from '@/components/ui-shared/Button';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { money } from '../../utils/projectFormatters';
import { ProjectStatusBadge } from '../common/ProjectStatusBadge';
import { ProjectFlowStatusBadges } from './ProjectFlowStatusBadges';
import { calculateTotals } from '../../utils/projectTotals';

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
                        <span className={`truncate text-[13px] font-semibold ${selected ? 'text-[#272f67]' : 'text-slate-800'}`}>{localizeTenderNumbersInText(order.orderNumber)}</span>
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
                            <span className="truncate text-[13px] font-bold text-slate-900">{selectedOrder?.orderNumber ? localizeTenderNumbersInText(selectedOrder.orderNumber) : '-'}</span>
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

// ERP-style detail header: project identity on the left, the order selector in the
// middle and the primary actions on the right.
export const ProjectDetailHeader = memo(({
    project,
    orders,
    selectedOrder,
    addonAttention,
    canManageOrders,
    onSelectOrder,
    onCreateAddon,
    onDeleteOrder,
    onOpenDetails,
    onComplete,
    onBack,
}: {
    project: ProjectDto;
    orders: ProjectSalesOrder[];
    selectedOrder: ProjectSalesOrder | null;
    addonAttention: boolean;
    canManageOrders?: boolean;
    onSelectOrder: (orderId: string) => void;
    onCreateAddon: (parentOrderId: string) => void;
    onDeleteOrder?: (order: ProjectSalesOrder) => void;
    onOpenDetails: () => void;
    onComplete: () => void;
    onBack: () => void;
}) => {
    const detailsLabel = t('common.detail');
    return (
        <div className="mb-5 flex flex-col gap-4 border-b border-slate-200/60 pb-4 lg:flex-row lg:items-stretch lg:justify-between">
            {/* Identity: name + status, then customer / manager / created date. */}
            <div className="flex min-w-0 flex-col justify-between gap-2">
                <h1 className="flex flex-wrap items-center gap-3 text-[20px] font-semibold tracking-tight text-slate-900">
                    <span className="truncate">{localizeTenderNumbersInText(project.projectName)}</span>
                    <ProjectStatusBadge status={project.status} />
                    <ProjectFlowStatusBadges project={project} />
                </h1>
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px] text-slate-500">
                    <span className="inline-flex items-center gap-1"><UserRound size={11} /> {project.customer?.companyName || project.customerId}</span>
                    {project.manager && (
                        <span className="inline-flex items-center gap-1"><BriefcaseBusiness size={11} /> {project.manager.firstName} {project.manager.lastName}</span>
                    )}
                    <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {dayjs(project.createdAt).format('DD.MM.YYYY')}</span>
                </div>
            </div>

            {/* Order selector, vertically centered between the info block and actions. */}
            <div className="flex items-center justify-center lg:flex-1">
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

            {/* Actions. */}
            <div className="flex items-center gap-2 self-start lg:self-center">
                <button
                    type="button"
                    aria-label={detailsLabel}
                    title={detailsLabel}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#272f67] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#272f67]"
                    onClick={onOpenDetails}
                >
                    <InfoCircle size={17} strokeWidth={1.9} />
                </button>
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
                    <Button
                        variant="primary"
                        icon={<CheckCircle2 size={13} />}
                        onClick={onComplete}
                    >{t('projects.complete.completeProject')}</Button>
                )}
                <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={onBack}>{t('projects.backToList')}</Button>
            </div>
        </div>
    );
});
