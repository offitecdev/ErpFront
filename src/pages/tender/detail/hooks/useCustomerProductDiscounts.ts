import { useEffect, useState } from 'react';

import { customerApi } from '../../../../lib/api/customer';

// Article-id → discount % map of the tender customer's saved product discounts,
// used to auto-apply the discount when one of those products is added to the quote.
export const useCustomerProductDiscounts = ({ customerId }: { customerId?: string | null }) => {
    const [discountMap, setDiscountMap] = useState<Record<string, number>>({});

    useEffect(() => {
        if (!customerId) {
            setDiscountMap({});
            return;
        }
        let cancelled = false;
        customerApi.listProductDiscounts(customerId)
            .then((rows) => {
                if (!cancelled) setDiscountMap(Object.fromEntries(rows.map((row) => [row.articleId, row.discount])));
            })
            .catch(() => {
                if (!cancelled) setDiscountMap({});
            });
        return () => { cancelled = true; };
    }, [customerId]);

    return { discountMap };
};
