import { createPortal } from 'react-dom';
import { X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ArticleListItem, ItemType } from '@/types/inventory';
import { useArticleSearch } from '../hooks/useArticleSearch';
import { fmtQty } from '../utils/format';
import { ColResizeHandle, Pager, ResizableCols, SearchBox, TableStateRow } from './primitives';
import { useColumnWidths } from '@/hooks/useColumnWidths';

const PAGE_SIZE = 12;

/**
 * "Tüm ürünler" — satır içi kısa listenin altındaki bağlantıdan açılan geniş
 * pencere. Günlük seçim hücrede yapılır; bu pencere yalnızca tam listeye
 * bakmak (arama + sayfalama) için vardır.
 */
export const ArticlePickerModal = ({
    open,
    onClose,
    onPick,
    itemType,
    title,
}: {
    open: boolean;
    onClose: () => void;
    onPick: (article: ArticleListItem) => void;
    itemType?: ItemType;
    /** Başlık türe göre değişir (Tüm Ürünler / Tüm Malzemeler). */
    title?: string;
}) => {
    const { items, total, totalPages, page, setPage, loading, query, setQuery } = useArticleSearch(PAGE_SIZE, open, itemType);
    // Sürüklenebilir sütunlar; ad sütununun genişliği yoktur, kalanı o emer.
    // (Kanca erken `return`'den ÖNCE çağrılmalı.)
    const grid = useColumnWidths({
        storageKey: 'offitec:inv-article-picker:col-widths:v1',
        defaults: { code: 160, unit: 88, stock: 112 },
        minPx: 64,
    });

    if (!open) return null;

    const close = () => {
        setQuery('');
        onClose();
    };

    const pick = (article: ArticleListItem) => {
        onPick(article);
        close();
    };

    return createPortal(
        <div className="fixed inset-0 z-[130] flex items-center justify-center px-3">
            <div
                className="absolute inset-0 bg-slate-950/30 dark:bg-black/55"
                onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}
            />
            <section
                role="dialog"
                aria-modal="true"
                className="ofi-rise-in relative flex max-h-[86vh] w-full max-w-[880px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl dark:border-white/15 dark:bg-[#151616]"
            >
                <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                    <h3 className="text-[13.5px] font-bold text-slate-900 dark:text-white">{title ?? t('inv.productPicker.allTitle')}</h3>
                    <button
                        type="button"
                        aria-label={t('common.close')}
                        onClick={close}
                        className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors"
                    >
                        <X size={15} />
                    </button>
                </header>

                <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                    <SearchBox value={query} onChange={setQuery} placeholder={t('inv.productPicker.searchPlaceholder')} autoFocus />
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <ResizableCols keys={['code'] as const} grid={grid} />
                            {/* Ad sütunu: genişliği yok, kalan yeri emer. */}
                            <col />
                            <ResizableCols keys={['unit', 'stock'] as const} grid={grid} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="relative text-left">
                                    {t('inv.columns.serialCode')}
                                    <ColResizeHandle {...grid.resizeProps('code', 'right')} />
                                </th>
                                <th className="text-left">{t('inv.columns.productName')}</th>
                                <th className="relative text-left">
                                    {t('inv.columns.unit')}
                                    <ColResizeHandle {...grid.resizeProps('unit')} />
                                </th>
                                <th className="relative text-right">
                                    {t('inv.columns.currentStock')}
                                    <ColResizeHandle {...grid.resizeProps('stock')} />
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || items.length === 0) && (
                                <TableStateRow colSpan={4} loading={loading} emptyText={t('inv.productPicker.empty')} />
                            )}
                            {!loading && items.map((article) => (
                                <tr
                                    key={article.id}
                                    onClick={() => pick(article)}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                >
                                    <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{article.articleCode}</td>
                                    <td className="text-slate-800 dark:text-white">{article.name}</td>
                                    <td className="text-slate-500 dark:text-white/60">{article.unit}</td>
                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtQty(article.totalQuantity)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </section>
        </div>,
        document.body,
    );
};
