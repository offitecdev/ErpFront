/**
 * Die Lieferantenzeilen der Karte im Formular: eine Zeile je Lieferant, mit
 * SEINEM Barcode des Produkts (vierter Durchgang, 26.09.2026: «bu tedarikçi
 * ürün kodu değil aslında bu ürün barkodu olması lazım — tedarikçiye göre ürün
 * barkodu»). Am Ende steht IMMER eine leere Zeile bereit («hep bir boş input
 * olması lazım, boş kalmasın»).
 *
 * Ein Barcode, dessen Lieferant noch nicht gewählt ist (der Scan aus «Ürün
 * ekle», ein älterer Herstellerbarcode der Karte), ist eine Zeile ohne
 * Lieferant — gespeichert als `manufacturerBarcode` der Karte; davon gibt es
 * höchstens eine.
 *
 * Ausserhalb der Komponenten, damit Fast Refresh sie nicht als Komponenten
 * missversteht.
 */
import type { WarehouseProduct, WarehouseProductInput } from '@/types/warehouse';

import type { SupplierValue } from './components/SupplierSelect';

export interface SupplierRow {
    /** Nur für React — bleibt beim Löschen stabil. */
    key: string;
    value: SupplierValue | null;
    barcode: string;
    /** Die E-Mail des Lieferanten für diese Karte (30.09.2026) — an sie geht die Preisanfrage. */
    email: string;
}

/** Eine E-Mail, wie ein Mailprogramm sie annimmt. */
export const isEmail = (value: string): boolean => /^[^\s@<>(),;:"]+@[^\s@<>(),;:"]+\.[^\s@<>(),;:"]{2,}$/.test(value.trim());

/** Höchstens so viele Lieferanten je Karte (wie der Server). */
export const MAX_SUPPLIERS = 20;

let rowSeq = 0;

/** Eine neue, leere Zeile. */
export const emptySupplierRow = (): SupplierRow => {
    rowSeq += 1;
    return { key: `sr-${rowSeq}`, value: null, barcode: '', email: '' };
};

/** Ohne Lieferant und ohne Barcode — die bereitstehende Zeile. */
export const isBlankRow = (row: SupplierRow): boolean => !row.value && !row.barcode.trim() && !row.email.trim();

/** Am Ende steht immer eine leere Zeile bereit (solange ein Lieferant mehr erlaubt ist). */
export const withBlankRow = (rows: SupplierRow[]): SupplierRow[] => {
    const last = rows[rows.length - 1];
    if (last && isBlankRow(last)) return rows;
    // Die Lieferanten plus höchstens eine Zeile ohne Lieferant.
    if (rows.length > MAX_SUPPLIERS) return rows;
    return [...rows, emptySupplierRow()];
};

/**
 * Die Zeilen einer gespeicherten Karte: der Barcode ohne Lieferant zuerst,
 * dann die Lieferanten in ihrer Reihenfolge, dann die leere Zeile.
 */
export const supplierRowsOf = (
    product: Pick<WarehouseProduct, 'suppliers' | 'manufacturerBarcode'> | null,
): SupplierRow[] => {
    const rows: SupplierRow[] = [];
    if (product?.manufacturerBarcode) rows.push({ key: 'sr-maker', value: null, barcode: product.manufacturerBarcode, email: '' });
    (product?.suppliers ?? []).forEach((entry, index) => {
        rows.push({
            key: `sr-saved-${index}-${entry.name}`,
            value: { id: entry.id, name: entry.name },
            barcode: entry.barcode ?? '',
            email: entry.email ?? '',
        });
    });
    return withBlankRow(rows);
};

export type SupplierEntries = NonNullable<WarehouseProductInput['suppliers']>;

/**
 * Was zum Server geht: die Zeilen mit Lieferant (Barcode getrimmt) und der
 * eine Barcode ohne Lieferant. Eine ZWEITE Zeile mit Barcode, aber ohne
 * Lieferant geht so nicht — sie wird genannt (Fehler am Feld).
 */
export const supplierInputOf = (
    rows: SupplierRow[],
): { suppliers: SupplierEntries; manufacturerBarcode: string | null } | { errorKey: string; code: string; kind?: 'email' } => {
    const suppliers: SupplierEntries = [];
    let manufacturerBarcode: string | null = null;
    for (const row of rows) {
        const barcode = row.barcode.trim() || null;
        const email = row.email.trim() || null;
        // Eine E-Mail muss eine E-Mail sein — und braucht ihren Lieferanten.
        if (email && (!row.value || !isEmail(email))) return { errorKey: row.key, code: email, kind: 'email' };
        if (row.value) {
            suppliers.push({ supplierId: row.value.id, name: row.value.name, barcode, email });
        } else if (barcode) {
            if (manufacturerBarcode !== null) return { errorKey: row.key, code: barcode };
            manufacturerBarcode = barcode;
        }
    }
    return { suppliers, manufacturerBarcode };
};

/** Gleich für «ungespeichert»: dieselben Lieferanten mit denselben Barcodes in derselben Reihenfolge. */
export const sameSupplierRows = (a: SupplierRow[], b: SupplierRow[]): boolean =>
    JSON.stringify(supplierInputOf(a)) === JSON.stringify(supplierInputOf(b));

/** Die Zeile, die diesen Code trägt (Meldung des Servers «gehört schon einer anderen Karte»). */
export const rowWithBarcode = (rows: SupplierRow[], code: string | number | null | undefined): SupplierRow | null => {
    const wanted = String(code ?? '').trim().toLocaleLowerCase();
    if (!wanted) return null;
    const variants = [wanted];
    if (/^\d{12}$/.test(wanted)) variants.push(`0${wanted}`);
    if (/^0\d{12}$/.test(wanted)) variants.push(wanted.slice(1));
    return rows.find((row) => variants.includes(row.barcode.trim().toLocaleLowerCase())) ?? null;
};
