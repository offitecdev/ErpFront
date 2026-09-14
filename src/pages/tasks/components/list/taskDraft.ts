import type { TaskUpdateInput } from '@/lib/api/tasksModule';
import type { TaskDetail, TaskPriority } from '@/types/tasksModule';
import { isoToDateInput } from '../../utils/taskFormat';

/* Der Entwurf im Fenster «Yeni görev / Görevi düzenle» und was davon beim
   Speichern an den Server geht — nur, was sich wirklich geändert hat. */

export interface TaskDraft {
    title: string;
    description: string;
    assigneeIds: string[];
    startAt: string | null;
    dueAt: string | null;
    reminderAt: string | null;
    labelIds: string[];
    priority: TaskPriority;
    flagged: boolean;
}

export const TASK_PRIORITIES: TaskPriority[] = ['LOW', 'MEDIUM', 'HIGH'];

const HOUR_MS = 3_600_000;

/** Neu: Beginn = jetzt (Görevly), Rest leer. */
export const emptyDraft = (nowMs: number): TaskDraft => ({
    title: '',
    description: '',
    assigneeIds: [],
    startAt: new Date(nowMs).toISOString(),
    dueAt: null,
    reminderAt: null,
    labelIds: [],
    priority: 'MEDIUM',
    flagged: false,
});

export const draftFromTask = (task: TaskDetail): TaskDraft => ({
    title: task.title,
    description: task.description ?? '',
    assigneeIds: [...task.assigneeIds],
    startAt: task.startAt,
    dueAt: task.dueAt,
    reminderAt: task.reminderAt,
    labelIds: [...task.labelIds],
    priority: task.priority,
    flagged: task.flagged,
});

/** Schnellwahl «Bugün»/«Yarın»: der Tag um 18:00 — das Ende eines Arbeitstags wie in Görevly. */
export const dayAtSix = (nowMs: number, offsetDays: number): string => {
    const date = new Date(nowMs);
    date.setDate(date.getDate() + offsetDays);
    date.setHours(18, 0, 0, 0);
    return date.toISOString();
};

export const isOnDay = (iso: string | null, nowMs: number, offsetDays: number): boolean =>
    Boolean(iso) && isoToDateInput(iso) === isoToDateInput(dayAtSix(nowMs, offsetDays));

export const inOneHour = (nowMs: number): string => new Date(nowMs + HOUR_MS).toISOString();

export const dueBeforeStart = (draft: Pick<TaskDraft, 'startAt' | 'dueAt'>): boolean =>
    Boolean(draft.startAt && draft.dueAt) && Date.parse(draft.dueAt as string) < Date.parse(draft.startAt as string);

const sameInstant = (a: string | null, b: string | null): boolean =>
    (a ? Date.parse(a) : null) === (b ? Date.parse(b) : null);

export const sameIdSet = (a: readonly string[], b: readonly string[]): boolean =>
    a.length === b.length && a.every((id) => b.includes(id));

/** Nur geänderte Felder — ein leerer Patch heisst: nichts senden. */
export const scalarPatch = (draft: TaskDraft, task: TaskDetail): TaskUpdateInput => {
    const patch: TaskUpdateInput = {};
    const title = draft.title.trim();
    const description = draft.description.trim() || null;
    if (title !== task.title) patch.title = title;
    if (description !== (task.description || null)) patch.description = description;
    if (!sameInstant(draft.startAt, task.startAt)) patch.startAt = draft.startAt;
    if (!sameInstant(draft.dueAt, task.dueAt)) patch.dueAt = draft.dueAt;
    if (!sameInstant(draft.reminderAt, task.reminderAt)) patch.reminderAt = draft.reminderAt;
    if (draft.priority !== task.priority) patch.priority = draft.priority;
    if (draft.flagged !== task.flagged) patch.flagged = draft.flagged;
    return patch;
};
