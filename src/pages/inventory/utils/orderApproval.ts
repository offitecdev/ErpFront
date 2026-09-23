import type { PurchaseOrderItemInput } from '@/types/inventory';

/**
 * ── WAS EINE BESTELLUNG ZUR BESTÄTIGUNG BRAUCHT (19.09.2026, Vorgabe Samet) ─
 *
 * «Damit eine Bestellung bestätigt werden kann, müssen Produktname, Menge,
 *  Einzelpreis, Nettopreis und Zeilensumme ausgefüllt sein. Fehlt eines, wird
 *  die Bestätigung blockiert. Rabatt und Rabatt 2 sind keine Pflicht.»
 *
 * «Ausgefüllt» heisst bei den Zahlen: grösser als null — so, wie die Zeile
 * gespeichert wird (`rowToItem`). Die Maske prüft VOR dem Absenden und zeigt
 * die fehlenden Zellen; der Server prüft dasselbe noch einmal.
 *
 * ⚠ Server-Zwilling: Erp_Backend/src/domain/services/purchaseOrderApproval.ts.
 */

export type ApprovalField = 'productName' | 'quantity' | 'unitPrice' | 'netPrice' | 'lineTotal';

export const APPROVAL_FIELDS: ReadonlyArray<ApprovalField> = ['productName', 'quantity', 'unitPrice', 'netPrice', 'lineTotal'];

/** Die Spalte der Bestelltabelle, in der das Feld steht. */
export const APPROVAL_FIELD_COLUMN: Record<ApprovalField, string> = {
    productName: 'name',
    quantity: 'quantity',
    unitPrice: 'grossPrice',
    netPrice: 'netPrice',
    lineTotal: 'lineTotal',
};

export interface ApprovalGap {
    /** Stelle der Zeile in der geprüften Liste. */
    index: number;
    fields: ApprovalField[];
}

const positive = (value: unknown): boolean => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
};

export const missingApprovalFields = (items: Array<Pick<PurchaseOrderItemInput, 'name' | 'quantity' | 'grossPrice' | 'netPrice' | 'lineTotal'>>): ApprovalGap[] => {
    const gaps: ApprovalGap[] = [];
    items.forEach((item, index) => {
        const fields: ApprovalField[] = [];
        if (!String(item?.name ?? '').trim()) fields.push('productName');
        if (!positive(item?.quantity)) fields.push('quantity');
        if (!positive(item?.grossPrice)) fields.push('unitPrice');
        if (!positive(item?.netPrice)) fields.push('netPrice');
        if (!positive(item?.lineTotal)) fields.push('lineTotal');
        if (fields.length) gaps.push({ index, fields });
    });
    return gaps;
};

/** Die Antwort des Servers (`APPROVAL_FIELDS_MISSING`) als Lücken — `row` zählt ab 1. */
export const approvalGapsFromDetails = (details: unknown): ApprovalGap[] => (Array.isArray(details)
    ? details
        .map((entry) => ({
            index: Number((entry as { row?: unknown })?.row) - 1,
            fields: (((entry as { fields?: unknown })?.fields as unknown[]) ?? [])
                .filter((field): field is ApprovalField => APPROVAL_FIELDS.includes(field as ApprovalField)),
        }))
        .filter((gap) => gap.index >= 0 && gap.fields.length > 0)
    : []);
