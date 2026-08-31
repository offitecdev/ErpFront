import { AddressFields } from '@/components/ui-shared/AddressFields';
import { t } from '@/i18n/translate';

// Form type + empty value live in `detail/utils/tenderAddress.utils.ts` — this
// popup is loaded lazily and must not pull the page's constants back in.
export type { TenderCustomerCreateForm } from '../utils/tenderAddress.utils';
import type { TenderCustomerCreateForm } from '../utils/tenderAddress.utils';
import { PopupActions, PopupButton, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

type CustomerCreatePopupProps = {
    open: boolean;
    onClose: () => void;
    saving: boolean;
    form: TenderCustomerCreateForm;
    onChange: (form: TenderCustomerCreateForm) => void;
    onSubmit: () => void;
};

const INPUT = 'ofi-cal-input w-full';

/**
 * Quick "new customer" from inside the quote: company, e-mail, phone and the
 * postal address as distinct components (there is no single "Address" field
 * anywhere in the quote UI). Floats beside the "+" that opened it.
 */
export const CustomerCreatePopup = ({ open, onClose, saving, form, onChange, onSubmit }: CustomerCreatePopupProps) => (
    <TenderFloatCard
        open={open}
        onClose={() => { if (!saving) onClose(); }}
        title={t('crm.customers.newCustomer')}
        width={520}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose} disabled={saving}>{t('common.cancel')}</PopupButton>
                <PopupButton variant="primary" loading={saving} disabled={!form.companyName.trim()} onClick={() => void onSubmit()}>
                    {t('common.add')}
                </PopupButton>
            </PopupActions>
        )}
    >
        <PopupField label={t('crm.customers.companyName')} required>
            <input
                autoFocus
                className={INPUT}
                value={form.companyName}
                onChange={(event) => onChange({ ...form, companyName: event.target.value })}
                placeholder={t('crm.customers.companyNamePlaceholder')}
            />
        </PopupField>
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <PopupField label={t('common.email')}>
                <input className={INPUT} type="email" value={form.mainEmail} onChange={(event) => onChange({ ...form, mainEmail: event.target.value })} />
            </PopupField>
            <PopupField label={t('common.phone')}>
                <input className={INPUT} value={form.mainPhone} onChange={(event) => onChange({ ...form, mainPhone: event.target.value })} />
            </PopupField>
        </div>
        <div className="pt-2">
            <AddressFields value={form} onChange={(next) => onChange({ ...form, ...next })} inputClassName={INPUT} />
        </div>
    </TenderFloatCard>
);
