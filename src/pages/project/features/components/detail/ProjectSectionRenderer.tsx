import type React from 'react';

import { PackagePlus } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import type { calculateTotals } from '../../utils/projectTotals';
import type { ProjectDetailView } from '../../types/projectDetailNavigation';
import { DeliveryReportsTab } from '../../projects/components/delivery/DeliveryReportsTab';
import { ProjectSignaturesTab } from '../../../ProjectSignaturesTab';
import { ProjectPositionsTab } from '../../../ProjectPositionsTab';
import { BookingSection } from './booking/BookingSection';
import { ProjectOverviewTab } from './tabs/ProjectOverviewTab';
import { AddonOrderOverview } from './tabs/AddonOrderOverview';
import { BillingTab } from './tabs/BillingTab';
import { CreateAddonOrderTab } from './tabs/CreateAddonOrderTab';
import { CostsTab } from './tabs/CostsTab';
import { GeneralReportTab } from './tabs/GeneralReportTab';
import { MaterialsTab } from './tabs/MaterialsTab';
import { ReportsTab } from './tabs/ReportsTab';

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

export const renderProjectSection = (args: RenderSectionArgs): React.ReactNode => {
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
            return <AddonOrderOverview project={project} order={order} isPrimary={isPrimary} totals={totals} />;
        }
        if (view.section === 'billing') {
            return <BillingTab project={project} orders={orders} onReload={onReload} />;
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
            return <ProjectPositionsTab project={project} />;
        case 'planning':
            return (
                <BookingSection
                    project={project}
                    order={order}
                    isPrimary={isPrimary}
                    materials={materials}
                    settings={mailSettings}
                    userEmail={userEmail}
                    onSaved={onReload}
                    leaf={view.subSection === 'appointmentMail' ? 'mail' : 'schedule'}
                />
            );
        case 'field':
            if (view.subSection === 'generalReport') {
                return <GeneralReportTab project={project} onGoFieldReports={goFieldReports} />;
            }
            if (view.subSection === 'delivery') {
                return <DeliveryReportsTab project={project} order={order} />;
            }
            if (view.subSection === 'signatures') {
                return <ProjectSignaturesTab project={project} order={order} isPrimary={isPrimary} />;
            }
            return <ReportsTab project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onReload} />;
        case 'costs':
            if (view.subSection === 'materials') {
                return (
                    <MaterialsTab
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        materials={materials}
                        onSaved={onReload}
                        onGoFieldReports={goFieldReports}
                    />
                );
            }
            if (view.subSection === 'overtime') {
                return (
                    <BookingSection
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        materials={materials}
                        settings={mailSettings}
                        userEmail={userEmail}
                        onSaved={onReload}
                        leaf="overtime"
                    />
                );
            }
            return <CostsTab project={project} order={order} isPrimary={isPrimary} onGoFieldReports={goFieldReports} />;
        case 'billing':
            return <BillingTab project={project} orders={orders} onReload={onReload} />;
        case 'addons':
            return (
                <CreateAddonOrderTab
                    project={project}
                    order={order}
                    orders={orders}
                    canCreate={canCreateAddon}
                    onChanged={onReload}
                    onCreated={onOrderCreated}
                />
            );
        default:
            return null;
    }
};
