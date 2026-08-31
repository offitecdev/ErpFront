import { useMemo, useRef, useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Check, FileCheck02, UploadCloud02 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ColumnMapping, ImportField, ImportedRecord, ParsedSheet } from '../types';
import { autoMap, suggestForField } from '../utils/columnMatch';
import { isSpreadsheetFile, readSpreadsheetFile } from '../utils/excel';
import { parseNum } from '../utils/format';
import { BottomSheet } from './BottomSheet';
import { ColResizeHandle, ResizableCols } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';

type WizardStep = 0 | 1 | 2;

/**
 * Üç adımlı Excel içe aktarma sihirbazı (alttan yükselen büyük sheet):
 *   1. Dosya seçimi (tıkla ya da sürükle-bırak)
 *   2. Kolon eşleme — benzer ad önerileri, "eşleşmeyeni boş bırak" onay kutusu
 *   3. Önizleme + tabloya kaydet (tanınmayan satırları atlama seçeneği)
 * Adımlar arasında ileri/geri gidilebilir; içerik yana kayarak değişir.
 */
export const ExcelImportSheet = ({
    open,
    onClose,
    title,
    fields,
    onCommit,
    zIndex = 100,
}: {
    open: boolean;
    onClose: () => void;
    title: string;
    fields: ImportField[];
    /** Doğrulanan kayıtları teslim alır; sihirbaz kapanır. */
    onCommit: (records: ImportedRecord[]) => void;
    zIndex?: number;
}) => {
    const [step, setStep] = useState<WizardStep>(0);
    // Eşleme tablosunun sürüklenebilir sütunları; öneriler sütunu kalanı emer.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-excel-mapping:col-widths:v1',
        defaults: { target: 176, source: 224 },
        minPx: 96,
    });
    const [slideClass, setSlideClass] = useState('ofi-rise-in');
    const [sheet, setSheet] = useState<ParsedSheet | null>(null);
    const [mapping, setMapping] = useState<ColumnMapping>({});
    const [blankUnmatched, setBlankUnmatched] = useState(true);
    const [skipInvalid, setSkipInvalid] = useState(true);
    const [reading, setReading] = useState(false);
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const reset = () => {
        setStep(0);
        setSheet(null);
        setMapping({});
        setBlankUnmatched(true);
        setSkipInvalid(true);
        setSlideClass('ofi-rise-in');
    };

    const close = () => {
        reset();
        onClose();
    };

    const goTo = (next: WizardStep) => {
        setSlideClass(next > step ? 'ofi-slide-in-right' : 'ofi-slide-in-left');
        setStep(next);
    };

    const loadFile = async (file: File) => {
        if (!isSpreadsheetFile(file)) {
            toast.error(t('inv.excel.badFileType'));
            return;
        }
        setReading(true);
        try {
            const parsed = await readSpreadsheetFile(file);
            if (!parsed.headers.length || !parsed.rows.length) {
                toast.error(t('inv.excel.emptyFile'));
                return;
            }
            setSheet(parsed);
            // Otomatik eşleme önerisi hemen hazırlanır; kullanıcı 2. adımda düzeltir.
            setMapping(autoMap(fields, parsed.headers));
            goTo(1);
        } catch {
            toast.error(t('inv.excel.parseError'));
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

    // --- Esnek dönüştürme (3. adım için) ---
    // Katı doğrulama yok: hücre doğru tipteyse alınır, değilse (ya da boşsa) o
    // hücre boş bırakılır ama satır yine eklenir. Yalnızca hiçbir anahtar kolonu
    // dolu olmayan satırlar "tanınmamış" sayılır ve seçime göre atlanır;
    // tamamen boş satırlar her zaman atlanır.
    const { records, skippedCount, blankCellCount, partialRowCount } = useMemo(() => {
        if (!sheet) return { records: [] as ImportedRecord[], skippedCount: 0, blankCellCount: 0, partialRowCount: 0 };
        const keyFields = fields.filter((field) => field.keyField);
        const included: ImportedRecord[] = [];
        let skipped = 0;
        let blanks = 0;
        let partialRows = 0;
        sheet.rows.forEach((row) => {
            const record: ImportedRecord = {};
            let filledCells = 0;
            let blanksInRow = 0;
            fields.forEach((field) => {
                const headerIndex = mapping[field.key] ?? -1;
                const raw = headerIndex >= 0 ? row[headerIndex] : null;
                const empty = raw === null || raw === undefined || String(raw).trim() === '';
                if (empty) {
                    record[field.key] = null;
                    blanksInRow += 1;
                    return;
                }
                if (field.numeric) {
                    // "20%" gibi metin hücrelerde işaret atılır; sütun Excel'de
                    // yüzde BİÇİMLİyse ham değer (0.2) yüzdeye çevrilir.
                    const cleaned = typeof raw === 'string' ? raw.replace('%', '') : raw;
                    const parsed = parseNum(cleaned as string | number);
                    if (parsed === null) {
                        record[field.key] = null;
                        blanksInRow += 1;
                        return;
                    }
                    const isPercentColumn = sheet.percentColumns?.[headerIndex] ?? false;
                    record[field.key] = isPercentColumn
                        ? Math.round(parsed * 100 * 100) / 100
                        : parsed;
                    filledCells += 1;
                    return;
                }
                record[field.key] = String(raw).trim();
                filledCells += 1;
            });
            if (filledCells === 0) {
                skipped += 1;
                return;
            }
            const recognized = keyFields.length === 0 || keyFields.some((field) => record[field.key] !== null);
            if (!recognized && skipInvalid) {
                skipped += 1;
                return;
            }
            if (blanksInRow > 0) {
                partialRows += 1;
                blanks += blanksInRow;
            }
            included.push(record);
        });
        return { records: included, skippedCount: skipped, blankCellCount: blanks, partialRowCount: partialRows };
    }, [sheet, mapping, fields, skipInvalid]);

    /**
     * DOSYA KUTUSU SABİT DURUR (kullanıcı isteği): adımlar arası yatay kayma
     * (`ofi-slide-in-left` −56px'ten sağa doğru gelir) 1. adıma UYGULANMAZ —
     * eşleme adımından "geri" dönüldüğünde kutu yerinden kaymasın. İlk açılıştaki
     * dikey yükselme, sheet'in kendi girişiyle aynı olduğu için korunur.
     */
    const fileStepClass = slideClass === 'ofi-rise-in' ? 'ofi-rise-in' : '';

    const mappedCount = fields.filter((field) => (mapping[field.key] ?? -1) >= 0).length;
    const keyMapped = fields.some((field) => field.keyField && (mapping[field.key] ?? -1) >= 0);
    // En az bir kolon eşlenmiş olmalı; onay kutusu kapalıysa tüm kolonlar beklenir.
    const canLeaveMapping = mappedCount > 0 && (blankUnmatched || mappedCount === fields.length);
    const canSave = records.length > 0;

    const commit = () => {
        // Bildirim yok: verinin geldiğini tablonun üstünde kısa süre yanıp sönen
        // lacivert ok gösterir (çağıran taraf, ImportArrowFlash).
        onCommit(records);
        close();
    };

    const sampleValues = (headerIndex: number): string => {
        if (!sheet || headerIndex < 0) return '';
        const samples = sheet.rows
            .map((row) => row[headerIndex])
            .filter((cell) => cell !== null && cell !== undefined && String(cell).trim() !== '')
            .slice(0, 2)
            .map((cell) => String(cell));
        return samples.join(', ');
    };

    const stepDot = (index: WizardStep, label: string) => (
        <div className="flex items-center gap-1.5">
            <span
                className={`flex size-5 items-center justify-center rounded-full text-[10.5px] font-bold ${
                    step === index
                        ? 'bg-[#272f67] text-white'
                        : step > index
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-200 text-slate-500 dark:bg-white/15 dark:text-white/60'
                }`}
            >
                {step > index ? <Check size={11} /> : index + 1}
            </span>
            <span className={`text-[11.5px] font-semibold ${step === index ? 'text-slate-900 dark:text-white' : 'text-slate-400 dark:text-white/50'}`}>
                {label}
            </span>
        </div>
    );

    return (
        <BottomSheet
            open={open}
            onClose={close}
            title={title}
            subtitle={sheet ? sheet.fileName : t('inv.excel.subtitle')}
            width={980}
            height={700}
            zIndex={zIndex}
            headerActions={(
                <div className="mr-1 hidden items-center gap-3 sm:flex">
                    {stepDot(0, t('inv.excel.stepFile'))}
                    <span className="h-px w-4 bg-slate-200 dark:bg-white/15" />
                    {stepDot(1, t('inv.excel.stepMapping'))}
                    <span className="h-px w-4 bg-slate-200 dark:bg-white/15" />
                    {stepDot(2, t('inv.excel.stepPreview'))}
                </div>
            )}
            footer={(
                <>
                    <button
                        type="button"
                        disabled={step === 0}
                        onClick={() => goTo((step - 1) as WizardStep)}
                        className="ofi-rs-nav flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        <ArrowLeft size={13} />
                        {t('common.back')}
                    </button>
                    {step < 2 ? (
                        <button
                            type="button"
                            disabled={(step === 0 && !sheet) || (step === 1 && !canLeaveMapping)}
                            onClick={() => goTo((step + 1) as WizardStep)}
                            className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {t('common.next')}
                            <ArrowRight size={13} />
                        </button>
                    ) : (
                        <button
                            type="button"
                            disabled={!canSave}
                            onClick={commit}
                            className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <FileCheck02 size={13} />
                            {t('inv.excel.saveToTable', { count: records.length })}
                        </button>
                    )}
                </>
            )}
        >
            {/* ADIM 1 — DOSYA SEÇİMİ */}
            {step === 0 && (
                <div key="step-file" className={`${fileStepClass} flex flex-1 items-center justify-center p-6`}>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={onDrop}
                        className={`flex h-64 w-full max-w-xl flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed transition-colors ${
                            dragOver
                                ? 'border-[#1f2654] bg-slate-50 dark:bg-white/5'
                                : 'border-slate-300 hover:border-[#1f2654] hover:bg-slate-50/60 dark:border-white/20 dark:hover:bg-white/5'
                        }`}
                    >
                        <UploadCloud02 size={34} className="text-slate-400" />
                        <span className="text-[13.5px] font-semibold text-slate-700 dark:text-white">
                            {reading ? t('common.loading') : t('inv.excel.dropHint')}
                        </span>
                        <span className="text-[12px] text-slate-400 dark:text-white/50">{t('inv.excel.fileTypes')}</span>
                    </button>
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={onFileChange} />
                </div>
            )}

            {/* ADIM 2 — KOLON EŞLEME */}
            {step === 1 && sheet && (
                <div key="step-mapping" className={`${slideClass} flex flex-col gap-3 p-4`}>
                    <p className="text-[12.5px] text-slate-500 dark:text-white/60">{t('inv.excel.mappingHint')}</p>
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <ResizableCols keys={['target', 'source'] as const} grid={grid} />
                            {/* Öneriler sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('inv.excel.targetColumn')}
                                    <ColResizeHandle {...grid.resizeProps('target')} />
                                </th>
                                <th className="relative text-left">
                                    {t('inv.excel.excelColumn')}
                                    <ColResizeHandle {...grid.resizeProps('source')} />
                                </th>
                                <th className="text-left">{t('inv.excel.suggestionsAndSamples')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {fields.map((field) => {
                                const currentIndex = mapping[field.key] ?? -1;
                                const suggestions = suggestForField(field, sheet.headers)
                                    .filter((suggestion) => suggestion.headerIndex !== currentIndex);
                                return (
                                    <tr key={field.key}>
                                        <td className="text-[13px] font-semibold text-slate-700 dark:text-white">
                                            {field.label}
                                            {field.keyField && (
                                                <span
                                                    title={t('inv.excel.keyFieldHint')}
                                                    className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold normal-case tracking-normal text-slate-500 dark:bg-white/10 dark:text-white/60"
                                                >
                                                    {t('inv.excel.keyFieldBadge')}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <select
                                                value={currentIndex}
                                                onChange={(event) => setMapping((current) => ({ ...current, [field.key]: Number(event.target.value) }))}
                                                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-[12.5px] text-slate-800 focus:border-[#1f2654] focus:outline-none dark:border-white/15 dark:bg-[#151616] dark:text-white"
                                            >
                                                <option value={-1}>{t('inv.excel.unmatched')}</option>
                                                {sheet.headers.map((header, headerIndex) => (
                                                    <option key={headerIndex} value={headerIndex}>{header || `#${headerIndex + 1}`}</option>
                                                ))}
                                            </select>
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap items-center gap-1.5">
                                                {suggestions.map((suggestion) => (
                                                    <button
                                                        key={suggestion.headerIndex}
                                                        type="button"
                                                        title={t('inv.excel.applySuggestion')}
                                                        onClick={() => setMapping((current) => ({ ...current, [field.key]: suggestion.headerIndex }))}
                                                        className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/15 dark:bg-white/5 dark:text-white/70"
                                                    >
                                                        ≈ {suggestion.header}
                                                    </button>
                                                ))}
                                                {currentIndex >= 0 && (
                                                    <span className="truncate text-[11.5px] text-slate-400 dark:text-white/40">
                                                        {sampleValues(currentIndex)}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <div className="flex flex-col gap-2 rounded-md border border-slate-200 bg-slate-50/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/5">
                        <label className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-white">
                            <input
                                type="checkbox"
                                checked={blankUnmatched}
                                onChange={(event) => setBlankUnmatched(event.target.checked)}
                                className="size-3.5 accent-[#272f67]"
                            />
                            {t('inv.excel.blankUnmatched')}
                        </label>
                        <label className="flex items-center gap-2 text-[12.5px] text-slate-700 dark:text-white">
                            <input
                                type="checkbox"
                                checked={skipInvalid}
                                onChange={(event) => setSkipInvalid(event.target.checked)}
                                className="size-3.5 accent-[#272f67]"
                            />
                            {t('inv.excel.skipInvalidRows')}
                        </label>
                        {mappedCount === 0 && (
                            <p className="text-[12px] font-medium text-red-500">{t('inv.excel.mapAtLeastOne')}</p>
                        )}
                        {mappedCount > 0 && !keyMapped && (
                            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">{t('inv.excel.noKeyMapped')}</p>
                        )}
                    </div>
                </div>
            )}

            {/* ADIM 3 — ÖNİZLEME + KAYDET */}
            {step === 2 && sheet && (
                <div key="step-preview" className={`${slideClass} flex flex-col gap-3 p-4`}>
                    <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
                        <span className="rounded-full bg-emerald-50 px-3 py-1 font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                            {t('inv.excel.validRows', { count: records.length })}
                        </span>
                        {partialRowCount > 0 && (
                            <span className="rounded-full bg-slate-100 px-3 py-1 font-semibold text-slate-600 dark:bg-white/10 dark:text-white/70">
                                {t('inv.excel.rowsWithBlanks', { rows: partialRowCount, cells: blankCellCount })}
                            </span>
                        )}
                        {skippedCount > 0 && (
                            <span className="rounded-full bg-amber-50 px-3 py-1 font-semibold text-amber-700 dark:bg-amber-500/15 dark:text-amber-300">
                                {t('inv.excel.skippedRows', { count: skippedCount })}
                            </span>
                        )}
                    </div>

                    <div className="overflow-x-auto">
                        {/* Önizleme sütunları veriden (`fields`) gelir ve her
                            içe aktarımda değişir: saklanabilir bir genişlik
                            takımı yok, bu yüzden yalnızca çizgiler. */}
                        <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                            <thead>
                                <tr>
                                    {fields.map((field) => (
                                        <th key={field.key} className={`text-left ${field.numeric ? 'text-right' : ''}`}>{field.label}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {records.slice(0, 50).map((record, index) => (
                                    <tr key={index}>
                                        {fields.map((field) => (
                                            <td key={field.key} className={field.numeric ? 'text-right font-mono text-[12px]' : 'text-slate-700 dark:text-white/80'}>
                                                {record[field.key] === null ? '—' : String(record[field.key])}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {records.length === 0 && (
                                    <tr>
                                        <td colSpan={fields.length} className="py-8 text-center text-[12.5px] text-slate-400">
                                            {t('inv.excel.noValidRows')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {records.length > 50 && (
                        <p className="text-[11.5px] text-slate-400 dark:text-white/50">{t('inv.excel.previewTruncated', { count: records.length - 50 })}</p>
                    )}

                    {partialRowCount > 0 && (
                        <p className="text-[12px] text-slate-500 dark:text-white/60">{t('inv.excel.blanksNote')}</p>
                    )}
                </div>
            )}
        </BottomSheet>
    );
};
