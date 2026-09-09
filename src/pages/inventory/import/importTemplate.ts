/**
 * ── DIE VORLAGE DES BELEG-IMPORTS ───────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026, letzter Stand):
 *
 *   «Es gibt keine Spaltenauswahl mehr; es ist einfach netto/brutto, Rabatt 1
 *    und Rabatt 2 (freiwillig) — feste Felder, direkt aus der Vorlage wählbar.
 *    Fehlt ein Produktcode, wird einer vergeben; der Produktname gehört dazu —
 *    das ist Standard. Daneben soll man drei weitere Angaben hinzufügen können;
 *    die müssen im PDF sauber dastehen, auch wenn die Liste länger wird.»
 *   «Die Vorlagen und Einstellungen werden gleich am Anfang festgelegt. Was
 *    dort eingestellt ist, bleibt für die folgenden Bestellungen die Vorgabe,
 *    bis man es ändert.»
 *   «Der Import übernimmt nur die eingestellten Angaben; er rechnet nichts vor.»
 *
 * ── WAS AN DAS MODELL GEHT ────────────────────────────────────────────────
 * Ausschliesslich SPALTENÜBERSCHRIFTEN, und zwar diese:
 *
 *   code      Produktcode        immer      (fehlt er auf dem Beleg: leer, der
 *                                            Server vergibt beim Speichern einen)
 *   name      Bezeichnung        immer
 *   quantity  Menge              immer
 *   price     Brutto- ODER Nettopreis — was von beidem, sagt `priceIsGross`
 *   discount  Rabatt 1           immer
 *   discount2 Rabatt 2           nur wenn eingeschaltet
 *   x1 … x3   eigene Angaben     0 bis 3
 *
 * Aus dieser Liste baut der Server das Antwortschema (`gptExtract.ts`). Was
 * nicht in der Liste steht, wird nicht gelesen und kostet keine Token — die
 * Vorlage ist damit zugleich die Sparbremse.
 *
 * ── WAS DER IMPORT TUT — UND WAS NICHT ────────────────────────────────────
 * `extractedToDraftRow` ist eine ZUORDNUNG und keine Rechnung. Gerechnet wird
 * erst, wenn jemand den RECHENMODUS einschaltet — und dann dort, wo immer
 * gerechnet wurde: in der Bestelltabelle (`utils/orderRowMode.ts`).
 *
 * ── DIE MENGENSTAFFEL ─────────────────────────────────────────────────────
 * «Die Werte ändern sich je nach Menge, das System muss den passenden nehmen,
 * sobald die Menge gewählt ist.» Das ist ein NACHSCHLAGEN, keine Rechnung:
 * `repriceRow` sucht zu einer geänderten Menge die passende Stufe heraus. Es
 * gewinnt immer die spezifischere Regel, und ein fester Preis schlägt jede
 * Prozentangabe:
 *
 *   1. Staffel des LIEFERANTEN mit festem Stückpreis  → dieser Preis, Ende.
 *   2. Staffel des BELEGS («ab 10 Stk 17.50»)         → dieser Preis, Ende.
 *   3. Staffel des Lieferanten mit Rabatt             → wird Rabatt 1.
 *   4. Keine Stufe erreicht                           → die Zeile bleibt.
 *
 * «Ende» heisst wörtlich: ein Staffelpreis IST der Endpreis, auf ihn fällt kein
 * Rabatt mehr. Alles andere wäre doppelt gerechnet — und genau das ist der
 * Fehler, den man in einer Bestellung nie sieht, weil das Ergebnis plausibel
 * aussieht.
 */

import { t } from '@/i18n/translate';
import type {
    AiExtractedRow,
    AiPriceTier,
    OrderCalcMode,
    SupplierCalcConfig,
    SupplierQtyTier,
    TemplateColumn,
} from '@/types/inventory';
import { ORDER_MAX_EXTRA_COLUMNS, TEMPLATE_MAX_EXTRA_COLUMNS } from '@/types/inventory';
import type { DraftOrderRow } from '../types';
import { parseNum } from '../utils/format';
import { clampPercent, round2 } from '../utils/orderPricing';

/* ═══════════════════════════════════════════════════════════════════════════
   1) DIE VORLAGE
   ═════════════════════════════════════════════════════════════════════════ */

/** Die Vorgabe: netto, Rabatt 2 an, Staffel lesen, keine eigenen Angaben. */
export const defaultCalcConfig = (vatRate = 0, vatCountry = '', currency = 'CHF'): SupplierCalcConfig => ({
    // Ohne ausdrueckliche Wahl bleibt eine Vorlage eine manuelle Eingabe.
    calcMode: 'DIRECT',
    discount2Enabled: true,
    extraColumns: [],
    hiddenColumnKeys: [],
    withTiers: true,
    discounts: [],
    vatRate,
    vatCountry,
    currency,
    qtyTiers: [],
});

/** Freie Schlüssel für eigene Angaben: `x1` … `x3`. */
export const nextExtraKey = (columns: TemplateColumn[]): string | null => {
    for (let index = 1; index <= TEMPLATE_MAX_EXTRA_COLUMNS; index += 1) {
        const key = `x${index}`;
        if (!columns.some((column) => column.key === key)) return key;
    }
    return null;
};

/**
 * DIE SPALTENÜBERSCHRIFTEN, so wie sie an das Modell gehen. Die festen Felder
 * tragen die Beschriftung der Bestelltabelle — dieselbe Sprache, die der
 * Anwender auf dem Bildschirm sieht, und damit auch die, in der er das
 * Ergebnis erwartet.
 */
/**
 * DIE FELDER, DIE GELESEN WERDEN — je nach Ziel (Vorgabe Samet, 07.09.2026):
 *
 *   BESTELLUNG     Nummer, Bezeichnung, Menge, beide Preise, die Rabatte und
 *                  der Zeilenbetrag; dazu bis zu DREI eigene Angaben.
 *   PREISANFRAGE   NUR Produktcode, Produktname und Menge — «dort findet keine
 *                  Berechnung statt» —, dazu bis zu FÜNF eigene Angaben.
 *
 * Die eigenen Angaben reisen nur mit, wenn sie benannt sind: eine namenlose
 * Spalte sagt dem Modell nichts und kostete trotzdem Token.
 */
export const templateColumnOptions = (
    config: SupplierCalcConfig,
    priceless = false,
): TemplateColumn[] => {
    /* DIE DREI, DIE JEDER BELEG TRAEGT — und in einer Preisanfrage die
       einzigen (Vorgabe Samet, 08.09.2026): «Produktcode, Produktname und
       Menge.» Fehlt der Code, vergibt ihn der Server beim Speichern
       (ART-NNNNN), die Spalte darf also leer bleiben.

       ⚠ DER WARENEINGANG TRAEGT SIE SEIT DEM 09.09.2026 AUCH (Vorgabe Samet:
       «beim Wareneingang muessen Produktcode und Produktname in derselben
       Vorlage liegen»). Vorher bekam er als einzige Spalte die MENGE, und das
       hatte eine Folge, die man erst beim Einlesen merkte: ohne Code und Name
       konnte der gelesene Beleg seine Zeile nicht wiederfinden
       (`importedRowMatches` sucht nach Code, ersatzweise nach Name) — die
       Werte wurden der REIHE NACH ueber die Bestellzeilen gelegt. Steht der
       Lieferschein in anderer Reihenfolge als die Bestellung, landete jede
       Menge auf der falschen Zeile. Darum kennt die Vorlage hier jetzt
       dieselben Felder wie ueberall; das Ziel entscheidet nicht mehr, WELCHE
       Felder es gibt, nur noch, was daraus gerechnet wird. */
    const columns: TemplateColumn[] = [
        { key: 'code', name: t('inv.columns.serialCode'), type: 'text' },
        { key: 'name', name: t('inv.columns.productName'), type: 'text' },
        { key: 'quantity', name: t('inv.columns.quantity'), type: 'number' },
    ];
    /* ⚠ HIER ENDET DIE PREISANFRAGE. Alles Weitere — beide Preise, die
       Rabatte, der Zeilenbetrag — ist Rechnung, und die gibt es dort nicht.
       Die Preisfelder standen bis zum 08.09.2026 versehentlich ueber diesem
       Ausstieg und reisten darum auch in einer preislosen Anfrage mit: sie
       kosteten Token und luden das Modell ein, Preise zu erfinden, die auf
       dem Beleg gar nicht standen. */
    if (priceless) {
        for (const extra of namedExtras(config, TEMPLATE_MAX_EXTRA_COLUMNS)) columns.push(extra);
        return columns;
    }
    // NEBENEINANDER (Vorgabe Samet): der Einzelpreis (Liste) UND der
    // Nettopreis. Beide werden gelesen; welcher am Ende zählt, entscheidet
    // die Berechnung, nicht die Vorlage.
    columns.push({ key: 'priceGross', name: t('inv.orders.columns.grossPrice'), type: 'number' });
    columns.push({ key: 'priceNet', name: t('inv.orders.columns.netPrice'), type: 'number' });
    columns.push({ key: 'discount', name: t('inv.orders.columns.discount'), type: 'number' });
    if (config.discount2Enabled) {
        columns.push({ key: 'discount2', name: t('inv.orders.columns.discount2'), type: 'number' });
    }
    /* DER ZEILENBETRAG WIRD MITGELESEN (Vorgabe Samet, 07.09.2026): «Das
       Modell soll die Zeilensummen gleich mitrechnen und anzeigen, statt sie
       den Benutzer eintippen zu lassen.» Er steht am Ende, damit die Spalte
       in der Pruefung rechts liegt — dort, wo sie auch in der Bestelltabelle
       steht. */
    columns.push({ key: 'lineTotal', name: t('inv.columns.lineTotal'), type: 'number' });
    for (const extra of namedExtras(config, ORDER_MAX_EXTRA_COLUMNS)) columns.push(extra);
    return columns;
};

/**
 * Only visible columns cross the AI boundary. This is intentionally applied
 * here, at the last shared point used by the request, review and row mapping,
 * so a hidden value cannot leak into a prompt or be applied accidentally.
 */
export const templateColumns = (
    config: SupplierCalcConfig,
    priceless = false,
): TemplateColumn[] => {
    const hidden = new Set(config.hiddenColumnKeys ?? []);
    return templateColumnOptions(config, priceless)
        .filter((column) => !hidden.has(column.key));
};

/** Die benannten eigenen Angaben, auf die Obergrenze des Ziels geschnitten. */
const namedExtras = (config: SupplierCalcConfig, max: number): TemplateColumn[] =>
    (config.extraColumns ?? [])
        .filter((extra) => extra.name.trim())
        .slice(0, max)
        .map((extra) => ({ ...extra, name: extra.name.trim() }));

/**
 * Die Einstellung einer Vorlage in EINEM Satz — er steht unter dem Namen in
 * der Vorlagenliste und im Import-Fenster. Er nennt nur, was gesetzt ist:
 * eine Vorlage ohne Staffel soll nicht «0 Stufen» behaupten.
 */
export const templateSummary = (entry: SupplierCalcConfig): string => {
    const parts: string[] = [calcModeLabel(entry.calcMode ?? 'DIRECT')];
    if (!entry.discount2Enabled) parts.push(t('inv.aiImport.noDiscount2'));
    const named = (entry.extraColumns ?? []).filter((column) => column.name.trim()).length;
    if (named) parts.push(t('inv.aiImport.extraCount', { count: named }));
    const stack = (entry.discounts ?? []).filter((value) => value > 0);
    if (stack.length) parts.push(stack.map((value) => `${value}%`).join(' + '));
    if (entry.qtyTiers?.length) parts.push(t('inv.aiImport.tierCount', { count: entry.qtyTiers.length }));
    if (entry.vatRate > 0) parts.push(`${t('inv.orders.columns.vat')} ${entry.vatRate}%`);
    return parts.join(' · ');
};

/**
 * WAS BEIM RECHNEN GILT (Vorgabe Samet: «schaltet man den Rechenmodus ein,
 * ändert sich der Bildschirm, und der in der Vorlage gewählte Teil wird aktiv
 * und rechnet danach»).
 *
 * Die drei Möglichkeiten sind dieselben, die es im Haus seit je gibt — sie
 * werden nur nicht mehr nebenbei eingestellt, sondern im Rechenfenster gewählt:
 *
 *   DIRECT   Manuelle Eingabe: es steht, was gelesen wurde. Nichts rechnet.
 *   AUTO     Rabatte fallen auf den Preis; der Nettopreis wird abgeleitet.
 *   SUPPLIER Der Stückpreis steht fest, der Betrag wächst mit der Menge.
 */
export const CALC_MODES: OrderCalcMode[] = ['DIRECT', 'AUTO', 'SUPPLIER'];

export const calcModeLabel = (mode: OrderCalcMode): string => t(
    mode === 'AUTO' ? 'inv.orders.calcMode.auto'
        : mode === 'SUPPLIER' ? 'inv.orders.calcMode.supplier'
            : 'inv.orders.calcMode.direct',
);

export const calcModeHint = (mode: OrderCalcMode): string => t(
    mode === 'AUTO' ? 'inv.aiImport.modeAutoHint'
        : mode === 'SUPPLIER' ? 'inv.aiImport.modeSupplierHint'
            : 'inv.aiImport.modeDirectHint',
);

/* ═══════════════════════════════════════════════════════════════════════════
   2) MENGENSTAFFEL
   ═════════════════════════════════════════════════════════════════════════ */

/** Zahl aus einer erkannten Zelle — das Modell liefert Zahlen, aber nicht immer. */
const num = (value: unknown): number | null => {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) return null;
    return parseNum(String(value));
};

const text = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return '';
    return String(value).trim();
};

/** Die Staffeln einer erkannten Position, sortiert und von Unsinn befreit. */
export const rowPriceTiers = (row: AiExtractedRow): AiPriceTier[] => {
    const raw = row.priceTiers;
    if (!Array.isArray(raw)) return [];
    return raw
        .map((tier) => ({
            minQuantity: Number((tier as AiPriceTier)?.minQuantity) || 0,
            unitPrice: Number((tier as AiPriceTier)?.unitPrice) || 0,
        }))
        .filter((tier) => tier.minQuantity > 0 && tier.unitPrice > 0)
        .sort((a, b) => a.minQuantity - b.minQuantity);
};

/**
 * Die passende Stufe zu einer Menge: die HÖCHSTE, deren Menge erreicht ist.
 * Bei 7 Stück und den Stufen 1 / 5 / 10 gewinnt die 5.
 */
const matchTier = <T extends { minQuantity: number }>(tiers: T[], quantity: number): T | null => {
    let best: T | null = null;
    for (const tier of tiers) {
        if (quantity + 1e-9 >= tier.minQuantity && (!best || tier.minQuantity >= best.minQuantity)) best = tier;
    }
    return best;
};

export const matchSupplierTier = (tiers: SupplierQtyTier[], quantity: number): SupplierQtyTier | null =>
    matchTier(tiers ?? [], quantity);

export const matchDocumentTier = (tiers: AiPriceTier[], quantity: number): AiPriceTier | null =>
    matchTier(tiers ?? [], quantity);

/** Welche Regel den Preis bestimmt hat — die Tabelle zeigt es als Merkzeichen. */
export type PriceRule = 'base' | 'documentTier' | 'supplierTierPrice' | 'supplierTierDiscount';

export interface ResolvedLine {
    netPrice: number;
    discount: number;
    discount2: number;
    rule: PriceRule;
    /** Die Menge, ab der die greifende Stufe gilt (0 = keine Stufe). */
    tierFrom: number;
}

export interface PriceInput {
    netPrice: number | null;
    discount: number | null;
    discount2: number | null;
    priceTiers: AiPriceTier[];
}

/**
 * DIE STUFE ZU EINER MENGE. Kein Rabattstapel, keine Preisbasis — nur die
 * Frage «gilt für diese Menge ein anderer Preis?».
 */
export const resolveLinePrice = (
    input: PriceInput,
    quantity: number,
    config: SupplierCalcConfig,
): ResolvedLine => {
    const unchanged: ResolvedLine = {
        netPrice: input.netPrice ?? 0,
        discount: clampPercent(input.discount ?? 0),
        discount2: clampPercent(input.discount2 ?? 0),
        rule: 'base',
        tierFrom: 0,
    };

    // 1) Fester Stückpreis aus der Lieferantenstaffel — er schlägt alles.
    const supplierTier = matchSupplierTier(config.qtyTiers ?? [], quantity);
    if (supplierTier && supplierTier.unitPrice > 0) {
        return {
            netPrice: supplierTier.unitPrice,
            discount: 0,
            discount2: 0,
            rule: 'supplierTierPrice',
            tierFrom: supplierTier.minQuantity,
        };
    }

    // 2) Staffel des Belegs — der Preis, den der Lieferant für diese Menge druckt.
    const documentTier = matchDocumentTier(input.priceTiers ?? [], quantity);
    if (documentTier) {
        return {
            netPrice: documentTier.unitPrice,
            discount: 0,
            discount2: 0,
            rule: 'documentTier',
            tierFrom: documentTier.minQuantity,
        };
    }

    // 3) Staffelrabatt des Lieferanten — er ersetzt Rabatt 1, der zweite bleibt.
    if (supplierTier && supplierTier.discount > 0) {
        return {
            ...unchanged,
            discount: supplierTier.discount,
            rule: 'supplierTierDiscount',
            tierFrom: supplierTier.minQuantity,
        };
    }

    return unchanged;
};

/* ═══════════════════════════════════════════════════════════════════════════
   3) ERKANNTE ZEILE → BESTELLZEILE (reine Zuordnung)
   ═════════════════════════════════════════════════════════════════════════ */

let importSeed = 0;

/** Zahl → Zellentext; 0 und leer werden beide zur leeren Zelle. */
/**
 * ── 0.00 IST EIN WERT ───────────────────────────────────────────────────────
 * Fehlerbild Samet (08.09.2026): «Das Feld ist auf Dezimal gestellt, darum
 * weist es Werte ab; es muss sie auch dann annehmen, wenn sie 0.00 sind.»
 *
 * Hier stand `value ? String(value) : ''` — und 0 ist in JavaScript falsch.
 * Ein Beleg, auf dem ausdrücklich «0.00» steht (ein Rabatt von null, eine
 * Gratisposition, ein Betrag, der noch offen ist), kam damit als LEERE Zelle
 * an. Zwischen «da steht nichts» und «da steht ausdrücklich null» liegt aber
 * genau der Unterschied, um den es geht.
 *
 * Jetzt entscheidet allein `null`: das ist die leere Zelle. Jede Zahl —
 * auch die 0 — wird geschrieben.
 */
const cell = (value: number | null): string => (value === null || Number.isNaN(value) ? '' : String(value));

/**
 * DIE EIGENEN ANGABEN → EIGENE SPALTEN (Vorgabe Samet, 07.09.2026):
 * «Wir nehmen sie als feste Spalten RECHTS NEBEN den Produktnamen — nicht
 *  darunter —, insgesamt drei. Und ihre Reihenfolge muss sich ändern lassen,
 *  die Spaltenüberschriften wandern mit.»
 *
 * Hier entsteht darum nur noch die Zuordnung Schlüssel → Wert. Die
 * ÜBERSCHRIFTEN und ihre REIHENFOLGE stehen in der Vorlage (`extraColumns`) —
 * eine Zeile trägt sie nicht mit sich herum, sonst müsste ein Umstellen der
 * Spalten jede Zeile anfassen. Erst beim Speichern werden beide zu einer Liste
 * mit Namen zusammengelegt (`draftExtras`), damit eine in einem Jahr geöffnete
 * Bestellung ihre Spalten noch benennen kann.
 */
const extraValues = (row: AiExtractedRow, config: SupplierCalcConfig): Record<string, string> => {
    const values: Record<string, string> = {};
    const hidden = new Set(config.hiddenColumnKeys ?? []);
    for (const column of config.extraColumns ?? []) {
        if (!column.name.trim() || hidden.has(column.key)) continue;
        const value = text(row[column.key]);
        if (value) values[column.key] = value.slice(0, 240);
    }
    return values;
};

/**
 * Zeile + Vorlage → die Liste, die GESPEICHERT wird: Schlüssel, Überschrift
 * und Wert, in der Reihenfolge der Vorlage. Leere Spalten fallen weg — eine
 * Bestellung soll keine leeren Überschriften mit sich schleppen.
 */
export const draftExtras = (
    row: DraftOrderRow,
    columns: TemplateColumn[],
): Array<{ key: string; name: string; value: string; width: number }> => (columns ?? [])
    .filter((column) => column.name.trim())
    .map((column) => ({
        key: column.key,
        name: column.name.trim(),
        value: String(row.extras?.[column.key] ?? '').trim(),
        width: Math.round(Math.min(240, Math.max(80, column.width ?? 120))),
    }))
    .filter((entry) => entry.value);

/**
 * Umgekehrt: eine geladene Bestellung zurück in Spalten + Werte. Die
 * ÜBERSCHRIFTEN kommen aus der Bestellung selbst, nicht aus der heutigen
 * Vorlage — sonst trüge eine alte Bestellung plötzlich fremde Spaltennamen.
 */
export const extrasFromItems = (
    items: Array<{ extras?: Array<{ key: string; name: string; value: string; width?: number }> | null }>,
): TemplateColumn[] => {
    const seen = new Map<string, { name: string; width: number }>();
    for (const item of items) {
        for (const entry of item.extras ?? []) {
            if (entry?.key && entry?.name && !seen.has(entry.key)) {
                seen.set(entry.key, { name: entry.name, width: entry.width ?? 120 });
            }
        }
    }
    return [...seen.entries()].map(([key, entry]) => ({
        key,
        name: entry.name,
        width: entry.width,
        type: 'text' as const,
    }));
};

/**
 * Eine erkannte Position in eine Zeile der Bestelltabelle giessen.
 *
 * HIER WIRD NICHT GERECHNET. Jeder Wert kommt aus seinem festen Feld; die
 * Rabatte der Vorlage («bei diesem Lieferanten immer 20 %») füllen die
 * Rabattzellen nur dort, wo der Beleg selbst keinen Rabatt trägt — das ist
 * eine Einstellung, keine Rechnung.
 *
 * DER PRODUKTCODE DARF FEHLEN: er wird beim Speichern vergeben (der Server
 * kennt die Reihe `ART-NNNNN`). Hier bleibt die Zelle leer, statt eine Nummer
 * zu erfinden, die mit einer echten kollidieren könnte.
 */
/** Der Betrag einer Zahl — «-45.36 %» Rabatt ist ein Rabatt von 45.36 %. */
const magnitude = (value: number | null): number | null => (value === null ? null : Math.abs(value));

/** Eine Vorgabe von 0 ist keine Vorgabe: sie lässt die Zelle leer. */
const blankIfZero = (value: number | null | undefined): number | null => {
    const percent = clampPercent(value ?? 0);
    return percent > 0 ? percent : null;
};

export const extractedToDraftRow = (
    row: AiExtractedRow,
    config: SupplierCalcConfig,
    calcMode: OrderCalcMode = 'DIRECT',
): DraftOrderRow => {
    const visible = (key: string) => !(config.hiddenColumnKeys ?? []).includes(key);
    const tiers = rowPriceTiers(row);
    const quantityValue = visible('quantity') ? num(row.quantity) : null;
    const quantity = quantityValue ?? 1;

    /* BEIDE PREISE, jeder in seiner Spalte: der Einzelpreis ist der
       Ausgangspreis (Rabatte fallen darauf), der Nettopreis der Endpreis.
       Der Beleg trägt oft nur einen von beiden — dann bleibt die andere Zelle
       leer, und die Tabelle leitet sie ab, sobald gerechnet wird. */
    const grossPrice = visible('priceGross') ? num(row.priceGross) : null;
    const netPrice = visible('priceNet') ? num(row.priceNet) : null;

    /* ── EIN RABATT AUF DEM BELEG STEHT OFT NEGATIV ─────────────────────────
       Fehlerbild Samet (08.09.2026): «Wenn der Rabatt -45.36 ist, dann ist der
       Preis der Nettopreis, 42.67.» Der Beleg druckt den Abzug als «-45.36 %»,
       und genau so kam er auch beim Modell heraus.

       Das war ein STILLER Totalverlust: `clampPercent` schneidet auf 0…100 —
       -45.36 wurde zu 0, der Nettopreis damit gleich dem Bruttopreis, und die
       Zeile war um den ganzen Rabatt zu teuer. Sichtbar war davon nichts: zwei
       gleiche Preise sehen aus wie «diese Position hat eben keinen Rabatt».

       Ein Rabatt hat keine Richtung, nur eine Groesse — der Betrag zaehlt.
       (`clampPercent` selbst bleibt, wie es ist: es schuetzt auch den
       Steuersatz, und ein negativer Steuersatz ist wirklich null.) */
    const documentDiscount = visible('discount') ? magnitude(num(row.discount)) : null;
    const documentDiscount2 = config.discount2Enabled && visible('discount2') ? magnitude(num(row.discount2)) : null;

    return {
        key: `ai-${importSeed += 1}`,
        itemType: 'PRODUCT',
        articleId: null,
        code: visible('code') ? text(row.code) : '',
        serialNumber: '',
        name: visible('name') ? text(row.name) : '',
        unit: '',
        quantity: visible('quantity') ? String(quantity) : '',
        grossPrice: cell(grossPrice),
        netPrice: cell(netPrice),
        /* ── DER BETRAG STEHT SCHON DA (Vorgabe Samet, 07.09.2026) ──────────
           Frueher blieb die Zelle leer und die Tabelle leitete den Betrag ab;
           in der manuellen Eingabe hiess das: der Benutzer tippt ihn ab.
           Jetzt kommt er mit — vom Beleg gelesen oder vom Modell gerechnet —,
           und fehlt er doch, rechnen wir hier Menge × Nettopreis.
           Er bleibt nicht stehen, wenn sich die Menge aendert: `patchRowQuantity`
           rechnet ihn in der Tabelle neu (siehe OrderCreatePage). */
        lineTotal: visible('lineTotal')
            ? cell(num(row.lineTotal) ?? (quantityValue !== null && netPrice !== null ? round2(quantity * netPrice) : null))
            : '',
        /* Der Rabatt der VORLAGE («bei diesem Lieferanten immer 20 %») füllt
           nur, was der Beleg offen lässt — und ein Vorgabewert von 0 füllt
           gar nichts: die Zelle bleibt leer, statt überall eine 0 zu
           setzen, die niemand eingegeben hat. Steht die 0 dagegen auf dem
           BELEG, kommt sie durch (siehe `cell`). */
        discount: visible('discount') ? cell(documentDiscount ?? blankIfZero(config.discounts?.[0])) : '',
        discount2: visible('discount2') ? cell(documentDiscount2 ?? blankIfZero(config.discounts?.[1])) : '',
        vatRate: '',
        calcMode,
        receivedQuantity: 0,
        receivedAt: null,
        error: null,
        priceTiers: visible('priceNet') && tiers.length ? tiers : undefined,
        extras: extraValues(row, config),
    };
};

/**
 * Die Menge einer Zeile hat sich geändert — die passende Stufe nachschlagen.
 * Nur Zeilen mit einer Staffel (Beleg ODER Lieferant) werden angefasst; alles
 * andere bliebe ohnehin gleich und dürfte nicht überschrieben werden.
 */
export const repriceRow = (row: DraftOrderRow, config: SupplierCalcConfig): DraftOrderRow => {
    const hasTiers = (row.priceTiers?.length ?? 0) > 0 || (config.qtyTiers?.length ?? 0) > 0;
    if (!hasTiers) return row;
    const quantity = parseNum(row.quantity) ?? 0;
    if (quantity <= 0) return row;
    const priced = resolveLinePrice(
        {
            netPrice: parseNum(row.netPrice) ?? parseNum(row.grossPrice),
            discount: parseNum(row.discount),
            discount2: parseNum(row.discount2),
            priceTiers: row.priceTiers ?? [],
        },
        quantity,
        config,
    );
    if (priced.rule === 'base') return row;
    return {
        ...row,
        netPrice: priced.netPrice ? String(priced.netPrice) : row.netPrice,
        discount: priced.discount ? String(priced.discount) : '',
        discount2: priced.discount2 ? String(priced.discount2) : '',
        priceRule: priced.rule,
        priceTierFrom: priced.tierFrom || undefined,
    };
};

/* ═══════════════════════════════════════════════════════════════════════════
   4) FEHLER LESBAR MACHEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface ApiFailure {
    title: string;
    /** Der Wortlaut des Dienstes (OpenAI, Google) — für die Einrichtung. */
    detail?: string;
}

/**
 * Die Antwort des Servers trägt `error` (der Satz für den Bildschirm) und
 * manchmal `detail` (die Begründung des fremden Dienstes). Beides gehört
 * getrennt angezeigt: der Satz sagt, was zu tun ist, das Detail sagt dem, der
 * die Einrichtung macht, WARUM.
 */
export const apiFailure = (error: unknown, fallback: string): ApiFailure => {
    const data = (error as { response?: { data?: { error?: string; detail?: string } } })?.response?.data;
    return {
        title: data?.error || (error as Error)?.message || fallback,
        detail: data?.detail || undefined,
    };
};

/* ═══════════════════════════════════════════════════════════════════════════
   5) DATEI → DAS, WAS AN DEN SERVER GEHT
   ═════════════════════════════════════════════════════════════════════════ */

export const isPdfFile = (file: File): boolean => /\.pdf$/i.test(file.name) || file.type === 'application/pdf';
export const isImageFile = (file: File): boolean => /^image\//.test(file.type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(file.name);
export const isSheetFile = (file: File): boolean => /\.(xlsx|xls|csv)$/i.test(file.name);

export const isSupportedImportFile = (file: File): boolean =>
    isPdfFile(file) || isImageFile(file) || isSheetFile(file);

/**
 * WELCHES BLATT ZU EINER DATEI GEHOERT (07.09.2026) — die Endung entscheidet,
 * der MIME-Typ faengt den Rest ab. Steht hier und nicht bei den Symbolen
 * selbst, weil `FileGlyphs.tsx` nur noch Bauteile ausliefern soll.
 */
export type GlyphKind = 'pdf' | 'jpg' | 'png' | 'sheet' | 'csv' | 'file';

export const glyphKindForFile = (file: File): GlyphKind => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) return 'sheet';
    if (name.endsWith('.png')) return 'png';
    if (/\.(jpe?g|webp|heic|heif)$/.test(name)) return 'jpg';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('image/')) return 'jpg';
    return 'file';
};

/** Datei → reiner Base64-Inhalt (ohne `data:`-Kopf). */
/**
 * ── DIE LANGE KANTE, DIE OHNEHIN VERWORFEN WIRD ─────────────────────────────
 * Fehlerbild Samet (08.09.2026): «Ich gebe das Papier der KI, es bleibt bei
 * 92 % stehen.» 92 % ist der Schritt, in dem hochgeladen und gewartet wird —
 * und hochgeladen wurde bisher die Aufnahme in voller Groesse.
 *
 * Das ist doppelt umsonst. Die Gegenstelle rechnet ein Bild bei `detail:
 * 'high'` ZUERST auf ein Quadrat von 2048 px herunter, bevor sie es
 * ueberhaupt ansieht; alles darueber wird also verworfen, nachdem wir es
 * bezahlt und hochgeladen haben. Eine Aufnahme mit 4000 px Kantenlaenge
 * reist damit rund viermal so lange, ohne dass das Modell ein Pixel mehr
 * sieht.
 *
 * ⚠ VERKLEINERT WIRD NUR, WAS DARUEBER LIEGT. Ein Beleg mit 1600 px geht
 * unveraendert hinaus — an der Schaerfe, an der die Rappenstellen haengen,
 * wird hier nichts angefasst. Und ein PNG bleibt ein PNG: eine Aufnahme vom
 * Bildschirm besteht aus Text, und JPEG setzte Kanten an jede Ziffer.
 */
const MAX_IMAGE_EDGE = 2048;

export const shrinkImageForUpload = async (file: File): Promise<File> => {
    if (!/^image\//i.test(file.type)) return file;
    /* GIF und HEIC koennen im Kanal Ueberraschungen machen (Bildfolgen,
       fehlende Decoder) — die reisen unveraendert. */
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) return file;
    if (typeof createImageBitmap !== 'function') return file;

    try {
        // `imageOrientation` dreht ein Telefonfoto nach seinem EXIF-Vermerk;
        // ohne das laege ein Hochformat quer auf der Leinwand.
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const longest = Math.max(bitmap.width, bitmap.height);
        if (longest <= MAX_IMAGE_EDGE) { bitmap.close(); return file; }

        const scale = MAX_IMAGE_EDGE / longest;
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) { bitmap.close(); return file; }
        context.imageSmoothingQuality = 'high';
        context.drawImage(bitmap, 0, 0, width, height);
        bitmap.close();

        const type = /png/i.test(file.type) ? 'image/png' : 'image/jpeg';
        const blob = await new Promise<Blob | null>((resolve) => {
            canvas.toBlob(resolve, type, type === 'image/jpeg' ? 0.92 : undefined);
        });
        // Groesser geworden (kommt bei PNG vor)? Dann war es die Muehe nicht wert.
        if (!blob || blob.size >= file.size) return file;
        return new File([blob], file.name, { type, lastModified: file.lastModified });
    } catch {
        // Kann der Browser das Bild nicht oeffnen, geht es eben unveraendert.
        return file;
    }
};

export const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('read-failed'));
    reader.onload = () => {
        const result = String(reader.result ?? '');
        resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result);
    };
    reader.readAsDataURL(file);
});

/**
 * TABELLEN GEHEN ALS TEXT, NICHT ALS DATEI. `xlsx` liegt im Browser-Bündel
 * ohnehin schon; eine Tabelle als Tabulatortext ist kürzer als jede erneute
 * Umwandlung auf dem Server — und kürzer heisst hier: billiger.
 * Leere Spalten fliegen raus, damit keine Tabulatorwüste bezahlt wird.
 */
export const sheetFileToText = async (file: File): Promise<string> => {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: 'array' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) throw new Error('empty');
    const matrix = XLSX.utils.sheet_to_json<Array<string | number | null>>(workbook.Sheets[sheetName], {
        header: 1,
        defval: null,
        raw: true,
        blankrows: false,
    });
    if (!matrix.length) throw new Error('empty');

    const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const usedColumns: number[] = [];
    for (let column = 0; column < width; column += 1) {
        if (matrix.some((row) => row[column] !== null && row[column] !== undefined && String(row[column]).trim() !== '')) {
            usedColumns.push(column);
        }
    }
    return matrix
        .map((row) => usedColumns
            .map((column) => {
                const cellValue = row[column];
                return cellValue === null || cellValue === undefined ? '' : String(cellValue).trim();
            })
            .join('\t'))
        .filter((line) => line.replace(/\t/g, '').trim() !== '')
        .join('\n');
};

/* ═══════════════════════════════════════════════════════════════════════════
   6) VORSCHAU DER SUMMEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface PreviewTotals {
    lines: number;
    net: number;
    discountAmount: number;
    vat: number;
    grand: number;
}

/**
 * Die Summen — dieselbe Reihenfolge wie in der Bestellung: Zeilenbeträge →
 * Steuersatz auf die Summe → Gesamtbetrag. Ohne Nebenkosten: die trägt die
 * Bestellung selbst, nicht der Beleg.
 */
export const previewTotals = (rows: DraftOrderRow[], vatRate: number): PreviewTotals => {
    let net = 0;
    let gross = 0;
    for (const row of rows) {
        const quantity = parseNum(row.quantity) ?? 0;
        const unit = parseNum(row.netPrice) ?? parseNum(row.grossPrice) ?? 0;
        const list = parseNum(row.grossPrice) ?? unit;
        const explicit = parseNum(row.lineTotal);
        net += explicit && row.calcMode === 'DIRECT' ? explicit : quantity * unit;
        gross += quantity * list;
    }
    const netRounded = round2(net);
    const vat = round2(netRounded * (clampPercent(vatRate) / 100));
    return {
        lines: rows.length,
        net: netRounded,
        discountAmount: round2(Math.max(0, gross - net)),
        vat,
        grand: round2(netRounded + vat),
    };
};
