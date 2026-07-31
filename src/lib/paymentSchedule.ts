// Percentage-based payment schedule (Ödeme planı) helpers — frontend mirror of
// the backend's application/utils/paymentSchedule.ts. A schedule is a plain
// array of stage percents (e.g. [30, 20, 10, 40]) persisted as a JSON string on
// Tender.paymentStages / SalesOrder.paymentStages. Stages carry no identity:
// billing progress is derived from the summed billedPercent against the
// cumulative stage percents, so off-schedule invoices self-heal.

const EPSILON = 0.005;
export const MAX_PAYMENT_STAGES = 12;

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const parsePaymentStages = (raw: string | null | undefined): number[] | null => {
    if (!raw) return null;
    try {
        const parsed = JSON.parse(raw);
        if (!Array.isArray(parsed) || parsed.length === 0) return null;
        const stages = parsed.map(Number);
        if (stages.some((value) => !Number.isFinite(value))) return null;
        return stages;
    } catch {
        return null;
    }
};

export const serializePaymentStages = (stages: number[]): string =>
    JSON.stringify(stages.map(round2));

export const paymentStagesSum = (stages: number[]): number =>
    round2(stages.reduce((total, stage) => total + round2(stage), 0));

/** Valid = 1..12 stages, each in (0, 100], summing to 100 (±0.01). */
export const paymentStagesValid = (stages: number[]): boolean =>
    stages.length > 0
    && stages.length <= MAX_PAYMENT_STAGES
    && stages.every((stage) => Number.isFinite(stage) && round2(stage) > 0 && round2(stage) <= 100)
    && Math.abs(paymentStagesSum(stages) - 100) <= 0.01;

export const cumulativeStages = (stages: number[]): number[] => {
    let running = 0;
    return stages.map((stage) => {
        running = round2(running + round2(stage));
        return running;
    });
};

export type PaymentStageStatus = 'done' | 'next' | 'open';

/** Per-stage progress derived from the billed percentage. */
export const stageStatus = (stages: number[], billedPercent: number): PaymentStageStatus[] => {
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
