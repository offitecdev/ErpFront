import React from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
    AlertTriangle,
    Briefcase01,
    CheckCircle,
    Clock,
    Coins01,
    TrendUp01,
} from '@/components/icons/antIconCompat';
import { formatMoney } from '../../../../utils/currency';
import { STAGE_WEIGHTS, type OverviewFilters } from '../overviewShared';
import type { CrmOverviewStats } from '../useCrmOverviewData';
import { KpiCard } from './KpiCard';

interface KpiGridProps {
    stats: CrmOverviewStats;
    filters: OverviewFilters;
}

/** The six headline numbers, each with count + converted value + delta footnote. */
export const KpiGrid: React.FC<KpiGridProps> = ({ stats, filters }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const money = (v: number) => formatMoney(v, filters.currency);

    const offerDelta = stats.offersCreatedInPeriod - stats.offersCreatedInPrevPeriod;
    const offerDeltaText =
        offerDelta === 0
            ? t('crmOverview.kpi.sameAsLastMonth', { defaultValue: 'Geçen ayla aynı sayıda teklif' })
            : offerDelta > 0
              ? t('crmOverview.kpi.moreOffers', { count: offerDelta, defaultValue: 'Geçen aydan {{count}} teklif fazla' })
              : t('crmOverview.kpi.fewerOffers', { count: -offerDelta, defaultValue: 'Geçen aydan {{count}} teklif az' });

    const salesDelta = stats.salesWon.totalChf - stats.salesWonPrevChf;
    const salesDeltaText =
        stats.salesWonPrevChf === 0 && salesDelta === 0
            ? t('crmOverview.kpi.noPrevSales', { defaultValue: 'Geçen ay satış yok' })
            : salesDelta >= 0
              ? t('crmOverview.kpi.salesDeltaUp', { value: money(salesDelta), defaultValue: 'Geçen aydan {{value}} fazla' })
              : t('crmOverview.kpi.salesDeltaDown', { value: money(-salesDelta), defaultValue: 'Geçen aydan {{value}} az' });

    const estimateInfo = (
        <span>
            {t('crmOverview.kpi.estimateInfo', {
                draft: Math.round(STAGE_WEIGHTS.draft * 100),
                sent: Math.round(STAGE_WEIGHTS.sent * 100),
                defaultValue:
                    'Tahmini satış, açık tekliflerin tutarlarının aşamaya göre ağırlıklandırılmasıyla hesaplanır: Taslak %{{draft}}, E-posta gönderildi %{{sent}}. Siparişi oluşturulan teklifler tahmine dahil edilmez.',
            })}
        </span>
    );

    return (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 2xl:gap-5">
            <KpiCard
                label={t('crmOverview.kpi.openOffers', { defaultValue: 'Açık teklifler' })}
                icon={<Briefcase01 size={17} />}
                tone="brand"
                count={stats.openOffers.count}
                money={money(stats.openOffers.totalChf)}
                footnote={offerDeltaText}
                footnoteTrend={offerDelta > 0 ? 'up' : offerDelta < 0 ? 'down' : null}
                info={t('crmOverview.kpi.openOffersInfo', {
                    defaultValue: 'Henüz kabul edilmemiş ve siparişe dönüşmemiş tüm teklifler.',
                })}
                onClick={() => navigate('/sales/quotes')}
            />
            <KpiCard
                label={t('crmOverview.kpi.approachingDeadline', { defaultValue: 'Yaklaşan son tarihler' })}
                icon={<Clock size={17} />}
                tone="amber"
                count={stats.approachingDeadline.count}
                money={money(stats.approachingDeadline.totalChf)}
                footnote={t('crmOverview.kpi.approachingDeadlineNote', { defaultValue: 'Önümüzdeki 7 gün içinde' })}
                onClick={() => navigate('/sales/quotes')}
            />
            <KpiCard
                label={t('crmOverview.kpi.pendingApproval', { defaultValue: 'Onay bekleyen' })}
                icon={<CheckCircle size={17} />}
                tone="sky"
                count={stats.pendingApproval.count}
                money={money(stats.pendingApproval.totalChf)}
                footnote={t('crmOverview.kpi.pendingApprovalNote', { defaultValue: 'Taslak durumundaki teklifler' })}
                onClick={() => navigate('/sales/quotes')}
            />
            <KpiCard
                label={t('crmOverview.kpi.salesWon', { defaultValue: 'Bu ay kazanılan satış' })}
                icon={<Coins01 size={17} />}
                tone="emerald"
                count={stats.salesWon.count}
                money={money(stats.salesWon.totalChf)}
                footnote={salesDeltaText}
                footnoteTrend={salesDelta > 0 ? 'up' : salesDelta < 0 ? 'down' : null}
                info={t('crmOverview.kpi.salesWonInfo', {
                    defaultValue: 'Seçilen ayda kabul edilen teklifler + teklife bağlı olmayan satış siparişleri.',
                })}
                onClick={() => navigate('/sales/orders')}
            />
            <KpiCard
                label={t('crmOverview.kpi.estimatedSales', { defaultValue: 'Tahmini satış' })}
                icon={<TrendUp01 size={17} />}
                tone="violet"
                count={stats.estimatedSales.count}
                money={money(stats.estimatedSales.totalChf)}
                footnote={t('crmOverview.kpi.estimatedSalesNote', { defaultValue: 'Ağırlıklı açık teklif hacmi' })}
                info={estimateInfo}
            />
            <KpiCard
                label={t('crmOverview.kpi.delayedTasks', { defaultValue: 'Geciken görevler' })}
                icon={<AlertTriangle size={17} />}
                tone="rose"
                count={stats.delayedTasks}
                footnote={t('crmOverview.kpi.delayedTasksNote', { defaultValue: 'Planlanan tarihi geçen görevler' })}
                onClick={() => navigate('/maintenance/tasks')}
            />
        </div>
    );
};
