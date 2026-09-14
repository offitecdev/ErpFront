import { useCallback, useEffect, useRef, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { ChatMessage, ChatRoomListItem, PeopleMap } from '@/types/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';
import { useTasksChanged } from '../utils/taskEvents';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';
import { useChatPoll } from './useChatPoll';

type RoomsSnapshot = { rooms: ChatRoomListItem[]; people: PeopleMap };
const ROOMS_CACHE = 'chat:rooms';

/**
 * ── SOHBET: RAUMLISTE ────────────────────────────────────────────────────────
 *
 * Die Räume, in denen ich Mitglied bin (der Server sortiert nach der letzten
 * Nachricht). Alle 15 s bei sichtbarem Tab und nach jeder Änderung im Modul
 * (`emitTasksChanged('chat')`) neu geholt. Was der offene Raum schon weiss —
 * gelesen, neue Nachricht —, schreibt er sofort hier hinein, damit die Zeile
 * nicht bis zum nächsten Abruf hinterherhinkt. Jede solche lokale Änderung
 * entwertet eine gerade laufende Abfrage (sie trüge den alten Stand).
 */

const ROOMS_POLL_MS = 15_000;

const activityMs = (room: ChatRoomListItem): number => Date.parse(room.lastMessageAt || room.createdAt) || 0;

const sortRooms = (rooms: ChatRoomListItem[]): ChatRoomListItem[] =>
    [...rooms].sort((a, b) => activityMs(b) - activityMs(a));

export interface ChatRoomsApi {
    rooms: ChatRoomListItem[] | null;
    people: PeopleMap;
    error: unknown;
    refresh: () => Promise<void>;
    markReadLocal: (roomId: string) => void;
    noteMessages: (roomId: string, messages: ChatMessage[]) => void;
    removeLocal: (roomId: string) => void;
}

export const useChatRooms = (enabled: boolean): ChatRoomsApi => {
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    // Letzter Stand sofort, frisch im Hintergrund (tasksCache).
    const [rooms, setRoomsState] = useState<ChatRoomListItem[] | null>(() => readTasksCache<RoomsSnapshot>(ROOMS_CACHE)?.rooms ?? null);
    const [people, setPeople] = useState<PeopleMap>(() => readTasksCache<RoomsSnapshot>(ROOMS_CACHE)?.people ?? {});
    const peopleRef = useRef(people);
    peopleRef.current = people;
    const setRooms = useCallback((next: ChatRoomListItem[] | null | ((previous: ChatRoomListItem[] | null) => ChatRoomListItem[] | null)) => {
        setRoomsState((previous) => {
            const value = typeof next === 'function' ? next(previous) : next;
            if (value) writeTasksCache<RoomsSnapshot>(ROOMS_CACHE, { rooms: value, people: peopleRef.current });
            return value;
        });
    }, []);
    const [error, setError] = useState<unknown>(null);
    const generation = useRef(0);

    const refresh = useCallback(async () => {
        const current = ++generation.current;
        try {
            const result = await tasksApi.rooms();
            if (current !== generation.current) return;
            noteServerNow(result.serverNow);
            peopleRef.current = { ...peopleRef.current, ...result.people };
            setPeople(peopleRef.current);
            setRooms(result.data);
            setError(null);
        } catch (loadError) {
            if (current !== generation.current) return;
            setError(loadError);
        }
    }, [noteServerNow, setRooms]);

    useEffect(() => {
        if (enabled) void refresh();
    }, [enabled, refresh]);

    useChatPoll(() => { void refresh(); }, ROOMS_POLL_MS, enabled);

    useTasksChanged((kind) => {
        if (kind === 'chat' && enabled) void refresh();
    });

    const markReadLocal = useCallback((roomId: string) => {
        generation.current += 1;
        setRooms((previous) => previous?.map((room) => (room.id === roomId && room.unreadCount ? { ...room, unreadCount: 0 } : room)) ?? previous);
    }, []);

    const noteMessages = useCallback((roomId: string, messages: ChatMessage[]) => {
        if (!messages.length) return;
        // Wie der Server: die letzte TEXT-Nachricht, sonst die letzte überhaupt.
        const texts = messages.filter((message) => message.type === 'TEXT');
        const last = texts[texts.length - 1] ?? messages[messages.length - 1];
        generation.current += 1;
        setRooms((previous) => {
            if (!previous) return previous;
            let touched = false;
            const next = previous.map((room) => {
                if (room.id !== roomId) return room;
                touched = true;
                if (last.type === 'SYSTEM' && room.lastMessage?.type === 'TEXT') {
                    return { ...room, lastMessageAt: last.createdAt };
                }
                return {
                    ...room,
                    lastMessageAt: last.createdAt,
                    lastMessage: {
                        id: last.id,
                        type: last.type,
                        senderId: last.senderId,
                        text: last.text.slice(0, 140),
                        meta: last.meta,
                        hasAttachments: last.attachments.length > 0,
                        createdAt: last.createdAt,
                    },
                };
            });
            return touched ? sortRooms(next) : previous;
        });
    }, []);

    const removeLocal = useCallback((roomId: string) => {
        generation.current += 1;
        setRooms((previous) => previous?.filter((room) => room.id !== roomId) ?? previous);
    }, []);

    return { rooms, people, error, refresh, markReadLocal, noteMessages, removeLocal };
};
