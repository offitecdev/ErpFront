import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
    acceptScan,
    cleanScan,
    CONFIRM_READS,
    CONFIRM_WINDOW_MS,
    needsConfirmation,
    scanFormatOf,
    scanRank,
    SCAN_FORMATS,
    type ScanFormat,
    type ScanPreference,
} from './scanRules';
import { createZxingFrameReader, type ZxingFrameReader } from './zxingFrame';
import type { WasmFrameReader } from './zxingWasm';

/**
 * ── DIE KAMERA ALS BARCODE-LESER (Depo, 26.09.2026) ─────────────────────────
 *
 * Vorgabe Samet: «barkod yerleri için direkt barkod tarayıcı kamera olmalı veya
 * elle yazılabilmeli». Dasselbe Verfahren wie die Schnellerfassung des Lagers
 * (pages/inventory/quick-add) — dort steckt es privat in der Datei, und das
 * Lager bleibt unberührt; darum hat das Depo seine eigene Fassung:
 *
 *   · `getUserMedia`, Rückkamera bevorzugt;
 *   · der native `BarcodeDetector`, wo es ihn gibt (Android, macOS);
 *   · sonst — Chrome/Edge unter Windows, Safari auf dem iPhone kennen ihn
 *     nicht — ZXing-C++ als WebAssembly (zxingWasm.ts, fünfter Durchgang:
 *     ~30× schneller als ZXing-js und ohne dessen Fehllesungen); lädt die
 *     WebAssembly nicht, ZXing-js (zxingFrame.ts). Beides erst dann
 *     nachgeladen, Bild für Bild in EINER eigenen Schleife, die kein Fehler
 *     anhält;
 *   · zeigt ein Bild mehrere Codes, gilt der, den das Feld will (`prefer`:
 *     der Produktbarcode oder die Seriennummer — scanRules.ts);
 *   · derselbe Code innerhalb von 2,5 s gilt als dasselbe Etikett;
 *   · ein Code zählt, sobald er zu seinem Format passt; nur einer ohne
 *     Prüfziffer (Code 39) erst nach zwei gleichen Lesungen (scanRules.ts —
 *     «kısa okuyor, tam okumalı», dritter Durchgang; «ürün barkodlarını asla
 *     okumuyor», vierter).
 *
 * `paused` hält die Erkennung an (ein Treffer wird gerade gezeigt), die Kamera
 * läuft weiter. Ohne `active` geht das Licht aus.
 */

type DetectedCode = { rawValue?: string; format?: string };
type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<DetectedCode[]> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;

/* Nur, was im Lager vorkommt — ITF, Codabar und Code 93 lieferten Bruchstücke. */
const BARCODE_FORMATS: string[] = [...SCAN_FORMATS];
/** Zwischen zwei Erkennungen — sonst liest die Kamera dreissigmal dasselbe Etikett. */
const DETECT_GAP_MS = 140;
/** ZXing-js rechnet lange auf dem Hauptfaden: nach jedem Bild so viel Luft für die Oberfläche. */
const ZXING_GAP_MS = 90;
/** ZXing-C++ braucht je Bild nur einige zehn Millisekunden — mehr Bilder, mehr scharfe darunter. */
const WASM_GAP_MS = 60;
/** Derselbe Code gleich noch einmal ist das noch nicht weggelegte Etikett. */
const REPEAT_GUARD_MS = 2500;

const detectorCtor = (): BarcodeDetectorCtor | undefined =>
    (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/** Aus allen Codes eines Bildes (BarcodeDetector) der, den das Feld will. */
const pickDetected = (results: DetectedCode[], prefer: ScanPreference): { text: string; format: ScanFormat } | null => {
    let best: { text: string; format: ScanFormat; rank: number } | null = null;
    for (const result of results) {
        const text = cleanScan(result.rawValue);
        const format = scanFormatOf(result.format);
        if (!text || !acceptScan(text, format)) continue;
        const rank = scanRank(format, prefer);
        if (!best || rank < best.rank) best = { text, format, rank };
    }
    return best;
};

/** Das aktuelle Bild der Kamera auf der Leinwand (volle Grösse — feine Striche brauchen Pixel). */
const grabFrame = (video: HTMLVideoElement, holder: { current: HTMLCanvasElement | null }): HTMLCanvasElement | null => {
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA || !video.videoWidth || !video.videoHeight) return null;
    const canvas = holder.current ?? (holder.current = document.createElement('canvas'));
    // Das Telefon gedreht: das Bild wechselt Breite und Höhe.
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0);
    return canvas;
};

export type CameraProblem = 'none' | 'unsupported' | 'denied' | 'failed';

export const useBarcodeCamera = ({
    active,
    paused = false,
    onCode,
    repeatMs = REPEAT_GUARD_MS,
    prefer = 'product',
}: {
    active: boolean;
    paused?: boolean;
    onCode: (code: string) => void;
    /**
     * So lange muss ein Code aus dem Bild gewesen sein, bevor er wieder zählt.
     * Solange dasselbe Etikett im Bild bleibt, zählt es NICHT noch einmal
     * («Ürün ekle» bucht jeden Scan sofort — ein ruhig gehaltenes Etikett
     * darf nicht alle paar Sekunden +1 geben).
     */
    repeatMs?: number;
    /** Welcher Code eines Etiketts mit mehreren gilt (scanRules.ts). */
    prefer?: ScanPreference;
}) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<BarcodeDetectorLike | null>(null);
    const zxingRef = useRef<{ read: ZxingFrameReader | WasmFrameReader; gapMs: number } | null>(null);
    const loopRef = useRef<number | null>(null);
    const tickRef = useRef<() => void>(() => undefined);
    const pausedRef = useRef(paused);
    const preferRef = useRef(prefer);
    const onCodeRef = useRef(onCode);
    const repeatRef = useRef(repeatMs);
    const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
    const candidateRef = useRef<{ code: string; count: number; at: number }>({ code: '', count: 0, at: 0 });
    const startingRef = useRef(false);
    const [running, setRunning] = useState(false);
    const [starting, setStarting] = useState(false);
    const [problem, setProblem] = useState<CameraProblem>('none');
    const supported = useMemo(() => typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia), []);

    useEffect(() => { pausedRef.current = paused; }, [paused]);
    useEffect(() => { preferRef.current = prefer; }, [prefer]);
    useEffect(() => { onCodeRef.current = onCode; }, [onCode]);
    useEffect(() => { repeatRef.current = repeatMs; }, [repeatMs]);

    const stop = useCallback(() => {
        if (loopRef.current !== null) { window.clearTimeout(loopRef.current); loopRef.current = null; }
        zxingRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        detectorRef.current = null;
        const video = videoRef.current;
        if (video) { video.pause(); video.srcObject = null; }
        setRunning(false);
    }, []);

    /**
     * Ein gelesener Code — gleich woher. Erst die Prüfung (passt er zu seinem
     * Format?), bei einem Code ohne Prüfziffer die Bestätigung (zweimal
     * hintereinander gleich gelesen), dann die Dublettensperre: jedes erneute
     * Sehen desselben Codes verlängert sie, erst wenn das Etikett `repeatMs`
     * lang nicht mehr im Bild war, zählt es wieder.
     */
    const deliver = useCallback((raw: string | undefined, format: ScanFormat) => {
        const code = cleanScan(raw);
        if (!code || pausedRef.current || !acceptScan(code, format)) return;
        const now = Date.now();
        if (needsConfirmation(format)) {
            const candidate = candidateRef.current;
            candidateRef.current = candidate.code === code && now - candidate.at <= CONFIRM_WINDOW_MS
                ? { code, count: candidate.count + 1, at: now }
                : { code, count: 1, at: now };
            if (candidateRef.current.count < CONFIRM_READS) return;
        }
        const last = lastRef.current;
        if (code === last.code && now - last.at <= repeatRef.current) {
            lastRef.current = { code, at: now };
            return;
        }
        lastRef.current = { code, at: now };
        candidateRef.current = { code: '', count: 0, at: 0 };
        onCodeRef.current(code);
    }, []);

    /** ZXing laden (nur wo es keinen BarcodeDetector gibt): ZXing-C++, sonst ZXing-js. */
    const startZxing = useCallback(async () => {
        if (zxingRef.current) return;
        try {
            const { createWasmFrameReader } = await import('./zxingWasm');
            const read = await createWasmFrameReader();
            if (!streamRef.current || zxingRef.current) return;
            zxingRef.current = { read, gapMs: WASM_GAP_MS };
            setProblem('none');
            return;
        } catch (error) {
            console.warn('[Depo] ZXing-C++ (WebAssembly) nicht verfügbar — ZXing-js liest:', error);
        }
        try {
            const zxing = await import('@zxing/library');
            if (!streamRef.current || zxingRef.current) return;
            zxingRef.current = {
                read: createZxingFrameReader({
                    Luminance: zxing.RGBLuminanceSource,
                    Bitmap: zxing.BinaryBitmap,
                    Binarizer: zxing.HybridBinarizer,
                    OneD: zxing.MultiFormatOneDReader,
                    QR: zxing.QRCodeReader,
                    DataMatrix: zxing.DataMatrixReader,
                    Format: zxing.BarcodeFormat,
                    Hint: zxing.DecodeHintType,
                }),
                gapMs: ZXING_GAP_MS,
            };
            setProblem('none');
        } catch (error) {
            console.error('[Depo] ZXing konnte nicht starten:', error);
            setProblem('unsupported');
        }
    }, []);

    /** Ein Bild lesen, dann das nächste — die Schleife endet nur mit `stop`. */
    const tick = useCallback(async () => {
        loopRef.current = null;
        const video = videoRef.current;
        if (!video || !streamRef.current) return;
        const detector = detectorRef.current;
        const zxing = zxingRef.current;
        if (!pausedRef.current && (detector || zxing)) {
            try {
                const canvas = grabFrame(video, canvasRef);
                if (canvas && detector) {
                    const best = pickDetected(await detector.detect(canvas), preferRef.current);
                    if (best) deliver(best.text, best.format);
                } else if (canvas && zxing) {
                    const hit = await zxing.read(canvas, preferRef.current);
                    if (hit) deliver(hit.text, hit.format);
                }
            } catch (error) {
                // Ein Detector, der nur dem Namen nach existiert: ab hier liest ZXing.
                if (detector && (error as { name?: string } | null)?.name === 'NotSupportedError') {
                    detectorRef.current = null;
                    void startZxing();
                }
                // Sonst: dieses Bild nicht — das nächste versucht es wieder.
            }
        }
        if (streamRef.current) {
            loopRef.current = window.setTimeout(() => tickRef.current(), zxingRef.current?.gapMs ?? DETECT_GAP_MS);
        }
    }, [deliver, startZxing]);
    useEffect(() => { tickRef.current = () => { void tick(); }; }, [tick]);

    const start = useCallback(async () => {
        if (streamRef.current || startingRef.current) return;
        if (!supported) { setProblem('unsupported'); return; }
        startingRef.current = true;
        setStarting(true);
        setProblem('none');
        try {
            // Volle HD, wo es geht — feine Striche (Seriennummern-Etiketten) brauchen Pixel.
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
                audio: false,
            });
            // Dauerfokus, wo die Kamera ihn kann (Android, manche Webcams).
            const [track] = stream.getVideoTracks();
            const capabilities = (track?.getCapabilities?.() ?? {}) as { focusMode?: string[] };
            if (track && capabilities.focusMode?.includes('continuous')) {
                await track.applyConstraints({ advanced: [{ focusMode: 'continuous' } as MediaTrackConstraintSet] }).catch(() => undefined);
            }
            const video = videoRef.current;
            if (!video) { stream.getTracks().forEach((track) => track.stop()); return; }
            streamRef.current = stream;
            video.srcObject = stream;
            await video.play();
            setRunning(true);
            const Ctor = detectorCtor();
            if (Ctor) {
                try {
                    detectorRef.current = new Ctor({ formats: BARCODE_FORMATS });
                } catch {
                    detectorRef.current = null;
                }
            }
            if (!detectorRef.current) void startZxing();
            loopRef.current = window.setTimeout(() => tickRef.current(), DETECT_GAP_MS);
        } catch (error) {
            stop();
            const name = String((error as { name?: string } | null)?.name || '');
            setProblem(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'failed');
        } finally {
            startingRef.current = false;
            setStarting(false);
        }
    }, [startZxing, stop, supported]);

    // Läuft nur, solange der Leser offen ist; beim Verlassen (Aufräumen des
    // Effekts) geht das Licht aus.
    useEffect(() => {
        if (!active) return undefined;
        const timer = window.setTimeout(() => { void start(); }, 80);
        return () => { window.clearTimeout(timer); stop(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    /** Nach einem Treffer: derselbe Code darf gleich wieder gelten (nächstes, gleiches Etikett). */
    const forget = useCallback(() => {
        lastRef.current = { code: '', at: 0 };
        candidateRef.current = { code: '', count: 0, at: 0 };
    }, []);

    return { videoRef, running, starting, problem, start, stop, forget, supported };
};
