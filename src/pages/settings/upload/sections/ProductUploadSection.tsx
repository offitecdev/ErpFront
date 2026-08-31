import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
    AlertTriangle,
    CheckCircle,
    Image01,
    InfoCircle,
    UploadCloud02,
} from '@/components/icons/antIconCompat';
import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import type { BulkArticleItemInput } from '@/types/inventory';
import {
    COLUMN_MAX_CHARS,
    REQUIRED_FIELDS,
    UPLOAD_FIELDS,
    isUploadFile,
    readUploadFile,
    type UploadField,
    type UploadPreview,
    type UploadRow,
} from '../productImport';

/**
 * ── PRODUKT-UPLOAD ───────────────────────────────────────────────────────────
 *
 * Die Uploadfläche des Moduls "Produkte" — der einzige Bereich, der heute
 * Inhalt hat (die übrigen Module stehen in der Liste links und zeigen den
 * leeren Hinweis). Eine Produktdatei (CSV/Excel) hinein, fertige Warenkarten
 * heraus: interne Produkt-Nr., Bezeichnung, Verkaufspreis, Kosten
 * (durchschnittlicher Stückpreis) und das Produktbild.
 *
 * DER BESTAND IST IMMER 0. Die Mengenspalte der Datei wird nicht gelesen und
 * der Server nagelt die Menge zusätzlich fest (`/inventory/articles/import`) —
 * ein Upload legt Warenkarten an, er bucht keinen Bestand ein.
 *
 * Die ganze Seite steht hinter der IT-Schleuse (Kennwort); der Ausweis der
 * Schleuse reist bei jedem Aufruf mit, sie ist also nicht bloss optisch
 * gesperrt.
 *
 * Warum in Häppchen gesendet wird: 6000 Zeilen mit eingebetteten Bildern sind
 * ein Vielfaches der 15-MB-Grenze des Servers. Die Zeilen gehen deshalb in
 * Paketen los — nach Zeilenzahl UND nach Grösse begrenzt, weil ein einzelnes
 * Bild bis 2 MB gross sein darf — und der Fortschritt läuft paketweise mit.
 *
 * Der Rahmen kommt von der Einstellungsfläche: hier stehen bewusst KEINE
 * eigenen Karten, sonst säßen Kästen in einem Kasten.
 */

type Phase = 'pick' | 'preview' | 'running' | 'done';

/** Obergrenze des Servers ist 500 Zeilen; darunter bleibt der Fortschritt fein. */
const BATCH_MAX_ROWS = 200;
/** Deutlich unter der 15-MB-Körpergrenze — Kopfzeilen und JSON-Aufschlag dazu. */
const BATCH_MAX_BYTES = 6 * 1024 * 1024;

interface FailedRow {
    sourceRow: number;
    articleCode: string;
    name: string;
    error: string;
}

interface UploadResult {
    created: number;
    updated: number;
    failures: FailedRow[];
    /** Abgebrochen: die bereits gesendeten Pakete bleiben geschrieben. */
    stopped: boolean;
}

const FIELD_LABEL: Record<UploadField, string> = {
    articleCode: 'upload.field.articleCode',
    name: 'upload.field.name',
    salePrice: 'upload.field.salePrice',
    purchasePrice: 'upload.field.purchasePrice',
    unit: 'upload.field.unit',
    image: 'upload.field.image',
};

/** Zeile → Nutzlast des Servers. Menge fehlt bewusst: sie ist dort fest 0. */
const toPayload = (row: UploadRow): BulkArticleItemInput => ({
    articleCode: row.articleCode,
    name: row.name,
    salePrice: row.salePrice,
    purchasePrice: row.purchasePrice,
    ...(row.unit ? { unit: row.unit } : {}),
    // Nur gesetzt, wenn die Bezeichnung gekürzt werden musste — dann trägt die
    // Beschreibung den vollständigen Text (siehe productImport.ts).
    ...(row.description ? { description: row.description } : {}),
    ...(row.imageUrl ? { imageUrl: row.imageUrl } : {}),
});

/* Der Server schickt zum Satzfehler einen KURZCODE mit; damit steht die
   häufige Meldung in der Sprache des Anwenders statt in der des Servers.
   Unbekannte Codes fallen auf den mitgelieferten Text zurück. */
const ROW_ERROR_KEYS: Record<string, string> = {
    VALUE_TOO_LONG: 'upload.rowError.valueTooLong',
    CODE_TAKEN: 'upload.rowError.codeTaken',
    DUPLICATE_IN_FILE: 'upload.rowError.duplicateInFile',
    WRITE_FAILED: 'upload.rowError.writeFailed',
};

const rowErrorText = (error: { error: string; code?: string }): string => {
    const key = error.code ? ROW_ERROR_KEYS[error.code] : undefined;
    return key ? t(key) : error.error;
};

/** Pakete nach Zeilenzahl UND Byte-Budget — ein grosses Bild sprengt sonst eines. */
const buildBatches = (rows: UploadRow[]): UploadRow[][] => {
    const batches: UploadRow[][] = [];
    let current: UploadRow[] = [];
    let bytes = 0;
    for (const row of rows) {
        // Grobschätzung: die Bild-Zeichenkette ist das Gewicht, der Rest ist Beiwerk.
        const size = (row.imageUrl?.length ?? 0) + row.name.length + row.articleCode.length + 120;
        if (current.length && (current.length >= BATCH_MAX_ROWS || bytes + size > BATCH_MAX_BYTES)) {
            batches.push(current);
            current = [];
            bytes = 0;
        }
        current.push(row);
        bytes += size;
    }
    if (current.length) batches.push(current);
    return batches;
};

const StatTile = ({ label, value, tone = 'plain' }: { label: string; value: number | string; tone?: 'plain' | 'warn' | 'good' }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-white/15 dark:bg-white/5">
        <div className={`text-[17px] font-semibold tabular-nums ${
            tone === 'warn' ? 'text-amber-600 dark:text-amber-400'
                : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-slate-900 dark:text-white'
        }`}>
            {value}
        </div>
        <div className="mt-0.5 text-[11.5px] leading-tight text-slate-500 dark:text-white/60">{label}</div>
    </div>
);

/** Abschnitt innerhalb der Einstellungsfläche: Linie + Überschrift, keine Karte. */
const Block = ({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) => (
    <section className="border-t border-slate-200 pt-4 first:border-t-0 first:pt-0 dark:border-white/10">
        <div className="mb-2.5 flex items-center justify-between gap-3">
            <h3 className="text-[12.5px] font-semibold text-slate-800 dark:text-white">{title}</h3>
            {action}
        </div>
        {children}
    </section>
);

export const ProductUploadSection = () => {
    const navigate = useNavigate();
    const fileInputRef = useRef<HTMLInputElement>(null);
    /* Der Abbruch wirkt ZWISCHEN den Paketen: ein laufendes Paket wird nicht
       zurückgenommen (der Server hat es bereits geschrieben). */
    const stopRef = useRef(false);

    const [phase, setPhase] = useState<Phase>('pick');
    const [reading, setReading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const [preview, setPreview] = useState<UploadPreview | null>(null);
    const [overwrite, setOverwrite] = useState(true);
    const [includeGenerated, setIncludeGenerated] = useState(true);
    const [progress, setProgress] = useState({ done: 0, total: 0 });
    const [result, setResult] = useState<UploadResult | null>(null);

    const missingColumns = useMemo(
        () => (preview ? REQUIRED_FIELDS.filter((field) => preview.mapping[field] === -1) : []),
        [preview],
    );

    /** Was tatsächlich gesendet wird — ohne die Zeilen ohne interne Referenz,
        falls die IT sie nicht anlegen lassen will. */
    const selectedRows = useMemo(
        () => (!preview ? [] : includeGenerated ? preview.rows : preview.rows.filter((row) => !row.generatedCode)),
        [preview, includeGenerated],
    );

    const reset = () => {
        stopRef.current = false;
        setPreview(null);
        setResult(null);
        setProgress({ done: 0, total: 0 });
        setPhase('pick');
    };

    const loadFile = async (file: File) => {
        if (!isUploadFile(file)) {
            toast.error(t('upload.badFileType'));
            return;
        }
        setReading(true);
        try {
            const parsed = await readUploadFile(file);
            if (!parsed.rows.length) {
                toast.error(t('upload.emptyFile'));
                return;
            }
            setPreview(parsed);
            setResult(null);
            setPhase('preview');
        } catch {
            toast.error(t('upload.parseError'));
        } finally {
            setReading(false);
        }
    };

    const onFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) void loadFile(file);
        event.target.value = '';
    };

    const onDrop = (event: DragEvent) => {
        event.preventDefault();
        setDragOver(false);
        const file = event.dataTransfer.files?.[0];
        if (file) void loadFile(file);
    };

    const start = async () => {
        if (!selectedRows.length) return;
        const batches = buildBatches(selectedRows);
        stopRef.current = false;
        setProgress({ done: 0, total: selectedRows.length });
        setPhase('running');

        let created = 0;
        let updated = 0;
        const failures: FailedRow[] = [];
        let sent = 0;
        let stopped = false;

        for (const batch of batches) {
            if (stopRef.current) {
                stopped = true;
                break;
            }
            try {
                const response = await inventoryApi.importArticles(batch.map(toPayload), { overwrite });
                created += response.createdCount - (response.updatedCount ?? 0);
                updated += response.updatedCount ?? 0;
                for (const rowError of response.errors ?? []) {
                    const row = batch[rowError.index];
                    failures.push({
                        sourceRow: row?.sourceRow ?? 0,
                        articleCode: rowError.articleCode || row?.articleCode || '',
                        name: row?.name ?? '',
                        error: rowErrorText(rowError),
                    });
                }
            } catch (error: unknown) {
                // Ein gescheitertes Paket beendet den Upload NICHT — die übrigen
                // Zeilen sollen ankommen; das Paket wird als Fehler ausgewiesen.
                const response = (error as {
                    response?: {
                        status?: number;
                        data?: { error?: string; errors?: Array<{ index: number; articleCode: string; error: string; code?: string }> };
                    };
                })?.response;
                const status = response?.status;
                /* Konnte KEINE Zeile geschrieben werden, antwortet der Server mit
                   400 UND der Begründung je Zeile (z. B. "Nummer bereits
                   vergeben", wenn ohne Überschreiben erneut hochgeladen wird).
                   Die gehört in die Liste — sonst stünde bei jeder Zeile bloss
                   "Paket nicht übertragen" und niemand wüsste, warum. */
                const rowErrors = response?.data?.errors;
                if (Array.isArray(rowErrors) && rowErrors.length) {
                    for (const rowError of rowErrors) {
                        const row = batch[rowError.index];
                        failures.push({
                            sourceRow: row?.sourceRow ?? 0,
                            articleCode: rowError.articleCode || row?.articleCode || '',
                            name: row?.name ?? '',
                            error: rowErrorText(rowError),
                        });
                    }
                } else {
                    const message = status === 403
                        ? t('upload.gateExpired')
                        : (response?.data?.error || t('upload.batchFailed'));
                    for (const row of batch) {
                        failures.push({
                            sourceRow: row.sourceRow,
                            articleCode: row.articleCode,
                            name: row.name,
                            error: message,
                        });
                    }
                }
                if (status === 403) {
                    stopped = true;
                    sent += batch.length;
                    setProgress({ done: sent, total: selectedRows.length });
                    break;
                }
            }
            sent += batch.length;
            setProgress({ done: sent, total: selectedRows.length });
        }

        setResult({ created, updated, failures, stopped });
        setPhase('done');
        if (stopped) toast.warning(t('upload.stoppedToast'));
        else if (failures.length) toast.warning(t('upload.doneWithErrorsToast', { count: failures.length }));
        else toast.success(t('upload.doneToast', { count: created + updated }));
    };

    const percent = progress.total ? Math.round((progress.done / progress.total) * 100) : 0;

    return (
        <div className="flex flex-col gap-4">
            {/* Der Bestand ist nicht verhandelbar — das steht auf jeder Stufe da. */}
            <div className="flex items-start gap-2 rounded-lg border border-sky-200 bg-sky-50/70 px-3.5 py-2.5 text-[12.5px] text-sky-900 dark:border-sky-400/25 dark:bg-sky-400/10 dark:text-sky-100">
                <InfoCircle size={15} className="mt-px shrink-0" />
                <span>{t('upload.stockNote')}</span>
            </div>

            {phase === 'pick' && (
                <Block title={t('upload.products.fileTitle')}>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={`flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-12 transition-colors ${
                            dragOver
                                ? 'border-[#272f67] bg-[#272f67]/5 dark:border-white/50 dark:bg-white/10'
                                : 'border-slate-300 hover:border-[#272f67] dark:border-white/20 dark:hover:border-white/40'
                        }`}
                    >
                        {reading ? <Spinner size="lg" className="text-[#272f67] dark:text-white" /> : <UploadCloud02 size={30} className="text-slate-400 dark:text-white/50" />}
                        <span className="text-[13.5px] font-semibold text-slate-700 dark:text-white">
                            {reading ? t('upload.reading') : t('upload.dropzone.title')}
                        </span>
                        <span className="text-[12px] text-slate-500 dark:text-white/60">{t('upload.dropzone.hint')}</span>
                    </button>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".csv,.txt,.xlsx,.xls"
                        onChange={onFileChange}
                        className="hidden"
                    />
                </Block>
            )}

            {phase === 'preview' && preview && (
                <>
                    <Block
                        title={preview.fileName}
                        action={(
                            <button
                                type="button"
                                onClick={reset}
                                className="text-[12px] font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                            >
                                {t('upload.otherFile')}
                            </button>
                        )}
                    >
                        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
                            <StatTile label={t('upload.stats.rows')} value={preview.rows.length} tone="good" />
                            <StatTile label={t('upload.stats.withImage')} value={preview.withImage} />
                            <StatTile label={t('upload.stats.generatedCodes')} value={preview.generatedCodes} tone={preview.generatedCodes ? 'warn' : 'plain'} />
                            <StatTile label={t('upload.stats.duplicates')} value={preview.droppedDuplicate} tone={preview.droppedDuplicate ? 'warn' : 'plain'} />
                            <StatTile label={t('upload.stats.imagesNotExported')} value={preview.imagesNotExported} tone={preview.imagesNotExported ? 'warn' : 'plain'} />
                            <StatTile label={t('upload.stats.namesShortened')} value={preview.namesShortened} tone={preview.namesShortened ? 'warn' : 'plain'} />
                        </div>
                        {/* Kürzen ist ein Eingriff in die Daten — er wird benannt, nicht stillschweigend getan. */}
                        {preview.namesShortened > 0 && (
                            <p className="mt-2.5 text-[11.5px] text-slate-500 dark:text-white/60">
                                {t('upload.shortenedNote', { count: preview.namesShortened, limit: COLUMN_MAX_CHARS })}
                            </p>
                        )}
                    </Block>

                    {/* Spaltenerkennung offenlegen: die IT sieht, WAS wohin geht. */}
                    <Block title={t('upload.mapping.title')}>
                        <div className="flex flex-wrap gap-1.5">
                            {UPLOAD_FIELDS.map((field) => {
                                const index = preview.mapping[field];
                                const found = index !== -1;
                                const required = REQUIRED_FIELDS.includes(field);
                                return (
                                    <span
                                        key={field}
                                        className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11.5px] ${
                                            found
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-200'
                                                : required
                                                    ? 'border-red-200 bg-red-50 text-red-700 dark:border-red-400/25 dark:bg-red-400/10 dark:text-red-200'
                                                    : 'border-slate-200 bg-slate-50 text-slate-500 dark:border-white/15 dark:bg-white/5 dark:text-white/50'
                                        }`}
                                    >
                                        <span className="font-semibold">{t(FIELD_LABEL[field])}</span>
                                        <span className="opacity-70">
                                            {found ? preview.headers[index] : t('upload.mapping.missing')}
                                        </span>
                                    </span>
                                );
                            })}
                        </div>
                        {missingColumns.length > 0 && (
                            <div className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-red-600 dark:text-red-300">
                                <AlertTriangle size={14} />
                                {t('upload.mapping.requiredMissing')}
                            </div>
                        )}

                        {/* Erste Zeilen zur Sichtprüfung — Zahlenformat, Umlaute, Bild. */}
                        <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                            <table data-inv-table data-grid-lines className="w-full">
                                <thead>
                                    <tr>
                                        <th className="text-left">{t('upload.field.articleCode')}</th>
                                        <th className="text-left">{t('upload.field.name')}</th>
                                        <th className="text-right">{t('upload.field.salePrice')}</th>
                                        <th className="text-right">{t('upload.field.purchasePrice')}</th>
                                        <th className="text-left">{t('upload.field.unit')}</th>
                                        <th className="text-center">{t('upload.field.image')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {selectedRows.slice(0, 8).map((row) => (
                                        <tr key={`${row.sourceRow}-${row.articleCode}`}>
                                            <td className="font-mono text-[12px]">
                                                {row.articleCode}
                                                {row.generatedCode && (
                                                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                                                        {t('upload.generatedBadge')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="max-w-[22rem] truncate" title={row.description ?? undefined}>
                                                {row.name}
                                                {row.nameShortened && (
                                                    <span className="ml-1.5 rounded bg-amber-100 px-1 py-px text-[10px] font-semibold text-amber-700 dark:bg-amber-400/15 dark:text-amber-300">
                                                        {t('upload.shortenedBadge')}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="text-right font-mono tabular-nums">{row.salePrice.toFixed(2)}</td>
                                            <td className="text-right font-mono tabular-nums">{row.purchasePrice.toFixed(2)}</td>
                                            <td>{row.unit ?? '—'}</td>
                                            <td className="text-center">
                                                {row.imageUrl
                                                    ? <img src={row.imageUrl} alt="" className="mx-auto size-8 rounded object-cover" />
                                                    : <Image01 size={14} className="mx-auto text-slate-300 dark:text-white/25" />}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Block>

                    <Block title={t('upload.options.title')}>
                        <div className="flex flex-col gap-3">
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={overwrite}
                                    onChange={(event) => setOverwrite(event.target.checked)}
                                    className="mt-0.5 size-4 shrink-0 accent-[#272f67]"
                                />
                                <span>
                                    <span className="block text-[12.5px] font-semibold text-slate-800 dark:text-white">{t('upload.options.overwrite')}</span>
                                    <span className="block text-[11.5px] text-slate-500 dark:text-white/60">{t('upload.options.overwriteHint')}</span>
                                </span>
                            </label>
                            <label className="flex cursor-pointer items-start gap-2.5">
                                <input
                                    type="checkbox"
                                    checked={includeGenerated}
                                    onChange={(event) => setIncludeGenerated(event.target.checked)}
                                    className="mt-0.5 size-4 shrink-0 accent-[#272f67]"
                                />
                                <span>
                                    <span className="block text-[12.5px] font-semibold text-slate-800 dark:text-white">
                                        {t('upload.options.includeGenerated', { count: preview.generatedCodes })}
                                    </span>
                                    <span className="block text-[11.5px] text-slate-500 dark:text-white/60">{t('upload.options.includeGeneratedHint')}</span>
                                </span>
                            </label>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 dark:border-white/10">
                            <span className="text-[12px] text-slate-500 dark:text-white/60">
                                {t('upload.willUpload', { count: selectedRows.length })}
                            </span>
                            <button
                                type="button"
                                disabled={!selectedRows.length || missingColumns.length > 0}
                                onClick={() => void start()}
                                className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <UploadCloud02 size={14} />
                                {t('upload.start')}
                            </button>
                        </div>
                    </Block>
                </>
            )}

            {phase === 'running' && (
                <Block title={t('upload.running.title')}>
                    <div className="flex flex-col gap-3">
                        <div className="flex items-center justify-between text-[12.5px]">
                            <span className="flex items-center gap-2 font-semibold text-slate-700 dark:text-white">
                                <Spinner size="sm" />
                                {t('upload.running.status', { done: progress.done, total: progress.total })}
                            </span>
                            <span className="font-mono tabular-nums text-slate-500 dark:text-white/60">{percent}%</span>
                        </div>
                        <div
                            role="progressbar"
                            aria-valuenow={percent}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-label={t('upload.running.title')}
                            className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-white/10"
                        >
                            <div
                                className="h-full rounded-full bg-[#272f67] transition-[width] duration-300 dark:bg-white/70"
                                style={{ width: `${percent}%` }}
                            />
                        </div>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() => { stopRef.current = true; }}
                                className="rounded-md border border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-red-400 hover:text-red-500 dark:border-white/20 dark:text-white/70"
                            >
                                {t('upload.stop')}
                            </button>
                        </div>
                    </div>
                </Block>
            )}

            {phase === 'done' && result && (
                <>
                    <Block title={t('upload.done.title')}>
                        <div className="flex flex-col gap-4">
                            <div className={`flex items-start gap-2.5 rounded-lg border px-3.5 py-3 ${
                                result.stopped
                                    ? 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-100'
                                    : 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-400/25 dark:bg-emerald-400/10 dark:text-emerald-100'
                            }`}>
                                {result.stopped ? <AlertTriangle size={17} className="mt-px shrink-0" /> : <CheckCircle size={17} className="mt-px shrink-0" />}
                                <div>
                                    <div className="text-[13.5px] font-semibold">
                                        {result.stopped ? t('upload.done.stoppedHeadline') : t('upload.done.headline')}
                                    </div>
                                    <div className="mt-0.5 text-[12px] opacity-80">{t('upload.done.stockHint')}</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                                <StatTile label={t('upload.done.created')} value={result.created} tone="good" />
                                <StatTile label={t('upload.done.updated')} value={result.updated} />
                                <StatTile label={t('upload.done.failed')} value={result.failures.length} tone={result.failures.length ? 'warn' : 'plain'} />
                                <StatTile label={t('upload.done.stock')} value="0" />
                            </div>

                            <div className="flex flex-wrap gap-2">
                                <button
                                    type="button"
                                    onClick={() => navigate('/inventory/articles')}
                                    className="rounded-md bg-[#272f67] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                                >
                                    {t('upload.toProducts')}
                                </button>
                                <button
                                    type="button"
                                    onClick={reset}
                                    className="rounded-md border border-slate-300 px-4 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70"
                                >
                                    {t('upload.newFile')}
                                </button>
                            </div>
                        </div>
                    </Block>

                    {result.failures.length > 0 && (
                        <Block title={t('upload.errors.title', { count: result.failures.length })}>
                            <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                                <table data-inv-table data-grid-lines className="w-full">
                                    <thead>
                                        <tr>
                                            <th className="text-right">{t('upload.errors.row')}</th>
                                            <th className="text-left">{t('upload.field.articleCode')}</th>
                                            <th className="text-left">{t('upload.field.name')}</th>
                                            <th className="text-left">{t('upload.errors.reason')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {result.failures.slice(0, 100).map((failure) => (
                                            <tr key={`${failure.sourceRow}-${failure.articleCode}`}>
                                                <td className="text-right font-mono tabular-nums">{failure.sourceRow}</td>
                                                <td className="font-mono text-[12px]">{failure.articleCode}</td>
                                                <td className="max-w-[18rem] truncate">{failure.name}</td>
                                                <td className="text-red-600 dark:text-red-300">{failure.error}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {result.failures.length > 100 && (
                                <div className="mt-2 text-[11.5px] text-slate-500 dark:text-white/60">
                                    {t('upload.errors.more', { count: result.failures.length - 100 })}
                                </div>
                            )}
                        </Block>
                    )}
                </>
            )}
        </div>
    );
};
