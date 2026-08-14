import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import {
    AlertTriangle,
    Clipboard as ClipboardPenLine,
    FileDownload02 as FileDown,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { BillingSummaryDto } from '@/types/billing';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { scopedRecords } from '../../../utils/projectOrderScope';
import type { ProjectDetailView } from '../../../types/projectDetailNavigation';
import { viewForSection } from '../../../types/projectDetailNavigation';
import { calculateTotals, getPendingAddonSummary } from '../../../utils/projectTotals';
import { displayOperationsDone } from '../../../utils/projectFormatters';
import { useOrderBillingSummaries } from '../../../hooks/useOrderBillingSummaries';
import { useProjectDeliveryReports } from '../../../hooks/useProjectDeliveryReports';
import { AddonOrdersBox, type AddonRow } from './overview/AddonOrdersBox';
import { CommissionsBox } from './overview/CommissionsBox';
import { DeliveryStatusBox } from './overview/DeliveryStatusBox';
import { OrderHeaderTable } from './overview/OrderHeaderTable';
import type { OrderNotification } from './overview/OrderNotifications';
import { OrderSummaryTable } from './overview/OrderSummaryTable';
import { OverviewPieCharts } from './overview/OverviewPieCharts';
import { ProjectAddressLine } from './overview/ProjectAddressLine';
import { deliveryReportsForOrder } from './overview/overviewShared';

/** A summary only exists for real sales orders; the synthetic main order has none. */
const summaryFor = (order: ProjectSalesOrder, summaries: Record<string, BillingSummaryDto | null>) =>
    order.id.startsWith('project-main-') ? null : summaries[order.id] || null;

const reportEmployeeName = (report: any) =>
    report?.employee ? `${report.employee.firstName || ''} ${report.employee.lastName || ''}`.trim() : '';

/**
 * The overview of ONE order — the selected order and the add-on orders hanging
 * off it. Nothing on this screen is project-wide:
 *
 *   1) the header bar — order, status, total, and the bell whose notifications
 *      play as single pop-ups at the bottom of the screen;
 *   2) the order summary — two short fact tables: what the order contains and
 *      when it runs, what it is worth and where it stands;
 *   3) the add-on orders of this order, including extra work that still needs
 *      one, beside the two donuts and the delivery-report yes/no table.
 */
export const ProjectOverviewTab = memo(({
    project,
    order,
    orders,
    isPrimary,
    awaitingAppointments,
    addonAttention,
    canCreateAddon,
    onNavigate,
    onOrderCreated,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    isPrimary: boolean;
    awaitingAppointments: any[];
    addonAttention: boolean;
    canCreateAddon: boolean;
    onNavigate: (view: ProjectDetailView) => void;
    onOrderCreated: (orderId: string) => Promise<void>;
}) => {
    const { byOrderId: deliveryByOrderId } = useProjectDeliveryReports(project.id);
    const { summaries: billingSummaries } = useOrderBillingSummaries(orders);

    // Extra work captured on this order after its latest add-on, plus the add-ons
    // themselves — this is what scopes the whole screen to a single order.
    const pending = useMemo(() => getPendingAddonSummary(project, order, orders), [project, order, orders]);
    const pendingCount = pending.pendingExpenses.length
        + pending.pendingExtraMaterials.length
        + pending.pendingReports.filter((report: any) => Number(report.overtimeCost) > 0).length;

    const selectedTotal = useMemo(
        () => calculateTotals(project, order, isPrimary, orders).total,
        [project, order, isPrimary, orders],
    );
    const orderDeliveries = useMemo(
        () => deliveryReportsForOrder(order, deliveryByOrderId),
        [order, deliveryByOrderId],
    );

    // ── Notifications — everything here is already narrowed to this order, so
    // the count never includes a sibling order's open work. ──────────────────
    const notifications = useMemo<OrderNotification[]>(() => {
        const items: OrderNotification[] = [];
        if (awaitingAppointments.length > 0) {
            items.push({
                key: 'field',
                critical: true,
                title: `${t('projects.technicianNotFinished')} (${awaitingAppointments.length})`,
                tag: t('projects.attentionRequired'),
                icon: <AlertTriangle size={16} />,
                onOpen: () => onNavigate({ section: 'planning', subSection: 'appointments' }),
            });
        }
        if (addonAttention) {
            items.push({
                key: 'addon',
                critical: true,
                title: t('projects.addonRequestAttention'),
                tag: t('projects.attentionRequired'),
                icon: <AlertTriangle size={16} />,
                onOpen: () => onNavigate(viewForSection('addons')),
            });
        }
        scopedRecords(project.reports, order, isPrimary, project.salesOrders)
            .filter((report: any) => !report.isSigned)
            .forEach((report: any) => items.push({
                key: `report-${report.id}`,
                title: reportEmployeeName(report) || t('auto.teknisyen'),
                tag: t('auto.imza_bekliyor'),
                subtitle: `${dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · ${t('projects.fieldReport')}${report.operationsDone ? ` · ${displayOperationsDone(report.operationsDone)}` : ''}`,
                icon: <ClipboardPenLine size={16} />,
                onOpen: () => onNavigate({ section: 'field', subSection: 'signatures' }),
            }));
        orderDeliveries
            .filter((report) => !report.isSigned)
            .forEach((report) => items.push({
                key: `delivery-${report.id}`,
                title: report.checklistName || t('projects.delivery.tab'),
                tag: t('projects.delivery.statusUnsigned'),
                subtitle: dayjs(report.createdAt).format('DD.MM.YYYY'),
                icon: <FileDown size={16} />,
                onOpen: () => onNavigate({ section: 'field', subSection: 'delivery' }),
            }));
        return items;
    }, [
        awaitingAppointments, addonAttention, project.reports, project.salesOrders,
        order, isPrimary, orderDeliveries, onNavigate,
    ]);

    // ── This order's add-ons ────────────────────────────────────────────────
    const addonRows = useMemo<AddonRow[]>(() => pending.addons.map((addon) => {
        const summary = summaryFor(addon, billingSummaries);
        // An add-on never carries the base budget, so it is never the primary order.
        const cost = calculateTotals(project, addon, false, orders).total;
        const billed = Number(summary?.billedAmount) || 0;
        return {
            order: addon,
            cost,
            billed,
            remaining: summary ? Number(summary.remainingAmount) || 0 : Math.max(0, cost - billed),
            summary,
        };
    }), [pending.addons, billingSummaries, project, orders]);

    // ── The two money stories, kept apart on purpose: the order's own figures,
    // and everything its add-ons added on top. ──────────────────────────────
    const orderSummary = order ? summaryFor(order, billingSummaries) : null;
    const orderBilled = Number(orderSummary?.billedAmount) || 0;
    const orderFigures = {
        billed: orderBilled,
        unbilled: orderSummary
            ? Number(orderSummary.remainingAmount) || 0
            : Math.max(0, selectedTotal - orderBilled),
    };
    const addonFigures = {
        billed: addonRows.reduce((sum, row) => sum + row.billed, 0),
        unbilled: addonRows.reduce((sum, row) => sum + row.remaining, 0),
    };

    // Wie viele VERSCHIEDENE Kommissionen hängen am Projekt? Bei genau einer
    // reicht die Kopfzeile; die separate Liste bliebe eine Wiederholung.
    const distinctCommissions = useMemo(
        () => new Set(
            orders
                .map((candidate) => (candidate.tender?.commissionNumber || '').trim())
                .filter(Boolean),
        ).size,
        [orders],
    );

    return (
        <div className="space-y-3">
            {/* Projektadresse ganz oben, als eigene Zeile (Benutzerwunsch). */}
            <ProjectAddressLine project={project} order={order} />
            <OrderHeaderTable project={project} order={order} notifications={notifications} />

            {/* Two narrow columns: the order's own figures on the left, what its
                add-ons and reports say on the right. */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                <div className="flex flex-col gap-3">
                    <OrderSummaryTable
                        total={selectedTotal}
                        summary={orderSummary}
                        deliveryRows={orderDeliveries}
                    />
                    <AddonOrdersBox
                        project={project}
                        parentOrder={pending.parentOrder}
                        rows={addonRows}
                        pendingTotal={pending.total}
                        pendingCount={pendingCount}
                        canCreate={canCreateAddon}
                        onCreated={onOrderCreated}
                    />
                </div>
                {/* Two boxes stacked vertically — the delivery one deliberately the
                    smaller of the pair, since it answers a single yes/no. */}
                <div className="flex flex-col gap-3">
                    <OverviewPieCharts order={orderFigures} addons={addonFigures} />
                    <DeliveryStatusBox reports={orderDeliveries} />
                    {/* Die Kommission steht bereits in der Kopfzeile neben Kunde und
                        Auftrag. Diese Liste erscheint nur, wenn das Projekt WIRKLICH
                        mehrere verschiedene Kommissionen trägt (Benutzerwunsch:
                        eine einzelne Kommission wird nicht doppelt gezeigt). */}
                    {distinctCommissions > 1 && <CommissionsBox orders={orders} />}
                </div>
            </div>
        </div>
    );
});
