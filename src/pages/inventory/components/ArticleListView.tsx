import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { articleApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ArticleListItem, ItemType } from '@/types/inventory';
import { FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, SortableTh, TableStateRow } from './primitives';
import { PRODUCTS_PAGE_SIZE, useArticlesList } from '../hooks/useArticlesList';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { fmtMoney, fmtQty } from '../utils/format';

/**
 * Ürün ve malzeme listelerinin ortak gövdesi — ikisi de aynı Article tablosunda
 * yaşar, yalnızca `itemType` ve metin anahtarları değişir. Kolon düzeni, filtreler
 * ve satır işlemleri bilerek birebir aynıdır; tek bir yerde durur ki iki ekran
 * zamanla birbirinden ayrışmasın.
 *
 * Aktif/pasif DURUM kolonu kaldırıldı (kullanıcı isteği 2026-07-31): ürün ve
 * malzemelerin aktiflik kavramı yok. Satıra tıklamak artık ürün detayını açar.
 */
export const ArticleListView = ({
    itemType,
    copyPrefix,
    createPath,
    detailPath,
}: {
    itemType: ItemType;
    /** 'inv.products' | 'inv.materials' — aynı yaprak adlarını taşırlar. */
    copyPrefix: string;
    createPath: string;
    /** Satıra tıklanınca açılacak detay kökü ('/inventory/articles'). */
    detailPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useArticlesList(itemType);
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canDelete = permissions.includes('inventory.articles.delete');

    const [busyId, setBusyId] = useState<string | null>(null);

    const codeLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialCode' : 'inv.columns.serialCode');
    const nameLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialName' : 'inv.columns.productName');

    const remove = async (article: ArticleListItem) => {
        if (!window.confirm(t(`${copyPrefix}.deleteConfirm`, { name: article.name }))) return;
        setBusyId(article.id);
        try {
            await articleApi.delete(article.id);
            toast.success(t(`${copyPrefix}.deleted`));
            list.reload();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t(`${copyPrefix}.deleteFailed`));
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t(`${copyPrefix}.title`)}
                action={canCreate && (
                    <button
                        type="button"
                        onClick={() => navigate(createPath)}
                        className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t(`${copyPrefix}.addButton`)}
                    </button>
                )}
            />

            <div className="flex flex-wrap items-center gap-2">
                <SearchBox
                    value={list.search}
                    onChange={list.setSearch}
                    placeholder={t(`${copyPrefix}.searchPlaceholder`)}
                    className="w-64"
                />
            </div>

            <SectionCard title={t(`${copyPrefix}.sectionTitle`, { count: list.total })}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <SortableTh label={codeLabel} sortKey="articleCode" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-40 text-left" />
                            <SortableTh label={nameLabel} sortKey="name" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" />
                            <SortableTh label={t('inv.columns.currentStock')} sortKey="totalQuantity" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-32 text-right" />
                            <SortableTh label={t('inv.columns.salePrice')} sortKey="salePrice" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-36 text-right" />
                            <th className="w-24 text-right" />
                        </tr>
                        {/* Kolon filtre satırı — eski listeyle aynı kriterler (kod / ad). */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input
                                    value={list.filters.code}
                                    onChange={(event) => list.setFilters({ ...list.filters, code: event.target.value })}
                                    placeholder={t('inv.filters.code')}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th className="pb-1.5">
                                <input
                                    value={list.filters.name}
                                    onChange={(event) => list.setFilters({ ...list.filters, name: event.target.value })}
                                    placeholder={t('inv.filters.name')}
                                    className={FILTER_INPUT_CLASS}
                                />
                            </th>
                            <th colSpan={3} />
                        </tr>
                    </thead>
                    <tbody>
                        {(list.loading || list.items.length === 0) && (
                            <TableStateRow colSpan={5} loading={list.loading} emptyText={list.error || t(`${copyPrefix}.empty`)} />
                        )}
                        {!list.loading && list.items.map((article) => {
                            const critical = article.criticalStockLevel > 0 && article.totalQuantity <= article.criticalStockLevel;
                            return (
                                <tr
                                    key={article.id}
                                    onClick={() => navigate(`${detailPath}/${article.id}`)}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article.articleCode}</td>
                                    <td className="text-slate-800 dark:text-white">{article.name}</td>
                                    <td className={`text-right font-mono text-[13px] ${critical ? 'font-bold text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-white/80'}`}>
                                        {fmtQty(article.totalQuantity)} {article.unit}
                                    </td>
                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoney(article.salePrice)}</td>
                                    <td className="text-right">
                                        {canDelete && (
                                            <button
                                                type="button"
                                                aria-label={t(`${copyPrefix}.delete`)}
                                                disabled={busyId === article.id}
                                                // Satır tıklaması detayı açar; silme onu tetiklememeli.
                                                onClick={(event) => { event.stopPropagation(); void remove(article); }}
                                                className="inline-flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-500/15"
                                            >
                                                <Trash01 size={13} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={list.page}
                        totalPages={list.totalPages}
                        total={list.total}
                        pageSize={PRODUCTS_PAGE_SIZE}
                        onPage={list.setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
