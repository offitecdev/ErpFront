import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { TaskApprovalsResult, TaskDetail } from '@/types/tasksModule';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged, useTasksChanged } from '../../utils/taskEvents';

/**
 * Daten der Freigaben (nur Leitung): Abschlussanfragen und Aufgabenvorschläge.
 * Eine Entscheidung nimmt die Karte sofort weg; der Rundruf lädt danach leise
 * nach — dieselbe Aufgabe kann in BEIDEN Listen stehen und sich dabei ändern.
 */

export type ApprovalKind = 'completion' | 'review' | 'delete';
export type ApprovalDecision = 'approve' | 'reject';

const LIST_OF: Record<ApprovalKind, 'completionRequests' | 'reviewRequests' | 'deleteRequests'> = {
    completion: 'completionRequests',
    review: 'reviewRequests',
    delete: 'deleteRequests',
};

const callFor = (kind: ApprovalKind, decision: ApprovalDecision, taskId: string, note: string) => {
    // Löschanfrage bestätigen = die Aufgabe löschen (nur Admins).
    if (kind === 'delete') {
        return decision === 'approve' ? tasksApi.remove(taskId) : tasksApi.rejectDelete(taskId, note || undefined);
    }
    if (kind === 'completion') {
        return decision === 'approve' ? tasksApi.approveCompletion(taskId) : tasksApi.rejectCompletion(taskId, note);
    }
    return decision === 'approve' ? tasksApi.approveReview(taskId) : tasksApi.rejectReview(taskId, note);
};

export const approvalBusyKey = (kind: ApprovalKind, taskId: string): string => `${kind}:${taskId}`;

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

    const decide = useCallback(async (kind: ApprovalKind, task: TaskDetail, decision: ApprovalDecision, note = '') => {
        setBusyKey(approvalBusyKey(kind, task.id));
        try {
            await callFor(kind, decision, task.id, note);
            const listKey = LIST_OF[kind];
            setData((current) => (current
                ? { ...current, [listKey]: (current[listKey] ?? []).filter((item) => item.id !== task.id) }
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
