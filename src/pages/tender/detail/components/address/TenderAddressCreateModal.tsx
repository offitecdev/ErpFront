import { Plus } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';

export type TenderAddressTarget = 'INSTALLATION' | 'BILLING' | 'CUSTOMER';

export type TenderAddressCreateForm = {
    name: string;
    address: string;
    postalCode: string;
    city: string;
    country: string;
};

type TenderAddressCreateModalProps = {
    open: boolean;
    onClose: () => void;
    saving: boolean;
    target: TenderAddressTarget;
    onTargetChange: (target: TenderAddressTarget) => void;
    form: TenderAddressCreateForm;
    onFormChange: (form: TenderAddressCreateForm) => void;
    onSubmit: () => void;
};

export const TenderAddressCreateModal = ({
    open,
    onClose,
    saving,
    target,
    onTargetChange,
    form,
    onFormChange,
    onSubmit,
}: TenderAddressCreateModalProps) => (
    <Modal
        open={open}
        onClose={() => !saving && onClose()}
        title={t('crm.addAddressTitle')}
        width="md"
        footer={
            <>
                <Button variant="secondary" onClick={onClose} disabled={saving}>{t('common.cancel')}</Button>
                <Button variant="primary" loading={saving} icon={<Plus size={13} />} onClick={() => void onSubmit()} disabled={!form.address.trim() && !form.name.trim()}>{t('common.add')}</Button>
            </>
        }
    >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('crm.addressTarget')} className="sm:col-span-2">
                <Select value={target} onChange={(e) => onTargetChange(e.target.value as TenderAddressTarget)}>
                    <option value="INSTALLATION">{t('crm.addressTargetInstallation')}</option>
                    <option value="BILLING">{t('crm.addressTargetBilling')}</option>
                    <option value="CUSTOMER">{t('crm.addressTargetCustomer')}</option>
                </Select>
            </Field>
            <Field label={t('crm.locationName')} className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} />
            </Field>
            <Field label={t('common.address')} className="sm:col-span-2">
                <Input value={form.address} onChange={(e) => onFormChange({ ...form, address: e.target.value })} />
            </Field>
            <Field label={t('crm.postalCode')}>
                <Input value={form.postalCode} onChange={(e) => onFormChange({ ...form, postalCode: e.target.value })} />
            </Field>
            <Field label={t('crm.city')}>
                <Input value={form.city} onChange={(e) => onFormChange({ ...form, city: e.target.value })} />
            </Field>
            <Field label={t('crm.country')} className="sm:col-span-2">
                <Input value={form.country} onChange={(e) => onFormChange({ ...form, country: e.target.value })} />
            </Field>
        </div>
    </Modal>
);
