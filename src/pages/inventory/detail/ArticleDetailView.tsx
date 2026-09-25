import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { Building02, CheckCircle, List, Plus, QrCode01 as QrCode, SwitchHorizontal01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { Spinner } from '@/components/ui-shared/Loader';
import { SlidingTopTabs } from '@/components/ui-shared/SlidingTopTabs';
// Die Einheit wird GEWAEHLT (Stueck, Meter, kg, Liter, Set, Packung ...) --
// die Liste pflegt der Mandant unter Einstellungen -> Module -> Lager.
import { UnitSelect } from '@/components/ui-shared/UnitSelect';
// Uygulamanın TEK biçimli metin editörü — teklif açıklamalarıyla aynı bileşen.
// Kalın/italik ve "- " + boşluk → madde kısayolu (madde satır başında Backspace
// ile geri sökülür) burada zaten çözülmüş durumda; ürün açıklaması da HTML
// olarak saklandığı için aynı PDF/görüntüleme hattından geçer.
import { RichTextMarkdownEditor } from '@/pages/sales/detail/components/RichTextMarkdownEditor';
import { richTextToHtml } from '@/pages/sales/detail/utils/markdown.utils';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { companyRequiresArticleKindAndSupplier, useCurrentCompanyType } from '@/lib/companyType';
import { useAuthStore } from '@/store/authStore';
import { FormRow, RequiredFieldsAlert } from '../components/ArticleFormParts';
import { ArticleKindSegment } from '../components/ArticleKindSegment';
import { StockInPopup, type StockInArticle } from '../components/StockInPopup';
import { SupplierMultiSelect } from '../components/SupplierMultiSelect';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { articleKindLabel } from '../utils/articleKind';
import { focusFirstInvalid } from '../utils/formFocus';
import { fmtMoney, fmtQty, fmtUnitCost } from '../utils/format';
import { ArticleImagePanel } from './ArticleImagePanel';
import { buildDetailPatch, draftFromDetail, kindOfDetail, type DetailDraft } from './detailPatch';
import { ArticleMovementsView } from './ArticleMovementsView';
import { ArticleSuppliersView } from './ArticleSuppliersView';
import { useArticleDetail } from './useArticleDetail';
// Yeni ürün sayfasıyla AYNI form dili (satır = alan, üç sütun).
import '@/styles/orderDetails.css';
import '@/styles/modules/orderWorkspace.css';
import '@/styles/articleForm.css';

const errorBody = (error: unknown) =>
    (error as { response?: { data?: { error?: string; code?: string } } })?.response?.data;

type TextKey = 'name' | 'modelNumber' | 'serialNumber' | 'supplierBarcode' | 'salePrice';

/**
 * Ürün / malzeme detayı — listeden bir satıra tıklayınca (ve yeni ürün
 * kaydedilince) açılan tam sayfa.
 *
 * 23.09.2026 (Samet): «ürün detay ekranı da aynı şekilde olması lazım» — yeni
 * ürün sayfasıyla AYNI üç sütun: Ürün (ad, model, seri, barkod, tedarikçiler)
 * · Tür ve fiyat (tür, birim, satış fiyatı, stok ve maliyet) · Görsel;
 * açıklama altta. ERP kodu alanı burada da şimdilik yok. Zorunluluk da
 * aynıdır: ürün adı her zaman; proje ve satış şirketlerinde tür ve en az bir
 * tedarikçi. Eksik kalınca kaydetme reddedilir ve formun üstünde eksikler
 * adıyla sayılır.
 *
 * Veri disiplini: sayfa açılırken YALNIZCA başlık çekilir
 * (`/articles/:id/detail`, tedarikçi adlarıyla birlikte). Hareket geçmişi ve
 * tedarikçi maliyetleri kendi SEKMESİNE geçildiğinde kendi ucundan yüklenir.
 * Görsel de ayrı uçtan gelir (base64 blob başlık isteğine binmesin).
 *
 * Kaydetme: alanlar, tedarikçiler, açıklama ve görsel TEK "Kaydet" düğmesiyle,
 * TEK istekte (`PATCH /articles/:id/detail`) gider — yalnızca DEĞİŞENLER.
 */
export const ArticleDetailView = ({ copyPrefix }: {
    /** 'inv.products'. */
    copyPrefix: string;
}) => {
    useLanguageTick();
    const { id } = useParams<{ id: string }>();
    const { detail, setDetail, loading, error } = useArticleDetail(id);

    const permissions = useAuthStore((state) => state.permissions);
    const canUpdate = permissions.includes('inventory.articles.update');
    const canTransfer = permissions.includes('inventory.transfer');

    // Proje/satış şirketinde tür ve tedarikçi zorunludur. Sunucu da sorar;
    // bu sekmede şirket türü eski kaldıysa cevabı buraya taşınır.
    const companyType = useCurrentCompanyType();
    const [serverStrict, setServerStrict] = useState(false);
    const strict = companyRequiresArticleKindAndSupplier(companyType) || serverStrict;

    /* ZUGANG BUCHEN (11.09.2026, Samet): dasselbe Plus wie in der Liste, hier
       im Kopf. Nach der Buchung springt der Bestand im Detail nach, und die
       Bewegungsliste (falls offen) wird neu aufgesetzt. */
    const [stockIn, setStockIn] = useState<StockInArticle | null>(null);
    const [movementsTick, setMovementsTick] = useState(0);
    const onStockBooked = (_article: StockInArticle, quantity: number) => {
        setDetail((current) => current ? { ...current, totalQuantity: current.totalQuantity + quantity } : current);
        setMovementsTick((tick) => tick + 1);
    };

    // Detay / hareketler / tedarikçiler artık SEKMELERDİR (kullanıcı isteği —
    // popup ve ayrı görünüm yerine alt menü). Sekme panelleri yalnızca aktifken
    // monte edilir, veri disiplini aynı kalır: hareketler ve tedarikçiler kendi
    // ucundan, ancak sekmeye geçilince yüklenir.
    const [tab, setTab] = useState<'detail' | 'movements' | 'suppliers'>('detail');
    const [saving, setSaving] = useState(false);
    /* «Barcode erzeugen» (10.09.2026): ein Systembarcode für Artikel ohne
       Barcode — nur auf Knopfdruck, nie automatisch. Der Server schreibt ihn
       sofort; die anderen Feldänderungen bleiben unberührt im Entwurf. */
    const [generating, setGenerating] = useState(false);

    // Taslak sunucudaki kayıttan TÜRETİLİR; kullanıcı bir alana dokunduğunda
    // üzerine yazan bir kopya tutulur. Efektle senkronlamak yerine türetmek,
    // kaydetme sonrası tazelemeyi (setEdited(null)) tek satıra indirir.
    const baseline = useMemo<DetailDraft | null>(() => (detail ? draftFromDetail(detail) : null), [detail]);

    // Ürün kimliğiyle birlikte tutulur: kaydetmeden başka bir ürüne geçilirse
    // önceki taslak yeni ürüne sızmaz.
    const [edited, setEdited] = useState<{ articleId: string; draft: DetailDraft } | null>(null);
    const draft = edited && edited.articleId === detail?.id ? edited.draft : baseline;

    // Kayıtlı görsel ayrı binary uçtan gelir. Bekleyen seçim:
    // undefined = değişmedi, string = yeni görsel, null = kaldırıldı.
    const [pendingImage, setPendingImage] = useState<string | null | undefined>(undefined);

    // Zorunlu alan uyarısı ilk kaydetme denemesinden sonra görünür — ürün
    // başına; başka ürüne geçince kaybolur.
    const [errorsFor, setErrorsFor] = useState<string | null>(null);
    const showErrors = Boolean(detail && errorsFor === detail.id);
    const formRef = useRef<HTMLDivElement>(null);

    const editDraft = (patchDraft: Partial<DetailDraft>) => {
        if (!detail || !draft) return;
        setEdited({ articleId: detail.id, draft: { ...draft, ...patchDraft } });
    };

    const nameLabel = t('inv.columns.productName');
    const kindLabel = t('inv.newProduct.kind');
    const supplierLabel = t('inv.columns.supplier');

    const missing = {
        name: Boolean(draft && !draft.name.trim()),
        kind: Boolean(draft && strict && !draft.articleKind),
        suppliers: Boolean(draft && strict && !draft.suppliers.length),
    };
    const missingLabels = [
        missing.name && nameLabel,
        missing.kind && kindLabel,
        missing.suppliers && supplierLabel,
    ].filter((label): label is string => Boolean(label));
    const invalid = (field: keyof typeof missing) => showErrors && missing[field];

    /** Yalnızca DEĞİŞEN alanlar — hiçbiri değişmediyse `null` (düğme pasif). */
    const patch = useMemo(
        () => (detail && draft ? buildDetailPatch(detail, draft, pendingImage) : null),
        [detail, draft, pendingImage],
    );

    const dirty = patch !== null;

    const save = async () => {
        if (!id || !patch || !detail) return;
        if (missingLabels.length) {
            setErrorsFor(detail.id);
            toast.error(t('inv.newProduct.missingFields', { fields: missingLabels.join(', ') }));
            focusFirstInvalid(formRef.current);
            return;
        }
        setSaving(true);
        try {
            const updated = await inventoryApi.saveArticleDetail(id, patch);
            // Ekran yanıttan tazelenir: sunucu açıklamayı kendi beyaz listesinden
            // geçirdiği için gösterilen değer kaydedilenle birebir aynı olur.
            // İstatistikler ayrı uçtan geldiği için hızlı PATCH yanıtındaki ana
            // alanları mevcut hesaplanmış değerlerin üzerine birleştir.
            setDetail((current) => current
                // Tek tedarikçi (24.09.2026): sekmedeki sayı alım geçmişini de
                // sayar, yanıttaki tek kayıtla ezilmez.
                ? { ...current, ...updated }
                : updated);
            setEdited(null);
            setPendingImage(undefined);
            setErrorsFor(null);
            toast.success(t('inv.detail.saved'));
        } catch (err) {
            const body = errorBody(err);
            if (body?.code === 'KIND_REQUIRED' || body?.code === 'SUPPLIER_REQUIRED') {
                setServerStrict(true);
                setErrorsFor(detail.id);
            }
            toast.error(body?.error || t('inv.detail.saveFailed'));
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setEdited(null);
        setPendingImage(undefined);
        setErrorsFor(null);
    };

    const generateBarcode = async () => {
        if (!id) return;
        setGenerating(true);
        try {
            const updated = await inventoryApi.generateBarcode(id);
            setDetail((current) => current ? { ...current, ...updated } : updated);
            toast.success(t('inv.detail.barcodeGenerated', { code: updated.systemBarcode ?? '' }));
        } catch (err) {
            toast.error(errorBody(err)?.error || t('inv.detail.barcodeGenerateFailed'));
        } finally {
            setGenerating(false);
        }
    };

    const textField = (key: TextKey) => ({
        id: `article-detail-${key}`,
        value: draft?.[key] ?? '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => editDraft({ [key]: event.target.value }),
        autoComplete: 'off',
    });

    /** Yetkisi olmayan kullanıcı için değer: satırın alanı gibi hizalı düz metin. */
    const readValue = (value: React.ReactNode, mono = false) => (
        <span className={`ofi-article-form__value${mono ? ' font-mono' : ''}`}>{value || '—'}</span>
    );

    const shownKind = detail ? kindOfDetail(detail) : null;

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                /* Der Pfeil vor dem Titel ist weg: der Rückweg in die
                   Produktliste sitzt oben links in der Marke. */
                title={detail?.name || t(`${copyPrefix}.detailTitle`)}
                action={detail && (canTransfer || (canUpdate && tab === 'detail')) && (
                    // ORTAK kaydet: alanlar + açıklama + görsel tek istekte gider.
                    <div className="flex items-center gap-2">
                        {canTransfer && detail.itemType !== 'SERVICE' && (
                            <button
                                type="button"
                                onClick={() => setStockIn(detail)}
                                className="flex items-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-2 text-[12.5px] font-semibold text-slate-600 transition-colors hover:border-[#0066e0] hover:text-[#0066e0] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                            >
                                <Plus size={14} />
                                {t('inv.stockIn.title')}
                            </button>
                        )}
                        {canUpdate && tab === 'detail' && dirty && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={reset}
                                className="text-[12.5px] text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-40 dark:text-white/60 dark:hover:text-white"
                            >
                                {t('common.cancel')}
                            </button>
                        )}
                        {canUpdate && tab === 'detail' && (
                            <button
                                type="button"
                                disabled={!dirty || saving}
                                onClick={() => void save()}
                                className="flex items-center gap-1.5 rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:opacity-40"
                            >
                                {saving ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                                {t('common.save')}
                            </button>
                        )}
                    </div>
                )}
            />
            <StockInPopup article={stockIn} onClose={() => setStockIn(null)} onBooked={onStockBooked} />

            {/* Alt menü: detay / hareketler / tedarikçiler — teklif çalışma
                alanındaki sekme şeridiyle aynı dil (ofi-quote-tab*). */}
            {detail && (
                <nav
                    aria-label={t(`${copyPrefix}.detailTitle`)}
                    className="ofi-quote-tabs-strip min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 md:overflow-visible dark:border-white/15"
                >
                    <SlidingTopTabs activeKey={tab} className="flex min-w-max items-stretch gap-1">
                        {([
                            { key: 'detail' as const, label: t(`${copyPrefix}.detailTitle`), icon: <List size={15} /> },
                            { key: 'movements' as const, label: t('inv.detail.movementsTitle'), icon: <SwitchHorizontal01 size={15} /> },
                            { key: 'suppliers' as const, label: t('inv.detail.suppliersButton', { count: detail.supplierCount ?? '…' }), icon: <Building02 size={15} /> },
                        ]).map((item) => {
                            const active = tab === item.key;
                            return (
                                <button
                                    key={item.key}
                                    type="button"
                                    data-tab-key={item.key}
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => setTab(item.key)}
                                    className={`ofi-quote-tab -mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${
                                        active
                                            ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#0066e0]'
                                            : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#0066e0] dark:text-white/70'
                                    }`}
                                >
                                    {item.icon}
                                    <span>{item.label}</span>
                                </button>
                            );
                        })}
                    </SlidingTopTabs>
                </nav>
            )}

            {tab === 'movements' && detail ? (
                <ArticleMovementsView key={movementsTick} articleId={detail.id} unit={detail.unit} />
            ) : tab === 'suppliers' && detail ? (
                <ArticleSuppliersView articleId={detail.id} unit={detail.unit} />
            ) : (loading || !detail || !draft) ? (
                <div className="ofi-ows ofi-article-form">
                    <section className="ofi-ows-card">
                        <div className="flex min-h-40 items-center justify-center text-[12.5px] text-slate-500 dark:text-white/60">
                            {loading ? <Spinner size="sm" /> : (error || t('inv.detail.notFound'))}
                        </div>
                    </section>
                </div>
            ) : (
                <div ref={formRef} className="ofi-ows ofi-article-form flex flex-col gap-3">
                    {showErrors && <RequiredFieldsAlert missing={missingLabels} />}

                    <div className="ofi-article-form__grid">
                        {/* 1 — Ürün: tedarikçi barkodun hemen altında (Samet). */}
                        <section className="ofi-ows-card">
                            <h3>{t('inv.newProduct.sectionProduct')}</h3>
                            <div className="ofi-ord-group">
                                <FormRow label={nameLabel} htmlFor="article-detail-name" required={canUpdate} invalid={invalid('name')}>
                                    {canUpdate
                                        ? <input {...textField('name')} placeholder={nameLabel} aria-required="true" aria-invalid={invalid('name') || undefined} />
                                        : readValue(detail.name)}
                                </FormRow>
                                {/* Reihenfolge (10.09.2026): Bezeichnung, Modellnummer,
                                    Seriennummer, Barcode. Modell = die Rolle des alten
                                    Produktcodes (zehn Geräte, eine Modellnummer); die
                                    Serie ist je Gerät eindeutig. */}
                                <FormRow label={t('inv.columns.modelNumber')} htmlFor="article-detail-modelNumber">
                                    {canUpdate
                                        ? <input {...textField('modelNumber')} className="is-mono font-mono" />
                                        : readValue(detail.modelNumber, true)}
                                </FormRow>
                                <FormRow label={t('inv.columns.serialNumber')} htmlFor="article-detail-serialNumber">
                                    {canUpdate
                                        ? <input {...textField('serialNumber')} className="is-mono font-mono" />
                                        : readValue(detail.serialNumber, true)}
                                </FormRow>
                                <FormRow label={t('inv.columns.barcode')} htmlFor="article-detail-supplierBarcode">
                                    {canUpdate
                                        ? <input {...textField('supplierBarcode')} className="is-mono font-mono" placeholder={t('inv.detail.barcodeSupplier')} />
                                        : readValue(detail.supplierBarcode, true)}
                                </FormRow>
                                <FormRow label={supplierLabel} required={canUpdate && strict} invalid={invalid('suppliers')}>
                                    <SupplierMultiSelect
                                        id="article-detail-suppliers"
                                        value={draft.suppliers}
                                        onChange={(suppliers) => editDraft({ suppliers })}
                                        single
                                        disabled={!canUpdate}
                                        invalid={invalid('suppliers')}
                                        ariaLabel={supplierLabel}
                                    />
                                </FormRow>
                                {/* Systembarcode: nur auf Knopfdruck, nie automatisch. */}
                                <FormRow label={t('inv.detail.barcodeSystem')}>
                                    {detail.systemBarcode ? (
                                        <span className="ofi-article-form__value inline-flex items-center gap-1.5 font-mono">
                                            <QrCode size={13} aria-hidden />
                                            {detail.systemBarcode}
                                        </span>
                                    ) : canUpdate ? (
                                        <div className="ofi-article-form__value">
                                            <button
                                                type="button"
                                                disabled={generating}
                                                onClick={() => void generateBarcode()}
                                                className="inline-flex h-7 items-center gap-1.5 rounded-md border border-slate-300 px-2.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#0066e0] hover:text-[#0066e0] disabled:opacity-40 dark:border-white/20 dark:text-white/70"
                                            >
                                                {generating ? <Spinner size="sm" /> : <QrCode size={13} aria-hidden />}
                                                {t('inv.detail.barcodeGenerate')}
                                            </button>
                                        </div>
                                    ) : readValue(t('inv.detail.barcodeNone'))}
                                </FormRow>
                            </div>
                        </section>

                        {/* 2 — Tür ve fiyat. Stok, ortalama maliyet ve açık sipariş
                            TÜRETİLMİŞ değerlerdir — hareketlerden gelir, elle
                            düzenlenmez. Siparişi olmayan ürün 0 gösterir. */}
                        <section className="ofi-ows-card">
                            <h3>{t('inv.newProduct.sectionType')}</h3>
                            <div className="ofi-ord-group">
                                <FormRow label={kindLabel} required={canUpdate && strict} invalid={invalid('kind')}>
                                    {canUpdate ? (
                                        <ArticleKindSegment
                                            value={draft.articleKind}
                                            onChange={(articleKind) => editDraft({ articleKind })}
                                            invalid={invalid('kind')}
                                            allowClear={!strict}
                                        />
                                    ) : readValue(shownKind ? articleKindLabel(shownKind) : t('inv.detail.kindProduct'))}
                                </FormRow>
                                <FormRow label={t('inv.columns.unit')}>
                                    {canUpdate ? (
                                        <UnitSelect
                                            value={draft.unit}
                                            onChange={(next) => editDraft({ unit: next })}
                                            ariaLabel={t('inv.columns.unit')}
                                            className="min-w-0 flex-1"
                                        />
                                    ) : readValue(detail.unit)}
                                </FormRow>
                                <FormRow label={t('inv.columns.salePrice')} htmlFor="article-detail-salePrice">
                                    {canUpdate
                                        ? <input {...textField('salePrice')} inputMode="decimal" className="is-num" />
                                        : readValue(fmtMoney(detail.salePrice))}
                                </FormRow>
                                <FormRow label={t('inv.detail.warehouseStock')}>
                                    {readValue(`${fmtQty(detail.totalQuantity)} ${detail.unit}`)}
                                </FormRow>
                                <FormRow label={t('inv.detail.averageUnitCost')}>
                                    {readValue(detail.averageUnitCost === undefined ? '—' : fmtUnitCost(detail.averageUnitCost))}
                                </FormRow>
                                <FormRow label={t('inv.detail.openOrderQuantity')}>
                                    {readValue(detail.openOrderQuantity === undefined
                                        ? '—'
                                        : `${fmtQty(detail.openOrderQuantity)} ${detail.unit}`)}
                                </FormRow>
                            </div>
                        </section>

                        {/* 3 — Görsel: depodaki kalıcı adresinden gelir (eski
                            kayıtlarda binary uçtan). Seçim burada yalnızca
                            BEKLETİLİR, yazma ortak Kaydet ile olur. */}
                        <ArticleImagePanel
                            canUpdate={canUpdate}
                            articleId={detail.id}
                            imageUrl={detail.imageUrl}
                            imageVersion={detail.imageVersion}
                            pending={pendingImage}
                            onPick={setPendingImage}
                        />
                    </div>

                    <section className="ofi-ows-card">
                        <h3>{t('inv.columns.description')}</h3>
                        {canUpdate ? (
                            <RichTextMarkdownEditor
                                value={draft.description}
                                onChange={(next) => editDraft({ description: next })}
                                minHeight={96}
                                placeholder={t('inv.detail.descriptionPlaceholder')}
                                className="w-full"
                            />
                        ) : (
                            // Yetkisi olmayan kullanıcı düzenleyemez; eski düz metin
                            // kayıtları da aynı dönüştürücüden geçip biçimli görünür.
                            <div
                                className="ofi-rich-text text-[13px] leading-6 text-slate-800 dark:text-white"
                                dangerouslySetInnerHTML={{ __html: richTextToHtml(detail.description ?? '') }}
                            />
                        )}
                    </section>
                </div>
            )}
        </div>
    );
};
