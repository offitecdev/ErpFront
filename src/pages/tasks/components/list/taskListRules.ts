import type { TaskListPeriod, TaskRow } from '@/types/tasksModule';
import { DAY_MS, isOpenStatus } from '../../utils/taskFormat';

/* Regeln der Liste, die keine Oberfläche brauchen: was eine Zeile darf und in
   welche Datumsgruppe sie fällt. Die Rechte prüft der Server ohnehin nach —
   hier entscheidet sich nur, welche Knöpfe erscheinen. */

export interface RowRights {
    mine: boolean;
    canTrack: boolean;
    canEdit: boolean;
    canFlag: boolean;
}

export const rowRights = (row: TaskRow, me: string, isManager: boolean): RowRights => {
    const mine = Boolean(me) && row.assigneeIds.includes(me);
    const canTrack = mine && isOpenStatus(row.status) && row.reviewState !== 'REJECTED';
    const canEdit = isManager || (row.createdById === me && row.reviewState === 'PENDING');
    return { mine, canTrack, canEdit, canFlag: canEdit || canTrack };
};

/**
 * Abschluss beantragen (13.09.2026): alle ausser der Administratorrolle —
 * Verantwortliche und die Leitung, solange die Aufgabe offen ist.
 */
export const canRequestRowCompletion = (row: TaskRow, rights: RowRights, isManager: boolean, isAdmin: boolean): boolean =>
    !isAdmin
    && row.approvalState !== 'PENDING'
    && isOpenStatus(row.status)
    && row.reviewState !== 'REJECTED'
    && (rights.canTrack || isManager);

export const TASK_LIST_PERIODS: TaskListPeriod[] = ['all', 'today', 'week', 'month'];

export const isTaskListPeriod = (value: unknown): value is TaskListPeriod =>
    TASK_LIST_PERIODS.includes(value as TaskListPeriod);

/**
 * Grenzen eines Zeitraums in der Zeitzone des Browsers: heute 00:00–23:59:59,
 * die Woche Montag–Sonntag, der Kalendermonat. `all` = ohne Grenzen.
 */
export const periodRange = (period: TaskListPeriod, nowMs: number): { from: string; to: string } | null => {
    if (period === 'all') return null;
    const start = new Date(nowMs);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    if (period === 'week') {
        start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
        end.setTime(start.getTime());
        end.setDate(end.getDate() + 7);
    } else if (period === 'month') {
        start.setDate(1);
        end.setTime(start.getTime());
        end.setMonth(end.getMonth() + 1);
    } else {
        end.setDate(end.getDate() + 1);
    }
    return { from: start.toISOString(), to: new Date(end.getTime() - 1).toISOString() };
};

export type TaskGroupKey = 'late' | 'today' | 'week' | 'later' | 'nodate' | 'other';

export interface TaskGroup {
    key: TaskGroupKey;
    rows: TaskRow[];
}

const endOfToday = (nowMs: number): number => {
    const date = new Date(nowMs);
    date.setHours(23, 59, 59, 999);
    return date.getTime();
};

const startOfToday = (nowMs: number): number => {
    const date = new Date(nowMs);
    date.setHours(0, 0, 0, 0);
    return date.getTime();
};

/**
 * Görevly `V.taskList`: die erste passende Gruppe gewinnt, die Reihenfolge der
 * Zeilen bleibt die des Servers (Fälligkeit aufsteigend). «Diğer» fängt auf,
 * was nirgends passt — z. B. Erledigtes mit vergangenem Termin.
 */
export const groupTaskRows = (rows: readonly TaskRow[], nowMs: number): TaskGroup[] => {
    const todayStart = startOfToday(nowMs);
    const todayEnd = endOfToday(nowMs);
    const weekEnd = nowMs + 7 * DAY_MS;
    const tests: Array<[TaskGroupKey, (row: TaskRow, due: number) => boolean]> = [
        ['late', (row) => row.overdue],
        ['today', (row, due) => Boolean(row.dueAt) && due >= todayStart && due <= todayEnd],
        ['week', (row, due) => Boolean(row.dueAt) && due > todayEnd && due <= weekEnd],
        ['later', (row, due) => Boolean(row.dueAt) && due > weekEnd],
        ['nodate', (row) => !row.dueAt],
    ];
    const buckets = new Map<TaskGroupKey, TaskRow[]>();
    for (const row of rows) {
        const due = row.dueAt ? Date.parse(row.dueAt) : Number.NaN;
        const hit = tests.find(([, test]) => test(row, due));
        const key = hit ? hit[0] : 'other';
        const bucket = buckets.get(key);
        if (bucket) bucket.push(row);
        else buckets.set(key, [row]);
    }
    const order: TaskGroupKey[] = ['late', 'today', 'week', 'later', 'nodate', 'other'];
    return order.filter((key) => buckets.has(key)).map((key) => ({ key, rows: buckets.get(key) ?? [] }));
};
