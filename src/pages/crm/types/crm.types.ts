import type {
    CommunicationChannel,
    CrmCommunicationRow,
    CrmContactRow,
    CrmInteractionRow,
    CrmPersonLite,
    CrmTaskKind,
    CrmTaskRow,
    CrmTaskStatus,
    InteractionSource,
    InteractionType,
} from '@/lib/api/crm';

/**
 * Typen des CRM-Moduls. Die Zeilenformen kommen aus der API-Schicht
 * (`lib/api/crm.ts`) und werden hier NUR weitergereicht — so importieren die
 * Seiten einen einzigen Ort, und die Serverform bleibt trotzdem die Quelle.
 */

export type {
    CommunicationChannel,
    CrmCommunicationRow,
    CrmContactRow,
    CrmInteractionRow,
    CrmPersonLite,
    CrmTaskKind,
    CrmTaskRow,
    CrmTaskStatus,
    InteractionSource,
    InteractionType,
};

/**
 * Kunde in der Kurzform, die alle CRM-Auswahlfelder benutzen. `responsibleName`
 * ist der Ansprechpartner der Kundenliste (Customer.responsible*) — reine
 * Anzeige im Auswahlfenster, wie die Spalte "Ansprechpartner" der Kundenliste.
 */
export interface CrmCustomerOption {
    id: string;
    companyName: string;
    responsibleName?: string | null;
}

/** Ansprechpartner in der Kurzform der Auswahl (CustomerContact). */
export interface CrmContactOption {
    id: string;
    firstName: string;
    lastName: string;
}

/**
 * Ergebnis der Kundenwahl: der Kunde und — wenn gewählt — sein
 * Ansprechpartner. Die Auswahl schliesst den Ansprechpartner mit ein
 * (Vorgabe 15.08.2026), wie in der Kundenakte.
 */
export interface CrmCustomerPick {
    customer: CrmCustomerOption;
    contact: CrmContactOption | null;
}

/** Die vier Schnellerfassungen. */
export type QuickEntryAction = 'PHONE' | 'NOTE' | 'TASK' | 'REMINDER';

/**
 * Eine Entwurfszeile der Massenerfassung. Alle Eingabefelder sind Strings und
 * werden erst beim Speichern ausgewertet — dieselbe Regel wie bei den
 * Entwurfszeilen im Lagermodul. `key` ist eine reine Client-Kennung, `error`
 * trägt die Meldung des Servers für genau diese Zeile.
 *
 * Die Zeile deckt beide Formen ab: `note` gilt für Anruf/Notiz, `title` und
 * `assigneeId` für Aufgabe/Erinnerung, `date` für beide, `contactId` für alle.
 */
export interface QuickEntryDraftRow {
    key: string;
    /** Gesetzt = die Zeile ist an einen echten Kunden gebunden. */
    customerId: string | null;
    customerName: string;
    contactId: string;
    note: string;
    title: string;
    /** Verantwortliche — mehrere Personen (18.08.2026). */
    assignees: Array<{ id: string; firstName: string; lastName: string }>;
    date: string;
    /** HH:MM — nur Erinnerungen läuten zur Minute. */
    time: string;
    error?: string | null;
}

/** Filterzustand des Interaktionsverlaufs (Kunde | Datum | Typ | Mitarbeiter). */
export interface CommunicationFilterState {
    customerId: string;
    type: InteractionType | '';
    employeeId: string;
    from: string;
    to: string;
}

export const EMPTY_COMMUNICATION_FILTER: CommunicationFilterState = {
    customerId: '',
    type: '',
    employeeId: '',
    from: '',
    to: '',
};

/** Filterzustand der Aufgabenliste. */
export interface TaskFilterState {
    status: CrmTaskStatus | '';
    customerId: string;
    assigneeId: string;
}

export const EMPTY_TASK_FILTER: TaskFilterState = {
    status: 'OPEN',
    customerId: '',
    assigneeId: '',
};

/** Filterzustand der Erinnerungsliste — Erinnerungen sind offen, bis sie geschlossen (= gelöscht) werden. */
export interface ReminderFilterState {
    customerId: string;
    assigneeId: string;
}

export const EMPTY_REMINDER_FILTER: ReminderFilterState = {
    customerId: '',
    assigneeId: '',
};
