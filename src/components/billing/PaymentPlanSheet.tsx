import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui-shared/Button';
import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { myOrdersApi } from '@/lib/api/billing';
import {
    parsePaymentStages,
    paymentStagesValid,
    serializePaymentStages,
    type PaymentStage,
} from '@/lib/paymentSchedule';
import { t } from '@/i18n/translate';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v || 0);

const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;

/**
 * Ödeme planı popup'ı — tablodaki "i" düğmesi ve "Zahlungsplan" düğmesi bunu
 * açar. Plan artık burada DÜZENLENEBİLİR de (kullanıcı isteği): taksitler
 * eklenir/silinir/taşınır ve Kaydet siparişe yazar. Aynı popup hem proje
 * Abrechnung sekmesinden hem sipariş sayfasından açıldığı için değişiklik her
 * iki düzeyde de aynı anda görünür — veri tek yerde, siparişte durur.
 *
 * Üst şerit ÖDEMEYLE birlikte nefes alır (kullanıcı isteği): bir fatura
 * "bezahlt" işaretlenince kalan bakiye ("Offen") DÜŞER, işaret geri alınınca /
 * fatura iptal edilince YÜKSELİR. Taksitlerin onay işaretleri de ödenen paya
 * göre yürür — kesilmiş ama ödenmemiş fatura taksiti kapatmaz.
 */
export const PaymentPlanSheet = ({
    open,
    onClose,
    orderNumber,
    salesOrderId,
    stages,
    baseTotal,
    billedPercent,
    paidPercent,
    onSaved,
}: {
    open: boolean;
    onClose: () => void;
    orderNumber: string;
    /** Planın yazılacağı sipariş — kaydetme bu kayda gider. */
    salesOrderId: string;
    stages: PaymentStage[] | null;
    baseTotal: number;
    billedPercent: number;
    /** Fiilen ödenmiş pay — plan ilerlemesi ve kalan bakiye bunu izler. */
    paidPercent: number;
    /** Kaydetme sonrası çağrılır — çağıran özetleri tazeler. */
    onSaved?: () => void;
}) => {
    const [draft, setDraft] = useState<PaymentStage[]>(stages ?? []);
    // Kaydedilen son hâl — "değişti mi?" karşılaştırması buna yapılır, böylece
    // kaydetten sonra düğme yeniden pasifleşir.
    const [savedRaw, setSavedRaw] = useState<string>(serializePaymentStages(stages ?? []));
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        if (!open) return;
        setDraft(stages ?? []);
        setSavedRaw(serializePaymentStages(stages ?? []));
        // Popup her açılışta o siparişin güncel planından başlar.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, salesOrderId]);

    const dirty = serializePaymentStages(draft) !== savedRaw;
    const canSave = dirty && (draft.length === 0 || paymentStagesValid(draft));

    const save = async () => {
        setSaving(true);
        try {
            const res = await myOrdersApi.updatePaymentStages(salesOrderId, draft.length ? draft : null);
            setSavedRaw(serializePaymentStages(parsePaymentStages(res.paymentStages) ?? []));
            toast.success(t('billing.paymentStagesSaved'));
            onSaved?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || t('billing.paymentStagesSaveError'));
        } finally {
            setSaving(false);
        }
    };

    const billedAmount = round2((baseTotal * Math.max(0, billedPercent)) / 100);
    const paidAmount = round2((baseTotal * Math.max(0, paidPercent)) / 100);
    // Kalan bakiye ÖDEMEYE göredir: bezahlt işareti düşürür, geri alma yükseltir.
    const remainingAmount = round2(baseTotal - paidAmount);

    return (
        <BottomSheet
            open={open}
            title={t('billing.paymentPlan')}
            subtitle={orderNumber}
            onClose={onClose}
            width={760}
            height={620}
            zIndex={90}
            footer={
                <>
                    <span aria-hidden />
                    <Button variant="primary" size="md" loading={saving} disabled={!canSave} onClick={() => void save()}>
                        {t('common.save')}
                    </Button>
                </>
            }
        >
            <div className="space-y-4 p-4">
                {/* Ödemeyle değişen şerit: toplam sabit; fatura kesilince
                    "Fakturiert" büyür, ÖDEME gelince "Bezahlt" büyür ve "Offen"
                    (kalan bakiye) düşer — geri alma/iptal tersini yapar. */}
                <div className="grid grid-cols-4 gap-2">
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">{t('billing.totalAmount')}</div>
                        <div className="mt-0.5 font-mono text-[14px] font-bold tabular-nums text-slate-900 dark:text-white">{fmtMoney(baseTotal)}</div>
                    </div>
                    <div className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
                            {t('billing.billed')} · {Math.round(Math.max(0, billedPercent))}%
                        </div>
                        <div className="mt-0.5 font-mono text-[14px] font-bold tabular-nums text-slate-700 dark:text-white/80">{fmtMoney(billedAmount)}</div>
                    </div>
                    <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2 dark:border-emerald-400/25 dark:bg-emerald-500/10">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
                            {t('billing.groupPaid')} · {Math.round(Math.max(0, paidPercent))}%
                        </div>
                        <div className="mt-0.5 font-mono text-[14px] font-bold tabular-nums text-emerald-700 dark:text-emerald-300">{fmtMoney(paidAmount)}</div>
                    </div>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3 py-2 dark:border-amber-400/25 dark:bg-amber-500/10">
                        <div className="text-[10.5px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-300">{t('billing.groupOpen')}</div>
                        <div className="mt-0.5 font-mono text-[14px] font-bold tabular-nums text-amber-700 dark:text-amber-300">{fmtMoney(remainingAmount)}</div>
                    </div>
                </div>

                {/* Taksitler: yüzde + vade düzenlenir, tutarlar canlı önizlenir.
                    Onay işareti ÖDENEN payı izler — kesilmiş ama ödenmemiş
                    fatura taksiti kapatmaz. */}
                <PaymentScheduleEditor
                    stages={draft}
                    onChange={setDraft}
                    baseTotal={baseTotal}
                    formatMoney={fmtMoney}
                    billedPercent={paidPercent}
                    hideEmptyHint
                />
            </div>
        </BottomSheet>
    );
};
