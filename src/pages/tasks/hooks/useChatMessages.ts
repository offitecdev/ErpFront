import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { tasksApi, tasksErrorCode, tasksErrorMessage } from '@/lib/api/tasksModule';
import type { ChatMessage, PeopleMap } from '@/types/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';
import { useChatPoll } from './useChatPoll';

/** Letzter gesehener Stand eines Raums — beim Öffnen sofort da, frisch im Hintergrund. */
type MessagesSnapshot = { messages: ChatMessage[]; people: PeopleMap; hasMore: boolean };
const messagesCacheKey = (roomId: string): string => `chat:messages:${roomId}`;

/**
 * ── SOHBET: NACHRICHTEN EINES RAUMS ─────────────────────────────────────────
 *
 * Seitenweise über Cursor (der Server liefert immer aufsteigend):
 *   · Öffnen          → die neuesten 50
 *   · nach oben       → `before = erste id` (vorn anfügen)
 *   · Takt alle 4 s   → `after = letzte id` (hinten anfügen) — nur solange
 *                       der Raum offen und der Tab sichtbar ist
 * Ist die Cursor-Nachricht inzwischen gelöscht (404 MESSAGE_NOT_FOUND), wird
 * die neueste Seite neu geladen. Verliert man den Zugang (aus dem Raum
 * entfernt, Raum gelöscht), bleibt der Fehler stehen und der Takt ruht.
 *
 * Die Bildlaufführung gehört dem Aufrufer: `onBeforePrepend` meldet sich
 * unmittelbar VOR dem Vorn-Anfügen (Höhe merken), `onAppended` NACH dem
 * Hinten-Anfügen (unten bleiben, gelesen melden).
 */

const PAGE_SIZE = 50;
const POLL_MS = 4000;
const POLL_BATCH = 200;
const ACCESS_CODES = new Set(['ROOM_FORBIDDEN', 'ROOM_NOT_FOUND']);

export type ChatMessagesStatus = 'loading' | 'ready' | 'error';

export interface ChatMessagesOptions {
    roomId: string;
    onLoaded?: (messages: ChatMessage[]) => void;
    onAppended?: (messages: ChatMessage[], source: 'poll' | 'send') => void;
    onBeforePrepend?: () => void;
}

export interface ChatMessagesApi {
    messages: ChatMessage[];
    people: PeopleMap;
    status: ChatMessagesStatus;
    error: unknown;
    hasMore: boolean;
    loadingOlder: boolean;
    sending: boolean;
    reload: () => Promise<void>;
    loadOlder: () => Promise<void>;
    poll: () => Promise<void>;
    send: (text: string, files: File[]) => Promise<boolean>;
    remove: (messageId: string) => Promise<boolean>;
}

const withoutKnown = (known: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] => {
    const ids = new Set(known.map((message) => message.id));
    return incoming.filter((message) => !ids.has(message.id));
};

export const useChatMessages = ({ roomId, onLoaded, onAppended, onBeforePrepend }: ChatMessagesOptions): ChatMessagesApi => {
    const noteServerNow = useTasksModuleStore((state) => state.noteServerNow);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [people, setPeople] = useState<PeopleMap>({});
    const [status, setStatus] = useState<ChatMessagesStatus>('loading');
    const [error, setError] = useState<unknown>(null);
    const [hasMore, setHasMore] = useState(false);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const [sending, setSending] = useState(false);

    // Der jüngste Stand für Cursor und Abfragen ausserhalb des Renderns.
    const messagesRef = useRef<ChatMessage[]>([]);
    const statusRef = useRef<ChatMessagesStatus>('loading');
    const generation = useRef(0);
    const pollBusy = useRef(false);
    const olderBusy = useRef(false);
    const callbacks = useRef({ onLoaded, onAppended, onBeforePrepend });
    useEffect(() => { callbacks.current = { onLoaded, onAppended, onBeforePrepend }; });

    const peopleRef = useRef<PeopleMap>({});
    const hasMoreRef = useRef(false);

    const commit = useCallback((next: ChatMessage[]) => {
        messagesRef.current = next;
        setMessages(next);
        const trimmed = next.length > PAGE_SIZE;
        writeTasksCache<MessagesSnapshot>(messagesCacheKey(roomId), {
            messages: trimmed ? next.slice(-PAGE_SIZE) : next,
            people: peopleRef.current,
            hasMore: trimmed || hasMoreRef.current,
        });
    }, [roomId]);

    const setPhase = useCallback((next: ChatMessagesStatus) => {
        statusRef.current = next;
        setStatus(next);
    }, []);

    const mergePeople = useCallback((incoming: PeopleMap | undefined) => {
        if (!incoming || !Object.keys(incoming).length) return;
        peopleRef.current = { ...peopleRef.current, ...incoming };
        setPeople(peopleRef.current);
    }, []);

    const loadNewest = useCallback(async () => {
        const current = ++generation.current;
        try {
            const page = await tasksApi.messages(roomId, { limit: PAGE_SIZE });
            if (current !== generation.current) return;
            noteServerNow(page.serverNow);
            mergePeople(page.people);
            hasMoreRef.current = page.hasMore;
            commit(page.data);
            setHasMore(page.hasMore);
            setError(null);
            setPhase('ready');
            callbacks.current.onLoaded?.(page.data);
        } catch (loadError) {
            if (current !== generation.current) return;
            setError(loadError);
            setPhase('error');
        }
    }, [roomId, commit, mergePeople, noteServerNow, setPhase]);

    useEffect(() => {
        const cached = readTasksCache<MessagesSnapshot>(messagesCacheKey(roomId));
        if (cached) {
            peopleRef.current = cached.people;
            setPeople(cached.people);
            hasMoreRef.current = cached.hasMore;
            setHasMore(cached.hasMore);
            messagesRef.current = cached.messages;
            setMessages(cached.messages);
            setPhase('ready');
            callbacks.current.onLoaded?.(cached.messages);
        } else {
            peopleRef.current = {};
            hasMoreRef.current = false;
            messagesRef.current = [];
            setMessages([]);
            setHasMore(false);
            setPhase('loading');
        }
        void loadNewest();
        return () => { generation.current += 1; };
    }, [roomId, loadNewest, commit, setPhase]);

    const reload = useCallback(async () => {
        setPhase('loading');
        await loadNewest();
    }, [loadNewest, setPhase]);

    const poll = useCallback(async () => {
        if (pollBusy.current || statusRef.current !== 'ready') return;
        const current = generation.current;
        pollBusy.current = true;
        try {
            // Mehr als eine Ladung neuer Nachrichten (lange weg gewesen)? Weiter abholen.
            for (let round = 0; round < 5; round += 1) {
                const known = messagesRef.current;
                const last = known[known.length - 1];
                // Leerer Raum: kein Cursor — die neueste Seite ist die Abfrage.
                const page = last
                    ? await tasksApi.messages(roomId, { after: last.id, limit: POLL_BATCH })
                    : await tasksApi.messages(roomId, { limit: PAGE_SIZE });
                if (current !== generation.current) return;
                mergePeople(page.people);
                if (!last) setHasMore(page.hasMore);
                const fresh = withoutKnown(messagesRef.current, page.data);
                if (fresh.length) {
                    commit([...messagesRef.current, ...fresh]);
                    callbacks.current.onAppended?.(fresh, 'poll');
                }
                if (!last || !page.hasMore) break;
            }
        } catch (pollError) {
            if (current !== generation.current) return;
            const code = tasksErrorCode(pollError);
            if (code === 'MESSAGE_NOT_FOUND' || code === 'CURSOR_CONFLICT') {
                await loadNewest();
            } else if (ACCESS_CODES.has(code)) {
                setError(pollError);
                setPhase('error');
            }
            // Netzaussetzer: still — der nächste Schlag versucht es wieder.
        } finally {
            pollBusy.current = false;
        }
    }, [roomId, commit, loadNewest, mergePeople, setPhase]);

    useChatPoll(() => { void poll(); }, POLL_MS, status === 'ready');

    const loadOlder = useCallback(async () => {
        if (olderBusy.current || statusRef.current !== 'ready') return;
        const current = generation.current;
        olderBusy.current = true;
        setLoadingOlder(true);
        try {
            // Wurde die erste Nachricht inzwischen gelöscht, rückt der Cursor nach.
            for (let attempt = 0; attempt < 3; attempt += 1) {
                const first = messagesRef.current[0];
                if (!first) return;
                try {
                    const page = await tasksApi.messages(roomId, { before: first.id, limit: PAGE_SIZE });
                    if (current !== generation.current) return;
                    mergePeople(page.people);
                    const older = withoutKnown(messagesRef.current, page.data);
                    if (older.length) {
                        callbacks.current.onBeforePrepend?.();
                        commit([...older, ...messagesRef.current]);
                    }
                    setHasMore(page.hasMore);
                    return;
                } catch (olderError) {
                    if (current !== generation.current) return;
                    if (tasksErrorCode(olderError) !== 'MESSAGE_NOT_FOUND') throw olderError;
                    commit(messagesRef.current.slice(1));
                }
            }
        } catch (olderError) {
            if (current === generation.current) toast.error(tasksErrorMessage(olderError));
        } finally {
            if (current === generation.current) setLoadingOlder(false);
            olderBusy.current = false;
        }
    }, [roomId, commit, mergePeople]);

    const send = useCallback(async (text: string, files: File[]): Promise<boolean> => {
        if (!text && !files.length) return false;
        const current = generation.current;
        setSending(true);
        try {
            const result = await tasksApi.sendMessage(roomId, text, files);
            if (current !== generation.current) return true;
            mergePeople(result.people);
            const fresh = withoutKnown(messagesRef.current, [result.message]);
            if (fresh.length) commit([...messagesRef.current, ...fresh]);
            callbacks.current.onAppended?.([result.message], 'send');
            return true;
        } catch (sendError) {
            toast.error(tasksErrorMessage(sendError));
            return false;
        } finally {
            if (current === generation.current) setSending(false);
        }
    }, [roomId, commit, mergePeople]);

    const remove = useCallback(async (messageId: string): Promise<boolean> => {
        try {
            await tasksApi.deleteMessage(messageId);
            commit(messagesRef.current.filter((message) => message.id !== messageId));
            return true;
        } catch (removeError) {
            toast.error(tasksErrorMessage(removeError));
            return false;
        }
    }, [commit]);

    return { messages, people, status, error, hasMore, loadingOlder, sending, reload, loadOlder, poll, send, remove };
};
