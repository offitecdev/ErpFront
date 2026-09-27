import { ExternalLink, FileText, Paperclip } from 'lucide-react';

import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import type { Bom } from '@/types/productionBom';

import { shortDate } from '../bomFormat';
import { EmptyState, Note } from '../bomUi';
import { NavBar } from '../NavStack';
import type { BomViewContext } from './DeviceBomArea';
import { openArchivedQuote, openQuoteFile } from './bomFiles';
import { PurchaseStatus } from './BomPurchasesView';

/**
 * ── DIE DOKUMENTE EINER BOM (27.09.2026, Vorgabe Samet) ─────────────────────
 *
 * «BOM'un görevde beklerken belgeleri sipariş belgeleri olarak otomatik
 *  eklenir.» Nichts ist hier von Hand abzulegen: jede Bestellung und
 * Preisanfrage der BOM steht da (ihr PDF öffnet auf ihrer Seite), und jedes
 * hochgeladene Angebot eines Lieferanten.
 */
export const BomDocumentsView = ({ context, bom }: { context: BomViewContext; bom: Bom }) => {
    const { nav } = context;
    const items = bom.purchases.flatMap((purchase) => [
        {
            key: `pdf:${purchase.purchaseOrderId}`,
            icon: <FileText />,
            label: purchase.kind === 'ORDER' ? t('productionBom.purchases.order') : t('productionBom.purchases.request'),
            number: purchase.referenceNumber,
            detail: purchase.supplierName,
            date: purchase.createdAt,
            status: purchase.status,
            action: t('productionBom.documents.openPdf'),
            onOpen: () => context.openOrder(purchase.purchaseOrderId, 'pdf'),
        },
        ...(purchase.quoteFile ? [{
            key: `quote:${purchase.purchaseOrderId}`,
            icon: <Paperclip />,
            label: t('productionBom.purchase.quoteSection'),
            number: purchase.referenceNumber,
            detail: purchase.quoteFile.name,
            date: purchase.quoteFile.uploadedAt,
            status: null,
            action: t('productionBom.documents.openFile'),
            onOpen: () => { void openQuoteFile(purchase.purchaseOrderId); },
        }] : []),
        // Die Bestätigungen alter Fassungen (BOM-Revision) — sie bleiben im Archiv.
        ...purchase.revisions.flatMap((entry) => (entry.quoteFile ? [{
            key: `quote:${purchase.purchaseOrderId}:${entry.number}`,
            icon: <Paperclip />,
            label: t('productionBom.revision.oldQuote', { revision: entry.number - 1 }),
            number: purchase.referenceNumber,
            detail: entry.quoteFile.name,
            date: entry.quoteFile.uploadedAt,
            status: null,
            action: t('productionBom.documents.openFile'),
            onOpen: () => { void openArchivedQuote(purchase.purchaseOrderId, entry.number); },
        }] : [])),
    ]);

    return (
        <>
            <NavBar nav={nav} backTitle={context.backTitle} title={t('productionBom.documents.title')} subtitle={bom.bomNumber} />
            <div className="ofi-bom-body">
                <Note>{t('productionBom.documents.hint')}</Note>
                {!items.length ? (
                    <EmptyState icon={<FileText />} title={t('productionBom.documents.empty')} />
                ) : (
                    <section className="ofi-bom-group">
                        <div className="ofi-bom-group__box is-list">
                            {items.map((item) => (
                                <button key={item.key} type="button" className="ofi-bom-docrow ofi-nosize" onClick={item.onOpen}>
                                    <span className="ofi-bom-docrow__icon">{item.icon}</span>
                                    <span className="ofi-bom-docrow__text">
                                        <b>
                                            {item.label}
                                            <span className="ofi-bom-dot">·</span>
                                            <PurchaseCode value={item.number} />
                                        </b>
                                        <small>{[item.detail, shortDate(item.date)].filter(Boolean).join(' · ')}</small>
                                    </span>
                                    {item.status && <PurchaseStatus status={item.status} />}
                                    <span className="ofi-bom-docrow__open">
                                        {item.action}
                                        <ExternalLink aria-hidden />
                                    </span>
                                </button>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </>
    );
};
