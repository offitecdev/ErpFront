import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { AlertTriangle, ArrowUp, Check, CheckCircle, ChevronDown, Plus, RefreshCcw01, Settings01, SquareDivide, Trash01, Zap } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { LoadingDots } from '@/components/ui-shared/Loader';
import { BotLoadingPanel } from '@/components/ui-shared/OffitecBot';
import { t } from '@/i18n/translate';
import { inventoryApi, purchaseOrdersApi, supplyApi } from '@/lib/api/inventory';
import type { CodeScheme } from '@/lib/api/articleCodes';
import { useAuthStore } from '@/store/authStore';
import { usePurchaseTemplateStore } from '@/store/purchaseTemplateStore';
import type { ArticleListItem, ItemType, OrderCalcMode, PurchaseOrderItemInput, PurchaseOrderRow, SupplierCalcConfig, SupplierOrderTemplate, TemplateColumn } from '@/types/inventory';
import { ArticleComboCell } from './components/ArticleComboCell';
import { ArticlePickerModal } from './components/ArticlePickerModal';
import { OrderFlowSteps } from './components/OrderFlowSteps';
import { SupplierImportDialog } from './import/SupplierImportDialog';
import { TemplateManagerPopup } from './import/TemplateManagerPopup';
import { CalcModeCard } from './components/CalcModeCard';
import { SchemePickDialog } from './components/SchemePickDialog';
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
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from './components/primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { useLanguageTick } from './hooks/useLanguageTick';
import type { DraftOrderRow } from './types';
import { importedRowMatches } from './utils/orderImport';
import { fmtDateTime, fmtMoney, fmtQty, fmtUnitPricePrecise, parseNum } from './utils/format';
import { foldedExtraDiscount } from './utils/orderPricing';
import {
    captureRowOrigin,
    draftRowFigures,
    restoreRowOrigin,
    rowDiffersFromOrigin,
    transitionRowMode,
} from './utils/orderRowMode';
import { ORDER_STATUS_META, canReceiveGoods, canRevertReceipt, stageIndexOf } from './utils/orderStatus';
import '@/styles/purchaseImport.css';
import '@/styles/orderDetails.css';

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
        extras: Object.fromEntries((item.extras ?? []).map((entry) => [entry.key, entry.value])),
        receivedQuantity: item.receivedQuantity ?? 0,
        receivedAt: item.receivedAt ?? null,
    };
};

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
    /* Die Rechenart ist zurück (Vorgabe Samet, 14.09.2026) — dieselbe Karte
       wie in der Bestellmaske. Eingelagerte Zeilen rechnen nicht mehr um:
       ihre Buchungen sind mit ihrem Preis geschrieben. */
    const [calcOpen, setCalcOpen] = useState(false);
    const [calcError, setCalcError] = useState<string | null>(null);
    /* Zeilen ohne Produktcode bekommen ihren ERP-Code erst beim Einlagern —
       der Server fragt nach dem Nummernkreis (SCHEME_REQUIRED), die Seite
       merkt sich die offene Einlagerung und setzt nach der Wahl dort fort. */
    const [codeScheme, setCodeScheme] = useState<CodeScheme | null>(null);
    const [schemeAsk, setSchemeAsk] = useState<{ targetKeys: string[] | null; complete: boolean; noteText: (processed: number) => string } | null>(null);
    const templateDocumentType = 'GOODS_RECEIPT' as const;
    const preferredTemplateId = usePurchaseTemplateStore((state) => state.selected.GOODS_RECEIPT);
    const selectPreferredTemplate = usePurchaseTemplateStore((state) => state.select);
    const [aiConfig, setAiConfig] = useState<SupplierCalcConfig>(() => defaultCalcConfig());
    const aiConfigRef = useRef<SupplierCalcConfig>(defaultCalcConfig());
    const loadedExtrasRef = useRef<TemplateColumn[]>([]);
    /** Eigene Angaben der Bestellung unter die Schluessel der Vorlage haengen. */
    const remapLoadedExtras = (config: SupplierCalcConfig, extras: TemplateColumn[]) => {
        const aliases = extraKeyAliases(config, extras);
        if (!aliases.size) return;
        setRows((current) => current.map((row) => remapRowExtras(row, aliases)));
    };
    const [calcTemplates, setCalcTemplates] = useState<SupplierOrderTemplate[]>([]);
    const [activeTemplate, setActiveTemplate] = useState<SupplierOrderTemplate | null>(null);
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [templateTick, setTemplateTick] = useState(0);
    const [templateMenuOpen, setTemplateMenuOpen] = useState(false);
    const [templatesOpen, setTemplatesOpen] = useState(false);
    const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);
    const [aiOpen, setAiOpen] = useState(false);
    const [allPickerRowKey, setAllPickerRowKey] = useState<string | null>(null);
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);
    /* ── DIE RÜCKFRAGE IST EIN STREIFEN, KEIN FENSTER (08.09.2026) ──────────
       Vorgabe Samet: «statt Popups eine Seite». Das galt auch für die letzten
       zwei Kästen des Browsers hier: die Frage steht jetzt in einem Streifen
       über der Tabelle, genau dort, wo die Handlung ausgelöst wurde.
         'clear'  → nicht eingelagerte Zeilen aus der Liste werfen
         'revert' → DEN WARENEINGANG LÖSCHEN: die Buchungen gehen zurück und
                    der Vorgang fällt eine Stufe auf die Bestellung. */
    const [ask, setAsk] = useState<'clear' | 'revert' | null>(null);

    const adoptOrder = (row: PurchaseOrderRow) => {
        setOrder(row);
        setRows(row.items.map(rowFromItem));
        remapLoadedExtras(aiConfigRef.current, extrasFromItems(row.items));
        setCalcMode(row.items[0]?.calcMode === 'AUTO' || row.items[0]?.calcMode === 'SUPPLIER'
            ? row.items[0].calcMode
            : 'DIRECT');
        setDirty(false);
        setSelected(new Set());
    };

    useEffect(() => {
        if (!orderId) return;
        let cancelled = false;
        queueMicrotask(() => { if (!cancelled) setLoading(true); });
        purchaseOrdersApi.get(orderId)
            .then((row) => { if (!cancelled) adoptOrder(row); })
            .catch((err) => {
                toast.error(errorText(err) || t('inv.orders.loadFailed'));
                navigate('/inventory/orders');
            })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [orderId]); // eslint-disable-line react-hooks/exhaustive-deps

    /* Der Wareneingang hat seine eigene Vorlagenliste (GOODS_RECEIPT). Eine
       Vorlage gehoert keinem Lieferanten mehr (11.09.2026): es gilt die von
       Hand gewaehlte, sonst die Vorgabe, sonst die erste. */
    useEffect(() => {
        if (!order) return;
        let cancelled = false;
        purchaseOrdersApi.listSupplierTemplates(null, templateDocumentType)
            .then((items) => {
                if (cancelled) return;
                setCalcTemplates(items);
                const chosen = items.find((entry) => entry.id === (activeTemplateId ?? preferredTemplateId));
                const general = items.find((entry) => entry.isDefault);
                const active = chosen ?? general ?? items[0] ?? null;
                setActiveTemplate(active);
                const nextConfig = active?.config ?? defaultCalcConfig();
                setAiConfig(nextConfig);
                remapLoadedExtras(nextConfig, loadedExtrasRef.current);
                if (active && active.id !== preferredTemplateId) {
                    selectPreferredTemplate(templateDocumentType, active.id);
                }
            })
            .catch(() => {
                if (!cancelled) {
                    setCalcTemplates([]);
                    setActiveTemplate(null);
                    setAiConfig(defaultCalcConfig());
                }
            });
        return () => { cancelled = true; };
    }, [order?.id, activeTemplateId, preferredTemplateId, templateTick]); // eslint-disable-line react-hooks/exhaustive-deps

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


    /** Fiyat kutusunun yanındaki geri çağır düğmesi (editörle aynı). */
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

    /** Geri çağır: satırın fiyatını özgün (içe aktarılan/kayıtlı) hâline döndürür. */
    const recallRowPrice = (row: DraftOrderRow) => {
        setRows((current) => current.map((entry) => (entry.key === row.key ? restoreRowOrigin(entry) : entry)));
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

    /**
     * ── «BELEG IMPORTIEREN» ERSETZT DIE TABELLE ─────────────────────────────
     * Vorgabe Samet (09.09.2026): «Ich kann im Wareneingang nichts in die
     * Tabelle übertragen — beim Beleg-Import müssen die vorherigen Daten weg
     * und ALLES übertragen werden.»
     *
     * Vorher legte der Import seine Werte nur ÜBER die schon vorhandenen
     * Bestellzeilen: er schrieb Mengen und Preise hinein, aber er legte nie
     * eine Zeile an. Stand die Zeile nicht schon da — und das ist der Normal-
     * fall, wenn der Lieferschein mehr oder andere Posten trägt als die
     * Bestellung —, passierte sichtbar nichts. Genau das war die Klage.
     *
     * Jetzt gilt dieselbe Regel wie in der Bestellmaske: der Beleg ERSETZT die
     * Liste. Zwei Dinge überleben das trotzdem, und beide aus einem harten
     * Grund:
     *
     *  • SCHON EINGELAGERTE ZEILEN BLEIBEN STEHEN. Ihre Lagerbuchungen sind
     *    geschrieben; würde der Import sie wegwerfen, zeigte die Seite weniger
     *    an, als im Lager liegt, und der Fortschritt («3 von 7») wäre falsch.
     *    Dieselbe Regel hat der Papierkorb im Tabellenfuss schon immer.
     *  • DIE VERKNÜPFUNG ZUM ARTIKEL. Findet eine gelesene Zeile ihre alte
     *    wieder (Code, ersatzweise Name — `importedRowMatches`), erbt sie
     *    deren `articleId` und Einheit. Sonst hinge nach jedem Import eine
     *    Zeile in der Luft, die vorher sauber am Katalog hing, und das
     *    Einlagern müsste den Artikel neu suchen.
     */
    const applyAiRows = (incoming: DraftOrderRow[]) => {
        setRows((current) => {
            const kept = current.filter((row) => row.receivedQuantity > 0);
            // Nur die NICHT eingelagerten geben ihre Kennung weiter — eine
            // behaltene Zeile steht ja weiterhin selbst in der Liste.
            const donors = current.filter((row) => row.receivedQuantity <= 0);
            const taken = new Set<number>();
            const fresh = incoming.map((source) => {
                const at = donors.findIndex((row, index) => !taken.has(index) && importedRowMatches(row, source));
                const donor = at >= 0 ? donors[at] : undefined;
                if (at >= 0) taken.add(at);
                const row: DraftOrderRow = {
                    ...source,
                    articleId: donor?.articleId ?? source.articleId,
                    unit: source.unit || (donor?.unit ?? ''),
                    receivedQuantity: 0,
                    receivedAt: null,
                    error: null,
                };
                return { ...row, origin: captureRowOrigin(row) };
            });
            return [...kept, ...fresh];
        });
        setSelected(new Set());
        if (incoming.length) {
            setDirty(true);
            toast.success(t('inv.aiImport.importedToast', { count: incoming.length }));
        }
    };

    /* ── DIE VORLAGE IST DIE TABELLE, AUCH HIER (11.09.2026) ────────────────
       Ganz links der feste ERP-Code, dann die Spalten der Vorlage in ihrer
       Reihenfolge. Die eigenen Angaben, die die Bestellung selbst traegt,
       kommen hinten dazu, wenn die Vorlage sie nicht kennt. Ohne gueltige
       Vorlage gibt es keine Tabelle. */
    const loadedExtraColumns = useMemo(() => extrasFromItems(order?.items ?? []), [order]);
    const templateFaults = useMemo(
        () => (activeTemplate ? templateProblems(aiConfig, templateDocumentType) : ['noColumns' as const]),
        [activeTemplate, aiConfig],
    );
    const templateReady = templateFaults.length === 0;
    const calcModeProblem = calcModeError(aiConfig, calcMode);
    const applyCalcMode = (next: OrderCalcMode) => {
        const problem = calcModeError(aiConfig, next);
        if (problem) {
            setCalcError(problem);
            toast.error(problem);
            return;
        }
        setCalcError(null);
        const movable = (row: DraftOrderRow) => row.receivedQuantity <= 0;
        if (next === calcMode && rows.every((row) => !movable(row) || row.calcMode === next)) return;
        setCalcMode(next);
        setRows((current) => current.map((row) => (movable(row) ? transitionRowMode(row, next) : row)));
        setDirty(true);
    };
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
    /* Bestellung und Vorlage kommen beide asynchron — wer als Zweiter ankommt,
       haengt die eigenen Angaben unter die Schluessel der Vorlage um. */
    useEffect(() => { aiConfigRef.current = aiConfig; }, [aiConfig]);
    useEffect(() => { loadedExtrasRef.current = loadedExtraColumns; }, [loadedExtraColumns]);

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
            // Die freien Spalten der Vorlage — plus die, die die Bestellung
            // selbst mitbringt — reisen mit ihren Ueberschriften.
            extras: draftExtras(row, extraColumns),
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
        /* KEIN ARTIKEL BEIM SPEICHERN (Vorgabe Samet, 14.09.2026): «Bevor es in
           den Wareneingang übertragen ist, kommt nichts in die Produkte.» Das
           Speichern schreibt nur die Zeilen der Bestellung; den Artikel legt
           erst das Einlagern an (`/receive`). */
        const updated = await purchaseOrdersApi.update(orderId, {
            items: filledRows.map((row) => rowToItem(row)),
            // Dieselbe Regel wie in der Bestellmaske: die Bestellung merkt sich,
            // was die Vorlage nicht traegt, damit das PDF es später noch weiss.
            hiddenColumnKeys: hiddenKeysForTemplate(aiConfig),
            // Und die Spalten der Vorlage selbst: das PDF schreibt ihre Namen
            // als Titel und haelt ihre Reihenfolge (Vorgabe Samet, 11.09.2026).
            tableColumns: tableColumnsSnapshot(aiConfig),
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
        setRows((current) => current.filter((row) => row.receivedQuantity > 0));
        setSelected(new Set());
        setNote(t('inv.orders.receive.cleared'));
        setDirty(true);
    };

    /**
     * ── WARENEINGANG LÖSCHEN (Vorgabe Samet, 08.09.2026) ────────────────────
     * «Wird der Wareneingang gelöscht, geht der Vorgang eine Stufe zurück.»
     * Der Server nimmt dabei die LAGERBUCHUNGEN dieser Bestellung zurück —
     * Eingangsbewegungen und Partien verschwinden, der Bestand fällt wieder —
     * und stellt die Bestellung auf die Bestellstufe. Danach gehört diese Seite
     * dem Vorgang nicht mehr: er steht auf seiner Bestellseite.
     */
    const revertReceipt = async () => {
        if (!orderId) return;
        setBusy('revert');
        try {
            const result = await purchaseOrdersApi.revertReceive(orderId);
            toast.success(t('inv.orders.flow.receiptDeleted', { count: result.revertedMovements }));
            navigate(`/inventory/orders/${orderId}`);
        } catch (err) {
            toast.error(errorText(err));
            setBusy(null);
        }
    };

    // ── Mal kabul (satır / seçili / tamamı) ──────────────────────────────────
    const runReceive = async (
        targetKeys: string[] | null,
        complete: boolean,
        noteText: (processed: number) => string,
        scheme: CodeScheme | null = codeScheme,
    ) => {
        if (!orderId) return;
        if (calcModeProblem) {
            setCalcError(calcModeProblem);
            toast.error(calcModeProblem);
            return;
        }
        setBusy('receive');
        try {
            // İndeksler kaydetmeden ÖNCE hesaplanır (kayıt sırayı korur).
            const indexes = targetKeys
                ? targetKeys.map((key) => filledRows.findIndex((row) => row.key === key)).filter((index) => index >= 0)
                : [];
            const persisted = await persistRows();
            if (!persisted) return;
            const result = await purchaseOrdersApi.receive(orderId, {
                ...(complete ? { complete: true } : { lines: indexes.map((index) => ({ index })) }),
                ...(scheme ? { codeSchemeId: scheme.id } : {}),
            });
            adoptOrder(result.order);
            setNote(noteText(result.processedCount));
            if (result.errors.length) toast.error(result.errors.map((entry) => entry.error).join(' · '));
            if (result.order.status === 'COMPLETED') toast.success(t('inv.orders.receive.completed'));
        } catch (err) {
            // Zeilen ohne Produktcode: erst den Nummernkreis wählen, dann weiter.
            if ((err as { response?: { data?: { code?: string } } })?.response?.data?.code === 'SCHEME_REQUIRED') {
                setSchemeAsk({ targetKeys, complete, noteText });
                return;
            }
            toast.error(errorText(err));
        } finally {
            setBusy(null);
        }
    };

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

    const columnOrder = useMemo(() => tableColumns.map((column) => column.id), [tableColumns]);
    const columnById = useMemo(
        () => new Map(tableColumns.map((column) => [column.id, column])),
        [tableColumns],
    );
    const extraByKey = useMemo(
        () => new Map(tableColumns.filter((column) => !column.label && !column.fixed).map((column) => [column.id, column])),
        [tableColumns],
    );

    // Sichtbare Spalten + (für Berechtigte) das Kästchen links + die Zeilenspalte rechts.
    const columnCount = columnOrder.length + (allowed ? 2 : 1);
    const tableMinWidth = 240 + tableColumns.length * 120;
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    // (Kanca erken `return`'den ÖNCE çağrılmalı.)
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-order-receive:col-widths:v2',
        defaults: {
            code: 128, quantity: 88, grossPrice: 104, netPrice: 104,
            discount: 88, discount2: 88, lineTotal: 120, send: 80,
            // Die freien Spalten tragen feste Schlüssel (`c1` … `c12`); `x1` …
            // `x5` sind die Schluessel aelterer Bestellungen.
            c1: 120, c2: 120, c3: 120, c4: 120, c5: 120, c6: 120,
            c7: 120, c8: 120, c9: 120, c10: 120, c11: 120, c12: 120,
            x1: 120, x2: 120, x3: 120, x4: 120, x5: 120,
        },
        minPx: 40,
    });

    /* ══ EINE SPALTE, VIER FRAGEN ═══════════════════════════════════════════
       Wie in der Bestellmaske: seit die Reihenfolge frei ist, schreibt die
       Tabelle ihre Zellen nicht mehr der Reihe nach hin, sondern fragt je
       Schlüssel nach Überschrift, Ausrichtung, Breite und Inhalt. Feste
       Felder und eigene Angaben beantworten dieselben vier Fragen — genau
       deshalb dürfen sie sich mischen. */
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

    /* Der fertig gerechnete Zeilenbetrag steht als Zahl IN der Zelle (kein
       Eingabefeld) — dann trägt die Zelle die Schrift, nicht das Feld. */
    const cellClassName = (id: OrderColumnId, editable: boolean, rowDirect: boolean): string | undefined =>
        (id === 'lineTotal' && !(editable && rowDirect)
            ? 'text-right font-mono text-[13px] text-slate-700 dark:text-white/80'
            : undefined);

    /** Der Inhalt der Zelle — dieselben Regeln wie zuvor, nur je Schlüssel. */
    const renderCell = (
        id: OrderColumnId,
        row: DraftOrderRow,
        figures: ReturnType<typeof draftRowFigures>,
        editable: boolean,
        rowDirect: boolean,
        rowSupplier: boolean,
        rowChanged: boolean,
    ): React.ReactNode => {
        // Eine eigene Angabe der Vorlage: frei änderbar wie jede Zelle.
        const extra = extraByKey.get(id);
        if (extra) {
            return editable ? (
                <input
                    value={row.extras?.[extra.key] ?? ''}
                    onChange={(event) => patchRow(row.key, {
                        extras: { ...(row.extras ?? {}), [extra.key]: event.target.value },
                    })}
                    inputMode={extra.type === 'number' ? 'decimal' : undefined}
                    className={`${CELL_INPUT_CLASS} ${extra.type === 'number' ? 'text-right font-mono' : ''}`}
                />
            ) : (
                <span className={`block text-[12.5px] text-slate-500 dark:text-white/60 ${extra.type === 'number' ? 'text-right font-mono' : ''}`}>
                    {row.extras?.[extra.key] || '—'}
                </span>
            );
        }

        switch (id) {
            case 'name':
                return (
                    <>
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
                                addLabel={t('inv.productPicker.addNew', { name: row.name.trim() })}
                                viewAllLabel={kindLabels.viewAll}
                            />
                        ) : (
                            <span className="text-slate-800 dark:text-white">{row.name}</span>
                        )}
                        {row.error && <span className="block text-[10.5px] font-semibold text-red-500">{row.error}</span>}
                    </>
                );

            case 'code':
                return editable && (!row.articleId || rowDirect) ? (
                    <input
                        value={row.code}
                        onChange={(event) => patchRow(row.key, { code: event.target.value })}
                        // Seri kod katalogda varsa o ürün satırın üzerine yazılır.
                        onBlur={(event) => void applySerialCodeMatch(row.key, event.target.value)}
                        /* Leer ist erlaubt: der ERP-Code kommt beim Einlagern
                           aus dem Nummernkreis. */
                        className={`${CELL_INPUT_CLASS} font-mono`}
                    />
                ) : (
                    <span className="block truncate font-mono text-[12.5px] text-slate-500 dark:text-white/60">{row.code || '—'}</span>
                );

            case 'quantity':
                return editable ? (
                    <input
                        value={row.quantity}
                        onChange={(event) => patchRow(row.key, { quantity: event.target.value })}
                        inputMode="decimal"
                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                    />
                ) : (
                    <span className="block text-right font-mono text-[13px]">{fmtQty(parseNum(row.quantity) ?? 0)}</span>
                );

            case 'grossPrice':
                return editable ? (
                    <input
                        value={row.grossPrice}
                        onChange={(event) => patchRow(row.key, { grossPrice: event.target.value })}
                        inputMode="decimal"
                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                    />
                ) : (
                    <span className="block text-right font-mono text-[13px] text-slate-500 dark:text-white/60">{fmtMoney(parseNum(row.grossPrice) ?? 0)}</span>
                );

            case 'netPrice':
                if (editable && rowDirect) {
                    return (
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
                            {recallButton(row, rowChanged)}
                        </span>
                    );
                }
                if (rowSupplier) {
                    return (
                        <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-700 dark:text-white/80">
                            {row.netPrice.trim() ? fmtUnitPricePrecise(parseNum(row.netPrice) ?? 0) : '—'}
                            {editable && recallButton(row, rowChanged)}
                        </span>
                    );
                }
                return (
                    <span className="flex items-center justify-end gap-1 font-mono text-[13px] text-slate-500 dark:text-white/60">
                        {rowDirect
                            ? (row.netPrice.trim() ? fmtMoney(parseNum(row.netPrice) ?? 0) : '—')
                            : (row.grossPrice.trim() ? fmtMoney(figures.netUnitPrice) : '—')}
                        {editable && recallButton(row, rowChanged)}
                    </span>
                );

            case 'discount':
            case 'discount2':
                return editable ? (
                    <input
                        value={id === 'discount' ? row.discount : row.discount2}
                        onChange={(event) => patchRow(row.key, id === 'discount'
                            ? { discount: event.target.value }
                            : { discount2: event.target.value })}
                        inputMode="decimal"
                        disabled={rowSupplier}
                        className={`${CELL_INPUT_CLASS} text-right font-mono disabled:cursor-not-allowed disabled:opacity-40`}
                    />
                ) : (
                    <span className="block text-right font-mono text-[12.5px] text-slate-500 dark:text-white/60">
                        {(id === 'discount' ? row.discount : row.discount2) || '—'}
                    </span>
                );

            case 'lineTotal':
                return editable && rowDirect ? (
                    <input
                        value={row.lineTotal}
                        onChange={(event) => patchRow(row.key, { lineTotal: event.target.value })}
                        inputMode="decimal"
                        placeholder={fmtMoney(figures.lineTotal)}
                        className={`${CELL_INPUT_CLASS} text-right font-mono`}
                    />
                ) : fmtMoney(figures.lineTotal);

            default:
                return null;
        }
    };

    if (loading || !order) {
        return (
            <div className="flex w-full flex-col gap-4">
                <InventoryListHeader title={t('inv.orders.receive.title')} />
                <BotLoadingPanel label={t('common.loadingData')} />
            </div>
        );
    }

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                /* Die drei Überschriften mittig — wie auf der Auftragsseite. */
                center={<OrderFlowSteps stageIndex={stageIndexOf(order.status)} />}
                title={(
                    <span className="flex items-center gap-2">
                        {t('inv.orders.receive.title')}
                        <span className="font-mono text-[13px] text-slate-500 dark:text-white/60">{order.referenceNumber}</span>
                        {statusMeta && (
                            <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                                {t(statusMeta.labelKey)}
                            </span>
                        )}
                    </span>
                )}
                /* ── DIE BEIDEN STUFENKNÖPFE STEHEN OBEN RECHTS ─────────────
                   Vorgabe Samet (09.09.2026): «Wo sind ‹löschen› und
                   ‹bestätigen›? Die gehören hin.» Gemeint ist der Platz, den
                   sie auf der Bestellseite haben — am rechten Ende der
                   Kopfzeile, rot links, grün rechts. Vorher lagen sie
                   verstreut: das Abschliessen in einem grauen Streifen
                   mitten auf der Seite, das Löschen allein auf einer eigenen
                   Zeile darunter. Jetzt tragen beide Seiten dieselbe Leiste,
                   und zwischen den Stufen wandert nichts mehr. */
                action={(
                    <div className="flex items-center gap-2">
                        {canTransfer && canRevertReceipt(order.status) && (
                            <button
                                type="button"
                                disabled={busy !== null}
                                onClick={() => setAsk('revert')}
                                title={t('inv.orders.flow.deleteReceipt')}
                                className="flex h-9 items-center gap-1.5 rounded-md border border-red-200 px-3.5 text-[12.5px] font-semibold text-red-600 transition-colors hover:bg-red-500 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500"
                            >
                                {busy === 'revert'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <Trash01 size={15} />}
                                {t('inv.orders.flow.deleteReceipt')}
                            </button>
                        )}
                        {allowed && (
                            <button
                                type="button"
                                disabled={busy !== null || openKeys.length === 0}
                                onClick={completeReceipt}
                                title={t('inv.orders.receive.completeButton')}
                                className="flex h-9 items-center gap-1.5 rounded-md bg-emerald-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                                {busy === 'receive'
                                    ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                    : <CheckCircle size={15} />}
                                {t('inv.orders.receive.completeButton')}
                            </button>
                        )}
                    </div>
                )}
            />


            {/* ── DIE RÜCKFRAGE STEHT BEI IHREM KNOPF ────────────────────────
                Ein Streifen, kein Fenster — und seit die beiden Knöpfe an
                entgegengesetzten Enden der Seite stehen, hat jeder seine
                eigene Frage: das Löschen des Wareneingangs fragt hier oben,
                unter seinem Knopf; das Leeren der Liste fragt unten im
                Tabellenfuss (`.ofi-ord-ask`, wie in der Bestellmaske). Eine
                Frage am anderen Seitenende wäre für den, der gerade unten
                geklickt hat, unsichtbar. */}
            {ask === 'revert' && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-red-200 bg-red-50/60 px-3.5 py-3 dark:border-red-500/30 dark:bg-red-500/10">
                    <span className="flex min-w-0 flex-1 items-start gap-2 text-[12.5px] font-medium text-red-700 dark:text-red-200">
                        <AlertTriangle size={15} className="mt-px shrink-0" />
                        <span>{t('inv.orders.flow.deleteReceiptConfirm')}</span>
                    </span>
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={() => setAsk(null)}
                            className="flex h-9 items-center rounded-md border border-slate-200 bg-white px-3.5 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-slate-400 dark:border-white/20 dark:bg-transparent dark:text-white/70"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => { setAsk(null); void revertReceipt(); }}
                            className="flex h-9 items-center rounded-md bg-red-600 px-3.5 text-[12.5px] font-semibold text-white transition-colors hover:bg-red-700"
                        >
                            {t('common.confirm')}
                        </button>
                    </span>
                </div>
            )}

            {/* ── EINE ZEILE: STAND LINKS, WERKZEUG RECHTS ───────────────────
                DER LIEFERANT STEHT NICHT MEHR DA (Vorgabe Samet, 09.09.2026:
                «ein Lieferantenfeld braucht es nicht»): er ist mit der
                Bestellung längst entschieden und auf dieser Stufe nicht mehr
                zu wählen — die Zeile wiederholte ihn nur. Wer ihn nachschlagen
                will, findet ihn auf der Bestellseite. */}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-slate-200 px-3.5 py-2.5 text-[12.5px] text-slate-600 dark:border-white/10 dark:text-white/70">
                {/* ── DER STAND, UND DANEBEN DIE KNÖPFE ──────────────────────
                    Vorgabe Samet (09.09.2026): «Der Satz und ‹0/43 aktarıldı›
                    gehören neben diese Knöpfe, die Liste gleich neben den Text
                    — alles in EINER Zeile.» Vorher waren es zwei Streifen
                    untereinander: oben stand, was zu tun ist, unten das
                    Werkzeug dafür. Jetzt trägt eine Zeile beides — links, was
                    gerade gilt, rechts, womit man es ändert. */}
                <span className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-medium text-slate-700 dark:text-white/80">
                        {note ?? t('inv.orders.receive.hint')}
                    </span>
                    <span className="text-slate-400 dark:text-white/40">
                        {/* Ohne gültige Vorlage zeigt die Seite 0 Positionen (14.09.2026). */}
                        {t('inv.orders.receive.progress', templateReady
                            ? { done: receivedCount, total: rows.length }
                            : { done: 0, total: 0 })}
                    </span>
                </span>

                {/* ÜRÜN/MALZEME SEÇİCİSİ YOKTUR: tür siparişten devralınır. */}
                {allowed && (
                <span className="flex flex-wrap items-center justify-end gap-2">
                    {/* BERECHNUNG (14.09.2026) — dieselbe Karte wie in der Bestellmaske. */}
                    <button
                        type="button"
                        onClick={() => { setCalcError(calcModeProblem); setCalcOpen(true); }}
                        title={t('inv.orders.calcMode.title')}
                        aria-label={t('inv.orders.calcMode.title')}
                        disabled={!templateReady}
                        className={`ofi-ord-calcbtn is-compact${calcOpen ? ' is-on' : ''}${calcModeProblem && templateReady ? ' is-warn' : ''}`}
                    >
                        <SquareDivide size={15} />
                        <span>{t(calcMode === 'AUTO' ? 'inv.orders.calcMode.auto' : calcMode === 'SUPPLIER' ? 'inv.orders.calcMode.supplier' : 'inv.orders.calcMode.direct')}</span>
                    </button>
                    {/* HESAP KİPİ — TEK AÇILIR LİSTE (kullanıcı isteği 2026-08-02, üç
                        düğme yerine). Varsayılan DOĞRUDAN GİRİŞtir. Liste TÜM satırlara
                        uygulanır; tek satır, sağındaki daireden değiştirilir. */}
                    <span className="ofi-poi-menuwrap">
                        <button
                            type="button"
                            className="ofi-poi-ghost"
                            onClick={() => setTemplateMenuOpen((current) => !current)}
                        >
                            <Settings01 size={14} />
                            {activeTemplate?.title ?? t('inv.aiImport.templateNone')}
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
                                            /* EINE VORLAGE WÄHLEN HEISST: SIE GILT AB JETZT
                                               (Vorgabe Samet, 09.09.2026: «wird eine
                                               Vorlage gewählt, muss sie sofort auf die
                                               Tabelle darunter angewendet werden»).
                                               Vorher sprang dabei das Vorlagenfenster
                                               auf — man wollte umstellen und musste
                                               erst etwas wegräumen. Der Klick setzt
                                               jetzt nur `activeTemplateId`; von dort
                                               laufen Rechenart, eigene Spalten und die
                                               Tabelle nach. Bearbeitet werden Vorlagen
                                               über den Eintrag unten im Menü. */
                                            onClick={() => {
                                                setActiveTemplateId(template.id);
                                                selectPreferredTemplate(templateDocumentType, template.id);
                                                setTemplateMenuOpen(false);
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
                )}
            </div>

            {/* OHNE VORLAGE KEINE TABELLE (Vorgabe Samet, 11.09.2026) — auch
                im Wareneingang: der Hinweis und der Weg zur Vorlage. */}
            {!templateReady ? (
                <SectionCard title={t('inv.orders.receive.sectionTitle', { count: 0 })}>
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
            <SectionCard title={t('inv.orders.receive.sectionTitle', { count: rows.length })}>
                <div className="overflow-x-auto">
                    {/* Satırlar mal kabulde daha FERAH (kullanıcı isteği): yükseklik
                        `.ofi-receive-table` ile büyütülür. Ürün/malzeme sütunu ise
                        daraltıldı — tür zaten siparişten sabit. */}
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-receive-table w-full" style={{ minWidth: tableMinWidth }}>
                        {/* Die Spaltenbreiten folgen der REIHENFOLGE aus dem
                            Spaltenfenster, nicht mehr einer festen Aufzaehlung:
                            was dort oben steht, steht hier links. Der Name
                            traegt keine Breite — er saugt den Rest auf, wo
                            immer er gerade sitzt. */}
                        <colgroup>
                            {/* Seçim kutusu sütunu yalnızca yetkiliye çizilir —
                                `<col>` listesi de aynı koşulu izler. */}
                            {allowed && <col style={{ width: 36 }} />}
                            {columnOrder.map((id) => (
                                <col key={id} style={columnWidthStyle(id)} />
                            ))}
                            <ResizableCols keys={['send'] as const} grid={grid} />
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
                                {columnOrder.map((id) => (
                                    <th
                                        key={id}
                                        className={`relative ${columnAlign(id) === 'right' ? 'text-right' : 'text-left'}`}
                                    >
                                        {columnLabel(id)}
                                        {id !== 'name' && <ColResizeHandle {...grid.resizeProps(id as 'code')} />}
                                    </th>
                                ))}
                                {/* "Aktarılan" SÜTUNU YOKTUR (kullanıcı isteği):
                                    aktarılan satır zaten onay işaretiyle görünür. */}
                                <th className="relative" aria-label={t('common.actions')}>
                                    <ColResizeHandle {...grid.resizeProps('send')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows.length === 0 && (
                                <tr>
                                    <td colSpan={columnCount} className="py-12 text-center text-[13px] text-slate-400 dark:text-white/50">
                                        {t('inv.orders.editorEmpty')}
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
                                        {columnOrder.map((id) => (
                                            <td key={id} className={cellClassName(id, editable, rowDirect)}>
                                                {renderCell(id, row, figures, editable, rowDirect, rowSupplier, rowChanged)}
                                            </td>
                                        ))}
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
                                                        null
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
                {/* ── DER FUSS DER TABELLE ─────────────────────────────────
                    Dieselbe Leiste wie in der Bestellmaske (Vorgabe Samet:
                    «Unten links gehört IMMER ein Plus hin»). Vorher stand das
                    Hinzufügen als beschrifteter Knopf oben rechts in der
                    Werkzeugzeile — an einem Platz, an dem man es nicht sucht,
                    seit die Bestellseite ihr Plus unten trägt. Links also die
                    Zeilengesten (hinzufügen, leeren), rechts die beiden, die
                    mit den Häkchen zu tun haben: die Auswahl ins Lager
                    schicken und das Erfasste sichern. */}
                {allowed && (
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
                    {/* Der Papierkorb leert die LISTE — bereits eingelagerte
                        Zeilen bleiben stehen, ihre Buchungen sind geschrieben.
                        Einzelne Zeilen wirft der kleine Korb in der Zeile weg. */}
                    <button
                        type="button"
                        disabled={busy !== null || rows.length === 0}
                        onClick={() => setAsk('clear')}
                        title={t('inv.orders.receive.clearAll')}
                        aria-label={t('inv.orders.receive.clearAll')}
                        className="ofi-ord-bin"
                    >
                        <Trash01 size={16} />
                    </button>
                    {ask === 'clear' && (
                        <span className="ofi-ord-ask">
                            {t('inv.orders.receive.clearConfirm')}
                            <button type="button" onClick={() => setAsk(null)}>{t('common.cancel')}</button>
                            <button
                                type="button"
                                className="is-danger"
                                onClick={() => { setAsk(null); clearRows(); }}
                            >
                                {t('common.confirm')}
                            </button>
                        </span>
                    )}
                    <span className="ofi-ord-spacer" />
                    {/* Die beiden rechten stehen in EINER Hülle: `.ofi-ord-done`
                        trägt selbst `margin-left:auto`, und zwei automatische
                        Ränder in derselben Zeile teilen den freien Platz unter
                        sich — der Sendeknopf käme sonst in die Mitte. */}
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            disabled={busy !== null || selected.size === 0}
                            onClick={receiveSelected}
                            className="flex h-9 items-center gap-1.5 rounded-full border border-sky-300 px-3.5 text-[12.5px] font-semibold text-sky-600 transition-colors hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-sky-500/40 dark:text-sky-300 dark:hover:bg-sky-500/10"
                        >
                            <ArrowUp size={14} />
                            {t('inv.orders.receive.sendSelected', { count: selected.size })}
                        </button>
                        <button
                            type="button"
                            disabled={!dirty || busy !== null}
                            onClick={() => void saveChanges()}
                            className="ofi-ord-done"
                        >
                            {busy === 'save'
                                ? <LoadingDots label={t('common.loadingData')} />
                                : t('common.save')}
                        </button>
                    </span>
                </div>
                )}
            </SectionCard>
            )}

            {!allowed && order.status !== 'COMPLETED' && (
                <p className="text-[12px] text-slate-400 dark:text-white/50">{t('inv.orders.receive.notReady')}</p>
            )}
            {order.status === 'COMPLETED' && (
                <p className="text-[12.5px] font-medium text-emerald-600 dark:text-emerald-300">{t('inv.orders.receive.completed')}</p>
            )}

            <SupplierImportDialog
                open={aiOpen}
                onClose={() => setAiOpen(false)}
                config={aiConfig}
                template={activeTemplate}
                onApply={applyAiRows}
                calcMode={calcMode}
                documentType="GOODS_RECEIPT"
            />
            <TemplateManagerPopup
                open={templatesOpen}
                onClose={() => { setTemplatesOpen(false); setOpenTemplateId(null); }}
                openTemplateId={openTemplateId}
                documentType="GOODS_RECEIPT"
                onSaved={(templateId) => {
                    if (templateId) {
                        setActiveTemplateId(templateId);
                        selectPreferredTemplate(templateDocumentType, templateId);
                    }
                    setTemplateTick((tick) => tick + 1);
                }}
            />

            <ArticlePickerModal
                open={allPickerRowKey !== null}
                onClose={() => setAllPickerRowKey(null)}
                onPick={(article) => { if (allPickerRowKey) onProductPicked(allPickerRowKey, article); }}
                title={kindLabels.allTitle}
            />

            <CalcModeCard
                open={calcOpen}
                onClose={() => { setCalcOpen(false); setCalcError(null); }}
                mode={calcMode}
                config={aiConfig}
                onApply={applyCalcMode}
                error={calcError}
            />

            <SchemePickDialog
                open={Boolean(schemeAsk)}
                onClose={() => setSchemeAsk(null)}
                onPick={(scheme) => {
                    const pending = schemeAsk;
                    setCodeScheme(scheme);
                    setSchemeAsk(null);
                    if (pending) void runReceive(pending.targetKeys, pending.complete, pending.noteText, scheme);
                }}
            />
        </div>
    );
};
