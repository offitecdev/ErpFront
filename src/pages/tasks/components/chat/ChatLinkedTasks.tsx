import { Link } from 'react-router-dom';
import { LuX } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ChatRoomTask } from '@/types/tasksModule';
import { statusLabel, statusTone } from '../../utils/taskFormat';
import { truncateText } from './chatFormat';

const TITLE_MAX = 32;

/**
 * Leiste unter dem Kopf: die verknüpften Aufgaben als Chips mit Zustandspunkt.
 * Ein Chip führt zur Aufgabe, wenn man sie sehen darf (`canOpen`); die Leitung
 * löst die Verknüpfung mit dem Kreuz.
 */
export const ChatLinkedTasks = ({
    tasks,
    canManage,
    busy,
    onUnlink,
}: {
    tasks: ChatRoomTask[];
    canManage: boolean;
    busy: boolean;
    onUnlink: (taskId: string) => void;
}) => {
    if (!tasks.length) return null;
    return (
        <div className="ofi-gv-chat-tasks" role="list" aria-label={t('tasksModule.chat.tasks.label')}>
            {tasks.map((task) => {
                const body = (
                    <>
                        <i className={`ofi-gv-chat-dot is-${statusTone(task.status)}`} aria-hidden />
                        <span className="ofi-gv-chat-taskchip__title">{truncateText(task.title, TITLE_MAX)}</span>
                    </>
                );
                const hint = `${task.title} · ${statusLabel(task.status)}`;
                return (
                    <span key={task.id} role="listitem" className="ofi-gv-chat-taskchip">
                        {task.canOpen
                            ? <Link to={`/tasks/${task.id}`} className="ofi-gv-chat-taskchip__link" title={hint}>{body}</Link>
                            : <span className="ofi-gv-chat-taskchip__link is-static" title={hint}>{body}</span>}
                        {canManage && (
                            <button
                                type="button"
                                className="ofi-gv-chat-taskchip__remove ofi-btn-plain"
                                disabled={busy}
                                aria-label={t('tasksModule.chat.tasks.unlink', { title: task.title })}
                                title={t('tasksModule.chat.tasks.unlink', { title: task.title })}
                                onClick={() => onUnlink(task.id)}
                            >
                                <LuX size={11} />
                            </button>
                        )}
                    </span>
                );
            })}
        </div>
    );
};
