import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Plus, Trash01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { t } from '@/i18n/translate';
import { articleApi } from '@/lib/api/inventory';
import { useAuthStore } from '@/store/authStore';
import type { ArticleListItem } from '@/types/inventory';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { PRODUCTS_PAGE_SIZE, useArticlesList } from '../hooks/useArticlesList';
import { useLanguageTick } from '../hooks/useLanguageTick';
import { fmtMoney, fmtQty } from '../utils/format';

// Sürüklenebilir sütun genişlikleri. Ad sütunu burada YOKTUR: genişliği olmayan
// tek sütun odur ve artan yeri o emer.
const ARTICLE_LIST_COLUMN_WIDTHS = {
    code: 160,
    stock: 128,
    price: 144,
    actions: 96,
};
type ArticleListColumn = keyof typeof ARTICLE_LIST_COLUMN_WIDTHS;

/**
 * Ürün listesi — malzeme/ürün birleşmesinden (2026-08-14) beri TEK listedir:
 * eski malzemeler de burada yaşar, ürün/hizmet ayrımı satırdaki "Dienstleistung"
 * rozetiyle görünür (detay ekranındaki anahtar).
 *
 * Aktif/pasif DURUM kolonu kaldırıldı (kullanıcı isteği 2026-07-31): ürünlerin
 * aktiflik kavramı yok. Satıra tıklamak artık ürün detayını açar.
 */
export const ArticleListView = ({
    copyPrefix,
    createPath,
    bulkCreatePath,
    detailPath,
}: {
    /** 'inv.products' — metin yaprağı. */
    copyPrefix: string;
    createPath: string;
    /** Toplu ekleme tablosunun yolu — "Ekle"nin ALTINDA ikinci düğme olarak çıkar. */
    bulkCreatePath: string;
    /** Satıra tıklanınca açılacak detay kökü ('/inventory/articles'). */
    detailPath: string;
}) => {
    useLanguageTick();
    const navigate = useNavigate();
    const list = useArticlesList();
    const permissions = useAuthStore((state) => state.permissions);
    const canCreate = permissions.includes('inventory.articles.create');
    const canDelete = permissions.includes('inventory.articles.delete');

    const [busyId, setBusyId] = useState<string | null>(null);

    // Sürüklenebilir sütunlar: ad sütununun genişliği yoktur, kalan yeri o emer.
    // Koddaki tutamaç SAĞ kenardadır (ad sütununun solunda kaldığı için).
    const grid = useColumnWidths<ArticleListColumn>({
        storageKey: 'offitec:inv-articles:col-widths:v2',
        defaults: ARTICLE_LIST_COLUMN_WIDTHS,
        minPx: 72,
    });

    const codeLabel = t('inv.columns.serialCode');
    const nameLabel = t('inv.columns.productName');

    const remove = async (article: ArticleListItem) => {
        if (!window.confirm(t(`${copyPrefix}.deleteConfirm`, { name: article.name }))) return;
        setBusyId(article.id);
        try {
            await articleApi.delete(article.id);
            toast.success(t(`${copyPrefix}.deleted`));
            // Satır BEKLEMEDEN düşer (kullanıcı isteği 2026-08-07): tablo
            // "yükleniyor" durumuna girmez. Sayfanın 15'e tamamlanması (ve son
            // sayfadaki son satırda bir önceki sayfaya dönüş) arkada sessizce olur.
            const wasLastRowOnPage = list.items.length === 1;
            list.removeItem(article.id);
            if (wasLastRowOnPage && list.page > 1) list.setPage(list.page - 1);
            else list.reload({ silent: true });
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
                    // Tekli ekleme üstte, toplu ekleme hemen ALTINDA (kullanıcı
                    // isteği 2026-08-07): iki ayrı sayfaya giden iki düğme.
                    <div className="flex flex-col items-stretch gap-1.5">
                        <button
                            type="button"
                            onClick={() => navigate(createPath)}
                            className="ofi-btn-brand flex items-center justify-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                        >
                            <Plus size={14} />
                            {t(`${copyPrefix}.addButton`)}
                        </button>
                        <button
                            type="button"
                            onClick={() => navigate(bulkCreatePath)}
                            className="flex items-center justify-center gap-1.5 rounded-md border border-slate-300 px-3.5 py-1.5 text-[12px] font-semibold text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/70 dark:hover:text-white"
                        >
                            <Plus size={13} />
                            {t(`${copyPrefix}.bulkAddButton`)}
                        </button>
                    </div>
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
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col ref={grid.setColRef('code')} style={{ width: grid.widths.code }} />
                        {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['stock', 'price', 'actions'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={codeLabel} sortKey="articleCode" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" {...grid.resizeProps('code', 'right')} />
                            <SortableTh label={nameLabel} sortKey="name" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-left" />
                            <SortableTh label={t('inv.columns.currentStock')} sortKey="totalQuantity" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-right" {...grid.resizeProps('stock')} />
                            <SortableTh label={t('inv.columns.salePrice')} sortKey="salePrice" activeKey={list.sort.by} direction={list.sort.direction} onSort={list.toggleSort} className="text-right" {...grid.resizeProps('price')} />
                            <th className="relative text-right">
                                <ColResizeHandle {...grid.resizeProps('actions')} />
                            </th>
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
                            {/* Filtresi olmayan sütunlar kendi (boş) hücrelerini
                                alır ki sütun çizgileri burada da kesilmesin. */}
                            <th />
                            <th />
                            <th />
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
                                    <td className="text-slate-800 dark:text-white">
                                        <span className="flex items-center gap-2">
                                            {article.name}
                                            {/* Hizmet olarak işaretli kalemler listede rozetle ayrışır. */}
                                            {article.itemType === 'SERVICE' && (
                                                <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-semibold text-sky-700 dark:bg-sky-500/15 dark:text-sky-300">
                                                    {t('inv.detail.kindService')}
                                                </span>
                                            )}
                                        </span>
                                    </td>
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
