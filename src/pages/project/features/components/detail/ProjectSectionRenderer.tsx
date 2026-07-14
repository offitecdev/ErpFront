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
import { ProjectActionDashboard } from './ProjectActionDashboard';
import { ProjectOverviewTab } from './tabs/ProjectOverviewTab';
import { AddonOrderOverview } from './tabs/AddonOrderOverview';
import { CreateAddonOrderTab } from './tabs/CreateAddonOrderTab';
import { CostsTab } from './tabs/CostsTab';
import { MaterialsTab } from './tabs/MaterialsTab';
import { ReportsTab } from './tabs/ReportsTab';
// BookingSection still lives in ProjectDetail.tsx; the reference is only resolved at
// React render time, so this back-import is safe despite the module cycle.
import { BookingSection } from '../../../ProjectDetail';

// Single place that maps the new workflow navigation (section + subSection) to the
// existing content components. This replaces the old flat 8-tab switch; the leaf
// components themselves are untouched.
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
    onReload: () => Promise<void>;
    onOrderCreated: (orderId: string) => Promise<void>;
};

export const renderProjectSection = (args: RenderSectionArgs): React.ReactNode => {
    const {
        view, project, order, orders, isPrimary, isAddon, totals, materials,
        mailSettings, userEmail, awaitingAppointments, addonAttention, canCreateAddon,
        onNavigate, onReload, onOrderCreated,
    } = args;

    // Add-on orders only expose their cost summary; every other section is not
    // applicable, so the navigation stays visible but shows an explanatory state.
    if (isAddon) {
        if (view.section === 'overview' && order) {
            return <AddonOrderOverview project={project} order={order} isPrimary={isPrimary} totals={totals} />;
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
                <div className="space-y-5">
                    <ProjectActionDashboard
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        totals={totals}
                        awaitingAppointments={awaitingAppointments}
                        addonAttention={addonAttention}
                        onNavigate={onNavigate}
                    />
                    <ProjectOverviewTab
                        project={project}
                        order={order}
                        isPrimary={isPrimary}
                        onGoReports={() => onNavigate({ section: 'field', subSection: 'fieldReports' })}
                    />
                </div>
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
            if (view.subSection === 'delivery') {
                return <DeliveryReportsTab project={project} order={order} />;
            }
            if (view.subSection === 'signatures') {
                return <ProjectSignaturesTab project={project} order={order} isPrimary={isPrimary} />;
            }
            return <ReportsTab project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onReload} />;
        case 'costs':
            if (view.subSection === 'materials') {
                return <MaterialsTab project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onReload} />;
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
            return <CostsTab project={project} order={order} isPrimary={isPrimary} onSaved={onReload} />;
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
