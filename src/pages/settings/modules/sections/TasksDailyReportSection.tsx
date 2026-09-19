import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Save01 as Save } from '@/components/icons/antIconCompat';
import { InlineLoading } from '@/components/ui-shared/Loader';
import { TimeField } from '@/components/ui-shared/TimeField';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import { notifyDailyReportSettingChanged } from '@/pages/tasks/components/dailyReport/dailyReportEvents';
import { useAuthStore } from '@/store/authStore';
import '@/styles/modules/moduleSettings.css';
import type { DailyReportSetting } from '@/types/tasksModule';

/**
 * Görev Yönetimi → Gün sonu raporu (15.09.2026, Samet: «16:00'ı modül
 * ayarlarından değiştirebilelim» … «16.00–17.00 arası aktif olur»). Ein
 * Zeitfenster: ab Beginn kommt Montag–Freitag die Uyarı, bis zum Ende kann der
 * Rapport geschrieben werden. Gilt für die ausgewählte Firma; ändern darf die
 * Leitung (tasks.manage / tasks.delete) und die Administratorrolle — der
 * Server prüft dasselbe.
 */

const DEFAULT_SETTING: DailyReportSetting = { promptTime: '16:00', endTime: '17:00' };
const K = 'settings.dailyReport';

const minutes = (value: string) => {
    const [h = 0, m = 0] = value.split(':').map(Number);
    return h * 60 + m;
};

export const TasksDailyReportSection = () => {
    // 15.09.2026 (Samet): Görev-Einstellungen nur für die Administratorrolle.
    const canEdit = useAuthStore((state) => state.isSystemAdmin);
    const [value, setValue] = useState<DailyReportSetting>(DEFAULT_SETTING);
    const [saved, setSaved] = useState<DailyReportSetting>(DEFAULT_SETTING);
    const [loaded, setLoaded] = useState(false);
    const [unavailable, setUnavailable] = useState(false);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        let cancelled = false;
        tasksApi.dailyReportSetting()
            .then((setting) => {
                if (cancelled) return;
                const next = { promptTime: setting.promptTime, endTime: setting.endTime || DEFAULT_SETTING.endTime };
                setValue(next);
                setSaved(next);
            })
            .catch(() => { if (!cancelled) setUnavailable(true); })
            .finally(() => { if (!cancelled) setLoaded(true); });
        return () => { cancelled = true; };
    }, []);

    const dirty = value.promptTime !== saved.promptTime || value.endTime !== saved.endTime;
    const invalid = minutes(value.endTime) <= minutes(value.promptTime);

    const save = async () => {
        if (invalid) return;
        setSaving(true);
        try {
            const setting = await tasksApi.saveDailyReportSetting(value);
            setValue(setting);
            setSaved(setting);
            notifyDailyReportSettingChanged();
            toast.success(t(`${K}.saved`));
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const row = (label: string, field: keyof DailyReportSetting) => (
        <div className="flex items-center justify-between gap-4 px-4 py-3 md:px-6">
            <div className="text-[13px] font-medium text-[color:var(--ofi-cal-text)]">{label}</div>
            <TimeField
                label={label}
                value={value[field]}
                onChange={(next) => setValue((current) => ({ ...current, [field]: next }))}
                disabled={!canEdit || saving}
                className="w-[120px]"
            />
        </div>
    );

    return (
        <div className="ofi-mset-card">
            <div className="ofi-mset-card__head">
                <h2 className="ofi-mset-card__title">{t(`${K}.title`)}</h2>
            </div>

            <div className="ofi-mset-card__body">
                {!loaded ? (
                    <div className="py-10"><InlineLoading label={t('common.loading')} /></div>
                ) : unavailable ? (
                    <p className="ofi-mset-empty">{t(`${K}.unavailable`)}</p>
                ) : (
                    <>
                        <div className="px-4 pt-4 text-[12px] text-[color:var(--ofi-cal-muted)] md:px-6">
                            {t(`${K}.hintWindow`, { start: saved.promptTime, end: saved.endTime })}
                        </div>
                        {row(t(`${K}.startLabel`), 'promptTime')}
                        {row(t(`${K}.endLabel`), 'endTime')}
                        {invalid && (
                            <div className="px-4 pb-3 text-[12px] text-[#ff3b30] md:px-6" role="alert">
                                {t('tasksModule.errors.DAILY_REPORT_WINDOW_INVALID')}
                            </div>
                        )}
                    </>
                )}
            </div>

            {loaded && !unavailable && (
                <div className="ofi-mset-card__foot justify-end">
                    {!canEdit && <span className="ofi-mset-hint">{t(`${K}.readOnly`)}</span>}
                    {canEdit && dirty && <span className="ofi-mset-hint">{t('settings.reminders.unsaved')}</span>}
                    {canEdit && (
                        <button
                            type="button"
                            disabled={!dirty || invalid || saving}
                            onClick={() => void save()}
                            className="ofi-mset-primary"
                        >
                            <Save size={13} aria-hidden />
                            {t('common.save')}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
};
