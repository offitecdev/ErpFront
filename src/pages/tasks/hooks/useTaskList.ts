import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskDetail, TaskListFilter, TaskListParams, TaskListPeriod, TaskListResult, TaskRow } from '@/types/tasksModule';
import { periodRange } from '../components/list/taskListRules';
import { useTasksModuleStore } from '../store/tasksModuleStore';
import { useTasksChanged } from '../utils/taskEvents';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';

/**
 * ── DATEN DER AUFGABENLISTE (/tasks) ─────────────────────────────────────────
 *
 * Filtert am SERVER (Teammitglieder bekommen dort ohnehin nur ihre Aufgaben),
 * blättert mit «Daha fazla yükle» seitenweise nach und lädt leise neu: nach
 * jedem Rundruf des Moduls und jede Minute, solange der Tab sichtbar ist.
 * Ein leises Neuladen holt alle bereits gezeigten Seiten, damit die Liste
 * nicht auf die erste Seite zurückspringt.
 */

export const TASK_LIST_PAGE_SIZE = 200;
const POLL_MS = 60_000;
const SEARCH_DEBOUNCE_MS = 250;
/* Mehrere Rundrufe kurz hintereinander (Timer + Aufgabe) = EIN Neuladen. */
const CHANGE_COALESCE_MS = 150;

export interface TaskListQuery {
    filter: TaskListFilter;
    period: TaskListPeriod;
    assigneeId: string;
    labelId: string;
    q: string;
}

/** `q` kommt bereits entprellt und getrimmt. */
const toParams = ({ filter, period, assigneeId, labelId, q }: TaskListQuery): TaskListParams => ({
    filter,
    assigneeId: assigneeId || undefined,
    labelId: labelId || undefined,
    q: q || undefined,
    ...(periodRange(period, Date.now()) ?? {}),
    pageSize: TASK_LIST_PAGE_SIZE,
});

const isNarrowed = (params: TaskListParams): boolean =>
    params.filter !== 'all' || Boolean(params.assigneeId || params.labelId || params.q || params.from);

/* Letzter Stand je Filter (stale-while-revalidate): ein Wiederbesuch zeigt die
   Liste sofort, das frische Laden läuft leise daneben. Zeitraumgrenzen gehören
   nicht in den Schlüssel — «Bu hafta» bleibt dieselbe Ansicht. */
interface CachedList {
    rows: TaskRow[];
    people: PeopleMap;
    total: number;
    serverNow: string;
}

const cacheKey = (query: Omit<TaskListQuery, 'q'> & { q: string }): string =>
    `list:${JSON.stringify([query.filter, query.period, query.assigneeId, query.labelId, query.q])}`;

export const useTaskList = (query: TaskListQuery, enabled: boolean) => {
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);

    const [debouncedQ, setDebouncedQ] = useState(query.q.trim());
    const [rows, setRows] = useState<TaskRow[]>([]);
    const [people, setPeople] = useState<PeopleMap>({});
    const [total, setTotal] = useState(0);
    const [loaded, setLoaded] = useState(false);
    const [fetching, setFetching] = useState(false);
    const [loadingMore, setLoadingMore] = useState(false);
    const [error, setError] = useState<unknown>(null);
    /** Serverzeit der letzten Antwort — Basis der laufenden Uhren in den Zeilen. */
    const [loadedAtMs, setLoadedAtMs] = useState(0);
    /** Gibt es überhaupt Aufgaben? Nur geprüft, wenn ein Filter leer bleibt (Leertext). */
    const [anyTasks, setAnyTasks] = useState<boolean | null>(null);

    const requestRef = useRef(0);
    const pagesRef = useRef(1);
    const paramsRef = useRef<TaskListParams>(toParams({ ...query, q: debouncedQ }));
    const keyRef = useRef(cacheKey({ ...query, q: debouncedQ }));

    useEffect(() => {
        const next = query.q.trim();
        const id = window.setTimeout(() => setDebouncedQ(next), SEARCH_DEBOUNCE_MS);
        return () => window.clearTimeout(id);
    }, [query.q]);

    const { filter, period, assigneeId, labelId } = query;
    useEffect(() => {
        paramsRef.current = toParams({ filter, period, assigneeId, labelId, q: debouncedQ });
        keyRef.current = cacheKey({ filter, period, assigneeId, labelId, q: debouncedQ });
    }, [filter, period, assigneeId, labelId, debouncedQ]);

    const apply = useCallback((results: TaskListResult[], params: TaskListParams) => {
        const seen = new Set<string>();
        const merged: TaskRow[] = [];
        let mergedPeople: PeopleMap = {};
        for (const result of results) {
            mergedPeople = { ...mergedPeople, ...result.people };
            for (const row of result.data) {
                if (seen.has(row.id)) continue;
                seen.add(row.id);
                merged.push(row);
            }
        }
        const last = results[results.length - 1];
        writeTasksCache<CachedList>(keyRef.current, { rows: merged, people: mergedPeople, total: last.total, serverNow: last.serverNow });
        setRows(merged);
        setPeople(mergedPeople);
        setTotal(last.total);
        setLoadedAtMs(Date.parse(last.serverNow));
        noteServerNow(last.serverNow);
        setError(null);
        setLoaded(true);
        if (merged.length || !isNarrowed(params)) {
            setAnyTasks(merged.length > 0);
            return;
        }
        tasksApi.list({ filter: 'all', pageSize: 1 })
            .then((probe) => setAnyTasks(probe.total > 0))
            .catch(() => setAnyTasks(null));
    }, [noteServerNow]);

    const load = useCallback(async (silent: boolean) => {
        const id = ++requestRef.current;
        const params = paramsRef.current;
        const pageCount = silent ? pagesRef.current : 1;
        if (!silent) setFetching(true);
        try {
            const results = await Promise.all(
                Array.from({ length: pageCount }, (_, index) => tasksApi.list({ ...params, page: index + 1 })),
            );
            if (id !== requestRef.current) return;
            pagesRef.current = pageCount;
            apply(results, params);
        } catch (loadError) {
            if (id !== requestRef.current) return;
            // Ein ausgefallenes Hintergrund-Neuladen lässt die Liste stehen.
            if (!silent) setError(loadError);
        } finally {
            if (id === requestRef.current) setFetching(false);
        }
    }, [apply]);

    useEffect(() => {
        if (!enabled) return;
        const cached = readTasksCache<CachedList>(keyRef.current);
        if (cached) {
            setRows(cached.rows);
            setPeople(cached.people);
            setTotal(cached.total);
            setLoadedAtMs(Date.parse(cached.serverNow));
            setAnyTasks(cached.rows.length > 0 ? true : null);
            setError(null);
            setLoaded(true);
            pagesRef.current = 1;
        }
        void load(false);
    }, [enabled, filter, period, assigneeId, labelId, debouncedQ, load]);

    const loadMore = useCallback(async () => {
        // Kein eigener Zähler: beginnt inzwischen ein Neuladen, gilt dessen Antwort.
        const id = requestRef.current;
        const nextPage = pagesRef.current + 1;
        setLoadingMore(true);
        try {
            const result = await tasksApi.list({ ...paramsRef.current, page: nextPage });
            if (id !== requestRef.current) return;
            pagesRef.current = nextPage;
            setRows((current) => {
                const known = new Set(current.map((row) => row.id));
                return [...current, ...result.data.filter((row) => !known.has(row.id))];
            });
            setPeople((current) => ({ ...current, ...result.people }));
            setTotal(result.total);
        } catch {
            /* Der Knopf bleibt stehen — ein zweiter Klick versucht es erneut. */
        } finally {
            setLoadingMore(false);
        }
    }, []);

    // Rundrufe des Moduls und der Minutentakt: leise, ohne Ladezustand.
    const coalesceRef = useRef(0);
    useTasksChanged((kind) => {
        if (!enabled || (kind !== 'task' && kind !== 'timer')) return;
        window.clearTimeout(coalesceRef.current);
        coalesceRef.current = window.setTimeout(() => void load(true), CHANGE_COALESCE_MS);
    });

    useEffect(() => {
        if (!enabled) return undefined;
        const id = window.setInterval(() => { if (!document.hidden) void load(true); }, POLL_MS);
        return () => {
            window.clearInterval(id);
            window.clearTimeout(coalesceRef.current);
        };
    }, [enabled, load]);

    /** Antwort einer Änderung sofort zeigen (das Neuladen folgt über den Rundruf). */
    // Antworten der Schreibwege tragen die volle Aufgabe — in die Zeile kommt nur, was die Liste führt.
    const patchRow = useCallback((task: TaskRow | TaskDetail, nextPeople?: PeopleMap) => {
        setRows((current) => current.map((row) => (row.id === task.id ? { ...row, ...toListRow(task) } : row)));
        if (nextPeople) setPeople((current) => ({ ...current, ...nextPeople }));
    }, []);

    const removeRow = useCallback((taskId: string) => {
        setRows((current) => current.filter((row) => row.id !== taskId));
        setTotal((current) => Math.max(0, current - 1));
    }, []);

    return {
        rows,
        people,
        total,
        loaded,
        fetching,
        loadingMore,
        error,
        loadedAtMs,
        anyTasks,
        hasMore: rows.length < total,
        loadMore,
        reload: load,
        patchRow,
        removeRow,
    };
};

export type TaskListState = ReturnType<typeof useTaskList>;

/** Die Listenfelder einer Aufgabe (eine Detailantwort kennt mehr, und `work` in anderer Form). */
export const toListRow = (task: TaskRow | TaskDetail): TaskRow => ({
    id: task.id,
    title: task.title,
    status: task.status,
    effectiveStatus: task.effectiveStatus,
    flagged: task.flagged,
    dueAt: task.dueAt,
    completedAt: task.completedAt,
    createdById: task.createdById,
    approvalState: task.approvalState,
    reviewState: task.reviewState,
    blockReason: task.blockReason,
    deleteRequestedById: task.deleteRequestedById,
    assigneeIds: task.assigneeIds,
    labelIds: task.labelIds,
    checklist: task.checklist,
    commentCount: task.commentCount,
    attachmentCount: task.attachmentCount,
    overdue: task.overdue,
    timer: { runningForMe: task.timer.runningForMe },
    ...(task.work ? {
        work: 'liveCount' in task.work
            ? task.work
            : { totalMs: task.work.totalMs, liveCount: task.work.live.length },
    } : {}),
});
