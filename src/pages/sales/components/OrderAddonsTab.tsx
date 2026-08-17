import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import { SectionCard } from '@/components/ui-shared/TableKit';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { CostList } from '@/pages/project/features/components/common/CostList';
import { TotalRow } from '@/pages/project/features/components/common/TotalRow';
import { NUM_CELL, NUM_CELL_BILLED } from '@/pages/project/features/components/detail/tabs/overview/overviewShared';
import { displayExpenseType, durationFmt, money, numberFmt } from '@/pages/project/features/utils/projectFormatters';
import type { MyOrderAddonDto, MyOrderDetailDto } from '@/types/billing';

const fmtDate = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

/**
 * Ek siparişin içerik dilimi — sunucudaki `createAddonOrderForParent` ile aynı
 * pencere: bir ÖNCEKİ ek siparişin oluşturulmasından BU ek siparişin
 * oluşturulmasına kadar üst siparişe işlenen kayıtlar. Kayıtlar veritabanında
 * ÜST siparişe bağlı kalır (ek sipariş yalnızca faturalama kaydıdır), bu yüzden
 * içerik ancak zamanla kesilerek geri bulunur — proje modülündeki
 * `scopedRecords` ile aynı yaklaşım.
 */
const addonSlice = <T,>(
    records: T[] | undefined,
    addon: MyOrderAddonDto,
    addons: MyOrderAddonDto[],
    dateOf: (record: T) => string | null | undefined,
): T[] => {
    const previous = addons
        .filter((candidate) => dayjs(candidate.createdAt).isBefore(dayjs(addon.createdAt)))
        .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0];
    const start = previous ? dayjs(previous.createdAt).valueOf() : null;
    const end = dayjs(addon.createdAt).valueOf();
    return (records || []).filter((record) => {
        const raw = dateOf(record);
        if (!raw) return false;
        const time = dayjs(raw).valueOf();
        return time <= end && (start === null || time > start);
    });
};

/**
 * Ek siparişin içeriğini gösteren popup — proje modülündeki
 * `AddonOrderOverview` düzeninin sipariş sayfasındaki karşılığı: üç ara toplam
 * ve malzeme / harici gider / fazla mesai ayrıntı listeleri.
 */
const AddonContentSheet = ({ order, addon, onClose }: {
    order: MyOrderDetailDto;
    addon: MyOrderAddonDto;
    onClose: () => void;
}) => {
    const addons = order.addonSalesOrders || [];

    const materialRows = useMemo(
        () => addonSlice(order.extraMaterials, addon, addons, (item) => item.addedAt).map((item) => ({
            id: item.id,
            title: item.material?.name || item.article?.name || t('auto.malzeme'),
            meta: `${numberFmt(item.quantity)} ${t('auto.adet_x')} ${money(item.unitPrice)}`,
            amount: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
            note: item.description ?? undefined,
        })),
        [order.extraMaterials, addon, addons],
    );
    const expenseRows = useMemo(
        () => addonSlice(order.expenses, addon, addons, (item) => item.expenseDate).map((expense) => ({
            id: expense.id,
            title: displayExpenseType(expense.expenseType),
            meta: fmtDate(expense.expenseDate),
            amount: Number(expense.amount) || 0,
            note: expense.description ?? undefined,
        })),
        [order.expenses, addon, addons],
    );
    const overtimeRows = useMemo(
        () => addonSlice(order.reports, addon, addons, (report) => report.reportDate || report.workDate)
            .filter((report) => Number(report.overtimeCost) > 0)
            .map((report) => ({
                id: report.id,
                title: fmtDate(report.workDate),
                meta: `${durationFmt(Number(report.overtimeMinutes || 0))} x ${money(report.overtimeHourlyRate)}`,
                amount: Number(report.overtimeCost) || 0,
                note: report.operationsDone || undefined,
            })),
        [order.reports, addon, addons],
    );

    const sum = (rows: Array<{ amount: number }>) => rows.reduce((total, row) => total + row.amount, 0);

    return (
        <BottomSheet
            open
            title={addon.orderNumber}
            subtitle={`${addon.revisionNumber ? `${addon.revisionNumber}. ` : ''}${t('projects.addonOrder')} · ${fmtDate(addon.orderDate || addon.createdAt)}`}
            onClose={onClose}
            width={1100}
            height={640}
        >
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
                <div className="max-w-xl rounded-md border border-slate-200/70 bg-slate-50/50 p-4 dark:border-white/10 dark:bg-white/5">
                    <div className="space-y-3 text-[13px]">
                        <TotalRow label={t('auto.malzeme')} value={sum(materialRows)} />
                        <TotalRow label={t('auto.harici_gider')} value={sum(expenseRows)} />
                        <TotalRow label={t('auto.15_uzeri_fazla_calisma')} value={sum(overtimeRows)} />
                        <TotalRow label={t('common.total')} value={Number(addon.totalAmount) || 0} total />
                    </div>
                </div>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <CostList title={t('auto.malzeme_ayrintilari')} empty={t('auto.malzeme_yok')} rows={materialRows} />
                    <CostList title={t('auto.harici_gider_ayrintilari')} empty={t('auto.gider_yok')} rows={expenseRows} />
                    <CostList title={t('auto.15_uzeri_fazla_calisma')} empty={t('auto.fazla_calisma_yok')} rows={overtimeRows} />
                </div>
            </div>
        </BottomSheet>
    );
};

/**
 * "Zusatzaufträge" sekmesi — proje modülündeki kutunun eşi: ek siparişler kendi
 * NT- numaralarını ve teslim/iş tarihlerini taşır; satıra tıklamak içerik
 * popup'ını açar. Teslimat siparişinde bu sekme HİÇ görünmez (ekler yalnızca
 * proje siparişinin altında listelenir).
 */
export const OrderAddonsTab = ({ order, initialAddonId, onInitialAddonConsumed }: {
    order: MyOrderDetailDto;
    /** Liste derin bağlantısı (`?addon=<id>`): açılışta bu ek siparişin popup'ı açılır. */
    initialAddonId?: string | null;
    /** Derin bağlantı tüketildiğinde çağrılır — sekmeden ayrılıp dönmek popup'ı yeniden açmaz. */
    onInitialAddonConsumed?: () => void;
}) => {
    const addons = order.addonSalesOrders || [];
    const [activeAddon, setActiveAddon] = useState<MyOrderAddonDto | null>(
        () => (initialAddonId ? addons.find((addon) => addon.id === initialAddonId) ?? null : null),
    );

    useEffect(() => {
        if (initialAddonId) onInitialAddonConsumed?.();
        // Bilerek yalnız montajda: derin bağlantı tek seferliktir.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <div className="space-y-4">
            <SectionCard title={t('projects.detail.overview.addonsTitle')}>
                <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('projects.detail.colOrder')}</th>
                            <th className="w-32 text-right">{t('projects.detail.colAmount')}</th>
                            <th className="w-32 text-right">{t('billing.billed')}</th>
                            <th className="w-32 text-right">{t('billing.remaining')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {addons.length === 0 ? (
                            <tr>
                                <td colSpan={4} className="py-6 text-center text-[13px] text-slate-400 dark:text-white/50">
                                    {t('projects.detail.overview.noAddons')}
                                </td>
                            </tr>
                        ) : addons.map((addon) => {
                            const total = Number(addon.billingSummary?.baseAmount ?? addon.totalAmount) || 0;
                            const billed = Number(addon.billingSummary?.billedAmount) || 0;
                            return (
                                <tr
                                    key={addon.id}
                                    onClick={() => setActiveAddon(addon)}
                                    title={t('projects.addonOrder')}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                    <td>
                                        <span className="block truncate font-semibold text-slate-800 dark:text-white">
                                            {addon.orderNumber}
                                        </span>
                                        {/* Tarih = ek işin ait olduğu randevu/iş günü
                                            (orderDate), proje kutusundaki ile aynı. */}
                                        <span className="block text-[11px] text-slate-400">
                                            {fmtDate(addon.orderDate || addon.createdAt)}
                                        </span>
                                    </td>
                                    <td className={NUM_CELL}>{money(total)}</td>
                                    <td className={NUM_CELL_BILLED}>{money(billed)}</td>
                                    <td className={NUM_CELL}>{money(total - billed)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </SectionCard>

            {activeAddon && <AddonContentSheet order={order} addon={activeAddon} onClose={() => setActiveAddon(null)} />}
        </div>
    );
};
