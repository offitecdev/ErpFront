import { useEffect, useState } from 'react';
import { Check, User01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { CenterModal } from '@/pages/calendar/components/shells';
import { Pager, SearchBox, TableStateRow } from '@/components/ui-shared/TableKit';
import type { CrmCustomerOption } from '../../types/crm.types';
import { BTN_PRIMARY, BTN_SECONDARY } from '../ui';

/**
 * "Kunden wählen" — das grosse Fenster mit der Kundenliste in Häppchen von 15
 * (geblättert, serverseitig gesucht). Es ergänzt die Kundenzelle der
 * Verknüpfungstabelle: wer den Namen nicht tippen will, blättert hier und
 * kreuzt MEHRERE Kunden an; jeder wird in der Tabelle eine eigene Zeile.
 *
 * Die Auswahl überlebt den Seitenwechsel (sie hängt an den Ids, nicht an der
 * gezeigten Seite); Kunden, die schon in der Tabelle stehen, sind gesperrt.
 */
const PAGE_SIZE = 15;

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

export const CustomerSelectModal = ({
    open,
    onClose,
    onSelect,
    excludeIds = [],
    z = 160,
}: {
    open: boolean;
    onClose: () => void;
    onSelect: (customers: CrmCustomerOption[]) => void;
    /** Kunden, die schon in der Tabelle stehen — gesperrt. */
    excludeIds?: string[];
    z?: number;
}) => {
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [rows, setRows] = useState<CrmCustomerOption[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(1);
    /** Gewählte Kunden über alle Seiten hinweg. */
    const [chosen, setChosen] = useState<CrmCustomerOption[]>([]);
    // Die Suche/Seite, zu der `rows` gehört — daraus leitet sich "lädt" ab.
    const [settled, setSettled] = useState<string | null>(null);
    const loading = settled !== `${search.trim()}|${page}`;

    // Bei jedem Öffnen frisch (Zustand beim RENDERN, kein setState im Effekt).
    const [seenOpen, setSeenOpen] = useState(open);
    if (seenOpen !== open) {
        setSeenOpen(open);
        setSearch('');
        setPage(1);
        setChosen([]);
        setSettled(null);
    }

    // Suchtext ändern heisst: wieder auf Seite 1.
    const changeSearch = (next: string) => { setSearch(next); setPage(1); };

    useEffect(() => {
        if (!open) return;
        const trimmed = search.trim();
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const res = await apiClient.get('/customers', {
                    params: { page, pageSize: PAGE_SIZE, fields: 'list', ...(trimmed ? { search: trimmed } : {}) },
                });
                if (cancelled) return;
                const data = res.data as { items?: CustomerListRow[]; total?: number; totalPages?: number } | CustomerListRow[];
                const list = Array.isArray(data) ? data : data.items || [];
                setRows(list.map(toOption));
                setTotal(Array.isArray(data) ? list.length : data.total || list.length);
                setTotalPages(Array.isArray(data) ? 1 : data.totalPages || 1);
            } catch {
                if (!cancelled) { setRows([]); setTotal(0); setTotalPages(1); }
            } finally {
                if (!cancelled) setSettled(`${trimmed}|${page}`);
            }
        }, trimmed ? 250 : 0);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [open, search, page]);

    const toggle = (customer: CrmCustomerOption) => setChosen((current) => (current.some((entry) => entry.id === customer.id)
        ? current.filter((entry) => entry.id !== customer.id)
        : [...current, customer]));

    return (
        <CenterModal
            open={open}
            onClose={onClose}
            title={t('forms.link.selectCustomers')}
            subtitle={t('forms.link.selectCustomersHint')}
            width={900}
            z={z}
            closeOnBackdrop={false}
            footer={(
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12.5px] text-slate-500 dark:text-white/60">
                        {chosen.length > 0 ? t('forms.link.chosenCount', { count: chosen.length }) : ''}
                    </span>
                    <div className="ml-auto flex items-center gap-2">
                        <button type="button" className={BTN_SECONDARY} onClick={onClose}>{t('common.cancel')}</button>
                        <button
                            type="button"
                            className={BTN_PRIMARY}
                            disabled={chosen.length === 0}
                            onClick={() => { onSelect(chosen); onClose(); }}
                        >
                            {t('forms.link.takeCustomers')}
                        </button>
                    </div>
                </div>
            )}
        >
            <div className="p-4">
                <SearchBox value={search} onChange={changeSearch} placeholder={t('crm.quick.customerSearch')} autoFocus className="mb-3" />

                <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/15">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                        <colgroup>
                            <col style={{ width: 46 }} />
                            <col />
                            <col style={{ width: '32%' }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th />
                                <th className="text-left">{t('forms.links.customer')}</th>
                                <th className="text-left">{t('crm.quick.contact')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || rows.length === 0) && (
                                <TableStateRow colSpan={3} loading={loading} emptyText={t('crm.quick.noCustomer')} skeletonRows={5} />
                            )}
                            {!loading && rows.map((customer) => {
                                const already = excludeIds.includes(customer.id);
                                const active = chosen.some((entry) => entry.id === customer.id);
                                return (
                                    <tr
                                        key={customer.id}
                                        onClick={() => { if (!already) toggle(customer); }}
                                        className={`transition-colors ${already
                                            ? 'cursor-not-allowed opacity-50'
                                            : `cursor-pointer ${active ? 'bg-[#eef2fb] dark:bg-white/10' : 'hover:bg-slate-50 dark:hover:bg-white/5'}`}`}
                                    >
                                        <td>
                                            <span className={`grid size-5 place-items-center rounded border ${active
                                                ? 'border-[#272f67] bg-[#272f67] text-white'
                                                : 'border-slate-300 bg-white dark:border-white/20 dark:bg-transparent'}`}
                                            >
                                                {active && <Check size={12} />}
                                            </span>
                                        </td>
                                        <td>
                                            <span className="inline-flex min-w-0 items-center gap-2">
                                                <User01 size={14} className="shrink-0 text-slate-400" />
                                                <span className="truncate text-[13px] font-semibold text-slate-800 dark:text-white">{customer.companyName}</span>
                                                {already && <span className="shrink-0 text-[11px] text-slate-400">{t('forms.link.alreadyInList')}</span>}
                                            </span>
                                        </td>
                                        <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                                            {customer.responsibleName || <span className="text-slate-300">—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    <div className="border-t border-slate-200 dark:border-white/10">
                        <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                    </div>
                </div>
            </div>
        </CenterModal>
    );
};
