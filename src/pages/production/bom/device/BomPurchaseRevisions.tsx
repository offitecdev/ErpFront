import { useState } from 'react';
import { ArrowRight, Eye, FileText } from 'lucide-react';

import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { productionBomApi } from '@/lib/api/productionBom';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { BomPurchase } from '@/types/productionBom';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';

import { fmtQty, orderUnitLabel, shortDate } from '../bomFormat';
import { openArchivedQuote, openBlob } from './bomFiles';

const pdfLang = (): OrderPdfLang => {
    const lang = String(i18n.resolvedLanguage || i18n.language || 'de').slice(0, 2);
    return lang === 'tr' || lang === 'en' ? lang : 'de';
};

/**
 * ── DIE ALTEN FASSUNGEN EINER BOM-BESTELLUNG (27.09.2026) ───────────────────
 * «Eski PDF ve teyit arşivde kalır.» Je Revision der Bestellung: was sich
 * änderte, das PDF der Fassung davor (aus ihrem Abzug neu gezeichnet, mit
 * ihrer eigenen Revisionsnummer) und die Bestätigung, die der Lieferant zu ihr
 * geschickt hatte.
 */
export const BomPurchaseRevisions = ({ purchase }: { purchase: BomPurchase }) => {
    const settings = usePdfSettings();
    const [busy, setBusy] = useState<number | null>(null);
    const list = [...purchase.revisions].sort((a, b) => b.number - a.number);

    const openPdf = async (number: number) => {
        setBusy(number);
        try {
            await openBlob(async () => {
                const detail = await productionBomApi.purchaseRevision(purchase.purchaseOrderId, number);
                // Das Blatt der alten Fassung trägt IHRE Revision (und deren Änderungen), nicht die heutige.
                const order = { ...detail.order, bomOrigin: detail.pdfRevision ? { revision: detail.pdfRevision } : null } as unknown as PurchaseOrderRow;
                const { buildOrderPdfBytes } = await import('@/utils/pdf/orderPdf');
                const bytes = await buildOrderPdfBytes(order, settings, pdfLang());
                return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            });
        } finally {
            setBusy(null);
        }
    };

    return (
        <div className="ofi-bom-group__box ofi-bom-orderrevs">
            {list.map((entry) => (
                <div key={entry.number} className="ofi-bom-orderrevs__row">
                    <div className="ofi-bom-orderrevs__head">
                        <span className="ofi-bom-revpill">{t('productionBom.revision.orderLabel', { revision: entry.number - 1 })}</span>
                        <ArrowRight aria-hidden className="ofi-bom-orderrevs__arrow" />
                        <span className="ofi-bom-revpill is-next">{t('productionBom.revision.orderLabel', { revision: entry.number })}</span>
                        <span className="ofi-bom-orderrevs__meta">
                            {shortDate(entry.createdAt)}
                            <span className="ofi-bom-dot">·</span>
                            {t('productionBom.revision.byBomRevision', { revision: entry.bomRevision })}
                        </span>
                        <span className="ofi-bom-orderrevs__actions">
                            <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" disabled={busy !== null} onClick={() => void openPdf(entry.number)}>
                                {busy === entry.number ? <span className="ofi-bom-spinner is-small" /> : <FileText />}
                                {t('productionBom.revision.oldPdf', { revision: entry.number - 1 })}
                            </button>
                            {entry.quoteFile && (
                                <button
                                    type="button"
                                    className="ofi-bom-btn is-small is-quiet ofi-nosize"
                                    title={entry.quoteFile.name}
                                    onClick={() => void openArchivedQuote(purchase.purchaseOrderId, entry.number)}
                                >
                                    <Eye />
                                    {t('productionBom.revision.oldQuote', { revision: entry.number - 1 })}
                                </button>
                            )}
                        </span>
                    </div>
                    <ul className="ofi-bom-orderrevs__lines">
                        {entry.changes.map((line) => (
                            <li key={`${line.index}:${line.bomLineId}`}>
                                <span className="ofi-bom-orderrevs__name" title={line.name}>{line.name}</span>
                                <span className="ofi-bom-revtable__qty">
                                    <s>{fmtQty(line.before)} {orderUnitLabel(line.unitBefore)}</s>
                                    <ArrowRight aria-hidden />
                                    <b>{line.after > 0 ? `${fmtQty(line.after)} ${orderUnitLabel(line.unitAfter)}` : t('productionBom.revision.lineDropped')}</b>
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>
            ))}
        </div>
    );
};
