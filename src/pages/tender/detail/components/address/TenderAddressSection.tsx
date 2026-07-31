import type { ReactNode } from 'react';

import { Plus } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { CustomerLocationDto } from '@/lib/api/customer';

import { addressesEqual, formatLocationAddress, locationOptionLabel } from '../../utils/tenderAddress.utils';
import { PlainCheckbox } from '../common/PlainUi';
import { QuoteSelect } from '../common/QuoteSelect';

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
                <div className="min-w-0 flex-1">
                    <QuoteSelect
                        ariaLabel={t('crm.addAddressTitle')}
                        value={selectedId}
                        // Stay interactive while saving (the inline spinner signals
                        // progress) so the picker never shows the disabled
                        // "not-allowed" cursor; only block until a customer is set.
                        disabled={!hasCustomer}
                        loadingLabel={locationsLoading ? t('common.loading') : undefined}
                        placeholder={locations.length ? t('common.select') : t('tenders.address_info_not_found')}
                        options={locations.map((loc) => ({ value: loc.id, label: locationOptionLabel(loc) }))}
                        onChange={(id) => {
                            // Select the item instantly, before the save round-trips.
                            onSelectPending(id || null);
                            const loc = locations.find((item) => item.id === id);
                            onPick(loc ? formatLocationAddress(loc) : null);
                        }}
                    />
                </div>
                {loading ? tinyMetaSpinner : null}
                <button
                    type="button"
                    onClick={onAdd}
                    disabled={!hasCustomer}
                    title={t('crm.addAddressTitle')}
                    aria-label={t('crm.addAddressTitle')}
                    className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[2px] border border-slate-300 bg-white text-slate-500 transition-colors hover:border-[#1f2654] hover:bg-slate-50 hover:text-[#1f2654] disabled:opacity-40"
                >
                    <Plus size={13} />
                </button>
            </div>
            {/* Quiet read-back of the picked address, so the selection stays
                visible without competing with the control above it. */}
            {displayValue ? (
                <div className="rounded-[2px] border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-[12px] leading-[1.45] text-slate-600">
                    {renderLines(displayValue)}
                </div>
            ) : null}
        </div>
    );
};

type TenderBillingAddressRowProps = {
    sameAsInstallation: boolean;
    onSameAsInstallationChange: (checked: boolean) => void;
    billingPicker: ReactNode;
    // Tracks the active address type so the checkbox reads "Wie Projektadresse"
    // or "Wie Lieferadresse" — matching the toggle above, not a fixed label.
    label: string;
};

// "Billing same as installation": when on, billing mirrors the project/delivery
// address and its own picker is hidden (no duplicate entry).
export const TenderBillingAddressRow = ({ sameAsInstallation, onSameAsInstallationChange, billingPicker, label }: TenderBillingAddressRowProps) => (
    <div className="space-y-1.5">
        <label className="flex h-8 cursor-pointer items-center gap-2 text-[12px] font-medium text-slate-600">
            <PlainCheckbox
                size="sm"
                isSelected={sameAsInstallation}
                onChange={onSameAsInstallationChange}
                aria-label={label}
            />
            {label}
        </label>
        {!sameAsInstallation && billingPicker}
    </div>
);
