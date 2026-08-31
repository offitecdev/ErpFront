import { useEffect, useState } from 'react';

import { SkeletonBar } from '@/components/ui-shared/Loader';
import {
    PopupActions,
    PopupButton,
    PopupCaption,
    PopupCard,
    PopupKv,
} from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';

import type { calculateProjectTotals } from '../../utils/projectTotals';
import { money } from '../../utils/projectFormatters';
import { useProjectFlowSummary } from '../../hooks/useProjectFlowSummary';
import { ProjectAgendaCard } from './details/ProjectAgendaCard';
import { ProjectProcessSummary } from './details/ProjectProcessSummary';

/* Roomy — the card carries three readouts (process, agenda, costs) — but never
   wider than the window: a floating card is positioned, not fluid. */
const CARD_WIDTH = 880;
const cardWidth = () => (typeof window === 'undefined' ? CARD_WIDTH : Math.min(CARD_WIDTH, window.innerWidth - 24));

/**
 * Project "Details": the process picture (overall / technical / invoicing plus
 * every order incl. addons), the appointment agenda, and the cost breakdown.
 *
 * A floating card of the app popup kit (18.08.2026, like the quote module): it
 * opens in the middle, is dragged aside by its header strip and stretched by
 * its edges, and leaves the project readable underneath — this is a readout
 * you compare against the page, not a question you must answer.
 */
export const ProjectDetailsModal = ({
    project,
    totals,
    onClose,
}: {
    project: ProjectDto;
    totals: ReturnType<typeof calculateProjectTotals>;
    onClose: () => void;
}) => {
    const { flow, items, loading } = useProjectFlowSummary(project);
    const [agendaProject, setAgendaProject] = useState(project);
    const [agendaLoading, setAgendaLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        projectApi.getById(project.id, 'details')
            .then((detail) => {
                if (!cancelled) setAgendaProject(detail);
            })
            .catch(() => {
                if (!cancelled) setAgendaProject(project);
            })
            .finally(() => {
                if (!cancelled) setAgendaLoading(false);
            });
        return () => { cancelled = true; };
    }, [project]);

    const rows: Array<{ label: string; value: number; total?: boolean }> = [
        { label: t('auto.siparis_tutari'), value: totals.orderBudget },
        { label: t('auto.ek_iscilik'), value: totals.overtime },
        { label: t('auto.harici_gider'), value: totals.expenses },
        { label: t('auto.malzeme'), value: totals.extraMaterials },
        { label: t('common.total'), value: totals.total, total: true },
    ];

    const subtitle = [project.projectNumber, project.customer?.companyName].filter(Boolean).join(' · ');

    return (
        <PopupCard
            open
            onClose={onClose}
            title={project.projectName}
            subtitle={subtitle || undefined}
            width={cardWidth()}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.close')}</PopupButton>
                </PopupActions>
            )}
        >
            <PopupCaption className="!pt-1">{t('projects.details.process')}</PopupCaption>
            <ProjectProcessSummary flow={flow} items={items} loading={loading} />

            {/* Agenda and costs sit side by side once the card is wide enough. */}
            <div className="ofi-tp-cols pt-1">
                <section className="min-w-0">
                    <PopupCaption>{t('projects.details.agenda')}</PopupCaption>
                    {agendaLoading
                        ? <SkeletonBar className="h-32 rounded-lg" />
                        : <ProjectAgendaCard project={agendaProject} />}
                </section>

                <section className="min-w-0">
                    <PopupCaption>{t('projects.details.costBreakdown')}</PopupCaption>
                    <dl>
                        {rows.map((row) => (
                            <PopupKv key={row.label} label={row.label} value={money(row.value)} total={row.total} />
                        ))}
                    </dl>
                </section>
            </div>
        </PopupCard>
    );
};
