import { lazy, Suspense } from 'react';

import type { InventoryArticle } from '@/types/inventory';
import type { TenderArticleFormData } from '../modals/TenderArticleFormModal';

const LazyTenderArticleFormModal = lazy(() =>
    import('../modals/TenderArticleFormModal').then((mod) => ({ default: mod.TenderArticleFormModal }))
);

type TenderStockArticleModalProps = {
    initial: Partial<InventoryArticle> | null;
    onClose: () => void;
    onSubmit: (data: TenderArticleFormData) => Promise<void>;
};

export const TenderStockArticleModal = ({ initial, onClose, onSubmit }: TenderStockArticleModalProps) => {
    if (!initial) return null;
    return (
        <Suspense fallback={null}>
            <LazyTenderArticleFormModal
                initial={initial}
                onClose={onClose}
                onSubmit={onSubmit}
            />
        </Suspense>
    );
};
