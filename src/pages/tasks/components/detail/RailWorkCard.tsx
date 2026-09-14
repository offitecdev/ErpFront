import { LuTimer } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { PeopleMap, WorkDto } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { formatDuration, personName } from '../../utils/taskFormat';

/**
 * «Çalışma süresi» — NUR für die Leitung (der Server liefert `work` für
 * Teammitglieder gar nicht). Laufende Messungen zählen ab `serverNow` der
 * letzten Antwort sekundengenau weiter; sonst tickt nichts.
 */
export const RailWorkCard = ({ work, people, serverNow }: { work: WorkDto; people: PeopleMap; serverNow: string }) => {
    const liveCount = work.breakdown.filter((entry) => entry.live).length;
    const now = useNow(liveCount ? 1000 : 60_000, true);
    const loadedAt = Date.parse(serverNow);
    const elapsed = liveCount && Number.isFinite(loadedAt) ? Math.max(0, now - loadedAt) : 0;
    const total = work.totalMs + elapsed * liveCount;

    return (
        <section className="ofi-gv-panel ofi-gv-detail-card">
            <header className="ofi-gv-panel__head">
                <LuTimer size={14} className="ofi-gv-muted" />
                <span className="flex-1">{t('tasksModule.detail.work.title')}</span>
                {liveCount > 0 && <i className="ofi-gv-live" aria-label={t('tasksModule.detail.work.live')} />}
            </header>
            <div className="ofi-gv-panel__body">
                <div className="ofi-gv-detail-total">{formatDuration(total)}</div>
                {work.breakdown.length ? (
                    <ul className="ofi-gv-detail-work">
                        {work.breakdown.map((entry) => (
                            <li key={entry.employeeId} className="ofi-gv-detail-work__row">
                                <span className="ofi-gv-detail-work__name">
                                    <span className="truncate">{personName(people, entry.employeeId)}</span>
                                    <span className="ofi-gv-caption">{t('tasksModule.detail.work.sessions', { count: entry.sessions })}</span>
                                </span>
                                {entry.live && <i className="ofi-gv-live" aria-label={t('tasksModule.detail.work.live')} />}
                                <span className="ofi-gv-detail-work__time">{formatDuration(entry.ms + (entry.live ? elapsed : 0))}</span>
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
