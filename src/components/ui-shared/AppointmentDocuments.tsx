import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ChevronLeft, ChevronRight, File05 as FileIcon, Image01, Plus, Trash01, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { projectApi, type AppointmentSeriesDto } from '@/lib/api/project';

/**
 * TERMINUNTERLAGEN (24.08.2026).
 *
 * Vorgabe Samet: «An einen Termin sollen ein Begleitwort, Bilder oder PDF
 * gehängt werden können. Die gehen NICHT an den Kunden — die Monteurin soll sie
 * über einen eigenen Knopf ‹Terminunterlagen› auf ihrem Bildschirm sehen.»
 * Nachgeschoben am selben Tag: «Das Anhängen muss richtig schnell gehen — so
 * schnell wie beim Angebot», und «wenn es nicht draufpasst, Pfeile zum
 * Blättern».
 *
 * DARUM SO:
 *   · Die Datei reist ROH (multipart) — kein FileReader, kein Base64. Der
 *     Browser schiebt die Bytes durch, der Server legt sie auf die Platte.
 *   · Die Vorschau kommt aus `URL.createObjectURL(file)` und steht SOFORT da,
 *     bevor der Server geantwortet hat. Die Zeile erscheint gleich mit, blass,
 *     und wird still ersetzt, sobald sie wirklich gespeichert ist.
 *   · Mehrere Dateien gehen in EINEM Multipart-Paket raus; der Server schreibt
 *     ihre Bytes parallel und die Metadaten in einem DB-Batch.
 *   · Angeschaut wird an Ort und Stelle, EINE Unterlage auf einmal, mit Pfeilen
 *     links und rechts — auf einer schmalen Fläche passt nichts anderes hin,
 *     und ein zweiter Tab ist auf einem Tablet eine Sackgasse.
 *
 * Zwei Flächen, EIN Bauteil: das Fenster der Projektleitung (dort wird
 * hochgeladen und gelöscht) und der Montagebildschirm (dort wird nur gelesen).
 * Der Unterschied ist ein Schalter (`canManage`), keine zweite Fassung.
 */

/** Was hochgeladen werden darf — dieselbe Liste wie auf dem Server. */
export const DOCUMENT_ACCEPT = 'application/pdf,image/png,image/jpeg,image/webp,image/gif';
const MAX_FILE_BYTES = 12 * 1024 * 1024;

export const formatFileSize = (bytes: number): string => {
    if (!bytes) return '0 KB';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const isImage = (contentType: string) => contentType.startsWith('image/');

/** Zu gross oder falscher Typ — gemeldet, nicht stillschweigend verschluckt. */
export const acceptableFiles = (list: FileList | File[] | null): File[] => {
    const allowed = DOCUMENT_ACCEPT.split(',');
    return Array.from(list || []).filter((file) => {
        if (file.size > MAX_FILE_BYTES) {
            toast.error(t('calendar.docs.tooLarge', { name: file.name }));
            return false;
        }
        if (!allowed.includes(file.type)) {
            toast.error(t('calendar.docs.wrongType', { name: file.name }));
            return false;
        }
        return true;
    });
};

/**
 * Eine Unterlage, wie die Anzeige sie braucht. `url` ist entweder die
 * Sofortvorschau der eben gewählten Datei (blob:) oder der vom Server geholte
 * Inhalt — die Anzeige unterscheidet das nicht.
 */
export type DocumentView = {
    id: string;
    fileName: string;
    contentType: string;
    sizeBytes: number;
    url?: string;
    /** Läuft noch hoch: die Zeile steht schon da, blass. */
    pending?: boolean;
};

/* ── Die Bühne: EINE Unterlage, Pfeile links und rechts ─────────────────── */

export const DocumentStage = ({ items, index, onIndex, onRemove, onLoad, onClose }: {
    items: DocumentView[];
    index: number;
    onIndex: (next: number) => void;
    onRemove?: (item: DocumentView) => void;
    /** Wird gerufen, wenn eine Unterlage gezeigt wird, deren Inhalt noch fehlt. */
    onLoad?: (item: DocumentView) => void;
    /**
     * DAS KREUZ AN DER VORSCHAU (25.08.2026, Vorgabe Samet: «es soll auch ein
     * X geben — so gestellt, dass man sieht, was darunter steht»).
     *
     * Es LÖSCHT nichts: die Unterlage bleibt angehängt, nur das Blatt klappt
     * zu und gibt das Formular darunter wieder frei. Zurück kommt es über den
     * Namen in der Zeile, die stehen bleibt.
     *
     * Es steht in der LEISTE unter dem Blatt, nie darauf: ein Kreuz auf dem
     * Blatt läge genau über dem, was man lesen will.
     */
    onClose?: () => void;
}) => {
    const current = items[index];

    useEffect(() => {
        if (current && !current.url && !current.pending) onLoad?.(current);
    }, [current?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!items.length) return <div className="ofi-cal-emptyline">{t('calendar.docs.empty')}</div>;
    if (!current) return null;

    const step = (delta: number) => onIndex((index + delta + items.length) % items.length);

    return (
        <div className="ofi-docs-stage">
            <div className="ofi-docs-stage__frame">
                {/* Die Pfeile liegen ÜBER der Unterlage, nicht daneben: auf einer
                    schmalen Fläche nähme eine eigene Spalte die halbe Breite. */}
                {items.length > 1 && (
                    <>
                        <button type="button" onClick={() => step(-1)} className="ofi-docs-stage__nav is-prev" aria-label={t('common.previous')}>
                            <ChevronLeft size={18} />
                        </button>
                        <button type="button" onClick={() => step(1)} className="ofi-docs-stage__nav is-next" aria-label={t('common.next')}>
                            <ChevronRight size={18} />
                        </button>
                    </>
                )}

                {current.url
                    ? (isImage(current.contentType)
                        ? <img src={current.url} alt={current.fileName} className="ofi-docs-stage__image" />
                        : <iframe title={current.fileName} src={`${current.url}#toolbar=0&navpanes=0`} className="ofi-docs-stage__pdf" />)
                    : <div className="ofi-shimmer ofi-docs-stage__loading" />}
            </div>

            <div className="ofi-docs-stage__bar">
                <span className="ofi-docs-stage__icon">
                    {isImage(current.contentType) ? <Image01 size={13} /> : <FileIcon size={13} />}
                </span>
                <span className="ofi-docs-stage__name" title={current.fileName}>{current.fileName}</span>
                <span className="ofi-docs-stage__meta">
                    {formatFileSize(current.sizeBytes)}
                    {items.length > 1 ? ` · ${index + 1}/${items.length}` : ''}
                </span>
                {onRemove && !current.pending && (
                    <button
                        type="button"
                        onClick={() => onRemove(current)}
                        className="ofi-cal-dayrow__drop"
                        aria-label={t('common.delete')}
                        title={t('common.delete')}
                    >
                        <Trash01 size={13} />
                    </button>
                )}
                {onClose && (
                    <button
                        type="button"
                        onClick={onClose}
                        className="ofi-docs-stage__close"
                        aria-label={t('calendar.docs.hidePreview')}
                        title={t('calendar.docs.hidePreview')}
                    >
                        <X size={13} />
                    </button>
                )}
            </div>

            {items.length > 1 && (
                <div className="ofi-docs-strip">
                    {items.map((item, position) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => onIndex(position)}
                            className={`ofi-docs-strip__chip ${position === index ? 'is-active' : ''} ${item.pending ? 'is-pending' : ''}`}
                            title={item.fileName}
                        >
                            {isImage(item.contentType) ? <Image01 size={12} /> : <FileIcon size={12} />}
                            <span>{item.fileName}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

/* ── Zugeklappt: nur noch die Namen ────────────────────────────── */

/**
 * Was von der Vorschau übrig bleibt, wenn das Kreuz gedrückt wurde: eine Zeile
 * je Unterlage, mehr nicht. Ein Klick auf den Namen holt das Blatt zurück —
 * angehängt bleibt alles, geschlossen wurde nur die Ansicht.
 */
export const DocumentChips = ({ items, onOpen, onRemove }: {
    items: DocumentView[];
    onOpen: (index: number) => void;
    onRemove?: (item: DocumentView) => void;
}) => {
    if (!items.length) return null;
    return (
        <div className="ofi-docs-chips">
            {items.map((item, position) => (
                <span key={item.id} className={`ofi-docs-chips__row ${item.pending ? 'is-pending' : ''}`}>
                    <button
                        type="button"
                        onClick={() => onOpen(position)}
                        className="ofi-docs-chips__open"
                        title={t('calendar.docs.showPreview')}
                    >
                        {isImage(item.contentType) ? <Image01 size={12} /> : <FileIcon size={12} />}
                        <span>{item.fileName}</span>
                    </button>
                    <span className="ofi-docs-chips__size">{formatFileSize(item.sizeBytes)}</span>
                    {onRemove && !item.pending && (
                        <button
                            type="button"
                            onClick={() => onRemove(item)}
                            className="ofi-cal-dayrow__drop"
                            aria-label={t('common.delete')}
                            title={t('common.delete')}
                        >
                            <Trash01 size={12} />
                        </button>
                    )}
                </span>
            ))}
        </div>
    );
};

/** Der Knopf «Bild oder PDF anhängen» — überall derselbe. */
export const DocumentAddButton = ({ onFiles, busy, label }: {
    onFiles: (files: FileList | null) => void;
    busy?: boolean;
    label?: string;
}) => {
    const input = useRef<HTMLInputElement>(null);
    return (
        <>
            <input
                ref={input}
                type="file"
                accept={DOCUMENT_ACCEPT}
                multiple
                hidden
                onChange={(event) => { onFiles(event.target.files); if (input.current) input.current.value = ''; }}
            />
            <button type="button" onClick={() => input.current?.click()} disabled={busy} className="ofi-cal-btn">
                <Plus size={13} />
                {busy ? t('calendar.docs.uploading') : (label || t('calendar.docs.add'))}
            </button>
        </>
    );
};

/* ── Anhänge, die es noch nicht gibt: das Anlegen-Fenster ───────────────── */

/**
 * Beim ANLEGEN gibt es den Termin noch nicht, also auch nichts, woran eine
 * Unterlage hängen könnte. Die Dateien bleiben deshalb hier liegen — sichtbar
 * und blätterbar — und gehen als EIN Paket raus, sobald der Termin gespeichert
 * ist (`uploadPendingDocuments`). Für die Anwenderin ist es ein Vorgang:
 * anhängen, speichern, fertig.
 */
export const usePendingDocuments = () => {
    const [files, setFiles] = useState<File[]>([]);
    const urls = useRef(new Map<string, string>());
    const keyOf = (file: File, index: number) => `${index}-${file.name}-${file.size}`;

    const views: DocumentView[] = useMemo(() => files.map((file, index) => {
        const key = keyOf(file, index);
        if (!urls.current.has(key)) urls.current.set(key, URL.createObjectURL(file));
        return {
            id: key,
            fileName: file.name,
            contentType: file.type,
            sizeBytes: file.size,
            url: urls.current.get(key)!,
        };
    }), [files]);

    // Die Blob-Adressen leben, solange das Fenster offen ist; danach werden sie
    // freigegeben, sonst hält der Browser die Dateien im Speicher fest.
    useEffect(() => () => {
        urls.current.forEach((url) => URL.revokeObjectURL(url));
        urls.current.clear();
    }, []);

    const add = useCallback((list: FileList | File[] | null) => {
        const accepted = acceptableFiles(list);
        if (accepted.length) setFiles((current) => [...current, ...accepted]);
    }, []);

    const remove = useCallback((id: string) => {
        setFiles((current) => current.filter((file, index) => keyOf(file, index) !== id));
    }, []);

    const clear = useCallback(() => setFiles([]), []);

    return { files, views, add, remove, clear };
};

/** Alle vorgemerkten Dateien an den frisch gespeicherten Termin — ein Paket. */
export const uploadPendingDocuments = async (appointmentId: string, files: File[]): Promise<void> => {
    if (!files.length) return;
    try {
        await projectApi.addAppointmentDocuments(appointmentId, files);
    } catch {
        toast.error(t('calendar.docs.uploadFailedCount', { count: files.length }));
    }
};

/* ── Der ganze Block an einem bestehenden Termin ────────────────────────── */

/** Die Unterlagen eines Einsatzes. `technician` wählt den Weg mit der engeren Sicht. */
export const useAppointmentSeries = (appointmentId: string | null | undefined, opts: { technician?: boolean; enabled?: boolean } = {}) => {
    const [series, setSeries] = useState<AppointmentSeriesDto | null>(null);
    const [loading, setLoading] = useState(false);
    const enabled = opts.enabled !== false;
    const technician = Boolean(opts.technician);

    const reload = useCallback(async () => {
        if (!appointmentId || !enabled) return;
        setLoading(true);
        try {
            setSeries(await projectApi.getAppointmentSeries(appointmentId, { technician }));
        } catch {
            setSeries(null);
        } finally {
            setLoading(false);
        }
    }, [appointmentId, enabled, technician]);

    useEffect(() => { void reload(); }, [reload]);

    return { series, loading, reload, setSeries };
};

/**
 * DER GRIFF AN DER SPALTE (25.08.2026).
 *
 * Getippt wird, und kurz nach dem letzten Anschlag geht der Text von SELBST
 * weg. Der Griff bleibt trotzdem — das Fenster braucht ihn zweimal: beim
 * ZUMACHEN, um nachzuholen, was die Wartezeit noch nicht weggeschickt hat
 * (sonst verlöre das X die letzten Anschläge), und für den Speichern-Knopf in
 * seinem Fuss, der sofort sichert statt zu warten.
 *
 * Er wird bei JEDER Änderung neu gesetzt. Nur so kennt `saveNow` den Text, der
 * eben getippt wurde, und nicht den von vorhin.
 */
export type AppointmentDocsHandle = {
    dirty: boolean;
    save: () => Promise<boolean>;
    /** Sofort sichern — ohne die Bedenkzeit des Selbstsicherns abzuwarten. */
    saveNow: () => void;
};

/** Was der Knopf im Fuss der Karte anzeigt, solange die Spalte offen ist. */
export type PaneSaveState = 'idle' | 'saving' | 'saved';

/** Womit die Spalte dem Fuss meldet, was sein Knopf anzeigen soll. */
export type PaneSaveReport = (dirty: boolean, state: PaneSaveState) => void;

/**
 * Wie lange nach dem letzten Anschlag gewartet wird. Kurz genug, dass es sich
 * wie «sofort» anfühlt, lang genug, dass ein Satz nicht Buchstabe für
 * Buchstabe über die Leitung geht.
 */
export const AUTOSAVE_DELAY = 900;
/** Wie lange «Gespeichert» stehen bleibt, bevor es wieder still wird. */
export const AUTOSAVE_NOTICE = 2200;

/**
 * DER SCHNELLSPEICHER (25.08.2026, Vorgabe Samet — erst «nicht manuell, aber
 * ganz am Schluss rechts ein Speichern-Knopf, nur bei den Unterlagen und den
 * Tagen», dann: «in den Kalender damit — den Pfeil bitte lassen, und zwar bei
 * den Tagen wie bei den Unterlagen, gleich rechts NEBEN dem Pfeil»).
 *
 * Er steht deshalb nicht mehr IN der Spalte, sondern im Fuss der Karte, als
 * letztes Glied der Zeichenreihe — hinter dem Pfeil, der bleibt, wo er war.
 * EIN Knopf für beide Spalten: er fragt den Griff der Spalte, die gerade offen
 * ist, und ist nur da, solange eine offen ist.
 *
 * Gesichert wird weiterhin von SELBST, kurz nach dem letzten Anschlag; dieser
 * Knopf wartet nicht darauf, sondern schickt sofort. Er ist damit kein zweiter
 * Weg, den man kennen müsste, sondern die Abkürzung für den, der es eilig hat
 * — und die Auskunft für den, der es genau wissen will: seine Aufschrift sagt,
 * woran man ist («Speichern» – «Wird gespeichert …» – «Gespeichert»).
 */
export const PaneSaveButton = ({ state, dirty, onSave }: {
    state: PaneSaveState;
    dirty: boolean;
    onSave: () => void;
}) => (
    <button
        type="button"
        onClick={onSave}
        disabled={state === 'saving' || !dirty}
        /* `is-wide`: die Aufschrift wechselt zwischen drei Wörtern — ohne
           Mindestbreite zappelte der Knopf bei jedem Sichern. */
        className="ofi-cal-btn is-primary is-wide"
    >
        {state === 'saving'
            ? t('common.saving')
            : (state === 'saved' && !dirty) ? t('common.saved') : t('common.save')}
    </button>
);

/* ── DER SCHNELLEINTRAG: TEXT UND BILD IN EINEM ZUG ────────────────────── */

/**
 * EIN ZETTEL, EIN ABSCHICKEN (25.08.2026, Vorgabe Samet: «im Kalender sollen
 * Text und Bilder auf EINMAL erfasst werden — bei der Terminauskunft wie beim
 * Anlegen, so wie das Speichern im Log der Angebotsdetails: schnell erfasst,
 * schnell abgeschickt»).
 *
 * Vorher liefen die beiden Hälften getrennt: das Begleitwort sicherte sich von
 * selbst, kurz nach dem letzten Anschlag, die Datei ging schon beim AUSWÄHLEN
 * hinaus. Wer «ein Bild und einen Satz dazu» erfasste, löste zwei Vorgänge zu
 * zwei Zeitpunkten aus — und sah nie, wann das Ganze drin war.
 *
 * Jetzt ist es derselbe Zettel wie im Angebot: das Feld für den Text, darunter
 * das «+» mit den Namen des Gewählten, und EIN Abschicken für beides zusammen.
 * Bis dahin bleibt die Auswahl liegen (nichts geht ungefragt raus) und lässt
 * sich einzeln wieder wegnehmen; ein Klick auf den Namen zeigt sie an.
 *
 * Das Bauteil ist NUR die Anzeige. Wohin es geht, weiss die Fläche darum: das
 * Fenster der Projektleitung schickt an einen bestehenden Termin, die
 * Anlegen-Karte legt den Termin zuerst an. Deshalb steht hier kein Knopf — der
 * gehört an den Rand der jeweiligen Karte, wo er beim Rollen stehen bleibt.
 */
export const AppointmentNoteComposer = ({
    note,
    onNoteChange,
    staged,
    onFiles,
    onRemoveStaged,
    onOpenStaged,
    onQuickSave,
    canManage = true,
    savedNote,
    busy = false,
    label,
    hint,
    placeholder,
}: {
    note: string;
    onNoteChange: (value: string) => void;
    /** Gewählt, aber noch NICHT abgeschickt — die Namen neben dem «+». */
    staged: DocumentView[];
    onFiles: (files: FileList | null) => void;
    onRemoveStaged: (id: string) => void;
    /** Klick auf einen Namen: die Auswahl anschauen, bevor sie weggeht. */
    onOpenStaged?: (index: number) => void;
    /** Strg/⌘ + Enter — für die, die die Hand nicht von der Tastatur nehmen. */
    onQuickSave?: () => void;
    canManage?: boolean;
    savedNote?: string | null;
    busy?: boolean;
    label?: string;
    hint?: string;
    placeholder?: string;
}) => {
    const field = useRef<HTMLTextAreaElement | null>(null);

    /* DAS FELD WÄCHST MIT (24.08.2026): erst auf null zurück — sonst kennt der
       Browser nur die bisherige, zu grosse Höhe — dann auf die Höhe des Inhalts.
       Die Karte darum bleibt, wie sie ist; gerollt wird in der Spalte. */
    useEffect(() => {
        const box = field.current;
        if (!box) return;
        box.style.height = 'auto';
        box.style.height = `${box.scrollHeight}px`;
    }, [note]);

    return (
        <div className="ofi-docs-compose">
            <span className="ofi-cal-field__label">
                {label || t('calendar.docs.coverNote')}
                <span className="ofi-cal-field__hint"> · {hint || t('calendar.docs.internalHint')}</span>
            </span>

            {canManage ? (
                <textarea
                    ref={field}
                    value={note}
                    onChange={(event) => onNoteChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (onQuickSave && event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
                            event.preventDefault();
                            onQuickSave();
                        }
                    }}
                    placeholder={placeholder || t('calendar.docs.coverNotePlaceholder')}
                    className="ofi-cal-input ofi-cal-notefield w-full"
                />
            ) : savedNote ? (
                <div className="ofi-docs__note">{savedNote}</div>
            ) : (
                <div className="ofi-cal-emptyline">{t('calendar.docs.noNote')}</div>
            )}

            {canManage && (
                <div className="ofi-docs-compose__row">
                    <DocumentAddButton onFiles={onFiles} busy={busy} label={t('calendar.docs.addToNote')} />
                    {staged.length === 0 ? (
                        <span className="ofi-docs-compose__hint">{t('calendar.docs.limits')}</span>
                    ) : (
                        staged.map((item, position) => (
                            <span key={item.id} className="ofi-docs-compose__chip" title={item.fileName}>
                                <button
                                    type="button"
                                    className="ofi-docs-compose__open"
                                    /* Ohne Vorschau ist der Name nur ein Name —
                                       dann darf er sich auch nicht drücken
                                       lassen. */
                                    disabled={!onOpenStaged}
                                    onClick={() => onOpenStaged?.(position)}
                                    title={onOpenStaged ? t('calendar.docs.showPreview') : item.fileName}
                                >
                                    {isImage(item.contentType) ? <Image01 size={11} /> : <FileIcon size={11} />}
                                    <span>{item.fileName}</span>
                                </button>
                                <button
                                    type="button"
                                    className="ofi-docs-compose__drop"
                                    aria-label={t('common.delete')}
                                    disabled={busy}
                                    onClick={() => onRemoveStaged(item.id)}
                                >
                                    <X size={10} />
                                </button>
                            </span>
                        ))
                    )}
                </div>
            )}

            {/* Solange etwas daneben liegt, steht auch da, dass es noch NICHT
                weg ist — sonst hielte man das Anhängen für das Abschicken. */}
            {canManage && staged.length > 0 && (
                <span className="ofi-docs-compose__pendingnote">{t('calendar.docs.notSaved', { count: staged.length })}</span>
            )}
        </div>
    );
};

export const AppointmentDocumentsPanel = ({
    appointmentId,
    technician,
    canManage,
    variant = 'popup',
    handleRef,
    onCountChange,
    onCoverNote,
    onSaveState,
}: {
    appointmentId: string;
    technician?: boolean;
    canManage?: boolean;
    variant?: 'popup' | 'montage';
    /** Womit das Fenster beim Zumachen nachholt, was noch aussteht. */
    handleRef?: MutableRefObject<AppointmentDocsHandle | null>;
    onCountChange?: (count: number) => void;
    /** Das eben abgeschickte Begleitwort — die Karte zeigt es auch bei den
        Angaben, und dort darf es nicht veralten. */
    onCoverNote?: (note: string | null) => void;
    /** Für den Speichern-Knopf im Fuss der Karte: was er anzeigen soll. */
    onSaveState?: PaneSaveReport;
}) => {
    const { series, loading, setSeries } = useAppointmentSeries(appointmentId, { technician });
    /* Die Auswahl, die noch NICHT weg ist: dieselbe Ablage wie in der
       Anlegen-Karte — beide Flächen erfassen jetzt gleich. */
    const staged = usePendingDocuments();
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);
    const [index, setIndex] = useState(0);
    /* Die Vorschau lässt sich zuklappen (25.08.2026): dann stehen nur noch die
       Namen da, und das Begleitwort darüber ist wieder ganz zu sehen. */
    const [previewOpen, setPreviewOpen] = useState(true);
    /** Inhalte, die schon geholt (oder eben hochgeladen) wurden. */
    const [content, setContent] = useState<Record<string, string>>({});
    /** Zeilen, die gerade hochladen — sie stehen ab dem Abschicken sofort da. */
    const [pending, setPending] = useState<DocumentView[]>([]);
    const savedNote = series?.coverNote ?? '';

    /* WAS VOM SERVER KOMMT, ÜBERSCHREIBT NIE, WAS GERADE GETIPPT WIRD.
       Beim Abschicken wartet die Antwort einen Netzweg lang — wer in dieser
       Zeit weiterschreibt, bekäme sonst seinen eigenen Satz von vorhin zurück
       und die neuen Anschläge wären weg. Gemerkt wird deshalb der Stand, der
       zuletzt übernommen wurde: nur solange das Feld GENAU so dasteht, gilt es
       als unberührt und wird nachgeführt. */
    const syncedNote = useRef<string | null>(null);
    useEffect(() => {
        const incoming = series?.coverNote ?? '';
        setNote((current) => (syncedNote.current === null || current === syncedNote.current ? incoming : current));
        syncedNote.current = incoming;
    }, [series?.coverNote]);
    useEffect(() => { onCountChange?.(series?.documents.length ?? 0); }, [series?.documents.length]); // eslint-disable-line react-hooks/exhaustive-deps

    /* DREI SCHICHTEN, EINE LISTE — in dieser Reihenfolge, damit nichts springt:
       was liegt (gespeichert), was gerade hochlädt, und was eben gewählt wurde.
       Die beiden hinteren stehen blass da; ANGESCHAUT wird alles gleich, mit
       denselben Pfeilen: wer ein Bild anhängt, will es sehen, bevor es weggeht,
       nicht erst danach. */
    const items: DocumentView[] = useMemo(() => ([
        ...(series?.documents || []).map((document) => ({
            id: document.id,
            fileName: document.fileName,
            contentType: document.contentType,
            sizeBytes: document.sizeBytes,
            url: content[document.id],
        })),
        ...pending,
        ...staged.views.map((view) => ({ ...view, pending: true })),
    ]), [series?.documents, content, pending, staged.views]);

    /* Zu sichern ist etwas, sobald der Text ein anderer ist ODER etwas daneben
       liegt. Beides zusammen ist EIN Vorgang — das ist der ganze Punkt. */
    const dirty = note !== savedNote || staged.files.length > 0;
    const busy = useRef(false);

    /**
     * ABSCHICKEN — TEXT UND DATEIEN IN EINEM ZUG (25.08.2026).
     *
     * Der Text geht als Begleitwort weg, die Dateien gehen in EINEM Paket an
     * dieselbe Serie, und beides startet im selben Augenblick: `Promise.all`
     * über Notiz und Dateipaket. Wer ein Bild und einen Satz dazu erfasst hat,
     * drückt EINMAL.
     *
     * Sichtbar ist es schon vorher: die gewählte Datei steht mit ihrer
     * Blob-Adresse sofort blass in der Liste (und wird nach der Antwort still
     * durch die echte Zeile ersetzt — mit DERSELBEN Vorschau, es lädt also
     * nichts nach). Was scheitert, kommt in die Auswahl zurück, statt sang- und
     * klanglos zu verschwinden; der Text bleibt stehen, solange er nicht drin
     * ist.
     */
    const submit = async (): Promise<boolean> => {
        if (busy.current) return true;
        const files = staged.files;
        const views = staged.views;
        const noteChanged = note !== savedNote;
        if (!noteChanged && files.length === 0) return true;

        busy.current = true;
        setSaving(true);

        /* Die Auswahl wandert aus der Ablage in die Warteschlange — dieselben
           Zeilen, dieselbe Blob-Vorschau, dieselbe Stelle in der Liste: für das
           Auge geschieht nichts, es steht nur nicht mehr «noch nicht
           gespeichert» darunter. */
        const marks = files.map((file, position) => ({ file, view: { ...views[position], pending: true } }));
        if (marks.length) {
            setPending((current) => [...current, ...marks.map((mark) => mark.view)]);
            staged.clear();
        }

        const failed: File[] = [];
        const notePromise: Promise<boolean> = noteChanged
            ? projectApi.saveAppointmentCoverNote(appointmentId, note)
                .then((result) => {
                    setSeries((current) => (current
                        ? { ...current, seriesId: result.seriesId, coverNote: result.coverNote }
                        : current));
                    onCoverNote?.(result.coverNote);
                    return true;
                })
                .catch((error: any) => {
                    toast.error(error?.response?.data?.error || t('common.saveFailed'));
                    return false;
                })
            : Promise.resolve(true);
        const uploads = marks.length
            ? projectApi.addAppointmentDocuments(appointmentId, marks.map((mark) => mark.file))
                .then((result) => {
                    setContent((current) => {
                        const next = { ...current };
                        result.documents.forEach((document, position) => {
                            next[document.id] = marks[position].view.url!;
                        });
                        return next;
                    });
                    setSeries((current) => (current
                        ? { ...current, seriesId: result.seriesId, documents: [...current.documents, ...result.documents] }
                        : current));
                })
                .catch((error: any) => {
                    toast.error(error?.response?.data?.error || t('calendar.docs.uploadFailed'));
                    failed.push(...marks.map((mark) => mark.file));
                })
                .finally(() => {
                    const pendingIds = new Set(marks.map((mark) => mark.view.id));
                    setPending((current) => current.filter((row) => !pendingIds.has(row.id)));
                })
            : Promise.resolve();
        const [noteOk] = await Promise.all([notePromise, uploads]);

        if (failed.length) staged.add(failed);
        busy.current = false;
        setSaving(false);
        return noteOk && failed.length === 0;
    };

    /* Wird die Spalte zugemacht, bevor abgeschickt wurde, geht der Eintrag
       trotzdem noch weg. Das Fenster ruft dafür den Griff — das hier ist das
       Netz darunter, für jeden anderen Weg hinaus. Der Griff wird bei JEDER
       Änderung neu gesetzt: er muss den Text kennen, der eben getippt wurde,
       und die Datei, die eben gewählt wurde. */
    const flush = useRef<{ dirty: boolean; save: () => Promise<boolean> }>({ dirty: false, save: async () => true });
    flush.current = { dirty, save: submit };
    useEffect(() => () => { if (flush.current.dirty) void flush.current.save(); }, []);

    /* «Wird gespeichert …», dann kurz «Gespeichert» — die Auskunft am Knopf im
       Fuss der Karte, damit man weiss, wann das Ganze drin war. */
    const [notice, setNotice] = useState(false);
    const wasSaving = useRef(false);
    useEffect(() => {
        if (wasSaving.current && !saving && !dirty) setNotice(true);
        wasSaving.current = saving;
    }, [saving, dirty]);
    useEffect(() => {
        if (!notice) return;
        const timer = window.setTimeout(() => setNotice(false), AUTOSAVE_NOTICE);
        return () => window.clearTimeout(timer);
    }, [notice]);
    const saveState: PaneSaveState = saving ? 'saving' : notice ? 'saved' : 'idle';

    useEffect(() => {
        if (handleRef) handleRef.current = { dirty, save: submit, saveNow: () => { void submit(); } };
    });
    /* Was der Knopf im Fuss ANZEIGT, ändert sich dagegen selten — nur diese
       zwei Angaben gehen hinauf, und nur wenn sie sich wirklich bewegen. */
    useEffect(() => { onSaveState?.(dirty, saveState); }, [dirty, saveState]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Erst beim Anschauen wird der Inhalt geholt — die Liste bleibt leicht. */
    const loadContent = async (item: DocumentView) => {
        try {
            const payload = await projectApi.getAppointmentDocument(item.id, { technician });
            setContent((current) => ({ ...current, [item.id]: payload.data }));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('calendar.docs.openFailed'));
        }
    };

    /* EIN LÖSCHEN JE ZEILE (25.08.2026). Zwischen Klick und Antwort liegt ein
       Netzweg; ein zweiter Klick auf denselben Papierkorb schickte bis dahin
       eine zweite Anfrage los, und die traf serverseitig auf eine Zeile, die es
       nicht mehr gab. Der Server ist inzwischen gleichmütig (deleteMany), aber
       die zweite Anfrage ist trotzdem überflüssig — sie wird hier gar nicht
       erst gestellt. Ein Ref, keine Zustandsgrösse: die Sperre muss SOFORT
       gelten, nicht erst beim nächsten Zeichnen. */
    const removing = useRef(new Set<string>());

    const remove = async (item: DocumentView) => {
        if (removing.current.has(item.id)) return;
        removing.current.add(item.id);
        try {
            await projectApi.deleteAppointmentDocument(item.id);
            setSeries((current) => (current ? { ...current, documents: current.documents.filter((row) => row.id !== item.id) } : current));
            setIndex((current) => Math.max(0, current - 1));
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('common.deleteFailed'));
        } finally {
            removing.current.delete(item.id);
        }
    };

    const safeIndex = Math.min(index, Math.max(0, items.length - 1));
    const stamped = series?.documents[Math.min(safeIndex, Math.max(0, series.documents.length - 1))];

    return (
        <div className={`ofi-docs-panel ${variant === 'montage' ? 'is-montage' : ''}`}>
            {/* DER ZETTEL: Text und Auswahl beieinander, EIN Abschicken für
                beides (25.08.2026). Abgeschickt wird mit dem Knopf im Fuss der
                Karte — oder mit Strg/⌘ + Enter, ohne die Hand von der Tastatur
                zu nehmen. */}
            <AppointmentNoteComposer
                note={note}
                onNoteChange={setNote}
                staged={staged.views}
                onFiles={(list) => {
                    staged.add(list);
                    // Wer eben etwas gewählt hat, will es sehen — auch wenn die
                    // Vorschau vorher zugeklappt war.
                    setPreviewOpen(true);
                    setIndex(items.length);
                }}
                onRemoveStaged={staged.remove}
                onOpenStaged={(position) => { setPreviewOpen(true); setIndex(items.length - staged.views.length + position); }}
                onQuickSave={() => { void submit(); }}
                canManage={canManage}
                savedNote={savedNote}
                busy={saving}
            />

            <div className="ofi-cal-field">
                <span className="ofi-cal-field__label">
                    {t('calendar.docs.files')}
                    {items.length > 0 && <span className="ofi-cal-field__hint"> · {items.length}</span>}
                </span>

                {loading && !series ? (
                    <div className="ofi-shimmer h-32 rounded-lg bg-slate-100 dark:bg-white/5" />
                ) : previewOpen || !items.length ? (
                    <DocumentStage
                        items={items}
                        index={safeIndex}
                        onIndex={setIndex}
                        onLoad={(item) => void loadContent(item)}
                        onRemove={canManage ? (item) => void remove(item) : undefined}
                        onClose={items.length ? () => setPreviewOpen(false) : undefined}
                    />
                ) : (
                    <DocumentChips
                        items={items}
                        onOpen={(position) => { setIndex(position); setPreviewOpen(true); }}
                        onRemove={canManage ? (item) => void remove(item) : undefined}
                    />
                )}

                {/* DAS «+» STEHT OBEN AM ZETTEL (25.08.2026): angehängt wird
                    dort, wo auch getippt wird. Hier unten wird nur ANGESCHAUT —
                    das Gespeicherte wie das eben Gewählte, letzteres blass und
                    ohne Papierkorb (weggenommen wird es an seiner Pille oben). */}

                {stamped && (
                    <div className="ofi-docs__stamp">
                        {[
                            stamped.uploadedBy ? `${stamped.uploadedBy.firstName} ${stamped.uploadedBy.lastName}` : null,
                            dayjs(stamped.createdAt).format('DD.MM.YYYY HH:mm'),
                        ].filter(Boolean).join(' · ')}
                    </div>
                )}
            </div>

            {/* HIER STEHT KEIN KNOPF MEHR (25.08.2026, Vorgabe Samet: «in den
                Kalender damit — rechts neben dem Pfeil»). Der Schnellspeicher
                sitzt jetzt im Fuss der Karte, hinter dem Pfeil, und gilt von
                dort aus für die Unterlagen wie für die Tage. */}
        </div>
    );
};

/** Der aufklappbare Block auf dem Montagebildschirm. */
export const AppointmentDocumentsSection = ({ appointmentId, open, onClose }: {
    appointmentId: string;
    open: boolean;
    onClose: () => void;
}) => {
    if (!open) return null;
    return (
        <div className="rounded-[3px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
            <div className="mb-2 flex items-center justify-between gap-3">
                <div className="text-[15px] font-bold text-slate-900 dark:text-slate-50">{t('calendar.docs.title')}</div>
                <button
                    type="button"
                    onClick={onClose}
                    className="flex size-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100 dark:text-white/60 dark:hover:bg-white/10"
                    aria-label={t('common.close')}
                >
                    <X size={16} />
                </button>
            </div>
            <AppointmentDocumentsPanel appointmentId={appointmentId} technician variant="montage" />
        </div>
    );
};
