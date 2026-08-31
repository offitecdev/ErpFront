import { useEffect, useState } from 'react';

import { AddressFields } from '@/components/ui-shared/AddressFields';
import { EMPTY_ADDRESS, addressParts } from '@/components/ui-shared/addressForm';
import type { AddressFormValue } from '@/components/ui-shared/addressForm';
import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { formatAddressLines } from '@/utils/address';

import { PopupActions, PopupButton, PopupField, TenderFloatCard } from './shell/TenderPopupShell';

/**
 * ── KUNDENANGABEN DIESER OFFERTE (05.09.2026) ────────────────────────────────
 * Name, E-Mail und Adresse werden hier DIREKT eingetragen — auch wenn die
 * Kundschaft gar nicht im CRM steht.
 *
 *  • Ohne CRM-Kunden trägt die Offerte diese Angaben allein.
 *  • MIT CRM-Kunden werden seine Angaben beim Öffnen geholt und dürfen geändert
 *    werden: die Änderung gilt NUR für diese Offerte, im Kundenstamm ändert
 *    sich NICHTS (genau das war der Wunsch). "Kundendaten übernehmen" wirft die
 *    Abweichung wieder weg und lässt die Offerte dem Stamm folgen.
 *
 * Die Adresse wird wie überall in EINZELNEN Bestandteilen erfasst (Strasse /
 * PLZ / Ort / Land) und beim Speichern zu den höchstens zwei Zeilen gefaltet,
 * die die Offerte und das PDF drucken.
 */

export type ManualCustomerValues = {
    name: string;
    email: string;
    /** Mehrzeilig, wie an der Offerte gespeichert. */
    address: string;
};

/**
 * Gespeicherte Anschrift → Bestandteile. Zwei Schreibweisen kommen vor:
 *   "Strasse, Zusatz" / "PLZ Ort, Kanton, Land"   (formatAddressLines)
 *   "Strasse" / "PLZ Ort" / "Land"                 (OSP-Import)
 * Was sich nicht sicher zuordnen lässt, bleibt im Ortsfeld stehen, statt
 * erfunden zu werden.
 */
const parseAddressLines = (value: string): AddressFormValue => {
    const lines = String(value || '').split('\n').map((line) => line.trim()).filter(Boolean);
    if (!lines.length) return { ...EMPTY_ADDRESS };
    const [street, supplement] = lines[0].split(', ');
    const localityParts = (lines[1] ?? '').split(', ').map((part) => part.trim()).filter(Boolean);
    const place = localityParts[0] ?? '';
    // "4132 Muttenz" → PLZ + Ort; ohne führende Zahl gilt alles als Ort.
    const placeMatch = place.match(/^([0-9][0-9A-Za-z-]*)\s+(.*)$/);
    const rest = localityParts.slice(1);
    return {
        ...EMPTY_ADDRESS,
        address: street ?? '',
        addressSupplement: supplement ?? '',
        postalCode: placeMatch ? placeMatch[1] : '',
        city: placeMatch ? placeMatch[2] : place,
        // Zweite Zeile "… , Kanton, Land" bzw. dritte Zeile = Land (OSP).
        state: rest.length > 1 ? rest[0] : '',
        country: (rest.length > 1 ? rest[1] : rest[0]) || lines[2] || '',
    };
};

const joinAddressForm = (value: AddressFormValue): string =>
    formatAddressLines(addressParts(value)).join('\n');

export const ManualCustomerPopup = ({
    open,
    onClose,
    customerId,
    current,
    onSave,
}: {
    open: boolean;
    onClose: () => void;
    /** Verknüpfter CRM-Kunde, falls vorhanden — nur als Vorlage und Rückweg. */
    customerId?: string | null;
    /** Was die Offerte HEUTE zeigt (Stamm oder bereits abweichend erfasst). */
    current: ManualCustomerValues;
    /**
     * `values` = was künftig an der Offerte steht, `base` = die Angaben des CRM-
     * Kunden (leer ohne Kunden). Gleicht ein Feld dem Stamm, wird es NICHT als
     * Abweichung gespeichert.
     */
    onSave: (values: ManualCustomerValues, base: ManualCustomerValues) => void;
}) => {
    const [name, setName] = useState(current.name);
    const [email, setEmail] = useState(current.email);
    const [address, setAddress] = useState<AddressFormValue>(() => parseAddressLines(current.address));
    /** Die Angaben des CRM-Kunden — Vorlage für "Kundendaten übernehmen". */
    const [base, setBase] = useState<ManualCustomerValues | null>(null);

    useEffect(() => {
        if (!open) return;
        setName(current.name);
        setEmail(current.email);
        setAddress(parseAddressLines(current.address));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    useEffect(() => {
        if (!open || !customerId) { setBase(null); return; }
        let cancelled = false;
        // Kurzfassung der Kundenkarte (ein Datensatz, keine Listen) — nur als
        // Vorlage; geschrieben wird dort nie.
        apiClient.get(`/customers/${customerId}/dashboard`, { params: { summary: 'true' } })
            .then((res) => {
                if (cancelled) return;
                const row = (res.data?.customer ?? res.data ?? {}) as Record<string, unknown>;
                const text = (value: unknown) => (value == null ? '' : String(value));
                setBase({
                    name: text(row.companyName),
                    email: text(row.mainEmail),
                    address: joinAddressForm({
                        ...EMPTY_ADDRESS,
                        address: text(row.address),
                        addressSupplement: text(row.addressSupplement),
                        postalCode: text(row.postalCode),
                        city: text(row.city),
                        state: text(row.state),
                        country: text(row.country),
                    }),
                });
            })
            .catch(() => { if (!cancelled) setBase(null); });
        return () => { cancelled = true; };
    }, [open, customerId]);

    const submit = () => {
        onSave(
            { name: name.trim(), email: email.trim(), address: joinAddressForm(address) },
            base ?? { name: '', email: '', address: '' },
        );
        onClose();
    };

    const useCustomerData = () => {
        if (!base) return;
        onSave({ name: '', email: '', address: '' }, base);
        onClose();
    };

    return (
        <TenderFloatCard
            open={open}
            onClose={onClose}
            title={t('tenders.manualCustomer.title')}
            subtitle={t('tenders.manualCustomer.subtitle')}
            width={560}
            footer={(
                <PopupActions>
                    <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                    {base && (
                        <PopupButton onClick={useCustomerData}>{t('tenders.manualCustomer.useCrm')}</PopupButton>
                    )}
                    <PopupButton variant="primary" onClick={submit}>{t('common.save')}</PopupButton>
                </PopupActions>
            )}
        >
            <PopupField label={t('address.companyName')}>
                <input
                    autoFocus
                    className="ofi-cal-input w-full"
                    value={name}
                    placeholder={t('tenders.manualCustomer.namePlaceholder')}
                    onChange={(event) => setName(event.target.value)}
                />
            </PopupField>
            <PopupField label={t('common.email')}>
                <input
                    className="ofi-cal-input w-full"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                />
            </PopupField>
            <div className="pt-2">
                <AddressFields
                    value={address}
                    onChange={setAddress}
                    inputClassName="ofi-cal-input w-full"
                />
            </div>
        </TenderFloatCard>
    );
};
