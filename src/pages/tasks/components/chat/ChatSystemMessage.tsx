import { memo } from 'react';
import { LuInfo } from 'react-icons/lu';

import type { ChatMessage, PeopleMap } from '@/types/tasksModule';
import { formatDayTime } from '../../utils/taskFormat';
import { systemMessageText } from './chatFormat';

/** Systemzeile: mittig, klein, grau — der Satz in der Sprache der Leserin. */
export const ChatSystemMessage = memo(({ message, people }: {
    message: ChatMessage;
    people: PeopleMap;
    /** Nur zum Neuzeichnen beim Sprachwechsel (die Zeile ist gemerkt). */
    lang?: string;
}) => (
    <div className="ofi-gv-chat-system" title={formatDayTime(message.createdAt)}>
        <LuInfo size={12} aria-hidden />
        <span>{systemMessageText(message.meta, message.text, people)}</span>
    </div>
));

ChatSystemMessage.displayName = 'ChatSystemMessage';
