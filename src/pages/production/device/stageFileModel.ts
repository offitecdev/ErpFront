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

/** Höchstens so viele Tage zeigt die Historie — sonst wird die Tabelle unlesbar. */
export const HISTORY_MAX_DAYS = 62;

/** Die Tage von `from` bis `to` (höchstens bis heute), die jüngsten `HISTORY_MAX_DAYS`. */
export const daysBetween = (from: string, to: string): string[] => {
    const last = to && to < localToday() ? to : localToday();
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
