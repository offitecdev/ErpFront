import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell01 as Bell, Plus, X as XIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { reminderTitle } from '@/lib/notificationText';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { ColResizeHandle, Pager, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { CrmFilterBar, CrmFilterSelect } from './components/CrmFilterBar';
import { CustomerPicker } from './components/CustomerPicker';
import { QuickEntrySheet } from './components/QuickEntrySheet';
import { useCrmPagedList } from './hooks/useCrmPagedList';
import { useStaffDirectory } from './hooks/useStaffDirectory';
import {
    formatCrmDate,
    formatCrmTime,
    personName,
    reminderState,
    reminderStateLabel,
    reminderStateVariant,
} from './utils/crmFormat.utils';
import { EMPTY_REMINDER_FILTER } from './types/crm.types';
import type { CrmCustomerOption, CrmTaskRow, ReminderFilterState } from './types/crm.types';

/**
 * Erinnerungen — eigene Seite, getrennt von den Aufgaben (Vorgabe 15.08.2026).
 *
 *   Erinnerung | Kunde | Verantwortlich | Datum · Uhrzeit | Status | Schliessen
 *
 *  • Eine Erinnerung ist offen, bis sie GESCHLOSSEN wird — und Schliessen ist
 *    endgültig: die Zeile wird gelöscht, sie kommt weder hier noch im
 *    Einblendfenster wieder. Darum gibt es keinen Status-Filter.
 *  • Erinnerungen des Hintergrunddienstes (Angebot läuft ab, Liefertermin)
 *    haben "Öffnen" zum Beleg. Ist das Angebot abgelaufen, sagt es der Status
 *    ("Angebot abgelaufen"); der Dienst räumt die Zeile beim nächsten Takt
 *    selbst weg — das Angebot selbst steht dann als "Abgelaufen" in der
 *    Angebotsliste.
 *  • Schliessen entfernt die Zeile örtlich — kein Neuladen, kein Hinweis.
 */

// Die Erinnerungsspalte hat KEINE Breite — sie nimmt den restlichen Platz auf.
const REMINDER_COLUMN_WIDTHS = {
    customer: 230,
    assignee: 160,
    due: 150,
    status: 160,
    // Breit genug für die Überschrift "Schliessen" — bei 72 px wurde sie am
    // rechten Kartenrand abgeschnitten.
    actions: 116,
};
type ReminderColumn = keyof typeof REMINDER_COLUMN_WIDTHS;
const PAGE_SIZE = 20;

export const RemindersPage = () => {
    const navigate = useNavigate();
    const [filters, setFilters] = useState<ReminderFilterState>(EMPTY_REMINDER_FILTER);
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [quickOpen, setQuickOpen] = useState(false);
    const [busyIds, setBusyIds] = useState<Set<string>>(() => new Set());
    const { staff } = useStaffDirectory();

    const { widths, setColRef, startResize, resetColumn } = useColumnWidths<ReminderColumn>({
        storageKey: 'offitec:crm-reminders:col-widths:v1',
        defaults: REMINDER_COLUMN_WIDTHS,
        minPx: 56,
    });

    const filterKey = JSON.stringify(filters);
    const fetcher = useCallback(
        (page: number) => crmApi.listTasks({
            kind: 'REMINDER',
            customerId: filters.customerId || undefined,
            assigneeId: filters.assigneeId || undefined,
            page,
            pageSize: PAGE_SIZE,
        }),
        [filters],
    );
    const { rows, total, page, totalPages, loading, setPage, reload, removeRow } = useCrmPagedList<CrmTaskRow>({
        fetcher,
        filterKey,
        pageSize: PAGE_SIZE,
        errorMessageKey: 'crm.reminders.errorLoad',
    });

    const staffOptions = useMemo(
        () => staff.map((person) => ({ value: person.id, label: personName(person) })),
        [staff],
    );

    const pickCustomer = (picked: CrmCustomerOption | null) => {
        setCustomer(picked);
        setFilters((current) => ({ ...current, customerId: picked?.id || '' }));
    };

    /** Schliessen = endgültig löschen; die Zeile verschwindet örtlich. */
    const dismiss = async (reminder: CrmTaskRow) => {
        if (busyIds.has(reminder.id)) return;
        setBusyIds((current) => new Set(current).add(reminder.id));
        try {
            await crmApi.deleteTask(reminder.id);
            removeRow((row) => row.id === reminder.id);
        } catch {
            toast.error(t('crm.reminders.dismissError'));
        } finally {
            setBusyIds((current) => { const next = new Set(current); next.delete(reminder.id); return next; });
        }
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader
                title={t('nav.crmReminders')}
                action={
                    <button
                        type="button"
                        onClick={() => setQuickOpen(true)}
                        className="ofi-btn-brand flex items-center gap-1.5 rounded-md bg-[#272f67] px-3.5 py-2 text-[12.5px] font-semibold text-white hover:bg-[#1f2654]"
                    >
                        <Plus size={14} />
                        {t('crm.reminders.newReminder')}
                    </button>
                }
            />

            <CrmFilterBar>
                <div className="w-56">
                    <CustomerPicker value={customer} onPick={(pick) => pickCustomer(pick?.customer ?? null)} placeholder={t('crm.tasks.filterCustomer')} />
                </div>
                <CrmFilterSelect
                    value={filters.assigneeId}
                    onChange={(value) => setFilters((current) => ({ ...current, assigneeId: value }))}
                    label={t('crm.tasks.filterAssignee')}
                    options={staffOptions}
                    allLabel={t('crm.tasks.allAssignees')}
                />
            </CrmFilterBar>

            <SectionCard title={`${t('nav.crmReminders')} (${total})`}>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <col />
                        <col ref={setColRef('customer')} style={{ width: widths.customer }} />
                        <col ref={setColRef('assignee')} style={{ width: widths.assignee }} />
                        <col ref={setColRef('due')} style={{ width: widths.due }} />
                        <col ref={setColRef('status')} style={{ width: widths.status }} />
                        <col ref={setColRef('actions')} style={{ width: widths.actions }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="text-left">{t('crm.reminders.colReminder')}</th>
                            <th className="relative text-left">
                                {t('crm.tasks.colCustomer')}
                                <ColResizeHandle onResizeStart={(event) => startResize('customer', event)} onResizeReset={() => resetColumn('customer')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.tasks.colAssignee')}
                                <ColResizeHandle onResizeStart={(event) => startResize('assignee', event)} onResizeReset={() => resetColumn('assignee')} />
                            </th>
                            <th className="relative text-left">
                                {t('crm.reminders.colWhen')}
                                <ColResizeHandle onResizeStart={(event) => startResize('due', event)} onResizeReset={() => resetColumn('due')} />
                            </th>
                            <th className="relative text-left">
                                {t('common.status')}
                                <ColResizeHandle onResizeStart={(event) => startResize('status', event)} onResizeReset={() => resetColumn('status')} />
                            </th>
                            <th className="text-center">{t('crm.reminders.colClose')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || rows.length === 0) && (
                            <TableStateRow colSpan={6} loading={loading} emptyText={t('crm.reminders.empty')} />
                        )}
                        {!loading && rows.map((reminder) => {
                            const state = reminderState(reminder);
                            const contactName = personName(reminder.contact);
                            const busy = busyIds.has(reminder.id);
                            return (
                                <tr key={reminder.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                    <td>
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300">
                                                <Bell size={13} />
                                            </span>
                                            {/* Zeilenumbrüche bleiben stehen — Erinnerungen dürfen mehrzeilig sein. */}
                                            <span className="whitespace-pre-line break-words font-semibold text-slate-900 dark:text-white">{reminderTitle(reminder)}</span>
                                            {/* Erinnerungen aus dem Hintergrunddienst: "Öffnen" → der Beleg. */}
                                            {reminder.linkUrl && (
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(reminder.linkUrl!)}
                                                    className="inline-flex shrink-0 items-center gap-0.5 text-[11.5px] font-semibold text-[#1f2654] underline-offset-2 hover:underline dark:text-sky-300"
                                                >
                                                    {t('crm.reminder.open')}
                                                    <ArrowRight size={11} />
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        {reminder.customer ? (
                                            <>
                                                <div className="truncate text-[12.5px] text-slate-700 dark:text-white/80">{reminder.customer.companyName}</div>
                                                {contactName && <div className="mt-0.5 truncate text-[11.5px] text-slate-400">{contactName}</div>}
                                            </>
                                        ) : <span className="text-slate-300 dark:text-white/30">—</span>}
                                    </td>
                                    <td className="truncate text-[12.5px] text-slate-500 dark:text-white/60">
                                        {reminder.assignees.length ? reminder.assignees.map(personName).join(', ') : <span className="text-slate-300 dark:text-white/30">—</span>}
                                    </td>
                                    <td className="whitespace-nowrap text-[12.5px] text-slate-600 dark:text-white/70">
                                        {formatCrmDate(reminder.dueDate)}
                                        {reminder.dueDate && (
                                            <span className="ml-1.5 font-semibold tabular-nums text-slate-900 dark:text-white">{formatCrmTime(reminder.dueDate)}</span>
                                        )}
                                    </td>
                                    <td>
                                        <StatusChip variant={reminderStateVariant(state)}>{reminderStateLabel(state)}</StatusChip>
                                    </td>
                                    <td className="text-center">
                                        <button
                                            type="button"
                                            disabled={busy}
                                            onClick={() => void dismiss(reminder)}
                                            aria-label={t('crm.reminders.dismiss')}
                                            title={t('crm.reminders.dismiss')}
                                            className="inline-flex size-9 items-center justify-center rounded-lg border-2 border-slate-200 text-slate-300 transition-colors hover:border-red-400 hover:bg-red-50 hover:text-red-600 disabled:cursor-wait disabled:opacity-50 dark:border-white/15 dark:hover:bg-red-500/10"
                                        >
                                            <XIcon size={18} strokeWidth={2.5} />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager page={page} totalPages={totalPages} total={total} pageSize={PAGE_SIZE} onPage={setPage} />
                </div>
            </SectionCard>

            <QuickEntrySheet open={quickOpen} action="REMINDER" onClose={() => setQuickOpen(false)} onSaved={reload} />
        </div>
    );
};
