import { useEffect, useMemo, useRef, useState } from 'react';

import { Check, ChevronLeft, ChevronRight, Minus } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog, PopupNote } from '@/components/ui-shared/PopupKit';
import { SelectMenu } from '@/components/ui-shared/SelectMenu';
import { t } from '@/i18n/translate';
import { productionApi } from '@/lib/api/production';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import type {
    ProductionItem,
    ProductionOrderNode,
    ProductionPickerProject,
    ProductionProject,
    ProductionSelection,
} from '@/types/production';
import '@/styles/modules/production.css';

import { KindIcon, money, orderDateText, orderKindLabel, quantity } from './productionUi';

/**
 * ── PROJEKT UND GERÄTE WÄHLEN ───────────────────────────────────────────────
 * Vorgabe Samet: Wo die Produktion läuft, gehören Preisanfrage, Bestellung und
 * Wareneingang zu EINEM Projekt. Ein Gerät oder eine Leistung darf dazu
 * gewählt werden, auch mehrere — muss aber nicht (20.09.2026). Links die
 * Projekte (Suche, seitenweise), rechts ihre Aufträge mit den Geräten — die
 * Nachträge (NT) unter ihrem Hauptauftrag.
 *
 * Zweite Fassung (19.09.2026): ein grösseres Fenster «wie eine Seite», jede
 * Zeile mit Kästchen, oben EIN Kästchen für alle und je Auftrag eines für
 * seine Geräte. Eine Menge wird NICHT erfasst (Vorgabe Samet, 20.09.2026:
 * «adet mantığını kaldır, cihazı seçince işte eklensin») — ein Haken heisst,
 * dass die Bestellung dieses Gerät betrifft; die Stückzahl steht in ihren
 * eigenen Zeilen.
 *
 * Mit `lines` (die Zeilen einer bestehenden Bestellung) folgt bei mehreren
 * Geräten ein zweiter Schritt: jede Zeile bekommt ihr Gerät.
 */

type ProjectTree = { project: ProductionProject; orders: ProductionOrderNode[] };

/** So viele Projekte je Seite der linken Liste. */
const PAGE_SIZE = 10;

/* Schnell beim zweiten Öffnen: die letzte Liste und die geladenen Bäume
   bleiben eine Minute im Speicher. */
const TREE_TTL_MS = 60_000;
const treeCache = new Map<string, { at: number; tree: ProjectTree }>();
const listCache = new Map<string, { at: number; items: ProductionPickerProject[] }>();

const loadTree = async (projectId: string): Promise<ProjectTree> => {
    const cached = treeCache.get(projectId);
    if (cached && Date.now() - cached.at < TREE_TTL_MS) return cached.tree;
    const tree = await productionApi.pickerProject(projectId);
    treeCache.set(projectId, { at: Date.now(), tree });
    return tree;
};

const loadList = async (search: string): Promise<ProductionPickerProject[]> => {
    const cached = listCache.get(search);
    if (cached && Date.now() - cached.at < TREE_TTL_MS) return cached.items;
    const items = await productionApi.pickerProjects(search || undefined);
    listCache.set(search, { at: Date.now(), items });
    return items;
};

const itemsOf = (node: ProductionOrderNode): ProductionItem[] =>
    [...node.items.map((entry) => entry.item), ...node.addons.flatMap(itemsOf)];

/** Das Kästchen: leer, halb (ein Teil gewählt) oder voll. */
const CheckMark = ({ state }: { state: 'on' | 'mixed' | 'off' }) => (
    <span className={`ofi-prod-check ${state === 'on' ? 'is-on' : state === 'mixed' ? 'is-mixed' : ''}`} aria-hidden>
        {state === 'on' ? <Check /> : state === 'mixed' ? <Minus /> : null}
    </span>
);

const stateOf = (ids: string[], selected: Set<string>): 'on' | 'mixed' | 'off' => {
    const count = ids.filter((id) => selected.has(id)).length;
    if (!count) return 'off';
    return count === ids.length ? 'on' : 'mixed';
};

export interface PickerLine {
    label: string;
    productionItemId: string | null;
}

/** Was die Auswahl ausser den Ids mitbringt — für Beschriftung und Zeilenwahl. */
export interface PickerDetails {
    project: ProductionProject;
    items: ProductionItem[];
}

export const ProductionPickerDialog = ({
    open,
    initial,
    lines,
    busy = false,
    onClose,
    onApply,
}: {
    open: boolean;
    initial: ProductionSelection | null;
    /** Zeilen einer bestehenden Bestellung — dann folgt bei mehreren Geräten die Zuordnung je Zeile. */
    lines?: PickerLine[];
    busy?: boolean;
    onClose: () => void;
    /** `details` ist `null`, wenn KEIN Projekt (mehr) gewählt ist. */
    onApply: (selection: ProductionSelection, lineItemIds: Array<string | null> | undefined, details: PickerDetails | null) => void;
}) => {
    const [search, setSearch] = useState('');
    const debounced = useDebouncedValue(search.trim(), 220);
    const [projects, setProjects] = useState<ProductionPickerProject[] | null>(null);
    const [listFailed, setListFailed] = useState(false);
    const [page, setPage] = useState(1);
    /* ZWEI Dinge, nicht eins: `activeId` ist das Projekt, dessen Geräte rechts
       stehen (angeschaut), `chosenId` das GEWÄHLTE. Noch einmal auf das
       gewählte tippen nimmt die Wahl zurück (Vorgabe Samet, 21.09.2026) — der
       Baum bleibt sichtbar, gespeichert wird dann ohne Projekt. */
    const [activeId, setActiveId] = useState<string | null>(null);
    const [chosenId, setChosenId] = useState<string | null>(null);
    const [tree, setTree] = useState<ProjectTree | null>(null);
    const [treeFailed, setTreeFailed] = useState(false);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [step, setStep] = useState<'pick' | 'map'>('pick');
    const [mapping, setMapping] = useState<Array<string | null>>([]);
    const searchRef = useRef<HTMLInputElement | null>(null);
    /* Die gespeicherte Wahl soll beim Öffnen auf IHRER Seite der Liste stehen. */
    const jumpToInitial = useRef(false);

    // Beim Öffnen: die bestehende Wahl übernehmen.
    useEffect(() => {
        if (!open) return;
        setSearch('');
        setStep('pick');
        setPage(1);
        setActiveId(initial?.productionProjectId ?? null);
        setChosenId(initial?.productionProjectId ?? null);
        setSelected(new Set(initial?.productionItemIds ?? []));
        jumpToInitial.current = Boolean(initial?.productionProjectId);
        window.setTimeout(() => searchRef.current?.focus(), 60);
    }, [open, initial]);

    useEffect(() => {
        if (!open) return undefined;
        let alive = true;
        setListFailed(false);
        loadList(debounced).then(
            (items) => {
                if (!alive) return;
                setProjects(items);
                setActiveId((current) => current ?? items[0]?.id ?? null);
                if (jumpToInitial.current && initial?.productionProjectId) {
                    const at = items.findIndex((item) => item.id === initial.productionProjectId);
                    if (at >= 0) setPage(Math.floor(at / PAGE_SIZE) + 1);
                    jumpToInitial.current = false;
                } else {
                    setPage(1);
                }
            },
            () => { if (alive) setListFailed(true); },
        );
        return () => { alive = false; };
    }, [open, debounced, initial]);

    useEffect(() => {
        if (!open || !activeId) return undefined;
        let alive = true;
        setTreeFailed(false);
        setTree((current) => (current?.project.id === activeId ? current : null));
        loadTree(activeId).then(
            (value) => { if (alive) setTree(value); },
            () => { if (alive) setTreeFailed(true); },
        );
        return () => { alive = false; };
    }, [open, activeId]);

    const shownTree = tree && tree.project.id === activeId ? tree : null;
    const allItems = useMemo(() => (shownTree ? shownTree.orders.flatMap(itemsOf) : []), [shownTree]);
    const allIds = useMemo(() => allItems.map((item) => item.id), [allItems]);
    // Nur Geräte des gewählten Projekts zählen — ein Projektwechsel verwirft die alte Wahl.
    const chosen = useMemo(() => allItems.filter((item) => selected.has(item.id)), [allItems, selected]);

    const pages = Math.max(1, Math.ceil((projects?.length ?? 0) / PAGE_SIZE));
    const pageItems = (projects ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

    const pickProject = (id: string) => {
        // Dasselbe Projekt ein zweites Mal: die Wahl fällt weg.
        if (id === chosenId) {
            setChosenId(null);
            setSelected(new Set());
            return;
        }
        setChosenId(id);
        setActiveId(id);
        setSelected(new Set(id === initial?.productionProjectId ? initial.productionItemIds : []));
    };

    /** Ein Gerät anzukreuzen wählt sein Projekt gleich mit — es lebt ja darin. */
    const ensureChosen = () => setChosenId((current) => current ?? activeId);

    const toggle = (id: string) => {
        ensureChosen();
        setSelected((current) => {
            const next = new Set(current);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    /** Ein Kästchen für viele: sind alle gewählt, leert es sie — sonst wählt es alle. */
    const toggleMany = (ids: string[]) => {
        ensureChosen();
        setSelected((current) => {
            const next = new Set(current);
            const all = ids.every((id) => next.has(id));
            ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
            return next;
        });
    };

    const needsMapping = Boolean(lines && lines.length > 0 && chosen.length > 1);

    /* Das Projekt genügt: ohne Gerät gehört die Bestellung ihm allein. Ist
       gar keines gewählt, geht die Auswahl LEER hinaus — das nimmt eine
       frühere Zuordnung zurück. */
    const selection = (): ProductionSelection => (chosenId
        ? { productionProjectId: chosenId, productionItemIds: chosen.map((item) => item.id) }
        : { productionProjectId: null, productionItemIds: [] });

    const details = (): PickerDetails | null => (chosenId && shownTree && shownTree.project.id === chosenId
        ? { project: shownTree.project, items: chosen }
        : null);

    const next = () => {
        const value = selection();
        const info = details();
        if (!info) {
            // Kein Projekt (mehr): die leere Wahl geht hinaus, nichts zu verteilen.
            onApply(value, undefined, null);
            return;
        }
        if (!needsMapping) {
            // Nichts verteilen: jede Zeile behält, was sie trägt (Vorgabe Samet).
            onApply(value, undefined, info);
            return;
        }
        const allowed = new Set(value.productionItemIds);
        setMapping(lines!.map((line) => (line.productionItemId && allowed.has(line.productionItemId) ? line.productionItemId : null)));
        setStep('map');
    };

    /* Die erste Zeile lässt eine Bestellzeile beim PROJEKT — etikettieren ist
       freiwillig (Vorgabe Samet, 20.09.2026). */
    const deviceOptions = [
        { value: '', label: t('production.assign.toProject') },
        ...chosen.map((item) => ({
            value: item.id,
            label: item.name,
            ...(item.positionNumber ? { hint: item.positionNumber } : {}),
        })),
    ];
    const unmapped = mapping.filter((value) => !value).length;

    const renderOrder = (node: ProductionOrderNode, addon: boolean) => {
        const ids = node.items.map((entry) => entry.item.id);
        const date = orderDateText(node.order);
        return (
            <div key={node.order.id} className="ofi-prod-picker__group">
                <button
                    type="button"
                    role="checkbox"
                    aria-checked={stateOf(ids, selected) === 'mixed' ? 'mixed' : stateOf(ids, selected) === 'on'}
                    disabled={!ids.length}
                    className={`ofi-prod-picker__order ${addon ? 'is-addon' : ''}`}
                    onClick={() => toggleMany(ids)}
                >
                    <CheckMark state={ids.length ? stateOf(ids, selected) : 'off'} />
                    <span className="font-mono">{node.order.orderNumber}</span>
                    <span>{orderKindLabel(node.order)}</span>
                    {date && <span className="ofi-prod-picker__muted">{date}</span>}
                    <span className="ofi-prod-picker__muted ml-auto">{t('production.picker.itemCount', { count: ids.length })}</span>
                </button>
                {node.items.length === 0 && <div className="ofi-prod-picker__hint">{t('production.picker.orderEmpty')}</div>}
                {node.items.map(({ item }) => {
                    const on = selected.has(item.id);
                    return (
                        <button
                            key={item.id}
                            type="button"
                            role="checkbox"
                            aria-checked={on}
                            className={`ofi-prod-picker__item ${addon ? 'is-addon' : ''} ${on ? 'is-on' : ''}`.trim()}
                            onClick={() => toggle(item.id)}
                        >
                            <CheckMark state={on ? 'on' : 'off'} />
                            <span className="ofi-prod-picker__pos">{item.positionNumber ?? ''}</span>
                            <KindIcon kind={item.kind} />
                            <span className="name" title={item.name}>{item.name}</span>
                            <small>{quantity(item.quantity, item.unit)}</small>
                            <small className="ofi-prod-picker__amount">{money(item.totalPrice)}</small>
                        </button>
                    );
                })}
                {node.addons.map((child) => renderOrder(child, true))}
            </div>
        );
    };

    const masterState = allIds.length ? stateOf(allIds, selected) : 'off';

    return (
        <PopupDialog
            open={open}
            onClose={onClose}
            width={step === 'map' ? 760 : 1180}
            title={step === 'map' ? t('production.picker.mapTitle') : t('production.picker.title')}
            subtitle={step === 'map' ? t('production.picker.mapSubtitle') : t('production.picker.subtitle')}
            footer={(
                <PopupActions
                    start={step === 'pick' ? (
                        <span className="ofi-prod-picker__foot">
                            {!chosenId
                                ? t('production.assign.none')
                                : chosen.length
                                    ? t('production.picker.selectedCount', { count: chosen.length })
                                    : t('production.picker.optionalHint')}
                        </span>
                    ) : (
                        <span className="ofi-prod-picker__foot">
                            {unmapped ? t('production.picker.unmapped', { count: unmapped }) : t('production.picker.mapped')}
                        </span>
                    )}
                >
                    {step === 'map'
                        ? <PopupButton onClick={() => setStep('pick')}>{t('common.back')}</PopupButton>
                        : <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>}
                    {step === 'pick' ? (
                        <PopupButton variant="primary" disabled={Boolean(chosenId) && !shownTree} loading={busy && !needsMapping} onClick={next}>
                            {needsMapping ? t('production.picker.next') : t('production.picker.apply')}
                        </PopupButton>
                    ) : (
                        <PopupButton
                            variant="primary"
                            loading={busy}
                            onClick={() => {
                                const info = details();
                                if (info) onApply(selection(), mapping, info);
                            }}
                        >
                            {t('production.picker.apply')}
                        </PopupButton>
                    )}
                </PopupActions>
            )}
        >
            {step === 'pick' ? (
                <div className="ofi-prod-picker is-large">
                    <div className="ofi-prod-picker__side">
                        <div className="ofi-prod-picker__search">
                            <input
                                ref={searchRef}
                                type="search"
                                className="ofi-cal-input"
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                placeholder={t('production.picker.search')}
                                aria-label={t('production.picker.search')}
                            />
                        </div>
                        <div className="ofi-prod-picker__list">
                            {listFailed && <div className="ofi-prod-picker__hint">{t('production.loadFailed')}</div>}
                            {!listFailed && projects === null && <div className="ofi-prod-picker__hint">{t('common.loading')}</div>}
                            {!listFailed && projects?.length === 0 && <div className="ofi-prod-picker__hint">{t('production.picker.noProjects')}</div>}
                            {pageItems.map((project) => (
                                <button
                                    key={project.id}
                                    type="button"
                                    aria-pressed={project.id === chosenId}
                                    title={project.id === chosenId ? t('production.picker.unpickHint') : undefined}
                                    className={`ofi-prod-picker__project ${project.id === chosenId ? 'is-on' : project.id === activeId ? 'is-browsing' : ''}`}
                                    onClick={() => pickProject(project.id)}
                                >
                                    <b>
                                        <span>{project.projectNumber}</span>
                                        {project.sourceKind === 'DELIVERY' && <span className="font-normal opacity-70">· {t('production.kind.delivery')}</span>}
                                    </b>
                                    <span title={project.projectName}>{project.projectName}</span>
                                    <small>
                                        {[
                                            project.customerName,
                                            t('production.picker.counts', { devices: project.deviceCount, services: project.serviceCount }),
                                        ].filter(Boolean).join(' · ')}
                                    </small>
                                </button>
                            ))}
                        </div>
                        {/* Seitenweise (Vorgabe Samet): die Liste bleibt kurz, auch mit vielen Projekten. */}
                        {pages > 1 && (
                            <div className="ofi-prod-picker__pager">
                                <button
                                    type="button"
                                    disabled={page <= 1}
                                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                                    aria-label={t('production.picker.prevPage')}
                                >
                                    <ChevronLeft />
                                </button>
                                <span>{t('production.picker.page', { page, pages })}</span>
                                <button
                                    type="button"
                                    disabled={page >= pages}
                                    onClick={() => setPage((current) => Math.min(pages, current + 1))}
                                    aria-label={t('production.picker.nextPage')}
                                >
                                    <ChevronRight />
                                </button>
                            </div>
                        )}
                    </div>
                    <div className="ofi-prod-picker__main">
                        {/* Das EINE Kästchen oben: alle Geräte und Leistungen des Projekts. */}
                        <button
                            type="button"
                            role="checkbox"
                            aria-checked={masterState === 'mixed' ? 'mixed' : masterState === 'on'}
                            disabled={!allIds.length}
                            className="ofi-prod-picker__master"
                            onClick={() => toggleMany(allIds)}
                        >
                            <CheckMark state={masterState} />
                            <b>{t('production.picker.selectAll')}</b>
                            <span className="ofi-prod-picker__muted ml-auto">
                                {t('production.picker.selectedOf', { count: chosen.length, total: allIds.length })}
                            </span>
                        </button>
                        <div className="ofi-prod-picker__items">
                            {!activeId && <div className="ofi-prod-picker__hint">{t('production.picker.pickProject')}</div>}
                            {activeId && treeFailed && <div className="ofi-prod-picker__hint">{t('production.loadFailed')}</div>}
                            {activeId && !treeFailed && !shownTree && <div className="ofi-prod-picker__hint">{t('common.loading')}</div>}
                            {shownTree && shownTree.orders.length === 0 && (
                                <div className="ofi-prod-picker__hint">{t('production.picker.projectEmpty')}</div>
                            )}
                            {shownTree?.orders.map((node) => renderOrder(node, false))}
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2">
                        <span className="text-[12.5px] opacity-70">{t('production.picker.fillEmpty')}</span>
                        <SelectMenu
                            value=""
                            options={deviceOptions}
                            onChange={(value) => setMapping((current) => current.map((entry) => entry ?? value))}
                            placeholder={t('production.picker.chooseDevice')}
                            className="w-[260px]"
                            listWidth={300}
                        />
                    </div>
                    <div className="ofi-prod-picker__map">
                        {lines!.map((line, index) => (
                            <div key={index} className="ofi-prod-picker__mapline">
                                <span title={line.label}>
                                    <span className="mr-2 font-mono opacity-60">{index + 1}</span>
                                    {line.label}
                                </span>
                                <SelectMenu
                                    value={mapping[index] ?? ''}
                                    options={deviceOptions}
                                    onChange={(value) => setMapping((current) => current.map((entry, at) => (at === index ? value : entry)))}
                                    placeholder={t('production.assign.toProject')}
                                    listWidth={300}
                                />
                            </div>
                        ))}
                    </div>
                    {unmapped > 0 && <PopupNote>{t('production.picker.mapOptional')}</PopupNote>}
                </div>
            )}
        </PopupDialog>
    );
};
