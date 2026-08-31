import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { toast } from 'sonner';
import { Camera01, Trash01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { BottomSheet } from '@/components/ui-shared/BottomSheet';
import { personnelApi } from '@/lib/api/personnel';
import { primePersonPhoto } from '@/lib/personPhotos';
import { GhostButton, PrimaryButton } from '../components/primitives';

/**
 * ── PROFILBILD ───────────────────────────────────────────────────────────────
 *
 * Der Platz für das Bild sitzt im Kopf der Personenseite; ein Klick darauf
 * öffnet dieses Fenster (Vorgabe 17.08.2026).
 *
 * Am 18.08.2026 war das Bild im Kreis des Kopfbandes schlicht schlecht. Daran
 * waren ZWEI Dinge schuld, und beide sind hier behoben:
 *
 * 1. DER AUSSCHNITT. Das Fenster nahm blind das mittlere Quadrat — bei einem
 *    Handyfoto im Hochformat ist das Gesicht darin klein und selten in der
 *    Mitte, es wirkte „weit weg". Jetzt steht das gewählte Bild in einem
 *    RUNDEN RAHMEN, den man verschieben und zoomen kann; gespeichert wird
 *    exakt das, was im Kreis steht. Der Rahmen ist rund und nicht quadratisch,
 *    weil das Bild überall im Haus rund erscheint — ein quadratischer Rahmen
 *    verspräche Ecken, die niemand je zu sehen bekommt.
 *
 * 2. DAS VERKLEINERN. Aus 4000 px in EINEM Sprung 512 zu machen (und daraus 64
 *    für die Listen) überspringt beim Mitteln den Grossteil der Bildpunkte —
 *    das ergibt genau den Matsch, den man im kleinen Kreis sah. Verkleinert
 *    wird jetzt schrittweise halbierend (`stepDown`), aus einer Arbeitsfläche
 *    von 2560 px.
 *
 * 3. DIE ZIELGRÖSSE. 512 px waren zu wenig: das Bild lässt sich anklicken und
 *    in einem eigenen Reiter öffnen, und dort sah man ihm die Verkleinerung
 *    sofort an. Gespeichert werden jetzt bis zu 1024 px — und zwar nur so
 *    viele, wie im Ausschnitt WIRKLICH stecken, denn Auflösung, die das
 *    Original nicht hat, lässt sich nicht herbeirechnen. Die kleinen Kreise
 *    bekommen 128 px — die Grösse, die der Kreis in der Kopfleiste auf einem
 *    sehr feinen Bildschirm wirklich zeigt (siehe `THUMB_SIZE`).
 *
 * 4. DAS FORMAT (19.08.2026). Bis hierher wurde JEDES Bild als JPEG abgelegt —
 *    und genau daran scheiterte der häufigste Fall: ein gezeichneter Avatar
 *    als PNG. JPEG ist für Fotos gebaut, für harte farbige Kanten ist es das
 *    falsche Werkzeug; es setzt Schatten und Kringel um jede Linie, und bei
 *    0.85 rechnet der Browser die Farbe zusätzlich nur in halber Auflösung
 *    („4:2:0"). Dazu kennt JPEG keine Durchsichtigkeit: ein freigestellter
 *    Avatar bekam SCHWARZ hinter sich. Jetzt entscheidet `encode` je Bild —
 *    Flächengrafiken bleiben verlustfrei PNG, Fotos bleiben JPEG.
 *
 * Gespeichert wird als Daten-URL, dieselbe Bauart wie bei den Rapportbildern.
 */

/**
 * OBERGRENZE der gespeicherten Kantenlänge — nicht die feste Grösse.
 *
 * 1024 px, weil das Bild kein Symbol ist: man kann es anklicken, in einem
 * eigenen Reiter öffnen und darin das Gesicht erkennen wollen. Bei 512 px war
 * genau das der Vorwurf — „extrem unscharf" —, und zu Recht: ein Handyfoto von
 * 4000 px auf ein Achtel zu bringen und dann zu vergrössern kann nicht scharf
 * sein. Das grosse Bild wird NUR auf der Personenseite geladen (eine Zeile,
 * ein Aufruf), die Listen bekommen den Daumennagel — die paar hundert Kilobyte
 * fallen also genau einmal an, dort wo man das Bild auch ansieht.
 */
const OUTPUT_MAX = 1024;
/**
 * Darunter geht es nicht, auch wenn jemand sehr nah heranzoomt: der Kreis auf
 * der Personenseite ist 92 px gross, und ein Bild, das darunter läge, wäre bei
 * doppelter Punktdichte schon dort unscharf.
 */
const OUTPUT_MIN = 320;
/**
 * 0.92 statt 0.85: das Bild ist ein GESICHT auf kleiner Fläche, und dort fällt
 * jedes JPEG-Artefakt um die Augen sofort auf. Ab 0.90 rechnet der Browser die
 * Farbe ausserdem in VOLLER Auflösung statt nur in halber — unterhalb davon
 * verwischen farbige Kanten (rote Lippen, ein blauer Kragen) zu Streifen. Der
 * Aufpreis sind wenige Kilobyte auf ein Bild, das einmal je Person entsteht.
 */
const JPEG_QUALITY = 0.92;
/**
 * Der Daumennagel für alle Namensplätze der Anwendung (Listen, Kopfleiste,
 * Zuteilungen). 128 px auf Ansage des Nutzers (19.08.2026) — vorher 160.
 *
 * Das ist die Grösse, die der Kreis in der Kopfleiste WIRKLICH zeigt: 32 px auf
 * einem Bildschirm mit vierfacher Punktdichte sind 128 echte Bildpunkte. Ein
 * grösseres Bild macht ihn nicht schärfer, es lässt den Browser nur stärker
 * verkleinern — und starkes Verkleinern im Browser ist genau das, was flimmert.
 * Das Verkleinern gehört hierher, wo es einmal und sorgfältig geschieht
 * (`stepDown`), nicht bei jedem Bildaufbau in den Browser.
 *
 * Das grosse Bild bleibt unangetastet: die Personenseite lädt weiterhin
 * `profilePictureUrl` mit bis zu 1024 px.
 */
const THUMB_SIZE = 128;
/** Auch der Kleine kriegt volle Farbauflösung — siehe `JPEG_QUALITY`. */
const THUMB_QUALITY = 0.92;
/**
 * Wie viel Zeichen die gespeicherte Daten-URL höchstens haben darf; dieselben
 * Grenzen prüft der Server noch einmal (`PHOTO_MAX_CHARS`, `THUMB_MAX_CHARS`
 * in `personnel.routes.ts`) — hier etwas knapper, damit ein Bild am Rand nicht
 * erst nach der Reise abgewiesen wird.
 */
const PHOTO_BUDGET = 1_800_000;
const THUMB_BUDGET = 110_000;
/**
 * Wie viel SCHWERER das verlustfreie PNG sein darf, damit es trotzdem den
 * Zuschlag bekommt.
 *
 * Das ist der ganze Trick der Formatwahl. Nachgemessen (19.08.2026, Chrome,
 * je Bildart einmal in 1024 px und einmal als 128-px-Daumennagel):
 *
 *   Flächengrafik (gezeichneter Avatar)   PNG ist  1,3 – 2,1 × so schwer
 *   Foto                                  PNG ist  7,8 – 14  × so schwer
 *
 * Zwischen den beiden Welten liegt eine breite Lücke, und 3 legt sich mitten
 * hinein: der Avatar bleibt verlustfrei, das Foto bleibt JPEG. Das ist
 * verlässlicher als jede Rateregel über den Bildinhalt — entschieden wird am
 * ERGEBNIS, nicht an einer Vermutung. Nach oben deckeln ohnehin die Budgets.
 */
const PNG_TOLERANCE = 3;
/**
 * Der Ausschnitt wird zuerst in dieser Grösse aus dem Originalbild geholt und
 * erst danach verkleinert. Ein Handyfoto hat 4000 px; ein einziger Sprung von
 * dort auf die Zielgrösse lässt der Browser durch grobe Mittelung fallen, das
 * Gesicht bekommt Treppen und flimmernde Kanten.
 */
const WORK_SIZE = 2560;

/** Kantenlänge des runden Rahmens auf dem Bildschirm. */
const FRAME_SIZE = 232;
/** So weit über „füllt den Rahmen" hinaus darf gezoomt werden. */
const MAX_ZOOM = 4;

export interface PhotoPair {
    photo: string;
    thumb: string;
}

/** Verschiebung und Vergrösserung des Bildes IM Rahmen. */
interface CropView {
    /** Bildschirm-Pixel je Bild-Pixel. */
    scale: number;
    /** Wohin der linke obere Bildpunkt im Rahmen fällt. */
    x: number;
    y: number;
}

/** Die kleinste Vergrösserung, bei der das Bild den Rahmen noch ganz füllt. */
const coverScale = (image: HTMLImageElement) =>
    Math.max(FRAME_SIZE / image.naturalWidth, FRAME_SIZE / image.naturalHeight);

/**
 * Hält das Bild am Rahmen: es darf verschoben werden, aber nie so weit, dass
 * eine leere Ecke entsteht — ein Loch im Profilbild wäre kein Zuschnitt,
 * sondern ein Fehler.
 */
const clampView = (image: HTMLImageElement, view: CropView): CropView => {
    const scale = Math.min(Math.max(view.scale, coverScale(image)), coverScale(image) * MAX_ZOOM);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    return {
        scale,
        x: Math.min(0, Math.max(FRAME_SIZE - width, view.x)),
        y: Math.min(0, Math.max(FRAME_SIZE - height, view.y)),
    };
};

/** Der Ausschnitt so, wie er im Rahmen steht — mittig und formatfüllend. */
const centeredView = (image: HTMLImageElement): CropView => {
    const scale = coverScale(image);
    return {
        scale,
        x: (FRAME_SIZE - image.naturalWidth * scale) / 2,
        y: (FRAME_SIZE - image.naturalHeight * scale) / 2,
    };
};

/** Eine Bilddatei einlesen und entschlüsseln. */
const readImage = (file: File) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(reader.error);
        reader.onload = () => {
            const image = new Image();
            image.onerror = () => reject(new Error('decode'));
            image.onload = () => resolve(image);
            image.src = String(reader.result || '');
        };
        reader.readAsDataURL(file);
    });

/** Eine quadratische Zeichenfläche mit sauberer Glättung. */
const squareCanvas = (edge: number): [HTMLCanvasElement, CanvasRenderingContext2D] => {
    const canvas = document.createElement('canvas');
    canvas.width = edge;
    canvas.height = edge;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('canvas');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    return [canvas, context];
};

/**
 * Halbierend verkleinern, bis die Zielgrösse erreicht ist.
 *
 * Ein Browser mittelt beim Verkleinern nur über wenige Nachbarpunkte. Springt
 * man in EINEM Zug von 2048 px auf 160 px, wird also aus je 13 Bildpunkten
 * einer — die übrigen 12 fallen ungesehen weg. Das ist der „Matsch", den man
 * im kleinen Kreis sieht. Halbiert man stattdessen mehrfach, fliesst bei jedem
 * Schritt jeder Punkt in das Ergebnis ein.
 */
const stepDown = (source: HTMLCanvasElement, target: number): HTMLCanvasElement => {
    let canvas = source;
    while (canvas.width > target * 2) {
        const [next, context] = squareCanvas(Math.max(target, Math.round(canvas.width / 2)));
        context.drawImage(canvas, 0, 0, next.width, next.width);
        canvas = next;
    }
    if (canvas.width === target) return canvas;
    const [out, context] = squareCanvas(target);
    context.drawImage(canvas, 0, 0, target, target);
    return out;
};

/**
 * Stehen im Ausschnitt durchsichtige Stellen?
 *
 * Das entscheidet über Schwarz oder nicht: JPEG kennt keine Durchsichtigkeit,
 * und wo im PNG „nichts" stand, malt es Schwarz hin. Ein freigestellter Avatar
 * sass danach in einem schwarzen Klecks — der auffälligste Teil des Vorwurfs
 * „das Bild ist viel schlechter geworden".
 *
 * Gefragt wird eine 64-px-Probe, nicht die volle Fläche: beim Verkleinern
 * mittelt der Browser die Durchsichtigkeit mit, eine freie Ecke bleibt also
 * sichtbar — und 4096 Bildpunkte kosten nichts, wo die Arbeitsfläche 6,5
 * Millionen hätte.
 */
const hasTransparency = (canvas: HTMLCanvasElement): boolean => {
    const [, context] = squareCanvas(64);
    context.drawImage(canvas, 0, 0, 64, 64);
    const { data } = context.getImageData(0, 0, 64, 64);
    for (let i = 3; i < data.length; i += 4) {
        if (data[i] < 250) return true;
    }
    return false;
};

/** Dasselbe Bild auf WEISSEM Grund — die Notlösung, wenn PNG zu schwer wird. */
const onWhite = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
    const [out, context] = squareCanvas(canvas.width);
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.width);
    context.drawImage(canvas, 0, 0);
    return out;
};

/**
 * Das Format je Bild wählen, statt stur JPEG zu nehmen.
 *
 *   • Durchsichtig  → PNG, ohne Wenn und Aber (siehe `hasTransparency`).
 *     Passt es nicht ins Gewicht, wird wenigstens WEISS untergelegt statt
 *     Schwarz.
 *   • Flächengrafik → PNG, weil es dort verlustfrei UND leichter ist.
 *   • Foto          → JPEG, weil PNG dort ein Vielfaches wiegen würde.
 *
 * Entschieden wird nicht über den Bildinhalt, sondern über das Ergebnis: beide
 * Fassungen werden gerechnet, und die passende gewinnt (siehe `PNG_TOLERANCE`).
 * Das ist ein zweiter Kodiergang auf einem Bild, das einmal je Person entsteht
 * — im Tausch gegen einen Avatar, dem man das Speichern nicht mehr ansieht.
 */
const encode = (canvas: HTMLCanvasElement, quality: number, budget: number): string => {
    const png = canvas.toDataURL('image/png');
    if (hasTransparency(canvas)) {
        return png.length <= budget ? png : onWhite(canvas).toDataURL('image/jpeg', quality);
    }
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    return png.length <= Math.min(budget, jpeg.length * PNG_TOLERANCE) ? png : jpeg;
};

/**
 * Aus dem Rahmen wird ein Bild: der sichtbare Ausschnitt (`FRAME_SIZE` gross)
 * wird in Bild-Pixel zurückgerechnet und in seiner EIGENEN Auflösung geholt —
 * erst danach wird verkleinert, und zwar schrittweise (siehe `stepDown`).
 *
 * Der Daumennagel entsteht aus derselben Arbeitsfläche, nicht noch einmal aus
 * dem Originalbild: so tragen beide exakt denselben Ausschnitt, und der kleine
 * Kreis in der Kopfleiste zeigt garantiert dasselbe Gesicht wie die grosse
 * Fläche auf der Personenseite.
 */
const renderCrop = (image: HTMLImageElement, view: CropView): PhotoPair => {
    const sourceEdge = FRAME_SIZE / view.scale;
    const sourceX = -view.x / view.scale;
    const sourceY = -view.y / view.scale;

    /* Wie viele ECHTE Bildpunkte im Kreis stehen. Danach richtet sich die
       Zielgrösse: mehr als das Original hergibt, lässt sich nicht erfinden —
       ein auf 1024 aufgeblasener 400-px-Ausschnitt wäre nur ein grösseres
       unscharfes Bild und dazu ein Vielfaches an Daten. */
    const nativeEdge = Math.round(sourceEdge);
    const outputEdge = Math.min(OUTPUT_MAX, Math.max(OUTPUT_MIN, nativeEdge));

    // Den Ausschnitt so gross holen, wie er im Original wirklich ist (nach oben
    // gedeckelt) — nicht kleiner: was hier fehlt, ist unwiederbringlich weg.
    const workEdge = Math.min(WORK_SIZE, Math.max(outputEdge, nativeEdge));
    const [work, workContext] = squareCanvas(workEdge);
    workContext.drawImage(image, sourceX, sourceY, sourceEdge, sourceEdge, 0, 0, workEdge, workEdge);

    return {
        photo: encode(stepDown(work, outputEdge), JPEG_QUALITY, PHOTO_BUDGET),
        thumb: encode(stepDown(work, THUMB_SIZE), THUMB_QUALITY, THUMB_BUDGET),
    };
};

export const PersonPhotoSheet = ({
    open,
    employeeId,
    name,
    initials,
    current,
    onClose,
    onSaved,
}: {
    open: boolean;
    employeeId: string;
    name: string;
    initials: string;
    current: string | null;
    onClose: () => void;
    onSaved: (photo: string | null) => void;
}) => {
    const inputRef = useRef<HTMLInputElement>(null);
    // Das GEWÄHLTE Bild in voller Grösse — daraus wird bei jedem Schieben neu
    // gezeichnet, deshalb bleibt es liegen, bis das Fenster schliesst.
    const [source, setSource] = useState<HTMLImageElement | null>(null);
    const [view, setView] = useState<CropView | null>(null);
    // `undefined` = unverändert; `null` = ausdrücklich entfernt.
    const [removed, setRemoved] = useState(false);
    const [saving, setSaving] = useState(false);
    const dragRef = useRef<{ pointerId: number; startX: number; startY: number; origin: CropView } | null>(null);
    const frameRef = useRef<HTMLDivElement | null>(null);
    // Das Rad liest den Stand aus einer Truhe statt aus dem Abschluss: der
    // Zuhörer wird EINMAL angemeldet (siehe unten) und bliebe sonst für immer
    // auf dem Ausschnitt stehen, der beim Anmelden gerade galt.
    const liveRef = useRef<{ source: HTMLImageElement | null; view: CropView | null }>({ source: null, view: null });
    liveRef.current = { source, view };

    const reset = useCallback(() => {
        setSource(null);
        setView(null);
        setRemoved(false);
    }, []);

    // Ein erneut geöffnetes Fenster zeigt den Stand der Person, nicht den
    // abgebrochenen Versuch von vorhin.
    useEffect(() => {
        if (!open) reset();
    }, [open, reset]);

    const shownExisting = removed ? null : current;
    const dirty = source !== null || (removed && current !== null);

    const pick = async (fileList: FileList | null) => {
        const file = fileList?.[0];
        if (inputRef.current) inputRef.current.value = '';
        if (!file) return;
        if (!file.type.startsWith('image/')) {
            toast.error(t('personnel.person.photoTypeError'));
            return;
        }
        try {
            const image = await readImage(file);
            setSource(image);
            setView(centeredView(image));
            setRemoved(false);
        } catch {
            toast.error(t('personnel.person.photoReadError'));
        }
    };

    const nudge = (next: CropView) => {
        if (!source) return;
        setView(clampView(source, next));
    };

    const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (!view) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, origin: view };
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        nudge({
            scale: drag.origin.scale,
            x: drag.origin.x + (event.clientX - drag.startX),
            y: drag.origin.y + (event.clientY - drag.startY),
        });
    };

    const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
    };

    /* Zoom am Rad: der Punkt UNTER dem Zeiger bleibt stehen. Zoomte der Rahmen
       stur um seine Mitte, liefe das Gesicht beim Vergrössern aus dem Bild.

       Der Zuhörer wird VON HAND angemeldet, nicht über `onWheel`: React meldet
       Radereignisse duldend („passive") an, dort ist `preventDefault` wirkungs-
       los — das Untenfenster würde beim Zoomen zusätzlich scrollen. */
    useEffect(() => {
        const frame = frameRef.current;
        if (!frame) return;
        const onWheel = (event: WheelEvent) => {
            const { source: liveSource, view: liveView } = liveRef.current;
            if (!liveSource || !liveView) return;
            event.preventDefault();
            const rect = frame.getBoundingClientRect();
            const pointerX = event.clientX - rect.left;
            const pointerY = event.clientY - rect.top;
            const factor = Math.exp(-event.deltaY / 400);
            const next = clampView(liveSource, { ...liveView, scale: liveView.scale * factor });
            const ratio = next.scale / liveView.scale;
            setView(clampView(liveSource, {
                scale: next.scale,
                x: pointerX - (pointerX - liveView.x) * ratio,
                y: pointerY - (pointerY - liveView.y) * ratio,
            }));
        };
        frame.addEventListener('wheel', onWheel, { passive: false });
        return () => frame.removeEventListener('wheel', onWheel);
    }, [source]);

    /* Der Schieberegler zoomt um die RAHMENMITTE — dort schaut man hin, wenn
       man nicht auf einen bestimmten Punkt zielt. */
    const onZoomInput = (value: number) => {
        if (!source || !view) return;
        const next = clampView(source, { ...view, scale: coverScale(source) * value });
        const ratio = next.scale / view.scale;
        const middle = FRAME_SIZE / 2;
        nudge({
            scale: next.scale,
            x: middle - (middle - view.x) * ratio,
            y: middle - (middle - view.y) * ratio,
        });
    };

    const save = async () => {
        if (!dirty) return;
        let payload: PhotoPair | null = null;
        if (source && view) {
            try {
                payload = renderCrop(source, view);
            } catch {
                toast.error(t('personnel.person.photoReadError'));
                return;
            }
        }
        try {
            setSaving(true);
            const result = await personnelApi.setStaffPhoto(employeeId, payload?.photo ?? null, payload?.thumb ?? null);
            onSaved(result.profilePictureUrl);
            // Das Bild steht überall, wo diese Person vorkommt — Kopfleiste,
            // Listen, Zuteilungen. Es muss SOFORT stimmen, nicht erst beim
            // nächsten Laden.
            primePersonPhoto(employeeId, result.profilePictureThumb ?? result.profilePictureUrl ?? null);
            toast.success(payload ? t('personnel.person.photoSaved') : t('personnel.person.photoRemoved'));
            reset();
            onClose();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('personnel.person.photoSaveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const close = () => {
        reset();
        onClose();
    };

    const zoomValue = source && view ? view.scale / coverScale(source) : 1;

    return (
        <BottomSheet
            open={open}
            title={t('personnel.person.photoTitle')}
            description={name}
            size={560}
            onClose={close}
            footer={(
                <div className="flex items-center justify-end gap-2">
                    <GhostButton onClick={close}>{t('common.cancel')}</GhostButton>
                    <PrimaryButton disabled={!dirty || saving} onClick={() => void save()}>
                        {t('common.save')}
                    </PrimaryButton>
                </div>
            )}
        >
            <div className="flex flex-col items-center gap-4">
                {source && view ? (
                    <>
                        {/* Der Rahmen: `touch-none`, sonst scrollt das Untenfenster
                            mit, statt dass das Bild sich verschiebt. */}
                        <div
                            ref={frameRef}
                            role="presentation"
                            onPointerDown={onPointerDown}
                            onPointerMove={onPointerMove}
                            onPointerUp={endDrag}
                            onPointerCancel={endDrag}
                            style={{ width: FRAME_SIZE, height: FRAME_SIZE }}
                            className="relative touch-none overflow-hidden rounded-full bg-slate-900 outline outline-4 outline-white/80 dark:outline-white/15"
                        >
                            <img
                                src={source.src}
                                alt={name}
                                draggable={false}
                                style={{
                                    position: 'absolute',
                                    left: 0,
                                    top: 0,
                                    width: source.naturalWidth * view.scale,
                                    height: source.naturalHeight * view.scale,
                                    transform: `translate(${view.x}px, ${view.y}px)`,
                                    cursor: 'grab',
                                }}
                                className="max-w-none select-none"
                            />
                        </div>

                        <label className="flex w-full max-w-xs items-center gap-3 text-[11.5px] text-slate-500 dark:text-white/55">
                            {t('personnel.person.photoZoom')}
                            <input
                                type="range"
                                min={1}
                                max={MAX_ZOOM}
                                step={0.01}
                                value={zoomValue}
                                onChange={(event) => onZoomInput(Number(event.target.value))}
                                className="min-w-0 flex-1 accent-[#272f67]"
                            />
                        </label>
                    </>
                ) : (
                    <div className="grid size-40 place-items-center overflow-hidden rounded-full bg-[#272f67] text-[42px] font-bold text-white outline outline-4 outline-white/80 dark:outline-white/15">
                        {shownExisting
                            ? <img src={shownExisting} alt={name} className="size-full object-cover" />
                            : <span>{initials}</span>}
                    </div>
                )}

                <p className="max-w-sm text-center text-[11.5px] text-slate-500 dark:text-white/55">
                    {t('personnel.person.photoHint')}
                </p>

                <div className="flex flex-wrap items-center justify-center gap-2">
                    <PrimaryButton icon={<Camera01 size={13} />} onClick={() => inputRef.current?.click()}>
                        {t('personnel.person.photoChoose')}
                    </PrimaryButton>
                    {source && (
                        <GhostButton onClick={() => setView(centeredView(source))}>
                            {t('personnel.person.photoReset')}
                        </GhostButton>
                    )}
                    {(shownExisting || source) && (
                        <GhostButton
                            icon={<Trash01 size={13} />}
                            onClick={() => { setSource(null); setView(null); setRemoved(true); }}
                            className="!text-red-600 hover:!border-red-300 dark:!text-red-400"
                        >
                            {t('personnel.person.photoRemove')}
                        </GhostButton>
                    )}
                </div>

                <input
                    ref={inputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => void pick(event.target.files)}
                />
            </div>
        </BottomSheet>
    );
};
