import { useEffect, useState } from 'react';

import type { ArticleListItem } from '@/types/inventory';
import { inventoryApi } from '@/lib/api/inventory';

import { PRODUCT_PICKER_PAGE_SIZE } from '../utils/tenderDetail.constants';

// The tender product picker loads its catalogue DIRECTLY from the server, in
// batches of 15, with search applied in the DB — it no longer depends on the
// tender's in-memory stock-article list. This keeps the pop-up dynamic without
// pulling the whole catalogue into the main tender detail view.
export const useTenderProductPicker = () => {
    const [productPickerOpen, setProductPickerOpen] = useState(false);
    const [productPickerAfterRowId, setProductPickerAfterRowId] = useState<string | undefined>(undefined);
    const [productSearch, setProductSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [productPickerPage, setProductPickerPage] = useState(1);
    const [pickerItems, setPickerItems] = useState<ArticleListItem[]>([]);
    const [pickerTotal, setPickerTotal] = useState(0);
    const [pickerLoading, setPickerLoading] = useState(false);

    // Debounce the search box so we don't fire a request per keystroke.
    useEffect(() => {
        const id = setTimeout(() => setDebouncedSearch(productSearch.trim()), 300);
        return () => clearTimeout(id);
    }, [productSearch]);

    // A new search always resets to the first page.
    useEffect(() => {
        setProductPickerPage(1);
    }, [debouncedSearch]);

    // Fetch the current page whenever the pop-up is open and page/search change.
    useEffect(() => {
        if (!productPickerOpen) return;
        let cancelled = false;
        setPickerLoading(true);
        inventoryApi
            .articlesSummaryPaged({
                page: productPickerPage,
                pageSize: PRODUCT_PICKER_PAGE_SIZE,
                search: debouncedSearch || undefined,
            })
            .then((res) => {
                if (cancelled) return;
                setPickerItems(res.items);
                setPickerTotal(res.total);
            })
            .catch(() => {
                if (cancelled) return;
                setPickerItems([]);
                setPickerTotal(0);
            })
            .finally(() => {
                if (!cancelled) setPickerLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [productPickerOpen, productPickerPage, debouncedSearch]);

    const openProductPicker = (afterRowId?: string) => {
        setProductPickerAfterRowId(afterRowId);
        setProductSearch('');
        setDebouncedSearch('');
        setProductPickerPage(1);
        setProductPickerOpen(true);
    };

    return {
        productPickerOpen,
        setProductPickerOpen,
        productPickerAfterRowId,
        setProductPickerAfterRowId,
        productSearch,
        setProductSearch,
        productPickerPage,
        setProductPickerPage,
        pickerItems,
        pickerTotal,
        pickerLoading,
        openProductPicker,
    };
};
