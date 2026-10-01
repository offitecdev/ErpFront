import type { ComparisonLine, ComparisonResult } from '@/types/purchasing';

/**
 * ── DIE AUSWAHL IM VERGLEICH (30.09.2026, Vorgabe Samet) ───────────────────
 * «Oradan seçim yapabiliyoruz — seçili olarak geliyor en uygun teklif — sonra
 *  tedarikçi özelinde sipariş oluştur.» Je Zeile EIN Angebot (Stelle des
 * Lieferanten) oder keines. Vorgewählt ist das günstigste; eine Zeile ohne
 * Preis bleibt leer. Reine Funktionen.
 */
export type Selection = Record<string, number | null>;

export const initialSelection = (result: ComparisonResult): Selection =>
    Object.fromEntries(result.lines.map((line) => [line.bomLineId, line.best !== null && line.offers[line.best]?.unitPrice !== null ? line.best : null]));

/** Darf dieses Angebot gewählt werden? (gefragt und mit Preis) */
export const selectable = (line: ComparisonLine, supplier: number): boolean => {
    const offer = line.offers[supplier];
    return Boolean(offer && offer.asked !== false && offer.unitPrice !== null);
};

export interface SupplierPick {
    supplier: number;
    lines: ComparisonLine[];
    total: number;
}

/**
 * Die Auswahl je Lieferant — was je eine Bestellung wird, in der Reihenfolge der
 * Spalten. `skip` = Zeilen, die nicht bestellt würden (am Lager, schon bestellt);
 * `quantities` = die Bestellmenge je Zeile (was fehlt, nie unter der Mindestmenge)
 * — der Betrag rechnet dann mit ihr statt mit der angefragten Menge.
 */
export const picksBySupplier = (
    result: ComparisonResult,
    selection: Selection,
    skip: ReadonlySet<string> = new Set(),
    quantities: Readonly<Record<string, number>> = {},
): SupplierPick[] => {
    const groups = new Map<number, SupplierPick>();
    for (const line of result.lines) {
        if (skip.has(line.bomLineId)) continue;
        const supplier = selection[line.bomLineId];
        if (supplier === null || supplier === undefined || !selectable(line, supplier)) continue;
        const group = groups.get(supplier) ?? { supplier, lines: [], total: 0 };
        const offer = line.offers[supplier];
        const quantity = quantities[line.bomLineId];
        group.lines.push(line);
        group.total += quantity && offer?.unitPrice !== null && offer?.unitPrice !== undefined ? offer.unitPrice * quantity : offer?.total ?? 0;
        groups.set(supplier, group);
    }
    return [...groups.values()].sort((a, b) => a.supplier - b.supplier);
};

export const selectionPayload = (selection: Selection, result: ComparisonResult, skip: ReadonlySet<string> = new Set()): Array<{ bomLineId: string; supplier: number }> =>
    result.lines.flatMap((line) => {
        if (skip.has(line.bomLineId)) return [];
        const supplier = selection[line.bomLineId];
        return supplier !== null && supplier !== undefined && selectable(line, supplier) ? [{ bomLineId: line.bomLineId, supplier }] : [];
    });
