import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PopupCard } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { Switch } from '@/components/ui-shared/Switch';
import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import '@/styles/modules/tasksBoard.css';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import {
    desktopNotifySupport,
    readTasksDesktopNotify,
    requestDesktopNotifyPermission,
    writeTasksDesktopNotify,
    type DesktopNotifySupport,
} from './desktopNotify';

/**
 * «Görev ayarları» (Görevly `views/settings.js`, Abschnitt «Bildirim»):
 * wie lange vor dem Termin erinnert wird (am Server, je Person) und ob dieses
 * Gerät Systemmeldungen zeigen darf (nur im Browser gemerkt).
 */

const LEAD_MINUTES = [10, 30, 60, 120] as const;

const leadLabel = (minutes: number): string => (minutes < 60
    ? t('tasksModule.settings.leadMinutes', { count: minutes })
    : t('tasksModule.settings.leadHours', { count: minutes / 60 }));

export const TaskSettingsCard = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
    const lead = useTasksModuleStore((state) => state.bootstrap?.settings.reminderLeadMinutes ?? 30);
    const setReminderLeadMinutes = useTasksModuleStore((state) => state.setReminderLeadMinutes);
    const [saving, setSaving] = useState(false);
    const [desktopOn, setDesktopOn] = useState(readTasksDesktopNotify);
    const [support, setSupport] = useState<DesktopNotifySupport>(desktopNotifySupport);

    // Die Erlaubnis kann sich ausserhalb ändern (Browsereinstellungen) — beim Öffnen neu lesen.
    useEffect(() => {
        if (!open) return;
        setSupport(desktopNotifySupport());
        setDesktopOn(readTasksDesktopNotify());
    }, [open]);

    const changeLead = async (value: string) => {
        const minutes = Number(value);
        if (!Number.isFinite(minutes) || minutes === lead || saving) return;
        const previous = lead;
        setReminderLeadMinutes(minutes);
        setSaving(true);
        try {
            const settings = await tasksApi.saveSettings({ reminderLeadMinutes: minutes });
            setReminderLeadMinutes(settings.reminderLeadMinutes);
            toast.success(t('tasksModule.settings.saved'));
        } catch (error) {
            setReminderLeadMinutes(previous);
            toast.error(tasksErrorMessage(error));
        } finally {
            setSaving(false);
        }
    };

    const changeDesktop = async (next: boolean) => {
        if (!next) {
            writeTasksDesktopNotify(false);
            setDesktopOn(false);
            return;
        }
        const permission = support === 'granted' ? 'granted' : await requestDesktopNotifyPermission();
        setSupport(permission);
        if (permission === 'granted') {
            writeTasksDesktopNotify(true);
            setDesktopOn(true);
            return;
        }
        writeTasksDesktopNotify(false);
        setDesktopOn(false);
        if (permission === 'denied') toast.error(t('tasksModule.settings.desktopDenied'));
    };

    const desktopCaption = support === 'unsupported'
        ? t('tasksModule.settings.desktopUnsupported')
        : support === 'denied'
            ? t('tasksModule.settings.desktopBlocked')
            : t('tasksModule.settings.desktopHint');

    return (
        <PopupCard
            open={open}
            onClose={onClose}
            title={t('tasksModule.settings.title')}
            width={380}
            closeOnOutside
        >
            <div className="ofi-gv-settings">
                <div className="ofi-gv-settings__row">
                    <div className="ofi-gv-settings__text">
                        <div className="ofi-gv-settings__label" id="ofi-gv-settings-lead">{t('tasksModule.settings.leadLabel')}</div>
                        <div className="ofi-gv-settings__caption">{t('tasksModule.settings.leadHint')}</div>
                    </div>
                    <SelectMenu
                        panelClassName="ofi-gv-select"
                        value={String(lead)}
                        options={LEAD_MINUTES.map((minutes) => ({ value: String(minutes), label: leadLabel(minutes) }))}
                        onChange={(value) => void changeLead(value)}
                        disabled={saving}
                        ariaLabel={t('tasksModule.settings.leadLabel')}
                        className="ofi-gv-settings__select"
                        listWidth={160}
                    />
                </div>
                <div className="ofi-gv-settings__row">
                    <div className="ofi-gv-settings__text">
                        <div className="ofi-gv-settings__label">{t('tasksModule.settings.desktopLabel')}</div>
                        <div className="ofi-gv-settings__caption">{desktopCaption}</div>
                    </div>
                    <Switch
                        checked={desktopOn && support === 'granted'}
                        onChange={(next) => void changeDesktop(next)}
                        label={t('tasksModule.settings.desktopLabel')}
                        disabled={support === 'unsupported' || support === 'denied'}
                    />
                </div>
            </div>
        </PopupCard>
    );
};
