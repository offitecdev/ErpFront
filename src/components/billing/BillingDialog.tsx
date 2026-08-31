import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from 'sonner';
import { Check } from '../icons/antIconCompat';
import { PopupButton, PopupDialog, PopupEmpty, PopupField, PopupNote } from '../ui-shared/PopupKit';
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
    /**
     * Raise the dialog above the popup it was opened from (the project
     * completion dialog sits at 150). Default keeps the kit's own stacking.
     */
    zIndex?: number;
}

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Rechnen-Fenster des Abschluss-Ablaufs. Google-clean seit 19.08.2026: es ist
 * das mittige Auswahlfenster der Anwendung (`PopupDialog`) statt des alten
 * Bodenblattes, der Wahlstreifen „Voll / Teil" ist ein eigener Segmentstreifen
 * statt einer AntD-Radiogruppe (im neuen Kleid hat die Bibliothek nichts zu
 * suchen), und das Prozentfeld wird — wie jedes Feld des Moduls — von ganz
 * RECHTS her geschrieben.
 */
export const BillingDialog: React.FC<BillingDialogProps> = ({ open, target, onClose, onSuccess, zIndex }) => {
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
        <PopupDialog
            open={open}
            title={t('billing.title')}
            subtitle={target?.label}
            width={560}
            z={zIndex}
            onClose={onClose}
            closeOnBackdrop={!submitting}
            bodyClassName="ofi-inv-scope"
            footer={
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <PopupButton onClick={onClose} disabled={submitting}>{t('common.cancel')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            onClick={() => void submit()}
                            loading={submitting}
                            disabled={loading || fullyBilled || partialInvalid || previewAmount <= 0}
                        >
                            {t('billing.createInvoice')}
                        </PopupButton>
                    </div>
                </div>
            }
        >
            {loading ? (
                <PopupEmpty>{t('common.loading')}</PopupEmpty>
            ) : (
                <div className="flex flex-col gap-4 pt-1">
                    {/* Die drei Zahlen des Auftrags: Haarlinie, keine Fläche. */}
                    <div className="ofi-inv-tiles" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
                        <div className="ofi-inv-tile">
                            <div className="ofi-inv-tile__label">{t('billing.totalAmount')}</div>
                            <div className="ofi-inv-tile__value">{fmtMoney(baseAmount)}</div>
                        </div>
                        <div className="ofi-inv-tile">
                            <div className="ofi-inv-tile__label">{t('billing.billed')} · {summary?.billedPercent ?? 0}%</div>
                            <div className="ofi-inv-tile__value">{fmtMoney(summary?.billedAmount ?? 0)}</div>
                        </div>
                        <div className="ofi-inv-tile is-paid">
                            <div className="ofi-inv-tile__label">{t('billing.remainingBalance')} · {remainingPercent}%</div>
                            <div className="ofi-inv-tile__value">{fmtMoney(summary?.remainingAmount ?? baseAmount)}</div>
                        </div>
                    </div>

                    {/* Payment schedule strip (orders with a plan only): done
                        stages are muted, the next one is a one-click preset for
                        the partial mode. Free percent entry stays available —
                        the schedule guides, it does not lock. */}
                    {target?.type === 'order' && summary?.paymentStages?.length ? (
                        <div className="ofi-inv-stages">
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
                                        className={`ofi-inv-stage ${status === 'done' ? 'is-done' : isNext ? 'is-next' : ''}`}
                                    >
                                        {status === 'done' && <Check size={11} strokeWidth={3} />}
                                        {t('billing.stageOf', { n: index + 1, total: summary.paymentStages!.length })} · {stage.percent}%
                                        {stage.date && <span className="ofi-inv-stage__when">{formatStageDate(stage.date)}</span>}
                                    </button>
                                );
                            })}
                        </div>
                    ) : null}

                    {fullyBilled ? (
                        <PopupNote tone="warning">{t('billing.fullyBilled')}</PopupNote>
                    ) : (
                        <>
                            {/* Voll oder Teil — zwei Möglichkeiten, eine Zeile. */}
                            <div className="ofi-inv-seg">
                                <button
                                    type="button"
                                    onClick={() => setMode('FULL')}
                                    className={`ofi-inv-seg__btn ${mode === 'FULL' ? 'is-on' : ''}`}
                                >
                                    {t('billing.fullMode', { percent: remainingPercent })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setMode('PARTIAL')}
                                    className={`ofi-inv-seg__btn ${mode === 'PARTIAL' ? 'is-on' : ''}`}
                                >
                                    {t('billing.partialMode')}
                                </button>
                            </div>

                            {mode === 'PARTIAL' && (
                                <PopupField label={t('billing.percentLabel')} hint={t('billing.maxPercent', { percent: remainingPercent })}>
                                    {/* Von ganz rechts geschrieben — wie jedes Feld
                                        des Rechnungsmoduls. */}
                                    <span className="ofi-inv-unit block max-w-[160px]">
                                        <input
                                            type="number"
                                            min={1}
                                            max={remainingPercent}
                                            value={String(percent)}
                                            onChange={(e) => setPercent(Number(e.target.value))}
                                            className="ofi-inv-input"
                                        />
                                        <span className="ofi-inv-unit__mark">%</span>
                                    </span>
                                </PopupField>
                            )}

                            <div className="ofi-inv-sum">
                                <div className="ofi-inv-sum__row">
                                    <span className="ofi-inv-sum__label">{t('billing.amountToBill', { percent: effectivePercent })}</span>
                                    <span className="ofi-inv-sum__value">{fmtMoney(previewAmount)}</span>
                                </div>
                                <div className="ofi-inv-sum__row">
                                    <span className="ofi-inv-sum__label">{t('billing.afterInvoice', { percent: afterBilledPercent })}</span>
                                    <span className="ofi-inv-sum__value">{t('billing.remainingBalance')}: {fmtMoney(afterRemainingAmount)}</span>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}
        </PopupDialog>
    );
};
