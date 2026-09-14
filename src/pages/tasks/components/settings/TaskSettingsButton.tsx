import { useRef, useState } from 'react';
import { LuSettings } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { TaskIconButton } from '../shared/TaskButton';
import { TaskSettingsCard } from './TaskSettingsCard';

/**
 * Das Zahnrad der Modulhülle: öffnet «Görev ayarları». `ofi-nosize` hält die
 * Kopfregel des Listenkleids fern (listApple.css malt sonst jeden Knopf in
 * `.ofi-rise` zum 28px-Druckknopf mit Polster).
 *
 * Die Karte schliesst sich beim Druck ausserhalb — auch beim Druck auf dieses
 * Zahnrad. Der gleich darauf folgende `click` darf sie nicht wieder öffnen.
 */

const REOPEN_GUARD_MS = 400;

export const TaskSettingsButton = () => {
    useLanguageTick();
    const [open, setOpen] = useState(false);
    const closedAt = useRef(0);

    const close = () => {
        closedAt.current = Date.now();
        setOpen(false);
    };

    return (
        <>
            <TaskIconButton
                label={t('tasksModule.settings.title')}
                active={open}
                aria-haspopup="dialog"
                aria-expanded={open}
                className="ofi-nosize"
                onClick={() => {
                    if (open) { close(); return; }
                    if (Date.now() - closedAt.current < REOPEN_GUARD_MS) return;
                    setOpen(true);
                }}
            >
                <LuSettings size={15} />
            </TaskIconButton>
            <TaskSettingsCard open={open} onClose={close} />
        </>
    );
};
