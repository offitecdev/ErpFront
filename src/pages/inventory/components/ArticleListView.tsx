import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { articleApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ArticleListItem, ArticleStatus, ItemType } from '@/types/inventory';
import { FILTER_INPUT_CLASS, Pager, SearchBox, SectionCard, SortableTh, TableStateRow } from './primitives';
import { PRODUCTS_PAGE_SIZE, useArticlesList } from '../hooks/useArticlesList';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { fmtMoney, fmtQty } from '../utils/format';

const STATUS_META: Record<ArticleStatus, { labelKey: string; className: string }> = {
    ACTIVE: { labelKey: 'inv.status.active', className: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300' },
    INACTIVE: { labelKey: 'inv.status.inactive', className: 'bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-white/60' },
    IN_SUPPLY: { labelKey: 'inv.status.inSupply', className: 'bg-sky-50 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300' },
    IN_PRODUCTION: { labelKey: 'inv.status.inProduction', className: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300' },
};

/**
 * Ürün ve malzeme listelerinin ortak gövdesi — ikisi de aynı Article tablosunda
 * yaşar, yalnızca `itemType` ve metin anahtarları değişir. Kolon düzeni, filtreler
 * ve satır işlemleri bilerek birebir aynıdır; tek bir yerde durur ki iki ekran
 * zamanla birbirinden ayrışmasın.
 */
export const ArticleListView = ({
    itemType,
    copyPrefix,
    createPath,
}: {
    itemType: ItemType;
    /** 'inv.products' | 'inv.materials' — aynı yaprak adlarını taşırlar. */
    copyPrefix: string;
    createPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useArticlesList(itemType);
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canUpdate = permissions.includes('inventory.articles.update');
    const canDelete = permissions.includes('inventory.articles.delete');

    const [busyId, setBusyId] = useState<string | null>(null);

    const codeLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialCode' : 'inv.columns.serialCode');
    const nameLabel = t(itemType === 'MATERIAL' ? 'inv.columns.materialName' : 'inv.columns.productName');

    const toggleStatus = async (article: ArticleListItem) => {
        const nextStatus: ArticleStatus = article.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
        setBusyId(article.id);
        try {
            await articleApi.update(article.id, { status: nextStatus, isActive: nextStatus === 'ACTIVE' });
            list.reload();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t(`${copyPrefix}.statusUpdateFailed`));
        } finally {
            setBusyId(null);
        }
    };

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
                <select
                    value={list.status}
                    onChange={(event) => list.setStatus(event.target.value)}
                    aria-label={t('inv.columns.status')}
                    className="h-9 rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t(`${copyPrefix}.allStatuses`)}</option>
                    {(Object.keys(STATUS_META) as ArticleStatus[]).map((status) => (
                        <option key={status} value={status}>{t(STATUS_META[status].labelKey)}</option>
                    ))}
                </select>
            </div>

            <SectionCard title={t(`${copyPrefix}.sectionTitle`, { count: list.total })}>
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <SortableTh label={codeLabel} sortKey="articleCode" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-40 text-left" />
                            <SortableTh label={nameLabel} sortKey="name" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" />
                            <SortableTh label={t('inv.columns.currentStock')} sortKey="totalQuantity" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-32 text-right" />
                            <SortableTh label={t('inv.columns.salePrice')} sortKey="salePrice" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="w-36 text-right" />
                            <th className="w-32 text-left">{t('inv.columns.status')}</th>
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
                            <th colSpan={4} />
                        </tr>
                    </thead>
                    <tbody>
                        {(list.loading || list.items.length === 0) && (
                            <TableStateRow colSpan={6} loading={list.loading} emptyText={list.error || t(`${copyPrefix}.empty`)} />
                        )}
                        {!list.loading && list.items.map((article) => {
                            const meta = STATUS_META[article.status] ?? STATUS_META.ACTIVE;
                            const critical = article.criticalStockLevel > 0 && article.totalQuantity <= article.criticalStockLevel;
                            return (
                                <tr key={article.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article.articleCode}</td>
                                    <td className="text-slate-800 dark:text-white">{article.name}</td>
                                    <td className={`text-right font-mono text-[13px] ${critical ? 'font-bold text-red-600 dark:text-red-400' : 'text-slate-700 dark:text-white/80'}`}>
                                        {fmtQty(article.totalQuantity)} {article.unit}
                                    </td>
                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoney(article.salePrice)}</td>
                                    <td>
                                        <button
                                            type="button"
                                            disabled={!canUpdate || busyId === article.id}
                                            title={canUpdate ? t(`${copyPrefix}.toggleStatus`) : undefined}
                                            onClick={() => canUpdate && void toggleStatus(article)}
                                            className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className} ${canUpdate ? 'cursor-pointer' : 'cursor-default'}`}
                                        >
                                            {t(meta.labelKey)}
                                        </button>
                                    </td>
                                    <td className="text-right">
                                        {canDelete && (
                                            <button
                                                type="button"
                                                aria-label={t(`${copyPrefix}.delete`)}
                                                disabled={busyId === article.id}
                                                onClick={() => void remove(article)}
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
