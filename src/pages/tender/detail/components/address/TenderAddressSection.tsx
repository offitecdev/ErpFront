import type { ReactNode } from 'react';

import { Plus } from '@/components/icons/antIconCompat';
import { Checkbox } from '@/components/ui-shared/Checkbox';
import { Select } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';
import type { CustomerLocationDto } from '@/lib/api/customer';

import { addressesEqual, formatLocationAddress, locationOptionLabel } from '../../utils/tenderAddress.utils';

const tinyMetaSpinner = (
    <span
        role="status"
        aria-label={t('common.loading')}
        className="h-3 w-3 flex-shrink-0 animate-spin rounded-full border border-slate-300 border-t-[#1f2654]"
    />
);

type TenderAddressPickerProps = {
    storedValue: string;
    locations: CustomerLocationDto[];
    onPick: (value: string | null) => void;
    onAdd: () => void;
    hasCustomer: boolean;
    locationsLoaded: boolean;
    pendingId: string | null;
    onSelectPending: (id: string | null) => void;
    renderLines: (value: string) => ReactNode;
    saving?: boolean;
};

// Dropdown of the customer's saved addresses for the given kind; picking one
// stores its formatted address on the tender. The trailing "+" opens a popup
// to create a new address inline.
export const TenderAddressPicker = ({
    storedValue,
    locations,
    onPick,
    onAdd,
    hasCustomer,
    locationsLoaded,
    pendingId,
    onSelectPending,
    renderLines,
    saving = false,
}: TenderAddressPickerProps) => {
    // Match the stored address back to a saved location tolerantly (separators /
    // whitespace may have been normalised in transit) so the picked entry keeps
    // showing as selected instead of snapping back to the "Select" placeholder.
    const matched = locations.find((loc) => addressesEqual(formatLocationAddress(loc), storedValue));
    const pendingLoc = pendingId ? locations.find((loc) => loc.id === pendingId) : undefined;
    // The stored value is authoritative once it resolves to a location; the
    // just-clicked option only fills the brief gap before the save is applied.
    const selectedId = matched?.id ?? pendingLoc?.id ?? '';
    const displayValue = matched ? storedValue : (pendingLoc ? formatLocationAddress(pendingLoc) : storedValue);
    // Spin while the customer's saved locations are still being fetched, or while
    // a picked address is being submitted — i.e. until it loads or is saved.
    const locationsLoading = hasCustomer && !locationsLoaded;
    const loading = saving || locationsLoading;
    return (
        <div className="space-y-1">
            <div className="flex items-center gap-1.5">
                <Select
                    size="sm"
                    value={selectedId}
                    // Stay interactive while saving (the inline spinner signals
                    // progress) so the picker never shows the disabled
                    // "not-allowed" cursor; only block until a customer is set.
                    disabled={!hasCustomer}
                    onChange={(event) => {
                        const id = event.target.value;
                        // Select the item instantly, before the save round-trips.
                        onSelectPending(id || null);
                        const loc = locations.find((item) => item.id === id);
                        onPick(loc ? formatLocationAddress(loc) : null);
                    }}
                >
                    <option value="">{locationsLoading ? t('common.loading') : (locations.length ? t('common.select') :t('tenders.address_info_not_found'))}</option>
                    {locations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{locationOptionLabel(loc)}</option>
                    ))}
                </Select>
                {loading ? tinyMetaSpinner : null}
                <button
                    type="button"
                    onClick={onAdd}
                    disabled={!hasCustomer}
                    title={t('crm.addAddressTitle')}
                    className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-[#1f2654] disabled:opacity-40"
                >
                    <Plus size={13} />
                </button>
            </div>
            {displayValue ? <div className="px-3 pt-0.5 text-[12px] leading-5 text-slate-600">{renderLines(displayValue)}</div> : null}
        </div>
    );
};

type TenderBillingAddressRowProps = {
    sameAsInstallation: boolean;
    onSameAsInstallationChange: (checked: boolean) => void;
    billingPicker: ReactNode;
};

// "Billing same as installation": when on, billing mirrors the installation
// address and its own picker is hidden (no duplicate entry).
export const TenderBillingAddressRow = ({ sameAsInstallation, onSameAsInstallationChange, billingPicker }: TenderBillingAddressRowProps) => (
    <div className="space-y-1.5">
        <Checkbox
            label={t('crm.sameAsInstallation')}
            size="sm"
            isSelected={sameAsInstallation}
            onChange={onSameAsInstallationChange}
        />
        {!sameAsInstallation && billingPicker}
    </div>
);
