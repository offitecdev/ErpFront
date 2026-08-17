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

// The Hauptadresse is the default for ALL THREE address slots: Projekt-/
// Montageadresse, Lieferadresse and Rechnungsadresse are pre-filled with the
// customer's main address (the one entered on the customer create/edit form,
// surfaced as tender.customerAddress) and only differ when the user explicitly
// ticks that slot's "andere Adresse verwenden" box. Only when the customer has
// no main address at all does it fall back to their primary saved location.
//
// Each slot is defaulted independently and only while it is still empty, so an
// address the user picked by hand is never overwritten.
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

        const patch: { installationAddress?: string; deliveryAddress?: string; billingAddress?: string; billingSameAsInstallation?: boolean } = {};
        if (!hasInstallation) patch.installationAddress = formatted;
        if (!hasDelivery) patch.deliveryAddress = formatted;
        if (!hasBilling) {
            patch.billingAddress = formatted;
            // The legacy "billing mirrors the project address" flag has no place in
            // the Hauptadresse model — every slot now holds its own address.
            patch.billingSameAsInstallation = false;
        }
        // Nothing to default (every slot already filled) — leave the guard unset so
        // a later edit that empties a field can still be re-defaulted.
        if (Object.keys(patch).length === 0) return;

        appliedFor.current = guardKey;
        onStageDefaults(patch);
    }, [tender, canEdit, customerLocations, customerLocationsLoaded, onStageDefaults]);
};
