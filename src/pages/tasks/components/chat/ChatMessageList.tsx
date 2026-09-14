import { useMemo, type RefObject } from 'react';
import { LuArrowDown } from 'react-icons/lu';

import { Spinner } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import type { ChatMessage, PeopleMap } from '@/types/tasksModule';
import { useNow } from '../../hooks/useNow';
import { localeTag, personName } from '../../utils/taskFormat';
import { TaskButton } from '../shared/TaskButton';
import { buildChatItems } from './chatFormat';
import { ChatMessageBubble } from './ChatMessageBubble';
import { ChatSystemMessage } from './ChatSystemMessage';

/**
 * Der Nachrichtenverlauf: chronologisch, mit Tagestrennern, Gruppen und
 * Systemzeilen. Oben «Daha eski mesajlar» (auch automatisch beim Hochrollen),
 * unten — wenn neue Nachrichten kamen, während man weiter oben liest — ein
 * kleiner Knopf zum Springen. Den Bildlauf führt `useChatScroll`.
 */
export const ChatMessageList = ({
    messages,
    people,
    me,
    hasMore,
    loadingOlder,
    unseen,
    containerRef,
    onScroll,
    onLoadOlder,
    onJumpToBottom,
    onDelete,
}: {
    messages: ChatMessage[];
    people: PeopleMap;
    me: string;
    hasMore: boolean;
    loadingOlder: boolean;
    unseen: boolean;
    containerRef: RefObject<HTMLDivElement | null>;
    onScroll: () => void;
    onLoadOlder: () => void;
    onJumpToBottom: () => void;
    onDelete: (message: ChatMessage) => void;
}) => {
    // Tagestrenner («Bugün», «Dün») wechseln um Mitternacht — Minutentakt reicht.
    const nowMs = useNow(60_000);
    const dayStamp = new Date(nowMs).toDateString();
    const language = localeTag();
    // `language` in den Abhängigkeiten: die Tagesnamen stehen in der gewählten
    // Sprache; an die gemerkten Blasen geht sie als Stütze `lang`.
    const items = useMemo(
        () => buildChatItems(messages, me, Date.parse(dayStamp) || Date.now()),
        [messages, me, dayStamp, language],
    );

    return (
        <div className="ofi-gv-chat-thread">
            <div
                ref={containerRef}
                className="ofi-gv-chat-thread__scroll"
                onScroll={onScroll}
                role="log"
                aria-live="polite"
                aria-label={t('tasksModule.chat.messages.label')}
            >
                {hasMore && (
                    <div className="ofi-gv-chat-thread__older">
                        <TaskButton onClick={onLoadOlder} disabled={loadingOlder} icon={loadingOlder ? <Spinner size="sm" /> : undefined}>
                            {t('tasksModule.chat.messages.loadOlder')}
                        </TaskButton>
                    </div>
                )}

                {!messages.length && (
                    <div className="ofi-gv-empty ofi-gv-chat-thread__empty">
                        <div className="ofi-gv-empty__title">{t('tasksModule.chat.messages.empty')}</div>
                        <div>{t('tasksModule.chat.messages.emptyHint')}</div>
                    </div>
                )}

                {items.map((item) => {
                    if (item.kind === 'day') {
                        return <div key={item.key} className="ofi-gv-chat-day" role="separator">{item.label}</div>;
                    }
                    if (item.kind === 'system') {
                        return <ChatSystemMessage key={item.key} message={item.message} people={people} lang={language} />;
                    }
                    return (
                        <ChatMessageBubble
                            key={item.key}
                            message={item.message}
                            senderName={personName(people, item.message.senderId)}
                            own={item.own}
                            first={item.first}
                            last={item.last}
                            onDelete={onDelete}
                            lang={language}
                        />
                    );
                })}
            </div>

            {unseen && (
                <div className="ofi-gv-chat-thread__jump">
                    <TaskButton onClick={onJumpToBottom} icon={<LuArrowDown size={13} />}>
                        {t('tasksModule.chat.messages.newMessages')}
                    </TaskButton>
                </div>
            )}
        </div>
    );
};
