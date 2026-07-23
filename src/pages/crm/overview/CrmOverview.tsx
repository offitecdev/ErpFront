import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'motion/react';
import { DEFAULT_CURRENCY } from '../../../utils/currency';
import { useExchangeRates } from './useExchangeRates';
import { useCrmOverviewData } from './useCrmOverviewData';
import type { OverviewFilters } from './overviewShared';
import { OverviewFiltersBar } from './components/OverviewFiltersBar';
import { KpiGrid } from './components/KpiGrid';
import { QuickActions } from './components/QuickActions';
import { PriorityAgenda } from './components/PriorityAgenda';
import { PipelineCharts } from './components/PipelineCharts';
import { FollowUpOffers } from './components/FollowUpOffers';
import { WeekStrip } from './components/WeekStrip';
import { SURFACE } from './components/OverviewCard';
import { InventoryListHeader } from '../../../components/inventory/InventoryListHeader';
import { PageSkeleton } from '../../../components/ui-shared/PageSkeleton';

const sectionAnim = (delay: number) => ({
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.35, delay, ease: 'easeOut' as const },
});

/**
 * CRM overview dashboard (/crm/overview): filterable KPI header, quick actions,
 * priority agenda, animated pipeline charts, follow-up offers and a week strip
 * wired to the unified calendar. Every widget lives in its own component file
 * under ./components.
 */
export const CrmOverview = () => {
    const { t } = useTranslation();

    const [filters, setFilters] = useState<OverviewFilters>(() => ({
        userId: '',
        role: '',
        currency: DEFAULT_CURRENCY,
    }));
    const patchFilters = (patch: Partial<OverviewFilters>) => setFilters((f) => ({ ...f, ...patch }));

    const { rates, live: fxLive, convert } = useExchangeRates(filters.currency);
    // Stable identity per (rates, display currency) so the stats memo only
    // recomputes when conversion output would actually change.
    const convertToDisplay = useCallback(
        (amount: number, from?: string | null) => convert(amount, from, filters.currency),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [rates, filters.currency],
    );

    const data = useCrmOverviewData(filters, convertToDisplay);

    const [composerOpen, setComposerOpen] = useState(false);

    // Same skeleton as the router's lazy-chunk fallback, so chunk load → data
    // load reads as ONE uninterrupted loading animation.
    if (data.loading) {
        return <PageSkeleton />;
    }

    // Fill toward the page edges (only the shell's 2rem gutter remains) so laptops and
    // normal desktops use their full width instead of floating in a narrow centered
    // column. The high cap keeps it from over-stretching on 2K/4K, where it stays
    // centered; the wider 2xl gaps keep the side-by-side blocks breathing.
    return (
        <div className="mx-auto flex w-full max-w-[1920px] flex-col gap-5 pb-6 2xl:gap-7">
            {/* Header — just the title, same size/position as every other page
                (InventoryListHeader), no caption underneath. */}
            <motion.header {...sectionAnim(0)}>
                <InventoryListHeader title={t('crmOverview.title', { defaultValue: 'Genel Bakış' })} />
            </motion.header>

            {data.error && (
                <div className={`${SURFACE} border-rose-200 px-4 py-3 text-[13px] text-rose-700 dark:text-rose-300`}>
                    {t('crmOverview.loadError', { defaultValue: 'Bazı veriler yüklenemedi:' })} {data.error}
                </div>
            )}

            <motion.div {...sectionAnim(0.04)}>
                <OverviewFiltersBar
                    filters={filters}
                    onChange={patchFilters}
                    employees={data.employees}
                    roles={data.roles}
                    onLoadEmployees={data.loadEmployees}
                    fxLive={fxLive}
                    onRefresh={data.refresh}
                    loading={data.loading}
                />
            </motion.div>

            <motion.div {...sectionAnim(0.08)}>
                <KpiGrid stats={data.stats} filters={filters} />
            </motion.div>

            <motion.div {...sectionAnim(0.12)}>
                <QuickActions onNewTask={() => setComposerOpen(true)} />
            </motion.div>

            <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-3 2xl:gap-7">
                <motion.div {...sectionAnim(0.16)} className="flex flex-col gap-5 xl:col-span-2 2xl:gap-7">
                    <PipelineCharts
                        tenders={data.filteredTenders}
                        orders={data.filteredOrders}
                        orderedIds={data.orderedIds}
                        currency={filters.currency}
                        convert={convertToDisplay}
                    />
                    <FollowUpOffers tenders={data.filteredTenders} orderedIds={data.orderedIds} />
                </motion.div>

                <motion.div {...sectionAnim(0.2)}>
                    <PriorityAgenda
                        critical={data.critical}
                        tasks={data.tasks}
                        weekAppointments={data.weekAppointments}
                        notifications={data.notifications}
                        meetings={data.meetings}
                        onMeetingsChanged={data.refreshMeetings}
                        composerOpen={composerOpen}
                        onComposerOpen={() => setComposerOpen(true)}
                        onComposerClose={() => setComposerOpen(false)}
                    />
                </motion.div>
            </div>

            <motion.div {...sectionAnim(0.24)}>
                <WeekStrip appointments={data.weekAppointments} tasks={data.weekTasks} meetings={data.meetings} />
            </motion.div>
        </div>
    );
};

export default CrmOverview;
