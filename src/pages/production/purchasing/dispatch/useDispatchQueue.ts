import { useCallback, useRef, useState } from 'react';

import { purchasingApi } from '@/lib/api/purchasing';

import { failureText } from '../purchasingSend';
import { isFinal, phaseOfResult, type DispatchCardModel } from './dispatchModel';

/** Nach so viel Zeit im Aufruf zeigt die Karte «E-posta gönderiliyor» statt «PDF hazırlanıyor». */
const PDF_STEP_MS = 900;

/**
 * Die Belege der Reihe nach senden — einer nach dem anderen, damit jede Karte
 * sichtbar ihren Weg geht (und der Mailserver nicht zehn Verbindungen auf
 * einmal sieht). `trigger` = MANUAL (erste Sendung) oder RESEND.
 */
export const useDispatchQueue = (initial: DispatchCardModel[], trigger: 'MANUAL' | 'RESEND' = 'MANUAL') => {
    const [cards, setCards] = useState<DispatchCardModel[]>(initial);
    const [running, setRunning] = useState(false);
    const busy = useRef(false);

    const patch = useCallback((id: string, change: Partial<DispatchCardModel>) => {
        setCards((current) => current.map((card) => (card.purchaseOrderId === id ? { ...card, ...change } : card)));
    }, []);

    const run = useCallback(async (only?: string[]) => {
        if (busy.current) return;
        busy.current = true;
        setRunning(true);
        const queue = (only ?? cards.filter((card) => !isFinal(card.phase)).map((card) => card.purchaseOrderId));
        for (const id of queue) {
            patch(id, { phase: 'pdf', problem: null, error: null });
            let step: number | undefined = window.setTimeout(() => {
                setCards((current) => current.map((card) => (card.purchaseOrderId === id && card.phase === 'pdf' ? { ...card, phase: 'sending' } : card)));
            }, PDF_STEP_MS);
            try {
                const result = await purchasingApi.dispatch(id, { trigger });
                window.clearTimeout(step);
                step = undefined;
                patch(id, {
                    phase: phaseOfResult(result),
                    to: result.to[0] ?? null,
                    fileName: result.fileName,
                    mailId: result.mailId,
                    problem: result.problem,
                    error: result.error,
                });
            } catch (failure) {
                if (step) window.clearTimeout(step);
                patch(id, { phase: 'failed', error: failureText(failure) });
            }
        }
        busy.current = false;
        setRunning(false);
    }, [cards, patch, trigger]);

    return { cards, setCards, run, running };
};
