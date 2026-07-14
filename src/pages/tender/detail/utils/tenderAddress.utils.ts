import type { CustomerLocationDto } from '../../../../lib/api/customer';


export const formatLocationAddress = (loc: CustomerLocationDto): string => {
    const cityLine = [loc.postalCode, loc.city].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    const formatted = [loc.address, cityLine, loc.country]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('\n');
    // Locations can be saved with only a name (street/postal/city/country are all
    // optional). Without this fallback such a location formats to an empty string,
    // which the tender then stores as an empty delivery/billing address (coerced to
    // null by the backend) — blocking order creation even though an address was
    // clearly picked. Fall back to the name so a selected location is never blank.
    return formatted || String(loc.name || '').trim();
};

export const locationOptionLabel = (loc: CustomerLocationDto): string => {
    const place = [loc.postalCode, loc.city].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    return [loc.name, place || String(loc.address || '').trim()].filter(Boolean).join(' · ') || loc.name;
};


export const normalizeAddressText = (value?: string | null) =>
    String(value ?? '').replace(/[\s,]+/g, ' ').trim().toLowerCase();
export const addressesEqual = (a?: string | null, b?: string | null) => {
    const na = normalizeAddressText(a);
    return na.length > 0 && na === normalizeAddressText(b);
};


export const locationKindOf = (loc: CustomerLocationDto): 'INSTALLATION' | 'DELIVERY' | 'BILLING' => {
    const kind = loc.kind ?? 'INSTALLATION';
    if (kind === 'BILLING') return 'BILLING';
    if (kind === 'DELIVERY') return 'DELIVERY';
    return 'INSTALLATION';
};
