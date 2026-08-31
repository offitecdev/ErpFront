import { ChevronLeft, ChevronRight, File05, Package, SearchLg, Tag01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ArticleQuickPick } from '@/types/inventory';

import { PRODUCT_PICKER_PAGE_SIZE } from '../utils/tenderDetail.constants';
import { PopupButton, PopupEmpty, TenderFloatCard } from './shell/TenderPopupShell';

type ProductPickerPopupProps = {
    open: boolean;
    onClose: () => void;
    productSearch: string;
    onSearchChange: (value: string) => void;
    loading: boolean;
    items: ArticleQuickPick[];
    total: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onCreateManualProduct: () => void;
    onCreateStockArticle: () => void;
    onSelectArticle: (article: ArticleQuickPick) => void;
};

/**
 * "Add product" — search the catalogue, click a row to copy it into the quote.
 * A floating card: the quote table stays visible beside it, so the user sees
 * where the line will land. Empty result → the two ways to create the product.
 */
export const ProductPickerPopup = ({
    open,
    onClose,
    productSearch,
    onSearchChange,
    loading,
    items,
    total,
    currentPage,
    onPageChange,
    onCreateManualProduct,
    onCreateStockArticle,
    onSelectArticle,
}: ProductPickerPopupProps) => {
    // "No results" only after a completed fetch — while loading we show the hint.
    const isEmpty = !loading && items.length === 0;
    const totalPages = Math.max(1, Math.ceil(total / PRODUCT_PICKER_PAGE_SIZE));
    const from = total === 0 ? 0 : (currentPage - 1) * PRODUCT_PICKER_PAGE_SIZE + 1;
    const to = Math.min(total, currentPage * PRODUCT_PICKER_PAGE_SIZE);

    return (
        <TenderFloatCard
            open={open}
            onClose={onClose}
            title={t('tenders.product_add')}
            subtitle={t('tenders.stock_product_select_info_tender_kopyalanir')}
            width={640}
            footer={total > PRODUCT_PICKER_PAGE_SIZE ? (
                <div className="ofi-tp-pager" style={{ paddingTop: 0 }}>
                    <span>{from}–{to} / {total}</span>
                    <span className="flex items-center gap-1">
                        <button
                            type="button"
                            aria-label={t('common.back')}
                            disabled={currentPage <= 1}
                            onClick={() => onPageChange(currentPage - 1)}
                            className="ofi-tp-rowbtn"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <span className="min-w-12 text-center" style={{ color: 'var(--ofi-cal-text)' }}>{currentPage} / {totalPages}</span>
                        <button
                            type="button"
                            aria-label={t('common.next')}
                            disabled={currentPage >= totalPages}
                            onClick={() => onPageChange(currentPage + 1)}
                            className="ofi-tp-rowbtn"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </span>
                </div>
            ) : undefined}
        >
            <div className="ofi-tp-search">
                <SearchLg size={16} />
                <input
                    autoFocus
                    className="ofi-cal-input"
                    value={productSearch}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder={t('tenders.product_name_stock_code_barcode_or_category')}
                    aria-label={t('common.search')}
                />
            </div>
            <div className="ofi-tp-list ofi-tp-list--scroll mt-3" style={{ maxHeight: 440 }}>
                {loading ? (
                    <PopupEmpty>{t('tenders.productler_loading')}</PopupEmpty>
                ) : isEmpty ? (
                    <div className="px-4 py-8 text-center">
                        <div className="text-[13px] font-semibold" style={{ color: 'var(--ofi-cal-text)' }}>{t('tenders.product_not_found')}</div>
                        <div className="mt-1 text-[12px]" style={{ color: 'var(--ofi-cal-muted)' }}>{t('tenders.bu_product_only_bu_tender_icin_yazabilir_veya')}</div>
                        <div className="mt-4 flex flex-wrap justify-center gap-2">
                            <PopupButton onClick={onCreateManualProduct} icon={<File05 size={14} />}>{t('tenders.create_tender_only_product')}</PopupButton>
                            <PopupButton variant="primary" onClick={onCreateStockArticle} icon={<Package size={14} />}>{t('tenders.productu_to_stock_add')}</PopupButton>
                        </div>
                    </div>
                ) : (
                    items.map((article) => (
                        // The whole row selects, padding included — a click that
                        // highlights the row must never land on a dead zone.
                        <div
                            key={article.id}
                            role="button"
                            tabIndex={0}
                            title={article.name}
                            onClick={() => onSelectArticle(article)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    onSelectArticle(article);
                                }
                            }}
                            className="ofi-tp-row is-clickable"
                        >
                            <span className="ofi-tp-row__main">
                                <span className="ofi-tp-row__title">{article.name}</span>
                                {article.articleCode && <span className="ofi-tp-row__meta">{article.articleCode}</span>}
                            </span>
                            {/* Opens the product's detail page in a new window; it
                                must not also select the row. */}
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    window.open(`/inventory/articles/${article.id}`, '_blank', 'noopener');
                                }}
                                className="ofi-tp-rowbtn"
                                title={t('common.detail')}
                                aria-label={t('common.detail')}
                            >
                                <Tag01 size={14} />
                            </button>
                        </div>
                    ))
                )}
            </div>
        </TenderFloatCard>
    );
};
