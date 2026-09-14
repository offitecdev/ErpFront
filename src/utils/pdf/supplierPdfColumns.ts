/**
 * ── DIE SPALTEN DER LIEFERANTEN-PDFs KOMMEN AUS DER VORLAGE ─────────────────
 * Vorgabe Samet (11.09.2026): «MATERIALBESCHREIBUNG · PRODUKTTYPNUMMER ·
 * BESTELLNUMMER · HERSTELLER · EINHEIT · GESAMTMENGE · GESAMTLÄNGE — steht
 * die Tabelle so, muss das PDF genauso aussehen. Eine Spalte, die ich auf
 * ‹Menge› gelegt habe, heisst im PDF trotzdem GESAMTMENGE.»
 *
 * Die Bestellung traegt dafuer den Schnappschuss ihrer Vorlage
 * (`tableColumns`: Schluessel, Name, Zuordnung, Typ, in der Reihenfolge der
 * Vorlage). Hier wird daraus die Spaltenliste des Blattes:
 *
 *   · Jede Vorlagenspalte MIT Zuordnung wird die feste Spalte, auf die sie
 *     zeigt (Produktname → Beschreibung, Menge → Menge, Einzelpreis → …) —
 *     mit dem NAMEN aus der Vorlage als Titel, an der Stelle der Vorlage.
 *   · Jede freie Vorlagenspalte wird eine eigene Spalte (`extras[key]`) —
 *     auch wenn keine Position einen Wert traegt: die Tabelle zeigte sie.
 *   · Eigene Angaben, die der Schnappschuss nicht kennt (aeltere Bestellung,
 *     seither geaenderte Vorlage), kommen dahinter, wie bisher.
 *   · Feste Spalten, die das Dokument braucht, die Vorlage aber nicht hatte
 *     (Nettopreis und Betrag einer Bestellung, die als Preisanfrage erfasst
 *     wurde; die MwSt, die keine Zuordnung kennt), stehen an ihrem
 *     herkoemmlichen Platz mit dem Titel des Dokuments.
 *
 * OHNE Schnappschuss (Bestellungen vor dem 11.09.2026) entsteht genau die
 * bisherige Reihenfolge: Beschreibung, eigene Spalten, Menge, Preise.
 * Der ERP-Code steht nie im PDF; ausgeblendete Schluessel (`hiddenColumnKeys`)
 * bleiben weg. Beide Lieferanten-PDFs (Bestellung, Preisanfrage) lesen NUR
 * diese Liste — Titel, Masse und Zeilen sehen dieselben Spalten.
 */
import type { PurchaseOrderRow, TemplateLabel } from '../../types/inventory';

/** Die feste Rolle einer Spalte — `extra` ist eine freie Spalte der Vorlage. */
export type SupplierPdfColumnKind = 'desc' | 'qty' | 'gross' | 'net' | 'disc' | 'vat' | 'price' | 'extra';
export type SupplierPdfFixedKind = Exclude<SupplierPdfColumnKind, 'extra'>;

export interface SupplierPdfColumn {
    kind: SupplierPdfColumnKind;
    /** Bei einer freien Spalte der Schluessel der eigenen Angabe, sonst die Rolle. */
    key: string;
    /** Der Titel, wie er gedruckt wird — noch nicht in Grossbuchstaben. */
    caption: string;
}

export interface SupplierPdfColumnOptions {
    /** Die Titel des Dokuments fuer feste Spalten, die die Vorlage nicht benennt. */
    captions: Partial<Record<SupplierPdfFixedKind, string>>;
    /**
     * Die festen Spalten, die das Blatt neben der Beschreibung TRAEGT — schon
     * gefiltert (eine Bestellung ohne Rabatte hat keine Rabattspalte).
     */
    fixed: Array<Exclude<SupplierPdfFixedKind, 'desc'>>;
    /** Schluessel, die die Vorlage ausgeblendet hatte (`hiddenColumnKeys`). */
    hidden: Set<string>;
    /** Hoechstzahl freier Spalten auf dem Blatt (A4 hochkant: sechs). */
    maxExtras: number;
}

/** Welche feste Spalte eine Zuordnung der Vorlage bedeutet. */
const LABEL_KIND: Record<TemplateLabel, SupplierPdfFixedKind> = {
    productName: 'desc',
    quantity: 'qty',
    grossPrice: 'gross',
    netPrice: 'net',
    discount: 'disc',
    discount2: 'disc',
    total: 'price',
};

/** Die herkoemmliche Reihenfolge der festen Spalten — gilt, wo die Vorlage schweigt. */
const LEGACY_ORDER: SupplierPdfFixedKind[] = ['desc', 'qty', 'gross', 'net', 'disc', 'vat', 'price'];

/**
 * Die eigenen Angaben, wie sie an den Positionen stehen: Schluessel + Titel in
 * der Reihenfolge des ersten Auftretens — der Weg fuer Bestellungen ohne
 * Schnappschuss und fuer Angaben, die die Vorlage nicht mehr kennt.
 */
const extrasFromItems = (order: PurchaseOrderRow): Array<{ key: string; name: string }> => {
    const seen = new Map<string, string>();
    for (const item of order.items ?? []) {
        for (const entry of item.extras ?? []) {
            if (entry?.key && entry?.name && !seen.has(entry.key)) seen.set(entry.key, String(entry.name));
        }
    }
    return [...seen.entries()].map(([key, name]) => ({ key, name }));
};

export function resolveSupplierPdfColumns(order: PurchaseOrderRow, options: SupplierPdfColumnOptions): SupplierPdfColumn[] {
    const wanted = new Set<SupplierPdfFixedKind>(['desc', ...options.fixed]);
    const placed = new Set<SupplierPdfFixedKind>();
    const placedKeys = new Set<string>();
    const columns: SupplierPdfColumn[] = [];
    let extras = 0;

    const pushExtra = (key: string, caption: string) => {
        if (options.hidden.has(key) || placedKeys.has(key) || extras >= options.maxExtras) return;
        placedKeys.add(key);
        extras += 1;
        columns.push({ kind: 'extra', key, caption });
    };

    // 1) Die Vorlage, Spalte fuer Spalte — Name und Platz sind ihre.
    for (const column of order.tableColumns ?? []) {
        const name = String(column?.name ?? '').trim();
        const key = String(column?.key ?? '').trim();
        if (!name || !key) continue;
        if (column.label) {
            const kind = LABEL_KIND[column.label];
            if (!kind || !wanted.has(kind) || placed.has(kind)) continue;
            placed.add(kind);
            columns.push({ kind, key: kind, caption: name });
        } else {
            pushExtra(key, name);
        }
    }

    // 2) Eigene Angaben der Positionen, die die Vorlage nicht (mehr) kennt.
    for (const extra of extrasFromItems(order)) pushExtra(extra.key, extra.name);

    // 3) Feste Spalten, die noch fehlen — an ihrem herkoemmlichen Platz: die
    //    Beschreibung ganz vorn, jede andere vor der naechsten festen Spalte,
    //    die in der herkoemmlichen Reihenfolge nach ihr kaeme, sonst hinten.
    for (const kind of LEGACY_ORDER) {
        if (!wanted.has(kind) || placed.has(kind)) continue;
        const column: SupplierPdfColumn = { kind, key: kind, caption: options.captions[kind] ?? '' };
        if (kind === 'desc') {
            columns.unshift(column);
        } else {
            const later = LEGACY_ORDER.slice(LEGACY_ORDER.indexOf(kind) + 1);
            const at = columns.findIndex((entry) => entry.kind !== 'extra' && later.includes(entry.kind as SupplierPdfFixedKind));
            if (at < 0) columns.push(column);
            else columns.splice(at, 0, column);
        }
        placed.add(kind);
    }
    return columns;
}
