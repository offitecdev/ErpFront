import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Save01 as Save } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { reminderSettingsApi } from '@/lib/api/reminderSettings';
import type { ReminderEntityType, ReminderSetting } from '@/lib/api/reminderSettings';
import { clampReminderSetting } from '@/lib/reminderSchedule';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { ReminderSettingItem } from '../components/ReminderSettingItem';
import type { ReminderDraft } from '../components/ReminderSettingItem';

/**
 * Verkauf → Erinnerungen: GENAU ZWEI Einstellungen als schlichte Textliste —
 * Angebote (Bezug: Ablaufdatum) und Aufträge (Bezug: Liefertermin). Je
 * Einstellung ein Schalter, der Vorlauf und die Wiederholung; neben jeder
 * Zahl steht sofort, was sie bedeutet, darunter der ganze Fahrplan.
 * EIN Speichern für beide.
 */

const ORDER: ReminderEntityType[] = ['QUOTE', 'ORDER'];

/** Vorgabe, solange noch nichts gespeichert ist (aus, damit nichts ungefragt feuert). */
const DEFAULTS: Record<ReminderEntityType, ReminderDraft> = {
    QUOTE: { enabled: false, leadDays: '7', intervalDays: '3' },
    ORDER: { enabled: false, leadDays: '7', intervalDays: '2' },
};

const toDraft = (setting?: ReminderSetting): ReminderDraft | null => setting
    ? { enabled: setting.enabled, leadDays: String(setting.leadDays), intervalDays: String(setting.intervalDays) }
    : null;

const toSetting = (entityType: ReminderEntityType, draft: ReminderDraft): ReminderSetting => ({
    entityType,
    enabled: draft.enabled,
    ...clampReminderSetting({ leadDays: draft.leadDays, intervalDays: draft.intervalDays }),
});

const sameDraft = (a: ReminderDraft, b: ReminderDraft) =>
    a.enabled === b.enabled && Number(a.leadDays) === Number(b.leadDays) && Number(a.intervalDays) === Number(b.intervalDays);

export const SalesRemindersSection = () => {
    const [drafts, setDrafts] = useState<Record<ReminderEntityType, ReminderDraft>>(DEFAULTS);
    const [saved, setSaved] = useState<Record<ReminderEntityType, ReminderDraft>>(DEFAULTS);
    const [loaded, setLoaded] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        reminderSettingsApi.list()
            .then((rows) => {
                if (cancelled) return;
                const next = { ...DEFAULTS };
                for (const type of ORDER) {
                    const draft = toDraft(rows.find((row) => row.entityType === type));
                    if (draft) next[type] = draft;
                }
                setDrafts(next);
                setSaved(next);
            })
            .catch(() => { if (!cancelled) toast.error(t('settings.reminders.errorLoad')); })
            .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
    }, []);

    const dirty = useMemo(() => ORDER.some((type) => !sameDraft(drafts[type], saved[type])), [drafts, saved]);

    const save = async () => {
        try {
            setSaving(true);
            const rows = await reminderSettingsApi.save(ORDER.map((type) => toSetting(type, drafts[type])));
            const next = { ...drafts };
            for (const type of ORDER) {
                const draft = toDraft(rows.find((row) => row.entityType === type));
                if (draft) next[type] = draft;
            }
            setDrafts(next);
            setSaved(next);
            toast.success(t('settings.reminders.saved'));
        } catch (error: unknown) {
            const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
            toast.error(typeof message === 'string' && message ? message : t('settings.reminders.saveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="ofi-mset-card">
            <div className="ofi-mset-card__head">
                <h2 className="ofi-mset-card__title">{t('settings.reminders.title')}</h2>
            </div>

            <div className="ofi-mset-card__body">
                {!loaded ? (
                    <div className="py-10"><InlineLoading label={t('common.loading')} /></div>
                ) : (
                    <ul className="divide-y divide-[color:var(--ofi-cal-line)] px-4 md:px-6">
                        {ORDER.map((type) => (
                            <ReminderSettingItem
                                key={type}
                                entityType={type}
                                draft={drafts[type]}
                                onChange={(draft) => setDrafts((current) => ({ ...current, [type]: draft }))}
                            />
                        ))}
                    </ul>
                )}
            </div>

            {/* Der Fuss der Karte trägt das Speichern — wie bei den Einheiten
                der Ort, an dem etwas hinzukommt oder festgeschrieben wird. */}
            <div className="ofi-mset-card__foot justify-end">
                {dirty && <span className="ofi-mset-hint">{t('settings.reminders.unsaved')}</span>}
                <button
                    type="button"
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                    className="ofi-mset-primary"
                >
                    <Save size={13} aria-hidden />
                    {t('common.save')}
                </button>
            </div>
        </div>
    );
};
