import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LuCheck, LuChevronDown } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { LiveOverview, LivePerson } from '@/types/tasksModule';
import { formatDuration, formatTime } from '../../utils/taskFormat';
import { WorkingMark } from '../shared/WorkingMark';

/**
 * EINE Zeile je Person (13.09.2026, Samet: «daha sade günlük pano»): wer ·
 * Zustand («Çalışıyor» / Boşta) · aktuelle Aufgabe mit ihren Etiketten als
 * leiser Text · heute gesamt. Ein Klick klappt die Aufgaben des Tages mit
 * ihren Zeiten auf — sonst bleibt die Tafel ruhig.
 *
 * KEINE UHR (14.09.2026, Samet: «canlı sayımı kaldır»): die Zahlen sind die
 * abgeschlossenen Messungen bis `serverNow` — nichts wächst im Browser weiter;
 * die nächste Ladung (alle 15 s) bringt den neuen Stand.
 */

interface TaskWork {
    taskId: string;
    title: string;
    ms: number;
    live: boolean;
    done: boolean;
    completedAt: string | null;
}

const workPerTask = (person: LivePerson): TaskWork[] => {
    const byTask = new Map<string, TaskWork>();
    for (const session of person.sessions) {
        const live = !session.endedAt;
        const entry = byTask.get(session.taskId)
            ?? { taskId: session.taskId, title: session.taskTitle, ms: 0, live: false, done: false, completedAt: null };
        entry.ms += session.durationMs;
        entry.live = entry.live || live;
        byTask.set(session.taskId, entry);
    }
    for (const task of person.completedToday) {
        const entry = byTask.get(task.taskId)
            ?? { taskId: task.taskId, title: task.title, ms: 0, live: false, done: false, completedAt: null };
        entry.done = true;
        entry.completedAt = task.completedAt;
        byTask.set(task.taskId, entry);
    }
    return [...byTask.values()].sort((a, b) => Number(b.live) - Number(a.live) || b.ms - a.ms);
};

const labelText = (labels: LiveOverview['taskLabels'], taskId: string): string =>
    (labels[taskId] ?? []).map((label) => label.name).join(' · ');

export const LivePersonRow = ({
    person,
    labels,
}: {
    person: LivePerson;
    labels: LiveOverview['taskLabels'];
}) => {
    const [open, setOpen] = useState(false);
    const running = person.running;
    const tasks = workPerTask(person);
    const todayMs = person.todayMs;
    const name = person.name || t('tasksModule.live.unknownPerson');
    const expandable = tasks.length > 0;
    const runningLabels = running ? labelText(labels, running.taskId) : '';

    return (
        <li className={`ofi-gv-live-row ${running ? 'is-working' : ''} ${todayMs > 0 || running ? '' : 'is-quiet'} ${open ? 'is-open' : ''}`}>
            <div
                className={`ofi-gv-live-row__main ${expandable ? 'is-expandable' : ''}`}
                role={expandable ? 'button' : undefined}
                tabIndex={expandable ? 0 : undefined}
                aria-expanded={expandable ? open : undefined}
                onClick={(event) => {
                    if (!expandable || (event.target as HTMLElement).closest('a')) return;
                    setOpen((value) => !value);
                }}
                onKeyDown={(event) => {
                    if (!expandable || (event.key !== 'Enter' && event.key !== ' ')) return;
                    event.preventDefault();
                    setOpen((value) => !value);
                }}
            >
                <span className="ofi-gv-live-row__who">
                    {running && <i className="ofi-gv-live-row__dot" aria-hidden />}
                    <span className="ofi-gv-live-row__name" title={person.title ?? undefined}>{name}</span>
                </span>

                <span className="ofi-gv-live-row__state">
                    {running ? (
                        <span className="ofi-gv-live-state is-working">
                            <WorkingMark label={t('tasksModule.live.working')} />
                        </span>
                    ) : (
                        <span className="ofi-gv-live-state">{t('tasksModule.live.idle')}</span>
                    )}
                </span>

                <span className="ofi-gv-live-row__task">
                    {running ? (
                        <>
                            <Link to={`/tasks/${running.taskId}`} className="ofi-gv-live-row__title" title={running.taskTitle}>
                                {running.taskTitle || t('tasksModule.live.untitled')}
                            </Link>
                            {runningLabels && <span className="ofi-gv-live-row__labels">{runningLabels}</span>}
                        </>
                    ) : (
                        <span className="ofi-gv-live-row__hint">
                            {person.lastActiveAt
                                ? t('tasksModule.live.lastActive', { time: formatTime(person.lastActiveAt) })
                                : t('tasksModule.live.noWorkToday')}
                        </span>
                    )}
                </span>

                <span className="ofi-gv-live-row__total">{todayMs > 0 ? formatDuration(todayMs) : '—'}</span>

                <span className="ofi-gv-live-row__chevron" aria-hidden>
                    {expandable && <LuChevronDown size={14} />}
                </span>
            </div>

            {open && expandable && (
                <ul className="ofi-gv-live-work" aria-label={t('tasksModule.live.workedOn')}>
                    {tasks.map((task) => (
                        <li key={task.taskId} className={`ofi-gv-live-work__item ${task.live ? 'is-live' : ''}`}>
                            <span className="ofi-gv-live-work__mark">
                                {task.done
                                    ? <LuCheck size={13} aria-label={t('tasksModule.live.completed')} />
                                    : task.live ? <i className="ofi-gv-working__dot" aria-hidden /> : null}
                            </span>
                            <Link to={`/tasks/${task.taskId}`} className="ofi-gv-live-work__title" title={task.title}>
                                {task.title || t('tasksModule.live.untitled')}
                            </Link>
                            {labelText(labels, task.taskId) && (
                                <span className="ofi-gv-live-row__labels">{labelText(labels, task.taskId)}</span>
                            )}
                            <span className="ofi-gv-live-work__ms">
                                {task.ms > 0
                                    ? formatDuration(task.ms)
                                    : task.completedAt ? t('tasksModule.live.completedAt', { time: formatTime(task.completedAt) }) : '—'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </li>
    );
};
