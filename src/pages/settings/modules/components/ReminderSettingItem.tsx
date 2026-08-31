import { t } from '@/i18n/translate';
import type { ReminderEntityType } from '@/lib/api/reminderSettings';
import { MAX_INTERVAL_DAYS, MAX_LEAD_DAYS, clampReminderSetting, reminderStepsBefore } from '@/lib/reminderSchedule';
import { Switch } from '@/components/ui-shared/Switch';

/**
 * EINE Erinnerungs-Einstellung als Text-Zeile (keine Tabelle):
 *
 *   [Schalter] Angebote — Bezug: Ablaufdatum
 *              Vorlauf       [ 10 ]  → 10 Tage vor dem Ablaufdatum
 *              Wiederholung  [  3 ]  → danach alle 3 Tage
 *              Fahrplan: erinnert 10, 7, 4 und 1 Tage vorher sowie am Ablauftag.
 *
 * Neben jeder Zahl steht SOFORT, was sie bedeutet (Vorgabe: "10 eingeben →
 * '10 Tage' daneben"); der Fahrplan darunter rechnet mit derselben Formel wie
 * der Server (lib/reminderSchedule.ts).
 */

export interface ReminderDraft {
    enabled: boolean;
    /** Eingaben bleiben Text bis zum Speichern — sonst springt das Feld beim Tippen. */
    leadDays: string;
    intervalDays: string;
}

const KEYS: Record<ReminderEntityType, { title: string; reference: string; leadEcho: string; leadEchoOne: string; leadEchoZero: string; schedule: string; scheduleOnlyDay: string }> = {
    QUOTE: {
        title: 'settings.reminders.quotes',
        reference: 'settings.reminders.quoteReference',
        leadEcho: 'settings.reminders.quoteLeadEcho',
        leadEchoOne: 'settings.reminders.quoteLeadEchoOne',
        leadEchoZero: 'settings.reminders.quoteLeadEchoZero',
        schedule: 'settings.reminders.quoteSchedule',
        scheduleOnlyDay: 'settings.reminders.quoteScheduleOnlyDay',
    },
    ORDER: {
        title: 'settings.reminders.orders',
        reference: 'settings.reminders.orderReference',
        leadEcho: 'settings.reminders.orderLeadEcho',
        leadEchoOne: 'settings.reminders.orderLeadEchoOne',
        leadEchoZero: 'settings.reminders.orderLeadEchoZero',
        schedule: 'settings.reminders.orderSchedule',
        scheduleOnlyDay: 'settings.reminders.orderScheduleOnlyDay',
    },
};

const NUMBER_INPUT_CLASS =
    'w-16 rounded-md border border-slate-200 bg-white px-2 py-1 text-right font-mono text-[13px] tabular-nums text-slate-900 outline-none transition-colors focus:border-[#1f2654] focus:ring-2 focus:ring-[#1f2654]/15 dark:border-white/20 dark:bg-transparent dark:text-white';

/** "10, 7, 4 und 1" — Aufzählung mit dem sprachrichtigen "und". */
const joinDays = (days: number[]): string => {
    if (days.length <= 1) return days.join('');
    return `${days.slice(0, -1).join(', ')} ${t('settings.reminders.and')} ${days[days.length - 1]}`;
};

export const ReminderSettingItem = ({
    entityType,
    draft,
    onChange,
}: {
    entityType: ReminderEntityType;
    draft: ReminderDraft;
    onChange: (next: ReminderDraft) => void;
}) => {
    const keys = KEYS[entityType];
    const { leadDays, intervalDays } = clampReminderSetting({ leadDays: draft.leadDays, intervalDays: draft.intervalDays });
    const stepsBefore = reminderStepsBefore(leadDays, intervalDays).filter((step) => step > 0);

    const leadEcho = leadDays === 0
        ? t(keys.leadEchoZero)
        : leadDays === 1 ? t(keys.leadEchoOne) : t(keys.leadEcho, { days: leadDays });
    const intervalEcho = intervalDays === 1
        ? t('settings.reminders.intervalEchoOne')
        : t('settings.reminders.intervalEcho', { days: intervalDays });
    const schedule = stepsBefore.length === 0
        ? t(keys.scheduleOnlyDay)
        : t(keys.schedule, { steps: joinDays(stepsBefore) });

    const inputId = (field: string) => `reminder-${entityType.toLowerCase()}-${field}`;
    const muted = draft.enabled ? '' : 'opacity-50';

    return (
        <li className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0">
            {/* Kopfzeile: Schalter, Name, Bezug. */}
            <div className="flex items-start gap-3">
                <Switch checked={draft.enabled} onChange={(enabled) => onChange({ ...draft, enabled })} label={t(keys.title)} />
                <div className="min-w-0">
                    <div className="text-[13.5px] font-semibold text-slate-900 dark:text-white">{t(keys.title)}</div>
                    <div className="text-[12px] text-slate-500 dark:text-white/60">{t(keys.reference)}</div>
                </div>
            </div>

            {/* Die zwei Zahlen — je Zeile: Bezeichnung, Feld, sofortige Bedeutung. */}
            <div className={`ml-12 flex flex-col gap-2 transition-opacity ${muted}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label htmlFor={inputId('lead')} className="w-28 shrink-0 text-[12.5px] text-slate-600 dark:text-white/70">
                        {t('settings.reminders.leadLabel')}
                    </label>
                    <input
                        id={inputId('lead')}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_LEAD_DAYS}
                        value={draft.leadDays}
                        onChange={(event) => onChange({ ...draft, leadDays: event.target.value })}
                        onBlur={() => onChange({ ...draft, leadDays: String(leadDays) })}
                        className={NUMBER_INPUT_CLASS}
                    />
                    <span aria-live="polite" className="text-[12.5px] text-slate-700 dark:text-white/80">
                        → {leadEcho}
                    </span>
                    <span className="text-[11px] text-slate-400 dark:text-white/40">
                        {t('settings.reminders.maxDays', { max: MAX_LEAD_DAYS })}
                    </span>
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <label htmlFor={inputId('interval')} className="w-28 shrink-0 text-[12.5px] text-slate-600 dark:text-white/70">
                        {t('settings.reminders.intervalLabel')}
                    </label>
                    <input
                        id={inputId('interval')}
                        type="number"
                        inputMode="numeric"
                        min={1}
                        max={MAX_INTERVAL_DAYS}
                        value={draft.intervalDays}
                        onChange={(event) => onChange({ ...draft, intervalDays: event.target.value })}
                        onBlur={() => onChange({ ...draft, intervalDays: String(intervalDays) })}
                        className={NUMBER_INPUT_CLASS}
                    />
                    <span aria-live="polite" className="text-[12.5px] text-slate-700 dark:text-white/80">
                        → {intervalEcho}
                    </span>
                </div>
                {/* Der ganze Fahrplan in einem Satz. */}
                <p className="text-[12px] text-slate-500 dark:text-white/50">
                    {schedule}
                </p>
            </div>
        </li>
    );
};
