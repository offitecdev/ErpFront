import { useEffect, useMemo, useState } from 'react';
import { List as ListIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { ComboCell } from '@/pages/inventory/components/ComboCell';
import { CustomerPickerModal } from './CustomerPickerModal';
import { useCustomerLookup } from '../hooks/useCustomerLookup';
import { personName } from '../utils/crmFormat.utils';
import type { CrmContactOption, CrmCustomerOption } from '../types/crm.types';

/**
 * Kunde UND Ansprechpartner als Tippfelder — dieselbe Bedienung wie die
 * Produktzelle im Lagermodul (Vorgabe 15.08.2026): das Feld IST die Suche,
 * darunter klappen rund sieben Treffer auf und ändern sich beim Tippen; ganz
 * unten steht "Alle Kunden …", das die grosse Auswahl öffnet.
 *
 * Gesucht wird über Firma UND Ansprechpartner: wer den Namen der
 * Kontaktperson tippt, findet ihren Kunden (der Server durchsucht dazu die
 * Ansprechpartner mit). Die Trefferzeile zeigt den Ansprechpartner der
 * Kundenliste als kleine Nebenschrift.
 *
 * Ist ein Kunde gewählt, erscheint darunter dasselbe Feld für den
 * Ansprechpartner — seine Liste ist kurz und liegt nach dem ersten Laden im
 * Speicher, sie wird also im Browser gefiltert.
 *
 * `withContact={false}` lässt dieses zweite Feld weg (12.09.2026, Vorgabe
 * Samet: «nimm den Ansprechpartner aus dem Fenster»). Es gibt Erfassungen, die
 * nur wissen wollen, WESSEN Sache etwas ist — eine Aufgabe etwa hängt am
 * Kunden, nicht an einer bestimmten Person darin. Dann steht dort EIN Feld,
 * und das Fenster bleibt eine Zeile hoch.
 */
/** Breite der Vorschlagsliste im Formular — so breit wie das Feld selbst. */
const FIELD_LIST_WIDTH = 472;

export const CustomerContactCombo = ({
    customer,
    contact,
    onChange,
    /** Stapelhöhe des grossen Auswahlfensters (über einem offenen Formular). */
    z,
    required,
    withContact = true,
}: {
    customer: CrmCustomerOption | null;
    contact: CrmContactOption | null;
    onChange: (customer: CrmCustomerOption | null, contact: CrmContactOption | null) => void;
    z?: number;
    required?: boolean;
    /** Ohne das zweite Feld: nur der Kunde (12.09.2026). */
    withContact?: boolean;
}) => {
    // Getippter Text; ist ein Kunde gewählt, steht sein Name darin.
    const [query, setQuery] = useState(customer?.companyName ?? '');
    const [open, setOpen] = useState(false);
    const [allOpen, setAllOpen] = useState(false);
    // Geladen wird NUR, solange die Liste offen ist.
    const { items, loading } = useCustomerLookup(query, open);

    // Wird der Kunde von aussen gesetzt (grosse Auswahl, Zurücksetzen), zieht der Text nach.
    useEffect(() => { setQuery(customer?.companyName ?? ''); }, [customer]);

    const options = useMemo(
        () => items.map((item) => ({ id: item.id, label: item.companyName, meta: item.responsibleName || undefined })),
        [items],
    );

    return (
        <>
            <ComboCell
                open={open}
                onOpenChange={setOpen}
                value={query}
                onChange={(next) => {
                    setQuery(next);
                    // Tippen löst die Bindung: der blosse Text ist kein Kunde.
                    if (customer) onChange(null, null);
                }}
                options={options}
                loading={loading}
                // Pflichtfeld: gestrichelt, solange kein echter Kunde gebunden ist.
                invalid={required ? !customer : Boolean(query.trim()) && !customer}
                placeholder={t('crm.quick.customerSearch')}
                emptyText={t('crm.quick.noCustomer')}
                inputClassName="!h-10 !text-sm"
                // Im Formular ist die Liste so breit wie das Feld (in der
                // Tabellenzelle bleibt sie schmal) — sonst steht ein langer
                // Firmenname abgeschnitten unter einem breiten Feld.
                listWidth={FIELD_LIST_WIDTH}
                onSelect={(option) => {
                    const picked = items.find((item) => item.id === option.id);
                    if (picked) onChange(picked, null);
                }}
                actions={[{
                    key: 'all',
                    label: t('crm.quick.customerPickTitle'),
                    icon: <ListIcon size={12} />,
                    onSelect: () => { setOpen(false); setAllOpen(true); },
                }]}
            />

            {withContact && customer && (
                <ContactCombo
                    customerId={customer.id}
                    contact={contact}
                    onPick={(next) => onChange(customer, next)}
                />
            )}

            {/* "Alle Kunden …" — das grosse Fenster wählt Kunde UND
                Ansprechpartner; ohne das zweite Feld fragt es nur nach dem
                Kunden und gibt keinen Ansprechpartner zurück. */}
            <CustomerPickerModal
                open={allOpen}
                onClose={() => setAllOpen(false)}
                withContact={withContact}
                z={z}
                onSelect={(pick) => onChange(pick.customer, withContact ? pick.contact : null)}
            />
        </>
    );
};

/** Ansprechpartner des gewählten Kunden — gleiche Bedienung, kurze Liste. */
const ContactCombo = ({
    customerId,
    contact,
    onPick,
}: {
    customerId: string;
    contact: CrmContactOption | null;
    onPick: (contact: CrmContactOption | null) => void;
}) => {
    const [query, setQuery] = useState(contact ? personName(contact) : '');
    const [open, setOpen] = useState(false);
    const [contacts, setContacts] = useState<CrmContactOption[] | null>(null);

    useEffect(() => { setQuery(contact ? personName(contact) : ''); }, [contact]);

    // Je Kunde einmal laden; die Liste ist kurz.
    useEffect(() => {
        let cancelled = false;
        setContacts(null);
        crmApi.listContacts({ customerId, pageSize: 100 })
            .then((result) => {
                if (cancelled) return;
                setContacts(result.data.map((row) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName })));
            })
            .catch(() => { if (!cancelled) setContacts([]); });
        return () => { cancelled = true; };
    }, [customerId]);

    const options = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return (contacts ?? [])
            .map((row) => ({ id: row.id, label: personName(row) }))
            .filter((option) => !needle || option.label.toLowerCase().includes(needle))
            .slice(0, 7);
    }, [contacts, query]);

    return (
        <div className="mt-2">
            <ComboCell
                open={open}
                onOpenChange={setOpen}
                value={query}
                onChange={(next) => { setQuery(next); if (contact) onPick(null); }}
                options={options}
                loading={contacts === null}
                // Der Ansprechpartner ist freiwillig — ein leeres Feld ist richtig.
                invalid={false}
                placeholder={t('crm.quick.contactSearch')}
                emptyText={t('crm.quick.contactEmpty')}
                inputClassName="!h-10 !text-sm"
                listWidth={FIELD_LIST_WIDTH}
                onSelect={(option) => {
                    const picked = (contacts ?? []).find((row) => row.id === option.id);
                    if (picked) onPick(picked);
                }}
            />
        </div>
    );
};
