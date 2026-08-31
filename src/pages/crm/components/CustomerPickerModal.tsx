import { useEffect, useState } from 'react';
import { ArrowLeft, ChevronRight, User01 } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { getShared } from '@/lib/axios';
import { crmApi } from '@/lib/api/crm';
import { inputClass } from '@/components/ui-shared/Field';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { CenterModal } from '@/pages/calendar/components/shells';
import type { CrmContactOption, CrmCustomerOption, CrmCustomerPick } from '../types/crm.types';

/**
 * Kundenauswahl als Fenster — dieselbe Bedienung wie beim Hinzufügen einer
 * Produktzeile im Angebot: oben ein Suchfeld, darunter die Trefferliste, ein
 * Klick auf die Zeile übernimmt.
 *
 * Die Auswahl schliesst den ANSPRECHPARTNER mit ein (Vorgabe 15.08.2026, wie
 * in der Kundenakte): mit `withContact` folgt nach dem Kunden ein zweiter
 * Schritt mit seinen Ansprechpartnern ("Ohne Ansprechpartner" steht immer
 * zur Wahl). Hat der Kunde keine, ist die Wahl mit dem Kunden fertig. Jede
 * Kundenzeile zeigt zudem den Ansprechpartner der Kundenliste als Unterzeile.
 *
 * Die Kundenliste kommt aus der SCHLANKEN Kundenabfrage (`fields=list`) und
 * ist auf 20 Zeilen begrenzt: gesucht wird auf dem Server, geblättert wird
 * nicht — wer den Kunden nicht sieht, tippt zwei Buchstaben mehr.
 *
 * Reines Portal + CSS (CenterModal des Kalenders), kein antd; `compact` hält
 * das Fenster schmal (index.css zöge es sonst auf die Bildschirmbreite).
 */
const PAGE_SIZE = 20;

interface CustomerListRow {
    id: string;
    companyName: string;
    responsibleFirstName?: string | null;
    responsibleLastName?: string | null;
}

const toOption = (row: CustomerListRow): CrmCustomerOption => ({
    id: row.id,
    companyName: row.companyName,
    responsibleName: [row.responsibleFirstName, row.responsibleLastName].filter(Boolean).join(' ').trim() || null,
});

const ROW_CLASS = 'ofi-option-row group flex w-full cursor-pointer items-center gap-2.5 border-b border-slate-100 px-3 py-2.5 text-left transition-colors last:border-b-0 dark:border-white/10';
/* `group-hover:!text-white` mit Ausrufezeichen: index.css setzt .text-slate-800
   mit !important, eine gewöhnliche Hover-Variante verliert dagegen — die
   Schrift bliebe dunkel auf dunkelblauem Grund und damit unlesbar. */
const ROW_TITLE_CLASS = 'truncate text-[13px] font-medium text-slate-800 group-hover:!text-white dark:text-white';
const ROW_SUB_CLASS = 'truncate text-[11.5px] text-slate-400 group-hover:!text-white/80';

export const CustomerPickerModal = ({
    open,
    onClose,
    onSelect,
    withContact = false,
    z = 140,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (pick: CrmCustomerPick) => void;
    /** Nach dem Kunden den Ansprechpartner wählen lassen. */
    withContact?: boolean;
    /** Über einem offenen Formularfenster: höher stapeln. */
    z?: number;
}) => {
    // Rumpf hängt am `open`: er entsteht bei jedem Öffnen neu und beginnt von
    // selbst mit leerem Suchfeld und ohne alte Treffer.
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    useEffect(() => { if (!open) setCustomer(null); }, [open]);

    const finish = (pick: CrmCustomerPick) => {
        onSelect(pick);
        onClose();
    };

    return (
        <CenterModal
            open={open}
            onClose={onClose}
            width={480}
            z={z}
            compact
            title={customer ? t('crm.quick.contactPickTitle') : t('crm.quick.customerPickTitle')}
            subtitle={customer ? customer.companyName : t('crm.quick.customerPickHint')}
        >
            {open && !customer && (
                <CustomerStep
                    onPick={(picked) => (withContact ? setCustomer(picked) : finish({ customer: picked, contact: null }))}
                />
            )}
            {open && customer && (
                <ContactStep
                    customer={customer}
                    onBack={() => setCustomer(null)}
                    onPick={(contact) => finish({ customer, contact })}
                />
            )}
        </CenterModal>
    );
};

const CustomerStep = ({ onPick }: { onPick: (customer: CrmCustomerOption) => void }) => {
    const [search, setSearch] = useState('');
    const [rows, setRows] = useState<CrmCustomerOption[]>([]);
    // Die Suche, zu der `rows` gehört. null = es liegt noch keine Antwort vor.
    const [settledQuery, setSettledQuery] = useState<string | null>(null);

    // Beim Öffnen SOFORT laden (ohne Wartezeit), danach entprellt weitersuchen.
    useEffect(() => {
        const trimmed = search.trim();
        let cancelled = false;
        const id = setTimeout(async () => {
            try {
                const params = new URLSearchParams({ page: '1', pageSize: String(PAGE_SIZE), fields: 'list' });
                if (trimmed) params.set('search', trimmed);
                const res = await getShared<{ items?: CustomerListRow[] } | CustomerListRow[]>(`/customers?${params.toString()}`);
                if (cancelled) return;
                const list = Array.isArray(res.data) ? res.data : res.data.items || [];
                setRows(list.map(toOption));
            } catch {
                if (!cancelled) setRows([]);
            } finally {
                if (!cancelled) setSettledQuery(trimmed);
            }
        }, trimmed ? 250 : 0);
        return () => { cancelled = true; clearTimeout(id); };
    }, [search]);

    /* Abgeleitet statt eigener Schalter: "es wird geladen" heisst genau, dass
       zur aktuellen Eingabe noch keine Antwort da ist. */
    const loading = settledQuery !== search.trim();

    return (
        <div className="flex flex-col gap-3 p-4">
            <input
                autoFocus
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('crm.quick.customerSearch')}
                aria-label={t('common.search')}
                className={`${inputClass} h-10 px-3 text-sm`}
            />
            <div className="ofi-pickerlist max-h-[340px] overflow-y-auto border border-slate-200 dark:border-white/15">
                {loading && rows.length === 0 ? (
                    <div className="px-3 py-6"><InlineLoading label={t('common.loading')} /></div>
                ) : rows.length === 0 ? (
                    <div className="px-3 py-6 text-center text-[12.5px] text-slate-400">{t('crm.quick.noCustomer')}</div>
                ) : rows.map((row) => (
                    <button key={row.id} type="button" title={row.companyName} onClick={() => onPick(row)} className={ROW_CLASS}>
                        <span className="flex size-7 shrink-0 items-center justify-center rounded bg-blue-50 text-[11px] font-semibold text-blue-700">
                            {row.companyName.slice(0, 2).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className={`block ${ROW_TITLE_CLASS}`}>{row.companyName}</span>
                            {row.responsibleName && (
                                <span className={`block ${ROW_SUB_CLASS}`}>{row.responsibleName}</span>
                            )}
                        </span>
                        <ChevronRight size={13} className="shrink-0 text-slate-300 group-hover:!text-white/70" />
                    </button>
                ))}
            </div>
        </div>
    );
};

const ContactStep = ({
    customer,
    onBack,
    onPick,
}: {
    customer: CrmCustomerOption;
    onBack: () => void;
    onPick: (contact: CrmContactOption | null) => void;
}) => {
    const [contacts, setContacts] = useState<CrmContactOption[] | null>(null);

    useEffect(() => {
        let cancelled = false;
        crmApi.listContacts({ customerId: customer.id, pageSize: 100 })
            .then((result) => {
                if (cancelled) return;
                const list = result.data.map((row) => ({ id: row.id, firstName: row.firstName, lastName: row.lastName }));
                // Ohne Ansprechpartner gibt es nichts zu wählen — fertig mit dem Kunden.
                if (list.length === 0) onPick(null);
                else setContacts(list);
            })
            .catch(() => { if (!cancelled) onPick(null); });
        return () => { cancelled = true; };
        // `onPick` ist stabil genug; nur der Kunde entscheidet über die Liste.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [customer.id]);

    return (
        <div className="flex flex-col gap-3 p-4">
            <button
                type="button"
                onClick={onBack}
                className="inline-flex w-fit items-center gap-1 text-[12px] font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
            >
                <ArrowLeft size={12} />
                {t('crm.quick.contactPickBack')}
            </button>
            <div className="ofi-pickerlist max-h-[340px] overflow-y-auto border border-slate-200 dark:border-white/15">
                {contacts === null ? (
                    <div className="px-3 py-6"><InlineLoading label={t('common.loading')} /></div>
                ) : (
                    <>
                        <button type="button" onClick={() => onPick(null)} className={ROW_CLASS}>
                            <span className="flex size-7 shrink-0 items-center justify-center rounded bg-slate-100 text-slate-400 dark:bg-white/10">
                                <User01 size={13} />
                            </span>
                            <span className={`italic ${ROW_TITLE_CLASS}`}>{t('crm.quick.contactNone')}</span>
                        </button>
                        {contacts.map((contact) => (
                            <button key={contact.id} type="button" onClick={() => onPick(contact)} className={ROW_CLASS}>
                                <span className="flex size-7 shrink-0 items-center justify-center rounded bg-emerald-50 text-[11px] font-semibold text-emerald-700">
                                    {`${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`.toUpperCase()}
                                </span>
                                <span className={ROW_TITLE_CLASS}>{contact.firstName} {contact.lastName}</span>
                            </button>
                        ))}
                    </>
                )}
            </div>
        </div>
    );
};
