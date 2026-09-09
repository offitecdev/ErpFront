import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import type { PurchaseTemplateDocumentType } from '@/types/inventory';

type PurchaseTemplateState = {
    selected: Record<PurchaseTemplateDocumentType, string | null>;
    select: (documentType: PurchaseTemplateDocumentType, templateId: string | null) => void;
};

/** Device-local defaults. Order and price-request choices never share an ID. */
export const usePurchaseTemplateStore = create<PurchaseTemplateState>()(persist(
    (set) => ({
        selected: { ORDER: null, PRICE_REQUEST: null, GOODS_RECEIPT: null },
        select: (documentType, templateId) => set((state) => ({
            selected: { ...state.selected, [documentType]: templateId },
        })),
    }),
    {
        name: 'offitec:purchase-template-defaults:v1',
        partialize: (state) => ({ selected: state.selected }),
    },
));
