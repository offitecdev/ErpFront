import {
    File05 as FileText,
    Package,
    Tag01 as Tag,
} from '@/components/icons/antIconCompat';
import Pagination from 'antd/es/pagination';

import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { ArticleQuickPick } from '@/types/inventory';

import { PRODUCT_PICKER_PAGE_SIZE } from '../../utils/tenderDetail.constants';

type TenderProductPickerModalProps = {
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

export const TenderProductPickerModal = ({
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
}: TenderProductPickerModalProps) => {
    // "No results" only after a completed fetch — while loading we show the spinner.
    const isEmpty = !loading && items.length === 0;

    return (
        <Modal
            open={open}
            onClose={onClose}
            title={t('tenders.product_add')}
            description={t('tenders.stock_product_select_info_tender_kopyalanir')}
            width="xl"
            closeOnBackdrop
        >
            <div className="space-y-3">
                <Field label={t('common.search')}>
                    <Input
                        autoFocus
                        value={productSearch}
                        onChange={(event) => onSearchChange(event.target.value)}
                        placeholder={t('tenders.product_name_stock_code_barcode_or_category')}
                    />
                </Field>
                <div className="max-h-[520px] overflow-y-auto rounded-[2px] border border-slate-200 bg-white">
                    {loading ? (
                        <div className="px-4 py-10 text-center text-[12px] text-slate-400">{t('tenders.productler_loading')}</div>
                    ) : isEmpty ? (
                        <div className="space-y-4 px-4 py-8 text-center">
                            <div>
                                <div className="text-[13px] font-semibold text-slate-800">{t('tenders.product_not_found')}</div>
                                <div className="mt-1 text-[12px] text-slate-500">{t('tenders.bu_product_only_bu_tender_icin_yazabilir_veya')}</div>
                            </div>
                            <div className="flex flex-wrap justify-center gap-2">
                                <Button variant="secondary" icon={<FileText size={13} />} onClick={onCreateManualProduct}>{t('tenders.create_tender_only_product')}</Button>
                                <Button variant="primary" icon={<Package size={13} />} onClick={onCreateStockArticle}>{t('tenders.productu_to_stock_add')}</Button>
                            </div>
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {items.map((article) => (
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
                                    className="ofi-option-row group flex cursor-pointer items-center gap-2 px-3 py-2 transition-colors hover:bg-[#1f2654]"
                                >
                                    {/* Tag icon opens the product's detail page in a new
                                        window; it must not also select the row. */}
                                    <button
                                        type="button"
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            window.open(`/inventory/articles/${article.id}`, '_blank', 'noopener');
                                        }}
                                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-slate-400 transition-colors hover:border-[#1f2654] hover:text-[#1f2654]"
                                        title={t('common.detail')}
                                        aria-label={t('common.detail')}
                                    >
                                        <Tag size={14} />
                                    </button>
                                    <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-medium text-slate-800 transition-colors group-hover:!text-white">
                                        {article.name}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
                {total > PRODUCT_PICKER_PAGE_SIZE && (
                    <div className="flex items-center justify-end">
                        <Pagination
                            current={currentPage}
                            pageSize={PRODUCT_PICKER_PAGE_SIZE}
                            total={total}
                            showSizeChanger={false}
                            size="small"
                            onChange={onPageChange}
                        />
                    </div>
                )}
            </div>
        </Modal>
    );
};
