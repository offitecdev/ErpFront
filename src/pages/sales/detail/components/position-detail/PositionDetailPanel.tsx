import React, { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
    AlertTriangle,
    Calculator,
    Clipboard as ClipboardList,
    Image01 as ImageIcon,
    Package,
    Save01 as Save,
    Tag01 as Tag,
    Trash01 as Trash2,
} from '@/components/icons/antIconCompat';
import { Button } from '../../../../../components/ui-shared/Button';
import { Card } from '../../../../../components/ui-shared/Card';
import { Field, Input } from '../../../../../components/ui-shared/Field';
import { tenderApi } from '../../../../../lib/api/tender';
import { usePdfSettings } from '../../../../../store/pdfSettingsStore';
import { useTenderStore } from '../../../../../store/tenderStore';
import type { CostInput, PositionDto } from '../../../../../types/tender';
import type { ArticleStockSummary } from '../../../../../types/inventory';
import {
    mergeArticleMappingUpdate,
    type TreeNode,
} from '../../tenderDetailUtils';
import { RichTextMarkdownEditor, richTextToHtml } from '../../TenderRichText';
import { t } from '@/i18n/translate';
import { TabBtn } from '../common/TabBtn';
import { PositionAdvancedCostSection } from './PositionAdvancedCostSection';
import { PositionArticleMappingsSection } from './PositionArticleMappingsSection';
import { PositionPricingSection } from './PositionPricingSection';
/* ── Detail Panel ── */
type PositionPricingPatch = Pick<Partial<PositionDto>, 'quantity' | 'unit' | 'unitPrice' | 'discount' | 'taxRate'>;
type MappingPricingPatch = { quantityMultiplier?: number; discount?: number | null };

export const PositionDetailPanel: React.FC<{
    position: TreeNode;
    tenderId: string;
    isDraft: boolean;
    canCalc: boolean;
    stockArticles: ArticleStockSummary[];
    stockArticlesLoading: boolean;
    stockArticlesLoaded: boolean;
    activeTab: 'calc' | 'articles' | 'meta';
    setActiveTab: (t: 'calc' | 'articles' | 'meta') => void;
    onSaveCalc: (c: CostInput) => Promise<void>;
    onMapArticle: (articleId: string, qty: number, opts?: { discount?: number }) => Promise<void>;
    onRemoveArticleMapping: (mappingId: string) => Promise<void>;
    onSelectArticleMapping: (mappingId: string) => void;
    onLocalPositionChange?: (positionId: string, patch: PositionPricingPatch) => void;
    onLocalMappingChange?: (positionId: string, mappingId: string, patch: MappingPricingPatch) => void;
}> = ({ position, tenderId, isDraft, canCalc, stockArticles, stockArticlesLoading, stockArticlesLoaded, activeTab, setActiveTab, onSaveCalc, onMapArticle, onRemoveArticleMapping, onSelectArticleMapping, onLocalPositionChange, onLocalMappingChange }) => {
    const settings = usePdfSettings();
    const defaultTaxRate = settings.vatRate ?? 8.1;
    const { updatePosition: storeUpdatePosition } = useTenderStore();

    // Position-level pricing (editable from this panel)
    const [pricing, setPricing] = useState({
        quantity: position.quantity ?? 0,
        unit: position.unit ?? '',
        unitPrice: position.unitPrice ?? 0,
        discount: position.discount ?? 0,
        taxRate: position.taxRate ?? defaultTaxRate,
    });
    const savedPricingRef = useRef({
        quantity: position.quantity ?? 0,
        unit: position.unit ?? '',
        unitPrice: position.unitPrice ?? 0,
        discount: position.discount ?? 0,
        taxRate: position.taxRate ?? defaultTaxRate,
    });

    const isArticle = position.isArticleMapping;
    const visibleActiveTab = isArticle ? 'calc' : activeTab;

    // Cost breakdown (kept for advanced cost build-up)
    const [cost, setCost] = useState<CostInput>({
        materialCost: 0,
        laborCost: 0,
        overheadCost: 0,
        riskAmount: 0,
        additionalCost: 0,
        profitMargin: 0,
    });
    const [saving, setSaving] = useState(false);
    const [marginMode, setMarginMode] = useState<'amount' | 'percent'>('amount');
    const [marginPercent, setMarginPercent] = useState<number>(0);
    const [articleId, setArticleId] = useState<string>('');
    const [articleQty, setArticleQty] = useState<number>(1);
    const [articleDiscount, setArticleDiscount] = useState<number>(0);
    const [bulkMappingDiscount, setBulkMappingDiscount] = useState<number>(0);
    const [mappingDiscountDrafts, setMappingDiscountDrafts] = useState<Record<string, number>>({});
    const [appliedMappingDiscounts, setAppliedMappingDiscounts] = useState<Record<string, number>>({});
    const [hiddenMappingIds, setHiddenMappingIds] = useState<Record<string, boolean>>({});
    const [mappingLoadingId, setMappingLoadingId] = useState<string | null>(null);
    const autoSaveSeq = useRef(0);
    const mappingDiscountTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

    const selectedStockArticle = useMemo(
        () => stockArticles.find((a) => a.id === articleId) || null,
        [stockArticles, articleId]
    );


    useEffect(() => {
        if (position.calculation) {
            setCost({
                materialCost: position.calculation.materialCost,
                laborCost: position.calculation.laborCost,
                overheadCost: position.calculation.overheadCost,
                riskAmount: position.calculation.riskAmount,
                additionalCost: position.calculation.additionalCost || 0,
                profitMargin: position.calculation.profitMargin,
            });
        } else {
            setCost({ materialCost: 0, laborCost: 0, overheadCost: 0, riskAmount: 0, additionalCost: 0, profitMargin: 0 });
        }
        setMarginPercent(0);
        setMarginMode('amount');
        const nextPricing = {
            quantity: position.quantity ?? 0,
            unit: position.unit ?? '',
            unitPrice: position.unitPrice ?? 0,
            discount: position.discount ?? 0,
            taxRate: position.taxRate ?? defaultTaxRate,
        };
        setPricing(nextPricing);
        savedPricingRef.current = nextPricing;
        setMappingDiscountDrafts(
            Object.fromEntries((position.articleMappings ?? []).map((m) => [m.id, m.discount ?? 0]))
        );
        setBulkMappingDiscount(0);
        setAppliedMappingDiscounts({});
        setHiddenMappingIds({});
    }, [position.id]);

    useEffect(() => {
        const saved = savedPricingRef.current;
        const hasUnsavedPanelChange =
            (pricing.quantity ?? 0) !== (saved.quantity ?? 0) ||
            (pricing.unit ?? '') !== (saved.unit ?? '') ||
            (pricing.unitPrice ?? 0) !== (saved.unitPrice ?? 0) ||
            (pricing.discount ?? 0) !== (saved.discount ?? 0) ||
            (pricing.taxRate ?? 0) !== (saved.taxRate ?? defaultTaxRate);

        if (hasUnsavedPanelChange) return;

        const nextPricing = {
            quantity: position.quantity ?? 0,
            unit: position.unit ?? '',
            unitPrice: position.unitPrice ?? 0,
            discount: position.discount ?? 0,
            taxRate: position.taxRate ?? defaultTaxRate,
        };
        setPricing(nextPricing);
        savedPricingRef.current = nextPricing;
    }, [position.quantity, position.unit, position.unitPrice, position.discount, position.taxRate, defaultTaxRate]);

    useEffect(() => {
        return () => {
            Object.values(mappingDiscountTimers.current).forEach(clearTimeout);
        };
    }, []);

    const updatePricing = (patch: Partial<typeof pricing>) => {
        const next = { ...pricing, ...patch };
        setPricing(next);

        if (isArticle && position.parentPositionId && position.mappingId) {
            const mappingPatch: MappingPricingPatch = {};
            if (patch.quantity !== undefined) mappingPatch.quantityMultiplier = patch.quantity;
            if (patch.discount !== undefined) mappingPatch.discount = patch.discount;
            if (Object.keys(mappingPatch).length > 0) {
                onLocalMappingChange?.(position.parentPositionId, position.mappingId, mappingPatch);
            }
            return;
        }

        onLocalPositionChange?.(position.id, patch as PositionPricingPatch);
    };

    const subtotal = cost.materialCost + cost.laborCost + cost.overheadCost + cost.riskAmount + cost.additionalCost;
    const finalMargin = marginMode === 'percent' ? +(subtotal * marginPercent / 100).toFixed(2) : cost.profitMargin;
    const total = subtotal + finalMargin;

    // Add KDV to the total display for Advanced Cost section — always 8.1
    const effectiveVat = (pricing.taxRate != null && pricing.taxRate > 0) ? pricing.taxRate : 8.1;
    const totalWithTax = total * (1 + effectiveVat / 100);

    const unitPrice = position.quantity > 0 ? total / position.quantity : 0;

    // Pricing snapshot derived totals — KDV always 8.1
    const pricingGross = pricing.quantity * pricing.unitPrice;
    const pricingDiscountAmount = pricingGross * (pricing.discount / 100);
    const pricingNet = pricingGross - pricingDiscountAmount;
    const pricingAdditionalCost = isArticle ? 0 : cost.additionalCost;
    const pricingTaxBase = pricingNet + pricingAdditionalCost;
    const pricingTaxAmount = pricingTaxBase * (effectiveVat / 100);
    const pricingTotalWithTax = pricingTaxBase + pricingTaxAmount;

    const savedPricing = savedPricingRef.current;
    const pricingDirty =
        (pricing.quantity ?? 0) !== (savedPricing.quantity ?? 0) ||
        (pricing.unit ?? '') !== (savedPricing.unit ?? '') ||
        (pricing.unitPrice ?? 0) !== (savedPricing.unitPrice ?? 0) ||
        (pricing.discount ?? 0) !== (savedPricing.discount ?? 0) ||
        (pricing.taxRate ?? 0) !== (savedPricing.taxRate ?? defaultTaxRate);

    const calculationDirty = !isArticle && (
        !position.calculation ||
        (cost.materialCost ?? 0) !== (position.calculation.materialCost ?? 0) ||
        (cost.laborCost ?? 0) !== (position.calculation.laborCost ?? 0) ||
        (cost.overheadCost ?? 0) !== (position.calculation.overheadCost ?? 0) ||
        (cost.riskAmount ?? 0) !== (position.calculation.riskAmount ?? 0) ||
        (cost.additionalCost ?? 0) !== (position.calculation.additionalCost ?? 0) ||
        (finalMargin ?? 0) !== (position.calculation.profitMargin ?? 0)
    );
    const autoSaveDirty = isDraft && canCalc && (pricingDirty || calculationDirty);

    const savePricing = async () => {
        try {
            if (isArticle) {
                if (!position.mappingId || !position.parentPositionId || !position.articleId) return;
                const result = await tenderApi.updateArticleMapping(tenderId, position.parentPositionId, position.mappingId, {
                    quantityMultiplier: pricing.quantity,
                    discount: pricing.discount,
                });
                mergeArticleMappingUpdate(position.parentPositionId, position.mappingId, result, {
                    quantityMultiplier: pricing.quantity,
                    discount: pricing.discount,
                });
                savedPricingRef.current = { ...pricing };
                return;
            }
            await Promise.all([
                pricingDirty
                    ? storeUpdatePosition(tenderId, position.id, {
                        quantity: pricing.quantity,
                        unit: pricing.unit || null,
                        unitPrice: pricing.unitPrice || null,
                        discount: pricing.discount,
                        taxRate: pricing.taxRate,
                    })
                    : Promise.resolve(),
                calculationDirty
                    ? onSaveCalc({ ...cost, profitMargin: finalMargin })
                    : Promise.resolve(),
            ]);
            savedPricingRef.current = { ...pricing };
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.kaydedilemedi'));
            throw e;
        }
    };

    useEffect(() => {
        if (!autoSaveDirty) return;
        const seq = autoSaveSeq.current + 1;
        autoSaveSeq.current = seq;
        const t = setTimeout(async () => {
            setSaving(true);
            try {
                await savePricing();
            } catch {
                // Error toast is emitted in savePricing.
            } finally {
                if (autoSaveSeq.current === seq) setSaving(false);
            }
        }, 500);
        return () => clearTimeout(t);
    }, [autoSaveDirty, pricing, cost, finalMargin]);

    const updateArticleMappingDiscount = async (mappingId: string, nextDiscount: number) => {
        const mapping = position.articleMappings?.find((m) => m.id === mappingId);
        if (!mapping || !position.id) return;
        setMappingLoadingId(mappingId);
        try {
            setAppliedMappingDiscounts((prev) => ({ ...prev, [mappingId]: nextDiscount }));
            useTenderStore.setState((state) => ({
                detail: state.detail
                    ? {
                        ...state.detail,
                        positions: state.detail.positions.map((p) =>
                            p.id === position.id
                                ? {
                                    ...p,
                                    articleMappings: p.articleMappings?.map((m) =>
                                        m.id === mappingId ? { ...m, discount: nextDiscount } : m
                                    ),
                                }
                                : p
                        ),
                    }
                    : state.detail,
            }));
            const result = await tenderApi.updateArticleMapping(tenderId, position.id, mapping.id, { discount: nextDiscount });
            mergeArticleMappingUpdate(position.id, mapping.id, result, { discount: nextDiscount });
        } catch (err: any) {
            setAppliedMappingDiscounts((prev) => {
                const next = { ...prev };
                delete next[mappingId];
                return next;
            });
            toast.error(err.response?.data?.error ||t('tenders.discount_guncellenemedi'));
        } finally {
            setMappingLoadingId(null);
        }
    };

    const queueArticleMappingDiscount = (mappingId: string, nextDiscount: number) => {
        const normalized = Math.min(100, Math.max(0, nextDiscount || 0));
        setMappingDiscountDrafts((prev) => ({ ...prev, [mappingId]: normalized }));
        setAppliedMappingDiscounts((prev) => ({ ...prev, [mappingId]: normalized }));
        clearTimeout(mappingDiscountTimers.current[mappingId]);
        mappingDiscountTimers.current[mappingId] = setTimeout(() => {
            updateArticleMappingDiscount(mappingId, normalized);
        }, 500);
    };

    const applyBulkMappingDiscount = async () => {
        const mappings = (position.articleMappings ?? []).filter((m) => !hiddenMappingIds[m.id]);
        if (mappings.length === 0) return;
        const nextDiscount = Math.min(100, Math.max(0, bulkMappingDiscount || 0));
        setMappingLoadingId('__bulk__');
        try {
            setMappingDiscountDrafts((prev) => ({
                ...prev,
                ...Object.fromEntries(mappings.map((m) => [m.id, nextDiscount])),
            }));
            setAppliedMappingDiscounts((prev) => ({
                ...prev,
                ...Object.fromEntries(mappings.map((m) => [m.id, nextDiscount])),
            }));
            useTenderStore.setState((state) => ({
                detail: state.detail
                    ? {
                        ...state.detail,
                        positions: state.detail.positions.map((p) =>
                            p.id === position.id
                                ? {
                                    ...p,
                                    articleMappings: p.articleMappings?.map((m) =>
                                        mappings.some((x) => x.id === m.id) ? { ...m, discount: nextDiscount } : m
                                    ),
                                }
                                : p
                        ),
                    }
                    : state.detail,
            }));
            const results = await Promise.all(
                mappings.map((m) => tenderApi.updateArticleMapping(tenderId, position.id, m.id, { discount: nextDiscount }))
            );
            results.forEach((result, index) => {
                const mapping = mappings[index];
                if (mapping) mergeArticleMappingUpdate(position.id, mapping.id, result, { discount: nextDiscount });
            });
            toast.success(t('tenders.bulk_discount_uygulandi'));
        } catch (err: any) {
            setAppliedMappingDiscounts({});
            toast.error(err.response?.data?.error ||t('tenders.bulk_discount_guncellenemedi'));
        } finally {
            setMappingLoadingId(null);
        }
    };

    const renderLong = (text: string) =>
        text.split('\n').flatMap((line, i, arr) => {
            const isBullet = line.trimStart().startsWith('- ');
            const content = isBullet ? line.trimStart().slice(2) : line;
            return [
                isBullet ? <span key={`bullet-${i}`}>• </span> : null,
                <span key={`${i}-text`}>
                    {content.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/(^|[^_])_([^_]+)_/g, '$1$2')}
                </span>,
                ...(i < arr.length - 1 ? [<br key={`br-${i}`} />] : []),
            ];
        });

    return (
        <Card
            title={isArticle ? position.shortDescription :t('tenders.line_detayi')}
            icon={<Tag size={13} />}
            noPadding
            actions={
                <span className="text-[10.5px] text-slate-400 font-mono">
                    {isArticle ?t('tenders.product_detayi') : `Girinti ${position.hierarchyLevel}`}
                </span>
            }
        >
            {/* Position description header — always visible */}
            <div className="px-4 py-3 border-b border-slate-100 space-y-1">
                <div className="flex items-center gap-2">
                    <p className={`flex-1 text-[13px] leading-snug ${position.shortDescription ?"font-medium text-slate-800" : 'text-slate-400'}`}>
                        {position.shortDescription ||t('tenders.description_not_entered')}
                    </p>
                </div>
                {position.longDescription && (
                    <p className="text-[11.5px] text-slate-600 leading-relaxed">
                        {renderLong(position.longDescription)}
                    </p>
                )}
            </div>

            {/* Tabs */}
            {!isArticle && (
                <div className="border-b border-slate-100 flex">
                    <TabBtn active={activeTab === 'calc'} onClick={() => setActiveTab('calc')} icon={<Calculator size={12} />}>{t('tenders.cost')}</TabBtn>
                    <TabBtn active={activeTab === 'articles'} onClick={() => setActiveTab('articles')} icon={<Package size={12} />}>{t('tenders.product')}</TabBtn>
                    <TabBtn active={activeTab === 'meta'} onClick={() => setActiveTab('meta')} icon={<ClipboardList size={12} />}>{t('common.edit')}</TabBtn>
                </div>
            )}

            <div className="p-4 space-y-3">
                {visibleActiveTab === 'calc' && (
                    <>
                        {!isDraft && (
                            <div className="flex items-start gap-2 text-[11.5px] text-amber-800 bg-amber-50 border border-amber-200/60 rounded p-2">
                                <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" />
                                <span>{t('tenders.bu_tender_approved_prices_change_icin')}</span>
                            </div>
                        )}

                        <PositionPricingSection
                            isDraft={isDraft}
                            isArticle={isArticle}
                            pricing={pricing}
                            updatePricing={updatePricing}
                            cost={cost}
                            setCost={setCost}
                            effectiveVat={effectiveVat}
                            pricingGross={pricingGross}
                            pricingDiscountAmount={pricingDiscountAmount}
                            pricingTaxBase={pricingTaxBase}
                            pricingTaxAmount={pricingTaxAmount}
                            pricingTotalWithTax={pricingTotalWithTax}
                            autoSaveDirty={autoSaveDirty}
                            saving={saving}
                        />
                        {isArticle && (
                            <div className="border border-slate-200/70 rounded-[2px] p-3 bg-white space-y-2.5">
                                <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.product_islemi')}</h4>
                                <Button
                                    variant="danger"
                                    icon={<Trash2 size={12} />}
                                    disabled={!isDraft || !position.mappingId}
                                    loading={saving}
                                    onClick={async () => {
                                        if (!position.mappingId) return;
                                        if (!confirm(t('tenders.urunu_tekliften_kaldirilsin_mi', { name: position.shortDescription }))) return;
                                        setSaving(true);
                                        try {
                                            await onRemoveArticleMapping(position.mappingId);
                                            toast.success(t('tenders.product_from_tender_removed'));
                                        } catch (err: any) {
                                            toast.error(err.response?.data?.error ||t('tenders.action_tamamlanamadi'));
                                        } finally {
                                            setSaving(false);
                                        }
                                    }}
                                    className="w-full"
                                >{t('tenders.tender_kaldir')}</Button>
                            </div>
                        )}

                        {!isArticle && (
                            <PositionAdvancedCostSection
                                isDraft={isDraft}
                                canCalc={canCalc}
                                cost={cost}
                                setCost={setCost}
                                marginMode={marginMode}
                                setMarginMode={setMarginMode}
                                marginPercent={marginPercent}
                                setMarginPercent={setMarginPercent}
                                subtotal={subtotal}
                                total={total}
                                effectiveVat={effectiveVat}
                                totalWithTax={totalWithTax}
                                position={position}
                                unitPrice={unitPrice}
                            />
                        )}
                    </>
                )}

                {visibleActiveTab === 'articles' && (
                    <PositionArticleMappingsSection
                        position={position}
                        isDraft={isDraft}
                        stockArticles={stockArticles}
                        stockArticlesLoading={stockArticlesLoading}
                        stockArticlesLoaded={stockArticlesLoaded}
                        selectedStockArticle={selectedStockArticle}
                        articleId={articleId}
                        setArticleId={setArticleId}
                        articleQty={articleQty}
                        setArticleQty={setArticleQty}
                        articleDiscount={articleDiscount}
                        setArticleDiscount={setArticleDiscount}
                        bulkMappingDiscount={bulkMappingDiscount}
                        setBulkMappingDiscount={setBulkMappingDiscount}
                        mappingLoadingId={mappingLoadingId}
                        appliedMappingDiscounts={appliedMappingDiscounts}
                        mappingDiscountDrafts={mappingDiscountDrafts}
                        hiddenMappingIds={hiddenMappingIds}
                        saving={saving}
                        setSaving={setSaving}
                        applyBulkMappingDiscount={applyBulkMappingDiscount}
                        queueArticleMappingDiscount={queueArticleMappingDiscount}
                        onMapArticle={onMapArticle}
                        onSelectArticleMapping={onSelectArticleMapping}
                        renderLong={renderLong}
                    />
                )}
                {visibleActiveTab === 'meta' && (
                    <MetaEditTab
                        position={position}
                        tenderId={tenderId}
                        isDraft={isDraft}
                    />
                )}
            </div>
        </Card>
    );
};


const MetaEditTab: React.FC<{
    position: PositionDto;
    tenderId: string;
    isDraft: boolean;
}> = ({ position, tenderId, isDraft }) => {
    const { updatePosition } = useTenderStore();
    const [desc, setDesc] = useState(position.shortDescription);
    const [longDesc, setLongDesc] = useState(position.longDescription || '');
    const [imageUrl, setImageUrl] = useState<string | null>(position.imageUrl || null);
    // Tracks an explicit image change in THIS panel. The tender detail is loaded
    // image-less, so comparing against position.imageUrl is meaningless — and
    // unconditionally sending imageUrl both wiped stored images on unrelated edits
    // and re-uploaded base64 blobs with every save.
    const [imageDirty, setImageDirty] = useState(false);
    const [saving, setSaving] = useState(false);
    const [uploadingImg, setUploadingImg] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        setDesc(position.shortDescription);
        setLongDesc(position.longDescription || '');
        setImageUrl(position.imageUrl || null);
        setImageDirty(false);
    }, [position.id]);

    const hasChanges =
        desc !== position.shortDescription
        || longDesc !== (position.longDescription || '')
        || imageDirty;

    const handleImageFile = (file: File) => {
        if (!file.type.startsWith('image/')) {
            toast.error(t('tenders.only_gorsel_dosyalar_yuklenebilir'));
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            toast.error(t('tenders.gorsel_2mb_tan_buyuk_olamaz'));
            return;
        }
        setUploadingImg(true);
        const reader = new FileReader();
        reader.onload = () => {
            setImageUrl(reader.result as string);
            setImageDirty(true);
            setUploadingImg(false);
        };
        reader.onerror = () => {
            toast.error(t('tenders.gorsel_okunamadi'));
            setUploadingImg(false);
        };
        reader.readAsDataURL(file);
    };

    const save = async () => {
        setSaving(true);
        try {
            await updatePosition(tenderId, position.id, {
                shortDescription: desc.trim(),
                longDescription: longDesc || null,
                // Only ship the image when it was actually changed here.
                ...(imageDirty ? { imageUrl } : {}),
            });
            setImageDirty(false);
            toast.success(t('tenders.updated'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.kaydedilemedi'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono">
                <span>{t('tenders.girinti')}{position.hierarchyLevel}</span>
            </div>

            {/* Position Image */}
            <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">{t('tenders.gorsel')}</div>
                <div className="flex items-start gap-3">
                    <div className="w-20 h-20 border border-slate-200 rounded-[2px] bg-slate-50/60 flex items-center justify-center overflow-hidden shrink-0">
                        {imageUrl ? (
                            <img src={imageUrl} alt="Satır görseli" className="w-full h-full object-cover" />
                        ) : (
                            <ImageIcon size={20} className="text-slate-300" />
                        )}
                    </div>
                    {isDraft && (
                        <div className="flex-1 flex flex-col gap-1.5">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept="image/*"
                                className="hidden"
                                onChange={(e) => {
                                    const f = e.target.files?.[0];
                                    if (f) handleImageFile(f);
                                    e.target.value = '';
                                }}
                            />
                            <Button
                                variant="secondary"
                                size="sm"
                                icon={<ImageIcon size={11} />}
                                loading={uploadingImg}
                                onClick={() => fileInputRef.current?.click()}
                            >
                                {imageUrl ?t('tenders.degistir') :t('tenders.gorsel_yukle')}
                            </Button>
                            {imageUrl && (
                                <button
                                    type="button"
                                    className="text-[11px] text-red-600 hover:text-red-700 self-start"
                                    onClick={() => { setImageUrl(null); setImageDirty(true); }}
                                >{t('common.remove')}</button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            <Field label={t('common.description')}>
                <Input
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    disabled={!isDraft}
                />
            </Field>

            <div>
                <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.line_content')}</span>
                </div>
                {isDraft ? (
                    <RichTextMarkdownEditor
                        value={longDesc}
                        onChange={setLongDesc}
                        minHeight={120}
                        className="focus-within:border-blue-400"
                        placeholder={t('tenders.baslik_veya_description_yazin')}
                    />
                ) : longDesc ? (
                    <div
                        className="rounded-[2px] border border-slate-200 bg-white p-3 text-[13px] leading-6 text-slate-800 [&_h2]:my-1 [&_h2]:text-[15px] [&_h2]:font-bold [&_h3]:my-1 [&_h3]:text-[13.5px] [&_h3]:font-semibold [&_ul]:list-disc [&_ul]:pl-7 [&_li]:pl-1"
                        dangerouslySetInnerHTML={{ __html: richTextToHtml(longDesc) }}
                    />
                ) : (
                    <div className="text-slate-400 text-[12px]">{t('tenders.line_content_not_found')}</div>
                )}
            </div>

            {isDraft && hasChanges && (
                <Button variant="primary" icon={<Save size={13} />} loading={saving} onClick={save} className="w-full">{t('tenders.degisiklikleri_kaydet')}</Button>
            )}
        </div>
    );
};

