import { prepareZXingModule, readBarcodes, type ReaderOptions } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

import { acceptScan, cleanScan, scanRank, type ScanFormat, type ScanPreference } from './scanRules';
import type { FrameHit } from './zxingFrame';

/**
 * ── ZXING-C++ FÜR DAS KAMERABILD (Depo, fünfter Durchgang 27.09.2026) ──────
 *
 * «8691381000486 … barkodlarını okuyamadı, okuması lazım.» Wo der Browser
 * keinen BarcodeDetector hat (Chrome/Edge unter Windows mit der Webcam,
 * Safari auf dem iPhone), las das Depo mit ZXing-js. Nachgemessen an
 * webcamähnlichen Bildern desselben EAN-13 (1280×720, Unschärfe, Rauschen,
 * leichte Schräge):
 *
 *   · ZXing-js brauchte ~1,1 s je Bild (am Rechner; ein Telefon ein
 *     Mehrfaches) — die Kamera prüfte kaum ein Bild je Sekunde, und die
 *     Oberfläche stand solange still. Ein scharfes Bild im richtigen
 *     Augenblick zu erwischen war Glück;
 *   · und es las einmal FALSCH, mit stimmender Prüfziffer (681401000426).
 *
 *   · ZXing-C++ (dieselbe Bibliothek, als WebAssembly) braucht ~20–40 ms
 *     (1080p, alle Depo-Formate, gedreht und invertiert) und las gleich viel
 *     oder mehr, nie falsch: es meldet einen Strichcode erst, wenn ihn
 *     mehrere Zeilen gleich gelesen haben.
 *
 * Also liest das Depo mit ZXing-C++; ZXing-js bleibt die Reserve, falls die
 * WebAssembly nicht lädt (zxingFrame.ts). Die Datei (~950 kB) kommt aus den
 * eigenen Assets, nie von einem CDN, und erst, wenn eine Kamera ohne
 * BarcodeDetector öffnet. Nichts davon betrifft das Lager (QuickAddSheet).
 */

const FORMAT_OF: Record<string, ScanFormat> = {
    EAN13: 'ean_13',
    EAN8: 'ean_8',
    UPCA: 'upc_a',
    UPCE: 'upc_e',
    Code128: 'code_128',
    Code39: 'code_39',
    Code39Std: 'code_39',
    Code39Ext: 'code_39',
    QRCode: 'qr_code',
    QRCodeModel1: 'qr_code',
    QRCodeModel2: 'qr_code',
    DataMatrix: 'data_matrix',
};

/*
 * Zwei Durchgänge je Bild. Die Strichcodes kosten wenig (1080p mit
 * Bildrauschen: 12–17 ms). DataMatrix/QR sind der teure Teil — auf einem
 * verrauschten Webcam-Bild 50 ms bis fast eine Sekunde, invertiert doppelt:
 * sie laufen nur, wenn das Feld sie braucht.
 */
const COMMON: ReaderOptions = {
    tryHarder: true,
    // Senkrecht gehaltene Etiketten; grosse Codes nah an der Linse.
    tryRotate: true,
    tryDownscale: true,
    // Alle Codes eines Etiketts — gewählt wird nach der Absicht des Feldes (scanRules.ts).
    maxNumberOfSymbols: 4,
    // Roh wie ZXing-js und BarcodeDetector (GS1-Trenner als GS, den cleanScan entfernt).
    textMode: 'Plain',
};
const LINES: ReaderOptions = { ...COMMON, formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE', 'Code128', 'Code39'], tryInvert: false };
const SQUARES: ReaderOptions = { ...COMMON, formats: ['QRCode', 'DataMatrix'], tryInvert: false };
/** Hell auf dunkel (gelaserte DataMatrix auf Metall) — nur jedes vierte Mal, es kostet doppelt. */
const SQUARES_INVERTED: ReaderOptions = { ...SQUARES, tryInvert: true };
/** Beim Produktbarcode sucht jedes so vielte Bild ohne Strichcode nach DataMatrix/QR. */
const SQUARE_EVERY = 4;

let ready: Promise<unknown> | null = null;

/** Die WebAssembly laden — einmal je Sitzung; ein Fehlschlag darf später neu versuchen. */
const load = (): Promise<unknown> => {
    ready ??= prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
        fireImmediately: true,
    }).catch((error: unknown) => {
        ready = null;
        throw error;
    });
    return ready;
};

export type WasmFrameReader = (canvas: HTMLCanvasElement, prefer: ScanPreference) => Promise<FrameHit | null>;

type RankedHit = FrameHit & { rank: number };

/** Aus allen Codes eines Durchgangs der, den das Feld will (kleinster Rang). */
const pick = (results: Awaited<ReturnType<typeof readBarcodes>>, prefer: ScanPreference, best: RankedHit | null): RankedHit | null => {
    let chosen = best;
    for (const result of results) {
        if (!result.isValid) continue;
        const format = FORMAT_OF[result.format] ?? 'unknown';
        const text = cleanScan(result.text);
        if (!text || !acceptScan(text, format)) continue;
        const rank = scanRank(format, prefer);
        if (!chosen || rank < chosen.rank) chosen = { text, format, rank };
    }
    return chosen;
};

/** Der Leser — erst zurück, wenn die WebAssembly läuft (sonst wirft er, und ZXing-js übernimmt). */
export const createWasmFrameReader = async (): Promise<WasmFrameReader> => {
    await load();
    let frame = 0;
    return async (canvas, prefer) => {
        const context = canvas.getContext('2d', { willReadFrequently: true });
        if (!context || !canvas.width || !canvas.height) return null;
        frame += 1;
        const image = context.getImageData(0, 0, canvas.width, canvas.height);
        // 1. Strichcodes — beim Produkt zählt der EAN, bei der Seriennummer Code 128/39 sofort.
        let best = pick(await readBarcodes(image, LINES), prefer, null);
        if (best?.rank === 0) return { text: best.text, format: best.format };
        // 2. DataMatrix/QR: bei der Seriennummer jedes Bild (jedes vierte auch invertiert),
        //    beim Produkt nur ohne Strichcode und nur jedes vierte Bild.
        if (prefer === 'serial') {
            best = pick(await readBarcodes(image, frame % SQUARE_EVERY === 0 ? SQUARES_INVERTED : SQUARES), prefer, best);
        } else if (!best && frame % SQUARE_EVERY === 0) {
            best = pick(await readBarcodes(image, SQUARES), prefer, best);
        }
        return best ? { text: best.text, format: best.format } : null;
    };
};
