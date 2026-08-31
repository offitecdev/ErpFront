import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle } from '@/components/icons/antIconCompat';
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
import { useAuthStore } from '@/store/authStore';
import type { BulkArticleItemInput } from '@/types/inventory';
import { ArticleImagePanel } from '../detail/ArticleImagePanel';
import { useLanguageTick } from '../hooks/useLanguageTick';
import type { SupplierChoice } from '../types';
import { parseNum } from '../utils/format';
import { CELL_INPUT_CLASS, SectionCard } from './primitives';
import { SupplierComboCell } from './SupplierComboCell';

/** Etiket/değer satırı — detay ekranındaki tabloyla aynı görünüm. */
const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <tr className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
        <th scope="row" className="w-56 text-left align-top text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
            {label}
        </th>
        <td className="text-slate-800 dark:text-white">{children}</td>
    </tr>
);

interface SingleDraft {
    articleCode: string;
    name: string;
    unit: string;
    salePrice: string;
    purchasePrice: string;
    quantity: string;
    supplierId: string | null;
    supplierName: string;
    description: string;
}

/**
 * TEKLİ ürün / malzeme ekleme sayfası — "Ürün Ekle" artık buraya gelir; toplu
 * tablo ayrı sayfada yaşar (".../bulk-new"). Ekran, ürün DETAY sayfasıyla aynı
 * düzendedir (solda etiket/değer tablosu, sağda görsel): kullanıcı detayda
 * gördüğü kartın aynısını burada doldurur. Farkı, kayıt olmadan önce stok
 * bilgisi de girilebilmesidir: başlangıç stoğu + alış fiyatı + tedarikçi,
 * toplu uçla AYNI yoldan (giriş hareketi + parti + bakiye) yazılır.
 *
 * Teklif ekranındaki "yeni ürün" bağlantısı `?name=` ile gelir; ad alanı
 * önceden doldurulur.
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

    const [draft, setDraft] = useState<SingleDraft>(() => ({
        articleCode: '',
        name: searchParams.get('name')?.trim() ?? '',
        unit: '',
        salePrice: '',
        purchasePrice: '',
        quantity: '',
        supplierId: null,
        supplierName: '',
        description: '',
    }));
    // Görsel panelinin bekleyen-seçim sözleşmesi: undefined = dokunulmadı.
    const [image, setImage] = useState<string | null | undefined>(undefined);
    const [saving, setSaving] = useState(false);

    const edit = (patch: Partial<SingleDraft>) => setDraft((current) => ({ ...current, ...patch }));

    const codeLabel = t('inv.columns.serialCode');
    const nameLabel = t('inv.columns.productName');

    const field = (key: keyof SingleDraft, extraClass = '', placeholder = '') => ({
        value: String(draft[key] ?? ''),
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => edit({ [key]: event.target.value }),
        placeholder,
        className: `${CELL_INPUT_CLASS} ${extraClass}`,
    });

    const onSupplierPicked = (choice: SupplierChoice) => {
        edit({ supplierId: choice.supplierId, supplierName: choice.supplierName });
    };

    const save = async () => {
        const articleCode = draft.articleCode.trim();
        const name = draft.name.trim();
        if (!articleCode || !name) {
            toast.error(t(`${copyPrefix}.missingRequired`));
            return;
        }
        const payload: BulkArticleItemInput = {
            articleCode,
            name,
            unit: draft.unit.trim() || null,
            salePrice: parseNum(draft.salePrice) ?? 0,
            quantity: parseNum(draft.quantity) ?? 0,
            purchasePrice: parseNum(draft.purchasePrice) ?? 0,
            supplierId: draft.supplierId,
            supplierName: draft.supplierId ? null : (draft.supplierName.trim() || null),
            description: draft.description.trim() ? draft.description : null,
            ...(typeof image === 'string' ? { imageUrl: image } : {}),
        };

        setSaving(true);
        try {
            // Tekli kayıt da toplu uçtan gider: ürün + tanım/giriş hareketi +
            // parti + bakiye tek istekte, toplu tabloyla birebir aynı kurallarla.
            // Yeni kayıt her zaman ÜRÜN doğar; hizmete çevirme detay ekranındadır.
            const result = await inventoryApi.bulkCreateArticles([payload]);
            const rowError = result.errors[0]?.error;
            if (rowError || !result.created.length) {
                toast.error(rowError || t(`${copyPrefix}.saveFailed`));
                return;
            }
            toast.success(t(`${copyPrefix}.saved`, { name }));
            navigate(`${detailRoot}/${result.created[0].id}`);
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t(`${copyPrefix}.saveFailed`));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t(`${copyPrefix}.title`)}
                action={(
                    <button
                        type="button"
                        disabled={saving || !canCreate}
                        title={canCreate ? undefined : t(`${copyPrefix}.noPermission`)}
                        onClick={() => void save()}
                        className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                        {t('common.save')}
                    </button>
                )}
            />

            {/* Detayla aynı iki sütun: solda alan tablosu, sağda görsel. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                {/* Kart başlığı "Ürün detayı" DEMEZ (kullanıcı isteği 2026-08-07 —
                    oluşturma ekranında kafa karıştırıyordu): yazılan ad canlı
                    olarak başlığa düşer; ad boşken sayfa başlığı görünür. */}
                <SectionCard title={draft.name.trim() || t(`${copyPrefix}.title`)}>
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <tbody>
                            <Row label={codeLabel}>
                                <input aria-label={codeLabel} {...field('articleCode', 'font-mono max-w-xs', codeLabel)} />
                            </Row>
                            <Row label={nameLabel}>
                                <input aria-label={nameLabel} {...field('name', 'max-w-md', nameLabel)} />
                            </Row>
                            <Row label={t('inv.columns.unit')}>
                                <UnitSelect
                                    value={draft.unit}
                                    onChange={(next) => edit({ unit: next })}
                                    className="max-w-[12rem]"
                                />
                            </Row>
                            <Row label={t('inv.columns.salePrice')}>
                                <input inputMode="decimal" aria-label={t('inv.columns.salePrice')} {...field('salePrice', 'font-mono max-w-[10rem]', '0.00')} />
                            </Row>
                            {/* Stok bilgisi: kayıtla birlikte GİRİŞ hareketi yazılır
                                (0 bırakılırsa yalnızca tanım hareketi). Açıklayıcı
                                alt metin KALDIRILDI (kullanıcı isteği 2026-08-07). */}
                            <Row label={t(`${copyPrefix}.initialStock`)}>
                                <input inputMode="decimal" aria-label={t(`${copyPrefix}.initialStock`)} {...field('quantity', 'font-mono max-w-[10rem]', '0')} />
                            </Row>
                            <Row label={t('inv.columns.purchasePrice')}>
                                <input inputMode="decimal" aria-label={t('inv.columns.purchasePrice')} {...field('purchasePrice', 'font-mono max-w-[10rem]', '0.00')} />
                            </Row>
                            <Row label={t('inv.columns.supplier')}>
                                <div className="max-w-md">
                                    <SupplierComboCell
                                        value={draft.supplierName}
                                        onChange={(next) => edit({ supplierName: next, supplierId: null })}
                                        onSelect={onSupplierPicked}
                                    />
                                </div>
                            </Row>
                            <Row label={t('inv.columns.description')}>
                                <div className="max-w-2xl py-1">
                                    <RichTextMarkdownEditor
                                        value={draft.description}
                                        onChange={(next) => edit({ description: next })}
                                        minHeight={96}
                                        placeholder={t('inv.detail.descriptionPlaceholder')}
                                        className="w-full"
                                    />
                                </div>
                            </Row>
                        </tbody>
                    </table>
                </SectionCard>

                {/* Oluşturma kipi: kayıtlı görsel yok, panel yalnızca seçimi bekletir. */}
                <ArticleImagePanel
                    canUpdate={canCreate}
                    articleId={null}
                    imageVersion=""
                    pending={image}
                    onPick={setImage}
                />
            </div>
        </div>
    );
};
