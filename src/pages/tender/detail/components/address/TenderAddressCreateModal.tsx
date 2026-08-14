import { Plus } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Select } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { AddressFields } from '@/components/ui-shared/AddressFields';
import { addressParts } from '@/components/ui-shared/addressForm';
import { isAddressEmpty } from '@/utils/address';
import { t } from '@/i18n/translate';

// Form tipi ve bos degeri `detail/utils/tenderAddress.utils.ts` icinde yasar —
// bu dosya `lazy()` ile yuklenir, sabitleri buradan import etmek parcayi ana
// pakete geri cekerdi.
export type { TenderAddressCreateForm, TenderAddressTarget } from '../../utils/tenderAddress.utils';
import type { TenderAddressCreateForm, TenderAddressTarget } from '../../utils/tenderAddress.utils';

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
                {/* Kaydin adres OLARAK ise yaramasi icin en az bir posta bileseni
                    sart. Eskiden ad TEK BASINA yeterliydi: bilesensiz kayitlar
                    boyle olusuyor, sonra etiketleri adres diye gorunuyordu. */}
                <Button variant="primary" loading={saving} icon={<Plus size={13} />} onClick={() => void onSubmit()} disabled={isAddressEmpty(addressParts(form))}>{t('common.add')}</Button>
            </>
        }
    >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label={t('crm.addressTarget')} className="sm:col-span-2">
                <Select value={target} onChange={(e) => onTargetChange(e.target.value as TenderAddressTarget)}>
                    <option value="INSTALLATION">{t('crm.addressTargetInstallation')}</option>
                    <option value="DELIVERY">{t('crm.addressTargetDelivery')}</option>
                    <option value="BILLING">{t('crm.addressTargetBilling')}</option>
                    <option value="CUSTOMER">{t('crm.addressTargetCustomer')}</option>
                </Select>
            </Field>
            <Field label={t('crm.locationName')} className="sm:col-span-2">
                <Input value={form.name} onChange={(e) => onFormChange({ ...form, name: e.target.value })} />
            </Field>
            <div className="sm:col-span-2">
                <AddressFields value={form} onChange={(next) => onFormChange({ ...form, ...next })} />
            </div>
        </div>
    </Modal>
);
