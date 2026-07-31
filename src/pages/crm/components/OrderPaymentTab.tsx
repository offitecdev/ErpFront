import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import { parsePaymentStages, paymentStagesValid, serializePaymentStages } from '@/lib/paymentSchedule';
import { myOrdersApi } from '@/lib/api/billing';
import type { MyOrderDetailDto } from '@/types/billing';

import { Card } from '../../../components/ui-shared/Card';
import { Button } from '../../../components/ui-shared/Button';

const fmtMoney = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value);

type OrderPaymentTabProps = {
    order: MyOrderDetailDto;
    onChanged: () => void;
};

// Order-side payment schedule: usually copied from the quote at conversion,
// editable here with an explicit Save (server enforces billing.manage). Stages
// already covered by invoices render with a done-check; editing past stages is
// harmless because billing progress is derived from billedPercent, not from a
// stage↔invoice link.
export const OrderPaymentTab = ({ order, onChanged }: OrderPaymentTabProps) => {
    const [stages, setStages] = useState<number[]>(() => parsePaymentStages(order.paymentStages) ?? []);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setStages(parsePaymentStages(order.paymentStages) ?? []);
    }, [order.id, order.paymentStages]);

    const stored = serializePaymentStages(parsePaymentStages(order.paymentStages) ?? []);
    const current = serializePaymentStages(stages);
    const dirty = stored !== current;
    const canSave = dirty && (stages.length === 0 || paymentStagesValid(stages));

    const save = async () => {
        setSaving(true);
        try {
            await myOrdersApi.updatePaymentStages(order.id, stages.length ? stages : null);
            toast.success(t('billing.paymentStagesSaved'));
            onChanged();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('billing.paymentStagesSaveError'));
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card title={t('billing.paymentScheduleTab')}>
            <div className="max-w-xl space-y-3">
                <p className="text-[12.5px] text-slate-500 dark:text-white/60">
                    {t('billing.paymentScheduleOrderHint')}
                </p>
                <PaymentScheduleEditor
                    stages={stages}
                    onChange={setStages}
                    baseTotal={order.totalAmount}
                    formatMoney={fmtMoney}
                    billedPercent={order.billingSummary?.billedPercent ?? 0}
                />
                <div className="flex justify-end">
                    <Button variant="primary" size="md" loading={saving} disabled={!canSave} onClick={save}>
                        {t('common.save')}
                    </Button>
                </div>
            </div>
        </Card>
    );
};
