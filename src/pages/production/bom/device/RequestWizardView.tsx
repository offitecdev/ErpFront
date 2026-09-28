import { useEffect, useState } from 'react';
import { Check, ChevronRight, ExternalLink, FileText, Plus, TriangleAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { SupplierSelect, type SupplierValue } from '@/pages/warehouse/components/SupplierSelect';
import type { Bom, BomRequestProposalLine } from '@/types/productionBom';

import { fmtQty, unitLabel } from '../bomFormat';
import { Dash, EmptyState, LoadingState, Note } from '../bomUi';
import { NavBar } from '../NavStack';
import {
    entryOf,
    parseQty,
    predictedNumber,
    requestInput,
    requestLineProblem,
    restrictRequestWizard,
    requestWizardFromProposal,
    supplierGroupKey,
    viewKey,
    type RequestLineState,
    type RequestWizardState,
    type WizardStep,
} from './bomViews';
import type { BomViewContext } from './DeviceBomArea';

const STEPS: WizardStep[] = [1, 2, 3, 4];

const StepBar = ({ step }: { step: WizardStep }) => (
    <ol className="ofi-bom-steps" aria-label={t('productionBom.request.title')}>
        {STEPS.map((entry) => (
            <li key={entry} className={entry === step ? 'is-on' : entry < step ? 'is-done' : undefined} aria-current={entry === step ? 'step' : undefined}>
                <span className="ofi-bom-steps__num">{entry < step ? <Check /> : entry}</span>
                <span>{t(`productionBom.request.step${entry}`)}</span>
                {entry < 4 && <ChevronRight className="ofi-bom-steps__sep" aria-hidden />}
            </li>
        ))}
    </ol>
);

/** Die Wahl einer Zeile: die Lieferanten ihrer Karte und was an ihrem «+» dazukam. */
const optionsOf = (line: BomRequestProposalLine, state: RequestLineState) =>
    [...new Map([...line.suppliers, ...state.extraSuppliers, ...state.suppliers]
        .map((entry) => [supplierGroupKey(entry), { id: entry.id, name: entry.name }] as const)).values()];

/**
 * ── «FİYAT TALEBİ» — VIER ANSICHTEN (27.09.2026, Vorgabe Samet) ─────────────
 *
 * «Fiyat talebi alacağımız zaman bom onaylanmamış olması gerekir … siparişe
 *  benzer olmak üzere fiyat talepleri de eklenebilsin. Ancak fiyat talebinde
 *  sadece ürün adı, miktarı, modeli ile aktarım yapılsın — pdf ekleme, sipariş
 *  numarası ekleme gibi şeyler olmayacak. Birden fazla tedarikçiye aynı ürün
 *  eklenip fiyat talebi alınabilsin; fiyat talepleri ayrı ayrı tedarikçiler
 *  üzerinden açılsın.»
 *
 *   1 Ürünler      welche Zeilen, welche Menge (die der BOM; frei änderbar)
 *   2 Tedarikçiler je Zeile EIN ODER MEHRERE Lieferanten; neue über das kleine
 *                  Fenster — nur für diese Zeile
 *   3 Önizleme     je Lieferant eine Preisanfrage mit ihrer (voraussichtlichen) Nummer
 *   4 Sonuç        die angelegten Anfragen, gleich zu öffnen
 *
 * Keine Mindestmenge, keine Erklärung, kein Angebot, keine Angebotsnummer:
 * gefragt wird nur der Preis. Wer die BOM freigibt, fragt nicht mehr — er bestellt.
 */
export const RequestWizardView = ({
    context,
    bom,
    step,
    wizard,
    onWizard,
}: {
    context: BomViewContext;
    bom: Bom;
    step: WizardStep;
    wizard: RequestWizardState | null;
    onWizard: (next: RequestWizardState | null) => void;
}) => {
    const { nav } = context;
    // Aus einem Talep PRICE der BOM (Satın alma): nur seine Zeilen, die Anfragen hängen an ihm.
    const requestLines = context.procurement?.lines ?? null;
    const requestId = context.procurement?.requestId ?? null;
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [supplierFor, setSupplierFor] = useState<string | null>(null);
    const [supplierDraft, setSupplierDraft] = useState<SupplierValue | null>(null);

    // Frisch vom Server, sobald die erste Ansicht öffnet (auch nach einem Durchgang).
    const needsProposal = step === 1 && (!wizard || Boolean(wizard.result));
    useEffect(() => {
        if (!needsProposal) return undefined;
        let alive = true;
        productionBomApi.requestProposal(bom.id, requestId)
            .then((proposal) => { if (alive) { onWizard(restrictRequestWizard(requestWizardFromProposal(proposal), requestLines)); setError(null); } })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure)); });
        return () => { alive = false; };
    }, [bom.id, needsProposal, onWizard, requestId, requestLines]);

    const lines = wizard?.proposal.lines ?? [];
    const included = lines.filter((line) => wizard?.lines[line.lineId]?.include);

    const patch = (lineId: string, change: Partial<RequestLineState>) => {
        if (!wizard) return;
        onWizard({ ...wizard, lines: { ...wizard.lines, [lineId]: { ...wizard.lines[lineId]!, ...change } } });
    };
    const toggleSupplier = (lineId: string, supplier: { id: string | null; name: string }) => {
        const current = wizard?.lines[lineId];
        if (!current) return;
        const key = supplierGroupKey(supplier);
        const on = current.suppliers.some((entry) => supplierGroupKey(entry) === key);
        patch(lineId, {
            suppliers: on
                ? current.suppliers.filter((entry) => supplierGroupKey(entry) !== key)
                : [...current.suppliers, supplier],
        });
    };

    const problems1 = included.filter((line) => requestLineProblem(wizard!.lines[line.lineId]!));
    const problems2 = included.filter((line) => !wizard!.lines[line.lineId]?.suppliers.length);

    // Je Lieferant eine Anfrage — dieselbe Zeile steht in so vielen, wie sie Lieferanten hat.
    const groupMap = new Map<string, { supplier: { id: string | null; name: string }; lines: BomRequestProposalLine[] }>();
    for (const line of included) {
        for (const supplier of wizard?.lines[line.lineId]?.suppliers ?? []) {
            const key = supplierGroupKey(supplier);
            groupMap.set(key, { supplier, lines: [...(groupMap.get(key)?.lines ?? []), line] });
        }
    }
    const groups = [...groupMap.values()];

    const go = (next: WizardStep) => nav.push(entryOf({ kind: 'request', bomId: bom.id, step: next }));

    const create = async () => {
        if (!wizard || creating) return;
        setCreating(true);
        try {
            const result = await productionBomApi.createRequests(bom.id, requestInput(wizard), requestId);
            context.applyBom(result.bom);
            onWizard({ ...wizard, result: { created: result.created, failed: result.failed } });
            result.failed.forEach((entry) => toast.error(t('productionBom.request.failed', { supplier: entry.supplierName })));
            // Das Ergebnis steht direkt über der BOM: zurück führt zu ihr, nicht in einen alten Entwurf.
            nav.popTo(context.homeKey?.(bom.id) ?? viewKey({ kind: 'bom', bomId: bom.id }));
            nav.push(entryOf({ kind: 'request', bomId: bom.id, step: 4 }));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setCreating(false);
        }
    };

    /* Der neue Lieferant gilt NUR für die Zeile, an deren «+» er kam — dort
       gleich gewählt, bei den übrigen weder gewählt noch angeboten (wie in
       «Sipariş oluştur»). */
    const addSupplier = () => {
        if (!wizard || !supplierFor || !supplierDraft) return;
        const current = wizard.lines[supplierFor];
        const line = lines.find((entry) => entry.lineId === supplierFor);
        if (!current || !line) return;
        const key = supplierGroupKey(supplierDraft);
        const known = optionsOf(line, current).some((entry) => supplierGroupKey(entry) === key);
        patch(supplierFor, {
            suppliers: current.suppliers.some((entry) => supplierGroupKey(entry) === key) ? current.suppliers : [...current.suppliers, supplierDraft],
            extraSuppliers: known ? current.extraSuppliers : [...current.extraSuppliers, supplierDraft],
        });
        setSupplierFor(null);
        setSupplierDraft(null);
    };

    /* ── Leiste ────────────────────────────────────────────────────────── */
    const next = step === 1
        ? { enabled: included.length > 0 && problems1.length === 0, onClick: () => go(2) }
        : step === 2
            ? { enabled: included.length > 0 && problems2.length === 0, onClick: () => go(3) }
            : null;

    const actions = step < 3 ? (
        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={!next?.enabled} onClick={next?.onClick}>
            {t('productionBom.common.continue')}
            <ChevronRight />
        </button>
    ) : step === 3 ? (
        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={!groups.length || creating} onClick={() => void create()}>
            {creating ? <span className="ofi-bom-spinner is-small is-light" /> : <FileText />}
            {creating ? t('productionBom.wizard.creating') : t('productionBom.request.createAll', { count: groups.length })}
        </button>
    ) : (
        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" onClick={() => nav.replace(entryOf({ kind: 'purchases', bomId: bom.id }))}>
            {t('productionBom.request.goRequests')}
            <ChevronRight />
        </button>
    );

    const header = (
        <NavBar
            nav={nav}
            backTitle={context.backTitle}
            title={t(`productionBom.request.step${step}`)}
            subtitle={`${t('productionBom.request.title')} · ${bom.bomNumber}`}
            actions={actions}
        />
    );

    if (error && !wizard) {
        return (
            <>
                {header}
                <div className="ofi-bom-body">
                    <div className="ofi-bom-state is-error"><TriangleAlert aria-hidden /><b>{error}</b></div>
                </div>
            </>
        );
    }
    if (!wizard) return (<>{header}<div className="ofi-bom-body"><LoadingState /></div></>);

    const supplierLine = supplierFor ? lines.find((line) => line.lineId === supplierFor) ?? null : null;
    const supplierState = supplierFor ? wizard.lines[supplierFor] ?? null : null;

    return (
        <>
            {header}
            <div className="ofi-bom-body">
                <StepBar step={step} />

                {step === 1 && (
                    <>
                        <Note>{t('productionBom.request.linesHint')}</Note>
                        {!lines.length ? (
                            <EmptyState icon={<FileText />} title={t('productionBom.request.nothing')} />
                        ) : (
                            <div className="ofi-bom-tablewrap">
                                <table className="ofi-bom-table" data-unstyled-table>
                                    <thead>
                                        <tr>
                                            <th className="is-check">
                                                <input
                                                    type="checkbox"
                                                    aria-label={t('productionBom.wizard.selectAll')}
                                                    checked={included.length === lines.length}
                                                    onChange={(event) => onWizard({
                                                        ...wizard,
                                                        lines: Object.fromEntries(Object.entries(wizard.lines).map(([id, state]) => [id, { ...state, include: event.target.checked }])),
                                                    })}
                                                />
                                            </th>
                                            <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                            <th className="is-name">{t('productionBom.columns.name')}</th>
                                            <th>{t('productionBom.columns.modelNumber')}</th>
                                            <th className="is-num">{t('productionBom.columns.need')}</th>
                                            <th className="is-num is-accent">{t('productionBom.request.quantity')}</th>
                                            <th>{t('productionBom.request.asked')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line) => {
                                            const state = wizard.lines[line.lineId]!;
                                            const problem = state.include ? requestLineProblem(state) : null;
                                            return (
                                                <tr key={line.lineId} className={!state.include ? 'is-off' : undefined}>
                                                    <td className="is-check">
                                                        <input
                                                            type="checkbox"
                                                            checked={state.include}
                                                            aria-label={t('productionBom.wizard.include')}
                                                            onChange={(event) => patch(line.lineId, { include: event.target.checked })}
                                                        />
                                                    </td>
                                                    <td className="is-code"><span className="ofi-bom-code">{line.erpCode ?? '—'}</span></td>
                                                    <td className="is-name">
                                                        <span className="ofi-bom-cellname">
                                                            <b>{line.name}{line.serialRequired && <i className="ofi-bom-sn">{t('productionBom.detail.serialTag')}</i>}</b>
                                                            {line.missingProduct
                                                                ? <small className="is-warn">{t('productionBom.editor.productMissing')}</small>
                                                                : line.brand && <small>{line.brand}</small>}
                                                        </span>
                                                    </td>
                                                    <td className="is-mono">{line.modelNumber ?? <Dash />}</td>
                                                    <td className="is-num"><span className="ofi-bom-qty">{fmtQty(line.quantity)}<small>{unitLabel(line.unit)}</small></span></td>
                                                    <td className="is-num is-accent">
                                                        <span className="ofi-bom-qtyedit">
                                                            <input
                                                                value={state.quantityText}
                                                                inputMode="decimal"
                                                                disabled={!state.include}
                                                                className={problem === 'QTY' ? 'is-invalid' : undefined}
                                                                aria-label={t('productionBom.request.quantity')}
                                                                onFocus={(event) => event.currentTarget.select()}
                                                                onChange={(event) => patch(line.lineId, { quantityText: event.target.value })}
                                                            />
                                                            <small>{unitLabel(line.unit)}</small>
                                                        </span>
                                                        {problem === 'QTY' && <small className="ofi-bom-cellerr">{t('productionBom.request.qtyInvalid')}</small>}
                                                    </td>
                                                    <td>
                                                        {line.requests.length ? (
                                                            <span className="ofi-bom-asked">
                                                                {line.requests.map((request) => (
                                                                    <span key={request.purchaseOrderId} className="ofi-bom-chip is-static" title={`${request.supplierName} · ${fmtQty(request.quantity)}`}>
                                                                        <PurchaseCode value={request.referenceNumber} />
                                                                        <small>{request.supplierName}</small>
                                                                    </span>
                                                                ))}
                                                            </span>
                                                        ) : <Dash />}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </>
                )}

                {step === 2 && (
                    <>
                        <Note>{t('productionBom.request.supplierHint')}</Note>
                        <div className="ofi-bom-supplierlist">
                            {included.map((line) => {
                                const state = wizard.lines[line.lineId]!;
                                const options = optionsOf(line, state);
                                const count = state.suppliers.length;
                                return (
                                    <div key={line.lineId} className={`ofi-bom-supplierrow${count ? '' : ' is-missing'}`}>
                                        <span className="ofi-bom-supplierrow__line">
                                            <span className="ofi-bom-code">{line.erpCode}</span>
                                            <b>{line.name}</b>
                                            <small>{fmtQty(parseQty(state.quantityText))} {unitLabel(line.unit)}</small>
                                            {line.modelNumber && <small className="is-mono">{line.modelNumber}</small>}
                                        </span>
                                        <span className="ofi-bom-supplierrow__choices" role="group" aria-label={t('productionBom.columns.supplier')}>
                                            {options.map((option) => {
                                                const on = state.suppliers.some((entry) => supplierGroupKey(entry) === supplierGroupKey(option));
                                                return (
                                                    <button
                                                        key={supplierGroupKey(option)}
                                                        type="button"
                                                        role="checkbox"
                                                        aria-checked={on}
                                                        className={`ofi-bom-choice ofi-nosize${on ? ' is-on' : ''}`}
                                                        onClick={() => toggleSupplier(line.lineId, option)}
                                                    >
                                                        {on && <Check aria-hidden />}
                                                        {option.name}
                                                    </button>
                                                );
                                            })}
                                            <button type="button" className="ofi-bom-choice is-add ofi-nosize" onClick={() => { setSupplierFor(line.lineId); setSupplierDraft(null); }}>
                                                <Plus aria-hidden />
                                                {t('productionBom.wizard.addSupplier')}
                                            </button>
                                            {count > 1 && <span className="ofi-bom-cellhint">{t('productionBom.request.perSupplier', { count })}</span>}
                                            {!count && <span className="ofi-bom-cellerr">{t('productionBom.request.supplierMissing')}</span>}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="ofi-bom-hint">{t('productionBom.request.supplierNotSaved')}</p>
                    </>
                )}

                {step === 3 && (
                    <>
                        <Note>{t('productionBom.request.previewHint')}</Note>
                        <div className="ofi-bom-previewgrid">
                            {groups.map((group, index) => {
                                const predicted = predictedNumber(wizard.proposal.nextRequestNumber, index);
                                return (
                                    <section key={supplierGroupKey(group.supplier)} className="ofi-bom-ordercard is-request">
                                        <header>
                                            <b>{group.supplier.name}</b>
                                            <span className="ofi-bom-ordercard__no">
                                                {predicted ? <PurchaseCode value={predicted} /> : '—'}
                                                <small>{t('productionBom.wizard.predicted')}</small>
                                            </span>
                                        </header>
                                        <ul>
                                            {group.lines.map((line) => {
                                                const state = wizard.lines[line.lineId]!;
                                                return (
                                                    <li key={line.lineId}>
                                                        <span className="ofi-bom-ordercard__name">{line.name}</span>
                                                        <span className="ofi-bom-ordercard__model">{line.modelNumber ?? ''}</span>
                                                        <span className="ofi-bom-qty">{fmtQty(parseQty(state.quantityText))}<small>{unitLabel(line.unit)}</small></span>
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <footer>{t('productionBom.wizard.linesCount', { count: group.lines.length })}</footer>
                                    </section>
                                );
                            })}
                        </div>
                    </>
                )}

                {step === 4 && wizard.result && (
                    <>
                        <Note>{t('productionBom.request.resultHint')}</Note>
                        <div className="ofi-bom-links">
                            {wizard.result.created.map((entry) => (
                                <div key={entry.purchaseOrderId} className="ofi-bom-resultrow">
                                    <span className="ofi-bom-resultrow__icon"><Check /></span>
                                    <span className="ofi-bom-resultrow__text">
                                        <b><PurchaseCode value={entry.referenceNumber} /></b>
                                        <small>{entry.supplierName} · {t('productionBom.wizard.linesCount', { count: entry.lineCount })}</small>
                                    </span>
                                    <button type="button" className="ofi-bom-btn is-small ofi-nosize" onClick={() => context.open({ kind: 'purchase', bomId: bom.id, purchaseOrderId: entry.purchaseOrderId })}>
                                        {t('productionBom.request.details')}
                                        <ChevronRight />
                                    </button>
                                    <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={() => context.openOrder(entry.purchaseOrderId)}>
                                        <ExternalLink />
                                        {t('productionBom.purchase.openRequest')}
                                    </button>
                                </div>
                            ))}
                            {wizard.result.failed.map((entry) => (
                                <div key={entry.supplierName} className="ofi-bom-resultrow is-failed">
                                    <span className="ofi-bom-resultrow__icon"><TriangleAlert /></span>
                                    <span className="ofi-bom-resultrow__text">
                                        <b>{t('productionBom.request.failed', { supplier: entry.supplierName })}</b>
                                    </span>
                                </div>
                            ))}
                        </div>
                    </>
                )}
            </div>

            <PopupDialog
                open={supplierFor !== null}
                onClose={() => setSupplierFor(null)}
                title={t('productionBom.wizard.addSupplierTitle')}
                subtitle={supplierLine ? supplierLine.name : undefined}
                icon={<UserPlus size={18} />}
                width={440}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setSupplierFor(null)}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton variant="primary" disabled={!supplierDraft} onClick={addSupplier}>{t('productionBom.common.add')}</PopupButton>
                    </PopupActions>
                )}
            >
                <div className="ofi-wh-pop ofi-bom-pop ofi-bom-supplierpop">
                    <SupplierSelect
                        value={supplierDraft}
                        onChange={setSupplierDraft}
                        taken={supplierLine && supplierState ? optionsOf(supplierLine, supplierState) : []}
                    />
                </div>
            </PopupDialog>
        </>
    );
};
