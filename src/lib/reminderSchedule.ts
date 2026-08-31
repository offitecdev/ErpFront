/**
 * Spiegel von Erp_Backend/src/shared/reminderSchedule.ts (dort ist die
 * Autorität) — nur die Rechnung, die die Einstellungsseite für die Vorschau
 * braucht. Beide müssen gleich bleiben.
 */

export const MAX_LEAD_DAYS = 30;
export const MAX_INTERVAL_DAYS = 30;

export const clampReminderSetting = (input: { leadDays: unknown; intervalDays: unknown }) => {
    const lead = Math.trunc(Number(input.leadDays));
    const interval = Math.trunc(Number(input.intervalDays));
    return {
        leadDays: Number.isFinite(lead) ? Math.min(MAX_LEAD_DAYS, Math.max(0, lead)) : 0,
        intervalDays: Number.isFinite(interval) ? Math.min(MAX_INTERVAL_DAYS, Math.max(1, interval)) : 1,
    };
};

/** Alle Schritte des Fahrplans als "Tage vor dem Bezug", absteigend — endet mit 0. */
export const reminderStepsBefore = (leadDays: number, intervalDays: number): number[] => {
    const { leadDays: lead, intervalDays: interval } = clampReminderSetting({ leadDays, intervalDays });
    const steps: number[] = [];
    for (let before = lead; before > 0; before -= interval) steps.push(before);
    steps.push(0);
    return steps;
};
