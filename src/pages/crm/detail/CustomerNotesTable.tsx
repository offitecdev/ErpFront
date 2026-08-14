import { useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { AlertTriangle, Plus, Save01 as Save, Trash01 as TrashIcon, X as XIcon } from '@/components/icons/antIconCompat';

import { t as i18nT } from '@/i18n/translate';
import { apiClient } from '../../../lib/axios';
import { customerApi } from '../../../lib/api/customer';
import { Button } from '../../../components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, CELL_INPUT_CLASS, SectionCard, TableStateRow } from '../../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../../hooks/useColumnWidths';
import { CUSTOMER_ADD_ROW_BUTTON_CLASS } from './customerDetail.constants';

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

/**
 * Notizarten (intern / Kunde / Warnung) gibt es in der Oberfläche NICHT mehr
 * (Nutzerwunsch 2026-08-03): statt einer Einordnung wird eine Notiz nur noch
 * als „Wichtig“ markiert. Die Spalte `noteType` bleibt am Datensatz, damit
 * bestehende Notizen unverändert bleiben — neue bekommen `internal`.
 */
const DEFAULT_NOTE_TYPE = 'internal';

interface NoteDraft {
    id: string | null;
    key: string;
    /** Wird nicht mehr bearbeitet, aber unverändert mitgespeichert. */
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
    noteType: note.noteType || DEFAULT_NOTE_TYPE,
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
    const grid = useColumnWidths({
        storageKey: 'offitec:customer-notes:col-widths:v1',
        defaults: { highlight: 112, date: 128, author: 160, actions: 64 },
        minPx: 56,
    });
    const saved = useMemo(() => items.map(toDraft), [items]);
    const [rows, setRows] = useState<NoteDraft[]>(saved);
    const [syncedItems, setSyncedItems] = useState(items);
    const [removedIds, setRemovedIds] = useState<string[]>([]);
    const [saving, setSaving] = useState(false);
    const [newRowSeq, setNewRowSeq] = useState(0);

    /**
     * Anzeigereihenfolge: WICHTIGE Notizen zuerst, alles andere in seiner
     * bisherigen Reihenfolge. `sort` in JS ist stabil, also bleibt innerhalb der
     * beiden Gruppen die Eingabe-/Ladereihenfolge erhalten — auch die leere
     * neue Zeile bleibt damit unten, bis sie als wichtig markiert wird.
     * Nur die ANSICHT wird sortiert; `rows` (und damit das Speichern) nicht.
     */
    const visibleRows = useMemo(
        () => [...rows].sort((a, b) => Number(b.isHighlight) - Number(a.isHighlight)),
        [rows],
    );

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
            { id: null, key, noteType: DEFAULT_NOTE_TYPE, noteText: '', isHighlight: false, createdAt: null, author: '' },
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
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                <colgroup>
                    {/* Not metni: genişliği yok, kalan yeri emer. */}
                    <col />
                    <ResizableCols keys={['highlight', 'date', 'author', 'actions'] as const} grid={grid} />
                </colgroup>
                <thead>
                    <tr>
                        <th className="text-left">{i18nT('crm.noteText')}</th>
                        <th className="relative text-center">
                            {i18nT('crm.noteHighlight')}
                            <ColResizeHandle {...grid.resizeProps('highlight')} />
                        </th>
                        <th className="relative text-left">
                            {i18nT('common.date')}
                            <ColResizeHandle {...grid.resizeProps('date')} />
                        </th>
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
                        <TableStateRow colSpan={5} loading={false} emptyText={i18nT('crm.noNotes')} />
                    )}
                    {visibleRows.map((row) => (
                        // WICHTIG = rot: die Zeile bekommt einen roten Grundton und
                        // der Notiztext wird rot geschrieben, damit sie im Stapel
                        // sofort auffällt. Umschalten geht jederzeit über den Knopf
                        // in der Spalte „Wichtig“.
                        <tr
                            key={row.key}
                            className={`group transition-colors ${
                                row.isHighlight
                                    ? 'bg-rose-50 hover:bg-rose-100/70 dark:bg-rose-500/10 dark:hover:bg-rose-500/15'
                                    : 'hover:bg-slate-50 dark:hover:bg-white/5'
                            }`}
                        >
                            <td>
                                <input
                                    value={row.noteText}
                                    onChange={(event) => patch(row.key, { noteText: event.target.value })}
                                    placeholder={i18nT('crm.noteText')}
                                    className={`${CELL_INPUT_CLASS} ${
                                        row.isHighlight ? '!font-semibold !text-rose-700 dark:!text-rose-300' : ''
                                    }`}
                                />
                            </td>
                            <td className="text-center">
                                {/* Umschalter statt Häkchen: rot gefüllt = wichtig,
                                    blass = normal. Ein Klick kehrt es um. */}
                                <button
                                    type="button"
                                    onClick={() => patch(row.key, { isHighlight: !row.isHighlight })}
                                    aria-pressed={row.isHighlight}
                                    aria-label={i18nT('crm.noteHighlight')}
                                    title={i18nT('crm.noteHighlight')}
                                    className={`inline-flex size-6 items-center justify-center rounded-[2px] border transition-colors ${
                                        row.isHighlight
                                            ? 'border-rose-300 bg-rose-100 text-rose-600 hover:bg-rose-200 dark:border-rose-400/40 dark:bg-rose-500/20 dark:text-rose-300'
                                            : 'border-slate-200 text-slate-300 hover:border-rose-300 hover:text-rose-500 dark:border-white/15 dark:text-white/30'
                                    }`}
                                >
                                    <AlertTriangle size={13} />
                                </button>
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
                        {/* Knopf UND Beschriftung in DERSELBEN Zelle, rechts. */}
                        <td colSpan={5}>
                            <div className="flex items-center gap-2.5">
                                <button
                                    type="button"
                                    onClick={addRow}
                                    title={i18nT('crm.addNote')}
                                    aria-label={i18nT('crm.addNote')}
                                    className={CUSTOMER_ADD_ROW_BUTTON_CLASS}
                                >
                                    <Plus size={18} />
                                </button>
                                <span className="text-[12.5px] text-slate-400 dark:text-white/40">
                                    {i18nT('crm.addNoteHint')}
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
