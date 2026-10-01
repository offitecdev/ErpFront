import { t } from '@/i18n/translate';
import type { DispatchProblem, DispatchResult } from '@/types/purchasing';

/**
 * ── DER ABLAUF EINER SENDUNG AUF DEM SCHIRM (30.09.2026) ───────────────────
 * «Progressi de görelim … pdf hazırladığım şeyleri de görelim, daha
 *  animasyonlu olması lazım ama barlı değil — gelme animasyonu, Apple macOS
 *  animasyonları.» Jede Karte (ein Lieferant) geht durch dieselben Stufen:
 *
 *   waiting → pdf → sending → sent | skipped | failed
 *
 * Der Server macht PDF und Mail in EINEM Aufruf; die Karte zeigt zuerst
 * «PDF hazırlanıyor» und — läuft der Aufruf noch — nach einem Moment «E-posta
 * gönderiliyor». Die Antwort setzt den Endstand.
 */
export type DispatchPhase = 'waiting' | 'pdf' | 'sending' | 'sent' | 'preview' | 'skipped' | 'failed';

export interface DispatchCardModel {
    purchaseOrderId: string;
    code: string;
    supplierName: string;
    /** «4 kalem · CHF 1’250.00» — was die Karte unter dem Namen sagt. */
    detail: string;
    phase: DispatchPhase;
    to: string | null;
    fileName: string | null;
    mailId: string | null;
    problem: DispatchProblem | null;
    error: string | null;
}

export const isFinal = (phase: DispatchPhase): boolean =>
    phase === 'sent' || phase === 'preview' || phase === 'skipped' || phase === 'failed';

export const phaseOfResult = (result: DispatchResult): DispatchPhase => {
    if (result.status === 'SENT') return 'sent';
    if (result.status === 'PREVIEW') return 'preview';
    if (result.status === 'SKIPPED') return 'skipped';
    return 'failed';
};

/** Der Satz unter dem Namen, je Stufe. */
export const phaseText = (card: DispatchCardModel): string => {
    const P = 'productionBom.purchasing.dispatch';
    switch (card.phase) {
        case 'waiting': return t(`${P}.phase.waiting`);
        case 'pdf': return t(`${P}.phase.pdf`);
        case 'sending': return t(`${P}.phase.sending`, { to: card.to ?? '' });
        case 'sent': return t(`${P}.phase.sent`, { to: card.to ?? '' });
        case 'preview': return t(`${P}.phase.preview`);
        case 'skipped': return card.problem ? t(`${P}.problem.${card.problem}`) : t(`${P}.phase.skipped`);
        default: return card.problem ? t(`${P}.problem.${card.problem}`) : (card.error || t(`${P}.phase.failed`));
    }
};
