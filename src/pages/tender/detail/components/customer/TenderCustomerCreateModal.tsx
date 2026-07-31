import { Plus } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { AddressFields } from '@/components/ui-shared/AddressFields';
import { t } from '@/i18n/translate';

// Form tipi ve bos degeri `detail/utils/tenderAddress.utils.ts` icinde yasar —
// bu pencere `lazy()` ile yuklenir.
export type { TenderCustomerCreateForm } from '../../utils/tenderAddress.utils';
import type { TenderCustomerCreateForm } from '../../utils/tenderAddress.utils';

type TenderCustomerCreateModalProps = {
    open: boolean;
    onClose: () => void;
    saving: boolean;
    form: TenderCustomerCreateForm;
    onChange: (form: TenderCustomerCreateForm) => void;
    onSubmit: () => void;
};

export const TenderCustomerCreateModal = ({ open, onClose, saving, form, onChange, onSubmit }: TenderCustomerCreateModalProps) => (
    <Modal
        open={open}
        onClose={() => !saving && onClose()}
        title={t('crm.customers.newCustomer')}
        width="md"
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
                <Button variant="primary" loading={saving} icon={<Plus size={13} />} onClick={() => void onSubmit()} disabled={!form.companyName.trim()}>{t('common.add')}</Button>
            </>
        }
    >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('crm.customers.companyName')} required className="sm:col-span-2">
                <Input
                    value={form.companyName}
                    onChange={(e) => onChange({ ...form, companyName: e.target.value })}
                    placeholder={t('crm.customers.companyNamePlaceholder')}
                />
            </Field>
            <Field label={t('common.email')}>
                <Input value={form.mainEmail} onChange={(e) => onChange({ ...form, mainEmail: e.target.value })} />
            </Field>
            <Field label={t('common.phone')}>
                <Input value={form.mainPhone} onChange={(e) => onChange({ ...form, mainPhone: e.target.value })} />
            </Field>
            {/* Adres: ayri bilesenler — teklif arayuzunde de tek bir "Adres"
                alani YOKTUR; gosterim iki satira iner. */}
            <div className="sm:col-span-2">
                <AddressFields value={form} onChange={(next) => onChange({ ...form, ...next })} />
            </div>
        </div>
    </Modal>
);
