import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, Edit01, File05, Minus, Plus, RefreshCcw01, Save01, Settings01, ShoppingCart01, SquareDivide, Trash01, X, Zap } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { BotLoadingPanel } from '@/components/ui-shared/OffitecBot';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi, supplyApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import { usePurchaseTemplateStore } from '@/store/purchaseTemplateStore';
import type {
    ArticleListItem,
    ItemType,
    PurchaseOrderItemInput,
    PurchaseOrderStatus,
    PurchaseOrderTextTemplate,
    SupplierCalcConfig,
    SupplierOrderTemplate,
    TemplateColumn,
} from '@/types/inventory';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { ArticleComboCell } from './components/ArticleComboCell';
import { useDrawnCheck } from './components/useDrawnCheck';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { BottomSheet } from './components/BottomSheet';
import { OrderFlowSteps } from './components/OrderFlowSteps';
import { SupplierImportDialog } from './import/SupplierImportDialog';
import { usePasteToImport } from './import/usePasteToImport';
import { TemplateManagerPopup } from './import/TemplateManagerPopup';
import { CalcModeCard } from './components/CalcModeCard';
import {
    calcModeError,
    defaultCalcConfig,
    draftExtras,
    extraKeyAliases,
    extrasFromItems,
    hiddenKeysForTemplate,
    remapRowExtras,
    tableColumnsFromTemplate,
    tableColumnsSnapshot,
    templateProblemText,
    templateProblems,
    type OrderColumnId,
} from './import/importTemplate';
import { SupplierComboCell } from './components/SupplierComboCell';
import { SupplierPickerModal } from './components/SupplierPickerModal';
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderFee, DraftOrderRow } from './types';
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
    draftRowFigures,
    restoreRowOrigin,
    rowDiffersFromOrigin,
    transitionRowMode,
} from './utils/orderRowMode';
import { canConfirmToOrder, isEditableStage, isPriceRequestStage, stageIndexOf } from './utils/orderStatus';
/* Der eine Stift, die Apple-Kiste und das Plus unten links wohnen hier;
   die Knoepfe der Belegzeile (`.ofi-poi-*`) im Import-Blatt daneben. */
import '@/styles/orderDetails.css';
import '@/styles/purchaseImport.css';

let rowSeed = 0;
let feeSeed = 0;

/** Boş ek ücret satırı — detay penceresindeki "ek ücret ekle" bunu ekler. */
const emptyFee = (): DraftOrderFee => ({ key: `fee-${feeSeed += 1}`, name: '', amount: '' });

const INPUT_BASE_CLASS = 'h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] font-normal normal-case tracking-normal shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#0066e0] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';
/* Bestelldetails, Zusatzkosten, Steuer und Anschreiben tragen KEINE eigenen
   Feldklassen mehr: sie liegen in der Apple-Kiste (`styles/orderDetails.css`),
   wo die Zeile das Feld IST. `INPUT_BASE_CLASS` bleibt für das Blatt mit den
   Anschreiben-Entwürfen. */
/** Ön yazı taslakları penceresi: SAYFA BAŞINA kayıt (kullanıcı isteği 2026-08-02). */
const TEMPLATE_PAGE_SIZE = 15;

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
    receivedQuantity: 0,
    receivedAt: null,
    error: null,
});

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
    const pdfSettings = usePdfSettings();
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    /**
     * DIE RECHENART DER BESTELLUNG. Am 11.09.2026 war sie abgeschafft, am
     * 14.09.2026 kam sie zurück (Knopf «Berechnung» neben dem Stift, siehe
     * `CalcModeCard`). Neue Zeilen starten in der gewählten Art; Vorgabe ist
     * die manuelle Eingabe.
     */
    const [calcMode, setCalcMode] = useState<CalcMode>('DIRECT');
    /* ── DIE RECHENART IST ZURÜCK (Vorgabe Samet, 14.09.2026) ─────────────────
       «Neben den Bearbeiten-Stift ein Knopf ‹Berechnung›; was dort gewählt
       wird, danach wird gerechnet — fehlen die Schlüssel, ein Fehler mit dem
       fehlenden Schlüssel.» Die Art gilt für die GANZE Bestellung: ein Klick
       stellt jede Zeile um (`transitionRowMode` behält die Werte der
       verlassenen Art im `modeStash`, ein Zurückwechseln holt sie wieder). */
    const [calcOpen, setCalcOpen] = useState(false);
    const [calcError, setCalcError] = useState<string | null>(null);

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
            className="inline-flex size-6 shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#0066e0] disabled:invisible dark:text-white/50 dark:hover:bg-white/10 dark:hover:text-white"
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

    /* ── DIE GANZE ZELLE, NICHT DER CURSOR (Vorgabe Samet) ──────────────────
       «Wenn wir korrigieren, soll die ganze Zelle uebernommen werden; der
       Cursor soll nicht herumspringen.» Beim Hineinklicken ist der Inhalt
       darum MARKIERT: das erste Zeichen ersetzt den ganzen Wert, statt sich
       irgendwo zwischen die alten Ziffern zu setzen. Wer doch nur eine Stelle
       aendern will, klickt ein zweites Mal — das hebt die Markierung auf. */
    const selectWholeCell = (event: FocusEvent<HTMLInputElement>) => event.currentTarget.select();

    // Sipariş giriş yolu — yeni siparişte EN BAŞTA seçilir (null = seçim ekranı
    // açık); düzenlemede kaydın durumundan türetilir (fiyat talebi aşamasındaki
    // sipariş fiyatsız tabloyla açılır) ve seçim ekranı hiç görünmez.
    const [orderMode, setOrderMode] = useState<OrderMode | null>(editId ? 'ORDER' : null);
    // Fiyatsız kip: fiyat/indirim/KDV sütunları ve toplamlar gizlenir.
    const priceless = orderMode === 'PRICE_REQUEST';
    const templateDocumentType = priceless ? 'PRICE_REQUEST' : 'ORDER';
    const preferredTemplateId = usePurchaseTemplateStore((state) => state.selected[templateDocumentType]);
    const selectPreferredTemplate = usePurchaseTemplateStore((state) => state.select);
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
    /**
     * ── BELEG-IMPORT UND DIE AKTIVE VORLAGE (07.09.2026) ────────────────────
     *
     * Vorgabe Samet: «Die Vorlagen und Einstellungen werden gleich am Anfang
     * festgelegt. Was dort eingestellt ist, bleibt für die folgenden
     * Bestellungen die Vorgabe — Berechnungsarten, Vorlagen und so weiter —,
     * bis man es ändert.»
     *
     * Darum ist `aiConfig` KEIN Zustand dieser Seite, sondern die Abschrift
     * einer gespeicherten Vorlage: der allgemeinen Vorgabe, oder — wenn der
     * gewählte Lieferant eine eigene hat — seiner. Sie wird geladen, nicht
     * gesetzt, und gilt für das Plus, für die Berechnungsart und für den
     * Beleg-Import gleichermassen.
     */
    const [aiOpen, setAiOpen] = useState(false);
    /** Was auf der Seite eingefuegt wurde — das Import-Fenster oeffnet damit. */
    const [pastedFiles, setPastedFiles] = useState<File[] | null>(null);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    /** Die RECHENvorlagen — die Anschreiben-Vorlagen heissen weiter `templates`. */
    const [calcTemplates, setCalcTemplates] = useState<SupplierOrderTemplate[]>([]);
    const [activeTemplate, setActiveTemplate] = useState<SupplierOrderTemplate | null>(null);
    /** Von Hand gewaehlte Vorlage — sie schlaegt jede Vorgabe, bis sie geloescht wird. */
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    /** Die eigenen Spalten einer GELADENEN Bestellung — sie schlagen die Vorlage. */
    const [loadedExtraColumns, setLoadedExtraColumns] = useState<TemplateColumn[]>([]);
    /** Welche Vorlage das Fenster aufschlagen soll (null = die erste). */
    const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
    const [aiConfig, setAiConfig] = useState<SupplierCalcConfig>(() => defaultCalcConfig());
    const aiConfigRef = useRef<SupplierCalcConfig>(defaultCalcConfig());
    const loadedExtrasRef = useRef<TemplateColumn[]>([]);
    /** Eigene Angaben einer geladenen Bestellung unter die Schluessel der Vorlage haengen. */
    const remapLoadedExtras = (config: SupplierCalcConfig, extras: TemplateColumn[]) => {
        const aliases = extraKeyAliases(config, extras);
        if (!aliases.size) return;
        setRows((current) => current.map((row) => remapRowExtras(row, aliases)));
    };
    const [templateTick2, setTemplateTick2] = useState(0);
    /** Die Vorlagenliste ist angekommen — erst dann weiss die Seite, ob eine fehlt. */
    const [templatesLoaded, setTemplatesLoaded] = useState(false);
    /* DER GEZEICHNETE HAKEN (Vorgabe Samet, 07.09.2026): «Nach dem Hinzufuegen
       soll ein Haken kommen, und er soll wirklich gezeichnet werden.» Er meldet
       die beiden Ereignisse, die man sonst nur an einer Zeile mehr erkennt:
       uebernommene Belegzeilen und die gespeicherte Bestellung. */
    const drawnCheck = useDrawnCheck();
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
    /* Zusatzkosten haben KEIN eigenes Fenster mehr (Vorgabe Samet, 07.09.2026):
       sie liegen als eigene Kiste in den Bestelldetails, hinter demselben Stift.
       Der Fehlerfall öffnet darum `detailsOpen`, nicht mehr `feesOpen`. */
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
    /**
     * ── ZEILEN AUSWÄHLEN UND WEGWERFEN (Vorgabe Samet, 09.09.2026) ───────────
     * «Ein Papierkorb, um Zeilen zu löschen — auch mehrere auf einmal.»
     * Das Kästchen ganz links wählt, der Papierkorb oben in der Kartenleiste
     * wirft weg; ist nichts gewählt, leert er die ganze Liste. Der kleine
     * Papierkorb am Zeilenende bleibt, wo er war — für die eine Zeile.
     */
    const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
    /** Die Rückfrage vor dem Leeren der ganzen Liste (kein Browserkasten mehr). */
    const [clearAsk, setClearAsk] = useState(false);
    const toggleRowSelected = (key: string) => {
        setSelectedRows((current) => {
            const next = new Set(current);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };
    const toggleSelectAll = () => {
        setSelectedRows((current) => (current.size === rows.length ? new Set() : new Set(rows.map((row) => row.key))));
    };
    const removeRows = (keys: string[]) => {
        const drop = new Set(keys);
        setRows((current) => current.filter((row) => !drop.has(row.key)));
        setSelectedRows((current) => {
            const next = new Set(current);
            drop.forEach((key) => next.delete(key));
            return next;
        });
    };
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
                /* Die eigenen Spalten kommen aus der BESTELLUNG selbst — sonst
                   truege eine alte Bestellung ploetzlich die Spaltennamen von
                   heute (siehe extrasFromItems). */
                setLoadedExtraColumns(extrasFromItems(order.items));
                /* ── DIE RECHENART DER BESTELLUNG (Vorgabe Samet, 07.09.2026) ──
                   Sie ist jetzt EINE fuer die ganze Bestellung. Aeltere
                   Bestellungen koennen gemischte Zeilen tragen (frueher liess
                   sich eine Zeile mit dem Kreis abkoppeln); dann gilt die
                   HAEUFIGSTE — bei Gleichstand die der ersten Zeile. Der Schalter
                   oben zeigt sie, und die Zeilen rechnen alle mit ihr.
                   Die gespeicherten Werte der uebrigen Arten gehen dabei NICHT
                   verloren: sie liegen weiter im `modeStash` jeder Zeile und
                   kommen zurueck, sobald man die Art wieder umstellt. */
                const modeTally = new Map<CalcMode, number>();
                order.items.forEach((item) => {
                    const mode: CalcMode = item.calcMode === 'SUPPLIER' || item.calcMode === 'AUTO' || item.calcMode === 'DIRECT'
                        ? item.calcMode
                        : (item.directCopy === true ? 'DIRECT' : 'AUTO');
                    modeTally.set(mode, (modeTally.get(mode) ?? 0) + 1);
                });
                const orderMainMode: CalcMode = [...modeTally.entries()]
                    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'DIRECT';
                if (order.items.length) setCalcMode(orderMainMode);
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
                        ...emptyRow(orderMainMode),
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
                        extras: Object.fromEntries((item.extras ?? []).map((entry) => [entry.key, entry.value])),
                    };
                }));
                remapLoadedExtras(aiConfigRef.current, extrasFromItems(order.items));
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

    /**
     * ── MENGE GEÄNDERT ──────────────────────────────────────────────────────
     * Die Mengenstaffel ist mit der Rechenvorlage gegangen (11.09.2026); eine
     * geaenderte Menge bewegt darum keinen Preis mehr — nur den Betrag.
     */
    const patchRowQuantity = (key: string, quantity: string) => {
        setRows((current) => current.map((row) => {
            if (row.key !== key) return row;
            const next = { ...row, quantity, error: null };
            /* ── DER BETRAG BLEIBT NICHT STEHEN ──────────────────────────────
               Seit der Beleg-Import den Zeilenbetrag mitbringt (Vorgabe Samet,
               07.09.2026), traegt eine manuelle Zeile eine ausgerechnete Summe
               in der Zelle. Aendert sich die MENGE, waere sie ab dem naechsten
               Zeichen falsch — und zwar unsichtbar, weil eine getippte Summe
               sonst nie angefasst wird. Also rechnen wir hier nach: Menge ×
               Nettopreis, mit demselben Nettopreis, den die Zeile anzeigt.
               Nur in der manuellen Eingabe; die anderen Arten leiten den
               Betrag ohnehin bei jedem Zeichnen neu ab. */
            if (next.calcMode !== 'DIRECT' || !next.lineTotal.trim()) return next;
            const count = parseNum(quantity) ?? 0;
            const unit = draftRowFigures({ ...next, lineTotal: '' }).netUnitPrice;
            return { ...next, lineTotal: unit ? String(round2(count * unit)) : next.lineTotal };
        }));
    };

    /** Çöp kutusu (başlıkta): tablodaki TÜM satırları temizler. */

    /** DAS PLUS. Eine neue Zeile — manuelle Eingabe, wie alles seit dem 11.09.2026. */
    const addRow = () => {
        const row = emptyRow(calcMode);
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    /* ── DIE AKTIVE VORLAGE LADEN ───────────────────────────────────────────
       Eine Vorlage gehoert keinem Lieferanten mehr (11.09.2026): es gilt die
       von Hand gewaehlte, sonst die Vorgabe der Dokumentart, sonst die erste.
       Gibt es keine, gibt es auch keine Tabelle — die Vorlage ist Pflicht. */
    useEffect(() => {
        let cancelled = false;
        purchaseOrdersApi.listSupplierTemplates(null, templateDocumentType)
            .then((items) => {
                if (cancelled) return;
                setCalcTemplates(items);
                const chosen = items.find((entry) => entry.id === (activeTemplateId ?? preferredTemplateId));
                const general = items.find((entry) => entry.isDefault);
                const active = chosen ?? general ?? items[0] ?? null;
                setActiveTemplate(active);
                if (active && active.id !== preferredTemplateId) {
                    selectPreferredTemplate(templateDocumentType, active.id);
                }
                const nextConfig = active ? active.config : defaultCalcConfig();
                setAiConfig(nextConfig);
                remapLoadedExtras(nextConfig, loadedExtrasRef.current);
                setTemplatesLoaded(true);
            })
            .catch(() => { if (!cancelled) { setActiveTemplate(null); setAiConfig(defaultCalcConfig()); setTemplatesLoaded(true); } });
        return () => { cancelled = true; };
    }, [templateTick2, activeTemplateId, templateDocumentType]); // eslint-disable-line react-hooks/exhaustive-deps

    /**
     * ── DIE VORLAGE IST DIE TABELLE (Vorgabe Samet, 11.09.2026) ─────────────
     * «Die Tabellenspalten lassen sich ohne Vorlage nicht anzeigen — die
     *  Vorlage ist Pflicht. Wir geben den Spalten Namen, Art und Zuordnung
     *  und ordnen sie, wie wir wollen.»
     *
     * Ganz links der feste ERP-Code, dann die Spalten der Vorlage in ihrer
     * Reihenfolge. Eine Spalte MIT Zuordnung zeigt das feste Feld der Zeile
     * (Name, Menge, Preise …), eine OHNE Zuordnung eine eigene Angabe. Eine
     * geladene Bestellung bringt eigene Angaben mit, die die Vorlage nicht
     * kennt — die kommen hinten dazu, damit nichts verschwindet.
     */
    const templateFaults = useMemo(
        () => (activeTemplate ? templateProblems(aiConfig, templateDocumentType) : ['noColumns' as const]),
        [activeTemplate, aiConfig, templateDocumentType],
    );
    const templateReady = templateFaults.length === 0;
    /* ── OHNE VORLAGE: NULL POSITIONEN (Vorgabe Samet, 14.09.2026) ───────────
       «Gibt es keine Vorlage, müssen die Produkte als 0 gezeigt und geleert
       werden.» Eine NEUE, noch nie gespeicherte Erfassung wird geleert. Eine
       gespeicherte Bestellung zeigt 0 und lässt sich nicht speichern, ihre
       Zeilen auf dem Server bleiben aber unangetastet — sonst löschte ein
       kaputtes Vorlagenfenster still eine Bestellung. */
    useEffect(() => {
        if (!templatesLoaded || templateReady || editId) return;
        queueMicrotask(() => {
            setRows((current) => (current.length ? [] : current));
            setSelectedRows((current) => (current.size ? new Set() : current));
        });
    }, [templatesLoaded, templateReady, editId]);
    /** Die Rechenart gegen die Vorlage — `null` = sie darf rechnen. */
    const calcModeProblem = priceless ? null : calcModeError(aiConfig, calcMode);
    const applyCalcMode = (next: CalcMode) => {
        const problem = calcModeError(aiConfig, next);
        if (problem) {
            setCalcError(problem);
            toast.error(problem);
            return;
        }
        setCalcError(null);
        if (next === calcMode && rows.every((row) => row.calcMode === next)) return;
        setCalcMode(next);
        setRows((current) => current.map((row) => transitionRowMode(row, next)));
    };
    /* ── STRG+V AUF DER SEITE (Vorgabe Samet, 11.09.2026) ─────────────────
       Ein Bildschirmfoto oder kopierte Zeilen, ausserhalb eines Feldes
       eingefuegt, oeffnen den Beleg-Import schon mit dem Eingefuegten —
       fuer die Bestellung wie fuer die Preisanfrage. Ohne gueltige Vorlage
       nicht: dann ist auch der Import-Knopf aus. */
    usePasteToImport(templateReady && !aiOpen && !templatesOpen, (files) => {
        setPastedFiles(files);
        setTemplateMenuOpen(false);
        setAiOpen(true);
    });
    const tableColumns = useMemo(
        () => (templateReady ? tableColumnsFromTemplate(aiConfig, loadedExtraColumns) : []),
        [templateReady, aiConfig, loadedExtraColumns],
    );
    /** Die freien Spalten — ihre Werte werden als eigene Angaben gespeichert. */
    const extraColumns = useMemo(
        () => tableColumns
            .filter((column) => !column.label && !column.fixed)
            .map((column) => ({ key: column.key, name: column.name, type: column.type, width: column.width, label: null })),
        [tableColumns],
    );
    /* Eine geladene Bestellung, deren eigene Angabe in der Vorlage unter
       demselben Namen steht: der Wert wandert unter den Schluessel der
       Vorlage, sonst staende die Spalte da und die Zelle bliebe leer.
       Bestellung und Vorlage kommen beide asynchron — wer als Zweiter
       ankommt, haengt um (`remapLoadedExtras`, aus beiden Antworten gerufen). */
    useEffect(() => { aiConfigRef.current = aiConfig; }, [aiConfig]);
    useEffect(() => { loadedExtrasRef.current = loadedExtraColumns; }, [loadedExtraColumns]);

    /* ESCAPE KLAPPT DEN DETAILABSCHNITT ZU. Er ist seit dem 08.09.2026 kein
       Fenster mehr, sondern ein Teil der Seite — die Taste bleibt trotzdem der
       schnellste Weg, ihn wieder loszuwerden. Liegt das Blatt mit den
       Anschreiben-Entwuerfen darueber, gehoert sie ihm: sonst raeumte ein
       Druck beide gleichzeitig weg. */
    useEffect(() => {
        if (!detailsOpen || draftsOpen) return undefined;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setDetailsOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [detailsOpen, draftsOpen]);

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
     * ── DIE ZEILEN AUS DEM BELEG-IMPORT ─────────────────────────────────────
     *
     * Vorgabe Samet: «Der Import übernimmt nur die eingestellten Angaben, er
     * rechnet nichts vor.» Genau so kommen sie hier an: die Werte stehen in den
     * Zellen, die die Vorlage benannt hat, und was daraus für ein Betrag wird,
     * rechnet die Tabelle danach — nach der Berechnungsart der Zeile, wie bei
     * jeder von Hand getippten Zeile auch.
     *
     * Der Steuersatz der Vorlage kommt MIT — er ist eine EINSTELLUNG, und ihn
     * hier fallen zu lassen hiesse, ihn zweimal wählen zu lassen.
     *
     * ── EIN BELEG ERSETZT DIE LISTE (Vorgabe Samet, 09.09.2026) ─────────────
     * «Der Beleg-Import soll nicht unten anhängen; ich will, dass er die
     * bestehende Liste leert und die neuen Zeilen einsetzt.»
     *
     * Bis heute mischte der Import (`mergeImportedOrderRows`): passende Zeilen
     * überschreiben, leere füllen, Rest anhängen. Das war für den ZWEITEN Beleg
     * desselben Lieferanten gedacht — beim Alltag, EIN Beleg pro Bestellung,
     * blieben dabei Zeilen des vorigen Belegs stehen und niemand sah es.
     * Jetzt ist ein Beleg der Inhalt der Bestellung: die Tabelle wird geleert
     * und mit seinen Zeilen gefüllt. Wer Zeilen behalten will, importiert
     * zuerst und ergänzt danach von Hand (das Plus unten links).
     *
     * Das Mischen lebt weiter — im WARENEINGANG, wo die Tabelle einer
     * gespeicherten Bestellung gehört und ein Beleg sie nur ergänzt.
     */
    const applyAiRows = (imported: DraftOrderRow[]) => {
        if (!imported.length) return;
        imported.forEach((row) => { row.origin = captureRowOrigin(row); });
        setRows(imported);
        setSelectedRows(new Set());
        toast.success(t('inv.aiImport.importedToast', { count: imported.length }));
        drawnCheck.show();
    };

    /* ── WELCHE ZEILE MITGESPEICHERT WIRD ───────────────────────────────
       Fehlerbild Samet (08.09.2026): «Es koennen leere Zellen dabei sein
       oder Zeilen, die trotzdem mit muessen.»

       Hier stand `row.articleId || row.name.trim()`: eine gelesene Zeile
       OHNE Bezeichnung fiel vor dem Speichern still heraus. Der Beleg
       hatte 35 Zeilen, die Tabelle zeigte 35 — gespeichert wurden 33, und
       niemand sah, welche zwei fehlten.

       Eine Zeile bleibt jetzt, sobald sie IRGENDETWAS traegt: einen
       Artikel, eine Bezeichnung, einen Bezeichner, eine Menge, einen Preis
       oder eine eigene Angabe. Weg faellt nur die vollstaendig leere Zeile
       — die, die das Raster ohnehin am Ende bereithaelt. */
    const filledRows = useMemo(
        () => rows.filter((row) => Boolean(
            row.articleId
            || row.name.trim()
            || row.code.trim()
            || row.serialNumber.trim()
            || row.grossPrice.trim()
            || row.netPrice.trim()
            || row.lineTotal.trim()
            /* Die Menge steht als «1» im leeren Raster — sie allein macht
               aus einer unberuehrten Zeile noch keine Position. */
            || (row.quantity.trim() && row.quantity.trim() !== '1')
            || Object.values(row.extras ?? {}).some((value) => String(value ?? '').trim()),
        )),
        [rows],
    );

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
        /* DIE EINZELNEN ZEILENBETRAEGE gehen mit: die Steuer wird JE ZEILE
           gerechnet und addiert, damit der Bildschirm dasselbe zeigt, was im
           PDF Zeile fuer Zeile nachzurechnen ist (Vorgabe Samet, 07.09.2026). */
        const lines = rows.map((row) => rowFigures(row).lineTotal);
        const net = rows.reduce((sum, row) => sum + rowFigures(row).lineTotal, 0);
        const discount = rows.reduce((sum, row) => sum + rowFigures(row).discountAmount, 0);
        const summary = computeOrderTotals({
            lines,
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
            const extras = draftExtras(row, extraColumns);
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
                ...(extras.length ? { extras } : {}),
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
            ...(() => {
                // Die eigenen Angaben reisen MIT ihren Ueberschriften, damit die
                // Bestellung ihre Spalten in einem Jahr noch benennen kann.
                const extras = draftExtras(row, extraColumns);
                return extras.length ? { extras } : {};
            })(),
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
     * BESTELLUNG LÖSCHEN (in der Maske) — "siparişe dönüştür"ün TERSİ: kayıt
     * FİYAT TALEBİNE döner, fiyat/KDV sütunları kapanır. 08.09.2026'da adı
     * "onayı geri al"dan "Bestellung löschen"e döndü (Vorgabe Samet: «wird die
     * Bestellung gelöscht, geht der Vorgang eine Stufe zurück») — YAPTIĞI İŞ
     * AYNIDIR, sadece kullanıcının gördüğü ad akışla uyumlu hâle geldi.
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
            toast.success(t('inv.orders.flow.orderDeleted'));
        } catch (error: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
            toast.error(error?.response?.data?.error || t('inv.orders.saveFailed'));
        }
    };

    const save = async (options?: { confirm?: boolean; convert?: boolean }) => {
        if (!filledRows.length) return;
        /* Ohne gueltige Vorlage gibt es keine Tabelle — und nichts zu speichern. */
        if (!templateReady) {
            toast.error(templateProblemText(templateFaults[0]));
            return;
        }

        if (!supplier.id && !supplier.name.trim()) {
            /* Unter dem Feld steht kein Fehlertext mehr (der «viele einzelne
               Text» ist weg) — ohne Hinweis bliebe das Speichern stumm. */
            setSupplierError(t('inv.orders.supplierRequired'));
            toast.error(t('inv.orders.supplierRequired'));
            return;
        }

        // Tutarı girilip adı boş bırakılmış ek ücret kaydedilmez: toplama giren
        // ama neyin ücreti olduğu belirsiz bir satır sessizce geçmesin.
        if (filledFees.some((fee) => !fee.name.trim())) {
            setFeeError(t('inv.orders.fees.nameRequired'));
            // Die Zusatzkosten liegen in den Bestelldetails — dort steht der Fehler.
            setDetailsOpen(true);
            return;
        }

        /* Die Rechenart braucht ihre Schlüssel — auch beim Speichern, denn die
           Vorlage kann nach dem Umstellen gewechselt haben. */
        if (calcModeProblem) {
            setCalcError(calcModeProblem);
            toast.error(calcModeProblem);
            return;
        }

        setSaving(true);
        try {
            /* ── KEIN ARTIKEL VOR DEM WARENEINGANG (Vorgabe Samet, 14.09.2026) ──
               «Bevor es in den Wareneingang übertragen ist, kommt nichts ins
               Lager und nichts in die Produkte — nicht einmal als Definition.»
               Bis heute legte das Speichern hier jede unbekannte Zeile als
               Artikel mit Menge 0 an (und vergab codelosen Zeilen einen
               ERP-Code). Das ist fort: die Zeile reist mit ihrem getippten
               Code — oder ohne — in der Bestellung, und erst `/receive` legt
               den Artikel an und vergibt den fehlenden Code. */
            const items = filledRows.map((row) => rowToItem(row));
            const header = {
                quoteNumber: quoteNumber.trim() || null,
                orderedByName: orderedByName.trim() || null,
                projectName: projectName.trim() || null,
                // Alıcı adı boşsa null gider: PDF alıcı bloğuna satır eklenmez.
                recipientName: recipientName.trim() || null,
                // Boş ön yazı null gider: sunucu NULL yazar, PDF standart metne döner.
                coverLetter: coverLetter.trim() || null,
                // Was die Vorlage nicht traegt, merkt sich die Bestellung: das PDF
                // wird später ohne die Vorlage gebaut. Der ERP-Code steht nie darin.
                hiddenColumnKeys: hiddenKeysForTemplate(aiConfig),
                // Und die Spalten der Vorlage selbst: das PDF schreibt ihre Namen
                // als Titel und haelt ihre Reihenfolge (Vorgabe Samet, 11.09.2026).
                tableColumns: tableColumnsSnapshot(aiConfig),
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
                if (!options?.confirm) { toast.success(t('inv.orders.updatedToast')); drawnCheck.show(); }
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
                drawnCheck.show();
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
                // WEITER AUF DIE BESTELLSEITE, nicht in die Liste (08.09.2026):
                // der Vorgang geht dort der Reihe nach weiter — senden, und dann
                // in den Wareneingang. Die Liste wäre ein Abbruch mitten im Weg.
                navigate(`/inventory/orders/${savedId}`);
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


    /* ── DIE REIHENFOLGE DER SPALTEN IST DIE DER VORLAGE (11.09.2026) ───────
       Die je Anwender gespeicherte Liste und ihr Listenknopf sind fort: wer
       die Spalten umstellen will, stellt sie in der Vorlage um — dort, wo sie
       auch benannt werden. */
    const columnOrder = useMemo(() => tableColumns.map((column) => column.id), [tableColumns]);
    const columnById = useMemo(
        () => new Map(tableColumns.map((column) => [column.id, column])),
        [tableColumns],
    );
    /** Die freien Spalten je Tabellenschluessel (= ihr Vorlagenschluessel). */
    const extraByKey = useMemo(
        () => new Map(tableColumns.filter((column) => !column.label && !column.fixed).map((column) => [column.id, column])),
        [tableColumns],
    );

    // Sichtbare Spalten + Auswahlkästchen links + Papierkorb rechts.
    const columnCount = columnOrder.length + 2;
    const tableMinWidth = 240 + tableColumns.length * 120;
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    // Fiyat sütunları FİYAT TALEBİ kipinde hiç çizilmez — `<col>` listesi de
    // aynı koşulu izler, yoksa sütunlar kayardı.
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-order-create:col-widths:v2',
        defaults: {
            code: 144, quantity: 96, grossPrice: 112, netPrice: 112,
            discount: 96, discount2: 96, lineTotal: 128, remove: 48,
            // Die freien Spalten tragen feste Schlüssel (`c1` … `c12`), damit
            // eine gespeicherte Breite ihre Umbenennung überlebt; `x1` … `x5`
            // sind die Schluessel aelterer Bestellungen.
            c1: 120, c2: 120, c3: 120, c4: 120, c5: 120, c6: 120,
            c7: 120, c8: 120, c9: 120, c10: 120, c11: 120, c12: 120,
            x1: 120, x2: 120, x3: 120, x4: 120, x5: 120,
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

    /* ══ EINE SPALTE, VIER FRAGEN ═══════════════════════════════════════════
       Seit die Reihenfolge frei ist (09.09.2026), kann die Tabelle ihre Zellen
       nicht mehr der Reihe nach hinschreiben: sie fragt je Schlüssel, wie die
       Spalte HEISST, wo sie AUSGERICHTET ist, wie BREIT sie ist und was in der
       Zelle steht. Feste Felder und eigene Angaben beantworten dieselben vier
       Fragen — genau deshalb dürfen sie sich mischen. */

    /** Die Überschrift — der Name, den die Vorlage der Spalte gibt. */
    const columnLabel = (id: OrderColumnId): string => {
        const column = columnById.get(id);
        if (column) return column.fixed ? kindLabels.code : column.name;
        return id;
    };

    /** Zahlen rechts, Text links — nach der Art, die die Vorlage vergibt. */
    const columnAlign = (id: OrderColumnId): 'left' | 'right' => {
        const column = columnById.get(id);
        if (column?.fixed || id === 'name') return 'left';
        return column?.type === 'number' || (column?.label && column.label !== 'productName') ? 'right' : 'left';
    };

    /** Der Name trägt KEINE Breite: er saugt auf, was übrig bleibt. */
    const columnWidthStyle = (id: OrderColumnId) => {
        if (id === 'name') return undefined;
        const extra = extraByKey.get(id);
        const stored = (grid.widths as Record<string, number>)[id];
        return { width: extra ? (extra.width ?? stored ?? 120) : stored };
    };

    const cellClassName = (id: OrderColumnId, rowDirect: boolean, rowSupplier: boolean): string | undefined => {
        // Der Zeilenbetrag steht in der automatischen Rechnung als fertige Zahl
        // in der Zelle (kein Eingabefeld) — die Zelle trägt dann die Schrift.
        if (id === 'lineTotal' && !rowDirect) {
            return 'text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white';
        }
        void rowSupplier;
        return undefined;
    };

    /** Der Inhalt der Zelle. */
    const renderCell = (
        id: OrderColumnId,
        row: DraftOrderRow,
        figures: ReturnType<typeof rowFigures>,
        rowDirect: boolean,
        rowSupplier: boolean,
        rowChanged: boolean,
    ): React.ReactNode => {
        // ── Eine eigene Angabe der Vorlage: frei änderbar wie jede Zelle. ────
        const extra = extraByKey.get(id);
        if (extra) {
            return (
                <input
                    value={row.extras?.[extra.key] ?? ''}
                    onChange={(event) => patchRow(row.key, {
                        extras: { ...(row.extras ?? {}), [extra.key]: event.target.value },
                    })}
                    inputMode={extra.type === 'number' ? 'decimal' : undefined}
                    className={`${CELL_INPUT_CLASS} ${extra.type === 'number' ? 'text-right font-mono' : ''}`}
                />
            );
        }

        switch (id) {
            case 'name':
                return (
                    <>
                        <ArticleComboCell
                            value={row.name}
                            onChange={(next) => onProductTyped(row.key, next)}
                            onPick={(article) => onProductPicked(row.key, article)}
                            onCreate={(name) => markAsNewArticle(row.key, name)}
                            onOpenAll={() => setAllPickerRowKey(row.key)}
                            linked={Boolean(row.articleId)}
                            canCreate={canCreateArticles}
                            autoFocus={row.key === focusRowKey}
                            addLabel={t('inv.productPicker.addNew', { name: row.name.trim() })}
                            viewAllLabel={kindLabels.viewAll}
                        />
                        {row.error && (
                            <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                        )}
                    </>
                );

            /* SERİ KOD: ürüne bağlı satırda normalde salt okunurdur (ürünün
               kimliği değişmesin). Doğrudan kopyalamada HER hücre düzenlenebilir
               olduğu için orada da giriş kutusudur. */
            case 'code':
                return row.articleId && !rowDirect ? (
                    <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                        {row.code}
                    </span>
                ) : (
                    <input
                        value={row.code}
                        onChange={(event) => patchRow(row.key, { code: event.target.value })}
                        // Seri kod katalogda varsa o ürün satırın üzerine yazılır.
                        onBlur={(event) => void applySerialCodeMatch(row.key, event.target.value)}
                        /* Leer ist erlaubt: fehlt der Code, vergibt ihn der Server
                           beim Speichern (ART-NNNNN) und trägt ihn danach hier ein. */
                        className={`${CELL_INPUT_CLASS} font-mono`}
                    />
                );

            /* Menge: Zeilen mit einer Mengenstaffel holen sich hier ihren Preis
               neu (`patchRowQuantity`); alle anderen bleiben unverändert. */
            case 'quantity':
                return (
                    <input
                        value={row.quantity}
                        onChange={(event) => patchRowQuantity(row.key, event.target.value)}
                        onFocus={selectWholeCell}
                        inputMode="decimal"
                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                    />
                );

            case 'grossPrice':
                return (
                    <input
                        value={row.grossPrice}
                        onChange={(event) => patchRow(row.key, { grossPrice: event.target.value })}
                        onFocus={selectWholeCell}
                        inputMode="decimal"
                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                    />
                );

            /* NET FİYAT normalde TÜRETİLMİŞTİR: brüt birim fiyat × indirim
               çarpanı. Elle girilemez — girilebilse indirim yüzdeleriyle
               çelişirdi. DOĞRUDAN GİRİŞTE türetme yoktur: hücre dosyadan gelen
               değeri taşır ve düzenlenebilir. TEDARİKÇİ HESABINDA fiyat karttan
               gelir ve KİLİTLİDİR — miktar değişince tutar orantılı ölçeklenir. */
            case 'netPrice':
                if (rowDirect) {
                    return (
                        <span className="flex items-center gap-1">
                            <input
                                value={row.netPrice}
                                onChange={(event) => patchRow(row.key, { netPrice: event.target.value })}
                                onFocus={selectWholeCell}
                                inputMode="decimal"
                                /* Hücre boşken İNDİRİMLİ fiyat soluk yazıyla görünür:
                                   kaydedilecek değer budur. */
                                placeholder={fmtMoney(figures.netUnitPrice)}
                                className={`${CELL_INPUT_CLASS} text-right font-mono placeholder:text-slate-700 dark:placeholder:text-white/80`}
                            />
                            {recallButton(row, rowChanged)}
                        </span>
                    );
                }
                if (rowSupplier) {
                    /* Sabit birim fiyat TAM DUYARLIKLA gösterilir: 2 haneye
                       yuvarlanmış hâli satır tutarıyla çelişir görünürdü. */
                    return (
                        <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80">
                            {row.netPrice.trim() ? fmtUnitPricePrecise(parseNum(row.netPrice) ?? 0) : '—'}
                            {recallButton(row, rowChanged)}
                        </span>
                    );
                }
                return (
                    <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80">
                        {row.grossPrice.trim() ? fmtMoney(figures.netUnitPrice) : '—'}
                        {recallButton(row, rowChanged)}
                    </span>
                );

            /* İndirim yüzdeleri. Tedarikçi kipindeki SATIRDA indirim KİLİTLİDİR
               (fiyat sabittir). */
            case 'discount':
            case 'discount2':
                return rowSupplier ? (
                    <span className="block text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                        {fmtPercent(0)}
                    </span>
                ) : (
                    <input
                        value={id === 'discount' ? row.discount : row.discount2}
                        onChange={(event) => patchRow(row.key, id === 'discount'
                            ? { discount: event.target.value }
                            : { discount2: event.target.value })}
                        onFocus={selectWholeCell}
                        inputMode="decimal"
                        className={`${CELL_INPUT_CLASS} text-right font-mono placeholder:text-slate-700 dark:placeholder:text-white/80`}
                    />
                );

            /* ── DER BETRAG DER ZEILE ───────────────────────────────────────
               Vorgabe Samet: «Beim direkten Uebertragen soll die Zeilensumme
               direkt eingetragen werden und das tatsaechliche Ergebnis der
               Zeile sein.» In der manuellen Eingabe ist die Zelle darum
               schreibbar und das Getippte IST der Betrag — er wird nie
               nachgerechnet. Leer heisst «Menge × Nettopreis», und genau das
               steht dann blass darin. KEINE STEUER AUF DER ZEILE: sie faellt
               einmal auf die ganze Bestellung, unten im Total. */
            case 'lineTotal':
                return rowDirect ? (
                    <input
                        value={row.lineTotal}
                        onChange={(event) => patchRow(row.key, { lineTotal: event.target.value })}
                        onFocus={selectWholeCell}
                        inputMode="decimal"
                        placeholder={fmtMoney(figures.lineTotal)}
                        className={`${CELL_INPUT_CLASS} text-right font-mono font-semibold text-slate-900 placeholder:font-semibold placeholder:text-slate-900 dark:text-white dark:placeholder:text-white`}
                    />
                ) : fmtMoney(figures.lineTotal);

            default:
                return null;
        }
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
                className="flex w-64 flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white p-6 text-center transition-colors hover:border-[#0066e0] hover:shadow-md dark:border-white/15 dark:bg-transparent dark:hover:border-white/40"
            >
                <span className="flex size-12 items-center justify-center rounded-full bg-[#0a7aff]/10 text-[#0a7aff] dark:bg-white/10 dark:text-white">
                    {icon}
                </span>
                <span className="text-[14px] font-semibold text-slate-800 dark:text-white">{label}</span>
                <span className="text-[12px] leading-relaxed text-slate-400 dark:text-white/50">{hint}</span>
            </button>
        );
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader
                    title={t('inv.orders.createTitle')}
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
            {/* DER KOPF LÄUFT NICHT MEHR MIT (Vorgabe Samet, 09.09.2026:
                «‹Auftrag bestätigen› soll nicht festgeklebt sein; die
                Überschriften sollen beim Runterscrollen nicht stehen bleiben»).
                Er scrollt weg wie jeder andere Seiteninhalt. */}
            <InventoryListHeader
                /* ── DER VORGANG, AUCH IN DER MASKE ──────────────────────────
                   Dasselbe Schrittband wie auf der Auftragsseite und im
                   Wareneingang, an derselben Stelle: mittig in der Kopfzeile.
                   Man sieht beim Schreiben, auf welcher Stufe man steht. Eine
                   NEUE, noch nicht gespeicherte Erfassung steht auf der Stufe,
                   die am Anfang gewählt wurde. */
                center={<OrderFlowSteps stageIndex={stageIndexOf(editStatus ?? (priceless ? 'DRAFT' : 'ORDER_DRAFT'))} />}
                title={(
                    <span className="flex items-center gap-2">
                        {editId
                            ? `${t(priceless ? 'inv.orders.editTitlePriceRequest' : 'inv.orders.editTitle')}${editReference ? ` · ${editReference}` : ''}`
                            : t(priceless ? 'inv.orders.createTitlePriceRequest' : 'inv.orders.createTitle')}
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
                    ? (
                        <button
                            type="button"
                            disabled={saving || !canTransfer || !filledRows.length}
                            onClick={() => void save()}
                            title={t('common.save')}
                            className="flex h-10 items-center rounded-full bg-[#0a7aff] px-5 text-[13px] font-semibold text-white shadow-sm transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {saving ? <LoadingDots label={t('common.loadingData')} /> : t('common.save')}
                        </button>
                    )
                    : ((!editStatus || canConfirmToOrder(editStatus)) ? (
                        <div className="flex items-center gap-2">
                            {/* ONAYI GERİ AL — yalnızca KAYITLI sipariş taslağında:
                                talebin siparişe dönüştürülmesini geri alır, kayıt
                                fiyat talebine döner (kullanıcı isteği 2026-08-03).
                                Yeni, henüz kaydedilmemiş siparişte geri alınacak
                                bir onay yoktur. */}
                            {/* «BESTELLUNG LÖSCHEN» — eine Stufe zurück auf die
                                Preisanfrage, genau wie auf der Bestellseite. Die
                                Zeilen und ihre Preise bleiben stehen; auf der
                                Anfragestufe sind sie nur nicht sichtbar und
                                kommen beim nächsten Umwandeln zurück. In einer
                                neuen, noch nicht gespeicherten Erfassung gibt es
                                nichts, worauf man zurückgehen könnte. */}
                            {editId && editStatus === 'ORDER_DRAFT' && (
                                <button
                                    type="button"
                                    disabled={saving || !canTransfer}
                                    onClick={() => setStageConfirm('revoke')}
                                    title={t('inv.orders.flow.deleteOrder')}
                                    className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                                >
                                    <Trash01 size={15} />
                                    {t('inv.orders.flow.deleteOrder')}
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

            {/* ── DIE RÜCKFRAGE IST EIN STREIFEN ─────────────────────────────
                Kein Fenster mehr (Vorgabe Samet, 08.09.2026): die Frage steht
                in der Seite, dort wo die Handlung ausgeloest wurde, und der
                Speichervorgang laeuft danach im Knopf oben weiter. */
            }
            {stageConfirm && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-3 dark:border-white/15 dark:bg-white/[0.04]">
                    <span className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] text-slate-700 dark:text-white/80">
                        <AlertTriangle size={15} className="mt-px shrink-0" />
                        <span>
                            {t(stageConfirm === 'confirm'
                                ? 'inv.orders.confirmOrderConfirm'
                                : stageConfirm === 'revoke'
                                    ? 'inv.orders.flow.deleteOrderConfirm'
                                    : 'inv.orders.convertConfirm')}
                        </span>
                    </span>
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setStageConfirm(null)}
                            className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 dark:border-white/20 dark:bg-transparent dark:text-white/70"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                const kind = stageConfirm;
                                setStageConfirm(null);
                                // GERİ ALMA kaydetmez: yalnızca durumu geri alır
                                // (kaydedilmemiş düzenlemeler tabloda durur).
                                if (kind === 'revoke') { void revokeToPriceRequest(); return; }
                                void save(kind === 'confirm' ? { confirm: true } : { convert: true });
                            }}
                            className={`flex h-9 items-center rounded-md px-3.5 text-[12.5px] font-semibold text-white transition-colors ${
                                stageConfirm === 'revoke' ? 'bg-red-600 hover:bg-red-700' : 'bg-[#0a7aff] hover:bg-[#0066e0]'
                            }`}
                        >
                            {t('common.confirm')}
                        </button>
                    </span>
                </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2.5">
                    {/* ── LIEFERANT ────────────────────────────────────────────
                        OHNE Beschriftung (Vorgabe Samet, 07.09.2026: «da steht
                        viel einzelner Text, weg damit»): der Platzhalter im Feld
                        sagt bereits, was hineingehoert. Getippt wird hier
                        staendig, darum bleibt das Feld draussen; alles Uebrige
                        liegt hinter dem Stift daneben. */}
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
                            inputClassName={`!h-10 !text-[13px] ${supplierError ? '!border-red-400' : ''}`}
                        />
                    </div>

                    {/* ── DER EINE STIFT ───────────────────────────────────────
                        Vorgabe Samet: «Zusatzkosten gehoeren in die
                        Bestelldetails; dort soll nur ein Stift stehen. Ein Klick,
                        und alles liegt in einer einfachen Kiste im Apple-Stil.»
                        Aus zwei beschrifteten Knoepfen wird ein Symbol; die
                        Auskunft, die von aussen noetig ist, ist der Punkt an
                        seiner Ecke: die Bestellung traegt Zusatzkosten. */}
                    <button
                        type="button"
                        onClick={() => setDetailsOpen((open) => !open)}
                        title={t('inv.orders.detailsTitle')}
                        aria-label={t('inv.orders.detailsTitle')}
                        aria-expanded={detailsOpen}
                        className={`ofi-ord-pencil${filledFees.length > 0 ? ' is-marked' : ''}${detailsOpen ? ' is-on' : ''}`}
                    >
                        <Edit01 size={16} />
                    </button>

                    {/* ── BERECHNUNG, GLEICH NEBEN DEM STIFT (14.09.2026) ─────
                        In der Preisanfrage gibt es nichts zu rechnen. Ein roter
                        Punkt an der Ecke: die gewählte Art verlangt Schlüssel,
                        die die aktive Vorlage nicht zugeordnet hat. */}
                    {!priceless && (
                        <button
                            type="button"
                            onClick={() => { setCalcError(calcModeProblem); setCalcOpen(true); }}
                            title={t('inv.orders.calcMode.title')}
                            aria-label={t('inv.orders.calcMode.title')}
                            disabled={!templateReady}
                            className={`ofi-ord-calcbtn${calcOpen ? ' is-on' : ''}${calcModeProblem && templateReady ? ' is-warn' : ''}`}
                        >
                            <SquareDivide size={16} />
                            <span>{t(calcMode === 'AUTO' ? 'inv.orders.calcMode.auto' : calcMode === 'SUPPLIER' ? 'inv.orders.calcMode.supplier' : 'inv.orders.calcMode.direct')}</span>
                        </button>
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

                {/* ── VORLAGE (Vorgabe Samet: «statt dessen gibt es eine
                    Vorlagenauswahl») ────────────────────────────────────────
                    Welche Vorlage gerade gilt, und ein Weg zu jeder anderen.
                    Die Wahl bleibt stehen — auch für die nächste Bestellung. */}
                <span className="ofi-poi-menuwrap">
                    <button
                        type="button"
                        className="ofi-poi-ghost"
                        onClick={() => { setTemplateMenuOpen((open) => !open); }}
                    >
                        <Settings01 size={14} />
                        {activeTemplate ? activeTemplate.title : t('inv.aiImport.templateNone')}
                        <ChevronDown size={13} />
                    </button>
                    {templateMenuOpen && (
                        <>
                            <span className="fixed inset-0 z-50" onClick={() => setTemplateMenuOpen(false)} />
                            <span className="ofi-poi-menu">
                                {calcTemplates.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        className={activeTemplate?.id === template.id ? 'is-on' : ''}
                                        onClick={() => {
                                            setActiveTemplateId(template.id);
                                            selectPreferredTemplate(templateDocumentType, template.id);
                                            setTemplateMenuOpen(false);
                                            // Ein Klick oeffnet die Vorlage — die Auswahl allein
                                            // waere eine stumme Aenderung an der Rechnung.
                                            setOpenTemplateId(template.id);
                                            setTemplatesOpen(true);
                                        }}
                                    >
                                        {activeTemplate?.id === template.id ? <Check size={14} /> : <span style={{ width: 14 }} />}
                                        <span>
                                            {template.title}
                                            <small>{t('inv.aiImport.columnCount', { count: template.config.columns.length })}</small>
                                        </span>
                                    </button>
                                ))}
                                {calcTemplates.length > 0 && <hr />}
                                <button type="button" onClick={() => { setTemplateMenuOpen(false); setTemplatesOpen(true); }}>
                                    <Settings01 size={14} />
                                    <span>{t('inv.aiImport.menuTemplates')}</span>
                                </button>
                            </span>
                        </>
                    )}
                </span>

                {/* ── BELEG IMPORTIEREN ────────────────────────────────────
                    EIN Knopf, EIN Weg (Vorgabe Samet, 07.09.2026): «Unter
                    ‹Beleg importieren› brauche ich kein ‹Meine Vorlagen› — es
                    gibt ja schon eine Vorlagenauswahl.» Das Menue darunter trug
                    danach nur noch einen Eintrag; also faellt es weg und der
                    Klick oeffnet unmittelbar den Import. Zu den Vorlagen fuehrt
                    der Knopf links daneben. */}
                <button
                    type="button"
                    className="ofi-poi-launch is-alive"
                    disabled={!templateReady}
                    title={templateReady ? undefined : t('inv.aiImport.templateRequiredTitle')}
                    onClick={() => { setAiOpen(true); setTemplateMenuOpen(false); }}
                >
                    <Zap size={14} />
                    {t('inv.aiImport.importButton')}
                </button>

                </div>
            </div>

            {/* ── DIE BESTELLDETAILS STEHEN IN DER MITTE (Vorgabe Samet,
                09.09.2026) ─────────────────────────────────────────────────
                Am 08.09. lagen sie kurz IN der Seite; das schob die Tabelle
                nach unten und kostete beim Tippen jedes Mal den Blick auf die
                Zeilen. «Die Bearbeiten-Karte gehört in die Mitte, sie darf
                unten keinen Platz wegnehmen und die Tabelle nicht verschieben.»
                Also wieder eine Karte über der Seite — die Tabelle bleibt, wo
                sie ist, und die Karte legt sich mittig darüber. Das ist kein
                Rückschritt zum alten Blatt: der ABLAUF (Stufen, Handlungen,
                Rückfragen) bleibt Seite; nur dieses eine Formular schwebt. */}
            {detailsOpen && createPortal(
                <div
                    className="ofi-ord-scrim"
                    role="dialog"
                    aria-modal="true"
                    aria-label={t('inv.orders.detailsTitle')}
                    /* Klick auf den Schleier schliesst — wie überall im Haus. */
                    onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailsOpen(false); }}
                >
                    <div className="ofi-ord">
                        <div className="ofi-ord-head">
                            <span className="ofi-ord-ghost" />
                            <b>{t('inv.orders.detailsTitle')}</b>
                            <button
                                type="button"
                                className="ofi-ord-x"
                                onClick={() => setDetailsOpen(false)}
                                aria-label={t('common.close')}
                            >
                                <X size={16} />
                            </button>
                        </div>

                        <div className="ofi-ord-body">
                            {/* ── DIE BESTELLUNG ────────────────────────────────
                                Ohne eigenen Titel: der Titel der Karte steht
                                direkt darueber und saegte dasselbe Wort zweimal. */}
                            <div className="ofi-ord-group">
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.reference')}</span>
                                    <input
                                        value={reference}
                                        onChange={(event) => setReference(event.target.value)}
                                        className="is-mono"
                                    />
                                </label>
                                {/* «Besteller»: wer bestellt — vorbelegt mit dem
                                    vollen Namen des angemeldeten Benutzers. */}
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.orderedBy')}</span>
                                    <input
                                        value={orderedByName}
                                        onChange={(event) => setOrderedByName(event.target.value)}
                                    />
                                </label>
                                {/* Empfänger — freiwillig. Steht er da, erscheint er
                                    im PDF klein unter dem Lieferantennamen. */}
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.recipientName')}</span>
                                    <input
                                        value={recipientName}
                                        onChange={(event) => setRecipientName(event.target.value)}
                                        maxLength={120}
                                    />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.project')}</span>
                                    <input
                                        value={projectName}
                                        onChange={(event) => setProjectName(event.target.value)}
                                    />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.quoteNumber')}</span>
                                    <input
                                        value={quoteNumber}
                                        onChange={(event) => setQuoteNumber(event.target.value)}
                                        className="is-mono"
                                    />
                                </label>
                            </div>

                            {/* ── ZUSATZKOSTEN ────────────────────────────────────
                                Fracht, Verpackung, Montage… Jede Zeile trägt
                                Bezeichnung und Betrag; die Beträge gehen in die
                                MEHRWERTSTEUER-GRUNDLAGE ein (Zeilensumme +
                                Zusatzkosten). Ein Betrag ohne Bezeichnung wird
                                nicht gespeichert — `save` sagt es und öffnet
                                dieses Fenster wieder.
                                IM FIYAT TALEBİ nicht sichtbar: dort gibt es
                                überhaupt keine Beträge. */}
                            {!priceless && (
                                <>
                                    <span className="ofi-ord-cap">{t('inv.orders.fees.title')}</span>
                                    <div className="ofi-ord-group">
                                        {fees.map((fee) => (
                                            <div
                                                key={fee.key}
                                                className={`ofi-ord-row${feeError && !fee.name.trim() ? ' is-invalid' : ''}`}
                                            >
                                                {/* Das rote Minus aus der iOS-Liste. */}
                                                <button
                                                    type="button"
                                                    className="ofi-ord-dot is-remove"
                                                    onClick={() => removeFee(fee.key)}
                                                    title={t('inv.orders.fees.removeRow')}
                                                    aria-label={t('inv.orders.fees.removeRow')}
                                                >
                                                    <Minus size={13} />
                                                </button>
                                                <input
                                                    value={fee.name}
                                                    onChange={(event) => patchFee(fee.key, { name: event.target.value })}
                                                />
                                                <input
                                                    value={fee.amount}
                                                    onChange={(event) => patchFee(fee.key, { amount: event.target.value })}
                                                    inputMode="decimal"
                                                    aria-label={t('inv.orders.fees.amountLabel')}
                                                    className="is-amount"
                                                />
                                            </div>
                                        ))}
                                        <button type="button" className="ofi-ord-action" onClick={addFee}>
                                            <span className="ofi-ord-dot is-add">
                                                <Plus size={13} />
                                            </span>
                                            {t('inv.orders.fees.addButton')}
                                        </button>
                                    </div>
                                </>
                            )}

                            {/* ── MEHRWERTSTEUER ──────────────────────────────────
                                EIN Satz für die ganze Bestellung: das Land kommt
                                aus der Liste (eigene Länder lassen sich unten
                                anhängen und bleiben im Browser stehen), der Satz
                                fällt auf Zeilensumme + Zusatzkosten. Im
                                Fiyat talebi gibt es keine Beträge — und damit
                                auch keinen Satz. */}
                            {!priceless && (
                                <>
                                    <span className="ofi-ord-cap">{t('inv.orders.columns.vat')}</span>
                                    <div className="ofi-ord-group">
                                        <div className="ofi-ord-row">
                                            <span className="ofi-ord-label">{t('inv.orders.vatColumn.country')}</span>
                                            {/* iOS-Auswahl statt Systemfeld (Vorgabe Samet):
                                                ein Knopf, der die gemeinsame Trefferliste
                                                oeffnet — dasselbe Bauteil wie ueberall sonst
                                                im Haus. Ein gespeichertes, inzwischen
                                                geloeschtes eigenes Land bleibt waehlbar. */}
                                            <SelectMenu
                                                className="ofi-ord-menu"
                                                buttonClassName="ofi-ord-select"
                                                ariaLabel={t('inv.orders.vatColumn.country')}
                                                value={orderVatCountry}
                                                listWidth={260}
                                                options={[
                                                    ...(!vatCountryList.some((entry) => entry.label === orderVatCountry) && orderVatCountry
                                                        ? [{ value: orderVatCountry, label: orderVatCountry }]
                                                        : []),
                                                    ...vatCountryList.map((entry) => ({ value: entry.label, label: entry.label })),
                                                ]}
                                                onChange={(next) => {
                                                    setOrderVatCountry(next);
                                                    const entry = vatCountryList.find((candidate) => candidate.label === next);
                                                    if (entry?.rates.length) setOrderVatRate(String(entry.rates[0]));
                                                }}
                                            />
                                        </div>
                                        <div className="ofi-ord-row">
                                            <span className="ofi-ord-label">{t('inv.orders.vatColumn.rates')}</span>
                                            <span className="ofi-ord-pills">
                                                {(vatCountryList.find((entry) => entry.label === orderVatCountry)?.rates ?? []).map((rate) => (
                                                    <button
                                                        key={rate}
                                                        type="button"
                                                        onClick={() => setOrderVatRate(String(rate))}
                                                        className={(parseNum(orderVatRate) ?? 0) === rate ? 'is-on' : undefined}
                                                    >
                                                        {fmtPercent(rate)}
                                                    </button>
                                                ))}
                                                <input
                                                    value={orderVatRate}
                                                    onChange={(event) => setOrderVatRate(event.target.value)}
                                                    inputMode="decimal"
                                                    aria-label={t('inv.orders.vatColumn.custom')}
                                                    className="is-num"
                                                />
                                                <em>%</em>
                                            </span>
                                        </div>
                                        <div className="ofi-ord-row">
                                            <span className="ofi-ord-label">{t('inv.orders.vatSheet.customCountry')}</span>
                                            <span className="ofi-ord-pair">
                                                <input
                                                    value={customVatLabel}
                                                    onChange={(event) => setCustomVatLabel(event.target.value)}
                                                />
                                                <input
                                                    value={customVatRate}
                                                    onChange={(event) => setCustomVatRate(event.target.value)}
                                                    inputMode="decimal"
                                                    aria-label={t('inv.orders.vatColumn.custom')}
                                                    className="is-num"
                                                />
                                                <button
                                                    type="button"
                                                    disabled={!customVatLabel.trim()}
                                                    onClick={addCustomVatCountry}
                                                    className="ofi-ord-dot is-add"
                                                    title={t('inv.orders.vatSheet.addToList')}
                                                    aria-label={t('inv.orders.vatSheet.addToList')}
                                                >
                                                    <Plus size={13} />
                                                </button>
                                            </span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* ── ANSCHREIBEN ─────────────────────────────────────
                                Der Text, der im PDF VOR den Positionen steht.
                                Bleibt das Feld leer, druckt das Dokument seinen
                                eigenen Standardtext — genau den, der als
                                Platzhalter dasteht. Darunter zwei Zeilen: die
                                gespeicherten Entwürfe, und der Weg zurück zum
                                Standardtext (= das Feld leeren). */}
                            <span className="ofi-ord-cap">{t('inv.orders.coverLetter.title')}</span>
                            <div className="ofi-ord-group">
                                <textarea
                                    value={coverLetter}
                                    onChange={(event) => setCoverLetter(event.target.value)}
                                    placeholder={t('inv.orders.coverLetter.defaultText')}
                                    className="ofi-ord-text"
                                />
                                <button
                                    type="button"
                                    className="ofi-ord-action"
                                    onClick={() => { setDraftError(null); setDraftsOpen(true); }}
                                >
                                    <File05 size={15} />
                                    {t('inv.orders.coverLetter.draftsButton')}
                                </button>
                                <button
                                    type="button"
                                    className="ofi-ord-action"
                                    disabled={!coverLetter.trim()}
                                    onClick={() => setCoverLetter('')}
                                >
                                    <RefreshCcw01 size={15} />
                                    {t('inv.orders.coverLetter.resetDefault')}
                                </button>
                            </div>
                        </div>

                        <div className="ofi-ord-footbar">
                            {feeError
                                ? <span className="ofi-ord-err">{feeError}</span>
                                : filledFees.length > 0 && <span className="ofi-ord-total">{fmtMoney(feesTotal)}</span>}
                            {/* «Fertig» klappt den Abschnitt nur zu — gespeichert
                                wird die ganze Bestellung mit ihrem einen Knopf. */}
                            <button type="button" className="ofi-ord-done" onClick={() => setDetailsOpen(false)}>
                                {t('common.done')}
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}

            {/* ── OHNE VORLAGE KEINE TABELLE (Vorgabe Samet, 11.09.2026) ────
                «Die Tabellenspalten lassen sich ohne Vorlage nicht anzeigen.»
                Fehlt sie — oder fehlen ihr die Pflichtzuordnungen —, steht
                hier der Hinweis und der Weg zur Vorlage; nichts sonst. */}
            {!templateReady ? (
                <SectionCard title={t('inv.orders.sectionEditor', { count: 0 })}>
                    <div className="ofi-ord-need">
                        <AlertTriangle size={22} />
                        <b>{t('inv.aiImport.templateRequiredTitle')}</b>
                        <span>{activeTemplate ? templateProblemText(templateFaults[0]) : t('inv.aiImport.templateRequiredHint')}</span>
                        <button type="button" className="ofi-ord-done" onClick={() => { setOpenTemplateId(activeTemplate?.id ?? null); setTemplatesOpen(true); }}>
                            {t(activeTemplate ? 'inv.aiImport.templateFixButton' : 'inv.aiImport.templateCreateButton')}
                        </button>
                    </div>
                </SectionCard>
            ) : (
            <SectionCard
                title={t('inv.orders.sectionEditor', { count: filledRows.length })}
                action={(
                    /* ── DAS TOTAL, ALS ZAHL ─────────────────────────────────
                       Vorgabe Samet (07.09.2026): «Das Gesamttotal bitte direkt
                       als Zahl — nicht bloss ‹CHF›, nicht hinter einem Hover
                       versteckt; die Ziffern, auch die Nullen, sollen dastehen.»
                       Also steht es hier gross und dauerhaft, mit seinen zwei
                       Rappenstellen (`fmtMoney` setzt sie seit heute immer), und
                       davor in einer Zeile, WORAUS es sich ergibt — sichtbar,
                       nicht als Sprechblase. Es verschwindet auch nicht mehr,
                       wenn die Tabelle noch leer ist: dann steht 0.00 da, und
                       man sieht, dass gerechnet wird.
                       In der Preisanfrage gibt es keine Betraege — dort nichts. */
                    !priceless ? (
                        <span className="ofi-ord-sum">
                            {(totals.vat > 0 || totals.fees !== 0) && (
                                <span className="ofi-ord-sum__parts">
                                    {/* Die Reihenfolge ist die des Rechnens
                                        (Vorgabe Samet, 07.09.2026): Zeilenbeträge,
                                        darauf die je Zeile gerechnete Steuer, und
                                        die Zusatzkosten SEPARAT obendrauf. */}
                                    {[
                                        `${t('inv.orders.totalNet')} ${fmtMoney(totals.net)}`,
                                        ...(totals.vat > 0
                                            ? [`${t('inv.orders.columns.vat')} ${fmtPercent(parseNum(orderVatRate) ?? 0)} ${fmtMoney(totals.vat)}`]
                                            : []),
                                        ...(totals.fees !== 0 ? [`${t('inv.orders.fees.title')} ${fmtMoney(totals.fees)}`] : []),
                                    ].join('  +  ')}
                                </span>
                            )}
                            <b className="ofi-ord-sum__value">{fmtMoney(totals.grand)}</b>
                        </span>
                    ) : undefined
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full" style={{ minWidth: tableMinWidth }}>
                        {/* Die Spaltenbreiten folgen der REIHENFOLGE, nicht mehr
                            einer festen Liste: was oben in der Spaltenliste
                            steht, steht hier links. Der Name trägt keine Breite
                            — er saugt den Rest auf, wo immer er gerade sitzt. */}
                        <colgroup>
                            <col style={{ width: 40 }} />
                            {columnOrder.map((id) => (
                                <col key={id} style={columnWidthStyle(id)} />
                            ))}
                            <ResizableCols keys={['remove'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                {/* Das Kästchen ganz links wählt ALLE Zeilen —
                                    der kurze Weg zum Papierkorb daneben. */}
                                <th className="text-center">
                                    <input
                                        type="checkbox"
                                        checked={rows.length > 0 && selectedRows.size === rows.length}
                                        onChange={toggleSelectAll}
                                        aria-label={t('inv.orders.rows.selectAll')}
                                        className="size-3.5 cursor-pointer accent-[#0a7aff]"
                                    />
                                </th>
                                {columnOrder.map((id) => (
                                    <th
                                        key={id}
                                        className={`relative ${columnAlign(id) === 'right' ? 'text-right' : 'text-left'}`}
                                    >
                                        {columnLabel(id)}
                                        {id !== 'name' && <ColResizeHandle {...grid.resizeProps(id as 'code')} />}
                                    </th>
                                ))}
                                <th className="relative">
                                    <ColResizeHandle {...grid.resizeProps('remove')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columnCount} className="py-4 text-center text-[13px] text-slate-400 dark:text-white/50">
                                        {/* Wird die Bestellung geholt, wartet Offi mit
                                            und gibt einen Hinweis; ist sie da und die
                                            Tabelle leer, steht hier nur der Satz, wie
                                            man eine Zeile anlegt. */}
                                        {loadingOrder
                                            ? <BotLoadingPanel label={t('common.loadingData')} minHeight={220} size={88} />
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
                                const selected = selectedRows.has(row.key);
                                return (
                                    <tr
                                        key={row.key}
                                        className={row.error
                                            ? 'bg-red-50/60 dark:bg-red-500/10'
                                            : (selected ? 'bg-[#0a7aff]/[0.05] dark:bg-white/[0.06]' : undefined)}
                                    >
                                        <td className="text-center">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => toggleRowSelected(row.key)}
                                                aria-label={t('inv.orders.rows.selectRow')}
                                                className="size-3.5 cursor-pointer accent-[#0a7aff]"
                                            />
                                        </td>
                                        {columnOrder.map((id) => (
                                            <td
                                                key={id}
                                                className={cellClassName(id, rowDirect, rowSupplier)}
                                            >
                                                {renderCell(id, row, figures, rowDirect, rowSupplier, rowChanged)}
                                            </td>
                                        ))}
                                        <td className="text-center">
                                            <button
                                                type="button"
                                                aria-label={t('inv.bulkProducts.removeRow')}
                                                onClick={() => removeRows([row.key])}
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
                {/* ── DER FUSS DER TABELLE ─────────────────────────────────
                    Vorgabe Samet (07.09.2026): «Unten links gehoert IMMER ein
                    Plus hin; in der leeren Flaeche soll kein ‹Produkt
                    hinzufuegen›-Knopf stehen.» Also steht er hier — auch bei
                    leerer Tabelle, denn dort wird er am dringendsten gebraucht
                    — und nur noch als Symbol. Die neue Zeile rechnet mit der
                    aktiven Vorlage, wie zuvor. */}
                <div className="ofi-ord-foot">
                    <button
                        type="button"
                        onClick={addRow}
                        className="ofi-ord-plus"
                        title={t('inv.bulkProducts.addRow')}
                        aria-label={t('inv.bulkProducts.addRow')}
                    >
                        <Plus size={18} />
                    </button>
                    {/* ── DER PAPIERKORB (Vorgabe Samet, 09.09.2026) ────────
                        «Ein Papierkorb, um Zeilen zu löschen — auch mehrere auf
                        einmal.» Sind Zeilen angekreuzt, wirft er GENAU DIESE
                        weg und sagt daneben, wie viele. Ist nichts angekreuzt,
                        leert er die ganze Liste — und fragt vorher, denn das
                        ist die einzige der beiden Gesten, die man nicht
                        gewollt haben kann. */}
                    <button
                        type="button"
                        disabled={rows.length === 0}
                        onClick={() => (selectedRows.size ? removeRows([...selectedRows]) : setClearAsk(true))}
                        title={selectedRows.size
                            ? t('inv.orders.rows.removeSelected', { count: selectedRows.size })
                            : t('inv.orders.clearRows')}
                        aria-label={selectedRows.size
                            ? t('inv.orders.rows.removeSelected', { count: selectedRows.size })
                            : t('inv.orders.clearRows')}
                        className={`ofi-ord-bin${selectedRows.size ? ' is-armed' : ''}`}
                    >
                        <Trash01 size={16} />
                        {selectedRows.size > 0 && <b>{selectedRows.size}</b>}
                    </button>
                    {/* Die Rückfrage steht IN der Leiste, nicht in einem
                        Browserkasten — wie überall in diesem Ablauf. */}
                    {clearAsk && (
                        <span className="ofi-ord-ask">
                            {t('inv.orders.clearRowsConfirm')}
                            <button type="button" onClick={() => setClearAsk(false)}>{t('common.cancel')}</button>
                            <button
                                type="button"
                                className="is-danger"
                                onClick={() => { setRows([]); setSelectedRows(new Set()); setClearAsk(false); }}
                            >
                                {t('common.confirm')}
                            </button>
                        </span>
                    )}
                    <span className="ofi-ord-spacer" />
                    <button
                        type="button"
                        disabled={saving || !canTransfer || !filledRows.length}
                        title={canTransfer ? undefined : t('inv.stock.noPermission')}
                        onClick={() => void save()}
                        className="ofi-ord-done"
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
            </SectionCard>
            )}

            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
                title={kindLabels.allTitle}
            />
            {/* ── DIE BESTELLDETAILS — EINE KISTE ─────────────────────────────
                Vorgabe Samet (07.09.2026): «Zusatzkosten gehören unter die
                Bestelldetails, und dort steht nur ein Stift. Da klickt man
                drauf — der viele einzelne Text kann weg. Eine einfache Kiste
                im Apple-Stil, und alles liegt darin.»

                Also liegt hier ALLES, was vorher auf zwei Fenster und drei
                Knöpfe verteilt war: die Angaben der Bestellung, die
                Zusatzkosten, die Mehrwertsteuer und das Anschreiben — jede
                Sache in ihrer eigenen weissen Kiste auf grauem Grund, mit
                eingerückten Haarlinien dazwischen. Keine Hinweiszeilen mehr:
                was ein Feld will, sagt sein Platzhalter.

                Nichts davon ist Pflicht; bleibt die Bestellnummer leer, vergibt
                der Server BE-{Jahr}-{Reihe}. */}
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
                /* ÜBER der Detailkarte (`.ofi-ord-scrim`, z-index 820) — von dort
                   wird dieses Blatt geöffnet. */
                zIndex={860}
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
                                className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
                            >
                                <ChevronLeft size={15} />
                            </button>
                            <button
                                type="button"
                                disabled={templatePage >= templatePages || templatesLoading}
                                onClick={() => setTemplatePage((page) => Math.min(templatePages, page + 1))}
                                title={t('inv.orders.coverLetter.next')}
                                aria-label={t('inv.orders.coverLetter.next')}
                                className="flex size-8 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:text-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/15 dark:text-white/60 dark:hover:text-white"
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
                            className="flex h-9 shrink-0 items-center gap-1.5 rounded-md bg-[#0a7aff] px-3 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
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
                            className="flex items-start gap-2 rounded-lg border border-slate-200 p-2.5 transition-colors hover:border-[#0066e0] dark:border-white/10 dark:hover:border-white/40"
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

            {/* ── BELEG IMPORTIEREN (07.09.2026) ─────────────────────────────
                Das Fenster rechnet nichts und speichert nichts: es ordnet die
                gelesenen Angaben nach der AKTIVEN VORLAGE zu und gibt die
                Zeilen an `applyAiRows` zurück. Gerechnet wird danach in der
                Tabelle, gespeichert mit demselben Knopf wie immer. */}
            <SupplierImportDialog
                open={aiOpen}
                onClose={() => { setAiOpen(false); setPastedFiles(null); }}
                config={aiConfig}
                template={activeTemplate}
                onApply={applyAiRows}
                calcMode={calcMode}
                documentType={templateDocumentType}
                initialFiles={pastedFiles ?? undefined}
            />

            {/* ── MEINE VORLAGEN ─────────────────────────────────────────────
                Der EINE Ort, an dem die Spalten benannt, geordnet und
                zugeordnet werden. Nach dem Speichern lädt die Seite ihre
                aktive Vorlage neu — die Tabelle folgt ihr sofort. */}
            <TemplateManagerPopup
                open={templatesOpen}
                onClose={() => { setTemplatesOpen(false); setOpenTemplateId(null); }}
                openTemplateId={openTemplateId}
                /* Eine Preisanfrage kennt nur Produktname und Menge als Zuordnung. */
                documentType={templateDocumentType}
                /* Eine gespeicherte Vorlage gilt SOFORT: `activeTemplateId`
                   schaltet sie scharf, der Zähler lädt sie neu. Ohne das erste
                   blieb eine frisch angelegte Vorlage wirkungslos, bis jemand
                   sie im Menü noch einmal von Hand auswählte. */
                onSaved={(templateId) => {
                    if (templateId) {
                        setActiveTemplateId(templateId);
                        selectPreferredTemplate(templateDocumentType, templateId);
                    }
                    setTemplateTick2((tick) => tick + 1);
                }}
            />
            {drawnCheck.node}

            <SupplierPickerModal
                open={supplierPickerOpen}
                onClose={() => setSupplierPickerOpen(false)}
                onPick={(picked) => {
                    setSupplier({ id: picked.id, name: picked.companyName, email: picked.email ?? null });
                    setSupplierError(null);
                }}
            />

            <CalcModeCard
                open={calcOpen}
                onClose={() => { setCalcOpen(false); setCalcError(null); }}
                mode={calcMode}
                config={aiConfig}
                onApply={applyCalcMode}
                error={calcError}
            />
        </div>
    );
};
