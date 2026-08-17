import { useEffect, useState } from 'react';

import { t } from '@/i18n/translate';
import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import {
    parsePaymentStages,
    paymentStagesValid,
    serializePaymentStages,
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

// Quote-side payment schedule editor. Stage edits live in local state and are
// committed to the staging pipeline ONLY when the schedule is valid (sum=100 and
// every instalment dated) or cleared — an in-progress 30/20, or a stage still
// missing its due date, shows the amber warning without being staged, so Save
// can never fail on schedule validation.
export const TenderPaymentTab = ({ tender, canEdit, grossTotal, onMetaChange }: TenderPaymentTabProps) => {
    const fmtMoney = useMoneyFormat();
    const [stages, setStages] = useState<PaymentStage[]>(() => parsePaymentStages(tender.paymentStages) ?? []);

    // Re-sync when another tender loads or a Save/refetch updates the stored plan.
    useEffect(() => {
        setStages(parsePaymentStages(tender.paymentStages) ?? []);
    }, [tender.id, tender.paymentStages]);

    const handleChange = (next: PaymentStage[]) => {
        setStages(next);
        if (next.length === 0) {
            onMetaChange({ paymentStages: null });
        } else if (paymentStagesValid(next)) {
            onMetaChange({ paymentStages: serializePaymentStages(next) });
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
            />
        </div>
    );
};
