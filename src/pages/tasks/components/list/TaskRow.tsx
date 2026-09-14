import { memo, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuBookOpen, LuCheck, LuEllipsis, LuFlag, LuListChecks, LuMessageSquare, LuPaperclip } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi } from '@/lib/api/tasksModule';
import type { LabelDto, PeopleMap, TaskRow as TaskRowDto } from '@/types/tasksModule';
import { loadTaskDetailPage } from '../../taskRouteLoaders';
import { useNow } from '../../hooks/useNow';
import { formatDuration, isOpenStatus, remainingInfo, smartDate } from '../../utils/taskFormat';
import { TaskIconButton } from '../shared/TaskButton';
import { LabelChip, PeopleNames, TaskStatusBadge } from '../shared/TaskMarks';
import { TimerButton } from '../shared/TimerButton';
import { useIsTasksAdmin } from '../../store/tasksModuleStore';
import { canRequestRowCompletion, rowRights } from './taskListRules';

/**
 * Eine Aufgabe in der Liste (Görevly `V.taskRow`): Abhakkreis · Titel mit
 * Fähnchen · Metazeile · rechts Zeit und Personen (nur Leitung), Start/Pause
 * (nur wer messen darf) und das Menü. Ein Klick auf die Zeile öffnet die
 * Aufgabe; der Titel ist zusätzlich ein echter Link (Tastatur, Mittelklick).
 */

/* Laufende Zeit der Leitung: tickt nur, solange jemand misst — und nur dieses
   Stück, nicht die ganze Zeile. */
const RowWorkTime = ({ work, loadedAtMs }: { work: NonNullable<TaskRowDto['work']>; loadedAtMs: number }) => {
    const { liveCount } = work;
    const now = useNow(1000, liveCount > 0);
    const ms = work.totalMs + (liveCount ? liveCount * Math.max(0, now - loadedAtMs) : 0);
    if (!ms && !liveCount) return null;
    return (
        <span
            className="ofi-gv-meta ofi-gv-list-time"
            title={liveCount ? t('tasksModule.list.row.live') : t('tasksModule.list.row.workTime')}
        >
            {liveCount > 0 && <i className="ofi-gv-live" aria-hidden />}
            {formatDuration(ms)}
        </span>
    );
};

const checkLabel = (row: TaskRowDto, isAdmin: boolean): string => {
    if (row.status === 'COMPLETED') return t('tasksModule.list.row.reopen');
    if (!isAdmin) return t('tasksModule.list.menu.requestCompletion');
    return row.approvalState === 'PENDING' ? t('tasksModule.list.row.approve') : t('tasksModule.list.row.complete');
};

const RowDue = ({ row, nowMs }: { row: TaskRowDto; nowMs: number }) => {
    if (row.dueAt && isOpenStatus(row.status)) {
        const info = remainingInfo(row.dueAt, nowMs);
        if (!info) return null;
        return <span className={`ofi-gv-due ${info.tone ? `is-${info.tone}` : ''}`}>{info.text}</span>;
    }
    if (row.status === 'COMPLETED' && row.completedAt) {
        return <span className="ofi-gv-due">{smartDate(row.completedAt, false, nowMs)}</span>;
    }
    return null;
};

export const TaskRow = memo(({
    row,
    people,
    labelsById,
    nowMs,
    loadedAtMs,
    isManager,
    me,
    busy,
    guidePath,
    onCheck,
    onMenu,
}: {
    row: TaskRowDto;
    people: PeopleMap;
    labelsById: ReadonlyMap<string, LabelDto>;
    nowMs: number;
    loadedAtMs: number;
    isManager: boolean;
    me: string;
    busy: boolean;
    guidePath?: string;
    onCheck: (row: TaskRowDto) => void;
    onMenu: (row: TaskRowDto, anchor: HTMLElement) => void;
}) => {
    const navigate = useNavigate();
    const rights = rowRights(row, me, isManager);
    const done = row.status === 'COMPLETED';
    const labels = row.labelIds.map((id) => labelsById.get(id)).filter((label): label is LabelDto => Boolean(label)).slice(0, 2);
    // Ein Teammitglied ohne Messrecht kann an einem offenen Kreis nichts tun.
    const isAdmin = useIsTasksAdmin();
    const checkDisabled = busy || (done ? !isManager : !(isAdmin || canRequestRowCompletion(row, rights, isManager, isAdmin)));

    const warmDetail = () => {
        void loadTaskDetailPage();
        void tasksApi.prefetchDetail(row.id);
    };

    const openRow = (event: MouseEvent<HTMLDivElement>) => {
        if ((event.target as HTMLElement).closest('button, a')) return;
        navigate(guidePath ?? `/tasks/${row.id}`);
    };

    return (
        <div
            className={`ofi-gv-row ofi-gv-list-row ${done ? 'is-done' : ''}`}
            data-task-onboarding={guidePath ? 'true' : undefined}
            onClick={openRow}
            onPointerEnter={warmDetail}
            onPointerDown={warmDetail}
            onFocusCapture={warmDetail}
        >
            <button
                type="button"
                className={`ofi-gv-check ofi-btn-plain ${done ? 'is-done' : ''}`}
                aria-label={checkLabel(row, isAdmin)}
                title={checkLabel(row, isAdmin)}
                aria-pressed={done}
                disabled={!guidePath && checkDisabled}
                onClick={(event) => { event.stopPropagation(); if (guidePath) navigate(guidePath); else onCheck(row); }}
            >
                <LuCheck size={11} strokeWidth={3} aria-hidden />
            </button>

            <div className="ofi-gv-row__main">
                <div className="ofi-gv-row__title">
                    <Link to={guidePath ?? `/tasks/${row.id}`} className="ofi-gv-list-title">
                        {guidePath ? t('tasksModule.onboarding.taskTitle') : row.title}
                    </Link>
                    {guidePath && <span className="ofi-gv-first-task-tag"><LuBookOpen size={11} />{t('tasksModule.onboarding.firstBadge')}</span>}
                    {row.flagged && (
                        <LuFlag size={12} className="ofi-gv-flag shrink-0" aria-label={t('tasksModule.list.row.flagged')} />
                    )}
                </div>
                <div className="ofi-gv-row__meta">
                    <TaskStatusBadge status={row.effectiveStatus} />
                    <RowDue row={row} nowMs={nowMs} />
                    {row.checklist.total > 0 && (
                        <span className="ofi-gv-meta" title={t('tasksModule.list.row.checklist')}>
                            <LuListChecks size={13} aria-hidden />
                            {row.checklist.done}/{row.checklist.total}
                        </span>
                    )}
                    {row.commentCount > 0 && (
                        <span className="ofi-gv-meta" title={t('tasksModule.list.row.comments', { count: row.commentCount })}>
                            <LuMessageSquare size={12} aria-hidden />
                            {row.commentCount}
                        </span>
                    )}
                    {row.attachmentCount > 0 && (
                        <span className="ofi-gv-meta" title={t('tasksModule.list.row.attachments', { count: row.attachmentCount })}>
                            <LuPaperclip size={12} aria-hidden />
                            {row.attachmentCount}
                        </span>
                    )}
                    {labels.map((label) => <LabelChip key={label.id} label={label} />)}
                </div>
            </div>

            <div className="ofi-gv-row__side">
                {isManager && row.work && <RowWorkTime work={row.work} loadedAtMs={loadedAtMs} />}
                {isManager && <PeopleNames ids={row.assigneeIds} people={people} />}
                {!guidePath && rights.canTrack && <TimerButton taskId={row.id} running={row.timer.runningForMe} compact />}
                {!guidePath && <TaskIconButton
                    label={t('tasksModule.list.row.menu')}
                    aria-haspopup="menu"
                    onClick={(event) => { event.stopPropagation(); onMenu(row, event.currentTarget); }}
                >
                    <LuEllipsis size={15} />
                </TaskIconButton>}
            </div>
        </div>
    );
});

TaskRow.displayName = 'TaskRow';
