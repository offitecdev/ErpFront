import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Camera01, Check, Image01, Minus, Plus, X, XClose } from '@/components/icons/antIconCompat';
import { Spinner } from '@/components/ui-shared/Loader';
import { UnitSelect } from '@/components/ui-shared/UnitSelect';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useBackDismiss } from '@/lib/backDismiss';
import { canvasToProductImage, prepareImage, type PreparedImage } from '@/lib/ocr/imagePrep';
import {
    OcrUnavailable,
    recognizeRegion,
    recognizeRegionLive,
    type OcrBox,
} from '@/lib/ocr/ocrEngine';
import { snapToKnown } from '@/lib/ocr/textSense';
import { useCalViewport } from '@/pages/calendar/calendarShared';
import { useAuthStore } from '@/store/authStore';
import { useUnitStore } from '@/store/unitStore';
import type { SearchItem } from '@/types/inventory';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { parseNum } from '../utils/format';

/**
 * SCHNELLERFASSUNG — Foto → Text → Produkt, in einem Fenster (02.09.2026).
 *
 * Vorgabe Samet: «Foto aufnehmen, der Produktname wird erkannt oder sein
 * Bereich markiert; antippen, Menge eingeben, nächstes Produkt — schnell,
 * mit einem Schliessen-Knopf unten. Codes vergibt das System.»
 *
 * Ablauf:
 *   1. Kamera (`<input capture>`) oder Bild — das Foto wird verkleinert; es
 *      wird noch NICHT gelesen und der Produktname bleibt leer.
 *   2. Der Anwender zieht mit Finger oder Stift ein Viereck um den
 *      gewünschten Namen. Ausschliesslich dieser AUSSCHNITT geht über den
 *      eigenen Server an Google Cloud Vision — nie das ganze Foto — und sein
 *      Text landet direkt im Namensfeld; es gibt keine Vorschlagsliste.
 *   3. Der Name wird gegen die Produktliste gesucht: gibt es das Produkt
 *      schon, wird ein EINGANG gebucht statt ein Doppel angelegt (bei
 *      gleichem Namen automatisch, sonst auf Tipp).
 *   4. Menge (grosse −/+), Einheit, «Hinzufügen» — jedes Produkt wird SOFORT
 *      gespeichert und landet im Protokoll; das Foto bleibt für die nächste
 *      Zeile stehen, «Neues Foto» holt das nächste Etikett.
 *   5. «Schliessen» unten beendet; die Liste dahinter lädt neu, wenn etwas
 *      erfasst wurde.
 *
 * SELBST MARKIEREN (Nachtrag Samet, gleicher Tag): «Mit dem Finger über den
 * Bereich fahren, dann wird er zu Text — findet die Erkennung nichts, markiere
 * ich selbst, und die anderen Markierungen verschwinden. Und die gewählte
 * Markierung muss sich vergrössern lassen, an Ort und Stelle — kein Fenster,
 * das woanders aufgeht.»
 *   · Ziehen auf dem Foto zieht ein VIERECK auf (Nachtrag Samet: «der
 *     Auswahlbereich soll viereckig sein» — wie in Google Lens, alles
 *     ausserhalb gedimmt); beim Loslassen wird NUR sein Ausschnitt gelesen
 *     (`recognizeRegion` → Cloud Vision) und sein Text wird der Name.
 *   · Der Rahmen trägt acht Griffe (Ecken + Kanten) und lässt sich innen
 *     verschieben; jede Änderung liest den Ausschnitt neu.
 *   · Ein blosser TIPP bleibt folgenlos — erst ab 6px Bewegung wird gezeichnet.
 *
 * MITSCHREIBEN (Nachtrag Samet, gleicher Tag): «Beim Markieren soll er von
 * links nach rechts mitschreiben und das Feld dabei laufend leeren; und ein x
 * im Feld, das alles löscht — am Anfang unsichtbar, erst nach einer Auswahl.»
 *   · Sobald aus dem Fingerdruck ein Strich wird, ist das Namensfeld LEER
 *     (`clearInput`) — der alte Name steht nie neben dem neuen.
 *   · Während das Viereck wächst, liest `recognizeRegionLive` seinen Ausschnitt
 *     und setzt den Namen jedes Mal NEU (nie angehängt); der
 *     Text wandert so von links nach rechts mit dem Finger mit. Es ist immer
 *     nur EIN Zwischenstand unterwegs (`liveRef`), Nachzügler werden über
 *     `token` verworfen, und beim Loslassen überschreibt ihn der genaue
 *     Lesegang. Findet der genaue nichts, bleibt der Zwischenstand stehen.
 *   · Das «x» im Feld erscheint erst, wenn etwas drinsteht oder markiert ist,
 *     und räumt beides weg.
 *
 * NACHDENKEN (Nachtrag Samet, gleicher Tag): «etwas Klügeres, das das System
 * nicht belastet — es soll richtig erraten, was dasteht, ein bisschen wie
 * Google Lens — nimm Google Cloud Vision, tesseract.js raus.» Gelesen wird
 * seither von Vision; die Nachdenk-Schicht darüber sitzt in
 * `lib/ocr/textSense.ts` und kostet keine weitere Anfrage: im Viereck zählt nur die grösste
 * Schrift, sichere Zeichenverwechslungen werden geheilt, und der gelesene
 * Text wird an den Produktkatalog ANGELEGT (`snapToKnown`) — die Trefferliste
 * dafür holt dieses Fenster ohnehin schon. Aus einem schlecht belichteten
 * Etikett wird so der Name, der wirklich im Lager steht.
 *
 * Neue Produkte gehen über `POST /inventory/articles/quick` (Nummer
 * `ART-NNNNN` vom Server), Eingänge über `movements/bulk` — beides dieselben
 * Wege wie Tabelle und Lagerseite, nur ohne Codefeld.
 *
 * Zustand, der sich aus anderem Zustand ERGIBT (Vorgabe-Einheit, der
 * automatisch gefundene Zwilling in der Produktliste, die sichtbaren
 * Treffer), wird beim Zeichnen abgeleitet und nicht in Effekten gesetzt.
 */

type Phase = 'idle' | 'preparing' | 'ready' | 'failed';

interface LogEntry {
    key: string;
    name: string;
    code: string;
    qty: number;
    unit: string;
    kind: 'new' | 'in';
    error?: string;
}

/** Ein Rechteck in ANTEILEN der Bildanzeige (0…1) — unabhängig von Pixeln. */
type Fraction = { x: number; y: number; w: number; h: number };
type HandleMode = 'move' | 'n' | 's' | 'e' | 'w' | 'nw' | 'ne' | 'sw' | 'se';
type Drag =
    | { kind: 'draw'; id: number; rect: DOMRect; x0: number; y0: number; active: boolean }
    | { kind: 'frame'; id: number; rect: DOMRect; x0: number; y0: number; mode: HandleMode; origin: Fraction; active: boolean };

const HANDLES: HandleMode[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const MAX_MATCHES = 4;
const SEARCH_DELAY_MS = 320;
const MIN_QUERY = 2;
/** Unter dieser Bewegung ist ein Fingerdruck ein Tipp, kein Ziehen. */
const DRAG_THRESHOLD_PX = 6;
/** Kleinster Rahmen, der noch gelesen wird. */
const MIN_FRAME_PX = 8;
/** Erst ab dieser Breite lohnt ein Zwischenstand unter dem Finger. */
const LIVE_MIN_PX = 26;
/* Die Zwischenstände gehen (ohne nativen Erkenner) zu Google Cloud Vision,
   und Vision rechnet je Bild ab. Zwei Bremsen halten einen Strich deshalb bei
   zwei, drei Aufrufen statt dreißig: ein Mindestabstand in der Zeit und ein
   Mindestzuwachs in der Breite — ein Viereck, das sich kaum verändert hat,
   liest sich ohnehin gleich. */
const LIVE_GAP_MS = 420;
const LIVE_GROWTH_PX = 28;

const normalizeName = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));
const pct = (value: number, whole: number) => `${(value / whole) * 100}%`;

const boxToFraction = (box: OcrBox, size: { width: number; height: number }): Fraction => ({
    x: box.x0 / size.width,
    y: box.y0 / size.height,
    w: (box.x1 - box.x0) / size.width,
    h: (box.y1 - box.y0) / size.height,
});
const fractionToBox = (fraction: Fraction, size: { width: number; height: number }): OcrBox => ({
    x0: fraction.x * size.width,
    y0: fraction.y * size.height,
    x1: (fraction.x + fraction.w) * size.width,
    y1: (fraction.y + fraction.h) * size.height,
});

/**
 * Das aufgezogene VIERECK, von der Ecke, wo der Finger aufsetzte, zur Ecke,
 * wo er gerade steht (Vorgabe Samet, 02.09.2026: «der Auswahlbereich soll
 * viereckig sein» — wie der Rahmen in Google Lens). Bis zur Kante der Anzeige
 * eingesperrt; eine Mindesthöhe hält den Ausschnitt lesbar, wenn jemand nur
 * waagrecht über eine Zeile streicht.
 */
const drawnFraction = (rect: DOMRect, x0: number, y0: number, x1: number, y1: number): Fraction => {
    const ax = clamp((x0 - rect.left) / rect.width, 0, 1);
    const ay = clamp((y0 - rect.top) / rect.height, 0, 1);
    const bx = clamp((x1 - rect.left) / rect.width, 0, 1);
    const by = clamp((y1 - rect.top) / rect.height, 0, 1);
    const minH = Math.min(1, 32 / rect.height);
    const width = Math.abs(bx - ax);
    const height = Math.max(minH, Math.abs(by - ay));
    const centerY = (ay + by) / 2;
    return {
        x: Math.min(ax, bx),
        y: clamp(centerY - height / 2, 0, 1 - height),
        w: width,
        h: height,
    };
};

/** Einen Griff (oder den ganzen Rahmen) um dx/dy (Anteile) bewegen. */
const resizeFraction = (origin: Fraction, mode: HandleMode, dx: number, dy: number, minW: number, minH: number): Fraction => {
    if (mode === 'move') {
        return {
            x: clamp(origin.x + dx, 0, 1 - origin.w),
            y: clamp(origin.y + dy, 0, 1 - origin.h),
            w: origin.w,
            h: origin.h,
        };
    }
    let { x, y, w, h } = origin;
    const right = origin.x + origin.w;
    const bottom = origin.y + origin.h;
    if (mode.includes('e')) w = clamp(origin.w + dx, minW, 1 - origin.x);
    if (mode.includes('w')) { x = clamp(origin.x + dx, 0, right - minW); w = right - x; }
    if (mode.includes('s')) h = clamp(origin.h + dy, minH, 1 - origin.y);
    if (mode.includes('n')) { y = clamp(origin.y + dy, 0, bottom - minH); h = bottom - y; }
    return { x, y, w, h };
};

/** Die Fehlermeldung des Servers, wenn er eine geschickt hat. */
const responseError = (error: unknown): string | null => {
    const data = (error as { response?: { data?: { error?: unknown } } } | null)?.response?.data;
    return typeof data?.error === 'string' && data.error ? data.error : null;
};

/**
 * Das Viereck auf dem Foto: Fläche + acht Griffe, alles ausserhalb gedimmt.
 * `look` = 'drawing' (wächst gerade unter dem Finger, ohne Griffe) oder 'set'
 * (der gewählte Ausschnitt: Griffe, innen verschiebbar).
 */
const LassoFrame = ({ fraction, look, busy, onHandleDown, onBodyDown }: {
    fraction: Fraction;
    look: 'drawing' | 'set';
    busy?: boolean;
    onHandleDown?: (event: React.PointerEvent<HTMLElement>, mode: HandleMode) => void;
    onBodyDown?: (event: React.PointerEvent<HTMLElement>) => void;
}) => (
    <div
        className={`ofi-qa__lasso is-${look} ${busy ? 'is-busy' : ''}`}
        style={{ left: pct(fraction.x, 1), top: pct(fraction.y, 1), width: pct(fraction.w, 1), height: pct(fraction.h, 1) }}
        aria-hidden
    >
        {look === 'set' && <div className="ofi-qa__lasso-body" onPointerDown={onBodyDown} />}
        {look !== 'drawing' && HANDLES.map((mode) => (
            <span key={mode} className={`ofi-qa__handle is-${mode}`} onPointerDown={(event) => onHandleDown?.(event, mode)} />
        ))}
    </div>
);

export const QuickAddSheet = ({ open, onClose }: {
    open: boolean;
    /** Wird mit der Zahl der in dieser Sitzung erfassten Produkte gerufen. */
    onClose: (added: number) => void;
}) => {
    useLanguageTick();
    const viewport = useCalViewport();
    const phone = viewport.phone;

    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canTransfer = permissions.includes('inventory.transfer');

    const units = useUnitStore((state) => state.units);
    const ensureUnits = useUnitStore((state) => state.ensure);

    const [phase, setPhase] = useState<Phase>('idle');
    const [image, setImage] = useState<PreparedImage | null>(null);
    const [failure, setFailure] = useState<string | null>(null);

    /* Eigener Ausschnitt (Pixel des erkannten Bildes) und der Rahmen, der
       gerade unter dem Finger wächst oder gezogen wird (Anteile der Anzeige). */
    const [region, setRegion] = useState<OcrBox | null>(null);
    /* Der Rahmen unter dem Finger — mit seinem Aussehen, damit die
       Darstellung nicht den Zieh-Merker lesen muss. */
    const [draft, setDraft] = useState<{ rect: Fraction; look: 'drawing' | 'set' } | null>(null);
    const [regionBusy, setRegionBusy] = useState(false);
    const [regionError, setRegionError] = useState<string | null>(null);

    const [name, setName] = useState('');
    const [qty, setQty] = useState('1');
    /** Die ausdrücklich gewählte Einheit; leer = Vorgabe des Mandanten. */
    const [unitChoice, setUnitChoice] = useState('');
    const [matches, setMatches] = useState<{ query: string; rows: SearchItem[] }>({ query: '', rows: [] });
    /** Von Hand gewählter Zwilling in der Produktliste. */
    const [linkedChoice, setLinkedChoice] = useState<SearchItem | null>(null);
    /** «Stattdessen neu anlegen» — der automatische Zwilling bleibt dann aus. */
    const [declinedLink, setDeclinedLink] = useState(false);
    const [attachPhoto, setAttachPhoto] = useState(false);
    const [saving, setSaving] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [added, setAdded] = useState(0);

    const cameraRef = useRef<HTMLInputElement>(null);
    const pickerRef = useRef<HTMLInputElement>(null);
    const nameRef = useRef<HTMLInputElement>(null);
    const pictureRef = useRef<HTMLDivElement>(null);
    const imageRef = useRef<PreparedImage | null>(null);
    const jobRef = useRef(0);
    const dragRef = useRef<Drag | null>(null);
    /** Der Klick, der auf ein Ziehen folgt, gehört zum Ziehen — nicht zum Rahmen darunter. */
    const suppressClickRef = useRef(false);
    /** Der zuletzt AUS DEM BILD gelesene Name — nur er darf an den Katalog angelegt werden. */
    const ocrNameRef = useRef('');
    /* Der Strich schreibt MIT: solange er wächst, liest ein schneller Lesegang
       seinen Ausschnitt und setzt den Namen jedes Mal NEU. Es ist immer nur
       EIN Lesegang unterwegs; der zuletzt gewünschte Ausschnitt wartet in
       `next`, alle davor werden übersprungen. `token` verwirft Ergebnisse, die
       zu spät kommen, `wrote` merkt sich, ob überhaupt etwas mitgeschrieben
       wurde. */
    const liveRef = useRef<{ busy: boolean; next: OcrBox | null; token: number; wrote: boolean; timer: number | null; readWidth: number }>({
        busy: false, next: null, token: 0, wrote: false, timer: null, readWidth: 0,
    });

    const close = useCallback(() => onClose(added), [onClose, added]);
    useBackDismiss(open, close);

    /* Beim Öffnen: Erkenner vorwärmen, Einheiten holen, Seite hinter dem
       Fenster stillhalten. Beim Schliessen: alles zurück, Worker freigeben. */
    useEffect(() => {
        if (!open) return;
        void ensureUnits();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
            jobRef.current += 1;
            dragRef.current = null;
            if (liveRef.current.timer !== null) window.clearTimeout(liveRef.current.timer);
            liveRef.current = { busy: false, next: null, token: liveRef.current.token + 1, wrote: false, timer: null, readWidth: 0 };
            imageRef.current?.release();
            imageRef.current = null;
            setImage(null);
            setFailure(null);
            setPhase('idle');
            setRegion(null);
            setDraft(null);
            setRegionBusy(false);
            setRegionError(null);
            setName('');
            setQty('1');
            setMatches({ query: '', rows: [] });
            setLinkedChoice(null);
            setDeclinedLink(false);
            setFormError(null);
            setLog([]);
            setAdded(0);
        };
    }, [open, ensureUnits]);

    /* Escape schliesst — ausser ein Auswahlfenster (Einheiten) liegt darüber. */
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

    /* Name → Suche in der Produktliste (entprellt); das Ergebnis trägt seine
       Anfrage mit, damit ein veralteter Treffer nie zu einem neuen Namen zeigt.

       Dieselbe Antwort ist auch die «Vorhersage»: stammt der Name aus dem
       Bild und steht im Katalog etwas, das bis auf ein paar verwechselbare
       Zeichen gleich lautet, gewinnt der Katalog (siehe lib/ocr/textSense).
       Das kostet keine zusätzliche Anfrage — die Trefferliste ist ohnehin da. */
    const query = name.trim();
    useEffect(() => {
        if (query.length < MIN_QUERY) return;
        let cancelled = false;
        const timer = window.setTimeout(() => {
            inventoryApi.searchItems(query)
                .then((rows) => {
                    if (cancelled) return;
                    const found = rows.slice(0, MAX_MATCHES);
                    setMatches({ query, rows: found });
                    if (ocrNameRef.current !== query) return;
                    const snapped = snapToKnown(query, found.map((row) => row.name));
                    if (!snapped) return;
                    ocrNameRef.current = snapped;
                    setName(snapped);
                })
                .catch(() => { if (!cancelled) setMatches({ query, rows: [] }); });
        }, SEARCH_DELAY_MS);
        return () => {
            cancelled = true;
            window.clearTimeout(timer);
        };
    }, [query]);

    /* ── abgeleiteter Zustand ────────────────────────────────────────────── */
    const visibleMatches = useMemo(
        () => (query.length >= MIN_QUERY && matches.query === query ? matches.rows : []),
        [query, matches],
    );
    // Gleicher Name wie ein vorhandenes Produkt → Eingang statt Doppel.
    const autoLinked = useMemo(() => {
        if (linkedChoice || declinedLink) return null;
        const wanted = normalizeName(query);
        if (!wanted) return null;
        return visibleMatches.find((row) => normalizeName(row.name) === wanted) ?? null;
    }, [linkedChoice, declinedLink, query, visibleMatches]);
    const linked = linkedChoice ?? autoLinked;

    const defaultUnit = useMemo(
        () => (units.find((row) => row.isDefault) ?? units.find((row) => row.isActive) ?? units[0])?.code ?? '',
        [units],
    );
    const unit = linked?.unit || unitChoice || defaultUnit;

    /* ── Foto vorbereiten; OCR läuft erst für den selbst markierten Bereich. */
    const takeFile = useCallback(async (file: File | null | undefined) => {
        if (!file) return;
        // Ein Lesegang des VORIGEN Fotos darf seinen Namen nicht in das neue tragen.
        jobRef.current += 1;
        liveRef.current.token += 1;
        liveRef.current.next = null;
        liveRef.current.wrote = false;
        ocrNameRef.current = '';
        setFormError(null);
        setPhase('preparing');
        setFailure(null);
        setName('');
        setRegion(null);
        setDraft(null);
        setRegionError(null);
        setLinkedChoice(null);
        setDeclinedLink(false);
        try {
            const prepared = await prepareImage(file);
            imageRef.current?.release();
            imageRef.current = prepared;
            setImage(prepared);
            setPhase('ready');
        } catch {
            setPhase('failed');
            setFailure(t('inv.quickAdd.imageFailed'));
        }
    }, []);

    const onFileInput = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        // Der Wert wird zurückgesetzt, damit dasselbe Foto erneut gewählt
        // werden kann (sonst feuert `change` beim zweiten Mal nicht).
        event.target.value = '';
        void takeFile(file);
    };

    /* ── eigenen Ausschnitt lesen ────────────────────────────────────────── */
    const readRegion = useCallback(async (source: PreparedImage, box: OcrBox) => {
        const job = ++jobRef.current;
        // Ab hier zählt nur noch der genaue Text; ein Zwischenstand, der noch
        // unterwegs ist, darf ihn nicht mehr überschreiben.
        liveRef.current.token += 1;
        liveRef.current.next = null;
        setRegionBusy(true);
        setRegionError(null);
        setLinkedChoice(null);
        setDeclinedLink(false);
        setFormError(null);
        try {
            const result = await recognizeRegion(source.canvas, box);
            if (jobRef.current !== job) return;
            if (!result.text) {
                // Was der Finger schon mitgeschrieben hat, bleibt stehen — das
                // ist mehr wert als ein leeres Feld mit einer Fehlermeldung.
                if (liveRef.current.wrote) return;
                setName('');
                setRegionError(t('inv.quickAdd.regionNoText'));
                return;
            }
            ocrNameRef.current = result.text;
            setName(result.text);
        } catch (error) {
            if (jobRef.current !== job) return;
            // Ein fehlender Schlüssel ist kein Lesefehler, sondern eine
            // fehlende Einrichtung — das muss dranstehen, sonst sucht jemand
            // den Fehler bei seinem Foto.
            const missing = error instanceof OcrUnavailable
                && (error.code === 'OCR_NOT_CONFIGURED' || error.code === 'OCR_NOT_ENABLED'
                    // Altbestand, siehe `SETUP_CODES` in lib/ocr/ocrEngine.ts.
                    || error.code === 'VISION_NOT_CONFIGURED' || error.code === 'VISION_NOT_ENABLED');
            setRegionError(t(missing ? 'inv.quickAdd.ocrNotConfigured' : 'inv.quickAdd.ocrFailed'));
        } finally {
            if (jobRef.current === job) setRegionBusy(false);
        }
    }, []);

    const onNameTyped = (value: string) => {
        // Getippt heisst: der Name ist jetzt von Hand; die Rahmen lösen sich,
        // und kein noch laufender Lesegang darf das Getippte überschreiben.
        jobRef.current += 1;
        liveRef.current.token += 1;
        liveRef.current.next = null;
        liveRef.current.wrote = false;
        ocrNameRef.current = '';
        setName(value);
        setRegion(null);
        setDraft(null);
        setRegionBusy(false);
        setRegionError(null);
        setLinkedChoice(null);
        setDeclinedLink(false);
        setFormError(null);
    };

    const chooseMatch = (row: SearchItem) => {
        setLinkedChoice(row);
        setDeclinedLink(false);
        setFormError(null);
    };

    const unlink = () => {
        setLinkedChoice(null);
        setDeclinedLink(true);
    };

    /** Die Zwischenstände anhalten und ihre Nachzügler verwerfen — ohne das Feld anzufassen. */
    const stopLive = () => {
        const live = liveRef.current;
        live.token += 1;
        live.next = null;
        live.readWidth = 0;
        if (live.timer !== null) {
            window.clearTimeout(live.timer);
            live.timer = null;
        }
    };

    /**
     * Das Feld GANZ leeren und jeden laufenden Lesegang für ungültig erklären.
     * Zwei Anlässe, derselbe Griff: das «x» im Feld (`dropRegion`, die
     * Markierung geht mit) und der Beginn eines neuen Strichs — dort soll der
     * alte Name nicht stehen bleiben, während der neue hereinwandert.
     */
    const clearInput = (dropRegion: boolean) => {
        jobRef.current += 1;
        stopLive();
        liveRef.current.wrote = false;
        ocrNameRef.current = '';
        setName('');
        setRegionBusy(false);
        setRegionError(null);
        setLinkedChoice(null);
        setDeclinedLink(false);
        setFormError(null);
        if (dropRegion) {
            setRegion(null);
            setDraft(null);
        }
    };

    const clearSelection = () => clearInput(true);

    /**
     * Den wartenden Ausschnitt lesen. Nach jedem Lesegang eine kurze Pause —
     * sie ist die einzige Bremse, die es braucht: mehr als einen Zwischenstand
     * gleichzeitig gibt es ohnehin nie, und wo der Browser selbst liest, käme
     * sonst bei jeder Fingerbewegung einer.
     */
    const pumpLive = () => {
        const live = liveRef.current;
        const source = imageRef.current;
        if (live.busy || live.timer !== null || !live.next || !source) return;
        const box = live.next;
        live.next = null;
        live.busy = true;
        live.readWidth = box.x1 - box.x0;
        const token = live.token;
        const job = jobRef.current;
        recognizeRegionLive(source.canvas, box)
            .then((text) => {
                if (!text || token !== liveRef.current.token || job !== jobRef.current) return;
                liveRef.current.wrote = true;
                ocrNameRef.current = text;
                setName(text);
            })
            .catch(() => { /* ein Zwischenstand darf danebengehen — der Lesegang beim Loslassen entscheidet */ })
            .finally(() => {
                const current = liveRef.current;
                current.busy = false;
                if (current.timer !== null) window.clearTimeout(current.timer);
                current.timer = window.setTimeout(() => { liveRef.current.timer = null; pumpLive(); }, LIVE_GAP_MS);
            });
    };

    /** Zwischenstand für den Ausschnitt anfordern, der gerade unter dem Finger liegt. */
    const queueLive = (fraction: Fraction, rect: DOMRect) => {
        if (!image) return;
        if (fraction.w * rect.width < LIVE_MIN_PX || fraction.h * rect.height < MIN_FRAME_PX) return;
        const box = fractionToBox(fraction, image);
        // Ein Viereck, das seit dem letzten Lesegang kaum gewachsen ist, ergibt
        // denselben Text — dafür lohnt kein Aufruf.
        const grown = Math.abs((box.x1 - box.x0) - liveRef.current.readWidth);
        if (liveRef.current.readWidth > 0 && grown < LIVE_GROWTH_PX) return;
        liveRef.current.next = box;
        pumpLive();
    };

    /* ── Ziehen auf dem Foto: zeichnen, verschieben, vergrössern ─────────── */
    const busy = phase === 'preparing';
    const canTrace = Boolean(image) && !busy && !regionBusy;

    const capturePointer = (pointerId: number) => {
        try { pictureRef.current?.setPointerCapture(pointerId); } catch { /* alte WebViews */ }
    };

    const onPicturePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
        if (!canTrace || !pictureRef.current) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        // Kein Bildziehen, keine Textauswahl unter der Maus.
        if (event.pointerType === 'mouse') event.preventDefault();
        const rect = pictureRef.current.getBoundingClientRect();
        dragRef.current = {
            kind: 'draw',
            id: event.pointerId,
            rect,
            x0: event.clientX,
            y0: event.clientY,
            active: false,
        };
    };

    /** Griff oder Fläche eines bestehenden Rahmens angefasst. */
    const startFrameDrag = (event: React.PointerEvent<HTMLElement>, mode: HandleMode, origin: Fraction) => {
        if (!canTrace || !pictureRef.current) return;
        if (event.pointerType === 'mouse' && event.button !== 0) return;
        event.stopPropagation();
        event.preventDefault();
        dragRef.current = {
            kind: 'frame',
            id: event.pointerId,
            rect: pictureRef.current.getBoundingClientRect(),
            x0: event.clientX,
            y0: event.clientY,
            mode,
            origin,
            // Ein Griff zieht sofort; die Fläche erst ab der Schwelle (ein
            // Tipp darauf soll nichts verschieben).
            active: mode !== 'move',
        };
        if (mode !== 'move') {
            capturePointer(event.pointerId);
            // Ein Griff zieht ohne Schwelle los — also hier leeren, nicht erst
            // in der Bewegung (der Rahmen selbst bleibt, er wird ja verändert).
            clearInput(false);
            setDraft({ rect: origin, look: 'set' });
        }
    };

    const fractionForDrag = (drag: Drag, clientX: number, clientY: number): Fraction => {
        if (drag.kind === 'draw') return drawnFraction(drag.rect, drag.x0, drag.y0, clientX, clientY);
        const dx = (clientX - drag.x0) / drag.rect.width;
        const dy = (clientY - drag.y0) / drag.rect.height;
        return resizeFraction(drag.origin, drag.mode, dx, dy, MIN_FRAME_PX / drag.rect.width, MIN_FRAME_PX / drag.rect.height);
    };

    const onPicturePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        if (!drag.active) {
            if (Math.hypot(event.clientX - drag.x0, event.clientY - drag.y0) < DRAG_THRESHOLD_PX) return;
            drag.active = true;
            capturePointer(event.pointerId);
            // Jetzt ist es ein Strich, kein Tipp: das Feld wird leer und füllt
            // sich von hier an mit dem, was unter dem Finger liegt.
            clearInput(drag.kind === 'draw');
        }
        const fraction = fractionForDrag(drag, event.clientX, event.clientY);
        setDraft({ rect: fraction, look: drag.kind === 'frame' ? 'set' : 'drawing' });
        // Mitschreiben: was bis hierher überstrichen ist, steht schon im Feld.
        queueLive(fraction, drag.rect);
    };

    const onPicturePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.id !== event.pointerId) return;
        dragRef.current = null;
        if (!drag.active) return; // ein Tipp — der Rahmen darunter bekommt seinen Klick
        setDraft(null);
        suppressClickRef.current = true;
        window.setTimeout(() => { suppressClickRef.current = false; }, 0);
        const fraction = fractionForDrag(drag, event.clientX, event.clientY);
        if (!image || fraction.w * drag.rect.width < MIN_FRAME_PX || fraction.h * drag.rect.height < MIN_FRAME_PX) {
            stopLive();
            return;
        }
        const box = fractionToBox(fraction, image);
        setRegion(box);
        void readRegion(image, box);
    };

    const onPicturePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.id !== event.pointerId) return;
        dragRef.current = null;
        stopLive();
        setDraft(null);
    };

    const onPictureClickCapture = (event: React.MouseEvent<HTMLDivElement>) => {
        if (!suppressClickRef.current) return;
        event.stopPropagation();
        event.preventDefault();
    };

    /* ── Menge ───────────────────────────────────────────────────────────── */
    const quantity = parseNum(qty) ?? 0;
    const stepQty = (delta: number) => {
        const next = Math.max(0, Math.round(((parseNum(qty) ?? 0) + delta) * 1000) / 1000);
        setQty(String(next));
    };

    /* ── Speichern ───────────────────────────────────────────────────────── */
    const add = async () => {
        const productName = name.trim();
        if (!productName) {
            setFormError(t('inv.quickAdd.nameRequired'));
            nameRef.current?.focus();
            return;
        }
        if (!(quantity > 0)) {
            setFormError(t('inv.stock.rowQuantity'));
            return;
        }
        if (linked && !canTransfer) {
            setFormError(t('inv.stock.noPermission'));
            return;
        }
        if (!linked && !canCreate) {
            setFormError(t('inv.newProduct.noPermission'));
            return;
        }

        setSaving(true);
        setFormError(null);
        const key = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
        try {
            if (linked) {
                const result = await inventoryApi.bulkCreateMovements([{
                    articleId: linked.id,
                    movementType: 'IN',
                    quantity,
                    description: t('inv.quickAdd.movementNote'),
                }]);
                const rowError = result.errors[0]?.error;
                if (rowError || !result.movements.length) {
                    setFormError(rowError || t('inv.quickAdd.saveFailed'));
                    return;
                }
                setLog((current) => [{ key, name: linked.name, code: linked.code, qty: quantity, unit, kind: 'in' }, ...current]);
            } else {
                let imageUrl: string | undefined;
                if (attachPhoto && image) {
                    const dataUrl = canvasToProductImage(image.canvas);
                    if (dataUrl) imageUrl = dataUrl;
                }
                const result = await inventoryApi.quickCreateArticles([{
                    name: productName,
                    quantity,
                    unit: unit || null,
                    ...(imageUrl ? { imageUrl } : {}),
                }]);
                const rowError = result.errors[0]?.error;
                const created = result.created[0];
                if (rowError || !created) {
                    setFormError(rowError || t('inv.quickAdd.saveFailed'));
                    return;
                }
                setLog((current) => [{ key, name: created.name, code: created.articleCode, qty: quantity, unit, kind: 'new' }, ...current]);
            }
            setAdded((current) => current + 1);
            // Bereit für die nächste Zeile — das Foto bleibt stehen.
            stopLive();
            liveRef.current.wrote = false;
            ocrNameRef.current = '';
            setName('');
            setRegion(null);
            setRegionError(null);
            setQty('1');
            setLinkedChoice(null);
            setDeclinedLink(false);
        } catch (error) {
            setFormError(responseError(error) || t('inv.quickAdd.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    if (!open) return null;

    /* Es gibt nichts mehr herunterzuladen und keine Stufen zu melden: das
       Gerät schneidet den Ausschnitt aus, der Server liest ihn. Darum ein
       Balken ohne Prozente und zwei Sätze — Bild vorbereiten, Bereich lesen. */
    const progressLabel = regionBusy ? t('inv.quickAdd.readingRegion') : t('inv.quickAdd.preparing');
    const progressBar = (
        <div className="ofi-qa__bar is-indeterminate">
            <span />
        </div>
    );

    /* Welcher Rahmen liegt auf dem Foto: der wachsende Entwurf, der eigene
       Ausschnitt, oder die Griffe an einer einzeln angetippten Zeile. */
    const frame = (() => {
        if (!image) return null;
        if (draft) return <LassoFrame fraction={draft.rect} look={draft.look} />;
        if (region) {
            const fraction = boxToFraction(region, image);
            return (
                <LassoFrame
                    fraction={fraction}
                    look="set"
                    busy={regionBusy}
                    onHandleDown={(event, mode) => startFrameDrag(event, mode, fraction)}
                    onBodyDown={(event) => startFrameDrag(event, 'move', fraction)}
                />
            );
        }
        return null;
    })();

    const sheet = (
        <div className={`ofi-qa-scrim ${phone ? 'is-phone' : ''}`} role="presentation">
            <section
                role="dialog"
                aria-modal="true"
                aria-label={t('inv.quickAdd.title')}
                /* `.ofi-compact-modal` ist der AUSSTIEG aus der Regel, die
                   jedem `section[role=dialog][aria-modal]` in einem Portal
                   `width: min(100% - 40px, 1280px) !important` aufzwingt
                   (index.css, ~6203). Ohne ihn wäre dieses Fenster am
                   Schreibtisch 1280px breit und auf dem Telefon 350 statt
                   der vollen Schirmbreite — die Zahl im Bauteil wäre wirkungslos. */
                className={`ofi-qa ofi-pop ofi-compact-modal ${phone ? 'is-phone' : ''}`}
            >
                <header className="ofi-qa__head">
                    <span className="ofi-qa__badge" aria-hidden><Camera01 size={20} /></span>
                    <div className="ofi-qa__titles">
                        <h2 className="ofi-qa__title">{t('inv.quickAdd.title')}</h2>
                        <p className="ofi-qa__sub">{t('inv.quickAdd.subtitle')}</p>
                    </div>
                    {added > 0 && (
                        <span className="ofi-qa__count">{t('inv.quickAdd.logTitle', { count: added })}</span>
                    )}
                    <button type="button" className="ofi-float-card__iconbtn" aria-label={t('inv.quickAdd.close')} onClick={close}>
                        <X size={18} />
                    </button>
                </header>

                <div className="ofi-qa__body">
                    {/* ── Foto ──────────────────────────────────────────────── */}
                    <div className="ofi-qa__stage">
                        <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={onFileInput} />
                        <input ref={pickerRef} type="file" accept="image/*" hidden onChange={onFileInput} />

                        <div className="ofi-qa__frame">
                            {!image && !busy && (
                                <div className="ofi-qa__idle">
                                    <button type="button" className="ofi-qa__camera" onClick={() => cameraRef.current?.click()}>
                                        <Camera01 size={22} />
                                        {t('inv.quickAdd.takePhoto')}
                                    </button>
                                    <button type="button" className="ofi-qa__ghost" onClick={() => pickerRef.current?.click()}>
                                        <Image01 size={16} />
                                        {t('inv.quickAdd.pickImage')}
                                    </button>
                                    <p>{t('inv.quickAdd.idleHint')}</p>
                                </div>
                            )}

                            {!image && busy && (
                                <div className="ofi-qa__progress is-centered">
                                    {progressLabel}
                                    {progressBar}
                                </div>
                            )}

                            {image && (
                                <div
                                    ref={pictureRef}
                                    className={`ofi-qa__picture ${canTrace ? 'can-trace' : ''}`}
                                    aria-label={t('inv.quickAdd.traceHint')}
                                    onPointerDown={onPicturePointerDown}
                                    onPointerMove={onPicturePointerMove}
                                    onPointerUp={onPicturePointerUp}
                                    onPointerCancel={onPicturePointerCancel}
                                    onClickCapture={onPictureClickCapture}
                                >
                                    <img className="ofi-qa__img" src={image.previewUrl} alt="" draggable={false} />
                                    {frame}
                                    {(busy || regionBusy) && (
                                        <div className="ofi-qa__progress">
                                            {progressLabel}
                                            {progressBar}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>

                        {(image || phase === 'failed') && (
                            <div className="ofi-qa__tools">
                                <button type="button" className="ofi-qa__pill" disabled={busy} onClick={() => cameraRef.current?.click()}>
                                    <Camera01 size={15} />
                                    {t('inv.quickAdd.newPhoto')}
                                </button>
                                <button type="button" className="ofi-qa__pill" disabled={busy} onClick={() => pickerRef.current?.click()}>
                                    <Image01 size={15} />
                                    {t('inv.quickAdd.pickImage')}
                                </button>
                            </div>
                        )}
                        {failure && <p className="ofi-qa__error" style={{ marginTop: 8 }}>{failure}</p>}
                        {regionError && <p className="ofi-qa__error" style={{ marginTop: 8 }}>{regionError}</p>}
                        {image && phase === 'ready' && !failure && (
                            <p className="ofi-qa__hint">{t('inv.quickAdd.traceHint')}</p>
                        )}
                    </div>

                    {/* ── Eingabe ───────────────────────────────────────────── */}
                    <div className="ofi-qa__form">
                        <div className="ofi-qa__manual">
                            <div className="ofi-qa__manual-head">
                                <label className="ofi-qa__label" htmlFor="ofi-qa-name">{t('inv.columns.productName')}</label>
                                <span>{t('inv.quickAdd.manualTitle')}</span>
                            </div>
                            <div className="ofi-qa__input-wrap">
                                <input
                                    id="ofi-qa-name"
                                    ref={nameRef}
                                    className="ofi-qa__input"
                                    value={name}
                                    placeholder={t('inv.quickAdd.namePlaceholder')}
                                    autoComplete="off"
                                    autoCapitalize="sentences"
                                    onChange={(event) => onNameTyped(event.target.value)}
                                    onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void add(); } }}
                                />
                                {(name || region) && (
                                    <button
                                        type="button"
                                        className="ofi-qa__input-clear"
                                        aria-label={t('inv.quickAdd.clearInput')}
                                        title={t('inv.quickAdd.clearInput')}
                                        onClick={clearSelection}
                                    >
                                        <XClose size={17} />
                                    </button>
                                )}
                            </div>
                            <p className="ofi-qa__hint">{t('inv.quickAdd.manualHint')}</p>
                            {!linked && <p className="ofi-qa__hint">{t('inv.quickAdd.codeAuto')}</p>}
                        </div>

                        {linked ? (
                            <div className="ofi-qa__linked">
                                <Check size={15} />
                                <span>
                                    {t('inv.quickAdd.linkedPrefix')}{' '}
                                    <strong>{linked.name}</strong>
                                    {' '}<span className="ofi-qa__match-code">{linked.code}</span>
                                </span>
                                <button type="button" className="ofi-qa__link" onClick={unlink}>
                                    {t('inv.quickAdd.createNewInstead')}
                                </button>
                            </div>
                        ) : visibleMatches.length > 0 && (
                            <div>
                                <span className="ofi-qa__label">{t('inv.quickAdd.existingTitle')}</span>
                                <div className="ofi-qa__matches">
                                    {visibleMatches.map((row) => (
                                        <button key={row.id} type="button" className="ofi-qa__match" onClick={() => chooseMatch(row)}>
                                            <span className="ofi-qa__match-name">{row.name}</span>
                                            <span className="ofi-qa__match-code">{row.code}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="ofi-qa__qtyrow">
                            <div>
                                <label className="ofi-qa__label" htmlFor="ofi-qa-qty">{t('inv.columns.quantity')}</label>
                                <div className="ofi-qa__stepper">
                                    <button type="button" className="ofi-qa__step" aria-label="−" onClick={() => stepQty(-1)}>
                                        <Minus size={18} />
                                    </button>
                                    <input
                                        id="ofi-qa-qty"
                                        className="ofi-qa__qty"
                                        inputMode="decimal"
                                        value={qty}
                                        onChange={(event) => setQty(event.target.value)}
                                        onFocus={(event) => event.target.select()}
                                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void add(); } }}
                                    />
                                    <button type="button" className="ofi-qa__step" aria-label="+" onClick={() => stepQty(1)}>
                                        <Plus size={18} />
                                    </button>
                                </div>
                            </div>
                            <div className="ofi-qa__unit">
                                <span className="ofi-qa__label">{t('inv.columns.unit')}</span>
                                <UnitSelect
                                    value={unit}
                                    onChange={setUnitChoice}
                                    disabled={Boolean(linked)}
                                    ariaLabel={t('inv.columns.unit')}
                                />
                            </div>
                        </div>

                        {!linked && image && (
                            <label className="ofi-qa__check">
                                <input type="checkbox" checked={attachPhoto} onChange={(event) => setAttachPhoto(event.target.checked)} />
                                {t('inv.quickAdd.attachPhoto')}
                            </label>
                        )}

                        {formError && <p className="ofi-qa__error">{formError}</p>}

                        <button
                            type="button"
                            className={`ofi-qa__add ${linked ? 'is-stock' : ''}`}
                            disabled={saving || busy || regionBusy}
                            onClick={() => void add()}
                        >
                            {saving ? <Spinner size="sm" /> : <Plus size={18} />}
                            {linked ? t('inv.quickAdd.addStock') : t('inv.quickAdd.addProduct')}
                        </button>

                        <div>
                            <span className="ofi-qa__label">{t('inv.quickAdd.logTitle', { count: log.length })}</span>
                            {log.length ? (
                                <ul className="ofi-qa__log">
                                    {log.map((entry) => (
                                        <li key={entry.key} className={`ofi-qa__logrow ${entry.error ? 'is-error' : ''}`}>
                                            {entry.error ? <XClose size={16} /> : <Check size={16} />}
                                            <span className="ofi-qa__logname">
                                                {entry.name}
                                                <small>{entry.code}</small>
                                                <span className={`ofi-qa__logkind ${entry.kind === 'in' ? 'is-stock' : ''}`}>
                                                    {entry.kind === 'in' ? t('inv.quickAdd.kindIn') : t('inv.quickAdd.kindNew')}
                                                </span>
                                            </span>
                                            <span className="ofi-qa__logqty">+{entry.qty} {entry.unit}</span>
                                        </li>
                                    ))}
                                </ul>
                            ) : (
                                <p className="ofi-qa__empty">{t('inv.quickAdd.logEmpty')}</p>
                            )}
                        </div>
                    </div>
                </div>

                <footer className="ofi-qa__foot">
                    <button type="button" className="ofi-qa__close" onClick={close}>
                        {t('inv.quickAdd.close')}
                    </button>
                </footer>
            </section>
        </div>
    );

    return createPortal(sheet, document.body);
};
