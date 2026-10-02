import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionTaskErrorText, productionTasksApi } from '@/lib/api/productionTasks';
import { openBlob } from '@/pages/production/bom/device/bomFiles';
import { ANALYSIS_POLL_MS, hasActiveAnalysis, type SubtaskActions } from '@/pages/production/tasks/subtaskFileModel';
import { statusOfSubtasks } from '@/pages/production/tasks/taskModel';
import type { MyProductionTasks, ProductionTask, TaskStatus, TaskSubtask, TaskSubtaskFile } from '@/types/productionTasks';

const statusOf = (error: unknown): number | undefined =>
    (error as { response?: { status?: number } } | null)?.response?.status;

/** Die leere Antwort — keine eigenen Aufgaben (oder das Modul ist aus). */
const NONE: MyProductionTasks = { projects: [], people: [] };

/**
 * ── «GÖREVLERİM» — DIE EIGENEN AUFGABEN AUF DER STARTSEITE (30.09.2026) ─────
 *
 * Liest die eigenen Aufgaben je Projekt und Gerät und hält bereit, was eine
 * Person an IHRER Unteraufgabe tun darf — ▶ starten, ■ anhalten, zur Freigabe
 * schicken (bzw. erledigen), PDFs hochladen, öffnen und die eigenen entfernen.
 * Alles über die Wege `/production/my-tasks/…`: dafür braucht es keine
 * Produktionsrechte. Kommt das Fenster wieder nach vorn, wird still nachgeladen
 * (die Verwaltung kann inzwischen freigegeben oder zurückgegeben haben).
 */
export const useMyTasks = (meId: string | null) => {
    const [data, setData] = useState<MyProductionTasks | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [busyTaskId, setBusyTaskId] = useState<string | null>(null);
    const [tick, setTick] = useState(0);

    useEffect(() => {
        let cancelled = false;
        void productionTasksApi.myTasks().then(
            (value) => {
                if (cancelled) return;
                setData(value);
                setError(null);
            },
            (failure: unknown) => {
                if (cancelled) return;
                // Modul aus (403) oder unbekannt (404): keine Aufgaben — der Abschnitt bleibt weg.
                const status = statusOf(failure);
                if (status === 403 || status === 404) {
                    setData(NONE);
                    setError(null);
                } else {
                    setError(productionTaskErrorText(failure, 'productionTasks.err.loadFailed'));
                }
            },
        );
        return () => { cancelled = true; };
    }, [tick, meId]);

    /* Läuft die KI-Prüfung eines eigenen PDFs (01.10.2026), still nachfragen, bis sie fertig ist. */
    const analysing = Boolean(data?.projects.some((project) => project.devices.some((entry) => hasActiveAnalysis(entry.tasks))));
    useEffect(() => {
        if (!analysing) return undefined;
        const timer = window.setTimeout(() => setTick((value) => value + 1), ANALYSIS_POLL_MS);
        return () => window.clearTimeout(timer);
    }, [analysing, data]);

    useEffect(() => {
        const onFocus = () => { if (document.visibilityState === 'visible') setTick((value) => value + 1); };
        document.addEventListener('visibilitychange', onFocus);
        return () => document.removeEventListener('visibilitychange', onFocus);
    }, []);

    /** Die Antwort des Servers für EINE Aufgabe übernehmen. */
    const takeTask = useCallback((deviceId: string, task: ProductionTask) => {
        setData((current) => current && {
            ...current,
            projects: current.projects.map((project) => ({
                ...project,
                devices: project.devices.map((entry) => (entry.device.id !== deviceId ? entry : {
                    ...entry,
                    tasks: entry.tasks.map((existing) => (existing.id === task.id ? task : existing)),
                })),
            })),
        });
    }, []);

    /* Der Stand — sofort sichtbar, der Server entscheidet (Regeln wie auf der Geräteseite). */
    // `note` (02.10.2026): die kurze Notiz beim Einsenden. Antwort: ob der Server zustimmte.
    const setSubtaskStatus = useCallback(async (deviceId: string, task: ProductionTask, subtask: TaskSubtask, status: TaskStatus, note?: string, fee?: number): Promise<boolean> => {
        const optimistic = (next: TaskStatus): ProductionTask => {
            const subtasks = task.subtasks.map((item) => (item.id === subtask.id ? { ...item, status: next } : item));
            return { ...task, subtasks, status: statusOfSubtasks(subtasks) ?? task.status };
        };
        takeTask(deviceId, optimistic(status));
        setBusyTaskId(task.id);
        try {
            takeTask(deviceId, (await productionTasksApi.mySubtaskStatus(deviceId, task.id, subtask.id, status, note, fee)).task);
            return true;
        } catch (failure) {
            toast.error(productionTaskErrorText(failure, 'productionTasks.err.statusFailed'));
            takeTask(deviceId, task);
            return false;
        } finally {
            setBusyTaskId((current) => (current === task.id ? null : current));
        }
    }, [takeTask]);

    /** Was die Tabellen der Stufen für EIN Gerät brauchen — als Person an der Unteraufgabe, nie als Verwaltung. */
    const actionsFor = useCallback((deviceId: string, deviceName: string): SubtaskActions => ({
        isAdmin: false,
        meId,
        deviceName,
        upload: async (task, subtask, file, revisionOf, revisionNote) => {
            try {
                takeTask(deviceId, (await productionTasksApi.myUploadSubtaskFile(deviceId, task.id, subtask.id, file, revisionOf, revisionNote)).task);
                return true;
            } catch (failure) {
                toast.error(productionTaskErrorText(failure, 'productionTasks.err.uploadFailed'));
                return false;
            }
        },
        removeFile: async (task, subtask, file: TaskSubtaskFile) => {
            try {
                takeTask(deviceId, (await productionTasksApi.myRemoveSubtaskFile(deviceId, task.id, subtask.id, file.id)).task);
            } catch (failure) {
                toast.error(productionTaskErrorText(failure));
            }
        },
        openFile: (task, subtask, file) => {
            void openBlob(() => productionTasksApi.mySubtaskFile(deviceId, task.id, subtask.id, file.id), (failure) => productionTaskErrorText(failure));
        },
        loadFile: (task, subtask, file) => productionTasksApi.mySubtaskFile(deviceId, task.id, subtask.id, file.id),
        setStatus: (task, subtask, status, note, fee) => setSubtaskStatus(deviceId, task, subtask, status, note, fee),
        // Um das Entsperren bitten (30.09.2026) — das Schloss einer eigenen gesperrten Unteraufgabe.
        requestUnlock: async (task, subtask, note) => {
            try {
                await productionTasksApi.myRequestUnlock(deviceId, task.id, subtask.id, note);
                toast.success(t('productionTasks.requests.unlockSent'));
                return true;
            } catch (failure) {
                toast.error(productionTaskErrorText(failure));
                return false;
            }
        },
        // Freigeben, zurückgeben, entsperren und die Checkliste ergänzen tut nur die Verwaltung.
        complete: async () => false,
        requestRevision: async () => false,
        unlock: async () => false,
        addChecklistItem: async () => false,
    }), [meId, takeTask, setSubtaskStatus]);

    return {
        data,
        error,
        loading: data === null && error === null,
        busyTaskId,
        reload: () => setTick((value) => value + 1),
        setSubtaskStatus,
        actionsFor,
    };
};
