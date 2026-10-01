import { useCallback, useRef, useState } from 'react';

import { purchasingApi } from '@/lib/api/purchasing';
import type { DispatchResult } from '@/types/purchasing';

import { phaseOfResult, type DispatchPhase } from '../dispatch/dispatchModel';
import { failureText } from '../purchasingSend';

/** Nach so viel Zeit im Aufruf heisst es «E-posta gönderiliyor» statt «PDF hazırlanıyor». */
const PDF_STEP_MS = 900;

/**
 * EIN Beleg geht hinaus (30.09.2026) — «Onayla ve gönder», «Tekrar gönder»,
 * «Revizyonu gönder». Die Stufen wie im Fenster der Sendung: pdf → sending →
 * sent | preview | skipped | failed; das Ergebnis bleibt stehen, bis die
 * nächste Sendung beginnt.
 */
export const useSingleDispatch = (purchaseOrderId: string) => {
    const [phase, setPhase] = useState<DispatchPhase | null>(null);
    const [result, setResult] = useState<DispatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);
    const busy = useRef(false);

    const send = useCallback(async (trigger: 'MANUAL' | 'RESEND'): Promise<DispatchResult | null> => {
        if (busy.current) return null;
        busy.current = true;
        setPhase('pdf');
        setResult(null);
        setError(null);
        const step = window.setTimeout(() => setPhase((current) => (current === 'pdf' ? 'sending' : current)), PDF_STEP_MS);
        try {
            const value = await purchasingApi.dispatch(purchaseOrderId, { trigger });
            setResult(value);
            setPhase(phaseOfResult(value));
            return value;
        } catch (failure) {
            setError(failureText(failure));
            setPhase('failed');
            return null;
        } finally {
            window.clearTimeout(step);
            busy.current = false;
        }
    }, [purchaseOrderId]);

    const running = phase === 'pdf' || phase === 'sending';
    return { phase, result, error, running, send };
};
