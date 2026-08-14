import { useEffect, useMemo, useState } from 'react';

import { List, Plus, User01 } from '@/components/icons/antIconCompat';
import { Pager, SearchBox, TableStateRow } from '@/components/ui-shared/TableKit';
import { apiClient } from '@/lib/axios';
import { fetchStaffDirectory } from '@/lib/api/directory';
import { t } from '@/i18n/translate';
import { ComboCell, type ComboOption } from '@/pages/inventory/components/ComboCell';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { CenterModal } from './shells';
import {
    personKey,
    personName,
    pushRecentCustomer,
    type CustomerLite,
    type EmployeeLite,
    type PickedPerson,
} from '../calendarShared';

/* Server rows arrive as {items} (paged), {customers} or a bare array. */
const asRows = (payload: any): CustomerLite[] => {
    const rows = Array.isArray(payload) ? payload : payload?.items ?? payload?.customers ?? [];
    return (Array.isArray(rows) ? rows : []).map((row: any) => ({
        id: row.id,
        companyName: row.companyName,
        mainEmail: row.mainEmail ?? null,
        mainPhone: row.mainPhone ?? null,
        city: row.city ?? null,
    }));
};

const fetchCustomers = async (search: string, page: number, pageSize: number): Promise<{ items: CustomerLite[]; total: number }> => {
    const res = await apiClient.get('/customers', {
        params: {
            isActive: true,
            fields: 'list',
            page,
            pageSize,
            ...(search ? { search } : {}),
        },
    });
    const items = asRows(res.data);
    return { items, total: Number(res.data?.total ?? 0) || items.length };
};

/* "Show all" — the larger central window, 15 per page. */
const BROWSE_PAGE_SIZE = 15;

export const CustomerBrowseModal = ({ open, onClose, onPick }: {
    open: boolean;
    onClose: () => void;
    onPick: (customer: CustomerLite) => void;
}) => {
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState<CustomerLite[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(false);
    const debounced = useDebouncedValue(query, 250);

    useEffect(() => { setPage(1); }, [debounced]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        fetchCustomers(debounced, page, BROWSE_PAGE_SIZE)
            .then((result) => {
                if (cancelled) return;
                setRows(result.items);
                setTotal(result.total);
            })
            .catch(() => { if (!cancelled) { setRows([]); setTotal(0); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, debounced, page]);

    const totalPages = Math.max(1, Math.ceil(total / BROWSE_PAGE_SIZE));

    return (
        <CenterModal open={open} onClose={onClose} title={t('calendar.picker.allCustomers')} width={940} z={150}>
            <div className="border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                <SearchBox value={query} onChange={setQuery} placeholder={t('calendar.picker.searchCustomer')} autoFocus />
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('calendar.picker.customer')}</th>
                            <th className="w-52 text-left">{t('calendar.detail.email')}</th>
                            <th className="w-36 text-left">{t('calendar.detail.phone')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow colSpan={3} loading={loading} emptyText={t('calendar.picker.noCustomers')} />
                        )}
                        {!loading && rows.map((customer) => (
                            <tr
                                key={customer.id}
                                onClick={() => onPick(customer)}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                            >
                                <td className="text-slate-800 dark:text-white">{customer.companyName}</td>
                                <td className="text-slate-500 dark:text-white/60">{customer.mainEmail || '—'}</td>
                                <td className="text-slate-500 dark:text-white/60">{customer.mainPhone || '—'}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="border-t border-slate-200 dark:border-white/10">
                <Pager page={page} totalPages={totalPages} total={total} pageSize={BROWSE_PAGE_SIZE} onPage={setPage} />
            </div>
        </CenterModal>
    );
};

/* Customer field: the input itself is the search (the inventory product-cell
   pattern). The list always shows at most 7 rows — on plain focus the first 7
   customers, while typing the first 7 matches; "show all" opens the window
   above. Clearing the text clears the selection. */
export const CustomerComboField = ({ selected, onSelect, autoFocus }: {
    selected: CustomerLite | null;
    onSelect: (customer: CustomerLite | null) => void;
    autoFocus?: boolean;
}) => {
    const [text, setText] = useState(selected?.companyName || '');
    const [open, setOpen] = useState(false);
    const [browseOpen, setBrowseOpen] = useState(false);
    const [results, setResults] = useState<CustomerLite[]>([]);
    const [loading, setLoading] = useState(false);
    // Short debounce: the list must visibly react while the name is typed.
    const debounced = useDebouncedValue(text, 120);

    // Outside selections (prefill, "create from this appointment") land in the box.
    useEffect(() => { setText(selected?.companyName || ''); }, [selected?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const typed = debounced.trim();
    // The selected name sitting untouched in the box is not a search.
    const search = selected !== null && typed === selected.companyName ? '' : typed;

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        fetchCustomers(search, 1, 7)
            .then((result) => { if (!cancelled) setResults(result.items); })
            .catch(() => { if (!cancelled) setResults([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, search]);

    const pick = (customer: CustomerLite) => {
        pushRecentCustomer(customer);
        setText(customer.companyName);
        onSelect(customer);
    };

    return (
        <>
            <ComboCell
                open={open}
                onOpenChange={setOpen}
                value={text}
                onChange={(next) => {
                    setText(next);
                    if (!next.trim() && selected) onSelect(null);
                }}
                options={results.slice(0, 7).map((customer) => ({
                    id: customer.id,
                    label: customer.companyName,
                    meta: customer.mainEmail || customer.mainPhone || '',
                }))}
                loading={loading}
                onSelect={(option) => {
                    const customer = results.find((row) => row.id === option.id);
                    if (customer) pick(customer);
                }}
                placeholder={t('calendar.picker.searchCustomer')}
                emptyText={t('calendar.picker.noCustomers')}
                invalid={!selected}
                autoFocus={autoFocus}
                actions={[{
                    key: 'all',
                    icon: <User01 size={12} />,
                    label: t('calendar.picker.viewAll'),
                    onSelect: () => setBrowseOpen(true),
                }]}
            />
            <CustomerBrowseModal
                open={browseOpen}
                onClose={() => setBrowseOpen(false)}
                onPick={(customer) => { setBrowseOpen(false); pick(customer); }}
            />
        </>
    );
};

/* People field — the customer-modal pattern applied to people: type a name or
   an address, at most 7 matches split into two headed groups (staff on top,
   customers below — the people window's two tabs, folded into one list), each
   pick lands as a chip; "view all" opens the large multi-select window. Flavors:
   - cc: rows must resolve to an e-mail; a typed address can be added directly
   - participants: any staff or customer row, an e-mail is not required. */
export const PeopleComboField = ({ value, onChange, onOpenAll, mode = 'cc' }: {
    value: PickedPerson[];
    onChange: (next: PickedPerson[]) => void;
    onOpenAll: () => void;
    mode?: 'cc' | 'participants';
}) => {
    const requireEmail = mode === 'cc';
    const [text, setText] = useState('');
    const [open, setOpen] = useState(false);
    const [employees, setEmployees] = useState<EmployeeLite[] | null>(null);
    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [loading, setLoading] = useState(false);
    const debounced = useDebouncedValue(text, 120);

    // Staff list once per first open (light payload, whole company tree).
    useEffect(() => {
        if (!open || employees !== null) return;
        fetchStaffDirectory()
            .then(setEmployees)
            .catch(() => setEmployees([]));
    }, [open, employees]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        fetchCustomers(debounced.trim(), 1, 7)
            .then((result) => { if (!cancelled) setCustomers(requireEmail ? result.items.filter((row) => row.mainEmail) : result.items); })
            .catch(() => { if (!cancelled) setCustomers([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, debounced, requireEmail]);

    const needle = debounced.trim().toLowerCase();
    const chosen = new Set(value.map((person) => person.key));
    const staffPool: PickedPerson[] = (employees || [])
        .filter((row) => !requireEmail || row.email)
        .filter((row) => !needle
            || `${row.firstName} ${row.lastName}`.toLowerCase().includes(needle)
            || (row.email || '').toLowerCase().includes(needle))
        .map((row) => ({ key: personKey('EMPLOYEE', row.id), type: 'EMPLOYEE' as const, id: row.id, name: personName(row), email: row.email }))
        .filter((person) => !chosen.has(person.key));
    const customerPool: PickedPerson[] = customers
        .map((row) => ({ key: personKey('CUSTOMER', row.id), type: 'CUSTOMER' as const, id: row.id, name: row.companyName, email: row.mainEmail }))
        .filter((person) => !chosen.has(person.key));
    // The 7 rows are split between the two groups — either side's unused quota
    // flows to the other, so staff alone can never crowd the customers out.
    const staff = staffPool.slice(0, Math.max(4, 7 - customerPool.length));
    const pool = [...staff, ...customerPool.slice(0, 7 - staff.length)];

    const add = (person: PickedPerson) => {
        if (!value.some((row) => row.key === person.key)) onChange([...value, person]);
        setText('');
    };

    const typed = text.trim();

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={text}
            onChange={setText}
            options={pool.map((person) => ({
                id: person.key,
                label: person.name,
                meta: person.email || '',
                group: person.type === 'EMPLOYEE' ? t('calendar.picker.staff') : t('calendar.picker.customers'),
            }))}
            loading={loading && pool.length === 0}
            onSelect={(option) => {
                const person = pool.find((row) => row.key === option.id);
                if (person) add(person);
            }}
            placeholder={t('calendar.picker.searchPerson')}
            emptyText={t('calendar.picker.noPeople')}
            /* Both fields hold a list, so one pick must not end the session:
               the list stays open and the picked row drops out of it. */
            keepOpenOnSelect
            actions={[
                ...(requireEmail && typed.includes('@') ? [{
                    key: 'email',
                    icon: <Plus size={12} />,
                    label: `${t('calendar.picker.addEmail')}: ${typed}`,
                    onSelect: () => add({ key: personKey('EMAIL', typed.toLowerCase()), type: 'EMAIL', name: typed, email: typed }),
                }] : []),
                {
                    key: 'all',
                    icon: <User01 size={12} />,
                    label: t('calendar.picker.viewAll'),
                    onSelect: onOpenAll,
                },
            ]}
        />
    );
};

export const CcComboField = (props: {
    value: PickedPerson[];
    onChange: (next: PickedPerson[]) => void;
    onOpenAll: () => void;
}) => <PeopleComboField {...props} mode="cc" />;

/* Same combo behavior over rows that are already loaded (a customer's projects,
   a project's orders): type to filter, at most 7 rows, "show all (n)" footer. */
export const StaticComboField = ({ selectedId, selectedLabel, options, onPick, onViewAll, viewAllLabel, placeholder, emptyText, disabled, openToken = 0 }: {
    selectedId: string | null;
    selectedLabel: string | null;
    options: ComboOption[];
    onPick: (id: string) => void;
    onViewAll?: () => void;
    /* Override for the footer label — used when `options` is a truncated slice,
       where "view all (n)" would advertise the wrong count. */
    viewAllLabel?: string;
    placeholder: string;
    emptyText: string;
    disabled?: boolean;
    /* Bump to pop the list open programmatically — the wizard does this the
       moment the previous field is chosen, so the flow never stalls. */
    openToken?: number;
}) => {
    const [text, setText] = useState(selectedLabel || '');
    const [open, setOpen] = useState(false);

    useEffect(() => { setText(selectedLabel || ''); }, [selectedId, selectedLabel]);

    useEffect(() => {
        if (openToken > 0 && !disabled) setOpen(true);
    }, [openToken, disabled]);

    const typed = text.trim().toLowerCase();
    const keepAll = !typed || (selectedLabel !== null && text === selectedLabel);
    const filtered = useMemo(
        () => (keepAll ? options : options.filter((option) =>
            option.label.toLowerCase().includes(typed) || (option.meta || '').toLowerCase().includes(typed))),
        [options, typed, keepAll],
    );

    if (disabled) {
        return (
            <input
                disabled
                placeholder={placeholder}
                className="h-9 w-full cursor-not-allowed rounded-md border border-dashed border-slate-200 bg-slate-50 px-3 text-[13px] text-slate-400 dark:border-white/10 dark:bg-white/5 dark:text-white/30"
            />
        );
    }

    return (
        <ComboCell
            open={open}
            onOpenChange={setOpen}
            value={text}
            onChange={setText}
            options={filtered.slice(0, 7)}
            loading={false}
            onSelect={(option) => onPick(option.id)}
            placeholder={placeholder}
            emptyText={emptyText}
            invalid={!selectedId}
            actions={onViewAll ? [{
                key: 'all',
                icon: <List size={12} />,
                label: viewAllLabel ?? t('calendar.picker.viewAllCount', { count: options.length }),
                onSelect: onViewAll,
            }] : []}
        />
    );
};
