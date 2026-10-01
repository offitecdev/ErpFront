import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { AlignLeft, ArrowLeft, ArrowUp, Eraser, FileSpreadsheet, FileText, Trash2, Zap } from 'lucide-react';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import {
    clipboardFromEvent, clipboardToImportFiles, fileToBase64, isImageFile, isPdfFile, isSheetFile,
    isSupportedImportFile, isTextFile, pasteModifierKey, sheetFileToText,
} from '@/pages/inventory/import/importTemplate';
import type { BomTableAiResult } from '@/types/productionBom';
import '@/styles/modules/productionBom.css';

import { annotatedFromFile, renderAnnotated, type AnnotatedImage } from './columnAiImage';
import {
    changesOf, planRows, type CellPlan, type TableAiChange, type TableAiColumn, type TableAiRow,
} from './tableAiPlan';

type Phase = 'source' | 'reading' | 'review';

const MAX_IMAGES = 6;

const formatSize = (bytes: number) => (bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`);

/**
 * ── «TABLOYU YAPAY ZEKÂ İLE DOLDUR» (27.09.2026, Vorgabe Samet) ──────────────
 *
 * «Üretim siparişlerinde yeni sütun ekleme olmayacak, direkt şablon
 *  uygulanacak … bizim satırlar belli; biz prompt olarak alt alta
 *  satırlarımızı ve sipariş fiyatlarını atacağız … şablondaki boş [hücreler]
 *  attığımız PDF, görsel şu bu ile otomatik eşleşip dolduracak; boşsa boş
 *  bırakacak — fiyat talebinde de böyle.»
 *
 * Ersetzt «Sütun ekle» + die KI je eigener Spalte. Drei Zustände:
 *
 *   QUELLE   ein Beleg des Lieferanten — PDF, Excel, Bilder (eine rote
 *            Linie trennt Zeilen, wie bisher) —, abgelegt in einer gläsernen
 *            Ablage oder mit Strg+V eingefügt; kopierte Zeilen werden zur
 *            Karte «Eingefügte Zeilen». Kein Textfeld mehr (Samet 27.09.2026:
 *            «bu satır alt alta yazı olmayacak … belge sürükleme olması lazım»).
 *   LESEN    der Server schreibt Bilder als Tabelle ab und ordnet jede Zeile
 *            der Bestellung der passenden Zeile des Belegs zu.
 *   PRÜFEN   je Zeile die gefundenen Werte; geschrieben werden nur LEERE
 *            Zellen — gefüllte nur, wenn man es ausdrücklich will.
 *
 * Gespeichert wird hier nichts: die Werte gehen an die Tabelle der Seite,
 * gespeichert wird mit «Kaydet» wie immer.
 */
export const BomTableAiDialog = ({
    purchaseOrderId,
    columns,
    rows,
    initialPrompt,
    initialFiles,
    onApply,
    onClose,
}: {
    purchaseOrderId: string;
    /** Die Spalten der Vorlage, die gefüllt werden dürfen (ohne ERP-Code, Name, Menge). */
    columns: TableAiColumn[];
    rows: TableAiRow[];
    /** Auf der Seite eingefügter Text (Strg+V ausserhalb eines Feldes). */
    initialPrompt?: string;
    /** Auf der Seite eingefügte Bilder oder Dateien. */
    initialFiles?: File[];
    onApply: (changes: TableAiChange[]) => void;
    onClose: () => void;
}) => {
    const [phase, setPhase] = useState<Phase>('source');
    const [prompt, setPrompt] = useState(initialPrompt ?? '');
    const [images, setImages] = useState<AnnotatedImage[]>(() => (initialFiles ?? [])
        .filter(isImageFile)
        .slice(0, MAX_IMAGES)
        .map(annotatedFromFile));
    const [documentFile, setDocumentFile] = useState<File | null>(() => (initialFiles ?? [])
        .find((file) => isPdfFile(file) || isSheetFile(file)) ?? null);
    const [error, setError] = useState<string | null>(null);
    const [elapsed, setElapsed] = useState(0);
    const [result, setResult] = useState<BomTableAiResult | null>(null);
    const [enabled, setEnabled] = useState<Set<number>>(new Set());
    const [overwrite, setOverwrite] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);
    const fileRef = useRef<HTMLInputElement>(null);
    const imagesRef = useRef<AnnotatedImage[]>([]);

    useEffect(() => { imagesRef.current = images; }, [images]);
    // Die Vorschau-Adressen wieder freigeben, wenn das Fenster geht.
    useEffect(() => () => { imagesRef.current.forEach((image) => URL.revokeObjectURL(image.url)); }, []);

    /* Die Uhr beim Warten: ein Bild wird erst als Tabelle abgeschrieben, das
       dauert. Die Sekunden sind das Einzige, was sich ehrlich messen lässt. */
    useEffect(() => {
        if (phase !== 'reading') return undefined;
        const started = Date.now();
        const clock = window.setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(clock);
    }, [phase]);

    const addFiles = async (files: File[]) => {
        const supported = files.filter(isSupportedImportFile);
        if (!supported.length) return;
        setError(null);
        setResult(null);
        const pictures = supported.filter(isImageFile);
        if (pictures.length) setImages((current) => [...current, ...pictures.map(annotatedFromFile)].slice(0, MAX_IMAGES));
        const document = supported.find((file) => isPdfFile(file) || isSheetFile(file));
        if (document) setDocumentFile(document);
        // Eingefügte Tabellenzeilen und eingefügter Text gehören in das Textfeld.
        const texts = supported.filter(isTextFile);
        if (texts.length) {
            const pasted = (await Promise.all(texts.map((file) => file.text()))).join('\n').trim();
            if (pasted) setPrompt((current) => (current.trim() ? `${current.replace(/\s+$/, '')}\n${pasted}` : pasted));
        }
    };

    /* Strg+V: ein Bildschirmfoto, eine Datei oder kopierte Zeilen kommen als
       Quelle dazu — kopierter Text erscheint als Karte «Eingefügte Zeilen». */
    useEffect(() => {
        if (phase !== 'source') return undefined;
        const onPaste = (event: ClipboardEvent) => {
            if (!event.clipboardData) return;
            const content = clipboardFromEvent(event.clipboardData);
            const files = clipboardToImportFiles(content);
            if (!files.length) return;
            event.preventDefault();
            void addFiles(files);
        };
        window.addEventListener('paste', onPaste);
        return () => window.removeEventListener('paste', onPaste);
    });

    const addLine = (id: string, event: MouseEvent<HTMLDivElement>) => {
        const box = event.currentTarget.getBoundingClientRect();
        const ratio = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        setImages((current) => current.map((image) => (image.id === id ? { ...image, lines: [...image.lines, ratio].sort((a, b) => a - b) } : image)));
    };
    const removeLine = (id: string, index: number) =>
        setImages((current) => current.map((image) => (image.id === id ? { ...image, lines: image.lines.filter((_, at) => at !== index) } : image)));
    const removeImage = (id: string) => setImages((current) => current.filter((image) => {
        if (image.id === id) URL.revokeObjectURL(image.url);
        return image.id !== id;
    }));

    const hasSource = Boolean(prompt.trim() || images.length || documentFile);

    const send = async () => {
        if (!hasSource) {
            setError(t('productionBom.ai.noSource'));
            return;
        }
        setError(null);
        setElapsed(0);
        setPhase('reading');
        try {
            /* Erst die Sitzung auffrischen, dann der lange Aufruf — sonst läuft
               der Zugangskeks mitten im Lesen ab und alles geht zweimal hoch
               (dieselbe Vorsicht wie beim Beleg-Import). */
            await purchaseOrdersApi.aiStatus().catch(() => undefined);
            const payload: Parameters<typeof productionBomApi.fillTable>[1] = {
                columns: columns.map(({ key, name, type, label }) => ({ key, name, type, label })),
                language: (i18n.resolvedLanguage || i18n.language || 'tr').slice(0, 2),
                ...(prompt.trim() ? { prompt: prompt.trim() } : {}),
            };
            if (images.length) payload.images = await Promise.all(images.map(renderAnnotated));
            if (documentFile && isSheetFile(documentFile)) {
                payload.text = await sheetFileToText(documentFile);
            } else if (documentFile) {
                payload.data = await fileToBase64(documentFile);
                payload.fileName = documentFile.name;
                payload.mimeType = documentFile.type || 'application/pdf';
            }
            const answer = await productionBomApi.fillTable(purchaseOrderId, payload);
            const plans = planRows(columns, rows, answer);
            setResult(answer);
            setOverwrite(false);
            setEnabled(new Set(plans.filter((plan) => plan.fills + plan.conflicts > 0).map((plan) => plan.row.index)));
            setPhase('review');
        } catch (failure) {
            setError(productionBomErrorText(failure));
            setPhase('source');
        }
    };

    const plans = useMemo(() => (result ? planRows(columns, rows, result) : []), [columns, rows, result]);
    const changes = useMemo(() => changesOf(plans, enabled, overwrite), [plans, enabled, overwrite]);
    const cellCount = changes.reduce((sum, change) => sum + Object.keys(change.values).length, 0);
    const matched = plans.filter((plan) => plan.matched).length;
    const fillTotal = plans.reduce((sum, plan) => sum + plan.fills, 0);
    const conflictTotal = plans.reduce((sum, plan) => sum + plan.conflicts, 0);

    const toggleRow = (index: number) => setEnabled((current) => {
        const next = new Set(current);
        if (next.has(index)) next.delete(index); else next.add(index);
        return next;
    });

    const apply = () => {
        onApply(changes);
        onClose();
    };

    const usageText = result ? (result.usage.estimatedUsd !== null
        ? t('productionBom.ai.usageCost', {
            model: result.model,
            tokens: result.usage.totalTokens.toLocaleString('de-CH'),
            usd: result.usage.estimatedUsd.toFixed(4),
        })
        : t('productionBom.ai.usage', { model: result.model, tokens: result.usage.totalTokens.toLocaleString('de-CH') })) : '';

    /* ── Eine Zelle der Prüfung ─────────────────────────────────────────── */
    const renderCell = (cell: CellPlan) => {
        switch (cell.kind) {
            case 'fill':
                return <b className="ofi-bom-fill__new">{cell.found}</b>;
            case 'conflict':
                return overwrite ? (
                    <span className="ofi-bom-fill__swap">
                        <s>{cell.current}</s>
                        <b className="ofi-bom-fill__new">{cell.found}</b>
                    </span>
                ) : (
                    <span className="ofi-bom-fill__swap">
                        <span>{cell.current}</span>
                        <small className="ofi-bom-fill__alt">{`→ ${cell.found}`}</small>
                    </span>
                );
            case 'same':
            case 'keep':
            case 'locked':
                return cell.current ? <span>{cell.current}</span> : <i className="ofi-bom-fill__none">—</i>;
            default:
                return <i className="ofi-bom-fill__none">—</i>;
        }
    };

    const body = (() => {
        if (phase === 'reading') {
            return (
                <div className="ofi-bom-fill__reading" role="status">
                    {/* Ein Blatt, über das ein blaues Glasband läuft; die Zeilen
                        leuchten nacheinander auf, wenn das Band sie erreicht. */}
                    <span className="ofi-bom-scan" aria-hidden>
                        <i className="ofi-bom-scan__row" />
                        <i className="ofi-bom-scan__row" />
                        <i className="ofi-bom-scan__row" />
                        <i className="ofi-bom-scan__row" />
                        <i className="ofi-bom-scan__row" />
                        <i className="ofi-bom-scan__band" />
                    </span>
                    <b>{t('productionBom.ai.reading')}</b>
                    <small>{images.length ? t('productionBom.ai.readingNote') : ' '}</small>
                    {elapsed >= 5 && <small className="ofi-bom-fill__clock">{t('productionBom.ai.elapsed', { seconds: elapsed })}</small>}
                </div>
            );
        }

        if (phase === 'review' && result) {
            return (
                <>
                    <div className="ofi-bom-fill__summary">
                        <span className={matched ? 'is-ok' : 'is-warn'}>{t('productionBom.ai.summary', { matched, total: rows.length })}</span>
                        <span>{fillTotal ? t('productionBom.ai.toFill', { count: fillTotal }) : t('productionBom.ai.nothingToFill')}</span>
                        <small>{usageText}</small>
                    </div>
                    <div className="ofi-bom-ai__result ofi-bom-fill__result">
                        <table data-unstyled-table>
                            <thead>
                                <tr>
                                    <th className="is-check" aria-label={t('productionBom.ai.includeRow')} />
                                    <th className="is-num">#</th>
                                    <th>{t('productionBom.columns.name')}</th>
                                    {columns.map((column) => (
                                        <th key={column.key} className={column.label || column.type === 'number' ? 'is-num' : undefined}>{column.name}</th>
                                    ))}
                                    <th>{t('productionBom.ai.evidence')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {plans.map((plan) => {
                                    const writable = plan.fills + plan.conflicts > 0;
                                    const on = enabled.has(plan.row.index);
                                    return (
                                        <tr key={plan.row.index} className={!plan.matched ? 'is-empty' : (writable && !on ? 'is-off' : undefined)}>
                                            <td className="is-check">
                                                <input
                                                    type="checkbox"
                                                    checked={on}
                                                    disabled={!writable}
                                                    onChange={() => toggleRow(plan.row.index)}
                                                    aria-label={t('productionBom.ai.includeRow')}
                                                />
                                            </td>
                                            <td className="is-num">{plan.row.index + 1}</td>
                                            <td className="is-name">
                                                {plan.row.name}
                                                <small>{plan.row.quantity}</small>
                                            </td>
                                            {columns.map((column) => (
                                                <td key={column.key} className={column.label || column.type === 'number' ? 'is-num' : undefined}>
                                                    {renderCell(plan.cells[column.key]!)}
                                                </td>
                                            ))}
                                            <td className="is-evidence">
                                                {plan.evidence || (!plan.matched ? <i>{t('productionBom.ai.unmatched')}</i> : '')}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </>
            );
        }

        return (
            <>
                {error && <p className="ofi-bom-fill__error" role="alert">{error}</p>}

                <section className="ofi-bom-fill__section">
                    <b className="ofi-bom-fill__label">{t('productionBom.ai.columnsTitle')}</b>
                    <div className="ofi-bom-fill__chips">
                        {columns.map((column) => {
                            const empty = rows.filter((row) => !row.locked.includes(column.key) && !(row.current[column.key] ?? '').trim()).length;
                            return (
                                <span key={column.key} className="ofi-bom-fill__chip">
                                    {column.name}
                                    <small>{t('productionBom.ai.columnEmpty', { count: empty })}</small>
                                </span>
                            );
                        })}
                    </div>
                    <small className="ofi-bom-fill__note">{t('productionBom.ai.fixedNote')}</small>
                </section>

                <section className="ofi-bom-fill__section">
                    <b className="ofi-bom-fill__label">{t('productionBom.ai.sources')}</b>
                    <input
                        ref={fileRef}
                        type="file"
                        hidden
                        multiple
                        accept="image/*,.pdf,.xlsx,.xls,.csv,.tsv,.txt"
                        onChange={(event) => { void addFiles(Array.from(event.target.files ?? [])); event.target.value = ''; }}
                    />

                    {/* Die Ablage: Glas in Akzentblau. Beim Ziehen fächern die drei
                        Blätter auf; mit einem Beleg darin wird sie zur schmalen Leiste. */}
                    <div
                        className={`ofi-bom-drop${dragging ? ' is-over' : ''}${hasSource ? ' is-compact' : ''}`}
                        role="button"
                        tabIndex={0}
                        aria-label={t('productionBom.ai.chooseFile')}
                        onClick={() => fileRef.current?.click()}
                        onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            fileRef.current?.click();
                        }}
                        onDragEnter={(event) => { event.preventDefault(); dragDepth.current += 1; setDragging(true); }}
                        onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; }}
                        onDragLeave={() => { dragDepth.current = Math.max(0, dragDepth.current - 1); if (!dragDepth.current) setDragging(false); }}
                        onDrop={(event) => {
                            event.preventDefault();
                            dragDepth.current = 0;
                            setDragging(false);
                            void addFiles(Array.from(event.dataTransfer.files ?? []));
                        }}
                    >
                        <span className="ofi-bom-drop__art" aria-hidden>
                            <i className="ofi-bom-drop__sheet is-back" />
                            <i className="ofi-bom-drop__sheet is-mid" />
                            <i className="ofi-bom-drop__sheet is-front">
                                <ArrowUp />
                            </i>
                        </span>
                        <span className="ofi-bom-drop__text">
                            <b>{dragging ? t('productionBom.ai.dropRelease') : (hasSource ? t('productionBom.ai.addMore') : t('productionBom.ai.dropTitle'))}</b>
                            <small>{t('productionBom.ai.dropHint', { keys: `${pasteModifierKey()} + V` })}</small>
                        </span>
                        <span className="ofi-bom-drop__pick">{t('productionBom.ai.chooseFile')}</span>
                    </div>

                    {prompt.trim() && (
                        <div className="ofi-bom-ai__file ofi-bom-drop__item">
                            <span className="ofi-bom-drop__badge"><AlignLeft aria-hidden /></span>
                            <b>{t('productionBom.ai.pastedText')}</b>
                            <small>{t('productionBom.ai.pastedLines', { count: prompt.trim().split(/\n+/).length })}</small>
                            <button type="button" className="ofi-bom-ai__iconbtn" aria-label={t('productionBom.common.remove')} title={t('productionBom.common.remove')} onClick={() => setPrompt('')}>
                                <Trash2 />
                            </button>
                        </div>
                    )}

                    {documentFile && (
                        <div className="ofi-bom-ai__file ofi-bom-drop__item">
                            <span className={`ofi-bom-drop__badge${isSheetFile(documentFile) ? ' is-sheet' : ''}`}>
                                {isSheetFile(documentFile) ? <FileSpreadsheet aria-hidden /> : <FileText aria-hidden />}
                            </span>
                            <b>{documentFile.name}</b>
                            <small>{formatSize(documentFile.size)}</small>
                            <button type="button" className="ofi-bom-ai__iconbtn" aria-label={t('productionBom.common.remove')} title={t('productionBom.common.remove')} onClick={() => setDocumentFile(null)}>
                                <Trash2 />
                            </button>
                        </div>
                    )}

                    {images.length > 0 && (
                        <>
                            <p className="ofi-bom-ai__drawhint">{t('productionBom.ai.drawHint')}</p>
                            <div className="ofi-bom-ai__images">
                                {images.map((image) => (
                                    <figure key={image.id} className="ofi-bom-ai__image">
                                        <div
                                            className="ofi-bom-ai__canvas"
                                            role="button"
                                            tabIndex={0}
                                            aria-label={t('productionBom.ai.drawHint')}
                                            onClick={(event) => addLine(image.id, event)}
                                        >
                                            <img src={image.url} alt={image.name} draggable={false} />
                                            {image.lines.map((ratio, index) => (
                                                <button
                                                    key={`${ratio}-${index}`}
                                                    type="button"
                                                    className="ofi-bom-ai__line"
                                                    style={{ top: `${ratio * 100}%` }}
                                                    title={t('productionBom.common.remove')}
                                                    aria-label={t('productionBom.common.remove')}
                                                    onClick={(event) => { event.stopPropagation(); removeLine(image.id, index); }}
                                                />
                                            ))}
                                        </div>
                                        <figcaption>
                                            <span>{image.name}</span>
                                            <small>{t('productionBom.ai.lineCount', { count: image.lines.length })}</small>
                                            {image.lines.length > 0 && (
                                                <button
                                                    type="button"
                                                    className="ofi-bom-ai__iconbtn"
                                                    title={t('productionBom.ai.clearLines')}
                                                    aria-label={t('productionBom.ai.clearLines')}
                                                    onClick={() => setImages((current) => current.map((entry) => (entry.id === image.id ? { ...entry, lines: [] } : entry)))}
                                                >
                                                    <Eraser />
                                                </button>
                                            )}
                                            <button
                                                type="button"
                                                className="ofi-bom-ai__iconbtn"
                                                title={t('productionBom.ai.removeImage')}
                                                aria-label={t('productionBom.ai.removeImage')}
                                                onClick={() => removeImage(image.id)}
                                            >
                                                <Trash2 />
                                            </button>
                                        </figcaption>
                                    </figure>
                                ))}
                            </div>
                        </>
                    )}
                </section>
            </>
        );
    })();

    const footer = phase === 'review' ? (
        <PopupActions
            start={conflictTotal > 0 ? (
                /* Der Fuss liegt ausserhalb des Körpers — `ofi-bom-pop` bringt die Farben mit. */
                <label className="ofi-bom-pop ofi-bom-fill__overwrite">
                    <input type="checkbox" checked={overwrite} onChange={(event) => setOverwrite(event.target.checked)} />
                    {t('productionBom.ai.overwrite', { count: conflictTotal })}
                </label>
            ) : undefined}
        >
            <PopupButton icon={<ArrowLeft size={14} />} onClick={() => setPhase('source')}>{t('productionBom.common.back')}</PopupButton>
            <PopupButton variant="primary" disabled={!cellCount} onClick={apply}>
                {t('productionBom.ai.apply', { count: cellCount })}
            </PopupButton>
        </PopupActions>
    ) : (
        <PopupActions>
            <PopupButton onClick={onClose} disabled={phase === 'reading'}>{t('productionBom.common.cancel')}</PopupButton>
            <PopupButton variant="primary" loading={phase === 'reading'} disabled={!hasSource} onClick={() => void send()}>
                {t('productionBom.ai.send')}
            </PopupButton>
        </PopupActions>
    );

    const reading = phase === 'reading';
    return (
        <PopupDialog
            open
            onClose={() => { if (!reading) onClose(); }}
            closeOnBackdrop={!reading}
            closeOnEscape={!reading}
            hideClose={reading}
            title={t('productionBom.ai.title')}
            subtitle={t('productionBom.ai.subtitle')}
            icon={<Zap size={18} />}
            /* Die Prüfung wächst mit ihren Spalten, damit die Zeile des Belegs rechts sichtbar bleibt. */
            width={phase === 'review' ? Math.min(1280, 820 + columns.length * 80) : 820}
            footer={footer}
        >
            <div className="ofi-bom-pop ofi-bom-ai ofi-bom-fill">{body}</div>
        </PopupDialog>
    );
};
