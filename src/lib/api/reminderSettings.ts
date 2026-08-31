import { apiClient, getShared } from '../axios';

/* Erinnerungs-Einstellungen (Einstellungen → Module → Verkauf): je Belegart
   GENAU EINE Einstellung — an/aus, Vorlauf (Tage vor dem Bezugsdatum) und
   Wiederholung (alle N Tage). QUOTE = Angebot (Bezug: gültig bis),
   ORDER = Auftrag (Bezug: Liefertermin). */

export type ReminderEntityType = 'QUOTE' | 'ORDER';

export interface ReminderSetting {
    entityType: ReminderEntityType;
    enabled: boolean;
    leadDays: number;
    intervalDays: number;
}

export const reminderSettingsApi = {
    list: () => getShared<ReminderSetting[]>('/settings/reminder-settings').then((r) => r.data),

    /** Legt an oder überschreibt die übergebenen Belegarten; Antwort = gespeicherter Stand. */
    save: (settings: ReminderSetting[]) =>
        apiClient.put<ReminderSetting[]>('/settings/reminder-settings', { settings }).then((r) => r.data),
};
