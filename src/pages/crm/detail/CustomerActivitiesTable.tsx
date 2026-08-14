import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { apiClient } from '../../../lib/axios';
import { customerApi } from '../../../lib/api/customer';
import { Button } from '../../../components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, CELL_INPUT_CLASS, SectionCard, TableStateRow } from '../../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../../hooks/useColumnWidths';
import { CUSTOMER_ADD_ROW_BUTTON_CLASS } from './customerDetail.constants';

/**
 * Aktivitäten (Zeitachse) als Tabelle mit gesammeltem Speichern — gleiche
 * Bedienung wie die Notizen: "+" hängt eine Zeile an, Speichern schreibt alles
 * gemeinsam weg.
 *
 * Systemseitig erzeugte Einträge (Angebot versendet, Auftrag erstellt …) sind
 * nicht auswählbar, behalten aber ihre übersetzte Beschriftung.
 */

export interface CustomerActivityDto {
    id: string;
    activityType: string;
    description?: string | null;
    activityDate: string;
    employeeId: string;
    employeeName?: string | null;
    employeeEmail?: string | null;
}

// Von Hand erfassbare Arten; alles andere kommt aus dem System.
const ACTIVITY_TYPE_OPTIONS = [
    { value: 'Meeting', labelKey: 'crm.customers.activityMeeting' },
    { value: 'Call', labelKey: 'crm.customers.activityPhone' },
    { value: 'Email', labelKey: 'crm.customers.activityEmail' },
    { value: 'SiteVisit', labelKey: 'crm.customers.activityFieldVisit' },
] as const;

const SYSTEM_ACTIVITY_LABEL_KEYS: Record<string, string> = {
    ProjectPhase: 'crm.customers.activityPhaseChange',
    TENDER_IMPORTED: 'crm.customers.activityTenderImported',
    TENDER_CREATED: 'crm.customers.activityTenderCreated',
    TENDER_APPROVED: 'crm.customers.activityTenderApproved',
    TENDER_ORDERED: 'crm.customers.activityTenderOrdered',
    OFFER_MAIL_SENT: 'crm.customers.activityTenderMailed',
};

/** Übersetzte Beschriftung einer Art; unbekannte Codes bleiben lesbar. */
const activityTypeLabel = (type: string) => {
    const manual = ACTIVITY_TYPE_OPTIONS.find((option) => option.value === type);
    if (manual) return i18nT(manual.labelKey);
    const system = SYSTEM_ACTIVITY_LABEL_KEYS[type];
    return system ? i18nT(system) : type;
};

const isSystemType = (type: string) => Boolean(SYSTEM_ACTIVITY_LABEL_KEYS[type]);

interface ActivityDraft {
    id: string | null;
    key: string;
    activityType: string;
    description: string;
    activityDate: string;
    actor: string;
}

const toDraft = (activity: CustomerActivityDto): ActivityDraft => ({
    id: activity.id,
    key: activity.id,
    activityType: activity.activityType,
    description: activity.description ?? '',
    activityDate: activity.activityDate ? dayjs(activity.activityDate).format('YYYY-MM-DD') : '',
    actor: activity.employeeName || activity.employeeEmail || '',
});

const sameActivity = (a: ActivityDraft, b: ActivityDraft) =>
    a.activityType === b.activityType && a.description === b.description && a.activityDate === b.activityDate;

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const CustomerActivitiesTable = ({
    customerId,
    items,
    onChanged,
}: {
    customerId: string;
    items: CustomerActivityDto[];
    onChanged: () => void | Promise<void>;
}) => {
    const grid = useColumnWidths({
        storageKey: 'offitec:customer-activities:col-widths:v1',
        defaults: { date: 128, kind: 176, author: 160, actions: 64 },
        minPx: 56,
    });
    const saved = useMemo(() => items.map(toDraft), [items]);
    const [rows, setRows] = useState<ActivityDraft[]>(saved);
    const [syncedItems, setSyncedItems] = useState(items);
    const [removedIds, setRemovedIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [newRowSeq, setNewRowSeq] = useState(0);

    const dirty = useMemo(() => {
        if (removedIds.length > 0) return true;
        if (rows.length !== saved.length) return true;
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        return rows.some((row) => {
            const previous = savedByKey.get(row.key);
            return !previous || !sameActivity(previous, row);
        });
    }, [rows, saved, removedIds]);

    if (items !== syncedItems) {
        setSyncedItems(items);
        if (!dirty) setRows(saved);
    }

    const patch = (key: string, next: Partial<ActivityDraft>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));

    const addRow = () => {
        const key = `new-${newRowSeq}`;
        setNewRowSeq((current) => current + 1);
        setRows((current) => [
            ...current,
            {
                id: null,
                key,
                activityType: 'Meeting',
                description: '',
                activityDate: dayjs().format('YYYY-MM-DD'),
                actor: '',
            },
        ]);
    };

    const removeRow = (row: ActivityDraft) => {
        setRows((current) => current.filter((item) => item.key !== row.key));
        if (row.id) setRemovedIds((current) => [...current, row.id!]);
    };

    const discard = () => {
        setRows(saved);
        setRemovedIds([]);
    };

    const save = async () => {
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        try {
            setSaving(true);
            await Promise.all([
                ...removedIds.map((id) => customerApi.deleteActivity(customerId, id)),
                ...rows.map((row) => {
                    const body = {
                        activityType: row.activityType,
                        description: row.description,
                        activityDate: row.activityDate || undefined,
                    };
                    if (!row.id) return apiClient.post(`/customers/${customerId}/activities`, body);
                    const previous = savedByKey.get(row.key);
                    if (previous && sameActivity(previous, row)) return Promise.resolve();
                    return customerApi.updateActivity(customerId, row.id, body);
                }),
            ]);
            setRemovedIds([]);
            toast.success(i18nT('crm.activityUpdated'));
            await onChanged();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard title={`${i18nT('crm.activities_label')} (${rows.length})`}>
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                <colgroup>
                    <ResizableCols keys={['date', 'kind'] as const} grid={grid} />
                    {/* Açıklama sütunu: genişliği yok, kalan yeri emer. */}
                    <col />
                    <ResizableCols keys={['author', 'actions'] as const} grid={grid} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="relative text-left">
                            {i18nT('common.date')}
                            <ColResizeHandle {...grid.resizeProps('date', 'right')} />
                        </th>
                        <th className="relative text-left">
                            {i18nT('crm.activityType')}
                            <ColResizeHandle {...grid.resizeProps('kind', 'right')} />
                        </th>
                        <th className="text-left">{i18nT('crm.activityDescription')}</th>
                        <th className="relative text-left">
                            {i18nT('crm.noteAuthor')}
                            <ColResizeHandle {...grid.resizeProps('author')} />
                        </th>
                        <th className="relative text-right">
                            <ColResizeHandle {...grid.resizeProps('actions')} />
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <TableStateRow colSpan={5} loading={false} emptyText={i18nT('crm.noActivities')} />
                    )}
                    {rows.map((row) => {
                        const system = isSystemType(row.activityType);
                        return (
                            <tr key={row.key} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                                <td>
                                    <input
                                        type="date"
                                        value={row.activityDate}
                                        onChange={(event) => patch(row.key, { activityDate: event.target.value })}
                                        className={CELL_INPUT_CLASS}
                                    />
                                </td>
                                <td>
                                    {/* Systemeinträge behalten ihre Art — nur ihre Beschreibung ist frei. */}
                                    {system ? (
                                        <span className="text-[13px] text-slate-500 dark:text-white/55">
                                            {activityTypeLabel(row.activityType)}
                                        </span>
                                    ) : (
                                        <select
                                            value={row.activityType}
                                            onChange={(event) => patch(row.key, { activityType: event.target.value })}
                                            className={CELL_INPUT_CLASS}
                                        >
                                            {ACTIVITY_TYPE_OPTIONS.map((option) => (
                                                <option key={option.value} value={option.value}>{i18nT(option.labelKey)}</option>
                                            ))}
                                        </select>
                                    )}
                                </td>
                                <td>
                                    <input
                                        value={row.description}
                                        onChange={(event) => patch(row.key, { description: event.target.value })}
                                        placeholder={i18nT('crm.activityDescription')}
                                        className={CELL_INPUT_CLASS}
                                    />
                                </td>
                                <td className="truncate text-slate-500 dark:text-white/55">{row.actor || '—'}</td>
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
                        );
                    })}

                    <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        {/* Knopf UND Beschriftung in DERSELBEN Zelle, rechts. */}
                        <td colSpan={5}>
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={addRow}
                                    title={i18nT('crm.addActivity')}
                                    aria-label={i18nT('crm.addActivity')}
                                    className={CUSTOMER_ADD_ROW_BUTTON_CLASS}
                                >
                                    <Plus size={18} />
                                </button>
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {i18nT('crm.addActivityHint')}
                                </span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {dirty && (
                <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <span className="mr-auto text-[12px] text-slate-500 dark:text-white/60">{i18nT('crm.unsavedChanges')}</span>
                    <Button variant="secondary" size="sm" icon={<XIcon size={12} />} onClick={discard}>{i18nT('common.cancel')}</Button>
                    <Button variant="primary" size="sm" loading={saving} icon={<Save size={12} />} onClick={() => void save()}>
                        {i18nT('common.save')}
                    </Button>
                </div>
            )}
        </SectionCard>
    );
};
