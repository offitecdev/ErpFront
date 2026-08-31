import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Plus } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ColResizeHandle, Pager, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { CrmFilterBar, CrmFilterDate, CrmFilterSelect } from './components/CrmFilterBar';
import { CustomerPicker } from './components/CustomerPicker';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { InteractionRows } from './components/InteractionRows';
import { useCrmPagedList } from './hooks/useCrmPagedList';
import { useStaffDirectory } from './hooks/useStaffDirectory';
import { INTERACTION_TYPES, channelLabel, dateInputToIso, personName } from './utils/crmFormat.utils';
import { EMPTY_COMMUNICATION_FILTER } from './types/crm.types';
import type { CommunicationFilterState, CrmCustomerOption, CrmInteractionRow, InteractionType } from './types/crm.types';

/**
 * Interaktionsverlauf — EINE Liste aller Kundenkontakte: Telefonate, E-Mails,
 * Besprechungen, Notizen und Besuche, jede Zeile nach Typ beschriftet (wie in
 * der Schnellerfassung). Die Zeilen kommen aus allen drei Quellen (Schnell-
 * erfassung/Verlauf, Notizen der Kundenakte, Aktivitäten der Kundenakte) über
 * die vereinte Serverabfrage — was in der Kundenakte erfasst wird, steht auch
 * hier, ohne Abgleich (Vorgabe 15.08.2026).
 *
 * Die Filterleiste deckt die vier Achsen ab (Kunde | Datum | Typ | Mitarbeiter).
 * Löschen entfernt die Zeile örtlich — die Liste baut sich nicht neu auf.
 */

// Die Notizspalte hat KEINE Breite — sie nimmt den restlichen Platz auf.
const COMMUNICATION_COLUMN_WIDTHS = {
    date: 116,
    channel: 124,
    customer: 260,
    employee: 176,
    actions: 56,
};
type CommunicationColumn = keyof typeof COMMUNICATION_COLUMN_WIDTHS;
const PAGE_SIZE = 20;

export const CommunicationPage = () => {
    const [filters, setFilters] = useState<CommunicationFilterState>(EMPTY_COMMUNICATION_FILTER);
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [quickOpen, setQuickOpen] = useState(false);
    const [pendingDelete, setPendingDelete] = useState<CrmInteractionRow | null>(null);
    const [deleting, setDeleting] = useState(false);
    const { staff } = useStaffDirectory();

    const { widths, setColRef, startResize, resetColumn } = useColumnWidths<CommunicationColumn>({
        storageKey: 'offitec:crm-communications:col-widths:v2',
        defaults: COMMUNICATION_COLUMN_WIDTHS,
        minPx: 56,
    });

    const filterKey = JSON.stringify(filters);
    const fetcher = useCallback(
        (page: number) => crmApi.listInteractions({
            customerId: filters.customerId || undefined,
            type: filters.type || undefined,
            employeeId: filters.employeeId || undefined,
            from: dateInputToIso(filters.from),
            to: dateInputToIso(filters.to),
            page,
            pageSize: PAGE_SIZE,
        }),
        [filters],
    );
    const { rows, total, page, totalPages, loading, setPage, reload, removeRow } = useCrmPagedList<CrmInteractionRow>({
        fetcher,
        filterKey,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'crm.comm.errorLoad',
    });

    const typeOptions = useMemo(
        () => INTERACTION_TYPES.map((type) => ({ value: type, label: channelLabel(type) })),
        [],
    );
    const staffOptions = useMemo(
        () => staff.map((person) => ({ value: person.id, label: personName(person) })),
        [staff],
    );

    const pickCustomer = (picked: CrmCustomerOption | null) => {
        setCustomer(picked);
        setFilters((current) => ({ ...current, customerId: picked?.id || '' }));
    };

    const confirmDelete = async () => {
        if (!pendingDelete) return;
        const target = pendingDelete;
        try {
            setDeleting(true);
            await crmApi.deleteInteraction(target);
            setPendingDelete(null);
            // Örtlich entfernen — kein Neuladen, kein Hinweisfenster.
            removeRow((row) => row.key === target.key);
        } catch {
            toast.error(t('crm.comm.deleteError'));
        } finally {
            setDeleting(false);
        }
    };

    const hasFilters = filterKey !== JSON.stringify(EMPTY_COMMUNICATION_FILTER);

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.crmCommunication')}
                action={
                    <button
                        type="button"
                        onClick={() => setQuickOpen(true)}
                        className="ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t('crm.comm.newEntry')}
                    </button>
                }
            />

            {/* Kunde | Datum von–bis | Typ | Mitarbeiter. */}
            <CrmFilterBar>
                <div className="w-56">
                    <CustomerPicker value={customer} onPick={(pick) => pickCustomer(pick?.customer ?? null)} placeholder={t('crm.comm.filterCustomer')} />
                </div>
                <CrmFilterDate value={filters.from} onChange={(value) => setFilters((c) => ({ ...c, from: value }))} label={t('crm.comm.filterFrom')} />
                <CrmFilterDate value={filters.to} onChange={(value) => setFilters((c) => ({ ...c, to: value }))} label={t('crm.comm.filterTo')} />
                <CrmFilterSelect
                    value={filters.type}
                    onChange={(value) => setFilters((c) => ({ ...c, type: value as InteractionType | '' }))}
                    label={t('crm.comm.filterChannel')}
                    options={typeOptions}
                    allLabel={t('crm.comm.allChannels')}
                />
                <CrmFilterSelect
                    value={filters.employeeId}
                    onChange={(value) => setFilters((c) => ({ ...c, employeeId: value }))}
                    label={t('crm.comm.filterEmployee')}
                    options={staffOptions}
                    allLabel={t('crm.comm.allEmployees')}
                />
                {hasFilters && (
                    <button
                        type="button"
                        onClick={() => { setFilters(EMPTY_COMMUNICATION_FILTER); setCustomer(null); }}
                        className="text-[12.5px] font-semibold text-slate-500 underline-offset-2 hover:underline dark:text-white/60"
                    >
                        {t('crm.comm.resetFilters')}
                    </button>
                )}
            </CrmFilterBar>

            <SectionCard title={`${t('nav.crmCommunication')} (${total})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col ref={setColRef('date')} style={{ width: widths.date }} />
                        <col ref={setColRef('channel')} style={{ width: widths.channel }} />
                        <col ref={setColRef('customer')} style={{ width: widths.customer }} />
                        <col />
                        <col ref={setColRef('employee')} style={{ width: widths.employee }} />
                        <col ref={setColRef('actions')} style={{ width: widths.actions }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="relative text-left">
                                {t('common.date')}
                                <ColResizeHandle onResizeStart={(event) => startResize('date', event)} onResizeReset={() => resetColumn('date')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.comm.colType')}
                                <ColResizeHandle onResizeStart={(event) => startResize('channel', event)} onResizeReset={() => resetColumn('channel')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.comm.colCustomer')}
                                <ColResizeHandle onResizeStart={(event) => startResize('customer', event)} onResizeReset={() => resetColumn('customer')} />
                            </th>
                            <th className="text-left">{t('crm.comm.colNote')}</th>
                            <th className="relative text-left">
                                {t('crm.comm.colEmployee')}
                                <ColResizeHandle onResizeStart={(event) => startResize('employee', event)} onResizeReset={() => resetColumn('employee')} />
                            </th>
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow
                                colSpan={6}
                                loading={loading}
                                emptyText={hasFilters ? t('crm.comm.emptyFiltered') : t('crm.comm.empty')}
                            />
                        )}
                        {!loading && (
                            <InteractionRows rows={rows} showCustomer onDelete={setPendingDelete} />
                        )}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>

            <QuickEntrySheet open={quickOpen} action="PHONE" onClose={() => setQuickOpen(false)} onSaved={reload} />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                title={t('crm.comm.deleteTitle')}
                message={pendingDelete?.note}
                tone="danger"
                busy={deleting}
                confirmLabel={t('common.delete')}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </div>
    );
};
