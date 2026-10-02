import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Boxes, TriangleAlert } from 'lucide-react';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorOf, productionBomErrorText } from '@/lib/api/productionBom';
import { isCustomBomCategory, type Bom, type BomAreaView, type BomSummary } from '@/types/productionBom';
import type { TaskArea } from '@/types/productionTasks';
import { useNavGuardStore } from '@/store/navGuardStore';
import '@/styles/modules/warehouse.css';
import '@/styles/modules/productionBom.css';

import { EmptyState, LoadingState, Note } from '../bomUi';
import { NavBar, NavView } from '../NavStack';
import { useNavKeys, useNavStack, type NavStackHandle } from '../navStackState';
import { BomDetailView } from './BomDetailView';
import { BomRevisionsView, BomRevisionView } from './BomRevisionsView';
import { BomTasksView } from './BomTasksView';
import { entryOf, MAIN_ALIAS, stackFromParams, viewTitle, writeViewParams, type BomView } from './bomViews';

/** Die Aufgaben der Stufe BOM — als Knopf in der Leiste, dahinter die Görevlendirme-Karte. */
export interface BomTasksBundle {
    count: number;
    /** Wie viele davon der lesenden Person gehören. */
    mine: number;
    card: ReactNode;
}

export interface BomViewContext {
    nav: NavStackHandle<BomView>;
    data: BomAreaView;
    area: TaskArea;
    /** Mekanik / Elektrik / der Name der eigenen Kategorie. */
    areaLabel: string;
    canEdit: boolean;
    /** Die vorige Ansicht beim Namen (für den blauen Zurück-Pfeil). */
    backTitle: string;
    bomOf: (id: string) => BomSummary | null;
    detailOf: (id: string) => Bom | null;
    applyBom: (bom: Bom) => void;
    reload: () => void;
    open: (view: BomView) => void;
    tasks: BomTasksBundle | null;
}

/**
 * ── DIE STUFE «BOM» AUF DER GERÄTESEITE (27.09.2026, Vorgabe Samet) ─────────
 *
 * «Üretimde BOM Liste alanında … max BOM üretim modül ayarlarında … her şey
 *  macOS SwiftUI; Apple geri mavi oku, farklı süreçler için ileri geri butonlu
 *  olsun, hep alta inmek zorunda kalmayalım.»
 *
 * Seit der Hierarchie (gleicher Tag): die Wurzel des Navigationsstapels ist die
 * HAUPT-BOM des Bereichs (BOM-MEK-00001 / BOM-ELK-00001) — gleich als Liste,
 * ohne Kartenwahl; darunter ihre Alt-BOMs als Karten. Weiter geht es in
 * eigenen Ansichten: Alt-BOM › Revisionen — und «Görevler» (die Aufgaben der
 * Stufe, vorher eine Glaskarte). Bestellen, anfragen und annehmen macht der
 * Einkauf auf «Satın alma»; die BOM stellt dafür nur den Talep.
 */
export const DeviceBomArea = ({
    deviceId,
    area,
    areaLabel,
    tasks,
}: {
    deviceId: string;
    area: TaskArea;
    areaLabel?: string;
    tasks: BomTasksBundle | null;
}) => {
    const [params, setParams] = useSearchParams();
    const stack = useNavStack<BomView>(() => stackFromParams(params));
    /* Jeder Wechsel der Ansicht geht durch die Wache ungespeicherter Änderungen
       (Samet: «kaydedilmemiş değişiklikler var demesi lazım»): die offene BOM
       meldet sie über useUnsavedChangesGuard an (useNavGuardStore) — hat sie
       keine, geht es sofort weiter. */
    const guarded = useCallback((go: () => void) => {
        const { attempt } = useNavGuardStore.getState();
        if (attempt) attempt(go);
        else go();
    }, []);
    const nav = useMemo<NavStackHandle<BomView>>(() => ({
        ...stack,
        push: (entry) => guarded(() => stack.push(entry)),
        replace: (entry) => guarded(() => stack.replace(entry)),
        back: () => guarded(stack.back),
        forward: () => guarded(stack.forward),
        popTo: (key) => guarded(() => stack.popTo(key)),
        reset: (entries) => guarded(() => stack.reset(entries)),
    }), [stack, guarded]);
    const [data, setData] = useState<BomAreaView | null>(null);
    const [error, setError] = useState<{ text: string; unavailable: boolean } | null>(null);
    const [tick, setTick] = useState(0);
    const [overrides, setOverrides] = useState<Map<string, Bom>>(() => new Map());

    useEffect(() => {
        let alive = true;
        const controller = new AbortController();
        productionBomApi.deviceView(deviceId, area, controller.signal)
            .then((value) => {
                if (!alive) return;
                setData(value);
                setOverrides(new Map());
                setError(null);
            })
            .catch((failure) => {
                if (!alive) return;
                const code = productionBomErrorOf(failure).code;
                setError({ text: productionBomErrorText(failure, 'productionBom.err.loadFailed'), unavailable: code === 'NOT_AVAILABLE' });
            });
        return () => { alive = false; controller.abort(); };
    }, [deviceId, area, tick]);

    // Die oberste Ansicht in die Adresse — ersetzt, damit «zurück» die Seite
    // verlässt. Nur wenn sie sich unterscheidet: sonst liefe es im Kreis.
    const currentView = nav.current.view;
    const mainId = data?.main?.id ?? null;
    useEffect(() => {
        const next = writeViewParams(params, currentView, mainId);
        if (next.toString() !== params.toString()) setParams(next, { replace: true });
    }, [currentView, mainId, params, setParams]);

    useNavKeys(nav);

    const boms = useMemo(() => {
        const map = new Map<string, BomSummary>();
        for (const bom of [...(data?.main ? [data.main] : []), ...(data?.subs ?? [])]) map.set(bom.id, bom);
        for (const [id, bom] of overrides) map.set(id, bom);
        return map;
    }, [data, overrides]);

    // `main` aus der Adresse ist die Haupt-BOM, deren Kennung erst die Antwort kennt.
    const bomOf = useCallback((id: string) => boms.get(id === MAIN_ALIAS ? mainId ?? '' : id) ?? null, [boms, mainId]);
    const applyBom = useCallback((bom: Bom) => setOverrides((current) => new Map(current).set(bom.id, bom)), []);
    const reload = useCallback(() => setTick((value) => value + 1), []);
    const open = useCallback((view: BomView) => nav.push(entryOf(view)), [nav]);

    const shell = (children: ReactNode) => (
        <div className="ofi-bom is-area" data-area={area.toLowerCase()}>
            {children}
        </div>
    );

    if (error && !data) {
        return shell(
            error.unavailable
                ? <Note tone="warn">{t('productionBom.device.notAvailable')}</Note>
                : (
                    <div className="ofi-bom-state is-error">
                        <TriangleAlert aria-hidden />
                        <b>{error.text}</b>
                        <button type="button" className="ofi-bom-btn ofi-nosize" onClick={reload}>{t('productionBom.common.retry')}</button>
                    </div>
                ),
        );
    }
    if (!data) return shell(<LoadingState />);

    const context: BomViewContext = {
        nav,
        data,
        area,
        areaLabel: areaLabel ?? (isCustomBomCategory(area) ? area : t(`productionBom.area.${area}`)),
        canEdit: data.canEdit,
        backTitle: nav.previous ? viewTitle(nav.previous.view, data, boms) : '',
        bomOf,
        detailOf: (id) => overrides.get(id) ?? null,
        applyBom,
        reload,
        open,
        tasks,
    };

    const view = nav.current.view;
    const main = mainId ? bomOf(mainId) : null;
    const bom = 'bomId' in view ? bomOf(view.bomId) : null;
    const missingBom = 'bomId' in view && !bom;

    return shell(
        <div className="ofi-bom-nav">
            <NavView entryKey={nav.current.key} direction={nav.direction}>
                {view.kind === 'list' && (main ? <BomDetailLoader key={main.id} context={context} bom={main} /> : <MainMissing context={context} />)}
                {view.kind === 'tasks' && <BomTasksView context={context} />}
                {missingBom && <BomMissing context={context} />}
                {bom && view.kind === 'bom' && <BomDetailLoader key={bom.id} context={context} bom={bom} />}
                {bom && view.kind === 'revisions' && <BomRevisionsView context={context} bom={bom} />}
                {bom && view.kind === 'revision' && <BomRevisionView context={context} bom={bom} revision={view.revision} />}
            </NavView>
        </div>,
    );
};

/** Only the selected BOM loads its materials and editable revision. */
const BomDetailLoader = ({ context, bom }: { context: BomViewContext; bom: BomSummary }) => {
    const detail = context.detailOf(bom.id);
    const apply = context.applyBom;
    const [error, setError] = useState<string | null>(null);
    const [retry, setRetry] = useState(0);
    useEffect(() => {
        if (detail) return;
        const controller = new AbortController();
        setError(null);
        productionBomApi.bomLines(bom.id, controller.signal)
            .then((result) => { if (!controller.signal.aborted) apply(result.bom); })
            .catch((failure) => { if (!controller.signal.aborted) setError(productionBomErrorText(failure)); });
        return () => controller.abort();
    }, [bom.id, detail, apply, retry]);
    if (detail) return <BomDetailView context={context} bom={detail} />;
    return <>
        <NavBar nav={context.nav} backTitle={context.backTitle} title={bom.bomNumber} />
        {error ? <div className="ofi-bom-state is-error"><b>{error}</b>
            <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => setRetry((value) => value + 1)}>{t('productionBom.common.retry')}</button>
        </div> : <LoadingState />}
    </>;
};

/** Lesende, solange es die Haupt-BOM noch nicht gibt (angelegt wird sie beim ersten Öffnen durch Bearbeitende). */
const MainMissing = ({ context }: { context: BomViewContext }) => (
    <>
        <NavBar nav={context.nav} title={t('productionBom.device.title')} />
        <div className="ofi-bom-body">
            <EmptyState icon={<Boxes />} title={t('productionBom.device.noMain')} hint={t('productionBom.device.readOnly')} />
        </div>
    </>
);

/** Eine BOM aus der Adresse, die es (hier) nicht gibt — zurück zur Liste. */
const BomMissing = ({ context }: { context: BomViewContext }) => (
    <div className="ofi-bom-state is-error">
        <TriangleAlert aria-hidden />
        <b>{t('productionBom.err.BOM_NOT_FOUND')}</b>
        <button type="button" className="ofi-bom-btn ofi-nosize" onClick={() => context.nav.reset([entryOf({ kind: 'list' })])}>
            {t('productionBom.device.title')}
        </button>
    </div>
);
