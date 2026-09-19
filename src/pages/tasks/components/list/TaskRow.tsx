import { memo, type MouseEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LuBookOpen, LuCheck, LuEllipsis, LuFlag, LuHourglass, LuListChecks, LuMessageSquare, LuPaperclip } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi } from '@/lib/api/tasksModule';
import type { LabelDto, PeopleMap, TaskRow as TaskRowDto } from '@/types/tasksModule';
import { loadTaskDetailPage } from '../../taskRouteLoaders';
import { useNow } from '../../hooks/useNow';
import { selectTimerRunning } from '../../hooks/useTaskTimer';
import { pendingOwnMs } from '../../utils/ownSessions';
import { completionInfo, formatDuration, isOpenStatus, remainingInfo, smartDate } from '../../utils/taskFormat';
import { TaskIconButton } from '../shared/TaskButton';
import { LabelChip, PeopleNames, TaskStatusBadge } from '../shared/TaskMarks';
import { TimerButton } from '../shared/TimerButton';
import { WorkingMark } from '../shared/WorkingMark';
import { useIsTasksAdmin, useTasksModuleStore } from '../../store/tasksModuleStore';
import { canCompleteRow, rowRights } from './taskListRules';

/**
 * Eine Aufgabe in der Liste (Görevly `V.taskRow`): Abhakkreis · Titel mit
 * Fähnchen · Metazeile · rechts Zeit und Personen (nur Leitung), Start/Pause
 * (nur wer messen darf) und das Menü. Ein Klick auf die Zeile öffnet die
 * Aufgabe; der Titel ist zusätzlich ein echter Link (Tastatur, Mittelklick).
 */

/* Arbeitszeit der Zeile — KEINE UHR (14.09.2026, Samet: «canlı sayımı kaldır,
   süreyi görmek için durdurun»): läuft die eigene Messung, steht hier nur
   «Çalışılıyor». Sonst die Summe der abgeschlossenen Messungen des Tages
   (Server) plus der eigene eben beendete Stopp, den der Server noch nicht
   mitliefert (ownSessions) — die Zahl fällt nach dem Pausieren nie zurück.
   Misst jemand anderes (die Leitung sieht das), steht das leise daneben. */
const RowWorkTime = ({ taskId, work, timer, loadedAtMs, ownRunning }: {
    taskId: string;
    work: TaskRowDto['work'];
    timer: TaskRowDto['timer'];
    loadedAtMs: number;
    ownRunning: boolean;
}) => {
    // Nur der Kalendertag hängt an «jetzt» — Minutentakt, keine Uhr.
    const nowMs = useNow(60_000);
    if (ownRunning) {
        return (
            <span className="ofi-gv-meta ofi-gv-list-time is-working" title={t('tasksModule.list.row.live')}>
                <WorkingMark />
            </span>
        );
    }
    const ms = (work?.dayMs ?? 0) + pendingOwnMs({
        taskId,
        loadedAtMs,
        ownServerRunning: timer.runningForMe,
        ownServerStartedAt: timer.myStartedAt,
        nowMs,
    });
    // Fremde laufende Messungen laut Server — die eigene (falls die Zeile sie noch nennt) nicht mitzählen.
    const others = Math.max(0, (work?.liveCount ?? 0) - (timer.runningForMe ? 1 : 0));
    if (!ms && !others) return null;
    return (
        <span
            className={`ofi-gv-meta ofi-gv-list-time ${others ? 'is-live' : ''}`}
            title={others ? t('tasksModule.list.row.live') : t('tasksModule.list.row.workTime')}
        >
            {others > 0 && <WorkingMark tone="others" />}
            {ms > 0 && formatDuration(ms)}
        </span>
    );
};

const checkLabel = (row: TaskRowDto): string =>
    (row.status === 'COMPLETED' ? t('tasksModule.list.row.reopen') : t('tasksModule.list.row.complete'));

/* Offen: Restzeit bzw. Verzug. Erledigt: Datum und — mit Termin — ob zu spät
   (14.09.2026). */
const RowDue = ({ row, nowMs }: { row: TaskRowDto; nowMs: number }) => {
    if (row.dueAt && isOpenStatus(row.status)) {
        const info = remainingInfo(row.dueAt, nowMs);
        if (!info) return null;
        return <span className={`ofi-gv-due ${info.tone ? `is-${info.tone}` : ''}`}>{info.text}</span>;
    }
    if (row.status === 'COMPLETED' && row.completedAt) {
        const delivery = completionInfo(row.dueAt, row.completedAt);
        return (
            <span className={`ofi-gv-due ${delivery?.tone === 'late' ? 'is-late' : ''}`}>
                {smartDate(row.completedAt, false, nowMs)}
                {delivery?.tone === 'late' ? ` · ${delivery.text}` : ''}
            </span>
        );
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
    // Der Store wechselt im selben Klick — die Zeile färbt sich sofort («rengi değişsin»).
    const ownRunning = useTasksModuleStore(selectTimerRunning(row.id, row.timer.runningForMe));
    const labels = row.labelIds.map((id) => labelsById.get(id)).filter((label): label is LabelDto => Boolean(label)).slice(0, 2);
    // Ein Teammitglied ohne Messrecht kann an einem offenen Kreis nichts tun.
    const isAdmin = useIsTasksAdmin();
    const checkDisabled = busy || (done ? !isManager : !canCompleteRow(row, rights, isManager));

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
            className={`ofi-gv-row ofi-gv-list-row ${done ? 'is-done' : ''} ${ownRunning ? 'is-working' : ''}`}
            data-task-onboarding={guidePath ? 'true' : undefined}
            onClick={openRow}
            onPointerEnter={warmDetail}
            onPointerDown={warmDetail}
            onFocusCapture={warmDetail}
        >
            <button
                type="button"
                className={`ofi-gv-check ofi-btn-plain ${done ? 'is-done' : ''}`}
                aria-label={checkLabel(row)}
                title={checkLabel(row)}
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
                    {/* Administrator: verspätet fertig gemeldet — der Text steht im Detail (15.09.2026). */}
                    {isAdmin && row.hasDelayReason && (
                        <span className="ofi-gv-delay-tag">
                            <LuHourglass size={11} aria-hidden />
                            {t('tasksModule.delay.rowBadge')}
                        </span>
                    )}
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
                {/* Leitung: Zeit aller Personen; alle anderen: nur die eigene (der Server rechnet so). */}
                <RowWorkTime taskId={row.id} work={row.work} timer={row.timer} loadedAtMs={loadedAtMs} ownRunning={ownRunning} />
                {isManager && <PeopleNames ids={row.assigneeIds} people={people} />}
                {!guidePath && rights.canTrack && <TimerButton taskId={row.id} running={row.timer.runningForMe} taskTitle={row.title} compact />}
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
