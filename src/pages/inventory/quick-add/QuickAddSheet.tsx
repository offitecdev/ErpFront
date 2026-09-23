import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { ArrowRight, Camera01, Check, ChevronLeft, ChevronRight, Plus, Scan, Trash01, X, XClose } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { articleCodesApi, type CodeCategory, type CodeScheme } from '@/lib/api/articleCodes';
import { inventoryApi } from '@/lib/api/inventory';
import { useBackDismiss } from '@/lib/backDismiss';
import { useCalViewport } from '@/pages/calendar/calendarShared';
import { useAuthStore } from '@/store/authStore';
import type { QuickStockUnitInput, ScanLookupResult, SearchItem } from '@/types/inventory';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { QuantityStepper } from '../components/QuantityStepper';

/** Model identifiers belong to Article; unique device labels belong to StockUnit.
 * Same-model mode locks the resolved article. Each device scan receives exactly one unit.
 */

type Mode = 'in' | 'delete';
type Step = 'category' | 'scheme' | 'variant' | 'scan';
type Variant = 'same' | 'different';

type ScanArticle = NonNullable<ScanLookupResult['article']>;
type ScanState =
    | { kind: 'idle' }
    | { kind: 'looking'; code: string }
    | { kind: 'found'; code: string; article: ScanArticle }
    | { kind: 'new'; code: string | null }
    | { kind: 'missing'; code: string };

interface LogEntry {
    key: string;
    name: string;
    code: string;
    kind: 'new' | 'in' | 'out';
    /** Gebuchte Menge — nur gezeigt, wenn nicht 1. */
    quantity?: number;
    error?: string;
}

type BarcodeDetectorLike = { detect: (source: CanvasImageSource) => Promise<Array<{ rawValue?: string }>> };
type BarcodeDetectorCtor = new (options?: { formats?: string[] }) => BarcodeDetectorLike;
const BARCODE_FORMATS = ['code_128', 'code_39', 'code_93', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf', 'codabar', 'qr_code', 'data_matrix'];
const detectorCtor = (): BarcodeDetectorCtor | undefined =>
    (window as Window & { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector;

/** Zwischen zwei Erkennungen — die Kamera liest sonst dreissigmal dasselbe Etikett. */
const DETECT_GAP_MS = 140;
/** Zwillingssuche im Formular: ab zwei Zeichen, entprellt. */
const MATCH_MIN = 2;
const MATCH_DELAY_MS = 260;
const MATCH_MAX = 5;
/** Derselbe Code gleich noch einmal ist das noch nicht weggelegte Etikett, kein zweites Gerät. */
const REPEAT_GUARD_MS = 2500;

const responseError = (error: unknown): string | null => {
    const data = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data;
    return typeof data?.error === 'string' && data.error ? data.error : null;
};
const responseCode = (error: unknown): string | null => {
    const data = (error as { response?: { data?: { code?: unknown } } } | null)?.response?.data;
    return typeof data?.code === 'string' ? data.code : null;
};

/** Aus «ELK-PLC-00007» den Nachfolger «ELK-PLC-00008» — die Anzeige läuft mit, ohne den Server zu fragen. */
const bumpCode = (code: string): string => {
    const match = /^(.*?)(\d+)$/.exec(code);
    if (!match) return code;
    const digits = match[2]!;
    return `${match[1]}${String(Number(digits) + 1).padStart(digits.length, '0')}`;
};

/**
 * Die Kamera als Barcode-Leser: `getUserMedia` (Rückkamera bevorzugt) und
 * der native `BarcodeDetector`, wo es ihn gibt (Android, macOS). Wo er FEHLT
 * oder nicht arbeitet — Chrome/Edge auf Windows kennen ihn gar nicht, Safari
 * auf dem iPhone ebenso wenig (gefunden 10.09.2026: die Kamera lief, die
 * Linie wanderte, und nichts wurde je gelesen) — übernimmt ZXing im
 * Browser (`@zxing/browser`, erst dann nachgeladen). Das Feld darunter bleibt
 * in jedem Fall der Weg des Handscanners. `paused` hält die Erkennung an,
 * während ein Treffer angezeigt wird — die Kamera läuft weiter.
 */
type ZxingControls = { stop: () => void };
const useBarcodeCamera = (active: boolean, paused: boolean, onCode: (code: string) => void) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const detectorRef = useRef<BarcodeDetectorLike | null>(null);
    const zxingRef = useRef<ZxingControls | null>(null);
    const loopRef = useRef<number | null>(null);
    /** Der nächste Lesegang — über die Ref, damit `tick` sich nicht selbst nennen muss. */
    const tickRef = useRef<() => void>(() => undefined);
    const pausedRef = useRef(paused);
    const onCodeRef = useRef(onCode);
    const lastRef = useRef<{ code: string; at: number }>({ code: '', at: 0 });
    const [running, setRunning] = useState(false);
    const [starting, setStarting] = useState(false);
    const [problem, setProblem] = useState<'none' | 'unsupported' | 'denied' | 'failed'>('none');
    const supported = useMemo(() => Boolean(navigator.mediaDevices?.getUserMedia), []);

    useEffect(() => { pausedRef.current = paused; }, [paused]);
    useEffect(() => { onCodeRef.current = onCode; }, [onCode]);

    const stop = useCallback(() => {
        if (loopRef.current !== null) { window.clearTimeout(loopRef.current); loopRef.current = null; }
        zxingRef.current?.stop();
        zxingRef.current = null;
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
        detectorRef.current = null;
        if (videoRef.current) { videoRef.current.pause(); videoRef.current.srcObject = null; }
        setRunning(false);
    }, []);

    /** Ein gelesener Code — gleich woher: Dublettensperre, dann hinaus. */
    const deliver = useCallback((raw: string | undefined) => {
        const code = raw?.trim();
        if (!code || pausedRef.current) return;
        const now = Date.now();
        const last = lastRef.current;
        if (code !== last.code || now - last.at > REPEAT_GUARD_MS) {
            lastRef.current = { code, at: now };
            onCodeRef.current(code);
        }
    }, []);

    /**
     * ZXing statt des nativen Detectors: liest direkt vom <video>, das schon
     * läuft. Wird nur nachgeladen, wenn es gebraucht wird (eigener Chunk).
     */
    const startZxing = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !streamRef.current || zxingRef.current) return;
        try {
            const [{ BrowserMultiFormatReader }, { BarcodeFormat, DecodeHintType }] = await Promise.all([
                import('@zxing/browser'),
                import('@zxing/library'),
            ]);
            if (!streamRef.current || zxingRef.current) return;
            const hints = new Map();
            hints.set(DecodeHintType.POSSIBLE_FORMATS, [
                BarcodeFormat.EAN_13, BarcodeFormat.EAN_8, BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93,
                BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
                BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX,
            ]);
            hints.set(DecodeHintType.TRY_HARDER, true);
            const reader = new BrowserMultiFormatReader(hints, { delayBetweenScanAttempts: DETECT_GAP_MS });
            const controls = await reader.decodeFromVideoElement(video, (result) => {
                if (result) deliver(result.getText());
            });
            zxingRef.current = controls;
            setProblem('none');
        } catch (error) {
            // Sichtbar in der Konsole: ob das Modul fehlte (Vite-Neustart) oder das Video nicht spielte.
            console.error('[Schnellerfassung] ZXing konnte nicht starten:', error);
            setProblem('unsupported');
        }
    }, [deliver]);

    const tick = useCallback(async () => {
        loopRef.current = null;
        const video = videoRef.current;
        const detector = detectorRef.current;
        if (!video || !detector || !streamRef.current) return;
        if (!pausedRef.current && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA && video.videoWidth > 0) {
            try {
                const canvas = canvasRef.current ?? (canvasRef.current = document.createElement('canvas'));
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                canvas.getContext('2d', { willReadFrequently: true })?.drawImage(video, 0, 0);
                const results = await detector.detect(canvas);
                deliver(results[0]?.rawValue);
            } catch (error) {
                /* Einzelne Bilder scheitern, während der Autofokus sich einstellt.
                   Ein NotSupportedError dagegen heisst: der Detector existiert
                   nur dem Namen nach — dann liest ab hier ZXing. */
                if ((error as { name?: string } | null)?.name === 'NotSupportedError') {
                    detectorRef.current = null;
                    void startZxing();
                    return;
                }
            }
        }
        if (streamRef.current) loopRef.current = window.setTimeout(() => tickRef.current(), DETECT_GAP_MS);
    }, [deliver, startZxing]);
    useEffect(() => { tickRef.current = () => { void tick(); }; }, [tick]);

    const start = useCallback(async () => {
        if (streamRef.current || starting) return;
        if (!supported) { setProblem('unsupported'); return; }
        setStarting(true);
        setProblem('none');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,
            });
            streamRef.current = stream;
            const video = videoRef.current;
            if (!video) { stream.getTracks().forEach((track) => track.stop()); streamRef.current = null; return; }
            video.srcObject = stream;
            await video.play();
            setRunning(true);
            const Ctor = detectorCtor();
            if (Ctor) {
                detectorRef.current = new Ctor({ formats: BARCODE_FORMATS });
                loopRef.current = window.setTimeout(() => tickRef.current(), DETECT_GAP_MS);
            } else {
                // Kein nativer Leser (Windows, iPhone): ZXing übernimmt.
                void startZxing();
            }
        } catch (error) {
            stop();
            const name = String((error as { name?: string } | null)?.name || '');
            setProblem(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'denied' : 'failed');
        } finally {
            setStarting(false);
        }
    }, [starting, startZxing, stop, supported]);

    // Läuft nur, solange der Scan-Schritt offen ist; beim Verlassen geht das Licht aus.
    useEffect(() => {
        if (!active) { stop(); return; }
        const timer = window.setTimeout(() => { void start(); }, 80);
        return () => { window.clearTimeout(timer); stop(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active]);

    /** Nach einem Treffer: derselbe Code darf gleich wieder gelten (nächstes, gleiches Etikett). */
    const forget = useCallback(() => { lastRef.current = { code: '', at: 0 }; }, []);

    return { videoRef, running, starting, problem, start, stop, forget, supported };
};

/* ── Bausteine ─────────────────────────────────────────────────────────── */

const Row = ({ code, name, hint, meta, on, onClick, disabled }: {
    code?: string;
    name: string;
    hint?: string;
    meta?: string;
    on?: boolean;
    onClick: () => void;
    disabled?: boolean;
}) => (
    <button type="button" className={`ofi-qe-row ${on ? 'is-on' : ''}`} onClick={onClick} disabled={disabled}>
        {code && <span className="ofi-qe-row__code">{code}</span>}
        <span className="ofi-qe-row__text">
            <span className="ofi-qe-row__name">{name}</span>
            {hint && <span className="ofi-qe-row__hint">{hint}</span>}
        </span>
        {meta && <span className="ofi-qe-row__meta">{meta}</span>}
        <ChevronRight size={15} />
    </button>
);

const Kv = ({ label, value, mono, name }: { label: string; value: string | number | null | undefined; mono?: boolean; name?: boolean }) => (
    <div className="ofi-qe-kv">
        <dt>{label}</dt>
        <dd className={`${mono ? 'is-mono' : ''} ${name ? 'is-name' : ''}`}>{value === null || value === undefined || value === '' ? '—' : value}</dd>
    </div>
);

export const QuickAddSheet = ({ open, onClose }: {
    open: boolean;
    /** Wird mit der Zahl der in dieser Sitzung gebuchten Geräte gerufen. */
    onClose: (added: number) => void;
}) => {
    useLanguageTick();
    const viewport = useCalViewport();
    const phone = viewport.phone;

    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canTransfer = permissions.includes('inventory.transfer');

    /* ── Erstdefinition ─────────────────────────────────────────────────── */
    const [mode, setMode] = useState<Mode>('in');
    const [step, setStep] = useState<Step>('category');
    const [direction, setDirection] = useState<'fwd' | 'back'>('fwd');
    const [categories, setCategories] = useState<CodeCategory[] | null>(null);
    const [category, setCategory] = useState<CodeCategory | null>(null);
    const [scheme, setScheme] = useState<CodeScheme | null>(null);
    const [variant, setVariant] = useState<Variant | null>(null);
    const [nextCode, setNextCode] = useState<string>('');
    const [freshTick, setFreshTick] = useState(0);

    /* ── je Gerät ───────────────────────────────────────────────────────── */
    const [scan, setScan] = useState<ScanState>({ kind: 'idle' });
    const [typed, setTyped] = useState('');
    const [barcode, setBarcode] = useState('');
    const [model, setModel] = useState('');
    const [serial, setSerial] = useState('');
    const [name, setName] = useState('');
    /** «Gleiches Modell»: Modell und Bezeichnung des ersten Geräts. */
    const [remembered, setRemembered] = useState<{ model: string; name: string } | null>(null);
    /* ZWILLING IM LAGER (Nachtrag Samet 10.09.2026: «ich will unter demselben
       ERP-Code nur die Menge erhöhen»): im Formular «Artikel festlegen» sucht
       das Tippen von Modell/Bezeichnung nach dem schon vorhandenen Artikel —
       ein Tipp macht ihn zum aktuellen Artikel statt einen neuen anzulegen. */
    const [matches, setMatches] = useState<{ query: string; rows: SearchItem[] }>({ query: '', rows: [] });
    /** Locked model for subsequent devices in same-model mode. */
    const [lastArticle, setLastArticle] = useState<{ id: string; code: string; name: string; modelNumber: string | null; unit?: string } | null>(null);
    /** Menge der nächsten Buchung («Weiter», «Speichern», Zwilling) — nach jeder Buchung wieder 1. */
    const [quantity, setQuantity] = useState(1);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [added, setAdded] = useState(0);

    const scanFieldRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const lookupRef = useRef(0);
    const scanBusyRef = useRef(false);

    const close = useCallback(() => {
        if (!saving && !scanBusyRef.current) onClose(added);
    }, [onClose, added, saving]);
    useBackDismiss(open, close);

    /* Beim Öffnen: freigegebene Kreise laden, Seite dahinter stillhalten.
       Beim Schliessen: alles zurück auf Anfang. */
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        articleCodesApi.list({ active: true })
            .then((rows) => { if (!cancelled) setCategories(rows); })
            .catch(() => { if (!cancelled) setCategories([]); });
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            cancelled = true;
            document.body.style.overflow = previousOverflow;
            lookupRef.current += 1;
            setMode('in');
            setStep('category');
            setDirection('fwd');
            setCategories(null);
            setCategory(null);
            setScheme(null);
            setVariant(null);
            setNextCode('');
            setScan({ kind: 'idle' });
            setTyped('');
            setBarcode('');
            setModel('');
            setSerial('');
            setName('');
            setRemembered(null);
            setLastArticle(null);
            setMatches({ query: '', rows: [] });
            setQuantity(1);
            setFormError(null);
            setLog([]);
            setAdded(0);
        };
    }, [open]);

    /* Search while defining a model or resolving the first unknown device.
       Keep the query with its results so late responses cannot show stale matches. */
    const defining = mode === 'in' && step === 'variant' && variant === 'same' && !lastArticle;
    const matchQuery = defining || (mode === 'in' && scan.kind === 'new') ? (model.trim() || name.trim()) : '';
    useEffect(() => {
        if (matchQuery.length < MATCH_MIN) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            inventoryApi.searchItems(matchQuery)
                .then((rows) => { if (!cancelled) setMatches({ query: matchQuery, rows: rows.slice(0, MATCH_MAX) }); })
                .catch(() => { if (!cancelled) setMatches({ query: matchQuery, rows: [] }); });
        }, MATCH_DELAY_MS);
        return () => { cancelled = true; window.clearTimeout(timer); };
    }, [matchQuery]);
    const visibleMatches = matchQuery.length >= MATCH_MIN && matches.query === matchQuery ? matches.rows : [];

    /* Escape schliesst — ausser ein Fenster liegt darüber. */
    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return;
            if (document.querySelector('[data-cal-stacked="1"]')) return;
            close();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [open, close]);

    /* ── Schritte ───────────────────────────────────────────────────────── */
    const scanning = open && (mode === 'delete' || step === 'scan');
    const go = (next: Step, dir: 'fwd' | 'back') => { setDirection(dir); setStep(next); };
    const pickCategory = (row: CodeCategory) => { setLastArticle(null); setRemembered(null); setCategory(row); setScheme(null); go('scheme', 'fwd'); };
    const pickScheme = (row: CodeScheme) => { setLastArticle(null); setRemembered(null); setScheme(row); setNextCode(row.nextCode); go('variant', 'fwd'); };
    /* «Verschiedene Modelle» geht direkt zur Kamera; «Gleiches Modell» bleibt
       hier und klappt darunter «Artikel festlegen» auf. */
    const pickVariant = (row: Variant) => {
        setVariant(row);
        setFormError(null);
        if (row === 'different') { setRemembered(null); setLastArticle(null); go('scan', 'fwd'); }
    };
    const back = () => {
        setScan({ kind: 'idle' });
        setFormError(null);
        if (step === 'scan') go('variant', 'back');
        else if (step === 'variant') go('scheme', 'back');
        else if (step === 'scheme') go('category', 'back');
    };
    const switchMode = (next: Mode) => {
        if (next === mode) return;
        setMode(next);
        setScan({ kind: 'idle' });
        setFormError(null);
        setTyped('');
    };

    /* ── Kamera ─────────────────────────────────────────────────────────── */
    const paused = saving || scan.kind !== 'idle';
    const focusScanField = () => window.setTimeout(() => scanFieldRef.current?.focus({ preventScroll: true }), 60);

    /** Ein Code ist da — von der Kamera, vom Handscanner oder getippt. */
    const takeCode = useCallback(async (raw: string) => {
        const code = raw.trim();
        if (!code || saving || scanBusyRef.current) return;
        scanBusyRef.current = true;
        const job = ++lookupRef.current;
        setFormError(null);
        setScan({ kind: 'looking', code });
        try {
            const result = await inventoryApi.scanLookup(code);
            if (lookupRef.current !== job) return;
            if (mode === 'in') {
                if (result.stockUnit) {
                    setScan({ kind: 'idle' });
                    setFormError(t('inv.quickEntry.deviceExists'));
                    return;
                }
                const anchor = variant === 'same' ? lastArticle : null;
                if (anchor && result.found && result.article?.id !== anchor.id) {
                    setScan({ kind: 'idle' });
                    setFormError(t('inv.quickEntry.modelMismatch'));
                    return;
                }
                if (anchor || (result.found && result.article)) {
                    await receiveDevice({ articleId: anchor?.id ?? result.article!.id, barcode: code });
                    return;
                }
            }
            if (result.found && result.article) {
                setScan({ kind: 'found', code, article: result.article });
                return;
            }
            if (mode === 'delete') {
                setScan({ kind: 'missing', code });
                return;
            }
            // Neu erfassen: Barcode ist gelesen, Modell/Bezeichnung ggf. vorausgefüllt.
            setBarcode(code);
            setModel(variant === 'same' && remembered ? remembered.model : '');
            setName(variant === 'same' && remembered ? remembered.name : '');
            setSerial('');
            setScan({ kind: 'new', code });
            window.setTimeout(() => {
                (variant === 'same' && remembered ? scanFieldRef : nameRef).current?.focus?.({ preventScroll: true });
            }, 80);
        } catch (error) {
            if (lookupRef.current !== job) return;
            setScan({ kind: 'idle' });
            setFormError(responseError(error) || t('inv.quickEntry.saveFailed'));
        } finally {
            scanBusyRef.current = false;
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [mode, remembered, saving, variant, lastArticle]);

    /* Destrukturiert — nicht als Objekt gehalten: der Hook gibt auch die
       Video-Ref zurück, und als Ganzes gelesen sähe die React-Regel darin
       einen Ref-Zugriff beim Zeichnen. */
    const {
        videoRef,
        running: cameraRunning,
        starting: cameraStarting,
        problem: cameraProblem,
        supported: cameraSupported,
        start: startCamera,
        stop: stopCamera,
        forget: forgetLastCode,
    } = useBarcodeCamera(scanning, paused, (code) => { void takeCode(code); });

    /** Zurück zur Kamera für das nächste Gerät. */
    const rearm = useCallback(() => {
        lookupRef.current += 1;
        forgetLastCode();
        setScan({ kind: 'idle' });
        setTyped('');
        setQuantity(1);
        setFormError(null);
        focusScanField();
    }, [forgetLastCode]);

    const onTypedSubmit = () => {
        const value = typed.trim();
        if (!value) return;
        setTyped('');
        void takeCode(value);
    };

    /** «Ohne Barcode erfassen» — direkt ins Formular. */
    const startWithoutBarcode = () => {
        setBarcode('');
        setModel(variant === 'same' && remembered ? remembered.model : '');
        setName(variant === 'same' && remembered ? remembered.name : '');
        setSerial('');
        setFormError(null);
        setScan({ kind: 'new', code: null });
        window.setTimeout(() => nameRef.current?.focus({ preventScroll: true }), 80);
    };

    /* ── Buchen ─────────────────────────────────────────────────────────── */
    const pushLog = (entry: Omit<LogEntry, 'key'>) =>
        setLog((current) => [{ key: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, ...entry }, ...current]);

    /** «Weiter» auf einen erkannten Artikel: Zugang oder Abgang in der eingegebenen Menge. */
    const bookFound = async () => {
        if (scan.kind !== 'found' || saving) return;
        if (!canTransfer) { setFormError(t('inv.quickEntry.noPermission')); return; }
        const { article, code } = scan;
        if (mode === 'in') {
            await receiveDevice({ articleId: article.id, barcode: code });
            return;
        }
        if (mode === 'delete' && article.totalQuantity <= 0) { setFormError(t('inv.quickEntry.noStock')); return; }
        if (mode === 'delete' && quantity > article.totalQuantity) { setFormError(t('inv.quickEntry.tooMuch', { count: article.totalQuantity, unit: article.unit })); return; }
        setSaving(true);
        setFormError(null);
        try {
            const deleting = mode === 'delete';
            const tags = [
                article.supplierBarcode || article.systemBarcode ? `Barcode ${article.supplierBarcode || article.systemBarcode}` : (code !== article.articleCode ? `Barcode ${code}` : null),
                article.serialNumber ? `SN ${article.serialNumber}` : null,
            ].filter(Boolean).join(' · ');
            const result = await inventoryApi.bulkCreateMovements([{
                articleId: article.id,
                movementType: deleting ? 'OUT' : 'IN',
                quantity,
                origin: deleting ? 'QUICK_DELETE' : 'QUICK_ADD',
                scannedBarcode: code,
                serialNumber: article.serialNumber ?? null,
                description: [t(deleting ? 'inv.quickEntry.deleteNote' : 'inv.quickEntry.logIn'), tags].filter(Boolean).join(' · '),
            }]);
            const rowError = result.errors[0]?.error;
            if (rowError || !result.movements.length) {
                setFormError(rowError || t('inv.quickEntry.saveFailed'));
                return;
            }
            pushLog({ name: article.name, code: article.articleCode, kind: deleting ? 'out' : 'in', quantity });
            setAdded((current) => current + 1);
            if (!deleting) setLastArticle({ id: article.id, code: article.articleCode, name: article.name, modelNumber: article.modelNumber ?? null, unit: article.unit });
            rearm();
        } catch (error) {
            setFormError(responseError(error) || t('inv.quickEntry.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    /** All barcode receipts use the atomic device endpoint. */
    const receiveDeviceRef = useRef<(input: QuickStockUnitInput) => Promise<void>>(async () => undefined);
    const receiveDevice = (input: QuickStockUnitInput) => receiveDeviceRef.current(input);
    useEffect(() => {
        receiveDeviceRef.current = async (input) => {
            if (!canTransfer) { setScan({ kind: 'idle' }); setFormError(t('inv.quickEntry.noPermission')); return; }
            setSaving(true);
            setFormError(null);
            try {
                const result = await inventoryApi.receiveQuickStockUnit(input);
                const article = result.article;
                if (variant === 'same') {
                    setLastArticle({ id: article.id, code: article.articleCode, name: article.name, modelNumber: article.modelNumber ?? null, unit: article.unit });
                    setRemembered({ model: article.modelNumber ?? '', name: article.name });
                }
                if (result.createdArticle) {
                    setNextCode(bumpCode(article.articleCode));
                    setFreshTick((tick) => tick + 1);
                }
                pushLog({ name: article.name, code: article.articleCode, kind: result.createdArticle ? 'new' : 'in', quantity: 1 });
                setAdded((current) => current + 1);
                rearm();
            } catch (error) {
                setScan((current) => current.kind === 'new' ? current : { kind: 'idle' });
                const code = responseCode(error);
                setFormError(code === 'STOCK_UNIT_EXISTS' ? t('inv.quickEntry.deviceExists')
                    : code === 'ARTICLE_MISMATCH' ? t('inv.quickEntry.modelMismatch')
                    : responseError(error) || t('inv.quickEntry.saveFailed'));
            } finally {
                setSaving(false);
            }
        };
    });

    /**
     * «Weiter zum Scannen» im Formular «Artikel festlegen»: der Artikel wird
     * JETZT angelegt — Menge 0, reine Definition unter dem nächsten ERP-Code —
     * und zum aktuellen Artikel; danach bucht jeder Scan auf ihn. Nichts wird
     * hier schon eingebucht.
     */
    const defineAnchor = async () => {
        if (!scheme || saving) return;
        if (!canCreate) { setFormError(t('inv.quickEntry.noPermission')); return; }
        const productName = name.trim();
        if (!productName) { setFormError(t('inv.quickEntry.nameRequired')); nameRef.current?.focus(); return; }
        setSaving(true);
        setFormError(null);
        try {
            const result = await inventoryApi.quickCreateArticles(scheme.id, [{
                name: productName,
                modelNumber: model.trim() || null,
                quantity: 0,
            }]);
            const rowError = result.errors[0];
            const created = result.created[0];
            if (rowError || !created) {
                setFormError(rowError?.error || t('inv.quickEntry.saveFailed'));
                return;
            }
            pushLog({ name: created.name, code: created.articleCode, kind: 'new', quantity: 0 });
            setLastArticle({ id: created.id, code: created.articleCode, name: created.name, modelNumber: model.trim() || null });
            setRemembered({ model: model.trim(), name: productName });
            setNextCode(bumpCode(created.articleCode));
            setFreshTick((tick) => tick + 1);
            go('scan', 'fwd');
        } catch (error) {
            setFormError(responseError(error) || t('inv.quickEntry.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    /** Treffer aus dem Lager gewählt: KEIN neuer Artikel — er wird der aktuelle. */
    const pickExistingAnchor = (row: SearchItem) => {
        if (saving || scanBusyRef.current) return;
        if (scan.kind === 'new' && barcode.trim()) {
            void receiveDevice({ articleId: row.id, barcode: barcode.trim(), serialNumber: serial.trim() || null });
            return;
        }
        setLastArticle({ id: row.id, code: row.code, name: row.name, modelNumber: row.modelNumber ?? null, ...(row.unit ? { unit: row.unit } : {}) });
        setRemembered({ model: row.modelNumber ?? model.trim(), name: row.name });
        setFormError(null);
        go('scan', 'fwd');
    };

    /** «Speichern» im Formular: Artikel anlegen + Zugang in der eingegebenen Menge. */
    const saveNew = async () => {
        if (scan.kind !== 'new' || !scheme || saving) return;
        if (!canCreate) { setFormError(t('inv.quickEntry.noPermission')); return; }
        const productName = name.trim();
        if (!productName) { setFormError(t('inv.quickEntry.nameRequired')); nameRef.current?.focus(); return; }
        if (barcode.trim()) {
            await receiveDevice({
                barcode: barcode.trim(), serialNumber: serial.trim() || null,
                newArticle: { schemeId: scheme.id, name: productName, modelNumber: model.trim() || null },
            });
            return;
        }
        setSaving(true);
        setFormError(null);
        try {
            const result = await inventoryApi.quickCreateArticles(scheme.id, [{
                name: productName,
                modelNumber: model.trim() || null,
                serialNumber: serial.trim() || null,
                barcode: barcode.trim() || null,
                quantity,
            }]);
            const rowError = result.errors[0];
            const created = result.created[0];
            if (rowError || !created) {
                setFormError(rowError?.code === 'SERIAL_TAKEN' ? t('inv.quickEntry.serialTaken') : (rowError?.error || t('inv.quickEntry.saveFailed')));
                return;
            }
            pushLog({ name: created.name, code: created.articleCode, kind: 'new', quantity });
            setAdded((current) => current + 1);
            setLastArticle({ id: created.id, code: created.articleCode, name: created.name, modelNumber: model.trim() || null });
            setNextCode(bumpCode(created.articleCode));
            setFreshTick((tick) => tick + 1);
            if (variant === 'same') setRemembered({ model: model.trim(), name: productName });
            rearm();
        } catch (error) {
            const code = responseCode(error);
            setFormError(code === 'SERIAL_TAKEN' ? t('inv.quickEntry.serialTaken') : (responseError(error) || t('inv.quickEntry.saveFailed')));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    /* ── Anzeige ────────────────────────────────────────────────────────── */
    const inDefinition = mode === 'in' && step !== 'scan';
    const showBack = mode === 'in' && step !== 'category';
    const crumbs = mode === 'in'
        ? [category?.name, scheme?.name, variant ? t(variant === 'same' ? 'inv.quickEntry.sameModel' : 'inv.quickEntry.differentModels') : null].filter(Boolean) as string[]
        : [t('inv.quickEntry.modeDelete')];

    const stepBody = (() => {
        if (mode === 'in' && step === 'category') {
            return (
                <>
                    <p className="ofi-qe__caption">{t('inv.quickEntry.stepCategory')}</p>
                    {categories === null ? (
                        <p className="ofi-qe__empty"><span className="ofi-qe__spinner" style={{ display: 'inline-block' }} /></p>
                    ) : categories.length === 0 ? (
                        <p className="ofi-qe__empty">{t('inv.quickEntry.noSchemes')}</p>
                    ) : (
                        <div className="ofi-qe-list">
                            {categories.map((row) => (
                                <Row key={row.id} code={row.code} name={row.name} meta={String(row.schemes.length)} on={category?.id === row.id} onClick={() => pickCategory(row)} />
                            ))}
                        </div>
                    )}
                </>
            );
        }
        if (mode === 'in' && step === 'scheme' && category) {
            return (
                <>
                    <p className="ofi-qe__caption">{t('inv.quickEntry.stepScheme')} · {category.name}</p>
                    <div className="ofi-qe-list">
                        {category.schemes.map((row) => (
                            <Row key={row.id} code={row.code} name={row.name} hint={row.nextCode} on={scheme?.id === row.id} onClick={() => pickScheme(row)} />
                        ))}
                    </div>
                </>
            );
        }
        if (mode === 'in' && step === 'variant') {
            return (
                <>
                    <p className="ofi-qe__caption">{t('inv.quickEntry.stepMode')}</p>
                    <div className="ofi-qe-list">
                        <Row name={t('inv.quickEntry.sameModel')} hint={t('inv.quickEntry.sameModelHint')} on={variant === 'same'} onClick={() => pickVariant('same')} />
                        <Row name={t('inv.quickEntry.differentModels')} hint={t('inv.quickEntry.differentModelsHint')} on={variant === 'different'} onClick={() => pickVariant('different')} />
                    </div>

                    {/* ARTIKEL FESTLEGEN (11.09.2026): unter «Gleiches Modell» — Modell,
                        Bezeichnung, der nächste ERP-Code liegt bei. «Weiter» legt den
                        Artikel an; danach gilt jeder Scan ihm. Steht der Artikel schon
                        (zurück aus dem Scannen), zeigt die Karte ihn nur noch. */}
                    {variant === 'same' && scheme && (
                        <div className="ofi-qe-card ofi-qe-define">
                            <div className="ofi-qe-card__head"><Plus />{t('inv.quickEntry.defineTitle')}</div>
                            {lastArticle ? (
                                <>
                                    <dl className="ofi-qe-card__body">
                                        <Kv label={t('inv.columns.erpCode')} value={lastArticle.code} mono />
                                        <Kv label={t('inv.quickEntry.fieldName')} value={lastArticle.name} name />
                                        <Kv label={t('inv.quickEntry.fieldModel')} value={lastArticle.modelNumber} mono />
                                    </dl>
                                    <div className="ofi-qe-card__foot">
                                        <button type="button" className="ofi-qe-btn" disabled={saving || scan.kind === 'looking'} onClick={() => { setLastArticle(null); setRemembered(null); }}>
                                            {t('inv.quickEntry.anchorChange')}
                                        </button>
                                        <button type="button" className="ofi-qe-btn is-primary is-next" autoFocus onClick={() => go('scan', 'fwd')}>
                                            {t('inv.quickEntry.defineNext')}
                                            <ArrowRight />
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <form className="ofi-qe-card__body" onSubmit={(event) => { event.preventDefault(); void defineAnchor(); }}>
                                        {/* Enter in einem der Felder = «Weiter»: ohne Knopf IM Formular schickt der Browser es bei mehreren Feldern nicht ab. */}
                                        <button type="submit" hidden tabIndex={-1} aria-hidden />
                                        <div className="ofi-qe-field">
                                            <label className="ofi-qe-field__label" htmlFor="ofi-qe-define-code">{t('inv.columns.erpCode')}</label>
                                            <input id="ofi-qe-define-code" className="is-mono is-locked" value={nextCode} readOnly tabIndex={-1} />
                                        </div>
                                        <div className="ofi-qe-field">
                                            <label className="ofi-qe-field__label" htmlFor="ofi-qe-define-model">{t('inv.quickEntry.fieldModel')}</label>
                                            <input id="ofi-qe-define-model" className="is-mono" value={model} autoComplete="off" autoFocus={!phone} onChange={(event) => setModel(event.target.value)} />
                                        </div>
                                        <div className="ofi-qe-field">
                                            <label className="ofi-qe-field__label" htmlFor="ofi-qe-define-name">{t('inv.quickEntry.fieldName')}</label>
                                            <input id="ofi-qe-define-name" ref={nameRef} value={name} autoComplete="off" autoCapitalize="sentences" onChange={(event) => setName(event.target.value)} />
                                        </div>
                                        {/* Schon im Lager? Die Treffer zu Modell/Bezeichnung — ein Tipp
                                            nimmt den vorhandenen Artikel statt einen neuen anzulegen. */}
                                        {visibleMatches.length > 0 && (
                                            <div className="ofi-qe-field">
                                                <span className="ofi-qe-field__label">{t('inv.quickEntry.defineExisting')}</span>
                                                <div className="ofi-qe-list ofi-qe-matches">
                                                    {visibleMatches.map((row) => (
                                                        <button key={row.id} type="button" className="ofi-qe-row" disabled={saving} onClick={() => pickExistingAnchor(row)}>
                                                            <span className="ofi-qe-row__code">{row.code}</span>
                                                            <span className="ofi-qe-row__text">
                                                                <span className="ofi-qe-row__name">{row.name}</span>
                                                                <span className="ofi-qe-row__hint">
                                                                    {[row.modelNumber, row.stockQuantity !== undefined ? `${row.stockQuantity} ${row.unit ?? ''}`.trim() : null].filter(Boolean).join(' · ') || t('inv.quickEntry.stock')}
                                                                </span>
                                                            </span>
                                                            <ArrowRight size={15} />
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                        <p className="ofi-qe-define__hint">{t('inv.quickEntry.defineHint')}</p>
                                        {formError && <p className="ofi-qe__error">{formError}</p>}
                                    </form>
                                    <div className="ofi-qe-card__foot">
                                        <button type="button" className="ofi-qe-btn" disabled={saving} onClick={() => go('scan', 'fwd')}>
                                            {t('inv.quickEntry.scanFirst')}
                                        </button>
                                        <button type="button" className="ofi-qe-btn is-primary is-next" disabled={saving || !canCreate} onClick={() => void defineAnchor()}>
                                            {saving ? <span className="ofi-qe__spinner" /> : null}
                                            {t('inv.quickEntry.defineNext')}
                                            <ArrowRight />
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}
                </>
            );
        }

        /* ── Scan (Zugang) oder Löschen ─────────────────────────────────── */
        const cameraNote = cameraProblem === 'unsupported'
            ? t('inv.quickEntry.cameraUnsupported')
            : cameraProblem === 'denied'
                ? t('inv.quickEntry.cameraDenied')
                : t('inv.quickEntry.scanHint');

        return (
            <div className="ofi-qe__scan">
                <div>
                    {mode === 'in' && scheme && !(variant === 'same' && lastArticle) && (
                        <div className="ofi-qe__next">
                            <span className="ofi-qe__next-label">{t('inv.quickEntry.nextCode')}</span>
                            <span key={freshTick} className={`ofi-qe__next-code ${freshTick ? 'is-fresh' : ''}`}>{nextCode}</span>
                        </div>
                    )}
                    {/* «Gleiches Modell» mit aktuellem Artikel: DER Code, auf den alles
                        gebucht wird — statt des nächsten freien. */}
                    {mode === 'in' && variant === 'same' && lastArticle && (
                        <div className="ofi-qe__next is-anchor">
                            <span className="ofi-qe__next-label">{t('inv.quickEntry.anchorTitle')}</span>
                            <span className="ofi-qe__next-code">{lastArticle.code}</span>
                            <span className="ofi-qe__anchor-name">{lastArticle.name}{lastArticle.modelNumber ? ` · ${lastArticle.modelNumber}` : ''}</span>
                            {/* One unique device per scan. */}
                            <span className="ofi-qe__anchor-row is-qty">
                                <span className="ofi-qe__anchor-hint">{t('inv.quickEntry.anchorScanQty')}</span>
                                <span>1 {lastArticle.unit}</span>
                            </span>
                            <span className="ofi-qe__anchor-row">
                                <span className="ofi-qe__anchor-hint">
                                    {t('inv.quickEntry.anchorCount', { count: log.filter((entry) => entry.code === lastArticle.code && !entry.error && (entry.kind === 'in' || entry.kind === 'new')).reduce((sum, entry) => sum + (entry.quantity ?? 1), 0) })} · {t('inv.quickEntry.anchorHint')}
                                </span>
                                <button type="button" className="ofi-qe-btn is-quiet" disabled={saving || scan.kind === 'looking'} onClick={() => { setLastArticle(null); setRemembered(null); }}>
                                    {t('inv.quickEntry.anchorChange')}
                                </button>
                            </span>
                        </div>
                    )}
                    <div className={`ofi-qe__cam ${paused ? 'is-paused' : ''}`}>
                        <video ref={videoRef} className="ofi-qe__video" playsInline muted autoPlay />
                        {!cameraRunning && (
                            <div className="ofi-qe__cam-idle">
                                <Camera01 />
                                <span>{cameraStarting ? '…' : cameraNote}</span>
                                {!cameraStarting && cameraSupported && cameraProblem !== 'denied' && (
                                    <button type="button" className="ofi-qe-btn" onClick={() => void startCamera()}>
                                        {t('inv.quickEntry.cameraStart')}
                                    </button>
                                )}
                            </div>
                        )}
                        {cameraRunning && <div className="ofi-qe__reticle" aria-hidden />}
                    </div>
                    <div className="ofi-qe__scanfield">
                        <Scan size={15} />
                        <input
                            ref={scanFieldRef}
                            value={typed}
                            disabled={saving || scan.kind !== 'idle'}
                            autoFocus={!phone}
                            autoComplete="off"
                            autoCapitalize="off"
                            spellCheck={false}
                            placeholder={t('inv.quickEntry.scanManual')}
                            aria-label={t('inv.quickEntry.scanTitle')}
                            onChange={(event) => setTyped(event.target.value)}
                            onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); onTypedSubmit(); } }}
                        />
                    </div>
                    <div className="ofi-qe__cam-tools">
                        {/* Läuft die Kamera, aber kein Leser arbeitet, MUSS das dastehen —
                            sonst wandert die Linie und niemand versteht, warum nichts kommt. */}
                        <p className={`ofi-qe__cam-note ${cameraRunning && cameraProblem === 'unsupported' ? 'is-warn' : ''}`}>
                            {cameraRunning && cameraProblem === 'unsupported'
                                ? t('inv.quickEntry.cameraUnsupported')
                                : mode === 'delete' ? t('inv.quickEntry.deleteHint') : (cameraRunning ? t('inv.quickEntry.scanHint') : '')}
                        </p>
                        {cameraRunning && (
                            <button type="button" className="ofi-qe-btn is-quiet" onClick={stopCamera}>{t('inv.quickEntry.cameraStop')}</button>
                        )}
                    </div>
                </div>

                <div className="ofi-qe__pane">
                    {scan.kind === 'looking' && (
                        <div className="ofi-qe-card">
                            <div className="ofi-qe-card__body" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 12px' }}>
                                <span className="ofi-qe__spinner" />
                                <span className="ofi-qe-logrow__code">{scan.code}</span>
                            </div>
                        </div>
                    )}

                    {scan.kind === 'found' && (
                        <div className={`ofi-qe-card ${mode === 'delete' ? 'is-danger' : ''}`}>
                            <div className="ofi-qe-card__head">
                                {mode === 'delete' ? <Trash01 /> : <Check />}
                                {t(mode === 'delete' ? 'inv.quickEntry.foundDelete' : 'inv.quickEntry.found')}
                            </div>
                            <dl className="ofi-qe-card__body">
                                <Kv label={t('inv.columns.erpCode')} value={scan.article.articleCode} mono />
                                <Kv label={t('inv.quickEntry.fieldName')} value={scan.article.name} name />
                                <Kv label={t('inv.quickEntry.fieldModel')} value={scan.article.modelNumber} mono />
                                <Kv label={t('inv.quickEntry.fieldSerial')} value={scan.article.serialNumber} mono />
                                <Kv label={t('inv.quickEntry.fieldBarcode')} value={scan.article.supplierBarcode || scan.article.systemBarcode} mono />
                                <Kv label={t('inv.quickEntry.stock')} value={`${scan.article.totalQuantity} ${scan.article.unit}`} mono />
                            </dl>
                            {/* Die Menge (11.09.2026): 1 vorbelegt, tippbar, Mac-Stepper daneben. */}
                            <div className="ofi-qe-field" style={{ margin: '0 12px 10px' }}>
                                <label className="ofi-qe-field__label" htmlFor="ofi-qe-found-qty">{t('inv.quickEntry.quantity')}</label>
                                <QuantityStepper id="ofi-qe-found-qty" value={quantity} onChange={setQuantity} unit={scan.article.unit} disabled={saving} onSubmit={() => void bookFound()} />
                            </div>
                            {formError && <p className="ofi-qe__error" style={{ margin: '0 12px 10px' }}>{formError}</p>}
                            <div className="ofi-qe-card__foot">
                                <button type="button" className="ofi-qe-btn" disabled={saving} onClick={rearm}>{t('common.cancel')}</button>
                                <button
                                    type="button"
                                    className={`ofi-qe-btn is-primary is-next ${mode === 'delete' ? 'is-danger' : ''}`}
                                    disabled={saving}
                                    autoFocus
                                    onClick={() => void bookFound()}
                                >
                                    {saving ? <span className="ofi-qe__spinner" /> : null}
                                    {t('inv.quickEntry.next')}
                                    <ArrowRight />
                                </button>
                            </div>
                        </div>
                    )}

                    {scan.kind === 'missing' && (
                        <div className="ofi-qe-card is-warn">
                            <div className="ofi-qe-card__head"><XClose />{t('inv.quickEntry.notFoundDelete')}</div>
                            <dl className="ofi-qe-card__body">
                                <Kv label={t('inv.quickEntry.fieldBarcode')} value={scan.code} mono />
                            </dl>
                            <div className="ofi-qe-card__foot">
                                <button type="button" className="ofi-qe-btn is-primary" autoFocus onClick={rearm}>{t('inv.quickEntry.rescan')}</button>
                            </div>
                        </div>
                    )}

                    {scan.kind === 'new' && (
                        <div className="ofi-qe-card">
                            <div className="ofi-qe-card__head"><Plus />{scan.code ? t('inv.quickEntry.notFound') : t('inv.quickEntry.noBarcode')}</div>
                            <form className="ofi-qe-card__body" onSubmit={(event) => { event.preventDefault(); void saveNew(); }}>
                                {/* Enter = «Speichern» (siehe «Artikel festlegen»). */}
                                <button type="submit" hidden tabIndex={-1} aria-hidden />
                                <div className="ofi-qe-field">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-qe-barcode">{t('inv.quickEntry.fieldBarcode')}</label>
                                    <input id="ofi-qe-barcode" className="is-mono" value={barcode} autoComplete="off" onChange={(event) => setBarcode(event.target.value)} />
                                </div>
                                <div className="ofi-qe-field">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-qe-model">
                                        {t('inv.quickEntry.fieldModel')}
                                        {variant === 'same' && remembered && <small> · {t('inv.quickEntry.sameModel')}</small>}
                                    </label>
                                    <input id="ofi-qe-model" className="is-mono" value={model} autoComplete="off" onChange={(event) => setModel(event.target.value)} />
                                </div>
                                <div className="ofi-qe-field">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-qe-serial">{t('inv.quickEntry.fieldSerial')}</label>
                                    <input id="ofi-qe-serial" className="is-mono" value={serial} autoComplete="off" onChange={(event) => setSerial(event.target.value)} />
                                </div>
                                <div className="ofi-qe-field">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-qe-name">{t('inv.quickEntry.fieldName')}</label>
                                    <input id="ofi-qe-name" ref={nameRef} value={name} autoComplete="off" autoCapitalize="sentences" onChange={(event) => setName(event.target.value)} />
                                </div>
                                {visibleMatches.length > 0 && (
                                    <div className="ofi-qe-field">
                                        <span className="ofi-qe-field__label">{t('inv.quickEntry.defineExisting')}</span>
                                        <div className="ofi-qe-list ofi-qe-matches">
                                            {visibleMatches.map((row) => (
                                                <Row key={row.id} code={row.code} name={row.name} hint={row.modelNumber ?? undefined}
                                                    disabled={saving} onClick={() => pickExistingAnchor(row)} />
                                            ))}
                                        </div>
                                    </div>
                                )}
                                <div className="ofi-qe-field">
                                    <label className="ofi-qe-field__label" htmlFor="ofi-qe-new-qty">{t('inv.quickEntry.quantity')}</label>
                                    <QuantityStepper id="ofi-qe-new-qty" value={barcode.trim() ? 1 : quantity} onChange={setQuantity} disabled={saving || Boolean(barcode.trim())} />
                                </div>

                                {formError && <p className="ofi-qe__error">{formError}</p>}
                            </form>
                            <div className="ofi-qe-card__foot">
                                <button type="button" className="ofi-qe-btn" disabled={saving} onClick={rearm}>{t('common.cancel')}</button>
                                <button type="button" className="ofi-qe-btn is-primary" disabled={saving || !canCreate} onClick={() => void saveNew()}>
                                    {saving ? <span className="ofi-qe__spinner" /> : <Check />}
                                    {t('inv.quickEntry.save')}
                                </button>
                            </div>
                        </div>
                    )}

                    {scan.kind === 'idle' && (
                        <>
                            {formError && <p className="ofi-qe__error">{formError}</p>}
                            {mode === 'in' && canCreate && !(variant === 'same' && lastArticle) && (
                                <button type="button" className="ofi-qe-btn is-block" onClick={startWithoutBarcode}>
                                    <Plus />
                                    {t('inv.quickEntry.noBarcode')}
                                </button>
                            )}
                        </>
                    )}

                    <div className="ofi-qe__log">
                        <p className="ofi-qe__caption">{t('inv.quickEntry.logTitle')}{log.length ? ` · ${log.length}` : ''}</p>
                        {log.length ? (
                            <div className="ofi-qe-list">
                                {log.map((entry, index) => (
                                    <div key={entry.key} className={`ofi-qe-logrow ${index === 0 ? 'is-new' : ''} ${entry.kind === 'out' ? 'is-out' : ''} ${entry.error ? 'is-error' : ''}`}>
                                        <span className="ofi-qe-logrow__mark">{entry.kind === 'out' ? <Trash01 /> : <Check />}</span>
                                        <span className="ofi-qe-logrow__text">
                                            <span className="ofi-qe-logrow__name">{entry.name}</span>
                                            <span className="ofi-qe-logrow__code">{entry.code}</span>
                                        </span>
                                        <span className="ofi-qe-logrow__kind">
                                            {entry.quantity !== undefined && entry.quantity !== 1 ? `${entry.quantity} × ` : ''}
                                            {t(entry.kind === 'new' ? 'inv.quickEntry.logNew' : entry.kind === 'out' ? 'inv.quickEntry.logOut' : 'inv.quickEntry.logIn')}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="ofi-qe__empty">{t('inv.quickEntry.logEmpty')}</p>
                        )}
                    </div>
                </div>
            </div>
        );
    })();

    const sheet = (
        <div className={`ofi-qe-scrim ${phone ? 'is-phone' : ''}`} role="presentation">
            <section
                role="dialog"
                aria-modal="true"
                aria-label={t('inv.quickEntry.title')}
                /* `.ofi-compact-modal` = Ausstieg aus der 1280px-Regel für
                   Portal-Dialoge (index.css, siehe portal-dialog-forced-width). */
                className={`ofi-qe ofi-pop ofi-compact-modal ${phone ? 'is-phone' : ''}`}
            >
                <header className="ofi-qe__head">
                    <button
                        type="button"
                        className={`ofi-qe__back ${showBack ? '' : 'is-hidden'}`}
                        aria-label={t('inv.quickEntry.back')}
                        tabIndex={showBack ? 0 : -1}
                        disabled={saving || scan.kind === 'looking'}
                        onClick={back}
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <div className="ofi-qe__titles">
                        <h2 className="ofi-qe__title">{t('inv.quickEntry.title')}</h2>
                        {crumbs.length > 0 && (
                            <div className="ofi-qe__crumbs">
                                {crumbs.map((crumb, index) => (
                                    <span key={`${crumb}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                        {index > 0 && <ChevronRight />}
                                        {crumb}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>
                    {added > 0 && <span className="ofi-qe__count">{added}</span>}
                    {canTransfer && (
                        <div className="ofi-qe-seg" role="tablist" aria-label={t('inv.quickEntry.title')}>
                            <button type="button" role="tab" aria-selected={mode === 'in'} className={`ofi-qe-seg__btn ${mode === 'in' ? 'is-on' : ''}`} disabled={saving || scan.kind === 'looking'} onClick={() => switchMode('in')}>
                                <Plus />
                                {t('inv.quickEntry.modeIn')}
                            </button>
                            <button type="button" role="tab" aria-selected={mode === 'delete'} className={`ofi-qe-seg__btn is-danger ${mode === 'delete' ? 'is-on' : ''}`} disabled={saving || scan.kind === 'looking'} onClick={() => switchMode('delete')}>
                                <Trash01 />
                                {t('inv.quickEntry.modeDelete')}
                            </button>
                        </div>
                    )}
                    <button type="button" className="ofi-float-card__iconbtn" aria-label={t('inv.quickEntry.close')} disabled={saving || scan.kind === 'looking'} onClick={close}>
                        <X size={18} />
                    </button>
                </header>

                <div className="ofi-qe__body">
                    <div key={`${mode}-${inDefinition ? step : 'scan'}`} className={`ofi-qe__step ${direction === 'back' ? 'is-back' : ''}`}>
                        {stepBody}
                    </div>
                </div>

                <footer className="ofi-qe__foot">
                    <button type="button" className="ofi-qe-btn" disabled={saving || scan.kind === 'looking'} onClick={close}>{t('inv.quickEntry.close')}</button>
                </footer>
            </section>
        </div>
    );

    return createPortal(sheet, document.body);
};
