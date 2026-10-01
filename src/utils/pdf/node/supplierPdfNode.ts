/**
 * ── LIEFERANTEN-PDF AUF DEM SERVER (30.09.2026, Vorgabe Samet) ─────────────
 *
 * «Fiyat talepleri artık otomatik gönderiliyor … sipariş gönder dediğimizde
 *  bunları hazırlayıp çıkartıyor ve maillerine atıyor.» Preisanfrage und
 * Bestellung gehen ohne offenes Fenster hinaus — der Server braucht dasselbe
 * PDF wie die Seite «PDF». Er bekommt DIESEN Code als Bündel
 * (`scripts/build-supplier-pdf-node.mjs` → `dist-node/supplierPdf.cjs`), kein
 * zweites Layout: was hier gedruckt wird, ist Zeile für Zeile das Blatt des
 * Browsers.
 *
 * Nur zwei Dinge setzt der Server selbst: den Rasterer der Kopfwelle (im
 * Browser ein <canvas>, dort sharp) — und die Firmenangaben, die im Browser im
 * Speicher der Seite liegen.
 */
import { buildOrderPdfBytes } from '../orderPdf';
import { buildPriceRequestPdfBytes } from '../priceRequestPdf';
import { pdfRaster } from '../tenderPdfModern';

export { buildOrderPdfBytes, buildPriceRequestPdfBytes };

/** Der Rasterer der Kopfwelle (SVG → PNG als data:-URL). */
export const setSvgRasterizer = (rasterize: (svg: string, pxW: number, pxH: number) => Promise<string | null>): void => {
    pdfRaster.svgToPng = rasterize;
};

/** Die Fassung des Bündels — der Server nennt sie im Protokoll. */
export const SUPPLIER_PDF_BUNDLE = '2026-09-30';
