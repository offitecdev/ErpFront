import { useEffect, useState } from 'react';
import { LuBell, LuBellOff, LuCalendar, LuCalendarX, LuChevronDown, LuChevronUp, LuClock, LuEllipsis, LuFlag, LuTrash2, LuUser } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ChecklistItemInput } from '@/lib/api/tasksModule';
import type { ChecklistItem } from '@/types/tasksModule';
import { DateEditCard } from '../detail/DateEditCard';
import { dayAtHour, inOneHour } from '../detail/detailDates';
import { PopoverMenu, type MenuEntry } from '../detail/PopoverMenu';
import { PeoplePicker } from '../shared/PeoplePicker';
import { TaskIconButton } from '../shared/TaskButton';
import { useIsTasksAdmin } from '../../store/tasksModuleStore';
import { useChecklistEnv } from './checklistEnv';

type Popover =
    | { kind: 'reminder'; anchor: HTMLElement }
    | { kind: 'more'; anchor: HTMLElement }
    | { kind: 'people'; anchor: HTMLElement }
    | { kind: 'date'; field: 'dueAt' | 'reminderAt' };

/**
 * Werkzeuge eines Punkts beim Überfahren (Görevly `cl-tools`): Bugün · Yarın ·
 * Tarih · Hatırlatıcı · Kişi · Bayrak · ⋯ · Sil. Einen Punkt gibt man nur an
 * Verantwortliche der Aufgabe; allein die Administratorrolle an jede Person —
 * der Server nimmt sie dann als Verantwortliche auf (15.09.2026).
 */
export const ChecklistItemTools = ({
    item,
    isFirst,
    isLast,
    onOpenChange,
    onPatch,
    onMove,
    onDelete,
}: {
    item: ChecklistItem;
    isFirst: boolean;
    isLast: boolean;
    onOpenChange: (open: boolean) => void;
    onPatch: (input: ChecklistItemInput, optimistic: Partial<ChecklistItem>) => Promise<boolean>;
    onMove: (direction: 'up' | 'down') => void;
    onDelete: () => void;
}) => {
    const env = useChecklistEnv();
    const isAdmin = useIsTasksAdmin();
    const [popover, setPopover] = useState<Popover | null>(null);
    const [saving, setSaving] = useState(false);

    useEffect(() => { onOpenChange(popover !== null); }, [popover, onOpenChange]);

    const close = () => setPopover(null);
    const setDue = (dueAt: string | null) => void onPatch({ dueAt }, { dueAt });
    const setReminder = (reminderAt: string | null) => void onPatch({ reminderAt }, { reminderAt });

    const reminderEntries: MenuEntry[] = [
        { key: 'hour', label: t('tasksModule.checklist.inOneHour'), icon: <LuClock size={15} />, onSelect: () => setReminder(inOneHour()) },
        { key: 'tomorrow', label: t('tasksModule.checklist.tomorrowMorning'), icon: <LuBell size={15} />, onSelect: () => setReminder(dayAtHour(1, 9)) },
        { key: 'custom', label: t('tasksModule.checklist.customTime'), icon: <LuCalendar size={15} />, onSelect: () => setPopover({ kind: 'date', field: 'reminderAt' }) },
        { kind: 'separator', key: 'sep' },
        { key: 'remove', label: t('tasksModule.checklist.removeReminder'), icon: <LuBellOff size={15} />, danger: true, disabled: !item.reminderAt, onSelect: () => setReminder(null) },
    ];

    const moreEntries: MenuEntry[] = [
        { key: 'up', label: t('tasksModule.checklist.moveUp'), icon: <LuChevronUp size={15} />, disabled: isFirst, onSelect: () => onMove('up') },
        { key: 'down', label: t('tasksModule.checklist.moveDown'), icon: <LuChevronDown size={15} />, disabled: isLast, onSelect: () => onMove('down') },
        { key: 'nodate', label: t('tasksModule.checklist.removeDate'), icon: <LuCalendarX size={15} />, disabled: !item.dueAt, onSelect: () => setDue(null) },
        { kind: 'separator', key: 'sep' },
        { key: 'delete', label: t('tasksModule.checklist.deleteItem'), icon: <LuTrash2 size={15} />, danger: true, onSelect: onDelete },
    ];

    const dateField = popover?.kind === 'date' ? popover.field : null;

    return (
        <div className="ofi-gv-checklist-item__tools">
            <button type="button" className="ofi-gv-add ofi-btn-plain" onClick={() => setDue(dayAtHour(0, 18))}>
                {t('tasksModule.date.today')}
            </button>
            <button type="button" className="ofi-gv-add ofi-btn-plain" onClick={() => setDue(dayAtHour(1, 18))}>
                {t('tasksModule.date.tomorrow')}
            </button>
            <TaskIconButton small label={t('tasksModule.checklist.dueDate')} active={Boolean(item.dueAt)} onClick={() => setPopover({ kind: 'date', field: 'dueAt' })}>
                <LuCalendar size={13} />
            </TaskIconButton>
            <TaskIconButton small label={t('tasksModule.checklist.reminder')} active={Boolean(item.reminderAt)} onClick={(event) => setPopover({ kind: 'reminder', anchor: event.currentTarget })}>
                <LuBell size={13} />
            </TaskIconButton>
            <TaskIconButton small label={t('tasksModule.checklist.assignee')} active={Boolean(item.assigneeId)} onClick={(event) => setPopover({ kind: 'people', anchor: event.currentTarget })}>
                <LuUser size={13} />
            </TaskIconButton>
            <TaskIconButton small label={item.flagged ? t('tasksModule.checklist.unflag') : t('tasksModule.checklist.flag')} active={item.flagged} onClick={() => void onPatch({ flagged: !item.flagged }, { flagged: !item.flagged })}>
                <LuFlag size={13} />
            </TaskIconButton>
            <TaskIconButton small label={t('tasksModule.checklist.more')} onClick={(event) => setPopover({ kind: 'more', anchor: event.currentTarget })}>
                <LuEllipsis size={13} />
            </TaskIconButton>
            <span className="ofi-gv-checklist-item__sep" aria-hidden />
            <TaskIconButton small danger label={t('tasksModule.checklist.deleteItem')} onClick={onDelete}>
                <LuTrash2 size={13} />
            </TaskIconButton>

            <PopoverMenu
                anchorEl={popover?.kind === 'reminder' ? popover.anchor : null}
                onClose={close}
                entries={reminderEntries}
                width={210}
                label={t('tasksModule.checklist.reminder')}
            />
            <PopoverMenu
                anchorEl={popover?.kind === 'more' ? popover.anchor : null}
                onClose={close}
                entries={moreEntries}
                width={210}
                label={t('tasksModule.checklist.more')}
            />
            <PeoplePicker
                anchorEl={popover?.kind === 'people' ? popover.anchor : null}
                onClose={close}
                selected={item.assigneeId ? [item.assigneeId] : []}
                onChange={(ids) => {
                    const assigneeId = ids[0] ?? null;
                    if (assigneeId !== item.assigneeId) void onPatch({ assigneeId }, { assigneeId });
                }}
                allowNone
                onlyIds={isAdmin ? undefined : env.taskAssigneeIds}
            />
            <DateEditCard
                open={dateField !== null}
                title={dateField === 'reminderAt' ? t('tasksModule.checklist.reminder') : t('tasksModule.checklist.dueDate')}
                label={dateField === 'reminderAt' ? t('tasksModule.checklist.reminder') : t('tasksModule.checklist.dueDate')}
                value={dateField ? item[dateField] : null}
                defaultTime={dateField === 'reminderAt' ? '09:00' : '18:00'}
                busy={saving}
                onClose={close}
                onSave={async (value) => {
                    if (!dateField) return;
                    setSaving(true);
                    const change = dateField === 'dueAt' ? { dueAt: value } : { reminderAt: value };
                    const ok = await onPatch(change, change);
                    setSaving(false);
                    if (ok) close();
                }}
            />
        </div>
    );
};
