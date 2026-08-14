import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowRight, Briefcase01, Clock } from '@/components/icons/antIconCompat';
import { formatMoney, toCurrencyCode } from '../../../../utils/currency';
import type { TenderListItem } from '../../../../types/tender';
import {
    daysUntilExpiry,
    loadImportantOfferIds,
    offerStage,
    saveImportantOfferIds,
    type OfferStage,
} from '../overviewShared';
import { OverviewCard } from './OverviewCard';

type FollowTab = 'important' | 'recent' | 'deadline';

interface FollowUpOffersProps {
    tenders: TenderListItem[];
    orderedIds: Set<string>;
}

const STAGE_BADGE: Record<OfferStage, string> = {
    draft: 'bg-black/6 text-[#6B7280] dark:bg-white/10 dark:text-white/70',
    sent: 'bg-sky-500/10 text-sky-700 dark:bg-sky-400/12 dark:text-sky-300',
    ordered: 'bg-emerald-500/10 text-emerald-700 dark:bg-emerald-400/12 dark:text-emerald-300',
};

/** Offers needing follow-up: starred (important), recent drafts, drafts with the
    nearest deadline. Offers already turned into an order are left out. */
export const FollowUpOffers: React.FC<FollowUpOffersProps> = ({ tenders, orderedIds }) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [tab, setTab] = useState<FollowTab>('deadline');
    const [importantIds, setImportantIds] = useState<string[]>(loadImportantOfferIds);

    const toggleImportant = (id: string) => {
        const next = importantIds.includes(id) ? importantIds.filter((x) => x !== id) : [...importantIds, id];
        setImportantIds(next);
        saveImportantOfferIds(next);
    };

    const rows = useMemo(() => {
        // "Follow-up" candidates are open drafts (mailed or not) — never offers
        // that already produced an order.
        const drafts = tenders.filter((x) => x.status === 'Draft' && offerStage(x, orderedIds) !== 'ordered');
        if (tab === 'important') {
            return tenders.filter((x) => importantIds.includes(x.id));
        }
        if (tab === 'recent') {
            return [...drafts].sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()).slice(0, 6);
        }
        return drafts
            .filter((x) => x.validUntil)
            .sort((a, b) => dayjs(a.validUntil).valueOf() - dayjs(b.validUntil).valueOf())
            .slice(0, 6);
    }, [tenders, orderedIds, tab, importantIds]);

    const stageLabel = (stage: OfferStage) =>
        ({
            draft: t('crmOverview.charts.stageDraft', { defaultValue: 'Taslak' }),
            sent: t('crmOverview.charts.stageSent', { defaultValue: 'E-posta gönderildi' }),
            ordered: t('crmOverview.charts.stageOrdered', { defaultValue: 'Sipariş oluşturuldu' }),
        })[stage];

    const TABS: Array<{ key: FollowTab; labelKey: string; defaultLabel: string }> = [
        { key: 'deadline', labelKey: 'crmOverview.followUp.tabDeadline', defaultLabel: 'Son tarih' },
        { key: 'recent', labelKey: 'crmOverview.followUp.tabRecent', defaultLabel: 'Son eklenen' },
        { key: 'important', labelKey: 'crmOverview.followUp.tabImportant', defaultLabel: 'Önemli' },
    ];

    return (
        <OverviewCard
            title={t('crmOverview.followUp.title', { defaultValue: 'Takip gerektiren teklifler' })}
            subtitle={t('crmOverview.followUp.subtitle', { defaultValue: 'Önemli işaretlenen ve taslak durumdaki teklifler' })}
            icon={<Briefcase01 size={16} />}
            actions={
                <button
                    type="button"
                    onClick={() => navigate('/crm/tenders')}
                    className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-[#07145c] transition-colors hover:bg-[#07145c]/6 dark:text-[#e6cf9e] dark:hover:bg-[#e6cf9e]/10"
                >
                    {t('crmOverview.followUp.allOffers', { defaultValue: 'Tüm teklifler' })}
                    <ArrowRight size={14} />
                </button>
            }
            bodyClassName="flex flex-col gap-3 pt-3"
        >
            <div className="flex items-center gap-1 rounded-xl bg-black/4 p-1 dark:bg-white/6">
                {TABS.map(({ key, labelKey, defaultLabel }) => (
                    <button
                        key={key}
                        type="button"
                        onClick={() => setTab(key)}
                        className={`flex-1 rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                            tab === key
                                ? 'bg-white text-[#1A1A1A] shadow-sm dark:bg-white/12 dark:text-white'
                                : 'text-[#6B7280] hover:text-[#1A1A1A] dark:text-white/60 dark:hover:text-white'
                        }`}
                    >
                        {t(labelKey, { defaultValue: defaultLabel })}
                    </button>
                ))}
            </div>

            <div className="flex flex-col gap-1.5">
                {rows.length === 0 && (
                    <p className="rounded-xl border border-dashed border-black/10 px-4 py-8 text-center text-[13px] text-[#98A0AE] dark:border-white/15">
                        {tab === 'important'
                            ? t('crmOverview.followUp.emptyImportant', {
                                  defaultValue: 'Henüz önemli işaretlenen teklif yok. Yıldıza tıklayarak işaretleyin.',
                              })
                            : t('crmOverview.followUp.empty', { defaultValue: 'Gösterilecek teklif yok.' })}
                    </p>
                )}
                {rows.map((tender) => {
                    const stage = offerStage(tender, orderedIds);
                    const days = daysUntilExpiry(tender);
                    const starred = importantIds.includes(tender.id);
                    return (
                        <div
                            key={tender.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => navigate(`/crm/tenders/${tender.id}`)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') navigate(`/crm/tenders/${tender.id}`);
                            }}
                            className="group flex cursor-pointer items-center gap-3 rounded-xl border border-[#E3E7F0] bg-[#F7F8FC] px-3 py-2.5 transition-colors hover:border-[#C9D0DF] dark:border-white/8 dark:bg-white/4 dark:hover:bg-white/8"
                        >
                            <button
                                type="button"
                                aria-label={t('crmOverview.followUp.markImportant', { defaultValue: 'Önemli işaretle' })}
                                aria-pressed={starred}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    toggleImportant(tender.id);
                                }}
                                className={`shrink-0 text-[16px] leading-none transition-transform hover:scale-110 ${
                                    starred ? 'text-amber-500' : 'text-[#C4C7CE] hover:text-amber-400 dark:text-white/25'
                                }`}
                            >
                                {starred ? '★' : '☆'}
                            </button>
                            <div className="min-w-0 flex-1">
                                <p className="truncate text-[13.5px] font-semibold text-[#1A1A1A] dark:text-white">
                                    {tender.tenderNumber}
                                    {tender.customerName && <span className="font-normal text-[#6B7280] dark:text-[#aab0bb]"> · {tender.customerName}</span>}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px] text-[#6B7280] dark:text-[#aab0bb]">
                                    <span className={`rounded-md px-1.5 py-px text-[10.5px] font-semibold ${STAGE_BADGE[stage]}`}>{stageLabel(stage)}</span>
                                    {days !== null && (
                                        <span className={`flex items-center gap-1 tabular-nums ${days <= 3 ? 'font-semibold text-rose-600 dark:text-rose-300' : ''}`}>
                                            <Clock size={12} />
                                            {days < 0
                                                ? t('crmOverview.agenda.expired', { defaultValue: 'Süresi doldu' })
                                                : t('crmOverview.agenda.daysLeft', { count: days, defaultValue: '{{count}} gün kaldı' })}
                                        </span>
                                    )}
                                </p>
                            </div>
                            <span className="shrink-0 text-[13px] font-semibold tabular-nums text-[#07145c] dark:text-[#e6cf9e]">
                                {tender.grandTotal ? formatMoney(tender.grandTotal, toCurrencyCode(tender.currency)) : '—'}
                            </span>
                        </div>
                    );
                })}
            </div>
        </OverviewCard>
    );
};
