import { useEffect, useMemo, useRef, useState } from 'react';
import { LuUsers, LuX } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { mailMessagesApi, type AddressBookEntry } from '@/lib/api/mail';
import { ComboCell, type ComboOption } from '@/pages/inventory/components/ComboCell';
import { CustomerPickerModal } from '@/pages/crm/components/CustomerPickerModal';

/**
 * EMPFÄNGERFELD des Schreiben-Fensters (Vorgabe 18.08.2026).
 *
 * Bedienung wie die Produktzelle im Angebot: das Feld IST die Suche, DIREKT
 * DARUNTER klappt die Trefferliste auf (an der Zelle hängend, siehe Vorlage
 * example2.png), ganz unten steht "Alle Kunden …", das die grosse Auswahl
 * öffnet.
 *
 * EINE GEMISCHTE LISTE (Vorgabe 18.08.2026): keine Überschriften für Kunden,
 * Ansprechpartner und Personal mehr — die drei stehen durcheinander in einer
 * Liste, MITARBEITENDE ZUERST (die häufigsten Empfänger), danach die
 * Kundenseite. Damit die Zeilen trotzdem unterscheidbar bleiben, trägt jede
 * ihre Herkunft als leise Nebenzeile: `· Intern` bei Mitarbeitenden, der
 * Firmenname bei Ansprechpartnern.
 *
 * EMPFÄNGER GIBT ES NUR AUS DEM SYSTEM (Vorgabe 18.08.2026): Kunden,
 * Ansprechpartner und registrierte Personen. Getippter Text ist AUSSCHLIESSLICH
 * Suchtext — eine frei eingegebene Adresse wird NICHT übernommen. Wer jemand
 * Neues anschreiben will, legt ihn zuerst als Ansprechpartner oder Kunde an;
 * so bleibt jede Nachricht einem Datensatz zugeordnet.
 *
 * Gewählte Empfänger stehen als Chips ÜBER dem Feld, damit mehrere Adressen
 * lesbar bleiben; `keepOpenOnSelect` hält die Liste offen, sodass man mehrere
 * hintereinander anklicken kann.
 */

/** Mitarbeitende zuerst, danach Kunden und Ansprechpartner in Serverreihenfolge. */
const KIND_ORDER: Record<AddressBookEntry['kind'], number> = {
    EMPLOYEE: 0,
    CUSTOMER: 1,
    CONTACT: 1,
};

export interface Recipient {
    email: string;
    name?: string | null;
    /** Woher der Empfänger stammt — die Bestätigung gruppiert danach. */
    kind?: AddressBookEntry['kind'] | null;
    /** Bei Ansprechpartnern der Kunde, zu dem sie gehören. */
    subtitle?: string | null;
}

export const RecipientCombo = ({
    label,
    value,
    onChange,
    placeholder,
    autoFocus,
    onCustomerPicked,
}: {
    label: string;
    value: Recipient[];
    onChange: (next: Recipient[]) => void;
    placeholder?: string;
    autoFocus?: boolean;
    /** Wird ein Kunde gewählt, kann der Aufrufer ihn als Bezug übernehmen. */
    onCustomerPicked?: (customerId: string, companyName: string) => void;
}) => {
    const [query, setQuery] = useState('');
    const [open, setOpen] = useState(false);
    const [entries, setEntries] = useState<AddressBookEntry[]>([]);
    const [loading, setLoading] = useState(false);
    const [allOpen, setAllOpen] = useState(false);
    const requestRef = useRef(0);

    // Geladen wird NUR, solange die Liste offen ist — und entprellt, sonst
    // fragt jeder Tastendruck den Server.
    useEffect(() => {
        if (!open) return;
        const ticket = ++requestRef.current;
        setLoading(true);
        const timer = window.setTimeout(() => {
            mailMessagesApi.addressBook(query.trim())
                .then((result) => { if (ticket === requestRef.current) setEntries(result.entries || []); })
                .catch(() => { if (ticket === requestRef.current) setEntries([]); })
                .finally(() => { if (ticket === requestRef.current) setLoading(false); });
        }, 180);
        return () => window.clearTimeout(timer);
    }, [query, open]);

    const chosen = useMemo(() => new Set(value.map((item) => item.email.toLowerCase())), [value]);

    const options: ComboOption[] = useMemo(
        () => entries
            .filter((entry) => !chosen.has(entry.email.toLowerCase()))
            // Stabil sortieren: nur die Art entscheidet, innerhalb bleibt die
            // Reihenfolge des Servers (alphabetisch) erhalten.
            .map((entry, index) => ({ entry, index }))
            .sort((a, b) => (KIND_ORDER[a.entry.kind] - KIND_ORDER[b.entry.kind]) || (a.index - b.index))
            .map(({ entry }) => {
                // Ohne Überschriften sagt die Nebenzeile, wen man vor sich hat.
                const hint = entry.kind === 'EMPLOYEE' ? t('mail.page.internal') : entry.subtitle;
                return {
                    id: `${entry.kind}:${entry.id}`,
                    label: hint ? `${entry.name} · ${hint}` : entry.name,
                    meta: entry.email,
                };
            }),
        [entries, chosen],
    );

    const add = (recipient: Recipient) => {
        const email = recipient.email.trim();
        if (!email || chosen.has(email.toLowerCase())) return;
        onChange([...value, {
            email,
            name: recipient.name ?? null,
            kind: recipient.kind ?? null,
            subtitle: recipient.subtitle ?? null,
        }]);
        setQuery('');
    };

    return (
        <>
            <div className="ofi-mailc__recipients">
                {value.length > 0 && (
                    <div className="ofi-mailc__chips">
                        {value.map((recipient) => (
                            <span key={recipient.email} className="ofi-mailc__recipient" title={recipient.email}>
                                <span className="ofi-mailc__recipient-name">{recipient.name || recipient.email}</span>
                                {recipient.name && <span className="ofi-mailc__recipient-mail">{recipient.email}</span>}
                                <button
                                    type="button"
                                    aria-label={t('common.delete')}
                                    onClick={() => onChange(value.filter((item) => item.email !== recipient.email))}
                                >
                                    <LuX size={11} />
                                </button>
                            </span>
                        ))}
                    </div>
                )}
                <ComboCell
                    open={open}
                    onOpenChange={(next) => {
                        setOpen(next);
                        // Der Suchtext wird beim Schliessen VERWORFEN: er ist
                        // Suchtext, keine Adresse.
                        if (!next) setQuery('');
                    }}
                    value={query}
                    onChange={setQuery}
                    options={options}
                    loading={loading}
                    onSelect={(option) => {
                        const entry = entries.find((item) => `${item.kind}:${item.id}` === option.id);
                        if (!entry) return;
                        add({ email: entry.email, name: entry.name, kind: entry.kind, subtitle: entry.subtitle });
                        if (entry.customerId && onCustomerPicked) onCustomerPicked(entry.customerId, entry.subtitle || entry.name);
                    }}
                    keepOpenOnSelect
                    actions={[{
                        key: 'all-customers',
                        label: t('mail.compose.allCustomers'),
                        icon: <LuUsers size={13} />,
                        onSelect: () => { setOpen(false); setAllOpen(true); },
                    }]}
                    placeholder={placeholder || label}
                    emptyText={t('mail.compose.noMatchesKnownOnly')}
                    autoFocus={autoFocus}
                    inputClassName="ofi-mailc__input"
                    panelClassName="ofi-mail-pop"
                    listWidth={460}
                />
            </div>

            {allOpen && (
                <CustomerPickerModal
                    open={allOpen}
                    onClose={() => setAllOpen(false)}
                    withContact
                    z={170}
                    onSelect={(pick) => {
                        setAllOpen(false);
                        if (onCustomerPicked) onCustomerPicked(pick.customer.id, pick.customer.companyName);
                        // Die grosse Auswahl liefert Namen, keine Adressen — die
                        // holt der Empfängerdienst des Kunden nach. Ein gewählter
                        // Ansprechpartner schlägt dabei die Hauptadresse: wer eine
                        // Person angeklickt hat, meint deren Postfach.
                        void mailMessagesApi.recipients(pick.customer.id)
                            .then((data) => {
                                const contact = pick.contact
                                    ? data.contacts.find((row) => row.id === pick.contact!.id)
                                    : null;
                                if (contact?.email) {
                                    add({
                                        email: contact.email,
                                        name: `${contact.firstName} ${contact.lastName}`.trim(),
                                        kind: 'CONTACT',
                                        subtitle: data.customer.companyName,
                                    });
                                    return;
                                }
                                if (data.customer.mainEmail) {
                                    add({ email: data.customer.mainEmail, name: data.customer.companyName, kind: 'CUSTOMER' });
                                }
                            })
                            .catch(() => undefined);
                    }}
                />
            )}
        </>
    );
};
