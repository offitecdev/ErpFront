import { t } from '@/i18n/translate';
import type { TaskActivity, TaskActivityKind, TaskStatus } from '@/types/productionTasks';

import { localToday } from '../tasks/taskModel';

/**
 * ── DER VERLAUF EINER STUFE · WAS DIE OBERFLÄCHE DARAUS MACHT (30.09.2026) ──
 *
 * «Who did what … xxx started a subtask, xxx stopped it, xxx sent it to the
 *  approval, xx uploaded a file … I should click and see the details.»
 *
 * Aus den Zeilen des Servers werden Einträge der Liste: mehrere Dateien, die
 * dieselbe Person kurz nacheinander an dieselbe Unteraufgabe hängt, sind EIN
 * Eintrag («hat 3 Dateien hochgeladen») — ein Klick zeigt alle.
 */

/** Die Filter der Liste. */
export type ActivityFilter = 'all' | 'work' | 'approval' | 'files' | 'changes';

const FILTER_OF: Record<TaskActivityKind, Exclude<ActivityFilter, 'all'>> = {
    SUBTASK_STARTED: 'work',
    SUBTASK_STOPPED: 'work',
    SUBTASK_SUBMITTED: 'work',
    SUBTASK_DONE: 'work',
    TASK_STATUS: 'work',
    SUBTASK_APPROVED: 'approval',
    REVISION_REQUESTED: 'approval',
    SUBTASK_UNLOCKED: 'approval',
    CHECKLIST_ITEM_ADDED: 'approval',
    UNLOCK_REQUESTED: 'approval',
    REQUEST_SOLVED: 'approval',
    FILE_UPLOADED: 'files',
    FILE_DELETED: 'files',
    SUBTASK_ASSIGNED: 'changes',
    TASK_CREATED: 'changes',
    TASK_UPDATED: 'changes',
    TASK_DELETED: 'changes',
    TASK_MOVED: 'changes',
    SUBTASK_CREATED: 'changes',
    SUBTASK_UPDATED: 'changes',
    SUBTASK_DELETED: 'changes',
    STAGE_ADDED: 'changes',
    PLAN_LOADED: 'changes',
    PLAN_REMOVED: 'changes',
};

export const ACTIVITY_FILTERS: readonly ActivityFilter[] = ['all', 'work', 'approval', 'files', 'changes'];

/** Die Arten eines Filters — für den Server; «alle» schickt keine. */
export const kindsOf = (filter: ActivityFilter): TaskActivityKind[] =>
    (filter === 'all' ? [] : (Object.keys(FILTER_OF) as TaskActivityKind[]).filter((kind) => FILTER_OF[kind] === filter));

/** Ein Kalendertag (lokal) als Zeitpunkt seines Beginns — `shift` Tage weiter (ISO). */
export const dayStartIso = (day: string, shift = 0): string => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date + shift).toISOString();
};

/** Die Seiten des Blätterns: 1 … 4 5 6 … 12 (null = Lücke). */
export const pageList = (page: number, pages: number): Array<number | null> => {
    if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1);
    const around = [page - 1, page, page + 1].filter((value) => value > 1 && value < pages);
    const list: Array<number | null> = [1];
    if (around[0] > 2) list.push(null);
    list.push(...around);
    if (around[around.length - 1] < pages - 1) list.push(null);
    list.push(pages);
    return list;
};

/** Ein Eintrag der Liste: eine Zeile — oder mehrere Uploads, zusammengefasst. */
export interface ActivityEntry {
    key: string;
    kind: TaskActivityKind;
    at: string;
    actorId: string | null;
    actorName: string | null;
    /** Die Zeilen des Eintrags, neueste zuerst — meist genau eine. */
    rows: TaskActivity[];
}

/** So nah beieinander gelten Uploads als EIN Vorgang. */
const UPLOAD_BURST_MS = 10 * 60 * 1000;

/**
 * Die Zeilen (neueste zuerst) als Einträge: Uploads derselben Person an
 * dieselbe Unteraufgabe, ohne etwas dazwischen und kurz nacheinander, rücken zusammen.
 */
export const activityEntries = (rows: readonly TaskActivity[]): ActivityEntry[] => {
    const entries: ActivityEntry[] = [];
    for (const row of rows) {
        const last = entries[entries.length - 1];
        const oldest = last?.rows[last.rows.length - 1];
        if (
            last && oldest
            && row.kind === 'FILE_UPLOADED' && last.kind === 'FILE_UPLOADED'
            && row.actorId === last.actorId
            && row.subtaskId === last.rows[0].subtaskId
            && Date.parse(oldest.at) - Date.parse(row.at) <= UPLOAD_BURST_MS
        ) {
            last.rows.push(row);
            continue;
        }
        entries.push({ key: row.id, kind: row.kind, at: row.at, actorId: row.actorId, actorName: row.actorName, rows: [row] });
    }
    return entries;
};

/* ── Satzbau ─────────────────────────────────────────────────────────── */

/**
 * Ein Satz mit hervorgehobenen Stellen: die Übersetzung trägt Platzhalter
 * ({{actor}}, {{target}} …); sie werden durch Marken ersetzt und danach als
 * Teile zurückgegeben — die Oberfläche setzt die Namen fett.
 */
export type SentencePart = { text: string; strong: boolean };

const MARK = '\u0001';

export const sentence = (key: string, values: Record<string, string | number>): SentencePart[] => {
    const marked: Record<string, string> = {};
    for (const [name, value] of Object.entries(values)) {
        marked[name] = typeof value === 'number' ? String(value) : `${MARK}${value}${MARK}`;
    }
    // Die Zahl steht zusätzlich als `count` da — sie wählt die Mehrzahl.
    const count = typeof values.count === 'number' ? values.count : undefined;
    const text = t(key, { ...marked, ...(count === undefined ? {} : { count }) });
    return text.split(MARK).map((piece, index) => ({ text: piece, strong: index % 2 === 1 })).filter((part) => part.text);
};

/** «M-01.2 · Verdrahtung» bzw. «M-01 · Schaltschrank». */
export const targetOf = (row: TaskActivity): string => {
    if (row.subtaskCode || row.subtaskName) return [row.subtaskCode, row.subtaskName].filter(Boolean).join(' · ');
    return [row.taskCode, row.taskName].filter(Boolean).join(' · ');
};

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);

export const statusName = (status: unknown): string =>
    (typeof status === 'string' && status ? t(`productionTasks.status.${status as TaskStatus}`) : '—');

/** Der Satz eines Eintrags. `stageNameOf` nennt Stufen (verschoben, neu). */
export const entrySentence = (
    entry: ActivityEntry,
    stageNameOf: (area: string | null, stage: string | null) => string,
): SentencePart[] => {
    const row = entry.rows[0];
    const details = row.details ?? {};
    const actor = entry.actorName || t('productionTasks.activity.someone');
    const target = targetOf(row);
    const key = `productionTasks.activity.says.${entry.kind}`;
    switch (entry.kind) {
        case 'FILE_UPLOADED': {
            if (entry.rows.length > 1) {
                return sentence('productionTasks.activity.says.FILES_UPLOADED', { actor, target, count: entry.rows.length });
            }
            const version = num(details.version);
            return version > 1
                ? sentence('productionTasks.activity.says.FILE_REVISED', { actor, target, file: str(details.name), version })
                : sentence(key, { actor, target, file: str(details.name) });
        }
        case 'FILE_DELETED':
            return sentence(key, { actor, target, file: str(details.name) });
        case 'SUBTASK_ASSIGNED': {
            const added = Array.isArray(details.added) ? details.added as Array<{ name?: string }> : [];
            const removed = Array.isArray(details.removed) ? details.removed as Array<{ name?: string }> : [];
            const names = (list: Array<{ name?: string }>) => list.map((person) => person.name || '—').join(', ');
            if (added.length && !removed.length) return sentence('productionTasks.activity.says.ASSIGNED_ADDED', { actor, target, people: names(added) });
            if (removed.length && !added.length) return sentence('productionTasks.activity.says.ASSIGNED_REMOVED', { actor, target, people: names(removed) });
            // Beides in einem Schritt: ausdrücklich, wer kam und wer ging (30.09.2026).
            if (added.length && removed.length) {
                return sentence('productionTasks.activity.says.ASSIGNED_BOTH', { actor, target, added: names(added), removed: names(removed) });
            }
            return sentence(key, { actor, target });
        }
        case 'TASK_STATUS':
            return sentence(key, { actor, target, status: statusName(details.to) });
        case 'CHECKLIST_ITEM_ADDED':
            return sentence(key, { actor, target, text: str(details.text) });
        case 'TASK_MOVED':
            return sentence(key, { actor, target, stage: stageNameOf(str(details.toArea), str(details.toStage)) });
        case 'STAGE_ADDED':
            return sentence(key, { actor, stage: str(details.name) || stageNameOf(row.area, row.stage) });
        case 'PLAN_LOADED':
            return sentence(details.previousTemplateName ? 'productionTasks.activity.says.PLAN_REPLACED' : key, {
                actor,
                template: str(details.templateName),
            });
        case 'PLAN_REMOVED':
            return sentence(key, { actor, template: str(details.templateName) || '—' });
        default:
            return sentence(key, { actor, target });
    }
};

/* ── Zeit ────────────────────────────────────────────────────────────── */

const two = (value: number) => String(value).padStart(2, '0');

/** Der Kalendertag (lokal) eines Zeitpunkts — `YYYY-MM-DD`. */
export const localDayOf = (iso: string): string => {
    const date = new Date(iso);
    return `${date.getFullYear()}-${two(date.getMonth() + 1)}-${two(date.getDate())}`;
};

/** Die Überschrift eines Tages: «Heute», «Gestern» oder «Mo., 28.09.2026». */
export const dayHeading = (day: string): string => {
    const today = localToday();
    const [y, m, d] = today.split('-').map(Number);
    const yesterday = new Date(y, m - 1, d - 1);
    const yesterdayKey = `${yesterday.getFullYear()}-${two(yesterday.getMonth() + 1)}-${two(yesterday.getDate())}`;
    if (day === today) return t('productionTasks.activity.today');
    if (day === yesterdayKey) return t('productionTasks.activity.yesterday');
    const [year, month, date] = day.split('-').map(Number);
    const weekday = new Date(year, month - 1, date).toLocaleDateString(document.documentElement.lang || undefined, { weekday: 'short' });
    return `${weekday}, ${two(date)}.${two(month)}.${year}`;
};

/** Die Einträge nach Tagen — in der Reihenfolge der Liste (neueste zuerst). */
export const byDay = (entries: readonly ActivityEntry[]): Array<{ day: string; entries: ActivityEntry[] }> => {
    const days: Array<{ day: string; entries: ActivityEntry[] }> = [];
    for (const entry of entries) {
        const day = localDayOf(entry.at);
        const last = days[days.length - 1];
        if (last?.day === day) last.entries.push(entry);
        else days.push({ day, entries: [entry] });
    }
    return days;
};

/** Eine Dateigrösse, kurz: «842 KB», «3,1 MB». */
export const formatSize = (bytes: number): string => {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toLocaleString(document.documentElement.lang || undefined, { maximumFractionDigits: 1 })} MB`;
};
