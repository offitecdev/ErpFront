import { useEffect, useState } from 'react';
import { LuBuilding2, LuSearch, LuUsers } from 'react-icons/lu';
import { Check } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { apiClient } from '@/lib/axios';
import { PopupButton, PopupDialog, PopupEmpty } from '@/components/ui-shared/PopupKit';
import type { CrmCustomerOption } from '../../types/crm.types';

/**
 * «Kunden wählen» — die grosse Kundenliste in Häppchen von 15 (geblättert,
 * serverseitig gesucht), mehrere auf einmal ankreuzbar; jeder gewählte Kunde
 * wird im Verknüpfungsfenster eine eigene Zeile. Seit dem 02.09.2026 ein
 * Fenster des App-Bausatzes im Apple-Kleid.
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
    z = 800,
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
        <PopupDialog
            open={open}
            onClose={onClose}
            title={t('forms.link.selectCustomers')}
            subtitle={t('forms.link.selectCustomersHint')}
            icon={<LuUsers size={18} />}
            width={640}
            z={z}
            closeOnBackdrop={false}
            bodyClassName="ofi-chk ofi-chk-dialog"
            footer={(
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start">
                        {chosen.length > 0 ? t('forms.link.chosenCount', { count: chosen.length }) : ''}
                    </div>
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
                        <PopupButton variant="primary" disabled={chosen.length === 0} onClick={() => { onSelect(chosen); onClose(); }}>
                            {t('forms.link.takeCustomers')}
                        </PopupButton>
                    </div>
                </div>
            )}
        >
            <div className="ofi-chk-searchbar">
                <LuSearch size={15} aria-hidden />
                <input
                    autoFocus
                    value={search}
                    onChange={(event) => changeSearch(event.target.value)}
                    placeholder={t('crm.quick.customerSearch')}
                    className="ofi-chk-searchbar__input"
                />
            </div>

            <div className="ofi-chk-card ofi-chk-list">
                {loading ? (
                    <PopupEmpty>{t('common.loading')}</PopupEmpty>
                ) : rows.length === 0 ? (
                    <PopupEmpty>{t('crm.quick.noCustomer')}</PopupEmpty>
                ) : rows.map((customer) => {
                    const already = excludeIds.includes(customer.id);
                    const active = chosen.some((entry) => entry.id === customer.id);
                    return (
                        <button
                            key={customer.id}
                            type="button"
                            role="option"
                            aria-selected={active}
                            disabled={already}
                            className={`ofi-option-row ofi-chk-pick is-check ${active ? 'is-active' : ''}`}
                            onClick={() => { if (!already) toggle(customer); }}
                        >
                            <span className={`ofi-chk-check ${active ? 'is-on' : ''}`} aria-hidden>{active && <Check size={12} />}</span>
                            <span className="ofi-chk-pick__icon is-soft"><LuBuilding2 size={15} /></span>
                            <span className="min-w-0 flex-1">
                                <span className="ofi-chk-pick__title">{customer.companyName}</span>
                                <span className="ofi-chk-pick__meta">
                                    {already ? t('forms.link.alreadyInList') : (customer.responsibleName || '')}
                                </span>
                            </span>
                        </button>
                    );
                })}
            </div>

            {totalPages > 1 && (
                <div className="ofi-tp-pager">
                    <span>{t('forms.link.customerCountShort', { count: total })}</span>
                    <span className="ofi-chk-pager__nav">
                        <button type="button" className="ofi-cal-btn" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>‹</button>
                        <span className="ofi-chk-pager__page">{page} / {totalPages}</span>
                        <button type="button" className="ofi-cal-btn" disabled={page >= totalPages} onClick={() => setPage((current) => current + 1)}>›</button>
                    </span>
                </div>
            )}
        </PopupDialog>
    );
};
