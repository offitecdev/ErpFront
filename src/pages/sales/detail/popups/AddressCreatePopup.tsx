import { AddressFields } from '@/components/ui-shared/AddressFields';
import { addressParts } from '@/components/ui-shared/addressForm';
import { t } from '@/i18n/translate';
import { isAddressEmpty } from '@/utils/address';

// Form type + empty value live in `detail/utils/tenderAddress.utils.ts` — this
// popup is loaded lazily and must not pull the page's constants back in.
export type { TenderAddressCreateForm, TenderAddressTarget } from '../utils/tenderAddress.utils';
import type { TenderAddressCreateForm, TenderAddressTarget } from '../utils/tenderAddress.utils';
import { PopupActions, PopupButton, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

type AddressCreatePopupProps = {
    open: boolean;
    onClose: () => void;
    saving: boolean;
    target: TenderAddressTarget;
    onTargetChange: (target: TenderAddressTarget) => void;
    form: TenderAddressCreateForm;
    onFormChange: (form: TenderAddressCreateForm) => void;
    onSubmit: () => void;
};

const INPUT = 'ofi-cal-input w-full';

const TARGETS: ReadonlyArray<{ value: TenderAddressTarget; labelKey: string }> = [
    { value: 'INSTALLATION', labelKey: 'crm.addressTargetInstallation' },
    { value: 'DELIVERY', labelKey: 'crm.addressTargetDelivery' },
    { value: 'BILLING', labelKey: 'crm.addressTargetBilling' },
    { value: 'CUSTOMER', labelKey: 'crm.addressTargetCustomer' },
];

/**
 * "+ add address" for the customer of the quote (project / delivery / billing
 * / general). The address type is a row of chips instead of a select — one
 * tap, and the current choice is visible without opening anything.
 */
export const AddressCreatePopup = ({
    open,
    onClose,
    saving,
    target,
    onTargetChange,
    form,
    onFormChange,
    onSubmit,
}: AddressCreatePopupProps) => (
    <TenderFloatCard
        open={open}
        onClose={() => { if (!saving) onClose(); }}
        title={t('crm.addAddressTitle')}
        width={580}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose} disabled={saving}>{t('common.cancel')}</PopupButton>
                {/* At least one postal component is required for the record to
                    work AS an address — a bare name used to be enough and such
                    rows then showed their label as if it were an address. */}
                <PopupButton variant="primary" loading={saving} disabled={isAddressEmpty(addressParts(form))} onClick={() => void onSubmit()}>
                    {t('common.add')}
                </PopupButton>
            </PopupActions>
        )}
    >
        <PopupField label={t('crm.addressTarget')}>
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={t('crm.addressTarget')}>
                {TARGETS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={target === option.value}
                        onClick={() => onTargetChange(option.value)}
                        className={`ofi-tp-chip ${target === option.value ? 'is-on' : ''}`}
                    >
                        {t(option.labelKey)}
                    </button>
                ))}
            </div>
        </PopupField>
        <PopupField label={t('crm.locationName')}>
            <input autoFocus className={INPUT} value={form.name} onChange={(event) => onFormChange({ ...form, name: event.target.value })} />
        </PopupField>
        <div className="pt-2">
            <AddressFields value={form} onChange={(next) => onFormChange({ ...form, ...next })} inputClassName={INPUT} />
        </div>
    </TenderFloatCard>
);
