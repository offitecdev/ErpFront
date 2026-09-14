import { memo } from 'react';
import { Link } from 'react-router-dom';

import { t } from '@/i18n/translate';
import type { ChatRoomListItem, PeopleMap } from '@/types/tasksModule';
import { relativeTime } from '../../utils/taskFormat';
import { roomPreview } from './chatFormat';
import { ChatRoomTile } from './ChatRoomTile';

/** Eine Zeile der Raumliste: Kachel, Name, Zeit, Vorschau, Ungelesen, Aufgaben. */
export const ChatRoomRow = memo(({
    room,
    people,
    me,
    active,
    nowMs,
}: {
    room: ChatRoomListItem;
    people: PeopleMap;
    me: string;
    active: boolean;
    nowMs: number;
    /** Nur zum Neuzeichnen beim Sprachwechsel (die Zeile ist gemerkt). */
    lang?: string;
}) => {
    // Im offenen Raum liest man gerade — dort steht keine Zahl.
    const unread = active ? 0 : room.unreadCount;
    return (
        <Link
            to={`/tasks/chat/${room.id}`}
            aria-current={active ? 'page' : undefined}
            className={`ofi-gv-chat-room ${active ? 'is-active' : ''} ${unread ? 'is-unread' : ''}`}
        >
            <ChatRoomTile name={room.name} />
            <span className="ofi-gv-chat-room__main">
                <span className="ofi-gv-chat-room__top">
                    <span className="ofi-gv-chat-room__name">{room.name}</span>
                    <span className="ofi-gv-chat-room__time">{relativeTime(room.lastMessageAt || room.createdAt, nowMs)}</span>
                </span>
                <span className="ofi-gv-chat-room__bottom">
                    <span className="ofi-gv-chat-room__preview">{roomPreview(room, people, me)}</span>
                    {unread > 0 && (
                        <span className="ofi-gv-count is-accent" aria-label={t('tasksModule.chat.list.unread', { count: unread })}>
                            {unread > 99 ? '99+' : unread}
                        </span>
                    )}
                </span>
                {room.taskCount > 0 && (
                    <span className="ofi-gv-chat-room__tasks">{t('tasksModule.chat.list.tasks', { count: room.taskCount })}</span>
                )}
            </span>
        </Link>
    );
});

ChatRoomRow.displayName = 'ChatRoomRow';
