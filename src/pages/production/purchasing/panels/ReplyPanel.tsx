import { useState } from 'react';
import { Check, Paperclip } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';

import { shownPurchaseCode } from '../../bom/bomFormat';
import { failureText, parseAmount } from '../purchasingSend';
import { Failure, Loading } from '../purchasingUi';
import { PanelContext, PriceTable } from './panelKit';
import { pricesOf, usePurchase } from './panelData';
import { QuoteDrop } from './QuoteDrop';
import { SidePanel } from './SidePanel';

const P = 'productionBom.purchasing.reply';

/** Attach the supplier document, edit prices and complete the transaction. */
export const ReplyPanel = ({ requestId, purchaseOrderId, onClose, onDone }: {
    requestId: string;
    purchaseOrderId: string;
    onClose: () => void;
    onDone: () => void;
}) => {
    const [orderTick, setOrderTick] = useState(0);
    const { detail, purchase, error } = usePurchase(requestId, purchaseOrderId, orderTick);
    const [file, setFile] = useState<File | null>(null);
    const [uploading, setUploading] = useState(false);
    const [prices, setPrices] = useState<Record<number, string> | null>(null);
    const [busy, setBusy] = useState(false);

    const title = t(`${P}.title`);
    if (error) return <SidePanel icon={<Paperclip />} title={title} onClose={onClose}><Failure text={error} /></SidePanel>;
    if (!detail || !purchase) return <SidePanel icon={<Paperclip />} title={title} onClose={onClose}><Loading rows={4} /></SidePanel>;

    const values = prices ?? pricesOf(purchase);
    const filled = purchase.lines.filter((line) => (parseAmount(values[line.index] ?? '') ?? 0) > 0);

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

    const save = async () => {
        if (!filled.length || busy) return;
        setBusy(true);
        try {
            await purchasingApi.setPrices(purchaseOrderId, purchase.lines.map((line) => ({ index: line.index, unitPrice: parseAmount(values[line.index] ?? '') ?? 0 })));
            toast.success(t(`${P}.done`, { supplier: purchase.supplierName }));
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
            icon={<Paperclip />}
            title={title}
            subtitle={<><b className="is-code">{shownPurchaseCode(purchase.referenceNumber)}</b> · {purchase.supplierName}</>}
            context={<PanelContext detail={detail} />}
            busy={busy || uploading}
            onClose={onClose}
            footer={(
                <>
                    <p>{t(`${P}.foot`, { done: filled.length, total: purchase.lines.length })}</p>
                    <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy || uploading} onClick={onClose}>{t('productionBom.common.cancel')}</button>
                    <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!filled.length || busy || uploading} onClick={() => void save()}>
                        {busy ? <span className="ofi-buy-spinner" /> : <Check aria-hidden />}
                        {t('productionBom.common.save')}
                    </button>
                </>
            )}
        >
            <section className="ofi-buy-sect">
                <h4>{t(`${P}.document`)}</h4>
                <QuoteDrop fileName={file?.name ?? purchase.quoteFile?.name ?? null} uploading={uploading} disabled={busy} onFile={(next) => void drop(next)} />
            </section>
            <section className="ofi-buy-sect">
                <h4>{t('productionBom.purchasing.quote.prices')}</h4>
                <PriceTable purchase={purchase} prices={values} disabled={busy || uploading} onChange={(index, value) => setPrices({ ...values, [index]: value })} />
            </section>
        </SidePanel>
    );
};
