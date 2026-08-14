import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft as ArrowLeftOutlined, CheckCircle, PieChart03, User01 as UserRound, XClose } from '../../components/icons/antIconCompat';
import dayjs from 'dayjs';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Modal } from '../../components/ui-shared/Modal';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { SlidingTopTabs } from '../../components/ui-shared/SlidingTopTabs';
import { OrderBillingSection, type BillingLineInput } from '../../components/billing/OrderBillingSection';
import { myOrdersApi } from '../../lib/api/billing';
import { sharePercent } from '../../lib/orderBillingTotals';
import { deliveryReportApi, type DeliveryReportDto } from '../../lib/api/project';
import { OverviewPieCharts } from '../project/features/components/detail/tabs/overview/OverviewPieCharts';
import type { MyOrderDetailDto } from '../../types/billing';
import { OrderPaymentTab } from './components/OrderPaymentTab';
import { OrderOverviewTab } from './components/OrderOverviewTab';
import { OrderAddonsTab } from './components/OrderAddonsTab';
import { OrderQuoteTab } from './components/OrderQuoteTab';
import { isDeliveryOrder, stagesForOrder, type Stage, type StageItem } from './components/orderOverviewShared';

import { t } from '@/i18n/translate';

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '-');
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

type TabKey = 'order' | 'addons' | 'overview' | 'billing' | 'payment';

const TAB_KEYS: TabKey[] = ['overview', 'order', 'addons', 'billing', 'payment'];

const StageDetailModal = ({ stage, onClose }: { stage: Stage; onClose: () => void }) => {
    const done = stage.items.filter((i) => i.done);
    const pending = stage.items.filter((i) => !i.done);
    const Row = ({ item }: { item: StageItem }) => (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
            {item.done
                ? <CheckCircle size={15} className="shrink-0 text-[#059669]" />
                : <XClose size={15} className="shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-slate-800">{item.label}</div>
                {item.meta && <div className="truncate text-[11px] text-slate-400">{item.meta}</div>}
            </div>
        </div>
    );
    return (
        <Modal open onClose={onClose} title={stage.label} description={t('projects.complete.details')} width="md" footer={<Button variant="primary" onClick={onClose}>{t('projects.complete.close')}</Button>}>
            {stage.items.length === 0 ? (
                <EmptyState title={t('projects.complete.noRecords')} />
            ) : (
                <div className="space-y-4">
                    <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#059669]">{t('projects.complete.completedLabel')} · {done.length}</div>
                        <div className="space-y-1.5">
                            {done.length === 0 ? <div className="text-[12px] text-slate-400">{t('projects.complete.noRecords')}</div> : done.map((item, i) => <Row key={i} item={item} />)}
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">{t('projects.complete.incompleteLabel')} · {pending.length}</div>
                        <div className="space-y-1.5">
                            {pending.length === 0 ? <div className="text-[12px] text-slate-400">{t('projects.complete.noRecords')}</div> : pending.map((item, i) => <Row key={i} item={item} />)}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

const TabBar = ({ tab, onSelect, showAddons, addonCount }: {
    tab: TabKey;
    onSelect: (t: TabKey) => void;
    /** Teslimat siparişinde ek sipariş sekmesi HİÇ gösterilmez (kullanıcı isteği). */
    showAddons: boolean;
    addonCount: number;
}) => {
    // Übersicht önde ve VARSAYILAN, Auftrag ikinci — Genel Bakış ile Auftrag
    // yer değiştirdi (kullanıcı isteği, 2026-08-07).
    const tabs: Array<{ key: TabKey; label: string; badge?: number }> = [
        { key: 'overview', label: t('crm.overviewTab') },
        { key: 'order', label: t('projects.order') },
        ...(showAddons ? [{ key: 'addons' as TabKey, label: t('projects.complete.tabAddons'), badge: addonCount }] : []),
        { key: 'billing', label: t('projects.complete.tabBilling') },
        { key: 'payment', label: t('billing.paymentScheduleTab') },
    ];
    // Proje detayındaki üst menüyle (ProjectTopNav) birebir aynı sekme şeridi:
    // sayfa kenarında alt çizgi, aktif sekme = dolu panel + marka rengi çizgi
    // + kalın yazı. `ofi-quote-tab*` dark.css vurgu kancalarıdır.
    return (
        <nav className="ofi-quote-tabs-strip mb-2 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 md:overflow-visible dark:border-white/15">
            <SlidingTopTabs activeKey={tab} className="flex min-w-max items-stretch gap-1">
                {tabs.map((tb) => {
                    const active = tab === tb.key;
                    return (
                        <button
                            key={tb.key}
                            data-tab-key={tb.key}
                            type="button"
                            aria-current={active ? 'page' : undefined}
                            onClick={() => onSelect(tb.key)}
                            className={`ofi-quote-tab -mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${
                                active
                                    ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                                    : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'
                            }`}
                        >
                            {tb.label}
                            {tb.badge ? (
                                <span className="rounded bg-amber-100 px-1.5 py-px text-[10px] font-bold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">{tb.badge}</span>
                            ) : null}
                        </button>
                    );
                })}
            </SlidingTopTabs>
        </nav>
    );
};

export const MyOrderDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<MyOrderDetailDto | null>(null);
    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [loading, setLoading] = useState(true);
    // `?tab=billing` derin bağlantısı: proje Abrechnung sekmesindeki fatura
    // popup'ı sipariş başlığından DOĞRUDAN bu sekmeye getirir.
    const [searchParams] = useSearchParams();
    const requestedTab = searchParams.get('tab') as TabKey | null;
    // Varsayılan sekme ÜBERSICHT: Genel Bakış ile Auftrag yer değiştirdi
    // (kullanıcı isteği, 2026-08-07) — ilk sekme açılışta da öndedir.
    const [tab, setTab] = useState<TabKey>(
        requestedTab && TAB_KEYS.includes(requestedTab) ? requestedTab : 'overview',
    );
    // `?addon=<id>` derin bağlantısı: sipariş listesindeki ek sipariş satırı
    // buraya getirir — Zusatzaufträge sekmesi açılır ve ilgili ek siparişin
    // içerik popup'ı kendiliğinden açılır. Değer BİR KEZ tüketilir; popup
    // kapandıktan sonra sekme gezintileri onu yeniden açmaz.
    const [pendingAddonId, setPendingAddonId] = useState<string | null>(() => searchParams.get('addon'));
    const [activeStage, setActiveStage] = useState<Stage | null>(null);
    // Faturalama grafiği popup'ı — sekmedeki TEK grafik ikonundan açılır.
    const [chartsOpen, setChartsOpen] = useState(false);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [detail, deliveries] = await Promise.all([
                myOrdersApi.getById(id),
                deliveryReportApi.list({ salesOrderId: id }).catch(() => [] as DeliveryReportDto[]),
            ]);
            setOrder(detail);
            setDeliveryReports(deliveries);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.orders.errorLoad'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    const refreshBilling = useCallback(async () => {
        if (!id) return;
        const detail = await myOrdersApi.getById(id);
        setOrder(detail);
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const stages = useMemo<Stage[]>(() => {
        if (!order) return [];
        const summary = order.billingSummary;

        // Quotation: the order exists because its quotation was approved.
        const quotation: Stage = {
            key: 'quotation',
            label: t('projects.complete.stageQuotation'),
            completed: true,
            items: [{ label: order.orderNumber, meta: t('projects.complete.approved'), done: true }],
        };

        // Delivery reports — only signed reports count toward completion.
        const deliverySigned = deliveryReports.filter((r) => r.isSigned).length;
        const deliveryReport: Stage = {
            key: 'deliveryReport',
            label: t('projects.complete.stageDeliveryReport'),
            completed: deliverySigned > 0,
            items: deliveryReports.map((r) => ({ label: r.checklistName || (r.orderNumber ? r.orderNumber : fmtDate(r.createdAt)), meta: r.isSigned ? t('projects.complete.signedLabel') : t('projects.complete.unsignedLabel'), done: r.isSigned })),
        };

        // Billing.
        const billing: Stage = {
            key: 'billing',
            label: t('projects.complete.stageBilling'),
            completed: sharePercent(summary?.billedAmount ?? 0, summary?.baseAmount ?? 0) >= 100,
            items: (summary?.invoices || []).map((inv) => ({
                label: inv.invoiceNumber,
                meta: `${clampPercent(inv.billedPercent)}% · ${fmtMoney(inv.amount)}`,
                done: inv.status !== 'CANCELLED',
            })),
        };

        // Saha ve genel rapor aşamaları genel bakışta GÖSTERİLMEZ (kullanıcı
        // isteği): yalnız teklif, teslimat raporu ve faturalama kalır.
        return [quotation, deliveryReport, billing];
    }, [order, deliveryReports]);

    if (loading) {
        return <div className="h-72 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />;
    }

    if (!order) {
        return (
            <Card>
                <EmptyState title={t('crm.order_not_found')} description={t('crm.order_missing_or_no_access')} />
            </Card>
        );
    }

    // Ein Lieferauftrag hat keine technische Seite — die Übersicht zeigt für
    // ihn nur die kaufmännischen Stufen. Die Stufen-Chips in der KOPFZEILE
    // wurden komplett entfernt (Benutzerwunsch); sie leben nur noch in der
    // Übersichts-Registerkarte.
    const visibleStages = stagesForOrder(order, stages);
    const delivery = isDeliveryOrder(order);
    const addons = order.addonSalesOrders || [];
    // Teslimat siparişinde ek sipariş sekmesi yoktur; eski bir derin bağlantı
    // yine de 'addons' isterse Auftrag sekmesine düşülür.
    const activeTab: TabKey = delivery && tab === 'addons' ? 'order' : tab;

    // Paylaşılan faturalama bölümü (proje Abrechnung sekmesiyle aynı bileşen).
    // Bir fatura her zaman TEK siparişe kesilir; ana siparişin tam faturası
    // teklif pozisyonlarını PDF'e taşısın diye tender bağlamı buradan gider.
    // Verkäufer teklifin satıcısıdır, yoksa teklifi oluşturan kişi — fatura
    // şeridindeki alan bununla ön-dolar.
    const tenderSalesperson = order.tender?.salespersonName
        || [order.tender?.createdBy?.firstName, order.tender?.createdBy?.lastName].filter(Boolean).join(' ')
        || null;
    const billingSectionLines: BillingLineInput[] = [
        {
            id: order.id,
            orderNumber: order.orderNumber,
            isAddon: false,
            date: order.createdAt,
            totalAmount: Number(order.totalAmount) || 0,
            summary: order.billingSummary ?? null,
            paymentStagesRaw: order.paymentStages ?? null,
            context: {
                orderNumber: order.orderNumber,
                tenderId: order.tender?.id ?? null,
                customerName: order.customer?.companyName ?? null,
                billingAddress: order.tender?.billingAddress ?? null,
                commissionNumber: order.tender?.commissionNumber ?? null,
                salespersonName: tenderSalesperson,
            },
        },
        ...addons.map((addon) => ({
            id: addon.id,
            orderNumber: addon.orderNumber,
            isAddon: true,
            revisionNumber: addon.revisionNumber,
            date: addon.orderDate || addon.createdAt,
            totalAmount: Number(addon.totalAmount) || 0,
            summary: addon.billingSummary ?? null,
            paymentStagesRaw: addon.paymentStages ?? null,
            context: {
                orderNumber: addon.orderNumber,
                customerName: order.customer?.companyName ?? null,
                billingAddress: order.tender?.billingAddress ?? null,
                commissionNumber: order.tender?.commissionNumber ?? null,
                salespersonName: tenderSalesperson,
            },
        })),
    ];

    // Grafik popup'ının iki hikâyesi — ana siparişin kendi parası ve ek
    // siparişlerin üstüne koyduğu para (proje genel bakışındaki ayrımın aynısı).
    const mainTotal = Number(order.billingSummary?.baseAmount ?? order.totalAmount) || 0;
    const mainBilled = Number(order.billingSummary?.billedAmount) || 0;
    const orderFigures = { billed: mainBilled, unbilled: Math.max(0, mainTotal - mainBilled) };
    const addonFigures = addons.reduce(
        (acc, addon) => {
            const total = Number(addon.billingSummary?.baseAmount ?? addon.totalAmount) || 0;
            const billed = Number(addon.billingSummary?.billedAmount) || 0;
            return { billed: acc.billed + billed, unbilled: acc.unbilled + Math.max(0, total - billed) };
        },
        { billed: 0, unbilled: 0 },
    );

    return (
        <div>
            {/* Proje detay başlığıyla aynı biçim: solda kalın sipariş numarası +
                müşteri, sağda ürün listesindeki geri düğmesi gibi liste
                bağlantısı ("Geri" düğmesi kaldırıldı — kullanıcı isteği). */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 pb-1">
                {/* Başlık proje detayındakiyle AYNI boyda (19px kalın mono) —
                    altında küçük müşteri satırı (kullanıcı isteği). */}
                <div className="flex min-w-0 flex-col justify-center gap-0.5">
                    <span className="truncate font-mono text-[19px] font-bold leading-tight text-slate-900 dark:text-white">{order.orderNumber}</span>
                    {order.customer?.companyName && (
                        <span className="inline-flex items-center gap-1 text-[13px] text-slate-600 dark:text-white/70"><UserRound size={12} /> {order.customer.companyName}</span>
                    )}
                </div>
                <button
                    type="button"
                    onClick={() => navigate('/crm/my-orders')}
                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                >
                    <ArrowLeftOutlined size={14} />
                    {t('crm.ordersList')}
                </button>
            </div>

            <TabBar tab={activeTab} onSelect={setTab} showAddons={!delivery} addonCount={addons.length} />

            {/* Sekme içeriği proje detayındaki gibi beyaz panelde durur. */}
            <div className="min-w-0 rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6">

            {/* Auftrag sekmesi: teklifin pozisyon satırları + maliyet özeti. */}
            {activeTab === 'order' && <OrderQuoteTab order={order} />}

            {/* Ek siparişler kendi sekmesinde; teslimat siparişinde sekme yok. */}
            {activeTab === 'addons' && !delivery && (
                <OrderAddonsTab
                    order={order}
                    initialAddonId={pendingAddonId}
                    onInitialAddonConsumed={() => setPendingAddonId(null)}
                />
            )}

            {activeTab === 'overview' && (
                <OrderOverviewTab order={order} stages={visibleStages} onOpenStage={setActiveStage} />
            )}

            {activeTab === 'billing' && (
                <div className="space-y-3">
                    {/* TEK grafik ikonu, ortada — tıklayınca ana sipariş / ek sipariş
                        kırılımını gösteren popup açılır (kullanıcı isteği: sekmede
                        sürekli duran grafik kartı yok). */}
                    <div className="flex justify-center">
                        <button
                            type="button"
                            onClick={() => setChartsOpen(true)}
                            title={t('projects.detail.overview.chartsTitle')}
                            aria-label={t('projects.detail.overview.chartsTitle')}
                            className="inline-flex size-11 items-center justify-center rounded-full border border-slate-200 bg-white text-[#272f67] shadow-[0_1px_2px_rgba(15,23,42,0.06)] transition-colors hover:border-[#272f67]/40 hover:bg-[#eef4ff] dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:bg-white/10"
                        >
                            <PieChart03 size={20} />
                        </button>
                    </div>

                    {/* Proje Abrechnung sekmesiyle birebir aynı bileşen ve biçim
                        (kullanıcı isteği) — üstte ayrıca durum kartı YOK. */}
                    <OrderBillingSection
                        lines={billingSectionLines}
                        onReload={refreshBilling}
                        activeOrderId={order.id}
                        onOpenOrder={(orderId) => {
                            if (orderId === order.id) return;
                            navigate(`/crm/my-orders/${orderId}?tab=${activeTab}`);
                        }}
                    />
                </div>
            )}

            {activeTab === 'payment' && <OrderPaymentTab order={order} onChanged={() => { void load(); }} />}

            </div>

            {/* Ana sipariş / ek sipariş faturalama kırılımı — proje genel
                bakışındaki iki halkanın aynısı, popup içinde. */}
            {chartsOpen && (
                <Modal open onClose={() => setChartsOpen(false)} title={t('projects.detail.overview.chartsTitle')} width="md">
                    <OverviewPieCharts bare order={orderFigures} addons={addonFigures} />
                </Modal>
            )}

            {activeStage && <StageDetailModal stage={activeStage} onClose={() => setActiveStage(null)} />}
        </div>
    );
};
