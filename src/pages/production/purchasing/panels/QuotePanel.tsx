import { useEffect, useState } from 'react';
import { CheckCircle2, FileCheck2, Send } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { productionBomApi } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { PurchaseOrderRow } from '@/types/inventory';
import { localizePurchaseCode } from '@/utils/purchaseCode';

import { shownPurchaseCode } from '../../bom/bomFormat';
import { failureText, mailOrder, orderMailDefaults, parseAmount } from '../purchasingSend';
import { Failure, Loading } from '../purchasingUi';
import { PanelContext, PriceTable } from './panelKit';
import { pricesOf, usePurchase } from './panelData';
import { QuoteDrop } from './QuoteDrop';
import { SidePanel } from './SidePanel';
import { MailTemplatePicker } from '@/pages/inventory/workspace/MailTemplatePicker';

const P = 'productionBom.purchasing.quote';

/** Attach the supplier document, edit prices and complete the transaction. */
export const QuotePanel = ({ requestId, purchaseOrderId, onClose, onDone }: {
    requestId: string;
    purchaseOrderId: string;
    onClose: () => void;
    onDone: () => void;
}) => {
    const [orderTick, setOrderTick] = useState(0);
    const { detail, purchase, error } = usePurchase(requestId, purchaseOrderId, orderTick);
    const [order, setOrder] = useState<PurchaseOrderRow | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
    const [prices, setPrices] = useState<Record<number, string> | null>(null);
    const [mail, setMail] = useState(true);
    const [to, setTo] = useState<string | null>(null);
    const [subject, setSubject] = useState<string | null>(null);
    const [message, setMessage] = useState<string | null>(null);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let alive = true;
        purchaseOrdersApi.get(purchaseOrderId).then((row) => { if (alive) { setOrder(row); setOrderError(null); } }).catch((failure) => { if (alive) setOrderError(failureText(failure)); });
        return () => { alive = false; };
    }, [purchaseOrderId, orderTick]);

    const title = t(`${P}.title`);
    if (error) return <SidePanel icon={<FileCheck2 />} title={title} onClose={onClose}><Failure text={error} /></SidePanel>;
    if (!detail || !purchase || (!order && !orderError)) return <SidePanel icon={<FileCheck2 />} title={title} onClose={onClose}><Loading rows={4} /></SidePanel>;

    const code = shownPurchaseCode(purchase.referenceNumber);
    const number = quoteNumber ?? purchase.quoteNumber ?? '';
    const values = prices ?? pricesOf(purchase);
    const defaults = order ? orderMailDefaults(order) : null;
    const recipient = to ?? order?.supplierEmail ?? '';
    const priced = purchase.lines.length > 0 && purchase.lines.every((line) => (parseAmount(values[line.index] ?? '') ?? 0) > 0);
    const hasFile = Boolean(file) || Boolean(purchase.quoteFile);
    const ready = Boolean(number.trim()) && hasFile && priced && !uploading && (!mail || (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.trim()) && Boolean((subject ?? defaults?.subject ?? '').trim()) && Boolean(order)));

    const drop = async (next: File) => {
        setUploading(true);
        try {
            await productionBomApi.uploadQuote(purchaseOrderId, next);
            setFile(next);
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            setUploading(false);
        }
    };

    const submit = async () => {
        if (!ready || busy) return;
        setBusy(true);
        try {
            await productionBomApi.setQuoteNumber(purchaseOrderId, number.trim());
            await purchasingApi.setPrices(purchaseOrderId, purchase.lines.map((line) => ({ index: line.index, unitPrice: parseAmount(values[line.index] ?? '') ?? 0 })));
            let mailed = false;
            if (mail) {
                // Frisch gelesen: das PDF trägt die eben geschriebenen Preise und die Angebotsnummer.
                const fresh = await purchaseOrdersApi.get(purchaseOrderId);
                const result = await mailOrder(fresh, { to: recipient, subject: subject ?? defaults?.subject ?? '', message: message ?? defaults?.message ?? '' });
                if (result.preview) { toast.warning(t('inv.orders.mail.previewToast')); return; }
                mailed = !result.preview;
            }
            await purchaseOrdersApi.setStatus(purchaseOrderId, 'TO_BE_STOCKED');
            await purchasingApi.report(requestId, { action: 'ORDER_CONFIRMED', purchaseOrderIds: [purchaseOrderId], mailed }).catch(() => undefined);
            toast.success(t(mailed ? `${P}.doneMailed` : `${P}.done`, { code }));
            onDone();
        } catch (failure) {
            toast.error(failureText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <SidePanel
            purchaseOrderId={purchaseOrderId}
            onWorkspaceReturn={() => setOrderTick((value) => value + 1)}
            icon={<FileCheck2 />}
            title={purchase.orderRevision > 0 ? t(`${P}.titleRevised`) : title}
            subtitle={<><b className="is-code">{code}</b> · {purchase.supplierName}</>}
            context={<PanelContext detail={detail} />}
            busy={busy || uploading}
            onClose={onClose}
            footer={(
                <>
                    <p>{t(mail ? `${P}.footMail` : `${P}.foot`)}</p>
                    <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy || uploading} onClick={onClose}>{t('productionBom.common.cancel')}</button>
                    <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!ready || busy} onClick={() => void submit()}>
                        {busy ? <span className="ofi-buy-spinner" /> : mail ? <Send aria-hidden /> : <CheckCircle2 aria-hidden />}
                        {t(mail ? `${P}.sendConfirm` : `${P}.confirm`)}
                    </button>
                </>
            )}
        >
            <section className="ofi-buy-sect">
                <h4>{t(`${P}.quote`)}</h4>
                <QuoteDrop fileName={file?.name ?? purchase.quoteFile?.name ?? null} uploading={uploading} disabled={busy} onFile={(next) => void drop(next)} />
                <label className="ofi-buy-field">
                    <span>{t(`${P}.number`)}</span>
                    <input
                        value={number}
                        className="ofi-buy-input"
                        placeholder={t(`${P}.numberPlaceholder`)}
                        disabled={busy || uploading}
                        onChange={(event) => setQuoteNumber(event.target.value)}
                    />
                </label>
            </section>
            <section className="ofi-buy-sect">
                <h4>{t(`${P}.prices`)}</h4>
                <PriceTable purchase={purchase} prices={values} disabled={busy || uploading} onChange={(index, value) => setPrices({ ...values, [index]: value })} />
            </section>
            <section className="ofi-buy-sect">
                <label className="ofi-buy-toggle">
                    <input type="checkbox" className="ofi-buy-check" checked={mail} disabled={busy} onChange={(event) => setMail(event.target.checked)} />
                    <span>{t(`${P}.mail`)}</span>
                </label>
                {mail && (
                    <>
                        {orderError && <p role="alert" className="ofi-buy-mail-error">{orderError} <button type="button" className="ofi-buy-btn" onClick={() => setOrderTick((value) => value + 1)}>{t('common.retry')}</button></p>}
                        <label className="ofi-buy-field">
                            <span>{t(`${P}.to`)}</span>
                            <input value={recipient} type="email" className="ofi-buy-input" disabled={busy} onChange={(event) => setTo(event.target.value)} />
                        </label>
                        <label className="ofi-buy-field">
                            <span>{t(`${P}.subject`)}</span>
                            <input value={subject ?? defaults?.subject ?? ''} className="ofi-buy-input" disabled={busy} onChange={(event) => setSubject(event.target.value)} />
                        </label>
                        <p className="ofi-buy-hintline">{t(`${P}.attachment`, { file: `${localizePurchaseCode(purchase.referenceNumber, 'de')}.pdf` })}</p>
                        <label className="ofi-buy-field">
                            <span>{t('inv.orders.mail.message')}</span>
                            <textarea className="ofi-buy-message" rows={6} value={message ?? defaults?.message ?? ''} disabled={busy} onChange={(event) => setMessage(event.target.value)} />
                        </label>
                        <MailTemplatePicker disabled={busy} onApply={setMessage} />
                    </>
                )}
            </section>
        </SidePanel>
    );
};
