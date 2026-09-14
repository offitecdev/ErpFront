import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * ── SOHBET: BILDLAUF DER NACHRICHTENLISTE ────────────────────────────────────
 *
 *   · Öffnen / eigene Nachricht → ganz nach unten
 *   · Ältere vorn angefügt      → dieselbe Nachricht bleibt an ihrem Platz
 *                                 (Höhenzuwachs wird auf scrollTop addiert)
 *   · Neue von anderen          → steht man unten, bleibt man unten; sonst
 *                                 erscheint «Yeni mesajlar»
 *   · oben angekommen           → `onReachTop` (ältere nachladen)
 *
 * Die Wünsche («nach unten», «Höhe halten») werden vorgemerkt und nach dem
 * Zeichnen eingelöst: der Aufrufer ruft `applyPending()` in einem
 * `useLayoutEffect`, der von der Nachrichtenliste abhängt.
 *
 * Der Browser-eigene Scroll-Anker ist im Stilblatt ausgeschaltet
 * (`overflow-anchor: none`), sonst verschöben Anker und Rechnung doppelt.
 * Bilder stehen in festen Rahmen — Nachladen ändert keine Höhe.
 */

const NEAR_BOTTOM_PX = 80;
const NEAR_TOP_PX = 48;

export const useChatScroll = ({
    onReachTop,
    onSeen,
}: {
    onReachTop?: () => void;
    /** «Yeni mesajlar» wurde durch Hinunterrollen gesehen. */
    onSeen?: () => void;
}) => {
    const containerRef = useRef<HTMLDivElement | null>(null);
    const nearBottom = useRef(true);
    const stickToBottom = useRef(false);
    const prependHeight = useRef<number | null>(null);
    const unseenRef = useRef(false);
    const [unseen, setUnseen] = useState(false);
    const callbacks = useRef({ onReachTop, onSeen });
    useEffect(() => { callbacks.current = { onReachTop, onSeen }; });

    const setUnseenFlag = useCallback((next: boolean) => {
        if (unseenRef.current === next) return;
        unseenRef.current = next;
        setUnseen(next);
    }, []);

    /** Nach dem Zeichnen: vorgemerkte Wünsche einlösen. */
    const applyPending = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        if (prependHeight.current !== null) {
            element.scrollTop += element.scrollHeight - prependHeight.current;
            prependHeight.current = null;
        }
        if (stickToBottom.current) {
            element.scrollTop = element.scrollHeight;
            stickToBottom.current = false;
            nearBottom.current = true;
        }
    }, []);

    const onScroll = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        nearBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_BOTTOM_PX;
        if (nearBottom.current && unseenRef.current) {
            setUnseenFlag(false);
            callbacks.current.onSeen?.();
        }
        if (element.scrollTop < NEAR_TOP_PX) callbacks.current.onReachTop?.();
    }, [setUnseenFlag]);

    /** Nach dem nächsten Zeichnen ganz nach unten. */
    const stickAfterCommit = useCallback(() => {
        stickToBottom.current = true;
        setUnseenFlag(false);
    }, [setUnseenFlag]);

    /** Unmittelbar vor dem Vorn-Anfügen: Höhe merken. */
    const rememberBeforePrepend = useCallback(() => {
        const element = containerRef.current;
        if (element) prependHeight.current = element.scrollHeight;
    }, []);

    const jumpToBottom = useCallback(() => {
        const element = containerRef.current;
        if (!element) return;
        element.scrollTop = element.scrollHeight;
        onScroll();
    }, [onScroll]);

    const isNearBottom = useCallback(() => nearBottom.current, []);
    const noteUnseen = useCallback(() => setUnseenFlag(true), [setUnseenFlag]);

    return { containerRef, onScroll, unseen, applyPending, stickAfterCommit, rememberBeforePrepend, jumpToBottom, isNearBottom, noteUnseen };
};
