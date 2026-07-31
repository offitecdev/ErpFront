import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ClockRewind, Plus, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ArticleListItem, BulkMovementItemInput, ItemType } from '@/types/inventory';
import type { OrderStockPrefill } from './types';
import { ArticleComboCell } from './components/ArticleComboCell';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { ExcelImportSheet } from './components/ExcelImportSheet';
import { StockFlashArrow } from './components/StockFlashArrow';
import { SupplierComboCell } from './components/SupplierComboCell';
import { CELL_INPUT_CLASS, SectionCard, ToggleGroup } from './components/primitives';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftStockRow, ImportedRecord, StockDirection } from './types';
import { normalizeHeader } from './utils/columnMatch';
import { fmtMoney, fmtQty, parseNum } from './utils/format';

let rowSeed = 0;

/** Ürün/Malzeme anahtarı sayfadan çıkınca da korunur. */
const ITEM_KIND_KEY = 'offitec:stock-item-kind';

const readStoredKind = (): ItemType => {
    if (typeof window === 'undefined') return 'PRODUCT';
    return window.localStorage.getItem(ITEM_KIND_KEY) === 'MATERIAL' ? 'MATERIAL' : 'PRODUCT';
};


/** Ürünü henüz seçilmemiş taslak satır — hücreden açılan seçici doldurur. */
const emptyRow = (): DraftStockRow => ({
    key: `stock-${rowSeed += 1}`,
    articleId: null,
    articleCode: '',
    name: '',
    unit: '',
    currentStock: 0,
    quantity: '',
    unitCost: '',
    supplierId: null,
    supplierName: '',
    description: '',
    error: null,
});

/** Hiç dokunulmamış satır: Excel aktarımı önce bunları doldurur. */
const isBlankRow = (row: DraftStockRow) => !row.articleId
    && !row.articleCode.trim()
    && !row.name.trim()
    && !row.quantity.trim()
    && !row.unitCost.trim()
    && !row.supplierName.trim();

/** Excel sihirbazının stok hedef kolonları (ürün kod ya da adla eşlenir). */
const importFields = () => ([
    { key: 'articleCode', label: t('inv.columns.serialCode'), keyField: true },
    { key: 'name', label: t('inv.columns.productName'), keyField: true },
    { key: 'quantity', label: t('inv.columns.quantity'), numeric: true },
    { key: 'unitCost', label: t('inv.columns.unitCost'), numeric: true },
    { key: 'supplierName', label: t('inv.columns.supplier') },
]);

/**
 * Ortak stok — toplu giriş/çıkış ekranı. Üstteki anahtar yönü belirler (Giriş/Çıkış),
 * satırlar ürün seçiciyle ya da Excel içe aktarımıyla eklenir. Kolonlar her iki
 * yönde de aynıdır: ürün, mevcut stok, miktar, birim maliyet, tedarikçi, satır toplamı.
 */
export const StockPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const location = useLocation();
    const permissions = useAuthStore((state) => state.permissions);
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    // Sipariş popup'ından "stoğa ekle" ile gelindiyse satırlar önceden dolu
    // başlar; kayıt eksiksiz tamamlanınca sipariş COMPLETED işaretlenir.
    // Router state yalnızca ilk render'da okunur (lazy initializer).
    const [orderPrefill] = useState<OrderStockPrefill | null>(() => {
        const prefill = (location.state as { orderPrefill?: OrderStockPrefill } | null)?.orderPrefill;
        return prefill && Array.isArray(prefill.rows) && prefill.rows.length ? prefill : null;
    });

    const [direction, setDirection] = useState<StockDirection>('IN');
    // Ürün mü malzeme mi ekleniyor: seçici, sütun başlıkları ve yeni kayıtların
    // türü buna bağlı. Seçim tarayıcıda saklanır, sayfaya dönünce aynı kalır.
    const [itemKind, setItemKind] = useState<ItemType>(() => {
        // Sipariş aktarımı: satır türü siparişten gelir (çoğunluk türü seçilir).
        if (orderPrefill) {
            const materials = orderPrefill.rows.filter((row) => row.itemType === 'MATERIAL').length;
            return materials > orderPrefill.rows.length / 2 ? 'MATERIAL' : 'PRODUCT';
        }
        return readStoredKind();
    });
    const isMaterial = itemKind === 'MATERIAL';
    const kindLabels = {
        name: t(isMaterial ? 'inv.columns.materialName' : 'inv.columns.productName'),
        code: t(isMaterial ? 'inv.columns.materialCode' : 'inv.columns.serialCode'),
        pick: t(isMaterial ? 'inv.stock.pickMaterial' : 'inv.stock.pickProduct'),
        viewAll: `${t(isMaterial ? 'inv.materialPicker.viewAll' : 'inv.productPicker.viewAll')} …`,
        allTitle: t(isMaterial ? 'inv.materialPicker.allTitle' : 'inv.productPicker.allTitle'),
    };
    const [rows, setRows] = useState<DraftStockRow[]>(() => (orderPrefill
        ? orderPrefill.rows.map((row) => ({
            ...emptyRow(),
            articleId: row.articleId,
            articleCode: row.articleCode,
            name: row.name,
            unit: row.unit,
            quantity: row.quantity ? String(row.quantity) : '',
            unitCost: row.unitCost ? String(row.unitCost) : '',
            supplierId: orderPrefill.supplierId,
            supplierName: orderPrefill.supplierName,
            description: t('inv.orders.stockDescription', { reference: orderPrefill.orderReference }),
        }))
        : []));
    const [saving, setSaving] = useState(false);
    const [excelOpen, setExcelOpen] = useState(false);
    // Excel aktarımı sürerken ok tablonun üstünde lacivert, stoka kayıt sürerken
    // kırmızı yanıp söner; ikisi de bitince boş tablodaki soluk oka dönülür.
    const [importing, setImporting] = useState(false);
    // "Tüm ürünler" penceresini açan satır.
    const [allPickerRowKey, setAllPickerRowKey] = useState<string | null>(null);
    // Yeni eklenen satır: ürün hücresi mount olurken odağı alsın.
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

    const patchRow = (key: string, patch: Partial<DraftStockRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row)));
    };

    /**
     * Tür değişince tablo sıfırlanır: satırlar tek bir türe aittir, kaydedilen
     * kayıtlar da o listeye yazılır. Dolu satır varsa önce onay istenir.
     */
    const changeItemKind = (next: ItemType) => {
        if (next === itemKind) return;
        const hasContent = rows.some((row) => row.articleId || row.name.trim() || row.articleCode.trim());
        if (hasContent && !window.confirm(t('inv.stock.switchKindConfirm'))) return;
        setItemKind(next);
        window.localStorage.setItem(ITEM_KIND_KEY, next);
        setRows([]);
    };

    /** Boş satır ekler — kullanıcı doğrudan yeni satırın ürün hücresine yazar. */
    const addRow = () => {
        const row = emptyRow();
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    // Hücreye yazmak seçimi çözer: metin serbest kalır, satır yeniden aranabilir
    // ya da yeni ürün satırına dönüşebilir. Zaten bağlı olmayan bir satırda elle
    // yazılmış kod korunur — yalnızca mevcut üründen kopuşta temizlenir.
    const onProductTyped = (rowKey: string, text: string) => {
        setRows((current) => current.map((row) => (row.key === rowKey
            ? {
                ...row,
                name: text,
                error: null,
                ...(row.articleId ? { articleId: null, articleCode: '', unit: '', currentStock: 0 } : {}),
            }
            : row)));
    };

    // Seçilen ürün satıra yazılır. Aynı ürün zaten tablodaysa seçim yine kabul
    // edilir; bildirim yerine o satırın altında kırmızı "tekrar kayıt" uyarısı
    // görünür (aşağıdaki duplicateKeys).
    const onProductPicked = (rowKey: string, article: ArticleListItem) => {
        setRows((current) => {
            return current.map((row) => (row.key === rowKey
                ? {
                    ...row,
                    articleId: article.id,
                    articleCode: article.articleCode,
                    name: article.name,
                    unit: article.unit,
                    currentStock: article.totalQuantity,
                    unitCost: row.unitCost || (article.baseCost ? String(article.baseCost) : ''),
                    error: null,
                }
                : row));
        });
    };

    /**
     * "… ürün olarak ekle": eşleşme bulunmayan ad satırda kalır ve satır yeni
     * ürün satırına dönüşür. Ürün kaydı burada değil, kaydetme anında açılır —
     * kod hücresi (2. kolon) o yüzden bu satırlarda zorunludur.
     */
    const markAsNewArticle = (rowKey: string, name: string) => {
        patchRow(rowKey, { name, articleId: null, unit: '', currentStock: 0 });
    };

    // Excel satırlarını ürünlere bağla: önce kod, sonra ad (normalize edilmiş,
    // birebir). Eşleşmeyen satırlar atılmaz — kod/ad taşıyan yeni ürün satırı
    // olarak tabloya girer ve kaydetmede oluşturulur.
    const applyImport = async (records: ImportedRecord[]) => {
        setImporting(true);
        try {
            const summary = await inventoryApi.articlesSummary();
            const byCode = new Map(summary.map((article) => [normalizeHeader(article.articleCode), article]));
            const byName = new Map(summary.map((article) => [normalizeHeader(article.name), article]));

            const additions: DraftStockRow[] = [];
            records.forEach((record) => {
                const code = record.articleCode === null || record.articleCode === undefined ? '' : String(record.articleCode).trim();
                const name = record.name === null || record.name === undefined ? '' : String(record.name).trim();
                const article = (code && byCode.get(normalizeHeader(code))) || (name && byName.get(normalizeHeader(name))) || null;
                if (!article && !code && !name) return;
                additions.push({
                    ...emptyRow(),
                    articleId: article ? article.id : null,
                    articleCode: article ? article.articleCode : code,
                    name: article ? article.name : name,
                    unit: article ? article.unit : '',
                    currentStock: article ? article.totalQuantity : 0,
                    quantity: record.quantity === null || record.quantity === undefined ? '' : String(record.quantity),
                    unitCost: record.unitCost === null || record.unitCost === undefined ? '' : String(record.unitCost),
                    supplierName: record.supplierName === null || record.supplierName === undefined ? '' : String(record.supplierName),
                });
            });

            setRows((current) => {
                const known = new Set(current.map((row) => row.articleId).filter(Boolean));
                const incoming = additions.filter((row) => !row.articleId || !known.has(row.articleId));
                // Önce tablodaki boş satırlar sırayla doldurulur (satır anahtarı
                // korunur), yetmezse kalanlar sona yeni satır olarak eklenir.
                const next = [...current];
                let cursor = 0;
                for (let index = 0; index < next.length && cursor < incoming.length; index += 1) {
                    if (!isBlankRow(next[index])) continue;
                    next[index] = { ...incoming[cursor], key: next[index].key };
                    cursor += 1;
                }
                return [...next, ...incoming.slice(cursor)];
            });
        } catch {
            toast.error(t('inv.stock.importMatchFailed'));
        } finally {
            setImporting(false);
        }
    };

    /** Kaydedilebilir satırlar: ürünü seçilmiş ya da yeni ürün adı yazılmış olanlar. */
    const filledRows = useMemo(() => rows.filter((row) => row.articleId || row.name.trim()), [rows]);

    /**
     * Aynı ürün (ya da aynı kod) tabloya ikinci kez girmişse sonraki satırlar
     * "tekrar kayıt" olarak işaretlenir. Kayıt engellenmez — iki ayrı hareket
     * yazmak geçerli bir istek olabilir; yalnızca satırda kırmızı uyarı çıkar.
     */
    const duplicateKeys = useMemo(() => {
        const seenArticle = new Set<string>();
        const seenCode = new Set<string>();
        const duplicates = new Set<string>();
        rows.forEach((row) => {
            const code = normalizeHeader(row.articleCode);
            const repeated = (row.articleId && seenArticle.has(row.articleId)) || (code && seenCode.has(code));
            if (repeated) {
                duplicates.add(row.key);
                return;
            }
            if (row.articleId) seenArticle.add(row.articleId);
            if (code) seenCode.add(code);
        });
        return duplicates;
    }, [rows]);

    const totals = useMemo(() => rows.reduce(
        (acc, row) => {
            const quantity = parseNum(row.quantity) ?? 0;
            const unitCost = parseNum(row.unitCost) ?? 0;
            acc.quantity += quantity;
            acc.amount += quantity * unitCost;
            return acc;
        },
        { quantity: 0, amount: 0 },
    ), [rows]);

    /**
     * Tek düğme: yeni ürünler ürün listesine yazılır ve stoğa aynı çağrıda girer
     * (ürün ekleme sayfasıyla birebir aynı uç: miktar > 0 verilirse toplu ürün
     * ucu stok bakiyesini ve giriş hareketini kendisi yazar), mevcut ürünler ise
     * hareket ucuna gider. Doğrulama tamamen kayıt ÖNCESİ yapılır: hatalı satır
     * varsa hiçbir şey yazılmaz — yarım kalmış ürün oluşmasın.
     */
    const save = async () => {
        if (!filledRows.length) return;

        const rowErrors = new Map<string, string>();
        filledRows.forEach((row) => {
            const quantity = parseNum(row.quantity) ?? 0;
            if (quantity <= 0) {
                rowErrors.set(row.key, t('inv.stock.rowQuantity'));
                return;
            }
            if (row.articleId) return;
            // Yeni ürün satırı: yetki + kod zorunlu, çıkış yapılamaz (stoğu henüz yok).
            if (!canCreateArticles) rowErrors.set(row.key, t('inv.bulkProducts.noPermission'));
            else if (!row.articleCode.trim()) rowErrors.set(row.key, t('inv.stock.codeRequired'));
            else if (direction === 'OUT') rowErrors.set(row.key, t('inv.stock.newProductOut'));
        });
        if (rowErrors.size) {
            setRows((current) => current.map((row) => (rowErrors.has(row.key)
                ? { ...row, error: rowErrors.get(row.key) ?? null }
                : row)));
            return;
        }

        const newRows = filledRows.filter((row) => !row.articleId);
        const existingRows = filledRows.filter((row) => row.articleId);

        setSaving(true);
        try {
            const failed = new Map<string, string>();
            let createdCount = 0;
            let processedCount = 0;

            // Yeni ürünler: tek çağrıda hem ürün kaydı hem stok girişi.
            if (newRows.length) {
                const result = await inventoryApi.bulkCreateArticles(newRows.map((row) => ({
                    articleCode: row.articleCode.trim(),
                    name: row.name.trim(),
                    quantity: parseNum(row.quantity) ?? 0,
                    purchasePrice: parseNum(row.unitCost) ?? 0,
                    supplierId: row.supplierId,
                    supplierName: row.supplierId ? null : (row.supplierName.trim() || null),
                })), itemKind);
                createdCount = result.createdCount;
                result.errors.forEach((error) => {
                    const row = newRows[error.index];
                    if (row) failed.set(row.key, error.error);
                });
            }

            // Mevcut ürünler: normal giriş/çıkış hareketi.
            if (existingRows.length) {
                const payload: BulkMovementItemInput[] = existingRows.map((row) => ({
                    articleId: row.articleId as string,
                    movementType: direction,
                    quantity: parseNum(row.quantity) ?? 0,
                    unitCost: parseNum(row.unitCost),
                    supplierId: row.supplierId,
                    supplierName: row.supplierId ? null : (row.supplierName.trim() || null),
                    description: row.description.trim() || null,
                    // Sipariş aktarımı: hareket siparişe referansla yazılır.
                    referenceId: orderPrefill?.orderId ?? null,
                }));
                const result = await inventoryApi.bulkCreateMovements(payload);
                processedCount = result.processedCount;
                result.errors.forEach((error) => {
                    const row = existingRows[error.index];
                    if (row) failed.set(row.key, error.error);
                });
            }

            if (failed.size) {
                // Hatalı satırlar hatalarıyla kalır, işlenenler düşer, hiç
                // doldurulmamış satırlar olduğu gibi durur.
                setRows((current) => current.flatMap((row) => {
                    if (failed.has(row.key)) return [{ ...row, error: failed.get(row.key) ?? null }];
                    return !row.articleId && !row.name.trim() ? [row] : [];
                }));
                toast.warning(t('inv.stock.partialResult', {
                    processed: createdCount + processedCount,
                    failed: failed.size,
                }));
            } else {
                toast.success(createdCount
                    ? t('inv.stock.savedWithNew', { count: createdCount + processedCount, created: createdCount })
                    : t('inv.stock.saved', { count: processedCount }));
                setRows([]);
                // Sipariş aktarımı EKSİKSİZ tamamlandı → sipariş COMPLETED olur
                // ve listeye dönülür. Kısmî sonuçta sipariş açık kalır.
                if (orderPrefill) {
                    try {
                        await purchaseOrdersApi.markStocked(orderPrefill.orderId);
                        toast.success(t('inv.orders.stockCompleted', { reference: orderPrefill.orderReference }));
                    } catch (markError) {
                        toast.error((markError as { response?: { data?: { error?: string } } })?.response?.data?.error
                            || t('inv.orders.markStockedFailed'));
                    }
                    navigate('/inventory/orders');
                }
            }
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('inv.stock.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('inv.stock.title')}
                action={(
                    <button
                        type="button"
                        onClick={() => navigate('/inventory/stock/movements')}
                        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                        <ClockRewind size={14} />
                        {t('inv.stock.movementsButton')}
                    </button>
                )}
            />

            <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Yön anahtarı: satır eklemeden ÖNCE giriş/çıkış seçilir. */}
                <ToggleGroup
                    options={[
                        { key: 'IN' as StockDirection, label: t('inv.stock.directionIn') },
                        { key: 'OUT' as StockDirection, label: t('inv.stock.directionOut') },
                    ]}
                    value={direction}
                    onChange={setDirection}
                />
                <div className="flex items-center gap-2">
                    {/* Ürün / Malzeme: seçime göre liste, başlıklar ve yeni kayıt türü değişir. */}
                    <ToggleGroup
                        options={[
                            { key: 'PRODUCT' as ItemType, label: t('inv.stock.kindProduct') },
                            { key: 'MATERIAL' as ItemType, label: t('inv.stock.kindMaterial') },
                        ]}
                        value={itemKind}
                        onChange={changeItemKind}
                    />
                    <button
                        type="button"
                        onClick={() => setExcelOpen(true)}
                        className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3 py-1.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                    >
                        <UploadCloud02 size={13} />
                        {t('inv.excel.importButton')}
                    </button>
                    <button
                        type="button"
                        onClick={addRow}
                        className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        <Plus size={13} />
                        {t('inv.stock.addProduct')}
                    </button>
                </div>
            </div>

            <div className="relative">
                <SectionCard
                    title={direction === 'IN' ? t('inv.stock.sectionIn') : t('inv.stock.sectionOut')}
                    action={rows.length > 0 ? (
                        <span className="font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                            {fmtQty(totals.quantity)} · {fmtMoney(totals.amount)}
                        </span>
                    ) : undefined}
                >
                    <table data-inv-table data-unstyled-table className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('inv.columns.item')}</th>
                                <th className="w-40 text-left">{t('inv.columns.serialCode')}</th>
                                <th className="w-32 text-right">{t('inv.columns.currentStock')}</th>
                                <th className="w-28 text-right">{t('inv.columns.quantity')}</th>
                                <th className="w-32 text-right">{t('inv.columns.unitCost')}</th>
                                <th className="w-56 text-left">{t('inv.columns.supplier')}</th>
                                <th className="w-32 text-right">{t('inv.columns.lineTotal')}</th>
                                <th className="w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    {/* Beklerken gösterge yok: yalnızca metin. Ok sadece
                                        aktarım/kayıt sürerken tablonun önünde belirir. */}
                                    <td colSpan={8} className="py-12 text-center text-[13px] text-slate-400 dark:text-white/50">
                                        {t('inv.stock.empty')}
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => {
                                const quantity = parseNum(row.quantity) ?? 0;
                                const unitCost = parseNum(row.unitCost) ?? 0;
                                const overdrawn = Boolean(row.articleId) && direction === 'OUT' && quantity > row.currentStock;
                                const repeated = duplicateKeys.has(row.key);
                                return (
                                    <tr key={row.key} className={row.error ? 'bg-red-50/60 dark:bg-red-500/10' : undefined}>
                                        <td>
                                            {/* Ürün hücresi: doğrudan buraya yazılır, altına kısa liste açılır. */}
                                            <ArticleComboCell
                                                value={row.name}
                                                onChange={(next) => onProductTyped(row.key, next)}
                                                onPick={(article) => onProductPicked(row.key, article)}
                                                onCreate={(name) => markAsNewArticle(row.key, name)}
                                                onOpenAll={() => setAllPickerRowKey(row.key)}
                                                linked={Boolean(row.articleId)}
                                                itemType={itemKind}
                                                canCreate={canCreateArticles}
                                                autoFocus={row.key === focusRowKey}
                                                placeholder={kindLabels.pick}
                                                addLabel={t(isMaterial ? 'inv.materialPicker.addNew' : 'inv.productPicker.addNew', { name: row.name.trim() })}
                                                viewAllLabel={kindLabels.viewAll}
                                            />
                                            {/* Aynı ürün ikinci kez girildiyse: bildirim yok, satırda uyarı. */}
                                            {repeated && (
                                                <span className="block text-[10.5px] font-semibold text-red-500">{t('inv.stock.repeated')}</span>
                                            )}
                                            {row.error && (
                                                <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                            )}
                                        </td>
                                        <td>
                                            {/* Ürün kodu: mevcut üründe kendiliğinden dolar, yeni üründe zorunlu. */}
                                            {row.articleId ? (
                                                <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                                    {row.articleCode}
                                                </span>
                                            ) : (
                                                <input
                                                    value={row.articleCode}
                                                    onChange={(event) => patchRow(row.key, { articleCode: event.target.value })}
                                                    placeholder={kindLabels.code}
                                                    className={`${CELL_INPUT_CLASS} font-mono ${row.name.trim() && !row.articleCode.trim() ? '!border-red-400' : ''}`}
                                                />
                                            )}
                                            {repeated && (
                                                <span className="mt-0.5 block text-[10.5px] font-semibold text-red-500">{t('inv.stock.repeated')}</span>
                                            )}
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">
                                            {row.articleId ? `${fmtQty(row.currentStock)} ${row.unit}` : '—'}
                                        </td>
                                        <td>
                                            <input
                                                value={row.quantity}
                                                onChange={(event) => patchRow(row.key, { quantity: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono ${overdrawn ? '!border-red-400' : ''}`}
                                            />
                                            {overdrawn && (
                                                <span className="mt-0.5 block text-right text-[10.5px] font-semibold text-red-500">{t('inv.stock.overStock')}</span>
                                            )}
                                        </td>
                                        <td>
                                            <input
                                                value={row.unitCost}
                                                onChange={(event) => patchRow(row.key, { unitCost: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                            />
                                        </td>
                                        <td>
                                            {/* Tedarikçi hücresi: aynı desen — yazılan ad listede yoksa elle giriş olur. */}
                                            <SupplierComboCell
                                                value={row.supplierName}
                                                onChange={(next) => patchRow(row.key, { supplierName: next, supplierId: null })}
                                                onSelect={(choice) => patchRow(row.key, { supplierId: choice.supplierId, supplierName: choice.supplierName })}
                                            />
                                        </td>
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {fmtMoney(quantity * unitCost)}
                                        </td>
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                aria-label={t('inv.bulkProducts.removeRow')}
                                                onClick={() => setRows((current) => current.filter((item) => item.key !== row.key))}
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
                    {rows.length > 0 && (
                        <div className="flex items-center justify-between border-t border-slate-200 px-3 py-2.5 dark:border-white/10">
                            <button
                                type="button"
                                onClick={addRow}
                                className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/60"
                            >
                                <Plus size={12} />
                                {t('inv.bulkProducts.addRow')}
                            </button>
                            <button
                                type="button"
                                disabled={saving || !canTransfer || !filledRows.length}
                                title={canTransfer ? undefined : t('inv.stock.noPermission')}
                                onClick={() => void save()}
                                className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {saving
                                    ? t('common.loading')
                                    : direction === 'IN'
                                        ? t('inv.stock.saveIn', { count: filledRows.length })
                                        : t('inv.stock.saveOut', { count: filledRows.length })}
                            </button>
                        </div>
                    )}
                </SectionCard>
                    {/* İş sürerken ok tablonun önünde durur: kart/çerçeve yok, sadece ok.
                        Üst şeride yapışmasın diye biraz aşağıda konumlanır. */}
                    {(importing || saving) && (
                        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center pt-24">
                            <StockFlashArrow mode={importing ? 'import' : 'save'} size={72} />
                        </div>
                    )}
                </div>

            {/* Geniş liste penceresi — üstteki anahtarla aynı türü gösterir. */}
            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
                itemType={itemKind}
                title={kindLabels.allTitle}
            />
            <ExcelImportSheet
                open={excelOpen}
                onClose={() => setExcelOpen(false)}
                title={t('inv.excel.stockTitle')}
                fields={importFields()}
                onCommit={(records) => void applyImport(records)}
            />
        </div>
    );
};
