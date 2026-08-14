import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { CheckCircle, Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { customerApi } from '../../../lib/api/customer';
import type { CustomerContactDto } from '../../../lib/api/customer';
import { Button } from '../../../components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, CELL_INPUT_CLASS, SectionCard, TableStateRow } from '../../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../../hooks/useColumnWidths';
import { CUSTOMER_ADD_ROW_BUTTON_CLASS } from './customerDetail.constants';

/**
 * Ansprechpartner als Tabelle mit GESAMMELTEM Speichern.
 *
 * Alle Zellen sind dauerhaft Eingabefelder; Änderungen bleiben lokal, bis unten
 * einmal auf Speichern geklickt wird. Es gibt also weder ein Speichern je Zeile
 * noch einen Bearbeiten-Modus — der Knopf wird erst aktiv, wenn wirklich etwas
 * geändert wurde.
 *
 * "Hauptkontakt" ist exklusiv: der Server kennt nur ein Boolean pro Zeile und
 * stuft die anderen nicht selbst zurück, also hält der Client genau eine Zeile
 * markiert und schreibt die Umstellung beim Speichern mit.
 */

interface ContactDraft {
    /** Fehlt bei Zeilen, die es serverseitig noch nicht gibt. */
    id: string | null;
    key: string;
    firstName: string;
    lastName: string;
    /**
     * Die Funktionsbezeichnung des Kontakts. Sie hat seit 2026-08-03 KEINE
     * eigene Spalte mehr (Nutzerwunsch) — der Wert wird aber weiter geladen und
     * beim Speichern unverändert zurückgeschickt, damit bestehende Einträge
     * nicht durch das Ausblenden der Spalte verloren gehen.
     */
    title: string;
    email: string;
    phone: string;
    isPrimaryContact: boolean;
}

const toDraft = (contact: CustomerContactDto): ContactDraft => ({
    id: contact.id,
    key: contact.id,
    firstName: contact.firstName ?? '',
    lastName: contact.lastName ?? '',
    title: contact.title ?? '',
    email: contact.email ?? '',
    phone: contact.phone ?? '',
    isPrimaryContact: Boolean(contact.isPrimaryContact),
});

const sameContact = (a: ContactDraft, b: ContactDraft) =>
    a.firstName === b.firstName
    && a.lastName === b.lastName
    && a.title === b.title
    && a.email === b.email
    && a.phone === b.phone
    && a.isPrimaryContact === b.isPrimaryContact;

const hasName = (row: ContactDraft) => Boolean(row.firstName.trim() || row.lastName.trim());

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const CustomerContactsTable = ({
    customerId,
    items,
    onChanged,
}: {
    customerId: string;
    items: CustomerContactDto[];
    onChanged: () => void | Promise<void>;
}) => {
    const grid = useColumnWidths({
        storageKey: 'offitec:customer-contacts:col-widths:v1',
        defaults: { primary: 56, email: 224, phone: 176, actions: 64 },
        minPx: 48,
    });
    const saved = useMemo(() => items.map(toDraft), [items]);
    const [rows, setRows] = useState<ContactDraft[]>(saved);
    const [syncedItems, setSyncedItems] = useState(items);
    const [removedIds, setRemovedIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    // Zähler nur für stabile React-Keys neuer Zeilen.
    const [newRowSeq, setNewRowSeq] = useState(0);

    const dirty = useMemo(() => {
        if (removedIds.length > 0) return true;
        if (rows.length !== saved.length) return true;
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        return rows.some((row) => {
            const previous = savedByKey.get(row.key);
            return !previous || !sameContact(previous, row);
        });
    }, [rows, saved, removedIds]);

    // Frische Serverdaten dürfen offene Eingaben nicht überschreiben — übernommen
    // wird nur, solange nichts Ungespeichertes aussteht.
    if (items !== syncedItems) {
        setSyncedItems(items);
        if (!dirty) setRows(saved);
    }

    const patch = (key: string, next: Partial<ContactDraft>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));

    /** Genau eine Zeile trägt die Markierung; die bisherige verliert sie. */
    const markPrimary = (key: string) =>
        setRows((current) => current.map((row) => ({ ...row, isPrimaryContact: row.key === key })));

    const addRow = () => {
        const key = `new-${newRowSeq}`;
        setNewRowSeq((current) => current + 1);
        setRows((current) => [
            ...current,
            {
                id: null,
                key,
                firstName: '',
                lastName: '',
                title: '',
                email: '',
                phone: '',
                // Der erste Ansprechpartner überhaupt wird automatisch Hauptkontakt.
                isPrimaryContact: current.length === 0,
            },
        ]);
    };

    const removeRow = (row: ContactDraft) => {
        setRows((current) => current.filter((item) => item.key !== row.key));
        if (row.id) setRemovedIds((current) => [...current, row.id!]);
    };

    const discard = () => {
        setRows(saved);
        setRemovedIds([]);
    };

    const save = async () => {
        const filled = rows.filter(hasName);
        if (filled.length !== rows.length) {
            toast.error(i18nT('crm.contactNameRequired'));
            return;
        }
        const savedById = new Map(saved.map((row) => [row.key, row]));
        try {
            setSaving(true);
            // Ein Klick, ein Vorgang: Löschungen, Änderungen und neue Zeilen
            // gehen gemeinsam raus statt zeilenweise nacheinander.
            await Promise.all([
                ...removedIds.map((id) => customerApi.deleteContact(customerId, id)),
                ...filled.map((row) => {
                    const body = {
                        firstName: row.firstName,
                        lastName: row.lastName,
                        title: row.title,
                        email: row.email,
                        phone: row.phone,
                        isPrimaryContact: row.isPrimaryContact,
                    };
                    if (!row.id) return customerApi.addContact(customerId, body);
                    const previous = savedById.get(row.key);
                    if (previous && sameContact(previous, row)) return Promise.resolve();
                    return customerApi.updateContact(customerId, row.id, body);
                }),
            ]);
            setRemovedIds([]);
            toast.success(i18nT('crm.contactsSaved'));
            await onChanged();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        } finally {
            setSaving(false);
        }
    };

    const cell = (row: ContactDraft, field: keyof ContactDraft, placeholder: string) => (
        <input
            value={row[field] as string}
            onChange={(event) => patch(row.key, { [field]: event.target.value } as Partial<ContactDraft>)}
            placeholder={placeholder}
            className={CELL_INPUT_CLASS}
        />
    );

    return (
        <SectionCard title={`${i18nT('crm.tab_contacts')} (${rows.length})`}>
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                <colgroup>
                    <ResizableCols keys={['primary'] as const} grid={grid} />
                    {/* Ad ve soyad sütunları: genişlikleri yok, kalan yeri paylaşırlar. */}
                    <col />
                    <col />
                    <ResizableCols keys={['email', 'phone', 'actions'] as const} grid={grid} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="relative text-center">
                            {i18nT('crm.primaryShort')}
                            <ColResizeHandle {...grid.resizeProps('primary', 'right')} />
                        </th>
                        <th className="text-left">{i18nT('crm.customers.responsibleFirstName')}</th>
                        <th className="text-left">{i18nT('crm.customers.responsibleLastName')}</th>
                        <th className="relative text-left">
                            {i18nT('common.email')}
                            <ColResizeHandle {...grid.resizeProps('email')} />
                        </th>
                        <th className="relative text-left">
                            {i18nT('common.phone')}
                            <ColResizeHandle {...grid.resizeProps('phone')} />
                        </th>
                        <th className="relative text-right">
                            <ColResizeHandle {...grid.resizeProps('actions')} />
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <TableStateRow colSpan={6} loading={false} emptyText={i18nT('crm.noContacts')} />
                    )}
                    {rows.map((row) => (
                        <tr key={row.key} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                            <td className="text-center">
                                <button
                                    type="button"
                                    onClick={() => markPrimary(row.key)}
                                    title={i18nT('crm.makePrimaryContact')}
                                    aria-pressed={row.isPrimaryContact}
                                    className={`inline-flex size-6 items-center justify-center rounded-[2px] transition-colors ${
                                        row.isPrimaryContact
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-slate-300 hover:text-emerald-500 dark:text-white/25'
                                    }`}
                                >
                                    <CheckCircle size={14} />
                                </button>
                            </td>
                            <td>{cell(row, 'firstName', i18nT('crm.customers.responsibleFirstName'))}</td>
                            <td>{cell(row, 'lastName', i18nT('crm.customers.responsibleLastName'))}</td>
                            <td>{cell(row, 'email', i18nT('common.email'))}</td>
                            <td>{cell(row, 'phone', i18nT('common.phone'))}</td>
                            <td className="text-right">
                                <button
                                    type="button"
                                    onClick={() => removeRow(row)}
                                    title={i18nT('common.delete')}
                                    className="inline-flex size-6 items-center justify-center rounded-[2px] text-slate-300 opacity-0 transition-opacity hover:text-rose-600 group-hover:opacity-100"
                                >
                                    <TrashIcon size={13} />
                                </button>
                            </td>
                        </tr>
                    ))}

                    {/* Leerzeile: das "+" hängt eine weitere Zeile an. */}
                    <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        {/* Knopf UND Beschriftung in DERSELBEN Zelle, rechts. */}
                        <td colSpan={6}>
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={addRow}
                                    title={i18nT('crm.addContact')}
                                    aria-label={i18nT('crm.addContact')}
                                    className={CUSTOMER_ADD_ROW_BUTTON_CLASS}
                                >
                                    <Plus size={18} />
                                </button>
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {i18nT('crm.addContactHint')}
                                </span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Ein Speichern für die ganze Tabelle — erst aktiv, wenn etwas geändert wurde. */}
            {dirty && (
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <span className="mr-auto text-[12px] text-slate-500 dark:text-white/60">
                        {i18nT('crm.unsavedChanges')}
                    </span>
                    <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={discard}>
                        {i18nT('common.cancel')}
                    </Button>
                    <Button variant="primary" size="sm" loading={saving} icon={<Save size={12} />} onClick={() => void save()}>
                        {i18nT('common.save')}
                    </Button>
                </div>
            )}
        </SectionCard>
    );
};
