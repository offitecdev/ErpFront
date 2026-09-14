import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { LabelColor, LabelDto } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged } from '../../utils/taskEvents';

/**
 * Etiketten verwalten (Leitung): anlegen, umbenennen, umfärben, löschen.
 * Nach jeder Änderung wird die Liste neu geholt (sie trägt `usageCount`) und
 * in den Zustand des Moduls gelegt — Auswahllisten und Karten sehen sie sofort.
 */
export const useLabelsAdmin = ({ enabled }: { enabled: boolean }) => {
    const storeLabels = useTasksModuleStore((state) => state.bootstrap?.labels);
    const setStoreLabels = useTasksModuleStore((state) => state.setLabels);
    const [labels, setLabels] = useState<LabelDto[] | null>(null);
    const [busy, setBusy] = useState(false);

    const reload = useCallback(async () => {
        try {
            const fresh = await tasksApi.labels();
            setLabels(fresh);
            setStoreLabels(fresh);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        }
    }, [setStoreLabels]);

    useEffect(() => { if (enabled) void reload(); }, [enabled, reload]);

    /** Führt eine Änderung aus; `true` bei Erfolg (das Fenster darf schliessen). */
    const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
        setBusy(true);
        try {
            await action();
            await reload();
            emitTasksChanged('labels');
            return true;
        } catch (error) {
            toast.error(tasksErrorMessage(error));
            return false;
        } finally {
            setBusy(false);
        }
    }, [reload]);

    const create = useCallback((name: string, color: LabelColor) => run(() => tasksApi.createLabel(name, color)), [run]);
    const update = useCallback(
        (labelId: string, patch: { name?: string; color?: LabelColor }) => run(() => tasksApi.updateLabel(labelId, patch)),
        [run],
    );
    const remove = useCallback((labelId: string) => run(() => tasksApi.deleteLabel(labelId)), [run]);

    return { labels: labels ?? storeLabels ?? null, loaded: labels !== null, busy, create, update, remove };
};
