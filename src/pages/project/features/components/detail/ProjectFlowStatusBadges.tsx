import { useEffect, useState } from 'react';
import type React from 'react';

import { CurrencyDollar, Wrench } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ProjectDto } from '@/types/project';
import { deliveryReportApi } from '@/lib/api/project';
import { billingApi, myOrdersApi } from '@/lib/api/billing';
import { computeProjectFlow, type StageState } from '@/lib/projectFlow';

// Technical + Billing completion at a glance, shown next to the project status in
// the detail header. Each stage is a hollow gray outline until it is completed,
// then it fills in: light blue for Technical, golden yellow for Billing. Mirrors
// the Technical/Billing state used on the project list and completion modal.
const FlowBadge = ({
    icon,
    label,
    completed,
    doneClass,
}: {
    icon: React.ReactNode;
    label: string;
    completed: boolean;
    doneClass: string;
}) => {
    const stateLabel = completed ? t('projects.flow.stateCompleted') : t('projects.flow.stateOngoing');
    return (
        <span
            title={`${label}: ${stateLabel}`}
            aria-label={`${label}: ${stateLabel}`}
            className={`flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors ${
                completed ? `${doneClass} border-transparent text-white` : 'border-slate-300 bg-transparent text-slate-400'
            }`}
        >
            {icon}
        </span>
    );
};

export const ProjectFlowStatusBadges = ({ project }: { project: ProjectDto }) => {
    const [technicalStatus, setTechnicalStatus] = useState<StageState>('pending');
    const [billingStatus, setBillingStatus] = useState<StageState>('pending');

    useEffect(() => {
        let active = true;
        Promise.all([
            myOrdersApi.list(),
            deliveryReportApi.list({ projectId: project.id }),
            billingApi.listInvoices({ projectId: project.id }),
        ])
            .then(([allOrders, deliveryReports, invoices]) => {
                if (!active) return;
                const flow = computeProjectFlow(project, {
                    projects: [project],
                    orders: allOrders.filter((o) => o.projectId === project.id),
                    deliveryReports,
                    invoices,
                    fieldReports: [],
                    generalSignatures: [],
                });
                setTechnicalStatus(flow.technicalStatus);
                setBillingStatus(flow.billingStatus);
            })
            .catch(() => {
                if (!active) return;
                setTechnicalStatus('pending');
                setBillingStatus('pending');
            });
        return () => {
            active = false;
        };
    }, [project]);

    return (
        <span className="inline-flex items-center gap-1.5">
            <FlowBadge
                icon={<Wrench size={13} />}
                label={t('projects.flow.colTechnical')}
                completed={technicalStatus === 'completed'}
                doneClass="bg-[#0ea5e9]"
            />
            <FlowBadge
                icon={<CurrencyDollar size={13} />}
                label={t('projects.flow.colBilling')}
                completed={billingStatus === 'completed'}
                doneClass="bg-[#f59e0b]"
            />
        </span>
    );
};
