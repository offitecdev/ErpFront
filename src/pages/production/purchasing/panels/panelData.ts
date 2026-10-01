import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { readPurchasingDetail } from '@/lib/api/purchasing';
import type { BomPurchase } from '@/types/productionBom';
import type { ProcurementDetail } from '@/types/purchasing';

/** Der Talep (mit seiner BOM) und darin der eine Beleg, an dem eine Seitenfläche arbeitet. */
export const usePurchase = (requestId: string, purchaseOrderId: string, reload = 0) => {
    const [state, setState] = useState<{ detail: ProcurementDetail; purchase: BomPurchase } | null>(null);
    const [error, setError] = useState<string | null>(null);
    useEffect(() => {
        return readPurchasingDetail(requestId,
            (detail) => {
                const purchase = detail.bom.purchases.find((entry) => entry.purchaseOrderId === purchaseOrderId);
                if (purchase) { setState({ detail, purchase }); setError(null); }
                else setError(t('productionBom.err.PURCHASE_NOT_FOUND'));
            },
            (failure) => setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')));
    }, [requestId, purchaseOrderId, reload]);
    return { detail: state?.detail ?? null, purchase: state?.purchase ?? null, error };
};
