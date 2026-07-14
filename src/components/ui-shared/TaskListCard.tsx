import React from 'react';
import { useTranslation } from 'react-i18next';
import { LuCheck, LuFileText, LuUser } from '../icons/lucideLocal';

export interface TaskListItem {
    id: string | number;
    title: string;
    /** ISO string or Date; shown as "Dec 11, 2024" and turns red when in the past */
    dueDate?: string | Date | null;
    note?: string | null;
    /** shows the green shared-with icon after the note preview */
    noteShared?: boolean;
    assignee?: string | null;
    completed?: boolean;
}

interface TaskListCardProps {
    items: TaskListItem[];
    onToggle?: (item: TaskListItem) => void;
    onRowClick?: (item: TaskListItem) => void;
    className?: string;
}

const Dash: React.FC = () => <span className="text-gray-400">-</span>;

export const TaskListCard: React.FC<TaskListCardProps> = ({ items, onToggle, onRowClick, className }) => {
    const { t, i18n } = useTranslation();

    const formatDue = (value: string | Date) => {
        const date = value instanceof Date ? value : new Date(value);
        if (Number.isNaN(date.getTime())) return String(value);
        return new Intl.DateTimeFormat(i18n.language, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
    };

    const isOverdue = (item: TaskListItem) => {
        if (!item.dueDate || item.completed) return false;
        const date = item.dueDate instanceof Date ? item.dueDate : new Date(item.dueDate);
        return !Number.isNaN(date.getTime()) && date.getTime() < Date.now();
    };

    return (
        <div className={className}>
            {/* Column headers sit on the page background, outside the white card */}
            <div className="grid grid-cols-12 gap-4 px-6 pb-2.5 pt-1 text-sm font-semibold text-gray-500">
                <div className="col-span-5">{t('taskList.title', 'Title')}</div>
                <div className="col-span-2">{t('taskList.dueDate', 'Due date')}</div>
                <div className="col-span-3">{t('taskList.assignedNote', 'Assigned note')}</div>
                <div className="col-span-2">{t('taskList.assignedTo', 'Assigned to')}</div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-gray-200/60 bg-white shadow-sm">
                {items.map((item) => (
                    <div
                        key={item.id}
                        onClick={onRowClick ? () => onRowClick(item) : undefined}
                        className={`grid grid-cols-12 items-center gap-4 border-b border-gray-100 px-6 py-3 transition-colors last:border-b-0 hover:bg-gray-50/80${onRowClick ? ' cursor-pointer' : ''}`}
                    >
                        <div className="col-span-5 flex min-w-0 items-center gap-3">
                            <button
                                type="button"
                                aria-label={t('taskList.toggleComplete', 'Mark as complete')}
                                aria-pressed={!!item.completed}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onToggle?.(item);
                                }}
                                className={`flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
                                    item.completed
                                        ? 'border-green-600 bg-green-600 text-white'
                                        : 'border-gray-300 text-transparent hover:border-gray-400'
                                }`}
                            >
                                {item.completed && <LuCheck size={11} strokeWidth={3} />}
                            </button>
                            <span className={`truncate text-sm ${item.completed ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                                {item.title}
                            </span>
                        </div>

                        <div className="col-span-2 text-sm">
                            {item.dueDate
                                ? <span className={isOverdue(item) ? 'text-red-500' : 'text-gray-500'}>{formatDue(item.dueDate)}</span>
                                : <Dash />}
                        </div>

                        <div className="col-span-3 flex min-w-0 items-center gap-2 text-sm text-gray-500">
                            {item.note ? (
                                <>
                                    <LuFileText size={15} className="shrink-0 text-gray-400" />
                                    <span className="truncate">{item.note}</span>
                                    {item.noteShared && <LuUser size={15} className="shrink-0 text-green-600" />}
                                </>
                            ) : (
                                <Dash />
                            )}
                        </div>

                        <div className="col-span-2 truncate text-sm text-gray-500">
                            {item.assignee ? item.assignee : <Dash />}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
