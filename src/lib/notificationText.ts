import { t } from '@/i18n/translate';

/**
 * Sprachneutrale Bausteine → Satz in der Sprache der Person.
 *
 * Der Server speichert bei Erinnerungen (CrmTask.meta) und Ereignis-
 * Benachrichtigungen (Notification.metadata.i18n) nur Schlüssel und Werte;
 * den Text baut die Oberfläche hier — so liest jede Person Erinnerungen in
 * ihrer eigenen Sprache (de/en/tr). Fehlt `meta`, bleibt der gespeicherte
 * (deutsche) Ersatztext.
 */

export interface ReminderMeta {
    template: 'QUOTE_EXPIRY' | 'ORDER_DELIVERY';
    number: string;
    customerName?: string | null;
    daysLeft: number;
    referenceDate?: string;
}

const isReminderMeta = (value: unknown): value is ReminderMeta =>
    Boolean(value) && typeof value === 'object'
    && ((value as ReminderMeta).template === 'QUOTE_EXPIRY' || (value as ReminderMeta).template === 'ORDER_DELIVERY');

/** "heute" / "morgen" / "in 5 Tagen". */
const whenPhrase = (daysLeft: number): string => {
    if (daysLeft <= 0) return t('crm.reminder.whenToday');
    if (daysLeft === 1) return t('crm.reminder.whenTomorrow');
    return t('crm.reminder.whenInDays', { days: daysLeft });
};

/** Titel einer Erinnerung in der Sprache der Person; ohne meta der Ersatztext. */
export const reminderTitle = (task: { title: string; meta?: unknown }): string => {
    if (!isReminderMeta(task.meta)) return task.title;
    const key = task.meta.template === 'QUOTE_EXPIRY' ? 'crm.reminder.quoteExpiry' : 'crm.reminder.orderDelivery';
    return t(key, { number: task.meta.number, when: whenPhrase(Number(task.meta.daysLeft) || 0) });
};

interface I18nSpec {
    key: string;
    params?: Record<string, unknown>;
}

const isI18nSpec = (value: unknown): value is I18nSpec =>
    Boolean(value) && typeof value === 'object' && typeof (value as I18nSpec).key === 'string';

/** Werte, die selbst übersetzt werden müssen, kommen als { $t: 'schlüssel' }. */
const resolveParams = (params: Record<string, unknown> | undefined): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [name, value] of Object.entries(params ?? {})) {
        out[name] = value && typeof value === 'object' && typeof (value as { $t?: unknown }).$t === 'string'
            ? t((value as { $t: string }).$t)
            : value;
    }
    return out;
};

/** Titel + Text einer Benachrichtigung; mit metadata.i18n übersetzt, sonst wie gespeichert. */
export const notificationText = (notification: { title: string; message: string; metadata?: unknown }): { title: string; message: string } => {
    const spec = (notification.metadata as { i18n?: unknown } | null | undefined)?.i18n;
    if (!isI18nSpec(spec)) return { title: notification.title, message: notification.message };
    const params = resolveParams(spec.params);
    const messageKey = typeof params.actor === 'string' && params.actor.trim()
        ? `${spec.key}.message`
        : `${spec.key}.messageNoActor`;
    return {
        title: t(`${spec.key}.title`, params),
        message: t(messageKey, params),
    };
};
