import { useEffect, useMemo, useState } from 'react';

import { Check, Plus, X } from '@/components/icons/antIconCompat';
import { Pager, SearchBox, TableStateRow, ToggleGroup } from '@/components/ui-shared/TableKit';
import { apiClient } from '@/lib/axios';
import { fetchStaffDirectory } from '@/lib/api/directory';
import { t } from '@/i18n/translate';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { CenterModal } from './shells';
import { personKey, personName, type CustomerLite, type EmployeeLite, type PickedPerson } from '../calendarShared';

const PAGE_SIZE = 15;

type Tab = 'employees' | 'customers';

/* Multi-select people window — the "add items from stock" pattern with a
   checkbox column. Feeds meeting participants and the CC lists:
   - participants: employees + customers, rows may lack an e-mail
   - cc: rows must resolve to an e-mail; free addresses can be typed in. */
export const PeoplePickerModal = ({ open, onClose, mode, initial, onConfirm, title, staffOnly = false }: {
    open: boolean;
    onClose: () => void;
    mode: 'participants' | 'cc';
    initial: PickedPerson[];
    onConfirm: (picked: PickedPerson[]) => void;
    title?: string;
    /* CC of an invitation = staff only (19.08.2026): no customers tab, no free
       addresses — the customer is the To of that mail, never a CC. */
    staffOnly?: boolean;
}) => {
    const [tab, setTab] = useState<Tab>('employees');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const [employees, setEmployees] = useState<EmployeeLite[]>([]);
    const [employeesLoading, setEmployeesLoading] = useState(false);
    const [customers, setCustomers] = useState<CustomerLite[]>([]);
    const [customersTotal, setCustomersTotal] = useState(0);
    const [customersLoading, setCustomersLoading] = useState(false);
    const [freeEmail, setFreeEmail] = useState('');
    const [selected, setSelected] = useState<Map<string, PickedPerson>>(() => new Map());
    const debounced = useDebouncedValue(query, 250);

    // Re-seed the selection each time the window opens.
    const [seededFor, setSeededFor] = useState<PickedPerson[] | null>(null);
    if (open && seededFor !== initial) {
        setSeededFor(initial);
        setSelected(new Map(initial.map((person) => [person.key, person])));
    }

    useEffect(() => {
        if (!open) { setQuery(''); setPage(1); setTab('employees'); setFreeEmail(''); setSeededFor(null); return; }
    }, [open]);

    useEffect(() => { setPage(1); }, [debounced, tab]);

    // Staff list loads once per open (company-tree scoped, light payload).
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setEmployeesLoading(true);
        fetchStaffDirectory()
            .then((rows) => { if (!cancelled) setEmployees(rows); })
            .catch(() => { if (!cancelled) setEmployees([]); })
            .finally(() => { if (!cancelled) setEmployeesLoading(false); });
        return () => { cancelled = true; };
    }, [open]);

    // Customer rows come paged from the server as the user types.
    useEffect(() => {
        if (!open || tab !== 'customers') return;
        let cancelled = false;
        setCustomersLoading(true);
        apiClient.get('/customers', {
            params: { isActive: true, fields: 'list', page, pageSize: PAGE_SIZE, ...(debounced ? { search: debounced } : {}) },
        })
            .then((res) => {
                if (cancelled) return;
                const rows = Array.isArray(res.data) ? res.data : res.data?.items ?? [];
                setCustomers(Array.isArray(rows) ? rows : []);
                setCustomersTotal(Number(res.data?.total ?? 0) || (Array.isArray(rows) ? rows.length : 0));
            })
            .catch(() => { if (!cancelled) { setCustomers([]); setCustomersTotal(0); } })
            .finally(() => { if (!cancelled) setCustomersLoading(false); });
        return () => { cancelled = true; };
    }, [open, tab, page, debounced]);

    const filteredEmployees = useMemo(() => {
        const needle = debounced.trim().toLowerCase();
        const base = mode === 'cc' ? employees.filter((row) => row.email) : employees;
        if (!needle) return base;
        return base.filter((row) =>
            `${row.firstName} ${row.lastName}`.toLowerCase().includes(needle)
            || (row.email || '').toLowerCase().includes(needle)
            || (row.roleName || '').toLowerCase().includes(needle));
    }, [employees, debounced, mode]);

    const employeePage = filteredEmployees.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const employeeTotalPages = Math.max(1, Math.ceil(filteredEmployees.length / PAGE_SIZE));
    const customerRows = mode === 'cc' ? customers.filter((row) => row.mainEmail) : customers;
    const customerTotalPages = Math.max(1, Math.ceil(customersTotal / PAGE_SIZE));

    const toggle = (person: PickedPerson) => {
        setSelected((current) => {
            const next = new Map(current);
            if (next.has(person.key)) next.delete(person.key);
            else next.set(person.key, person);
            return next;
        });
    };

    const addFreeEmail = () => {
        const email = freeEmail.trim();
        if (!email || !email.includes('@')) return;
        toggle({ key: personKey('EMAIL', email.toLowerCase()), type: 'EMAIL', name: email, email });
        setFreeEmail('');
    };

    const rowsLoading = tab === 'employees' ? employeesLoading : customersLoading;

    return (
        <CenterModal
            open={open}
            onClose={onClose}
            title={title ?? (mode === 'cc' ? t('calendar.picker.ccTitle') : t('calendar.picker.participantsTitle'))}
            width={980}
            z={150}
            footer={(
                <div className="flex items-center justify-between gap-3">
                    <span className="text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                        {t('calendar.picker.selectedCount', { count: selected.size })}
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="h-9 rounded-md border border-slate-200 px-4 text-[12.5px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                        >
                            {t('common.cancel')}
                        </button>
                        <button
                            type="button"
                            onClick={() => onConfirm(Array.from(selected.values()))}
                            className="h-9 rounded-md bg-[#07145c] px-4 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]"
                        >
                            {t('common.apply')}
                        </button>
                    </div>
                </div>
            )}
        >
            <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                {staffOnly ? (
                    <span className="text-[12px] font-semibold text-slate-500 dark:text-white/60">{t('calendar.picker.staff')}</span>
                ) : (
                    <ToggleGroup<Tab>
                        options={[
                            { key: 'employees', label: t('calendar.picker.staff') },
                            { key: 'customers', label: t('calendar.picker.customers') },
                        ]}
                        value={tab}
                        onChange={setTab}
                    />
                )}
                <SearchBox value={query} onChange={setQuery} placeholder={t('calendar.picker.searchPerson')} className="min-w-52 flex-1" autoFocus />
            </div>

            {mode === 'cc' && !staffOnly && (
                <div className="flex items-center gap-2 border-b border-slate-100 px-3 py-2.5 dark:border-white/10">
                    <input
                        value={freeEmail}
                        onChange={(event) => setFreeEmail(event.target.value)}
                        onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); addFreeEmail(); } }}
                        placeholder={t('calendar.picker.freeEmailPlaceholder')}
                        className="h-9 flex-1 rounded-md border border-slate-200 bg-white px-3 text-[13px] text-slate-800 outline-none transition-colors focus:border-[#07145c]/40 dark:border-white/15 dark:bg-white/5 dark:text-white"
                    />
                    <button
                        type="button"
                        onClick={addFreeEmail}
                        disabled={!freeEmail.trim().includes('@')}
                        className="flex h-9 items-center gap-1.5 rounded-md border border-[#E3E7F0] bg-white px-3 text-[12.5px] font-semibold text-[#07145c] transition-colors hover:bg-[#F7F8FC] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/10 dark:bg-white/6 dark:text-[#d48f16] dark:hover:bg-white/10"
                    >
                        <Plus size={13} />
                        {t('calendar.picker.addEmail')}
                    </button>
                </div>
            )}

            {/* Every pick lands here immediately — name and e-mail visible, one
                click to drop it again. Free-typed addresses join the same row. */}
            {selected.size > 0 && (
                <div className="flex flex-wrap gap-1.5 border-b border-slate-100 bg-slate-50/60 px-3 py-2.5 dark:border-white/10 dark:bg-white/[0.03]">
                    {Array.from(selected.values()).map((person) => (
                        <span key={person.key} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-2.5 pr-1.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70">
                            <span className="font-semibold">{person.name}</span>
                            {person.email && person.email !== person.name && (
                                <span className="text-slate-400 dark:text-white/45">{person.email}</span>
                            )}
                            <button
                                type="button"
                                aria-label={t('common.delete')}
                                onClick={() => toggle(person)}
                                className="flex size-4 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 dark:hover:bg-white/15 dark:hover:text-white"
                            >
                                <X size={10} />
                            </button>
                        </span>
                    ))}
                </div>
            )}

            <div className="min-h-0 flex-1 overflow-y-auto">
                <table data-inv-table data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="w-10" />
                            <th className="text-left">{t('calendar.picker.name')}</th>
                            <th className="w-56 text-left">{t('calendar.detail.email')}</th>
                            <th className="w-40 text-left">{t('calendar.picker.role')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(rowsLoading || (tab === 'employees' ? employeePage.length === 0 : customerRows.length === 0)) && (
                            <TableStateRow colSpan={4} loading={rowsLoading} emptyText={t('calendar.picker.noPeople')} />
                        )}
                        {!rowsLoading && tab === 'employees' && employeePage.map((row) => {
                            const person: PickedPerson = {
                                key: personKey('EMPLOYEE', row.id),
                                type: 'EMPLOYEE',
                                id: row.id,
                                name: personName(row),
                                email: row.email || null,
                            };
                            const active = selected.has(person.key);
                            return (
                                <tr key={row.id} onClick={() => toggle(person)} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td>
                                        <span className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${active ? 'border-[#07145c] bg-[#07145c] text-white dark:border-[#d48f16] dark:bg-[#d48f16] dark:text-[#151616]' : 'border-slate-300 bg-white dark:border-white/25 dark:bg-transparent'}`}>
                                            {active && <Check size={12} />}
                                        </span>
                                    </td>
                                    <td className="text-slate-800 dark:text-white">{person.name}</td>
                                    <td className="text-slate-500 dark:text-white/60">{row.email || '—'}</td>
                                    <td className="text-slate-500 dark:text-white/60">{row.roleName || row.title || '—'}</td>
                                </tr>
                            );
                        })}
                        {!rowsLoading && tab === 'customers' && customerRows.map((row) => {
                            const person: PickedPerson = {
                                key: personKey('CUSTOMER', row.id),
                                type: 'CUSTOMER',
                                id: row.id,
                                name: row.companyName,
                                email: row.mainEmail || null,
                            };
                            const active = selected.has(person.key);
                            return (
                                <tr key={row.id} onClick={() => toggle(person)} className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td>
                                        <span className={`flex size-[18px] items-center justify-center rounded-[5px] border transition-colors ${active ? 'border-[#07145c] bg-[#07145c] text-white dark:border-[#d48f16] dark:bg-[#d48f16] dark:text-[#151616]' : 'border-slate-300 bg-white dark:border-white/25 dark:bg-transparent'}`}>
                                            {active && <Check size={12} />}
                                        </span>
                                    </td>
                                    <td className="text-slate-800 dark:text-white">{row.companyName}</td>
                                    <td className="text-slate-500 dark:text-white/60">{row.mainEmail || '—'}</td>
                                    <td className="text-slate-500 dark:text-white/60">{t('calendar.picker.customer')}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
            <div className="border-t border-slate-200 dark:border-white/10">
                {tab === 'employees' ? (
                    <Pager page={page} totalPages={employeeTotalPages} total={filteredEmployees.length} pageSize={PAGE_SIZE} onPage={setPage} />
                ) : (
                    <Pager page={page} totalPages={customerTotalPages} total={customersTotal} pageSize={PAGE_SIZE} onPage={setPage} />
                )}
            </div>
        </CenterModal>
    );
};
