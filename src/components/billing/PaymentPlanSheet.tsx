import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PaymentScheduleEditor } from '@/components/payment/PaymentScheduleEditor';
import { myOrdersApi } from '@/lib/api/billing';
import { openAmount } from '@/lib/orderBillingTotals';
import {
    parsePaymentStages,
    paymentStagesValid,
    serializePaymentStages,
    type PaymentStage,
} from '@/lib/paymentSchedule';
import { t } from '@/i18n/translate';

import { InvoicePopup } from './InvoicePopup';

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
 *
 * Fenster = die schwebende Karte des Moduls (19.08.2026); die vier Zahlen
 * oben sind Kacheln mit einer Haarlinie, keine getönten Kästen.
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
    // %100 ödenmişse geriye kuruş bile kalmaz (bkz. `openAmount`).
    const remainingAmount = openAmount(paidPercent, baseTotal, paidAmount);

    return (
        <InvoicePopup
            open={open}
            title={t('billing.paymentPlan')}
            subtitle={orderNumber}
            onClose={onClose}
            size="compact"
            /* Ein halb geschriebener Plan darf nicht an einem Klick daneben
               verschwinden. */
            closeOnOutside={false}
            footer={
                <div className="ofi-tp-actions">
                    <div className="ofi-tp-actions__start" />
                    <div className="ofi-tp-actions__end">
                        <button type="button" className="ofi-inv-btn is-primary" disabled={!canSave || saving} onClick={() => void save()}>
                            {saving && <span aria-hidden className="ofi-tp-spinner" />}
                            {t('common.save')}
                        </button>
                    </div>
                </div>
            }
        >
            <div className="ofi-inv-pop__pad space-y-4">
                {/* Ödemeyle değişen şerit: toplam sabit; fatura kesilince
                    "Fakturiert" büyür, ÖDEME gelince "Bezahlt" büyür ve "Offen"
                    (kalan bakiye) düşer — geri alma/iptal tersini yapar. */}
                <div className="ofi-inv-tiles">
                    <div className="ofi-inv-tile">
                        <div className="ofi-inv-tile__label">{t('billing.totalAmount')}</div>
                        <div className="ofi-inv-tile__value">{fmtMoney(baseTotal)}</div>
                    </div>
                    <div className="ofi-inv-tile">
                        <div className="ofi-inv-tile__label">
                            {t('billing.billed')} · {Math.round(Math.max(0, billedPercent))}%
                        </div>
                        <div className="ofi-inv-tile__value">{fmtMoney(billedAmount)}</div>
                    </div>
                    <div className="ofi-inv-tile is-paid">
                        <div className="ofi-inv-tile__label">
                            {t('billing.groupPaid')} · {Math.round(Math.max(0, paidPercent))}%
                        </div>
                        <div className="ofi-inv-tile__value">{fmtMoney(paidAmount)}</div>
                    </div>
                    <div className="ofi-inv-tile is-open">
                        <div className="ofi-inv-tile__label">{t('billing.groupOpen')}</div>
                        <div className="ofi-inv-tile__value">{fmtMoney(remainingAmount)}</div>
                    </div>
                </div>

                {/* Taksitler: yüzde + vade düzenlenir, tutarlar canlı önizlenir.
                    Onay işareti ÖDENEN payı izler — kesilmiş ama ödenmemiş
                    fatura taksiti kapatmaz. Der Editor gehört auch der Offerte;
                    `.ofi-inv-plan` stellt ihn NUR hier auf den ruhigen Ton des
                    Rechnungsmoduls um (Rahmen weg, Felder rechtsbündig). */}
                <div className="ofi-inv-plan">
                    <PaymentScheduleEditor
                        stages={draft}
                        onChange={setDraft}
                        baseTotal={baseTotal}
                        formatMoney={fmtMoney}
                        billedPercent={paidPercent}
                        hideEmptyHint
                    />
                </div>
            </div>
        </InvoicePopup>
    );
};
