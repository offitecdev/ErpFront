import { lazy, Suspense, useCallback, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';

import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import type { ProcurementNextAction, PurchasingPanel } from '@/types/purchasing';
import '@/styles/modules/productionBom.css';
import '@/styles/modules/purchasing.css';
// Der Beleg trägt hier dasselbe Kleid wie unter /inventory/orders/:id (lagerPage).
import '@/styles/lagerApple.css';

import { ComparisonPage } from './compare/ComparisonPage';
import { PurchasingList } from './list/PurchasingList';
import { ReceivePanel } from './panels/ReceivePanel';
import { RequestPage } from './request/RequestPage';
import { actionTarget } from './purchasingModel';
import { Loading } from './purchasingUi';

const loadOrderWorkspace = () => import('@/pages/inventory/OrderWorkspacePage');
const Workspace = lazy(() => loadOrderWorkspace().then((module) => ({ default: module.OrderWorkspacePage })));

/** Ein Schritt, den diese Seite selbst in den Verlauf legte — «Geri» nimmt ihn zurück. */
const PUSHED = { buyStep: true } as const;

/**
 * ── ÜRETİM › SATIN ALMA (28.09.2026, umgebaut 29.09.2026) ───────────────────
 *
 * Eine Adresse, vier Ansichten:
 *   · die Liste (20 je Seite, Fiyat talepleri und Satın alma talepleri, je
 *     Zeile der nächste Schritt),
 *   · ein Talep (`?req=`),
 *   · darin ein Beleg (`&doc=`) — DIESELBE Seite wie im Stok
 *     (`/inventory/orders/:id`): «bu ekranlar birbirinin aynısı, yalnızca iki
 *     farklı yerde kopya olacak» (Samet, 29.09.2026),
 *   · ein gespeicherter Fiyat karşılaştırması (`&cmp=`).
 * Der Wareneingang bleibt die Fläche von rechts. Was geöffnet wird, steht in
 * der Adresse; die Browser-Zurück-Taste geht denselben Weg wie «Geri».
 */
export const ProductionPurchasingPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const location = useLocation();
    const [params, setParams] = useSearchParams();
    const requestId = params.get('req');
    const documentId = requestId ? params.get('doc') : null;
    /* Die Art des Belegs (`dk=request|order`) — die Bestellseite baut sich gleich richtig auf. */
    const documentKind = params.get('dk') === 'request' ? 'PRICE_REQUEST' as const : params.get('dk') === 'order' ? 'ORDER' as const : undefined;
    /* Die erste Seite des Belegs (`dt=mail`: eine revidierte Bestellung geht mit ihrem Änderungsblatt hinaus). */
    const documentTab = params.get('dt') === 'mail' ? 'mail' as const : params.get('dt') === 'pdf' ? 'pdf' as const : undefined;
    const comparisonId = requestId ? params.get('cmp') : null;
    const [panel, setPanel] = useState<PurchasingPanel | null>(null);
    const [tick, setTick] = useState(0);
    const refresh = useCallback(() => setTick((value) => value + 1), []);

    const go = (change: Record<string, string | null>) => {
        const next = new URLSearchParams(params);
        for (const [key, value] of Object.entries(change)) {
            if (value) next.set(key, value);
            else next.delete(key);
        }
        setParams(next, { state: PUSHED });
    };
    /* «Geri» aus Beleg oder Vergleich: den eigenen Schritt zurücknehmen — sonst
       (Adresse von aussen, neu geladen) auf den Talep ersetzen. */
    const backToRequest = () => {
        if ((location.state as { buyStep?: boolean } | null)?.buyStep) {
            navigate(-1);
        } else {
            const next = new URLSearchParams(params);
            next.delete('doc');
            next.delete('dk');
            next.delete('dt');
            next.delete('cmp');
            setParams(next, { replace: true });
        }
        refresh();
    };

    const openRequest = (id: string | null) => go({ req: id, doc: null, dk: null, dt: null, cmp: null });
    const openDocument = (id: string, kind: 'ORDER' | 'REQUEST', tab?: 'mail') =>
        go({ doc: id, dk: kind === 'REQUEST' ? 'request' : 'order', dt: tab ?? null, cmp: null });

    /** Der Knopf einer Zeile: die Bestellung selbst, der Wareneingang — oder der Talep. */
    const act = (id: string, action: ProcurementNextAction, purchaseOrderId: string | null) => {
        const target = purchaseOrderId ? actionTarget(action) : 'request';
        if (target === 'receive' && purchaseOrderId) setPanel({ kind: 'receive', requestId: id, purchaseOrderId });
        // Die Bestellung öffnet sich mit ihrer Sendeleiste («Onayla ve gönder», «Revizyonu gönder» …) — 30.09.2026.
        else if (target === 'document' && purchaseOrderId) go({ req: id, doc: purchaseOrderId, dk: 'order', dt: null, cmp: null });
        else openRequest(id);
    };

    const closePanel = () => { setPanel(null); refresh(); };
    const view = panel ? 'panel' : documentId ? 'document' : comparisonId ? 'comparison' : requestId ? 'request' : 'list';

    return (
        <>
            <div className="ofi-buy" hidden={view !== 'list'}>
                <PurchasingList tick={tick} onOpen={(id) => openRequest(id)} onAction={act} />
            </div>
            {requestId && (
                <div className="ofi-buy is-request" hidden={view !== 'request'}>
                    <RequestPage
                        key={requestId}
                        requestId={requestId}
                        tick={tick}
                        onBack={() => openRequest(null)}
                        onAction={(action, purchaseOrderId) => act(requestId, action, purchaseOrderId)}
                        onChanged={refresh}
                        onOpenDocument={openDocument}
                        onOpenComparison={(id) => go({ cmp: id, doc: null, dk: null, dt: null })}
                    />
                </div>
            )}
            {view === 'document' && documentId && (
                <div className="ofi-buy-document ofi-list-apple ofi-lager">
                    <Suspense fallback={<Loading />}>
                        <Workspace
                            key={documentId}
                            workspaceId={documentId}
                            workspaceKind={documentKind}
                            workspaceTab={documentTab}
                            onBack={backToRequest}
                            onOpenDocument={(id, kind) => go({ doc: id, dk: kind === 'REQUEST' ? 'request' : kind === 'ORDER' ? 'order' : null, dt: null })}
                        />
                    </Suspense>
                </div>
            )}
            {view === 'comparison' && comparisonId && (
                <div className="ofi-buy is-compare">
                    <ComparisonPage
                        key={comparisonId}
                        comparisonId={comparisonId}
                        onBack={backToRequest}
                        onSwitch={(id) => {
                            const next = new URLSearchParams(params);
                            next.set('cmp', id);
                            setParams(next, { replace: true, state: location.state });
                        }}
                        onOpenDocument={(id) => go({ doc: id, dk: 'order', dt: null, cmp: null })}
                        // Nach dem Bestellen: zurück zum Talep — dort stehen die Bestellungen.
                        onOrdered={backToRequest}
                    />
                </div>
            )}
            {panel && (
                <ReceivePanel
                    key={panel.purchaseOrderId}
                    requestId={panel.requestId}
                    purchaseOrderId={panel.purchaseOrderId}
                    onClose={closePanel}
                    onDone={closePanel}
                    onOpenOrder={() => { const target = panel; setPanel(null); go({ req: target.requestId, doc: target.purchaseOrderId, dk: 'order', dt: null, cmp: null }); }}
                />
            )}
        </>
    );
};

export default ProductionPurchasingPage;
