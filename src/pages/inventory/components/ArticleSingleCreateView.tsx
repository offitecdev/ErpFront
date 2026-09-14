import { useEffect, useMemo, useState } from 'react';
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
import { articleCodesApi, type CodeCategory } from '@/lib/api/articleCodes';
import { inventoryApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { BulkArticleItemInput, QuickArticleItemInput } from '@/types/inventory';
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
    /** Nur im Handeingabe-Weg (kein freigegebener Nummernkreis). */
    articleCode: string;
    name: string;
    modelNumber: string;
    serialNumber: string;
    supplierBarcode: string;
    unit: string;
    salePrice: string;
    purchasePrice: string;
    quantity: string;
    supplierId: string | null;
    supplierName: string;
    description: string;
}

/**
 * TEKLİ ürün ekleme sayfası — "Ürün Ekle" buraya gelir; toplu tablo ayrı
 * sayfada yaşar (".../bulk-new"). Ekran, ürün DETAY sayfasıyla aynı düzendedir
 * (solda etiket/değer tablosu, sağda görsel).
 *
 * ERP-CODE (10.09.2026): Der Code wird nicht mehr getippt, sondern aus einem
 * von der IT FREIGEGEBENEN Nummernkreis vergeben — Kategorie und
 * Unterkategorie wählen, der nächste Code steht daneben, gezogen wird er beim
 * Speichern (`/articles/quick`, derselbe Weg wie die Schnellerfassung, mit
 * der eingegebenen Anfangsmenge). Gibt es (noch) keinen freigegebenen Kreis,
 * bleibt der Handeingabe-Weg über `/articles/bulk` — mit Hinweis, wo die IT
 * Kreise freigibt.
 *
 * Reihenfolge der Felder wie im Detail: ERP-Code, Bezeichnung, Modellnummer,
 * Seriennummer, Barcode. Teklif ekranındaki "yeni ürün" bağlantısı `?name=`
 * ile gelir; ad alanı önceden doldurulur.
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
        modelNumber: '',
        serialNumber: '',
        supplierBarcode: '',
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

    /* Nummernkreise: nur freigegebene. `null` = noch nicht geladen. */
    const [categories, setCategories] = useState<CodeCategory[] | null>(null);
    const [categoryId, setCategoryId] = useState('');
    const [schemeId, setSchemeId] = useState('');
    const [manualCode, setManualCode] = useState(false);
    useEffect(() => {
        let cancelled = false;
        articleCodesApi.list({ active: true })
            .then((rows) => { if (!cancelled) setCategories(rows); })
            .catch(() => { if (!cancelled) setCategories([]); });
        return () => { cancelled = true; };
    }, []);
    const category = useMemo(() => categories?.find((row) => row.id === categoryId) ?? null, [categories, categoryId]);
    const scheme = useMemo(() => category?.schemes.find((row) => row.id === schemeId) ?? null, [category, schemeId]);
    const hasSchemes = Boolean(categories && categories.length);
    const useScheme = hasSchemes && !manualCode;

    const edit = (patch: Partial<SingleDraft>) => setDraft((current) => ({ ...current, ...patch }));

    const codeLabel = t('inv.columns.erpCode');
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
        const name = draft.name.trim();
        if (!name) {
            toast.error(t(`${copyPrefix}.missingRequired`));
            return;
        }
        if (useScheme && !scheme) {
            toast.error(t(`${copyPrefix}.codeSchemeRequired`));
            return;
        }
        const articleCode = draft.articleCode.trim();
        if (!useScheme && !articleCode) {
            toast.error(t(`${copyPrefix}.missingRequired`));
            return;
        }

        const shared = {
            name,
            unit: draft.unit.trim() || null,
            salePrice: parseNum(draft.salePrice) ?? 0,
            quantity: parseNum(draft.quantity) ?? 0,
            purchasePrice: parseNum(draft.purchasePrice) ?? 0,
            supplierId: draft.supplierId,
            supplierName: draft.supplierId ? null : (draft.supplierName.trim() || null),
            description: draft.description.trim() ? draft.description : null,
            modelNumber: draft.modelNumber.trim() || null,
            serialNumber: draft.serialNumber.trim() || null,
            ...(typeof image === 'string' ? { imageUrl: image } : {}),
        };

        setSaving(true);
        try {
            // Beide Wege laufen durch denselben Rumpf (Artikel + Bewegung +
            // Partie + Bestand in einem Zug); der Kreis-Weg zieht nur den Code.
            const result = useScheme && scheme
                ? await inventoryApi.quickCreateArticles(scheme.id, [{ ...shared, barcode: draft.supplierBarcode.trim() || null } satisfies QuickArticleItemInput])
                : await inventoryApi.bulkCreateArticles([{ ...shared, articleCode, supplierBarcode: draft.supplierBarcode.trim() || null } satisfies BulkArticleItemInput]);
            const rowError = result.errors[0];
            if (rowError || !result.created.length) {
                toast.error(rowError?.code === 'SERIAL_TAKEN' ? t('inv.detail.serialTaken') : (rowError?.error || t(`${copyPrefix}.saveFailed`)));
                return;
            }
            toast.success(t(`${copyPrefix}.saved`, { name }));
            navigate(`${detailRoot}/${result.created[0].id}`);
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: string } } })?.response?.data?.error;
            toast.error(message || t(`${copyPrefix}.saveFailed`));
        } finally {
            setSaving(false);
        }
    };

    const selectClass = `${CELL_INPUT_CLASS} max-w-[14rem]`;

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
                        className="flex items-center gap-1.5 rounded-md bg-[#0a7aff] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0066e0] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {saving ? <Spinner size="sm" /> : <CheckCircle size={14} />}
                        {t('common.save')}
                    </button>
                )}
            />

            {/* Detayla aynı iki sütun: solda alan tablosu, sağda görsel. */}
            <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(260px,1fr)]">
                <SectionCard title={draft.name.trim() || t(`${copyPrefix}.title`)}>
                    <table data-inv-table data-grid-lines data-unstyled-table data-lager-form className="w-full">
                        <tbody>
                            <Row label={codeLabel}>
                                {useScheme ? (
                                    <div className="flex flex-wrap items-center gap-2 py-0.5">
                                        <select
                                            aria-label={t(`${copyPrefix}.codeCategory`)}
                                            value={categoryId}
                                            onChange={(event) => { setCategoryId(event.target.value); setSchemeId(''); }}
                                            className={selectClass}
                                        >
                                            <option value="">{t(`${copyPrefix}.pickCategory`)}</option>
                                            {categories?.map((row) => (
                                                <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
                                            ))}
                                        </select>
                                        <select
                                            aria-label={t(`${copyPrefix}.codeSub`)}
                                            value={schemeId}
                                            disabled={!category}
                                            onChange={(event) => setSchemeId(event.target.value)}
                                            className={selectClass}
                                        >
                                            <option value="">{t(`${copyPrefix}.pickSub`)}</option>
                                            {category?.schemes.map((row) => (
                                                <option key={row.id} value={row.id}>{row.code} · {row.name}</option>
                                            ))}
                                        </select>
                                        {scheme && (
                                            <span className="font-mono text-[13px] font-semibold text-slate-800 dark:text-white">
                                                {t(`${copyPrefix}.codeNext`, { code: scheme.nextCode })}
                                            </span>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setManualCode(true)}
                                            className="text-[12px] text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                                        >
                                            {t(`${copyPrefix}.codeManual`)}
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex flex-wrap items-center gap-2 py-0.5">
                                        <input aria-label={codeLabel} {...field('articleCode', 'font-mono max-w-xs', codeLabel)} />
                                        {hasSchemes ? (
                                            <button
                                                type="button"
                                                onClick={() => setManualCode(false)}
                                                className="text-[12px] text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                                            >
                                                {t(`${copyPrefix}.codeFromScheme`)}
                                            </button>
                                        ) : categories !== null && (
                                            <span className="text-[12px] text-slate-500 dark:text-white/60">{t(`${copyPrefix}.codeNoSchemes`)}</span>
                                        )}
                                    </div>
                                )}
                            </Row>
                            <Row label={nameLabel}>
                                <input aria-label={nameLabel} {...field('name', 'max-w-md', nameLabel)} />
                            </Row>
                            <Row label={t('inv.columns.modelNumber')}>
                                <input aria-label={t('inv.columns.modelNumber')} {...field('modelNumber', 'font-mono max-w-xs')} />
                            </Row>
                            <Row label={t('inv.columns.serialNumber')}>
                                <input aria-label={t('inv.columns.serialNumber')} {...field('serialNumber', 'font-mono max-w-xs')} />
                            </Row>
                            <Row label={t('inv.columns.barcode')}>
                                <input aria-label={t('inv.detail.barcodeSupplier')} {...field('supplierBarcode', 'font-mono max-w-xs', t('inv.detail.barcodeSupplier'))} />
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
