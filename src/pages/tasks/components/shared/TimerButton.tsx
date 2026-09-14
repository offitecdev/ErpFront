import { LuPause, LuPlay } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { selectTimerRunning, useTaskTimer } from '../../hooks/useTaskTimer';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { TaskButton, TaskIconButton } from './TaskButton';

/**
 * Start/Pause einer Aufgabe. `compact` = quadratischer Symbolknopf (Zeilen,
 * Karten), sonst Druckknopf mit Wort (Detail). Die Entscheidung, OB gemessen
 * werden darf, trifft der Aufrufer (`permissions.canTrack`) — der Server prüft
 * sie ohnehin nach.
 */
export const TimerButton = ({
    taskId,
    running,
    taskTitle = '',
    compact = false,
    onChanged,
}: {
    taskId: string;
    running: boolean;
    taskTitle?: string;
    compact?: boolean;
    onChanged?: () => void;
}) => {
    const { start, pause } = useTaskTimer();
    // Der Store wechselt im selben Klick — die Zeilendaten erst nach dem Nachladen.
    const isRunning = useTasksModuleStore(selectTimerRunning(taskId, running));
    const label = isRunning ? t('tasksModule.timer.pause') : t('tasksModule.timer.start');

    const toggle = async () => {
        const wasRunning = isRunning;
        const result = wasRunning ? await pause(taskId) : await start(taskId, taskTitle);
        if (result !== null || wasRunning) onChanged?.();
    };

    if (compact) {
        return (
            <TaskIconButton
                label={label}
                active={isRunning}
                onClick={(event) => { event.stopPropagation(); void toggle(); }}
            >
                {isRunning ? <LuPause size={14} /> : <LuPlay size={14} />}
            </TaskIconButton>
        );
    }
    return (
        <TaskButton
            icon={isRunning ? <LuPause size={14} /> : <LuPlay size={14} />}
            onClick={() => void toggle()}
        >
            {label}
        </TaskButton>
    );
};
