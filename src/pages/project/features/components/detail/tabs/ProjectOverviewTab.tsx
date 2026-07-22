import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import {
    Building02,
    CalendarCheck01 as CalendarClock,
    Clipboard as ClipboardPenLine,
    Coins01 as Wallet,
    Mail01 as Mail,
    MarkerPin01,
    PackagePlus,
    Phone,
    Receipt as ReceiptText,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { localizeTenderNumber, localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { InfoCard } from '../../common/InfoCard';
import { ContactRow } from '../ContactRow';
import { ProjectStatusBadge } from '../../common/ProjectStatusBadge';
import { scopedRecords } from '../../../utils/projectOrderScope';
import type { ProjectDetailView } from '../../../types/projectDetailNavigation';
import { viewForSection } from '../../../types/projectDetailNavigation';
import { useOrderBillingSummaries } from '../../../hooks/useOrderBillingSummaries';
import { useProjectDeliveryReports } from '../../../hooks/useProjectDeliveryReports';
import { ProjectOrdersExplorer } from './overview/ProjectOrdersExplorer';
import { ProjectNotificationsCard } from './overview/ProjectNotificationsCard';
import { QuickAccessMenu } from './overview/QuickAccessMenu';
import { SectionCard } from './overview/SectionCard';

// CRM-overview style project overview: a gold-glass notification box, quick
// links into the top menu, and the three-part orders overview — each concern in
// its own box.
export const ProjectOverviewTab = memo(({
    project,
    order,
    orders,
    isPrimary,
    awaitingAppointments,
    addonAttention,
    onNavigate,
    onSelectOrder,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    isPrimary: boolean;
    awaitingAppointments: any[];
    addonAttention: boolean;
    onNavigate: (view: ProjectDetailView) => void;
    onSelectOrder: (orderId: string) => void;
}) => {
    const { byOrderId: deliveryByOrderId, reports: deliveryReports } = useProjectDeliveryReports(project.id);
    const { summaries: billingSummaries } = useOrderBillingSummaries(orders);

    const reports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const unsignedReports = useMemo(() => reports.filter((report: any) => !report.isSigned), [reports]);
    const unsignedDeliveries = useMemo(() => deliveryReports.filter((row) => !row.isSigned), [deliveryReports]);

    // Critical items that must not be buried inside a card.
    const attention: Array<{ key: string; label: string; onClick: () => void }> = [];
    if (awaitingAppointments.length > 0) {
        attention.push({
            key: 'field',
            label: `${t('projects.technicianNotFinished')} (${awaitingAppointments.length})`,
            onClick: () => onNavigate({ section: 'planning', subSection: 'appointments' }),
        });
    }
    if (addonAttention) {
        attention.push({ key: 'addon', label: t('projects.addonRequestAttention'), onClick: () => onNavigate(viewForSection('addons')) });
    }

    return (
        <div className="space-y-4">
            {/* Notification box: critical work + pending signatures, gold glass. */}
            <ProjectNotificationsCard
                attention={attention}
                unsignedReports={unsignedReports}
                unsignedDeliveries={unsignedDeliveries}
                onNavigate={onNavigate}
            />

            {/* Quick access: direct links into the top-menu sections. */}
            <QuickAccessMenu
                onNavigate={onNavigate}
                items={[
                    { key: 'planning', label: t('auto.planlama'), icon: <CalendarClock size={12} />, view: { section: 'planning', subSection: 'appointments' } },
                    { key: 'reports', label: t('projects.fieldReport'), icon: <ClipboardPenLine size={12} />, view: { section: 'field', subSection: 'fieldReports' } },
                    { key: 'costs', label: t('auto.maliyet_ve_malzemeler'), icon: <ReceiptText size={12} />, view: { section: 'costs', subSection: 'expenses' } },
                    { key: 'billing', label: t('projects.flow.billing'), icon: <Wallet size={12} />, view: { section: 'billing' } },
                    { key: 'addons', label: t('projects.addonOrder'), icon: <PackagePlus size={12} />, view: viewForSection('addons') },
                ]}
            />

            {/* Orders overview: grand total · order checklist · selection detail. */}
            <ProjectOrdersExplorer
                project={project}
                orders={orders}
                deliveryByOrderId={deliveryByOrderId}
                billingSummaries={billingSummaries}
                onSelectOrder={onSelectOrder}
                onNavigate={onNavigate}
            />

            {/* Identity: project info and customer contact, separate cards. */}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <InfoCard title={t('projects.projectInfo')} rows={[
                    [t('projects.order'), order?.orderNumber ? localizeTenderNumbersInText(order.orderNumber) : '-'],
                    [t('projects.tender'), localizeTenderNumber(order?.tender?.tenderNumber || project.tender?.tenderNumber || '') || order?.tenderId || project.tenderId || '-'],
                    [t('projects.manager'), project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '-'],
                    [t('common.start'), project.startDate ? dayjs(project.startDate).format('DD.MM.YYYY') : '-'],
                    [t('common.end'), project.endDate ? dayjs(project.endDate).format('DD.MM.YYYY') : '-'],
                    [t('common.status'), <ProjectStatusBadge status={project.status} />],
                ]} />
                <SectionCard title={t('projects.customerContact')} icon={<Building02 size={14} />}>
                    <div className="space-y-2.5 text-[12.5px]">
                        <div className="font-semibold text-slate-800">{project.customer?.companyName || project.customerId}</div>
                        <ContactRow icon={<Mail size={13} />} value={project.customer?.mainEmail} href={project.customer?.mainEmail ? `mailto:${project.customer.mainEmail}` : undefined} />
                        <ContactRow icon={<Phone size={13} />} value={project.customer?.mainPhone} href={project.customer?.mainPhone ? `tel:${project.customer.mainPhone}` : undefined} />
                        <ContactRow icon={<MarkerPin01 size={13} />} value={project.customer?.address} />
                    </div>
                </SectionCard>
            </div>
        </div>
    );
});
