import React from 'react';

import {
    Image01 as ImageIcon,
    Package,
    Plus,
} from '@/components/icons/antIconCompat';
import { Button } from '../../../../../components/ui-shared/Button';
import { Field, Input, Select } from '../../../../../components/ui-shared/Field';
import type { ArticleStockSummary } from '../../../../../types/inventory';
import {
    FIXED_VAT,
    fmtMoney,
    fmtNumber,
    fmtVatRate,
    lineTotalWithTax,
    type TreeNode,
} from '../../tenderDetailUtils';
import { t } from '@/i18n/translate';
import { getArticlePrice } from '../../utils/positionDetail.utils';

export const PositionArticleMappingsSection: React.FC<{
    position: TreeNode;
    isDraft: boolean;
    stockArticles: ArticleStockSummary[];
    stockArticlesLoading: boolean;
    stockArticlesLoaded: boolean;
    selectedStockArticle: ArticleStockSummary | null;
    articleId: string;
    setArticleId: React.Dispatch<React.SetStateAction<string>>;
    articleQty: number;
    setArticleQty: React.Dispatch<React.SetStateAction<number>>;
    articleDiscount: number;
    setArticleDiscount: React.Dispatch<React.SetStateAction<number>>;
    bulkMappingDiscount: number;
    setBulkMappingDiscount: React.Dispatch<React.SetStateAction<number>>;
    mappingLoadingId: string | null;
    appliedMappingDiscounts: Record<string, number>;
    mappingDiscountDrafts: Record<string, number>;
    hiddenMappingIds: Record<string, boolean>;
    saving: boolean;
    setSaving: React.Dispatch<React.SetStateAction<boolean>>;
    applyBulkMappingDiscount: () => Promise<void>;
    queueArticleMappingDiscount: (mappingId: string, nextDiscount: number) => void;
    onMapArticle: (articleId: string, qty: number, opts?: { discount?: number }) => Promise<void>;
    onSelectArticleMapping: (mappingId: string) => void;
    renderLong: (text: string) => React.ReactNode;
}> = ({
    position,
    isDraft,
    stockArticles,
    stockArticlesLoading,
    stockArticlesLoaded,
    selectedStockArticle,
    articleId,
    setArticleId,
    articleQty,
    setArticleQty,
    articleDiscount,
    setArticleDiscount,
    bulkMappingDiscount,
    setBulkMappingDiscount,
    mappingLoadingId,
    appliedMappingDiscounts,
    mappingDiscountDrafts,
    hiddenMappingIds,
    saving,
    setSaving,
    applyBulkMappingDiscount,
    queueArticleMappingDiscount,
    onMapArticle,
    onSelectArticleMapping,
    renderLong,
}) => (
    <>
        <div className="text-[11.5px] text-slate-500 leading-relaxed">{t('tenders.stock_urunden_tender_line_create_burada')}</div>

        {/* Currently bound articles */}
        {position.articleMappings && position.articleMappings.length > 0 && (
            <div className="border border-slate-200/70 rounded-md bg-white">
                <div className="px-3 py-2 border-b border-slate-100 flex items-center justify-between">
                    <h4 className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">{t('tenders.linked_products')}{position.articleMappings.length})
                    </h4>
                    <span className="text-[10px] text-slate-400">{t('tenders.old_baglanti_record')}</span>
                </div>
                {isDraft && (
                    <div className="px-3 py-2 border-b border-slate-100 bg-slate-50/40 grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-end">
                        <Field label={t('tenders.bulk_discount')}>
                            <Input
                                type="number"
                                step="0.1"
                                min={0}
                                max={100}
                                value={bulkMappingDiscount}
                                onChange={(e) => setBulkMappingDiscount(parseFloat(e.target.value) || 0)}
                            />
                        </Field>
                        <Button
                            variant="secondary"
                            loading={mappingLoadingId === '__bulk__'}
                            onClick={applyBulkMappingDiscount}
                        >{t('tenders.bulk_discounti_apply')}</Button>
                    </div>
                )}
                <ul className="divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                    {position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).map((m) => {
                        const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                        const discountedNet = m.article ? m.quantityMultiplier * getArticlePrice(m.article) * (1 - appliedDiscount / 100) : 0;
                        return (
                            <li
                                key={m.id}
                                className="px-3 py-2 flex flex-wrap items-center gap-2 cursor-pointer hover:bg-blue-50/40 transition-colors"
                                onClick={() => onSelectArticleMapping(m.id)}
                            >
                                <div className="w-9 h-9 rounded bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400 shrink-0">
                                    <Package size={12} />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                        <div className="text-[12px] font-semibold text-slate-800 truncate">{m.article?.name ?? '—'}</div>
                                        {/* Sabit KDV badge — açık gri */}
                                        <span
                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[9.5px] font-semibold bg-slate-100 text-slate-500 border border-slate-200 font-mono shrink-0"
                                            title={t('tenders.fixed_kdv_orani')}
                                        >{t('tenders.kdv')}{fmtVatRate((position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT)}
                                        </span>
                                    </div>
                                    <div className="text-[10.5px] font-mono text-slate-500">
                                        {m.article?.articleCode ?? '—'} · {m.quantityMultiplier} {m.article?.unit ?? 'adet'} × {m.article ? fmtMoney(getArticlePrice(m.article)) : '—'}
                                    </div>
                                    {false && (
                                        <div className="mt-1 text-[11.5px] text-slate-600 leading-relaxed line-clamp-3">
                                            {renderLong('')}
                                        </div>
                                    )}
                                </div>
                                <div className="text-right shrink-0">
                                    <div className="text-[11.5px] font-mono font-semibold text-slate-700">
                                        {m.article ? fmtMoney(lineTotalWithTax(discountedNet, (position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT)) : '—'}
                                    </div>
                                    <div className="text-[9.5px] text-slate-400 font-mono">{t('tenders.net')}{m.article ? fmtMoney(discountedNet) : '—'}
                                    </div>
                                </div>
                                {isDraft && (
                                    <div className="basis-full grid grid-cols-1 gap-2 items-end">
                                        <Field label={t('tenders.discount')}>
                                            <Input
                                                type="number"
                                                step="0.1"
                                                min={0}
                                                max={100}
                                                value={mappingDiscountDrafts[m.id] ?? appliedDiscount}
                                                onChange={(e) => queueArticleMappingDiscount(m.id, parseFloat(e.target.value) || 0)}
                                            />
                                        </Field>
                                    </div>
                                )}
                            </li>
                        );
                    })}
                </ul>
                <div className="px-3 py-2 border-t border-slate-100 bg-slate-50/40 flex items-center justify-between text-[11.5px]">
                    <span className="text-slate-600 font-medium">{t('inventory.dashboard.totalProducts')}</span>
                    <span className="font-mono font-bold text-slate-800">
                        {fmtMoney(position.articleMappings.filter((m) => !hiddenMappingIds[m.id]).reduce((s, m) => {
                            const appliedDiscount = appliedMappingDiscounts[m.id] ?? m.discount ?? 0;
                            const vatRate = (position.taxRate != null && position.taxRate > 0) ? position.taxRate : FIXED_VAT;
                            return s + (m.article ? lineTotalWithTax(m.quantityMultiplier * getArticlePrice(m.article) * (1 - appliedDiscount / 100), vatRate) : 0);
                        }, 0))}
                    </span>
                </div>
            </div>
        )}

        {selectedStockArticle && (
            <div className="flex items-center gap-2 p-2 bg-slate-50/60 border border-slate-200/60 rounded">
                {selectedStockArticle.imageUrl ? (
                    <img src={selectedStockArticle.imageUrl} alt="" className="w-10 h-10 rounded object-cover border border-slate-200" />
                ) : (
                    <div className="w-10 h-10 rounded bg-white border border-slate-200 flex items-center justify-center text-slate-400">
                        <ImageIcon size={14} />
                    </div>
                )}
                <div className="min-w-0 flex-1">
                    <div className="text-[12.5px] font-semibold text-slate-800 truncate">{selectedStockArticle.name}</div>
                    <div className="text-[10.5px] font-mono text-slate-500">
                        {selectedStockArticle.articleCode} · {fmtMoney(getArticlePrice(selectedStockArticle))}/{selectedStockArticle.unit}
                    </div>
                    <div className="text-[10.5px] text-slate-500 mt-0.5">{"Toplam mevcut:"}<span className="font-mono font-medium text-slate-700">{fmtNumber(selectedStockArticle.totalQuantity)} {selectedStockArticle.unit}</span>
                    </div>
                </div>
            </div>
        )}

        <div className="space-y-2">
            <Field label={t('tenders.select_product_from_stock')}>
                <Select
                    value={articleId}
                    onChange={(e) => setArticleId(e.target.value)}
                    disabled={stockArticlesLoading}
                >
                    <option value="">{t('tenders.product_select')}</option>
                    {stockArticles.map((article) => (
                        <option key={article.id} value={article.id}>
                            {article.articleCode} · {article.name}{t('tenders.mevcut')}{fmtNumber(article.totalQuantity)} {article.unit}
                        </option>
                    ))}
                </Select>
                {stockArticlesLoading && (
                    <p className="mt-1 text-[11px] text-slate-400">{t('tenders.productler_loading')}</p>
                )}
                {stockArticlesLoaded && stockArticles.length === 0 && (
                    <p className="mt-1 text-[11px] text-slate-400">{t('tenders.registered_product_not_found')}</p>
                )}
            </Field>
            <Field label={t('tenders.quantity_kullanilacak')}>
                <Input type="number" step="1" min={1} value={articleQty}
                    onChange={(e) => setArticleQty(parseInt(e.target.value, 10) || 0)} />
            </Field>
            <Field label={t('tenders.discount')}>
                <Input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    value={articleDiscount}
                    onChange={(e) => setArticleDiscount(parseFloat(e.target.value) || 0)}
                />
            </Field>


        </div>
        <div className="flex gap-2">
            <Button
                variant="primary"
                icon={<Plus size={12} />}
                disabled={!isDraft || stockArticlesLoading || !articleId || articleQty <= 0}
                loading={saving}
                onClick={async () => {
                    setSaving(true);
                    try {
                        await onMapArticle(articleId, articleQty, {
                            discount: articleDiscount,
                        });
                        setArticleId('');
                        setArticleQty(1);
                        setArticleDiscount(0);
                    } catch (err) {
                        // error is surfaced by store/onMapArticle (toast)
                    } finally {
                        setSaving(false);
                    }
                }}
                className="flex-1"
            >{t('tenders.product_add')}</Button>
        </div>
    </>
);
