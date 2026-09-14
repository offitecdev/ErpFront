import { useCallback, useEffect, useRef } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import { useTasksModuleStore } from '../store/tasksModuleStore';

/**
 * ── SOHBET: LESESTAND ────────────────────────────────────────────────────────
 *
 * `markRead()` setzt den Lesestand des Raums auf «jetzt» — beim Öffnen, wenn
 * neue Nachrichten eintreffen, während man unten steht, und beim Zurückkehren
 * ins Fenster. Hat das Fenster gerade keinen Fokus, wird nur vorgemerkt und
 * beim nächsten Fokus nachgeholt (wer nicht hinsieht, hat nicht gelesen).
 *
 * Die Antwort trägt die neue Gesamtzahl der ungelesenen Nachrichten: sie geht
 * direkt in den Zähler der Modulleiste, ohne eigene Zusammenfassungsabfrage.
 * (Nicht über `setSummary` — das rechnet den Uhrversatz aus dem mitgereisten,
 * dann veralteten `serverNow` neu.)
 */

const patchUnreadTotal = (unreadTotal: number) => {
    useTasksModuleStore.setState((state) => (state.bootstrap
        ? { bootstrap: { ...state.bootstrap, summary: { ...state.bootstrap.summary, unreadChatCount: unreadTotal } } }
        : {}));
};

export const useChatRead = (roomId: string, onRead: (roomId: string) => void) => {
    const pending = useRef(false);
    const inFlight = useRef(false);
    const again = useRef(false);
    const onReadRef = useRef(onRead);
    useEffect(() => { onReadRef.current = onRead; });

    const send = useCallback(async () => {
        if (inFlight.current) {
            again.current = true;
            return;
        }
        inFlight.current = true;
        pending.current = false;
        try {
            do {
                again.current = false;
                const result = await tasksApi.markRoomRead(roomId);
                onReadRef.current(roomId);
                patchUnreadTotal(result.unreadTotal);
            } while (again.current);
        } catch {
            /* Ein verpasster Lesestand holt der nächste Anlass nach. */
            pending.current = true;
        } finally {
            inFlight.current = false;
        }
    }, [roomId]);

    const markRead = useCallback(() => {
        if (document.hidden || !document.hasFocus()) {
            pending.current = true;
            return;
        }
        void send();
    }, [send]);

    useEffect(() => {
        const onFocus = () => {
            if (pending.current && !document.hidden && document.hasFocus()) void send();
        };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', onFocus);
        return () => {
            window.removeEventListener('focus', onFocus);
            document.removeEventListener('visibilitychange', onFocus);
        };
    }, [send]);

    return { markRead };
};
