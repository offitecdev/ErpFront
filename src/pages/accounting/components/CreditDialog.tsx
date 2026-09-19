import { useState } from 'react';

import { AlertTriangle } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { InvoiceDto } from '@/types/billing';
import { fmtMoney, round2 } from '@/pages/sales/invoices/invoiceShared';

/**
 * ── STORNO-RECHNUNG / GUTSCHRIFT AUSSTELLEN (17.09.2026, Schritt 6) ─────────
 *
 * Ein Fenster für beide Gegenbelege:
 *   STORNO      offene Rechnung — Grund, dann wird der ganze Betrag
 *               aufgehoben (eigene RE-Nummer, negativ).
 *   GUTSCHRIFT  jede ausgestellte Rechnung — Betrag (voreingestellt der ganze
 *               Rest, änderbar) und Grund. Zuerst wird der offene Teil der
 *               Rechnung verrechnet; nur der Rest geht über die Bank zurück.
 *
 * Wird nur eingehängt, solange es offen ist — der Zustand beginnt jedes Mal neu.
 */
export const CreditDialog = ({
    mode,
    invoice,
    creditable,
    openAmount = 0,
    onCancel,
    onConfirm,
}: {
    mode: 'STORNO' | 'GUTSCHRIFT';
    invoice: InvoiceDto;
    /** Höchstbetrag einer Gutschrift (positiv). */
    creditable: number;
    /** Noch offener Rest der Rechnung — wird zuerst verrechnet (Schritt 7). */
    openAmount?: number;
    onCancel: () => void;
    onConfirm: (input: { reason: string; amount: number | null }) => Promise<void>;
}) => {
    const [reason, setReason] = useState('');
    const [amountText, setAmountText] = useState(creditable.toFixed(2));
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const amount = round2(Number(amountText.replace(',', '.')) || 0);
    const amountValid = mode === 'STORNO' || (amount > 0 && amount <= creditable + 0.005);
    const reasonValid = reason.trim().length >= 3;

    const submit = async () => {
        if (!reasonValid || !amountValid || busy) return;
        setBusy(true);
        setError(null);
        try {
            await onConfirm({ reason: reason.trim(), amount: mode === 'GUTSCHRIFT' ? amount : null });
        } catch (caught) {
            setError(caught instanceof Error ? caught.message : String(caught));
            setBusy(false);
        }
    };

    const storno = mode === 'STORNO';
    return (
        <PopupDialog
            open
            title={storno
                ? t('accounting.credit.stornoTitle', { number: invoice.invoiceNumber })
                : t('accounting.credit.creditTitle', { number: invoice.invoiceNumber })}
            subtitle={storno ? t('accounting.credit.stornoSubtitle') : t('accounting.credit.creditSubtitle')}
            icon={<AlertTriangle size={20} />}
            tone="danger"
            width={480}
            onClose={() => { if (!busy) onCancel(); }}
            closeOnBackdrop={!busy}
            footer={(
                <PopupActions>
                    <PopupButton disabled={busy} onClick={onCancel}>{t('common.cancel')}</PopupButton>
                    <PopupButton variant="danger" loading={busy} disabled={!reasonValid || !amountValid} onClick={() => void submit()}>
                        {storno ? t('accounting.credit.stornoAction') : t('accounting.credit.creditAction')}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="space-y-3">
                <PopupNote tone="warning">
                    {storno
                        ? t('accounting.credit.stornoExplain', { amount: fmtMoney(invoice.amount) })
                        : t('accounting.credit.creditExplain')}
                </PopupNote>
                {!storno && amountValid && (
                    <PopupNote>
                        {t('accounting.credit.breakdown', {
                            offset: fmtMoney(Math.min(amount, openAmount)),
                            refund: fmtMoney(Math.max(0, round2(amount - Math.min(amount, openAmount)))),
                        })}
                    </PopupNote>
                )}
                {!storno && (
                    <PopupField
                        label={t('accounting.credit.amount')}
                        hint={t('accounting.credit.amountHint', { max: fmtMoney(creditable) })}
                    >
                        <input
                            className="ofi-cal-input w-full text-right tabular-nums"
                            type="number"
                            min={0.05}
                            max={creditable}
                            step="0.05"
                            value={amountText}
                            onChange={(event) => setAmountText(event.target.value)}
                            aria-invalid={!amountValid}
                        />
                    </PopupField>
                )}
                <PopupField label={t('accounting.credit.reason')} hint={t('accounting.credit.reasonHint')}>
                    <textarea
                        className="ofi-cal-input w-full"
                        rows={3}
                        maxLength={1000}
                        value={reason}
                        placeholder={t('accounting.credit.reasonPlaceholder')}
                        onChange={(event) => setReason(event.target.value)}
                    />
                </PopupField>
                {error && <PopupNote tone="danger">{error}</PopupNote>}
            </div>
        </PopupDialog>
    );
};
