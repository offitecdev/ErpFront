import { lazy, Suspense, type ReactNode } from 'react';

import { PackagePlus } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import type { calculateTotals } from '../../utils/projectTotals';
import type { ProjectDetailView } from '../../types/projectDetailNavigation';
import { ProjectOverviewTab } from './tabs/ProjectOverviewTab';

const LazyDeliveryReportsTab = lazy(() =>
    import('../../projects/components/delivery/DeliveryReportsTab').then((module) => ({ default: module.DeliveryReportsTab })),
);
const LazyProjectSignaturesTab = lazy(() =>
    import('../../../ProjectSignaturesTab').then((module) => ({ default: module.ProjectSignaturesTab })),
);
const LazyProjectPositionsTab = lazy(() =>
    import('../../../ProjectPositionsTab').then((module) => ({ default: module.ProjectPositionsTab })),
);
const LazyBookingSection = lazy(() =>
    import('./booking/BookingSection').then((module) => ({ default: module.BookingSection })),
);
const LazyAddonOrderOverview = lazy(() =>
    import('./tabs/AddonOrderOverview').then((module) => ({ default: module.AddonOrderOverview })),
);
const LazyBillingTab = lazy(() =>
    import('./tabs/BillingTab').then((module) => ({ default: module.BillingTab })),
);
const LazyCreateAddonOrderTab = lazy(() =>
    import('./tabs/CreateAddonOrderTab').then((module) => ({ default: module.CreateAddonOrderTab })),
);
const LazyCostsTab = lazy(() =>
    import('./tabs/CostsTab').then((module) => ({ default: module.CostsTab })),
);
const LazyGeneralReportTab = lazy(() =>
    import('./tabs/GeneralReportTab').then((module) => ({ default: module.GeneralReportTab })),
);
const LazyMaterialsTab = lazy(() =>
    import('./tabs/MaterialsTab').then((module) => ({ default: module.MaterialsTab })),
);
const LazyReportsTab = lazy(() =>
    import('./tabs/ReportsTab').then((module) => ({ default: module.ReportsTab })),
);

const deferredSection = (content: ReactNode) => (
    <Suspense
        fallback={(
            <div className="space-y-3" aria-busy="true">
                <div className="h-10 animate-pulse rounded-md bg-slate-100" />
                <div className="h-64 animate-pulse rounded-md bg-slate-100" />
            </div>
        )}
    >
        {content}
    </Suspense>
);

// Single place that maps the workflow navigation (section + subSection) to the
// content components. The leaf components themselves stay navigation-agnostic.
export type RenderSectionArgs = {
    view: ProjectDetailView;
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    isPrimary: boolean;
    isAddon: boolean;
    totals: ReturnType<typeof calculateTotals>;
    materials: ProjectMaterial[];
    mailSettings: MailSettingDto | null;
    userEmail: string;
    awaitingAppointments: any[];
    addonAttention: boolean;
    canCreateAddon: boolean;
    onNavigate: (view: ProjectDetailView) => void;
    onSelectOrder: (orderId: string) => void;
    onReload: () => Promise<void>;
    onOrderCreated: (orderId: string) => Promise<void>;
};

export const renderProjectSection = (args: RenderSectionArgs): ReactNode => {
    const {
        view, project, order, orders, isPrimary, isAddon, totals, materials,
        mailSettings, userEmail, awaitingAppointments, addonAttention, canCreateAddon,
        onNavigate, onSelectOrder, onReload, onOrderCreated,
    } = args;

    const goFieldReports = () => onNavigate({ section: 'field', subSection: 'fieldReports' });

    // Add-on orders only expose their cost summary and billing; every other section
    // is not applicable, so the navigation stays visible with an explanatory state.
    if (isAddon) {
        if (view.section === 'overview' && order) {
            return deferredSection(
                <LazyAddonOrderOverview project={project} order={order} isPrimary={isPrimary} totals={totals} />,
            );
        }
        if (view.section === 'billing') {
            return deferredSection(<LazyBillingTab project={project} orders={orders} onReload={onReload} />);
        }
        return (
            <EmptyState
                icon={<PackagePlus size={28} />}
                title={t('auto.ek_siparis')}
                description={t('auto.ek_siparis_bolum_uygun_degil')}
            />
        );
    }

    switch (view.section) {
        case 'overview':
            return (
                <ProjectOverviewTab
                    project={project}
                    order={order}
                    orders={orders}
                    isPrimary={isPrimary}
                    awaitingAppointments={awaitingAppointments}
                    addonAttention={addonAttention}
                    onNavigate={onNavigate}
                    onSelectOrder={onSelectOrder}
                />
            );
        case 'positions':
            return deferredSection(<LazyProjectPositionsTab project={project} />);
        case 'planning':
            return deferredSection(
                <LazyBookingSection
                    project={project}
                    order={order}
                    isPrimary={isPrimary}
                    materials={materials}
                    settings={mailSettings}
                    userEmail={userEmail}
                    onSaved={onReload}
                    leaf={view.subSection === 'appointmentMail' ? 'mail' : 'schedule'}
                />,
            );
        case 'field':
            if (view.subSection === 'generalReport') {
                return deferredSection(
                    <LazyGeneralReportTab project={project} onGoFieldReports={goFieldReports} />,
                );
            }
            if (view.subSection === 'delivery') {
                return deferredSection(<LazyDeliveryReportsTab project={project} order={order} />);
            }
            if (view.subSection === 'signatures') {
                return deferredSection(
                    <LazyProjectSignaturesTab project={project} order={order} isPrimary={isPrimary} />,
                );
            }
            return deferredSection(
                <LazyReportsTab
                    project={project}
                    order={order}
                    isPrimary={isPrimary}
                    materials={materials}
                    onSaved={onReload}
                />,
            );
        case 'costs':
            if (view.subSection === 'materials') {
                return deferredSection(
                    <LazyMaterialsTab
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        materials={materials}
                        onSaved={onReload}
                        onGoFieldReports={goFieldReports}
                    />,
                );
            }
            if (view.subSection === 'overtime') {
                return deferredSection(
                    <LazyBookingSection
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        materials={materials}
                        settings={mailSettings}
                        userEmail={userEmail}
                        onSaved={onReload}
                        leaf="overtime"
                    />,
                );
            }
            return deferredSection(
                <LazyCostsTab
                    project={project}
                    order={order}
                    isPrimary={isPrimary}
                    onGoFieldReports={goFieldReports}
                />,
            );
        case 'billing':
            return deferredSection(<LazyBillingTab project={project} orders={orders} onReload={onReload} />);
        case 'addons':
            return deferredSection(
                <LazyCreateAddonOrderTab
                    project={project}
                    order={order}
                    orders={orders}
                    canCreate={canCreateAddon}
                    onChanged={onReload}
                    onCreated={onOrderCreated}
                />,
            );
        default:
            return null;
    }
};
