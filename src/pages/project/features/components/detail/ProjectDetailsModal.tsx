import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import type { ProjectDto } from '@/types/project';

import type { calculateProjectTotals } from '../../utils/projectTotals';
import { money } from '../../utils/projectFormatters';
import { useProjectFlowSummary } from '../../hooks/useProjectFlowSummary';
import { ProjectAgendaCard } from './details/ProjectAgendaCard';
import { ProjectProcessSummary } from './details/ProjectProcessSummary';

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section>
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h3>
        {children}
    </section>
);

/**
 * Project "Details": the process picture (overall / technical / invoicing plus
 * every order incl. addons), the appointment agenda, and the cost breakdown —
 * the project-specific view that used to be split between the list's "Process"
 * button and this cost-only pop-up.
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

    const rows: Array<{ label: string; value: number; total?: boolean }> = [
        { label: t('auto.siparis_tutari'), value: totals.orderBudget },
        { label: t('auto.ek_iscilik'), value: totals.overtime },
        { label: t('auto.harici_gider'), value: totals.expenses },
        { label: t('auto.malzeme'), value: totals.extraMaterials },
        { label: t('common.total'), value: totals.total, total: true },
    ];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose} role="presentation">
            {/* Roomy: this dialog carries three sections (process, agenda, costs),
                so it takes most of the viewport rather than a narrow column. */}
            <div className="relative flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-7 py-5">
                    <div className="min-w-0">
                        <p className="text-[11px] font-medium uppercase tracking-wider text-slate-400">{t('common.detail')}</p>
                        <h2 className="mt-0.5 truncate text-[18px] font-semibold tracking-tight text-slate-900">{localizeTenderNumbersInText(project.projectName)}</h2>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="flex size-9 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
                        aria-label={t('common.close')}
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* The body can outgrow the viewport once a project has several
                    orders and appointments, so it scrolls inside the dialog. */}
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-7 py-6">
                    <Section title={t('projects.details.process')}>
                        <ProjectProcessSummary flow={flow} items={items} loading={loading} />
                    </Section>

                    {/* Agenda and costs sit side by side once there is room for it. */}
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <Section title={t('projects.details.agenda')}>
                            <ProjectAgendaCard project={project} />
                        </Section>

                        <Section title={t('projects.details.costBreakdown')}>
                            <dl className="divide-y divide-slate-100">
                                {rows.map((row) => (
                                    <div key={row.label} className={`flex items-center justify-between gap-4 py-2.5 text-[13px] ${row.total ? 'font-semibold text-slate-950' : ''}`}>
                                        <dt className={`shrink-0 ${row.total ? 'text-slate-900' : 'font-medium text-slate-500'}`}>{row.label}</dt>
                                        <dd className={`min-w-0 truncate text-right font-mono ${row.total ? 'text-[15px] text-slate-950' : 'font-semibold text-slate-900'}`}>{money(row.value)}</dd>
                                    </div>
                                ))}
                            </dl>
                        </Section>
                    </div>
                </div>
            </div>
        </div>
    );
};
