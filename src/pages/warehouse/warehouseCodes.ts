/**
 * ── ERP-CODE UND GS1-BARCODE IN DER OBERFLÄCHE (26.09.2026, 2. Durchgang) ───
 *
 * Spiegel der Regeln des Servers (Erp_Backend domain/services/warehouseCodes.ts)
 * und der EAN-13-Zeichner für die Vorschau auf der Karte, die Etiketten und
 * die Listen-PDF. Ein EAN-13 besteht aus 95 Modulen:
 *
 *   101 · 6 Ziffern links (Muster L/G je nach erster Ziffer) · 01010 ·
 *   6 Ziffern rechts (Muster R) · 101
 *
 * Die erste Ziffer steckt nur im Wechsel von L und G der linken Hälfte.
 */

const L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
const G = ['0100111', '0110011', '0011011', '0100001', '0011101', '0111001', '0000101', '0010001', '0001001', '0010111'];
const R = ['1110010', '1100110', '1101100', '1000010', '1011100', '1001110', '1010000', '1000100', '1001000', '1110100'];
const PARITY = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];

export const ean13CheckDigit = (first12: string): number => {
    let sum = 0;
    for (let index = 0; index < 12; index += 1) {
        const digit = Number(first12[index] ?? 0);
        sum += index % 2 === 0 ? digit : digit * 3;
    }
    return (10 - (sum % 10)) % 10;
};

export const isValidEan13 = (code: string | null | undefined): code is string =>
    Boolean(code) && /^\d{13}$/.test(code!) && ean13CheckDigit(code!.slice(0, 12)) === Number(code![12]);

export interface Ean13Pattern {
    /** 95 Module, '1' = Strich. */
    bits: string;
    /** Für jedes Modul: gehört es zu einem Randzeichen (die längeren Striche)? */
    guard: boolean[];
    /** Die Klarschrift: erste Ziffer, linke sechs, rechte sechs. */
    text: { first: string; left: string; right: string };
}

export const ean13Pattern = (code: string): Ean13Pattern | null => {
    if (!isValidEan13(code)) return null;
    const digits = code.split('').map(Number);
    const parity = PARITY[digits[0] ?? 0] ?? PARITY[0]!;
    let bits = '101';
    const guard: boolean[] = [true, true, true];
    for (let index = 1; index <= 6; index += 1) {
        const table = parity[index - 1] === 'G' ? G : L;
        const pattern = table[digits[index] ?? 0] ?? '';
        bits += pattern;
        guard.push(...pattern.split('').map(() => false));
    }
    bits += '01010';
    guard.push(true, true, true, true, true);
    for (let index = 7; index <= 12; index += 1) {
        const pattern = R[digits[index] ?? 0] ?? '';
        bits += pattern;
        guard.push(...pattern.split('').map(() => false));
    }
    bits += '101';
    guard.push(true, true, true);
    return { bits, guard, text: { first: code.slice(0, 1), left: code.slice(1, 7), right: code.slice(7) } };
};

/** Zusammenhängende Striche: [Startmodul, Breite, Randzeichen?]. */
export const ean13Bars = (pattern: Ean13Pattern): Array<{ x: number; width: number; guard: boolean }> => {
    const bars: Array<{ x: number; width: number; guard: boolean }> = [];
    let index = 0;
    while (index < pattern.bits.length) {
        if (pattern.bits[index] !== '1') { index += 1; continue; }
        const start = index;
        const guard = pattern.guard[index] ?? false;
        while (index < pattern.bits.length && pattern.bits[index] === '1' && (pattern.guard[index] ?? false) === guard) index += 1;
        bars.push({ x: start, width: index - start, guard });
    }
    return bars;
};

/* ── Kürzel ──────────────────────────────────────────────────────────────── */

export const ABBREVIATION_MIN = 2;
export const ABBREVIATION_MAX = 5;

const TRANSLITERATION: Record<string, string> = {
    Ç: 'C', Ğ: 'G', İ: 'I', I: 'I', Ö: 'O', Ş: 'S', Ü: 'U',
    Â: 'A', Î: 'I', Û: 'U', Ä: 'A', É: 'E', È: 'E', Ê: 'E', À: 'A', Ô: 'O',
};

export const normalizeAbbreviation = (raw: string): string =>
    raw
        .trim()
        .toLocaleUpperCase('tr-TR')
        .replace(/[ÇĞİIÖŞÜÂÎÛÄÉÈÊÀÔ]/g, (char) => TRANSLITERATION[char] ?? char)
        .replace(/[^A-Z0-9]/g, '')
        .slice(0, ABBREVIATION_MAX);

export const isValidAbbreviation = (code: string): boolean =>
    new RegExp(`^[A-Z0-9]{${ABBREVIATION_MIN},${ABBREVIATION_MAX}}$`).test(code);

const VOWELS = new Set(['A', 'E', 'I', 'O', 'U']);

/** Elektrik → ELK, Kablo → KBL, Kontaktör → KNT, PLC → PLC (wie der Server). */
export const suggestAbbreviation = (name: string, length = 3): string => {
    const letters = name
        .trim()
        .toLocaleUpperCase('tr-TR')
        .replace(/[ÇĞİIÖŞÜÂÎÛÄÉÈÊÀÔ]/g, (char) => TRANSLITERATION[char] ?? char)
        .replace(/[^A-Z0-9]/g, '');
    if (letters.length <= length) return letters;
    const first = letters[0] ?? '';
    const rest = letters.slice(1).split('');
    const picked = [first, ...rest.filter((char) => !VOWELS.has(char))].slice(0, length);
    for (const char of rest) {
        if (picked.length >= length) break;
        if (VOWELS.has(char)) picked.push(char);
    }
    return picked.join('').slice(0, length);
};

/* ── Gruppen ─────────────────────────────────────────────────────────────── */

/** «ELK-PLC — Elektrik › PLC» — so steht eine Gruppe in der Excel-Vorlage (wie der Server). */
export const groupTemplateLabel = (category: { code: string; name: string }, group: { code: string | null; name: string }): string =>
    group.code ? `${category.code}-${group.code} — ${category.name} › ${group.name}` : `${category.name} › ${group.name}`;

/** «ELK · PLC» — kurz, für Kapseln und Listen. */
export const groupShortLabel = (ref: { code: string | null; name: string; category?: { code: string } | null }): string =>
    ref.code && ref.category?.code ? `${ref.category.code}-${ref.code}` : ref.name;

/* ── Etikett ─────────────────────────────────────────────────────────────── */

/** mm je typografischem Punkt. */
export const PT_MM = 0.3528;

export interface LabelLayout {
    pad: number;
    innerW: number;
    namePt: number;
    codePt: number;
    digitsPt: number;
    /** Grundlinie des Namens (mm von oben) — `null` ohne Namen. */
    nameBaseline: number | null;
    barTop: number;
    barHeight: number;
    /** Breite des Barcodes samt Ruhezonen (113 Module). */
    barcodeWidth: number;
    barcodeX: number;
    codeBaseline: number;
}

/**
 * Wo was auf einem Etikett steht (mm, Ursprung oben links). Dieselbe Rechnung
 * für die PDF und die Vorschau unter Ayarlar › Etiket — was man sieht, wird
 * gedruckt.
 */
export const labelLayout = (w: number, h: number, showName: boolean, hasBarcode = true): LabelLayout => {
    const pad = Math.max(1.4, Math.min(w, h) * 0.07);
    const innerW = w - 2 * pad;
    // Schriftgrössen aus der Höhe: 25 mm → Name 6.5 pt, Code 10 pt, Ziffern 5.5 pt.
    const scale = Math.max(0.7, Math.min(2.2, h / 25));
    const namePt = 6.5 * scale;
    const codePt = 10 * scale;
    const digitsPt = 5.5 * scale;
    let top = pad;
    const nameBaseline = showName ? top + namePt * PT_MM * 0.8 : null;
    if (showName) top += namePt * PT_MM * 1.25;
    const codeBaseline = h - pad - codePt * PT_MM * 0.2;
    const codeTop = codeBaseline - codePt * PT_MM * 0.8;
    const digitsBlock = hasBarcode ? digitsPt * PT_MM * 1.3 : 0;
    const barHeight = Math.max(3, codeTop - top - digitsBlock - pad * 0.35);
    // Nicht breiter als 0.5 mm je Modul — grosse Etiketten bekommen einen ruhigen, mittigen Code.
    const barcodeWidth = Math.min(innerW, 113 * 0.5);
    return {
        pad,
        innerW,
        namePt,
        codePt,
        digitsPt,
        nameBaseline,
        barTop: top,
        barHeight,
        barcodeWidth,
        barcodeX: (w - barcodeWidth) / 2,
        codeBaseline,
    };
};

/**
 * Wie viele Etiketten auf einen A4-Bogen passen, mittig. Etikettenbögen sind
 * randlos gestanzt (70 × 37 = 3 × 8 = 24, 52.5 × 29.7 = 4 × 10) — darum kein
 * Mindestrand; ein halber Millimeter Toleranz für gerundete Masse.
 */
export const a4Grid = (w: number, h: number) => {
    const cols = Math.max(1, Math.floor((210 + 0.5) / w));
    const rows = Math.max(1, Math.floor((297 + 0.5) / h));
    return { cols, rows, perPage: cols * rows, offsetX: (210 - cols * w) / 2, offsetY: (297 - rows * h) / 2 };
};
