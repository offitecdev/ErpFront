import { Plus } from '@/components/icons/antIconCompat';
import { Input } from '@/components/ui-shared/Field';
import { t } from '@/i18n/translate';

import type { CustomerOption } from '../../types/tenderDetail.types';

type TenderCustomerSectionProps = {
    query: string;
    onQueryChange: (value: string) => void;
    onOpenChange: (open: boolean) => void;
    loading: boolean;
    loadingFlashLabel: string;
    dropdownVisible: boolean;
    customers: CustomerOption[];
    onSelectCustomer: (customer: CustomerOption) => void;
    onClearCustomer: () => void;
    onAddCustomer: () => void;
};

export const TenderCustomerSection = ({
    query,
    onQueryChange,
    onOpenChange,
    loading,
    loadingFlashLabel,
    dropdownVisible,
    customers,
    onSelectCustomer,
    onClearCustomer,
    onAddCustomer,
}: TenderCustomerSectionProps) => (
    <div className="flex items-start gap-1.5">
        <div className="relative flex-1">
        <Input
            size="sm"
            value={query}
            onChange={(event) => {
                onQueryChange(event.target.value);
                onOpenChange(true);
            }}
            onFocus={() => onOpenChange(true)}
            // Also open on click so a single tap reopens the list even when the
            // input already holds focus (e.g. right after selecting a customer) —
            // onFocus alone wouldn't fire again in that case.
            onClick={() => onOpenChange(true)}
            onBlur={() => window.setTimeout(() => onOpenChange(false), 120)}
            placeholder={loading ?t('tenders.musteriler_loading') :t('tenders.customer_adi_yazin')}
            // antd's native clear icon (round X) sits pinned at the very end of the
            // input box, vertically centred; clicking it unlinks the whole customer.
            allowClear
            onClear={onClearCustomer}
            // Don't disable on metaSaving: changing an address / date must not
            // make the customer field look like it is reloading. Re-selecting a
            // customer mid-save is still guarded in handleSelectTenderCustomer.
            disabled={loading}
        />
        {loading && (
            <span
                role="status"
                aria-label={t('common.loading')}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 animate-pulse text-[11px] font-semibold uppercase tracking-wide text-[#1f2654]"
            >
                {loadingFlashLabel}
            </span>
        )}
        {dropdownVisible && (
            <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/[0.02]">
                {customers.map((customer) => (
                    <button
                        key={customer.id}
                        type="button"
                        onMouseDown={(event) => {
                            event.preventDefault();
                            onSelectCustomer(customer);
                        }}
                        onClick={(event) => event.preventDefault()}
                        onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === ' ') {
                                event.preventDefault();
                                onSelectCustomer(customer);
                            }
                        }}
                        className="flex w-full flex-col rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-slate-100"
                    >
                        <span className="font-semibold text-slate-900">{customer.companyName}</span>
                        <span className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                            {[customer.address, customer.mainEmail, customer.mainPhone].filter(Boolean).join(' · ') ||t('tenders.address_info_not_found')}
                        </span>
                    </button>
                ))}
            </div>
        )}
        </div>
        <button
            type="button"
            onClick={onAddCustomer}
            title={t('crm.customers.newCustomer')}
            aria-label={t('crm.customers.newCustomer')}
            className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 hover:text-[#1f2654]"
        >
            <Plus size={13} />
        </button>
    </div>
);
