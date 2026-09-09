import type { TemplateColumn } from '@/types/inventory';

/* ═══════════════════════════════════════════════════════════════════════════
   DIE REIHENFOLGE DER SPALTEN (Vorgabe Samet, 09.09.2026)

   «Sowohl die festen Felder als auch die anderen Spalten müssen verstellbar
    sein — einmal in der Tabelle sollen sie sich vertauschen lassen, oder es
    gibt seitlich einen Listenknopf, über den man die Reihenfolge verwaltet.
    Die in der Vorlage gespeicherten Felder erscheinen dort, und die festen
    Felder und die zusätzlich angelegten liegen in DERSELBEN Liste, damit man
    ihre Reihenfolge festlegen kann.»

   Bis heute war die Reihenfolge fest verdrahtet: Name, dann die eigenen
   Angaben der Vorlage, dann Nummer, Menge, Preise, Rabatte, Betrag. Die
   eigenen Angaben liessen sich untereinander in der Vorlage umstellen, die
   festen überhaupt nicht — und die zwei Gruppen konnten sich nie mischen.

   Jetzt gibt es EINE Liste von Schlüsseln. Oben in der Liste = links in der
   Tabelle. Sie enthält beides, feste und eigene, ohne Unterschied.

   WO SIE LIEGT: im Browser, je Anwender — dieselbe Stelle, an der auch die
   Spaltenbreiten wohnen (`useColumnWidths`). Sie ist eine ANSICHTSSACHE, keine
   Eigenschaft der Bestellung: zwei Leute dürfen dieselbe Bestellung
   unterschiedlich sortiert vor sich haben, und ein gespeicherter Beleg ändert
   sich davon nicht. Das PDF folgt weiterhin der Vorlage.
   ═════════════════════════════════════════════════════════════════════════ */

/** Die festen Felder der Bestelltabelle. Die eigenen Angaben heissen `x1`…`x5`. */
export type FixedOrderColumn =
    | 'name'
    | 'code'
    | 'quantity'
    | 'grossPrice'
    | 'netPrice'
    | 'discount'
    | 'discount2'
    | 'lineTotal';

/** Ein Spaltenschlüssel: entweder ein festes Feld oder eine eigene Angabe. */
export type OrderColumnId = FixedOrderColumn | string;

/**
 * Die VORGABE — genau die Reihenfolge, die die Tabelle vor dem 09.09.2026
 * hatte: der Name zuerst, gleich danach die eigenen Angaben, dann die Zahlen.
 * Wer nie etwas umstellt, sieht deshalb keinen Unterschied.
 */
export const defaultOrderColumns = (extras: TemplateColumn[], priceless: boolean): OrderColumnId[] => [
    'name',
    ...extras.map((column) => column.key),
    'code',
    'quantity',
    ...(priceless ? [] : ['grossPrice', 'netPrice', 'discount', 'discount2', 'lineTotal'] as FixedOrderColumn[]),
];

/**
 * Die gespeicherte Reihenfolge auf die HEUTE gültigen Spalten anwenden.
 *
 * Zwei Fälle müssen sauber aufgehen, sonst verliert jemand eine Spalte:
 *
 *  • WEGGEFALLEN — die gespeicherte Liste nennt einen Schlüssel, den es nicht
 *    mehr gibt (eine eigene Angabe wurde in der Vorlage gelöscht, oder die
 *    Maske steht auf Preisanfrage und kennt keine Preise): er fällt still weg.
 *  • NEU DAZU — eine Spalte, die die gespeicherte Liste noch nicht kennt (eine
 *    frisch angelegte eigene Angabe). Sie wird NICHT ans Ende gehängt, sondern
 *    dorthin gesetzt, wo die Vorgabe sie hätte: hinter ihren Vorgänger aus der
 *    Vorgabe. Sonst landete eine neue Angabe rechts neben dem Zeilenbetrag,
 *    und man müsste sie jedes Mal von Hand nach vorn holen.
 */
export const resolveOrderColumns = (
    stored: OrderColumnId[] | null,
    extras: TemplateColumn[],
    priceless: boolean,
): OrderColumnId[] => {
    const fallback = defaultOrderColumns(extras, priceless);
    if (!stored?.length) return fallback;

    const valid = new Set(fallback);
    const result = stored.filter((id) => valid.has(id));
    const present = new Set(result);

    fallback.forEach((id, index) => {
        if (present.has(id)) return;
        // Den nächsten Vorgänger suchen, der schon in der Liste steht.
        let at = result.length;
        for (let back = index - 1; back >= 0; back -= 1) {
            const anchor = fallback[back];
            const found = result.indexOf(anchor);
            if (found >= 0) { at = found + 1; break; }
        }
        result.splice(at, 0, id);
        present.add(id);
    });

    return result;
};

/* ═══════════════════════════════════════════════════════════════════════════
   DIE VORLAGE ENTSCHEIDET, WELCHE SPALTEN ES GIBT (Vorgabe Samet, 09.09.2026)

   «Drücken wir auf unsichtbar, muss die Spalte unsichtbar werden — das gehört
    direkt auf die Tabelle angewendet.»

   Die Vorlage kennt ihre Felder unter EIGENEN Namen (`priceGross`, `priceNet`),
   die Tabelle unter ihren (`grossPrice`, `netPrice`). Solange niemand die zwei
   Listen aneinanderhielt, blieb das Auge-Symbol in der Vorlage folgenlos: es
   hielt den Wert nur aus dem KI-Import heraus, die Spalte stand weiter da.
   Diese Übersetzung ist die Stelle, an der beide Listen sich treffen.
   ═════════════════════════════════════════════════════════════════════════ */
const TEMPLATE_TO_COLUMN: Record<string, FixedOrderColumn> = {
    code: 'code',
    name: 'name',
    quantity: 'quantity',
    priceGross: 'grossPrice',
    priceNet: 'netPrice',
    discount: 'discount',
    discount2: 'discount2',
    lineTotal: 'lineTotal',
};

/**
 * Die SICHTBAREN Spalten einer Vorlage als Tabellenschlüssel. Was hier fehlt,
 * zeichnet die Tabelle nicht — eigene Angaben tragen in beiden Listen denselben
 * Schlüssel (`x1`…`x5`) und gehen unverändert durch.
 */
export const orderColumnIdsFromTemplate = (columns: TemplateColumn[]): Set<OrderColumnId> =>
    new Set(columns.map((column) => TEMPLATE_TO_COLUMN[column.key] ?? column.key));

/** Eine Spalte um eine Stelle verschieben (−1 nach oben/links, +1 nach unten/rechts). */
export const moveOrderColumn = (order: OrderColumnId[], id: OrderColumnId, delta: number): OrderColumnId[] => {
    const from = order.indexOf(id);
    if (from < 0) return order;
    const to = from + delta;
    if (to < 0 || to >= order.length) return order;
    const next = [...order];
    next.splice(to, 0, next.splice(from, 1)[0]!);
    return next;
};

/** Eine Spalte an eine bestimmte Stelle ziehen (Ablegen im Listenfenster). */
export const dropOrderColumn = (order: OrderColumnId[], id: OrderColumnId, targetIndex: number): OrderColumnId[] => {
    const from = order.indexOf(id);
    if (from < 0 || from === targetIndex) return order;
    const next = [...order];
    const [moved] = next.splice(from, 1);
    next.splice(from < targetIndex ? targetIndex - 1 : targetIndex, 0, moved!);
    return next;
};

/**
 * ZWEI TABELLEN, ZWEI REIHENFOLGEN (09.09.2026). Die Bestellmaske und der
 * Wareneingang zeigen dieselben Spalten, aber man arbeitet dort verschieden:
 * beim Erfassen zaehlen die Preise, beim Einlagern Code und Menge. Wer den
 * Wareneingang umstellt, soll die Bestellmaske nicht mitverstellen — darum
 * hat jede Seite ihren eigenen Platz im Browser. Die Breiten daneben
 * (`useColumnWidths`) trennen sie schon immer genauso.
 */
export type OrderColumnScope = 'order' | 'receipt';

const STORAGE_KEYS: Record<OrderColumnScope, string> = {
    order: 'offitec:inv-order-create:col-order:v1',
    receipt: 'offitec:inv-order-receive:col-order:v1',
};

export const readStoredOrderColumns = (scope: OrderColumnScope = 'order'): OrderColumnId[] | null => {
    try {
        const raw = window.localStorage.getItem(STORAGE_KEYS[scope]);
        const parsed = raw ? (JSON.parse(raw) as unknown) : null;
        return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === 'string') : null;
    } catch {
        // Privater Modus: dann gilt eben die Vorgabe.
        return null;
    }
};

export const writeStoredOrderColumns = (order: OrderColumnId[] | null, scope: OrderColumnScope = 'order'): void => {
    try {
        if (order) window.localStorage.setItem(STORAGE_KEYS[scope], JSON.stringify(order));
        else window.localStorage.removeItem(STORAGE_KEYS[scope]);
    } catch {
        /* Speicher nicht verfügbar — dann eben nicht dauerhaft. */
    }
};
