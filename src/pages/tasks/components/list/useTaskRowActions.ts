import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ManualTaskStatus, PeopleMap, TaskDetail, TaskEnvelope, TaskRow } from '@/types/tasksModule';
import { selectTimerRunning, useTaskTimer } from '../../hooks/useTaskTimer';
import { useIsTasksAdmin, useIsTasksManager, useTasksActorId, useTasksModuleStore } from '../../store/tasksModuleStore';
import { emitTasksChanged } from '../../utils/taskEvents';
import { canRequestRowCompletion, rowRights } from './taskListRules';
import type { TaskRowMenuActions } from './TaskRowMenu';

/**
 * Alles, was man an einer Zeile TUT: Abhakkreis, Menüpunkte und die drei
 * Fenster, die dafür aufgehen (Abschlussanfrage, «Yapılamadı»-Grund, Löschen).
 * Nach jeder Änderung: Zeile aus der Antwort, Rundruf (die Liste lädt leise
 * neu und sortiert um), Zähler der Leiste.
 */
export const useTaskRowActions = ({
    patchRow,
    removeRow,
    onEdit,
}: {
    patchRow: (task: TaskRow | TaskDetail, people?: PeopleMap) => void;
    removeRow: (taskId: string) => void;
    onEdit: (row: TaskRow) => void;
}) => {
    const navigate = useNavigate();
    const isManager = useIsTasksManager();
    const isAdmin = useIsTasksAdmin();
    const me = useTasksActorId();
    const refreshSummary = useTasksModuleStore((state) => state.refreshSummary);
    const { start, pause } = useTaskTimer();

    const [completionFor, setCompletionFor] = useState<TaskRow | null>(null);
    const [blockFor, setBlockFor] = useState<TaskRow | null>(null);
    const [deleteFor, setDeleteFor] = useState<TaskRow | null>(null);
    const [deleteRequestFor, setDeleteRequestFor] = useState<TaskRow | null>(null);
    const [dialogBusy, setDialogBusy] = useState(false);
    const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(() => new Set());

    const markBusy = useCallback((taskId: string, busy: boolean) => {
        setBusyIds((current) => {
            const next = new Set(current);
            if (busy) next.add(taskId);
            else next.delete(taskId);
            return next;
        });
    }, []);

    const applyEnvelope = useCallback((envelope: TaskEnvelope) => {
        patchRow(envelope.task, envelope.people);
        emitTasksChanged('task', envelope.task.id);
        void refreshSummary();
    }, [patchRow, refreshSummary]);

    /* Der Kreis antwortet sofort (Vorgabe «Checks first»); scheitert der
       Server, springt die Zeile auf ihren alten Stand zurück. */
    const runOptimistic = useCallback(async (
        row: TaskRow,
        optimistic: Partial<TaskRow>,
        call: () => Promise<TaskEnvelope>,
        successKey?: string,
    ) => {
        markBusy(row.id, true);
        patchRow({ ...row, ...optimistic });
        try {
            applyEnvelope(await call());
            if (successKey) toast.success(t(successKey));
        } catch (error) {
            patchRow(row);
            toast.error(tasksErrorMessage(error));
        } finally {
            markBusy(row.id, false);
        }
    }, [applyEnvelope, markBusy, patchRow]);

    /** Görevly `V.quickComplete`. */
    const quickComplete = useCallback((row: TaskRow) => {
        if (row.status === 'COMPLETED') {
            if (!isManager) {
                toast(t('tasksModule.list.onlyManagerReopen'));
                return;
            }
            void runOptimistic(
                row,
                { status: 'IN_PROGRESS', effectiveStatus: 'IN_PROGRESS', completedAt: null },
                () => tasksApi.setStatus(row.id, 'IN_PROGRESS'),
                'tasksModule.list.toast.reopened',
            );
            return;
        }
        if (isAdmin) {
            // Nur die Administratorrolle schliesst ab; eine offene Anfrage wird damit bestätigt.
            const call = row.approvalState === 'PENDING'
                ? () => tasksApi.approveCompletion(row.id)
                : () => tasksApi.setStatus(row.id, 'COMPLETED');
            void runOptimistic(row, { status: 'COMPLETED', effectiveStatus: 'COMPLETED' }, call, 'tasksModule.list.toast.completed');
            return;
        }
        if (row.approvalState === 'PENDING') {
            toast(t('tasksModule.errors.COMPLETION_ALREADY_REQUESTED'));
            return;
        }
        if (!canRequestRowCompletion(row, rowRights(row, me, isManager), isManager, isAdmin)) return;
        setCompletionFor(row);
    }, [isAdmin, isManager, me, runOptimistic]);

    const confirmCompletion = useCallback(async (note: string) => {
        if (!completionFor) return;
        setDialogBusy(true);
        try {
            applyEnvelope(await tasksApi.requestCompletion(completionFor.id, note || undefined));
            toast.success(t('tasksModule.list.toast.requestSent'));
            setCompletionFor(null);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDialogBusy(false);
        }
    }, [applyEnvelope, completionFor]);

    const setStatus = useCallback(async (row: TaskRow, status: ManualTaskStatus) => {
        // «Yapılamadı» braucht immer einen Grund — auch zum Ändern des Grundes.
        if (status === 'BLOCKED') {
            setBlockFor(row);
            return;
        }
        if (row.status === status) return;
        try {
            applyEnvelope(await tasksApi.setStatus(row.id, status));
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        }
    }, [applyEnvelope]);

    const confirmBlock = useCallback(async (reason: string) => {
        if (!blockFor) return;
        setDialogBusy(true);
        try {
            applyEnvelope(await tasksApi.setStatus(blockFor.id, 'BLOCKED', reason));
            setBlockFor(null);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDialogBusy(false);
        }
    }, [applyEnvelope, blockFor]);

    const confirmDelete = useCallback(async () => {
        if (!deleteFor) return;
        setDialogBusy(true);
        try {
            await tasksApi.remove(deleteFor.id);
            removeRow(deleteFor.id);
            emitTasksChanged('task', deleteFor.id);
            void refreshSummary();
            toast.success(t('tasksModule.list.toast.deleted'));
            setDeleteFor(null);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDialogBusy(false);
        }
    }, [deleteFor, refreshSummary, removeRow]);

    const confirmDeleteRequest = useCallback(async (note: string) => {
        if (!deleteRequestFor) return;
        setDialogBusy(true);
        try {
            applyEnvelope(await tasksApi.requestDelete(deleteRequestFor.id, note || undefined));
            toast.success(t('tasksModule.deleteRequest.sent'));
            setDeleteRequestFor(null);
        } catch (error) {
            toast.error(tasksErrorMessage(error));
        } finally {
            setDialogBusy(false);
        }
    }, [applyEnvelope, deleteRequestFor]);

    const menuActions = useMemo<TaskRowMenuActions>(() => ({
        open: (row) => navigate(`/tasks/${row.id}`),
        edit: onEdit,
        toggleTimer: (row) => void (selectTimerRunning(row.id, row.timer.runningForMe)(useTasksModuleStore.getState())
            ? pause(row.id)
            : start(row.id, row.title)),
        requestCompletion: (row) => setCompletionFor(row),
        toggleFlag: (row) => void runOptimistic(row, { flagged: !row.flagged }, () => tasksApi.update(row.id, { flagged: !row.flagged })),
        setStatus: (row, status) => void setStatus(row, status),
        duplicate: async (row) => {
            try {
                const { task } = await tasksApi.duplicate(row.id);
                emitTasksChanged('task', task.id);
                void refreshSummary();
                toast.success(t('tasksModule.list.toast.duplicated'), {
                    action: { label: t('tasksModule.list.menu.open'), onClick: () => navigate(`/tasks/${task.id}`) },
                });
            } catch (error) {
                toast.error(tasksErrorMessage(error));
            }
        },
        remove: (row) => setDeleteFor(row),
        requestDelete: (row) => setDeleteRequestFor(row),
    }), [navigate, onEdit, pause, refreshSummary, runOptimistic, setStatus, start]);

    return {
        quickComplete,
        menuActions,
        busyIds,
        dialogs: {
            completionFor,
            blockFor,
            deleteFor,
            deleteRequestFor,
            busy: dialogBusy,
            closeCompletion: () => setCompletionFor(null),
            closeBlock: () => setBlockFor(null),
            closeDelete: () => setDeleteFor(null),
            closeDeleteRequest: () => setDeleteRequestFor(null),
            confirmCompletion,
            confirmBlock,
            confirmDelete,
            confirmDeleteRequest,
        },
    };
};

export type TaskRowDialogsState = ReturnType<typeof useTaskRowActions>['dialogs'];
