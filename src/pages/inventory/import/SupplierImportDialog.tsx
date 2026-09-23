import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { toast } from 'sonner';

import {
    AlertTriangle, ArrowLeft, Camera01, Check, CheckCircle, Clipboard, Image01,
    Plus, Scan, Settings01, Trash01, X, Zap,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import i18n from '@/i18n';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import type {
    AiExtractResponse, AiExtractedRow, AiImportStatus, OrderCalcMode,
    PurchaseTemplateDocumentType, SupplierCalcConfig, SupplierOrderTemplate,
} from '@/types/inventory';
import '@/styles/purchaseImport.css';
import '@/styles/purchaseImportGlass.css';

import type { DraftOrderRow } from '../types';
import { FileDeck, FileGlyph, ReadingDial } from './FileGlyphs';
import {
    apiFailure, clipboardFromEvent, clipboardToImportFiles, extractedToDraftRow, fileToBase64,
    glyphKindForFile, isImageFile, isPdfFile, isSheetFile, isSupportedImportFile, isTextFile,
    pasteModifierKey, readClipboardContent, sheetFileToText, shrinkImageForUpload,
    templateColumns, templateSummary,
} from './importTemplate';

/**
 * ── BELEG IMPORTIEREN ───────────────────────────────────────────────────────
 *
 * Vorgabe Samet (07.09.2026, zweiter Durchgang): «Es wird KEIN Ablauf in fünf
 * Schritten. Die Vorlagen und Einstellungen werden gleich am Anfang festgelegt.
 * Was dort eingestellt ist, bleibt für die folgenden Bestellungen die Vorgabe —
 * Berechnungsarten, Vorlagen und so weiter —, bis man es ändert. Und: der
 * Import übernimmt nur die eingestellten Angaben, er rechnet nichts vor.»
 *
 * Daraus wird EIN Fenster mit DREI Zuständen und keiner einzigen Entscheidung
 * dazwischen:
 *
 *   DATEI     Beleg wählen. Darunter steht in einer Zeile, mit welcher Vorlage
 *             gelesen wird — nicht als Frage, sondern als Auskunft, mit einem
 *             Weg zu «Meine Vorlagen» daneben.
 *   LESEN     Der Server wandelt den Beleg in Text und legt ihn dem Modell vor.
 *   PRÜFEN    Die erkannten Positionen, änderbar und abwählbar, mit dem, was
 *             der Vorgang gekostet hat. Ein Knopf: übernehmen.
 *
 * WAS HIER NICHT PASSIERT: rechnen und speichern. Die Zeilen gehen an die
 * Bestellseite (`onApply`), gerechnet wird dort nach der Berechnungsart der
 * Zeile, gespeichert wird mit demselben Knopf wie immer.
 */

type Phase = 'file' | 'reading' | 'review';

/** Die drei Schritte, in ihrer Reihenfolge — der Kopf zeichnet sie daraus. */
const STEPS: { phase: Phase; title: string }[] = [
    { phase: 'file', title: 'inv.aiImport.steps.file' },
    { phase: 'reading', title: 'inv.aiImport.steps.read' },
    { phase: 'review', title: 'inv.aiImport.steps.rows' },
];

/** Die Zeile in der Prüfung: die erkannten Werte plus ein Häkchen. */
interface ReviewRow {
    key: string;
    data: AiExtractedRow;
    enabled: boolean;
}

export interface SupplierImportDialogProps {
    open: boolean;
    onClose: () => void;
    /**
     * DIE AKTIVE VORLAGE. Sie kommt von der Bestellseite, wird dort einmal
     * geladen und bleibt stehen — dieses Fenster ändert sie nicht.
     */
    config: SupplierCalcConfig;
    template: SupplierOrderTemplate | null;
    /** Die fertigen Zeilen in die Bestelltabelle geben. */
    onApply: (rows: DraftOrderRow[], config: SupplierCalcConfig) => void;
    /** Die Rechenart, die auf der Seite gerade laeuft — die neuen Zeilen tragen sie. */
    calcMode: OrderCalcMode;
    /**
     * Bestellung, Preisanfrage oder Wareneingang. WELCHE Spalten gelesen
     * werden, sagt allein die Vorlage; das Ziel entscheidet nur, ob der
     * Server Kopfdaten des Belegs mitliest (im Wareneingang nicht — der
     * Lieferant ist laengst bekannt).
     */
    documentType?: PurchaseTemplateDocumentType;
    /**
     * Was auf der Bestellseite schon eingefuegt wurde (Strg+V ausserhalb
     * eines Feldes, siehe `usePasteToImport`): das Fenster oeffnet damit,
     * statt leer.
     */
    initialFiles?: File[];
}

const SupplierImportDialogContent = ({
    open, onClose, config, template, onApply, calcMode, documentType = 'ORDER', initialFiles,
}: SupplierImportDialogProps) => {
    const goodsReceipt = documentType === 'GOODS_RECEIPT';
    const [phase, setPhase] = useState<Phase>('file');
    const [step, setStep] = useState(0);
    const [status, setStatus] = useState<AiImportStatus | null>(null);
    const [error, setError] = useState<{ title: string; detail?: string } | null>(null);
    const [files, setFiles] = useState<File[]>(() => initialFiles ?? []);
    const [dragOver, setDragOver] = useState(false);
    const [addMenuOpen, setAddMenuOpen] = useState(false);
    const [cameraOpen, setCameraOpen] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [extraction, setExtraction] = useState<AiExtractResponse | null>(null);
    const [rows, setRows] = useState<ReviewRow[]>([]);
    /* WIE WEIT ES IST, in Prozent (Vorgabe Samet: «dazu ein Prozentwert»).
       Der Wert ist keine Messung — der Server meldet keinen Fortschritt —,
       sondern eine EHRLICHE Schaetzung: er laeuft weich auf die Obergrenze
       des erreichten Schritts zu und bleibt dort stehen, bis der naechste
       Schritt gemeldet wird. Er springt also nie zurueck und behauptet nie
       100 %, solange noch gelesen wird. */
    const [progress, setProgress] = useState(0);
    /* ── DIE UHR BEIM WARTEN ────────────────────────────────────────────
       Der Zeiger laeuft auf 92 % und bleibt dort, solange das Modell
       schreibt — bei einem dichten Beleg ist das eine Minute und mehr.
       Ohne eine laufende Zahl daneben sieht das aus, als haenge es
       (Fehlerbild Samet, 08.09.2026: «es bleibt bei 92 stehen»). Die
       Sekunden sind keine Schaetzung, sondern das Einzige, was hier
       wirklich gemessen werden kann. */
    const [elapsed, setElapsed] = useState(0);
    const fileInput = useRef<HTMLInputElement>(null);
    const imageInput = useRef<HTMLInputElement>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    /* Die Frage «steht ein Schlüssel?» wird VOR dem Hochladen gestellt. Sonst
       wählt jemand erst eine Datei, um dann zu erfahren, dass die Erkennung
       gar nicht eingerichtet ist. */
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        purchaseOrdersApi.aiStatus()
            .then((result) => { if (!cancelled) setStatus(result); })
            .catch(() => { if (!cancelled) setStatus(null); });
        return () => { cancelled = true; };
    }, [open]);

    /* Der Zeiger laeuft, solange gelesen wird: pro Schritt eine Obergrenze,
       auf die er sich weich zubewegt. Die letzte ist 100 — sie wird erst
       erreicht, wenn die Positionen wirklich dastehen. */
    useEffect(() => {
        if (phase !== 'reading') return;
        const started = Date.now();
        const clock = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(clock);
    }, [phase]);

    useEffect(() => {
        if (phase !== 'reading') return;
        const ceiling = [42, 92, 100][step] ?? 100;
        const timer = window.setInterval(() => {
            setProgress((current) => (current >= ceiling
                ? ceiling
                : Math.min(ceiling, current + Math.max(0.35, (ceiling - current) * 0.055))));
        }, 60);
        return () => window.clearInterval(timer);
    }, [phase, step]);

    /* DIE SPALTEN DER VORLAGE — Name, Art und Zuordnung — sind das Einzige,
       was an das Modell geht (Vorgabe Samet, 11.09.2026: «wir geben dem
       Modell die Vorlage mit den Spaltennamen direkt mit»). Der ERP-Code
       steht nicht darin. */
    const columns = useMemo(() => templateColumns(config), [config]);

    const pickFiles = useCallback((picked: File[]) => {
        const supported = picked.filter(isSupportedImportFile);
        if (!supported.length) {
            toast.error(t('inv.aiImport.badFileType'));
            return;
        }
        setError(null);
        const incomingImages = supported.filter((entry) => /^image\//i.test(entry.type) || /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(entry.name));
        if (incomingImages.length === supported.length) {
            setFiles((current) => {
                const existing = current.every(isImageFile) ? current : [];
                return [...existing, ...incomingImages].slice(0, 6);
            });
        } else {
            setFiles([supported[0]!]);
        }
        setAddMenuOpen(false);
    }, []);

    const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(event.target.files ?? []);
        if (picked.length) pickFiles(picked);
        event.target.value = '';
    };

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        const picked = Array.from(event.dataTransfer.files ?? []);
        if (picked.length) pickFiles(picked);
    };

    /* ── AUS DER ZWISCHENABLAGE (Vorgabe Samet, 11.09.2026) ────────────────
       «Den Beleg auch einfuegen koennen — Bildschirmfoto oder kopierte
       Zeilen.» Solange das Fenster eine Datei erwartet, gehoert jedes
       Strg+V ihm: ein Bildschirmfoto kommt als weitere Seite dazu (bis
       sechs), kopierte Zeilen ersetzen die Auswahl. Beim Pruefen nicht —
       dort wird in Felder getippt —, und nicht bei offener Kamera. */
    useEffect(() => {
        if (phase !== 'file' || cameraOpen) return undefined;
        const onPaste = (event: ClipboardEvent) => {
            if (!event.clipboardData) return;
            event.preventDefault();
            const pasted = clipboardToImportFiles(clipboardFromEvent(event.clipboardData));
            if (pasted.length) pickFiles(pasted);
            else toast.error(t('inv.aiImport.pasteEmpty'));
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    }, [phase, cameraOpen, pickFiles]);

    /* Dasselbe auf Knopfdruck, fuer das Tablet ohne Tastatur. Verweigert der
       Browser den Zugriff, bleibt der Weg ueber die Tasten. */
    const pasteFromClipboard = async () => {
        setAddMenuOpen(false);
        try {
            const pasted = clipboardToImportFiles(await readClipboardContent());
            if (pasted.length) pickFiles(pasted);
            else toast.error(t('inv.aiImport.pasteEmpty'));
        } catch {
            toast.error(t('inv.aiImport.pasteDenied', { keys: `${pasteModifierKey()} + V` }));
        }
    };

    /* A live camera remains mounted after a capture. The user can therefore
       photograph page 1, 2, 3 ... without reopening the device picker. */
    useEffect(() => {
        if (!cameraOpen) return undefined;
        let cancelled = false;
        if (!navigator.mediaDevices?.getUserMedia) {
            const unavailable = window.setTimeout(() => {
                if (!cancelled) setCameraError(t('auth.qrCameraError'));
            }, 0);
            return () => {
                cancelled = true;
                window.clearTimeout(unavailable);
            };
        }
        void navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
        }).then((stream) => {
            if (cancelled) {
                stream.getTracks().forEach((track) => track.stop());
                return;
            }
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                void videoRef.current.play().catch(() => undefined);
            }
        }).catch(() => setCameraError(t('auth.qrCameraError')));

        return () => {
            cancelled = true;
            streamRef.current?.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        };
    }, [cameraOpen]);

    const capturePhoto = async () => {
        const video = videoRef.current;
        if (!video?.videoWidth || !video.videoHeight) {
            setCameraError(t('inv.quickAdd.imageFailed'));
            return;
        }
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext('2d');
        if (!context) return;
        context.drawImage(video, 0, 0);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.92));
        if (!blob) {
            setCameraError(t('inv.quickAdd.imageFailed'));
            return;
        }
        pickFiles([new File([blob], `receipt-${Date.now()}.jpg`, { type: 'image/jpeg' })]);
    };

    const read = async () => {
        if (!files.length || !columns.length) return;
        setPhase('reading');
        setElapsed(0);
        setError(null);
        setStep(0);
        setProgress(0);
        try {
            /* TABELLEN GEHEN ALS TEXT. `xlsx` liegt im Bündel ohnehin schon, und
               eine Tabelle als Tabulatortext ist kürzer als die Datei — kürzer
               heisst hier billiger. PDF und Foto reisen als Datei: beim PDF
               liest der Server die Textlage, ein FOTO reicht er unverändert an
               das Modell weiter, das die Seite selbst sieht. */
            /* ── ZUERST DIE SITZUNG, DANN DER BELEG ─────────────────────
               Der Zugangskeks lebt 15 Minuten. Laeuft er ab, waehrend jemand
               die Datei aussucht, dann faellt das erst NACH dem Hochladen
               auf: der Server antwortet 401, der Abfangjaeger frischt auf
               und schickt die GANZE Anfrage noch einmal — dieselben
               Megabyte, derselbe Lauf des Modells. Zusammen sprengt das
               jede Frist, und schlaegt die Auffrischung fehl, landet man
               mitten im Import auf der Anmeldeseite.

               Ein winziger Aufruf VORHER nimmt denselben Weg in
               Millisekunden: danach ist der Keks frisch und der lange
               Aufruf laeuft mit einer Sitzung, die ihn ueberdauert. */
            await purchaseOrdersApi.aiStatus().catch(() => undefined);

            const firstFile = files[0]!;
            const imageSet = files.every(isImageFile);
            const payload = imageSet
                ? {
                    images: await Promise.all(files.map(async (entry) => {
                        const prepared = await shrinkImageForUpload(entry);
                        return {
                            data: await fileToBase64(prepared),
                            fileName: prepared.name,
                            mimeType: prepared.type || undefined,
                        };
                    })),
                }
                : isSheetFile(firstFile)
                    ? { text: await sheetFileToText(firstFile) }
                    /* Eingefuegte Zeilen und eingefuegter Text sind schon
                       Text — sie nehmen den Weg der Tabelle. */
                    : isTextFile(firstFile)
                        ? { text: await firstFile.text() }
                        : { data: await fileToBase64(await shrinkImageForUpload(firstFile)) };
            setStep(1);

            const result = await purchaseOrdersApi.aiExtract({
                ...payload,
                fileName: firstFile.name,
                mimeType: firstFile.type || undefined,
                documentType,
                language: (i18n.resolvedLanguage || i18n.language || 'de').slice(0, 2),
                columns: columns.map(({ key, name, type, label }) => ({ key, name, type, label: label ?? null })),
            });
            setStep(2);

            if (!result.rows.length) {
                setError({ title: t('inv.aiImport.noRows') });
                setPhase('file');
                return;
            }
            setExtraction(result);
            setRows(result.rows.map((data, index) => ({ key: `row-${index}`, data, enabled: true })));
            setPhase('review');
        } catch (err) {
            setError(apiFailure(err, t('inv.aiImport.failed')));
            setPhase('file');
        }
    };

    /** Der laufende Schritt als Zahl — der Kopf faerbt danach. */
    const phaseIndex = STEPS.findIndex((entry) => entry.phase === phase);

    const draftRows = useMemo(
        () => rows.filter((row) => row.enabled).map((row) => {
            const draft = extractedToDraftRow(row.data, config, calcMode);
            /* Im Wareneingang zaehlt die Menge so, wie sie auf dem
               Lieferschein steht — leer bleibt leer, statt zur 1 zu werden. */
            const quantityKey = columns.find((column) => column.label === 'quantity')?.key;
            return goodsReceipt
                ? { ...draft, quantity: quantityKey ? cellValue(row.data[quantityKey]) : '' }
                : draft;
        }),
        [rows, config, calcMode, goodsReceipt, columns],
    );

    /* ── DIE ANZAHL, GEPRUEFT ───────────────────────────────────────────
       Niemand sagt mehr eine Zahl an (Vorgabe Samet, 08.09.2026: «so etwas
       wie 35 gibt es nicht»). Verglichen wird die ABSCHRIFT mit dem, was
       die Zuordnung daraus gemacht hat: die Tabelle hatte so viele Zeilen,
       hier stehen so viele. Bei Excel und PDF gibt es keine Abschrift und
       damit nichts zu vergleichen — dann bleibt der Streifen fort.
       Gemessen wird an ALLEN gelesenen Zeilen, nicht an den angekreuzten:
       wer eine Zeile abwaehlt, hat sie gesehen. */
    const shortfall = (() => {
        const target = extraction?.rowCount?.table ?? null;
        if (!target || !rows.length || target === rows.length) return null;
        return { target, got: rows.length };
    })();

    /* Vorlagenspalten, die der Server auf dem Blatt nicht gefunden hat
       (Fehlerbild Samet, 11.09.2026: «eine Spalte hat sie gar nicht
       gesehen»). Sie bleiben leer — und das steht dann da, statt still
       eine leere Spalte zu zeigen. */
    const missingNames = (extraction?.missingColumns ?? [])
        .map((key) => columns.find((column) => column.key === key)?.name)
        .filter((name): name is string => Boolean(name));

    const apply = () => {
        onApply(draftRows, config);
        onClose();
    };

    /* Die Prüftabelle zeigt genau die Spalten der Vorlage — in ihrer
       Reihenfolge und mit ihren Namen. Eine Spalte, die als Zahl angelegt ist,
       steht rechtsbündig; das ist der ganze Unterschied. */
    const usage = extraction?.usage;

    const errorBox = error && (
        <div className="ofi-poi-error" role="alert">
            <AlertTriangle size={15} />
            <div>
                <b>{error.title}</b>
                {error.detail && <span>{error.detail}</span>}
            </div>
        </div>
    );

    /* ── DIE EINSTELLUNG, ALS AUSKUNFT ──────────────────────────────────────
       Ein Satz, der sagt, womit gelesen wird — mehr nicht. Der Knopf zu «Meine
       Vorlagen» stand hier bis zum 07.09.2026 daneben und ist auf Vorgabe
       Samet fort: «Unter ‹Beleg importieren› brauche ich kein ‹Meine
       Vorlagen›, es gibt ja schon eine Vorlagenauswahl.» Die steht in der
       Bestellzeile, gleich links vom Import-Knopf. */
    const settingsStrip = (
        <div className="ofi-poi-settings">
            <Settings01 size={14} />
            <div>
                <b>{template ? template.title : t('inv.aiImport.templateFallback')}</b>
                <span>{templateSummary(config)}</span>
            </div>
        </div>
    );

    /* Welches Blatt gezeigt wird — PDF rot, Foto blau, Tabelle gruen. */
    const fileKind = files[0] ? glyphKindForFile(files[0]) : 'file';

    const phases = [
        { icon: <Scan size={13} />, label: t('inv.aiImport.phaseText') },
        { icon: <Zap size={13} />, label: t('inv.aiImport.phaseModel') },
        { icon: <Check size={13} />, label: t('inv.aiImport.phaseRows') },
    ];

    const imageAdder = (
        <span className="ofi-poi-addwrap">
            <button
                type="button"
                className="ofi-poi-imageplus"
                onClick={() => setAddMenuOpen((current) => !current)}
                aria-label={t('inv.quickAdd.attachPhoto')}
                title={t('inv.quickAdd.attachPhoto')}
            >
                <Plus size={20} />
            </button>
            {addMenuOpen && (
                <span className="ofi-poi-menu ofi-poi-imagemenu">
                    <button type="button" onClick={() => { setCameraError(null); setCameraOpen(true); setAddMenuOpen(false); }}>
                        <Camera01 size={16} />
                        <span>{t('inv.quickAdd.takePhoto')}</span>
                    </button>
                    <button type="button" onClick={() => imageInput.current?.click()}>
                        <Image01 size={16} />
                        <span>{t('inv.quickAdd.pickImage')}</span>
                    </button>
                    <button type="button" onClick={() => void pasteFromClipboard()}>
                        <Clipboard size={16} />
                        <span>{t('inv.aiImport.pasteFromClipboard')}</span>
                    </button>
                </span>
            )}
        </span>
    );

    const body = (() => {
        if (phase === 'reading') {
            return (
                <div className="ofi-poi-pane">
                    <div className="ofi-poi-progress">
                        {/* Der Ring, das drehende Blatt und der Prozentwert —
                            eine Auskunft statt eines wartenden Balkens. */}
                        <ReadingDial kind={fileKind} percent={progress} />
                        <div className="ofi-poi-phases">
                            {phases.map((entry, index) => (
                                <div
                                    key={index}
                                    className={`ofi-poi-phase${step === index ? ' is-active' : ''}${step > index ? ' is-done' : ''}`}
                                >
                                    <i>{step > index ? <Check size={12} /> : step === index ? <span className="ofi-poi-spin" /> : entry.icon}</i>
                                    {entry.label}
                                </div>
                            ))}
                        </div>
                        <span style={{ fontSize: 11.5, color: 'var(--ofi-cal-muted)' }}>
                            {t('inv.aiImport.readingNote', { model: status?.model ?? 'gpt-4o-mini' })}
                        </span>
                        {/* Erst ab einer halben Minute — vorher waere die Uhr
                            blosse Unruhe. Danach ist sie die Auskunft, dass
                            noch gearbeitet wird. */}
                        {elapsed >= 30 && (
                            <span style={{ fontSize: 11.5, color: 'var(--ofi-cal-muted)' }}>
                                {t('inv.aiImport.stillReading', { seconds: elapsed })}
                            </span>
                        )}
                    </div>
                </div>
            );
        }

        if (phase === 'review') {
            return (
                <div className="ofi-poi-pane">
                    {/* Fehlt etwas, steht es VOR der Liste — nicht als
                        Merkzeichen zwischen den Kennzahlen, wo man es
                        uebersieht. */}
                    {shortfall && (
                        <div className="ofi-poi-error" role="alert" style={{ marginBottom: 12 }}>
                            <AlertTriangle size={15} />
                            <div>
                                <b>{t('inv.aiImport.rowCountMismatch', { got: shortfall.got, expected: shortfall.target })}</b>
                                <span>{t('inv.aiImport.rowCountMismatchHint')}</span>
                            </div>
                        </div>
                    )}
                    {missingNames.length > 0 && (
                        <div className="ofi-poi-error" role="alert" style={{ marginBottom: 12 }}>
                            <AlertTriangle size={15} />
                            <div>
                                <b>{t('inv.aiImport.missingColumns', { names: missingNames.map((name) => `«${name}»`).join(', ') })}</b>
                                <span>{t('inv.aiImport.missingColumnsHint')}</span>
                            </div>
                        </div>
                    )}
                    <div className="ofi-poi-usage" style={{ marginBottom: 12 }}>
                        <span className={`ofi-poi-badge${shortfall ? ' is-warn' : ' is-accent'}`}>
                            {shortfall ? <AlertTriangle size={11} /> : <CheckCircle size={11} />}
                            {shortfall
                                ? t('inv.aiImport.rowCountOf', { got: shortfall.got, expected: shortfall.target })
                                : t('inv.aiImport.foundRows', { count: rows.length })}
                        </span>
                        {extraction && (
                            <span className="ofi-poi-badge">
                                {t('inv.aiImport.engineLabel')}
                                {/* `gpt-vision` = das Modell hat das Bild selbst
                                    gelesen (seit 08.09.2026 der Weg jedes Fotos). */}
                                <b>{extraction.engine === 'gpt-vision' ? t('inv.aiImport.engineModelVision')
                                    : extraction.engine === 'ocr-space' ? t('inv.aiImport.engineVision')
                                        : extraction.engine === 'pdf-text' ? t('inv.aiImport.enginePdf')
                                            : files[0] && /\.txt$/i.test(files[0].name) ? t('inv.aiImport.engineText')
                                                : t('inv.aiImport.engineSheet')}</b>
                            </span>
                        )}
                        {extraction && <span className="ofi-poi-badge">{t('inv.aiImport.modelLabel')}<b>{extraction.model}</b></span>}
                        {usage && <span className="ofi-poi-badge">{t('inv.aiImport.tokensLabel')}<b>{usage.totalTokens.toLocaleString('de-CH')}</b></span>}
                        {usage && usage.estimatedUsd !== null && (
                            <span className="ofi-poi-badge">{t('inv.aiImport.costLabel')}<b>{`$${usage.estimatedUsd.toFixed(4)}`}</b></span>
                        )}
                        {extraction?.text.truncated && (
                            <span className="ofi-poi-badge is-warn"><AlertTriangle size={11} />{t('inv.aiImport.truncated')}</span>
                        )}
                    </div>

                    <div className="ofi-poi-tablewrap">
                        <table className="ofi-poi-table">
                            <thead>
                                <tr>
                                    <th style={{ width: 34 }} aria-label={t('inv.aiImport.includeRow')} />
                                    {columns.map((column) => (
                                        <th key={column.key} className={column.type === 'number' ? 'is-num' : undefined}>{column.name}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map((row) => (
                                    <tr key={row.key} className={row.enabled ? undefined : 'is-off'}>
                                        <td>
                                            <input
                                                type="checkbox"
                                                checked={row.enabled}
                                                style={{ width: 15, height: 15, minWidth: 0, accentColor: 'var(--ofi-cal-accent)' }}
                                                onChange={() => setRows((current) => current.map((entry) => (entry.key === row.key
                                                    ? { ...entry, enabled: !entry.enabled }
                                                    : entry)))}
                                                aria-label={t('inv.aiImport.includeRow')}
                                            />
                                        </td>
                                        {columns.map((column) => {
                                            const numeric = column.type === 'number';
                                            return (
                                                <td key={column.key} className={numeric ? 'is-num' : undefined}>
                                                    <span className="ofi-poi-cell">
                                                        <input
                                                            className={[numeric ? 'is-num' : '', numeric ? '' : 'is-wide'].filter(Boolean).join(' ')}
                                                            value={cellValue(row.data[column.key])}
                                                            onChange={(event) => setRows((current) => current.map((entry) => (entry.key === row.key
                                                                ? { ...entry, data: { ...entry.data, [column.key]: event.target.value } }
                                                                : entry)))}
                                                            inputMode={numeric ? 'decimal' : undefined}
                                                        />
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            );
        }

        return (
            <div className="ofi-poi-pane">
                {status && !status.configured && (
                    <div className="ofi-poi-error" style={{ marginBottom: 14 }}>
                        <AlertTriangle size={15} />
                        <div>
                            <b>{t('inv.aiImport.notConfigured')}</b>
                            <span>{t('inv.aiImport.notConfiguredHint')}</span>
                        </div>
                    </div>
                )}
                {errorBox && <div style={{ marginBottom: 14 }}>{errorBox}</div>}

                {files.length ? (
                    <div className="ofi-poi-filelist">
                        {files.map((file, index) => (
                            <div className="ofi-poi-file" key={`${file.name}-${file.lastModified}-${index}`}>
                                <span className="ofi-poi-filecard">
                                    <FileGlyph kind={glyphKindForFile(file)} size={34} />
                                    {files.length > 1 && <em>{index + 1}</em>}
                                </span>
                                <div>
                                    <b>{file.name}</b>
                                    <span>
                                        {`${Math.max(1, Math.round(file.size / 1024))} KB · `}
                                        {isSheetFile(file) || glyphKindForFile(file) === 'sheet' ? t('inv.aiImport.routeSheet')
                                            : isTextFile(file) ? t('inv.aiImport.routeText')
                                                : isPdfFile(file) ? t('inv.aiImport.routePdf')
                                                    : t('inv.aiImport.routeImage')}
                                    </span>
                                </div>
                                <button
                                    type="button"
                                    className="ofi-poi-iconbtn"
                                    style={{ marginLeft: 'auto' }}
                                    onClick={() => setFiles((current) => current.filter((_, at) => at !== index))}
                                    title={t('common.delete')}
                                >
                                    <Trash01 size={15} />
                                </button>
                            </div>
                        ))}
                        {files.every(isImageFile) && files.length < 6 && imageAdder}
                    </div>
                ) : (
                    <div className="ofi-poi-empty-upload">
                        <button
                            type="button"
                            className={`ofi-poi-drop${dragOver ? ' is-over' : ''}`}
                            onClick={() => fileInput.current?.click()}
                            onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                            onDragLeave={() => setDragOver(false)}
                            onDrop={onDrop}
                        >
                            <FileDeck />
                            <b>{t('inv.aiImport.dropHint')}</b>
                            <span>{t('inv.aiImport.fileTypes')}</span>
                            {/* Strg+V gehoert diesem Fenster, solange es eine
                                Datei erwartet — der Hinweis sagt es. */}
                            <span className="ofi-poi-pastehint">
                                {t('inv.aiImport.pasteHint')}
                                <kbd>{pasteModifierKey()}</kbd>
                                <kbd>V</kbd>
                            </span>
                        </button>
                        {imageAdder}
                    </div>
                )}
                <input
                    ref={fileInput}
                    type="file"
                    multiple
                    accept=".pdf,.png,.jpg,.jpeg,.webp,.heic,.heif,.xlsx,.xls,.csv,image/*"
                    className="hidden"
                    onChange={onFileChange}
                />
                <input
                    ref={imageInput}
                    type="file"
                    multiple
                    accept="image/*"
                    className="hidden"
                    onChange={onFileChange}
                />

                {settingsStrip}
                <p className="ofi-poi-note" style={{ marginTop: 10 }}>{t('inv.aiImport.tokenNote')}</p>
            </div>
        );
    })();

    return (
        <div className="ofi-poi-scrim ofi-poi-glass-scrim" role="dialog" aria-modal="true" aria-labelledby="supplier-import-title">
            <div className="ofi-poi ofi-poi-glass" style={{ height: phase === 'review' ? 'min(720px, 100%)' : 'auto', maxHeight: '100%' }}>
                <div className="ofi-poi-head">
                    <div className="ofi-poi-title">
                        <b id="supplier-import-title">{t('inv.aiImport.title')}</b>
                        <span>{files.length ? files.map((entry) => entry.name).join(' · ') : t('inv.aiImport.subtitle')}</span>
                    </div>
                    {/* ── DIE DREI SCHRITTE (Vorgabe Samet, 07.09.2026) ────────
                        «Ordnet den Ablauf vielleicht in Schritte — Schritt 1 …»
                        Genau drei, immer sichtbar: der laufende traegt die
                        Akzentfarbe, die erledigten einen Haken. Zurueck geht es
                        durch Anklicken eines erledigten Schritts — vorwaerts
                        nicht, dafuer ist der Knopf im Fuss da. */}
                    <div className="ofi-poi-steps" aria-label={t('inv.aiImport.title')}>
                        {STEPS.map((entry, stepIndex) => {
                            const done = stepIndex < phaseIndex;
                            const active = stepIndex === phaseIndex;
                            const canGo = done && entry.phase === 'file' && phase === 'review';
                            return (
                                <div key={entry.phase} style={{ display: 'contents' }}>
                                    {stepIndex > 0 && <hr />}
                                    <button
                                        type="button"
                                        disabled={!canGo}
                                        onClick={canGo ? () => { setPhase('file'); setRows([]); } : undefined}
                                        className={`ofi-poi-step${active ? ' is-active' : ''}${done ? ' is-done' : ''}${canGo ? ' is-clickable' : ''}`}
                                    >
                                        <i>{done ? <Check size={12} /> : stepIndex + 1}</i>
                                        <span>
                                            <em>{t('inv.aiImport.stepLabel', { index: stepIndex + 1 })}</em>
                                            <b>{t(entry.title)}</b>
                                        </span>
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                    <button type="button" className="ofi-poi-x" onClick={onClose} aria-label={t('common.close')}>
                        <X size={17} />
                    </button>
                </div>

                <div className="ofi-poi-body">{body}</div>

                <div className="ofi-poi-foot">
                    {phase === 'review' && (
                        <button type="button" className="ofi-poi-btn" onClick={() => { setPhase('file'); setRows([]); }}>
                            <ArrowLeft size={13} />
                            {t('common.back')}
                        </button>
                    )}
                    {phase === 'reading' && <span className="ofi-poi-note">{t('inv.aiImport.pleaseWait')}</span>}
                    <span className="ofi-poi-spacer" />
                    {phase === 'file' && (
                        <button
                            type="button"
                            className="ofi-poi-btn is-primary"
                            disabled={!files.length || !columns.length || !status?.configured}
                            onClick={() => void read()}
                        >
                            <Zap size={13} />
                            {t('inv.aiImport.readButton')}
                        </button>
                    )}
                    {phase === 'review' && (
                        <button type="button" className="ofi-poi-btn is-primary" disabled={!draftRows.length} onClick={apply}>
                            <CheckCircle size={13} />
                            {t('inv.aiImport.applyButton', { count: draftRows.length })}
                        </button>
                    )}
                </div>
            </div>
            {cameraOpen && (
                <div
                    className="ofi-poi-camera-scrim"
                    role="dialog"
                    aria-modal="true"
                    onMouseDown={(event) => { if (event.target === event.currentTarget) setCameraOpen(false); }}
                >
                    <div className="ofi-poi-camera">
                        <header>
                            <span>
                                <Camera01 size={18} />
                                <b>{t('inv.quickAdd.takePhoto')}</b>
                            </span>
                            <button type="button" onClick={() => setCameraOpen(false)} aria-label={t('common.close')}>
                                <X size={18} />
                            </button>
                        </header>
                        <div className="ofi-poi-camera-view">
                            <video ref={videoRef} autoPlay muted playsInline />
                            <span className="ofi-poi-camera-frame" aria-hidden />
                            {cameraError && <span className="ofi-poi-camera-error">{cameraError}</span>}
                        </div>
                        <footer>
                            <span>{`${files.length}/6`}</span>
                            <button
                                type="button"
                                className="ofi-poi-shutter"
                                disabled={Boolean(cameraError) || files.length >= 6}
                                onClick={() => void capturePhoto()}
                                aria-label={t('inv.quickAdd.takePhoto')}
                            >
                                <i />
                            </button>
                            <button type="button" className="ofi-poi-camera-done" onClick={() => setCameraOpen(false)}>
                                {t('common.done')}
                            </button>
                        </footer>
                    </div>
                </div>
            )}
        </div>
    );
};

/** Unmounting resets a completed import and always releases the camera stream. */
export const SupplierImportDialog = (props: SupplierImportDialogProps) => (
    props.open ? <SupplierImportDialogContent {...props} /> : null
);

/* ── Kleinkram ───────────────────────────────────────────────────────────── */

/** Der Wert einer erkannten Zelle als Text — `null` wird zu leer, nicht «null». */
const cellValue = (value: unknown): string => {
    if (value === null || value === undefined) return '';
    if (Array.isArray(value)) return '';
    return String(value);
};
