import { useEffect, useRef, useState } from 'react';

/**
 * ── SOHBET: TAKT NUR BEI SICHTBAREM TAB ──────────────────────────────────────
 *
 * Der Chat fragt nach, statt eine offene Leitung zu halten. Damit das nichts
 * kostet, wenn niemand hinsieht, läuft der Takt nur, solange der Tab sichtbar
 * ist; beim Zurückkehren wird sofort einmal nachgefragt, statt bis zum
 * nächsten Schlag zu warten.
 */

export const useChatDocumentVisible = (): boolean => {
    const [visible, setVisible] = useState(() => !document.hidden);
    useEffect(() => {
        const onChange = () => setVisible(!document.hidden);
        document.addEventListener('visibilitychange', onChange);
        return () => document.removeEventListener('visibilitychange', onChange);
    }, []);
    return visible;
};

export const useChatPoll = (tick: () => void, intervalMs: number, enabled: boolean): void => {
    const tickRef = useRef(tick);
    useEffect(() => { tickRef.current = tick; });

    const visible = useChatDocumentVisible();
    const wasVisible = useRef(visible);

    useEffect(() => {
        if (!enabled || !visible) return undefined;
        const id = window.setInterval(() => tickRef.current(), intervalMs);
        return () => window.clearInterval(id);
    }, [enabled, visible, intervalMs]);

    useEffect(() => {
        if (enabled && visible && !wasVisible.current) tickRef.current();
        wasVisible.current = visible;
    }, [enabled, visible]);
};
