import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Plus, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { BulkArticleItemInput, ItemType } from '@/types/inventory';
import { ExcelImportSheet } from './ExcelImportSheet';
import { SupplierComboCell } from './SupplierComboCell';
import { CELL_INPUT_CLASS, SectionCard } from './primitives';
import { useLanguageTick } from '../hooks/useLanguageTick';
import type { DraftProductRow, ImportedRecord, SupplierChoice } from '../types';
import { normalizeHeader } from '../utils/columnMatch';
import { parseNum } from '../utils/format';

let rowSeed = 0;
const emptyRow = (): DraftProductRow => ({
    key: `draft-${rowSeed += 1}`,
    articleCode: '',
    name: '',
    salePrice: '',
    quantity: '',
    purchasePrice: '',
    supplierId: null,
    supplierName: '',
    error: null,
});

/** Hiç dokunulmamış satır: Excel aktarımı önce bunları doldurur. */
const isBlankRow = (row: DraftProductRow) => !row.articleCode.trim()
    && !row.name.trim()
    && !row.salePrice.trim()
    && !row.quantity.trim()
    && !row.purchasePrice.trim()
    && !row.supplierName.trim();

/**
 * Ürün / malzeme toplu ekleme sayfasının ortak gövdesi — stok ekranıyla aynı
 * desende tam sayfa tablo (pop-up değil). Satırlar tabloda düzenlenir, alttaki
 * "+" ile yeni satır eklenir; Excel içe aktarımı satırları buraya doldurur.
 * Tedarikçi hücresine tıklanınca hücreden açılan hızlı seçici gelir.
 * Kodlar benzersiz olmalıdır (ürün ve malzeme aynı kod havuzunu paylaşır):
 * tablo içi mükerrerler anında işaretlenir, mevcut kayıtlarla çakışanlar
 * kaydetme sırasında satır hatası olarak döner.
 */
export const ArticleCreateView = ({
    itemType,
    copyPrefix,
    backPath,
}: {
    itemType: ItemType;
    /** 'inv.bulkProducts' | 'inv.bulkMaterials' — aynı yaprak adlarını taşırlar. */
    copyPrefix: string;
    backPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');

    const [rows, setRows] = useState<DraftProductRow[]>(() => [emptyRow(), emptyRow(), emptyRow()]);
    const [saving, setSaving] = useState(false);
    const [excelOpen, setExcelOpen] = useState(false);

    const codeLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialCode' : 'inv.columns.serialCode');
    const nameLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialName' : 'inv.columns.productName');

    /** Excel sihirbazının hedef kolonları. Etiketler çağrı anında çözülür (dil). */
    const importFields = () => ([
        { key: 'articleCode', label: codeLabel, keyField: true },
        { key: 'name', label: nameLabel, keyField: true },
        { key: 'salePrice', label: t('inv.columns.salePrice'), numeric: true },
        { key: 'quantity', label: t('inv.columns.quantity'), numeric: true },
        { key: 'supplierName', label: t('inv.columns.supplier') },
        { key: 'purchasePrice', label: t('inv.columns.purchasePrice'), numeric: true },
    ]);

    const patchRow = (key: string, patch: Partial<DraftProductRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row)));
    };

    const removeRow = (key: string) => {
        setRows((current) => {
            const next = current.filter((row) => row.key !== key);
            return next.length ? next : [emptyRow()];
        });
    };

    // Tablo içi mükerrer kod tespiti (normalize edilmiş karşılaştırma).
    const duplicateKeys = useMemo(() => {
        const byCode = new Map<string, string[]>();
        rows.forEach((row) => {
            const code = normalizeHeader(row.articleCode);
            if (!code) return;
            byCode.set(code, [...(byCode.get(code) ?? []), row.key]);
        });
        const duplicates = new Set<string>();
        byCode.forEach((keys) => {
            if (keys.length > 1) keys.forEach((key) => duplicates.add(key));
        });
        return duplicates;
    }, [rows]);

    const filledRows = useMemo(
        () => rows.filter((row) => row.articleCode.trim() || row.name.trim()),
        [rows],
    );

    const applyImport = (records: ImportedRecord[]) => {
        setRows((current) => {
            const imported = records.map((record) => ({
                ...emptyRow(),
                articleCode: record.articleCode === null ? '' : String(record.articleCode),
                name: record.name === null ? '' : String(record.name),
                salePrice: record.salePrice === null || record.salePrice === undefined ? '' : String(record.salePrice),
                quantity: record.quantity === null || record.quantity === undefined ? '' : String(record.quantity),
                purchasePrice: record.purchasePrice === null || record.purchasePrice === undefined ? '' : String(record.purchasePrice),
                supplierName: record.supplierName === null || record.supplierName === undefined ? '' : String(record.supplierName),
            }));
            // Önce tablodaki boş satırlar sırayla doldurulur (satır anahtarı
            // korunur), yetmezse kalanlar sona yeni satır olarak eklenir.
            const next = [...current];
            let cursor = 0;
            for (let index = 0; index < next.length && cursor < imported.length; index += 1) {
                if (!isBlankRow(next[index])) continue;
                next[index] = { ...imported[cursor], key: next[index].key };
                cursor += 1;
            }
            return [...next, ...imported.slice(cursor)];
        });
    };

    const save = async () => {
        if (!filledRows.length) {
            toast.error(t(`${copyPrefix}.nothingToSave`));
            return;
        }
        // Katı ön kontrol yok: eksik ad/kod ya da mükerrer kod gibi sorunlar
        // sunucudan satır bazında hata olarak döner ve o satırlar tabloda kalır.
        const payload: BulkArticleItemInput[] = filledRows.map((row) => ({
            articleCode: row.articleCode.trim(),
            name: row.name.trim(),
            salePrice: parseNum(row.salePrice) ?? 0,
            quantity: parseNum(row.quantity) ?? 0,
            purchasePrice: parseNum(row.purchasePrice) ?? 0,
            supplierId: row.supplierId,
            supplierName: row.supplierId ? null : (row.supplierName.trim() || null),
        }));

        setSaving(true);
        try {
            const result = await inventoryApi.bulkCreateArticles(payload, itemType);
            if (result.errors.length) {
                // Hatalı satırlar tabloda kalır ve hatasını gösterir; oluşanlar düşer.
                const errorByIndex = new Map(result.errors.map((error) => [error.index, error.error]));
                setRows(() => {
                    const kept = filledRows
                        .map((row, index) => ({ row, index }))
                        .filter(({ index }) => errorByIndex.has(index))
                        .map(({ row, index }) => ({ ...row, error: errorByIndex.get(index) }));
                    return kept.length ? kept : [emptyRow()];
                });
                toast.warning(t(`${copyPrefix}.partialResult`, { created: result.createdCount, failed: result.errors.length }));
            } else {
                toast.success(t(`${copyPrefix}.saved`, { count: result.createdCount }));
                navigate(backPath);
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t(`${copyPrefix}.saveFailed`));
        } finally {
            setSaving(false);
        }
    };

    const onSupplierPicked = (rowKey: string, choice: SupplierChoice) => {
        patchRow(rowKey, { supplierId: choice.supplierId, supplierName: choice.supplierName });
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t(`${copyPrefix}.title`)}
                action={(
                    <button
                        type="button"
                        onClick={() => navigate(backPath)}
                        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                        <ArrowLeft size={14} />
                        {t(`${copyPrefix}.backToList`)}
                    </button>
                )}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-[12.5px] text-slate-500 dark:text-white/60">{t(`${copyPrefix}.subtitle`)}</span>
                <button
                        type="button"
                        onClick={() => setExcelOpen(true)}
                        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                        <UploadCloud02 size={13} />
                    {t('inv.excel.importButton')}
                </button>
            </div>

            <SectionCard title={t(`${copyPrefix}.title`)}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-36 text-left">{codeLabel}</th>
                            <th className="text-left">{nameLabel}</th>
                            <th className="w-28 text-right">{t('inv.columns.salePrice')}</th>
                            <th className="w-24 text-right">{t('inv.columns.quantity')}</th>
                            <th className="w-56 text-left">{t('inv.columns.supplier')}</th>
                            <th className="w-28 text-right">{t('inv.columns.purchasePrice')}</th>
                            <th className="w-12" />
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            const isDuplicate = duplicateKeys.has(row.key);
                            return (
                                <tr key={row.key} className={row.error ? 'bg-red-50/60 dark:bg-red-500/10' : undefined}>
                                    <td>
                                        <input
                                            value={row.articleCode}
                                            onChange={(event) => patchRow(row.key, { articleCode: event.target.value })}
                                            placeholder={codeLabel}
                                            className={`${CELL_INPUT_CLASS} font-mono ${isDuplicate ? '!border-red-400' : ''}`}
                                        />
                                        {isDuplicate && (
                                            <span className="mt-0.5 block text-[10.5px] font-semibold text-red-500">{t(`${copyPrefix}.duplicateCode`)}</span>
                                        )}
                                        {row.error && (
                                            <span className="mt-0.5 block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                        )}
                                    </td>
                                    <td>
                                        <input
                                            value={row.name}
                                            onChange={(event) => patchRow(row.key, { name: event.target.value })}
                                            placeholder={nameLabel}
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            value={row.salePrice}
                                            onChange={(event) => patchRow(row.key, { salePrice: event.target.value })}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            value={row.quantity}
                                            onChange={(event) => patchRow(row.key, { quantity: event.target.value })}
                                            inputMode="decimal"
                                            placeholder="0"
                                            className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                        />
                                    </td>
                                    <td>
                                        {/* Tedarikçi hücresi: hücreye yazılır, altına kısa liste açılır. */}
                                        <SupplierComboCell
                                            value={row.supplierName}
                                            onChange={(next) => patchRow(row.key, { supplierName: next, supplierId: null })}
                                            onSelect={(choice) => onSupplierPicked(row.key, choice)}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            value={row.purchasePrice}
                                            onChange={(event) => patchRow(row.key, { purchasePrice: event.target.value })}
                                            inputMode="decimal"
                                            placeholder="0.00"
                                            className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                        />
                                    </td>
                                    <td className="text-center">
                                        <button
                                            type="button"
                                            aria-label={t(`${copyPrefix}.removeRow`)}
                                            onClick={() => removeRow(row.key)}
                                            className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/15"
                                        >
                                            <Trash01 size={13} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2.5 dark:border-white/10">
                    <button
                        type="button"
                        onClick={() => setRows((current) => [...current, emptyRow()])}
                        className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/60"
                    >
                        <Plus size={12} />
                        {t(`${copyPrefix}.addRow`)}
                    </button>
                    <button
                        type="button"
                        disabled={saving || !canCreate || !filledRows.length}
                        title={canCreate ? undefined : t(`${copyPrefix}.noPermission`)}
                        onClick={() => void save()}
                        className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? t('common.loading') : t(`${copyPrefix}.save`, { count: filledRows.length })}
                    </button>
                </div>
            </SectionCard>

            <ExcelImportSheet
                open={excelOpen}
                onClose={() => setExcelOpen(false)}
                title={t(itemType === 'MATERIAL' ? 'inv.excel.materialsTitle' : 'inv.excel.productsTitle')}
                fields={importFields()}
                onCommit={applyImport}
            />
        </div>
    );
};
