import { t as i18nT } from '@/i18n/translate';

// Customer type categories — single source of truth shared by the create form
// (CustomerList) and the profile view/edit (CustomerDashboard).
export const CUSTOMER_TYPE_OPTIONS = [
    { value: 'PRIVATE', labelKey: 'crm.customers.customerTypePrivate' },
    { value: 'COMPANY', labelKey: 'crm.customers.customerTypeCompany' },
    { value: 'PUBLIC_ADMIN', labelKey: 'crm.customers.customerTypePublicAdministration' },
] as const;

// Default to the private customer (PrivatKunde) — the first option in the list.
export const DEFAULT_CUSTOMER_TYPE = 'PRIVATE';

// Preferred correspondence language — shared by the create form and the profile view/edit.
export const CUSTOMER_LANGUAGE_OPTIONS = [
    { value: 'TR', labelKey: 'crm.customers.languageTr' },
    { value: 'EN', labelKey: 'crm.customers.languageEn' },
    { value: 'DE', labelKey: 'crm.customers.languageDe' },
] as const;

// Resolve a stored language code to its translated label; unknown/empty returns null.
export const getCustomerLanguageLabel = (lang?: string | null) => {
    const match = CUSTOMER_LANGUAGE_OPTIONS.find((o) => o.value === lang);
    return match ? i18nT(match.labelKey) : null;
};

// Customer lifecycle status — single source of truth shared by the list, the
// create form and the profile view/edit. `variant` maps to a StatusChip color.
export const CUSTOMER_STATUS_OPTIONS = [
    { value: 'ACTIVE', labelKey: 'crm.customers.statusActive', variant: 'active' },
    { value: 'POTENTIAL', labelKey: 'crm.customers.statusPotential', variant: 'info' },
    { value: 'PASSIVE', labelKey: 'crm.customers.statusPassive', variant: 'passive' },
    { value: 'BLOCKED', labelKey: 'crm.customers.statusBlocked', variant: 'danger' },
    { value: 'PROBLEMATIC', labelKey: 'crm.customers.statusProblematic', variant: 'warning' },
] as const;

export const DEFAULT_CUSTOMER_STATUS = 'ACTIVE';

// Resolve a stored status code to its option (unknown/empty falls back to ACTIVE).
export const getCustomerStatusOption = (status?: string | null) =>
    CUSTOMER_STATUS_OPTIONS.find((o) => o.value === status) ?? CUSTOMER_STATUS_OPTIONS[0];

export const getCustomerStatusLabel = (status?: string | null) =>
    i18nT(getCustomerStatusOption(status).labelKey);

// No longer selectable, but existing customers may still carry these values —
// keep them resolvable for display instead of mislabeling them as the fallback.
const LEGACY_CUSTOMER_TYPE_LABEL_KEYS: Record<string, string> = {
    PROPERTY_MGMT: 'crm.customers.customerTypePropertyManagement',
    COMMERCIAL_DEALER: 'crm.customers.customerTypeCommercialDealer',
    ARCHITECT_PLANNER: 'crm.customers.customerTypeArchitectPlanner',
};

// Resolve a stored code to its translated label; unknown/empty falls back to the first option.
export const getCustomerTypeLabel = (type?: string | null) => {
    const match = CUSTOMER_TYPE_OPTIONS.find((o) => o.value === type);
    if (match) return i18nT(match.labelKey);
    if (type && LEGACY_CUSTOMER_TYPE_LABEL_KEYS[type]) return i18nT(LEGACY_CUSTOMER_TYPE_LABEL_KEYS[type]);
    return i18nT(CUSTOMER_TYPE_OPTIONS[0].labelKey);
};
