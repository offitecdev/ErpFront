import type { ReactNode } from 'react';
import { LuTarget } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { TaskForecast } from '@/types/tasksModule';
import { formatDay } from '../../utils/taskFormat';

/**
 * «Bitiş tahmini» (Görevly reports.forecast): Tempo der erledigten Punkte
 * gegen die gemessene Zeit. Ohne Checkliste oder ohne Daten sagt die Karte,
 * was fehlt — sie rät nie.
 */
export const RailForecastCard = ({ forecast }: { forecast: TaskForecast }) => {
    let body: ReactNode;
    if (forecast.completed) {
        body = <div className="ofi-gv-caption">{t('tasksModule.detail.forecast.completed')}</div>;
    } else if (!forecast.ok || !forecast.predictedAt) {
        const reason = forecast.reasonCode ?? 'NOT_ENOUGH_DATA';
        body = <div className="ofi-gv-caption">{t(`tasksModule.detail.forecast.reason.${reason}`)}</div>;
    } else {
        body = (
            <>
                <div className="ofi-gv-detail-total">{formatDay(forecast.predictedAt)}</div>
                <div className="ofi-gv-detail-forecast">
                    {t('tasksModule.detail.forecast.pace', { days: forecast.calendarDays ?? 0, remaining: forecast.remaining })}
                    {forecast.late && (
                        <span className="ofi-gv-due is-late">
                            {' · '}
                            {t('tasksModule.detail.forecast.delay', { delay: forecast.delayDays ?? 0 })}
                        </span>
                    )}
                </div>
            </>
        );
    }

    return (
        <section className="ofi-gv-panel ofi-gv-detail-card">
            <header className="ofi-gv-panel__head">
                <LuTarget size={14} className="ofi-gv-muted" />
                <span>{t('tasksModule.detail.forecast.title')}</span>
            </header>
            <div className="ofi-gv-panel__body">{body}</div>
        </section>
    );
};
