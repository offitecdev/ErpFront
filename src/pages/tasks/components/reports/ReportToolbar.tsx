import { useEffect, useState } from 'react';
import { LuChevronDown, LuChevronLeft, LuChevronRight } from 'react-icons/lu';

import { DateField } from '@/components/ui-shared/DateField';
import { ToggleGroup } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { PeoplePicker } from '../shared/PeoplePicker';
import { TaskButton, TaskIconButton } from '../shared/TaskButton';
import type { ReportQuery } from './reportQuery';
import { shiftPeriod, toDateKey, type WorkPeriod } from './workReportModel';

/**
 * Werkzeugzeile der Rapportseite — nur das Nötige (Vorgabe Samet):
 * Person (nur Leitung; genau eine) · Täglich/Wöchentlich · ‹ Datum › Heute ·
 * Rapportsprache. Ein Teammitglied sieht seinen eigenen Rapport ohne Personenwahl.
 */

const K = 'tasksModule.reports.work';
const REPORT_LANGUAGES = [
    { key: 'tr' as const, label: 'TR' },
    { key: 'en' as const, label: 'EN' },
    { key: 'de' as const, label: 'DE' },
];

const PersonTrigger = ({ value, onChange }: { value: string; onChange: (next: string) => void }) => {
    const [anchor, setAnchor] = useState<HTMLButtonElement | null>(null);
    const directory = useTasksModuleStore((state) => state.directory);
    const loadDirectory = useTasksModuleStore((state) => state.loadDirectory);
    const actorId = useTasksActorId();
    useEffect(() => { void loadDirectory(); }, [loadDirectory]);
    const selectedId = value || actorId;
    const name = directory?.find((person) => person.id === selectedId)?.name ?? '';

    return (
        <>
            <button
                type="button"
                className="ofi-cal-input ofi-gv-rep-trigger"
                aria-label={t(`${K}.person`)}
                aria-haspopup="listbox"
                onClick={(event) => setAnchor(anchor ? null : event.currentTarget)}
            >
                <span className="ofi-gv-rep-trigger__text">{name || t('common.loading')}</span>
                <LuChevronDown size={14} className="ofi-gv-rep-trigger__chevron" aria-hidden />
            </button>
            <PeoplePicker
                anchorEl={anchor}
                onClose={() => setAnchor(null)}
                selected={[selectedId]}
                onChange={(ids) => { if (ids[0]) onChange(ids[0] === actorId ? '' : ids[0]); }}
            />
        </>
    );
};

export const ReportToolbar = ({
    query,
    isManager,
    onChange,
}: {
    query: ReportQuery;
    isManager: boolean;
    onChange: (next: ReportQuery) => void;
}) => {
    const today = toDateKey(new Date());
    return (
        <div className="ofi-gv-rep-bar">
            {isManager && (
                <div className="ofi-gv-rep-bar__field">
                    <PersonTrigger value={query.person} onChange={(person) => onChange({ ...query, person })} />
                </div>
            )}
            <div className="ofi-gv-rep-bar__group" role="group" aria-label={t(`${K}.periodLabel`)}>
                <ToggleGroup<WorkPeriod>
                    value={query.period}
                    onChange={(period) => onChange({ ...query, period })}
                    options={[
                        { key: 'day', label: t(`${K}.daily`) },
                        { key: 'week', label: t(`${K}.weekly`) },
                    ]}
                />
            </div>
            <div className="ofi-gv-rep-bar__group">
                <TaskIconButton
                    label={query.period === 'week' ? t(`${K}.prevWeek`) : t(`${K}.prevDay`)}
                    onClick={() => onChange({ ...query, date: shiftPeriod(query.period, query.date, -1) })}
                >
                    <LuChevronLeft size={15} />
                </TaskIconButton>
                <DateField
                    value={query.date}
                    ariaLabel={t(`${K}.date`)}
                    onChange={(date) => { if (date) onChange({ ...query, date }); }}
                    className="ofi-gv-rep-bar__datefield"
                />
                <TaskIconButton
                    label={query.period === 'week' ? t(`${K}.nextWeek`) : t(`${K}.nextDay`)}
                    onClick={() => onChange({ ...query, date: shiftPeriod(query.period, query.date, 1) })}
                >
                    <LuChevronRight size={15} />
                </TaskIconButton>
                <TaskButton disabled={query.date === today} onClick={() => onChange({ ...query, date: today })}>
                    {query.period === 'week' ? t(`${K}.thisWeek`) : t(`${K}.today`)}
                </TaskButton>
            </div>
            <div className="ofi-gv-rep-bar__group" role="group" aria-label={t(`${K}.language`)}>
                <ToggleGroup
                    value={query.language}
                    onChange={(language) => onChange({ ...query, language })}
                    options={REPORT_LANGUAGES}
                />
            </div>
        </div>
    );
};
