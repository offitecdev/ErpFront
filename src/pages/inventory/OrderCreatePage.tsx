import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, CheckCircle, ChevronLeft, ChevronRight, Coins01, Edit01, File05, Plus, RefreshCcw01, Save01, ShoppingCart01, Trash01, UploadCloud02 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi, supplyApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import type {
    ArticleListItem,
    ItemType,
    PurchaseOrderItemInput,
    PurchaseOrderStatus,
    PurchaseOrderTextTemplate,
} from '@/types/inventory';
import { ArticleComboCell } from './components/ArticleComboCell';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { BottomSheet } from './components/BottomSheet';
import { ExcelImportSheet } from './components/ExcelImportSheet';
import { SupplierComboCell } from './components/SupplierComboCell';
import { SupplierPickerModal } from './components/SupplierPickerModal';
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderFee, DraftOrderRow, ImportedRecord } from './types';
import { normalizeHeader } from './utils/columnMatch';
import { mergeImportedOrderRows } from './utils/orderImport';
import { fmtMoney, fmtUnitPricePrecise, parseNum } from './utils/format';
import {
    allVatCountries,
    clampPercent,
    computeOrderTotals,
    fmtPercent,
    foldedExtraDiscount,
    impliedDiscountPercent,
    round2,
    saveCustomVatCountry,
    vatRatesForCountry,
} from './utils/orderPricing';
import {
    captureRowOrigin,
    cycleRowMode,
    draftRowFigures,
    restoreRowOrigin,
    rowDiffersFromOrigin,
    transitionRowMode,
} from './utils/orderRowMode';
import { canConfirmToOrder, canConvertToOrder, isEditableStage, isPriceRequestStage } from './utils/orderStatus';

let rowSeed = 0;
let feeSeed = 0;

/** Boş ek ücret satırı — detay penceresindeki "ek ücret ekle" bunu ekler. */
const emptyFee = (): DraftOrderFee => ({ key: `fee-${feeSeed += 1}`, name: '', amount: '' });

const INPUT_BASE_CLASS = 'h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-normal normal-case tracking-normal shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';
const HEADER_INPUT_CLASS = `w-full ${INPUT_BASE_CLASS}`;
/** Ön yazı kutusu — tek satırlık girişlerle aynı çerçeve, çok satırlı gövde. */
const TEXTAREA_CLASS = 'w-full resize-y rounded-md border border-slate-200 bg-white px-2.5 py-2 text-[13px] font-normal normal-case leading-relaxed tracking-normal text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';
/** Ön yazı taslakları penceresi: SAYFA BAŞINA kayıt (kullanıcı isteği 2026-08-02). */
const TEMPLATE_PAGE_SIZE = 15;
/** Ek ücret satırı: genişliği satır düzeni verir (w-full çakışmasın). */
const FEE_INPUT_CLASS = INPUT_BASE_CLASS;

/**
 * HESAP KİPİ (kullanıcı isteği 2026-08-01 — "doğrudan kopyala"nın genellemesi):
 *   DIRECT   → doğrudan giriş (eski "doğrudan kopyala"): net fiyat ve satır
 *              tutarı da elle girilir ya da Excel'den olduğu gibi kopyalanır;
 *              sunucu da gönderilen tutarları aynen saklar.
 *   AUTO     → otomatik hesap: brüt fiyat tek giriştir, net TÜRETİLİR.
 *   SUPPLIER → tedarikçi hesabı: net birim fiyat tedarikçi kartından gelir ve
 *              SABİTTİR, indirim kilitlidir; satır tutarı miktarla orantılı
 *              büyür (miktar × sabit net fiyat).
 * Sayfa HER AÇILIŞTA DIRECT ile başlar (kullanıcı isteği 2026-08-02 — önceki
 * localStorage kalıcılığı kaldırıldı, varsayılan hep doğrudan giriştir);
 * düzenlemede kaydın kendi kipi yüklenir.
 */
type CalcMode = 'AUTO' | 'DIRECT' | 'SUPPLIER';

/**
 * SİPARİŞ GİRİŞ YOLU (kullanıcı isteği 2026-08-01, ikinci tur):
 *   ORDER         → doğrudan resmî sipariş (PENDING) — eski davranış.
 *   PRICE_REQUEST → fiyat talebi: satırlar FİYATSIZDIR (seri kod + ad + miktar),
 *                   fiyat sütunları gizlenir. KAYDET henüz gönderilmemiş talebi
 *                   TALEP TASLAĞI (DRAFT) olarak yazar; mail gönderilince
 *                   FİYAT TALEBİ (PRICE_REQUEST) olur, siparişe dönüştürülünce
 *                   fiyatlı sipariş taslağına geçer.
 * Seçim EN BAŞTA yapılır: sayfa iki büyük düğmeyle açılır (listede iki ayrı
 * "ekle" düğmesi YOKTUR) ve editörün ortasında kip anahtarı bulunmaz — yol
 * sonradan değiştirilemez. Ayrı bir "taslak" seçeneği de yoktur; taslak,
 * kaydedilmiş ama gönderilmemiş fiyat talebinin kendisidir.
 */
type OrderMode = 'ORDER' | 'PRICE_REQUEST';

/** Yeni satır — hesap kipi satır başınadır, varsayılanı çağıran verir. */
const emptyRow = (calcMode: CalcMode = 'DIRECT'): DraftOrderRow => ({
    key: `order-${rowSeed += 1}`,
    // Malzeme/ürün birleşmesi (2026-08-14): her sipariş satırı üründür.
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

/**
 * Boş satır: Excel aktarımı önce bunları doldurur (stok ekranıyla aynı kural).
 * Doğrudan kopyalama kipinde dosyada brüt fiyat olmayabilir (yalnızca net fiyat
 * ya da satır tutarı), bu yüzden o iki alan da "dolu" sayılır — aksi hâlde
 * aktarılmış bir satırın üzerine ikinci aktarım yazardı.
 */
const isBlankRow = (row: DraftOrderRow) => !row.articleId
    && !row.code.trim()
    && !row.name.trim()
    && !row.serialNumber.trim()
    && !row.grossPrice.trim()
    && !row.netPrice.trim()
    && !row.lineTotal.trim();

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
 *
 * DOĞRUDAN KOPYALA (kullanıcı isteği 2026-07-31): kip açıkken TABLONUN HER
 * SÜTUNU eşlenebilir olmalıdır — net fiyat tablodaki başlığıyla ("Net Fiyat")
 * listelenir ve SATIR TUTARI da eklenir; ikisi de artık türetilmediği için
 * dosyadan olduğu gibi kopyalanır. Normal kipte satır tutarı sütunu SUNULMAZ:
 * eşlenirse sessizce yok sayılacağı için kullanıcıyı yanıltırdı (net fiyat orada
 * yalnızca brüt fiyatı olmayan dosyalar için taban olarak durur).
 */
const importFields = (directCopy: boolean, priceless: boolean) => ([
    { key: 'articleCode', label: t('inv.columns.serialCode'), keyField: true },
    { key: 'name', label: t('inv.columns.productName'), keyField: true },
    { key: 'quantity', label: t('inv.columns.quantity'), numeric: true },
    // FİYAT TALEBİ: dosyadan yalnızca kimlik + miktar okunur — fiyat sütunları
    // eşlenemez (fiyatlar tedarikçiden İSTENECEKTİR).
    ...(priceless ? [] : [
        { key: 'grossPrice', label: t('inv.orders.columns.grossPrice'), numeric: true },
        {
            key: 'netPrice',
            label: directCopy ? t('inv.orders.columns.netPrice') : t('inv.columns.unitCost'),
            numeric: true,
        },
        { key: 'discount', label: t('inv.orders.columns.discount'), numeric: true },
        { key: 'discount2', label: t('inv.orders.columns.discount2'), numeric: true },
        { key: 'vatRate', label: t('inv.orders.columns.vat'), numeric: true },
        ...(directCopy ? [{ key: 'lineTotal', label: t('inv.columns.lineTotal'), numeric: true }] : []),
    ]),
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
 * (mail gönderilmiş siparişte içerik değişikliği backend'de revizyonu artırır).
 */
export const OrderCreatePage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const editId = searchParams.get('id');
    const permissions = useAuthStore((state) => state.permissions);
    const user = useAuthStore((state) => state.user);
    const pdfSettings = usePdfSettingsStore((state) => state.settings);
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    /**
     * Hesap kipi (DIRECT / AUTO / SUPPLIER — açıklama yukarıda) artık SATIR
     * BAŞINADIR (kullanıcı isteği 2026-08-02, satır satır çalışma): her satır
     * kendi kipini taşır ve buna göre hesaplanır. Buradaki `calcMode` yalnızca
     * VARSAYILANDIR — yeni satırlar ve içe aktarım bu kiple açılır ve her
     * açılışta DOĞRUDAN GİRİŞTİR (localStorage kalıcılığı yok).
     */
    const [calcMode, setCalcMode] = useState<CalcMode>('DIRECT');

    /**
     * KİP DEĞİŞTİRME — İKİ KURAL (kullanıcı isteği 2026-08-02):
     *
     * 1) GERİ DÖNÜŞ ESKİ HÂLİ GETİRİR: kip değişirken terk edilen DIRECT/SUPPLIER
     *    kipinin net fiyatı + satır tutarı satırın `modeStash`ına saklanır; aynı
     *    kipe geri dönüldüğünde satır o değerlerle açılır. Böylece AUTO'ya girip
     *    çıkmak elle girilmiş/sabit değerleri EZMEZ. (AUTO saklanmaz — girdileri
     *    olan brüt fiyat + indirimler zaten satırda durur ve dokunulmaz.)
     *
     * 2) STASH YOKSA TUTAR KORUNUR: kipe İLK geçişte satırın o anki tutarı çıpa
     *    alınır ve birim fiyat ondan TAM DUYARLIKLA türetilir (56.93 / 3 =
     *    18.976666…) — aynı miktarda tutar birebir aynı kalır; 2 haneye
     *    yuvarlanmış fiyattan yeniden hesaplansaydı 56.93 → 56.94 kayardı.
     */
    // Üstteki anahtar = TOPLU değişim: tıklamak SABİTLENMEMİŞ (boş daireli)
    // satırları çevirir ve varsayılanı değiştirir. Sağdaki daireyle satıra ÖZGÜ
    // kip seçilmiş satırlar toplu değişimden ETKİLENMEZ (kullanıcı isteği
    // 2026-08-02). Geçiş mantığı iki ekranda ortaktır: `utils/orderRowMode.ts`.
    const changeCalcMode = (next: CalcMode) => {
        setRows((current) => current.map((row) => (row.modePinned ? row : transitionRowMode(row, next))));
        setCalcMode(next);
    };

    /**
     * Fiyat kutusunun yanındaki GERİ ÇAĞIR düğmesi — yalnızca fiyat özgün
     * hâlinden farklıysa görünür (aksi hâlde yer tutar ama görünmez).
     */
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

    /**
     * GERİ ÇAĞIR (fiyat kutusunun yanında): satırın fiyatını ÖZGÜN hâline
     * döndürür — Excel'den geldiği ya da kayıttan yüklendiği değerler. Kipler
     * arasında gidip gelirken fiyat kaydıysa tek tıkla geri alınır.
     */
    const recallRowPrice = (row: DraftOrderRow) => {
        setRows((current) => current.map((entry) => (entry.key === row.key ? restoreRowOrigin(entry) : entry)));
    };

    // Satırın sağındaki daire: BOŞ başlar (satır tabloyu izler); tıklandıkça
    // boş → D → A → T → boş döngüsüyle satıra özgü kip seçilir.
    const cycleRowCalcMode = (row: DraftOrderRow) => {
        setRows((current) => current.map((entry) => (entry.key === row.key ? cycleRowMode(entry, calcMode) : entry)));
    };

    // Sipariş giriş yolu — yeni siparişte EN BAŞTA seçilir (null = seçim ekranı
    // açık); düzenlemede kaydın durumundan türetilir (fiyat talebi aşamasındaki
    // sipariş fiyatsız tabloyla açılır) ve seçim ekranı hiç görünmez.
    const [orderMode, setOrderMode] = useState<OrderMode | null>(editId ? 'ORDER' : null);
    // Fiyatsız kip: fiyat/indirim/KDV sütunları ve toplamlar gizlenir.
    const priceless = orderMode === 'PRICE_REQUEST';
    // "Bestellung" (sipariş kodu): sunucu BE-{yıl}-{sıra} önerir, kullanıcı
    // değiştirebilir. Boş bırakılırsa (yeni siparişte) sunucu üretir.
    const [reference, setReference] = useState('');
    const [quoteNumber, setQuoteNumber] = useState('');
    const [projectName, setProjectName] = useState('');
    // "Besteller" — siparişi veren kişi; oturumdaki kullanıcının tam adıyla dolar.
    const [orderedByName, setOrderedByName] = useState('');
    /**
     * ALICI ADI ("Empfänger" / z.Hd.) — OPSİYONEL (kullanıcı isteği 2026-08-02).
     * Siparişin gönderileceği kişi/departman; tedarikçi kaydından bağımsızdır.
     * Doluysa PDF'in alıcı bloğunda firma adının ALTINDA KÜÇÜK, TEK satır olarak
     * basılır (kullanıcı: "PDF'teki alan çok büyük olmasın") — boşsa blok
     * bugünkü hâlinde kalır.
     */
    const [recipientName, setRecipientName] = useState('');
    const [excelOpen, setExcelOpen] = useState(false);
    const [importing, setImporting] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    /**
     * ── ÖN YAZI (ANSCHREIBEN) ────────────────────────────────────────────────
     * PDF'in ilk sayfasında pozisyon tablosundan önce basılan hitap + giriş
     * metni. BOŞ BIRAKILIRSA PDF'in KENDİ standart metni basılır (kullanıcı
     * isteği 2026-08-02: "şu anki varsayılan metin varsayılan kalsın") — bu
     * yüzden alan boş başlar ve standart metin yalnızca YER TUTUCU olarak
     * görünür; belge dili değiştiğinde metin de o dile döner.
     * ⚠ Yer tutucu metin `inv.orders.coverLetter.defaultText`tir ve PDF
     * şablonlarındaki (`utils/pdf/orderPdf.ts`) standart metnin eşidir —
     * birlikte güncellenmelidir.
     */
    const [coverLetter, setCoverLetter] = useState('');
    // Ek ücretler ARTIK AYRI PENCEREDE (kullanıcı isteği 2026-08-02): sipariş
    // detaylarının yanındaki kendi düğmesiyle açılır.
    const [feesOpen, setFeesOpen] = useState(false);
    // Ön yazı TASLAKLARI penceresi (tenant geneli şablonlar, 15'erli sayfalar).
    const [draftsOpen, setDraftsOpen] = useState(false);
    const [templates, setTemplates] = useState<PurchaseOrderTextTemplate[]>([]);
    const [templatesLoading, setTemplatesLoading] = useState(false);
    const [templatePage, setTemplatePage] = useState(1);
    const [templateTotal, setTemplateTotal] = useState(0);
    // Listeyi yeniden çekmek için sayaç (kaydet/sil sonrası).
    const [templateTick, setTemplateTick] = useState(0);
    const [draftTitle, setDraftTitle] = useState('');
    const [draftError, setDraftError] = useState<string | null>(null);
    const [draftBusy, setDraftBusy] = useState(false);
    /**
     * AŞAMA EYLEMLERİNİN ONAYI — tarayıcı kutusu değil, uygulamanın kendi
     * penceresi (kullanıcı isteği 2026-08-02; mal kabul geçişiyle AYNI pencere):
     *   'convert' → fiyat talebi kapanır, kayıt sipariş taslağına döner,
     *   'confirm' → sipariş resmîleşir, KİLİTLENİR ve listeye dönülür.
     * İkisi de geri alması pahalı olduğu için kazara tıklamaya kapalıdır.
     */
    const [stageConfirm, setStageConfirm] = useState<'convert' | 'confirm' | 'revoke' | null>(null);
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
    // Düzenlenen kaydın durumu — onay düğmesi yalnızca fiyat talebi
    // aşamasındaki siparişlerde görünür.
    const [editStatus, setEditStatus] = useState<PurchaseOrderStatus | null>(null);
    const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
    const [supplierError, setSupplierError] = useState<string | null>(null);
    const [allPickerRowKey, setAllPickerRowKey] = useState<string | null>(null);
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);

    // ── İndirim sütunları ────────────────────────────────────────────────────
    // Ana indirim her zaman görünür; "İndirim" başlığına tıklanınca açılan
    // pencereden en fazla iki ek sütun (İndirim 2 / 3) açılır. Yüzdeler sırayla
    // uygulanır — `utils/orderPricing.ts`.

    // ── KDV: SİPARİŞ DÜZEYİNDE TEK ORAN (kullanıcı isteği 2026-08-02) ────────
    // Aynı oran bütün ürünlere uygulandığı için tabloda KDV SÜTUNU YOKTUR; oran
    // sipariş detayları penceresinden seçilir ve genel toplam üzerinden
    // hesaplanır (satır toplamı + ek ücretler → KDV). Varsayılan oran ve ülke
    // PDF ayarlarındaki şirket bilgisinden gelir.
    const [orderVatCountry, setOrderVatCountry] = useState(() => vatRatesForCountry(pdfSettings.country).label);
    const [orderVatRate, setOrderVatRate] = useState(() => String(pdfSettings.vatRate ?? 0));
    const [vatCountryList, setVatCountryList] = useState(() => allVatCountries());
    const [customVatLabel, setCustomVatLabel] = useState('');
    const [customVatRate, setCustomVatRate] = useState('');

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
                // ONAYLANMIŞ SİPARİŞ DÜZENLENEMEZ (kullanıcı isteği 2026-08-02):
                // onay siparişi resmîleştirir; sonraki değişiklikler yalnızca mal
                // kabul ekranından yapılır. Düzenleme yalnızca fiyat talebi
                // aşamasında (taslak / talep / onay bekliyor) açıktır.
                if (!isEditableStage(order.status)) {
                    toast.error(t(order.status === 'COMPLETED'
                        ? 'inv.orders.editCompleted'
                        : 'inv.orders.editConfirmed'));
                    navigate('/inventory/orders');
                    return;
                }
                setEditStatus(order.status);
                setReference(order.referenceNumber);
                setQuoteNumber(order.quoteNumber ?? '');
                setProjectName(order.projectName ?? '');
                setOrderedByName(order.orderedByName ?? '');
                setRecipientName(order.recipientName ?? '');
                // Kayıtta ön yazı yoksa alan BOŞ kalır: PDF standart metnini basar.
                setCoverLetter(order.coverLetter ?? '');
                setEditReference(order.referenceNumber);
                setSupplier({
                    id: order.supplierId ?? null,
                    name: order.supplierName,
                    email: order.supplierEmail ?? null,
                });
                // Her satır KENDİ hesap kipiyle yüklenir (kip satır başınadır):
                // aksi hâlde tablo tutarları yeniden türetir ve kayıtta duran
                // (elle girilmiş / tedarikçi hesabından gelen) tutarlar değişirdi.
                // Üstteki anahtar HER ZAMAN doğrudan girişte kalır (kullanıcı
                // isteği: varsayılan daima "Direkteingabe") — o bir toplu değişim
                // düğmesidir, kaydın durumunu göstermez.
                // Fiyat talebi aşamasındaki sipariş fiyatsız tabloyla düzenlenir.
                setOrderMode(isPriceRequestStage(order.status) ? 'PRICE_REQUEST' : 'ORDER');
                setRows(order.items.map((item) => {
                    const storedMode: CalcMode = item.calcMode === 'SUPPLIER' || item.calcMode === 'AUTO' || item.calcMode === 'DIRECT'
                        ? item.calcMode
                        : (item.directCopy === true ? 'DIRECT' : 'AUTO');
                    // ESKİ ÜÇÜNCÜ İNDİRİMLİ satır DOĞRUDAN GİRİŞLE açılır: iki
                    // yüzde tek yüzdeye katlanırken oran 2 haneye yuvarlanır
                    // (%12.5 + %7.5 = %19.0625 → %19.06) ve büyük tutarlarda satır
                    // birkaç rappen kayardı. Doğrudan girişte TUTARLAR olduğu gibi
                    // korunur; katlanan yüzde yalnızca not olarak görünür.
                    const itemMode: CalcMode = (item.discount3 ?? 0) > 0 ? 'DIRECT' : storedMode;
                    // Yüzde yazılmadan net fiyat düşürülerek indirim verilmiş eski
                    // satırlar: gizli indirim yüzdeye çevrilir, tutar korunur.
                    // (Yalnızca AUTO: diğer kiplerde indirim bir hesap değildir.)
                    const implied = itemMode === 'AUTO' ? impliedDiscountPercent(item) : 0;
                    // Kayıttaki değerler stash'e de yazılır: kip başka yerlere
                    // gidip geri dönerse satır KAYDEDİLMİŞ hâline döner (Excel'den
                    // gelen değerler kayıtla birlikte yaşamaya devam eder).
                    const modeStash: DraftOrderRow['modeStash'] = itemMode === 'AUTO'
                        ? undefined
                        : {
                            [itemMode]: {
                                netPrice: String(item.netPrice || ''),
                                lineTotal: String(item.lineTotal || ''),
                                quantity: String(item.quantity),
                            },
                        };
                    return {
                        ...emptyRow(itemMode),
                        itemType: item.itemType,
                        articleId: item.articleId ?? null,
                        code: item.code ?? '',
                        serialNumber: item.serialNumber ?? '',
                        name: item.name,
                        unit: item.unit ?? '',
                        quantity: String(item.quantity),
                        // Brüt fiyat tek fiyat girişidir; eski kayıtta yoksa net fiyat taban olur.
                        grossPrice: String(item.grossPrice || item.netPrice || ''),
                        // Net fiyat DIRECT'te (elle girilen) ve SUPPLIER'da (sabit
                        // tedarikçi fiyatı) taslakta yaşar; AUTO'da türetilir.
                        netPrice: itemMode === 'SUPPLIER'
                            ? String(item.displayNetPrice ?? item.netPrice ?? '')
                            : (itemMode !== 'AUTO' ? String(item.netPrice || '') : ''),
                        supplierUnitBase: itemMode === 'SUPPLIER' ? String(item.netPrice || '') : undefined,
                        lineTotal: itemMode === 'DIRECT' ? String(item.lineTotal || '') : '',
                        discount: implied ? String(implied) : (item.discount ? String(item.discount) : ''),
                        // ESKİ ÜÇÜNCÜ İNDİRİM ek indirime KATLANIR: arayüzde
                        // sütunu kalmadığı için aksi hâlde sessizce silinir ve
                        // satır tutarı artardı (%10 + %5 → tek %14.5).
                        discount2: foldedExtraDiscount(item) || '',
                        vatRate: item.vatRate ? String(item.vatRate) : '',
                        modeStash,
                        // Kayıttaki fiyat ÖZGÜN hâldir: geri çağır düğmesi buraya döner.
                        origin: {
                            grossPrice: String(item.grossPrice || item.netPrice || ''),
                            netPrice: itemMode !== 'AUTO' ? String(item.netPrice || '') : '',
                            lineTotal: itemMode === 'DIRECT' ? String(item.lineTotal || '') : '',
                            discount: implied ? String(implied) : (item.discount ? String(item.discount) : ''),
                            discount2: foldedExtraDiscount(item) || '',
                            calcMode: itemMode,
                        },
                        // Mal kabul durumu aynen taşınır — düzenleme kabulü sıfırlamasın.
                        receivedQuantity: item.receivedQuantity ?? 0,
                        receivedAt: item.receivedAt ?? null,
                    };
                }));
                setFees((order.additionalFees ?? []).map((fee) => ({
                    ...emptyFee(),
                    name: fee.name,
                    amount: fee.amount ? String(fee.amount) : '',
                })));
                // KDV oranı: yeni kayıtlarda sipariş düzeyindedir. ESKİ (satır
                // KDV'li) kayıtlar açılırken satırlardaki oran sipariş oranına
                // TERFİ ETTİRİLİR — aynı oran zaten tüm satırlarda geçerliydi.
                const legacyLineRate = order.items.find((item) => (item.vatRate ?? 0) > 0)?.vatRate ?? 0;
                setOrderVatRate(String(order.vatMode === 'TOTAL' ? (order.orderVatRate ?? 0) : legacyLineRate));
                if (order.orderVatCountry) setOrderVatCountry(order.orderVatCountry);
            })
            .catch((err) => {
                toast.error(err?.response?.data?.error || t('inv.orders.loadFailed'));
                navigate('/inventory/orders');
            })
            .finally(() => { if (!cancelled) setLoadingOrder(false); });
        return () => { cancelled = true; };
    }, [editId]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── ÖN YAZI TASLAKLARI ───────────────────────────────────────────────────
    // Liste SUNUCUDA sayfalanır (15'erli): taslak eklendikçe yeni sayfa açılır,
    // pencere hiçbir zaman tüm listeyi tek seferde çekmez.
    const templatePages = Math.max(1, Math.ceil(templateTotal / TEMPLATE_PAGE_SIZE));
    useEffect(() => {
        if (!draftsOpen) return;
        let cancelled = false;
        setTemplatesLoading(true);
        purchaseOrdersApi
            .listTextTemplates(templatePage, TEMPLATE_PAGE_SIZE)
            .then((page) => {
                if (cancelled) return;
                setTemplates(page.items);
                setTemplateTotal(page.total);
            })
            .catch(() => { if (!cancelled) toast.error(t('inv.orders.coverLetter.loadFailed')); })
            .finally(() => { if (!cancelled) setTemplatesLoading(false); });
        return () => { cancelled = true; };
    }, [draftsOpen, templatePage, templateTick]);

    /** Taslağı ön yazıya uygular ve pencereyi kapatır. */
    const applyTemplate = (template: PurchaseOrderTextTemplate) => {
        setCoverLetter(template.content ?? '');
        setDraftsOpen(false);
        toast.success(t('inv.orders.coverLetter.applied'));
    };

    /** Ekrandaki ön yazıyı yeni bir taslak olarak kaydeder (başlık zorunlu). */
    const saveTemplate = async () => {
        if (!draftTitle.trim()) { setDraftError(t('inv.orders.coverLetter.titleRequired')); return; }
        if (!coverLetter.trim()) { setDraftError(t('inv.orders.coverLetter.textRequired')); return; }
        setDraftBusy(true);
        try {
            await purchaseOrdersApi.createTextTemplate({
                title: draftTitle.trim(),
                content: coverLetter.trim(),
            });
            setDraftTitle('');
            setDraftError(null);
            // En yeni taslak listenin başındadır → ilk sayfaya dönülür.
            setTemplatePage(1);
            setTemplateTick((tick) => tick + 1);
            toast.success(t('inv.orders.coverLetter.saved'));
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.coverLetter.loadFailed'));
        } finally {
            setDraftBusy(false);
        }
    };

    const deleteTemplate = async (template: PurchaseOrderTextTemplate) => {
        if (!window.confirm(t('inv.orders.coverLetter.deleteConfirm'))) return;
        setDraftBusy(true);
        try {
            await purchaseOrdersApi.deleteTextTemplate(template.id);
            // Sayfadaki son kayıt silindiyse bir önceki sayfaya kayılır.
            if (templates.length === 1 && templatePage > 1) setTemplatePage((page) => page - 1);
            setTemplateTick((tick) => tick + 1);
            toast.success(t('inv.orders.coverLetter.deleted'));
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.coverLetter.loadFailed'));
        } finally {
            setDraftBusy(false);
        }
    };

    const patchRow = (key: string, patch: Partial<DraftOrderRow>) => {
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row)));
    };

    /** Çöp kutusu (başlıkta): tablodaki TÜM satırları temizler. */
    const clearRows = () => {
        if (!rows.length) return;
        if (!window.confirm(t('inv.orders.clearRowsConfirm'))) return;
        setRows([]);
    };

    const addRow = () => {
        const row = emptyRow(calcMode);
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    /** KDV listesine ülke + oran ekle (tarayıcıda saklanır, seçim önerisidir). */
    const addCustomVatCountry = () => {
        if (!customVatLabel.trim()) return;
        const rate = clampPercent(parseNum(customVatRate) ?? 0);
        saveCustomVatCountry(customVatLabel, rate);
        setVatCountryList(allVatCountries());
        setOrderVatCountry(customVatLabel.trim());
        setOrderVatRate(String(rate));
        setCustomVatLabel('');
        setCustomVatRate('');
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
                itemType: 'PRODUCT',
                articleId: article.id,
                code: article.articleCode,
                name: article.name,
                unit: article.unit,
                grossPrice: row.grossPrice || (article.baseCost ? String(article.baseCost) : ''),
                // TEDARİKÇİ HESABI kipindeki satır: net birim fiyat tedarikçi
                // kartından gelir ve SABİTTİR (baseCost son alış fiyatıdır; alım
                // geçmişi birazdan daha kesin değeri yazabilir).
                ...(row.calcMode === 'SUPPLIER' ? { netPrice: article.baseCost ? String(article.baseCost) : row.netPrice } : {}),
                error: null,
            }
            : row)));
        void supplyApi.itemSuppliers(article.id)
            .then((result) => {
                const best = result.suppliers[0];
                if (!best) return;
                setSupplier((current) => (current.id || current.name.trim()
                    ? current
                    : { id: best.supplierId, name: best.companyName, email: best.email ?? null }));
                setRows((current) => current.map((row) => (row.key === rowKey && row.articleId === article.id
                    ? {
                        ...row,
                        grossPrice: row.grossPrice || (best.lastPurchasePrice ? String(best.lastPurchasePrice) : row.grossPrice),
                        // Tedarikçi hesabındaki son alış fiyatı sabit net fiyattır.
                        ...(row.calcMode === 'SUPPLIER' && best.lastPurchasePrice ? { netPrice: String(best.lastPurchasePrice) } : {}),
                    }
                    : row)));
            })
            .catch(() => { /* öneri gelmezse satır elle doldurulur */ });
    };

    /**
     * ── SERİ KOD EŞLEŞMESİ SATIRIN ÜZERİNE YAZAR (kullanıcı isteği 2026-08-02) ──
     * Kod hücresine yazılan seri kod katalogdaki bir ürünle BİREBİR eşleşiyorsa
     * satır o ürüne BAĞLANIR ve ürünün kaydı satırın üzerine yazılır: kodun
     * katalogdaki yazımı, adı ve birimi. Böylece elle yazılan "yaklaşık" ad,
     * kodun işaret ettiği gerçek ürünle değiştirilir.
     *
     * FİYAT EZİLMEZ: brüt fiyat yalnızca hücre BOŞSA ürünün alış fiyatıyla
     * doldurulur — girilmiş/dosyadan gelmiş bir fiyat asla değiştirilmez.
     *
     * ⚠ YALNIZCA ELLE YAZMADA çalışır (hücrenin `onBlur`'ü). Excel aktarımı
     * bilinçli olarak dışarıdadır: orada DOSYA KAZANIR — kodlu satırlar
     * bağlantısız kalır ve kaydetme katalog kaydını dosyanın değerleriyle
     * GÜNCELLER (`bulkCreateArticles overwrite`).
     */
    const applySerialCodeMatch = async (rowKey: string, rawCode: string) => {
        const code = rawCode.trim();
        if (!code) return;
        try {
            const result = await inventoryApi.articlesSummaryPaged({
                page: 1,
                pageSize: 5,
                code,
                itemType: 'PRODUCT',
                status: 'ACTIVE',
            });
            const match = result.items.find(
                (article) => article.articleCode.trim().toLowerCase() === code.toLowerCase(),
            );
            if (!match) return;
            setRows((current) => current.map((row) => {
                if (row.key !== rowKey) return row;
                // Hücre bu arada değiştiyse ya da satır zaten o ürüne bağlıysa dokunma.
                if (row.code.trim().toLowerCase() !== code.toLowerCase()) return row;
                if (row.articleId === match.id) return row;
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
        } catch {
            /* Arama başarısızsa satır olduğu gibi kalır — kod elle girilmiş sayılır. */
        }
    };

    const markAsNewArticle = (rowKey: string, name: string) => {
        patchRow(rowKey, { name, articleId: null, unit: '' });
    };

    /**
     * Excel satırlarını ürünlere bağla — stok ekranındaki akışın aynısı: önce
     * kod, sonra ad (normalize edilmiş) eşleşir. Eşleşmeyen satır ATILMAZ, yeni
     * ürün satırı olarak girer; kaydetmede ürün listesine 0 adetle açılır
     * (STOĞA GİRMEZ — sipariş stok hareketi değildir).
     *
     * DOĞRUDAN KOPYALAMA kipinde hücreler DÖNÜŞTÜRÜLMEDEN geçer: ürün adı ve kodu
     * bile dosyadaki hâliyle kalır (eşleşen ürünün kaydı satırı YENİDEN
     * ADLANDIRMAZ), yüzdeler 0-100 denetiminden geçmez, brüt fiyat yerine ürünün
     * alış fiyatı gibi varsayılanlar DOLDURULMAZ ve net fiyat ile satır tutarı
     * dosyadan aynen alınır. Ürün eşleşmesi yine yapılır — satırın hangi ürüne
     * bağlandığı (stok/rapor tarafı için) kopyalamadan bağımsızdır.
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
                // DOSYA KAZANIR (kullanıcı isteği 2026-08-02): kod zaten kayıtlıysa
                // satır katalog adına DÖNDÜRÜLMEZ; kaydetmede mevcut ürün dosyadaki
                // değerlerle GÜNCELLENİR (bulkCreateArticles `overwrite`). Bunun için
                // KODLU satırlar bağlantısız bırakılır — kaydet, güncelleme yolundan
                // geçirir ve dönen id'ye bağlar. Ürün oluşturma/güncelleme izni yoksa
                // eski davranış sürer: satır katalog kaydına bağlanır.
                const routeThroughOverwrite = canCreateArticles && Boolean(code);
                const base = {
                    articleId: article && !routeThroughOverwrite ? article.id : null,
                    code: code || (article ? article.articleCode : ''),
                    name: name || (article ? article.name : ''),
                    unit: article ? article.unit : '',
                };
                // FİYAT TALEBİ: yalnızca kimlik + miktar aktarılır, fiyat alanları
                // boş kalır (tedarikçiden istenecek).
                if (priceless) {
                    additions.push({
                        ...emptyRow('AUTO'),
                        ...base,
                        quantity: cellText(record.quantity) || '1',
                    });
                    return;
                }
                // TEDARİKÇİ HESABI (varsayılan kip): net birim fiyat dosyadan
                // (varsa) ya da ürünün son alış fiyatından (baseCost) gelir ve
                // satırda SABİT kalır.
                if (calcMode === 'SUPPLIER') {
                    const supplierNet = cellText(record.netPrice)
                        || (article?.baseCost ? String(article.baseCost) : '');
                    additions.push({
                        ...emptyRow('SUPPLIER'),
                        ...base,
                        quantity: cellText(record.quantity) || '1',
                        grossPrice: cellText(record.grossPrice)
                            || (article?.baseCost ? String(article.baseCost) : ''),
                        netPrice: supplierNet,
                        // Dosyadaki KDV oranı satırda değil, SİPARİŞTE tutulur
                        // (aşağıda ilk dolu oran sipariş oranına alınır).
                        vatRate: percentCell(record.vatRate),
                        // Dosyanın hâli stash'e yazılır: kip gezintisinden dönünce
                        // içe aktarılmış değerler geri gelir.
                        modeStash: { SUPPLIER: { netPrice: supplierNet, lineTotal: '', quantity: cellText(record.quantity) || '1' } },
                    });
                    return;
                }
                if (calcMode === 'DIRECT') {
                    // HER HÜCRE OLDUĞU GİBİ: tek dönüşüm hücrenin kırpılmasıdır —
                    // kod ve ad da dosyadaki hâliyle kalır. DOSYANIN net fiyatı +
                    // satır tutarı stash'e de yazılır: satır başka kiplere gidip
                    // DOĞRUDAN GİRİŞE dönerse Excel'deki değerler geri gelir
                    // (kullanıcı isteği 2026-08-02).
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
                        vatRate: cellText(record.vatRate),
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
                    // Seri no içe aktarılmaz (şablonda sütunu yok); satırın seri
                    // kodu ürünün kimliğidir.
                    quantity: cellText(record.quantity) || '1',
                    // Tek fiyat girişi BRÜTtür: dosyada brüt yoksa net/birim fiyat
                    // sütunu, o da yoksa ürünün alış fiyatı taban olur.
                    grossPrice: cellText(record.grossPrice)
                        || cellText(record.netPrice)
                        || (article?.baseCost ? String(article.baseCost) : ''),
                    // İndirimler dosyadan aynen gelir; eşlenmemiş sütun boş kalır.
                    // KDV oranı satırda tutulmaz — aşağıda siparişin oranı olur.
                    discount: percentCell(record.discount),
                    discount2: percentCell(record.discount2),
                    vatRate: percentCell(record.vatRate),
                });
            });

            // Her içe aktarılan satırın ÖZGÜN fiyatı saklanır: fiyat kutusunun
            // yanındaki geri çağır düğmesi satırı bu hâle döndürür.
            additions.forEach((row) => { row.origin = captureRowOrigin(row); });

            // Seri kodu (yoksa adı) tutan satırın ÜZERİNE yazılır; kalanlar önce
            // boş satırları doldurur, artanlar sona eklenir — `utils/orderImport.ts`.
            setRows((current) => mergeImportedOrderRows(current, additions, isBlankRow));

            // Dosyadan indirim 2/3 geldiyse o sütunlar KENDİLİĞİNDEN açılır:
            // kapalı sütunun değeri kaydetmede sıfırlanacağı için içe aktarılan
            // yüzde aksi hâlde sessizce kaybolurdu.
            // Dosyada KDV sütunu varsa oran SİPARİŞ düzeyine alınır (satır KDV'si
            // yok): ilk dolu oran siparişin oranı olur.
            const importedVat = additions.map((row) => parseNum(row.vatRate) ?? 0).find((rate) => rate > 0);
            if (importedVat) setOrderVatRate(String(importedVat));
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
     *
     * DOĞRUDAN KOPYALAMA: hesap YOK. Net fiyat ve satır tutarı hücrelerde ne
     * yazıyorsa odur; brüt tutar bilgi amaçlı miktar × brüt fiyattır ve indirim
     * tutarı yalnızca iki uç arasındaki farktır (yüzdelerden hesaplanmaz). Tek
     * türetilen değer satır KDV'sidir: KDV sütunu ORAN taşıdığı için tutar
     * ancak satır tutarı × oran ile bulunabilir (dosyada KDV tutarı sütunu yok).
     */
    // Kip SATIRINDIR: her satır kendi kipiyle hesaplanır (mal kabul ekranıyla
    // ORTAK mantık — `utils/orderRowMode.ts`). KDV satır düzeyinde DEĞİLDİR.
    const rowFigures = draftRowFigures;

    /**
     * SİPARİŞ TOPLAMI — sıra sabittir (kullanıcı isteği 2026-08-02):
     * satır tutarları → + ek ücretler → KDV (tek oran) → 2 haneye yuvarlanmış
     * genel toplam. `computeOrderTotals` backend/PDF/Excel ile ortak kuraldır.
     */
    const totals = useMemo(() => {
        const net = rows.reduce((sum, row) => sum + rowFigures(row).lineTotal, 0);
        const discount = rows.reduce((sum, row) => sum + rowFigures(row).discountAmount, 0);
        const summary = computeOrderTotals({
            net,
            fees: feesTotal,
            // Fiyat talebinde tutar yoktur; KDV de hesaplanmaz.
            vatRate: priceless ? 0 : (parseNum(orderVatRate) ?? 0),
        });
        return { ...summary, discount: round2(discount) };
        // `rowFigures` kipi taşır: hesap kipi değişince toplamlar yenilenir.
    }, [rows, rowFigures, feesTotal, orderVatRate, priceless]);

    const rowToItem = (row: DraftOrderRow, articleId?: string): PurchaseOrderItemInput => {
        const figures = rowFigures(row);
        // ⚠ ZATEN FİYATLI SATIR, fiyat talebi kipinde de FİYATLARIYLA kaydedilir
        // (kullanıcı isteği 2026-08-03): "onayı geri al" bir siparişi talebe
        // döndürebiliyor ve geri alma FİYAT SİLMEMELİDİR. Gerçek bir fiyat
        // talebinde bu alanlar zaten boştur (fiyat sütunları görünmez, Excel
        // eşleme listesi de fiyat taşımaz), dolayısıyla davranış değişmez.
        const rowIsPriced = (parseNum(row.grossPrice) ?? 0) > 0 || figures.lineTotal > 0;
        // FİYAT TALEBİ: satır fiyatsız kaydedilir (seri kod + ad + miktar) —
        // fiyatlar tedarikçiden istenecektir.
        if (priceless && !rowIsPriced) {
            return {
                itemType: row.itemType,
                articleId: articleId ?? row.articleId,
                code: row.code.trim() || null,
                serialNumber: row.serialNumber.trim() || null,
                name: row.name.trim(),
                quantity: parseNum(row.quantity) ?? 1,
                unit: row.unit || null,
                // DOĞRUDAN GİRİŞ olarak kaydedilir (kullanıcı isteği 2026-08-02):
                // fiyat talebi siparişe dönüştüğünde satırlar doğrudan giriş
                // kipiyle açılır ve tedarikçinin fiyatları elle/dosyadan girilir.
                calcMode: 'DIRECT',
                directCopy: true,
                lineTotal: 0,
                // Mal kabul durumu aynen geri gönderilir (sunucu kırparak korur).
                receivedQuantity: row.receivedQuantity,
                receivedAt: row.receivedAt,
            };
        }
        return {
            itemType: row.itemType,
            articleId: articleId ?? row.articleId,
            code: row.code.trim() || null,
            serialNumber: row.serialNumber.trim() || null,
            name: row.name.trim(),
            quantity: parseNum(row.quantity) ?? 1,
            unit: row.unit || null,
            grossPrice: parseNum(row.grossPrice) ?? 0,
            // Net fiyat AUTO'da TÜRETİLMİŞTİR (brüt × indirim çarpanı); DIRECT'te
            // hücrede yazan değerdir, SUPPLIER'da tedarikçi kartındaki sabit
            // fiyattır — son ikisinde sunucu değeri SAKLAR.
            // TEDARİKÇİ satırında `netPrice` HESABIN tam duyarlıklı tabanıdır;
            // ekranda/belgelerde görünen Excel fiyatı `displayNetPrice` olarak
            // ayrıca saklanır (kullanıcı isteği: yüklenen fiyat değişmesin).
            netPrice: figures.netUnitPrice,
            ...(row.calcMode === 'SUPPLIER' && row.netPrice.trim()
                ? { displayNetPrice: parseNum(row.netPrice) ?? undefined }
                : {}),
            // Kapalı sütunlar 0 gönderilir; sunucu toplamları yine kendi hesaplar.
            // SUPPLIER satırında indirim kilitlidir ve gönderilmez (tutarı etkilemez).
            discount: row.calcMode === 'SUPPLIER' ? 0 : (parseNum(row.discount) ?? 0),
            // ⚠ HER ZAMAN GÖNDERİLİR: eskiden "İndirim 2 sütunu açık mı"
            // durumuna bağlıydı ve sütun kapalıyken girilen/geri yüklenen indirim
            // sessizce 0 kaydediliyordu (kullanıcı hatası 2026-08-02: kaydedip
            // çıkınca indirimler kayboluyordu).
            discount2: row.calcMode === 'SUPPLIER' ? 0 : (parseNum(row.discount2) ?? 0),
            // Indirim 3 arayuzden kaldirildi; eski kayitlar yuklenirken ek
            // indirime katlandigi icin her zaman 0 gider.
            discount3: 0,
            // KDV sipariş düzeyindedir; satır oranı artık HER ZAMAN 0'dır.
            vatRate: 0,
            // Hesap kipi SATIR BAŞINA saklanır ki düzenlemede tablo aynı kiplerle
            // açılsın; sunucu SUPPLIER satırında net fiyatı sabit tutar.
            calcMode: row.calcMode,
            // Mal kabul durumu aynen geri gönderilir (sunucu kırparak korur).
            receivedQuantity: row.receivedQuantity,
            receivedAt: row.receivedAt,
            // DOĞRUDAN GİRİŞ satırı: bayrak + satır tutarı gönderilir. Sunucu
            // bayrağı görmezse tutarı indirimlerden yeniden hesaplar ve elle
            // girilen değer kaydedilmemiş olurdu (ekranda 741, kayıtta 740.92).
            ...(row.calcMode === 'DIRECT' ? { directCopy: true, lineTotal: figures.lineTotal } : {}),
        };
    };

    /**
     * Kaydet. Doğrulama tamamen istek ÖNCESİ yapılır. Yeni ürün satırları önce
     * ürün listesine 0 adetle (tanım kaydı) yazılır — sipariş gerçek ürünlere
     * bağlanır; ardından üstteki tedarikçiyle TEK sipariş oluşturulur ya da
     * düzenleme modunda mevcut sipariş PATCH edilir.
     */
    /**
     * ONAYI GERİ AL (editör) — "siparişe dönüştür"ün TERSİ (kullanıcı isteği
     * 2026-08-03): kayıt FİYAT TALEBİNE döner, fiyat/KDV sütunları kapanır.
     * Satırlardaki fiyatlar SİLİNMEZ (`rowToItem` fiyatlı satırı olduğu gibi
     * kaydeder), kayıt yeniden siparişe dönüştürülünce olduğu gibi görünürler.
     * Kilitlenmiş (onaylanmış) sipariş bu sayfada zaten AÇILMAZ; oradaki geri
     * alma sipariş popup'ındadır.
     */
    const revokeToPriceRequest = async () => {
        if (!editId) return;
        try {
            await purchaseOrdersApi.setStatus(editId, 'PRICE_REQUEST');
            setEditStatus('PRICE_REQUEST');
            setOrderMode('PRICE_REQUEST');
            toast.success(t('inv.orders.revokedToast'));
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.saveFailed'));
        }
    };

    const save = async (options?: { confirm?: boolean; convert?: boolean }) => {
        if (!filledRows.length) return;

        if (!supplier.id && !supplier.name.trim()) {
            setSupplierError(t('inv.orders.supplierRequired'));
            return;
        }

        // Tutarı girilip adı boş bırakılmış ek ücret kaydedilmez: toplama giren
        // ama neyin ücreti olduğu belirsiz bir satır sessizce geçmesin.
        if (filledFees.some((fee) => !fee.name.trim())) {
            setFeeError(t('inv.orders.fees.nameRequired'));
            // Ek ücretler artık KENDİ penceresinde: hatanın görüldüğü yer o.
            setFeesOpen(true);
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
            // 1) Yeni ürünler ürün listesine 0 adetle açılır (DEFINITION kaydı);
            //    KODU ZATEN KAYITLI satırlar hata yerine mevcut ürünü GÜNCELLER
            //    (`overwrite` — dosya kazanır, kullanıcı isteği 2026-08-02).
            //    Tek toplu çağrı (malzeme/ürün birleşmesi); dönen id satıra bağlanır.
            const createdIds = new Map<string, string>();
            {
                const newRows = filledRows.filter((row) => !row.articleId);
                if (newRows.length) {
                    const result = await inventoryApi.bulkCreateArticles(newRows.map((row) => ({
                        articleCode: row.code.trim(),
                        name: row.name.trim(),
                        quantity: 0,
                        // Ürünün alış fiyatı İNDİRİMLİ birim fiyattır (gerçekten ödenen).
                        purchasePrice: rowFigures(row).netUnitPrice,
                        supplierId: supplier.id,
                        supplierName: supplier.id ? null : (supplier.name.trim() || null),
                        unit: row.unit || null,
                    })), undefined, { overwrite: true });
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
            }

            const items = filledRows.map((row) => rowToItem(row, createdIds.get(row.key)));
            const header = {
                quoteNumber: quoteNumber.trim() || null,
                orderedByName: orderedByName.trim() || null,
                projectName: projectName.trim() || null,
                // Alıcı adı boşsa null gider: PDF alıcı bloğuna satır eklenmez.
                recipientName: recipientName.trim() || null,
                // Boş ön yazı null gider: sunucu NULL yazar, PDF standart metne döner.
                coverLetter: coverLetter.trim() || null,
                supplierId: supplier.id,
                supplierName: supplier.name.trim(),
                supplierEmail: supplier.email,
                // KDV SİPARİŞ DÜZEYİNDE: tek oran, (net + ek ücretler) üzerinden.
                // Fiyat talebinde tutar yoktur → oran 0 gider.
                vatMode: 'TOTAL' as const,
                orderVatRate: priceless ? 0 : clampPercent(parseNum(orderVatRate) ?? 0),
                orderVatCountry: priceless ? null : (orderVatCountry.trim() || null),
                items,
                // Ek ücretler her kayıtta gönderilir (boş dizi = ücret yok) ki
                // düzenlemede silinen ücret sunucuda da silinsin.
                additionalFees: filledFees.map((fee) => ({
                    name: fee.name.trim(),
                    amount: parseNum(fee.amount) ?? 0,
                })),
            };
            let savedId: string | null = editId;
            if (editId) {
                await purchaseOrdersApi.update(editId, {
                    ...header,
                    ...(reference.trim() ? { referenceNumber: reference.trim() } : {}),
                });
                if (!options?.confirm) toast.success(t('inv.orders.updatedToast'));
            } else {
                // 2) Tek sipariş = tek tedarikçi (üstten seçilen). Bestellung boşsa sunucu
                //    üretir. Fiyat talebi HENÜZ ONAYLANMADIĞI için TASLAK (DRAFT)
                //    olarak kaydedilir (kullanıcı isteği); doğrudan sipariş PENDING.
                // KAYDET SİPARİŞİ RESMİLEŞTİRMEZ (kullanıcı isteği 2026-08-02):
                // fiyatlı sipariş SİPARİŞ TASLAĞI (ORDER_DRAFT), fiyat talebi ise
                // talep taslağı (DRAFT) olarak yazılır. Resmî sipariş yalnızca
                // "Onayla" ile oluşur.
                const created = await purchaseOrdersApi.create([{
                    ...header,
                    referenceNumber: reference.trim() || null,
                    status: priceless ? 'DRAFT' : 'ORDER_DRAFT',
                }]);
                savedId = created.orders[0]?.id ?? null;
                if (!options?.confirm) {
                    toast.success(t(priceless
                        ? 'inv.orders.priceRequestCreatedToast'
                        : 'inv.orders.orderDraftCreatedToast'));
                }
            }
            // SİPARİŞE DÖNÜŞTÜR: fiyat talebi aşamasının SONU (kullanıcı isteği
            // 2026-08-02). Talep kapanır, kayıt fiyatlı SİPARİŞ TASLAĞI olur ve
            // fiyat / KDV / ek ücretler ANCAK ŞİMDİ açılır. Sayfadan ÇIKILMAZ:
            // tablo aynı satırlarla fiyatlı biçime döner, kullanıcı tedarikçinin
            // verdiği fiyatları hemen girer.
            if (options?.convert && savedId) {
                await purchaseOrdersApi.setStatus(savedId, 'ORDER_DRAFT');
                setEditStatus('ORDER_DRAFT');
                setOrderMode('ORDER');
                // Talep KDV'siz kaydedildiği için oran 0'dır: dönüşümde şirketin
                // varsayılan oranı önerilir (yeni siparişteki davranış).
                setOrderVatRate((current) => (parseNum(current) ? current : String(pdfSettings.vatRate ?? 0)));
                toast.success(t('inv.orders.convertedToast'));
                return;
            }
            // ONAYLA: kaydetmenin ARDINDAN gelen AYRI adım (kullanıcı isteği
            // 2026-08-02). Sipariş resmîleşir ve artık düzenlenemez; durumu
            // "SİPARİŞ ONAYLANDI" (PENDING) olur — tedarikçiye mail gidince
            // kendiliğinden "sipariş verildi"ye (ORDERED) döner (2026-08-03).
            // Mal kabul düğmesi de açılır → LİSTEYE DÖNÜLÜR.
            if (options?.confirm && savedId) {
                await purchaseOrdersApi.setStatus(savedId, 'PENDING');
                toast.success(t('inv.orders.confirmedToast'));
                navigate('/inventory/orders');
                return;
            }
            // KAYDET SAYFADAN ÇIKARMAZ (kullanıcı isteği 2026-08-02): çalışmaya
            // devam edilir. Yeni sipariş ilk kaydettiğinde adres çubuğu `?id=`
            // ile kaydın kendisine bağlanır — sonraki kaydetmeler İKİNCİ BİR
            // SİPARİŞ OLUŞTURMAZ, aynı kaydı günceller.
            if (!editId && savedId) {
                setSearchParams({ id: savedId }, { replace: true });
            }
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.saveFailed'));
        } finally {
            setSaving(false);
        }
    };


    // Görünür sütun sayısı: sabit 7 (ürün, kod, miktar, brüt, net, indirim,
    // tutar) + kip göstergesi + eylem sütunu; açık ek indirim sütunları üstüne
    // eklenir. KDV SÜTUNU YOKTUR (sipariş düzeyinde tek oran).
    // FİYAT TALEBİNDE fiyat ve kip sütunları da yoktur: ürün + kod + miktar + eylem.
    const columnCount = priceless ? 4 : 10;
    const tableMinWidth = priceless ? 560 : 1016;
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    // Fiyat sütunları FİYAT TALEBİ kipinde hiç çizilmez — `<col>` listesi de
    // aynı koşulu izler, yoksa sütunlar kayardı.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-order-create:col-widths:v1',
        defaults: {
            code: 144, quantity: 96, grossPrice: 112, netPrice: 112,
            discount: 96, discount2: 96, lineTotal: 128, mode: 40, remove: 48,
        },
        minPx: 40,
    });

    // Malzeme/ürün birleşmesi (2026-08-14): tek tür kaldı, başlıklar sabit.
    const kindLabels = {
        name: t('inv.columns.productName'),
        pick: t('inv.stock.pickProduct'),
        code: t('inv.columns.serialCode'),
        viewAll: `${t('inv.productPicker.viewAll')} …`,
        allTitle: t('inv.productPicker.allTitle'),
    };

    // ── GİRİŞ YOLU SEÇİMİ (yalnızca yeni sipariş) ────────────────────────────
    // Editör açılmadan ÖNCE tek karar: doğrudan sipariş mi, fiyat talebi mi?
    // Listede iki ayrı düğme yoktur; seçim burada, en başta yapılır ve sonradan
    // değiştirilemez (kullanıcı isteği 2026-08-01).
    if (!editId && orderMode === null) {
        const chooseButton = (mode: OrderMode, icon: React.ReactNode, label: string, hint: string) => (
            <button
                type="button"
                onClick={() => setOrderMode(mode)}
                className="flex w-64 flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center transition-colors hover:border-[#1f2654] hover:shadow-md dark:border-white/15 dark:bg-transparent dark:hover:border-white/40"
            >
                <span className="flex size-12 items-center justify-center rounded-full bg-[#272f67]/10 text-[#272f67] dark:bg-white/10 dark:text-white">
                    {icon}
                </span>
                <span className="text-[14px] font-semibold text-slate-800 dark:text-white">{label}</span>
                <span className="text-[12px] leading-relaxed text-slate-400 dark:text-white/50">{hint}</span>
            </button>
        );
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
                            {t('inv.orders.createTitle')}
                        </span>
                    )}
                />
                <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16">
                    <span className="text-[13px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.choose.title')}
                    </span>
                    <div className="flex flex-wrap items-stretch justify-center gap-4">
                        {chooseButton('ORDER', <ShoppingCart01 size={22} />, t('inv.orders.mode.order'), t('inv.orders.choose.orderHint'))}
                        {chooseButton('PRICE_REQUEST', <File05 size={22} />, t('inv.orders.mode.priceRequest'), t('inv.orders.choose.priceRequestHint'))}
                    </div>
                    {/* Ürün/malzeme seçimi kalktı (birleşme 2026-08-14): her
                        sipariş satırı üründür. */}
                </div>
            </div>
        );
    }

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
                        {/* Başlıkta İKİ İKON (kullanıcı isteği 2026-08-02, mal kabul
                            ekranıyla aynı düzen): SOLDA çöp kutusu (tabloyu temizler),
                            SAĞDA KAYDET. Alttaki geniş "taslağı kaydet" düğmesi yerinde
                            kalır; buradaki ikon aynı işi yapar, sayfanın başından. */}
                        <span className="ml-1 flex items-center gap-1">
                            <button
                                type="button"
                                disabled={saving || rows.length === 0}
                                onClick={clearRows}
                                title={t('inv.orders.clearRows')}
                                aria-label={t('inv.orders.clearRows')}
                                className="flex size-9 items-center justify-center rounded-md border border-red-200 text-red-500 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                            >
                                <Trash01 size={17} />
                            </button>
                            <button
                                type="button"
                                disabled={saving || !canTransfer || !filledRows.length}
                                onClick={() => void save()}
                                title={canTransfer ? t('common.save') : t('inv.stock.noPermission')}
                                aria-label={t('common.save')}
                                className="flex size-9 items-center justify-center rounded-md border border-[#272f67]/30 text-[#272f67] transition-colors hover:bg-[#272f67] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white dark:hover:bg-white/15"
                            >
                                {saving
                                    ? <span className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Save01 size={17} />}
                            </button>
                        </span>
                    </span>
                )}
                /* Başlık satırının SAĞ UCUNDA duran TEK eylem — hangi eylem olduğunu
                   AŞAMA belirler (kullanıcı isteği 2026-08-02):
                     • FİYAT TALEBİ aşamasında ONAY YOKTUR. Talep fiyatsızdır; fiyat,
                       KDV ve ek ücretler burada girilemez, dolayısıyla buradan resmî
                       siparişe geçilseydi kilitlenen siparişin fiyatı hiç girilemezdi.
                       Onun yerine "SİPARİŞE DÖNÜŞTÜR" durur: talep kapanır, kayıt
                       fiyatlı SİPARİŞ TASLAĞINA döner ve fiyat/KDV sütunları açılır.
                     • FİYATLI taslakta "SİPARİŞİ OLUŞTUR" durur: sipariş resmîleşir,
                       KİLİTLENİR ve mal kabul açılır.
                   Yeni (henüz kaydedilmemiş) fiyat talebinde hiçbiri görünmez —
                   dönüştürülecek bir kayıt yoktur, önce kaydedilir. */
                action={priceless
                    ? ((editId && editStatus && canConvertToOrder(editStatus)) ? (
                        <button
                            type="button"
                            disabled={saving || !canTransfer || !filledRows.length}
                            onClick={() => setStageConfirm('convert')}
                            title={t('inv.orders.actions.convertToOrder')}
                            className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <ShoppingCart01 size={15} />
                            {t('inv.orders.actions.convertToOrder')}
                        </button>
                    ) : undefined)
                    : ((!editStatus || canConfirmToOrder(editStatus)) ? (
                        <div className="flex items-center gap-2">
                            {/* ONAYI GERİ AL — yalnızca KAYITLI sipariş taslağında:
                                talebin siparişe dönüştürülmesini geri alır, kayıt
                                fiyat talebine döner (kullanıcı isteği 2026-08-03).
                                Yeni, henüz kaydedilmemiş siparişte geri alınacak
                                bir onay yoktur. */}
                            {editId && editStatus === 'ORDER_DRAFT' && (
                                <button
                                    type="button"
                                    disabled={saving || !canTransfer}
                                    onClick={() => setStageConfirm('revoke')}
                                    title={t('inv.orders.actions.revokeApproval')}
                                    className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                                >
                                    <RefreshCcw01 size={15} />
                                    {t('inv.orders.actions.revokeApproval')}
                                </button>
                            )}
                            <button
                                type="button"
                                disabled={saving || !canTransfer || !filledRows.length}
                                onClick={() => setStageConfirm('confirm')}
                                title={t('inv.orders.actions.confirmOrder')}
                                className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                <CheckCircle size={15} />
                                {t('inv.orders.actions.confirmOrder')}
                            </button>
                        </div>
                    ) : undefined)}
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
                        Bestellung / Besteller / proje / teklif no girilir. Hiçbiri zorunlu
                        değildir; Bestellung boş bırakılırsa sunucu BE-{yıl}-{sıra} üretir.
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

                    {/* EK ÜCRETLER — sipariş detaylarının SAĞINDA AYRI DÜĞME
                        (kullanıcı isteği 2026-08-02): nakliye/ambalaj/montaj gibi
                        kalemler artık detay penceresinin dibinde saklı değil,
                        kendi penceresinde. Girilmiş tutar varsa düğme toplamı da
                        gösterir. FİYAT TALEBİNDE GÖRÜNMEZ: o aşamada hiçbir tutar
                        girilmez (fiyat da KDV de yoktur). */}
                    {!priceless && (
                    <div className="flex flex-col gap-1">
                        <button
                            type="button"
                            onClick={() => setFeesOpen(true)}
                            className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                        >
                            <Coins01 size={13} />
                            {t('inv.orders.fees.title')}
                            {filledFees.length > 0 && (
                                <span className="font-mono text-[12px] font-semibold text-slate-500 dark:text-white/60">
                                    {fmtMoney(feesTotal)}
                                </span>
                            )}
                        </button>
                    </div>
                    )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                {/* Giriş yolu BURADA DEĞİŞTİRİLEMEZ (kullanıcı isteği): seçim en
                    başta, sayfa açılışındaki iki düğmeyle yapılır. Fiyat talebinde
                    yalnızca küçük bir rozet neyin düzenlendiğini söyler. */}
                {priceless && (
                    <span className="rounded-full bg-cyan-50 px-2.5 py-1 text-[11.5px] font-semibold text-cyan-700 dark:bg-cyan-500/15 dark:text-cyan-300">
                        {t('inv.orders.mode.priceRequest')}
                    </span>
                )}
                {/* HESAP KİPİ — Excel düğmesinin YANINDA durur, çünkü kararın
                    verildiği yer aktarımdan hemen öncedir (eşlenebilir sütunlar da
                    buna göre değişir). Doğrudan giriş VARSAYILANDIR ve ilk sırada
                    durur (kullanıcı isteği 2026-08-02). SATIR SATIR çalışma: satır
                    seçiliyken anahtar YALNIZCA seçili satırlara uygulanır (seçim
                    yokken tümüne + varsayılana). Fiyat talebinde kip yoktur. */}
                {!priceless && (
                    <span className="flex items-center gap-2">
                    {/* HESAP KİPİ — TEK AÇILIR LİSTE (kullanıcı isteği 2026-08-02, üç
                        düğme yerine). Varsayılan DOĞRUDAN GİRİŞtir. Liste TÜM satırlara
                        uygulanır; tek satır, sağındaki daireden değiştirilir. */}
                    <select
                        value={calcMode}
                        onChange={(event) => changeCalcMode(event.target.value as CalcMode)}
                        title={t('inv.orders.calcMode.hint')}
                        aria-label={t('inv.orders.calcMode.hint')}
                        className="h-[34px] rounded-md border border-slate-300 bg-white px-2.5 text-[12.5px] font-semibold text-slate-600 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white/80"
                    >
                        <option value="DIRECT">{t('inv.orders.calcMode.direct')}</option>
                        <option value="AUTO">{t('inv.orders.calcMode.auto')}</option>
                        <option value="SUPPLIER">{t('inv.orders.calcMode.supplier')}</option>
                    </select>
                </span>
                )}
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
                        {!priceless && rows.length > 0 && (
                            <span className="flex items-baseline gap-2 font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                {/* Döküm HESAP SIRASINI gösterir: net + ek ücretler
                                    → KDV → genel toplam. Yalnızca dolu bileşenler. */}
                                {(totals.vat > 0 || totals.fees !== 0) && (
                                    <span className="text-[11.5px]">
                                        {[
                                            `${t('inv.orders.totalNet')} ${fmtMoney(totals.net)}`,
                                            ...(totals.fees !== 0 ? [`${t('inv.orders.fees.title')} ${fmtMoney(totals.fees)}`] : []),
                                            ...(totals.vat > 0
                                                ? [`${t('inv.orders.columns.vat')} ${fmtPercent(parseNum(orderVatRate) ?? 0)} ${fmtMoney(totals.vat)}`]
                                                : []),
                                        ].join(' + ')} =
                                    </span>
                                )}
                                <span className="font-semibold text-slate-700 dark:text-white/80">
                                    {fmtMoney(totals.grand)}
                                </span>
                            </span>
                        )}
                    </span>
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full" style={{ minWidth: tableMinWidth }}>
                        <colgroup>
                            {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['code', 'quantity'] as const} grid={grid} />
                            {!priceless && (
                                <ResizableCols keys={['grossPrice', 'netPrice', 'discount', 'discount2', 'lineTotal', 'mode'] as const} grid={grid} />
                            )}
                            <ResizableCols keys={['remove'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{kindLabels.name}</th>
                                <th className="relative text-left">
                                    {kindLabels.code}
                                    <ColResizeHandle {...grid.resizeProps('code')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.quantity')}
                                    <ColResizeHandle {...grid.resizeProps('quantity')} />
                                </th>
                                {/* FİYAT TALEBİ fiyatsızdır: fiyat/indirim/KDV/tutar
                                    sütunları hiç çizilmez. */}
                                {!priceless && (
                                    <>
                                        <th className="relative text-right">
                                            {t('inv.orders.columns.grossPrice')}
                                            <ColResizeHandle {...grid.resizeProps('grossPrice')} />
                                        </th>
                                        <th className="relative text-right">
                                            {t('inv.orders.columns.netPrice')}
                                            <ColResizeHandle {...grid.resizeProps('netPrice')} />
                                        </th>
                                        {/* İndirim: başlık altı çizili — tıklanınca İndirim 2 / 3
                                            sütunlarını açan pencere gelir. Yüzdeler sırayla uygulanır;
                                            tedarikçi kipindeki SATIRLARDA hücreler kilitlidir. */}
                                        {/* İKİ indirim sütunu HER ZAMAN görünür: gizli
                                            sütun = sessizce silinen indirim demekti. */}
                                        <th className="relative text-right">
                                            {t('inv.orders.columns.discount')}
                                            <ColResizeHandle {...grid.resizeProps('discount')} />
                                        </th>
                                        <th className="relative text-right">
                                            {t('inv.orders.columns.discount2')}
                                            <ColResizeHandle {...grid.resizeProps('discount2')} />
                                        </th>
                                        {/* KDV SÜTUNU YOK: tek oran sipariş detaylarından
                                            seçilir ve genel toplama uygulanır. */}
                                        <th className="relative text-right">
                                            {t('inv.columns.lineTotal')}
                                            <ColResizeHandle {...grid.resizeProps('lineTotal')} />
                                        </th>
                                        {/* Kip göstergesi (satırın sağında): tıklamak o satırın
                                            hesap kipini değiştirir — toplu ayardan bağımsız. */}
                                        <th className="relative" aria-label={t('inv.orders.calcMode.rowToggleHint')}>
                                            <ColResizeHandle {...grid.resizeProps('mode')} />
                                        </th>
                                    </>
                                )}
                                <th className="relative">
                                    <ColResizeHandle {...grid.resizeProps('remove')} />
                                </th>
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
                                // Hücre davranışını SATIRIN kipi belirler (satır satır hesap).
                                const rowDirect = row.calcMode === 'DIRECT';
                                const rowSupplier = row.calcMode === 'SUPPLIER';
                                // Fiyat özgün hâlinden farklıysa geri çağır düğmesi görünür.
                                const rowChanged = rowDiffersFromOrigin(row);
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
                                                canCreate={canCreateArticles}
                                                autoFocus={row.key === focusRowKey}
                                                placeholder={kindLabels.pick}
                                                addLabel={t('inv.productPicker.addNew', { name: row.name.trim() })}
                                                viewAllLabel={kindLabels.viewAll}
                                            />
                                            {row.error && (
                                                <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                            )}
                                        </td>
                                        {/* SERİ KOD: ürüne bağlı satırda normalde salt
                                            okunurdur (ürünün kimliği değişmesin).
                                            Doğrudan kopyalamada HER hücre düzenlenebilir
                                            olduğu için orada da giriş kutusudur. */}
                                        <td>
                                            {row.articleId && !rowDirect ? (
                                                <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                                                    {row.code}
                                                </span>
                                            ) : (
                                                <input
                                                    value={row.code}
                                                    onChange={(event) => patchRow(row.key, { code: event.target.value })}
                                                    // Seri kod katalogda varsa o ürün satırın üzerine yazılır.
                                                    onBlur={(event) => void applySerialCodeMatch(row.key, event.target.value)}
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
                                        {!priceless && (
                                            <>
                                        <td>
                                            <input
                                                value={row.grossPrice}
                                                onChange={(event) => patchRow(row.key, { grossPrice: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0.00"
                                                className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                            />
                                        </td>
                                        {/* NET FİYAT normalde TÜRETİLMİŞTİR: brüt birim fiyat
                                            × indirim çarpanı. Elle girilemez — girilebilse
                                            indirim yüzdeleriyle çelişirdi (eski hata).
                                            DOĞRUDAN GİRİŞTE türetme yoktur: hücre dosyadan
                                            gelen değeri taşır ve düzenlenebilir. TEDARİKÇİ
                                            HESABINDA fiyat karttan gelir ve KİLİTLİDİR —
                                            miktar değişince tutar orantılı ölçeklenir. */}
                                        {rowDirect ? (
                                            <td>
                                                <span className="flex items-center gap-1">
                                                    <input
                                                        value={row.netPrice}
                                                        onChange={(event) => patchRow(row.key, { netPrice: event.target.value })}
                                                        inputMode="decimal"
                                                        /* Hücre boşken İNDİRİMLİ fiyat (brüt × indirim
                                                           çarpanı) soluk yazıyla görünür: kaydedilecek
                                                           değer budur. Yazılan fiyat onun yerini alır. */
                                                        placeholder={fmtMoney(figures.netUnitPrice)}
                                                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                                                    />
                                                    {recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        ) : rowSupplier ? (
                                            /* Sabit birim fiyat TAM DUYARLIKLA gösterilir:
                                               2 haneye yuvarlanmış hâli satır tutarıyla
                                               çelişir görünürdü (3 × 18.98 ≠ 56.93). */
                                            <td title={t('inv.orders.calcMode.netFixed')}>
                                                <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                    {row.netPrice.trim() ? fmtUnitPricePrecise(parseNum(row.netPrice) ?? 0) : '—'}
                                                    {recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        ) : (
                                            <td title={t('inv.orders.netPriceDerived')}>
                                                <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                    {row.grossPrice.trim() ? fmtMoney(figures.netUnitPrice) : '—'}
                                                    {recallButton(row, rowChanged)}
                                                </span>
                                            </td>
                                        )}
                                        {/* İndirim yüzdeleri: ana indirim + açık olan ek sütunlar.
                                            Tedarikçi kipindeki SATIRDA indirim KİLİTLİDİR (fiyat sabittir). */}
                                        <td>
                                            <input
                                                value={row.discount}
                                                onChange={(event) => patchRow(row.key, { discount: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0"
                                                disabled={rowSupplier}
                                                title={rowSupplier ? t('inv.orders.calcMode.discountLocked') : undefined}
                                                className={`${CELL_INPUT_CLASS} text-right font-mono disabled:cursor-not-allowed disabled:opacity-40`}
                                            />
                                        </td>
                                        <td>
                                            <input
                                                value={row.discount2}
                                                onChange={(event) => patchRow(row.key, { discount2: event.target.value })}
                                                inputMode="decimal"
                                                placeholder="0"
                                                disabled={rowSupplier}
                                                title={rowSupplier ? t('inv.orders.calcMode.discountLocked') : undefined}
                                                className={`${CELL_INPUT_CLASS} text-right font-mono disabled:cursor-not-allowed disabled:opacity-40`}
                                            />
                                        </td>
                                        {/* Satır tutarı NET'tir (indirimler uygulanmış); KDV
                                            satırda GÖRÜNMEZ, genel toplamda bir kez uygulanır.
                                            DOĞRUDAN GİRİŞTE hücre düzenlenebilir: boş
                                            bırakılırsa miktar × net fiyat görünür (yazılan
                                            değer asla ezilmez). */}
                                        {rowDirect ? (
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
                                        {/* KİP GÖSTERGESİ (satırın sağında): BOŞ daire = satır
                                            tabloyu izler; tıklandıkça boş → D → A → T → boş
                                            döngüsüyle satıra ÖZGÜ kip seçilir — toplu ayar bu
                                            satırı artık ETKİLEMEZ. Geri dönüşte eski (Excel'den
                                            gelen) değerler stash'ten gelir. */}
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                onClick={() => cycleRowCalcMode(row)}
                                                title={row.modePinned
                                                    ? `${t(`inv.orders.calcMode.${row.calcMode.toLowerCase()}`)} — ${t('inv.orders.calcMode.rowToggleHint')}`
                                                    : t('inv.orders.calcMode.rowUnset')}
                                                aria-label={t('inv.orders.calcMode.rowToggleHint')}
                                                className={`inline-flex size-6 items-center justify-center rounded-full border text-[10px] font-bold transition-colors ${
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
                                            </>
                                        )}
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
                            {/* TEK kaydet düğmesi — "değişiklikleri kaydet" diye ayrı
                                bir düğme YOKTUR; kaydetmek siparişi TASLAK olarak
                                saklar ve SAYFADAN ÇIKMAZ (kullanıcı isteği). */}
                            {saving
                                ? <LoadingDots label={t('common.loadingData')} />
                                : priceless
                                    ? t('inv.orders.savePriceRequest', { count: filledRows.length })
                                    : t('inv.orders.saveDraft', { count: filledRows.length })}
                        </button>
                    </div>
                )}
            </SectionCard>

            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
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
                    {/* ALICI ADI — opsiyonel. Girilirse PDF'in alıcı bloğunda
                        tedarikçi adının altında küçük bir satır olarak çıkar. */}
                    <label className="flex flex-col gap-1 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                        {t('inv.orders.columns.recipientName')}
                        <input
                            value={recipientName}
                            onChange={(event) => setRecipientName(event.target.value)}
                            placeholder={t('inv.orders.recipientPlaceholder')}
                            maxLength={120}
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

                {/* ÖN YAZI (ANSCHREIBEN) — PDF'in ilk sayfasında pozisyonlardan
                    ÖNCE basılan hitap + giriş metni. Alan BOŞ bırakılırsa belgenin
                    kendi standart metni basılır (yer tutucuda görünen metin);
                    yazılan metin onun yerine geçer. Sağdaki "Taslaklar" düğmesi
                    tenant genelindeki kayıtlı metinleri açar. */}
                <div className="border-t border-slate-200 px-4 pb-4 pt-3.5 dark:border-white/10">
                    <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 flex-col">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                                {t('inv.orders.coverLetter.title')}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-white/40">
                                {t('inv.orders.coverLetter.hint')}
                            </span>
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5">
                            {/* Standart metne dönüş = alanı boşaltmak. */}
                            <button
                                type="button"
                                disabled={!coverLetter.trim()}
                                onClick={() => setCoverLetter('')}
                                title={t('inv.orders.coverLetter.resetDefault')}
                                aria-label={t('inv.orders.coverLetter.resetDefault')}
                                className="flex size-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
                            >
                                <RefreshCcw01 size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => { setDraftError(null); setDraftsOpen(true); }}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-slate-300 px-3 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                            >
                                <File05 size={13} />
                                {t('inv.orders.coverLetter.draftsButton')}
                            </button>
                        </span>
                    </div>
                    <textarea
                        value={coverLetter}
                        onChange={(event) => setCoverLetter(event.target.value)}
                        rows={7}
                        placeholder={t('inv.orders.coverLetter.defaultText')}
                        className={`mt-2.5 ${TEXTAREA_CLASS}`}
                    />
                </div>

                {/* KDV — SİPARİŞ DÜZEYİNDE TEK ORAN (kullanıcı isteği 2026-08-02).
                    Aynı oran bütün ürünlere uygulandığı için tabloda sütunu yoktur:
                    ülke listeden seçilir (listeye yeni ülke + oran eklenebilir) ve
                    oran, satır toplamı + ek ücretler üzerinden hesaplanır.
                    Fiyat talebinde tutar olmadığı için bu bölüm gizlenir. */}
                {!priceless && (
                    <div className="border-t border-slate-200 px-4 pb-4 pt-3.5 dark:border-white/10">
                        <div className="flex flex-col">
                            <span className="text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">
                                {t('inv.orders.columns.vat')}
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-white/40">{t('inv.orders.vatSheet.hint')}</span>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-center gap-2">
                            <select
                                value={orderVatCountry}
                                onChange={(event) => {
                                    setOrderVatCountry(event.target.value);
                                    const entry = vatCountryList.find((candidate) => candidate.label === event.target.value);
                                    if (entry?.rates.length) setOrderVatRate(String(entry.rates[0]));
                                }}
                                className={`${INPUT_BASE_CLASS} w-48`}
                            >
                                {/* Kayıtlı ülke listede yoksa (silinmiş özel ülke) yine seçili görünür. */}
                                {!vatCountryList.some((entry) => entry.label === orderVatCountry) && orderVatCountry && (
                                    <option value={orderVatCountry}>{orderVatCountry}</option>
                                )}
                                {vatCountryList.map((entry) => (
                                    <option key={`${entry.code}-${entry.label}`} value={entry.label}>{entry.label}</option>
                                ))}
                            </select>
                            {(vatCountryList.find((entry) => entry.label === orderVatCountry)?.rates ?? []).map((rate) => (
                                <button
                                    key={rate}
                                    type="button"
                                    onClick={() => setOrderVatRate(String(rate))}
                                    className={`rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors ${
                                        (parseNum(orderVatRate) ?? 0) === rate
                                            ? 'bg-[#272f67] text-white'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-white/10 dark:text-white/70 dark:hover:bg-white/15'
                                    }`}
                                >
                                    {fmtPercent(rate)}
                                </button>
                            ))}
                            <input
                                value={orderVatRate}
                                onChange={(event) => setOrderVatRate(event.target.value)}
                                inputMode="decimal"
                                aria-label={t('inv.orders.vatColumn.custom')}
                                className={`${INPUT_BASE_CLASS} w-20 text-right font-mono`}
                            />
                            <span className="text-[12px] text-slate-400 dark:text-white/50">%</span>
                        </div>
                        {/* Listeye yeni ülke + oran ekleme (tarayıcıda saklanır). */}
                        <div className="mt-2.5 flex items-center gap-2">
                            <input
                                value={customVatLabel}
                                onChange={(event) => setCustomVatLabel(event.target.value)}
                                placeholder={t('inv.orders.vatSheet.customCountry')}
                                className={`${INPUT_BASE_CLASS} min-w-0 flex-1`}
                            />
                            <input
                                value={customVatRate}
                                onChange={(event) => setCustomVatRate(event.target.value)}
                                inputMode="decimal"
                                placeholder="%"
                                className={`${INPUT_BASE_CLASS} w-20 shrink-0 text-right font-mono`}
                            />
                            <button
                                type="button"
                                disabled={!customVatLabel.trim()}
                                onClick={addCustomVatCountry}
                                title={t('inv.orders.vatSheet.addToList')}
                                aria-label={t('inv.orders.vatSheet.addToList')}
                                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
                            >
                                <Plus size={14} />
                            </button>
                        </div>
                    </div>
                )}

            </BottomSheet>

            {/* ── EK ÜCRETLER — KENDİ PENCERESİ ───────────────────────────────
                Nakliye, ambalaj, montaj… Her satır ad + tutar taşır; tutarlar KDV
                MATRAHINA girer (satır toplamı + ücretler). Adı boş bırakılan tutar
                kaydedilmez (`save` uyarır). Sipariş detaylarının yanındaki kendi
                düğmesiyle açılır (kullanıcı isteği 2026-08-02). */}
            <BottomSheet
                open={feesOpen}
                onClose={() => setFeesOpen(false)}
                title={t('inv.orders.fees.title')}
                subtitle={t('inv.orders.fees.hint')}
                width={620}
                height={520}
                footer={(
                    <>
                        <span className="font-mono text-[12.5px] font-semibold text-slate-700 dark:text-white/80">
                            {filledFees.length > 0 ? fmtMoney(feesTotal) : ''}
                        </span>
                        <button
                            type="button"
                            onClick={() => setFeesOpen(false)}
                            className="rounded-md bg-[#272f67] px-4 py-1.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                        >
                            {t('common.done')}
                        </button>
                    </>
                )}
            >
                <div className="px-4 pb-4 pt-3.5">
                    <div className="flex flex-col gap-2">
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

            {/* ── ÖN YAZI TASLAKLARI ──────────────────────────────────────────
                Tenant genelinde paylaşılan metin şablonları: ekrandaki ön yazı
                başlıkla birlikte kaydedilir, listedeki bir taslağa tıklamak onu
                ön yazıya UYGULAR. Liste 15'erli sayfalanır — taslak eklendikçe
                yeni sayfa açılır. Detay penceresinin ÜSTÜNDE açılır (zIndex). */}
            <BottomSheet
                open={draftsOpen}
                onClose={() => setDraftsOpen(false)}
                title={t('inv.orders.coverLetter.draftsTitle')}
                subtitle={t('inv.orders.coverLetter.draftsHint')}
                width={640}
                height={600}
                zIndex={90}
                footer={(
                    <>
                        <span className="text-[11.5px] text-slate-400 dark:text-white/50">
                            {t('inv.orders.coverLetter.pageOf', { page: templatePage, pages: templatePages })}
                        </span>
                        <span className="flex items-center gap-1">
                            <button
                                type="button"
                                disabled={templatePage <= 1 || templatesLoading}
                                onClick={() => setTemplatePage((page) => Math.max(1, page - 1))}
                                title={t('inv.orders.coverLetter.prev')}
                                aria-label={t('inv.orders.coverLetter.prev')}
                                className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <button
                                type="button"
                                disabled={templatePage >= templatePages || templatesLoading}
                                onClick={() => setTemplatePage((page) => Math.min(templatePages, page + 1))}
                                title={t('inv.orders.coverLetter.next')}
                                aria-label={t('inv.orders.coverLetter.next')}
                                className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
                            >
                                <ChevronRight size={15} />
                            </button>
                        </span>
                    </>
                )}
            >
                {/* Ekrandaki ön yazıyı YENİ taslak olarak kaydetme satırı. */}
                <div className="border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <div className="flex items-center gap-2">
                        <input
                            value={draftTitle}
                            onChange={(event) => { setDraftTitle(event.target.value); setDraftError(null); }}
                            placeholder={t('inv.orders.coverLetter.draftTitle')}
                            className={`${INPUT_BASE_CLASS} min-w-0 flex-1 ${draftError && !draftTitle.trim() ? '!border-red-400' : ''}`}
                        />
                        <button
                            type="button"
                            disabled={draftBusy}
                            onClick={() => void saveTemplate()}
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#272f67] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            <Save01 size={13} />
                            {t('inv.orders.coverLetter.saveDraft')}
                        </button>
                    </div>
                    {draftError && (
                        <span className="mt-1.5 block text-[11px] font-semibold text-red-500">{draftError}</span>
                    )}
                </div>

                <div className="flex flex-col gap-2 p-4">
                    {templatesLoading && <LoadingDots label={t('common.loadingData')} />}
                    {!templatesLoading && templates.length === 0 && (
                        <span className="py-6 text-center text-[12.5px] text-slate-400 dark:text-white/50">
                            {t('inv.orders.coverLetter.empty')}
                        </span>
                    )}
                    {!templatesLoading && templates.map((template) => (
                        <div
                            key={template.id}
                            className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-[#1f2654] dark:border-white/10 dark:hover:border-white/40"
                        >
                            {/* Satırın kendisi UYGULAR (kullanıcı isteği: taslak
                                düğmesi seçileni ön yazıya geçirsin). */}
                            <button
                                type="button"
                                onClick={() => applyTemplate(template)}
                                title={t('inv.orders.coverLetter.applyDraft')}
                                className="min-w-0 flex-1 text-left"
                            >
                                <span className="block truncate text-[13px] font-semibold text-slate-700 dark:text-white/85">
                                    {template.title}
                                </span>
                                <span className="mt-0.5 line-clamp-2 block whitespace-pre-line text-[11.5px] leading-relaxed text-slate-400 dark:text-white/50">
                                    {template.content}
                                </span>
                            </button>
                            <button
                                type="button"
                                disabled={draftBusy}
                                onClick={() => void deleteTemplate(template)}
                                title={t('inv.orders.coverLetter.deleteDraft')}
                                aria-label={t('inv.orders.coverLetter.deleteDraft')}
                                className="flex size-8 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-40 dark:hover:bg-red-500/15"
                            >
                                <Trash01 size={13} />
                            </button>
                        </div>
                    ))}
                </div>
            </BottomSheet>

            {/* Aşama eylemlerinin onayı — sipariş popup'ındaki pencerenin aynısı:
                dönüştür (talep kapanır) / onayla (sipariş resmîleşir, kilitlenir).
                Pencere onayla birlikte kapanır; kaydetme göstergesi başlıktaki
                düğmenin kendisindedir. */}
            <ConfirmDialog
                open={stageConfirm !== null}
                title={t(stageConfirm === 'confirm'
                    ? 'inv.orders.actions.confirmOrder'
                    : stageConfirm === 'revoke'
                        ? 'inv.orders.actions.revokeApproval'
                        : 'inv.orders.actions.convertToOrder')}
                message={t(stageConfirm === 'confirm'
                    ? 'inv.orders.confirmOrderConfirm'
                    : stageConfirm === 'revoke'
                        ? 'inv.orders.revokeRequestConfirm'
                        : 'inv.orders.convertConfirm')}
                onConfirm={() => {
                    const kind = stageConfirm;
                    setStageConfirm(null);
                    // GERİ ALMA kaydetmez: yalnızca durumu geri alır (kaydedilmemiş
                    // düzenlemeler tabloda durur, kullanıcı isterse kaydeder).
                    if (kind === 'revoke') { void revokeToPriceRequest(); return; }
                    void save(kind === 'confirm' ? { confirm: true } : { convert: true });
                }}
                onCancel={() => setStageConfirm(null)}
            />

            {/* Sütun ayar pencereleri — başlıklara (altı çizili) tıklanınca açılır. */}
            <ExcelImportSheet
                open={excelOpen}
                onClose={() => setExcelOpen(false)}
                title={t(priceless ? 'inv.orders.excelTitlePriceRequest' : 'inv.orders.excelTitle')}
                // Varsayılan kip doğrudan girişken tablonun HER sütunu eşlenebilir
                // (net fiyat + satır tutarı da listeye girer); fiyat talebinde
                // yalnızca kimlik + miktar sütunları sunulur.
                fields={importFields(calcMode === 'DIRECT', priceless)}
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
