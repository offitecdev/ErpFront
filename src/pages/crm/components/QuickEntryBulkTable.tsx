import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Link02, Plus, Save01 as Save, Trash01 as Trash } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { Button } from '@/components/ui-shared/Button';
import { CELL_INPUT_CLASS, SectionCard } from '@/components/ui-shared/TableKit';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { CustomerComboCell } from './CustomerComboCell';
import { StaffMultiCombo } from './StaffMultiCombo';
import { ContactCell } from './ContactCell';
import { TaskTenderCombo, type TaskTenderPick } from '../tasks/TaskTenderCombo';
import { dateInputToIso, dateTimeToIso, toDateInputValue } from '../utils/crmFormat.utils';
import type { CrmCustomerOption, QuickEntryAction, QuickEntryDraftRow } from '../types/crm.types';

/**
 * Massenerfassung als Tabelle — dieselbe Bauart wie die Massenanlage im
 * Lagermodul (ArticleCreateView): jede Zeile ist ein Entwurf, und EIN
 * "Speichern" schickt alles zusammen weg.
 *
 * Die Tabelle beginnt mit EINER Zeile. Sobald die unterste Zeile Inhalt
 * bekommt, wächst automatisch eine leere darunter — es steht also immer genau
 * eine freie Zeile am Ende, ohne dass jemand "Zeile hinzufügen" drücken muss.
 *
 * Jedes Feld ist ein String und wird erst beim Speichern ausgewertet. Zeilen,
 * die der Server ablehnt, BLEIBEN stehen und tragen ihre Meldung; die
 * erfolgreichen verschwinden. Die Zuordnung läuft über den `index` innerhalb
 * der gefüllten Zeilen — genau wie beim Lager-Massenimport.
 *
 * ══ 11.09.2026 (Vorgabe Samet) ═══════════════════════════════════════════
 *
 * «Man soll nicht jedes Mal ‹Kunde› tippen müssen; dasselbe gilt für die
 * Schnellerfassung — es soll freiwillig sein, auf einen Kunden und eine
 * Offerte zu verweisen.»
 *
 * BEI AUFGABEN UND ERINNERUNGEN SIND DIE VERKNÜPFUNGSSPALTEN DARUM
 * ZUGEKLAPPT. Kunde, Ansprechpartner und Offerte standen vorher in jeder
 * Zeile und wollten ausgefüllt werden, obwohl die meisten Aufgaben an gar
 * keinem Kunden hängen — drei leere Zellen, an denen man bei jeder Zeile
 * vorbeitippt. Der Knopf «Verknüpfungen» im Kopf holt sie hervor, wenn man
 * sie braucht.
 *
 * BEI TELEFON UND NOTIZ BLEIBEN SIE STEHEN: dort IST der Kunde der Inhalt —
 * ein Anruf ohne Gegenüber ist keine Notiz wert.
 */

let rowSeed = 0;
const emptyRow = (): QuickEntryDraftRow => ({
    key: `quick-${(rowSeed += 1)}`,
    customerId: null,
    customerName: '',
    contactId: '',
    tender: null,
    note: '',
    title: '',
    // Verantwortliche werden bewusst NICHT vorbelegt.
    assignees: [],
    date: toDateInputValue(new Date()),
    time: '09:00',
    error: null,
});

/**
 * Hat die Zeile überhaupt Inhalt? Entscheidet, ob sie mitgeschickt wird und ob
 * unten eine neue leere Zeile nachwächst. Bewusst eine reine Funktion ausserhalb
 * der Komponente — als Methode im Rumpf entstünde sie bei jedem Render neu und
 * würde das `useMemo` der gefüllten Zeilen wertlos machen.
 */
const rowHasContent = (row: QuickEntryDraftRow, isCommunication: boolean) => (isCommunication
    ? Boolean(row.customerId || row.customerName.trim() || row.note.trim())
    : Boolean(row.title.trim() || row.customerId || row.customerName.trim() || row.assignees.length || row.tender));

export const QuickEntryBulkTable = ({
    action,
    onSaved,
}: {
    action: QuickEntryAction;
    onSaved?: (action: QuickEntryAction, created: number) => void;
}) => {
    const isCommunication = action === 'PHONE' || action === 'NOTE';
    const isReminder = action === 'REMINDER';

    const [rows, setRows] = useState<QuickEntryDraftRow[]>(() => [emptyRow()]);
    const [focusRowKey, setFocusRowKey] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);
    /* Kunde, Ansprechpartner und Offerte: bei Telefon und Notiz IMMER da (sie
       sind dort der Inhalt), bei Aufgaben und Erinnerungen erst auf Wunsch. */
    const [showLinks, setShowLinks] = useState(false);
    const linksOn = isCommunication || showLinks;

    /**
     * Eingabe übernehmen, Fehlermeldung der Zeile löschen und — falls die
     * unterste Zeile gerade Inhalt bekommen hat — eine leere anhängen.
     */
    const patchRow = (key: string, patch: Partial<QuickEntryDraftRow>) => {
        setRows((current) => {
            const next = current.map((row) => (row.key === key ? { ...row, ...patch, error: null } : row));
            const last = next[next.length - 1];
            return last && rowHasContent(last, isCommunication) ? [...next, emptyRow()] : next;
        });
    };

    const addRow = () => {
        const row = emptyRow();
        setRows((current) => [...current, row]);
        setFocusRowKey(row.key);
    };

    // Die Tabelle bleibt nie leer — sonst gäbe es nichts mehr zu tippen.
    const removeRow = (key: string) => {
        setRows((current) => {
            const next = current.filter((row) => row.key !== key);
            return next.length ? next : [emptyRow()];
        });
    };

    // Tippen löst die Bindung an den Kunden — der blosse Text zählt nicht.
    const onCustomerTyped = (key: string, text: string) =>
        patchRow(key, { customerName: text, customerId: null, contactId: '' });

    const onCustomerPicked = (key: string, customer: CrmCustomerOption) =>
        patchRow(key, { customerId: customer.id, customerName: customer.companyName, contactId: '' });

    /* Eine gewählte Offerte bringt ihren Kunden MIT (13.09.2026): steht in der
       Zeile noch keiner, trägt die Wahl ihn ein — dieselbe Hand wie im Fenster
       «Neue Aufgabe», damit niemand denselben Namen zweimal sucht. */
    const onTenderPicked = (key: string, row: QuickEntryDraftRow, next: TaskTenderPick | null) => {
        const adopt = next?.customerId && next.customerName && !row.customerId
            ? { customerId: next.customerId, customerName: next.customerName, contactId: '' }
            : {};
        patchRow(key, { tender: next, ...adopt });
    };

    const filledRows = useMemo(
        () => rows.filter((row) => rowHasContent(row, isCommunication)),
        [rows, isCommunication],
    );

    const save = async () => {
        if (!filledRows.length) return;
        try {
            setSaving(true);
            const result = isCommunication
                ? await crmApi.bulkCreateCommunications(filledRows.map((row) => ({
                    customerId: row.customerId || '',
                    contactId: row.contactId || null,
                    channel: action === 'PHONE' ? 'PHONE' : 'NOTE',
                    note: row.note.trim(),
                    occurredAt: dateInputToIso(row.date),
                })))
                : await crmApi.bulkCreateTasks(filledRows.map((row) => ({
                    title: row.title.trim(),
                    customerId: row.customerId || null,
                    contactId: row.customerId ? row.contactId || null : null,
                    tenderId: row.tender?.id || null,
                    assigneeEmployeeIds: row.assignees.map((person) => person.id),
                    // Erinnerungen läuten zur Minute, Aufgaben sind tagesgenau.
                    dueDate: (isReminder ? dateTimeToIso(row.date, row.time) : dateInputToIso(row.date)) || null,
                    kind: isReminder ? 'REMINDER' : 'TASK',
                })));

            if (result.errors.length) {
                // Nur die abgelehnten Zeilen bleiben stehen — mit ihrer Meldung.
                const errorByIndex = new Map(result.errors.map((entry) => [entry.index, entry.error]));
                setRows(() => {
                    const kept = filledRows
                        .map((row, index) => ({ row, index }))
                        .filter(({ index }) => errorByIndex.has(index))
                        .map(({ row, index }) => ({ ...row, error: errorByIndex.get(index) ?? null }));
                    return [...(kept.length ? kept : []), emptyRow()];
                });
                toast.warning(t('crm.quick.partialResult', {
                    created: result.createdCount,
                    failed: result.errors.length,
                }));
            } else {
                setRows([emptyRow()]);
                toast.success(t('crm.quick.savedCount', { count: result.createdCount }));
            }
            onSaved?.(action, result.createdCount);
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('crm.quick.saveError'));
        } finally {
            setSaving(false);
        }
    };

    // Die Erinnerung heisst Erinnerung — nicht Aufgabe.
    const subjectLabel = isReminder ? t('crm.quick.reminderField') : t('crm.quick.titleField');
    const dateLabel = isReminder ? t('crm.quick.reminderDate') : t('crm.quick.dueDate');

    return (
        <SectionCard
            title={t('crm.quick.bulkTitle')}
            action={isCommunication ? undefined : (
                <button
                    type="button"
                    onClick={() => setShowLinks((value) => !value)}
                    aria-pressed={showLinks}
                    className={`inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[12px] font-semibold transition-colors ${showLinks
                        ? 'border-[#272f67]/25 bg-[#272f67]/[0.08] text-[#272f67] dark:border-[#e6cf9e]/30 dark:bg-[#e6cf9e]/10 dark:text-[#e6cf9e]'
                        : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-white/12 dark:bg-transparent dark:text-white/70'}`}
                >
                    <Link02 size={13} />
                    {t('crm.quick.toggleLinks')}
                </button>
            )}
        >
            <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                {/* Die Textspalte (Notiz bzw. Betreff) hat KEINE Breite: sie
                    nimmt den restlichen Platz auf. */}
                <colgroup>
                    {isCommunication ? (
                        <>
                            <col style={{ width: 240 }} />
                            <col style={{ width: 190 }} />
                            <col />
                            <col style={{ width: 150 }} />
                        </>
                    ) : (
                        <>
                            <col />
                            {linksOn && <col style={{ width: 200 }} />}
                            {linksOn && <col style={{ width: 160 }} />}
                            {linksOn && <col style={{ width: 150 }} />}
                            <col style={{ width: 180 }} />
                            <col style={{ width: 150 }} />
                            {/* Uhrzeit GROSS (Vorgabe 15.08.2026): breite Spalte, hohes
                                Feld — die Erinnerungsspalte ist die dehnbare und gibt
                                den Platz her. */}
                            {isReminder && <col style={{ width: 150 }} />}
                        </>
                    )}
                    <col style={{ width: 48 }} />
                </colgroup>
                <thead>
                    <tr>
                        {isCommunication ? (
                            <>
                                <th className="text-left">{t('crm.quick.customer')}</th>
                                <th className="text-left">{t('crm.quick.contact')}</th>
                                <th className="text-left">{t('crm.quick.note')}</th>
                                <th className="text-left">{t('crm.quick.date')}</th>
                            </>
                        ) : (
                            <>
                                <th className="text-left">{subjectLabel}</th>
                                {linksOn && <th className="text-left">{t('crm.quick.customer')}</th>}
                                {linksOn && <th className="text-left">{t('crm.quick.contact')}</th>}
                                {linksOn && <th className="text-left">{t('crm.tasks.colQuote')}</th>}
                                <th className="text-left">{t('crm.quick.assignee')}</th>
                                <th className="text-left">{dateLabel}</th>
                                {isReminder && <th className="text-left">{t('crm.quick.time')}</th>}
                            </>
                        )}
                        <th />
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.key} className={row.error ? 'bg-red-50/60 dark:bg-red-500/10' : undefined}>
                            {isCommunication ? (
                                <>
                                    <td>
                                        <CustomerComboCell
                                            value={row.customerName}
                                            linked={Boolean(row.customerId)}
                                            onChange={(next) => onCustomerTyped(row.key, next)}
                                            onPick={(customer) => onCustomerPicked(row.key, customer)}
                                            autoFocus={row.key === focusRowKey}
                                        />
                                        {row.error && (
                                            <span className="mt-0.5 block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                        )}
                                    </td>
                                    <td>
                                        <ContactCell
                                            customerId={row.customerId}
                                            value={row.contactId}
                                            onChange={(next) => patchRow(row.key, { contactId: next })}
                                        />
                                    </td>
                                    <td>
                                        <input
                                            value={row.note}
                                            onChange={(event) => patchRow(row.key, { note: event.target.value })}
                                            className={CELL_INPUT_CLASS}
                                        />
                                    </td>
                                    <td>
                                        <QuoteDatePicker
                                            ariaLabel={t('crm.quick.date')}
                                            value={row.date}
                                            onChange={(next) => patchRow(row.key, { date: next })}
                                        />
                                    </td>
                                </>
                            ) : (
                                <>
                                    <td>
                                        <input
                                            value={row.title}
                                            onChange={(event) => patchRow(row.key, { title: event.target.value })}
                                            className={CELL_INPUT_CLASS}
                                            aria-label={subjectLabel}
                                            autoFocus={row.key === focusRowKey}
                                        />
                                        {row.error && (
                                            <span className="mt-0.5 block text-[10.5px] font-semibold text-red-500">{row.error}</span>
                                        )}
                                    </td>
                                    {linksOn && (
                                        <td>
                                            <CustomerComboCell
                                                value={row.customerName}
                                                // Der Kunde ist hier freiwillig: eine leere Zelle
                                                // darf nicht als "falsch" markiert werden.
                                                linked={Boolean(row.customerId) || !row.customerName.trim()}
                                                onChange={(next) => onCustomerTyped(row.key, next)}
                                                onPick={(customer) => onCustomerPicked(row.key, customer)}
                                            />
                                        </td>
                                    )}
                                    {linksOn && (
                                        <td>
                                            {/* Die Kundenwahl schliesst den Ansprechpartner ein —
                                                auch bei Aufgaben und Erinnerungen. */}
                                            <ContactCell
                                                customerId={row.customerId}
                                                value={row.contactId}
                                                onChange={(next) => patchRow(row.key, { contactId: next })}
                                            />
                                        </td>
                                    )}
                                    {linksOn && (
                                        <td>
                                            {/* Ist ein Kunde gewählt, zeigt das Feld nur SEINE
                                                Offerten — das ist der häufige Fall. */}
                                            <TaskTenderCombo
                                                value={row.tender}
                                                onChange={(next) => onTenderPicked(row.key, row, next)}
                                                customerId={row.customerId}
                                            />
                                        </td>
                                    )}
                                    <td>
                                        <StaffMultiCombo
                                            value={row.assignees}
                                            onChange={(next) => patchRow(row.key, { assignees: next })}
                                            compact
                                        />
                                    </td>
                                    <td>
                                        <QuoteDatePicker
                                            ariaLabel={dateLabel}
                                            value={row.date}
                                            onChange={(next) => patchRow(row.key, { date: next })}
                                        />
                                    </td>
                                    {isReminder && (
                                        <td>
                                            <input
                                                type="time"
                                                value={row.time}
                                                onChange={(event) => patchRow(row.key, { time: event.target.value })}
                                                aria-label={t('crm.quick.time')}
                                                className={`${CELL_INPUT_CLASS} !h-10 !text-[16px] font-semibold tabular-nums`}
                                            />
                                        </td>
                                    )}
                                </>
                            )}
                            <td className="text-center">
                                <button
                                    type="button"
                                    onClick={() => removeRow(row.key)}
                                    aria-label={t('common.delete')}
                                    className="rounded p-1 text-slate-300 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10"
                                >
                                    <Trash size={13} />
                                </button>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 p-3 dark:border-white/10">
                <button
                    type="button"
                    onClick={addRow}
                    className="flex items-center gap-1.5 rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[12px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/60"
                >
                    <Plus size={12} />
                    {t('crm.quick.addRow')}
                </button>
                <Button
                    variant="primary"
                    loading={saving}
                    disabled={!filledRows.length}
                    icon={<Save size={13} />}
                    onClick={() => void save()}
                >
                    {t('crm.quick.saveCount', { count: filledRows.length })}
                </Button>
            </div>
        </SectionCard>
    );
};
