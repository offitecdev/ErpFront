import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, InfoCircle } from '@/components/icons/antIconCompat';
import { CircleXFill } from '@/components/icons/CircleXFill';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { Spinner } from '@/components/ui-shared/Loader';
// Die Einheit wird GEWAEHLT (Stueck, Meter, kg, Liter, Set, Packung ...) --
// die Liste pflegt der Mandant unter Einstellungen -> Module -> Lager.
import { UnitSelect } from '@/components/ui-shared/UnitSelect';
// Detay ekranıyla AYNI biçimli metin editörü — açıklama HTML olarak saklanır
// ve aynı PDF/görüntüleme hattından geçer.
import { RichTextMarkdownEditor } from '@/pages/sales/detail/components/RichTextMarkdownEditor';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { ARTICLE_CREATE_REQUEST_PARAM, postArticleCreateMessage } from '@/lib/articleCreateBridge';
import { companyRequiresArticleKindAndSupplier, useCurrentCompanyType } from '@/lib/companyType';
import { useAuthStore } from '@/store/authStore';
import type { ArticleDetail, ArticleKind } from '@/types/inventory';
import { ArticleImagePanel } from '../detail/ArticleImagePanel';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { focusFirstInvalid } from '../utils/formFocus';
import { parseNum } from '../utils/format';
import { FormRow, RequiredFieldsAlert } from './ArticleFormParts';
import { ArticleKindSegment } from './ArticleKindSegment';
import { SupplierMultiSelect, type SupplierPick } from './SupplierMultiSelect';
// Satır = alan dili sipariş sayfasından gelir (.ofi-ows-card > .ofi-ord-row).
import '@/styles/orderDetails.css';
import '@/styles/modules/orderWorkspace.css';
import '@/styles/articleForm.css';

interface SingleDraft {
    name: string;
    modelNumber: string;
    serialNumber: string;
    barcode: string;
    /** İlk seçilen tercih edilen tedarikçidir. */
    suppliers: SupplierPick[];
    kind: ArticleKind | null;
    unit: string;
    salePrice: string;
    purchasePrice: string;
    /** Başlangıç stoğu — varsayılan 0: ürün yalnızca tanımlanır. */
    quantity: string;
    description: string;
}

type RequiredField = 'name' | 'kind' | 'suppliers';

/** Sunucu detay gövdesini döndürmediyse teklif satırı formdakiyle bağlanır. */
const detailFromDraft = (created: { id: string; articleCode: string; name: string }, draft: SingleDraft): ArticleDetail => ({
    id: created.id,
    articleCode: created.articleCode,
    name: created.name,
    unit: draft.unit.trim(),
    salePrice: parseNum(draft.salePrice) ?? 0,
    itemType: draft.kind === 'SERVICE' ? 'SERVICE' : 'PRODUCT',
    articleKind: draft.kind,
    description: draft.description.trim() ? draft.description : null,
    imageVersion: '',
    totalQuantity: parseNum(draft.quantity) ?? 0,
});

/**
 * YENİ ÜRÜN — tekli ürün ekleme sayfası ("Ürün Ekle"); toplu tablo ayrı
 * sayfada yaşar (".../bulk-new").
 *
 * 23.09.2026 (Samet): ERP kodu alanı ŞİMDİLİK yok — sunucu geçici AA-BB
 * kodunu verir. Alanlar üç sütunda durur (alt alta tek uzun liste değil):
 * Ürün (ad, model, seri, barkod, tedarikçiler) · Tür ve fiyat · Görsel;
 * açıklama altta tam genişlikte. Zorunluluk şirket türüne bağlıdır: ürün adı
 * her zaman; Proje ve Satış şirketlerinde üçlü tür (Üretilecek / Satın Alınacak /
 * Ek Hizmet) ve en az bir tedarikçi de. Üretim şirketinde yalnızca ad.
 *
 * Teklif ekranındaki "Stoğa eklensin mi?" balonu bu sayfayı yeni sekmede
 * `?name=…&quoteRequest=…` ile açar: ad önceden dolar; kaydedince teklif
 * sekmesine `created` gider ve sekme kendini kapatır. Kaydetmeden kapanırsa
 * (sekme kapandı, X'e basıldı, başka sayfaya geçildi) `cancelled` gider ve
 * teklif sekmesindeki balon yeniden sorar.
 */
export const ArticleSingleCreateView = ({
    copyPrefix,
    detailRoot,
}: {
    /** 'inv.newProduct' — metin yaprağı. */
    copyPrefix: string;
    /** Kayıt sonrası açılacak detay kökü ('/inventory/articles'). */
    detailRoot: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const quoteRequestId = searchParams.get(ARTICLE_CREATE_REQUEST_PARAM);

    const companyType = useCurrentCompanyType();
    // Sunucu da aynı kuralı sorar; bu sekmede şirket türü eski kaldıysa
    // (başka sekmede değişti) cevabı buraya taşınır.
    const [serverStrict, setServerStrict] = useState(false);
    const strict = companyRequiresArticleKindAndSupplier(companyType) || serverStrict;

    const [draft, setDraft] = useState<SingleDraft>(() => ({
        name: searchParams.get('name')?.trim() ?? '',
        modelNumber: '',
        serialNumber: '',
        barcode: '',
        suppliers: [],
        kind: null,
        unit: '',
        salePrice: '',
        purchasePrice: '',
        quantity: '0',
        description: '',
    }));
    // Görsel panelinin bekleyen-seçim sözleşmesi: undefined = dokunulmadı.
    const [image, setImage] = useState<string | null | undefined>(undefined);
    const [saving, setSaving] = useState(false);
    // Uyarı ilk kaydetme denemesinden sonra görünür, sonra canlı güncellenir:
    // alanlar doldukça kısalır, hepsi dolunca kaybolur.
    const [showErrors, setShowErrors] = useState(false);
    const formRef = useRef<HTMLDivElement>(null);

    const edit = (patch: Partial<SingleDraft>) => setDraft((current) => ({ ...current, ...patch }));

    const nameLabel = t('inv.columns.productName');
    const kindLabel = t(`${copyPrefix}.kind`);
    const supplierLabel = t('inv.columns.supplier');
    const missing: Record<RequiredField, boolean> = {
        name: !draft.name.trim(),
        kind: strict && !draft.kind,
        suppliers: strict && draft.suppliers.length === 0,
    };
    const missingLabels = [
        missing.name && nameLabel,
        missing.kind && kindLabel,
        missing.suppliers && supplierLabel,
    ].filter((label): label is string => Boolean(label));
    const invalid = (field: RequiredField) => showErrors && missing[field];

    /* TEKLİFE CEVAP. Teklif sekmesi tek bir cevap bekler: `created` ya da
       `cancelled`. Verildiyse (kayıt ya da X) sayfa kapanırken ikincisi
       gitmez. Kaydedilmeden kapanan sekme `pagehide` ile, SPA içinde başka
       sayfaya geçiş sökümle `cancelled` yollar. StrictMode bağlar-söker-
       bağlar: söküm kararı bir tur sonra, yeniden bağlanmadıysa verilir. */
    const answeredRef = useRef(false);
    const mountedRef = useRef(false);
    useEffect(() => {
        if (!quoteRequestId) return undefined;
        mountedRef.current = true;
        const cancel = () => {
            if (answeredRef.current) return;
            answeredRef.current = true;
            postArticleCreateMessage({ type: 'cancelled', requestId: quoteRequestId });
        };
        window.addEventListener('pagehide', cancel);
        return () => {
            mountedRef.current = false;
            window.removeEventListener('pagehide', cancel);
            window.setTimeout(() => { if (!mountedRef.current) cancel(); }, 0);
        };
    }, [quoteRequestId]);

    /** Sekme kendini kapatır; kapatılamıyorsa (elle açılmış sekme) `fallback` açılır. */
    const leaveTab = (fallback: string) => {
        window.close();
        window.setTimeout(() => navigate(fallback), 150);
    };

    const closeToQuote = () => {
        if (!quoteRequestId) return;
        answeredRef.current = true;
        postArticleCreateMessage({ type: 'cancelled', requestId: quoteRequestId });
        leaveTab(detailRoot);
    };

    const save = async () => {
        if (saving) return;
        if (missingLabels.length) {
            setShowErrors(true);
            toast.error(t(`${copyPrefix}.missingFields`, { fields: missingLabels.join(', ') }));
            focusFirstInvalid(formRef.current);
            return;
        }

        const name = draft.name.trim();
        setSaving(true);
        try {
            const result = await inventoryApi.createSingleArticle({
                name,
                articleKind: draft.kind,
                suppliers: draft.suppliers.map((pick) => (pick.supplierId
                    ? { supplierId: pick.supplierId }
                    : { supplierName: pick.name })),
                modelNumber: draft.modelNumber.trim() || null,
                serialNumber: draft.serialNumber.trim() || null,
                barcode: draft.barcode.trim() || null,
                unit: draft.unit.trim() || null,
                salePrice: parseNum(draft.salePrice) ?? 0,
                purchasePrice: parseNum(draft.purchasePrice) ?? 0,
                quantity: parseNum(draft.quantity) ?? 0,
                description: draft.description.trim() ? draft.description : null,
                ...(typeof image === 'string' ? { imageUrl: image } : {}),
            });
            const rowError = result.errors?.[0];
            const created = result.created?.[0];
            if (rowError || !created) {
                toast.error(rowError?.code === 'SERIAL_TAKEN' ? t('inv.detail.serialTaken') : (rowError?.error || t(`${copyPrefix}.saveFailed`)));
                return;
            }
            toast.success(t(`${copyPrefix}.saved`, { name }));
            if (quoteRequestId) {
                answeredRef.current = true;
                postArticleCreateMessage({
                    type: 'created',
                    requestId: quoteRequestId,
                    tenantId: useAuthStore.getState().selectedTenantId,
                    article: result.article ?? detailFromDraft(created, draft),
                });
                leaveTab(`${detailRoot}/${created.id}`);
                return;
            }
            navigate(`${detailRoot}/${created.id}`);
        } catch (error: unknown) {
            const body = (error as { response?: { data?: { error?: string; code?: string } } })?.response?.data;
            if (body?.code === 'KIND_REQUIRED' || body?.code === 'SUPPLIER_REQUIRED') {
                setServerStrict(true);
                setShowErrors(true);
            }
            toast.error(body?.error || t(`${copyPrefix}.saveFailed`));
        } finally {
            setSaving(false);
        }
    };

    const textField = (key: 'name' | 'modelNumber' | 'serialNumber' | 'barcode' | 'salePrice' | 'purchasePrice' | 'quantity') => ({
        id: `article-new-${key}`,
        value: draft[key],
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => edit({ [key]: event.target.value }),
        autoComplete: 'off',
    });

    return (
        <div ref={formRef} className="ofi-ows ofi-article-form flex w-full flex-col gap-3">
            <InventoryListHeader
                title={draft.name.trim() || t(`${copyPrefix}.title`)}
                action={(
                    <div className="flex items-center gap-2">
                        {quoteRequestId && (
                            <button
                                type="button"
                                onClick={closeToQuote}
                                aria-label={t(`${copyPrefix}.closeToQuote`)}
                                title={t(`${copyPrefix}.closeToQuote`)}
                                className="ofi-nosize ofi-article-form__close"
                            >
                                <CircleXFill size={20} />
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={saving || !canCreate}
                            title={canCreate ? undefined : t(`${copyPrefix}.noPermission`)}
                            onClick={() => void save()}
                            className="flex items-center gap-1.5 rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                            {saving ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                            {t('common.save')}
                        </button>
                    </div>
                )}
            />

            {quoteRequestId && (
                <p className="ofi-article-form__note">
                    <InfoCircle size={15} aria-hidden />
                    {t(`${copyPrefix}.fromQuote`)}
                </p>
            )}

            {showErrors && <RequiredFieldsAlert missing={missingLabels} />}

            <div className="ofi-article-form__grid">
                {/* 1 — Ürün: tedarikçi barkodun hemen altında (Samet). */}
                <section className="ofi-ows-card">
                    <h3>{t(`${copyPrefix}.sectionProduct`)}</h3>
                    <div className="ofi-ord-group">
                        <FormRow label={nameLabel} htmlFor="article-new-name" required invalid={invalid('name')}>
                            <input
                                {...textField('name')}
                                autoFocus={!draft.name}
                                placeholder={nameLabel}
                                aria-required="true"
                                aria-invalid={invalid('name') || undefined}
                            />
                        </FormRow>
                        <FormRow label={t('inv.columns.modelNumber')} htmlFor="article-new-modelNumber">
                            <input {...textField('modelNumber')} className="is-mono font-mono" />
                        </FormRow>
                        <FormRow label={t('inv.columns.serialNumber')} htmlFor="article-new-serialNumber">
                            <input {...textField('serialNumber')} className="is-mono font-mono" />
                        </FormRow>
                        <FormRow label={t('inv.columns.barcode')} htmlFor="article-new-barcode">
                            <input {...textField('barcode')} className="is-mono font-mono" placeholder={t('inv.detail.barcodeSupplier')} />
                        </FormRow>
                        <FormRow label={supplierLabel} required={strict} invalid={invalid('suppliers')}>
                            <SupplierMultiSelect
                                value={draft.suppliers}
                                onChange={(suppliers) => edit({ suppliers })}
                                single
                                invalid={invalid('suppliers')}
                                ariaLabel={supplierLabel}
                            />
                        </FormRow>
                    </div>
                </section>

                {/* 2 — Tür ve fiyat: üçlü segment en üstte. */}
                <section className="ofi-ows-card">
                    <h3>{t(`${copyPrefix}.sectionType`)}</h3>
                    <div className="ofi-ord-group">
                        <FormRow label={kindLabel} required={strict} invalid={invalid('kind')}>
                            <ArticleKindSegment
                                value={draft.kind}
                                onChange={(kind) => edit({ kind })}
                                invalid={invalid('kind')}
                                allowClear={!strict}
                            />
                        </FormRow>
                        <FormRow label={t('inv.columns.unit')}>
                            <UnitSelect
                                value={draft.unit}
                                onChange={(unit) => edit({ unit })}
                                ariaLabel={t('inv.columns.unit')}
                                className="min-w-0 flex-1"
                            />
                        </FormRow>
                        <FormRow label={t('inv.columns.salePrice')} htmlFor="article-new-salePrice">
                            <input {...textField('salePrice')} inputMode="decimal" className="is-num" placeholder="0.00" />
                        </FormRow>
                        <FormRow label={t('inv.columns.purchasePrice')} htmlFor="article-new-purchasePrice">
                            <input {...textField('purchasePrice')} inputMode="decimal" className="is-num" placeholder="0.00" />
                        </FormRow>
                        <FormRow label={t(`${copyPrefix}.initialStock`)} htmlFor="article-new-quantity">
                            <input {...textField('quantity')} inputMode="decimal" className="is-num" placeholder="0" />
                        </FormRow>
                    </div>
                </section>

                {/* 3 — Görsel. Oluşturma kipi: kayıtlı görsel yok, panel seçimi bekletir. */}
                <ArticleImagePanel
                    canUpdate={canCreate}
                    articleId={null}
                    imageVersion=""
                    pending={image}
                    onPick={setImage}
                />
            </div>

            <section className="ofi-ows-card">
                <h3>{t('inv.columns.description')}</h3>
                <RichTextMarkdownEditor
                    value={draft.description}
                    onChange={(next) => edit({ description: next })}
                    minHeight={96}
                    placeholder={t('inv.detail.descriptionPlaceholder')}
                    className="w-full"
                />
            </section>
        </div>
    );
};
