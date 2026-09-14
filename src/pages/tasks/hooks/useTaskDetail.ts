import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type {
    Checklist,
    ChecklistItem,
    ChecklistProgress,
    ContentDto,
    PeopleMap,
    TaskAttachment,
    TaskComment,
    TaskDetail,
    TaskDetailResult,
} from '@/types/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';
import { emitTasksChanged, useTasksChanged, type TasksChangeKind } from '../utils/taskEvents';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';

const detailCacheKey = (taskId: string): string => `detail:${taskId}`;

/**
 * ── DETAIL EINER AUFGABE: Daten und Änderungen ───────────────────────────────
 *
 * Hält die Antwort von GET /tasks/:id und alles, was die Seite daran ändert.
 * Die Bausteine rufen nie selbst `setState` auf der ganzen Antwort, sondern die
 * kleinen Helfer hier (Checkliste ersetzen, Punkt einfügen, Fortschritt …) —
 * so bleibt jede Änderung an EINER Stelle nachvollziehbar.
 *
 * Nachladen (alle 30 s bei sichtbarem Tab, bei Rundrufen anderer Stellen):
 * der Inhalt des Editors wird dabei NICHT überschrieben, solange dort noch
 * ungespeicherte Eingaben liegen (`contentBusyRef`, gesetzt vom Editor).
 */

const POLL_MS = 30_000;

type Envelope = { task: TaskDetail; people: PeopleMap };

export const useTaskDetail = (taskId: string) => {
    // Letzter Stand sofort (tasksCache), frisch im Hintergrund — Vorgabe 100–200 ms.
    const [data, setDataState] = useState<TaskDetailResult | null>(() => (taskId ? readTasksCache<TaskDetailResult>(detailCacheKey(taskId)) : null));
    const [loading, setLoading] = useState(() => !data);
    const [error, setError] = useState<unknown>(null);
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    const refreshSummary = useTasksModuleStore((state) => state.refreshSummary);

    /** Vom Editor gesetzt: ungespeicherte oder laufende Speicherung. */
    const contentBusyRef = useRef(false);
    const requestSeqRef = useRef(0);
    /** Zählt lokale Änderungen — eine ältere Antwort überschreibt keine neuere Eingabe. */
    const localRevRef = useRef(0);
    const ownEventRef = useRef(false);
    const lastLoadRef = useRef(0);

    const setData = useCallback((next: TaskDetailResult | null | ((previous: TaskDetailResult | null) => TaskDetailResult | null)) => {
        setDataState((previous) => {
            const value = typeof next === 'function' ? next(previous) : next;
            if (value) writeTasksCache(detailCacheKey(value.task.id), value);
            return value;
        });
    }, []);

    const load = useCallback(async (silent = false) => {
        if (!taskId) return;
        const seq = ++requestSeqRef.current;
        const revAtStart = localRevRef.current;
        if (!silent) {
            setLoading(true);
            setError(null);
        }
        try {
            const next = await tasksApi.detail(taskId);
            if (seq !== requestSeqRef.current) return;
            noteServerNow(next.serverNow);
            lastLoadRef.current = Date.now();
            if (silent && revAtStart !== localRevRef.current) return;
            setData((previous) => (
                previous && previous.task.id === next.task.id && contentBusyRef.current
                    ? { ...next, content: previous.content }
                    : next
            ));
            setError(null);
        } catch (loadError) {
            if (seq !== requestSeqRef.current) return;
            const status = (loadError as { response?: { status?: number } })?.response?.status;
            // Stilles Nachladen behält die Ansicht — ausser die Aufgabe ist weg.
            if (!silent || status === 404 || status === 403) {
                setError(loadError);
                setData(null);
            }
        } finally {
            if (!silent && seq === requestSeqRef.current) setLoading(false);
        }
    }, [taskId, noteServerNow, setData]);

    useEffect(() => {
        const cached = taskId ? readTasksCache<TaskDetailResult>(detailCacheKey(taskId)) : null;
        setDataState(cached);
        setLoading(!cached);
        void load(Boolean(cached));
    }, [load, taskId]);

    useEffect(() => {
        const tick = () => { if (!document.hidden) void load(true); };
        const id = window.setInterval(tick, POLL_MS);
        const onVisible = () => {
            if (!document.hidden && Date.now() - lastLoadRef.current > POLL_MS) void load(true);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            window.clearInterval(id);
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [load]);

    useTasksChanged((kind, changedId) => {
        if (ownEventRef.current) return;
        if (kind === 'chat' && changedId !== taskId) return;
        if (!changedId || changedId === taskId) void load(true);
    });

    const update = useCallback((recipe: (current: TaskDetailResult) => TaskDetailResult) => {
        localRevRef.current += 1;
        setData((current) => (current ? recipe(current) : current));
    }, []);

    /** Rundruf an andere Stellen, ohne dass diese Seite sich selbst neu lädt. */
    const notify = useCallback((kind: TasksChangeKind = 'task', summary = true) => {
        ownEventRef.current = true;
        try {
            emitTasksChanged(kind, taskId);
        } finally {
            ownEventRef.current = false;
        }
        if (summary) void refreshSummary();
    }, [taskId, refreshSummary]);

    const applyEnvelope = useCallback((envelope: Envelope) => {
        update((current) => ({
            ...current,
            task: envelope.task,
            people: { ...current.people, ...envelope.people },
        }));
    }, [update]);

    /**
     * Eine Handlung der Seite (Status, Freigabe, Termin …): Antwort übernehmen,
     * Rundruf, Zähler — und still nachladen, weil sich mit dem Zustand auch
     * die Rechte (`permissions`) ändern können.
     */
    const act = useCallback(async (run: () => Promise<Envelope>, options: { reload?: boolean } = {}): Promise<Envelope | null> => {
        try {
            const envelope = await run();
            applyEnvelope(envelope);
            notify('task');
            if (options.reload !== false) void load(true);
            return envelope;
        } catch (actionError) {
            toast.error(tasksErrorMessage(actionError));
            return null;
        }
    }, [applyEnvelope, notify, load]);

    const helpers = useMemo(() => ({
        setContent: (content: ContentDto) => update((current) => ({ ...current, content })),
        upsertChecklist: (checklist: Checklist) => update((current) => {
            const exists = current.checklists.some((entry) => entry.id === checklist.id);
            return {
                ...current,
                checklists: exists
                    ? current.checklists.map((entry) => (entry.id === checklist.id ? checklist : entry))
                    : [...current.checklists, checklist],
            };
        }),
        removeChecklist: (checklistId: string) => update((current) => ({
            ...current,
            checklists: current.checklists.filter((entry) => entry.id !== checklistId),
        })),
        setItem: (checklistId: string, item: ChecklistItem) => update((current) => ({
            ...current,
            checklists: current.checklists.map((entry) => (entry.id === checklistId
                ? { ...entry, items: entry.items.map((existing) => (existing.id === item.id ? item : existing)) }
                : entry)),
        })),
        insertItem: (checklistId: string, item: ChecklistItem, afterItemId: string | null) => update((current) => ({
            ...current,
            checklists: current.checklists.map((entry) => {
                if (entry.id !== checklistId) return entry;
                const items = entry.items.filter((existing) => existing.id !== item.id);
                const at = afterItemId ? items.findIndex((existing) => existing.id === afterItemId) : -1;
                items.splice(at >= 0 ? at + 1 : items.length, 0, item);
                return { ...entry, items };
            }),
        })),
        removeItem: (checklistId: string, itemId: string) => update((current) => ({
            ...current,
            checklists: current.checklists.map((entry) => (entry.id === checklistId
                ? { ...entry, items: entry.items.filter((existing) => existing.id !== itemId) }
                : entry)),
        })),
        setProgress: (progress: ChecklistProgress) => update((current) => ({
            ...current,
            task: { ...current.task, checklist: { done: progress.done, total: progress.total } },
        })),
        setAssigneeIds: (assigneeIds: string[]) => update((current) => ({
            ...current,
            task: { ...current.task, assigneeIds },
        })),
        setLabelIds: (labelIds: string[]) => update((current) => ({
            ...current,
            task: { ...current.task, labelIds },
        })),
        addAttachments: (attachments: TaskAttachment[]) => update((current) => ({
            ...current,
            attachments: [...current.attachments, ...attachments.filter((entry) => !current.attachments.some((existing) => existing.id === entry.id))],
            task: { ...current.task, attachmentCount: current.task.attachmentCount + attachments.length },
        })),
        setAttachments: (attachments: TaskAttachment[]) => update((current) => ({
            ...current,
            attachments,
            task: { ...current.task, attachmentCount: attachments.length },
        })),
        removeAttachment: (attachmentId: string) => update((current) => ({
            ...current,
            attachments: current.attachments.filter((entry) => entry.id !== attachmentId),
            task: { ...current.task, attachmentCount: Math.max(0, current.task.attachmentCount - 1) },
        })),
        setCommentCount: (commentCount: number) => update((current) => ({
            ...current,
            task: { ...current.task, commentCount },
        })),
        setComments: (comments: TaskComment[]) => update((current) => ({
            ...current,
            comments,
            task: { ...current.task, commentCount: comments.length },
        })),
        mergePeople: (people: PeopleMap) => update((current) => ({ ...current, people: { ...current.people, ...people } })),
    }), [update]);

    return {
        data,
        loading,
        error,
        reload: load,
        update,
        applyEnvelope,
        act,
        notify,
        contentBusyRef,
        ...helpers,
    };
};

export type TaskDetailController = ReturnType<typeof useTaskDetail>;
