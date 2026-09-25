import { apiClient, getShared, MAIL_REQUEST_TIMEOUT_MS } from '../axios';
import { itGateHeaders } from '../itGate';
import { cachedQuery, peekQueryState, refreshQuery } from './queryCache';
import i18n from '@/i18n';
import { purchaseLangOf } from '@/utils/purchaseCode';
import { localizeStandardTemplate } from '@/utils/standardOrderColumns';
import type {
    PurchaseOrderMergeCandidate,
    InventoryLocation,
    InventoryArticle,
    ArticleStockSummary,
    ArticleStockInfo,
    ArticleDetail,
    ArticleDetailStats,
    ArticleDetailPatch,
    ArticleSuppliersSummary,
    ArticleListPage,
    ArticleQuickPickPage,
    StockBalanceRow,
    StockMovementRow,
    PurchaseProposalRow,
    InventoryDashboard,
    MovementType,
    SupplierRow,
    ArticleSupplierRow,
    SearchItem,
    LowStockResponse,
    ItemSuppliersResponse,
    SupplyRequestRow,
    SupplyRequestStatus,
    CreateSupplyRequestInput,
    ItemType,
    MovementListPage,
    MovementListQuery,
    SupplierSearchItem,
    BulkArticleItemInput,
    QuickArticleItemInput,
    BulkArticlesResult,
    SingleArticleInput,
    SingleArticleResult,
    BulkMovementItemInput,
    BulkMovementsResult,
    ScanLookupResult,
    PurchaseOrderRow,
    PurchaseOrderListPage,
    PurchaseOrderListQuery,
    PurchaseOrderStatus,
    PurchaseOrderTextTemplate,
    PurchaseOrderTextTemplatePage,
    PurchaseOrderMailDraft,
    PurchaseOrderMailDraftInput,
    CreatePurchaseOrderInput,
    UpdatePurchaseOrderInput,
    SendPurchaseOrderMailInput,
    SendPurchaseOrderMailResult,
    ReceivePurchaseOrderInput,
    ReceivePurchaseOrderResult,
    AiImportStatus,
    AiExtractInput,
    AiExtractResponse,
    SupplierCalcConfig,
    SupplierOrderTemplate,
    PurchaseTemplateDocumentType,
} from '../../types/inventory';

/* Produktwähler: eine Antwort gilt 60 s ohne Rückfrage und darf bis 10 min
   sofort gezeigt werden, während sie im Hintergrund erneuert wird. Jede
   Schreibanfrage an Artikel/Bestand macht sie alt (queryCache, Bereich
   `catalog`). */
const QUICK_PICK_QUERY = { freshMs: 60_000, staleMs: 600_000, tags: ['catalog'] };

const quickPickUrl = (params: { page?: number; pageSize?: number; search?: string }) => {
    const query = new URLSearchParams();
    query.set('page', String(params.page ?? 1));
    query.set('pageSize', String(params.pageSize ?? 15));
    query.set('lean', 'true');
    query.set('includeDescription', 'true');
    query.set('sortBy', 'nameNatural');
    query.set('sortDirection', 'asc');
    if (params.search) query.set('search', params.search);
    return `/inventory/articles/summary/paged?${query.toString()}`;
};

export const inventoryApi = {
    dashboard: async (): Promise<InventoryDashboard> => {
        const res = await apiClient.get('/inventory/dashboard');
        return res.data;
    },

    listLocations: async (): Promise<InventoryLocation[]> => {
        const res = await apiClient.get('/inventory/locations');
        return res.data;
    },

    createLocation: async (input: {
        locationName: string;
        locationType: InventoryLocation['locationType'];
        parentLocationId?: string | null;
    }): Promise<InventoryLocation> => {
        const res = await apiClient.post('/inventory/locations', input);
        return res.data;
    },

    getBalances: async (locationId?: string): Promise<StockBalanceRow[]> => {
        const params = locationId ? `?locationId=${locationId}` : '';
        const res = await apiClient.get(`/inventory/balances${params}`);
        return res.data;
    },

    articlesSummary: async (includeImages = false): Promise<ArticleStockSummary[]> => {
        // Base64 thumbnails make this list response ~1MB+; only request them for
        // consumers that actually render images (e.g. the product picker).
        const query = includeImages ? '?includeImages=true' : '';
        try {
            const res = await apiClient.get(`/inventory/articles/summary${query}`);
            return res.data;
        } catch {
            const res = await apiClient.get(`/articles?includeStock=true${includeImages ? '&includeImages=true' : ''}`);
            return res.data;
        }
    },

    // Server-side pagination for the products list / tender picker — pulls one
    // page (default 15) at a time with search/status/itemType applied in the DB.
    // Returns only the lean fields the table shows plus id; images and detail
    // fields are NOT fetched here (load product detail separately by id).
    articlesSummaryPaged: async (params: {
        page?: number;
        pageSize?: number;
        search?: string;
        status?: string;
        itemType?: string;
        includeDescription?: boolean;
        // Kolon bazlı filtreler (tablo filtre satırı) — DB'de tek kolona daraltır.
        code?: string;
        name?: string;
        barcode?: string;
        sortBy?: string;
        sortDirection?: 'asc' | 'desc';
    }): Promise<ArticleListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 15));
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
        if (params.itemType) query.set('itemType', params.itemType);
        if (params.includeDescription) query.set('includeDescription', 'true');
        if (params.code) query.set('code', params.code);
        if (params.name) query.set('name', params.name);
        if (params.barcode) query.set('barcode', params.barcode);
        if (params.sortBy) query.set('sortBy', params.sortBy);
        if (params.sortDirection) query.set('sortDirection', params.sortDirection);
        // Liste efekti StrictMode'da yeniden bağlansa bile aynı sayfa/filtre için
        // ikinci HTTP isteği açılmaz.
        const res = await getShared<ArticleListPage>(`/inventory/articles/summary/paged?${query.toString()}`);
        return res.data;
    },

    /**
     * Product picker feed. Returns ONLY the fields that end up on a quote line —
     * id, name, description, unit, price — instead of the full article record
     * (code, category, barcodes, status, stock levels, created date) plus the
     * stock-balance JOIN behind `totalQuantity`. None of that is shown in the
     * picker, and none of it is copied onto the line.
     *
     * ORDNUNG: erst alphabetisch, dann numerisch von klein nach gross — die
     * Regel, nach der die Offerte, die Rechnung und der Nachtrag ihre
     * Produktliste erwarten (Vorgabe Samet). Sie steht im Server (`nameNatural`,
     * siehe `InventoryRepository`), denn die Liste kommt seitenweise: eine
     * fertige Seite hier nachzusortieren ordnete bloss die zehn Zeilen, die der
     * Server nach einer anderen Regel schon ausgewählt hätte.
     */
    articlesQuickPick: async (params: {
        page?: number;
        pageSize?: number;
        search?: string;
    }, options: { mustBeFresh?: boolean } = {}): Promise<ArticleQuickPickPage> => {
        const url = quickPickUrl(params);
        const fetcher = async () => (await apiClient.get<ArticleQuickPickPage>(url)).data;
        // `mustBeFresh`: eine alte Antwort NICHT als Antwort ausgeben — der
        // Aufrufer zeigt sie selbst vorläufig (peekArticlesQuickPick) und
        // entscheidet erst mit der frischen (Enter wählt daraus).
        if (options.mustBeFresh && !peekQueryState(url, QUICK_PICK_QUERY)?.fresh) {
            return refreshQuery(url, fetcher, QUICK_PICK_QUERY);
        }
        return cachedQuery(url, fetcher, QUICK_PICK_QUERY);
    },

    /** Sofort vorhandene Antwort des Produktwählers (ohne Netz), samt «noch frisch?». */
    peekArticlesQuickPick: (params: { page?: number; pageSize?: number; search?: string }) =>
        peekQueryState<ArticleQuickPickPage>(quickPickUrl(params), QUICK_PICK_QUERY),

    // Tek ürünün yalın canlı stok bilgisi (sayaç + ortalama maliyet). Depo/lokasyon,
    // tedarikçi listesi ve görsel çekilmez — stok hareketi sonrası hızlı yenileme için.
    getArticleStock: async (id: string): Promise<ArticleStockInfo> => {
        const res = await apiClient.get(`/inventory/articles/${id}/stock`);
        return res.data;
    },

    // Ürün detay ekranının başlık tablosu — yalnızca ekranda görünen alanlar.
    // Tedarikçiler ve hareketler bu yanıtta YOKTUR; kendi uçlarından, ilgili
    // düğmeye basıldığında yüklenirler.
    getArticleDetail: async (id: string): Promise<ArticleDetail> => {
        const res = await getShared<ArticleDetail>(`/inventory/articles/${id}/detail`);
        return res.data;
    },

    // Maliyet ve açık sipariş taraması ana başlığı bloke etmez; id bilindiği
    // için detay isteğiyle aynı anda başlatılır.
    getArticleDetailStats: async (id: string): Promise<ArticleDetailStats> => {
        const res = await getShared<ArticleDetailStats>(`/inventory/articles/${id}/detail-stats`);
        return res.data;
    },

    // Görsel JSON/base64 yerine binary gelir. `version` değişmez bir cache key'i
    // oluşturur; aynı kayıt yeniden açıldığında tarayıcı indirme yapmaz.
    getArticleImage: async (id: string, version: string): Promise<Blob | null> => {
        const query = new URLSearchParams({ v: version });
        const res = await getShared<Blob>(`/inventory/articles/${id}/image?${query.toString()}`, {
            responseType: 'blob',
        });
        return res.status === 204 || !res.data || res.data.size === 0 ? null : res.data;
    },

    // Tedarikçi popup'ı — yalnızca popup açıldığında çağrılır.
    getArticleSuppliersSummary: async (id: string): Promise<ArticleSuppliersSummary> => {
        // React StrictMode sekmeyi geliştirmede iki kez bağlayabilir. Aynı URL'nin
        // uçuşta olan isteğini paylaşarak ikinci HTTP çağrısını engelle.
        const res = await getShared<ArticleSuppliersSummary>(`/inventory/articles/${id}/suppliers-summary`);
        return res.data;
    },

    /**
     * Detay ekranındaki "Kaydet" düğmesinin TEK ucu: alanlar, açıklama ve
     * görsel aynı istekte gider. `imageUrl` alanı hiç gönderilmezse görsel
     * değişmez; `null` gönderilirse silinir.
     */
    saveArticleDetail: async (articleId: string, patch: ArticleDetailPatch): Promise<ArticleDetail> => {
        const res = await apiClient.patch(`/inventory/articles/${articleId}/detail`, patch);
        return res.data;
    },

    searchItems: async (q: string): Promise<SearchItem[]> => {
        const res = await apiClient.get(`/inventory/search-items?q=${encodeURIComponent(q)}`);
        return res.data;
    },

    scanMovement: async (input: {
        codeOrBarcode: string;
        movementType: MovementType;
        quantity: number;
        unitCost?: number | null;
        supplierId?: string | null;
        sourceLocationId?: string | null;
        destLocationId?: string | null;
        referenceId?: string | null;
        description?: string | null;
    }): Promise<{ message: string; data: StockMovementRow }> => {
        const res = await apiClient.post('/inventory/movements/scan', input);
        return res.data;
    },

    getMovements: async (articleId: string): Promise<StockMovementRow[]> => {
        const res = await apiClient.get(`/inventory/movements/${articleId}`);
        return res.data;
    },

    // Tüm stok hareketleri — sayfalı, genel arama + kolon filtreleri.
    listMovements: async (params: MovementListQuery): Promise<MovementListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 20));
        if (params.articleId) query.set('articleId', params.articleId);
        if (params.search) query.set('search', params.search);
        if (params.code) query.set('code', params.code);
        if (params.name) query.set('name', params.name);
        if (params.description) query.set('description', params.description);
        if (params.type) query.set('type', params.type);
        if (params.origin) query.set('origin', params.origin);
        if (params.dateFrom) query.set('dateFrom', params.dateFrom);
        if (params.dateTo) query.set('dateTo', params.dateTo);
        // Filtre ve sayfa URL'nin parçasıdır; yalnızca tamamen aynı sorgular
        // birleşir. StrictMode'un ikinci efekti yeni bir XHR oluşturmaz.
        const res = await getShared<MovementListPage>(`/inventory/movements?${query.toString()}`);
        return res.data;
    },

    // Toplu ürün ekleme (tablo / Excel içe aktarımı). Mükerrer kodlar
    // satır bazında reddedilir; `overwrite` ile kodu kayıtlı satır hata yerine
    // mevcut ürünü GÜNCELLER (dosya kazanır — sipariş Excel aktarımı bunu kullanır).
    // `itemType` = ürün/hizmet sınıflandırması (varsayılan PRODUCT).
    bulkCreateArticles: async (
        items: BulkArticleItemInput[],
        itemType?: ItemType,
        options?: { overwrite?: boolean },
    ): Promise<BulkArticlesResult> => {
        const res = await apiClient.post('/inventory/articles/bulk', {
            items,
            itemType,
            ...(options?.overwrite ? { overwrite: true } : {}),
        });
        return res.data;
    },

    /**
     * Schnellerfassung (10.09.2026): wie `bulkCreateArticles`, nur OHNE Code —
     * der Server zieht den ERP-Code `KAT-UNTER-NNNNN` aus dem gewählten,
     * von der IT freigegebenen Nummernkreis und meldet ihn in
     * `created[].articleCode` zurück. Neue Artikel sind immer PRODUKTE; die
     * Menge (Standard 1) wird als Zugang gebucht, Herkunft QUICK_ADD.
     */
    quickCreateArticles: async (schemeId: string, items: QuickArticleItemInput[]): Promise<BulkArticlesResult> => {
        const res = await apiClient.post('/inventory/articles/quick', { schemeId, items });
        return res.data;
    },

    /**
     * Yeni ürün formu (23.09.2026): TEK ürün, ERP kodu olmadan (sunucu geçici
     * AA-BB kodunu verir), birden fazla tedarikçi ve üçlü ürün türüyle. Proje
     * ve satış şirketlerinde tür ve tedarikçi sunucuda da zorunludur.
     */
    createSingleArticle: async (input: SingleArticleInput): Promise<SingleArticleResult> => {
        const res = await apiClient.post('/inventory/articles/single', input);
        return res.data;
    },

    /** Gescannten Code (Barcode / Seriennummer / ERP-Code) einem Artikel zuordnen. */
    scanLookup: async (code: string): Promise<ScanLookupResult> => {
        const res = await apiClient.get(`/inventory/articles/scan-lookup?code=${encodeURIComponent(code)}`);
        return res.data;
    },

    receiveQuickStockUnit: async (input: import('@/types/inventory').QuickStockUnitInput): Promise<import('@/types/inventory').QuickStockUnitResult> => {
        const res = await apiClient.post('/inventory/stock-units/quick', input);
        return res.data;
    },

    /**
     * Product/model barcodes only; individual device labels use receiveQuickStockUnit.
     */
    addArticleBarcode: async (articleId: string, barcode: string): Promise<{ ok: boolean; primary: boolean }> => {
        const res = await apiClient.post(`/inventory/articles/${articleId}/barcodes`, { barcode });
        return res.data;
    },

    /** Systembarcode erzeugen — nur auf Knopfdruck, nur wenn noch keiner da ist. */
    generateBarcode: async (articleId: string): Promise<ArticleDetail> => {
        const res = await apiClient.post(`/inventory/articles/${articleId}/barcode`, {});
        return res.data;
    },

    /**
     * IT-Produktupload (CSV/Excel) — derselbe Rumpf wie `bulkCreateArticles`,
     * aber hinter der IT-Schleuse statt hinter dem Lagerrecht, und der Bestand
     * ist auf dem Server auf 0 festgenagelt (die Menge aus der Datei zählt
     * nicht). Der Ausweis der Schleuse reist im Kopf `x-it-gate` mit.
     */
    importArticles: async (
        items: BulkArticleItemInput[],
        options?: { overwrite?: boolean },
    ): Promise<BulkArticlesResult> => {
        const res = await apiClient.post(
            '/inventory/articles/import',
            { items, ...(options?.overwrite ? { overwrite: true } : {}) },
            { headers: itGateHeaders() },
        );
        return res.data;
    },

    /**
     * Produktliste der GEWÄHLTEN Firma zurücksetzen — alles in den Papierkorb.
     * Einzige Schranke ist die IT-Schleuse: ihr Ausweis reist im Kopf mit und
     * gilt für die ganze Sitzung, ein persönliches Kennwort wird hier NICHT
     * verlangt (Vorgabe 17.08.2026). `RESET_PRODUCTS` ist das feste Wort, das
     * der Server sehen will — der getippte Satz im Fenster ist seine Anzeige in
     * der Sprache des Anwenders.
     */
    purgeArticles: async (): Promise<{ deleted: number }> => {
        const res = await apiClient.post(
            '/inventory/articles/purge',
            { confirm: 'RESET_PRODUCTS' },
            { headers: itGateHeaders() },
        );
        return res.data;
    },

    // Toplu stok hareketi (giriş/çıkış). Satır bazında hata döner.
    bulkCreateMovements: async (items: BulkMovementItemInput[]): Promise<BulkMovementsResult> => {
        const res = await apiClient.post('/inventory/movements/bulk', { items });
        return res.data;
    },

    // Tedarikçi seçici için yalın arama (ilk 10 kayıt).
    searchSuppliers: async (q: string, limit = 10): Promise<SupplierSearchItem[]> => {
        const query = new URLSearchParams();
        if (q) query.set('q', q);
        query.set('limit', String(limit));
        const url = `/inventory/suppliers/search?${query.toString()}`;
        return cachedQuery(url, async () => (await apiClient.get(url)).data, QUICK_PICK_QUERY);
    },

    listProposals: async (): Promise<PurchaseProposalRow[]> => {
        const res = await apiClient.get('/inventory/proposals');
        return res.data;
    },

    resolveProposal: async (id: string, isApproved: boolean): Promise<void> => {
        await apiClient.patch(`/inventory/proposals/${id}/resolve`, { isApproved });
    },

    listSuppliers: async (): Promise<SupplierRow[]> => {
        const res = await apiClient.get('/inventory/suppliers');
        return res.data;
    },

    getSupplier: async (id: string): Promise<SupplierRow> => {
        const res = await apiClient.get(`/inventory/suppliers/${id}`);
        return res.data;
    },

    // Sipariş ekranı: seçilen tedarikçinin yalnızca KDV ayarı.
    getSupplierVat: async (id: string): Promise<Pick<SupplierRow, 'id' | 'vatLiable' | 'vatCountry' | 'vatRate'>> => {
        const res = await apiClient.get(`/inventory/suppliers/${id}/vat`);
        return res.data;
    },

    createSupplier: async (input: Partial<SupplierRow>): Promise<SupplierRow> => {
        const res = await apiClient.post('/inventory/suppliers', input);
        return res.data;
    },

    updateSupplier: async (id: string, patch: Partial<SupplierRow>): Promise<SupplierRow> => {
        const res = await apiClient.patch(`/inventory/suppliers/${id}`, patch);
        return res.data;
    },

    listArticleSuppliers: async (articleId: string): Promise<ArticleSupplierRow[]> => {
        const res = await apiClient.get(`/inventory/articles/${articleId}/suppliers`);
        return res.data;
    },

    saveArticleSupplier: async (articleId: string, input: Partial<ArticleSupplierRow> & Partial<SupplierRow>): Promise<ArticleSupplierRow> => {
        const res = await apiClient.post(`/inventory/articles/${articleId}/suppliers`, input);
        return res.data;
    },

    updateArticleSupplier: async (articleId: string, linkId: string, input: Partial<ArticleSupplierRow>): Promise<ArticleSupplierRow> => {
        const res = await apiClient.patch(`/inventory/articles/${articleId}/suppliers/${linkId}`, input);
        return res.data;
    },

    deleteArticleSupplier: async (articleId: string, linkId: string): Promise<void> => {
        await apiClient.delete(`/inventory/articles/${articleId}/suppliers/${linkId}`);
    },
};

// Tedarik Talepleri (Supply Requests) — yalnızca ilgili kayıtları çeker.
export const supplyApi = {
    // Minimum/kritik seviyeye düşen ürünler (eşiği tanımlı olanlar).
    lowStock: async (): Promise<LowStockResponse> => {
        const res = await apiClient.get('/inventory/supply/low-stock');
        return res.data;
    },

    // Bir ürünün daha önce alım yaptığı tedarikçiler + son alım özeti.
    // Yoldaki PRODUCT parçası eski API biçiminden kalan sabittir.
    itemSuppliers: async (id: string): Promise<ItemSuppliersResponse> => {
        const res = await apiClient.get(`/inventory/supply/item/PRODUCT/${id}/suppliers`);
        return res.data;
    },

    listRequests: async (status: SupplyRequestStatus = 'PENDING'): Promise<SupplyRequestRow[]> => {
        const res = await apiClient.get(`/inventory/supply/requests?status=${status}`);
        return res.data;
    },

    createRequest: async (input: CreateSupplyRequestInput): Promise<SupplyRequestRow & { emailPreview?: boolean }> => {
        const res = await apiClient.post('/inventory/supply/requests', input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    receiveRequest: async (id: string): Promise<SupplyRequestRow> => {
        const res = await apiClient.patch(`/inventory/supply/requests/${id}/receive`);
        return res.data;
    },

    deleteRequest: async (id: string): Promise<void> => {
        await apiClient.delete(`/inventory/supply/requests/${id}`);
    },
};

// Satın Alma Siparişleri (Purchase Orders) — tek sipariş = tek tedarikçi.
export const purchaseOrdersApi = {
    list: async (params: PurchaseOrderListQuery): Promise<PurchaseOrderListPage> => {
        const query = new URLSearchParams();
        query.set('page', String(params.page ?? 1));
        query.set('pageSize', String(params.pageSize ?? 20));
        if (params.search) query.set('search', params.search);
        if (params.status) query.set('status', params.status);
        if (params.kind) query.set('kind', params.kind);
        if (params.supplierId) query.set('supplierId', params.supplierId);
        if (params.reference) query.set('reference', params.reference);
        if (params.quote) query.set('quote', params.quote);
        if (params.project) query.set('project', params.project);
        if (params.supplier) query.set('supplier', params.supplier);
        if (params.dateFrom) query.set('dateFrom', params.dateFrom);
        if (params.dateTo) query.set('dateTo', params.dateTo);
        const res = await apiClient.get(`/inventory/purchase-orders?${query.toString()}`);
        return res.data;
    },

    get: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.get(`/inventory/purchase-orders/${id}`);
        return res.data;
    },

    // Çoklu tedarikçi seçiminde tedarikçi başına bir sipariş oluşur.
    create: async (orders: CreatePurchaseOrderInput[]): Promise<{ createdCount: number; orders: PurchaseOrderRow[] }> => {
        const res = await apiClient.post('/inventory/purchase-orders', { orders });
        return res.data;
    },

    // Ad değişikliği durumu etkilemez; mail sonrası içerik değişikliği yalnızca
    // revizyon numarasını artırır (durum geri alınmaz).
    update: async (id: string, patch: UpdatePurchaseOrderInput): Promise<PurchaseOrderRow> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/${id}`, patch);
        return res.data;
    },

    // Elle durum değişikliği — COMPLETED dışındaki durumlar arasında serbest
    // (COMPLETED yalnızca receive/mark-stocked ile yazılır).
    setStatus: async (id: string, status: Exclude<PurchaseOrderStatus, 'COMPLETED'>): Promise<PurchaseOrderRow> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/${id}/status`, { status });
        return res.data;
    },

    // Mal kabul: satırları stoğa aktarır (tek satır / seçili / complete=tamamı).
    // Stok hareketi + bakiye + siparişin receivedQuantity alanı tek istekte yazılır.
    receive: async (id: string, input: ReceivePurchaseOrderInput): Promise<ReceivePurchaseOrderResult> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/receive`, input);
        return res.data;
    },

    /**
     * WARENEINGANG LÖSCHEN — nimmt die Lagerbuchungen dieser Bestellung zurück
     * (Eingangsbewegungen + Partien werden gelöscht, der Bestand fällt wieder)
     * und stellt die Bestellung eine Stufe zurück auf die Bestellstufe.
     */
    revertReceive: async (id: string): Promise<{ revertedMovements: number; order: PurchaseOrderRow }> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/receive/revert`);
        return res.data;
    },

    /**
     * GERİ GÖNDER — «Stoğa gidenler» sekmesindeki tek satır (22.09.2026).
     * O satırın giriş hareketleri geri sarılır, bakiye düşer ve satır yeniden
     * mal kabul listesine çıkar. Son satır da geri gelince sipariş MAL
     * KABULDEN çıkar.
     */
    revertReceiveLine: async (id: string, index: number): Promise<{ revertedMovements: number; order: PurchaseOrderRow }> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/receive/revert-line`, { index });
        return res.data;
    },

    /**
     * FİYAT TALEBİNİ SİPARİŞE DÖNÜŞTÜR — talep LİSTEDE KALIR, sunucu YENİ bir
     * sipariş kaydı açar ve onu döner (22.09.2026: artık tek bir sürecin
     * aşama değişimi değil, iki ayrı kayıt).
     */
    convertToOrder: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/convert-to-order`);
        return res.data;
    },

    /**
     * SİPARİŞ → FİYAT TALEBİ (24.09.2026, «Fiyat talebi almak istiyorum»):
     * AYNI kayıt talebe döner; sipariş numarası saklı kalır ve talep yeniden
     * siparişe dönüştürülünce geri gelir.
     */
    convertToRequest: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/convert-to-request`);
        return res.data;
    },

    /**
     * ZUSAMMENFÜHREN (21.09.2026): die Vorgänge der NACHBARSTUFE, mit denen
     * sich dieser vereinen lässt — und das Vereinen selbst. Die Nummer DIESES
     * Vorgangs bleibt die gültige; der andere geht in ihm auf und verschwindet.
     */
    mergeCandidates: async (id: string, search?: string): Promise<{ stage: 1 | 2 | 3; orders: PurchaseOrderMergeCandidate[] }> => {
        const query = search ? `?search=${encodeURIComponent(search)}` : '';
        const res = await apiClient.get(`/inventory/purchase-orders/${id}/merge-candidates${query}`);
        return res.data;
    },

    merge: async (id: string, sourceId: string): Promise<PurchaseOrderRow & { mergedFrom: string }> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/merge`, { sourceId });
        return res.data;
    },

    sendMail: async (id: string, input: SendPurchaseOrderMailInput): Promise<SendPurchaseOrderMailResult> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/send-mail`, input, { timeout: MAIL_REQUEST_TIMEOUT_MS });
        return res.data;
    },

    /** «Mail manuell gesendet» — setzt oder entfernt das Häkchen (wirkt wie eine Sendung). */
    setMailManual: async (id: string, sent: boolean, recipient?: string | null): Promise<PurchaseOrderRow> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/mail-manual`, { sent, recipient: recipient ?? undefined });
        return res.data;
    },

    // ── Mail-Entwürfe je Auftrag (Mailfenster der Auftragsseite) ────────────
    listMailDrafts: async (id: string): Promise<PurchaseOrderMailDraft[]> => {
        const res = await apiClient.get(`/inventory/purchase-orders/${id}/mail-drafts`);
        return res.data;
    },

    createMailDraft: async (id: string, input: PurchaseOrderMailDraftInput): Promise<PurchaseOrderMailDraft> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/mail-drafts`, input);
        return res.data;
    },

    updateMailDraft: async (id: string, draftId: string, input: PurchaseOrderMailDraftInput): Promise<PurchaseOrderMailDraft> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/${id}/mail-drafts/${draftId}`, input);
        return res.data;
    },

    deleteMailDraft: async (id: string, draftId: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/${id}/mail-drafts/${draftId}`);
    },

    // Stok aktarımı tamamlandığında StockPage tarafından çağrılır.
    markStocked: async (id: string): Promise<PurchaseOrderRow> => {
        const res = await apiClient.post(`/inventory/purchase-orders/${id}/mark-stocked`);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/${id}`);
    },

    // ── Ön yazı (Anschreiben) taslakları — tenant geneli, SAYFALI ───────────
    // Detay penceresindeki "Taslaklar" listesi 15'erli sayfalar hâlinde gelir:
    // taslak sayısı büyüdükçe pencere tek seferde her şeyi çekmez.
    listTextTemplates: async (page = 1, pageSize = 15): Promise<PurchaseOrderTextTemplatePage> => {
        const res = await apiClient.get(`/inventory/purchase-orders/text-templates?page=${page}&pageSize=${pageSize}`);
        return res.data;
    },

    createTextTemplate: async (input: { title: string; content: string }): Promise<PurchaseOrderTextTemplate> => {
        const res = await apiClient.post('/inventory/purchase-orders/text-templates', input);
        return res.data;
    },

    updateTextTemplate: async (
        templateId: string,
        patch: { title?: string; content?: string },
    ): Promise<PurchaseOrderTextTemplate> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/text-templates/${templateId}`, patch);
        return res.data;
    },

    deleteTextTemplate: async (templateId: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/text-templates/${templateId}`);
    },

    // ── BELEG-IMPORT (07.09.2026) ──────────────────────────────────────────
    // Ein PDF/Foto/eine Tabelle wird auf dem SERVER in Text gewandelt und dort
    // einem Sprachmodell vorgelegt. Der Schlüssel bleibt dort — er darf nicht
    // im Browser-Bündel liegen.

    /** Steht die Erkennung? Wird VOR dem Hochladen gefragt. */
    aiStatus: async (): Promise<AiImportStatus> => {
        const res = await apiClient.get('/inventory/purchase-orders/ai-status');
        return res.data;
    },

    /**
     * Beleg lesen lassen. Das Zeitlimit ist grosszügig: ein mehrseitiger Beleg
     * läuft in Stücken durch das Modell, und jedes Stück braucht Sekunden.
     */
    aiExtract: async (input: AiExtractInput): Promise<AiExtractResponse> => {
        /* 290 s — knapp unter der Frist von Nginx (300 s) und deutlich ueber
           der des Servers (240 s), damit bei einem langen Beleg IMMER der
           Server zuerst antwortet und seine Meldung ankommt. 180 s reichten
           fuer eine dichte Aufnahme nicht: der Fortschritt blieb bei 92 %
           stehen und brach dann ohne Grund ab. */
        const res = await apiClient.post('/inventory/purchase-orders/ai-extract', input, { timeout: 290_000 });
        return res.data;
    },

    // ── Rechenvorlagen je Lieferant ────────────────────────────────────────
    listSupplierTemplates: async (
        supplierId?: string | null,
        documentType: PurchaseTemplateDocumentType = 'ORDER',
    ): Promise<SupplierOrderTemplate[]> => {
        const params = new URLSearchParams({ documentType });
        if (supplierId) params.set('supplierId', supplierId);
        const query = `?${params.toString()}`;
        const res = await apiClient.get(`/inventory/purchase-orders/supplier-templates${query}`);
        // STANDART ŞABLON seçili dilde (24.09.2026): adı ve sütun başlıkları.
        const lang = purchaseLangOf(i18n.resolvedLanguage || i18n.language);
        return ((res.data?.items ?? []) as SupplierOrderTemplate[]).map((item) => localizeStandardTemplate(item, lang));
    },

    createSupplierTemplate: async (input: {
        title: string;
        supplierId?: string | null;
        supplierName?: string;
        isDefault?: boolean;
        documentType: PurchaseTemplateDocumentType;
        config: SupplierCalcConfig;
    }): Promise<SupplierOrderTemplate> => {
        const res = await apiClient.post('/inventory/purchase-orders/supplier-templates', input);
        return res.data;
    },

    updateSupplierTemplate: async (
        templateId: string,
        patch: {
            title?: string;
            supplierId?: string | null;
            supplierName?: string;
            isDefault?: boolean;
            config?: SupplierCalcConfig;
            /** Nur mitzählen, dass die Vorlage angewendet wurde. */
            used?: boolean;
        },
    ): Promise<SupplierOrderTemplate> => {
        const res = await apiClient.patch(`/inventory/purchase-orders/supplier-templates/${templateId}`, patch);
        return res.data;
    },

    deleteSupplierTemplate: async (templateId: string): Promise<void> => {
        await apiClient.delete(`/inventory/purchase-orders/supplier-templates/${templateId}`);
    },
};

export const articleApi = {
    list: async (params?: {
        search?: string;
        category?: string;
        status?: string;
        onlyActive?: boolean;
        includeStock?: boolean;
    }): Promise<InventoryArticle[] | ArticleStockSummary[]> => {
        const search = new URLSearchParams();
        if (params?.search) search.set('search', params.search);
        if (params?.category) search.set('category', params.category);
        if (params?.status) search.set('status', params.status);
        if (params?.onlyActive) search.set('onlyActive', 'true');
        if (params?.includeStock) search.set('includeStock', 'true');
        const qs = search.toString();
        const res = await apiClient.get(`/articles${qs ? '?' + qs : ''}`);
        return res.data;
    },

    getById: async (id: string, options?: { includeImages?: boolean }): Promise<InventoryArticle> => {
        // includeImages: false skips the base64 image payload (megabytes) for
        // consumers that only need text/pricing fields (e.g. the tender picker).
        const query = options?.includeImages === false ? '?includeImages=false' : '';
        const res = await apiClient.get(`/articles/${id}${query}`);
        return res.data;
    },

    lookupByCode: async (code: string): Promise<InventoryArticle | null> => {
        try {
            const res = await apiClient.get(`/articles/lookup/${encodeURIComponent(code)}`);
            return res.data;
        } catch {
            return null;
        }
    },

    create: async (data: Partial<InventoryArticle>): Promise<InventoryArticle> => {
        const res = await apiClient.post('/articles', data);
        return res.data;
    },

    update: async (id: string, patch: Partial<InventoryArticle>): Promise<InventoryArticle> => {
        const res = await apiClient.patch(`/articles/${id}`, patch);
        return res.data;
    },

    /**
     * Produktkarte in den Papierkorb. Das Kennwort reist im Rumpf mit: jedes
     * Konto ausser der Administratorrolle bestätigt eine Löschung damit
     * (Vorgabe 17.08.2026, siehe `DangerConfirmDialog`). Der Server prüft die
     * Rolle selbst — hier steht nur, was das Fenster eingesammelt hat.
     */
    delete: async (id: string, password?: string): Promise<void> => {
        await apiClient.delete(`/articles/${id}`, { data: password ? { password } : {} });
    },

    /** Sammellöschung aus der Produktliste — ein Aufruf für die ganze Auswahl. */
    bulkDelete: async (ids: string[], password?: string): Promise<{ deleted: number; requested: number }> => {
        const res = await apiClient.post('/articles/bulk-delete', {
            ids,
            ...(password ? { password } : {}),
        });
        return res.data;
    },
};
