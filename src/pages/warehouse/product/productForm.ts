import { t } from '@/i18n/translate';
import type { WarehouseGroupRef, WarehouseMissingField, WarehouseProduct, WarehouseProductInput, WarehouseUnit } from '@/types/warehouse';

import { sameSupplierRows, supplierInputOf, supplierRowsOf, type SupplierRow } from '../supplierRows';
import { numberToInput, parseInputNumber, priceToInput } from '../warehouseFormat';

/**
 * ── DAS FORMULAR DER PRODUKTKARTE (Zustand, Vergleich, Eingabe) ────────────
 *
 * Ausgelagert aus WarehouseProductPage (30.09.2026: «component dosyalarını çok
 * uzun tutmayın, bileşen bileşen yapın»). Neu am selben Tag:
 *   · «Ürün kodu» (steht im PDF des Lieferanten, anfangs leer) und die Einheit;
 *   · «Model numarası» heisst «Üretici kodu» (derselbe Wert, nie gedruckt);
 *   · Pflicht einer FERTIGEN Karte: Name, Einheit, ein Lieferant, eine
 *     Lieferanten-E-Mail — ohne sie nur «Taslak olarak kaydet».
 */

/** Was die Felder zeigen — Texte, wie getippt. ERP-Code und Barcode vergibt der Server. */
export interface FormState {
    materialGroup: WarehouseGroupRef | null;
    name: string;
    brand: string;
    /** «Üretici kodu» (früher «Model numarası»). */
    modelNumber: string;
    productCode: string;
    unit: WarehouseUnit | null;
    /**
     * Die Lieferanten, jeder mit seiner E-Mail und seinem Barcode des Produkts
     * — dazu höchstens eine Zeile mit Barcode, aber ohne Lieferant (der
     * Herstellerbarcode der Karte), und am Ende die leere Zeile.
     */
    suppliers: SupplierRow[];
    description: string;
    quantity: string;
    purchasePrice: string;
    /** Mindestbestellmenge (BOM: «bu minimum alışın altında sipariş verilemez»). */
    minimumOrderQuantity: string;
    currency: string;
    serialRequired: boolean;
}

export const EMPTY_FORM: FormState = {
    materialGroup: null,
    name: '',
    brand: '',
    modelNumber: '',
    productCode: '',
    unit: 'PCS',
    suppliers: supplierRowsOf(null),
    description: '',
    quantity: '0',
    purchasePrice: '',
    minimumOrderQuantity: '',
    currency: 'CHF',
    serialRequired: false,
};

export const formOf = (product: WarehouseProduct): FormState => ({
    materialGroup: product.materialGroup ? { ...product.materialGroup } : null,
    name: product.name,
    brand: product.brand ?? '',
    modelNumber: product.modelNumber ?? '',
    productCode: product.productCode ?? '',
    unit: product.unit ?? null,
    suppliers: supplierRowsOf(product),
    description: product.description ?? '',
    quantity: numberToInput(product.quantity),
    purchasePrice: priceToInput(product.purchasePrice),
    minimumOrderQuantity: numberToInput(product.minimumOrderQuantity),
    currency: product.currency ?? 'CHF',
    serialRequired: product.serialRequired,
});

export const sameForm = (a: FormState, b: FormState): boolean =>
    (a.materialGroup?.id ?? null) === (b.materialGroup?.id ?? null)
    && a.name === b.name
    && a.brand === b.brand
    && a.modelNumber === b.modelNumber
    && a.productCode === b.productCode
    && a.unit === b.unit
    && sameSupplierRows(a.suppliers, b.suppliers)
    && a.description === b.description
    && (a.serialRequired || a.quantity === b.quantity)
    && a.purchasePrice === b.purchasePrice
    && a.minimumOrderQuantity === b.minimumOrderQuantity
    && (a.purchasePrice.trim() === '' || a.currency === b.currency)
    && a.serialRequired === b.serialRequired;

/** Ein Fehler an einem Feld — bei den Lieferanten auch an einer Zeile. */
export interface FieldError {
    field: keyof FormState;
    text: string;
    rowKey?: string | null;
}

export type Built = { input: WarehouseProductInput } | (FieldError & { error: string });

/**
 * Was einer FERTIGEN Karte fehlt (Samet, 30.09.2026: «ürün adı, tedarikçi en
 * az bir, tedarikçi maili en az bir tane … her ürünün de birim türü») —
 * dieselbe Regel wie der Server (`missingForComplete`).
 */
export const missingOf = (form: FormState): WarehouseMissingField[] => {
    const missing: WarehouseMissingField[] = [];
    const suppliers = form.suppliers.filter((row) => row.value);
    if (!form.name.trim()) missing.push('name');
    if (!form.unit) missing.push('unit');
    if (!suppliers.length) missing.push('supplier');
    if (!suppliers.some((row) => row.email.trim())) missing.push('supplierEmail');
    return missing;
};

/** Das Feld, auf das ein fehlender Punkt zeigt (Fehler, Fokus). */
export const fieldOfMissing = (missing: WarehouseMissingField): keyof FormState =>
    (missing === 'name' ? 'name' : missing === 'unit' ? 'unit' : 'suppliers');

/** Die Felder als Eingabe des Servers; `base` = nur, was sich geändert hat. */
export const buildInput = (form: FormState, base: FormState | null): Built => {
    const name = form.name.trim();
    if (!name) return { error: t('warehouse.fields.nameMissing'), text: t('warehouse.fields.nameMissing'), field: 'name' };
    const quantity = parseInputNumber(form.quantity);
    if (!form.serialRequired && quantity !== null && (Number.isNaN(quantity) || quantity < 0)) {
        return { error: t('warehouse.err.QUANTITY_INVALID'), text: t('warehouse.err.QUANTITY_INVALID'), field: 'quantity' };
    }
    const price = parseInputNumber(form.purchasePrice);
    if (price !== null && (Number.isNaN(price) || price < 0)) {
        return { error: t('warehouse.err.PRICE_INVALID'), text: t('warehouse.err.PRICE_INVALID'), field: 'purchasePrice' };
    }
    const minimum = parseInputNumber(form.minimumOrderQuantity);
    if (minimum !== null && (Number.isNaN(minimum) || minimum < 0)) {
        return { error: t('warehouse.err.MIN_ORDER_INVALID'), text: t('warehouse.err.MIN_ORDER_INVALID'), field: 'minimumOrderQuantity' };
    }
    const suppliers = supplierInputOf(form.suppliers);
    if ('errorKey' in suppliers) {
        const error = suppliers.kind === 'email'
            ? t('warehouse.supplier.emailInvalid', { email: suppliers.code })
            : t('warehouse.supplier.barcodeWithoutSupplier', { code: suppliers.code });
        return { error, text: error, field: 'suppliers', rowKey: suppliers.errorKey };
    }
    const text = (value: string) => value.trim() || null;
    const full: WarehouseProductInput = {
        materialGroupId: form.materialGroup?.id ?? null,
        name,
        brand: text(form.brand),
        modelNumber: text(form.modelNumber),
        productCode: text(form.productCode),
        unit: form.unit,
        suppliers: suppliers.suppliers,
        description: form.description.trim() ? form.description : null,
        purchasePrice: price,
        minimumOrderQuantity: minimum ? minimum : null,
        currency: price === null ? null : form.currency,
        manufacturerBarcode: suppliers.manufacturerBarcode,
        serialRequired: form.serialRequired,
        ...(form.serialRequired ? {} : { quantity: quantity ?? 0 }),
    };
    if (!base) return { input: full };

    const before = buildInput(base, null);
    if (!('input' in before)) return { input: full };
    const diff: WarehouseProductInput = {};
    const keys = Object.keys(full) as Array<keyof WarehouseProductInput>;
    for (const key of keys) {
        if (JSON.stringify(full[key]) !== JSON.stringify(before.input[key])) {
            (diff as Record<string, unknown>)[key] = full[key];
        }
    }
    return { input: diff };
};
