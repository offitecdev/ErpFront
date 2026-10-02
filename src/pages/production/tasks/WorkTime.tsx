import { useEffect, useState } from 'react';
import { Timer } from 'lucide-react';

import { t } from '@/i18n/translate';
import type { TaskSubtask } from '@/types/productionTasks';

/**
 * ── DIE GEARBEITETE ZEIT (02.10.2026) ───────────────────────────────────────
 *
 * «When the employee clicks on the play button then stop button store the work
 *  time … show the total time in a column next to the due column.» Die Summe
 * der abgeschlossenen Runden, dazu die laufende — sie zählt sichtbar weiter.
 */

type Clock = Pick<TaskSubtask, 'workSeconds' | 'workStartedAt'>;

const runningSeconds = (clock: Clock, now: number): number => {
    if (!clock.workStartedAt) return 0;
    const started = Date.parse(clock.workStartedAt);
    return Number.isNaN(started) ? 0 : Math.max(0, Math.round((now - started) / 1000));
};

const workSecondsOf = (clocks: readonly Clock[], now: number): number =>
    clocks.reduce((sum, clock) => sum + (clock.workSeconds ?? 0) + runningSeconds(clock, now), 0);

const formatWorkTime = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    if (minutes < 1) return seconds > 0 ? t('productionTasks.time.underMinute') : '—';
    const hours = Math.floor(minutes / 60);
    return hours
        ? t('productionTasks.time.hoursMinutes', { h: hours, m: String(minutes % 60).padStart(2, '0') })
        : t('productionTasks.time.minutes', { m: minutes });
};

/** Eine Zelle «Gesamtzeit» für eine Unteraufgabe oder (mehrere Uhren) eine Aufgabe. */
export const WorkTimeCell = ({ clocks }: { clocks: readonly Clock[] }) => {
    const running = clocks.some((clock) => clock.workStartedAt);
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!running) return undefined;
        // Die Anzeige hat Minuten — alle 15 s nachzählen reicht.
        const timer = window.setInterval(() => setNow(Date.now()), 15_000);
        return () => window.clearInterval(timer);
    }, [running]);
    const seconds = workSecondsOf(clocks, running ? now : 0);
    const label = formatWorkTime(seconds);
    return (
        <span
            className={`ofi-ptk-worktime ${running ? 'is-running' : ''} ${seconds ? '' : 'is-empty'}`}
            title={running ? t('productionTasks.time.running') : undefined}
        >
            {running && <Timer aria-hidden />}
            {label}
        </span>
    );
};
