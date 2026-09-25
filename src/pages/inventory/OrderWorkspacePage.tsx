import { useEffect, useMemo, useRef, useState } from 'react';
import type { FocusEvent } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, Check, CheckCircle, ChevronLeft, ChevronRight, File05, Minus, Plus, RefreshCcw01, Save01, Settings01, ShoppingCart01, SquareDivide, Trash01, Zap } from '@/components/icons/antIconCompat';
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
import { SchemePickDialog } from './components/SchemePickDialog';
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderFee, DraftOrderRow } from './types';
import { fmtMoneyIn, fmtUnitPricePrecise, parseNum } from './utils/format';
import { CURRENCY_CODES, CURRENCY_SYMBOLS, DEFAULT_CURRENCY, toCurrencyCode, type CurrencyCode } from '@/utils/currency';
import {
    allVatCountries,
    clampPercent,
    computeOrderTotals,
    discountFactor,
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
    supplierUnitBaseOf,
    transitionRowMode,
} from './utils/orderRowMode';
import { ORDER_STATUS_META, isEditableStage, isPriceRequestStage } from './utils/orderStatus';
import { APPROVAL_FIELD_COLUMN, approvalGapsFromDetails, missingApprovalFields, type ApprovalField, type ApprovalGap } from './utils/orderApproval';
import { productionErrorOf, productionErrorText } from '@/lib/api/production';
import { useProductionEnabled } from '@/lib/useProductionEnabled';
import { ProductionPickerDialog, type PickerDetails } from '@/pages/production/components/ProductionPickerDialog';
import {
    ProductionAssignButton,
    projectLabelOf,
    type PurchaseProduction,
} from '@/pages/production/components/ProductionAssign';
import type { ProductionSelection } from '@/types/production';
/* Der eine Stift, die Apple-Kiste und das Plus unten links wohnen hier;
   die Knoepfe der Belegzeile (`.ofi-poi-*`) im Import-Blatt daneben. */
import '@/styles/orderDetails.css';
import '@/styles/purchaseImport.css';
import { PurchaseCode, usePurchaseLang } from '@/components/ui-shared/PurchaseCode';
import { localizePurchaseCode } from '@/utils/purchaseCode';
import type { PurchaseLineSource, PurchaseOrderRow } from '@/types/inventory';
import { displayTemplateTitle, isStandardColumns } from '@/utils/standardOrderColumns';
/* Die Reiter, die ihre Daten ERST BEIM ÖFFNEN holen. (Wareneingang und
   «Stoğa gidenler» ruhen seit dem 22.09.2026 — siehe
   `_disabled/inventory-receive/README.md`.) */
import { PdfPanel } from './workspace/PdfPanel';
/* Die Wegleiste links neben den Einstellungen. */
import { FlowRail, type FlowStep } from './workspace/FlowRail';
import { MailPanel } from './workspace/MailPanel';
import '@/styles/modules/orderWorkspace.css';

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

/**
 * DIE REITER (Vorgabe Samet, 22.09.2026) — «sırayla Satırlar · Ayarlar ·
 * Şablon Seçimi», dann Beleg und Mail. Die beiden Wareneingangsreiter sind am
 * selben Tag STILLGELEGT worden («mal kabul bölümünü şimdilik kaldır») und
 * liegen unter `_disabled/inventory-receive/`.
 */
type WorkspaceTab = 'lines' | 'settings' | 'template' | 'pdf' | 'mail';

/** Rückfragen der Kopfzeile — jede gehört genau einem Knopf. */
type PageAsk = 'delete' | 'convert' | 'toRequest' | null;

/**
 * PROJEDEN AÇILAN BOŞ FORM (24.09.2026): proje detayındaki «Siparişe Git»,
 * türü olmayan ya da hizmet olan pozisyonda BOŞ bir sipariş formu açar —
 * projenin adı dolu, şablon standart. Satın alınacak ürünün tedarikçisi
 * yoksa satır da hazır gelir (tedarikçi elle seçilir).
 */
export interface ProjectOrderPrefill {
    projectId: string;
    projectLabel: string;
    line?: {
        articleId: string | null;
        code: string | null;
        name: string;
        unit: string | null;
        quantity: number;
        price: number;
        source: PurchaseLineSource;
    } | null;
}

/** Der zuletzt gewählte Nummernkreis des Wareneingangs (je Browser gemerkt). */
const RECEIPT_SCHEME_KEY = 'offitec:inv-receive:scheme:v1';
type CodeScheme = { id: string; label: string; next: string };

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
 * ══ DIE EINE EINKAUFSSEITE (Vorgabe Samet, 22.09.2026) ══════════════════════
 *
 * «Detay sayfası sipariş listesinde olacak ama TAB şeklinde, artık iki sayfaya
 *  ayırmıyoruz — FT ayarları, sipariş ayarları şeklinde. Bu düzenleme pop-up'ı,
 *  tedarikçi ekleme, hepsi AYARLAR tabında olacak: sırayla Satırlar · Ayarlar ·
 *  Şablon Seçimi … Mal kabul de siparişin içine dahil olacak, onay butonları da
 *  olmayacak, tek tıkla açılabilecek … biz bu tablara bastıkça veri gelecek,
 *  tüm veriler asla aynı anda yüklenmesin.»
 *
 * Drei Seiten sind eine geworden: die Bestellmaske (diese Datei), die
 * Auftragsseite und der Wareneingang. Was übrig bleibt, sind REITER derselben
 * Seite — und jeder holt sein Zeug selbst, wenn man ihn öffnet:
 *
 *   Satırlar       die Positionstabelle (diese Datei, unverändert)
 *   Ayarlar        ZWEI SPALTEN: Beleg, Lieferant, Projekt/Gerät, Nummernkreis,
 *                  Zusatzkosten, MwSt, Währung, Anschreiben
 *   Şablon Seçimi  die Rechenvorlage
 *   Mal kabul      offene Zeilen einbuchen              (nur Bestellungen)
 *   Stoğa gidenler eingebuchte Zeilen + «geri gönder»   (nur Bestellungen)
 *   PDF · Mail     das Belegblatt und das Mailfenster
 *
 * Eine PREISANFRAGE und eine BESTELLUNG sind seit heute ZWEI KAYIT: «Siparişe
 * dönüştür» legt eine neue Bestellung an (Server: `convertToOrder`) und öffnet
 * sie; die Anfrage bleibt, wo sie war.
 *
 * Darunter unverändert: stok ekranıyla aynı taslak-tablo deseni.
 * Tedarikçi SİPARİŞ DÜZEYİNDEdir ve üstteki alandan seçilir (tek sipariş = tek
 * tedarikçi): alana yazıldıkça kısa liste açılır, "Tüm tedarikçiler …" büyük
 * pencereyi açar. Ürün seçilince ad/kod/fiyat ve — henüz tedarikçi
 * seçilmemişse — son alım tedarikçisi otomatik dolar ("sipariş kendiliğinden
 * oluşur"), her alan düzenlenebilir kalır.
 * `?id=` ile açılırsa mevcut sipariş yüklenir ve PATCH ile güncellenir
 * (mail gönderilmiş siparişte içerik değişikliği backend'de revizyonu artırır).
 */
export const OrderWorkspacePage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    /* Der Vorgang steht in der ADRESSE, nicht mehr in `?id=`: die Liste führt
       auf `/inventory/orders/:id`, «neu» auf `/inventory/orders/new`. Welche
       Art dort entsteht, sagt `?kind=request` — die Liste hat zwei Knöpfe. */
    const { id: routeId } = useParams<{ id: string }>();
    const [searchParams] = useSearchParams();
    const location = useLocation();
    /** Projeden gelen boş form (yalnızca yeni kayıtta okunur). */
    const projectPrefill = (location.state as { projectPrefill?: ProjectOrderPrefill } | null)?.projectPrefill ?? null;
    /* Sipariş ⇄ fiyat talebi geçişi AYNI kaydı değiştirir (24.09.2026) — adres
       aynı kalır, bu sayaç kaydı yeniden yükletir. */
    const [reloadTick, setReloadTick] = useState(0);
    const editId = routeId && routeId !== 'new' ? routeId : null;
    const newKind: OrderMode = searchParams.get('kind') === 'request' ? 'PRICE_REQUEST' : 'ORDER';
    const permissions = useAuthStore((state) => state.permissions);
    const user = useAuthStore((state) => state.user);
    const pdfSettings = usePdfSettings();
    const canTransfer = permissions.includes('inventory.transfer');
    const canCreateArticles = permissions.includes('inventory.articles.create');

    /* ── PRODUKTION (19.09.2026, Vorgabe Samet) ─────────────────────────────
       Wo die Firmenkategorie das Modul führt, gehört jede Preisanfrage und
       Bestellung zu EINEM Projekt und mindestens einem Gerät. Der Knopf neben
       dem Lieferanten wählt beides; bei mehreren Geräten trägt die Tabelle
       eine Spalte «Gerät». Vor dem Bestätigen prüft die Maske die Pflicht-
       felder (Produktname, Menge, Einzelpreis, Nettopreis, Zeilensumme) und
       zeigt die Zellen, die fehlen — der Server prüft dasselbe noch einmal. */
    const productionOn = useProductionEnabled();
    const [production, setProduction] = useState<PurchaseProduction | null>(null);
    const [pickerOpen, setPickerOpen] = useState(false);
    const [showApprovalGaps, setShowApprovalGaps] = useState(false);
    /* Der Stapel der Einstellungen: an ihm misst die Wegleiste links, wie
       weit man gescrollt ist (siehe `workspace/FlowRail.tsx`). */
    const settingsStackRef = useRef<HTMLDivElement | null>(null);

    /* ── DIE REITER ─────────────────────────────────────────────────────────
       `tab` ist der einzige Seitenzustand, der zählt: was nicht offen ist,
       wird nicht gezeichnet und holt nichts. `loadedOrder` ist der zuletzt
       GESPEICHERTE Stand — PDF, Mail, Wareneingang und «Stoğa gidenler»
       arbeiten mit ihm, nicht mit der halb getippten Tabelle. */
    const [tab, setTab] = useState<WorkspaceTab>(() => {
        // `/inventory/orders/:id/receive` von früher landet über eine Umleitung
        // hier — mit `?tab=receive`, damit der alte Link denselben Ort öffnet.
        const wanted = new URLSearchParams(window.location.search).get('tab');
        return (wanted === 'settings' || wanted === 'template'
            || wanted === 'pdf' || wanted === 'mail') ? wanted : 'lines';
    });
    /** Die Anschrift des Lieferanten, wie sie in der Bestellung steht (nur lesen). */
    const [supplierAddress, setSupplierAddress] = useState<string | null>(null);
    /* DER NUMMERNKREIS steht in den EINSTELLUNGEN (Vorgabe Samet, 22.09.2026:
       «Kod aralığı da ayarlarda olsun»), gilt aber für den Wareneingang: dort
       entstehen die ERP-Codes codeloser Zeilen. Deshalb liegt er hier, in der
       Seite, und der Wareneingangsreiter bekommt ihn gereicht. */
    const [codeScheme, setCodeScheme] = useState<CodeScheme | null>(() => {
        try {
            const raw = localStorage.getItem(RECEIPT_SCHEME_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch { return null; }
    });
    const [schemeOpen, setSchemeOpen] = useState(false);
    const [loadedOrder, setLoadedOrder] = useState<PurchaseOrderRow | null>(null);
    /** Rückfragen der Kopfzeile — ein Streifen, kein Fenster. */
    const [pageAsk, setPageAsk] = useState<PageAsk>(null);
    const [pageBusy, setPageBusy] = useState<string | null>(null);

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
    /* KEIN AUSWAHLBILDSCHIRM MEHR: die Liste hat zwei «neu»-Knöpfe, einen je
       Modul. Beim Bearbeiten sagt der Status, was der Vorgang ist. */
    const [orderMode, setOrderMode] = useState<OrderMode>(editId ? 'ORDER' : newKind);
    // Fiyatsız kip: fiyat/indirim/KDV sütunları ve toplamlar gizlenir.
    const priceless = orderMode === 'PRICE_REQUEST';
    const templateDocumentType = priceless ? 'PRICE_REQUEST' : 'ORDER';
    const preferredTemplateId = usePurchaseTemplateStore((state) => state.selected[templateDocumentType]);
    const selectPreferredTemplate = usePurchaseTemplateStore((state) => state.select);
    // Belge kodu: sunucu aşamaya göre önerir (fiyat talebi PA-, sipariş BE-;
    // ekranda dile göre FT-/SP- ya da PR-/PO- okunur), kullanıcı
    // değiştirebilir. Boş bırakılırsa (yeni siparişte) sunucu üretir.
    // Ekranda arayüz dilinin öneki (FT-/SP-), depoda Almanca yazım.
    const poLang = usePurchaseLang();
    /** Der Benutzer hat die Projektwahl ZURÜCKGENOMMEN — dann muss das Speichern
        die leere Auswahl mitschicken, nicht einfach nichts. */
    const [productionCleared, setProductionCleared] = useState(false);
    const [reference, setReference] = useState('');
    const [quoteNumber, setQuoteNumber] = useState('');
    // Projeden açılan boş formda projenin adı baştan dolu (24.09.2026).
    const [projectName, setProjectName] = useState(() => (!editId && projectPrefill?.projectLabel) || '');
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
     * metni.
     *
     * 22.09.2026 (Samet): «Hover olan yazı olmasın, yani inputdaki yazı şablon
     * olarak olsun ve o seçili olsun, direkt yazı olarak çıksın — 3 dilde de.»
     * Standart metin artık YER TUTUCU DEĞİL, alanın gerçek içeriğidir: alan
     * şablonla DOLU açılır ve kullanıcı üzerine yazar.
     *
     * Bunun için tek bir durum yeter: `coverCustom`. `null` = "kullanıcı
     * dokunmadı" demektir ve alan o anki dilin/türün şablonunu gösterir —
     * dolayısıyla dil değişince metin de kendiliğinden o dile döner, ayrıca
     * bir etki (effect) gerekmez. Kayda da yalnızca DEĞİŞTİRİLMİŞ metin gider:
     * dokunulmamış şablon `null` saklanır, böylece PDF eskisi gibi KENDİ
     * dilindeki standart metni basar (Almanca arayüzde hazırlanan sipariş,
     * Türkçe PDF'te Türkçe çıkar).
     * ⚠ `inv.orders.coverLetter.defaultText` (sipariş) ve `…defaultTextRequest`
     * (fiyat talebi) PDF'lerdeki standart metinlerin harfi harfine eşidir
     * (`utils/pdf/orderPdf.ts`, `utils/pdf/priceRequestPdf.ts`) — birlikte
     * güncellenmelidir.
     */
    const [coverCustom, setCoverCustom] = useState<string | null>(null);
    /** Bu belgenin standart ön yazısı — arayüz dilinde, türüne göre. */
    const coverLetterDefault = (request = priceless): string => t(request
        ? 'inv.orders.coverLetter.defaultTextRequest'
        : 'inv.orders.coverLetter.defaultText');
    /** Alanda duran metin: kullanıcının yazdığı, yoksa şablon. */
    const coverLetter = coverCustom ?? coverLetterDefault();
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
    // Tedarikçi sipariş düzeyinde tutulur — tek sipariş = tek tedarikçi.
    const [supplier, setSupplier] = useState<{ id: string | null; name: string; email: string | null }>({
        id: null,
        name: '',
        email: null,
    });
    /* PROJEDEN HAZIR SATIR (24.09.2026): tedarikçisi olmayan «Satın Alınacak»
       ürün, satırı dolu bir formla gelir — tedarikçi elle seçilir. */
    const [rows, setRows] = useState<DraftOrderRow[]>(() => {
        const line = !editId ? projectPrefill?.line : null;
        if (!line) return [];
        return [{
            ...emptyRow('DIRECT'),
            articleId: line.articleId,
            code: line.code ?? '',
            name: line.name,
            unit: line.unit ?? '',
            quantity: String(line.quantity),
            grossPrice: line.price ? String(line.price) : '',
            netPrice: line.price ? String(line.price) : '',
            source: line.source,
        }];
    });
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
    // ── PARA BİRİMİ (Vorgabe Samet, 16.09.2026) ─────────────────────────────
    // KDV'nin altında seçilir; yalnızca GÖSTERİMİ değiştirir (kur çevrimi yok),
    // sunucu `currency` alanını zaten tutar ve PDF onu basar.
    const [currency, setCurrency] = useState<CurrencyCode>(DEFAULT_CURRENCY);
    const fmtMoney = (value?: number | null) => fmtMoneyIn(value, currency);
    const [customVatLabel, setCustomVatLabel] = useState('');
    const [customVatRate, setCustomVatRate] = useState('');
    /* TEDARİKÇİNİN KDV'Sİ (24.09.2026): seçilen tedarikçi KDV'ye tabiyse
       ülke + oranı siparişe aktarılır, tabi değilse oran 0 olur; tedarikçide
       hiçbir şey seçilmemişse sipariş kendi varsayılanında kalır. Yüklenen
       kaydın KENDİ tedarikçisi atlanır — kayıttaki oran elle değiştirilmiş
       olabilir, açmak onu ezmemeli. */
    const vatSupplierRef = useRef<string | null>(null);
    useEffect(() => {
        const supplierId = supplier.id;
        if (!supplierId || supplierId === vatSupplierRef.current) return;
        vatSupplierRef.current = supplierId;
        let cancelled = false;
        inventoryApi.getSupplierVat(supplierId)
            .then((vat) => {
                if (cancelled || vat.vatLiable == null) return;
                if (!vat.vatLiable) {
                    setOrderVatRate('0');
                    return;
                }
                if (vat.vatCountry) setOrderVatCountry(vat.vatCountry);
                setOrderVatRate(String(vat.vatRate ?? 0));
            })
            .catch(() => { /* KDV gelmezse sipariş kendi oranında kalır */ });
        return () => { cancelled = true; };
    }, [supplier.id]);

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
                /* EIN ABGESCHLOSSENER VORGANG WIRD NICHT MEHR WEGGESCHICKT
                   (22.09.2026): er öffnet sich wie jeder andere, nur ist die
                   Tabelle gesperrt — PDF, Mail und «Stoğa gidenler» will man
                   gerade dort am häufigsten sehen. */
                setLoadedOrder(order);
                setEditStatus(order.status);
                // Depoda Almanca yazım durur; alanda arayüz dilinin öneki görünür.
                setReference(localizePurchaseCode(order.referenceNumber, poLang));
                setQuoteNumber(order.quoteNumber ?? '');
                setProjectName(order.projectName ?? '');
                setOrderedByName(order.orderedByName ?? '');
                setRecipientName(order.recipientName ?? '');
                // Kayıtta ön yazı yoksa alan ŞABLONU gösterir (kayıt yine boş
                // kalır); varsa kullanıcının kendi metni yüklenir.
                setCoverCustom(order.coverLetter?.trim() ? order.coverLetter : null);
                setEditReference(localizePurchaseCode(order.referenceNumber, poLang));
                vatSupplierRef.current = order.supplierId ?? null;
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
                        productionItemId: item.productionItemId ?? null,
                        source: item.source ?? null,
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
                setCurrency(toCurrencyCode(order.currency));
                // Produktion: die gespeicherte Zuordnung (Projekt + Geräte).
                setProduction(order.production?.assignment
                    ? { selection: order.production.assignment, project: order.production.project, items: order.production.items }
                    : null);
                setSupplierAddress(order.supplierAddress ?? null);
            })
            .catch((err) => {
                toast.error(err?.response?.data?.error || t('inv.orders.loadFailed'));
                navigate('/inventory/orders');
            })
            .finally(() => { if (!cancelled) setLoadingOrder(false); });
        return () => { cancelled = true; };
    }, [editId, reloadTick]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setCoverCustom(template.content ?? '');
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
        // Ohne Etikett zählt die Zeile beim Projekt (Vorgabe Samet, 20.09.2026).
        const row = emptyRow(calcMode);
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    /* ── DIE AKTIVE VORLAGE LADEN ───────────────────────────────────────────
       Eine Vorlage gehoert keinem Lieferanten mehr (11.09.2026): es gilt die
       von Hand gewaehlte, sonst die Vorgabe der Dokumentart, sonst die erste.
       Gibt es keine, gibt es auch keine Tabelle — die Vorlage ist Pflicht. */
    /* STANDART KAYIT → STANDART ŞABLON (24.09.2026): projeden açılan ya da
       sipariş ⇄ talep arasında dönen kayıt standart sütunlarla kaydedilmiştir;
       el ile başka şablon seçilmedikçe tablo da onunla açılır. */
    const standardRecord = Boolean(projectPrefill && !editId) || isStandardColumns(loadedOrder?.tableColumns);
    useEffect(() => {
        let cancelled = false;
        purchaseOrdersApi.listSupplierTemplates(null, templateDocumentType)
            .then((items) => {
                if (cancelled) return;
                setCalcTemplates(items);
                const standard = standardRecord && !activeTemplateId
                    ? items.find((entry) => isStandardColumns(entry.config.columns))
                    : undefined;
                const chosen = items.find((entry) => entry.id === (activeTemplateId ?? preferredTemplateId));
                const general = items.find((entry) => entry.isDefault);
                const active = standard ?? chosen ?? general ?? items[0] ?? null;
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
    }, [templateTick2, activeTemplateId, templateDocumentType, standardRecord]); // eslint-disable-line react-hooks/exhaustive-deps

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
        setAiOpen(true);
    });
    /* ── KEIN ERP-CODE IN PREISANFRAGE UND BESTELLUNG (Vorgabe Samet, 19.09.2026) ──
       «Der ERP-Code entsteht erst im Wareneingang, automatisch — für ALLE
       Bestellungen.» Die feste Code-Spalte fehlt darum hier; eine Zeile, die an
       einem Katalogartikel hängt, trägt dessen Code weiter still mit. */
    const tableColumns = useMemo(
        () => (templateReady ? tableColumnsFromTemplate(aiConfig, loadedExtraColumns).filter((column) => !column.fixed) : []),
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
        imported.forEach((row) => {
            row.origin = captureRowOrigin(row);
        });
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
                ...(productionOn ? { productionItemId: row.productionItemId ?? null } : {}),
                ...(row.source ? { source: row.source } : {}),
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
            // TEDARİKÇİ: indirimlerden ÖNCEKİ tedarikçi fiyatı (tam duyarlıklı taban)
            // gider; sunucu tutarı taban × indirim çarpanı olarak hesaplar (19.09.2026).
            netPrice: row.calcMode === 'SUPPLIER' ? supplierUnitBaseOf(row) : figures.netUnitPrice,
            ...(row.calcMode === 'SUPPLIER' && row.netPrice.trim()
                ? { displayNetPrice: parseNum(row.netPrice) ?? undefined }
                : {}),
            // Kapalı sütunlar 0 gönderilir; sunucu toplamları yine kendi hesaplar.
            // Tedarikçi hesabında da indirimler GÖNDERİLİR (Vorgabe Samet, 19.09.2026:
            // «girilen indirimler tedarikçi hesaplamalarına yansımalı»).
            discount: parseNum(row.discount) ?? 0,
            // ⚠ HER ZAMAN GÖNDERİLİR: eskiden "İndirim 2 sütunu açık mı"
            // durumuna bağlıydı ve sütun kapalıyken girilen/geri yüklenen indirim
            // sessizce 0 kaydediliyordu (kullanıcı hatası 2026-08-02: kaydedip
            // çıkınca indirimler kayboluyordu).
            discount2: parseNum(row.discount2) ?? 0,
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
            // Produktion: das Gerät der Zeile (der Server prüft es gegen die Auswahl).
            ...(productionOn ? { productionItemId: row.productionItemId ?? null } : {}),
            // Proje kaynağı AYNEN geri gider — birleştirme ve «Siparişlerim» ona bakar.
            ...(row.source ? { source: row.source } : {}),
        };
    };

    /* ── BESTÄTIGUNG: DIE PFLICHTFELDER (19.09.2026) ─────────────────────────
       Dieselbe Prüfung wie im Server (`missingApprovalFields`), an den Zeilen,
       wie sie gespeichert würden. Die Zeilennummer ist die der Tabelle. */
    const approvalGapsOf = (list: DraftOrderRow[]): ApprovalGap[] => missingApprovalFields(list.map((row) => {
        const figures = rowFigures(row);
        return {
            name: row.name.trim(),
            quantity: parseNum(row.quantity) ?? 0,
            grossPrice: parseNum(row.grossPrice) ?? 0,
            netPrice: row.calcMode === 'SUPPLIER' ? supplierUnitBaseOf(row) : figures.netUnitPrice,
            lineTotal: figures.lineTotal,
        };
    }));
    const approvalFieldLabel = (field: ApprovalField) => t(`inv.orders.approval.field.${field}`);
    const markApprovalGaps = (gaps: ApprovalGap[]) => {
        const byKey = new Map(gaps.map((gap) => [filledRows[gap.index]?.key, gap.fields] as const));
        setRows((current) => current.map((row) => {
            const fields = byKey.get(row.key);
            return fields
                ? { ...row, error: t('inv.orders.approval.rowMissing', { fields: fields.map(approvalFieldLabel).join(', ') }) }
                : row;
        }));
    };
    /* «checkApproval» ist mit dem Bestätigen gegangen (22.09.2026): es gibt
       keinen Knopf mehr, der eine vollständige Zeile verlangt. Die fehlenden
       Zellen leuchten weiterhin — aber erst, wenn der SERVER etwas beanstandet
       (`handleSaveError`). */
    /* Nach einem abgelehnten Bestätigen leuchten die fehlenden Zellen, bis sie gefüllt sind. */
    const approvalMissing = useMemo(() => {
        if (!showApprovalGaps) return new Map<string, Set<string>>();
        return new Map(approvalGapsOf(filledRows).map((gap) => [
            filledRows[gap.index]?.key ?? '',
            new Set<string>(gap.fields.map((field) => APPROVAL_FIELD_COLUMN[field])),
        ]));
    }, [showApprovalGaps, filledRows]); // eslint-disable-line react-hooks/exhaustive-deps

    /** Fehler beim Speichern: fehlende Pflichtfelder markieren, die Auswahl öffnen, wenn sie fehlt. */
    const handleSaveError = (error: unknown) => {
        const failure = productionErrorOf(error);
        if (failure.code === 'APPROVAL_FIELDS_MISSING') {
            setShowApprovalGaps(true);
            markApprovalGaps(approvalGapsFromDetails(failure.details));
        }
        if (failure.code === 'PROJECT_REQUIRED' || failure.code === 'ITEMS_REQUIRED') setPickerOpen(true);
        toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
    };

    /* ── DIE ZUORDNUNG ÜBERNEHMEN ────────────────────────────────────────────
       Bei EINEM Gerät gehört ihm jede Zeile; bei mehreren behält eine Zeile
       ihr Gerät, wenn es noch dabei ist — sonst wählt sie neu. Ohne eigenen
       Projektnamen trägt die Bestellung den des Projekts (PDF-Kopf). */
    const applyProduction = (selection: ProductionSelection, details: PickerDetails | null) => {
        // Wahl zurückgenommen: die Bestellung gehört zu keinem Projekt mehr, und
        // beim Speichern geht die LEERE Auswahl mit — sonst bliebe die alte
        // Zuordnung auf dem Server stehen.
        if (!details) {
            setProduction(null);
            setProductionCleared(true);
            setPickerOpen(false);
            setRows((current) => current.map((row) => ({ ...row, productionItemId: null })));
            return;
        }
        setProductionCleared(false);
        const next: PurchaseProduction = { selection, project: details.project, items: details.items };
        setProduction(next);
        setPickerOpen(false);
        const allowed = new Set(selection.productionItemIds);
        setRows((current) => current.map((row) => ({
            ...row,
            productionItemId: row.productionItemId && allowed.has(row.productionItemId) ? row.productionItemId : null,
        })));
        setProjectName((current) => current.trim() || projectLabelOf(details.project));
    };

    /* ── KEINE GERÄTESPALTE IN DEN POSITIONEN (Vorgabe Samet, 22.09.2026) ───
       «Pozisyonlarda cihaz/hizmet sütunu olmayacak.» Projekt und Geräte werden
       im Reiter «Ayarlar» gewählt; das Gerät REIST WEITER an jeder Zeile
       (`productionItemId` geht bei jedem Speichern mit und der Server verteilt
       es aus der Projektzuordnung) — nur gezeichnet wird es hier nicht mehr. */

    /**
     * Kaydet. Doğrulama tamamen istek ÖNCESİ yapılır. Yeni ürün satırları önce
     * ürün listesine 0 adetle (tanım kaydı) yazılır — sipariş gerçek ürünlere
     * bağlanır; ardından üstteki tedarikçiyle TEK sipariş oluşturulur ya da
     * düzenleme modunda mevcut sipariş PATCH edilir.
     */
    /* «Bestellung löschen = eine Stufe zurück» ist mit dem Ablauf gegangen
       (22.09.2026): eine Bestellung fällt nicht mehr auf die Anfrage zurück.
       Gelöscht wird der DATENSATZ, und die Anfrage lebt ohnehin getrennt
       weiter — siehe `deleteRecord`. */
    const save = async (): Promise<string | null> => {
        if (!filledRows.length) return null;
        /* Ohne gueltige Vorlage gibt es keine Tabelle — und nichts zu speichern. */
        if (!templateReady) {
            toast.error(templateProblemText(templateFaults[0]));
            return null;
        }

        if (!supplier.id && !supplier.name.trim()) {
            /* Unter dem Feld steht kein Fehlertext mehr (der «viele einzelne
               Text» ist weg) — ohne Hinweis bliebe das Speichern stumm. */
            setSupplierError(t('inv.orders.supplierRequired'));
            toast.error(t('inv.orders.supplierRequired'));
            setTab('settings');
            return null;
        }

        // Tutarı girilip adı boş bırakılmış ek ücret kaydedilmez: toplama giren
        // ama neyin ücreti olduğu belirsiz bir satır sessizce geçmesin.
        if (filledFees.some((fee) => !fee.name.trim())) {
            setFeeError(t('inv.orders.fees.nameRequired'));
            // Die Zusatzkosten liegen jetzt im Reiter «Ayarlar» — dorthin.
            setTab('settings');
            return null;
        }

        /* Die Rechenart braucht ihre Schlüssel — auch beim Speichern, denn die
           Vorlage kann nach dem Umstellen gewechselt haben. */
        if (calcModeProblem) {
            setCalcError(calcModeProblem);
            toast.error(calcModeProblem);
            return null;
        }

        /* PRODUKTION: Projekt und Gerät sind FREIWILLIG (Vorgabe Samet,
           21.09.2026): gespeichert wird auch ohne; zugeordnet wird im Reiter
           «Ayarlar», wann es passt. */

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
                // Dokunulmamış şablon ve boş alan null gider: sunucu NULL yazar,
                // PDF kendi dilindeki standart metni basar.
                coverLetter: coverCustom?.trim() || null,
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
                currency,
                items,
                // Ek ücretler her kayıtta gönderilir (boş dizi = ücret yok) ki
                // düzenlemede silinen ücret sunucuda da silinsin.
                additionalFees: filledFees.map((fee) => ({
                    name: fee.name.trim(),
                    amount: parseNum(fee.amount) ?? 0,
                })),
                // Produktion: Projekt + Geräte der Bestellung.
                ...(productionOn && (production || productionCleared)
                    ? { production: production?.selection ?? { productionProjectId: null, productionItemIds: [] } }
                    : {}),
            };
            let savedId: string | null = editId;
            if (editId) {
                const updated = await purchaseOrdersApi.update(editId, {
                    ...header,
                    ...(reference.trim() ? { referenceNumber: reference.trim() } : {}),
                });
                // PDF, Mail und Wareneingang arbeiten mit dem GESPEICHERTEN Stand.
                setLoadedOrder(updated);
                setEditStatus(updated.status);
                toast.success(t('inv.orders.updatedToast'));
                drawnCheck.show();
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
                const row = created.orders[0] ?? null;
                savedId = row?.id ?? null;
                if (row) { setLoadedOrder(row); setEditStatus(row.status); }
                toast.success(t(priceless
                    ? 'inv.orders.priceRequestCreatedToast'
                    : 'inv.orders.orderDraftCreatedToast'));
                drawnCheck.show();
            }
            /* Der frisch angelegte Vorgang bekommt seine ADRESSE — die nächsten
               Speichervorgänge schreiben in denselben Datensatz, und der Zurück-
               Weg führt in die Liste, nicht auf «neu». */
            if (!editId && savedId) {
                navigate(`/inventory/orders/${savedId}`, { replace: true });
            }
            return savedId;
        } catch (error) {
            handleSaveError(error);
            return null;
        } finally {
            setSaving(false);
        }
    };

    /* ══ FİYAT TALEBİ → YENİ SİPARİŞ ═══════════════════════════════════════
       Die Anfrage bleibt, wo sie ist; der Server legt eine BESTELLUNG mit
       denselben Zeilen an und wir gehen hinüber. Offene Änderungen werden
       vorher gespeichert — sonst kopierte der Server einen alten Stand. */
    const convertToOrder = async () => {
        if (!editId) return;
        setPageBusy('convert');
        try {
            if (filledRows.length) await save();
            const created = await purchaseOrdersApi.convertToOrder(editId);
            toast.success(t('inv.orders.convertedToast'));
            // Siparişten gelmiş talep YERİNDE döner (aynı kayıt): yeniden yükle.
            if (created.id === editId) {
                setTab('lines');
                setReloadTick((tick) => tick + 1);
            } else {
                navigate(`/inventory/orders/${created.id}`);
            }
        } catch (error) {
            toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
        } finally {
            setPageBusy(null);
        }
    };

    /* ══ «FİYAT TALEBİ ALMAK İSTİYORUM» (Vorgabe Samet, 24.09.2026) ═════════
       «Sipariş ekranında fiyat talebi almak istiyorum butonu olsun, tıklayınca
       sipariş geri fiyat talebine dönsün, fiyat talebi açılsın.» AYNI kayıt
       talebe döner (standart talep şablonu: ÜRÜN - MALZEME / MİKTAR); talep
       ekranındaki «Siparişe dönüştür» onu aynı numarayla geri çevirir. */
    const convertToRequest = async () => {
        if (!editId) return;
        setPageBusy('toRequest');
        try {
            if (filledRows.length && !linesLocked) await save();
            await purchaseOrdersApi.convertToRequest(editId);
            toast.success(t('inv.orders.toRequestToast'));
            setTab('lines');
            setActiveTemplateId(null);
            setReloadTick((tick) => tick + 1);
        } catch (error) {
            toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
        } finally {
            setPageBusy(null);
        }
    };

    /** DEN VORGANG LÖSCHEN — er geht ganz; es gibt keine Stufe dahinter mehr. */
    const deleteRecord = async () => {
        if (!editId) return;
        setPageBusy('delete');
        try {
            await purchaseOrdersApi.remove(editId);
            toast.success(t('inv.orders.flow.recordDeleted'));
            navigate(priceless ? '/inventory/orders?kind=request' : '/inventory/orders');
        } catch (error) {
            toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
            setPageBusy(null);
        }
    };

    /* ══ «SİPARİŞİ ONAYLA» — EIN KLICK, KEINE RÜCKFRAGE ══════════════════════
       Vorgabe Samet, 22.09.2026: «sadece sipariş onaylandıktan sonra MAL
       KABULDE etiketi yapıştırılsın turuncu, ve iki kere onay verme olmasın.»

       Seit der Wareneingang ruht, gibt es niemanden mehr, der den Auftrag auf
       `TO_BE_STOCKED` stellt — und genau dieses Etikett («MAL KABULDE», orange)
       will man sehen, sobald die Bestellung beim Lieferanten liegt. Also setzt
       es dieser eine Knopf, ohne Streifen, ohne zweites Nicken. Daneben steht
       der Rückweg, falls es ein Fehlgriff war; das ist keine zweite Frage,
       sondern die Gegenhandlung. */
    const setOrderStatus = async (next: 'TO_BE_STOCKED' | 'ORDERED' | 'ORDER_DRAFT', key: string, message: string) => {
        if (!editId) return;
        setPageBusy(key);
        try {
            const updated = await purchaseOrdersApi.setStatus(editId, next);
            setLoadedOrder(updated);
            setEditStatus(updated.status);
            toast.success(message);
        } catch (error) {
            toast.error(productionErrorText(error, t('inv.orders.saveFailed')));
        } finally {
            setPageBusy(null);
        }
    };

    const runPageAsk = () => {
        const kind = pageAsk;
        setPageAsk(null);
        if (kind === 'delete') void deleteRecord();
        if (kind === 'convert') void convertToOrder();
        if (kind === 'toRequest') void convertToRequest();
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
                       yuvarlanmış hâli satır tutarıyla çelişir görünürdü.
                       Mit Rabatt steht der Preis NACH den Rabatten da (wie in
                       jeder anderen Art); der Lieferantenpreis im Hinweis. */
                    const supplierFactor = discountFactor(parseNum(row.discount) ?? 0, parseNum(row.discount2) ?? 0);
                    const listPrice = parseNum(row.netPrice) ?? 0;
                    return (
                        <span
                            className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80"
                            title={supplierFactor < 1 && row.netPrice.trim()
                                ? t('inv.orders.calcMode.supplierListPrice', { price: fmtUnitPricePrecise(listPrice) })
                                : undefined}
                        >
                            {row.netPrice.trim()
                                ? fmtUnitPricePrecise(supplierFactor < 1 ? figures.netUnitPrice : listPrice)
                                : '—'}
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

            /* İndirim yüzdeleri — HER kipte girilebilir (Vorgabe Samet,
               19.09.2026): tedarikçi hesabında da satır tutarına iner. */
            case 'discount':
            case 'discount2':
                return (
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

    /* ── WAS DIE SEITE GERADE IST ──────────────────────────────────────────
       Kein Auswahlbildschirm mehr und kein Schrittband: der Status sagt, ob
       dies eine ANFRAGE oder eine BESTELLUNG ist, und danach richten sich die
       Reiter. */
    const status = editStatus ?? (priceless ? 'DRAFT' : 'ORDER_DRAFT');
    const statusMeta = ORDER_STATUS_META[status] ?? ORDER_STATUS_META.ORDER_DRAFT;
    /* Ein vollständig eingelagerter Vorgang wird nicht mehr geschrieben — seine
       Buchungen sind gemacht. Er öffnet sich trotzdem: PDF, Mail und «Stoğa
       gidenler» braucht man gerade dann. Zurück geht es über «Geri gönder». */
    const linesLocked = !isEditableStage(status);
    const headerCode = loadedOrder?.referenceNumber ?? (editReference || '');
    const tabs: Array<{ key: WorkspaceTab; label: string; badge?: number; warn?: boolean }> = [
        { key: 'lines', label: t('inv.orders.tabs.lines'), badge: filledRows.length },
        { key: 'settings', label: t('inv.orders.tabs.settings') },
        { key: 'template', label: t('inv.orders.tabs.template') },
        ...(editId && loadedOrder
            ? [
                { key: 'pdf' as const, label: t('inv.orders.views.pdf') },
                { key: 'mail' as const, label: t('inv.orders.views.mail') },
            ]
            : []),
    ];
    /* Verschwindet ein Reiter unter den Füssen (ein neuer Vorgang hat noch
       kein PDF), steht man wieder bei den Positionen. */
    const activeTab: WorkspaceTab = tabs.some((entry) => entry.key === tab) ? tab : 'lines';
    /* Rechnen und Beleg-Import gehören zur Positionstabelle. */
    const showTools = activeTab === 'lines';
    /* Bestätigt = der Auftrag liegt beim Lieferanten und die Ware wird erwartet. */
    const awaitingGoods = status === 'TO_BE_STOCKED' || status === 'COMPLETED';

    const askText = pageAsk === 'delete'
        ? t(priceless ? 'inv.orders.deleteRequestConfirm' : 'inv.orders.deleteOrderRecordConfirm')
        : (pageAsk === 'toRequest' ? t('inv.orders.toRequestConfirm') : t('inv.orders.convertConfirm'));
    /* HANGİ PROJEDEN GELDİ (24.09.2026): satırlardan biri bir projenin
       pozisyonundan geldiyse başlıkta projenin adı durur ve projeye götürür. */
    const sourceProjectId = loadedOrder?.items.find((item) => item.source?.projectId)?.source?.projectId
        ?? (!editId ? projectPrefill?.projectId : undefined)
        ?? null;

    /* ── DER WEG DURCH DIE EINSTELLUNGEN (22.09.2026, Vorgabe Samet) ──────
       «Siparişlerde ve fiyat [talebi] ayarlarında solda bir başlık şeyi olması
       lazım … süreç gibi görmesi lazım hepsini kullanıcının, yani aşağıya
       indikçe o şeyin dolması gerekiyor.»

       Die Stationen sind GENAU die Kisten, die dieser Vorgang zeigt: eine
       Anfrage kennt keine Beträge, also weder Zusatzkosten noch MwSt noch
       Währung, und ohne Produktionsmodul fällt das Gerät weg. Bewusst OHNE
       `useMemo`: die Beschriftungen kommen aus `t()`, und `useLanguageTick()`
       zeichnet die Seite bei jedem Sprachwechsel neu. */
    const settingsSteps: FlowStep[] = [
        { id: 'details', label: t('inv.orders.detailsTitle'), on: true },
        { id: 'supplier', label: t('inv.columns.supplier'), on: true },
        { id: 'production', label: t('production.assign.label'), on: productionOn },
        { id: 'codeRange', label: t('inv.orders.receive.codeRange'), on: true },
        { id: 'fees', label: t('inv.orders.fees.title'), on: !priceless },
        { id: 'vat', label: t('inv.orders.columns.vat'), on: !priceless },
        { id: 'currency', label: t('inv.orders.currencyPicker.title'), on: !priceless },
        { id: 'coverLetter', label: t('inv.orders.coverLetter.title'), on: true },
    ].filter((step) => step.on).map(({ id, label }) => ({ id, label }));

    return (
        <div className="ofi-ows flex w-full flex-col gap-4">
            {/* DER KOPF LÄUFT NICHT MEHR MIT (Vorgabe Samet, 09.09.2026:
                «‹Auftrag bestätigen› soll nicht festgeklebt sein; die
                Überschriften sollen beim Runterscrollen nicht stehen bleiben»).
                Er scrollt weg wie jeder andere Seiteninhalt. */}
            <InventoryListHeader
                /* Der Titel sagt in EINEM Wort, was dieser Vorgang ist, daneben
                   steht seine Nummer im Farbton seines Zustands — MAL KABULDE
                   ist dort genauso turuncu wie in der Liste. */
                title={(
                    <span className="flex items-center gap-2">
                        <span className="whitespace-nowrap">
                            {t(priceless ? 'inv.orders.kind.requestOne' : 'inv.orders.kind.orderOne')}
                        </span>
                        {headerCode && (
                            <span className={`rounded-full px-2 py-0.5 font-mono text-[12px] font-semibold ${statusMeta.className}`}>
                                <PurchaseCode value={headerCode} />
                            </span>
                        )}
                        {editId && (
                            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                                {t(statusMeta.labelKey)}
                            </span>
                        )}
                        {sourceProjectId && (projectName.trim() || loadedOrder?.projectName) && (
                            <Link
                                to={`/projects/${sourceProjectId}`}
                                className="ofi-ows-projectchip"
                                title={t('inv.orders.fromProject')}
                            >
                                <span>{t('inv.orders.fromProject')}</span>
                                <b>{projectName.trim() || loadedOrder?.projectName}</b>
                            </Link>
                        )}
                    </span>
                )}
                action={(
                    <div className="flex flex-wrap items-center gap-2">
                        {editId && canTransfer && (
                            <button
                                type="button"
                                disabled={saving || pageBusy !== null}
                                onClick={() => setPageAsk('delete')}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                            >
                                {pageBusy === 'delete'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Trash01 size={15} />}
                                {t(priceless ? 'inv.orders.deleteRequest' : 'inv.orders.deleteOrderRecord')}
                            </button>
                        )}
        {/* ONAYI GERİ AL — die Gegenhandlung, nicht eine zweite Frage. */}
                        {editId && canTransfer && !priceless && awaitingGoods && (
                            <button
                                type="button"
                                disabled={saving || pageBusy !== null}
                                onClick={() => void setOrderStatus(
                                    loadedOrder?.emailSentAt ? 'ORDERED' : 'ORDER_DRAFT',
                                    'unconfirm',
                                    t('inv.orders.unconfirmedToast'),
                                )}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white/70"
                            >
                                {pageBusy === 'unconfirm'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <RefreshCcw01 size={15} />}
                                {t('inv.orders.actions.unconfirmOrder')}
                            </button>
                        )}
                        {/* SİPARİŞİ ONAYLA — EIN Klick, und das orange Etikett
                            «MAL KABULDE» klebt. Keine Rückfrage. */}
                        {editId && canTransfer && !priceless && !awaitingGoods && (
                            <button
                                type="button"
                                disabled={saving || pageBusy !== null}
                                onClick={() => void setOrderStatus('TO_BE_STOCKED', 'confirm', t('inv.orders.awaitingGoodsToast'))}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-orange-300 px-3.5 text-[12.5px] font-semibold text-orange-700 transition-colors hover:bg-orange-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-orange-400/40 dark:text-orange-300 dark:hover:bg-orange-500"
                            >
                                {pageBusy === 'confirm'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <CheckCircle size={15} />}
                                {t('inv.orders.actions.confirmOrder')}
                            </button>
                        )}
                        {/* FİYAT TALEBİ ALMAK İSTİYORUM — die Bestellung wird
                            wieder eine Preisanfrage (derselbe Datensatz). */}
                        {editId && canTransfer && !priceless && !awaitingGoods && (
                            <button
                                type="button"
                                disabled={saving || pageBusy !== null}
                                onClick={() => setPageAsk('toRequest')}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3.5 text-[12.5px] font-semibold text-slate-700 transition-colors hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/20 dark:text-white/80"
                            >
                                {pageBusy === 'toRequest'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <File05 size={15} />}
                                {t('inv.orders.actions.wantPriceRequest')}
                            </button>
                        )}
                        {/* SİPARİŞE DÖNÜŞTÜR — die Anfrage BLEIBT, daneben
                            entsteht eine Bestellung und sie öffnet sich. */}
                        {editId && priceless && canTransfer && (
                            <button
                                type="button"
                                disabled={saving || pageBusy !== null}
                                onClick={() => setPageAsk('convert')}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-[#0a7aff]/30 px-3.5 text-[12.5px] font-semibold text-[#0a7aff] transition-colors hover:bg-[#0a7aff] hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/30 dark:text-white dark:hover:bg-white/15"
                            >
                                {pageBusy === 'convert'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <ShoppingCart01 size={15} />}
                                {t('inv.orders.actions.convertToOrder')}
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving || !canTransfer || !filledRows.length || linesLocked}
                            onClick={() => void save()}
                            title={linesLocked
                                ? t('inv.orders.editCompleted')
                                : (canTransfer ? undefined : t('inv.stock.noPermission'))}
                            className="flex h-9 items-center rounded-md bg-[#0a7aff] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {saving ? <LoadingDots label={t('common.loadingData')} /> : t('common.save')}
                        </button>
                    </div>
                )}
            />

            {/* Die Rückfrage steht IN der Seite, gleich unter ihrem Knopf. */}
            {pageAsk && (
                <div className={`flex flex-wrap items-center gap-3 rounded-xl border px-3.5 py-3 ${
                    pageAsk !== 'delete'
                        ? 'border-slate-200 bg-slate-50/70 dark:border-white/15 dark:bg-white/[0.04]'
                        : 'border-red-200 bg-red-50/60 dark:border-red-500/30 dark:bg-red-500/10'
                }`}
                >
                    <span className={`flex min-w-0 flex-1 items-start gap-2 text-[12.5px] ${
                        pageAsk !== 'delete' ? 'text-slate-700 dark:text-white/80' : 'font-medium text-red-700 dark:text-red-200'
                    }`}
                    >
                        <AlertTriangle size={15} className="mt-px shrink-0" />
                        <span>{askText}</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setPageAsk(null)}
                            className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 dark:border-white/20 dark:bg-transparent dark:text-white/70"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={runPageAsk}
                            className={`flex h-9 items-center rounded-md px-3.5 text-[12.5px] font-semibold text-white transition-colors ${
                                pageAsk !== 'delete' ? 'bg-[#0a7aff] hover:bg-[#0066e0]' : 'bg-red-600 hover:bg-red-700'
                            }`}
                        >
                            {t('common.confirm')}
                        </button>
                    </span>
                </div>
            )}

            {/* ══ DIE REITERLEISTE ══════════════════════════════════════════
                Ein macOS-Segmentcontrol: EINE Mulde, darin die weisse Kachel
                des aktiven Reiters. Sie trägt auch die Zahlen, die man im
                Vorbeigehen braucht — offene Positionen, was schon im Lager
                liegt (turuncu, wie das Etikett «MAL KABULDE»). */}
            <div className="ofi-ows-tabrow">
                <div className="ofi-ows-tabs" role="tablist" aria-label={t('inv.orders.title')}>
                    {tabs.map((entry) => (
                        <button
                            key={entry.key}
                            type="button"
                            role="tab"
                            aria-selected={activeTab === entry.key}
                            onClick={() => setTab(entry.key)}
                            className={`ofi-ows-tab${activeTab === entry.key ? ' is-on' : ''}`}
                        >
                            {entry.label}
                            {entry.badge !== undefined && entry.badge > 0 && (
                                <i className={entry.warn ? 'is-warn' : undefined}>{entry.badge}</i>
                            )}
                        </button>
                    ))}
                </div>
            </div>

            {/* ══ DIE WERKZEUGZEILE ═════════════════════════════════════════
                Vorgabe Samet: «Hesaplama butonu sipariş ve mal kabulde SOLDA
                olacak, belge içe aktar SAĞDA.» Genau zwei Knöpfe, genau an
                diesen beiden Enden — in der Anfrage gibt es nichts zu rechnen,
                dort steht links nichts. */}
            {showTools && (
                <div className="ofi-ows-bar">
                    {!priceless && (
                        <button
                            type="button"
                            onClick={() => { setCalcError(calcModeProblem); setCalcOpen(true); }}
                            title={t('inv.orders.calcMode.title')}
                            disabled={!templateReady}
                            className={`ofi-ord-calcbtn${calcOpen ? ' is-on' : ''}${calcModeProblem && templateReady ? ' is-warn' : ''}`}
                        >
                            <SquareDivide size={16} />
                            <span>{t(calcMode === 'AUTO' ? 'inv.orders.calcMode.auto' : calcMode === 'SUPPLIER' ? 'inv.orders.calcMode.supplier' : 'inv.orders.calcMode.direct')}</span>
                        </button>
                    )}
                    <span className="ofi-ows-bar__end">
                        <button
                            type="button"
                            className="ofi-poi-launch is-alive"
                            disabled={!templateReady}
                            title={templateReady ? undefined : t('inv.aiImport.templateRequiredTitle')}
                            onClick={() => setAiOpen(true)}
                        >
                            <Zap size={14} />
                            {t('inv.aiImport.importButton')}
                        </button>
                    </span>
                </div>
            )}

            {/* ══ AYARLAR — ZWEI SPALTEN (Vorgabe Samet, 22.09.2026) ═══════
                «Bu düzenleme pop-up'ı, tedarikçi ekleme, hepsi Ayarlar tabında
                olacak … ayarlar iki sütun olsun … cihaz seçimi ya da proje
                seçimi bu da ayarlarda olsun … kod aralığı da ayarlarda olsun.»

                Die schwebende Apple-Kiste ist damit fort: dieselben Felder,
                aber IN der Seite, in zwei Spalten, jede Sache in ihrer eigenen
                Kiste. Nichts davon ist Pflicht; bleibt die Nummer leer, vergibt
                der Server sie. */}
            {activeTab === 'settings' && (
                <div className="ofi-ows-flow">
                    <FlowRail
                        title={t('inv.orders.tabs.settings')}
                        steps={settingsSteps}
                        stackRef={settingsStackRef}
                    />
                    <div className="ofi-ows-grid" ref={settingsStackRef}>
                        {/* ── DER BELEG ───────────────────────────────────────── */}
                        <section className="ofi-ows-card" data-flow-step="details">
                            <h3>{t('inv.orders.detailsTitle')}</h3>
                            <div className="ofi-ord-group">
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.reference')}</span>
                                    <input value={reference} onChange={(event) => setReference(event.target.value)} className="is-mono" />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.orderedBy')}</span>
                                    <input value={orderedByName} onChange={(event) => setOrderedByName(event.target.value)} />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.recipientName')}</span>
                                    <input value={recipientName} onChange={(event) => setRecipientName(event.target.value)} maxLength={120} />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.project')}</span>
                                    <input value={projectName} onChange={(event) => setProjectName(event.target.value)} />
                                </label>
                                <label className="ofi-ord-row">
                                    <span className="ofi-ord-label">{t('inv.orders.columns.quoteNumber')}</span>
                                    <input value={quoteNumber} onChange={(event) => setQuoteNumber(event.target.value)} className="is-mono" />
                                </label>
                            </div>
                        </section>

                        {/* ── DER LIEFERANT ───────────────────────────────────────
                            Er stand bisher oben neben der Tabelle; jetzt steht er
                            hier, wo alles Übrige entschieden wird. Getippt öffnet
                            sich die kurze Liste, «Tüm tedarikçiler …» das Fenster. */}
                        <section className="ofi-ows-card" data-flow-step="supplier">
                            <h3>{t('inv.columns.supplier')}</h3>
                            <div className="ofi-ord-group">
                                <div className={`ofi-ord-row is-full${supplierError ? ' is-invalid' : ''}`}>
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
                                    />
                                </div>
                                {(supplier.email || supplierAddress) && (
                                    <div className="ofi-ord-note">
                                        {supplier.email}
                                        {supplier.email && supplierAddress && <br />}
                                        {supplierAddress && <span className="whitespace-pre-line">{supplierAddress}</span>}
                                    </div>
                                )}
                            </div>
                            {supplierError && <span className="ofi-ord-err">{supplierError}</span>}
                        </section>

                        {/* ── PROJEKT UND GERÄT ───────────────────────────────────
                            Freiwillig (21.09.2026) und seit heute NUR hier: die
                            Positionstabelle trägt keine Gerätespalte mehr. */}
                        {productionOn && (
                            <section className="ofi-ows-card" data-flow-step="production">
                                <h3>{t('production.assign.label')}</h3>
                                <div className="ofi-ord-group">
                                    <div className="ofi-ord-row is-full">
                                        <ProductionAssignButton
                                            production={production}
                                            onClick={() => setPickerOpen(true)}
                                            disabled={!canTransfer}
                                        />
                                    </div>
                                    {!production && <div className="ofi-ord-note">{t('production.assign.none')}</div>}
                                </div>
                            </section>
                        )}

                        {/* ── KOD ARALIĞI ─────────────────────────────────────────
                            Aus welchem Nummernkreis die ERP-Codes kommen, die der
                            WARENEINGANG codelosen Zeilen gibt. Ohne Wahl vergibt
                            der Server den vorläufigen AA-BB-NNNNNN. */}
                        <section className="ofi-ows-card" data-flow-step="codeRange">
                            <h3>{t('inv.orders.receive.codeRange')}</h3>
                            <div className="ofi-ord-group">
                                <button
                                    type="button"
                                    className="ofi-ows-pick"
                                    onClick={() => setSchemeOpen(true)}
                                    disabled={!canTransfer}
                                >
                                    <span className={codeScheme ? 'is-mono' : undefined}>
                                        {codeScheme ? codeScheme.next : t('inv.orders.receive.codeRangeNone')}
                                    </span>
                                    <ChevronRight size={15} />
                                </button>
                                <div className="ofi-ord-note">
                                    {codeScheme ? codeScheme.label : t('inv.orders.receive.codeRangeHint')}
                                </div>
                            </div>
                        </section>

                        {/* ── ZUSATZKOSTEN ────────────────────────────────────────
                            Fracht, Verpackung, Montage … Die Beträge gehen in die
                            MwSt-Grundlage ein. Ein Betrag ohne Bezeichnung wird
                            nicht gespeichert. In der Anfrage gibt es keine Beträge. */}
                        {!priceless && (
                            <section className="ofi-ows-card" data-flow-step="fees">
                                <h3>{t('inv.orders.fees.title')}</h3>
                                <div className="ofi-ord-group">
                                    {fees.map((fee) => (
                                        <div key={fee.key} className={`ofi-ord-row${feeError && !fee.name.trim() ? ' is-invalid' : ''}`}>
                                            <button
                                                type="button"
                                                className="ofi-ord-dot is-remove"
                                                onClick={() => removeFee(fee.key)}
                                                title={t('inv.orders.fees.removeRow')}
                                                aria-label={t('inv.orders.fees.removeRow')}
                                            >
                                                <Minus size={13} />
                                            </button>
                                            <input value={fee.name} onChange={(event) => patchFee(fee.key, { name: event.target.value })} />
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
                                        <span className="ofi-ord-dot is-add"><Plus size={13} /></span>
                                        {t('inv.orders.fees.addButton')}
                                    </button>
                                </div>
                                {feeError
                                    ? <span className="ofi-ord-err">{feeError}</span>
                                    : filledFees.length > 0 && <span className="ofi-ord-total">{fmtMoney(feesTotal)}</span>}
                            </section>
                        )}

                        {/* ── MEHRWERTSTEUER ──────────────────────────────────────
                            EIN Satz für die ganze Bestellung, auf Zeilensumme +
                            Zusatzkosten. Eigene Länder lassen sich anhängen und
                            bleiben im Browser stehen. */}
                        {!priceless && (
                            <section className="ofi-ows-card" data-flow-step="vat">
                                <h3>{t('inv.orders.columns.vat')}</h3>
                                <div className="ofi-ord-group">
                                    <div className="ofi-ord-row">
                                        <span className="ofi-ord-label">{t('inv.orders.vatColumn.country')}</span>
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
                                                placeholder={t('inv.orders.vatColumn.country')}
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
                            </section>
                        )}

                        {/* ── WÄHRUNG ─────────────────────────────────────────── */}
                        {!priceless && (
                            <section className="ofi-ows-card" data-flow-step="currency">
                                <h3>{t('inv.orders.currencyPicker.title')}</h3>
                                <div className="ofi-ord-group">
                                    <div className="ofi-ord-row">
                                        <span className="ofi-ord-label">{t('inv.orders.currencyPicker.label')}</span>
                                        <SelectMenu
                                            className="ofi-ord-menu"
                                            buttonClassName="ofi-ord-select"
                                            ariaLabel={t('inv.orders.currencyPicker.label')}
                                            value={currency}
                                            listWidth={260}
                                            prefix={<span className="ofi-ord-cur">{CURRENCY_SYMBOLS[currency]}</span>}
                                            options={CURRENCY_CODES.map((code) => ({
                                                value: code,
                                                label: t(`inv.orders.currencyPicker.${code}`),
                                                hint: code,
                                                icon: <span className="ofi-ord-cur">{CURRENCY_SYMBOLS[code]}</span>,
                                            }))}
                                            onChange={(next) => setCurrency(toCurrencyCode(next))}
                                        />
                                    </div>
                                </div>
                            </section>
                        )}

                        {/* ── ANSCHREIBEN ─────────────────────────────────────────
                            Der Text, der im PDF VOR den Positionen steht. Das Feld
                            trägt ihn WIRKLICH (kein Platzhalter mehr) — solange
                            niemand ihn ändert, wird er nicht gespeichert und das
                            PDF druckt ihn in SEINER Sprache. Das Blatt ist hoch:
                            «ön yazı alanı daha büyük olsun» (Samet, 22.09.2026). */}
                        <section className="ofi-ows-card is-wide" data-flow-step="coverLetter">
                            <h3>{t('inv.orders.coverLetter.title')}</h3>
                            <div className="ofi-ord-group">
                                <textarea
                                    value={coverLetter}
                                    onChange={(event) => setCoverCustom(event.target.value)}
                                    className="ofi-ord-text"
                                    spellCheck={false}
                                />
                                <button type="button" className="ofi-ord-action" onClick={() => { setDraftError(null); setDraftsOpen(true); }}>
                                    <File05 size={15} />
                                    {t('inv.orders.coverLetter.draftsButton')}
                                </button>
                                <button
                                    type="button"
                                    className="ofi-ord-action"
                                    disabled={coverCustom === null}
                                    onClick={() => setCoverCustom(null)}
                                >
                                    <RefreshCcw01 size={15} />
                                    {t('inv.orders.coverLetter.resetDefault')}
                                </button>
                            </div>
                        </section>
                    </div>
                </div>
            )}

            {/* ══ ŞABLON SEÇİMİ ════════════════════════════════════════════
                Die Rechenvorlage bestimmt, WELCHE Spalten die Tabelle zeichnet
                und wie gerechnet wird. Sie war ein Menü in der Werkzeugzeile;
                jetzt ist sie ein Reiter, und die Wahl gilt sofort — bearbeitet
                wird in «Meine Vorlagen». */}
            {activeTab === 'template' && (
                <SectionCard
                    title={t('inv.orders.tabs.template')}
                    action={(
                        <button
                            type="button"
                            className="ofi-poi-ghost"
                            onClick={() => { setOpenTemplateId(activeTemplate?.id ?? null); setTemplatesOpen(true); }}
                        >
                            <Settings01 size={14} />
                            {t('inv.aiImport.menuTemplates')}
                        </button>
                    )}
                >
                    <div className="p-3.5">
                        {!templatesLoaded && <LoadingDots label={t('common.loadingData')} />}
                        {templatesLoaded && calcTemplates.length === 0 && (
                            <div className="ofi-ord-need">
                                <AlertTriangle size={22} />
                                <b>{t('inv.aiImport.templateRequiredTitle')}</b>
                                <span>{t('inv.aiImport.templateRequiredHint')}</span>
                                <button type="button" className="ofi-ord-done" onClick={() => setTemplatesOpen(true)}>
                                    {t('inv.aiImport.templateCreateButton')}
                                </button>
                            </div>
                        )}
                        {calcTemplates.length > 0 && (
                            <div className="ofi-ows-tpl">
                                {calcTemplates.map((template) => (
                                    <button
                                        key={template.id}
                                        type="button"
                                        className={`ofi-ows-tplcard${activeTemplate?.id === template.id ? ' is-on' : ''}`}
                                        onClick={() => {
                                            setActiveTemplateId(template.id);
                                            selectPreferredTemplate(templateDocumentType, template.id);
                                        }}
                                    >
                                        <b>
                                            {activeTemplate?.id === template.id && <Check size={13} />} {displayTemplateTitle(template.title, template.config.columns, poLang)}
                                        </b>
                                        <small>{t('inv.aiImport.columnCount', { count: template.config.columns.length })}</small>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </SectionCard>
            )}

            {/* ══ DIE VIER FAULEN REITER ═══════════════════════════════════
                Sie werden ERST EINGEHÄNGT, wenn man sie öffnet — «biz bu
                tablara bastıkça veri gelecek, tüm veriler asla aynı anda
                yüklenmesin». Jeder holt sein Zeug selbst und arbeitet mit dem
                GESPEICHERTEN Stand. */}
            {activeTab === 'pdf' && loadedOrder && (
                <PdfPanel order={loadedOrder} priceRequest={priceless} />
            )}
            {activeTab === 'mail' && loadedOrder && (
                <MailPanel
                    order={loadedOrder}
                    priceRequest={priceless}
                    onOrderChanged={(next) => { setLoadedOrder(next); setEditStatus(next.status); }}
                />
            )}


            {/* Ein vollständig eingelagerter Vorgang wird nicht mehr
                geschrieben — die Tabelle bleibt sichtbar, das Speichern ist aus. */}
            {activeTab === 'lines' && linesLocked && (
                <div className="flex items-center gap-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[12.5px] text-slate-500 dark:border-white/15 dark:text-white/60">
                    <AlertTriangle size={14} className="shrink-0" />
                    <span>{t('inv.orders.editCompleted')}</span>
                </div>
            )}

            {/* ── OHNE VORLAGE KEINE TABELLE (Vorgabe Samet, 11.09.2026) ────
                «Die Tabellenspalten lassen sich ohne Vorlage nicht anzeigen.»
                Fehlt sie — oder fehlen ihr die Pflichtzuordnungen —, steht
                hier der Hinweis und der Weg zur Vorlage; nichts sonst. */}
            {activeTab === 'lines' && (!templateReady ? (
                <SectionCard title={t('inv.orders.sectionEditor', { count: 0 })}>
                    <div className="ofi-ord-need">
                        <AlertTriangle size={22} />
                        <b>{t('inv.aiImport.templateRequiredTitle')}</b>
                        <span>{activeTemplate ? templateProblemText(templateFaults[0]) : t('inv.aiImport.templateRequiredHint')}</span>
                        <button type="button" className="ofi-ord-done" onClick={() => setTab('template')}>
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
                                                className={[
                                                    cellClassName(id, rowDirect, rowSupplier),
                                                    approvalMissing.get(row.key)?.has(id) ? 'ofi-prod-missing' : '',
                                                ].filter(Boolean).join(' ') || undefined}
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
            ))}

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
            {/* Der Beleg ERSETZT die Positionsliste (wie bisher). */}
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

            {/* Der Nummernkreis: gewählt in «Ayarlar». Er gehört dem ruhenden
                Wareneingang und wird für ihn aufbewahrt. */}
            <SchemePickDialog
                open={schemeOpen}
                onClose={() => setSchemeOpen(false)}
                onPick={(scheme, category) => {
                    const chosen = { id: scheme.id, label: `${category.code} · ${scheme.code}`, next: scheme.nextCode };
                    setCodeScheme(chosen);
                    try { localStorage.setItem(RECEIPT_SCHEME_KEY, JSON.stringify(chosen)); } catch { /* privates Fenster */ }
                    setSchemeOpen(false);
                }}
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

            {productionOn && (
                <ProductionPickerDialog
                    open={pickerOpen}
                    initial={production?.selection ?? null}
                    onClose={() => setPickerOpen(false)}
                    onApply={(selection, _lines, details) => applyProduction(selection, details)}
                />
            )}
        </div>
    );
};
