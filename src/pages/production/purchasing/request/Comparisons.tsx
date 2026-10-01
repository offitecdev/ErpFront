import { useEffect, useState } from 'react';
import { Check, ChevronRight, FileText, Scale, ShoppingCart, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

import i18n from '@/i18n';
import { t } from '@/i18n/translate';
import { MacLoading } from '@/components/ui-shared/MacLoading';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { PriceComparisonSummary, ProcurementDetail } from '@/types/purchasing';

import { fmtPrice, shownPurchaseCode } from '../../bom/bomFormat';
import { hasPdfOffer, whenText } from '../purchasingModel';

const P = 'productionBom.purchasing.compare';
const MAX = 8;
const MIN = 2;

/**
 * ── FİYAT KARŞILAŞTIRMALARI (29.09.2026, Vorgabe Samet) ─────────────────────
 *
 * «İstediğimiz max 4 tedarikçinin 4 PDF'ini (PDF olmazsa yapılamaz) yapay
 *  zekâya vererek karşılaştıracağız … karşılaştırmalar kayıt edilecek.»
 *
 * Die gespeicherten Vergleiche des Talep, neueste zuerst — ein Klick öffnet
 * die Seite des Vergleichs. «Yeni karşılaştırma» öffnet ein Fenster: bis zu
 * acht Preisanfragen mit Angebots-PDF wählen, die KI liest und vergleicht,
 * der Vergleich wird gespeichert und öffnet sich.
 *
 * 30.09.2026 (Samet): «sadece 1 teklif PDF olursa yeni karşılaştırma yerine
 * sipariş oluştur desin; birden fazla olursa yeni karşılaştırma; 8 tedarikçiye
 * kadar». Mit genau EINEM Angebots-PDF heisst der Knopf «Sipariş oluştur»: die
 * KI liest das eine Angebot (ein Vergleich mit einem Lieferanten), die Seite
 * öffnet sich mit den Preisen vorgewählt und der Leiste «Siparişi oluştur».
 * Verglichen werden nur Anfragen MIT Angebots-PDF — die übrigen bleiben aussen vor.
 */
export const Comparisons = ({ detail, comparisons, onOpen, onCreated }: {
    detail: ProcurementDetail;
    comparisons: PriceComparisonSummary[];
    onOpen: (comparisonId: string) => void;
    onCreated: (comparisonId: string) => void;
}) => {
    const { request, canProcure } = detail;
    const asks = detail.docs.filter((doc) => doc.kind === 'REQUEST' && doc.state !== 'CANCELLED');
    const withPdf = asks.filter(hasPdfOffer);
    const [dialog, setDialog] = useState(false);
    const mayCompare = canProcure && request.status !== 'CANCELLED';
    /* Ein einziges Angebot gibt es nicht zu vergleichen — daraus wird gleich die Bestellung. */
    const single = withPdf.length === 1;

    return (
        <section className="ofi-buy-box ofi-buy-cmps">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.title`)}</h3>
                <span className="ofi-buy-count">{comparisons.length}</span>
                <span className="ofi-buy-boxhead__meta">{t(`${P}.hint`, { max: MAX })}</span>
                {mayCompare && (
                    single ? (
                        <button
                            type="button"
                            className="ofi-buy-btn is-primary ofi-nosize"
                            title={t(`${P}.orderSingleHint`)}
                            onClick={() => setDialog(true)}
                        >
                            <ShoppingCart aria-hidden />
                            {t(`${P}.orderSingle`)}
                        </button>
                    ) : (
                        <button
                            type="button"
                            className="ofi-buy-btn ofi-nosize"
                            disabled={withPdf.length < MIN}
                            title={withPdf.length < MIN ? t(`${P}.needPdfs`, { min: MIN }) : undefined}
                            onClick={() => setDialog(true)}
                        >
                            <Sparkles aria-hidden />
                            {t(`${P}.new`)}
                        </button>
                    )
                )}
            </header>

            {!comparisons.length ? (
                <p className="ofi-buy-note">
                    {!withPdf.length ? t(`${P}.emptyNoPdf`) : single ? t(`${P}.emptySingle`) : t(`${P}.empty`)}
                </p>
            ) : (
                <ul className="ofi-buy-cmplist">
                    {comparisons.map((entry) => (
                        <li key={entry.id}>
                            <button type="button" className="ofi-buy-cmprow ofi-nosize" onClick={() => onOpen(entry.id)}>
                                <span className="ofi-buy-cmprow__icon"><Scale aria-hidden /></span>
                                <span className="ofi-buy-cmprow__when">
                                    <b>{whenText(entry.createdAt)}</b>
                                    <small>{[entry.createdByName, t(`${P}.lineCount`, { count: entry.lineCount })].filter(Boolean).join(' · ')}</small>
                                </span>
                                <span className="ofi-buy-cmprow__suppliers">
                                    {entry.suppliers.map((supplier, index) => (
                                        <span key={`${supplier.code}-${index}`} className={`ofi-buy-cmpchip${entry.bestSupplier === index ? ' is-best' : ''}`}>
                                            {entry.bestSupplier === index && <Check aria-hidden />}
                                            <b>{supplier.supplierName}</b>
                                            <small>{supplier.total > 0 ? fmtPrice(supplier.total, supplier.currency) : '—'}</small>
                                        </span>
                                    ))}
                                </span>
                                <ChevronRight className="ofi-buy-chev" aria-hidden />
                            </button>
                        </li>
                    ))}
                </ul>
            )}

            {dialog && (
                <CompareDialog
                    detail={detail}
                    single={single ? withPdf[0]!.purchaseOrderId : null}
                    onClose={() => setDialog(false)}
                    onDone={(id) => { setDialog(false); onCreated(id); }}
                />
            )}
        </section>
    );
};

/**
 * Das Fenster «Yeni karşılaştırma»: bis zu acht Angebote wählen, die KI vergleicht.
 * `single` = das eine Angebot bei «Sipariş oluştur» — nichts zu wählen, die KI
 * liest es sofort.
 */
const CompareDialog = ({ detail, single, onClose, onDone }: {
    detail: ProcurementDetail;
    single: string | null;
    onClose: () => void;
    onDone: (comparisonId: string) => void;
}) => {
    const asks = detail.docs.filter((doc) => doc.kind === 'REQUEST' && doc.state !== 'CANCELLED');
    const [picked, setPicked] = useState<string[]>(() => (single ? [single] : asks.filter(hasPdfOffer).slice(0, MAX).map((doc) => doc.purchaseOrderId)));
    const min = single ? 1 : MIN;
    const [running, setRunning] = useState(false);
    const [seconds, setSeconds] = useState(0);

    useEffect(() => {
        if (!running) return undefined;
        const started = Date.now();
        const timer = window.setInterval(() => setSeconds(Math.round((Date.now() - started) / 1000)), 1000);
        return () => window.clearInterval(timer);
    }, [running]);

    const toggle = (id: string) => setPicked((current) => (current.includes(id)
        ? current.filter((entry) => entry !== id)
        : current.length >= MAX ? current : [...current, id]));

    const run = async () => {
        if (picked.length < min || running) return;
        setRunning(true);
        setSeconds(0);
        try {
            const language = (i18n.resolvedLanguage || i18n.language || 'tr').slice(0, 2);
            const result = await purchasingApi.compare(detail.request.id, picked, language);
            toast.success(t(single ? `${P}.savedSingle` : `${P}.saved`));
            onDone(result.id);
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
            setRunning(false);
        }
    };

    return (
        <PopupDialog
            open
            title={t(single ? `${P}.singleTitle` : `${P}.dialogTitle`)}
            subtitle={single ? t(`${P}.singleHint`) : t(`${P}.dialogHint`, { max: MAX })}
            icon={single ? <ShoppingCart size={18} /> : <Scale size={18} />}
            width={640}
            closeOnBackdrop={!running}
            closeOnEscape={!running}
            hideClose={running}
            onClose={() => { if (!running) onClose(); }}
            footer={running ? undefined : (
                <PopupActions start={single ? undefined : t(`${P}.picked`, { count: picked.length, max: MAX })}>
                    <PopupButton onClick={onClose}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" disabled={picked.length < min} onClick={() => void run()}>
                        {t(single ? `${P}.orderSingle` : `${P}.run`)}
                    </PopupButton>
                </PopupActions>
            )}
        >
            {running ? (
                <div className="ofi-buy-cmprun">
                    <MacLoading
                        label={single ? t(`${P}.runningSingle`) : t(`${P}.running`, { count: picked.length })}
                        detail={seconds >= 20 ? t(`${P}.runningLong`, { seconds }) : t(`${P}.runningHint`)}
                    />
                </div>
            ) : (
                <div className="ofi-buy-cmppick" role="group" aria-label={t(`${P}.dialogTitle`)}>
                    {(single ? asks.filter((doc) => doc.purchaseOrderId === single) : asks).map((doc) => {
                        const pdf = hasPdfOffer(doc);
                        const on = picked.includes(doc.purchaseOrderId);
                        const full = !on && picked.length >= MAX;
                        return (
                            <label key={doc.purchaseOrderId} className={`ofi-buy-cmpopt${pdf ? '' : ' is-off'}${on ? ' is-on' : ''}`}>
                                <input
                                    type="checkbox"
                                    className="ofi-buy-check"
                                    checked={on}
                                    disabled={!pdf || full}
                                    onChange={() => toggle(doc.purchaseOrderId)}
                                />
                                <span className="ofi-buy-cmpopt__text">
                                    <b>{doc.supplierName || '—'}</b>
                                    <small>{shownPurchaseCode(doc.code)}</small>
                                </span>
                                <span className={`ofi-buy-cmpopt__file${pdf ? '' : ' is-missing'}`}>
                                    <FileText aria-hidden />
                                    <span>{pdf ? doc.quoteFile?.name : t(doc.quoteFile ? `${P}.notPdf` : `${P}.noPdf`)}</span>
                                </span>
                            </label>
                        );
                    })}
                </div>
            )}
        </PopupDialog>
    );
};
