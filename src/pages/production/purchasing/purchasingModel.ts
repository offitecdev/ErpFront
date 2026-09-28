import { t } from '@/i18n/translate';
import type {
    ProcurementDocState,
    ProcurementDocView,
    ProcurementEvent,
    ProcurementNextAction,
    ProcurementStage,
    ProcurementStageKey,
} from '@/types/purchasing';

import { shortDate, shownPurchaseCode } from '../bom/bomFormat';

/* ── Üretim › Satın alma: Wörter, Farben und Zeiten der Seite (28.09.2026) ── */

const P = 'productionBom.purchasing';

/** Wer am Zug ist: wir (warn), der Lieferant (wait), erledigt (ok), verworfen (off). */
export type Tone = 'warn' | 'wait' | 'ok' | 'off';

const STAGE_TONE: Record<ProcurementStageKey, Tone> = {
    ORDER_NEEDED: 'warn',
    PRICE_NEEDED: 'warn',
    COMPARE: 'warn',
    QUOTE_NEEDED: 'wait',
    GOODS_EXPECTED: 'wait',
    REPLIES_EXPECTED: 'wait',
    DONE: 'ok',
    CANCELLED: 'off',
};

export const stageTone = (stage: ProcurementStage): Tone => STAGE_TONE[stage.key];
export const stageLabel = (stage: ProcurementStage): string => t(`${P}.stage.${stage.key}`);
/** «1/2 onaylandı», «5/8 kalem geldi» … — leer, wo es nichts zu zählen gibt. */
export const stageDetail = (stage: ProcurementStage): string =>
    (stage.total > 0 && stage.key !== 'DONE' && stage.key !== 'CANCELLED'
        ? t(`${P}.stageDetail.${stage.key}`, { done: stage.done, total: stage.total })
        : '');

export const actionLabel = (action: ProcurementNextAction): string => t(`${P}.next.${action}`);

/** Der nächste Schritt EINER Bestellung (dieselbe Regel wie der Stand des Talep, procurementFlow.ts). */
export const orderAction = (doc: ProcurementDocView): ProcurementNextAction | null => {
    if (doc.kind !== 'ORDER') return null;
    if (doc.state === 'REVISED') return 'RESEND';
    if (doc.state === 'DRAFT' || doc.state === 'SENT') return doc.quoteNumber && doc.hasQuoteFile ? 'CONFIRM' : 'QUOTE';
    if (doc.state === 'CONFIRMED') return 'RECEIVE';
    return null;
};

/** Punkt und Wort eines Belegs; eine Anfrage heisst anders als eine Bestellung. */
export const docStateLabel = (kind: 'ORDER' | 'REQUEST', state: ProcurementDocState): string => t(`${P}.docState.${kind}.${state}`);
export const docDotClass = (kind: 'ORDER' | 'REQUEST', state: ProcurementDocState): string =>
    `is-${kind === 'REQUEST' ? 'ask' : 'order'}-${state.toLowerCase()}`;

/** Ein Satz aus dem Verlauf: «SP-2026-021 onaylandı», «3 kalem geldi (Depo)» … */
export const eventText = (event: ProcurementEvent): string => {
    const data = event.data ?? {};
    const codes = Array.isArray(data.codes) ? data.codes.map((code) => shownPurchaseCode(code)) : [];
    const suppliers = Array.isArray(data.suppliers) ? data.suppliers.map(String) : [];
    const key = event.action === 'GOODS_RECEIVED' && data.depot
        ? 'GOODS_RECEIVED_DEPOT'
        : event.action === 'ORDER_CONFIRMED' && data.mailed
            ? 'ORDER_SENT_CONFIRMED'
            : event.action;
    return t(`${P}.event.${key}`, {
        codes: codes.join(', '),
        code: typeof data.code === 'string' ? shownPurchaseCode(data.code) : '',
        supplier: String(data.supplier ?? ''),
        suppliers: suppliers.join(', '),
        count: Number(data.count) || codes.length || 0,
    });
};

const time = (date: Date): string => date.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
const dayOf = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

/** «bugün 11:18» · «dün 17:20» · «25.09. 17:20» · ältere Jahre mit Jahr. */
export const whenText = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '—';
    const today = dayOf(new Date());
    const day = dayOf(date);
    if (day === today) return t(`${P}.today`, { time: time(date) });
    if (today - day === 86_400_000) return t(`${P}.yesterday`, { time: time(date) });
    const sameYear = date.getFullYear() === new Date().getFullYear();
    return sameYear
        ? `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}. ${time(date)}`
        : shortDate(iso);
};

/** Tage bis zum Liefertermin (negativ = überfällig); null ohne Termin. */
export const daysLeft = (iso: string | null): number | null => {
    if (!iso) return null;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return null;
    return Math.round((dayOf(date) - dayOf(new Date())) / 86_400_000);
};

export const daysText = (days: number): string =>
    (days < 0 ? t(`${P}.overdue`, { count: -days }) : t(`${P}.daysLeft`, { count: days }));

/** Ein Betrag ohne Währung, im Schweizer Satz der Anwendung (1’234.50). */
const AMOUNT = new Intl.NumberFormat('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 4 });
export const fmtAmount = (value: number): string => AMOUNT.format(value);

/** Knapp: weniger als eine Woche bis zur Lieferung. */
export const isUrgent = (days: number | null): boolean => days !== null && days <= 7;
