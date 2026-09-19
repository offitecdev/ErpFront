import { Link } from 'react-router-dom';
import { LuPause } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { useTaskTimer } from '../../hooks/useTaskTimer';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { TaskButton } from './TaskButton';

/**
 * ── «ŞU AN ÇALIŞILIYOR» — DIE KARTE OBEN IM MODUL (14.09.2026, Samet) ──────
 *
 * «çalışılan görev üstte yazsın, başlık şeklinde … sadece görevler modülünde
 * açık olunca olsun»: solange die eigene Messung läuft, steht oben auf jeder
 * Seite des Moduls eine Glaskarte im Stil des Mac-Kalenders — atmender Punkt,
 * Titel der Aufgabe, Pausieren. Keine Uhr, kein Takt: die Zeit erscheint erst
 * nach dem Pausieren in der Zeile. Wechselt die Messung, wechselt die Karte
 * (Store); läuft nichts, ist hier nichts.
 */
export const WorkingBanner = () => {
    const active = useTasksModuleStore((state) => state.activeTimer ?? null);
    const tenantKey = useTasksModuleStore((state) => state.tenantKey);
    const { pause } = useTaskTimer();

    if (!active) return null;
    const title = active.taskTitle || t('tasksModule.live.untitled');
    // Die Aufgabe kann zu einer anderen Firma gehören — dann kein Link ins Leere.
    const linkable = !active.tenantId || !tenantKey || active.tenantId === tenantKey;

    return (
        <section className="ofi-gv-working-card" aria-live="polite" aria-label={t('tasksModule.working.caption')}>
            <div className="ofi-gv-working-card__body">
                <span className="ofi-gv-working-card__caption">
                    <i className="ofi-gv-working__dot" aria-hidden />
                    {t('tasksModule.working.caption')}
                </span>
                {linkable ? (
                    <Link to={`/tasks/${active.taskId}`} className="ofi-gv-working-card__title" title={title}>{title}</Link>
                ) : (
                    <span className="ofi-gv-working-card__title" title={title}>{title}</span>
                )}
                <span className="ofi-gv-working-card__hint">{t('tasksModule.working.hint')}</span>
            </div>
            <TaskButton
                className="ofi-gv-working-card__pause"
                icon={<LuPause size={14} />}
                onClick={() => void pause(active.taskId)}
            >
                {t('tasksModule.timer.pause')}
            </TaskButton>
        </section>
    );
};
