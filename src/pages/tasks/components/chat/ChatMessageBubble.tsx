import { memo } from 'react';
import { LuTrash2 } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import type { ChatMessage } from '@/types/tasksModule';
import { formatDayTime, formatTime } from '../../utils/taskFormat';
import { TaskIconButton } from '../shared/TaskButton';
import { ChatAttachments } from './ChatAttachments';

/**
 * Eine Textnachricht. Eigene rechts in der leisen Akzentfläche, fremde links
 * neutral mit Name und Avatar am Anfang einer Gruppe; die Uhrzeit steht unter
 * der letzten Blase einer Gruppe und als Hinweis auf jeder Blase. Löschen
 * (`message.canDelete`: eigene Textnachricht oder Leitung) erscheint beim
 * Überfahren.
 */
export const ChatMessageBubble = memo(({
    message,
    senderName,
    own,
    first,
    last,
    onDelete,
}: {
    message: ChatMessage;
    senderName: string;
    own: boolean;
    first: boolean;
    last: boolean;
    onDelete: (message: ChatMessage) => void;
    /** Nur zum Neuzeichnen beim Sprachwechsel (die Blase ist gemerkt). */
    lang?: string;
}) => {
    const mediaOnly = !message.text && message.attachments.length > 0;
    return (
        <div className={`ofi-gv-chat-msg ${own ? 'is-own' : ''} ${first ? 'is-first' : ''}`}>
            <div className="ofi-gv-chat-msg__col">
                {!own && first && <div className="ofi-gv-chat-msg__name">{senderName}</div>}
                <div className="ofi-gv-chat-msg__line">
                    <div className={`ofi-gv-chat-bubble ${mediaOnly ? 'is-media' : ''}`} title={formatDayTime(message.createdAt)}>
                        {message.text && <div className="ofi-gv-chat-bubble__text">{message.text}</div>}
                        {message.attachments.length > 0 && <ChatAttachments attachments={message.attachments} />}
                    </div>
                    {message.canDelete && (
                        <TaskIconButton
                            small
                            danger
                            className="ofi-gv-chat-msg__delete"
                            label={t('tasksModule.chat.messages.delete')}
                            onClick={() => onDelete(message)}
                        >
                            <LuTrash2 size={13} />
                        </TaskIconButton>
                    )}
                </div>
                {last && (
                    <time className="ofi-gv-chat-msg__time" dateTime={message.createdAt}>
                        {formatTime(message.createdAt)}
                    </time>
                )}
            </div>
        </div>
    );
});

ChatMessageBubble.displayName = 'ChatMessageBubble';
