import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { ArrowLeft, Building02, CheckCircle, SwitchHorizontal01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { Spinner } from '@/components/ui-shared/Loader';
// Uygulamanın TEK biçimli metin editörü — teklif açıklamalarıyla aynı bileşen.
// Kalın/italik ve "- " + boşluk → madde kısayolu (madde satır başında Backspace
// ile geri sökülür) burada zaten çözülmüş durumda; ürün açıklaması da HTML
// olarak saklandığı için aynı PDF/görüntüleme hattından geçer.
import { RichTextMarkdownEditor } from '@/pages/tender/detail/components/RichTextMarkdownEditor';
import { richTextToHtml } from '@/pages/tender/detail/utils/markdown.utils';
import { t } from '@/i18n/translate';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ItemType } from '@/types/inventory';
import { CELL_INPUT_CLASS, SectionCard, TableStateRow } from '../components/primitives';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { fmtMoney, fmtQty, fmtUnitCost } from '../utils/format';
import { ArticleImagePanel } from './ArticleImagePanel';
import { buildDetailPatch, draftFromDetail, type DetailDraft } from './detailPatch';
import { ArticleMovementsView } from './ArticleMovementsView';
import { ArticleSuppliersSheet } from './ArticleSuppliersSheet';
import { useArticleDetail } from './useArticleDetail';

/** Etiket/değer satırı — detay tablosunun tek satırı. */
const Row = ({ label, children, mono = false }: { label: string; children: React.ReactNode; mono?: boolean }) => (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
        <th scope="row" className="w-56 text-left align-top text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
            {label}
        </th>
        <td className={`text-slate-800 dark:text-white ${mono ? 'font-mono text-[13px]' : ''}`}>{children}</td>
    </tr>
);

const errorMessage = (error: unknown, fallback: string) =>
    (error as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;

/**
 * Ürün / malzeme detayı — listeden bir satıra tıklayınca açılan tam sayfa.
 *
 * Veri disiplini: sayfa açılırken YALNIZCA başlık tablosu çekilir
 * (`/articles/:id/detail`). Tedarikçi listesi ve hareket geçmişi bu yanıtta
 * yoktur; ikisi de kendi düğmesine basıldığında monte olan bileşenle, kendi
 * ucundan yüklenir. Görsel de ayrı uçtan gelir (base64 blob başlık isteğine
 * binmesin).
 *
 * Kaydetme: alanlar, açıklama ve görsel TEK "Kaydet" düğmesiyle, TEK istekte
 * (`PATCH /articles/:id/detail`) gider. Böylece alanları yazıp görseli düşüren
 * yarım kayıt oluşamaz; yalnızca DEĞİŞEN alanlar gönderilir.
 */
export const ArticleDetailView = ({ itemType, copyPrefix, listPath }: {
    itemType: ItemType;
    /** 'inv.products' | 'inv.materials'. */
    copyPrefix: string;
    listPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const { detail, setDetail, loading, error } = useArticleDetail(id);

    const permissions = useAuthStore((state) => state.permissions);
    const canUpdate = permissions.includes('inventory.articles.update');

    // 'detail' → 'movements': aynı ekranda değişir, hareketler kendi geri
    // düğmesiyle buraya döner (ayrı sayfaya gidilmez).
    const [view, setView] = useState<'detail' | 'movements'>('detail');
    const [suppliersOpen, setSuppliersOpen] = useState(false);
    const [saving, setSaving] = useState(false);

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

    const editDraft = (patchDraft: Partial<DetailDraft>) => {
        if (!detail || !draft) return;
        setEdited({ articleId: detail.id, draft: { ...draft, ...patchDraft } });
    };

    const codeLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialCode' : 'inv.columns.serialCode');
    const nameLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialName' : 'inv.columns.productName');

    /** Yalnızca DEĞİŞEN alanlar — hiçbiri değişmediyse `null` (düğme pasif). */
    const patch = useMemo(
        () => (detail && draft ? buildDetailPatch(detail, draft, pendingImage) : null),
        [detail, draft, pendingImage],
    );

    const dirty = patch !== null;

    const save = async () => {
        if (!id || !patch) return;
        setSaving(true);
        try {
            const updated = await inventoryApi.saveArticleDetail(id, patch);
            // Ekran yanıttan tazelenir: sunucu açıklamayı kendi beyaz listesinden
            // geçirdiği için gösterilen değer kaydedilenle birebir aynı olur.
            // İstatistikler ayrı uçtan geldiği için hızlı PATCH yanıtındaki ana
            // alanları mevcut hesaplanmış değerlerin üzerine birleştir.
            setDetail((current) => current ? { ...current, ...updated } : updated);
            setEdited(null);
            setPendingImage(undefined);
            toast.success(t('inv.detail.saved'));
        } catch (err) {
            toast.error(errorMessage(err, t('inv.detail.saveFailed')));
        } finally {
            setSaving(false);
        }
    };

    const reset = () => {
        setEdited(null);
        setPendingImage(undefined);
    };

    const field = (key: keyof DetailDraft, extraClass = '') => ({
        value: draft?.[key] ?? '',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => editDraft({ [key]: event.target.value }),
        className: `${CELL_INPUT_CLASS} ${extraClass}`,
    });

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={(
                    <span className="flex items-center gap-2">
                        <button
                            type="button"
                            aria-label={t('common.back')}
                            title={t('common.back')}
                            onClick={() => navigate(listPath)}
                            className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                        >
                            <ArrowLeft size={16} />
                        </button>
                        {detail?.name || t(`${copyPrefix}.detailTitle`)}
                    </span>
                )}
                action={canUpdate && view === 'detail' && detail && (
                    // ORTAK kaydet: alanlar + açıklama + görsel tek istekte gider.
                    <div className="flex items-center gap-2">
                        {dirty && (
                            <button
                                type="button"
                                disabled={saving}
                                onClick={reset}
                                className="text-[12.5px] text-slate-500 transition-colors hover:text-slate-800 disabled:opacity-40 dark:text-white/60 dark:hover:text-white"
                            >
                                {t('common.cancel')}
                            </button>
                        )}
                        <button
                            type="button"
                            disabled={!dirty || saving}
                            onClick={() => void save()}
                            className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:opacity-40"
                        >
                            {saving ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                            {t('common.save')}
                        </button>
                    </div>
                )}
            />

            {view === 'movements' && detail ? (
                <ArticleMovementsView
                    articleId={detail.id}
                    articleName={detail.name}
                    unit={detail.unit}
                    onBack={() => setView('detail')}
                />
            ) : (
                // İki sütun: solda detay tablosu ve düğmeler, sağda görsel.
                // Dar ekranda görsel tablonun altına iner.
                <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                    <div className="flex min-w-0 flex-col gap-4">
                        <SectionCard title={t(`${copyPrefix}.detailTitle`)}>
                            <table data-inv-table data-unstyled-table className="w-full">
                                <tbody>
                                    {(loading || !detail || !draft) && (
                                        <TableStateRow colSpan={2} loading={loading} emptyText={error || t('inv.detail.notFound')} />
                                    )}
                                    {!loading && detail && draft && (
                                        <>
                                            <Row label={codeLabel} mono={!canUpdate}>
                                                {canUpdate
                                                    ? <input aria-label={codeLabel} {...field('articleCode', 'font-mono max-w-xs')} />
                                                    : detail.articleCode}
                                            </Row>
                                            <Row label={nameLabel}>
                                                {canUpdate
                                                    ? <input aria-label={nameLabel} {...field('name', 'max-w-md')} />
                                                    : detail.name}
                                            </Row>
                                            <Row label={t('inv.columns.unit')}>
                                                {canUpdate
                                                    ? <input aria-label={t('inv.columns.unit')} {...field('unit', 'max-w-[8rem]')} />
                                                    : detail.unit}
                                            </Row>
                                            {/* Stok, ortalama maliyet ve sipariş adedi TÜRETİLMİŞ
                                                değerlerdir — hareketlerden gelir, elle düzenlenmez. */}
                                            <Row label={t('inv.columns.currentStock')} mono>
                                                {fmtQty(detail.totalQuantity)} {detail.unit}
                                            </Row>
                                            <Row label={t('inv.detail.averageUnitCost')} mono>
                                                {detail.averageUnitCost === undefined ? '—' : fmtUnitCost(detail.averageUnitCost)}
                                            </Row>
                                            <Row label={t('inv.columns.salePrice')} mono={!canUpdate}>
                                                {canUpdate
                                                    ? <input inputMode="decimal" aria-label={t('inv.columns.salePrice')} {...field('salePrice', 'font-mono max-w-[10rem]')} />
                                                    : fmtMoney(detail.salePrice)}
                                            </Row>
                                            {/* Siparişi olmayan ürün 0 gösterir — boş bırakılmaz. */}
                                            <Row label={t('inv.detail.openOrderQuantity')} mono>
                                                {detail.openOrderQuantity === undefined
                                                    ? '—'
                                                    : `${fmtQty(detail.openOrderQuantity)} ${detail.unit}`}
                                            </Row>
                                            <Row label={t('inv.columns.description')}>
                                                <div className="max-w-2xl py-1">
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
                                                </div>
                                            </Row>
                                        </>
                                    )}
                                </tbody>
                            </table>
                        </SectionCard>

                        {detail && (
                            <div className="flex flex-wrap items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setSuppliersOpen(true)}
                                    className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                                >
                                    <Building02 size={14} />
                                    {t('inv.detail.suppliersButton', { count: detail.supplierCount ?? '…' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setView('movements')}
                                    className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3.5 py-2 text-[12.5px] font-semibold text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/20 dark:bg-transparent dark:text-white dark:hover:bg-white/10"
                                >
                                    <SwitchHorizontal01 size={14} />
                                    {t('inv.detail.movementsButton')}
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Görsel ayrı ve önbelleklenebilir binary uçtan gelir.
                        Seçim burada yalnızca BEKLETİLİR, yazma ortak Kaydet ile olur. */}
                    {detail && (
                        <ArticleImagePanel
                            canUpdate={canUpdate}
                            articleId={detail.id}
                            imageVersion={detail.imageVersion}
                            pending={pendingImage}
                            onPick={setPendingImage}
                        />
                    )}
                </div>
            )}

            {/* Popup yalnızca açıkken monte edilir → veri de yalnızca o an çekilir. */}
            {suppliersOpen && detail && (
                <ArticleSuppliersSheet
                    articleId={detail.id}
                    articleName={detail.name}
                    unit={detail.unit}
                    onClose={() => setSuppliersOpen(false)}
                />
            )}
        </div>
    );
};
