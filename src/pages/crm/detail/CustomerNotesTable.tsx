import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { apiClient } from '../../../lib/axios';
import { customerApi } from '../../../lib/api/customer';
import { Button } from '../../../components/ui-shared/Button';
import { CELL_INPUT_CLASS, SectionCard, TableStateRow } from '../../../components/ui-shared/TableKit';

/**
 * Interne Notizen als Tabelle mit gesammeltem Speichern: das "+" hängt eine
 * leere Zeile an, geändert wird direkt in den Zellen, und ein Klick auf
 * Speichern schreibt Anlegen, Ändern und Löschen gemeinsam weg.
 */

export interface CustomerNoteDto {
    id: string;
    noteType: string;
    noteText: string;
    isHighlight: boolean;
    createdAt: string;
    createdBy?: { firstName?: string; lastName?: string };
}

// Notizarten — Beschriftung kommt aus der Übersetzung, gespeichert wird der Code.
const NOTE_TYPE_OPTIONS = [
    { value: 'internal', labelKey: 'crm.noteTypeInternal' },
    { value: 'customer', labelKey: 'crm.noteTypeCustomer' },
    { value: 'warning', labelKey: 'crm.noteTypeWarning' },
] as const;

interface NoteDraft {
    id: string | null;
    key: string;
    noteType: string;
    noteText: string;
    isHighlight: boolean;
    createdAt: string | null;
    author: string;
}

const authorOf = (note: CustomerNoteDto) =>
    [note.createdBy?.firstName, note.createdBy?.lastName].filter(Boolean).join(' ');

const toDraft = (note: CustomerNoteDto): NoteDraft => ({
    id: note.id,
    key: note.id,
    noteType: note.noteType || 'internal',
    noteText: note.noteText ?? '',
    isHighlight: Boolean(note.isHighlight),
    createdAt: note.createdAt,
    author: authorOf(note),
});

const sameNote = (a: NoteDraft, b: NoteDraft) =>
    a.noteType === b.noteType && a.noteText === b.noteText && a.isHighlight === b.isHighlight;

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

export const CustomerNotesTable = ({
    customerId,
    items,
    onChanged,
}: {
    customerId: string;
    items: CustomerNoteDto[];
    onChanged: () => void | Promise<void>;
}) => {
    const saved = useMemo(() => items.map(toDraft), [items]);
    const [rows, setRows] = useState<NoteDraft[]>(saved);
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
            return !previous || !sameNote(previous, row);
        });
    }, [rows, saved, removedIds]);

    if (items !== syncedItems) {
        setSyncedItems(items);
        if (!dirty) setRows(saved);
    }

    const patch = (key: string, next: Partial<NoteDraft>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...next } : row)));

    const addRow = () => {
        const key = `new-${newRowSeq}`;
        setNewRowSeq((current) => current + 1);
        setRows((current) => [
            ...current,
            { id: null, key, noteType: 'internal', noteText: '', isHighlight: false, createdAt: null, author: '' },
        ]);
    };

    const removeRow = (row: NoteDraft) => {
        setRows((current) => current.filter((item) => item.key !== row.key));
        if (row.id) setRemovedIds((current) => [...current, row.id!]);
    };

    const discard = () => {
        setRows(saved);
        setRemovedIds([]);
    };

    const save = async () => {
        if (rows.some((row) => !row.noteText.trim())) {
            toast.error(i18nT('crm.customers.errorNoteEmpty'));
            return;
        }
        const savedByKey = new Map(saved.map((row) => [row.key, row]));
        try {
            setSaving(true);
            await Promise.all([
                ...removedIds.map((id) => customerApi.deleteNote(customerId, id)),
                ...rows.map((row) => {
                    const body = { noteType: row.noteType, noteText: row.noteText, isHighlight: row.isHighlight };
                    if (!row.id) return apiClient.post(`/customers/${customerId}/notes`, body);
                    const previous = savedByKey.get(row.key);
                    if (previous && sameNote(previous, row)) return Promise.resolve();
                    return customerApi.updateNote(customerId, row.id, body);
                }),
            ]);
            setRemovedIds([]);
            toast.success(i18nT('crm.noteUpdated'));
            await onChanged();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        } finally {
            setSaving(false);
        }
    };

    return (
        <SectionCard title={`${i18nT('crm.internal_notes')} (${rows.length})`}>
            <table data-inv-table data-unstyled-table className="w-full">
                <thead>
                    <tr>
                        <th className="w-40 text-left">{i18nT('crm.noteType')}</th>
                        <th className="text-left">{i18nT('crm.noteText')}</th>
                        <th className="w-28 text-center">{i18nT('crm.noteHighlight')}</th>
                        <th className="w-32 text-left">{i18nT('common.date')}</th>
                        <th className="w-40 text-left">{i18nT('crm.noteAuthor')}</th>
                        <th className="w-16 text-right" />
                    </tr>
                </thead>
                <tbody>
                    {rows.length === 0 && (
                        <TableStateRow colSpan={6} loading={false} emptyText={i18nT('crm.noNotes')} />
                    )}
                    {rows.map((row) => (
                        <tr key={row.key} className="group transition-colors hover:bg-slate-50 dark:hover:bg-white/5">
                            <td>
                                <select
                                    value={row.noteType}
                                    onChange={(event) => patch(row.key, { noteType: event.target.value })}
                                    className={CELL_INPUT_CLASS}
                                >
                                    {NOTE_TYPE_OPTIONS.map((option) => (
                                        <option key={option.value} value={option.value}>{i18nT(option.labelKey)}</option>
                                    ))}
                                </select>
                            </td>
                            <td>
                                <input
                                    value={row.noteText}
                                    onChange={(event) => patch(row.key, { noteText: event.target.value })}
                                    placeholder={i18nT('crm.noteText')}
                                    className={CELL_INPUT_CLASS}
                                />
                            </td>
                            <td className="text-center">
                                <input
                                    type="checkbox"
                                    checked={row.isHighlight}
                                    onChange={(event) => patch(row.key, { isHighlight: event.target.checked })}
                                    aria-label={i18nT('crm.noteHighlight')}
                                    className="size-4 accent-[#1f2654]"
                                />
                            </td>
                            <td className="text-slate-500 dark:text-white/55">
                                {row.createdAt ? dayjs(row.createdAt).format('DD.MM.YYYY') : '—'}
                            </td>
                            <td className="truncate text-slate-500 dark:text-white/55">{row.author || '—'}</td>
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

                    <tr className="bg-slate-50/60 dark:bg-white/[0.02]">
                        <td colSpan={5} className="text-[12.5px] text-slate-400 dark:text-white/40">
                            {i18nT('crm.addNoteHint')}
                        </td>
                        <td className="text-right">
                            <button
                                type="button"
                                onClick={addRow}
                                title={i18nT('crm.addNote')}
                                aria-label={i18nT('crm.addNote')}
                                className="inline-flex size-6 items-center justify-center rounded-[2px] border border-dashed border-slate-300 text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/60"
                            >
                                <Plus size={13} />
                            </button>
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
