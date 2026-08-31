import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { apiClient } from '../../../lib/axios';
import { customerApi } from '../../../lib/api/customer';
import type { CustomerLocationDto } from '../../../lib/api/customer';
import { Button } from '../../../components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, CELL_INPUT_CLASS, SectionCard } from '../../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../../hooks/useColumnWidths';
import { ADDRESS_KIND_OPTIONS, CUSTOMER_ADD_ROW_BUTTON_CLASS, DEFAULT_ADDRESS_KIND, normalizeAddressKind } from './customerDetail.constants';
import type { AddressKind } from './customerDetail.constants';

/**
 * ALLE Adressen des Kunden in EINER Tabelle, mit GESAMMELTEM Speichern.
 *
 * Erste Zeile ist die Hauptadresse. Sie ist abgesetzt eingefärbt, weil sie KEIN
 * Standort-Datensatz ist, sondern als flache Spalten am Kunden hängt — seit
 * 2026-08-03 aber genauso bearbeitbar wie die Zeilen darunter (Nutzerwunsch).
 * Gespeichert wird sie über denselben Weg wie im Kundenprofil (PATCH auf den
 * Kunden), darum steht eine Änderung hier anschliessend auch dort. Danach
 * folgen Projekt-, Rechnungs- und Lieferadressen als gewöhnliche Zeilen.
 *
 * Geändert wird direkt in den Zellen; alles bleibt lokal, bis unten einmal
 * gespeichert wird — kein Speichern je Zeile.
 */

interface AddressDraft {
    /** Fehlt bei Zeilen, die es serverseitig noch nicht gibt. */
    id: string | null;
    key: string;
    kind: AddressKind;
    name: string;
    address: string;
    postalCode: string;
    city: string;
}

const toDraft = (location: CustomerLocationDto): AddressDraft => ({
    id: location.id,
    key: location.id,
    kind: normalizeAddressKind(location.kind),
    name: location.name ?? '',
    address: location.address ?? '',
    postalCode: location.postalCode ?? '',
    city: location.city ?? '',
});

const sameAddress = (a: AddressDraft, b: AddressDraft) =>
    a.kind === b.kind
    && a.name === b.name
    && a.address === b.address
    && a.postalCode === b.postalCode
    && a.city === b.city;

const isFilled = (row: AddressDraft) =>
    Boolean(row.address.trim() || row.city.trim() || row.name.trim());

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

/** Die vier Felder der Hauptadresse, die in dieser Tabelle bearbeitet werden. */
interface MainDraft {
    addressName: string;
    address: string;
    postalCode: string;
    city: string;
}

const toMainDraft = (value: MainAddressValue): MainDraft => ({
    addressName: value.addressName ?? '',
    address: value.address ?? '',
    postalCode: value.postalCode ?? '',
    city: value.city ?? '',
});

const MAIN_FIELDS = ['addressName', 'address', 'postalCode', 'city'] as const;

/** Die Hauptadresse des Kunden (flache Spalten, kein Standort-Datensatz). */
export interface MainAddressValue {
    addressName?: string | null;
    address?: string | null;
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
    country?: string | null;
}

// Adressarten in fester Reihenfolge (Projekt → Rechnung → Lieferung), damit
// gleichartige Zeilen beieinanderstehen statt in Anlagereihenfolge.
const kindRank = (kind: AddressKind) => ADDRESS_KIND_OPTIONS.findIndex((option) => option.value === kind);

export const CustomerAddressesTable = ({
    customerId,
    mainAddress,
    items,
    onChanged,
}: {
    customerId: string;
    mainAddress: MainAddressValue;
    items: CustomerLocationDto[];
    onChanged: () => void | Promise<void>;
}) => {
    const grid = useColumnWidths({
        storageKey: 'offitec:customer-addresses:col-widths:v1',
        defaults: { kind: 176, name: 208, postalCode: 112, city: 176, actions: 64 },
        minPx: 56,
    });
    const saved = useMemo(
        () => [...items].map(toDraft).sort((a, b) => kindRank(a.kind) - kindRank(b.kind) || a.name.localeCompare(b.name)),
        [items],
    );
    const [rows, setRows] = useState<AddressDraft[]>(saved);
    const [syncedItems, setSyncedItems] = useState(items);
    const [removedIds, setRemovedIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [newRowSeq, setNewRowSeq] = useState(0);

    const savedMain = useMemo(() => toMainDraft(mainAddress), [mainAddress]);
    const [main, setMain] = useState<MainDraft>(savedMain);
    const [syncedMain, setSyncedMain] = useState(mainAddress);

    const mainDirty = useMemo(
        () => MAIN_FIELDS.some((field) => savedMain[field] !== main[field]),
        [savedMain, main],
    );

    const rowsDirty = useMemo(() => {
        if (removedIds.length > 0) return true;
        if (rows.length !== saved.length) return true;
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        return rows.some((row) => {
            const previous = savedByKey.get(row.key);
            return !previous || !sameAddress(previous, row);
        });
    }, [rows, saved, removedIds]);

    const dirty = rowsDirty || mainDirty;

    // Frische Serverdaten dürfen offene Eingaben nicht überschreiben.
    if (items !== syncedItems) {
        setSyncedItems(items);
        if (!rowsDirty) setRows(saved);
    }
    if (mainAddress !== syncedMain) {
        setSyncedMain(mainAddress);
        if (!mainDirty) setMain(toMainDraft(mainAddress));
    }

    const patch = (key: string, next: Partial<AddressDraft>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));

    const addRow = () => {
        const key = `new-${newRowSeq}`;
        setNewRowSeq((current) => current + 1);
        setRows((current) => [
            ...current,
            { id: null, key, kind: DEFAULT_ADDRESS_KIND, name: '', address: '', postalCode: '', city: '' },
        ]);
    };

    const removeRow = (row: AddressDraft) => {
        setRows((current) => current.filter((item) => item.key !== row.key));
        if (row.id) setRemovedIds((current) => [...current, row.id!]);
    };

    const discard = () => {
        setRows(saved);
        setMain(savedMain);
        setRemovedIds([]);
    };

    const save = async () => {
        if (rows.some((row) => !isFilled(row))) {
            toast.error(i18nT('crm.addressRequired'));
            return;
        }
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        try {
            setSaving(true);
            // Ein Klick, ein Vorgang: Löschungen, Änderungen und neue Zeilen gemeinsam.
            await Promise.all([
                // Die Hauptadresse liegt als flache Spalten am Kunden — derselbe
                // PATCH, den auch das Kundenprofil schickt. Deshalb steht eine
                // Änderung von hier gleich darauf ebenso im Profil.
                ...(mainDirty ? [apiClient.patch(`/customers/${customerId}`, {
                    addressName: main.addressName,
                    address: main.address,
                    postalCode: main.postalCode,
                    city: main.city,
                })] : []),
                ...removedIds.map((id) => customerApi.deleteLocation(customerId, id)),
                ...rows.map((row) => {
                    const body = {
                        kind: row.kind,
                        name: row.name,
                        address: row.address,
                        postalCode: row.postalCode,
                        city: row.city,
                    };
                    if (!row.id) return customerApi.addLocation(customerId, { ...body, isPrimary: false });
                    const previous = savedByKey.get(row.key);
                    if (previous && sameAddress(previous, row)) return Promise.resolve();
                    return customerApi.updateLocation(customerId, row.id, body);
                }),
            ]);
            setRemovedIds([]);
            toast.success(i18nT('crm.addressesSaved'));
            await onChanged();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        } finally {
            setSaving(false);
        }
    };

    /** Zelle der Hauptadresse — schreibt in den eigenen Entwurf, nicht in `rows`. */
    const mainCell = (field: keyof MainDraft, placeholder: string) => (
        <input
            value={main[field]}
            onChange={(event) => setMain((current) => ({ ...current, [field]: event.target.value }))}
            placeholder={placeholder}
            className={CELL_INPUT_CLASS}
        />
    );

    const cell = (row: AddressDraft, field: keyof AddressDraft, placeholder: string) => (
        <input
            value={row[field] as string}
            onChange={(event) => patch(row.key, { [field]: event.target.value } as Partial<AddressDraft>)}
            placeholder={placeholder}
            className={CELL_INPUT_CLASS}
        />
    );

    return (
        <SectionCard title={`${i18nT('crm.tab_locations')} (${rows.length + 1})`}>
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                <colgroup>
                    <ResizableCols keys={['kind', 'name'] as const} grid={grid} />
                    {/* Sokak sütunu: genişliği yok, kalan yeri emer. */}
                    <col />
                    <ResizableCols keys={['postalCode', 'city', 'actions'] as const} grid={grid} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="relative text-left">
                            {i18nT('crm.addressKind')}
                            <ColResizeHandle {...grid.resizeProps('kind')} />
                        </th>
                        <th className="relative text-left">
                            {i18nT('crm.locationName')}
                            <ColResizeHandle {...grid.resizeProps('name')} />
                        </th>
                        <th className="text-left">{i18nT('address.street')}</th>
                        <th className="relative text-left">
                            {i18nT('address.postalCode')}
                            <ColResizeHandle {...grid.resizeProps('postalCode')} />
                        </th>
                        <th className="relative text-left">
                            {i18nT('address.city')}
                            <ColResizeHandle {...grid.resizeProps('city')} />
                        </th>
                        <th className="relative text-right">
                            <ColResizeHandle {...grid.resizeProps('actions')} />
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {/* Hauptadresse: abgesetzt eingefärbt, weil sie am Kunden hängt und
                        nicht gelöscht werden kann — bearbeitet wird sie wie jede andere
                        Zeile. Die Art ist fest, darum steht dort Text statt Auswahl. */}
                    <tr className="bg-slate-100/70 dark:bg-white/[0.04]">
                        <td className="font-semibold text-slate-500 dark:text-white/55">{i18nT('crm.locationPrimary')}</td>
                        <td>{mainCell('addressName', i18nT('crm.locationName'))}</td>
                        {/* Adresse / PLZ / Stadt in den eigenen Spalten — wie die Zeilen
                            darunter und wie im Kundenprofil: genau diese drei Einträge. */}
                        <td>{mainCell('address', i18nT('address.street'))}</td>
                        <td>{mainCell('postalCode', i18nT('address.postalCode'))}</td>
                        <td>{mainCell('city', i18nT('address.city'))}</td>
                        <td />
                    </tr>

                    {rows.map((row) => (
                        <tr key={row.key} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                            <td>
                                <select
                                    value={row.kind}
                                    onChange={(event) => patch(row.key, { kind: event.target.value as AddressKind })}
                                    className={CELL_INPUT_CLASS}
                                >
                                    {ADDRESS_KIND_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{i18nT(option.labelKey)}</option>
                                    ))}
                                </select>
                            </td>
                            <td>{cell(row, 'name', i18nT('crm.locationName'))}</td>
                            <td>{cell(row, 'address', i18nT('address.street'))}</td>
                            <td>{cell(row, 'postalCode', i18nT('address.postalCode'))}</td>
                            <td>{cell(row, 'city', i18nT('address.city'))}</td>
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

                    {/* Leerzeile: das "+" hängt eine weitere Adresse an. */}
                    <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        {/* Knopf UND Beschriftung in DERSELBEN Zelle, rechts am
                            Zeilenende: in getrennten Zellen risse die Spaltenbreite
                            die beiden auseinander. */}
                        <td colSpan={6}>
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={addRow}
                                    title={i18nT('crm.addAddress')}
                                    aria-label={i18nT('crm.addAddress')}
                                    className={CUSTOMER_ADD_ROW_BUTTON_CLASS}
                                >
                                    <Plus size={18} />
                                </button>
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {i18nT('crm.addAddressHint')}
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
