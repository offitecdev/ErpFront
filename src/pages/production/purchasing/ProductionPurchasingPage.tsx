import { lazy, Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { ProcurementNextAction, PurchasingPanel } from '@/types/purchasing';
import '@/styles/modules/purchasing.css';

import { PurchasingList } from './list/PurchasingList';
import { QuotePanel } from './panels/QuotePanel';
import { ReceivePanel } from './panels/ReceivePanel';
import { ReplyPanel } from './panels/ReplyPanel';
import { RequestPage } from './request/RequestPage';
import { Loading } from './purchasingUi';

const Workspace = lazy(() => import('@/pages/inventory/OrderWorkspacePage').then((module) => ({ default: module.OrderWorkspacePage })));

/**
 * ── ÜRETİM › SATIN ALMA (28.09.2026, Vorgabe Samet) ─────────────────────────
 *
 * «Çok uzun sürüyor, oraya tıkla buraya tıkla … stepleri azaltalım; talep
 *  numaraları, sipariş numarası, proje, cihaz daha net; son işlem hep
 *  gözüksün; 20'li sayfa … az ayrıntı, az buton, az sayfa.»
 *
 * Zwei Ansichten auf EINER Adresse: die Liste (20 je Seite, je Zeile der
 * nächste Schritt als Knopf) und ein Talep (`?req=`) auf einer Seite ohne
 * Assistent. Angebot, Wareneingang und Antwort eines Lieferanten öffnen
 * rechts eine Fläche — die Seite darunter bleibt stehen.
 */
export const ProductionPurchasingPage = () => {
    useLanguageTick();
    const [params, setParams] = useSearchParams();
    const requestId = params.get('req');
    const [panel, setPanel] = useState<PurchasingPanel | null>(null);
    const [documentId, setDocumentId] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((value) => value + 1), []);

    const openRequest = (id: string | null) => {
        const next = new URLSearchParams(params);
        if (id) next.set('req', id);
        else next.delete('req');
        setParams(next);
    };

    /** Der Knopf einer Zeile: eine Fläche — oder der Talep selbst (bestellen, anfragen, vergleichen). */
    const act = (id: string, action: ProcurementNextAction, purchaseOrderId: string | null) => {
        if (purchaseOrderId && (action === 'QUOTE' || action === 'CONFIRM' || action === 'RESEND')) setPanel({ kind: 'quote', requestId: id, purchaseOrderId });
        else if (purchaseOrderId && action === 'RECEIVE') setPanel({ kind: 'receive', requestId: id, purchaseOrderId });
        else if (purchaseOrderId && action === 'REPLY') setPanel({ kind: 'reply', requestId: id, purchaseOrderId });
        else openRequest(id);
    };

    const close = () => { setPanel(null); refresh(); };
    const done = () => {
        setPanel(null);
        refresh();
    };
    const Panel = panel ? { quote: QuotePanel, receive: ReceivePanel, reply: ReplyPanel }[panel.kind] : null;

    return (
        <div className="ofi-buy">
            <div hidden={Boolean(requestId || panel || documentId)}><PurchasingList tick={tick} onOpen={(id) => openRequest(id)} onAction={act} /></div>
            {requestId && (
                <div hidden={Boolean(panel || documentId)}>
                <RequestPage
                    key={requestId}
                    requestId={requestId}
                    tick={tick}
                    onBack={() => openRequest(null)}
                    onAction={(action, purchaseOrderId) => act(requestId, action, purchaseOrderId)}
                    onChanged={refresh}
                    onOpenDocument={setDocumentId}
                />
                </div>
            )}
            {documentId && <div>
                <Suspense fallback={<Loading />}><Workspace key={documentId} workspaceId={documentId} onBack={() => { setDocumentId(null); refresh(); }} onOpenDocument={setDocumentId} /></Suspense>
            </div>}
            {panel && Panel && (
                <Panel key={`${panel.kind}:${panel.purchaseOrderId}`} requestId={panel.requestId} purchaseOrderId={panel.purchaseOrderId} onClose={close} onDone={done} />
            )}
        </div>
    );
};

export default ProductionPurchasingPage;
