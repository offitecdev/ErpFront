/**
 * ── WANN EIN GELESENER CODE ZÄHLT (Depo, 26.09.2026, dritter Durchgang) ──────
 *
 * Vorgabe Samet: «barkodlar tam okumuyor, bazen ac4 olarak gibi kısa okuyor —
 * tam okumalı». Die Kamera liefert manchmal Bruchstücke: ein halb gesehenes
 * Etikett, das ein anderer Barcodetyp (ITF, Codabar, Code 93, Code 39 ohne
 * Prüfziffer) als kurzen «gültigen» Code deutet. Darum:
 *
 *   · nur die Typen, die im Lager vorkommen: EAN-13/8, UPC-A/E (Hersteller),
 *     Code 128 und Code 39 (Seriennummern), QR und DataMatrix;
 *   · EAN/UPC nur mit stimmender Prüfziffer und voller Länge;
 *   · Code 128/39 erst ab vier Zeichen;
 *   · ein Code OHNE Prüfziffer (Code 39) erst, wenn ihn die Kamera zweimal
 *     hintereinander gleich gelesen hat (siehe useBarcodeCamera) — ein
 *     Zufallstreffer wiederholt sich nicht.
 *
 * Vierter Durchgang (26.09.2026): «ürün barkodlarını asla okumuyor». Zwei
 * Gründe lagen in diesen Regeln:
 *
 *   · Die Bestätigung galt für JEDEN Code. Auf einem langsamen Gerät (ZXing
 *     braucht je Bild hunderte Millisekunden) kamen zwei gleiche Lesungen
 *     selten in 1,5 s zusammen — der Barcode zählte nie. EAN/UPC, Code 128,
 *     QR und DataMatrix prüfen sich selbst (Prüfziffer, Fehlerkorrektur);
 *     sie zählen jetzt beim ersten Lesen.
 *   · Ein Etikett mit mehreren Codes (EAN + DataMatrix, wie auf fast jeder
 *     Verpackung aus der Elektrotechnik) gab mal den einen, mal den anderen —
 *     oder immer den DataMatrix. Jetzt entscheidet die Absicht des Feldes
 *     (`ScanPreference`), welcher Code zuerst gilt.
 */

export const SCAN_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'qr_code', 'data_matrix'] as const;
export type ScanFormat = typeof SCAN_FORMATS[number] | 'unknown';

/** Die Familien der Formate — in dieser Einteilung wird gewählt. */
export const PRODUCT_FORMATS: readonly ScanFormat[] = ['ean_13', 'upc_a', 'ean_8', 'upc_e'];
export const LINEAR_FORMATS: readonly ScanFormat[] = ['code_128', 'code_39'];
export const MATRIX_FORMATS: readonly ScanFormat[] = ['data_matrix', 'qr_code'];

/**
 * Was ein Feld lesen will, wenn das Bild mehrere Codes zeigt:
 *   product — der Barcode des Produkts (EAN/UPC), dann Code 128/39, dann DataMatrix/QR;
 *   serial  — die Nummer des Stücks: Code 128/39, dann DataMatrix/QR, der EAN
 *             daneben (das Produkt, nicht das Stück) zuletzt.
 */
export type ScanPreference = 'product' | 'serial';

export const SCAN_ORDER: Record<ScanPreference, ReadonlyArray<readonly ScanFormat[]>> = {
    product: [PRODUCT_FORMATS, LINEAR_FORMATS, MATRIX_FORMATS],
    serial: [LINEAR_FORMATS, MATRIX_FORMATS, PRODUCT_FORMATS],
};

/** Rang eines Formats für diese Absicht — kleiner zählt zuerst; unbekannt zuletzt. */
export const scanRank = (format: ScanFormat, prefer: ScanPreference): number => {
    const index = SCAN_ORDER[prefer].findIndex((group) => group.includes(format));
    return index < 0 ? SCAN_ORDER[prefer].length : index;
};

/** Nur Codes ohne eigene Prüfung (Code 39, unbekannt) müssen zweimal gleich gelesen werden. */
export const needsConfirmation = (format: ScanFormat): boolean => format === 'code_39' || format === 'unknown';

/** So oft muss dieselbe Zeichenfolge hintereinander gelesen werden (nur `needsConfirmation`). */
export const CONFIRM_READS = 2;
/** … und zwar innerhalb dieser Zeit. */
export const CONFIRM_WINDOW_MS = 1500;
/** Kürzere Code-128/39-Lesungen sind fast immer Bruchstücke. */
export const MIN_LINEAR_LENGTH = 4;

// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001F\u007F]/g;

/** Steuerzeichen (GS1-Trenner, angehängtes Enter) weg, Rand-Leerraum weg. */
export const cleanScan = (raw: string | null | undefined): string => String(raw ?? '').replace(CONTROL, '').trim();

const eanValid = (digits: string): boolean => {
    // Gewichte von rechts: die letzte Stelle vor der Prüfziffer ×3, dann abwechselnd ×1.
    const body = digits.slice(0, -1);
    let sum = 0;
    for (let index = 0; index < body.length; index += 1) {
        const digit = Number(body[body.length - 1 - index]);
        sum += index % 2 === 0 ? digit * 3 : digit;
    }
    return (10 - (sum % 10)) % 10 === Number(digits[digits.length - 1]);
};

/** Das Format aus der Kennung des Lesers (BarcodeDetector «ean_13», ZXing «EAN_13»). */
export const scanFormatOf = (raw: unknown): ScanFormat => {
    const value = String(raw ?? '').toLowerCase();
    return (SCAN_FORMATS as readonly string[]).includes(value) ? value as ScanFormat : 'unknown';
};

/** Ist diese Lesung ein vollständiger Code dieses Formats? */
export const acceptScan = (code: string, format: ScanFormat): boolean => {
    if (!code) return false;
    switch (format) {
        case 'ean_13': return /^\d{13}$/.test(code) && eanValid(code);
        case 'ean_8': return /^\d{8}$/.test(code) && eanValid(code);
        case 'upc_a': return /^\d{12}$/.test(code) && eanValid(code);
        case 'upc_e': return /^\d{6,8}$/.test(code);
        case 'qr_code':
        case 'data_matrix': return code.length >= 1;
        default: return code.length >= MIN_LINEAR_LENGTH;
    }
};
