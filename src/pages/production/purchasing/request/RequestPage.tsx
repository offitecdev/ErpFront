import { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { t } from '@/i18n/translate';

import { productionBomErrorText } from '@/lib/api/productionBom';
import { readPurchasingWorkspace, type PurchasingWorkspace } from '@/lib/api/purchasing';
import type { ProcurementNextAction } from '@/types/purchasing';

import { Failure, Loading } from '../purchasingUi';
import { Comparisons } from './Comparisons';
import { OrderComposer } from './OrderComposer';
import { OrderDocs } from './OrderDocs';
import { PriceRequests } from './PriceRequests';
import { RequestHead } from './RequestHead';

/**
 * ── EIN TALEP AUF EINER SEITE (28.09.2026, umgebaut 29.09.2026) ─────────────
 *
 * Oben der Kopf (Projekt, Gerät, BOM, Liefertermin), darunter mit Luft:
 *   · Fiyat talebi — die Preisanfragen, je Lieferant eine, untereinander
 *     («Ekle» öffnet das eine Lieferantenfenster mit Mehrfachauswahl), je
 *     Zeile «Talep et» und das Angebot des Lieferanten als PDF; darunter die
 *     gespeicherten Fiyat karşılaştırmaları.
 *   · Satın alma talebi — «Sipariş oluştur» (EIN Lieferant, EINE Bestellung)
 *     und die Bestellungen mit «Siparişe git».
 * Kein Verlauf mehr («işlem geçmişi olmayacak»).
 */
export const RequestPage = ({ requestId, tick, onBack, onAction, onChanged, onOpenDocument, onOpenComparison }: {
    requestId: string;
    tick: number;
    onBack: () => void;
    onAction: (action: ProcurementNextAction, purchaseOrderId: string) => void;
    onChanged: () => void;
    onOpenDocument: (id: string, kind: 'ORDER' | 'REQUEST', tab?: 'mail') => void;
    onOpenComparison: (id: string) => void;
}) => {
    const [workspace, setWorkspace] = useState<{ data: PurchasingWorkspace; revision: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);
    /* Hochgeladene Angebote, bevor der Server sie im Stand des Talep zurückmeldet
       (29.09.2026: «pdf yüklemesi 5 saniye sürüyor, en fazla 200 ms») — die Zeile
       und der Vergleich zeigen das PDF sofort; der Stand kommt im Hintergrund. */
    const [offers, setOffers] = useState<Record<string, { name: string; type: string } | null>>({});
    const setOffer = useCallback((purchaseOrderId: string, file: { name: string; type: string } | null) => {
        setOffers((current) => {
            const next = { ...current };
            if (file) next[purchaseOrderId] = file;
            else delete next[purchaseOrderId];
            return next;
        });
    }, []);

    useEffect(() => {
        return readPurchasingWorkspace(requestId,
            (value) => { setWorkspace((current) => current?.data === value ? current : { data: value, revision: (current?.revision ?? 0) + 1 }); setError(null); },
            (failure) => setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')));
    }, [requestId, tick, reload]);

    const changed = useCallback(() => {
        setReload((value) => value + 1);
        onChanged();
    }, [onChanged]);

    const shownDetail = useMemo(() => {
        if (!workspace) return null;
        const { detail } = workspace.data;
        if (!Object.keys(offers).length) return detail;
        return {
            ...detail,
            docs: detail.docs.map((doc) => {
                const file = offers[doc.purchaseOrderId];
                return file && doc.state !== 'CANCELLED'
                    ? { ...doc, quoteFile: file, hasQuoteFile: true, state: doc.kind === 'REQUEST' ? 'REPLIED' as const : doc.state }
                    : doc;
            }),
        };
    }, [workspace, offers]);

    if (!workspace || !shownDetail) return <>
        <header className="ofi-buy-nav"><button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}><ChevronLeft />{t('common.back')}</button><h1>{t('productionBom.purchasing.title')}</h1></header>
        {error ? <Failure text={error} retry={() => setReload((value) => value + 1)} /> : <Loading />}
    </>;

    const { orderLines, comparisons } = workspace.data;
    const detail = shownDetail;
    return (
        <>
            <RequestHead detail={detail} onBack={onBack} onChanged={changed} />
            {error && <Failure text={error} retry={() => setReload((value) => value + 1)} />}
            {detail.request.kind === 'ORDER' ? (
                <>
                    <OrderComposer key={workspace.revision} detail={detail} lines={orderLines} onCreated={changed} />
                    <OrderDocs docs={detail.docs} canProcure={detail.canProcure} requestNumber={detail.request.requestNumber} onAction={onAction} onChanged={changed} onOffer={setOffer} onOpenDocument={(id, kind) => onOpenDocument(id, kind)} />
                </>
            ) : (
                <>
                    {/* «Fiyat talebinden satın almaya dönüşünce direkt labelı o oluyor» (30.09.2026):
                        die Bestellungen aus dem Vergleich stehen zuoberst. */}
                    <OrderDocs docs={detail.docs} canProcure={detail.canProcure} requestNumber={detail.request.requestNumber} onAction={onAction} onChanged={changed} onOffer={setOffer} onOpenDocument={(id, kind) => onOpenDocument(id, kind)} />
                    <PriceRequests detail={detail} onChanged={changed} onOffer={setOffer} onOpenDocument={(id) => onOpenDocument(id, 'REQUEST')} />
                    <Comparisons detail={detail} comparisons={comparisons} onOpen={onOpenComparison} onCreated={(id) => { changed(); onOpenComparison(id); }} />
                </>
            )}
        </>
    );
};
