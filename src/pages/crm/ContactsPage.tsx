import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail01 as Mail, Phone } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ColResizeHandle, Pager, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { CrmFilterBar } from './components/CrmFilterBar';
import { useCrmPagedList } from './hooks/useCrmPagedList';
import { useDebouncedValue } from './hooks/useDebouncedValue';
import type { CrmContactRow } from './types/crm.types';

/**
 * Ansprechpartner — mandantenweite Liste aller Kontaktpersonen der Kunden
 * (Name, Firma, Telefon, E-Mail, Position). Gepflegt wird ein Kontakt in der
 * Kundenakte; ein Klick auf die Zeile springt genau dorthin.
 */

// Die Namensspalte hat KEINE Breite: sie nimmt den restlichen Platz auf,
// damit beim Ziehen einer Spalte rechts keine Lücke entsteht.
const CONTACT_COLUMN_WIDTHS = {
    company: 260,
    phone: 192,
    email: 240,
    position: 176,
};
type ContactColumn = keyof typeof CONTACT_COLUMN_WIDTHS;
const CONTACT_COLUMNS = Object.keys(CONTACT_COLUMN_WIDTHS) as ContactColumn[];
const PAGE_SIZE = 15;

export const ContactsPage = () => {
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const debouncedSearch = useDebouncedValue(search);

    const { widths, setColRef, startResize, resetColumn } = useColumnWidths<ContactColumn>({
        storageKey: 'offitec:crm-contacts:col-widths:v1',
        defaults: CONTACT_COLUMN_WIDTHS,
        minPx: 72,
    });

    const fetcher = useCallback(
        (page: number) => crmApi.listContacts({ search: debouncedSearch || undefined, page, pageSize: PAGE_SIZE }),
        [debouncedSearch],
    );
    const { rows, total, page, totalPages, loading, setPage } = useCrmPagedList<CrmContactRow>({
        fetcher,
        filterKey: debouncedSearch,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'crm.contactsPage.errorLoad',
    });

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('nav.crmContacts')} />

            <CrmFilterBar>
                <div className="w-64">
                    <SearchBox value={search} onChange={setSearch} placeholder={t('crm.contactsPage.search')} />
                </div>
            </CrmFilterBar>

            <SectionCard title={`${t('nav.crmContacts')} (${total})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        {CONTACT_COLUMNS.map((key) => (
                            <col key={key} ref={setColRef(key)} style={{ width: widths[key] }} />
                        ))}
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('crm.contactsPage.colName')}</th>
                            <th className="relative text-left">
                                {t('common.company')}
                                <ColResizeHandle onResizeStart={(event) => startResize('company', event)} onResizeReset={() => resetColumn('company')} />
                            </th>
                            <th className="relative text-left">
                                {t('common.phone')}
                                <ColResizeHandle onResizeStart={(event) => startResize('phone', event)} onResizeReset={() => resetColumn('phone')} />
                            </th>
                            <th className="relative text-left">
                                {t('common.email')}
                                <ColResizeHandle onResizeStart={(event) => startResize('email', event)} onResizeReset={() => resetColumn('email')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.contactsPage.colPosition')}
                                <ColResizeHandle onResizeStart={(event) => startResize('position', event)} onResizeReset={() => resetColumn('position')} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow
                                colSpan={5}
                                loading={loading}
                                emptyText={debouncedSearch ? t('crm.contactsPage.emptySearch') : t('crm.contactsPage.empty')}
                            />
                        )}
                        {!loading && rows.map((contact) => (
                            <tr
                                key={contact.id}
                                className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                onClick={() => navigate(`/crm/customers/${contact.customerId}`)}
                            >
                                <td>
                                    <div className="flex min-w-0 items-center gap-2.5">
                                        <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-[12px] font-semibold text-blue-700">
                                            {`${contact.firstName.charAt(0)}${contact.lastName.charAt(0)}`.toUpperCase()}
                                        </div>
                                        <span className="truncate font-semibold text-slate-900 dark:text-white">
                                            {contact.firstName} {contact.lastName}
                                        </span>
                                    </div>
                                </td>
                                <td className="truncate text-[12.5px] text-slate-700 dark:text-white/80">{contact.customer.companyName}</td>
                                <td>
                                    {contact.phone || contact.mobilePhone ? (
                                        <div className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-white/80">
                                            <Phone size={11} className="shrink-0 text-slate-400" />
                                            <span className="truncate">{contact.phone || contact.mobilePhone}</span>
                                        </div>
                                    ) : (
                                        <span className="text-slate-300 dark:text-white/30">—</span>
                                    )}
                                </td>
                                <td>
                                    {contact.email ? (
                                        <div className="flex items-center gap-1.5 text-[12.5px] text-slate-700 dark:text-white/80">
                                            <Mail size={11} className="shrink-0 text-slate-400" />
                                            <span className="truncate">{contact.email}</span>
                                        </div>
                                    ) : (
                                        <span className="text-slate-300 dark:text-white/30">—</span>
                                    )}
                                </td>
                                <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                                    {contact.title || <span className="text-slate-300 dark:text-white/30">—</span>}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>
        </div>
    );
};
