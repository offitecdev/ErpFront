import { LuTimer } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { PeopleMap, WorkBreakdownEntry, WorkDto } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { hasOwnStops, pendingOwnMs } from '../../utils/ownSessions';
import { formatDuration, personName } from '../../utils/taskFormat';
import { WorkingMark } from '../shared/WorkingMark';

/**
 * «Çalışma süresi» — die Leitung sieht alle Personen, ein Teammitglied nur
 * seine eigene Zeile (der Server filtert). Gezeigt wird die Zeit des TAGES
 * (14.09.2026, Samet) — die Summe aller Tage steht im Rapport.
 *
 * KEINE UHR (14.09.2026, Samet: «kronometre olmayacak»): wer gerade misst,
 * steht als «Çalışılıyor»; die Zahl ist die Summe der ABGESCHLOSSENEN
 * Messungen. Die eigene eben beendete Messung zählt sofort mit (ownSessions),
 * auch wenn die Antwort des Servers sie noch nicht enthält — die Zahl fällt
 * nach dem Pausieren nie zurück.
 */

export const RailWorkCard = ({ taskId, work, myStartedAt, people, serverNow }: {
    taskId: string;
    work: WorkDto;
    /** Start der eigenen laufenden Messung laut Server (null = läuft nicht). */
    myStartedAt: string | null;
    people: PeopleMap;
    serverNow: string;
}) => {
    const me = useTasksActorId();
    const own = useTasksModuleStore((state) => state.activeTimer);
    const loadedAtMs = Date.parse(serverNow);
    // Nur der Kalendertag hängt an «jetzt» — Minutentakt, keine Uhr.
    const nowMs = useNow(60_000);

    // Der Store gilt, sobald er etwas weiss (Klick, Bootstrap, Özet) — sonst der Server.
    const ownRunning = own !== undefined ? own?.taskId === taskId : Boolean(myStartedAt);
    const mine = work.breakdown.find((entry) => entry.employeeId === me) ?? null;
    // Eben selbst gestartet oder pausiert, ohne dass der Server die Zeile schon führt: sie erscheint sofort.
    const ownFresh = !mine && (ownRunning || hasOwnStops(taskId, nowMs));
    const entries: WorkBreakdownEntry[] = ownFresh
        ? [...work.breakdown, { employeeId: me, ms: 0, dayMs: 0, sessions: ownRunning ? 1 : 0, first: serverNow, last: serverNow, live: ownRunning }]
        : work.breakdown;

    const rows = entries.map((entry) => {
        const isMe = entry.employeeId === me;
        const ownServerRunning = isMe && (entry.live || Boolean(myStartedAt));
        // Ein gemerkter Stand von vor dem Tagesfenster kennt `dayMs` noch nicht.
        const pending = isMe ? pendingOwnMs({ taskId, loadedAtMs, ownServerRunning, ownServerStartedAt: myStartedAt, nowMs }) : 0;
        return { entry, ms: (entry.dayMs ?? 0) + pending, working: isMe ? ownRunning : entry.live };
    });
    const total = rows.reduce((sum, row) => sum + row.ms, 0);
    const anyWorking = rows.some((row) => row.working);

    return (
        <section className={`ofi-gv-panel ofi-gv-detail-card ${anyWorking ? 'is-working' : ''}`}>
            <header className="ofi-gv-panel__head">
                <LuTimer size={14} className="ofi-gv-muted" />
                <span className="flex-1">{t('tasksModule.detail.work.title')}</span>
                {anyWorking && <WorkingMark tone={ownRunning ? 'own' : 'others'} />}
            </header>
            <div className="ofi-gv-panel__body">
                <div className="ofi-gv-detail-total">{formatDuration(total)}</div>
                {anyWorking && <div className="ofi-gv-caption">{t('tasksModule.working.hint')}</div>}
                {rows.length ? (
                    <ul className="ofi-gv-detail-work">
                        {rows.map(({ entry, ms, working }) => (
                            <li key={entry.employeeId} className="ofi-gv-detail-work__row">
                                <span className="ofi-gv-detail-work__name">
                                    <span className="truncate">{personName(people, entry.employeeId)}</span>
                                    <span className="ofi-gv-caption">{t('tasksModule.detail.work.sessions', { count: entry.sessions })}</span>
                                </span>
                                <span className="ofi-gv-detail-work__time">
                                    {working
                                        ? <WorkingMark tone={entry.employeeId === me ? 'own' : 'others'} />
                                        : formatDuration(ms)}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <div className="ofi-gv-caption">{t('tasksModule.detail.work.empty')}</div>
                )}
            </div>
        </section>
    );
};
