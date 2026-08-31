import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import {
    parsePaymentStages,
    paymentStagesValid,
    serializePaymentStages,
    stripStageDates,
    type PaymentStage,
} from '@/lib/paymentSchedule';
import type { TenderListItem } from '@/types/tender';

import { useMoneyFormat } from '../../utils/useMoneyFormat';

type TenderPaymentTabProps = {
    tender: TenderListItem;
    canEdit: boolean;
    /** Discounted gross total the per-stage amounts preview against. */
    grossTotal: number;
    onMetaChange: (patch: { paymentStages: string | null }) => void;
};

// Quote-side payment schedule editor. The offer fixes the PERCENTAGES ONLY —
// Fälligkeiten hängen am Auftrag (Vorgabe 15.08.2026), also zeigt die Offerte
// keine Datumsspalte und schreibt die Daten als null weg; ältere Offerten
// verlieren ihre Daten beim nächsten Speichern.
//
// Stage edits live in local state and are committed to the staging pipeline
// ONLY when the schedule is valid (sum=100) or cleared — an in-progress 30/20
// shows the amber warning without being staged, so Save can never fail on
// schedule validation.
export const TenderPaymentTab = ({ tender, canEdit, grossTotal, onMetaChange }: TenderPaymentTabProps) => {
    const fmtMoney = useMoneyFormat();
    const [stages, setStages] = useState<PaymentStage[]>(() => stripStageDates(parsePaymentStages(tender.paymentStages) ?? []));

    // Re-sync when another tender loads or a Save/refetch updates the stored plan.
    useEffect(() => {
        setStages(stripStageDates(parsePaymentStages(tender.paymentStages) ?? []));
    }, [tender.id, tender.paymentStages]);

    const handleChange = (next: PaymentStage[]) => {
        setStages(next);
        if (next.length === 0) {
            onMetaChange({ paymentStages: null });
        } else if (paymentStagesValid(next, { requireDates: false })) {
            onMetaChange({ paymentStages: serializePaymentStages(stripStageDates(next)) });
        }
    };

    return (
        <div className="max-w-xl space-y-3">
            <p className="text-[12.5px] text-slate-500 dark:text-white/60">
                {t('tenders.payment_schedule_hint')}
            </p>
            <PaymentScheduleEditor
                stages={stages}
                onChange={handleChange}
                readOnly={!canEdit}
                baseTotal={grossTotal}
                formatMoney={fmtMoney}
                showDates={false}
            />
        </div>
    );
};
