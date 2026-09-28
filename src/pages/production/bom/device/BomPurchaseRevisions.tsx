import { useState } from 'react';
import { ArrowRight, Eye, FileDiff, FileText } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi } from '@/lib/api/productionBom';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { BomPurchase } from '@/types/productionBom';

import { fmtQty, orderUnitLabel, shortDate } from '../bomFormat';
import { openArchivedQuote, openBlob } from './bomFiles';
import { openOrderRevisionPdf, pdfLang } from './revisionPdf';

/**
 * ── DIE ALTEN FASSUNGEN EINER BOM-BESTELLUNG (27.09.2026) ───────────────────
 * «Eski PDF ve teyit arşivde kalır.» Je Revision der Bestellung: was sich
 * änderte, das PDF der Fassung davor (aus ihrem Abzug neu gezeichnet, mit
 * ihrer eigenen Revisionsnummer) und die Bestätigung, die der Lieferant zu ihr
 * geschickt hatte.
 */
export const BomPurchaseRevisions = ({ purchase }: { purchase: BomPurchase }) => {
    const settings = usePdfSettings();
    const [busy, setBusy] = useState<string | null>(null);
    const list = [...purchase.revisions].sort((a, b) => b.number - a.number);

    const openChangePdf = async (number: number) => {
        setBusy(`change:${number}`);
        try {
            await openOrderRevisionPdf(purchase.purchaseOrderId, number, settings);
        } finally {
            setBusy(null);
        }
    };

    const openPdf = async (number: number) => {
        setBusy(`old:${number}`);
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
                            {/* Das eigene Blatt der Änderung («o pdf ayrı olsun … bunlar değişti»). */}
                            <button
                                type="button"
                                className="ofi-bom-btn is-small ofi-nosize"
                                disabled={busy !== null}
                                title={t('productionBom.revision.changePdfTitle', { revision: entry.number })}
                                onClick={() => void openChangePdf(entry.number)}
                            >
                                {busy === `change:${entry.number}` ? <span className="ofi-bom-spinner is-small" /> : <FileDiff />}
                                {t('productionBom.revision.changePdf', { revision: entry.number })}
                            </button>
                            <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" disabled={busy !== null} onClick={() => void openPdf(entry.number)}>
                                {busy === `old:${entry.number}` ? <span className="ofi-bom-spinner is-small" /> : <FileText />}
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
