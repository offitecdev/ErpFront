import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { tasksApi, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { RoomDetail } from '@/types/tasksModule';
import { emitTasksChanged } from '../utils/taskEvents';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';

const roomCacheKey = (roomId: string): string => `chat:room:${roomId}`;

/**
 * ── SOHBET: EIN RAUM (Kopf, Mitglieder, verknüpfte Aufgaben) ──────────────────
 *
 * Lädt die Angaben des offenen Raums und trägt die Handlungen der Leitung
 * (umbenennen, löschen, Mitglieder, Aufgaben). Jede Antwort bringt den ganzen
 * Raum zurück — er ersetzt den lokalen Stand. Danach ruft der Hook
 * `emitTasksChanged('chat')`: die Raumliste und eine offene Aufgabe frischen
 * sich darüber auf. Der Server prüft die Rolle ohnehin (MANAGER_ONLY).
 */

export interface ChatRoomApi {
    detail: RoomDetail | null;
    error: unknown;
    busy: boolean;
    reload: () => Promise<void>;
    rename: (name: string) => Promise<boolean>;
    remove: () => Promise<boolean>;
    addMember: (employeeId: string) => Promise<boolean>;
    removeMember: (employeeId: string) => Promise<boolean>;
    linkTask: (taskId: string) => Promise<boolean>;
    unlinkTask: (taskId: string) => Promise<boolean>;
}

/** `onChanged` — nach jeder erfolgreichen Handlung (der Server schreibt dabei
 *  Systemnachrichten; der Raum fragt sie sofort ab). */
export const useChatRoom = (roomId: string, onChanged?: () => void): ChatRoomApi => {
    const [detail, setDetailState] = useState<RoomDetail | null>(() => readTasksCache<RoomDetail>(roomCacheKey(roomId)));
    const [error, setError] = useState<unknown>(null);
    const [busy, setBusy] = useState(false);
    const roomRef = useRef(roomId);
    const onChangedRef = useRef(onChanged);
    useEffect(() => {
        roomRef.current = roomId;
        onChangedRef.current = onChanged;
    });

    const setDetail = useCallback((next: RoomDetail | null) => {
        if (next) writeTasksCache(roomCacheKey(next.room.id), next);
        setDetailState(next);
    }, []);

    const reload = useCallback(async () => {
        const forRoom = roomId;
        try {
            const next = await tasksApi.room(forRoom);
            if (roomRef.current !== forRoom) return;
            setDetail(next);
            setError(null);
        } catch (loadError) {
            if (roomRef.current !== forRoom) return;
            setError(loadError);
        }
    }, [roomId, setDetail]);

    useEffect(() => {
        // Letzter Stand sofort (tasksCache), frisch im Hintergrund.
        setDetailState(readTasksCache<RoomDetail>(roomCacheKey(roomId)));
        setError(null);
        void reload();
    }, [reload]);

    const run = useCallback(async (action: () => Promise<RoomDetail>, taskId?: string): Promise<boolean> => {
        const forRoom = roomId;
        setBusy(true);
        try {
            const next = await action();
            if (roomRef.current === forRoom) {
                setDetail(next);
                onChangedRef.current?.();
            }
            emitTasksChanged('chat', taskId);
            return true;
        } catch (actionError) {
            toast.error(tasksErrorMessage(actionError));
            return false;
        } finally {
            setBusy(false);
        }
    }, [roomId]);

    const rename = useCallback((name: string) => run(() => tasksApi.renameRoom(roomId, name)), [run, roomId]);
    const addMember = useCallback((employeeId: string) => run(() => tasksApi.addRoomMember(roomId, employeeId)), [run, roomId]);
    const removeMember = useCallback((employeeId: string) => run(() => tasksApi.removeRoomMember(roomId, employeeId)), [run, roomId]);
    const linkTask = useCallback((taskId: string) => run(() => tasksApi.linkRoomTask(roomId, taskId), taskId), [run, roomId]);
    const unlinkTask = useCallback((taskId: string) => run(() => tasksApi.unlinkRoomTask(roomId, taskId), taskId), [run, roomId]);

    const remove = useCallback(async (): Promise<boolean> => {
        setBusy(true);
        try {
            await tasksApi.deleteRoom(roomId);
            emitTasksChanged('chat');
            return true;
        } catch (actionError) {
            toast.error(tasksErrorMessage(actionError));
            return false;
        } finally {
            setBusy(false);
        }
    }, [roomId]);

    return { detail, error, busy, reload, rename, remove, addMember, removeMember, linkTask, unlinkTask };
};
