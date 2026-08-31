import { t } from '@/i18n/translate';
import type { Variant } from '@/components/ui-shared/StatusBadge';
import type { CommunicationChannel, CrmTaskRow, CrmTaskStatus, InteractionType } from '../types/crm.types';

/**
 * Anzeige-Helfer des CRM-Moduls: Datumsformate, Kanal- und Statusbeschriftungen.
 * Alle Beschriftungen laufen über i18n — im Modul steht kein fester Text.
 */

/** Schweizer Kurzformat (14.08.2026); leere Werte werden zum Gedankenstrich. */
export const formatCrmDate = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('de-CH');
};

/** Datum + Uhrzeit für Verlaufszeilen (14.08.2026, 09:15). */
export const formatCrmDateTime = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '—';
    return `${date.toLocaleDateString('de-CH')}, ${date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' })}`;
};

/** <input type="date"> erwartet YYYY-MM-DD in Ortszeit. */
export const toDateInputValue = (value?: string | Date | null): string => {
    if (!value) return '';
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

/**
 * Kalendertag → ISO. Mittag statt Mitternacht, damit die Umrechnung in UTC den
 * Tag nicht auf den Vortag zieht.
 */
export const dateInputToIso = (value: string): string | undefined =>
    value ? new Date(`${value}T12:00:00`).toISOString() : undefined;

/**
 * Kalendertag + Uhrzeit (HH:MM) → ISO. Erinnerungen läuten zur Minute, also
 * zählt hier im Gegensatz zu `dateInputToIso` die echte Uhrzeit. Fehlt die
 * Zeit, gilt der Tagesbeginn.
 */
export const dateTimeToIso = (date: string, time: string): string | undefined => {
    if (!date) return undefined;
    const parsed = new Date(`${date}T${time || '00:00'}:00`);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
};

/** Datum + Uhrzeit für die Anzeige (14.08.2026, 09:15). */
export const formatCrmTime = (value?: string | null): string => {
    if (!value) return '—';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? '—'
        : date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
};

export const COMMUNICATION_CHANNELS: CommunicationChannel[] = ['PHONE', 'EMAIL', 'MEETING', 'NOTE'];
/** Typen des Interaktionsverlaufs — die vier Kanäle plus Besuch vor Ort. */
export const INTERACTION_TYPES: InteractionType[] = ['PHONE', 'EMAIL', 'MEETING', 'NOTE', 'VISIT'];

const INTERACTION_LABEL_KEYS: Record<InteractionType, string> = {
    PHONE: 'crm.comm.channelPhone',
    EMAIL: 'crm.comm.channelEmail',
    MEETING: 'crm.comm.channelMeeting',
    NOTE: 'crm.comm.channelNote',
    VISIT: 'crm.comm.channelVisit',
};

const INTERACTION_VARIANTS: Record<InteractionType, Variant> = {
    PHONE: 'info',
    EMAIL: 'approved',
    MEETING: 'warning',
    NOTE: 'neutral',
    VISIT: 'order',
};

export const channelLabel = (channel: InteractionType): string => t(INTERACTION_LABEL_KEYS[channel] ?? 'crm.comm.channelNote');
export const channelVariant = (channel: InteractionType): Variant => INTERACTION_VARIANTS[channel] ?? 'neutral';

const TASK_STATUS_LABEL_KEYS: Record<CrmTaskStatus, string> = {
    OPEN: 'crm.tasks.statusOpen',
    DONE: 'crm.tasks.statusDone',
    INCOMPLETE: 'crm.tasks.statusIncomplete',
};

const TASK_STATUS_VARIANTS: Record<CrmTaskStatus, Variant> = {
    OPEN: 'warning',
    DONE: 'active',
    INCOMPLETE: 'danger',
};

export const taskStatusLabel = (status: CrmTaskStatus): string => t(TASK_STATUS_LABEL_KEYS[status] ?? 'crm.tasks.statusOpen');
export const taskStatusVariant = (status: CrmTaskStatus): Variant => TASK_STATUS_VARIANTS[status] ?? 'warning';

/** Beginn des heutigen Tages (Ortszeit) — Vergleichspunkt für "verstrichen". */
const startOfToday = (): Date => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return today;
};

/** Offene Aufgabe, deren Fälligkeit vor heute liegt — in der Liste hervorgehoben. */
export const isTaskOverdue = (task: Pick<CrmTaskRow, 'status' | 'dueDate'>): boolean => {
    if (task.status === 'DONE' || !task.dueDate) return false;
    const due = new Date(task.dueDate);
    if (Number.isNaN(due.getTime())) return false;
    return due < startOfToday();
};

/**
 * Zustand einer Erinnerung, wie ihn die Erinnerungsliste zeigt:
 *   • EXPIRED  — Angebots-Erinnerung, deren Angebot abgelaufen ist (gültig bis
 *                liegt vor heute); der Hintergrunddienst räumt sie beim
 *                nächsten Takt weg, bis dahin sagt es die Liste selbst.
 *   • DUE      — der Zeitpunkt ist erreicht (sie hat geläutet oder läutet gleich).
 *   • UPCOMING — liegt noch vor uns.
 */
export type ReminderState = 'EXPIRED' | 'DUE' | 'UPCOMING';

export const reminderState = (task: Pick<CrmTaskRow, 'dueDate' | 'meta' | 'entityType'>): ReminderState => {
    const meta = task.meta as { template?: string; referenceDate?: string } | null | undefined;
    if ((task.entityType === 'QUOTE' || meta?.template === 'QUOTE_EXPIRY') && meta?.referenceDate) {
        const reference = new Date(meta.referenceDate);
        if (!Number.isNaN(reference.getTime()) && reference < startOfToday()) return 'EXPIRED';
    }
    if (!task.dueDate) return 'DUE';
    const due = new Date(task.dueDate);
    return Number.isNaN(due.getTime()) || due <= new Date() ? 'DUE' : 'UPCOMING';
};

const REMINDER_STATE_LABEL_KEYS: Record<ReminderState, string> = {
    EXPIRED: 'crm.reminders.stateExpired',
    DUE: 'crm.reminders.stateDue',
    UPCOMING: 'crm.reminders.stateUpcoming',
};

const REMINDER_STATE_VARIANTS: Record<ReminderState, Variant> = {
    EXPIRED: 'danger',
    DUE: 'warning',
    UPCOMING: 'info',
};

export const reminderStateLabel = (state: ReminderState): string => t(REMINDER_STATE_LABEL_KEYS[state]);
export const reminderStateVariant = (state: ReminderState): Variant => REMINDER_STATE_VARIANTS[state];

/** "Hans Müller" aus den Namensteilen; leere Teile fallen weg. */
export const personName = (person?: { firstName?: string | null; lastName?: string | null } | null): string =>
    person ? [person.firstName, person.lastName].filter(Boolean).join(' ').trim() : '';
