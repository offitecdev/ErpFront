import { useCallback, useEffect, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { t } from '@/i18n/translate';

import { productionBomErrorText } from '@/lib/api/productionBom';
import { readPurchasingWorkspace, type PurchasingWorkspace } from '@/lib/api/purchasing';
import type { ProcurementNextAction } from '@/types/purchasing';

import { Failure, Loading } from '../purchasingUi';
import { History } from './History';
import { OrderComposer } from './OrderComposer';
import { OrderDocs } from './OrderDocs';
import { PriceAsk } from './PriceAsk';
import { PriceCompare } from './PriceCompare';
import { RequestHead } from './RequestHead';

/**
 * ── EIN TALEP AUF EINER SEITE (28.09.2026) ─────────────────────────────────
 * Kein Assistent, keine Unterseiten: oben der Kopf, darunter bei einer
 * Bestellung ihre Belege und was noch zu bestellen ist, bei einer
 * Preisanfrage das Raster der Lieferanten — und unten der Verlauf.
 */
export const RequestPage = ({ requestId, tick, onBack, onAction, onChanged, onOpenDocument }: {
    requestId: string;
    tick: number;
    onBack: () => void;
    onAction: (action: ProcurementNextAction, purchaseOrderId: string) => void;
    onChanged: () => void;
    onOpenDocument: (id: string) => void;
}) => {
    const [workspace, setWorkspace] = useState<{ data: PurchasingWorkspace; revision: number } | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [reload, setReload] = useState(0);

    useEffect(() => {
        return readPurchasingWorkspace(requestId,
            (value) => { setWorkspace((current) => current?.data === value ? current : { data: value, revision: (current?.revision ?? 0) + 1 }); setError(null); },
            (failure) => setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')));
    }, [requestId, tick, reload]);

    const changed = useCallback(() => {
        setReload((value) => value + 1);
        onChanged();
    }, [onChanged]);

    if (!workspace) return <>
        <header className="ofi-buy-nav"><button type="button" className="ofi-buy-back ofi-nosize" onClick={onBack}><ChevronLeft />{t('common.back')}</button><h1>{t('productionBom.purchasing.title')}</h1></header>
        {error ? <Failure text={error} retry={() => setReload((value) => value + 1)} /> : <Loading />}
    </>;

    const { detail, orderLines, requestLines } = workspace.data;
    const { request, docs, canProcure } = detail;
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const asks = docs.filter((doc) => doc.kind === 'REQUEST' && doc.state !== 'CANCELLED');
    const mayAsk = canProcure && open && detail.bom.consumedAt === null;
    return (
        <>
            <RequestHead detail={detail} onBack={onBack} onChanged={changed} />
            {error && <Failure text={error} retry={() => setReload((value) => value + 1)} />}
            {request.kind === 'ORDER' ? (
                <>
                    <OrderDocs docs={docs} canProcure={canProcure} onAction={onAction} onOpenDocument={onOpenDocument} />
                    <OrderComposer key={workspace.revision} detail={detail} lines={orderLines} onCreated={changed} />
                </>
            ) : <>
                {asks.length > 0 && (
                <PriceCompare
                    detail={detail}
                    onOpenDocument={onOpenDocument}
                    onReply={(purchaseOrderId) => onAction('REPLY', purchaseOrderId)}
                    onAsk={null}
                    onChanged={changed}
                />
                )}
                {mayAsk && <PriceAsk key={request.id} detail={detail} lines={requestLines} onDone={changed} onCancel={null} />}
            </>}
            <History events={detail.history} />
        </>
    );
};
