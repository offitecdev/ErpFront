import { useCallback, useMemo } from 'react';

import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useIsTasksManager, useTasksActorId } from '../../store/tasksModuleStore';
import type { ChecklistEnv } from '../checklist/checklistEnv';
import { BlockEditor } from '../editor/BlockEditor';

/**
 * Reiter «İçerik»: der Blockeditor samt Checklisten. Hier wird nur verdrahtet —
 * welche Antwort des Servers in welchen Teil des Seitenstands gehört.
 */
export const ContentTab = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const isManager = useIsTasksManager();
    const actorId = useTasksActorId();
    const { task, permissions } = data;
    const {
        update,
        upsertChecklist,
        setItem,
        insertItem,
        removeItem,
        setProgress,
        setAssigneeIds,
        setContent,
        removeChecklist,
        addAttachments,
    } = ctl;

    const renameChecklistLocal = useCallback((checklistId: string, title: string) => {
        update((current) => ({
            ...current,
            checklists: current.checklists.map((entry) => (entry.id === checklistId ? { ...entry, title } : entry)),
        }));
    }, [update]);

    const checklistEnv = useMemo<Omit<ChecklistEnv, 'deleteChecklist' | 'editable'>>(() => ({
        taskId: task.id,
        isManager,
        actorId,
        people: data.people,
        taskAssigneeIds: task.assigneeIds,
        replaceChecklist: upsertChecklist,
        renameChecklistLocal,
        setItem,
        insertItem,
        removeItem,
        setProgress,
        setTaskAssignees: setAssigneeIds,
    }), [task.id, isManager, actorId, data.people, task.assigneeIds, upsertChecklist, renameChecklistLocal, setItem, insertItem, removeItem, setProgress, setAssigneeIds]);

    return (
        <section className="ofi-gv-panel ofi-gv-detail-content">
            <BlockEditor
                taskId={task.id}
                content={data.content}
                checklists={data.checklists}
                attachments={data.attachments}
                editable={permissions.canEditContent}
                isManager={isManager}
                checklistEnv={checklistEnv}
                busyRef={ctl.contentBusyRef}
                onContentChange={setContent}
                onChecklistAdded={upsertChecklist}
                onChecklistRemoved={removeChecklist}
                onProgress={setProgress}
                onAttachmentsAdded={addAttachments}
            />
        </section>
    );
};
