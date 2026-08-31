import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowUp, Check, CheckCircle, Plus, RefreshCcw01, Save01, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi, supplyApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ArticleListItem, ItemType, OrderCalcMode, PurchaseOrderItemInput, PurchaseOrderRow } from '@/types/inventory';
import { ArticleComboCell } from './components/ArticleComboCell';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { ExcelImportSheet } from './components/ExcelImportSheet';
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderRow, ImportedRecord } from './types';
import { normalizeHeader } from './utils/columnMatch';
import { mergeImportedOrderRows } from './utils/orderImport';
import { fmtDateTime, fmtMoney, fmtQty, fmtUnitPricePrecise, parseNum } from './utils/format';
import { foldedExtraDiscount } from './utils/orderPricing';
import {
    captureRowOrigin,
    cycleRowMode,
    draftRowFigures,
    restoreRowOrigin,
    rowDiffersFromOrigin,
    transitionRowMode,
} from './utils/orderRowMode';
import { ORDER_STATUS_META, canReceiveGoods } from './utils/orderStatus';

let receiveRowSeed = 0;

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

const emptyRow = (calcMode: OrderCalcMode = 'DIRECT'): DraftOrderRow => ({
    key: `receive-${receiveRowSeed += 1}`,
    // Malzeme/ürün birleşmesi (2026-08-14): her satır üründür.
    itemType: 'PRODUCT' as ItemType,
    articleId: null,
    code: '',
    serialNumber: '',
    name: '',
    unit: '',
    quantity: '1',
    grossPrice: '',
    netPrice: '',
    lineTotal: '',
    discount: '',
    discount2: '',
    vatRate: '',
    calcMode,
    modePinned: false,
    receivedQuantity: 0,
    receivedAt: null,
    error: null,
});

/** Kayıtlı sipariş satırı → düzenlenebilir taslak (editörle AYNI kurallar). */
const rowFromItem = (item: PurchaseOrderRow['items'][number]): DraftOrderRow => {
    const storedMode: OrderCalcMode = item.calcMode === 'SUPPLIER' || item.calcMode === 'AUTO' || item.calcMode === 'DIRECT'
        ? item.calcMode
        : (item.directCopy === true ? 'DIRECT' : 'AUTO');
    // Eski üçüncü indirimli satır doğrudan girişle açılır ki katlanan yüzdenin
    // yuvarlanması tutarı kaydırmasın (editörle aynı kural).
    const itemMode: OrderCalcMode = (item.discount3 ?? 0) > 0 ? 'DIRECT' : storedMode;
    return {
        ...emptyRow(itemMode),
        articleId: item.articleId ?? null,
        code: item.code ?? '',
        serialNumber: item.serialNumber ?? '',
        name: item.name,
        unit: item.unit ?? '',
        quantity: String(item.quantity),
        grossPrice: String(item.grossPrice || item.netPrice || ''),
        netPrice: itemMode === 'SUPPLIER'
            ? String(item.displayNetPrice ?? item.netPrice ?? '')
            : (itemMode !== 'AUTO' ? String(item.netPrice || '') : ''),
        supplierUnitBase: itemMode === 'SUPPLIER' ? String(item.netPrice || '') : undefined,
        lineTotal: itemMode === 'DIRECT' ? String(item.lineTotal || '') : '',
        discount: item.discount ? String(item.discount) : '',
        // Eski üçüncü indirim ek indirime katlanır (editörle aynı kural).
        discount2: foldedExtraDiscount(item) || '',
        // Kayıttaki fiyat ÖZGÜN hâldir (geri çağır düğmesi buraya döner).
        origin: {
            grossPrice: String(item.grossPrice || item.netPrice || ''),
            netPrice: itemMode !== 'AUTO' ? String(item.netPrice || '') : '',
            lineTotal: itemMode === 'DIRECT' ? String(item.lineTotal || '') : '',
            discount: item.discount ? String(item.discount) : '',
            discount2: foldedExtraDiscount(item) || '',
            calcMode: itemMode,
        },
        // Kayıttaki değerler stash'e yazılır: kip gezintisi geri dönünce
        // kaydedilmiş hâl gelir (editörle aynı davranış).
        modeStash: itemMode === 'AUTO'
            ? undefined
            : { [itemMode]: { netPrice: String(item.netPrice || ''), lineTotal: String(item.lineTotal || ''), quantity: String(item.quantity) } },
        receivedQuantity: item.receivedQuantity ?? 0,
        receivedAt: item.receivedAt ?? null,
    };
};

const cellText = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).trim();

const percentCell = (value: string | number | null | undefined): string => {
    const parsed = parseNum(cellText(value).replace('%', ''));
    if (parsed === null || parsed < 0 || parsed > 100) return '';
    return String(parsed);
};

const importFields = (directCopy: boolean) => ([
    { key: 'articleCode', label: t('inv.columns.serialCode'), keyField: true },
    { key: 'name', label: t('inv.columns.productName'), keyField: true },
    { key: 'quantity', label: t('inv.columns.quantity'), numeric: true },
    { key: 'grossPrice', label: t('inv.orders.columns.grossPrice'), numeric: true },
    { key: 'netPrice', label: directCopy ? t('inv.orders.columns.netPrice') : t('inv.columns.unitCost'), numeric: true },
    { key: 'discount', label: t('inv.orders.columns.discount'), numeric: true },
    { key: 'discount2', label: t('inv.orders.columns.discount2'), numeric: true },
    ...(directCopy ? [{ key: 'lineTotal', label: t('inv.columns.lineTotal'), numeric: true }] : []),
]);

/**
 * ── MAL KABUL EKRANI (2026-08-02, ikinci sürüm: TAM DÜZENLEME) ──────────────
 *
 * Mal kabul stok ekranı gibi KENDİ SAYFASIDIR ve tablo, sipariş editörüyle
 * AYNI yeteneklere sahiptir (kullanıcı isteği): satırlar düzenlenebilir,
 * Excel'den içe aktarılabilir, ürün/malzeme ayrımı yapılır ve hesap kipi
 * (doğrudan / otomatik / tedarikçi) hem üstten TOPLU hem satırın sağındaki
 * daireyle SATIRA ÖZGÜ değiştirilebilir — mantık `utils/orderRowMode.ts`
 * üzerinden editörle birebir ortaktır.
 *
 * Kabul akışı: satır başındaki AÇIK MAVİ OK o satırı stoğa gönderir (popup
 * yok, üstteki tek satırlık metin değişir), seçilenler toplu gönderilir,
 * "mal kabulü tamamla" kalanların hepsini aktarır ve sipariş "stoğa aktarıldı"
 * olur. Bekleyen düzenlemeler gönderimden önce KENDİLİĞİNDEN kaydedilir.
 */
export const OrderReceivePage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const { id: orderId } = useParams<{ id: string }>();
    const permissions = useAuthStore((state) => state.permissions);
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    const [order, setOrder] = useState<PurchaseOrderRow | null>(null);
    const [rows, setRows] = useState<DraftOrderRow[]>([]);
    // Kaydedilmemiş düzenleme var mı — gönderimden önce otomatik kaydedilir.
    const [dirty, setDirty] = useState(false);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [note, setNote] = useState<string | null>(null);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [calcMode, setCalcMode] = useState<OrderCalcMode>('DIRECT');
    const [excelOpen, setExcelOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [allPickerRowKey, setAllPickerRowKey] = useState<string | null>(null);
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

    const adoptOrder = (row: PurchaseOrderRow) => {
        setOrder(row);
        setRows(row.items.map(rowFromItem));
        setDirty(false);
        setSelected(new Set());
    };

    useEffect(() => {
        if (!orderId) return;
        let cancelled = false;
        setLoading(true);
        purchaseOrdersApi.get(orderId)
            .then((row) => { if (!cancelled) adoptOrder(row); })
            .catch((err) => {
                toast.error(errorText(err) || t('inv.orders.loadFailed'));
                navigate('/inventory/orders');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

    const remainingOf = (row: DraftOrderRow) =>
        Math.max(0, (parseNum(row.quantity) ?? 0) - row.receivedQuantity);
    const receivedCount = rows.filter((row) => remainingOf(row) <= 0).length;
    const statusMeta = order ? (ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.PENDING) : null;
    const allowed = Boolean(order && canTransfer && canReceiveGoods(order.status));

    // ── Satır düzenleme (editörle aynı) ──────────────────────────────────────
    const patchRow = (key: string, patch: Partial<DraftOrderRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row)));
        setDirty(true);
    };

    const addRow = () => {
        const row = emptyRow(calcMode);
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
        setSelected(new Set());
        setDirty(true);
    };

    const removeRow = (key: string) => {
        setRows((current) => current.filter((row) => row.key !== key));
        setSelected(new Set());
        setDirty(true);
    };


    // Toplu kip: sabitlenmemiş satırlara uygulanır (editörle aynı kural).
    const changeCalcMode = (next: OrderCalcMode) => {
        setRows((current) => current.map((row) => (row.modePinned ? row : transitionRowMode(row, next))));
        setCalcMode(next);
        setDirty(true);
    };

    /** Fiyat kutusunun yanındaki geri çağır düğmesi (editörle aynı). */
    const recallButton = (row: DraftOrderRow, changed: boolean) => (
        <button
            type="button"
            disabled={!changed}
            onClick={() => recallRowPrice(row)}
            title={t('inv.orders.calcMode.recallPrice')}
            aria-label={t('inv.orders.calcMode.recallPrice')}
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#1f2654] disabled:invisible dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
        >
            <RefreshCcw01 size={13} />
        </button>
    );

    /** Geri çağır: satırın fiyatını özgün (içe aktarılan/kayıtlı) hâline döndürür. */
    const recallRowPrice = (row: DraftOrderRow) => {
        setRows((current) => current.map((entry) => (entry.key === row.key ? restoreRowOrigin(entry) : entry)));
        setDirty(true);
    };

    // Sağdaki daire: boş → D → A → T → boş (satıra özgü, toplu ayardan bağımsız).
    const cycleRowCalcMode = (row: DraftOrderRow) => {
        setRows((current) => current.map((entry) => (entry.key === row.key ? cycleRowMode(entry, calcMode) : entry)));
        setDirty(true);
    };

    const onProductTyped = (rowKey: string, text: string) => {
        setRows((current) => current.map((row) => (row.key === rowKey
            ? { ...row, name: text, error: null, ...(row.articleId ? { articleId: null, code: '', unit: '' } : {}) }
            : row)));
        setDirty(true);
    };

    const onProductPicked = (rowKey: string, article: ArticleListItem) => {
        setRows((current) => current.map((row) => (row.key === rowKey
            ? {
                ...row,
                itemType: 'PRODUCT',
                articleId: article.id,
                code: article.articleCode,
                name: article.name,
                unit: article.unit,
                grossPrice: row.grossPrice || (article.baseCost ? String(article.baseCost) : ''),
                ...(row.calcMode === 'SUPPLIER' ? { netPrice: article.baseCost ? String(article.baseCost) : row.netPrice } : {}),
                error: null,
            }
            : row)));
        setDirty(true);
        void supplyApi.itemSuppliers(article.id)
            .then((result) => {
                const best = result.suppliers[0];
                if (!best?.lastPurchasePrice) return;
                setRows((current) => current.map((row) => (row.key === rowKey && row.articleId === article.id && row.calcMode === 'SUPPLIER'
                    ? { ...row, netPrice: String(best.lastPurchasePrice) }
                    : row)));
            })
            .catch(() => { /* öneri gelmezse satır elle doldurulur */ });
    };

    /**
     * SERİ KOD EŞLEŞMESİ SATIRIN ÜZERİNE YAZAR — sipariş editörüyle BİREBİR aynı
     * kural (`OrderCreatePage.applySerialCodeMatch`, kullanıcı isteği
     * 2026-08-02): elle yazılan kod katalogdaki bir ürünle birebir eşleşirse
     * satır o ürüne bağlanır ve kod/ad/birim üzerine yazılır. Fiyat yalnızca boş
     * hücreye yazılır; Excel aktarımı bilinçli olarak dışarıdadır (dosya kazanır).
     */
    const applySerialCodeMatch = async (rowKey: string, rawCode: string) => {
        const code = rawCode.trim();
        if (!code) return;
        try {
            const result = await inventoryApi.articlesSummaryPaged({
                page: 1,
                pageSize: 5,
                code,
                status: 'ACTIVE',
            });
            const match = result.items.find(
                (article) => article.articleCode.trim().toLowerCase() === code.toLowerCase(),
            );
            if (!match) return;
            let changed = false;
            setRows((current) => current.map((row) => {
                if (row.key !== rowKey) return row;
                if (row.code.trim().toLowerCase() !== code.toLowerCase()) return row;
                if (row.articleId === match.id) return row;
                changed = true;
                return {
                    ...row,
                    articleId: match.id,
                    code: match.articleCode,
                    name: match.name,
                    unit: match.unit || row.unit,
                    grossPrice: row.grossPrice.trim() || (match.baseCost ? String(match.baseCost) : ''),
                    error: null,
                };
            }));
            if (changed) setDirty(true);
        } catch {
            /* Arama başarısızsa satır olduğu gibi kalır. */
        }
    };

    // ── Excel içe aktarımı (editörle aynı: dosya kazanır + kip varsayılanı) ──
    const applyImport = async (records: ImportedRecord[]) => {
        setImporting(true);
        try {
            const summary = await inventoryApi.articlesSummary();
            const byCode = new Map(summary.map((article) => [normalizeHeader(article.articleCode), article]));
            const byName = new Map(summary.map((article) => [normalizeHeader(article.name), article]));

            const additions: DraftOrderRow[] = [];
            records.forEach((record) => {
                const code = cellText(record.articleCode);
                const name = cellText(record.name);
                const article = (code && byCode.get(normalizeHeader(code)))
                    || (name && byName.get(normalizeHeader(name)))
                    || null;
                if (!article && !code && !name) return;
                const routeThroughOverwrite = canCreateArticles && Boolean(code);
                const base = {
                    articleId: article && !routeThroughOverwrite ? article.id : null,
                    code: code || (article ? article.articleCode : ''),
                    name: name || (article ? article.name : ''),
                    unit: article ? article.unit : '',
                };
                if (calcMode === 'SUPPLIER') {
                    const supplierNet = cellText(record.netPrice) || (article?.baseCost ? String(article.baseCost) : '');
                    additions.push({
                        ...emptyRow('SUPPLIER'),
                        ...base,
                        quantity: cellText(record.quantity) || '1',
                        grossPrice: cellText(record.grossPrice) || (article?.baseCost ? String(article.baseCost) : ''),
                        netPrice: supplierNet,
                        modeStash: { SUPPLIER: { netPrice: supplierNet, lineTotal: '', quantity: cellText(record.quantity) || '1' } },
                    });
                    return;
                }
                if (calcMode === 'DIRECT') {
                    additions.push({
                        ...emptyRow('DIRECT'),
                        ...base,
                        code,
                        name,
                        quantity: cellText(record.quantity),
                        grossPrice: cellText(record.grossPrice),
                        netPrice: cellText(record.netPrice),
                        lineTotal: cellText(record.lineTotal),
                        discount: cellText(record.discount),
                        discount2: cellText(record.discount2),
                        modeStash: {
                            DIRECT: {
                                netPrice: cellText(record.netPrice),
                                lineTotal: cellText(record.lineTotal),
                                quantity: cellText(record.quantity),
                            },
                        },
                    });
                    return;
                }
                additions.push({
                    ...emptyRow('AUTO'),
                    ...base,
                    quantity: cellText(record.quantity) || '1',
                    grossPrice: cellText(record.grossPrice)
                        || cellText(record.netPrice)
                        || (article?.baseCost ? String(article.baseCost) : ''),
                    discount: percentCell(record.discount),
                    discount2: percentCell(record.discount2),
                });
            });

            // Özgün fiyat saklanır (geri çağır düğmesi bunu geri getirir).
            additions.forEach((row) => { row.origin = captureRowOrigin(row); });
            // Editörle AYNI kural: seri kodu (yoksa adı) tutan satırın ÜZERİNE
            // yazılır, eşleşmeyenler sona eklenir. Mal kabul durumu korunur.
            setRows((current) => mergeImportedOrderRows(current, additions));
            setSelected(new Set());
            setDirty(true);
        } catch {
            toast.error(t('inv.stock.importMatchFailed'));
        } finally {
            setImporting(false);
        }
    };

    // ── Kaydetme (editörün akışıyla aynı: önce yeni/çakışan ürünler) ─────────
    const rowToItem = (row: DraftOrderRow, articleId?: string): PurchaseOrderItemInput => {
        const figures = draftRowFigures(row);
        return {
            itemType: row.itemType,
            articleId: articleId ?? row.articleId,
            code: row.code.trim() || null,
            serialNumber: row.serialNumber.trim() || null,
            name: row.name.trim(),
            quantity: parseNum(row.quantity) ?? 1,
            unit: row.unit || null,
            grossPrice: parseNum(row.grossPrice) ?? 0,
            // TEDARİKÇİ satırında `netPrice` HESABIN tam duyarlıklı tabanıdır;
            // ekranda/belgelerde görünen Excel fiyatı `displayNetPrice` olarak
            // ayrıca saklanır (kullanıcı isteği: yüklenen fiyat değişmesin).
            netPrice: figures.netUnitPrice,
            ...(row.calcMode === 'SUPPLIER' && row.netPrice.trim()
                ? { displayNetPrice: parseNum(row.netPrice) ?? undefined }
                : {}),
            discount: row.calcMode === 'SUPPLIER' ? 0 : (parseNum(row.discount) ?? 0),
            // Her zaman gönderilir (editörle aynı kural): gizli sütun yüzünden
            // indirim sessizce sıfırlanmasın.
            discount2: row.calcMode === 'SUPPLIER' ? 0 : (parseNum(row.discount2) ?? 0),
            discount3: 0,
            vatRate: 0,
            calcMode: row.calcMode,
            receivedQuantity: row.receivedQuantity,
            receivedAt: row.receivedAt,
            ...(row.calcMode === 'DIRECT' ? { directCopy: true, lineTotal: figures.lineTotal } : {}),
        };
    };

    const filledRows = useMemo(() => rows.filter((row) => row.articleId || row.name.trim()), [rows]);

    /** Değişiklikleri kaydeder; günceli döndürür (gönderimden önce çağrılır). */
    const persistRows = async (): Promise<PurchaseOrderRow | null> => {
        if (!orderId || !order) return null;
        if (!dirty) return order;
        if (!filledRows.length) {
            toast.error(t('inv.orders.receive.lastRow'));
            return null;
        }
        // Yeni/çakışan kodlu satırlar önce ürün listesine yazılır (dosya kazanır).
        // Tek toplu çağrı (malzeme/ürün birleşmesi 2026-08-14).
        const createdIds = new Map<string, string>();
        {
            const newRows = filledRows.filter((row) => !row.articleId && row.code.trim());
            if (newRows.length && canCreateArticles) {
                const result = await inventoryApi.bulkCreateArticles(newRows.map((row) => ({
                    articleCode: row.code.trim(),
                    name: row.name.trim(),
                    quantity: 0,
                    purchasePrice: draftRowFigures(row).netUnitPrice,
                    supplierId: order.supplierId ?? null,
                    supplierName: order.supplierId ? null : order.supplierName,
                    unit: row.unit || null,
                })), undefined, { overwrite: true });
                result.created.forEach((created) => {
                    const row = newRows.find((candidate) => !createdIds.has(candidate.key)
                        && candidate.code.trim().toLowerCase() === created.articleCode.toLowerCase());
                    if (row) createdIds.set(row.key, created.id);
                });
            }
        }
        const updated = await purchaseOrdersApi.update(orderId, {
            items: filledRows.map((row) => rowToItem(row, createdIds.get(row.key))),
        });
        setOrder(updated);
        setDirty(false);
        return updated;
    };

    const saveChanges = async () => {
        setBusy('save');
        try {
            const updated = await persistRows();
            if (updated) {
                adoptOrder(updated);
                setNote(t('inv.orders.updatedToast'));
            }
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    /**
     * ÇÖP KUTUSU (başlıkta, kaydet ikonunun solunda): listeyi TEMİZLER —
     * henüz stoğa aktarılmamış satırların hepsi silinir. Aktarılmış satırlar
     * korunur (hareketleri yazılmıştır). Yalnızca ekranda uygulanır; kalıcı
     * olması için kaydet ikonuna basılır.
     */
    const clearRows = () => {
        if (!window.confirm(t('inv.orders.receive.clearConfirm'))) return;
        setRows((current) => current.filter((row) => row.receivedQuantity > 0));
        setSelected(new Set());
        setNote(t('inv.orders.receive.cleared'));
        setDirty(true);
    };

    // ── Mal kabul (satır / seçili / tamamı) ──────────────────────────────────
    const runReceive = async (
        targetKeys: string[] | null,
        complete: boolean,
        noteText: (processed: number) => string,
    ) => {
        if (!orderId) return;
        setBusy('receive');
        try {
            // İndeksler kaydetmeden ÖNCE hesaplanır (kayıt sırayı korur).
            const indexes = targetKeys
                ? targetKeys.map((key) => filledRows.findIndex((row) => row.key === key)).filter((index) => index >= 0)
                : [];
            const persisted = await persistRows();
            if (!persisted) return;
            const result = await purchaseOrdersApi.receive(orderId, complete ? { complete: true } : { lines: indexes.map((index) => ({ index })) });
            adoptOrder(result.order);
            setNote(noteText(result.processedCount));
            if (result.errors.length) toast.error(result.errors.map((entry) => entry.error).join(' · '));
            if (result.order.status === 'COMPLETED') toast.success(t('inv.orders.receive.completed'));
        } catch (err) {
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

    const receiveRow = (row: DraftOrderRow) =>
        void runReceive([row.key], false, () => t('inv.orders.receive.rowSent', { name: row.name }));
    const receiveSelected = () =>
        void runReceive(Array.from(selected), false, (processed) => t('inv.orders.receive.batchSent', { count: processed }));
    const completeReceipt = () =>
        void runReceive(null, true, () => t('inv.orders.receive.completed'));

    const toggleSelected = (key: string) => {
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const openKeys = rows.filter((row) => remainingOf(row) > 0 && (row.articleId || row.name.trim())).map((row) => row.key);

    // Malzeme/ürün birleşmesi (2026-08-14): tek tür kaldı, başlıklar sabit.
    const kindLabels = {
        name: t('inv.columns.productName'),
        pick: t('inv.stock.pickProduct'),
        code: t('inv.columns.serialCode'),
        viewAll: `${t('inv.productPicker.viewAll')} …`,
        allTitle: t('inv.productPicker.allTitle'),
    };

    const columnCount = 12;
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    // (Kanca erken `return`'den ÖNCE çağrılmalı.)
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-order-receive:col-widths:v1',
        defaults: {
            code: 128, quantity: 88, grossPrice: 104, netPrice: 104,
            discount: 88, discount2: 88, lineTotal: 120, mode: 40, send: 80,
        },
        minPx: 40,
    });

    if (loading || !order) {
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader title={t('inv.orders.receive.title')} />
                <div className="py-16 text-center text-[13px] text-slate-400 dark:text-white/50">
                    <LoadingDots label={t('common.loadingData')} />
                </div>
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={(
                    <span className="flex items-center gap-2">
                        {t('inv.orders.receive.title')}
                        <span className="font-mono text-[13px] text-slate-500 dark:text-white/60">{order.referenceNumber}</span>
                        {statusMeta && (
                            <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                                {t(statusMeta.labelKey)}
                            </span>
                        )}
                        {/* Siparişin yanında İKİ İKON (kullanıcı isteği 2026-08-02):
                            SOLDA çöp kutusu (listeyi temizler), SAĞDA kaydet.
                            Ayrı bir "değişiklikleri kaydet" düğmesi YOKTUR. */}
                        {allowed && (
                            <span className="ml-1 flex items-center gap-1">
                                <button
                                    type="button"
                                    disabled={busy !== null || rows.length === 0}
                                    onClick={clearRows}
                                    title={t('inv.orders.receive.clearAll')}
                                    aria-label={t('inv.orders.receive.clearAll')}
                                    className="flex size-9 items-center justify-center rounded-md border border-red-200 text-red-500 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                                >
                                    <Trash01 size={17} />
                                </button>
                                <button
                                    type="button"
                                    disabled={!dirty || busy !== null}
                                    onClick={() => void saveChanges()}
                                    title={t('common.save')}
                                    aria-label={t('common.save')}
                                    className="flex size-9 items-center justify-center rounded-md border border-[#272f67]/30 text-[#272f67] transition-colors hover:bg-[#272f67] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white dark:hover:bg-white/15"
                                >
                                    {busy === 'save'
                                        ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <Save01 size={17} />}
                                </button>
                            </span>
                        )}
                    </span>
                )}
            />

            {/* Künye + TEK SATIRLIK durum metni (popup yerine) + kabul eylemleri. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-3.5 py-2.5 dark:border-white/10">
                <span className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px] text-slate-600 dark:text-white/70">
                    <span>
                        <span className="text-slate-400 dark:text-white/40">{t('inv.columns.supplier')}: </span>
                        {order.supplierName}
                    </span>
                    <span className="font-medium text-slate-700 dark:text-white/80">
                        {note ?? t('inv.orders.receive.hint')}
                    </span>
                    <span className="text-slate-400 dark:text-white/40">
                        {t('inv.orders.receive.progress', { done: receivedCount, total: rows.length })}
                    </span>
                </span>
                {allowed && (
                    <span className="flex items-center gap-1.5">
                        <button
                            type="button"
                            disabled={busy !== null || selected.size === 0}
                            onClick={receiveSelected}
                            className="flex items-center gap-1.5 rounded-md border border-sky-300 px-2.5 py-1.5 text-[12px] font-semibold text-sky-600 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10"
                        >
                            <ArrowUp size={13} />
                            {t('inv.orders.receive.sendSelected', { count: selected.size })}
                        </button>
                        <button
                            type="button"
                            disabled={busy !== null || openKeys.length === 0}
                            onClick={completeReceipt}
                            className="flex items-center gap-1.5 rounded-md bg-emerald-600 px-2.5 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {busy === 'receive'
                                ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                : <CheckCircle size={13} />}
                            {t('inv.orders.receive.completeButton')}
                        </button>
                    </span>
                )}
            </div>

            {/* Araç çubuğu — sipariş editörüyle aynı: kip, Excel, satır ekle.
                ÜRÜN/MALZEME SEÇİCİSİ YOKTUR: tür siparişten devralınır. */}
            {allowed && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                    <span className="flex items-center gap-2">
                    {/* HESAP KİPİ — TEK AÇILIR LİSTE (kullanıcı isteği 2026-08-02, üç
                        düğme yerine). Varsayılan DOĞRUDAN GİRİŞtir. Liste TÜM satırlara
                        uygulanır; tek satır, sağındaki daireden değiştirilir. */}
                    <select
                        value={calcMode}
                        onChange={(event) => changeCalcMode(event.target.value as OrderCalcMode)}
                        title={t('inv.orders.calcMode.hint')}
                        aria-label={t('inv.orders.calcMode.hint')}
                        className="h-[34px] rounded-md border border-slate-300 bg-white px-2.5 text-[12.5px] font-semibold text-slate-600 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white/80"
                    >
                        <option value="DIRECT">{t('inv.orders.calcMode.direct')}</option>
                        <option value="AUTO">{t('inv.orders.calcMode.auto')}</option>
                        <option value="SUPPLIER">{t('inv.orders.calcMode.supplier')}</option>
                    </select>
                </span>
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
            )}

            <SectionCard title={t('inv.orders.receive.sectionTitle', { count: rows.length })}>
                <div className="overflow-x-auto">
                    {/* Satırlar mal kabulde daha FERAH (kullanıcı isteği): yükseklik
                        `.ofi-receive-table` ile büyütülür. Ürün/malzeme sütunu ise
                        daraltıldı — tür zaten siparişten sabit. */}
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-receive-table w-full" style={{ minWidth: 1136 }}>
                        <colgroup>
                            {/* Seçim kutusu sütunu yalnızca yetkiliye çizilir —
                                `<col>` listesi de aynı koşulu izler. */}
                            {allowed && <col style={{ width: 36 }} />}
                            {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['code', 'quantity', 'grossPrice', 'netPrice', 'discount', 'discount2', 'lineTotal', 'mode', 'send'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                {allowed && (
                                    <th className="w-9">
                                        <input
                                            type="checkbox"
                                            checked={openKeys.length > 0 && openKeys.every((key) => selected.has(key))}
                                            onChange={(event) => setSelected(event.target.checked ? new Set(openKeys) : new Set())}
                                            aria-label={t('inv.orders.receive.selectAll')}
                                        />
                                    </th>
                                )}
                                <th className="text-left">{kindLabels.name}</th>
                                <th className="relative text-left">
                                    {kindLabels.code}
                                    <ColResizeHandle {...grid.resizeProps('code')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.quantity')}
                                    <ColResizeHandle {...grid.resizeProps('quantity')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.orders.columns.grossPrice')}
                                    <ColResizeHandle {...grid.resizeProps('grossPrice')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.orders.columns.netPrice')}
                                    <ColResizeHandle {...grid.resizeProps('netPrice')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.orders.columns.discount')}
                                    <ColResizeHandle {...grid.resizeProps('discount')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.orders.columns.discount2')}
                                    <ColResizeHandle {...grid.resizeProps('discount2')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.lineTotal')}
                                    <ColResizeHandle {...grid.resizeProps('lineTotal')} />
                                </th>
                                <th className="relative" aria-label={t('inv.orders.calcMode.rowToggleHint')}>
                                    <ColResizeHandle {...grid.resizeProps('mode')} />
                                </th>
                                {/* "Aktarılan" SÜTUNU YOKTUR (kullanıcı isteği):
                                    aktarılan satır zaten onay işaretiyle görünür. */}
                                <th className="relative" aria-label={t('inv.orders.receive.sendRow')}>
                                    <ColResizeHandle {...grid.resizeProps('send')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columnCount} className="py-12 text-center text-[13px] text-slate-400 dark:text-white/50">
                                        {importing ? <LoadingDots label={t('common.loadingData')} /> : t('inv.orders.editorEmpty')}
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => {
                                const figures = draftRowFigures(row);
                                const rowDirect = row.calcMode === 'DIRECT';
                                const rowSupplier = row.calcMode === 'SUPPLIER';
                                const rowChanged = rowDiffersFromOrigin(row);
                                const done = remainingOf(row) <= 0 && row.receivedQuantity > 0;
                                const editable = allowed && !done;
                                return (
                                    <tr key={row.key} className={done ? 'opacity-60' : (row.error ? 'bg-red-50/60 dark:bg-red-500/10' : undefined)}>
                                        {allowed && (
                                            <td>
                                                <input
                                                    type="checkbox"
                                                    disabled={done}
                                                    checked={selected.has(row.key)}
                                                    onChange={() => toggleSelected(row.key)}
                                                    aria-label={row.name || row.code}
                                                />
                                            </td>
                                        )}
                                        <td>
                                            {editable ? (
                                                <ArticleComboCell
                                                    value={row.name}
                                                    onChange={(next) => onProductTyped(row.key, next)}
                                                    onPick={(article) => onProductPicked(row.key, article)}
                                                    onCreate={(name) => patchRow(row.key, { name, articleId: null, unit: '' })}
                                                    onOpenAll={() => setAllPickerRowKey(row.key)}
                                                    linked={Boolean(row.articleId)}
                                                    canCreate={canCreateArticles}
                                                    autoFocus={row.key === focusRowKey}
                                                    placeholder={kindLabels.pick}
                                                    addLabel={t('inv.productPicker.addNew', { name: row.name.trim() })}
                                                    viewAllLabel={kindLabels.viewAll}
                                                />
                                            ) : (
                                                <span className="text-slate-800 dark:text-white">{row.name}</span>
                                            )}
                                            {row.error && <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>}
                                        </td>
                                        <td>
                                            {editable && (!row.articleId || rowDirect) ? (
                                                <input
                                                    value={row.code}
                                                    onChange={(event) => patchRow(row.key, { code: event.target.value })}
                                                    // Seri kod katalogda varsa o ürün satırın üzerine yazılır.
                                                    onBlur={(event) => void applySerialCodeMatch(row.key, event.target.value)}
                                                    placeholder={kindLabels.code}
                                                    className={`${CELL_INPUT_CLASS} font-mono ${row.name.trim() && !row.code.trim() ? '!border-red-400' : ''}`}
                                                />
                                            ) : (
                                                <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">{row.code || '—'}</span>
                                            )}
                                        </td>
                                        <td>
                                            {editable ? (
                                                <input
                                                    value={row.quantity}
                                                    onChange={(event) => patchRow(row.key, { quantity: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder="1"
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                />
                                            ) : (
                                                <span className="block text-right font-mono text-[13px]">{fmtQty(parseNum(row.quantity) ?? 0)}</span>
                                            )}
                                        </td>
                                        <td>
                                            {editable ? (
                                                <input
                                                    value={row.grossPrice}
                                                    onChange={(event) => patchRow(row.key, { grossPrice: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder="0.00"
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                />
                                            ) : (
                                                <span className="block text-right font-mono text-[13px] text-slate-500 dark:text-white/60">{fmtMoney(parseNum(row.grossPrice) ?? 0)}</span>
                                            )}
                                        </td>
                                        {editable && rowDirect ? (
                                            <td>
                                                <span className="flex items-center gap-1">
                                                    <input
                                                        value={row.netPrice}
                                                        onChange={(event) => patchRow(row.key, { netPrice: event.target.value })}
                                                        inputMode="decimal"
                                                        /* Boş hücrede İNDİRİMLİ fiyat soluk görünür
                                                           (editörle aynı davranış). */
                                                        placeholder={fmtMoney(figures.netUnitPrice)}
                                                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                    />
                                                    {editable && recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        ) : rowSupplier ? (
                                            <td title={t('inv.orders.calcMode.netFixed')}>
                                                <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                    {row.netPrice.trim() ? fmtUnitPricePrecise(parseNum(row.netPrice) ?? 0) : '—'}
                                                    {editable && recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        ) : (
                                            <td title={t('inv.orders.netPriceDerived')}>
                                                <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                    {rowDirect
                                                        ? (row.netPrice.trim() ? fmtMoney(parseNum(row.netPrice) ?? 0) : '—')
                                                        : (row.grossPrice.trim() ? fmtMoney(figures.netUnitPrice) : '—')}
                                                    {editable && recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        )}
                                        <td>
                                            {editable ? (
                                                <input
                                                    value={row.discount}
                                                    onChange={(event) => patchRow(row.key, { discount: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    disabled={rowSupplier}
                                                    title={rowSupplier ? t('inv.orders.calcMode.discountLocked') : undefined}
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono disabled:cursor-not-allowed disabled:opacity-40`}
                                                />
                                            ) : (
                                                <span className="block text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">{row.discount || '—'}</span>
                                            )}
                                        </td>
                                        <td>
                                            {editable ? (
                                                <input
                                                    value={row.discount2}
                                                    onChange={(event) => patchRow(row.key, { discount2: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    disabled={rowSupplier}
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono disabled:cursor-not-allowed disabled:opacity-40`}
                                                />
                                            ) : (
                                                <span className="block text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">{row.discount2 || '—'}</span>
                                            )}
                                        </td>
                                        {editable && rowDirect ? (
                                            <td>
                                                <input
                                                    value={row.lineTotal}
                                                    onChange={(event) => patchRow(row.key, { lineTotal: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder={fmtMoney(figures.lineTotal)}
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                />
                                            </td>
                                        ) : (
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                {fmtMoney(figures.lineTotal)}
                                            </td>
                                        )}
                                        {/* Kip dairesi — editörle birebir aynı davranış. */}
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                disabled={!editable}
                                                onClick={() => cycleRowCalcMode(row)}
                                                title={row.modePinned
                                                    ? `${t(`inv.orders.calcMode.${row.calcMode.toLowerCase()}`)} — ${t('inv.orders.calcMode.rowToggleHint')}`
                                                    : t('inv.orders.calcMode.rowUnset')}
                                                aria-label={t('inv.orders.calcMode.rowToggleHint')}
                                                className={`inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                                                    !row.modePinned
                                                        ? 'border-dashed border-slate-300 text-transparent hover:border-[#1f2654] dark:border-white/25'
                                                        : rowSupplier
                                                            ? 'border-sky-300 text-sky-600 hover:bg-sky-50 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10'
                                                            : rowDirect
                                                                ? 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-white/25 dark:text-white/60 dark:hover:bg-white/10'
                                                                : 'border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-500/40 dark:text-amber-300 dark:hover:bg-amber-500/10'
                                                }`}
                                            >
                                                {row.modePinned
                                                    ? t(`inv.orders.calcMode.${row.calcMode.toLowerCase()}`).slice(0, 1).toUpperCase()
                                                    : '·'}
                                            </button>
                                        </td>
                                        <td>
                                            {allowed && (
                                                <span className="flex items-center justify-end gap-1">
                                                    {done ? (
                                                        /* Aktarılan miktar + zaman artık ayrı sütunda
                                                           değil, onay işaretinin ipucunda durur. */
                                                        <span
                                                            className="inline-flex size-8 items-center justify-center text-emerald-500"
                                                            title={`${t('inv.orders.receive.receivedColumn')}: ${fmtQty(row.receivedQuantity)}${row.receivedAt ? ` · ${fmtDateTime(row.receivedAt)}` : ''}`}
                                                        >
                                                            <Check size={17} />
                                                        </span>
                                                    ) : (
                                                        /* AÇIK MAVİ OK: yalnızca bu satır stoğa gider
                                                           (bekleyen değişiklik önce kaydedilir). */
                                                        <button
                                                            type="button"
                                                            disabled={busy !== null || !(row.articleId || row.name.trim())}
                                                            onClick={() => receiveRow(row)}
                                                            title={t('inv.orders.receive.sendRow')}
                                                            aria-label={t('inv.orders.receive.sendRow')}
                                                            className="inline-flex size-8 items-center justify-center rounded-full border border-sky-300 text-sky-500 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10"
                                                        >
                                                            <ArrowUp size={16} />
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        disabled={busy !== null || done}
                                                        onClick={() => removeRow(row.key)}
                                                        title={t('inv.bulkProducts.removeRow')}
                                                        aria-label={t('inv.bulkProducts.removeRow')}
                                                        className="inline-flex size-8 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-red-500/15"
                                                    >
                                                        <Trash01 size={15} />
                                                    </button>
                                                </span>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            {!allowed && order.status !== 'COMPLETED' && (
                <p className="text-[12px] text-slate-400 dark:text-white/50">{t('inv.orders.receive.notReady')}</p>
            )}
            {order.status === 'COMPLETED' && (
                <p className="text-[12.5px] font-medium text-emerald-600 dark:text-emerald-300">{t('inv.orders.receive.completed')}</p>
            )}

            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
                title={kindLabels.allTitle}
            />
            <ExcelImportSheet
                open={excelOpen}
                onClose={() => setExcelOpen(false)}
                title={t('inv.orders.excelTitle')}
                fields={importFields(calcMode === 'DIRECT')}
                onCommit={(records) => void applyImport(records)}
            />
        </div>
    );
};
