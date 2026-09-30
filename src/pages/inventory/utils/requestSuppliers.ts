import type { PurchaseOrderRow, PurchaseRequestSupplier } from '@/types/inventory';

/**
 * ── JEDER LIEFERANT SEIN EIGENES BLATT (Vorgabe Samet, 25.09.2026) ─────────
 *
 * «Her tedarikçi için ayrı bir PDF oluşsun.» Eine Preisanfrage kann mehrere
 * Lieferanten tragen; die PDF-Bauer kennen aber nur EINEN (`supplier*`). Statt
 * sie umzubauen, bekommt jeder Lieferant eine Kopie des Vorgangs, in der ER der
 * Empfänger ist — Blatt, Mail und Dateiname folgen dann von selbst.
 */

/** Die Lieferanten einer Preisanfrage (bei Bestellungen leer). */
export const requestSuppliersOf = (order: PurchaseOrderRow, priceRequest: boolean): PurchaseRequestSupplier[] =>
    (priceRequest ? order.requestSuppliers ?? [] : []);

/** Der Vorgang, wie ihn DIESER Lieferant sieht. Ohne Lieferant: unverändert. */
export const orderForSupplier = (order: PurchaseOrderRow, supplier: PurchaseRequestSupplier | undefined): PurchaseOrderRow =>
    (supplier
        ? {
            ...order,
            supplierId: supplier.supplierId,
            supplierName: supplier.supplierName,
            supplierEmail: supplier.supplierEmail,
            supplierAddress: supplier.supplierAddress,
        }
        : order);

/* ── DAS BLATT FÜR DEN EINKAUF (29.09.2026, Vorgabe Samet) ──────────────────
   «Talebin kimden geldiği de üstte yazacak, yani yine aynı şablonu
    kullanacağız ama kullanıcı tedarikçiden haberi olmayacak.»
   Wer keine Einkaufsrolle hat, sieht und verschickt dieselbe Preisanfrage —
   aber im Anschriftfeld steht statt eines Lieferanten der Einkauf und darunter,
   von wem die Anfrage kommt. Die Wörter folgen der Sprache des BLATTES, wie
   alle Texte im PDF (nicht der Oberfläche). */
const INTERNAL_WORDS: Record<'de' | 'tr' | 'en', { to: string; from: string }> = {
    de: { to: 'Einkauf', from: 'Angefragt von:' },
    tr: { to: 'Satın alma', from: 'Talep eden:' },
    en: { to: 'Purchasing', from: 'Requested by:' },
};

/** Die Anfrage, wie der Einkauf sie von einer Kollegin bekommt: ohne Lieferanten, mit der anfragenden Person. */
export const internalRequestView = (order: PurchaseOrderRow, requester: string, lang: 'de' | 'tr' | 'en'): PurchaseOrderRow => {
    const words = INTERNAL_WORDS[lang];
    const name = requester.replace(/\s+/g, ' ').trim();
    return {
        ...order,
        supplierId: null,
        supplierName: words.to,
        supplierEmail: null,
        supplierAddress: name ? `${words.from} ${name}` : null,
        requestSuppliers: [],
        recipientName: null,
    };
};

/** Dateiname: Code, bei mehreren Lieferanten mit dessen Namen dahinter. */
export const supplierPdfFileName = (code: string, supplier: PurchaseRequestSupplier | undefined, multi: boolean): string => {
    const name = multi && supplier
        ? supplier.supplierName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
        : '';
    return `${code}${name ? ` ${name}` : ''}.pdf`;
};
