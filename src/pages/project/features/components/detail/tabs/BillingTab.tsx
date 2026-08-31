import { memo, useMemo } from 'react';

import { Coins01 as Wallet, RefreshCcw01 } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import {
    OrderBillingSection,
    type BillingInvoiceScopeItem,
    type BillingLineInput,
} from '@/components/billing/OrderBillingSection';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { useOrderBillingSummaries } from '../../../hooks/useOrderBillingSummaries';

/** Verkäufer — teklifin satıcısı, yoksa teklifi oluşturan kişi. */
const salespersonOf = (tender?: { salespersonName?: string | null; createdBy?: { firstName: string; lastName: string } | null } | null) =>
    tender?.salespersonName
    || [tender?.createdBy?.firstName, tender?.createdBy?.lastName].filter(Boolean).join(' ')
    || null;

/**
 * Proje Abrechnung sekmesi — sipariş detayındaki faturalama sekmesiyle AYNI
 * paylaşılan bölümü kullanır (OrderBillingSection).
 *
 * Kapsam = seçili siparişin AİT OLDUĞU GRUP: ana sipariş ve ONA bağlı ek
 * siparişler. Genel liste bu grubu satır satır gösterir, satıra tıklayınca
 * aynı grubun faturaları popup'ta açılır. Projedeki DİĞER ana siparişler bu
 * listeye karışmaz — ilk şikâyet buydu; ek siparişler ise ana siparişin
 * parçasıdır ve birlikte görünür (kullanıcı isteği).
 */
export const BillingTab = memo(({
    project,
    order,
    orders,
    onSelectOrder,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    /** Popup'taki sipariş başlığı → siparişi YERİNDE seçer, sekme değişmez. */
    onSelectOrder: (orderId: string) => void;
}) => {
    // Sanal "project-main-*" siparişlerin faturalandırılacak kaydı yoktur.
    const isReal = (candidate: ProjectSalesOrder | null | undefined) =>
        Boolean(candidate && !candidate.id.startsWith('project-main-'));

    // Seçim gelmezse (ya da sanal siparişse) projenin ilk gerçek siparişi.
    const activeOrder = useMemo(
        () => (isReal(order) ? order : orders.find(isReal) ?? null),
        [order, orders],
    );

    /** Ana sipariş + ona bağlı ek siparişler; ana üstte, ekler oluşma sırasında. */
    const groupOrders = useMemo(() => {
        if (!activeOrder) return [] as ProjectSalesOrder[];
        const baseId = activeOrder.parentSalesOrderId || activeOrder.id;
        const base = orders.find((candidate) => candidate.id === baseId) ?? activeOrder;
        const addons = orders.filter((candidate) => candidate.parentSalesOrderId === baseId);
        return [base, ...addons].filter(isReal);
    }, [activeOrder, orders]);

    /** Ek siparişlerin grup içindeki sırası ("2. Zusatzauftrag"). */
    const addonIndexOf = useMemo(() => {
        const map = new Map<string, number>();
        let counter = 0;
        groupOrders.forEach((candidate) => {
            if (candidate.parentSalesOrderId) {
                counter += 1;
                map.set(candidate.id, counter);
            }
        });
        return map;
    }, [groupOrders]);

    const { summaries, reload: reloadSummaries } = useOrderBillingSummaries(groupOrders);
    const summariesLoaded = groupOrders.every((candidate) => candidate.id in summaries);

    const lines = useMemo<BillingLineInput[]>(
        () => groupOrders.map((candidate) => ({
            id: candidate.id,
            orderNumber: candidate.orderNumber,
            isAddon: Boolean(candidate.parentSalesOrderId),
            addonIndex: addonIndexOf.get(candidate.id) ?? null,
            revisionNumber: candidate.revisionNumber,
            date: candidate.orderDate || candidate.createdAt,
            totalAmount: Number(candidate.totalAmount) || 0,
            summary: summaries[candidate.id] ?? null,
            context: {
                orderNumber: candidate.orderNumber,
                tenderId: candidate.tender?.id ?? candidate.tenderId ?? project.tenderId ?? null,
                customerName: candidate.customer?.companyName ?? project.customer?.companyName ?? null,
                // Kommission siparişin KENDİ teklifinden gelir; yoksa projenin
                // teklifi. PDF'teki "Kommission" satırı bunu basar.
                commissionNumber: candidate.tender?.commissionNumber ?? project.tender?.commissionNumber ?? null,
                salespersonName: salespersonOf(candidate.tender) ?? salespersonOf(project.tender),
            },
        })),
        [groupOrders, addonIndexOf, summaries, project],
    );

    // Popup kapsamı da aynı grup — satırlarla birebir aynı sıralama.
    const invoiceScope = useMemo<BillingInvoiceScopeItem[]>(
        () => lines.map((line) => ({
            id: line.id,
            orderNumber: line.orderNumber,
            isAddon: line.isAddon,
            addonIndex: line.addonIndex,
        })),
        [lines],
    );

    if (!activeOrder) {
        return (
            <EmptyState
                icon={<Wallet size={28} />}
                title={t('projects.detail.billingNoOrders')}
                description={t('projects.detail.billingVirtualOrderHint')}
            />
        );
    }

    if (!summariesLoaded) {
        return (
            /* Ladefläche in der Form der Karte, die gleich kommt — Haarlinie,
               weisse Fläche, kein graues Feld (Google-clean, 19.08.2026). */
            <div className="ofi-inv-card flex h-56 items-center justify-center gap-2">
                <RefreshCcw01 size={18} className="animate-spin ofi-inv-muted" />
                <span className="text-[12px] ofi-inv-muted">{t('projects.detail.billingLoading')}</span>
            </div>
        );
    }

    return (
        <OrderBillingSection
            lines={lines}
            invoiceScope={invoiceScope}
            activeOrderId={activeOrder.id}
            onOpenOrder={onSelectOrder}
            onReload={reloadSummaries}
        />
    );
});
