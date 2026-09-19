import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskApprovalsResult, TaskDetail } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged, useTasksChanged } from '../../utils/taskEvents';

/**
 * Daten der Freigaben (nur Administrator). Seit dem 16.09.2026 steht hier NUR
 * noch die Löschanfrage: abgeschlossen wird direkt, es gibt nichts mehr zu
 * bestätigen. Eine Entscheidung nimmt die Karte sofort weg; der Rundruf lädt
 * danach leise nach.
 */

export type ApprovalDecision = 'approve' | 'reject';

export const approvalBusyKey = (taskId: string): string => `delete:${taskId}`;

export const useTaskApprovals = (enabled: boolean) => {
    const refreshSummary = useTasksModuleStore((state) => state.refreshSummary);
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    const [data, setData] = useState<TaskApprovalsResult | null>(null);
    const [error, setError] = useState<unknown>(null);
    const [busyKey, setBusyKey] = useState<string | null>(null);

    const load = useCallback(async () => {
        try {
            const result = await tasksApi.approvals();
            noteServerNow(result.serverNow);
            setData(result);
            setError(null);
        } catch (loadError) {
            setError(loadError);
        }
    }, [noteServerNow]);

    useEffect(() => { if (enabled) void load(); }, [enabled, load]);

    useTasksChanged((kind) => { if (enabled && kind === 'task') void load(); });

    /** Löschanfrage bestätigen = die Aufgabe löschen (nur Admins). */
    const decide = useCallback(async (task: TaskDetail, decision: ApprovalDecision, note = '') => {
        setBusyKey(approvalBusyKey(task.id));
        try {
            if (decision === 'approve') await tasksApi.remove(task.id);
            else await tasksApi.rejectDelete(task.id, note || undefined);
            setData((current) => (current
                ? { ...current, deleteRequests: (current.deleteRequests ?? []).filter((item) => item.id !== task.id) }
                : current));
            toast.success(decision === 'approve' ? t('tasksModule.approvals.toast.approved') : t('tasksModule.approvals.toast.rejected'));
            void refreshSummary();
            emitTasksChanged('task', task.id);
            return true;
        } catch (decideError) {
            toast.error(tasksErrorMessage(decideError));
            return false;
        } finally {
            setBusyKey(null);
        }
    }, [refreshSummary]);

    return { data, error, busyKey, decide };
};

export type TaskApprovalsState = ReturnType<typeof useTaskApprovals>;
