import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save01 as Save } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { apiClient } from '../../lib/axios';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Select } from '../../components/ui-shared/Field';
import { Modal } from '../../components/ui-shared/Modal';
import { AddressFields } from '../../components/ui-shared/AddressFields';
import { EMPTY_ADDRESS } from '../../components/ui-shared/addressForm';
import type { AddressFormValue } from '../../components/ui-shared/addressForm';
import {
    CUSTOMER_LANGUAGE_OPTIONS,
    CUSTOMER_STATUS_OPTIONS,
    CUSTOMER_TYPE_OPTIONS,
    DEFAULT_CUSTOMER_STATUS,
    DEFAULT_CUSTOMER_TYPE,
} from './customerType';

/**
 * Neuen Kunden anlegen — als quadratisches Fenster, das von UNTEN hereinfährt
 * (`placement="sheet"`). Die Felder stehen in ZWEI Spalten: im breiten Fenster
 * wird damit jedes Eingabefeld deutlich breiter als in der früheren schmalen
 * Einzelspalte, und das Formular bleibt trotzdem in Lesehöhe. Felder mit langem
 * Inhalt (Firma, E-Mail, Webseite, Ansprechpartner) laufen über beide Spalten.
 *
 * Die Auswahllisten (Art, Status, Sprache) kommen aus `customerType.ts` —
 * dieselbe Quelle, die auch die Kundenübersicht benutzt.
 */

export interface CustomerCreateForm extends AddressFormValue {
    companyName: string;
    customerType: string;
    vatNumber: string;
    priceList: string;
    mainEmail: string;
    mainPhone: string;
    mobilePhone: string;
    website: string;
    language: string;
    responsibleFirstName: string;
    responsibleLastName: string;
    addressName: string;
    status: string;
}

const BLANK: CustomerCreateForm = {
    companyName: '',
    customerType: DEFAULT_CUSTOMER_TYPE,
    vatNumber: '',
    priceList: '',
    mainEmail: '',
    mainPhone: '',
    mobilePhone: '',
    website: '',
    language: '',
    responsibleFirstName: '',
    responsibleLastName: '',
    addressName: '',
    ...EMPTY_ADDRESS,
    status: DEFAULT_CUSTOMER_STATUS,
};

/**
 * Trennt die Abschnitte, ohne eine zweite Kartenebene aufzumachen. Läuft über
 * beide Spalten des Rasters, damit die Trennlinie das ganze Fenster überspannt.
 */
const SectionLabel = ({ children }: { children: string }) => (
    <span className="col-span-full mt-1 block border-t border-slate-100 pt-3 text-[11.5px] font-semibold uppercase tracking-wider text-slate-400 first:mt-0 first:border-t-0 first:pt-0 dark:border-white/10 dark:text-white/40">
        {children}
    </span>
);

export const CustomerCreateModal = ({
    open,
    onClose,
    onCreated,
}: {
    open: boolean;
    onClose: () => void;
    /** Bekommt die id des angelegten Kunden — der Aufrufer entscheidet, ob er lädt oder springt. */
    onCreated: (customerId: string | null) => void;
}) => {
    const [form, setForm] = useState<CustomerCreateForm>(BLANK);
    const [submitting, setSubmitting] = useState(false);
    const [attempted, setAttempted] = useState(false);

    // Jedes Öffnen beginnt mit einem leeren Formular.
    useEffect(() => {
        if (open) { setForm(BLANK); setAttempted(false); }
    }, [open]);

    const set = (patch: Partial<CustomerCreateForm>) => setForm((current) => ({ ...current, ...patch }));

    const submit = async (event?: React.FormEvent) => {
        event?.preventDefault();
        setAttempted(true);
        if (!form.companyName.trim()) {
            toast.error(t('crm.customers.companyNameRequired'));
            return;
        }
        try {
            setSubmitting(true);
            const response = await apiClient.post('/customers', form);
            toast.success(t('crm.customers.successAdd'));
            onCreated(response.data?.id ?? null);
            onClose();
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('crm.customers.errorAdd'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Modal
            open={open}
            title={t('crm.customers.newCustomer')}
            description={t('crm.customers.newCustomerDesc')}
            onClose={onClose}
            placement="sheet"
            sheetSize={880}
            // Ein Klick daneben darf ein halb ausgefülltes Formular nicht wegwerfen.
            closeOnBackdrop={false}
            footer={
                <div className="flex justify-end gap-2">
                    <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
                    <Button variant="primary" loading={submitting} icon={<Save size={13} />} onClick={() => void submit()}>
                        {t('common.save')}
                    </Button>
                </div>
            }
        >
            {/* Zwei Spalten; `col-span-full` gibt langen Feldern die ganze Breite. */}
            <form onSubmit={submit} className="grid grid-cols-1 gap-x-6 gap-y-4 md:grid-cols-2">
                {attempted && !form.companyName.trim() && (
                    <div className="col-span-full flex items-center gap-2 rounded-[2px] border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
                        <Plus size={12} className="rotate-45" />
                        <span className="font-medium">{t('crm.customers.requiredFieldWarning')}</span>
                    </div>
                )}

                <SectionLabel>{t('crm.customers.customerType')}</SectionLabel>
                <Field
                    label={t('crm.customers.companyName')}
                    required
                    error={attempted && !form.companyName.trim() ? t('common.required') : undefined}
                    className="col-span-full"
                >
                    <Input
                        autoFocus
                        value={form.companyName}
                        onChange={(e) => set({ companyName: e.target.value })}
                        placeholder={t('crm.customers.companyNamePlaceholder')}
                    />
                </Field>
                <Field label={t('crm.customers.customerType')}>
                    <Select value={form.customerType} onChange={(e) => set({ customerType: e.target.value })}>
                        {CUSTOMER_TYPE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                    </Select>
                </Field>
                <Field label={t('common.status')}>
                    <Select value={form.status} onChange={(e) => set({ status: e.target.value })}>
                        {CUSTOMER_STATUS_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                    </Select>
                </Field>
                <Field label={t('crm.customers.vatNumber')}>
                    <Input value={form.vatNumber} onChange={(e) => set({ vatNumber: e.target.value })} />
                </Field>
                <Field label={t('crm.customers.priceList')}>
                    <Input value={form.priceList} onChange={(e) => set({ priceList: e.target.value })} />
                </Field>

                <SectionLabel>{t('crm.customers.contactData')}</SectionLabel>
                <Field label={t('common.email')} className="col-span-full">
                    <Input type="email" value={form.mainEmail} onChange={(e) => set({ mainEmail: e.target.value })} />
                </Field>
                <Field label={t('common.phone')}>
                    <Input value={form.mainPhone} onChange={(e) => set({ mainPhone: e.target.value })} />
                </Field>
                <Field label={t('crm.customers.mobilePhone')}>
                    <Input value={form.mobilePhone} onChange={(e) => set({ mobilePhone: e.target.value })} />
                </Field>
                <Field label={t('crm.customers.website')} className="col-span-full">
                    <Input value={form.website} onChange={(e) => set({ website: e.target.value })} placeholder="https://" />
                </Field>
                <Field label={t('crm.customers.language')}>
                    <Select value={form.language} onChange={(e) => set({ language: e.target.value })}>
                        <option value="">{t('common.select')}</option>
                        {CUSTOMER_LANGUAGE_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{t(option.labelKey)}</option>
                        ))}
                    </Select>
                </Field>
                {/* Zwei Namen in einem Feld — deshalb über die ganze Breite, damit
                    Vor- und Nachname nicht auf halbe Spaltenbreite gequetscht werden. */}
                <Field label={t('crm.customers.responsibleEmployee')} className="col-span-full">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <Input
                            value={form.responsibleFirstName}
                            onChange={(e) => set({ responsibleFirstName: e.target.value })}
                            placeholder={t('crm.customers.responsibleFirstName')}
                        />
                        <Input
                            value={form.responsibleLastName}
                            onChange={(e) => set({ responsibleLastName: e.target.value })}
                            placeholder={t('crm.customers.responsibleLastName')}
                        />
                    </div>
                </Field>

                <SectionLabel>{t('crm.locationPrimary')}</SectionLabel>
                <Field label={t('crm.locationName')} className="col-span-full">
                    <Input value={form.addressName} onChange={(e) => set({ addressName: e.target.value })} />
                </Field>
                {/* Adresse in getrennten Bestandteilen — dieselbe Quelle wie überall
                    sonst. Bringt ihr eigenes zweispaltiges Raster mit, darum hier
                    über die ganze Breite eingesetzt. */}
                <div className="col-span-full">
                    <AddressFields value={form} onChange={(next) => set(next)} />
                </div>

                {/* Absenden per Enter; der sichtbare Knopf sitzt in der Fussleiste. */}
                <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
            </form>
        </Modal>
    );
};
