import { useRef, useState } from 'react';
import { LuFlag, LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi } from '@/lib/api/tasksModule';
import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { LabelPicker } from '../shared/LabelPicker';
import { LabelChip, ProgressBar, TaskStatusBadge } from '../shared/TaskMarks';
import { DescriptionField } from './DescriptionField';
import { TitleField } from './TitleField';

/**
 * Kopf der Aufgabe (Görevly `headHtml`): Titel und Beschreibung direkt
 * überschreibbar (canEdit), Etiketten mit «+ Etiket», Fortschritt der
 * Checklisten. Etiketten werden bei jedem Haken sofort gespeichert — nacheinander,
 * damit schnelle Klicks nicht in falscher Reihenfolge ankommen.
 */
export const DetailHeader = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const { task, permissions } = data;
    const labels = useTasksModuleStore((state) => state.bootstrap?.labels ?? []);
    const [labelAnchor, setLabelAnchor] = useState<HTMLElement | null>(null);
    const chainRef = useRef<Promise<unknown>>(Promise.resolve());

    const saveLabels = (next: string[]) => {
        ctl.setLabelIds(next);
        chainRef.current = chainRef.current.then(() => ctl.act(() => tasksApi.setLabels(task.id, next), { reload: false }));
    };

    const taskLabels = task.labelIds
        .map((id) => labels.find((label) => label.id === id))
        .filter((label): label is NonNullable<typeof label> => Boolean(label));
    const { done, total } = task.checklist;

    return (
        <section className="ofi-gv-panel ofi-gv-detail-head">
            <div className="ofi-gv-detail-head__top">
                <TaskStatusBadge status={task.effectiveStatus} />
                {task.flagged && (
                    <span className="ofi-gv-meta ofi-gv-flag" title={t('tasksModule.detail.flagged')}>
                        <LuFlag size={13} />
                    </span>
                )}
            </div>
            <TitleField
                value={task.title}
                editable={permissions.canEdit}
                onSave={(title) => void ctl.act(() => tasksApi.update(task.id, { title }), { reload: false })}
            />
            <DescriptionField
                value={task.description}
                editable={permissions.canEdit}
                onSave={(description) => void ctl.act(() => tasksApi.update(task.id, { description }), { reload: false })}
            />
            {(taskLabels.length > 0 || permissions.canEdit) && (
                <div className="ofi-gv-detail-head__labels">
                    {taskLabels.map((label) => (
                        <LabelChip
                            key={label.id}
                            label={label}
                            onRemove={permissions.canEdit ? () => saveLabels(task.labelIds.filter((id) => id !== label.id)) : undefined}
                        />
                    ))}
                    {permissions.canEdit && (
                        <button
                            type="button"
                            className="ofi-gv-add ofi-btn-plain"
                            onClick={(event) => setLabelAnchor(labelAnchor ? null : event.currentTarget)}
                        >
                            <LuPlus size={12} />
                            {t('tasksModule.detail.addLabel')}
                        </button>
                    )}
                </div>
            )}
            {total > 0 && (
                <div className="ofi-gv-detail-head__progress">
                    <ProgressBar done={done} total={total} className="ofi-gv-detail-head__bar" />
                    <span className="ofi-gv-caption">{t('tasksModule.detail.itemsProgress', { done, total })}</span>
                </div>
            )}
            <LabelPicker
                anchorEl={labelAnchor}
                onClose={() => setLabelAnchor(null)}
                selected={task.labelIds}
                onChange={saveLabels}
            />
        </section>
    );
};
