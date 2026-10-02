import type { ProductionTask, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { localToday, subtaskCode } from '../tasks/taskModel';

/* Die Dateien einer Stufe und ihre Tage (28.09.2026). */

export interface StageFile {
    task: ProductionTask;
    subtask: TaskSubtask;
    code: string;
    file: TaskSubtaskFile;
    /** Der Kalendertag des Hochladens (Ortszeit), `YYYY-MM-DD`. */
    day: string;
}

const pad = (value: number) => String(value).padStart(2, '0');
export const dayKey = (date: Date): string => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const dayOf = (iso: string): string => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : dayKey(date);
};
export const shiftDay = (day: string, by: number): string => {
    const [y, m, d] = day.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + by));
};

/**
 * Die Tage einer Aufgabe (28.09.2026): vom Beginn (sonst dem Tag des Anlegens
 * — «start date, default is the created at») bis zum Termin; ohne Termin offen.
 */
const taskWindow = (task: ProductionTask): { start: string | null; end: string | null } => ({
    start: task.startDate ?? task.createdAt ?? null,
    end: task.dueDate ?? null,
});

/**
 * Der Beginn der ersten Aufgabe der Stufe — dort beginnt die Dateihistorie
 * (28.09.2026: «starting date of the file history should be the starting date
 * of the first task»). null, wenn keine Aufgabe einen Tag trägt.
 */
export const firstTaskStart = (tasks: readonly ProductionTask[]): string | null =>
    tasks.reduce<string | null>((first, task) => {
        const { start } = taskWindow(task);
        return start && (!first || start < first) ? start : first;
    }, null);

/**
 * Muss `personId` an `day` hochladen? Nur an Tagen, die in einer ihrer
 * Aufgaben der Stufe liegen (28.09.2026: «the assigned person won't upload
 * files for the days that aren't in the days of their task»).
 */
export const dutyChecker = (tasks: readonly ProductionTask[]) => {
    const windows = new Map<string, Array<{ start: string | null; end: string | null }>>();
    for (const task of tasks) {
        const window = taskWindow(task);
        for (const id of task.assigneeIds) windows.set(id, [...(windows.get(id) ?? []), window]);
    }
    return (personId: string, day: string): boolean =>
        (windows.get(personId) ?? []).some(({ start, end }) => (!start || day >= start) && (!end || day <= end));
};

/**
 * Wer heute in dieser Stufe hochladen müsste und es noch nicht getan hat
 * (02.10.2026: «if the employee doesn't upload a file that day show a text on
 * the files button and file history button»). Dieselbe Pflicht wie in der
 * Historie (`dutyChecker`: der Tag liegt im Zeitraum seiner Aufgabe) — nur
 * ohne erledigte Aufgaben.
 */
export const missingUploadsToday = (tasks: readonly ProductionTask[], today: string): string[] => {
    const open = tasks.filter((task) => task.status !== 'DONE');
    const isDutyDay = dutyChecker(open);
    const uploaded = new Set(stageFilesOf(tasks).filter((entry) => entry.day === today).map((entry) => entry.file.uploadedById));
    return [...new Set(open.flatMap((task) => task.assigneeIds))].filter((id) => isDutyDay(id, today) && !uploaded.has(id));
};

/**
 * Eine Aufgabe, an der heute noch keine Datei hängt, obwohl heute ihr Tag ist
 * (02.10.2026: «show red ! on the tasks if no document is uploaded that day»):
 * nicht erledigt, mit Personen und Unteraufgaben (an ihnen hängen die Dateien),
 * heute in ihrem Zeitraum — dieselbe Pflicht wie in der Historie.
 */
export const taskMissingToday = (task: ProductionTask, today: string): boolean => {
    if (task.status === 'DONE' || !task.assigneeIds.length || !task.subtasks.length) return false;
    const { start, end } = taskWindow(task);
    if ((start && today < start) || (end && today > end)) return false;
    return !task.subtasks.some((subtask) => subtask.files.some((file) => dayOf(file.uploadedAt) === today));
};

/** Der späteste Termin der Aufgaben der Stufe — bis dahin reicht die Historie. */
export const lastTaskDue = (tasks: readonly ProductionTask[]): string | null =>
    tasks.reduce<string | null>((last, task) => (task.dueDate && (!last || task.dueDate > last) ? task.dueDate : last), null);

/** Wie viele Tage von `from` bis `to` (beide `YYYY-MM-DD`). */
export const dayDiff = (from: string, to: string): number => {
    const utc = (day: string) => { const [y, m, d] = day.split('-').map(Number); return Date.UTC(y, m - 1, d); };
    return Math.round((utc(to) - utc(from)) / 86_400_000);
};

/** Höchstens so viele Tage zeigt die Historie — sonst wird die Tabelle unlesbar. */
export const HISTORY_MAX_DAYS = 62;

/**
 * Die Tage von `from` bis `to`, die jüngsten `HISTORY_MAX_DAYS`. Auch Tage
 * nach heute (28.09.2026: «the due date is 30 but I only see 28») — bis zum
 * Termin der Aufgaben.
 */
export const daysBetween = (from: string, to: string): string[] => {
    const last = to || localToday();
    const days: string[] = [];
    for (let day = last; (!from || day >= from) && days.length < HISTORY_MAX_DAYS; day = shiftDay(day, -1)) days.push(day);
    return days.reverse();
};

/** Alle Dateien der Stufe, die neuesten zuerst. */
export const stageFilesOf = (tasks: readonly ProductionTask[]): StageFile[] =>
    tasks
        .flatMap((task) => task.subtasks.flatMap((subtask, index) =>
            subtask.files.map((file) => ({ task, subtask, code: subtaskCode(task.code, index), file, day: dayOf(file.uploadedAt) }))))
        .sort((a, b) => b.file.uploadedAt.localeCompare(a.file.uploadedAt));
