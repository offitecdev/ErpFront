import { useEffect, useState } from 'react';

import { customerApi, type CustomerLocationDto } from '@/lib/api/customer';

type UseTenderCustomerLocationsParams = {
    tenderCustomerId?: string | null;
};

// Loads the selected customer's saved locations (Standorte) so they can be
// picked as the tender's billing / delivery address. Reloads whenever the
// tender's customer changes; exposes the setter so a freshly-added location
// can be merged in without a refetch.
export const useTenderCustomerLocations = ({ tenderCustomerId }: UseTenderCustomerLocationsParams) => {
    const [customerLocations, setCustomerLocations] = useState<CustomerLocationDto[]>([]);
    const [customerLocationsLoaded, setCustomerLocationsLoaded] = useState(false);

    useEffect(() => {
        if (!tenderCustomerId) {
            setCustomerLocations([]);
            setCustomerLocationsLoaded(false);
            return;
        }
        let cancelled = false;
        setCustomerLocationsLoaded(false);
        customerApi.listLocations(tenderCustomerId)
            .then((rows) => { if (!cancelled) setCustomerLocations(rows); })
            .catch(() => { if (!cancelled) setCustomerLocations([]); })
            .finally(() => { if (!cancelled) setCustomerLocationsLoaded(true); });
        return () => { cancelled = true; };
    }, [tenderCustomerId]);

    return {
        customerLocations,
        setCustomerLocations,
        customerLocationsLoaded,
    };
};
