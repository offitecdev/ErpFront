import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import { t } from '@/i18n/translate';
import { paymentStagesSum, paymentStagesValid, type PaymentStage } from '@/lib/paymentSchedule';

/**
 * ── ZAHLUNGSPLAN DES NACHTRAGS ───────────────────────────────────────────────
 *
 * Vorgabe Samet (05.09.2026): der Zusatzauftrag soll einen Zahlungsplan haben,
 * und die Tabelle dafür soll ein EIGENES Bauteil sein.
 *
 * Es ist derselbe Plan wie am Auftrag und an der Offerte — dieselben Raten,
 * dieselbe Rechenregel, dasselbe Bauteil darunter (`PaymentScheduleEditor`);
 * gespeichert wird er in `SalesOrder.paymentStages`, also genau dort, wo ihn
 * die Verrechnung ohnehin liest (siehe GetBillingSummaryUseCase: der nächste
 * fällige Anteil einer Rechnung kommt aus diesem Feld).
 *
 * Fälligkeiten gehören zum AUFTRAG und darum auch zum Nachtrag: die
 * Datumsspalte ist an (anders als in der Offerte, die nur Prozente festlegt).
 * Ein LEERER Plan ist erlaubt und heisst «frei» — dann rechnet die
 * Verrechnung ohne Raten weiter; ein angefangener Plan muss auf 100% kommen,
 * bevor er gilt.
 */
export const AddonPaymentSchedule = ({
    stages,
    onChange,
    baseTotal,
    formatMoney,
    readOnly = false,
    /** Bereits bezahlter Anteil — setzt den Haken an die erledigten Raten. */
    paidPercent,
}: {
    stages: PaymentStage[];
    onChange: (next: PaymentStage[]) => void;
    baseTotal: number;
    formatMoney: (value: number) => string;
    readOnly?: boolean;
    paidPercent?: number | null;
}) => {
    const sum = paymentStagesSum(stages);
    const complete = stages.length === 0 || paymentStagesValid(stages);

    return (
        <div className="ofi-inv-scope space-y-2">
            <p className="text-[12.5px] text-slate-500 dark:text-white/60">{t('crm.addon.paymentHint')}</p>
            <div className="ofi-inv-plan">
                <PaymentScheduleEditor
                    stages={stages}
                    onChange={onChange}
                    readOnly={readOnly}
                    baseTotal={baseTotal}
                    formatMoney={formatMoney}
                    billedPercent={paidPercent ?? undefined}
                    hideEmptyHint
                />
            </div>
            {/* Ein angefangener Plan, der nicht auf 100% kommt, wird NICHT
                gespeichert — das sagt die Zeile, bevor jemand vergeblich
                speichert. */}
            {!complete && (
                <p className="text-[12px] font-semibold text-amber-600 dark:text-amber-400">
                    {t('crm.addon.paymentIncomplete', { sum: Math.round(sum * 100) / 100 })}
                </p>
            )}
            {stages.length === 0 && (
                <p className="text-[12px] text-slate-500 dark:text-white/60">{t('crm.addon.paymentEmpty')}</p>
            )}
        </div>
    );
};
