import i18n from '@/i18n';
import { productionBomApi } from '@/lib/api/productionBom';
import type { PdfCompanySettings } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';

import { openBlob } from './bomFiles';

/** Die Sprache der Oberfläche als Sprache des Blatts (de, wo sie keins kennt). */
export const pdfLang = (): OrderPdfLang => {
    const lang = String(i18n.resolvedLanguage || i18n.language || 'de').slice(0, 2);
    return lang === 'tr' || lang === 'en' ? lang : 'de';
};

/**
 * Das eigene Änderungsblatt der Revision `number` einer Bestellung («Sipariş
 * Revizyonu», 27.09.2026 abends) in einem neuen Tab: Kopf aus der Fassung der
 * Bestellung, Tabelle aus den Änderungen, die diese Revision brachte.
 */
export const openOrderRevisionPdf = (purchaseOrderId: string, number: number, settings: PdfCompanySettings): Promise<void> =>
    openBlob(async () => {
        const detail = await productionBomApi.purchaseRevision(purchaseOrderId, number);
        const { buildOrderRevisionPdfBytes } = await import('@/utils/pdf/orderPdf');
        const bytes = await buildOrderRevisionPdfBytes(
            detail.order as unknown as PurchaseOrderRow,
            settings,
            pdfLang(),
            { number: detail.number, createdAt: detail.createdAt, changes: detail.changes },
        );
        return new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
    });
