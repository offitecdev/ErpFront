import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, BomAreaView, ProcurementRequest } from '@/types/productionBom';

import { LoadingState } from '../bom/bomUi';
import { NavView } from '../bom/NavStack';
import { useNavKeys, useNavStack, type NavStackHandle } from '../bom/navStackState';
import { BomDocumentsView } from '../bom/device/BomDocumentsView';
import { BomPurchasesView } from '../bom/device/BomPurchasesView';
import { BomPurchaseView } from '../bom/device/BomPurchaseView';
import { BomReceiptView } from '../bom/device/BomReceiptView';
import { OrderWizardView } from '../bom/device/OrderWizardView';
import { RequestWizardView } from '../bom/device/RequestWizardView';
import { BomRevisionsView, BomRevisionView } from '../bom/device/BomRevisionsView';
import { entryOf, viewKey, viewTitle, type BomView, type RequestWizardState, type WizardState } from '../bom/device/bomViews';
import type { BomViewContext } from '../bom/device/DeviceBomArea';
import { PurchasingRequestView } from './PurchasingRequestView';

/** Was die Fläche öffnet: einen Talep der BOM — oder einen Beleg einer BOM. */
export type PurchasingTarget =
    | { kind: 'request'; requestId: string }
    | { kind: 'document'; bomId: string; purchaseOrderId: string }
    /** Eine freigegebene BOM-Revision mit ihren Bestellungen (Satın alma › Revizyonlar). */
    | { kind: 'revision'; bomId: string; revision: number };

interface Loaded {
    bom: Bom;
    request: ProcurementRequest | null;
    project: ProcurementRequest['project'];
    device: ProcurementRequest['device'];
    canProcure: boolean;
}

/** Die Fläche der Assistenten erwartet die Sicht eines Geräts — hier aus Talep bzw. BOM gebaut. */
const areaViewOf = (loaded: Loaded): BomAreaView => ({
    settings: { maxPerArea: 0 },
    area: loaded.bom.area,
    device: {
        id: loaded.device?.id ?? '',
        name: loaded.device?.name ?? '—',
        quantity: 1,
        positionNumber: loaded.device?.positionNumber ?? null,
        isActive: true,
    },
    project: {
        id: loaded.project?.id ?? '',
        projectNumber: loaded.project?.projectNumber ?? '—',
        projectName: loaded.project?.projectName ?? '',
        customerName: loaded.project?.customerName ?? null,
        deliveryDate: loaded.project?.deliveryDate ?? null,
    },
    canEdit: false,
    counts: { MECHANICAL: 0, ELECTRICAL: 0 },
    main: null,
    subs: [],
    boms: [loaded.bom],
    codes: [],
    templates: [],
});

/**
 * ── SATIN ALMA · EIN TALEP / EIN BELEG (27.09.2026 abends, Vorgabe Samet) ────
 *
 * «Fiyat talepleri ve siparişleri muhasebe ve yöneticiler yapacak.» Der
 * Einkauf öffnet einen Talep der BOM und arbeitet mit denselben Assistenten,
 * die bisher in der BOM standen (Ürünler › Tedarikçiler › Önizleme › Sonuç),
 * nur hier — mit Lieferanten und Preisen. Die Wurzel des Stapels ist der
 * Talep (Schlüssel `bom:<id>`, damit die Assistenten nach dem Anlegen dorthin
 * zurückkehren); der blaue Zurück-Pfeil der Wurzel führt zur Liste.
 */
export const PurchasingBomArea = ({
    target,
    onExit,
    onChanged,
}: {
    target: PurchasingTarget;
    onExit: () => void;
    onChanged: () => void;
}) => {
    const navigate = useNavigate();
    const [loaded, setLoaded] = useState<Loaded | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [tick, setTick] = useState(0);
    const [wizard, setWizard] = useState<WizardState | null>(null);
    const [requestWizard, setRequestWizard] = useState<RequestWizardState | null>(null);

    const stack = useNavStack<BomView>(() => {
        if (target.kind === 'document') {
            return [
                entryOf({ kind: 'purchases', bomId: target.bomId }),
                entryOf({ kind: 'purchase', bomId: target.bomId, purchaseOrderId: target.purchaseOrderId }),
            ];
        }
        if (target.kind === 'revision') return [entryOf({ kind: 'revision', bomId: target.bomId, revision: target.revision })];
        // Die Kennung der BOM kennt erst die Antwort — bis dahin ein Platzhalter.
        return [{ key: `request:${target.requestId}`, view: { kind: 'list' } }];
    });

    useEffect(() => {
        let alive = true;
        const load = target.kind === 'request'
            ? productionBomApi.procurementRequest(target.requestId).then((result) => ({
                bom: result.bom,
                request: result.request,
                project: result.request.project,
                device: result.request.device,
                canProcure: result.canProcure,
            }))
            : productionBomApi.procurementBom(target.bomId).then((result) => ({ ...result, request: null }));
        // (Beleg und Revision lesen dieselbe BOM — voll, mit Lieferanten.)
        load
            .then((value) => {
                if (!alive) return;
                setLoaded(value);
                setError(null);
            })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure, 'productionBom.err.loadFailed')); });
        return () => { alive = false; };
    }, [target, tick]);

    // Die Wurzel eines Talep bekommt den Schlüssel der BOM, sobald sie bekannt ist.
    const bomId = loaded?.bom.id ?? null;
    useEffect(() => {
        if (target.kind !== 'request' || !bomId) return;
        if (stack.entries[0]?.view.kind !== 'list') return;
        stack.reset([entryOf({ kind: 'bom', bomId })]);
    }, [bomId, stack, target.kind]);

    /* Der Zurück-Pfeil der Wurzel verlässt die Fläche (zur Liste). */
    const nav = useMemo<NavStackHandle<BomView>>(() => ({
        ...stack,
        canBack: true,
        back: () => (stack.canBack ? stack.back() : onExit()),
        previous: stack.previous ?? { key: 'purchasing:list', view: { kind: 'list' }, titleKey: 'productionBom.purchasing.back' },
    }), [stack, onExit]);
    useNavKeys(nav);

    const applyBom = useCallback((bom: Bom) => {
        setLoaded((current) => (current ? { ...current, bom } : current));
        onChanged();
    }, [onChanged]);
    const reload = useCallback(() => {
        setTick((value) => value + 1);
        onChanged();
    }, [onChanged]);

    const shell = (children: React.ReactNode) => <div className="ofi-bom-nav ofi-pur-area">{children}</div>;

    if (error && !loaded) {
        return shell(
            <div className="ofi-bom-state is-error">
                <TriangleAlert aria-hidden />
                <b>{error}</b>
                <button type="button" className="ofi-bom-btn ofi-nosize" onClick={onExit}>{t('productionBom.purchasing.back')}</button>
            </div>,
        );
    }
    if (!loaded) return shell(<LoadingState />);

    const bom = loaded.bom;
    const boms = new Map([[bom.id, bom]]);
    const data = areaViewOf(loaded);
    const request = loaded.request;
    const context: BomViewContext = {
        nav,
        data,
        area: bom.area,
        canEdit: false,
        backTitle: stack.previous
            ? (stack.previous.view.kind === 'bom' && request ? request.requestNumber : viewTitle(stack.previous.view, data, boms))
            : t('productionBom.purchasing.back'),
        bomOf: (id) => (id === bom.id || id === 'main' ? bom : null),
        applyBom,
        reload,
        open: (view) => stack.push(entryOf(view)),
        openOrder: (purchaseOrderId, tab) => navigate(`/inventory/orders/${encodeURIComponent(purchaseOrderId)}${tab ? `?tab=${tab}` : ''}`),
        tasks: null,
        procurement: request
            // Vorgewählt wird, was noch in keinem Beleg dieses Talep steht — nie zweimal dieselbe Anfrage.
            ? { requestId: request.id, lines: new Map(request.lines.filter((line) => !line.covered).map((line) => [line.bomLineId, line.quantity])) }
            : null,
        homeKey: (id) => (request ? viewKey({ kind: 'bom', bomId: id }) : viewKey({ kind: 'purchases', bomId: id })),
        // Hier — und nur hier — stehen Lieferanten (auch in den Revisionen).
        purchasing: true,
    };

    const view = stack.current.view;
    return shell(
        <NavView entryKey={stack.current.key} direction={stack.direction}>
            {view.kind === 'list' && <LoadingState />}
            {view.kind === 'bom' && request && (
                <PurchasingRequestView
                    context={context}
                    bom={bom}
                    request={request}
                    canProcure={loaded.canProcure}
                    onRequestChanged={(next) => {
                        setLoaded((current) => (current ? { ...current, request: next } : current));
                        onChanged();
                    }}
                />
            )}
            {view.kind === 'wizard' && (
                <OrderWizardView context={context} bom={bom} step={view.step} wizard={wizard?.bomId === bom.id ? wizard : null} onWizard={setWizard} />
            )}
            {view.kind === 'request' && (
                <RequestWizardView
                    context={context}
                    bom={bom}
                    step={view.step}
                    wizard={requestWizard?.bomId === bom.id ? requestWizard : null}
                    onWizard={setRequestWizard}
                />
            )}
            {view.kind === 'purchases' && <BomPurchasesView context={context} bom={bom} />}
            {view.kind === 'purchase' && <BomPurchaseView context={context} bom={bom} purchaseOrderId={view.purchaseOrderId} />}
            {view.kind === 'receipt' && <BomReceiptView context={context} bom={bom} purchaseOrderId={view.purchaseOrderId} />}
            {view.kind === 'documents' && <BomDocumentsView context={context} bom={bom} />}
            {view.kind === 'revisions' && <BomRevisionsView context={context} bom={bom} />}
            {view.kind === 'revision' && <BomRevisionView context={context} bom={bom} revision={view.revision} />}
        </NavView>,
    );
};
