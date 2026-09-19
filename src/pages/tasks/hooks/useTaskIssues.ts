import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi, type IssueCreateInput } from '@/lib/api/tasksModule';
import type { PeopleMap, TaskIssue } from '@/types/tasksModule';

/**
 * ── SORULAR & SORUNLAR: die Daten des Reiters ───────────────────────────────
 *
 * Die Fäden hängen NICHT am Detail: sie werden geholt, wenn der Reiter das
 * erste Mal aufgeht — eine Aufgabe ohne Frage soll dafür nichts zahlen. Jede
 * Schreibhandlung gibt den geänderten Faden zurück; er ersetzt seinen Platz in
 * der Liste, ohne dass alles neu geladen wird.
 */
export interface TaskIssuesController {
    issues: TaskIssue[];
    people: PeopleMap;
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    create: (input: IssueCreateInput, files: File[]) => Promise<TaskIssue>;
    reply: (issueId: string, text: string, files: File[], personIds: string[]) => Promise<TaskIssue>;
    setResolved: (issueId: string, resolved: boolean) => Promise<void>;
    remove: (issueId: string) => Promise<void>;
}

export const useTaskIssues = (taskId: string, active: boolean): TaskIssuesController => {
    const [issues, setIssues] = useState<TaskIssue[]>([]);
    const [people, setPeople] = useState<PeopleMap>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Ein zweites Öffnen des Reiters lädt nicht noch einmal — nur der Wechsel der Aufgabe.
    const loadedFor = useRef<string | null>(null);

    const reload = useCallback(async () => {
        if (!taskId) return;
        setLoading(true);
        try {
            const result = await tasksApi.issues(taskId);
            setIssues(result.data);
            setPeople(result.people);
            setError(null);
            loadedFor.current = taskId;
        } catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        if (!active || !taskId || loadedFor.current === taskId) return;
        void reload();
    }, [active, taskId, reload]);

    useEffect(() => {
        if (loadedFor.current && loadedFor.current !== taskId) {
            loadedFor.current = null;
            setIssues([]);
            setPeople({});
        }
    }, [taskId]);

    /** Einen Faden an seinem Platz ersetzen (oder hinten anhängen). */
    const merge = useCallback((issue: TaskIssue, nextPeople: PeopleMap) => {
        setPeople((current) => ({ ...current, ...nextPeople }));
        setIssues((current) => (current.some((row) => row.id === issue.id)
            ? current.map((row) => (row.id === issue.id ? issue : row))
            : [...current, issue]));
    }, []);

    const create = useCallback(async (input: IssueCreateInput, files: File[]) => {
        const result = await tasksApi.createIssue(taskId, input, files);
        merge(result.issue, result.people);
        return result.issue;
    }, [merge, taskId]);

    const reply = useCallback(async (issueId: string, text: string, files: File[], personIds: string[]) => {
        const result = await tasksApi.replyToIssue(issueId, text, files, personIds);
        merge(result.issue, result.people);
        return result.issue;
    }, [merge]);

    const setResolved = useCallback(async (issueId: string, resolved: boolean) => {
        const issue = await tasksApi.setIssueResolved(issueId, resolved);
        merge(issue, {});
    }, [merge]);

    const remove = useCallback(async (issueId: string) => {
        await tasksApi.deleteIssue(issueId);
        setIssues((current) => current.filter((row) => row.id !== issueId));
    }, []);

    return { issues, people, loading, error, reload, create, reply, setResolved, remove };
};
