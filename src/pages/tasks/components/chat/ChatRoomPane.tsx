import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { SkeletonBar } from '@/components/ui-shared/Loader';
import { t } from '@/i18n/translate';
import { tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ChatMessage, PeopleMap } from '@/types/tasksModule';
import { useChatMessages } from '../../hooks/useChatMessages';
import { useChatRead } from '../../hooks/useChatRead';
import { useChatRoom } from '../../hooks/useChatRoom';
import { useChatScroll } from '../../hooks/useChatScroll';
import { useIsTasksManager, useTasksActorId } from '../../store/tasksModuleStore';
import { TaskButton } from '../shared/TaskButton';
import { ChatComposer } from './ChatComposer';
import { ChatLinkedTasks } from './ChatLinkedTasks';
import { ChatMessageList } from './ChatMessageList';
import { ChatRoomHead } from './ChatRoomHead';

const ACCESS_CODES = new Set(['ROOM_FORBIDDEN', 'ROOM_NOT_FOUND']);

/**
 * Rechte Spalte: ein Raum. Die Seite hängt sie mit `key={roomId}` ein — jeder
 * Raum beginnt mit frischem Zustand (Entwurf, Bildlauf, offene Fenster).
 *
 * Hier laufen die Fäden zusammen: neue Nachrichten → Raumliste nachführen,
 * unten bleiben oder «Yeni mesajlar» zeigen, gelesen melden; Systemnachrichten
 * → Raumkopf neu laden (Mitglieder/Aufgaben haben sich geändert).
 */
export const ChatRoomPane = ({
    roomId,
    fallbackName,
    listPeople,
    compact,
    onBack,
    onRoomRead,
    onMessages,
    onRoomsStale,
    onDeleted,
}: {
    roomId: string;
    fallbackName: string;
    listPeople: PeopleMap;
    compact: boolean;
    onBack: () => void;
    onRoomRead: (roomId: string) => void;
    onMessages: (roomId: string, messages: ChatMessage[]) => void;
    onRoomsStale: () => void;
    onDeleted: (roomId: string) => void;
}) => {
    const me = useTasksActorId();
    const isManager = useIsTasksManager();
    const [pendingDelete, setPendingDelete] = useState<ChatMessage | null>(null);
    const [deleting, setDeleting] = useState(false);

    const { markRead } = useChatRead(roomId, onRoomRead);
    // Der Takt der Nachrichten liegt tiefer im Baum; der Kopf ruft ihn über diesen Zeiger.
    const pollRef = useRef<() => void>(() => undefined);
    const room = useChatRoom(roomId, () => pollRef.current());

    const scroll = useChatScroll({
        onReachTop: () => {
            const current = messagesRef.current;
            if (current?.hasMore && !current.loadingOlder) void current.loadOlder();
        },
        onSeen: () => markRead(),
    });

    const messages = useChatMessages({
        roomId,
        onLoaded: () => {
            scroll.stickAfterCommit();
            markRead();
        },
        onBeforePrepend: scroll.rememberBeforePrepend,
        onAppended: (fresh, source) => {
            onMessages(roomId, fresh);
            if (fresh.some((message) => message.type === 'SYSTEM')) void room.reload();
            if (source === 'send') {
                scroll.stickAfterCommit();
                return;
            }
            const fromOthers = fresh.some((message) => message.type === 'TEXT' && message.senderId !== me);
            if (scroll.isNearBottom()) {
                scroll.stickAfterCommit();
                if (fromOthers) markRead();
            } else if (fromOthers) {
                scroll.noteUnseen();
            }
        },
    });
    const messagesRef = useRef<typeof messages | null>(null);
    useEffect(() => {
        messagesRef.current = messages;
        pollRef.current = () => { void messages.poll(); };
    });

    const list = messages.messages;
    const contentKey = `${list[0]?.id ?? ''}:${list[list.length - 1]?.id ?? ''}:${list.length}`;
    // Nach dem Zeichnen: unten bleiben / Höhe beim Vorn-Anfügen halten.
    useLayoutEffect(() => {
        scroll.applyPending();
    }, [contentKey, messages.status, scroll.applyPending]);

    const people = useMemo(
        () => ({ ...listPeople, ...room.detail?.people, ...messages.people }),
        [listPeople, room.detail, messages.people],
    );

    const accessError = [room.error, messages.error].find((error) => ACCESS_CODES.has(tasksErrorCode(error)));
    const staleReported = useRef(false);
    useEffect(() => {
        if (accessError && !staleReported.current) {
            staleReported.current = true;
            onRoomsStale();
        }
    }, [accessError, onRoomsStale]);

    const confirmDelete = useCallback(async () => {
        if (!pendingDelete) return;
        setDeleting(true);
        const removed = await messages.remove(pendingDelete.id);
        setDeleting(false);
        if (!removed) return;
        setPendingDelete(null);
        onRoomsStale();
    }, [pendingDelete, messages, onRoomsStale]);

    if (accessError) {
        return (
            <section className="ofi-gv-chat__pane">
                <div className="ofi-gv-chat-notice">
                    <div className="ofi-gv-empty">
                        <div className="ofi-gv-empty__title">{tasksErrorMessage(accessError)}</div>
                        <Link to="/tasks/chat" className="ofi-gv-chat-linkbtn">{t('tasksModule.chat.head.back')}</Link>
                    </div>
                </div>
            </section>
        );
    }

    const canManage = isManager && Boolean(room.detail);

    return (
        <section className="ofi-gv-chat__pane" aria-label={room.detail?.room.name ?? fallbackName}>
            <ChatRoomHead
                room={room}
                fallbackName={fallbackName}
                people={people}
                me={me}
                canManage={canManage}
                compact={compact}
                onBack={onBack}
                onDeleted={() => onDeleted(roomId)}
            />

            {room.detail && (
                <ChatLinkedTasks
                    tasks={room.detail.tasks}
                    canManage={canManage}
                    busy={room.busy}
                    onUnlink={(taskId) => { void room.unlinkTask(taskId); }}
                />
            )}

            {messages.status === 'loading' && (
                <div className="ofi-gv-chat-thread" role="status" aria-label={t('common.loading')}>
                    <div className="ofi-gv-chat-thread__skeleton">
                        {['58%', '40%', '66%', '34%'].map((width, index) => (
                            <div key={width} className={`ofi-gv-chat-thread__skeletonrow ${index % 2 ? 'is-own' : ''}`}>
                                <SkeletonBar width={width} className="ofi-gv-chat-skeleton-bubble" delayMs={index * 90} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {messages.status === 'error' && (
                <div className="ofi-gv-chat-thread">
                    <div className="ofi-gv-chat-notice">
                        <div className="ofi-gv-empty">
                            <div className="ofi-gv-empty__title">{t('tasksModule.chat.messages.loadFailed')}</div>
                            <div className="mb-3">{tasksErrorMessage(messages.error)}</div>
                            <TaskButton onClick={() => void messages.reload()}>{t('tasksModule.chat.retry')}</TaskButton>
                        </div>
                    </div>
                </div>
            )}

            {messages.status === 'ready' && (
                <ChatMessageList
                    messages={list}
                    people={people}
                    me={me}
                    hasMore={messages.hasMore}
                    loadingOlder={messages.loadingOlder}
                    unseen={scroll.unseen}
                    containerRef={scroll.containerRef}
                    onScroll={scroll.onScroll}
                    onLoadOlder={() => void messages.loadOlder()}
                    onJumpToBottom={scroll.jumpToBottom}
                    onDelete={setPendingDelete}
                />
            )}

            <ChatComposer
                sending={messages.sending}
                autoFocus={!compact}
                onSend={messages.send}
            />

            <ConfirmDialog
                open={Boolean(pendingDelete)}
                tone="danger"
                title={t('tasksModule.chat.messages.deleteTitle')}
                message={t('tasksModule.chat.messages.deleteText')}
                confirmLabel={t('common.delete')}
                busy={deleting}
                onConfirm={() => void confirmDelete()}
                onCancel={() => setPendingDelete(null)}
            />
        </section>
    );
};
