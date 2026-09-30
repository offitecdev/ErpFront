import { useCallback, useEffect, useRef, useState } from 'react';

import { productionMailboxApi } from '@/lib/api/purchasing';

import { failureText } from '../purchasingSend';

/** So oft schaut die Seite höchstens von selbst in den Posteingang (der Server liest ihn ohnehin alle paar Minuten). */
const AUTO_EVERY_MS = 60_000;
/* Für alle Seiten des Einkaufs gemeinsam: Liste → Talep → zurück fragt nicht dreimal. */
let lastAutoCheck = 0;

export interface InboxCheckResult {
    /** So viele Antwort-PDF hängen jetzt an ihren Belegen. */
    attached: number;
    error: string | null;
    /** Wie viele Postfächer gelesen wurden (0 = keins eingerichtet). */
    mailboxes: number;
}

/**
 * «Yanıtları kontrol et seçeneği direkt sayfa açılınca yüklenmesi lazım»
 * (30.09.2026): öffnet sich eine Seite, auf der Antworten erwartet werden,
 * liest sie den Posteingang gleich selbst — still, gemeldet wird nur, was
 * ankam. Der Knopf «Yanıtları kontrol et» nimmt denselben Weg (`check`).
 */
export const useInboxCheck = (
    auto: boolean,
    onResult: (result: InboxCheckResult, manual: boolean) => void,
    /** Solange `auto` gilt, alle `every` ms erneut lesen (30.09.2026: «sipariş aşamasına geçilmeden önce otomatik yenileme»). */
    every?: number,
) => {
    const [checking, setChecking] = useState(false);
    const busy = useRef(false);
    const handler = useRef(onResult);
    useEffect(() => {
        handler.current = onResult;
    });

    const run = useCallback(async (manual: boolean) => {
        if (busy.current) return;
        busy.current = true;
        setChecking(true);
        try {
            const { runs } = await productionMailboxApi.check();
            handler.current({
                attached: runs.reduce((sum, entry) => sum + entry.attached, 0),
                error: runs.find((entry) => entry.error)?.error ?? null,
                mailboxes: runs.length,
            }, manual);
        } catch (failure) {
            if (manual) handler.current({ attached: 0, error: failureText(failure), mailboxes: 0 }, manual);
        } finally {
            busy.current = false;
            setChecking(false);
        }
    }, []);

    useEffect(() => {
        if (!auto || Date.now() - lastAutoCheck < AUTO_EVERY_MS) return undefined;
        // Im nächsten Takt — so zählt ein doppelt eingehängter Effekt (StrictMode) nur einmal.
        const timer = window.setTimeout(() => {
            lastAutoCheck = Date.now();
            void run(false);
        }, 0);
        return () => window.clearTimeout(timer);
    }, [auto, run]);

    useEffect(() => {
        if (!auto || !every) return undefined;
        const timer = window.setInterval(() => {
            // Ein verdeckter Reiter fragt nicht — er holt es beim nächsten Blick nach.
            if (document.visibilityState !== 'visible') return;
            lastAutoCheck = Date.now();
            void run(false);
        }, every);
        return () => window.clearInterval(timer);
    }, [auto, every, run]);

    const check = useCallback(() => run(true), [run]);
    return { checking, check };
};
