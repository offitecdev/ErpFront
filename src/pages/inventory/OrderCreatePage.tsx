import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, Edit01, Plus, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi, supplyApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import type { ArticleListItem, ItemType, PurchaseOrderItemInput } from '@/types/inventory';
import { ArticleComboCell } from './components/ArticleComboCell';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { BottomSheet } from './components/BottomSheet';
import { DiscountColumnsSheet } from './components/DiscountColumnsSheet';
import { ExcelImportSheet } from './components/ExcelImportSheet';
import { SupplierComboCell } from './components/SupplierComboCell';
import { SupplierPickerModal } from './components/SupplierPickerModal';
import { VatColumnSheet } from './components/VatColumnSheet';
import { ActionTh, CELL_INPUT_CLASS, SectionCard, ToggleGroup } from './components/primitives';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderFee, DraftOrderRow, ImportedRecord } from './types';
import { normalizeHeader } from './utils/columnMatch';
import { fmtMoney, parseNum } from './utils/format';
import { EXTRA_DISCOUNT_KEYS, computeOrderLine, impliedDiscountPercent, vatRatesForCountry } from './utils/orderPricing';
import type { ExtraDiscountKey } from './utils/orderPricing';

let rowSeed = 0;
let feeSeed = 0;

/** Boş ek ücret satırı — detay penceresindeki "ek ücret ekle" bunu ekler. */
const emptyFee = (): DraftOrderFee => ({ key: `fee-${feeSeed += 1}`, name: '', amount: '' });

const INPUT_BASE_CLASS = 'h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-normal normal-case tracking-normal shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';
const HEADER_INPUT_CLASS = `w-full ${INPUT_BASE_CLASS}`;
/** Ek ücret satırı: genişliği satır düzeni verir (w-full çakışmasın). */
const FEE_INPUT_CLASS = INPUT_BASE_CLASS;

/** Yeni satır. KDV oranı tabloda geçerli olan varsayılanla açılır. */
const emptyRow = (itemType: ItemType, vatRate = ''): DraftOrderRow => ({
    key: `order-${rowSeed += 1}`,
    itemType,
    articleId: null,
    code: '',
    serialNumber: '',
    name: '',
    unit: '',
    quantity: '1',
    grossPrice: '',
    discount: '',
    discount2: '',
    discount3: '',
    vatRate,
    error: null,
});

/** Boş satır: Excel aktarımı önce bunları doldurur (stok ekranıyla aynı kural). */
const isBlankRow = (row: DraftOrderRow) => !row.articleId
    && !row.code.trim()
    && !row.name.trim()
    && !row.serialNumber.trim()
    && !row.grossPrice.trim();

/**
 * Excel sihirbazının sipariş hedef kolonları. Stok içe aktarımıyla AYNI biçim
 * (ürün kodu / ad / miktar / birim fiyat) — o dosyalar doğrudan çalışır; brüt
 * fiyat, indirimler ve KDV sipariş tablosuna özgü ek kolonlardır (eşlenmezse
 * boş kalır).
 *
 * ŞABLONDA SERİ NO YOKTUR (kullanıcı isteği 2026-07-30): ürünün tek kimliği
 * SERİ KOD'dur (`articleCode`). `serialNumber` alanı veri modelinde kalır —
 * mevcut siparişler düzenlenirken yüklenip geri kaydedilir ve PDF'te görünür —
 * ama artık ne tabloda ne Excel'de (dışa ya da içe aktarımda) yer alır.
 *
 * İNDİRİM 1-3 ve KDV (kullanıcı isteği 2026-07-30): dışa aktarılan dosya aynı
 * zamanda ŞABLONdur — bu dört yüzde sütunu her zaman yazılır, dolayısıyla geri
 * içe aktarıldığında da eşlenebilmeleri gerekir. Başlıklar birebir aynı olduğu
 * için `autoMap` bunları kendiliğinden bulur.
 */
const importFields = () => ([
    { key: 'articleCode', label: t('inv.columns.serialCode'), keyField: true },
    { key: 'name', label: t('inv.columns.productName'), keyField: true },
    { key: 'quantity', label: t('inv.columns.quantity'), numeric: true },
    { key: 'grossPrice', label: t('inv.orders.columns.grossPrice'), numeric: true },
    { key: 'netPrice', label: t('inv.columns.unitCost'), numeric: true },
    { key: 'discount', label: t('inv.orders.columns.discount'), numeric: true },
    { key: 'discount2', label: t('inv.orders.columns.discount2'), numeric: true },
    { key: 'discount3', label: t('inv.orders.columns.discount3'), numeric: true },
    { key: 'vatRate', label: t('inv.orders.columns.vat'), numeric: true },
]);

const cellText = (value: string | number | null | undefined): string =>
    value === null || value === undefined ? '' : String(value).trim();

/**
 * Yüzde hücresi → tablo metni. "20", "20%", "12,5" kabul edilir; 0-100 dışına
 * taşan ya da okunamayan değer boş bırakılır (satır yine içe aktarılır).
 */
const percentCell = (value: string | number | null | undefined): string => {
    const parsed = parseNum(cellText(value).replace('%', ''));
    if (parsed === null || parsed < 0 || parsed > 100) return '';
    return String(parsed);
};

/**
 * Sipariş oluşturma/düzenleme — stok ekranıyla aynı taslak-tablo deseni.
 * Tedarikçi SİPARİŞ DÜZEYİNDEdir ve üstteki alandan seçilir (tek sipariş = tek
 * tedarikçi): alana yazıldıkça kısa liste açılır, "Tüm tedarikçiler …" büyük
 * pencereyi açar. Ürün seçilince ad/kod/fiyat ve — henüz tedarikçi
 * seçilmemişse — son alım tedarikçisi otomatik dolar ("sipariş kendiliğinden
 * oluşur"), her alan düzenlenebilir kalır.
 * `?id=` ile açılırsa mevcut sipariş yüklenir ve PATCH ile güncellenir
 * (mail gönderilmiş siparişte içerik değişikliği backend'de UPDATED yapar).
 */
export const OrderCreatePage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const editId = searchParams.get('id');
    const permissions = useAuthStore((state) => state.permissions);
    const user = useAuthStore((state) => state.user);
    const pdfSettings = usePdfSettingsStore((state) => state.settings);
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    const [itemKind, setItemKind] = useState<ItemType>('PRODUCT');
    const isMaterial = itemKind === 'MATERIAL';
    // "Auftrag" (sipariş kodu): sunucu BE-{yıl}-{sıra} önerir, kullanıcı
    // değiştirebilir. Boş bırakılırsa (yeni siparişte) sunucu üretir.
    const [reference, setReference] = useState('');
    const [quoteNumber, setQuoteNumber] = useState('');
    const [projectName, setProjectName] = useState('');
    // "Besteller" — siparişi veren kişi; oturumdaki kullanıcının tam adıyla dolar.
    const [orderedByName, setOrderedByName] = useState('');
    const [excelOpen, setExcelOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    // Tedarikçi sipariş düzeyinde tutulur — tek sipariş = tek tedarikçi.
    const [supplier, setSupplier] = useState<{ id: string | null; name: string; email: string | null }>({
        id: null,
        name: '',
        email: null,
    });
    const [rows, setRows] = useState<DraftOrderRow[]>([]);
    // Ek ücretler: sipariş detayları penceresinde ad + tutar olarak girilir ve
    // genel toplama net eklenir (kalem değildir — indirim/KDV taşımaz).
    const [fees, setFees] = useState<DraftOrderFee[]>([]);
    const [feeError, setFeeError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    const [loadingOrder, setLoadingOrder] = useState(Boolean(editId));
    const [editReference, setEditReference] = useState<string | null>(null);
    const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
    const [supplierError, setSupplierError] = useState<string | null>(null);
    const [allPickerRowKey, setAllPickerRowKey] = useState<string | null>(null);
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

    // ── İndirim sütunları ────────────────────────────────────────────────────
    // Ana indirim her zaman görünür; "İndirim" başlığına tıklanınca açılan
    // pencereden en fazla iki ek sütun (İndirim 2 / 3) açılır. Yüzdeler sırayla
    // uygulanır — `utils/orderPricing.ts`.
    const [discountSheetOpen, setDiscountSheetOpen] = useState(false);
    const [extraDiscounts, setExtraDiscounts] = useState<Record<ExtraDiscountKey, boolean>>({
        discount2: false,
        discount3: false,
    });

    // ── KDV sütunu ───────────────────────────────────────────────────────────
    // Başlığa tıklamak sütunu gizler/gösterir ve ülkeye göre oran seçtirir.
    // Varsayılan oran PDF ayarlarındaki şirket KDV oranıdır.
    const [vatSheetOpen, setVatSheetOpen] = useState(false);
    const [vatVisible, setVatVisible] = useState(true);
    const [vatCountry, setVatCountry] = useState(() => vatRatesForCountry(pdfSettings.country).code);
    const [defaultVatRate, setDefaultVatRate] = useState(() => String(pdfSettings.vatRate ?? 0));
    const [customVatRates, setCustomVatRates] = useState<Record<string, number[]>>({});

    // Yeni siparişte "Besteller" alanı oturumdaki kullanıcının tam adıyla dolar;
    // kullanıcı üzerine yazabilir (düzenlemede kaydın kendi değeri korunur).
    useEffect(() => {
        if (editId || !user) return;
        setOrderedByName((current) => current || `${user.firstName} ${user.lastName}`.trim());
    }, [editId, user]);

    // Düzenleme: sipariş satırları taslak tabloya yüklenir.
    useEffect(() => {
        if (!editId) return;
        let cancelled = false;
        setLoadingOrder(true);
        purchaseOrdersApi
            .get(editId)
            .then((order) => {
                if (cancelled) return;
                if (order.status === 'COMPLETED') {
                    toast.error(t('inv.orders.editCompleted'));
                    navigate('/inventory/orders');
                    return;
                }
                setReference(order.referenceNumber);
                setQuoteNumber(order.quoteNumber ?? '');
                setProjectName(order.projectName ?? '');
                setOrderedByName(order.orderedByName ?? '');
                setEditReference(order.referenceNumber);
                setSupplier({
                    id: order.supplierId ?? null,
                    name: order.supplierName,
                    email: order.supplierEmail ?? null,
                });
                setRows(order.items.map((item) => {
                    // Yüzde yazılmadan net fiyat düşürülerek indirim verilmiş eski
                    // satırlar: gizli indirim yüzdeye çevrilir, tutar korunur.
                    const implied = impliedDiscountPercent(item);
                    return {
                        ...emptyRow(item.itemType),
                        itemType: item.itemType,
                        articleId: item.articleId ?? null,
                        code: item.code ?? '',
                        serialNumber: item.serialNumber ?? '',
                        name: item.name,
                        unit: item.unit ?? '',
                        quantity: String(item.quantity),
                        // Brüt fiyat tek fiyat girişidir; eski kayıtta yoksa net fiyat taban olur.
                        grossPrice: String(item.grossPrice || item.netPrice || ''),
                        discount: implied ? String(implied) : (item.discount ? String(item.discount) : ''),
                        discount2: item.discount2 ? String(item.discount2) : '',
                        discount3: item.discount3 ? String(item.discount3) : '',
                        vatRate: item.vatRate ? String(item.vatRate) : '',
                    };
                }));
                setFees((order.additionalFees ?? []).map((fee) => ({
                    ...emptyFee(),
                    name: fee.name,
                    amount: fee.amount ? String(fee.amount) : '',
                })));
                // Kayıtta dolu olan ek indirim / KDV sütunları kendiliğinden açılır —
                // aksi hâlde girilmiş bir indirim gizli kalır ve sessizce silinirdi.
                setExtraDiscounts({
                    discount2: order.items.some((item) => (item.discount2 ?? 0) > 0),
                    discount3: order.items.some((item) => (item.discount3 ?? 0) > 0),
                });
                setVatVisible(order.items.some((item) => (item.vatRate ?? 0) > 0));
            })
            .catch((err) => {
                toast.error(err?.response?.data?.error || t('inv.orders.loadFailed'));
                navigate('/inventory/orders');
            })
            .finally(() => { if (!cancelled) setLoadingOrder(false); });
        return () => { cancelled = true; };
    }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

    const patchRow = (key: string, patch: Partial<DraftOrderRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row)));
    };

    const addRow = () => {
        const row = emptyRow(itemKind, vatVisible ? defaultVatRate : '');
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    /** KDV oranını tüm satırlara uygula (pencereden seçilen oran). */
    const applyVatRateToAllRows = (rate: number) => {
        const next = String(rate);
        setDefaultVatRate(next);
        setRows((current) => current.map((row) => ({ ...row, vatRate: next })));
    };

    /**
     * Sütun kapatılınca o sütunun DEĞERLERİ de temizlenir: gizli bir yüzde
     * kaydedilip toplamı sessizce düşürmesin.
     */
    const toggleExtraDiscount = (key: ExtraDiscountKey, next: boolean) => {
        setExtraDiscounts((current) => ({ ...current, [key]: next }));
        if (!next) setRows((current) => current.map((row) => ({ ...row, [key]: '' })));
    };

    const toggleVatColumn = (next: boolean) => {
        setVatVisible(next);
        setRows((current) => current.map((row) => ({ ...row, vatRate: next ? (row.vatRate || defaultVatRate) : '' })));
    };

    const onProductTyped = (rowKey: string, text: string) => {
        setRows((current) => current.map((row) => (row.key === rowKey
            ? {
                ...row,
                name: text,
                error: null,
                ...(row.articleId ? { articleId: null, code: '', unit: '' } : {}),
            }
            : row)));
    };

    /**
     * Ürün seçildi: ad/kod/birim ve varsayılan BRÜT birim fiyat (baseCost) dolar;
     * ardından alım geçmişinden son alım fiyatı çekilir. İndirimler bu brüt
     * fiyatın üzerine ineceği için fiyat DAİMA brüt sütuna yazılır. Sipariş
     * tedarikçisi henüz boşsa o da son alım tedarikçisiyle doldurulur — kullanıcı
     * üstteki alandan istediği zaman değiştirebilir.
     */
    const onProductPicked = (rowKey: string, article: ArticleListItem) => {
        setRows((current) => current.map((row) => (row.key === rowKey
            ? {
                ...row,
                itemType: itemKind,
                articleId: article.id,
                code: article.articleCode,
                name: article.name,
                unit: article.unit,
                grossPrice: row.grossPrice || (article.baseCost ? String(article.baseCost) : ''),
                error: null,
            }
            : row)));
        void supplyApi.itemSuppliers(itemKind, article.id)
            .then((result) => {
                const best = result.suppliers[0];
                if (!best) return;
                setSupplier((current) => (current.id || current.name.trim()
                    ? current
                    : { id: best.supplierId, name: best.companyName, email: best.email ?? null }));
                setRows((current) => current.map((row) => (row.key === rowKey && row.articleId === article.id
                    ? { ...row, grossPrice: row.grossPrice || (best.lastPurchasePrice ? String(best.lastPurchasePrice) : row.grossPrice) }
                    : row)));
            })
            .catch(() => { /* öneri gelmezse satır elle doldurulur */ });
    };

    const markAsNewArticle = (rowKey: string, name: string) => {
        patchRow(rowKey, { name, articleId: null, unit: '' });
    };

    /**
     * Excel satırlarını ürünlere bağla — stok ekranındaki akışın aynısı: önce
     * kod, sonra ad (normalize edilmiş) eşleşir. Eşleşmeyen satır ATILMAZ, yeni
     * ürün satırı olarak girer; kaydetmede ürün listesine 0 adetle açılır
     * (STOĞA GİRMEZ — sipariş stok hareketi değildir).
     */
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
                const vatRate = percentCell(record.vatRate);
                additions.push({
                    ...emptyRow(itemKind, vatVisible ? defaultVatRate : ''),
                    articleId: article ? article.id : null,
                    code: article ? article.articleCode : code,
                    name: article ? article.name : name,
                    unit: article ? article.unit : '',
                    // Seri no içe aktarılmaz (şablonda sütunu yok); satırın seri
                    // kodu ürünün kimliğidir.
                    quantity: cellText(record.quantity) || '1',
                    // Tek fiyat girişi BRÜTtür: dosyada brüt yoksa net/birim fiyat
                    // sütunu, o da yoksa ürünün alış fiyatı taban olur.
                    grossPrice: cellText(record.grossPrice)
                        || cellText(record.netPrice)
                        || (article?.baseCost ? String(article.baseCost) : ''),
                    // İndirimler ve KDV dosyadan aynen gelir; eşlenmemiş sütun boş
                    // kalır (KDV'de tablonun varsayılan oranı korunur).
                    discount: percentCell(record.discount),
                    discount2: percentCell(record.discount2),
                    discount3: percentCell(record.discount3),
                    vatRate: vatRate || (vatVisible ? defaultVatRate : ''),
                });
            });

            setRows((current) => {
                // Önce tablodaki boş satırlar doldurulur (anahtar korunur), kalanlar sona eklenir.
                const next = [...current];
                let cursor = 0;
                for (let index = 0; index < next.length && cursor < additions.length; index += 1) {
                    if (!isBlankRow(next[index])) continue;
                    next[index] = { ...additions[cursor], key: next[index].key };
                    cursor += 1;
                }
                return [...next, ...additions.slice(cursor)];
            });

            // Dosyadan indirim 2/3 ya da KDV geldiyse o sütunlar KENDİLİĞİNDEN
            // açılır: kapalı sütunun değeri kaydetmede sıfırlanacağı için içe
            // aktarılan yüzde aksi hâlde sessizce kaybolurdu.
            const hasValue = (key: 'discount2' | 'discount3' | 'vatRate') =>
                additions.some((row) => (parseNum(row[key]) ?? 0) > 0);
            setExtraDiscounts((current) => ({
                discount2: current.discount2 || hasValue('discount2'),
                discount3: current.discount3 || hasValue('discount3'),
            }));
            if (hasValue('vatRate')) setVatVisible(true);
        } catch {
            toast.error(t('inv.stock.importMatchFailed'));
        } finally {
            setImporting(false);
        }
    };

    const filledRows = useMemo(() => rows.filter((row) => row.articleId || row.name.trim()), [rows]);

    // ── Ek ücretler ──────────────────────────────────────────────────────────
    const patchFee = (key: string, patch: Partial<DraftOrderFee>) => {
        setFees((current) => current.map((fee) => (fee.key === key ? { ...fee, ...patch } : fee)));
        setFeeError(null);
    };
    const addFee = () => { setFees((current) => [...current, emptyFee()]); setFeeError(null); };
    const removeFee = (key: string) => {
        setFees((current) => current.filter((fee) => fee.key !== key));
        setFeeError(null);
    };
    /** Adı ya da tutarı girilmiş satırlar — tamamen boş taslaklar atılır. */
    const filledFees = useMemo(
        () => fees.filter((fee) => fee.name.trim() || fee.amount.trim()),
        [fees],
    );
    const feesTotal = useMemo(
        () => filledFees.reduce((sum, fee) => sum + (parseNum(fee.amount) ?? 0), 0),
        [filledFees],
    );

    /**
     * Satırın tutarları — tabloda ve toplamlarda aynı fonksiyon (backend eşi).
     * Brüt birim fiyat × miktar = brüt tutar; indirimler SIRAYLA onun üzerine iner.
     */
    const rowFigures = (row: DraftOrderRow) => computeOrderLine({
        quantity: parseNum(row.quantity) ?? 0,
        grossPrice: parseNum(row.grossPrice) ?? 0,
        discount: parseNum(row.discount) ?? 0,
        discount2: parseNum(row.discount2) ?? 0,
        discount3: parseNum(row.discount3) ?? 0,
        vatRate: parseNum(row.vatRate) ?? 0,
    });

    const totals = useMemo(() => rows.reduce(
        (acc, row) => {
            const figures = rowFigures(row);
            acc.quantity += parseNum(row.quantity) ?? 0;
            acc.net += figures.lineTotal;
            acc.discount += figures.discountAmount;
            acc.vat += figures.lineVat;
            return acc;
        },
        { quantity: 0, net: 0, discount: 0, vat: 0 },
    ), [rows]);

    const rowToItem = (row: DraftOrderRow, articleId?: string): PurchaseOrderItemInput => ({
        itemType: row.itemType,
        articleId: articleId ?? row.articleId,
        code: row.code.trim() || null,
        serialNumber: row.serialNumber.trim() || null,
        name: row.name.trim(),
        quantity: parseNum(row.quantity) ?? 1,
        unit: row.unit || null,
        grossPrice: parseNum(row.grossPrice) ?? 0,
        // Net fiyat TÜRETİLMİŞTİR (brüt × indirim çarpanı); sunucu da aynı
        // hesabı yaptığı için bu değer yalnızca isteğin okunabilirliği içindir.
        netPrice: rowFigures(row).netUnitPrice,
        // Kapalı sütunlar 0 gönderilir; sunucu toplamları yine kendi hesaplar.
        discount: parseNum(row.discount) ?? 0,
        discount2: extraDiscounts.discount2 ? (parseNum(row.discount2) ?? 0) : 0,
        discount3: extraDiscounts.discount3 ? (parseNum(row.discount3) ?? 0) : 0,
        vatRate: vatVisible ? (parseNum(row.vatRate) ?? 0) : 0,
    });

    /**
     * Kaydet. Doğrulama tamamen istek ÖNCESİ yapılır. Yeni ürün satırları önce
     * ürün listesine 0 adetle (tanım kaydı) yazılır — sipariş gerçek ürünlere
     * bağlanır; ardından üstteki tedarikçiyle TEK sipariş oluşturulur ya da
     * düzenleme modunda mevcut sipariş PATCH edilir.
     */
    const save = async () => {
        if (!filledRows.length) return;

        if (!supplier.id && !supplier.name.trim()) {
            setSupplierError(t('inv.orders.supplierRequired'));
            return;
        }

        // Tutarı girilip adı boş bırakılmış ek ücret kaydedilmez: toplama giren
        // ama neyin ücreti olduğu belirsiz bir satır sessizce geçmesin.
        if (filledFees.some((fee) => !fee.name.trim())) {
            setFeeError(t('inv.orders.fees.nameRequired'));
            setDetailsOpen(true);
            return;
        }

        const rowErrors = new Map<string, string>();
        filledRows.forEach((row) => {
            if (row.articleId) return;
            if (!canCreateArticles) rowErrors.set(row.key, t('inv.bulkProducts.noPermission'));
            else if (!row.code.trim()) rowErrors.set(row.key, t('inv.stock.codeRequired'));
        });
        if (rowErrors.size) {
            setRows((current) => current.map((row) => (rowErrors.has(row.key)
                ? { ...row, error: rowErrors.get(row.key) ?? null }
                : row)));
            return;
        }

        setSaving(true);
        try {
            // 1) Yeni ürünler ürün listesine 0 adetle açılır (DEFINITION kaydı) —
            //    tür başına ayrı toplu çağrı; dönen id satıra bağlanır.
            const createdIds = new Map<string, string>();
            for (const kind of ['PRODUCT', 'MATERIAL'] as ItemType[]) {
                const newRows = filledRows.filter((row) => !row.articleId && row.itemType === kind);
                if (!newRows.length) continue;
                const result = await inventoryApi.bulkCreateArticles(newRows.map((row) => ({
                    articleCode: row.code.trim(),
                    name: row.name.trim(),
                    quantity: 0,
                    // Ürünün alış fiyatı İNDİRİMLİ birim fiyattır (gerçekten ödenen).
                    purchasePrice: rowFigures(row).netUnitPrice,
                    supplierId: supplier.id,
                    supplierName: supplier.id ? null : (supplier.name.trim() || null),
                    unit: row.unit || null,
                })), kind);
                if (result.errors.length) {
                    const failed = new Map<string, string>();
                    result.errors.forEach((error) => {
                        const row = newRows[error.index];
                        if (row) failed.set(row.key, error.error);
                    });
                    setRows((current) => current.map((row) => (failed.has(row.key)
                        ? { ...row, error: failed.get(row.key) ?? null }
                        : row)));
                    toast.error(t('inv.orders.newArticlesFailed', { count: result.errors.length }));
                    return;
                }
                result.created.forEach((created) => {
                    const row = newRows.find((candidate) => !createdIds.has(candidate.key)
                        && candidate.code.trim().toLowerCase() === created.articleCode.toLowerCase());
                    if (row) createdIds.set(row.key, created.id);
                });
            }

            const items = filledRows.map((row) => rowToItem(row, createdIds.get(row.key)));
            const header = {
                quoteNumber: quoteNumber.trim() || null,
                orderedByName: orderedByName.trim() || null,
                projectName: projectName.trim() || null,
                supplierId: supplier.id,
                supplierName: supplier.name.trim(),
                supplierEmail: supplier.email,
                items,
                // Ek ücretler her kayıtta gönderilir (boş dizi = ücret yok) ki
                // düzenlemede silinen ücret sunucuda da silinsin.
                additionalFees: filledFees.map((fee) => ({
                    name: fee.name.trim(),
                    amount: parseNum(fee.amount) ?? 0,
                })),
            };
            if (editId) {
                await purchaseOrdersApi.update(editId, {
                    ...header,
                    ...(reference.trim() ? { referenceNumber: reference.trim() } : {}),
                });
                toast.success(t('inv.orders.updatedToast'));
            } else {
                // 2) Tek sipariş = tek tedarikçi (üstten seçilen). Auftrag boşsa sunucu üretir.
                await purchaseOrdersApi.create([{ ...header, referenceNumber: reference.trim() || null }]);
                toast.success(t('inv.orders.createdToast', { count: 1 }));
            }
            navigate('/inventory/orders');
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.saveFailed'));
        } finally {
            setSaving(false);
        }
    };


    // Görünür sütun sayısı: sabit 7 (ürün, kod, miktar, brüt, net, indirim,
    // tutar) + eylem sütunu; açık ek indirimler ve KDV üstüne eklenir.
    const optionalColumns = EXTRA_DISCOUNT_KEYS.filter((key) => extraDiscounts[key]).length
        + (vatVisible ? 1 : 0);
    const columnCount = 8 + optionalColumns;
    const tableMinWidth = 900 + optionalColumns * 96;

    const kindLabels = {
        pick: t(isMaterial ? 'inv.stock.pickMaterial' : 'inv.stock.pickProduct'),
        code: t(isMaterial ? 'inv.columns.materialCode' : 'inv.columns.serialCode'),
        viewAll: `${t(isMaterial ? 'inv.materialPicker.viewAll' : 'inv.productPicker.viewAll')} …`,
        allTitle: t(isMaterial ? 'inv.materialPicker.allTitle' : 'inv.productPicker.allTitle'),
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={(
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={t('common.back')}
                            onClick={() => navigate('/inventory/orders')}
                            className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        {editId
                            ? `${t('inv.orders.editTitle')}${editReference ? ` · ${editReference}` : ''}`
                            : t('inv.orders.createTitle')}
                    </span>
                )}
            />

            <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-3">
                    {/* Tedarikçi: sipariş düzeyinde tek seçim, her zaman görünür
                        (kaydetmek için zorunlu). Alana yazıldıkça kısa liste açılır;
                        "Tüm tedarikçiler …" büyük pencereyi açar. */}
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.columns.supplier')}
                        <div className="w-72">
                            <SupplierComboCell
                                value={supplier.name}
                                onChange={(next) => { setSupplier({ id: null, name: next, email: null }); setSupplierError(null); }}
                                onSelect={(choice) => {
                                    setSupplier({ id: choice.supplierId, name: choice.supplierName, email: null });
                                    setSupplierError(null);
                                }}
                                onOpenAll={() => setSupplierPickerOpen(true)}
                                viewAllLabel={`${t('inv.orders.allSuppliers')} …`}
                                placeholder={t('inv.orders.supplierPlaceholder')}
                                inputClassName={`!h-9 !text-[13px] ${supplierError ? '!border-red-400' : ''}`}
                            />
                        </div>
                        {supplierError && <span className="text-[11px] font-semibold normal-case tracking-normal text-red-500">{supplierError}</span>}
                    </label>

                    {/* Sipariş detayları: kırmızı kalem — alttan açılan pencerede
                        Auftrag / Besteller / proje / teklif no girilir. Hiçbiri zorunlu
                        değildir; Auftrag boş bırakılırsa sunucu BE-{yıl}-{sıra} üretir.
                        Düğmenin ALTINDA özet YAZILMAZ (kullanıcı isteği) — girilen
                        değerler yalnızca pencerede görünür. */}
                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={() => setDetailsOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-[#d32026]/40 px-3 text-[12.5px] font-semibold text-[#d32026] transition-colors hover:bg-[#d32026] hover:text-white"
                        >
                            <Edit01 size={13} />
                            {t('inv.orders.detailsButton')}
                        </button>
                    </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                <ToggleGroup
                    options={[
                        { key: 'PRODUCT' as ItemType, label: t('inv.stock.kindProduct') },
                        { key: 'MATERIAL' as ItemType, label: t('inv.stock.kindMaterial') },
                    ]}
                    value={itemKind}
                    onChange={setItemKind}
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

            <SectionCard
                title={t('inv.orders.sectionEditor', { count: filledRows.length })}
                action={(
                    <span className="flex items-baseline gap-3">
                        {/* KDV sutunu gizliyken geri acma baglantisi burada durur —
                            tablonun eylem sutunu basligi bos kalir. */}
                        {!vatVisible && (
                            <button
                                type="button"
                                onClick={() => setVatSheetOpen(true)}
                                className="text-[12px] font-semibold text-slate-400 underline decoration-dotted underline-offset-[3px] transition-colors hover:text-[#1f2654] dark:text-white/50 dark:hover:text-white"
                            >
                                {t('inv.orders.vatColumn.headerHintHidden')}
                            </button>
                        )}
                        {rows.length > 0 && (
                            <span className="flex items-baseline gap-2 font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                {/* Döküm: net + ek ücretler + KDV = genel toplam.
                                    Yalnızca dolu olan bileşenler yazılır. */}
                                {(totals.vat > 0 || feesTotal !== 0) && (
                                    <span className="text-[11.5px]">
                                        {[
                                            `${t('inv.orders.totalNet')} ${fmtMoney(totals.net)}`,
                                            ...(feesTotal !== 0 ? [`${t('inv.orders.fees.title')} ${fmtMoney(feesTotal)}`] : []),
                                            ...(totals.vat > 0 ? [`${t('inv.orders.columns.vat')} ${fmtMoney(totals.vat)}`] : []),
                                        ].join(' + ')} =
                                    </span>
                                )}
                                <span className="font-semibold text-slate-700 dark:text-white/80">
                                    {fmtMoney(totals.net + feesTotal + totals.vat)}
                                </span>
                            </span>
                        )}
                    </span>
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-unstyled-table className="w-full" style={{ minWidth: tableMinWidth }}>
                        <thead>
                            <tr>
                                <th className="text-left">{t('inv.columns.item')}</th>
                                <th className="w-36 text-left">{kindLabels.code}</th>
                                <th className="w-24 text-right">{t('inv.columns.quantity')}</th>
                                <th className="w-28 text-right">{t('inv.orders.columns.grossPrice')}</th>
                                <th className="w-28 text-right">{t('inv.orders.columns.netPrice')}</th>
                                {/* İndirim: başlık altı çizili — tıklanınca İndirim 2 / 3
                                    sütunlarını açan pencere gelir. Yüzdeler sırayla uygulanır. */}
                                <ActionTh
                                    label={t('inv.orders.columns.discount')}
                                    onClick={() => setDiscountSheetOpen(true)}
                                    active={extraDiscounts.discount2 || extraDiscounts.discount3}
                                    hint={t('inv.orders.discountColumns.headerHint')}
                                    className="w-24 text-right"
                                />
                                {EXTRA_DISCOUNT_KEYS.filter((key) => extraDiscounts[key]).map((key) => (
                                    <th key={key} className="w-24 text-right">
                                        {t(`inv.orders.columns.${key}`)}
                                    </th>
                                ))}
                                {/* KDV: başlık altı çizili — sütunu gizler/gösterir ve
                                    ülkeye göre oran seçtirir. */}
                                {vatVisible && (
                                    <ActionTh
                                        label={t('inv.orders.columns.vat')}
                                        onClick={() => setVatSheetOpen(true)}
                                        active
                                        hint={t('inv.orders.vatColumn.headerHint')}
                                        className="w-24 text-right"
                                    />
                                )}
                                <th className="w-32 text-right">{t('inv.columns.lineTotal')}</th>
                                <th className="w-12" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columnCount} className="py-12 text-center text-[13px] text-slate-400 dark:text-white/50">
                                        {/* Sipariş yükleniyor ya da Excel satırları
                                            eşleştiriliyor: hesabın sürdüğünü yazı +
                                            yanıp sönen noktalar gösterir. */}
                                        {loadingOrder || importing
                                            ? <LoadingDots label={t('common.loadingData')} />
                                            : t('inv.orders.editorEmpty')}
                                    </td>
                                </tr>
                            )}
                            {rows.map((row) => {
                                const figures = rowFigures(row);
                                return (
                                    <tr key={row.key} className={row.error ? 'bg-red-50/60 dark:bg-red-500/10' : undefined}>
                                        <td>
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
                                            {row.error && (
                                                <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                            )}
                                        </td>
                                        <td>
                                            {row.articleId ? (
                                                <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                                    {row.code}
                                                </span>
                                            ) : (
                                                <input
                                                    value={row.code}
                                                    onChange={(event) => patchRow(row.key, { code: event.target.value })}
                                                    placeholder={kindLabels.code}
                                                    className={`${CELL_INPUT_CLASS} font-mono ${row.name.trim() && !row.code.trim() ? '!border-red-400' : ''}`}
                                                />
                                            )}
                                        </td>
                                        <td>
                                            <input
                                                value={row.quantity}
                                                onChange={(event) => patchRow(row.key, { quantity: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="1"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                value={row.grossPrice}
                                                onChange={(event) => patchRow(row.key, { grossPrice: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                            />
                                        </td>
                                        {/* NET FİYAT TÜRETİLMİŞTİR: brüt birim fiyat ×
                                            indirim çarpanı. Elle girilemez — girilebilse
                                            indirim yüzdeleriyle çelişirdi (eski hata). */}
                                        <td
                                            className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60"
                                            title={t('inv.orders.netPriceDerived')}
                                        >
                                            {row.grossPrice.trim() ? fmtMoney(figures.netUnitPrice) : '—'}
                                        </td>
                                        {/* İndirim yüzdeleri: ana indirim + açık olan ek sütunlar. */}
                                        <td>
                                            <input
                                                value={row.discount}
                                                onChange={(event) => patchRow(row.key, { discount: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                            />
                                        </td>
                                        {EXTRA_DISCOUNT_KEYS.filter((key) => extraDiscounts[key]).map((key) => (
                                            <td key={key}>
                                                <input
                                                    value={row[key]}
                                                    onChange={(event) => patchRow(row.key, { [key]: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder="0"
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                />
                                            </td>
                                        ))}
                                        {vatVisible && (
                                            <td>
                                                <input
                                                    value={row.vatRate}
                                                    onChange={(event) => patchRow(row.key, { vatRate: event.target.value })}
                                                    inputMode="decimal"
                                                    placeholder={defaultVatRate}
                                                    className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                />
                                            </td>
                                        )}
                                        {/* Satır tutarı NET'tir (indirimler uygulanmış); KDV
                                            görünürken tutarın altında ayrıca yazılır. */}
                                        <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                            {fmtMoney(figures.lineTotal)}
                                            {figures.lineVat > 0 && (
                                                <span className="block text-[10.5px] text-slate-400 dark:text-white/50">
                                                    {`+ ${fmtMoney(figures.lineVat)}`}
                                                </span>
                                            )}
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
                </div>
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
                            {/* Kaydetme sırasında sunucu toplamları yeniden hesaplar —
                                düğme de yanıp sönen noktalarla bunu gösterir. */}
                            {saving
                                ? <LoadingDots label={t('common.loadingData')} />
                                : editId
                                    ? t('inv.orders.saveEdit')
                                    : t('inv.orders.saveCreate', { count: filledRows.length })}
                        </button>
                    </div>
                )}
            </SectionCard>

            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
                itemType={itemKind}
                title={kindLabels.allTitle}
            />
            {/* Sipariş detayları penceresi — alttan yükselen sheet. Tüm alanlar
                opsiyoneldir; sipariş kodu boş bırakılırsa sunucu üretir. */}
            <BottomSheet
                open={detailsOpen}
                onClose={() => setDetailsOpen(false)}
                title={t('inv.orders.detailsTitle')}
                subtitle={t('inv.orders.detailsHint')}
                width={720}
                height={620}
                footer={(
                    <>
                        <span className="text-[11.5px] text-slate-400 dark:text-white/50">{t('inv.orders.detailsHint')}</span>
                        <button
                            type="button"
                            onClick={() => setDetailsOpen(false)}
                            className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                        >
                            {t('common.done')}
                        </button>
                    </>
                )}
            >
                <div className="grid gap-3.5 p-4 sm:grid-cols-2">
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.columns.reference')}
                        <input
                            value={reference}
                            onChange={(event) => setReference(event.target.value)}
                            placeholder={t('inv.orders.referencePlaceholder')}
                            className={`${HEADER_INPUT_CLASS} font-mono`}
                        />
                    </label>
                    {/* "Besteller": siparişi veren kişi — kullanıcının tam adıyla dolar. */}
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.columns.orderedBy')}
                        <input
                            value={orderedByName}
                            onChange={(event) => setOrderedByName(event.target.value)}
                            placeholder={t('inv.orders.columns.orderedBy')}
                            className={HEADER_INPUT_CLASS}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.columns.project')}
                        <input
                            value={projectName}
                            onChange={(event) => setProjectName(event.target.value)}
                            placeholder={t('inv.orders.projectPlaceholder')}
                            className={HEADER_INPUT_CLASS}
                        />
                    </label>
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.columns.quoteNumber')}
                        <input
                            value={quoteNumber}
                            onChange={(event) => setQuoteNumber(event.target.value)}
                            placeholder={t('inv.orders.quotePlaceholder')}
                            className={`${HEADER_INPUT_CLASS} font-mono`}
                        />
                    </label>
                </div>

                {/* EK ÜCRETLER — nakliye, ambalaj, montaj… Her satır ad + tutar
                    taşır; tutarlar genel toplama NET eklenir (indirim/KDV yok).
                    Adı boş bırakılan tutar kaydedilmez (`save` uyarır). */}
                <div className="border-t border-slate-200 px-4 pb-4 pt-3.5 dark:border-white/10">
                    <div className="flex items-baseline justify-between gap-3">
                        <div className="flex flex-col">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                                {t('inv.orders.fees.title')}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-white/40">{t('inv.orders.fees.hint')}</span>
                        </div>
                        {filledFees.length > 0 && (
                            <span className="font-mono text-[12.5px] font-semibold text-slate-700 dark:text-white/80">
                                {fmtMoney(feesTotal)}
                            </span>
                        )}
                    </div>

                    <div className="mt-2.5 flex flex-col gap-2">
                        {fees.length === 0 && (
                            <span className="text-[12px] text-slate-400 dark:text-white/50">{t('inv.orders.fees.empty')}</span>
                        )}
                        {fees.map((fee) => (
                            <div key={fee.key} className="flex items-center gap-2">
                                <input
                                    value={fee.name}
                                    onChange={(event) => patchFee(fee.key, { name: event.target.value })}
                                    placeholder={t('inv.orders.fees.namePlaceholder')}
                                    className={`${FEE_INPUT_CLASS} min-w-0 flex-1 ${feeError && !fee.name.trim() ? '!border-red-400' : ''}`}
                                />
                                <input
                                    value={fee.amount}
                                    onChange={(event) => patchFee(fee.key, { amount: event.target.value })}
                                    inputMode="decimal"
                                    placeholder="0.00"
                                    aria-label={t('inv.orders.fees.amountLabel')}
                                    className={`${FEE_INPUT_CLASS} w-32 shrink-0 text-right font-mono`}
                                />
                                <button
                                    type="button"
                                    aria-label={t('inv.orders.fees.removeRow')}
                                    title={t('inv.orders.fees.removeRow')}
                                    onClick={() => removeFee(fee.key)}
                                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/15"
                                >
                                    <Trash01 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {feeError && (
                        <span className="mt-1.5 block text-[11px] font-semibold text-red-500">{feeError}</span>
                    )}

                    <button
                        type="button"
                        onClick={addFee}
                        className="mt-2.5 flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/60"
                    >
                        <Plus size={12} />
                        {t('inv.orders.fees.addButton')}
                    </button>
                </div>
            </BottomSheet>

            {/* Sütun ayar pencereleri — başlıklara (altı çizili) tıklanınca açılır. */}
            <DiscountColumnsSheet
                open={discountSheetOpen}
                onClose={() => setDiscountSheetOpen(false)}
                enabled={extraDiscounts}
                onToggle={toggleExtraDiscount}
                sample={{
                    discount: parseNum(rows[0]?.discount) ?? 0,
                    discount2: parseNum(rows[0]?.discount2) ?? 0,
                    discount3: parseNum(rows[0]?.discount3) ?? 0,
                }}
            />
            <VatColumnSheet
                open={vatSheetOpen}
                onClose={() => setVatSheetOpen(false)}
                visible={vatVisible}
                onVisibleChange={toggleVatColumn}
                country={vatCountry}
                onCountryChange={setVatCountry}
                customRates={customVatRates}
                onAddCustomRate={(code, rate) => setCustomVatRates((current) => ({
                    ...current,
                    [code]: [...(current[code] ?? []), rate],
                }))}
                onApplyRate={applyVatRateToAllRows}
            />

            <ExcelImportSheet
                open={excelOpen}
                onClose={() => setExcelOpen(false)}
                title={t('inv.orders.excelTitle')}
                fields={importFields()}
                onCommit={(records) => void applyImport(records)}
            />
            <SupplierPickerModal
                open={supplierPickerOpen}
                onClose={() => setSupplierPickerOpen(false)}
                onPick={(picked) => {
                    setSupplier({ id: picked.id, name: picked.companyName, email: picked.email ?? null });
                    setSupplierError(null);
                }}
            />
        </div>
    );
};
