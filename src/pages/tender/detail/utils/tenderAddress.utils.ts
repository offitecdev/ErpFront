import type { CustomerLocationDto } from '../../../../lib/api/customer';


export const formatLocationAddress = (loc: CustomerLocationDto): string => {
    const cityLine = [loc.postalCode, loc.city].map((part) => String(part || '').trim()).filter(Boolean).join(' ');
    return [loc.address, cityLine, loc.country]
        .map((part) => String(part || '').trim())
        .filter(Boolean)
        .join('\n');
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


export const locationKindOf = (loc: CustomerLocationDto): 'INSTALLATION' | 'BILLING' =>
    (loc.kind ?? 'INSTALLATION') === 'BILLING' ? 'BILLING' : 'INSTALLATION';
