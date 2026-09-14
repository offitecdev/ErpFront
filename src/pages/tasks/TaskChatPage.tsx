import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { LuPlus } from 'react-icons/lu';

import { t } from '@/i18n/translate';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import '@/styles/modules/tasksChat.css';
import type { RoomDetail } from '@/types/tasksModule';
import { ChatEmptyPane } from './components/chat/ChatEmptyPane';
import { ChatRoomList } from './components/chat/ChatRoomList';
import { ChatRoomPane } from './components/chat/ChatRoomPane';
import { NewRoomDialog } from './components/chat/NewRoomDialog';
import { TaskButton } from './components/shared/TaskButton';
import { TasksModuleShell } from './components/shared/TasksModuleShell';
import { useChatCompact } from './hooks/useChatCompact';
import { useChatRooms } from './hooks/useChatRooms';
import { useIsTasksManager, useTasksActorId, useTasksModuleStore } from './store/tasksModuleStore';

/**
 * ── GÖREVLER: SOHBET (/tasks/chat, /tasks/chat/:roomId) ─────────────────────
 *
 * Zwei Spalten in einer Tafel — Räume | offener Raum —, unter 1024px eine:
 * die Liste ODER der Raum. Auf breitem Schirm öffnet sich wie in Görevly der
 * jüngste Raum von selbst. Räume anlegen darf nur die Leitung («Yeni oda»;
 * `?newRoomTask=<id>` öffnet das Fenster mit dieser Aufgabe).
 */
export const TaskChatPage = () => {
    useLanguageTick();
    const { roomId } = useParams<{ roomId?: string }>();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const ready = useTasksModuleStore((state) => Boolean(state.bootstrap));
    const isManager = useIsTasksManager();
    const me = useTasksActorId();
    const compact = useChatCompact();
    // Räume laden SOFORT — nicht erst nach dem Bootstrap (die Anfrage braucht ihn nicht).
    const { rooms, people, error, refresh, markReadLocal, noteMessages, removeLocal } = useChatRooms(true);
    const [newRoom, setNewRoom] = useState<{ open: boolean; taskId: string | null }>({ open: false, taskId: null });

    // Aus der Aufgabe «Oda aç»: Fenster mit der Aufgabe öffnen, Parameter entfernen.
    const newRoomTask = searchParams.get('newRoomTask');
    useEffect(() => {
        if (!ready || !newRoomTask) return;
        if (isManager) setNewRoom({ open: true, taskId: newRoomTask });
        setSearchParams((previous) => {
            const next = new URLSearchParams(previous);
            next.delete('newRoomTask');
            return next;
        }, { replace: true });
    }, [ready, newRoomTask, isManager, setSearchParams]);

    const firstRoomId = rooms?.[0]?.id;
    useEffect(() => {
        if (compact || roomId || !firstRoomId || newRoom.open || newRoomTask) return;
        navigate(`/tasks/chat/${firstRoomId}`, { replace: true });
    }, [compact, roomId, firstRoomId, newRoom.open, newRoomTask, navigate]);

    const openNewRoom = useCallback(() => setNewRoom({ open: true, taskId: null }), []);
    const closeNewRoom = useCallback(() => setNewRoom({ open: false, taskId: null }), []);
    const onCreated = useCallback((room: RoomDetail) => {
        setNewRoom({ open: false, taskId: null });
        navigate(`/tasks/chat/${room.room.id}`);
    }, [navigate]);

    const backToList = useCallback(() => navigate('/tasks/chat'), [navigate]);
    const onRoomsStale = useCallback(() => { void refresh(); }, [refresh]);
    const onDeleted = useCallback((deletedId: string) => {
        removeLocal(deletedId);
        navigate('/tasks/chat', { replace: true });
    }, [removeLocal, navigate]);

    const activeName = rooms?.find((room) => room.id === roomId)?.name ?? '';

    return (
        <TasksModuleShell
            title={t('tasksModule.nav.chat')}
            actions={isManager ? (
                <TaskButton icon={<LuPlus size={14} />} onClick={openNewRoom}>
                    {t('tasksModule.chat.newRoom.action')}
                </TaskButton>
            ) : undefined}
        >
            <div className={`ofi-gv-panel ofi-gv-chat ${roomId ? 'has-room' : ''}`}>
                {(!compact || !roomId) && (
                    <ChatRoomList
                        rooms={rooms}
                        people={people}
                        me={me}
                        activeRoomId={roomId}
                        error={error}
                        onRetry={onRoomsStale}
                    />
                )}
                {roomId ? (
                    <ChatRoomPane
                        key={roomId}
                        roomId={roomId}
                        fallbackName={activeName}
                        listPeople={people}
                        compact={compact}
                        onBack={backToList}
                        onRoomRead={markReadLocal}
                        onMessages={noteMessages}
                        onRoomsStale={onRoomsStale}
                        onDeleted={onDeleted}
                    />
                ) : !compact && (
                    <ChatEmptyPane
                        hasRooms={Boolean(rooms?.length)}
                        loading={rooms === null}
                        canCreate={isManager}
                        onCreate={openNewRoom}
                    />
                )}
            </div>

            {isManager && (
                <NewRoomDialog
                    open={newRoom.open}
                    prefillTaskId={newRoom.taskId}
                    onClose={closeNewRoom}
                    onCreated={onCreated}
                />
            )}
        </TasksModuleShell>
    );
};
