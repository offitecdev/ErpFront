import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Download, FileSearch, History, Loader2, Plus, RotateCcw, ScrollText, ZoomIn, ZoomOut } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionTaskErrorText, productionTasksApi } from '@/lib/api/productionTasks';
import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { openBlob } from '../bom/device/bomFiles';
import { AiAnalysisEntry } from './AiAnalysis';
import { FileGlyph } from './SubtaskFiles';
import { loadPdfjs } from './fileThumbs';
import {
    fileGroups,
    formatDateTime,
    isImage,
    isPdf,
    lastRevisionRequest,
    reviewTimeline,
    type ReviewEntry,
    type SubtaskActions,
} from './subtaskFileModel';
import { hasSubtaskDocument, TASK_LIMITS } from './taskModel';

/** Die Stufen der Vergrösserung; 1 = so breit wie die Fläche. */
const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3] as const;
const FIT = ZOOMS.indexOf(1);

/** Eine Seite eines PDFs, scharf auch auf hochauflösenden Schirmen. */
const PdfPage = ({ doc, pageNumber, width }: { doc: PDFDocumentProxy; pageNumber: number; width: number }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        let task: RenderTask | null = null;
        let alive = true;
        void (async () => {
            const page = await doc.getPage(pageNumber);
            const canvas = canvasRef.current;
            if (!alive || !canvas || width <= 0) return;
            const base = page.getViewport({ scale: 1 });
            const ratio = window.devicePixelRatio || 1;
            const viewport = page.getViewport({ scale: (width / base.width) * ratio });
            canvas.width = Math.ceil(viewport.width);
            canvas.height = Math.ceil(viewport.height);
            canvas.style.width = `${Math.round(width)}px`;
            canvas.style.height = `${Math.round(viewport.height / ratio)}px`;
            const context = canvas.getContext('2d');
            if (!context) return;
            task = page.render({ canvasContext: context, viewport });
            await task.promise;
        })().catch(() => undefined); // Abgebrochen (neue Grösse) oder unlesbar — die nächste Runde zeichnet.
        return () => {
            alive = false;
            task?.cancel();
        };
    }, [doc, pageNumber, width]);
    return <canvas ref={canvasRef} className="ofi-ptk-review__page" aria-label={t('productionTasks.review.page', { page: pageNumber })} />;
};

/** Alle Seiten eines PDFs untereinander, in der gewählten Vergrösserung. */
const PdfPages = ({ blob, width }: { blob: Blob; width: number }) => {
    const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
        let alive = true;
        let loaded: PDFDocumentProxy | null = null;
        setDoc(null);
        setFailed(false);
        void (async () => {
            const pdfjs = await loadPdfjs();
            const opened = await pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()) }).promise;
            if (!alive) { void opened.destroy(); return; }
            loaded = opened;
            setDoc(opened);
        })().catch(() => { if (alive) setFailed(true); });
        return () => {
            alive = false;
            if (loaded) void loaded.destroy();
        };
    }, [blob]);
    if (failed) return <p className="ofi-ptk-review__state">{t('productionTasks.review.failed')}</p>;
    if (!doc) return <p className="ofi-ptk-review__state"><Loader2 className="is-spinning" aria-hidden />{t('productionTasks.review.loading')}</p>;
    return (
        <>
            {Array.from({ length: doc.numPages }, (_, index) => (
                <PdfPage key={index} doc={doc} pageNumber={index + 1} width={width} />
            ))}
        </>
    );
};

/** Ein Foto (ältere Dateien) in der gewählten Vergrösserung. */
const ImageView = ({ blob, width, name }: { blob: Blob; width: number; name: string }) => {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        const made = URL.createObjectURL(blob);
        setUrl(made);
        return () => URL.revokeObjectURL(made);
    }, [blob]);
    return url ? <img className="ofi-ptk-review__page" src={url} alt={name} style={{ width }} /> : null;
};

/** Eine Zeile oben links: Aufgabe, Unteraufgabe, Absender, gesendet. */
const InfoRow = ({ label, value }: { label: string; value: string }) => (
    <div className="ofi-ptk-review__info-row">
        <dt>{label}</dt>
        <dd>{value || '—'}</dd>
    </div>
);

/**
 * ── «APPROVE THE FILES» (28.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * Aus «Complete the task»: die Dateien der Unteraufgabe prüfen, eine nach der
 * anderen (vor/zurück, auch mit den Pfeiltasten), mit Vergrösserung und
 * Herunterladen. Rechts neben der Datei oben Aufgabe, Unteraufgabe, wer die
 * Datei geschickt hat und wann; darunter die Freigabe-Checkliste und eine Notiz.
 *
 * Unten EIN Knopf: solange nicht alles abgehakt ist «Request revision»
 * (zurück in Arbeit, mit der Notiz — schliesst beide Fenster), danach
 * «Approve»: die Dateien gelten als freigegeben, zurück zu «Complete the
 * task» — abgeschlossen wird erst dort mit «Complete» (28.09.2026).
 */
export const FileReviewDialog = ({
    task,
    subtask,
    code,
    actions,
    initialTicked,
    initialNote,
    onClose,
    onApproved,
    onRevisionSent,
}: {
    task: ProductionTask;
    subtask: TaskSubtask;
    /** Das Kürzel der Unteraufgabe, z. B. «M-01.2». */
    code: string;
    actions: SubtaskActions;
    /** Beim erneuten Öffnen: was schon abgehakt und notiert war. */
    initialTicked?: ReadonlySet<string>;
    initialNote?: string;
    onClose: () => void;
    /** «Approve»: Häkchen und Notiz gehen an «Complete the task» zurück. */
    onApproved: (ticked: ReadonlySet<string>, note: string) => void;
    /** Zur Überarbeitung zurückgegeben — das Fenster darunter schliesst mit. */
    onRevisionSent: () => void;
}) => {
    /* Je Datei eine Seite (28.09.2026: Fassungen) — vor/zurück blättert durch die Dateien,
       die Fassungen einer Datei wählt man oben (anfangs die aktuelle). */
    const groups = fileGroups(subtask.files);
    const files = groups.map((group) => group.latest);
    const [index, setIndex] = useState(0);
    const [chosenVersion, setChosenVersion] = useState<Record<string, string>>({});
    const [zoomStep, setZoomStep] = useState(FIT);
    const [ticked, setTicked] = useState<ReadonlySet<string>>(() => new Set(initialTicked ?? []));
    const [note, setNote] = useState(initialNote ?? '');
    const [saving, setSaving] = useState(false);
    const [blob, setBlob] = useState<Blob | null>(null);
    const [blobFailed, setBlobFailed] = useState(false);
    const [areaWidth, setAreaWidth] = useState(0);
    const areaRef = useRef<HTMLDivElement>(null);    // Jede Datei kommt nur einmal über das Netz, solange das Fenster offen ist.
    const blobs = useRef(new Map<string, Promise<Blob>>());

    const group = groups[Math.min(index, groups.length - 1)];
    // Alle Fassungen der gezeigten Datei, neueste zuerst — und die gewählte (sonst die aktuelle).
    const versions = group ? [group.latest, ...group.older] : [];
    const groupKey = group ? group.latest.groupId || group.latest.id : '';
    const file: TaskSubtaskFile | undefined = versions.find((entry) => entry.id === chosenVersion[groupKey]) ?? group?.latest;
    const isLatest = Boolean(file && group && file.id === group.latest.id);
    // Verlauf: Fassungen und Rückgaben nach Datum; die letzte Rückgabe oben; worauf die gezeigte Fassung antwortet.
    const timeline = reviewTimeline(subtask);
    const lastRequest = lastRevisionRequest(timeline);
    const fileAnswers = file
        ? (timeline.find((entry) => entry.kind === 'upload' && entry.file.id === file.id) as Extract<ReviewEntry, { kind: 'upload' }> | undefined)?.answers ?? null
        : null;
    /** Eine bestimmte Fassung zeigen — aus dem Verlauf oder dem Hinweis der Rückgabe. */
    const openVersion = (target: TaskSubtaskFile) => {
        const key = target.groupId || target.id;
        const at = groups.findIndex((entry) => (entry.latest.groupId || entry.latest.id) === key);
        if (at < 0) return;
        setIndex(at);
        setChosenVersion((current) => ({ ...current, [key]: target.id }));
    };
    const checklist = subtask.approvalChecklist;
    const allTicked = checklist.every((item) => ticked.has(item.id));
    const documentOk = !subtask.requiresDocument || hasSubtaskDocument(subtask);
    const zoom = ZOOMS[zoomStep];

    const blobOf = useCallback((entry: TaskSubtaskFile): Promise<Blob> => {
        let known = blobs.current.get(entry.id);
        if (!known) {
            known = actions.loadFile(task, subtask, entry);
            // Ein Fehler bleibt nicht liegen — beim nächsten Mal wieder versuchen.
            known.catch(() => blobs.current.delete(entry.id));
            blobs.current.set(entry.id, known);
        }
        return known;
    }, [actions, task, subtask]);

    useEffect(() => {
        if (!file) return;
        let alive = true;
        setBlob(null);
        setBlobFailed(false);
        blobOf(file).then((value) => { if (alive) setBlob(value); }, () => { if (alive) setBlobFailed(true); });
        return () => { alive = false; };
    }, [file, blobOf]);

    // Die Breite der Fläche — 100 % heisst «so breit wie sie».
    useEffect(() => {
        const area = areaRef.current;
        if (!area) return;
        const measure = () => setAreaWidth(Math.max(0, area.clientWidth - 32));
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(area);
        return () => observer.disconnect();
    }, []);

    const go = useCallback((offset: -1 | 1) => {
        setIndex((current) => Math.min(files.length - 1, Math.max(0, current + offset)));
    }, [files.length]);

    // Pfeiltasten blättern — nicht, während man in der Notiz schreibt.
    useEffect(() => {
        const onKey = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.closest('textarea, input')) return;
            if (event.key === 'ArrowLeft') go(-1);
            if (event.key === 'ArrowRight') go(1);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [go]);

    // Ein neuer Punkt der Checkliste — sofort an der Unteraufgabe gespeichert (28.09.2026).
    const [newItem, setNewItem] = useState('');
    const [addingItem, setAddingItem] = useState(false);
    const addItem = async () => {
        const clean = newItem.replace(/\s+/g, ' ').trim();
        if (!clean || addingItem) return;
        setAddingItem(true);
        const added = await actions.addChecklistItem(task, subtask, clean);
        setAddingItem(false);
        if (added) setNewItem('');
    };

    const toggleTick = (id: string) =>
        setTicked((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });

    const download = async () => {
        if (!file) return;
        try {
            const url = URL.createObjectURL(await blobOf(file));
            const link = document.createElement('a');
            link.href = url;
            link.download = file.name;
            document.body.appendChild(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch {
            toast.error(t('productionTasks.review.failed'));
        }
    };

    const submit = async () => {
        if (saving) return;
        // Freigeben schliesst noch nicht ab — das tut «Complete» im Fenster darunter.
        if (allTicked) {
            if (documentOk) onApproved(ticked, note);
            return;
        }
        setSaving(true);
        const sent = await actions.requestRevision(task, subtask, note);
        setSaving(false);
        if (sent) onRevisionSent();
    };

    return (
        <PopupDialog
            closeOnBackdrop={false}
            open
            onClose={onClose}
            title={t('productionTasks.review.title')}
            subtitle={`${code} · ${subtask.name}`}
            icon={<FileSearch size={18} />}
            width={1240}
            z={800}
            bodyClassName="ofi-ptk-review__body"
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('productionTasks.actions.cancel')}</PopupButton>
                    {allTicked ? (
                        <PopupButton variant="primary" disabled={!documentOk} icon={<Check size={15} />} onClick={() => void submit()}>
                            {t('productionTasks.review.approve')}
                        </PopupButton>
                    ) : (
                        <PopupButton variant="danger" loading={saving} icon={<RotateCcw size={15} />} onClick={() => void submit()}>
                            {t('productionTasks.review.revision')}
                        </PopupButton>
                    )}
                </PopupActions>
            )}
        >
            <div className="ofi-ptk-pop ofi-ptk-review">
                <section className="ofi-ptk-review__viewer">
                    <div className="ofi-ptk-review__toolbar">
                        <span className="ofi-ptk-review__nav">
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn ofi-nosize"
                                disabled={index <= 0}
                                title={t('productionTasks.review.previous')}
                                aria-label={t('productionTasks.review.previous')}
                                onClick={() => go(-1)}
                            >
                                <ChevronLeft aria-hidden />
                            </button>
                            <span className="ofi-ptk-review__count">{files.length ? `${index + 1} / ${files.length}` : '0 / 0'}</span>
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn ofi-nosize"
                                disabled={index >= files.length - 1}
                                title={t('productionTasks.review.next')}
                                aria-label={t('productionTasks.review.next')}
                                onClick={() => go(1)}
                            >
                                <ChevronRight aria-hidden />
                            </button>
                        </span>
                        <span className="ofi-ptk-review__name" title={file?.name}>{file?.name ?? ''}</span>
                        {/* Die Fassungen dieser Datei (28.09.2026): neueste zuerst, die aktuelle vorgewählt. */}
                        {versions.length > 1 && (
                            // Die Fassungen als Auswahlliste (28.09.2026) — neueste zuerst, mit Datum und Absender.
                            <select
                                className="ofi-ptk-input ofi-ptk-review__versionselect"
                                aria-label={t('productionTasks.review.versions')}
                                value={file?.id ?? ''}
                                onChange={(event) => setChosenVersion((current) => ({ ...current, [groupKey]: event.target.value }))}
                            >
                                {versions.map((entry, position) => (
                                    <option key={entry.id} value={entry.id}>
                                        {[
                                            t('productionTasks.files.versionShort', { version: entry.version || 1 }),
                                            formatDateTime(entry.uploadedAt),
                                            entry.uploadedByName ?? '',
                                            position === 0 ? t('productionTasks.review.currentShort') : '',
                                        ].filter(Boolean).join(' · ')}
                                    </option>
                                ))}
                            </select>
                        )}
                        <span className="ofi-ptk-review__zoom">
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn ofi-nosize"
                                disabled={zoomStep <= 0}
                                title={t('productionTasks.review.zoomOut')}
                                aria-label={t('productionTasks.review.zoomOut')}
                                onClick={() => setZoomStep((step) => Math.max(0, step - 1))}
                            >
                                <ZoomOut aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="ofi-ptk-review__zoomlabel ofi-nosize"
                                title={t('productionTasks.review.zoomFit')}
                                onClick={() => setZoomStep(FIT)}
                            >
                                {`${Math.round(zoom * 100)}%`}
                            </button>
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn ofi-nosize"
                                disabled={zoomStep >= ZOOMS.length - 1}
                                title={t('productionTasks.review.zoomIn')}
                                aria-label={t('productionTasks.review.zoomIn')}
                                onClick={() => setZoomStep((step) => Math.min(ZOOMS.length - 1, step + 1))}
                            >
                                <ZoomIn aria-hidden />
                            </button>
                            <button
                                type="button"
                                className="ofi-ptk-toolbtn ofi-nosize"
                                disabled={!file}
                                title={t('productionTasks.review.download')}
                                aria-label={t('productionTasks.review.download')}
                                onClick={() => void download()}
                            >
                                <Download aria-hidden />
                            </button>
                        </span>
                    </div>
                    {/* Eine frühere Fassung ist offen — deutlich sagen, welche die aktuelle ist. */}
                    {file && group && !isLatest && (
                        <div className="ofi-ptk-review__olderbar" role="status">
                            <History aria-hidden />
                            <span>{t('productionTasks.review.olderNotice', { version: file.version || 1, latest: group.latest.version || 1 })}</span>
                            <button
                                type="button"
                                className="ofi-ptk-btn is-small ofi-nosize"
                                onClick={() => setChosenVersion((current) => ({ ...current, [groupKey]: group.latest.id }))}
                            >
                                {t('productionTasks.review.showLatest')}
                            </button>
                        </div>
                    )}
                    <div ref={areaRef} className="ofi-ptk-review__area">
                        {!file && <p className="ofi-ptk-review__state">{t('productionTasks.files.none')}</p>}
                        {file && blobFailed && <p className="ofi-ptk-review__state">{t('productionTasks.review.failed')}</p>}
                        {file && !blob && !blobFailed && (
                            <p className="ofi-ptk-review__state"><Loader2 className="is-spinning" aria-hidden />{t('productionTasks.review.loading')}</p>
                        )}
                        {file && blob && isPdf(file) && <PdfPages blob={blob} width={areaWidth * zoom} />}
                        {file && blob && isImage(file) && <ImageView blob={blob} width={areaWidth * zoom} name={file.name} />}
                    </div>
                </section>

                <aside className="ofi-ptk-review__side">
                    {/* Zur Überarbeitung zurückgegeben (28.09.2026): wer, wann, was — und welche
                        Fassung(en) darauf kamen; ein Klick öffnet sie. */}
                    {lastRequest && (
                        <section className="ofi-ptk-review__request" role="status">
                            <b className="ofi-ptk-review__request-title">
                                <RotateCcw aria-hidden />
                                {t('productionTasks.review.requestTitle', {
                                    name: lastRequest.request.byName ?? '—',
                                    when: formatDateTime(lastRequest.at),
                                })}
                            </b>
                            {lastRequest.request.note && <q>{lastRequest.request.note}</q>}
                            <span className="ofi-ptk-review__request-answer">
                                {lastRequest.revised.length ? (
                                    <>
                                        {t('productionTasks.review.revisedBy')}
                                        {lastRequest.revised.map((entry) => (
                                            <button
                                                key={entry.id}
                                                type="button"
                                                className="ofi-ptk-review__filelink ofi-nosize"
                                                onClick={() => openVersion(entry)}
                                            >
                                                {entry.name} · {t('productionTasks.files.versionShort', { version: entry.version || 1 })} · {formatDateTime(entry.uploadedAt)}
                                            </button>
                                        ))}
                                    </>
                                ) : t('productionTasks.review.notRevisedYet')}
                            </span>
                        </section>
                    )}

                    <dl className="ofi-ptk-review__info">
                        <InfoRow label={t('productionTasks.review.task')} value={`${task.code} · ${task.name}`} />
                        <InfoRow label={t('productionTasks.review.subtask')} value={`${code} · ${subtask.name}`} />
                        <InfoRow label={t('productionTasks.review.sender')} value={file?.uploadedByName ?? ''} />
                        <InfoRow label={t('productionTasks.review.sent')} value={formatDateTime(file?.uploadedAt ?? null)} />
                        {file && versions.length > 1 && (
                            <InfoRow
                                label={t('productionTasks.review.version')}
                                value={t(isLatest ? 'productionTasks.review.versionCurrent' : 'productionTasks.review.versionOlder', {
                                    version: file.version || 1,
                                    count: versions.length,
                                })}
                            />
                        )}
                        {/* Die Notiz der Fassung (28.09.2026): was sich geändert hat. */}
                        {file?.revisionNote && (
                            <InfoRow label={t('productionTasks.review.revisionNote')} value={file.revisionNote} />
                        )}
                        {/* Diese Fassung kam auf eine Rückgabe — auf welche. */}
                        {fileAnswers && (
                            <InfoRow
                                label={t('productionTasks.review.answers')}
                                value={t('productionTasks.review.answersValue', { when: formatDateTime(fileAnswers.at), name: fileAnswers.byName ?? '—' })}
                            />
                        )}
                    </dl>

                    <section className="ofi-ptk-complete__block">
                        <h3 className="ofi-ptk-complete__label ofi-ptk-review__label">
                            <ClipboardCheck aria-hidden />
                            {t('productionTasks.complete.checklistLabel')}
                            {checklist.length > 0 && <em>{`${checklist.filter((item) => ticked.has(item.id)).length} / ${checklist.length}`}</em>}
                        </h3>
                        {checklist.length ? (
                            <ul className="ofi-ptk-checklist ofi-ptk-apticks">
                                {checklist.map((item) => (
                                    <li key={item.id}>
                                        <label className="ofi-ptk-flag ofi-ptk-aptick">
                                            <input
                                                type="checkbox"
                                                className="ofi-ptk-check"
                                                checked={ticked.has(item.id)}
                                                onChange={() => toggleTick(item.id)}
                                            />
                                            <span>{item.text}</span>
                                        </label>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="ofi-ptk-field__hint">{t('productionTasks.review.noChecklist')}</p>
                        )}
                        {/* Die Verwaltung ergänzt die Checkliste beim Prüfen (28.09.2026) — gespeichert
                            an der Unteraufgabe; der neue Punkt ist noch nicht abgehakt. */}
                        {subtask.requiresApproval && checklist.length < TASK_LIMITS.checklistItems && (
                            <div className="ofi-ptk-subedit__row is-new ofi-ptk-review__additem">
                                <span className="ofi-ptk-subedit__num" aria-hidden><Plus /></span>
                                <input
                                    className="ofi-ptk-input"
                                    value={newItem}
                                    maxLength={TASK_LIMITS.checklistItemText}
                                    disabled={addingItem}
                                    aria-label={t('productionTasks.review.addItem')}
                                    placeholder={t('productionTasks.review.addItemPlaceholder')}
                                    onChange={(event) => setNewItem(event.target.value)}
                                    onKeyDown={(event) => {
                                        if (event.key !== 'Enter') return;
                                        event.preventDefault();
                                        void addItem();
                                    }}
                                />
                                <button
                                    type="button"
                                    className="ofi-ptk-btn is-small ofi-nosize"
                                    disabled={addingItem || !newItem.trim()}
                                    onClick={() => void addItem()}
                                >
                                    {addingItem ? <Loader2 className="is-spinning" aria-hidden /> : t('productionTasks.subtask.checklistAddItem')}
                                </button>
                            </div>
                        )}
                        {!allTicked && <span className="ofi-ptk-field__hint">{t('productionTasks.review.tickAll')}</span>}
                    </section>

                    {/* Die Standards der Dokumente (01.10.2026) — nach Checkliste und neuem Punkt. */}
                    {(subtask.documentStandards || subtask.documentStandardsFile) && (
                        <section className="ofi-ptk-complete__block">
                            <h3 className="ofi-ptk-complete__label ofi-ptk-review__label">
                                <ScrollText aria-hidden />
                                {t('productionTasks.review.standards')}
                            </h3>
                            {/* Das PDF der Standards (01.10.2026) — ein Klick öffnet es. */}
                            {subtask.documentStandardsFile && (
                                <span className="ofi-ptk-filechip ofi-ptk-review__standardspdf">
                                    <button
                                        type="button"
                                        className="ofi-ptk-filechip__open ofi-nosize"
                                        title={t('productionTasks.files.open', { name: subtask.documentStandardsFile.name })}
                                        onClick={() => {
                                            const standards = subtask.documentStandardsFile;
                                            if (standards) void openBlob(() => productionTasksApi.standardsFile(standards), (error) => productionTaskErrorText(error));
                                        }}
                                    >
                                        <FileGlyph type="application/pdf" />
                                        <span className="ofi-ptk-filechip__text">
                                            <b><span className="ofi-ptk-filechip__name">{subtask.documentStandardsFile.name}</span></b>
                                            <small>{t('productionTasks.subtask.standardsPdf')}</small>
                                        </span>
                                    </button>
                                </span>
                            )}
                            {subtask.documentStandards && <p className="ofi-ptk-review__standards">{subtask.documentStandards}</p>}
                            {/* Darunter die KI-Prüfung DIESER Datei (01.10.2026) — ihr Bericht auf Knopfdruck. */}
                            {file && <AiAnalysisEntry key={file.id} task={task} subtask={subtask} file={file} actions={actions} />}
                        </section>
                    )}

                    {/* Der Verlauf (28.09.2026): Fassungen und Rückgaben nach Datum, älteste zuerst.
                        Eine Fassung öffnet sich mit einem Klick. */}
                    {timeline.length > 1 && (
                        <section className="ofi-ptk-complete__block">
                            <h3 className="ofi-ptk-complete__label ofi-ptk-review__label">
                                <History aria-hidden />
                                {t('productionTasks.review.history')}
                            </h3>
                            <ol className="ofi-ptk-review__timeline">
                                {timeline.map((entry) => (entry.kind === 'request' ? (
                                    <li key={`r-${entry.at}`} className="is-request">
                                        <span className="ofi-ptk-review__when">{formatDateTime(entry.at)}</span>
                                        <span>
                                            <b>{t('productionTasks.review.historyRequest', { name: entry.request.byName ?? '—' })}</b>
                                            {entry.request.note && <q>{entry.request.note}</q>}
                                        </span>
                                    </li>
                                ) : (
                                    <li key={entry.file.id} className={`is-upload ${entry.file.id === file?.id ? 'is-shown' : ''}`}>
                                        <span className="ofi-ptk-review__when">{formatDateTime(entry.at)}</span>
                                        <button type="button" className="ofi-ptk-review__filelink ofi-nosize" onClick={() => openVersion(entry.file)}>
                                            <b>
                                                {entry.file.name} · {t('productionTasks.files.versionShort', { version: entry.file.version || 1 })}
                                                {entry.answers && <span className="ofi-ptk-review__revisedtag">{t('productionTasks.review.revisedTag')}</span>}
                                            </b>
                                            <small>{entry.file.uploadedByName ?? ''}</small>
                                            {entry.file.revisionNote && <q>{entry.file.revisionNote}</q>}
                                        </button>
                                    </li>
                                )))}
                            </ol>
                        </section>
                    )}

                    {/* Die Notiz: eine feste, kleine Höhe (01.10.2026: «too big») — ohne Ziehgriff. */}
                    <label className="ofi-ptk-complete__block ofi-ptk-review__noteblock">
                        <span className="ofi-ptk-complete__label">
                            {t('productionTasks.complete.note')} <em>{t('productionTasks.complete.optional')}</em>
                        </span>
                        <textarea
                            className="ofi-ptk-input ofi-ptk-complete__note ofi-ptk-review__note"
                            rows={6}
                            maxLength={500}
                            value={note}
                            placeholder={allTicked ? undefined : t('productionTasks.review.notePlaceholder')}
                            onChange={(event) => setNote(event.target.value)}
                        />
                    </label>
                </aside>
            </div>
        </PopupDialog>
    );
};
