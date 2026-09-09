/**
 * TEXTERKENNUNG — GOOGLE CLOUD VISION, über den eigenen Server.
 *
 * Der Erkenner auf dem Gerät ist ersetzt: gelesen wird über die eigene Route
 * `POST /inventory/ocr/read` — dahinter steht seit dem 08.09.2026 OCR.space
 * (davor Google Cloud Vision; der Dienst wurde gewechselt, weil er einen
 * Cloud-Vertrag samt Abrechnung und Freischaltung verlangte).
 *
 * Was sich damit gegenüber der ersten Fassung ändert:
 *
 *   · Auf dem Gerät läuft KEIN Erkenner mehr. Kein 4-MB-WebAssembly-Kern,
 *     keine Sprachdaten, kein Web Worker, kein 60-MB-Heap im Tablet — das
 *     Telefon schneidet nur noch den markierten Ausschnitt aus und schickt
 *     ihn weg. Genau das war mit «nicht belasten» gemeint.
 *   · Gelesen wird VOM SERVER (`POST /inventory/ocr/read`), nicht direkt von
 *     hier: der API-Schlüssel darf nicht im Browser-Bündel liegen.
 *   · Es reist immer nur der AUSSCHNITT, nie das ganze Foto. Das ist
 *     schneller, schont das Kontingent (es rechnet je Bild ab) und lässt so wenig
 *     Bildmaterial wie möglich das Haus verlassen.
 *
 * Zwei Lesegänge, mit Absicht verschieden:
 *   · `recognizeRegionLive` — der Zwischenstand, während das Viereck noch
 *     unter dem Finger wächst. Wo der Browser selbst lesen kann
 *     (`TextDetector`, Chrome auf Android), kostet er GAR NICHTS und wird
 *     deshalb zuerst gefragt. Sonst fragt auch er den Dienst, aber gedrosselt
 *     (siehe QuickAddSheet: einer zur Zeit, Mindestabstand, Mindestzuwachs) —
 *     ein Strich sind so zwei, drei Aufrufe, keine dreissig.
 *   · `recognizeRegion` — der genaue Lesegang beim Loslassen. Immer der Dienst.
 *
 * Was der Dienst zurückgibt, geht unverändert durch die Nachdenk-Schicht
 * (`textSense.ts`): im Viereck zählt nur die grösste Schrift, sichere
 * Zeichenverwechslungen werden geheilt, und das Fenster legt den Text danach
 * noch an den Produktkatalog an.
 */

import { apiClient } from '../axios';
import { refineLines, repairName } from './textSense';

export type OcrBox = { x0: number; y0: number; x1: number; y1: number };

export interface OcrLine {
    id: string;
    /** Bereinigter Text der Zeile (Leerraum gestrafft, Rand-Satzzeichen weg). */
    text: string;
    /** 0–100. */
    confidence: number;
    /** Rahmen in Pixeln des ERKANNTEN Bildes. */
    box: OcrBox;
    /** Vorsortierung: höher = eher der Produktname. */
    score: number;
}

export type OcrEngineName = 'google-vision' | 'native';
export interface RegionRead {
    text: string;
    lines: OcrLine[];
    engine: OcrEngineName;
}

/** Ein Fehler, den das Fenster dem Anwender zeigen darf. */
export class OcrUnavailable extends Error {
    readonly code: string;

    constructor(message: string, code: string) {
        super(message);
        this.code = code;
    }
}

/* Der Ausschnitt geht als JPEG — bei Fotoausschnitten ist der Unterschied zu
   PNG nicht sichtbar, die Übertragung aber um ein Vielfaches kleiner. */
const CROP_MIME = 'image/jpeg';
const CROP_QUALITY = 0.92;
/* Der Dienst liest kleine Schrift gut, aber ein 60px breiter Fingerausschnitt
   bleibt ein 60px breiter Ausschnitt. Massvoll vergrössern, nicht aufblasen:
   mehr als das Dreifache bringt nichts ausser Übertragungszeit. */
const MAX_SCALE = 3;
const TARGET_WIDTH = 1000;
const TARGET_HEIGHT = 220;

/* Antwortet der Server einmal «nicht eingerichtet» oder «nicht
   freigeschaltet», hat es keinen Sinn, ihn bei jeder Fingerbewegung erneut zu
   fragen. Der Merker gilt bis zum nächsten Laden der Seite. */
let visionOff: string | null = null;
/** Diese Codes liegen an der Einrichtung, nicht am Bild — und ändern sich nicht
    zwischen zwei Fingerbewegungen. */
/* Gründe, die an der EINRICHTUNG liegen, nicht am Bild — das Fenster sagt
   dann «nicht eingerichtet» statt «Lesefehler». Seit dem Wechsel auf OCR.space
   (08.09.2026) heissen sie `OCR_*`; die alten `VISION_*` stehen noch hier,
   damit ein Server, der noch nicht neu ausgeliefert ist, dieselbe Auskunft
   bekommt. Sie dürfen weg, sobald überall die neue Fassung läuft. */
const SETUP_CODES = new Set([
    'OCR_NOT_CONFIGURED', 'OCR_NOT_ENABLED',
    'VISION_NOT_CONFIGURED', 'VISION_NOT_ENABLED',
]);

/**
 * NACHMESSEN, ob der Ausschnitt stimmt. `localStorage.setItem('ofi-ocr-debug',
 * '1')` schreibt jeden geschnittenen Ausschnitt als Daten-URL in die Konsole;
 * in einem neuen Tab geöffnet zeigt sie GENAU das, was hinausgeht. Ist
 * dort ein schwarzes Bild oder der falsche Bildteil zu sehen, liegt es an der
 * Umrechnung Anzeige → Leinwand — nicht am Erkenner.
 */
const cropDebug = (): boolean => {
    try {
        return localStorage.getItem('ofi-ocr-debug') === '1';
    } catch {
        return false;
    }
};

/**
 * Ein Ausschnitt der Leinwand: mit etwas Rand geschnitten und massvoll
 * vergrössert. `toSource` rechnet Zeilenrahmen in die Pixel des GANZEN Bildes
 * zurück. `null`, wenn der Ausschnitt zum Lesen zu klein ist.
 */
const cropRegion = (source: HTMLCanvasElement, region: OcrBox, maxScale: number) => {
    const padX = Math.max(6, (region.x1 - region.x0) * 0.06);
    const padY = Math.max(6, (region.y1 - region.y0) * 0.12);
    const sx = Math.max(0, Math.floor(region.x0 - padX));
    const sy = Math.max(0, Math.floor(region.y0 - padY));
    const sw = Math.min(source.width - sx, Math.ceil(region.x1 - region.x0 + 2 * padX));
    const sh = Math.min(source.height - sy, Math.ceil(region.y1 - region.y0 + 2 * padY));
    if (sw < 4 || sh < 4) return null;

    const scale = Math.min(maxScale, Math.max(1, TARGET_WIDTH / sw, TARGET_HEIGHT / sh));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(sw * scale);
    canvas.height = Math.round(sh * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    return {
        canvas,
        toSource: (line: OcrLine): OcrLine => ({
            ...line,
            box: {
                x0: sx + line.box.x0 / scale,
                y0: sy + line.box.y0 / scale,
                x1: sx + line.box.x1 / scale,
                y1: sy + line.box.y1 / scale,
            },
        }),
    };
};

/* ── Bereinigung ─────────────────────────────────────────────────────────── */

const cleanText = (raw: string): string =>
    raw
        .replace(/\s+/g, ' ')
        .replace(/^[^\p{L}\p{N}(]+/u, '')
        .replace(/[^\p{L}\p{N})%]+$/u, '')
        .trim();

/** Zeilen säubern und die Krümel wegwerfen. */
const usableLines = (raw: OcrLine[], minConfidence: number): OcrLine[] =>
    raw
        .map((line) => ({ ...line, text: cleanText(line.text) }))
        .filter((line) => line.text.length > 0 && line.confidence >= minConfidence && /[\p{L}\p{N}]/u.test(line.text));

/** Die gewählten Zeilen in Leserichtung (oben → unten, links → rechts) zu EINEM Namen. */
const composeName = (lines: OcrLine[], selectedIds: ReadonlySet<string>): string => {
    const picked = lines.filter((line) => selectedIds.has(line.id));
    picked.sort((a, b) => {
        const rowA = a.box.y0;
        const rowB = b.box.y0;
        const overlap = Math.min(a.box.y1, b.box.y1) - Math.max(rowA, rowB);
        const sameRow = overlap > Math.min(a.box.y1 - rowA, b.box.y1 - rowB) * 0.5;
        return sameRow ? a.box.x0 - b.box.x0 : rowA - rowB;
    });
    return picked.map((line) => line.text).join(' ').replace(/\s+/g, ' ').trim();
};

/** Aus rohen Zeilen den Namen: grösste Schrift gewinnt, Verwechslungen geheilt. */
const nameFrom = (raw: OcrLine[], minConfidence: number): string => {
    const kept = refineLines(usableLines(raw, minConfidence));
    return repairName(composeName(kept, new Set(kept.map((line) => line.id))));
};

/* ── nativer Erkenner (Shape Detection API) ──────────────────────────────── */

type NativeDetected = { boundingBox: { x: number; y: number; width: number; height: number }; rawValue: string };
type NativeDetectorCtor = new () => { detect(source: CanvasImageSource): Promise<NativeDetected[]> };

const nativeDetectorCtor = (): NativeDetectorCtor | null =>
    (window as Window & { TextDetector?: NativeDetectorCtor }).TextDetector ?? null;

const detectNative = async (canvas: HTMLCanvasElement): Promise<OcrLine[] | null> => {
    const Ctor = nativeDetectorCtor();
    if (!Ctor) return null;
    try {
        const found = await new Ctor().detect(canvas);
        return found.map((item, index) => ({
            id: `n${index}`,
            text: item.rawValue,
            confidence: 100,
            box: {
                x0: item.boundingBox.x,
                y0: item.boundingBox.y,
                x1: item.boundingBox.x + item.boundingBox.width,
                y1: item.boundingBox.y + item.boundingBox.height,
            },
            score: 0,
        }));
    } catch {
        // Der native Weg ist eine Abkürzung, keine Pflicht.
        return null;
    }
};

/* ── OCR.space, über den eigenen Server ──────────────────────────────────── */

type OcrResponse = {
    text: string;
    lines: Array<{ text: string; confidence: number; box: OcrBox }>;
};

const readWithService = async (canvas: HTMLCanvasElement): Promise<OcrLine[]> => {
    if (visionOff) throw new OcrUnavailable('Texterkennung nicht verfügbar.', visionOff);
    const image = canvas.toDataURL(CROP_MIME, CROP_QUALITY);
    if (cropDebug()) {
        console.info(
            `[ocr] Ausschnitt ${canvas.width}×${canvas.height}, ${Math.round(image.length / 1024)} kB — im neuen Tab öffnen:`,
            image,
        );
    }
    try {
        const response = await apiClient.post<OcrResponse>('/inventory/ocr/read', { image });
        return (response.data.lines ?? []).map((line, index) => ({
            id: `v${index}`,
            text: line.text,
            confidence: line.confidence,
            box: line.box,
            score: 0,
        }));
    } catch (error) {
        const data = (error as { response?: { data?: { code?: string; detail?: string } } } | null)?.response?.data;
        const code = typeof data?.code === 'string' ? data.code : 'OCR_FAILED';
        if (SETUP_CODES.has(code)) visionOff = code;
        // Googles eigener Wortlaut steht nicht auf dem Bildschirm, aber wer die
        // Einrichtung macht, findet ihn hier statt im Serverprotokoll.
        if (typeof data?.detail === 'string' && data.detail) console.error('[ocr]', code, '—', data.detail);
        throw new OcrUnavailable('Texterkennung nicht verfügbar.', code);
    }
};

/**
 * Den markierten Ausschnitt genau lesen — der Lesegang beim Loslassen.
 * Wirft `OcrUnavailable`, wenn Vision nicht erreichbar oder nicht eingerichtet
 * ist; ein leerer Text bedeutet dagegen schlicht: im Viereck stand nichts.
 */
export const recognizeRegion = async (source: HTMLCanvasElement, region: OcrBox): Promise<RegionRead> => {
    const crop = cropRegion(source, region, MAX_SCALE);
    if (!crop) return { text: '', lines: [], engine: 'google-vision' };
    const raw = await readWithService(crop.canvas);
    const lines = usableLines(raw, 30).map(crop.toSource);
    return { text: nameFrom(raw, 30), lines, engine: 'google-vision' };
};

/**
 * Der Zwischenstand, während das Viereck noch wächst. Kann der Browser selbst
 * lesen, wird er genommen — das kostet nichts und antwortet sofort. Sonst
 * fragt auch dieser Weg Vision; das Fenster drosselt ihn dafür (einer zur
 * Zeit, Mindestabstand, Mindestzuwachs). Ein Fehlschlag ist hier kein Fehler,
 * sondern ein leerer Text — der genaue Lesegang entscheidet ohnehin.
 */
export const recognizeRegionLive = async (source: HTMLCanvasElement, region: OcrBox): Promise<string> => {
    const crop = cropRegion(source, region, 2);
    if (!crop) return '';

    const native = await detectNative(crop.canvas);
    if (native && native.length) {
        const text = nameFrom(native, 20);
        if (text) return text;
    }

    try {
        return nameFrom(await readWithService(crop.canvas), 20);
    } catch {
        return '';
    }
};
