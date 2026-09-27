import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import {
    primeDeviceTasks,
    productionTaskErrorText,
    productionTasksApi,
    readDeviceTasks,
} from '@/lib/api/productionTasks';
import type { DeviceTasks, ProductionTask, TaskPerson } from '@/types/productionTasks';

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
 *   assign  Personen einer Aufgabe — sofort sichtbar, der Server folgt
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

    const assign = useCallback(async (task: ProductionTask, assigneeIds: string[], known: TaskPerson[] = []) => {
        const before = dataRef.current;
        if (!before) return;
        const previousIds = before.tasks.find((entry) => entry.id === task.id)?.assigneeIds ?? task.assigneeIds;
        /* Sofort zeigen — die Namen kennt die Auswahl schon. Jeder Schritt
           geht vom NEUESTEN Stand aus (zwei Zeilen kurz nacheinander). */
        const withTask = (base: DeviceTasks, ids: string[], extra: TaskPerson[] = []): DeviceTasks => {
            const people = [...base.people];
            for (const person of extra) if (!people.some((entry) => entry.id === person.id)) people.push(person);
            return { ...base, people, tasks: base.tasks.map((entry) => (entry.id === task.id ? { ...entry, assigneeIds: ids } : entry)) };
        };
        const optimistic = withTask(before, assigneeIds, known);
        dataRef.current = optimistic;
        setState({ deviceId, data: optimistic, error: null });
        setBusyTaskId(task.id);
        try {
            const result = await productionTasksApi.assign(deviceId, task.id, assigneeIds);
            const latest = dataRef.current ?? optimistic;
            commit({
                ...latest,
                people: [...latest.people.filter((entry) => !result.people.some((person) => person.id === entry.id)), ...result.people],
                tasks: latest.tasks.map((entry) => (entry.id === result.task.id ? result.task : entry)),
            });
        } catch (error) {
            toast.error(productionTaskErrorText(error, 'productionTasks.err.assignFailed'));
            const restored = withTask(dataRef.current ?? before, previousIds);
            dataRef.current = restored;
            setState({ deviceId, data: restored, error: null });
        } finally {
            setBusyTaskId((current) => (current === task.id ? null : current));
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
        assign,
        load,
        unload,
    };
};

export type DeviceTasksHandle = ReturnType<typeof useDeviceTasks>;
