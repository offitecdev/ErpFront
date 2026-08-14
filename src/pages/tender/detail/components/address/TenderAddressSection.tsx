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

// Surface, border and text colour come from `.ofi-addr-box` (index.css +
// dark.css), NOT from bg-slate-50 / text-slate-600 utilities: dark.css maps
// those to the card's own surface with !important, which turned this block into
// an unreadable dark slab in dark mode.
const readBackClass = 'ofi-addr-box rounded-[2px] px-2.5 py-1.5 text-[12px] leading-[1.45]';

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
                            // A legacy record saved with only a label and no postal
                            // components formats to '' — clear the slot instead of
                            // storing a blank, so it reads as "no address" and the
                            // order check still trips.
                            onPick((loc && formatLocationAddress(loc)) || null);
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
                <div className={readBackClass}>
                    {renderLines(displayValue)}
                </div>
            ) : null}
        </div>
    );
};

type TenderMainAddressRowProps = {
    value: string;
    hasCustomer: boolean;
    onAdd: () => void;
    renderLines: (value: string) => ReactNode;
};

// The Hauptadresse: the customer's own address, and the source every other
// address slot defaults to. It is not picked here — it belongs to the customer
// record — so the row only reads it back. The "+" appears only while the
// customer has no address at all, since without one no slot can be filled.
export const TenderMainAddressRow = ({ value, hasCustomer, onAdd, renderLines }: TenderMainAddressRowProps) => (
    <div className="flex items-start gap-1.5">
        <div className={`min-w-0 flex-1 ${readBackClass}`}>
            {value
                ? renderLines(value)
                : <span className="text-slate-400">{t('tenders.address_info_not_found')}</span>}
        </div>
        {!value && (
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
        )}
    </div>
);

export type TenderAddressSlotOption<TSlot extends string> = {
    slot: TSlot;
    /** Short caption of the slot, e.g. "Projekt" / "Lieferung" / "Rechnung". */
    label: string;
    active: boolean;
};

type TenderCustomAddressRowProps<TSlot extends string> = {
    options: Array<TenderAddressSlotOption<TSlot>>;
    onToggle: (slot: TSlot, checked: boolean) => void;
    renderPicker: (slot: TSlot) => ReactNode;
};

// All three deviating addresses in ONE row: the normal quote uses the customer's
// Hauptadresse everywhere, so what the screen has to show is not three address
// fields but a single question — which of them is different? Three tick boxes on
// one line answer it, and only the ticked ones unfold a picker underneath.
export const TenderCustomAddressRow = <TSlot extends string>({
    options,
    onToggle,
    renderPicker,
}: TenderCustomAddressRowProps<TSlot>) => {
    const active = options.filter((option) => option.active);
    return (
        <div className={active.length ? 'space-y-2' : undefined}>
            <div className="flex min-h-8 flex-wrap items-center gap-x-3 gap-y-1 py-1">
                {options.map((option) => (
                    <label
                        key={option.slot}
                        className="flex cursor-pointer items-center gap-1.5 text-[12px] text-slate-500 transition-colors hover:text-slate-700"
                    >
                        <PlainCheckbox
                            size="sm"
                            isSelected={option.active}
                            onChange={(checked) => onToggle(option.slot, checked)}
                            aria-label={option.label}
                        />
                        {option.label}
                    </label>
                ))}
            </div>
            {/* Only the deviating slots get a picker, each under its own caption
                so the addresses below can never be mixed up. */}
            {active.map((option) => (
                <div key={option.slot} className="space-y-1">
                    <span className="block text-[11px] font-semibold uppercase tracking-[0.04em] text-slate-400">
                        {option.label}
                    </span>
                    {renderPicker(option.slot)}
                </div>
            ))}
        </div>
    );
};
