import type {
    BarcodeFormat,
    BinaryBitmap,
    DataMatrixReader,
    DecodeHintType,
    HybridBinarizer,
    MultiFormatOneDReader,
    QRCodeReader,
    Result,
    RGBLuminanceSource,
} from '@zxing/library';

import { LINEAR_FORMATS, MATRIX_FORMATS, PRODUCT_FORMATS, scanFormatOf, type ScanFormat, type ScanPreference } from './scanRules';

/**
 * ── EIN KAMERABILD MIT ZXING LESEN (Depo, vierter Durchgang 26.09.2026) ────
 *
 * «Ürün barkodlarını asla okumuyor.» Wo der Browser keinen BarcodeDetector
 * hat (Chrome/Edge unter Windows, Safari auf dem iPhone), las das Depo mit
 * EINEM ZXing-Leser für alle Formate. Mit TRY_HARDER stellt ZXing dabei QR
 * und DataMatrix VOR die Strichcodes — auf einem Etikett mit EAN und QR kam
 * darum immer der QR-Inhalt heraus, nie der Barcode des Produkts (im Probe
 * nachgestellt: EAN-13 + QR auf einem 1080p-Bild → alter Leser: die URL des
 * QR, dieser: der EAN). Und die Leseschleife von @zxing/browser hält bei
 * jedem unerwarteten Fehler für immer an.
 *
 * Hier liest das Depo jedes Bild selbst, in der Reihenfolge der Absicht
 * (scanRules.ts, `SCAN_ORDER`):
 *
 *   1. alle Strichcodes (EAN/UPC, Code 128/39), aufrecht — ist der gefundene
 *      aus der «falschen» Familie (Seriennummer statt EAN oder umgekehrt),
 *      wird im selben Bild nach der gewünschten gesucht;
 *   2. bei der Seriennummer: DataMatrix/QR (vor dem EAN);
 *   3. nichts aufrecht: die Strichcodes um 90° gedreht (senkrecht gehaltene
 *      Etiketten, dritter Durchgang);
 *   4. beim Produktbarcode: DataMatrix/QR zuletzt.
 *
 * Schnell genug für ein Telefon: das Graubild wird einmal je Bild gerechnet
 * (in einen wiederverwendeten Puffer), und das gedrehte entsteht aus ihm
 * durch Umkopieren — nicht über eine zweite Leinwand (die kostete bei 1080p
 * mehr als alle Leser zusammen). Die Leser werden einzeln benutzt, nicht über
 * den MultiFormatReader: der schreibt bei jedem Bild ohne Treffer eine
 * Warnung samt Stapel in die Konsole (dutzende je Sekunde). ZXing dreht
 * selbst nicht (in @zxing/browser 0.2.1 misslingt das ohnehin). Nichts wird
 * global verändert — das Lager (QuickAddSheet) liest weiter mit seinem
 * eigenen Leser.
 */
export interface ZxingModules {
    Luminance: typeof RGBLuminanceSource;
    Bitmap: typeof BinaryBitmap;
    Binarizer: typeof HybridBinarizer;
    OneD: typeof MultiFormatOneDReader;
    QR: typeof QRCodeReader;
    DataMatrix: typeof DataMatrixReader;
    Format: typeof BarcodeFormat;
    Hint: typeof DecodeHintType;
}

export interface FrameHit {
    text: string;
    format: ScanFormat;
}

type Decode = (bitmap: BinaryBitmap) => Result;

const ZXING_NAMES: Record<string, keyof typeof BarcodeFormat> = {
    ean_13: 'EAN_13',
    ean_8: 'EAN_8',
    upc_a: 'UPC_A',
    upc_e: 'UPC_E',
    code_128: 'CODE_128',
    code_39: 'CODE_39',
    data_matrix: 'DATA_MATRIX',
    qr_code: 'QR_CODE',
};

export const createZxingFrameReader = ({ Luminance, Bitmap, Binarizer, OneD, QR, DataMatrix, Format, Hint }: ZxingModules) => {
    const hintsFor = (formats: readonly ScanFormat[]) => {
        const hints = new Map<DecodeHintType, unknown>();
        hints.set(Hint.POSSIBLE_FORMATS, formats.map((format) => Format[ZXING_NAMES[format]!]));
        hints.set(Hint.TRY_HARDER, true);
        return hints;
    };
    const linesOf = (formats: readonly ScanFormat[]): Decode => {
        const hints = hintsFor(formats);
        const reader = new OneD(hints);
        return (bitmap) => reader.decode(bitmap, hints);
    };

    const lines = linesOf([...PRODUCT_FORMATS, ...LINEAR_FORMATS]);
    const productLines = linesOf(PRODUCT_FORMATS);
    const serialLines = linesOf(LINEAR_FORMATS);
    const squareHints = hintsFor(MATRIX_FORMATS);
    const dataMatrix = new DataMatrix();
    const qr = new QR();
    // QR zuerst: ohne seine drei Suchmuster gibt er schnell auf.
    const squares: Decode = (bitmap) => {
        try {
            return qr.decode(bitmap, squareHints);
        } catch {
            return dataMatrix.decode(bitmap, squareHints);
        }
    };

    // Die Graubilder — einmal angelegt, Bild für Bild überschrieben.
    let gray = new Uint8ClampedArray(0);
    let grayTurned = new Uint8ClampedArray(0);

    /** Das Graubild der Leinwand (dieselbe Gewichtung wie ZXing: 0.299 R + 0.587 G + 0.114 B). */
    const grayOf = (canvas: HTMLCanvasElement): Uint8ClampedArray | null => {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context) return null;
        const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
        const size = canvas.width * canvas.height;
        if (gray.length !== size) gray = new Uint8ClampedArray(size);
        for (let pixel = 0, offset = 0; pixel < size; pixel += 1, offset += 4) {
            gray[pixel] = (306 * rgba[offset]! + 601 * rgba[offset + 1]! + 117 * rgba[offset + 2]! + 0x200) >> 10;
        }
        return gray;
    };

    /** Um 90° gegen den Uhrzeigersinn: (x, y) → (y, Breite − 1 − x); das neue Bild ist `height` breit. */
    const turnGray = (source: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray => {
        if (grayTurned.length !== source.length) grayTurned = new Uint8ClampedArray(source.length);
        for (let y = 0; y < height; y += 1) {
            const row = y * width;
            for (let x = 0; x < width; x += 1) grayTurned[(width - 1 - x) * height + y] = source[row + x]!;
        }
        return grayTurned;
    };

    const bitmapOf = (luminances: Uint8ClampedArray, width: number, height: number): BinaryBitmap =>
        new Bitmap(new Binarizer(new Luminance(luminances, width, height)));

    const tryRead = (decode: Decode, bitmap: BinaryBitmap | null): FrameHit | null => {
        if (!bitmap) return null;
        try {
            const result = decode(bitmap);
            const text = result.getText();
            return text ? { text, format: scanFormatOf(Format[result.getBarcodeFormat()]) } : null;
        } catch {
            // Nichts gefunden (oder ein Fehler des Lesers): der nächste Durchgang, das nächste Bild.
            return null;
        }
    };

    /** Der Code, den das Feld will — oder der nächstbeste im Bild, oder nichts. */
    return (canvas: HTMLCanvasElement, prefer: ScanPreference): FrameHit | null => {
        const { width, height } = canvas;
        const luminances = width && height ? grayOf(canvas) : null;
        if (!luminances) return null;
        const upright = bitmapOf(luminances, width, height);
        const wanted = prefer === 'product' ? PRODUCT_FORMATS : LINEAR_FORMATS;
        const wantedLines = prefer === 'product' ? productLines : serialLines;

        /** Strichcodes in einer Lage: der gewünschte — oder der aus der anderen Familie (als Ersatz). */
        const linesIn = (bitmap: BinaryBitmap): { hit: FrameHit | null; wanted: boolean } => {
            const line = tryRead(lines, bitmap);
            if (!line || wanted.includes(line.format)) return { hit: line, wanted: Boolean(line) };
            // Die andere Familie gefunden: steht der gewünschte daneben?
            const other = tryRead(wantedLines, bitmap);
            return other ? { hit: other, wanted: true } : { hit: line, wanted: false };
        };

        // 1. Strichcodes, aufrecht.
        const straight = linesIn(upright);
        if (straight.wanted) return straight.hit;
        // Die Seriennummer: DataMatrix/QR kommen vor dem EAN — und kosten wenig (sie finden sich in jeder Lage).
        if (prefer === 'serial') {
            const square = tryRead(squares, upright);
            if (square) return square;
        }
        // 2. Nichts aufrecht: um 90° gedreht (senkrecht gehaltene Etiketten).
        let fallback = straight.hit;
        if (!fallback) {
            const turned = linesIn(bitmapOf(turnGray(luminances, width, height), height, width));
            if (turned.wanted) return turned.hit;
            fallback = turned.hit;
        }
        // 3. Beim Produkt zählt ein Code 128/39 vor DataMatrix/QR; sonst sie.
        if (prefer === 'product' && !fallback) return tryRead(squares, upright);
        return fallback;
    };
};

export type ZxingFrameReader = ReturnType<typeof createZxingFrameReader>;
