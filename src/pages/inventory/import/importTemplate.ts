/**
 * ── DIE VORLAGE DES BELEG-IMPORTS ───────────────────────────────────────────
 *
 * Vorgabe Samet (11.09.2026, letzter Stand):
 *
 *   «Eine Vorlage hat einen Namen — keinen Lieferanten, keine Rechenart, keine
 *    Mehrwertsteuer (die steht in den Bestelldetails). Bis zu dreizehn
 *    Spalten (12+1): der ERP-Code ist fest, steht in den Tabellen, nicht im
 *    PDF und nicht in der KI-Anfrage. Die Spalten sind anfangs leer; jede
 *    bekommt einen Namen, eine Art und eine Zuordnung — Produktname und Menge
 *    sind ueberall Pflicht, sonst zeigt das System einen Fehler; Einzelpreis,
 *    Nettopreis, Rabatt, Rabatt 2 und Zeilensumme gibt es je einmal. Kein
 *    Auge mehr. Die Reihenfolge ist frei. Ohne Vorlage gibt es keine
 *    Tabelle: die Vorlage ist Pflicht.»
 *   «Die Vorlage mit ihren Spaltennamen geht direkt an das Modell; die
 *    Bilder sind Tabellen — gelesen wird je Spalte, eine leere Zelle wird
 *    ‹-›, und jede Spalte steht unter ihrer eigenen Ueberschrift.»
 *
 * ── WAS AN DAS MODELL GEHT ────────────────────────────────────────────────
 * Genau die Spalten der Vorlage: Schluessel, NAME, Art und Zuordnung. Der
 * Server baut daraus das Antwortschema (`gptExtract.ts`); die Zuordnung sagt
 * ihm, was ein Wert bedeutet (Listenpreis vor Rabatt, Nettopreis danach …).
 * Der ERP-Code reist nicht mit — er wird beim Speichern vergeben.
 *
 * ── WAS DER IMPORT TUT — UND WAS NICHT ────────────────────────────────────
 * `extractedToDraftRow` ist eine ZUORDNUNG und keine Rechnung: eine Spalte
 * mit Zuordnung fuellt ihr Feld der Bestellzeile, eine freie Spalte wird eine
 * eigene Angabe (`extras`). Gerechnet wird nirgends vor.
 */

import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { purchaseLangOf } from '@/utils/purchaseCode';
import { displayColumnName } from '@/utils/standardOrderColumns';
import type {
    AiExtractedRow,
    OrderCalcMode,
    PurchaseOrderTableColumn,
    PurchaseTemplateDocumentType,
    SupplierCalcConfig,
    TemplateColumn,
    TemplateLabel,
} from '@/types/inventory';
import { REQUIRED_TEMPLATE_LABELS, TEMPLATE_LABELS, TEMPLATE_MAX_COLUMNS } from '@/types/inventory';
import type { DraftOrderRow } from '../types';
import { parseNum } from '../utils/format';
import { clampPercent, round2 } from '../utils/orderPricing';

/* ═══════════════════════════════════════════════════════════════════════════
   1) DIE VORLAGE
   ═════════════════════════════════════════════════════════════════════════ */

/** Eine neue Vorlage ist LEER — die Spalten legt der Anwender an. */
export const defaultCalcConfig = (): SupplierCalcConfig => ({ columns: [] });

/** Der naechste freie Schluessel: `c1` … `c12`. Null, wenn die Vorlage voll ist. */
export const nextColumnKey = (columns: TemplateColumn[]): string | null => {
    for (let index = 1; index <= TEMPLATE_MAX_COLUMNS; index += 1) {
        const key = `c${index}`;
        if (!columns.some((column) => column.key === key)) return key;
    }
    return null;
};

/** Die Spalten, die zaehlen: benannt, getrimmt, hoechstens zwoelf. */
export const templateColumns = (config: SupplierCalcConfig): TemplateColumn[] =>
    (config.columns ?? [])
        .filter((column) => column.name.trim())
        .slice(0, TEMPLATE_MAX_COLUMNS)
        .map((column) => ({ ...column, name: column.name.trim(), label: column.label ?? null }));

/** Die freien Spalten — ihre Werte werden als eigene Angaben gespeichert. */
export const unlabeledColumns = (config: SupplierCalcConfig): TemplateColumn[] =>
    templateColumns(config).filter((column) => !column.label);

/**
 * Welche Zuordnungen ein Dokument kennt: eine PREISANFRAGE hat keine Preise,
 * dort gibt es nur Produktname und Menge.
 */
export const labelsForDocument = (documentType: PurchaseTemplateDocumentType): TemplateLabel[] =>
    (documentType === 'PRICE_REQUEST' ? ['productName', 'quantity'] : [...TEMPLATE_LABELS]);

/** Der Name einer Zuordnung auf dem Bildschirm. */
export const templateLabelName = (label: TemplateLabel): string => t(`inv.aiImport.label.${label}`);

export type TemplateProblem = 'noColumns' | 'unnamed' | 'missingLabels' | 'duplicateLabel';

/**
 * Was einer Vorlage fehlt, bevor sie gilt. Leer = sie ist in Ordnung.
 * Dieselbe Pruefung macht der Server beim Speichern.
 */
export const templateProblems = (config: SupplierCalcConfig, documentType: PurchaseTemplateDocumentType): TemplateProblem[] => {
    const problems: TemplateProblem[] = [];
    const columns = config.columns ?? [];
    if (!columns.length) problems.push('noColumns');
    if (columns.some((column) => !column.name.trim())) problems.push('unnamed');
    const allowed = new Set<TemplateLabel>(labelsForDocument(documentType));
    const labels = columns.map((column) => column.label).filter((label): label is TemplateLabel => Boolean(label) && allowed.has(label as TemplateLabel));
    if (REQUIRED_TEMPLATE_LABELS.some((label) => !labels.includes(label))) problems.push('missingLabels');
    if (new Set(labels).size !== labels.length) problems.push('duplicateLabel');
    return problems;
};

export const templateIsValid = (config: SupplierCalcConfig, documentType: PurchaseTemplateDocumentType): boolean =>
    templateProblems(config, documentType).length === 0;

/** Der Satz zu einem Mangel — fuer den Toast und den Hinweis in der Tabelle. */
export const templateProblemText = (problem: TemplateProblem): string => t(
    problem === 'noColumns' ? 'inv.aiImport.noColumns'
        : problem === 'unnamed' ? 'inv.aiImport.columnNameRequired'
            : problem === 'duplicateLabel' ? 'inv.aiImport.labelDuplicate'
                : 'inv.aiImport.labelRequired',
);

/**
 * ── DIE RECHENART BRAUCHT IHRE SCHLÜSSEL (Vorgabe Samet, 14.09.2026) ───────
 * «Beim Wechsel auf Lieferanten- oder automatische Berechnung müssen
 *  Produktname, Menge, Einzelpreis, Nettopreis, Rabatt und Zeilensumme in der
 *  Vorlage zugeordnet sein — fehlt ein Schlüssel, muss es sagen, welcher.»
 * Die manuelle Eingabe rechnet nichts und braucht darum nichts davon.
 */
export const CALC_REQUIRED_LABELS: TemplateLabel[] = ['productName', 'quantity', 'grossPrice', 'netPrice', 'discount', 'total'];

/** Die fehlenden Zuordnungen für eine Rechenart — leer = sie darf rechnen. */
export const missingCalcLabels = (config: SupplierCalcConfig, mode: OrderCalcMode): TemplateLabel[] => {
    if (mode === 'DIRECT') return [];
    const present = new Set(templateColumns(config).map((column) => column.label).filter(Boolean));
    return CALC_REQUIRED_LABELS.filter((label) => !present.has(label));
};

/** «Schlüssel fehlt: Einzelpreis, Rabatt» — für Toast und Rechenfenster. */
export const missingCalcLabelsText = (missing: TemplateLabel[]): string =>
    t('inv.orders.calcMode.missingKeys', { keys: missing.map(templateLabelName).join(', ') });

/** Prüft eine Rechenart gegen die Vorlage: null = erlaubt, sonst der Fehlersatz. */
export const calcModeError = (config: SupplierCalcConfig, mode: OrderCalcMode): string | null => {
    const missing = missingCalcLabels(config, mode);
    return missing.length ? missingCalcLabelsText(missing) : null;
};

/**
 * Die Einstellung einer Vorlage in EINEM Satz — unter dem Namen in der
 * Vorlagenliste und im Import-Fenster: wie viele Spalten, und welche
 * Zuordnungen vergeben sind.
 */
export const templateSummary = (config: SupplierCalcConfig): string => {
    const columns = templateColumns(config);
    if (!columns.length) return t('inv.aiImport.noColumns');
    const labels = columns
        .map((column) => column.label)
        .filter((label): label is TemplateLabel => Boolean(label))
        .map(templateLabelName);
    const parts = [t('inv.aiImport.columnCount', { count: columns.length })];
    if (labels.length) parts.push(labels.join(', '));
    return parts.join(' · ');
};

/* ═══════════════════════════════════════════════════════════════════════════
   2) VORLAGE → TABELLE
   ═════════════════════════════════════════════════════════════════════════ */

/** Die festen Felder der Bestelltabelle — jede Zuordnung zeigt auf eines. */
export type FixedOrderColumn =
    | 'name'
    | 'code'
    | 'quantity'
    | 'grossPrice'
    | 'netPrice'
    | 'discount'
    | 'discount2'
    | 'lineTotal';

/** Ein Spaltenschluessel der Tabelle: ein festes Feld oder eine freie Spalte. */
export type OrderColumnId = FixedOrderColumn | string;

export const LABEL_TO_COLUMN: Record<TemplateLabel, FixedOrderColumn> = {
    productName: 'name',
    quantity: 'quantity',
    grossPrice: 'grossPrice',
    netPrice: 'netPrice',
    discount: 'discount',
    discount2: 'discount2',
    total: 'lineTotal',
};

/** Eine Spalte, wie die Tabelle sie zeichnet. */
export interface TableColumn {
    /** Was die Zelle zeigt: ein festes Feld (`name`, `quantity` …) oder der Schluessel der freien Spalte. */
    id: OrderColumnId;
    key: string;
    /** Die Ueberschrift — bei Vorlagenspalten der Name aus der Vorlage. */
    name: string;
    type: 'text' | 'number';
    width?: number;
    label: TemplateLabel | null;
    /** Der ERP-Code: fest, nicht aus der Vorlage. */
    fixed?: boolean;
}

/**
 * ── DIE VORLAGE ENTSCHEIDET, WELCHE SPALTEN ES GIBT — UND IN WELCHER
 *    REIHENFOLGE (Vorgabe Samet, 11.09.2026) ────────────────────────────────
 * Ganz links der feste ERP-Code, danach die Spalten der Vorlage, so wie sie
 * dort stehen. Eine GELADENE Bestellung darf eigene Angaben tragen, die die
 * heutige Vorlage nicht kennt (`loadedExtras`): sie kommen hinten dazu,
 * damit ein alter Beleg beim Oeffnen keine Angabe verliert. Traegt die
 * Vorlage eine freie Spalte GLEICHEN NAMENS, ist das dieselbe Spalte — der
 * Wert wandert unter den Schluessel der Vorlage (siehe `extraKeyAliases`).
 */
export const tableColumnsFromTemplate = (
    config: SupplierCalcConfig,
    loadedExtras: TemplateColumn[] = [],
): TableColumn[] => {
    const columns: TableColumn[] = [
        { id: 'code', key: 'code', name: t('inv.columns.serialCode'), type: 'text', label: null, fixed: true },
    ];
    const seenNames = new Set<string>();
    const seenKeys = new Set<string>();
    for (const column of templateColumns(config)) {
        columns.push({
            id: column.label ? LABEL_TO_COLUMN[column.label] : column.key,
            key: column.key,
            // Standart şablonun sütunu (24.09.2026): başlık o anki dilde.
            name: displayColumnName(column.key, column.name, purchaseLangOf(i18n.resolvedLanguage || i18n.language)),
            type: column.type,
            width: column.width,
            label: column.label ?? null,
        });
        seenKeys.add(column.key);
        if (!column.label) seenNames.add(column.name.trim().toLowerCase());
    }
    for (const extra of loadedExtras) {
        const name = extra.name.trim();
        if (!name || seenKeys.has(extra.key) || seenNames.has(name.toLowerCase())) continue;
        seenKeys.add(extra.key);
        columns.push({ id: extra.key, key: extra.key, name, type: extra.type, width: extra.width, label: null });
    }
    return columns;
};

/**
 * Alter Schluessel → Schluessel der Vorlage, fuer eigene Angaben einer
 * geladenen Bestellung, deren Spalte in der Vorlage unter demselben Namen
 * steht. Leer, wenn nichts umzuhaengen ist.
 */
export const extraKeyAliases = (config: SupplierCalcConfig, loadedExtras: TemplateColumn[]): Map<string, string> => {
    const byName = new Map<string, string>();
    for (const column of unlabeledColumns(config)) byName.set(column.name.trim().toLowerCase(), column.key);
    const aliases = new Map<string, string>();
    for (const extra of loadedExtras) {
        const target = byName.get(extra.name.trim().toLowerCase());
        if (target && target !== extra.key) aliases.set(extra.key, target);
    }
    return aliases;
};

/** Die Werte einer Zeile unter die neuen Schluessel haengen. */
export const remapRowExtras = (row: DraftOrderRow, aliases: Map<string, string>): DraftOrderRow => {
    if (!aliases.size || !row.extras) return row;
    const extras: Record<string, string> = {};
    for (const [key, value] of Object.entries(row.extras)) extras[aliases.get(key) ?? key] = value;
    return { ...row, extras };
};

/**
 * ── WAS DAS PDF NICHT ZEIGT ─────────────────────────────────────────────────
 * Die Bestellung merkt sich beim Speichern, welche festen Spalten die Vorlage
 * NICHT traegt (`hiddenColumnKeys`), weil das PDF spaeter ohne die Vorlage
 * gebaut wird. Der ERP-Code steht nie im PDF (Vorgabe Samet, 11.09.2026).
 */
export const hiddenKeysForTemplate = (config: SupplierCalcConfig): string[] => {
    const labels = new Set(templateColumns(config).map((column) => column.label));
    const hidden = ['code'];
    if (!labels.has('grossPrice')) hidden.push('priceGross');
    if (!labels.has('discount') && !labels.has('discount2')) hidden.push('discount');
    return hidden;
};

/**
 * ── WAS DAS PDF ALS TITEL SCHREIBT ──────────────────────────────────────────
 * Die Bestellung merkt sich die Spalten der Vorlage — Name, Zuordnung, Typ,
 * Reihenfolge — damit das PDF spaeter ohne die Vorlage genau die Tabelle
 * druckt, die auf dem Bildschirm stand: «GESAMTMENGE», nicht «Menge», und
 * die Spalten dort, wo die Vorlage sie hatte (Vorgabe Samet, 11.09.2026).
 */
export const tableColumnsSnapshot = (config: SupplierCalcConfig): PurchaseOrderTableColumn[] =>
    templateColumns(config).map((column) => ({
        key: column.key,
        name: column.name,
        label: column.label ?? null,
        type: column.type === 'number' ? 'number' : 'text',
    }));

/* ═══════════════════════════════════════════════════════════════════════════
   3) ERKANNTE ZEILE → BESTELLZEILE (reine Zuordnung)
   ═════════════════════════════════════════════════════════════════════════ */

let importSeed = 0;

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

/**
 * ── 0.00 IST EIN WERT ───────────────────────────────────────────────────────
 * Zwischen «da steht nichts» und «da steht ausdruecklich null» liegt genau
 * der Unterschied, um den es geht: allein `null` ist die leere Zelle, jede
 * Zahl — auch die 0 — wird geschrieben.
 */
const cell = (value: number | null): string => (value === null || Number.isNaN(value) ? '' : String(value));

/** Der Betrag einer Zahl — «-45.36 %» Rabatt ist ein Rabatt von 45.36 %. */
const magnitude = (value: number | null): number | null => (value === null ? null : Math.abs(value));

/**
 * Zeile + freie Spalten → die Liste, die GESPEICHERT wird: Schluessel,
 * Ueberschrift und Wert, in der Reihenfolge der Vorlage. Leere Spalten
 * fallen weg — eine Bestellung soll keine leeren Ueberschriften mit sich
 * schleppen.
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
 * Umgekehrt: eine geladene Bestellung zurueck in Spalten + Werte. Die
 * UEBERSCHRIFTEN kommen aus der Bestellung selbst, nicht aus der heutigen
 * Vorlage — sonst truege eine alte Bestellung ploetzlich fremde Spaltennamen.
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
        label: null,
    }));
};

/**
 * Eine erkannte Position in eine Zeile der Bestelltabelle giessen.
 *
 * HIER WIRD NICHT GERECHNET. Jede Spalte mit Zuordnung fuellt ihr Feld; jede
 * freie Spalte wird eine eigene Angabe. Der ERP-CODE BLEIBT LEER: er wird
 * beim Speichern vergeben.
 */
export const extractedToDraftRow = (
    row: AiExtractedRow,
    config: SupplierCalcConfig,
    calcMode: OrderCalcMode = 'DIRECT',
): DraftOrderRow => {
    const byLabel = new Map<TemplateLabel, string>();
    const extras: Record<string, string> = {};
    for (const column of templateColumns(config)) {
        if (column.label) { byLabel.set(column.label, column.key); continue; }
        const value = text(row[column.key]);
        if (value) extras[column.key] = value.slice(0, 240);
    }
    const valueOf = (label: TemplateLabel): unknown => {
        const key = byLabel.get(label);
        return key ? row[key] : undefined;
    };

    const quantityValue = num(valueOf('quantity'));
    const quantity = quantityValue ?? 1;
    const grossPrice = num(valueOf('grossPrice'));
    const netPrice = num(valueOf('netPrice'));
    /* Ein Rabatt hat keine Richtung, nur eine Groesse — der Beleg druckt ihn
       oft als «-45.36 %», und `clampPercent` machte daraus still 0. */
    const discount = magnitude(num(valueOf('discount')));
    const discount2 = magnitude(num(valueOf('discount2')));

    return {
        key: `ai-${importSeed += 1}`,
        itemType: 'PRODUCT',
        articleId: null,
        code: '',
        serialNumber: '',
        name: text(valueOf('productName')),
        unit: '',
        quantity: quantityValue !== null ? String(quantity) : '',
        grossPrice: cell(grossPrice),
        netPrice: cell(netPrice),
        /* Der Betrag kommt mit — vom Beleg gelesen —, und fehlt er, rechnen
           wir hier Menge × Nettopreis. `patchRowQuantity` rechnet ihn in der
           Tabelle neu, wenn sich die Menge aendert. */
        lineTotal: cell(num(valueOf('total')) ?? (quantityValue !== null && netPrice !== null ? round2(quantity * netPrice) : null)),
        discount: cell(discount === null ? null : clampPercent(discount)),
        discount2: cell(discount2 === null ? null : clampPercent(discount2)),
        vatRate: '',
        calcMode,
        receivedQuantity: 0,
        receivedAt: null,
        error: null,
        extras,
    };
};

/* ═══════════════════════════════════════════════════════════════════════════
   4) FEHLER LESBAR MACHEN
   ═════════════════════════════════════════════════════════════════════════ */

export interface ApiFailure {
    title: string;
    /** Der Wortlaut des Dienstes (OpenAI) — für die Einrichtung. */
    detail?: string;
}

/**
 * Die Antwort des Servers trägt `error` (der Satz für den Bildschirm) und
 * manchmal `detail` (die Begründung des fremden Dienstes). Beides gehört
 * getrennt angezeigt.
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
/** Schon Text: eingefuegte Tabellenzeilen (`.tsv`) oder eingefuegter Text (`.txt`). */
export const isTextFile = (file: File): boolean => /\.(tsv|txt)$/i.test(file.name);

export const isSupportedImportFile = (file: File): boolean =>
    isPdfFile(file) || isImageFile(file) || isSheetFile(file) || isTextFile(file);

/**
 * WELCHES BLATT ZU EINER DATEI GEHOERT — die Endung entscheidet, der
 * MIME-Typ faengt den Rest ab.
 */
export type GlyphKind = 'pdf' | 'jpg' | 'png' | 'sheet' | 'csv' | 'file';

export const glyphKindForFile = (file: File): GlyphKind => {
    const name = file.name.toLowerCase();
    if (name.endsWith('.pdf')) return 'pdf';
    if (name.endsWith('.csv')) return 'csv';
    if (name.endsWith('.xlsx') || name.endsWith('.xls') || name.endsWith('.tsv')) return 'sheet';
    if (name.endsWith('.png')) return 'png';
    if (/\.(jpe?g|webp|heic|heif)$/.test(name)) return 'jpg';
    if (file.type === 'application/pdf') return 'pdf';
    if (file.type.startsWith('image/')) return 'jpg';
    return 'file';
};

/**
 * ── DIE LANGE KANTE, DIE OHNEHIN VERWORFEN WIRD ─────────────────────────────
 * Die Gegenstelle rechnet ein Bild bei `detail: 'high'` ZUERST auf ein
 * Quadrat von 2048 px herunter; alles darueber wird verworfen, nachdem wir
 * es bezahlt und hochgeladen haben. Verkleinert wird nur, was darueber
 * liegt; ein PNG bleibt ein PNG.
 */
const MAX_IMAGE_EDGE = 2048;

export const shrinkImageForUpload = async (file: File): Promise<File> => {
    if (!/^image\//i.test(file.type)) return file;
    /* GIF und HEIC koennen im Kanal Ueberraschungen machen (Bildfolgen,
       fehlende Decoder) — die reisen unveraendert. */
    if (!/^image\/(png|jpeg|jpg|webp)$/i.test(file.type)) return file;
    if (typeof createImageBitmap !== 'function') return file;

    try {
        // `imageOrientation` dreht ein Telefonfoto nach seinem EXIF-Vermerk.
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
 * Eine Tabelle als Tabulatortext: je Zeile eine Zeile, die Zellen durch TAB
 * getrennt, eine leere Zelle bleibt leer. Spalten, die in KEINER Zeile etwas
 * tragen, fliegen raus, leere Zeilen auch. Die Excel-Datei und die
 * eingefuegte Tabelle gehen durch dieselbe Muehle.
 */
const matrixToTabText = (matrix: ReadonlyArray<ReadonlyArray<unknown>>): string => {
    const filled = (value: unknown) => value !== null && value !== undefined && String(value).trim() !== '';
    const width = matrix.reduce((max, row) => Math.max(max, row.length), 0);
    const usedColumns: number[] = [];
    for (let column = 0; column < width; column += 1) {
        if (matrix.some((row) => filled(row[column]))) usedColumns.push(column);
    }
    return matrix
        .map((row) => usedColumns
            .map((column) => (filled(row[column]) ? String(row[column]).trim() : ''))
            .join('\t'))
        .filter((line) => line.replace(/\t/g, '').trim() !== '')
        .join('\n');
};

/**
 * TABELLEN GEHEN ALS TEXT, NICHT ALS DATEI. `xlsx` liegt im Browser-Bündel
 * ohnehin schon; eine Tabelle als Tabulatortext ist kürzer als jede erneute
 * Umwandlung auf dem Server. Leere Spalten fliegen raus.
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
    return matrixToTabText(matrix);
};

/* ═══════════════════════════════════════════════════════════════════════════
   6) AUS DER ZWISCHENABLAGE
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * ── EINFUEGEN STATT HOCHLADEN (Vorgabe Samet, 11.09.2026) ───────────────────
 * «Den Beleg auch aus der Zwischenablage einfuegen — ein Bildschirmfoto oder
 *  kopierte Zeilen, fuer Bestellung und Preisanfrage.»
 *
 * Was eingefuegt wird, wird eine DATEI wie jede andere und nimmt danach
 * denselben Weg: ein Bildschirmfoto reist als Bild (`images[]`, Rasterlesung),
 * kopierte Zeilen reisen als Tabulatortext (`text`, Zeile fuer Zeile) —
 * genau wie eine hochgeladene Excel-Datei.
 *
 * DIE REIHENFOLGE ENTSCHEIDET. Excel legt beim Kopieren NEBEN die Zeilen
 * auch ein Bild der Zellen; naehme man das Bild, muesste das Modell eine
 * Tabelle abschreiben, deren Text schon exakt daneben liegt. Also: Text mit
 * TABs zuerst, dann eine HTML-Tabelle (Webshop, Mail), dann Bilder und
 * Dateien, zuletzt blosser Text (etwa aus einem PDF kopiert).
 */
export interface ClipboardContent {
    files: File[];
    text: string;
    html: string;
}

/** Die Zwischenablage eines `paste`-Ereignisses. */
export const clipboardFromEvent = (data: DataTransfer): ClipboardContent => {
    const files = Array.from(data.files ?? []);
    if (!files.length) {
        for (const item of Array.from(data.items ?? [])) {
            const file = item.kind === 'file' ? item.getAsFile() : null;
            if (file) files.push(file);
        }
    }
    return { files, text: data.getData('text/plain'), html: data.getData('text/html') };
};

/**
 * Die Zwischenablage auf Knopfdruck — fuer das Geraet ohne Tastatur. Der
 * Browser fragt dafuer um Erlaubnis; wird sie verweigert, wirft das hier.
 */
export const readClipboardContent = async (): Promise<ClipboardContent> => {
    const clipboard = navigator.clipboard;
    if (clipboard?.read) {
        const content: ClipboardContent = { files: [], text: '', html: '' };
        for (const item of await clipboard.read()) {
            const imageType = item.types.find((type) => type.startsWith('image/'));
            if (imageType) {
                const blob = await item.getType(imageType);
                content.files.push(new File([blob], `image.${imageType.slice('image/'.length)}`, { type: imageType }));
            }
            if (!content.text && item.types.includes('text/plain')) {
                content.text = await (await item.getType('text/plain')).text();
            }
            if (!content.html && item.types.includes('text/html')) {
                content.html = await (await item.getType('text/html')).text();
            }
        }
        return content;
    }
    if (clipboard?.readText) return { files: [], text: await clipboard.readText(), html: '' };
    throw new Error('clipboard-unavailable');
};

/** Die Taste zum Einfuegen, wie sie auf DIESER Tastatur heisst. */
export const pasteModifierKey = (): string =>
    (/Mac|iPhone|iPad|iPod/i.test(navigator.userAgent) ? '⌘' : 'Ctrl');

/**
 * Kopierte Zeilen → Zellen. Excel setzt eine Zelle, die selbst einen
 * Zeilenumbruch, einen TAB oder ein «"» traegt, in Anfuehrungszeichen (ein
 * «""» darin ist ein einzelnes «"»). Ohne diese Lesart zerfiele eine
 * zweizeilige Beschreibung in zwei Positionen. Schliesst eine Zelle, die mit
 * «"» beginnt, nicht sauber vor TAB oder Zeilenende («"Deca" Schuetz» von
 * einer Webseite), gilt sie woertlich.
 */
const parseTabRows = (text: string): string[][] => {
    const rows: string[][] = [];
    let row: string[] = [];
    let at = 0;
    for (;;) {
        let cell: string | null = null;
        let end = at;
        if (text[at] === '"') {
            let scan = at + 1;
            let value = '';
            while (scan < text.length) {
                if (text[scan] === '"' && text[scan + 1] === '"') { value += '"'; scan += 2; continue; }
                if (text[scan] === '"') {
                    const next = text[scan + 1];
                    if (next === undefined || next === '\t' || next === '\n') {
                        cell = value.replace(/\s+/g, ' ').trim();
                        end = scan + 1;
                    }
                    break;
                }
                value += text[scan];
                scan += 1;
            }
        }
        if (cell === null) {
            end = at;
            while (end < text.length && text[end] !== '\t' && text[end] !== '\n') end += 1;
            cell = text.slice(at, end);
        }
        row.push(cell);
        if (text[end] === '\t') { at = end + 1; continue; }
        rows.push(row);
        if (end >= text.length) return rows;
        row = [];
        at = end + 1;
    }
};

/**
 * Eine HTML-Tabelle (Webshop, Mail, Word) → Zellen, falls der Text daneben
 * keine TABs traegt. Die groesste Tabelle gilt — eine Mail steckt ihren
 * Inhalt gern in eine Rahmentabelle. Eine zusammengefasste Zelle
 * (`colSpan`) belegt ihre Spalten weiter, sonst rutschte alles rechts davon
 * nach links. Ein DOMParser-Dokument fuehrt nichts aus und laedt nichts.
 */
const htmlTableRows = (html: string): string[][] => {
    if (!/<table[\s>]/i.test(html) || typeof DOMParser === 'undefined') return [];
    const tables = Array.from(new DOMParser().parseFromString(html, 'text/html').querySelectorAll('table'));
    const table = tables.reduce<HTMLTableElement | null>(
        (best, candidate) => (!best || candidate.rows.length > best.rows.length ? candidate : best),
        null,
    );
    if (!table) return [];
    for (const lineBreak of Array.from(table.querySelectorAll('br'))) lineBreak.replaceWith(' ');
    return Array.from(table.rows).map((row) => Array.from(row.cells).flatMap((cell) => [
        (cell.textContent ?? '').replace(/\s+/g, ' ').trim(),
        ...Array.from({ length: Math.max(0, cell.colSpan - 1) }, () => ''),
    ]));
};

/** Zeilenenden vereinheitlichen, geschuetzte Leerzeichen zu Leerzeichen, leere Zeilen am Rand weg. */
const tidyClipboardText = (text: string): string => text
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/^(?:[ \t]*\n)+/, '')
    .replace(/\s+$/, '');

/** So heisst beim Browser jedes eingefuegte Bildschirmfoto — nichtssagend. */
const GENERIC_CLIPBOARD_NAME = /^image\.[a-z0-9]+$/i;

const extensionForType = (type: string): string => {
    const subtype = type.split('/')[1]?.toLowerCase() ?? '';
    return subtype === 'jpeg' ? 'jpg' : subtype || 'png';
};

/**
 * Was aus der Zwischenablage eine Datei fuer den Import wird — leer, wenn
 * nichts Lesbares darin liegt. `strict` gilt fuer die Bestellseite selbst:
 * dort oeffnet nur ein Bild, eine Datei, kopierte Zeilen oder mehrzeiliger
 * Text den Import, ein einzelnes Wort nicht — und Excels Bild einer
 * einzelnen kopierten Zelle auch nicht.
 */
export const clipboardToImportFiles = (content: ClipboardContent, options: { strict?: boolean } = {}): File[] => {
    const now = new Date();
    const time = now.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const named = (labelKey: string, extension: string, suffix = '') => `${t(labelKey)} ${time}${suffix}.${extension}`;
    const readable = (body: string) => body.trim().length >= 3
        && (!options.strict || body.includes('\t') || body.split('\n').filter((line) => line.trim()).length >= 2);

    const plain = tidyClipboardText(content.text);
    const table = matrixToTabText(plain.includes('\t') ? parseTabRows(plain) : htmlTableRows(content.html));
    if (table && readable(table)) {
        return [new File([table], named('inv.aiImport.pastedTable', 'tsv'), {
            type: 'text/tab-separated-values',
            lastModified: now.getTime(),
        })];
    }

    const files = content.files.filter(isSupportedImportFile);
    const asFiles = () => files.map((file, index) => (isImageFile(file) && (!file.name || GENERIC_CLIPBOARD_NAME.test(file.name))
        ? new File([file], named('inv.aiImport.pastedImage', extensionForType(file.type), files.length > 1 ? ` (${index + 1})` : ''), {
            type: file.type,
            lastModified: now.getTime(),
        })
        : file));
    // Ein Bildschirmfoto oder eine kopierte Datei bringt keinen eigenen Text mit.
    if (files.length && !plain) return asFiles();

    if (readable(plain)) {
        return [new File([plain], named('inv.aiImport.pastedText', 'txt'), { type: 'text/plain', lastModified: now.getTime() })];
    }
    return files.length && !options.strict ? asFiles() : [];
};
