import { Check, ChevronRight, CircleDashed, ShoppingCart } from 'lucide-react';

import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { ORDER_STATUS_META } from '@/pages/inventory/utils/orderStatus';
import type { Bom, BomPurchase } from '@/types/productionBom';
import type { PurchaseOrderStatus } from '@/types/inventory';

import { fmtPrice, shownPurchaseCode } from '../bomFormat';
import { EmptyState } from '../bomUi';
import { NavBar } from '../NavStack';
import { purchasesTitle } from './bomViews';
import type { BomViewContext } from './DeviceBomArea';

export const PurchaseStatus = ({ status }: { status: string }) => {
    const meta = ORDER_STATUS_META[status as PurchaseOrderStatus];
    return <span className={`ofi-bom-postatus ${meta?.className ?? ''}`}>{meta ? t(meta.labelKey) : status}</span>;
};

/** Die Bedingungen einer BOM-Bestellung als ruhige Häkchen. */
export const PurchaseChecks = ({ purchase }: { purchase: BomPurchase }) => {
    const checks: Array<{ ok: boolean; key: string }> = purchase.kind === 'ORDER'
        ? [
            { ok: purchase.checks.quoteNumber, key: 'productionBom.purchases.checkQuoteNumber' },
            { ok: purchase.checks.quoteFile, key: 'productionBom.purchases.checkQuoteFile' },
            { ok: purchase.checks.prices, key: 'productionBom.purchases.checkPrices' },
            { ok: purchase.checks.confirmed, key: 'productionBom.purchases.checkConfirmed' },
            { ok: purchase.checks.received, key: 'productionBom.purchases.checkReceived' },
        ]
        : [];
    if (!checks.length) return null;
    return (
        <span className="ofi-bom-pochecks">
            {checks.map((check) => (
                <span key={check.key} className={check.ok ? 'is-ok' : undefined}>
                    {check.ok ? <Check aria-hidden /> : <CircleDashed aria-hidden />}
                    {t(check.key)}
                </span>
            ))}
        </span>
    );
};

/**
 * ── DIE BESTELLUNGEN EINER BOM ───────────────────────────────────────────────
 * «Siparişler projeden geldiği belli olmalı — proje, cihaz ve sipariş
 *  numaramız.» Je Beleg eine Zeile: unsere Nummer, der Lieferant, der Stand
 * und die Bedingungen (Angebotsnummer, Angebots-PDF, Preise, Bestätigung,
 * Eingang). Preisanfragen stehen darunter, mit ihrer Bestellung.
 */
export const BomPurchasesView = ({ context, bom }: { context: BomViewContext; bom: Bom }) => {
    const { nav } = context;
    const orders = bom.purchases.filter((purchase) => purchase.kind === 'ORDER');
    const requests = bom.purchases.filter((purchase) => purchase.kind === 'REQUEST');
    const referenceOf = (id: string | null) => shownPurchaseCode(bom.purchases.find((purchase) => purchase.purchaseOrderId === id)?.referenceNumber ?? '');

    const row = (purchase: BomPurchase) => (
        <button
            key={purchase.purchaseOrderId}
            type="button"
            className="ofi-bom-porow ofi-nosize"
            onClick={() => context.open({ kind: 'purchase', bomId: bom.id, purchaseOrderId: purchase.purchaseOrderId })}
        >
            <span className="ofi-bom-porow__main">
                <span className="ofi-bom-porow__top">
                    <b className="ofi-bom-code is-large"><PurchaseCode value={purchase.referenceNumber} /></b>
                    <PurchaseStatus status={purchase.status} />
                    {purchase.kind === 'ORDER' && purchase.orderRevision > 0 && (
                        <span className="ofi-bom-revpill">{t('productionBom.revision.label', { revision: purchase.orderRevision })}</span>
                    )}
                    {purchase.stale && <span className="ofi-bom-tag is-warn">{t('productionBom.revision.staleTag', { revision: purchase.bomRevision })}</span>}
                </span>
                <span className="ofi-bom-porow__sub">
                    {purchase.supplierName || '—'}
                    <span className="ofi-bom-dot">·</span>
                    {t('productionBom.purchases.lines', { count: purchase.lineCount })}
                    {purchase.kind === 'ORDER' && purchase.totalNet > 0 && (
                        <>
                            <span className="ofi-bom-dot">·</span>
                            {fmtPrice(purchase.totalNet, purchase.currency)}
                        </>
                    )}
                    {purchase.kind === 'REQUEST' && purchase.sourcePurchaseOrderId && (
                        <>
                            <span className="ofi-bom-dot">·</span>
                            {t('productionBom.purchases.requestOf', { number: referenceOf(purchase.sourcePurchaseOrderId) })}
                        </>
                    )}
                </span>
                <PurchaseChecks purchase={purchase} />
            </span>
            <ChevronRight className="ofi-bom-porow__chev" aria-hidden />
        </button>
    );

    return (
        <>
            <NavBar nav={nav} backTitle={context.backTitle} title={purchasesTitle(bom)} subtitle={bom.bomNumber} />
            <div className="ofi-bom-body">
                {!bom.purchases.length ? (
                    <EmptyState icon={<ShoppingCart />} title={t('productionBom.purchases.empty')} />
                ) : (
                    <>
                        {orders.length > 0 && (
                            <section className="ofi-bom-group">
                                <h3 className="ofi-bom-group__title">{t('productionBom.purchases.order')}<span className="ofi-bom-group__count">{orders.length}</span></h3>
                                <div className="ofi-bom-group__box is-list">{orders.map(row)}</div>
                            </section>
                        )}
                        {requests.length > 0 && (
                            <section className="ofi-bom-group">
                                <h3 className="ofi-bom-group__title">{t('productionBom.purchases.request')}<span className="ofi-bom-group__count">{requests.length}</span></h3>
                                <div className="ofi-bom-group__box is-list">{requests.map(row)}</div>
                            </section>
                        )}
                    </>
                )}
            </div>
        </>
    );
};
