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

/** Dateiname: Code, bei mehreren Lieferanten mit dessen Namen dahinter. */
export const supplierPdfFileName = (code: string, supplier: PurchaseRequestSupplier | undefined, multi: boolean): string => {
    const name = multi && supplier
        ? supplier.supplierName.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60)
        : '';
    return `${code}${name ? ` ${name}` : ''}.pdf`;
};
