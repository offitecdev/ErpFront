import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import {
    primeDeviceTasks,
    productionTaskErrorText,
    productionTasksApi,
    readDeviceTasks,
} from '@/lib/api/productionTasks';
import type { DeviceTasks, ProductionTask, TaskPerson, TaskStatus, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

import { openBlob } from '../bom/device/bomFiles';

import { statusOfSubtasks, withSubtaskAssignees } from '../tasks/taskModel';

interface State {
    deviceId: string;
    data: DeviceTasks | null;
    error: string | null;
}

/**
 * ── DIE AUFGABEN DES GERÄTS AUF DER GERÄTESEITE (26.09.2026) ───────────────
 *
 * Liest den Plan des Geräts (Speicher zuerst, dann still die Antwort des
 * Servers) und hält die Handlungen der Administratorrolle bereit:
 *   assignSubtask  Personen einer Unteraufgabe (29.09.2026: nur dort) — sofort sichtbar, der Server folgt
 *   status  der Stand einer Aufgabe (auch wer in ihr steht) — ebenso
 *   saveTasks  die Aufgaben des Geräts anpassen (nur diese Kopie, nie die Vorlage)
 *   load    eine Vorlage auf das Gerät legen (auch ersetzen)
 *   unload  die Aufgaben vom Gerät nehmen
 * Ein Fehler beim Lesen lässt die übrige Seite unberührt.
 */
export const useDeviceTasks = (deviceId: string) => {
    const [state, setState] = useState<State>({ deviceId: '', data: null, error: null });
    const [tick, setTick] = useState(0);
    const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
    const dataRef = useRef<DeviceTasks | null>(null);

    useEffect(() => {
        if (!deviceId) return undefined;
        return readDeviceTasks(
            deviceId,
            (value) => {
                dataRef.current = value;
                setState({ deviceId, data: value, error: null });
            },
            (error) => setState((current) => ({
                deviceId,
                data: current.deviceId === deviceId ? current.data : null,
                error: productionTaskErrorText(error, 'productionTasks.err.loadFailed'),
            })),
        );
    }, [deviceId, tick]);

    const shown = state.deviceId === deviceId ? state : { deviceId, data: null, error: null };

    const commit = useCallback((next: DeviceTasks) => {
        dataRef.current = next;
        setState({ deviceId, data: next, error: null });
        void primeDeviceTasks(deviceId, next);
    }, [deviceId]);

    const assignSubtask = useCallback(async (task: ProductionTask, subtask: TaskSubtask, assigneeIds: string[], known: TaskPerson[] = []) => {
        const before = dataRef.current;
        if (!before) return;
        const previousIds = before.tasks.find((entry) => entry.id === task.id)?.subtasks.find((entry) => entry.id === subtask.id)?.assigneeIds
            ?? subtask.assigneeIds;
        /* Sofort zeigen — die Namen kennt die Auswahl schon; die Aufgabe zeigt die Summe
           ihrer Unteraufgaben. Jeder Schritt geht vom NEUESTEN Stand aus (zwei Zeilen kurz nacheinander). */
        const withSubtask = (base: DeviceTasks, ids: string[], extra: TaskPerson[] = []): DeviceTasks => {
            const people = [...base.people];
            for (const person of extra) if (!people.some((entry) => entry.id === person.id)) people.push(person);
            return { ...base, people, tasks: base.tasks.map((entry) => (entry.id === task.id ? withSubtaskAssignees(entry, subtask.id, ids) : entry)) };
        };
        const optimistic = withSubtask(before, assigneeIds, known);
        dataRef.current = optimistic;
        setState({ deviceId, data: optimistic, error: null });
        setBusyTaskId(task.id);
        try {
            const result = await productionTasksApi.assignSubtask(deviceId, task.id, subtask.id, assigneeIds);
            const latest = dataRef.current ?? optimistic;
            commit({
                ...latest,
                people: [...latest.people.filter((entry) => !result.people.some((person) => person.id === entry.id)), ...result.people],
                tasks: latest.tasks.map((entry) => (entry.id === result.task.id ? result.task : entry)),
            });
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.assignFailed'));
            const restored = withSubtask(dataRef.current ?? before, previousIds);
            dataRef.current = restored;
            setState({ deviceId, data: restored, error: null });
        } finally {
            setBusyTaskId((current) => (current === task.id ? null : current));
        }
    }, [deviceId, commit]);

    const setStatus = useCallback(async (task: ProductionTask, status: TaskStatus) => {
        const before = dataRef.current;
        if (!before) return;
        const previous = before.tasks.find((entry) => entry.id === task.id)?.status ?? task.status;
        const withStatus = (base: DeviceTasks, next: TaskStatus): DeviceTasks => ({
            ...base,
            tasks: base.tasks.map((entry) => (entry.id === task.id ? { ...entry, status: next } : entry)),
        });
        const optimistic = withStatus(before, status);
        dataRef.current = optimistic;
        setState({ deviceId, data: optimistic, error: null });
        setBusyTaskId(task.id);
        try {
            const result = await productionTasksApi.setStatus(deviceId, task.id, status);
            const latest = dataRef.current ?? optimistic;
            commit({ ...latest, tasks: latest.tasks.map((entry) => (entry.id === result.task.id ? result.task : entry)) });
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.statusFailed'));
            const restored = withStatus(dataRef.current ?? before, previous);
            dataRef.current = restored;
            setState({ deviceId, data: restored, error: null });
        } finally {
            setBusyTaskId((current) => (current === task.id ? null : current));
        }
    }, [deviceId, commit]);

    /* Der Stand einer Unteraufgabe — sofort sichtbar (die Aufgabe folgt ihr), der Server folgt. */
    const setSubtaskStatus = useCallback(async (task: ProductionTask, subtask: TaskSubtask, status: TaskStatus) => {
        const before = dataRef.current;
        if (!before) return;
        const withSubtask = (base: DeviceTasks, next: TaskStatus): DeviceTasks => ({
            ...base,
            tasks: base.tasks.map((entry) => {
                if (entry.id !== task.id) return entry;
                const subtasks = entry.subtasks.map((item) => (item.id === subtask.id ? { ...item, status: next } : item));
                return { ...entry, subtasks, status: statusOfSubtasks(subtasks) ?? entry.status };
            }),
        });
        const previous = before.tasks.find((entry) => entry.id === task.id)?.subtasks.find((item) => item.id === subtask.id)?.status ?? subtask.status;
        const optimistic = withSubtask(before, status);
        dataRef.current = optimistic;
        setState({ deviceId, data: optimistic, error: null });
        setBusyTaskId(task.id);
        try {
            const result = await productionTasksApi.setSubtaskStatus(deviceId, task.id, subtask.id, status);
            const latest = dataRef.current ?? optimistic;
            commit({ ...latest, tasks: latest.tasks.map((entry) => (entry.id === result.task.id ? result.task : entry)) });
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.statusFailed'));
            const restored = withSubtask(dataRef.current ?? before, previous);
            dataRef.current = restored;
            setState({ deviceId, data: restored, error: null });
        } finally {
            setBusyTaskId((current) => (current === task.id ? null : current));
        }
    }, [deviceId, commit]);

    /* Die Antwort des Servers für EINE Aufgabe übernehmen. */
    const takeTask = useCallback((task: ProductionTask) => {
        const latest = dataRef.current;
        if (!latest) return;
        commit({ ...latest, tasks: latest.tasks.map((entry) => (entry.id === task.id ? task : entry)) });
    }, [commit]);

    /* Dateien und Abschluss einer Unteraufgabe (28.09.2026) — der Server entscheidet, dann sichtbar. */
    const uploadSubtaskFile = useCallback(async (
        task: ProductionTask,
        subtask: TaskSubtask,
        file: File,
        revisionOf?: string,
        revisionNote?: string,
    ): Promise<boolean> => {
        try {
            takeTask((await productionTasksApi.uploadSubtaskFile(deviceId, task.id, subtask.id, file, revisionOf, revisionNote)).task);
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.uploadFailed'));
            return false;
        }
    }, [deviceId, takeTask]);

    const removeSubtaskFile = useCallback(async (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile): Promise<void> => {
        try {
            takeTask((await productionTasksApi.removeSubtaskFile(deviceId, task.id, subtask.id, file.id)).task);
        } catch (error) {
            toast.error(productionTaskErrorText(error));
        }
    }, [deviceId, takeTask]);

    const openSubtaskFile = useCallback((task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile) => {
        void openBlob(() => productionTasksApi.subtaskFile(deviceId, task.id, subtask.id, file.id), (error) => productionTaskErrorText(error));
    }, [deviceId]);

    const loadSubtaskFile = useCallback(
        (task: ProductionTask, subtask: TaskSubtask, file: TaskSubtaskFile): Promise<Blob> =>
            productionTasksApi.subtaskFile(deviceId, task.id, subtask.id, file.id),
        [deviceId],
    );

    const completeSubtask = useCallback(async (task: ProductionTask, subtask: TaskSubtask, note: string, checked: string[]): Promise<boolean> => {
        try {
            takeTask((await productionTasksApi.completeSubtask(deviceId, task.id, subtask.id, note, checked)).task);
            toast.success(t('productionTasks.complete.done'));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, takeTask]);

    const addChecklistItem = useCallback(async (task: ProductionTask, subtask: TaskSubtask, text: string): Promise<boolean> => {
        try {
            takeTask((await productionTasksApi.addChecklistItem(deviceId, task.id, subtask.id, text)).task);
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, takeTask]);

    const unlockSubtask = useCallback(async (task: ProductionTask, subtask: TaskSubtask): Promise<boolean> => {
        try {
            takeTask((await productionTasksApi.unlockSubtask(deviceId, task.id, subtask.id)).task);
            toast.success(t('productionTasks.subtask.unlocked'));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, takeTask]);

    const requestSubtaskRevision = useCallback(async (task: ProductionTask, subtask: TaskSubtask, note: string): Promise<boolean> => {
        try {
            takeTask((await productionTasksApi.requestSubtaskRevision(deviceId, task.id, subtask.id, note)).task);
            toast.success(t('productionTasks.review.revisionSent'));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, takeTask]);

    const addStage = useCallback(async (area: string, name: string): Promise<boolean> => {
        try {
            commit(await productionTasksApi.addStage(deviceId, area, name));
            toast.success(t('productionTasks.device.stageAdded', { name }));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, commit]);

    const saveTasks = useCallback(async (tasks: ProductionTask[]): Promise<boolean> => {
        try {
            commit(await productionTasksApi.updateTasks(deviceId, tasks));
            toast.success(t('productionTasks.device.tasksSaved'));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.generic'));
            return false;
        }
    }, [deviceId, commit]);

    const load = useCallback(async (templateId: string, replace: boolean): Promise<boolean> => {
        try {
            const result = await productionTasksApi.loadTemplate(deviceId, templateId, replace);
            commit(result);
            toast.success(t('productionTasks.device.loaded', { name: result.plan?.templateName ?? '', count: result.tasks.length }));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.loadTemplateFailed'));
            return false;
        }
    }, [deviceId, commit]);

    const unload = useCallback(async (): Promise<boolean> => {
        const before = dataRef.current;
        try {
            await productionTasksApi.unload(deviceId);
            if (before) commit({ ...before, plan: null, tasks: [], people: [] });
            toast.success(t('productionTasks.device.unloaded'));
            return true;
        } catch (error) {
            toast.error(productionTaskErrorText(error));
            return false;
        }
    }, [deviceId, commit]);

    return {
        data: shown.data,
        error: shown.error,
        loading: !shown.data && !shown.error,
        busyTaskId,
        reload: () => setTick((value) => value + 1),
        assignSubtask,
        setStatus,
        setSubtaskStatus,
        uploadSubtaskFile,
        removeSubtaskFile,
        openSubtaskFile,
        loadSubtaskFile,
        completeSubtask,
        requestSubtaskRevision,
        unlockSubtask,
        addChecklistItem,
        addStage,
        saveTasks,
        load,
        unload,
    };
};

export type DeviceTasksHandle = ReturnType<typeof useDeviceTasks>;
