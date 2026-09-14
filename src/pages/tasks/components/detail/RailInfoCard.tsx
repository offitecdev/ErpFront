import { useRef, useState } from 'react';
import { LuPlus, LuX } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { tasksApi, type TaskUpdateInput } from '@/lib/api/tasksModule';
import type { TaskDetailResult } from '@/types/tasksModule';
import type { TaskDetailController } from '../../hooks/useTaskDetail';
import { useNow } from '../../hooks/useNow';
import { useIsTasksManager } from '../../store/tasksModuleStore';
import { isOpenStatus, personName, remainingInfo, smartDate } from '../../utils/taskFormat';
import { PeoplePicker } from '../shared/PeoplePicker';
import { DateEditCard } from './DateEditCard';
import { dayAtHour, inOneHour } from './detailDates';

type DateField = 'startAt' | 'dueAt' | 'reminderAt';

const DATE_LABEL: Record<DateField, string> = {
    startAt: 'tasksModule.detail.rail.start',
    dueAt: 'tasksModule.detail.rail.due',
    reminderAt: 'tasksModule.detail.rail.reminder',
};

/**
 * Erste Karte der Seitenleiste (Görevly `railHtml`): Verantwortliche (nur
 * Leitung), Anfang, Ende, Erinnerung (mit canEdit per Klick änderbar), Restzeit
 * offener Aufgaben und wer die Aufgabe angelegt hat.
 */
export const RailInfoCard = ({ ctl, data }: { ctl: TaskDetailController; data: TaskDetailResult }) => {
    const isManager = useIsTasksManager();
    const now = useNow(60_000);
    const { task, permissions, people } = data;
    const [pickerAnchor, setPickerAnchor] = useState<HTMLElement | null>(null);
    const [editing, setEditing] = useState<DateField | null>(null);
    const [saving, setSaving] = useState(false);
    const chainRef = useRef<Promise<unknown>>(Promise.resolve());

    const saveAssignees = (next: string[]) => {
        ctl.setAssigneeIds(next);
        chainRef.current = chainRef.current.then(() => ctl.act(() => tasksApi.setAssignees(task.id, next)));
    };

    const saveDate = async (field: DateField, value: string | null) => {
        setSaving(true);
        const patch: TaskUpdateInput = field === 'startAt' ? { startAt: value } : field === 'dueAt' ? { dueAt: value } : { reminderAt: value };
        const result = await ctl.act(() => tasksApi.update(task.id, patch));
        setSaving(false);
        if (result) setEditing(null);
    };

    const dateValue = (field: DateField) => {
        const iso = task[field];
        const text = iso ? smartDate(iso, true, now) : t('tasksModule.detail.rail.none');
        if (!permissions.canEdit) return <span className={iso ? '' : 'ofi-gv-muted'}>{text}</span>;
        return (
            <button
                type="button"
                className={`ofi-gv-detail-railvalue ofi-btn-plain ${iso ? '' : 'is-empty'}`}
                onClick={() => setEditing(field)}
            >
                {text}
            </button>
        );
    };

    const remaining = task.dueAt && isOpenStatus(task.status) ? remainingInfo(task.dueAt, now) : null;

    return (
        <section className="ofi-gv-panel ofi-gv-detail-card">
            <dl className="ofi-gv-kv ofi-gv-detail-kv">
                {isManager && (
                    <>
                        <dt>{t('tasksModule.detail.rail.assignees')}</dt>
                        <dd className="ofi-gv-detail-assignees">
                            {task.assigneeIds.map((id) => (
                                <span key={id} className="ofi-gv-detail-person">
                                    <span className="ofi-gv-detail-person__name">{personName(people, id)}</span>
                                    <button
                                        type="button"
                                        className="ofi-gv-detail-person__remove ofi-btn-plain"
                                        aria-label={t('tasksModule.detail.rail.unassign', { name: personName(people, id) })}
                                        title={t('tasksModule.detail.rail.unassign', { name: personName(people, id) })}
                                        onClick={() => saveAssignees(task.assigneeIds.filter((value) => value !== id))}
                                    >
                                        <LuX size={11} />
                                    </button>
                                </span>
                            ))}
                            <button
                                type="button"
                                className="ofi-gv-add ofi-btn-plain"
                                onClick={(event) => setPickerAnchor(pickerAnchor ? null : event.currentTarget)}
                            >
                                <LuPlus size={12} />
                                {t('tasksModule.detail.rail.addPerson')}
                            </button>
                        </dd>
                    </>
                )}
                <dt>{t(DATE_LABEL.startAt)}</dt>
                <dd>{dateValue('startAt')}</dd>
                <dt>{t(DATE_LABEL.dueAt)}</dt>
                <dd>{dateValue('dueAt')}</dd>
                {remaining && (
                    <>
                        <dt>{t('tasksModule.detail.rail.remaining')}</dt>
                        <dd><span className={`ofi-gv-due ${remaining.tone ? `is-${remaining.tone}` : ''}`}>{remaining.text}</span></dd>
                    </>
                )}
                <dt>{t(DATE_LABEL.reminderAt)}</dt>
                <dd>{dateValue('reminderAt')}</dd>
                <dt>{t('tasksModule.detail.rail.createdBy')}</dt>
                <dd className="ofi-gv-detail-creator">
                    <span className="truncate">{personName(people, task.createdById)}</span>
                </dd>
            </dl>

            <PeoplePicker
                anchorEl={pickerAnchor}
                onClose={() => setPickerAnchor(null)}
                selected={task.assigneeIds}
                onChange={saveAssignees}
                multiple
            />

            <DateEditCard
                open={editing !== null}
                title={editing ? t(DATE_LABEL[editing]) : ''}
                label={editing ? t(DATE_LABEL[editing]) : ''}
                value={editing ? task[editing] : null}
                defaultTime={editing === 'dueAt' ? '18:00' : editing === 'reminderAt' ? '09:00' : '08:00'}
                busy={saving}
                onClose={() => setEditing(null)}
                onSave={(value) => { if (editing) void saveDate(editing, value); }}
                quick={editing === 'dueAt'
                    ? (set) => (
                        <>
                            <button type="button" className="ofi-gv-add ofi-btn-plain" onClick={() => set(dayAtHour(0, 18))}>{t('tasksModule.date.today')}</button>
                            <button type="button" className="ofi-gv-add ofi-btn-plain" onClick={() => set(dayAtHour(1, 18))}>{t('tasksModule.date.tomorrow')}</button>
                        </>
                    )
                    : editing === 'reminderAt'
                        ? (set) => (
                            <button type="button" className="ofi-gv-add ofi-btn-plain" onClick={() => set(inOneHour())}>
                                {t('tasksModule.detail.rail.inOneHour')}
                            </button>
                        )
                        : undefined}
            />
        </section>
    );
};
