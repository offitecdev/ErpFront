import { useState } from 'react';
import {
    File05 as FileText,
    Package,
    Tag01 as Tag,
} from '@/components/icons/antIconCompat';
import Pagination from 'antd/es/pagination';

import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { ProductQuickViewModal } from '@/components/product/ProductQuickViewModal';
import { t } from '@/i18n/translate';
import type { ArticleListItem } from '@/types/inventory';

import { PRODUCT_PICKER_PAGE_SIZE } from '../../utils/tenderDetail.constants';

type TenderProductPickerModalProps = {
    open: boolean;
    onClose: () => void;
    productSearch: string;
    onSearchChange: (value: string) => void;
    loading: boolean;
    items: ArticleListItem[];
    total: number;
    currentPage: number;
    onPageChange: (page: number) => void;
    onCreateManualProduct: () => void;
    onCreateStockArticle: () => void;
    onSelectArticle: (article: ArticleListItem) => void;
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
    // Tag icon opens the shared product quick view (the one list-side place, besides
    // the detail screen, where the product image is shown).
    const [quickViewId, setQuickViewId] = useState<string | null>(null);

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
                <div className="max-h-[520px] overflow-y-auto rounded-md border border-slate-200 bg-white">
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
                                <div key={article.id} className="group flex items-center gap-2 px-3 py-2 transition-colors hover:bg-slate-50">
                                    {/* Tag icon sits between the row start and the product title. */}
                                    <button
                                        type="button"
                                        onClick={() => setQuickViewId(article.id)}
                                        className="inline-flex size-7 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-400 transition-colors hover:border-[#1f2654] hover:text-[#1f2654]"
                                        title={t('common.detail')}
                                        aria-label={t('common.detail')}
                                    >
                                        <Tag size={14} />
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => onSelectArticle(article)}
                                        className="min-w-0 flex-1 truncate rounded-md px-2 py-1.5 text-left text-[13px] font-medium text-slate-800 transition-colors hover:bg-[#1f2654] hover:text-white"
                                        title={article.name}
                                    >
                                        {article.name}
                                    </button>
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

            <ProductQuickViewModal articleId={quickViewId} onClose={() => setQuickViewId(null)} />
        </Modal>
    );
};
