// Payment schedule (Ödeme planı) helpers — frontend mirror of the backend's
// application/utils/paymentSchedule.ts. A schedule is an array of instalments,
// each carrying a percentage of the gross total and the day it falls due
// (e.g. 30% on 2026-09-01, 70% on 2026-11-15), persisted as a JSON string on
// Tender.paymentStages / SalesOrder.paymentStages. Stages carry no identity:
// billing progress is derived from the summed billedPercent against the
// cumulative stage percents, so off-schedule invoices self-heal.
//
// Legacy rows hold a bare percent array (`[30,20,10,40]`) from before dates
// existed. They still parse — the dates come back null — but a schedule only
// counts as valid once every stage has one, so the next save fills the gap.

const EPSILON = 0.005;
export const MAX_PAYMENT_STAGES = 12;

export interface PaymentStage {
    /** Share of the gross total billed at this stage, in percent. */
    percent: number;
    /** Due date as an ISO day (`YYYY-MM-DD`); null on legacy percent-only rows. */
    date: string | null;
}

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** True for a complete ISO day that is also a real calendar date. */
export const isValidStageDate = (date: string | null | undefined): date is string =>
    typeof date === 'string' && ISO_DAY.test(date) && !Number.isNaN(new Date(`${date}T00:00:00`).getTime());

/** One stored entry — a bare percent (legacy) or a `{ percent, date }` object. */
const toStage = (entry: unknown): PaymentStage | null => {
    if (typeof entry === 'number' || typeof entry === 'string') {
        const percent = Number(entry);
        return Number.isFinite(percent) ? { percent, date: null } : null;
    }
    if (entry && typeof entry === 'object') {
        const record = entry as { percent?: unknown; date?: unknown };
        const percent = Number(record.percent);
        if (!Number.isFinite(percent)) return null;
        const date = typeof record.date === 'string' ? record.date : null;
        return { percent, date: isValidStageDate(date) ? date : null };
    }
    return null;
};

export const parsePaymentStages = (raw: string | null | undefined): PaymentStage[] | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const stages = parsed.map(toStage);
        if (stages.some((stage) => stage === null)) return null;
        return stages as PaymentStage[];
    } catch {
        return null;
    }
};

export const serializePaymentStages = (stages: PaymentStage[]): string =>
    JSON.stringify(stages.map((stage) => ({ percent: round2(stage.percent), date: stage.date ?? null })));

export const paymentStagesSum = (stages: PaymentStage[]): number =>
    round2(stages.reduce((total, stage) => total + round2(stage.percent), 0));

/** True once at least one stage is still missing its due date. */
export const paymentStagesMissingDate = (stages: PaymentStage[]): boolean =>
    stages.some((stage) => !isValidStageDate(stage.date));

/** Valid = 1..12 stages, each in (0, 100] WITH a due date, summing to 100 (±0.01). */
export const paymentStagesValid = (stages: PaymentStage[]): boolean =>
    stages.length > 0
    && stages.length <= MAX_PAYMENT_STAGES
    && stages.every((stage) => Number.isFinite(stage.percent) && round2(stage.percent) > 0 && round2(stage.percent) <= 100)
    && !paymentStagesMissingDate(stages)
    && Math.abs(paymentStagesSum(stages) - 100) <= 0.01;

export const cumulativeStages = (stages: PaymentStage[]): number[] => {
    let running = 0;
    return stages.map((stage) => {
        running = round2(running + round2(stage.percent));
        return running;
    });
};

/**
 * ISO day → the day format the rest of the app prints (31.12.2026). Display
 * only, so it has no counterpart in the backend mirror.
 */
export const formatStageDate = (date: string | null | undefined): string => {
    if (!date) return '';
    const [year, month, day] = date.split('-');
    return year && month && day ? `${day}.${month}.${year}` : date;
};

export type PaymentStageStatus = 'done' | 'next' | 'open';

/** Per-stage progress derived from the billed percentage. */
export const stageStatus = (stages: PaymentStage[], billedPercent: number): PaymentStageStatus[] => {
    let nextSeen = false;
    return cumulativeStages(stages).map((cumulative) => {
        if (cumulative <= billedPercent + EPSILON) return 'done';
        if (!nextSeen) {
            nextSeen = true;
            return 'next';
        }
        return 'open';
    });
};
