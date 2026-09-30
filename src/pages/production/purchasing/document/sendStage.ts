import type { PurchaseOrderRow } from '@/types/inventory';
import type { BomOrigin } from '@/types/productionBom';

/**
 * ── WO EIN BELEG DER BOM BEIM LIEFERANTEN STEHT (30.09.2026) ───────────────
 * Dieselbe Regel wie `docStateOf` im Server (domain/services/procurementFlow.ts),
 * aus dem geladenen Beleg gelesen:
 *   Bestellung — draft (nicht gesendet) → awaiting («Onay bekliyor») →
 *                confirmed (Tedarikçi onayladı) → received; eine BOM-Revision
 *                macht sie «revised», bis die geänderte Fassung hinausging.
 *   Anfrage    — askDraft → askSent (Antwort erwartet) → replied (Angebot da).
 */
export type SendStage = 'draft' | 'awaiting' | 'revised' | 'confirmed' | 'received' | 'askDraft' | 'askSent' | 'replied' | 'closed';

const CONFIRMED = new Set(['PENDING', 'TO_BE_STOCKED']);

export const sendStageOf = (order: PurchaseOrderRow, origin: BomOrigin): SendStage => {
    const status = String(order.status ?? '').toUpperCase();
    if (status === 'CANCELLED') return 'closed';
    if (origin.kind === 'REQUEST') {
        if (origin.quoteFile) return 'replied';
        return status === 'PRICE_REQUEST' || order.emailSentAt ? 'askSent' : 'askDraft';
    }
    if (status === 'COMPLETED') return 'received';
    if (CONFIRMED.has(status)) return 'confirmed';
    if ((origin.orderRevision ?? 0) > 0) {
        // Ging die geänderte Fassung schon hinaus, wartet sie wie jede gesendete auf die Bestätigung.
        const revisedAt = origin.revision?.createdAt ? Date.parse(origin.revision.createdAt) : Number.NaN;
        const sentAt = order.emailSentAt ? Date.parse(order.emailSentAt) : Number.NaN;
        if (!(sentAt >= revisedAt)) return 'revised';
    }
    return order.emailSentAt || status === 'ORDERED' ? 'awaiting' : 'draft';
};

/** Was die Stufe erlaubt: senden, erneut senden, «Tedarikçi onayladı», von Hand senden. */
export const sendMoves = (stage: SendStage) => ({
    send: stage === 'draft' || stage === 'askDraft',
    resend: stage === 'awaiting' || stage === 'askSent' || stage === 'replied',
    revise: stage === 'revised',
    confirm: stage === 'awaiting' || stage === 'revised',
    manual: stage !== 'received' && stage !== 'closed' && stage !== 'confirmed',
});
