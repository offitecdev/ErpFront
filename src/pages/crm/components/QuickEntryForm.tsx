import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { toast } from 'sonner';
import {
    Bell01 as Bell,
    Check as CheckIcon,
    Edit01 as NoteIcon,
    Mail01 as MailIcon,
    Phone,
    Save01 as Save,
    Users01 as MeetingIcon,
} from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { inputClass } from '@/components/ui-shared/Field';
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';
import { CustomerContactCombo } from './CustomerContactCombo';
import { StaffMultiCombo } from './StaffMultiCombo';
import { COMMUNICATION_CHANNELS, channelLabel, dateInputToIso, dateTimeToIso, toDateInputValue } from '../utils/crmFormat.utils';
import type { CommunicationChannel, CrmContactOption, CrmCustomerOption } from '../types/crm.types';

/**
 * Das Formular EINER Schnellerfassung — Interaktion (Telefonat, E-Mail,
 * Besprechung, Notiz), Aufgabe oder Erinnerung.
 *
 * Bewusst nur der Rumpf, ohne eigenen Rahmen: die Listenseiten hängen es über
 * QuickEntrySheet in ein Fenster; die Schnellerfassungs-Seite erfasst
 * zeilenweise (QuickEntryBulkTable). So gibt es die Felder und ihre Prüfungen
 * genau einmal.
 *
 * Aufbau (Vorgabe 15.08.2026, "sauber und modern"): eine Spalte, Beschriftung
 * über dem Feld, reine Eingabefelder (kein antd).
 *
 *  • Kunde und Ansprechpartner sind TIPPFELDER mit Vorschlagsliste — dieselbe
 *    Bedienung wie die Produktzelle im Lager (CustomerContactCombo); "Alle
 *    Kunden …" öffnet die grosse Auswahl.
 *  • Betreff und Notiz nehmen ZEILENUMBRÜCHE (mehrzeilige Felder).
 *  • Bei Erinnerungen steht die Uhrzeit GROSS neben dem Datum: sie ist das,
 *    was eine Erinnerung ausmacht.
 *  • Das Datum läuft über den QuoteDatePicker — dasselbe Kalenderfenster wie
 *    im Angebot (DD.MM.YYYY, in der Sprache der Oberfläche, dunkelmodusfähig).
 */

export type QuickEntryAction = 'PHONE' | 'NOTE' | 'TASK' | 'REMINDER';

export const QUICK_ENTRY_ACTIONS: Array<{
    action: QuickEntryAction;
    /** Kurzschlüssel in der Adresszeile (?action=…). */
    param: string;
    labelKey: string;
    hintKey: string;
    Icon: typeof Phone;
}> = [
    { action: 'PHONE', param: 'call', labelKey: 'crm.quick.actionPhone', hintKey: 'crm.quick.hintPhone', Icon: Phone },
    { action: 'NOTE', param: 'note', labelKey: 'crm.quick.actionNote', hintKey: 'crm.quick.hintNote', Icon: NoteIcon },
    { action: 'TASK', param: 'task', labelKey: 'crm.quick.actionTask', hintKey: 'crm.quick.hintTask', Icon: CheckIcon },
    { action: 'REMINDER', param: 'reminder', labelKey: 'crm.quick.actionReminder', hintKey: 'crm.quick.hintReminder', Icon: Bell },
];

export const quickEntryActionLabel = (action: QuickEntryAction): string =>
    t(QUICK_ENTRY_ACTIONS.find((entry) => entry.action === action)?.labelKey ?? 'crm.quick.title');

const CHANNEL_ICONS: Record<CommunicationChannel, typeof Phone> = {
    PHONE: Phone,
    EMAIL: MailIcon,
    MEETING: MeetingIcon,
    NOTE: NoteIcon,
};

/** Rundes Standardmass der Uhrzeit einer neuen Erinnerung. */
const DEFAULT_REMINDER_TIME = '09:00';

const LABEL_CLASS = 'text-[12px] font-semibold text-slate-600 dark:text-white/70';

const FormField = ({ label, required, children, className = '' }: { label: string; required?: boolean; children: ReactNode; className?: string }) => (
    <label className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
        <span className={LABEL_CLASS}>
            {label}
            {required && <span className="ml-0.5 text-red-500">*</span>}
        </span>
        {children}
    </label>
);

export const QuickEntryForm = ({
    action,
    resetToken,
    onSaved,
    onCancel,
    footerStart,
    z = 130,
}: {
    action: QuickEntryAction;
    /** Ändert sich der Wert, beginnt das Formular leer (neues Öffnen / Reiterwechsel). */
    resetToken?: unknown;
    onSaved?: (action: QuickEntryAction) => void;
    /** Gesetzt = das Formular zeigt einen Abbrechen-Knopf (Fenster-Fassung). */
    onCancel?: () => void;
    /** Frei belegbare linke Seite der Knopfzeile (z. B. Verweis auf die Liste). */
    footerStart?: ReactNode;
    /** Stapelhöhe des umgebenden Fensters — die Kundenwahl öffnet darüber. */
    z?: number;
}) => {
    const [saving, setSaving] = useState(false);

    const [channel, setChannel] = useState<CommunicationChannel>(action === 'NOTE' ? 'NOTE' : 'PHONE');
    const [customer, setCustomer] = useState<CrmCustomerOption | null>(null);
    const [contact, setContact] = useState<CrmContactOption | null>(null);
    const [note, setNote] = useState('');
    const [title, setTitle] = useState('');
    const [date, setDate] = useState(() => toDateInputValue(new Date()));
    const [time, setTime] = useState(DEFAULT_REMINDER_TIME);
    // Verantwortliche: MEHRERE Personen (18.08.2026) — Chips über dem Tippfeld.
    const [assignees, setAssignees] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);

    const isCommunication = action === 'PHONE' || action === 'NOTE';
    const isReminder = action === 'REMINDER';

    // Reiterwechsel bzw. erneutes Öffnen beginnt mit leeren Feldern.
    useEffect(() => {
        setChannel(action === 'NOTE' ? 'NOTE' : 'PHONE');
        setCustomer(null);
        setContact(null);
        setNote('');
        setTitle('');
        setDate(toDateInputValue(new Date()));
        setTime(DEFAULT_REMINDER_TIME);
        // Verantwortliche werden bewusst NICHT vorbelegt — sie werden gewählt.
        setAssignees([]);
    }, [action, resetToken]);

    const save = async () => {
        if (isCommunication) {
            if (!customer) { toast.error(t('crm.quick.customerRequired')); return; }
            if (!note.trim()) { toast.error(t('crm.quick.noteRequired')); return; }
        } else if (!title.trim()) {
            toast.error(t('crm.quick.titleRequired'));
            return;
        }
        try {
            setSaving(true);
            if (isCommunication) {
                await crmApi.createCommunication({
                    customerId: customer!.id,
                    contactId: contact?.id || null,
                    channel,
                    note: note.trim(),
                    occurredAt: dateInputToIso(date),
                });
            } else {
                await crmApi.createTask({
                    title: title.trim(),
                    customerId: customer?.id || null,
                    contactId: customer ? contact?.id || null : null,
                    assigneeEmployeeIds: assignees.map((person) => person.id),
                    // Erinnerungen läuten zur Minute, Aufgaben sind tagesgenau.
                    dueDate: (isReminder ? dateTimeToIso(date, time) : dateInputToIso(date)) || null,
                    kind: isReminder ? 'REMINDER' : 'TASK',
                });
            }
            // Kein Erfolgs-Hinweis: das Fenster schliesst sich, die Zeile steht in der Liste.
            onSaved?.(action);
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('crm.quick.saveError'));
        } finally {
            setSaving(false);
        }
    };

    const customerField = (
        <FormField label={t('crm.quick.customerWithContact')} required={isCommunication}>
            <CustomerContactCombo
                customer={customer}
                contact={contact}
                required={isCommunication}
                z={z + 10}
                onChange={(nextCustomer, nextContact) => { setCustomer(nextCustomer); setContact(nextContact); }}
            />
        </FormField>
    );

    return (
        <div className="flex w-full flex-col gap-4">
            {isCommunication ? (
                <>
                    {/* Typ der Interaktion — jede Zeile des Verlaufs trägt ihn. */}
                    <div className="flex flex-col gap-1.5">
                        <span className={LABEL_CLASS}>{t('crm.comm.colType')}</span>
                        <div className="grid grid-cols-4 gap-1.5" role="radiogroup" aria-label={t('crm.comm.colType')}>
                            {COMMUNICATION_CHANNELS.map((option) => {
                                const Icon = CHANNEL_ICONS[option];
                                const active = option === channel;
                                return (
                                    <button
                                        key={option}
                                        type="button"
                                        role="radio"
                                        aria-checked={active}
                                        onClick={() => setChannel(option)}
                                        className={`flex h-10 items-center justify-center gap-1.5 rounded-lg border text-[12.5px] font-semibold transition-colors ${active
                                            ? 'border-[#1f2654] bg-[#eef2fb] text-[#1f2654] dark:border-sky-400 dark:bg-sky-500/15 dark:text-sky-200'
                                            : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:text-slate-800 dark:border-white/15 dark:text-white/60 dark:hover:text-white'}`}
                                    >
                                        <Icon size={13} />
                                        <span className="truncate">{channelLabel(option)}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                    {customerField}
                    <FormField label={t('crm.quick.note')} required>
                        <textarea
                            value={note}
                            onChange={(event) => setNote(event.target.value)}
                            rows={4}
                            className={`${inputClass} resize-y px-3 py-2 text-sm`}
                        />
                    </FormField>
                    <FormField label={t('crm.quick.date')}>
                        <QuoteDatePicker ariaLabel={t('crm.quick.date')} value={date} onChange={setDate} className="h-10 rounded-lg text-sm" />
                    </FormField>
                </>
            ) : (
                <>
                    {/* Mehrzeilig: eine Aufgabe darf mehr als eine Zeile sein
                        (Vorgabe 15.08.2026). Enter macht einen Umbruch. */}
                    <FormField label={isReminder ? t('crm.quick.reminderField') : t('crm.quick.titleField')} required>
                        <textarea
                            autoFocus
                            value={title}
                            onChange={(event) => setTitle(event.target.value)}
                            rows={2}
                            className={`${inputClass} resize-y px-3 py-2 text-sm`}
                            placeholder={isReminder ? t('crm.quick.reminderPlaceholder') : t('crm.quick.titlePlaceholder')}
                        />
                    </FormField>
                    {customerField}
                    <div className="flex min-w-0 flex-col gap-1.5">
                        <span className={LABEL_CLASS}>{t('crm.quick.assignees')}</span>
                        <StaffMultiCombo value={assignees} onChange={setAssignees} z={z + 10} />
                    </div>
                    {isReminder ? (
                        /* Datum + GROSSE Uhrzeit nebeneinander: die Uhrzeit bekommt
                           den breiten, hohen Kasten — sie ist der Kern der Erinnerung. */
                        <div className="grid grid-cols-[minmax(0,1fr)_11rem] gap-3">
                            <FormField label={t('crm.quick.reminderDate')}>
                                <QuoteDatePicker ariaLabel={t('crm.quick.reminderDate')} value={date} onChange={setDate} className="h-12 rounded-lg text-sm" />
                            </FormField>
                            <FormField label={t('crm.quick.time')}>
                                {/* Kein eigenes Uhr-Symbol: das Zeitfeld bringt sein
                                    eigenes mit — zwei Uhren nebeneinander sähen aus
                                    wie ein Fehler. */}
                                <input
                                    type="time"
                                    value={time}
                                    onChange={(event) => setTime(event.target.value)}
                                    aria-label={t('crm.quick.time')}
                                    className={`${inputClass} h-12 w-full px-3 text-[18px] font-semibold tabular-nums`}
                                />
                            </FormField>
                        </div>
                    ) : (
                        <FormField label={t('crm.quick.dueDate')}>
                            <QuoteDatePicker ariaLabel={t('crm.quick.dueDate')} value={date} onChange={setDate} className="h-10 rounded-lg text-sm" />
                        </FormField>
                    )}
                </>
            )}

            {/* Die Knopfzeile gehört zum Formular: so kennt der Speichern-Knopf
                die Feldwerte direkt, statt sie über den Rahmen zu reichen. */}
            <div className="flex items-center justify-between gap-3 border-t border-slate-200 pt-4 dark:border-white/10">
                <div className="min-w-0">{footerStart}</div>
                <div className="flex shrink-0 gap-2">
                    {onCancel && (
                        <button
                            type="button"
                            onClick={onCancel}
                            className="h-10 rounded-lg border border-slate-200 px-4 text-[13px] font-semibold text-slate-600 transition-colors hover:bg-slate-50 dark:border-white/15 dark:text-white/70 dark:hover:bg-white/10"
                        >
                            {t('common.cancel')}
                        </button>
                    )}
                    <button
                        type="button"
                        disabled={saving}
                        onClick={() => void save()}
                        className="ofi-btn-brand inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#272f67] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:opacity-60"
                    >
                        <Save size={13} />
                        {saving ? t('common.loading') : t('common.save')}
                    </button>
                </div>
            </div>
        </div>
    );
};
