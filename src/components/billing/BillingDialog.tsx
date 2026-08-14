import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Radio from 'antd/es/radio';
import { toast } from 'sonner';
import { Button } from '../ui-shared/Button';
import { Field, Input } from '../ui-shared/Field';
import { ReportsSheet } from '../../pages/project/features/components/detail/reports/ReportsSheet';
import { billingApi } from '../../lib/api/billing';
import { formatStageDate, stageStatus } from '../../lib/paymentSchedule';
import type { BillingSummaryDto, InvoiceBillingType } from '../../types/billing';

export type BillingTarget = {
    type: 'order' | 'project';
    id: string;
    label?: string;
};

interface BillingDialogProps {
    open: boolean;
    target: BillingTarget | null;
    onClose: () => void;
    onSuccess?: () => void;
}

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

export const BillingDialog: React.FC<BillingDialogProps> = ({ open, target, onClose, onSuccess }) => {
    const { t } = useTranslation();
    const [summary, setSummary] = useState<BillingSummaryDto | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [mode, setMode] = useState<InvoiceBillingType>('FULL');
    const [percent, setPercent] = useState<number>(60);

    useEffect(() => {
        if (!open || !target) return;
        setMode('FULL');
        setPercent(60);
        setSummary(null);
        setLoading(true);
        billingApi
            .getSummary(target.type === 'order' ? { salesOrderId: target.id } : { projectId: target.id })
            .then(setSummary)
            .catch((e: any) => toast.error(e.response?.data?.error || t('billing.summaryLoadError')))
            .finally(() => setLoading(false));
    }, [open, target, t]);

    const remainingPercent = summary?.remainingPercent ?? 100;
    const baseAmount = summary?.baseAmount ?? 0;

    const effectivePercent = useMemo(() => {
        if (mode === 'FULL') return remainingPercent;
        return Math.min(percent, remainingPercent);
    }, [mode, percent, remainingPercent]);

    const previewAmount = round2((baseAmount * effectivePercent) / 100);
    // Cumulative view: what the totals look like once this invoice is added
    // (e.g. 10% billed + 10% now = 20% billed, remaining balance shrinks accordingly).
    const afterBilledPercent = Math.min(100, round2((summary?.billedPercent ?? 0) + effectivePercent));
    const afterRemainingAmount = Math.max(0, round2((summary?.remainingAmount ?? baseAmount) - previewAmount));
    const fullyBilled = remainingPercent <= 0;
    const partialInvalid = mode === 'PARTIAL' && (!Number.isFinite(percent) || percent <= 0 || percent > remainingPercent);

    const submit = async () => {
        if (!target) return;
        setSubmitting(true);
        try {
            await billingApi.createInvoice({
                ...(target.type === 'order' ? { salesOrderId: target.id } : { projectId: target.id }),
                billingType: mode,
                percent: mode === 'PARTIAL' ? percent : undefined,
                // Rechnungsnummer sunucuda üretilir (RE- serisi) — buradan numara gitmez.
            });
            toast.success(t('billing.createSuccess'));
            onSuccess?.();
            onClose();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('billing.createError'));
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <ReportsSheet
            open={open}
            title={t('billing.title')}
            subtitle={target?.label}
            onClose={onClose}
            footer={
                <>
                    <Button variant="secondary" onClick={onClose} isDisabled={submitting}>{t('common.cancel')}</Button>
                    <Button
                        variant="primary"
                        onClick={submit}
                        isLoading={submitting}
                        isDisabled={loading || fullyBilled || partialInvalid || previewAmount <= 0}
                    >
                        {t('billing.createInvoice')}
                    </Button>
                </>
            }
        >
            <div className="mx-auto w-full max-w-5xl px-5 py-6 md:px-8">
            {loading ? (
                    <div className="py-8 text-center text-sm text-tertiary">{t('common.loading')}</div>
                ) : (
                    <div className="flex flex-col gap-4">
                    <div className="grid grid-cols-3 gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-center text-xs">
                        <div>
                            <div className="text-tertiary">{t('billing.totalAmount')}</div>
                            <div className="mt-0.5 font-semibold text-primary">{fmtMoney(baseAmount)}</div>
                        </div>
                        <div>
                            <div className="text-tertiary">{t('billing.billed')}</div>
                            <div className="mt-0.5 font-semibold text-primary">{fmtMoney(summary?.billedAmount ?? 0)}</div>
                            <div className="text-[11px] text-tertiary">%{summary?.billedPercent ?? 0}</div>
                        </div>
                        <div>
                            <div className="text-tertiary">{t('billing.remainingBalance')}</div>
                            <div className="mt-0.5 font-semibold text-emerald-600">{fmtMoney(summary?.remainingAmount ?? baseAmount)}</div>
                            <div className="text-[11px] text-emerald-600">%{remainingPercent}</div>
                        </div>
                    </div>

                    {/* Payment schedule strip (orders with a plan only): done
                        stages are muted, the next one is a one-click preset for
                        the partial mode. Free percent entry stays available —
                        the schedule guides, it does not lock. */}
                    {target?.type === 'order' && summary?.paymentStages?.length ? (
                        <div className="flex flex-wrap items-center gap-1.5">
                            {summary.paymentStages.map((stage, index) => {
                                const status = stageStatus(summary.paymentStages!, summary.billedPercent)[index];
                                const isNext = status === 'next' && !!summary.nextStage;
                                return (
                                    <button
                                        key={index}
                                        type="button"
                                        disabled={!isNext}
                                        title={isNext && summary.nextStage
                                            ? t('billing.billNextStage', { n: index + 1, percent: summary.nextStage.suggestedPercent })
                                            : status === 'done' ? t('billing.stageDone') : undefined}
                                        onClick={() => {
                                            if (!isNext || !summary.nextStage) return;
                                            setMode('PARTIAL');
                                            setPercent(summary.nextStage.suggestedPercent);
                                        }}
                                        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-semibold tabular-nums transition-colors ${
                                            status === 'done'
                                                ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                                : isNext
                                                    ? 'cursor-pointer border-[#272f67] bg-[#272f67] text-white hover:bg-[#1f2654]'
                                                    : 'border-slate-200 bg-slate-50 text-slate-400'
                                        }`}
                                    >
                                        {status === 'done' ? '✓ ' : ''}{t('billing.stageOf', { n: index + 1, total: summary.paymentStages!.length })} · {stage.percent}%
                                        {stage.date && (
                                            <span className="font-normal opacity-70">{formatStageDate(stage.date)}</span>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    {fullyBilled ? (
                        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-700">
                            {t('billing.fullyBilled')}
                        </div>
                    ) : (
                        <>
                            <Radio.Group
                                value={mode}
                                onChange={(e) => setMode(e.target.value)}
                                className="flex flex-col gap-2"
                            >
                                <Radio value="FULL">
                                    {t('billing.fullMode', { percent: remainingPercent })}
                                </Radio>
                                <Radio value="PARTIAL">{t('billing.partialMode')}</Radio>
                            </Radio.Group>

                            {mode === 'PARTIAL' && (
                                <Field label={t('billing.percentLabel')} hint={t('billing.maxPercent', { percent: remainingPercent })}>
                                    <Input
                                        type="number"
                                        min={1}
                                        max={remainingPercent}
                                        value={String(percent)}
                                        onChange={(e) => setPercent(Number(e.target.value))}
                                    />
                                </Field>
                            )}

                            <div className="rounded-lg border border-[#272f67]/20 bg-[#272f67]/5 px-3 py-2.5">
                                <div className="flex items-center justify-between">
                                    <span className="text-sm font-medium text-secondary">{t('billing.amountToBill', { percent: effectivePercent })}</span>
                                    <span className="text-base font-semibold text-[#272f67]">{fmtMoney(previewAmount)}</span>
                                </div>
                                <div className="mt-1.5 flex items-center justify-between border-t border-[#272f67]/10 pt-1.5 text-[12px]">
                                    <span className="text-tertiary">{t('billing.afterInvoice', { percent: afterBilledPercent })}</span>
                                    <span className="font-semibold text-amber-600">{t('billing.remainingBalance')}: {fmtMoney(afterRemainingAmount)}</span>
                                </div>
                            </div>
                        </>
                    )}
                    </div>
                )}
            </div>
        </ReportsSheet>
    );
};
