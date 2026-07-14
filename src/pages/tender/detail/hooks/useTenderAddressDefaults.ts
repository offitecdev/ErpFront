import { useEffect, useRef } from 'react';

import type { CustomerLocationDto } from '../../../../lib/api/customer';
import type { TenderListItem } from '../../../../types/tender';
import { formatLocationAddress, locationKindOf } from '../utils/tenderAddress.utils';

type UseTenderAddressDefaultsParams = {
    tender: TenderListItem | undefined;
    canEdit: boolean;
    customerLocations: CustomerLocationDto[];
    customerLocationsLoaded: boolean;
    onStageDefaults: (patch: { installationAddress?: string; deliveryAddress?: string; billingAddress?: string; billingSameAsInstallation?: boolean }) => void;
};

// Defaults the tender's single project/delivery address slot while it is still
// empty: the Projektadresse side is pre-filled (the toggle's default type) with
// the customer's MAIN address (the one entered on the customer create/edit form,
// surfaced as tender.customerAddress); only when the customer has no main
// address does it fall back to their primary saved location. Exactly one of
// installationAddress/deliveryAddress is ever set — never both.
//
// The billing address (Rechnungsadresse) defaults to that same primary address
// too: on a fresh tender it is pre-filled with the primary address and left as an
// independent selection (the "same as project" flag stays off), so the primary
// address shows up selected as the first option of the billing picker — exactly
// like the project address row.
export const useTenderAddressDefaults = ({
    tender,
    canEdit,
    customerLocations,
    customerLocationsLoaded,
    onStageDefaults,
}: UseTenderAddressDefaultsParams) => {
    const appliedFor = useRef<string | null>(null);

    useEffect(() => {
        if (!tender || !canEdit || !tender.customerId) return;
        const guardKey = `${tender.id}:${tender.customerId}`;
        if (appliedFor.current === guardKey) return;

        // Preferred base: the customer's main address — available immediately,
        // no need to wait for the saved-locations fetch.
        let formatted = String(tender.customerAddress ?? '').trim();

        if (!formatted) {
            if (!customerLocationsLoaded) return;
            // After a customer switch the previous customer's locations linger for
            // one render (their refetch is async) — only ever default from locations
            // that actually belong to the tender's current customer.
            const candidates = customerLocations.filter((loc) =>
                locationKindOf(loc) !== 'BILLING' && (!loc.customerId || loc.customerId === tender.customerId));
            const primary = candidates.find((loc) => loc.isPrimary) ?? candidates[0];
            if (!primary) return;
            formatted = formatLocationAddress(primary);
            if (!formatted) return;
        }

        const hasInstallation = Boolean(String(tender.installationAddress ?? '').trim());
        const hasDelivery = Boolean(String(tender.deliveryAddress ?? '').trim());
        const hasBilling = Boolean(String(tender.billingAddress ?? '').trim());

        const patch: { installationAddress?: string; billingAddress?: string; billingSameAsInstallation?: boolean } = {};
        // Default the project side to the primary address only on a fresh tender
        // (neither project nor delivery holds an address yet).
        if (!hasInstallation && !hasDelivery) {
            patch.installationAddress = formatted;
        }
        // Default billing to the same primary address whenever it is still empty —
        // independent of the project side, kept as its own selection so the primary
        // address appears selected in the billing picker (which lists it first).
        if (!hasBilling) {
            patch.billingAddress = formatted;
            patch.billingSameAsInstallation = false;
        }
        // Nothing to default (both sides already filled) — leave the guard unset so
        // a later edit that empties a field can still be re-defaulted.
        if (Object.keys(patch).length === 0) return;

        appliedFor.current = guardKey;
        onStageDefaults(patch);
    }, [tender, canEdit, customerLocations, customerLocationsLoaded, onStageDefaults]);
};
