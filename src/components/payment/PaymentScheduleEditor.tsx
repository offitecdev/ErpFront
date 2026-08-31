import { ArrowDown, ArrowUp, Check, Plus, X } from 'lucide-react';

import { t } from '@/i18n/translate';
import {
    formatStageDate,
    MAX_PAYMENT_STAGES,
    paymentStagesMissingDate,
    paymentStagesSum,
    paymentStagesValid,
    stageStatus,
    type PaymentStage,
} from '@/lib/paymentSchedule';
// The quote's own calendar rather than `<input type="date">`: the native control
// cannot be themed and renders in the OS language (see QuoteDatePicker).
import { QuoteDatePicker } from '@/pages/sales/detail/components/common/QuoteDatePicker';

type PaymentScheduleEditorProps = {
    stages: PaymentStage[];
    onChange: (stages: PaymentStage[]) => void;
    readOnly?: boolean;
    /** Gross total the per-stage amount preview is computed against. */
    baseTotal?: number | null;
    formatMoney?: (value: number) => string;
    /** Order side: marks stages already covered by invoices with a check. */
    billedPercent?: number | null;
    /** Suppresses the empty-state hint paragraph (order page: no extra text). */
    hideEmptyHint?: boolean;
    /**
     * Fälligkeiten gehören zum AUFTRAG, nicht zur Offerte (Vorgabe 15.08.2026).
     * Die Offerte setzt `false`: keine Datumsspalte, und der Plan gilt allein
     * über die Prozente als gültig.
     */
    showDates?: boolean;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

const parsePercentInput = (raw: string): number => {
    const normalized = raw.replace(/'/g, '').replace(',', '.').trim();
    const value = Number(normalized);
    return Number.isFinite(value) ? value : 0;
};

// Row list editing a payment schedule (30/20/10/40, 50/50, …). Every instalment
// carries its percentage and — where `showDates` is on (the order) — the day it
// falls due; both are then required before the plan counts as valid. Purely
// presentational + local math: the parent owns the stage array and decides
// when/where it is persisted. Amounts are a live preview against the current
// gross total, never stored.
export const PaymentScheduleEditor = ({
    stages,
    onChange,
    readOnly = false,
    baseTotal,
    formatMoney,
    billedPercent,
    hideEmptyHint = false,
    showDates = true,
}: PaymentScheduleEditorProps) => {
    const sum = paymentStagesSum(stages);
    const valid = paymentStagesValid(stages, { requireDates: showDates });
    const missingDate = showDates && paymentStagesMissingDate(stages);
    const statuses = billedPercent != null && stages.length > 0 ? stageStatus(stages, billedPercent) : null;

    const patchStage = (index: number, patch: Partial<PaymentStage>) => {
        const next = stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage));
        onChange(next);
    };

    const setPercent = (index: number, value: number) => {
        patchStage(index, { percent: Math.min(100, Math.max(0, round2(value))) });
    };

    const removeStage = (index: number) => {
        onChange(stages.filter((_, i) => i !== index));
    };

    const moveStage = (index: number, delta: -1 | 1) => {
        const target = index + delta;
        if (target < 0 || target >= stages.length) return;
        const next = [...stages];
        [next[index], next[target]] = [next[target], next[index]];
        onChange(next);
    };

    const addStage = () => {
        if (stages.length >= MAX_PAYMENT_STAGES) return;
        // The new row takes whatever is missing to 100%, so 30/20 → add → 30/20/50.
        const remainder = round2(100 - sum);
        onChange([...stages, { percent: remainder > 0 && remainder <= 100 ? remainder : 0, date: null }]);
    };

    return (
        <div className="space-y-2">
            {stages.length === 0 ? (
                hideEmptyHint ? null : (
                    <p className="text-[12.5px] text-slate-500 dark:text-white/60">{t('tenders.payment_empty_hint')}</p>
                )
            ) : (
                <div className="space-y-1">
                    {stages.map((stage, index) => {
                        const status = statuses?.[index] ?? null;
                        const amount = baseTotal != null && baseTotal > 0 ? (baseTotal * stage.percent) / 100 : null;
                        return (
                            // Stages have no identity of their own; the position is the key.
                            <div
                                key={index}
                                className={`flex items-center gap-2 rounded-[3px] border px-2 py-1.5 ${
                                    status === 'done'
                                        ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-500/30 dark:bg-emerald-500/10'
                                        : status === 'next'
                                            ? 'border-[#1f2654]/30 bg-[#eef2fb] dark:border-white/25 dark:bg-white/10'
                                            : 'border-slate-200 bg-white dark:border-white/15 dark:bg-white/5'
                                }`}
                            >
                                <span className="w-16 shrink-0 text-[12px] font-medium text-slate-600 dark:text-white/70">
                                    {t('tenders.payment_stage', { n: index + 1 })}
                                </span>
                                {readOnly ? (
                                    <span className="w-14 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-slate-800 dark:text-white">
                                        {round2(stage.percent)}%
                                    </span>
                                ) : (
                                    <span className="inline-flex shrink-0 items-center gap-1">
                                        <input
                                            key={`stage-${index}-${stage.percent}`}
                                            aria-label={t('tenders.payment_stage', { n: index + 1 })}
                                            type="text"
                                            inputMode="decimal"
                                            defaultValue={stage.percent ? String(round2(stage.percent)) : ''}
                                            onBlur={(event) => {
                                                if (event.target.value !== event.target.defaultValue) {
                                                    setPercent(index, parsePercentInput(event.target.value));
                                                }
                                            }}
                                            onKeyDown={(event) => {
                                                if (event.key === 'Enter') {
                                                    event.preventDefault();
                                                    (event.target as HTMLInputElement).blur();
                                                }
                                            }}
                                            className="w-14 rounded-[2px] border border-slate-300 bg-white px-1.5 py-0.5 text-right text-[12.5px] tabular-nums text-slate-800 outline-none transition-colors hover:border-slate-400 focus:border-[#1f2654] dark:border-white/25 dark:bg-white/10 dark:text-white"
                                        />
                                        <span className="text-[12px] text-slate-500 dark:text-white/60">%</span>
                                    </span>
                                )}
                                {/* Fälligkeit der Rate — nur am Auftrag, dort
                                    Pflichtfeld: ohne Datum bleibt der Plan
                                    ungültig und wird nicht gespeichert. Die
                                    Offerte legt nur die Prozente fest. */}
                                {!showDates ? null : readOnly ? (
                                    <span className="w-[104px] shrink-0 text-[12px] tabular-nums text-slate-600 dark:text-white/70">
                                        {formatStageDate(stage.date) || '—'}
                                    </span>
                                ) : (
                                    <span className="w-[128px] shrink-0">
                                        <QuoteDatePicker
                                            value={stage.date ?? ''}
                                            onChange={(next) => patchStage(index, { date: next || null })}
                                            ariaLabel={t('tenders.payment_stage_date', { n: index + 1 })}
                                            // A ring rather than a border colour for the
                                            // "still missing" hint: the base chrome already
                                            // sets border-slate-300, and two border-colour
                                            // utilities at the same specificity would settle
                                            // by stylesheet order rather than by intent.
                                            className={`dark:border-white/25 dark:bg-white/10 dark:text-white ${
                                                stage.date ? '' : 'ring-1 ring-amber-300'
                                            }`}
                                        />
                                    </span>
                                )}
                                <span className="min-w-0 flex-1 truncate text-right text-[12px] tabular-nums text-slate-500 dark:text-white/60">
                                    {amount != null ? (formatMoney ? formatMoney(amount) : round2(amount).toFixed(2)) : ''}
                                </span>
                                {status === 'done' && (
                                    <span
                                        title={t('billing.stageDone')}
                                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white"
                                    >
                                        <Check size={12} />
                                    </span>
                                )}
                                {!readOnly && (
                                    <span className="inline-flex shrink-0 items-center gap-0.5">
                                        <button
                                            type="button"
                                            aria-label={`${t('tenders.payment_stage', { n: index + 1 })} ↑`}
                                            disabled={index === 0}
                                            onClick={() => moveStage(index, -1)}
                                            className="rounded-[2px] p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                                        >
                                            <ArrowUp size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={`${t('tenders.payment_stage', { n: index + 1 })} ↓`}
                                            disabled={index === stages.length - 1}
                                            onClick={() => moveStage(index, 1)}
                                            className="rounded-[2px] p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-30 dark:hover:bg-white/10 dark:hover:text-white"
                                        >
                                            <ArrowDown size={13} />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label={t('common.delete')}
                                            onClick={() => removeStage(index)}
                                            className="rounded-[2px] p-1 text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/15"
                                        >
                                            <X size={13} />
                                        </button>
                                    </span>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
                {!readOnly && (
                    <button
                        type="button"
                        disabled={stages.length >= MAX_PAYMENT_STAGES}
                        onClick={addStage}
                        className="inline-flex items-center gap-1 rounded-[3px] border border-slate-300 bg-white px-2 py-1 text-[12px] font-medium text-slate-600 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40 dark:border-white/25 dark:bg-white/10 dark:text-white/80"
                    >
                        <Plus size={13} />
                        {t('tenders.payment_add_stage')}
                    </button>
                )}
                {stages.length > 0 && (
                    <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums ${
                            valid
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                        }`}
                    >
                        {valid
                            ? t('tenders.payment_sum_ok')
                            : Math.abs(sum - 100) > 0.01
                                ? t('tenders.payment_sum_invalid', { sum })
                                : missingDate
                                    ? t('tenders.payment_dates_missing')
                                    : t('tenders.payment_sum_invalid', { sum })}
                    </span>
                )}
            </div>
        </div>
    );
};
