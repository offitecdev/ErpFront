import { useEffect, useState } from 'react';
import { Check, ChevronRight, ExternalLink, Info, Plus, ShoppingCart, TriangleAlert, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { SupplierSelect, type SupplierValue } from '@/pages/warehouse/components/SupplierSelect';
import type { Bom } from '@/types/productionBom';

import { fmtQty, shownPurchaseCode, unitLabel } from '../bomFormat';
import { EmptyState, LoadingState, Note } from '../bomUi';
import { NavBar } from '../NavStack';
import {
    entryOf,
    parseQty,
    predictedNumber,
    supplierGroupKey,
    viewKey,
    restrictWizard,
    wizardFromProposal,
    wizardGroups,
    wizardInput,
    wizardLineProblem,
    type WizardLineState,
    type WizardState,
    type WizardStep,
} from './bomViews';
import type { BomViewContext } from './DeviceBomArea';

const STEPS: WizardStep[] = [1, 2, 3, 4];

const StepBar = ({ step }: { step: WizardStep }) => (
    <ol className="ofi-bom-steps" aria-label={t('productionBom.wizard.title')}>
        {STEPS.map((entry) => (
            <li key={entry} className={entry === step ? 'is-on' : entry < step ? 'is-done' : undefined} aria-current={entry === step ? 'step' : undefined}>
                <span className="ofi-bom-steps__num">{entry < step ? <Check /> : entry}</span>
                <span>{t(`productionBom.wizard.step${entry}`)}</span>
                {entry < 4 && <ChevronRight className="ofi-bom-steps__sep" aria-hidden />}
            </li>
        ))}
    </ol>
);

/** Die kleine Erklärung einer Mehrmenge — «i» neben der Menge («açıklamasız kabul edilmeyecek»). */
const NoteButton = ({ value, required, onChange }: { value: string; required: boolean; onChange: (next: string) => void }) => {
    // Über der Seite (Portal) — in der Tabelle hätte das Fenster sie schmaler gemacht.
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState(value);
    const missing = required && !value.trim();
    const close = () => setAnchor(null);
    return (
        <>
            <button
                type="button"
                className={`ofi-bom-iconbtn ofi-nosize${value.trim() ? ' is-on' : ''}${missing ? ' is-required' : ''}`}
                title={value.trim() || t('productionBom.wizard.noteRequired')}
                aria-label={t('productionBom.wizard.noteTitle')}
                aria-expanded={Boolean(anchor)}
                onClick={(event) => {
                    const target = event.currentTarget;
                    setDraft(value);
                    setAnchor((current) => (current ? null : target));
                }}
            >
                <Info />
            </button>
            <AnchoredPicker anchorEl={anchor} onClose={close} width={300} maxHeight={320} exactWidth ariaLabel={t('productionBom.wizard.noteTitle')}>
                <div className="ofi-bom-pop ofi-bom-notepanel">
                    <b>{t('productionBom.wizard.noteTitle')}</b>
                    <textarea
                        value={draft}
                        autoFocus
                        rows={3}
                        maxLength={255}
                        placeholder={t('productionBom.wizard.notePlaceholder')}
                        onChange={(event) => setDraft(event.target.value)}
                    />
                    <span className="ofi-bom-notepanel__actions">
                        <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={close}>{t('productionBom.common.cancel')}</button>
                        <button type="button" className="ofi-bom-btn is-small is-primary ofi-nosize" onClick={() => { onChange(draft); close(); }}>{t('productionBom.common.save')}</button>
                    </span>
                </div>
            </AnchoredPicker>
        </>
    );
};

/**
 * ── «SİPARİŞ OLUŞTUR» — VIER ANSICHTEN (27.09.2026, Vorgabe Samet) ──────────
 *
 * «Stokta olmayan kadarı sipariş edilecek, daha fazlası edilecekse açıklama
 *  yazacak — i butonu … min 100 ise 100 altı vermemelidir … tedarikçisini
 *  değiştirmek istiyorsak yeni tedarikçiyi küçük bir pop ile ekleyebilir,
 *  birden fazla ise aralarından seçebilir, yeni bir ön izleme listesiyle
 *  tedarikçilerine göre kategorize olmuş, farklı sipariş numaralı hallerini
 *  görüntüleyebilelim ve direkt onlarla sipariş açabilelim … kolay temiz bir
 *  ileri geri de gidilebilsin, Apple Mac tasarım.»
 *
 *   1 Fehlend      was fehlt, Menge ≥ max(fehlend, Mindestmenge), mehr nur mit «i»
 *   2 Lieferanten  je Zeile EIN Lieferant (eine Liste), neue über das kleine Fenster —
 *                  nur für diese eine Zeile, nie auch für die übrigen
 *   3 Vorschau     je Lieferant eine Bestellung mit ihrer (voraussichtlichen) Nummer —
 *                  oder sein Entwurf in dieser BOM, der die Zeilen aufnimmt («aynı
 *                  tedarikçiye ait ise zaten olan siparişe eklenir»)
 *   4 Ergebnis     die angelegten / ergänzten Bestellungen, gleich zu öffnen
 */
export const OrderWizardView = ({
    context,
    bom,
    step,
    wizard,
    onWizard,
}: {
    context: BomViewContext;
    bom: Bom;
    step: WizardStep;
    wizard: WizardState | null;
    onWizard: (next: WizardState | null) => void;
}) => {
    const { nav } = context;
    // Aus einem Talep der BOM (Satın alma): nur seine Zeilen, die Belege hängen an ihm.
    const requestLines = context.procurement?.lines ?? null;
    const [error, setError] = useState<string | null>(null);
    const [creating, setCreating] = useState(false);
    const [supplierFor, setSupplierFor] = useState<string | null>(null);
    const [supplierDraft, setSupplierDraft] = useState<SupplierValue | null>(null);

    // Der Vorschlag kommt frisch vom Server, sobald die erste Ansicht öffnet
    // (auch nach einem Durchgang, der schon Bestellungen angelegt hat).
    const needsProposal = step === 1 && (!wizard || Boolean(wizard.result));
    useEffect(() => {
        if (!needsProposal) return undefined;
        let alive = true;
        productionBomApi.proposal(bom.id)
            .then((proposal) => { if (alive) { onWizard(restrictWizard(wizardFromProposal(proposal), requestLines)); setError(null); } })
            .catch((failure) => { if (alive) setError(productionBomErrorText(failure)); });
        return () => { alive = false; };
    }, [bom.id, needsProposal, onWizard, requestLines]);

    const lines = wizard?.proposal.lines ?? [];
    const orderable = lines.filter((line) => !line.block);
    const included = orderable.filter((line) => wizard?.lines[line.lineId]?.include);

    const patch = (lineId: string, change: Partial<WizardLineState>) => {
        if (!wizard) return;
        onWizard({ ...wizard, lines: { ...wizard.lines, [lineId]: { ...wizard.lines[lineId]!, ...change } } });
    };

    const problems1 = included.filter((line) => wizardLineProblem(line.floor, wizard!.lines[line.lineId]!));
    const problems2 = included.filter((line) => !wizard!.lines[line.lineId]?.supplier);

    // Je Lieferant eine Bestellung — die Vorschau von Schritt 3 (wenige Zeilen, ohne Memo).
    // Hat der Lieferant in dieser BOM schon einen Entwurf, kommen seine Zeilen dort hinein.
    const groups = wizard ? wizardGroups(wizard, included) : [];
    const newGroups = groups.filter((group) => !group.target);
    const addCount = groups.length - newGroups.length;
    const createLabel = !addCount
        ? t('productionBom.wizard.createAll', { count: newGroups.length })
        : newGroups.length
            ? t('productionBom.wizard.createAndAdd')
            : t('productionBom.wizard.addAll', { count: addCount });

    const go = (next: WizardStep) => nav.push(entryOf({ kind: 'wizard', bomId: bom.id, step: next }));

    const create = async () => {
        if (!wizard || creating) return;
        setCreating(true);
        try {
            const result = await productionBomApi.createOrders(bom.id, wizardInput(wizard), context.procurement?.requestId ?? null);
            context.applyBom(result.bom);
            onWizard({ ...wizard, result: { created: result.created, failed: result.failed } });
            result.failed.forEach((entry) => toast.error(t('productionBom.wizard.failed', { supplier: entry.supplierName })));
            // Das Ergebnis steht direkt über der BOM: zurück führt zu ihr, nicht in einen alten Entwurf.
            nav.popTo(context.homeKey?.(bom.id) ?? viewKey({ kind: 'bom', bomId: bom.id }));
            nav.push(entryOf({ kind: 'wizard', bomId: bom.id, step: 4 }));
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setCreating(false);
        }
    };

    /* Der neue Lieferant gilt NUR für die Zeile, an deren «+» er kam — weder
       gewählt noch als Wahl bei den übrigen (Samet, 27.09.2026: «bir ürünün
       tedarikçisi eklendiğinde diğerlerine de aynı tedarikçi eklenmemesi
       gerekiyor, ayrı ayrı eklenebilmesi gerekiyor»). */
    const addSupplier = () => {
        if (!wizard || !supplierFor || !supplierDraft) return;
        const current = wizard.lines[supplierFor];
        if (!current) return;
        const exists = [...(lines.find((line) => line.lineId === supplierFor)?.suppliers ?? []), ...current.extraSuppliers]
            .some((entry) => supplierGroupKey(entry) === supplierGroupKey(supplierDraft));
        patch(supplierFor, {
            supplier: supplierDraft,
            extraSuppliers: exists ? current.extraSuppliers : [...current.extraSuppliers, supplierDraft],
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
            {creating ? <span className="ofi-bom-spinner is-small is-light" /> : <ShoppingCart />}
            {creating ? t('productionBom.wizard.creating') : createLabel}
        </button>
    ) : (
        <button type="button" className="ofi-bom-btn is-primary ofi-nosize" onClick={() => nav.replace(entryOf({ kind: 'purchases', bomId: bom.id }))}>
            {t('productionBom.wizard.goOrders')}
            <ChevronRight />
        </button>
    );

    const header = (
        <NavBar
            nav={nav}
            backTitle={context.backTitle}
            title={t(`productionBom.wizard.step${step}`)}
            subtitle={`${t('productionBom.wizard.title')} · ${bom.bomNumber}`}
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

    return (
        <>
            {header}
            <div className="ofi-bom-body">
                <StepBar step={step} />

                {step === 1 && (
                    <>
                        <Note>{t('productionBom.wizard.missingHint')}</Note>
                        {!lines.length ? (
                            <EmptyState icon={<Check />} title={t('productionBom.wizard.nothing')} hint={t('productionBom.wizard.allOrdered')} />
                        ) : (
                            <div className="ofi-bom-tablewrap">
                                <table className="ofi-bom-table" data-unstyled-table>
                                    <thead>
                                        <tr>
                                            <th className="is-check">
                                                <input
                                                    type="checkbox"
                                                    aria-label={t('productionBom.wizard.selectAll')}
                                                    checked={orderable.length > 0 && included.length === orderable.length}
                                                    onChange={(event) => onWizard({
                                                        ...wizard,
                                                        lines: Object.fromEntries(Object.entries(wizard.lines).map(([id, state]) => [id, {
                                                            ...state,
                                                            include: orderable.some((line) => line.lineId === id) ? event.target.checked : state.include,
                                                        }])),
                                                    })}
                                                />
                                            </th>
                                            <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                            <th className="is-name">{t('productionBom.columns.name')}</th>
                                            <th className="is-num">{t('productionBom.columns.need')}</th>
                                            <th className="is-num">{t('productionBom.columns.reserved')}</th>
                                            <th className="is-num">{t('productionBom.columns.incoming')}</th>
                                            <th className="is-num">{t('productionBom.columns.missing')}</th>
                                            <th className="is-num">{t('productionBom.columns.minimum')}</th>
                                            <th className="is-num is-accent">{t('productionBom.wizard.orderQty')}</th>
                                            <th className="is-tools" />
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {lines.map((line) => {
                                            const state = wizard.lines[line.lineId]!;
                                            const problem = state.include && !line.block ? wizardLineProblem(line.floor, state) : null;
                                            const qty = parseQty(state.quantityText);
                                            return (
                                                <tr key={line.lineId} className={line.block ? 'is-blocked' : !state.include ? 'is-off' : undefined}>
                                                    <td className="is-check">
                                                        <input
                                                            type="checkbox"
                                                            disabled={Boolean(line.block)}
                                                            checked={state.include && !line.block}
                                                            aria-label={t('productionBom.wizard.include')}
                                                            onChange={(event) => patch(line.lineId, { include: event.target.checked })}
                                                        />
                                                    </td>
                                                    <td className="is-code"><span className="ofi-bom-code">{line.erpCode ?? '—'}</span></td>
                                                    <td className="is-name">
                                                        <span className="ofi-bom-cellname">
                                                            <b>{line.name}{line.serialRequired && <i className="ofi-bom-sn">{t('productionBom.detail.serialTag')}</i>}</b>
                                                            {line.block
                                                                ? <small className="is-warn">{t(`productionBom.wizard.blocked.${line.block}`)}</small>
                                                                : <small>{[line.brand, line.modelNumber].filter(Boolean).join(' · ')}</small>}
                                                        </span>
                                                    </td>
                                                    <td className="is-num">{fmtQty(line.need)}</td>
                                                    <td className="is-num">{fmtQty(line.reserved)}</td>
                                                    <td className="is-num">{fmtQty(line.incoming)}</td>
                                                    <td className="is-num is-missing">{fmtQty(line.missing)}</td>
                                                    <td className="is-num">{line.minimum ? fmtQty(line.minimum) : '—'}</td>
                                                    <td className="is-num is-accent">
                                                        <span className="ofi-bom-qtyedit">
                                                            <input
                                                                value={state.quantityText}
                                                                inputMode="decimal"
                                                                disabled={!state.include || Boolean(line.block)}
                                                                className={problem === 'QTY' ? 'is-invalid' : undefined}
                                                                aria-label={t('productionBom.wizard.orderQty')}
                                                                onFocus={(event) => event.currentTarget.select()}
                                                                onChange={(event) => patch(line.lineId, { quantityText: event.target.value })}
                                                            />
                                                            <small>{unitLabel(line.unit)}</small>
                                                        </span>
                                                        {problem === 'QTY' && <small className="ofi-bom-cellerr">{t('productionBom.wizard.floor', { value: fmtQty(line.floor) })}</small>}
                                                        {!problem && line.minimum && line.minimum > line.missing && Number.isFinite(qty) && (
                                                            <small className="ofi-bom-cellhint">{t('productionBom.wizard.minimumApplied', { value: fmtQty(line.minimum) })}</small>
                                                        )}
                                                        {problem === 'NOTE' && <small className="ofi-bom-cellerr">{t('productionBom.wizard.needsNote')}</small>}
                                                    </td>
                                                    <td className="is-tools">
                                                        {!line.block && (
                                                            <NoteButton
                                                                value={state.note}
                                                                required={problem === 'NOTE'}
                                                                onChange={(note) => patch(line.lineId, { note })}
                                                            />
                                                        )}
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
                        <Note>{t('productionBom.wizard.supplierHint')}</Note>
                        <div className="ofi-bom-supplierlist">
                            {included.map((line) => {
                                const state = wizard.lines[line.lineId]!;
                                // Nur die Lieferanten DIESES Produkts: seine Karte + was an seinem «+» dazukam.
                                const options = [...new Map([...line.suppliers, ...state.extraSuppliers]
                                    .map((entry) => [supplierGroupKey(entry), entry] as const)).values()];
                                return (
                                    <div key={line.lineId} className={`ofi-bom-supplierrow${state.supplier ? '' : ' is-missing'}`}>
                                        <span className="ofi-bom-supplierrow__line">
                                            <span className="ofi-bom-code">{line.erpCode}</span>
                                            <b>{line.name}</b>
                                            <small>{fmtQty(parseQty(state.quantityText))} {unitLabel(line.unit)}</small>
                                        </span>
                                        <span className="ofi-bom-supplierrow__choices" role="radiogroup" aria-label={t('productionBom.columns.supplier')}>
                                            {options.map((option) => {
                                                const on = Boolean(state.supplier) && supplierGroupKey(state.supplier!) === supplierGroupKey(option);
                                                return (
                                                    <button
                                                        key={supplierGroupKey(option)}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={on}
                                                        className={`ofi-bom-choice ofi-nosize${on ? ' is-on' : ''}`}
                                                        onClick={() => patch(line.lineId, { supplier: option })}
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
                                            {!state.supplier && <span className="ofi-bom-cellerr">{t('productionBom.wizard.supplierMissing')}</span>}
                                        </span>
                                    </div>
                                );
                            })}
                        </div>
                        <p className="ofi-bom-hint">{t('productionBom.wizard.supplierAddedHint')}</p>
                    </>
                )}

                {step === 3 && (
                    <>
                        <Note>{t(addCount ? 'productionBom.wizard.previewHintMerge' : 'productionBom.wizard.previewHint')}</Note>
                        <div className="ofi-bom-previewgrid">
                            {groups.map((group) => {
                                // Nur neue Bestellungen zählen von der nächsten freien Nummer weiter.
                                const predicted = group.target ? null : predictedNumber(wizard.proposal.nextOrderNumber, newGroups.indexOf(group));
                                return (
                                    <section key={supplierGroupKey(group.supplier)} className="ofi-bom-ordercard">
                                        <header>
                                            <b>{group.supplier.name}</b>
                                            <span className="ofi-bom-ordercard__no">
                                                {group.target
                                                    ? <PurchaseCode value={group.target.referenceNumber} />
                                                    : predicted ? <PurchaseCode value={predicted} /> : '—'}
                                                <small>
                                                    {group.target ? t('productionBom.wizard.existingOrder') : t('productionBom.wizard.predicted')}
                                                </small>
                                            </span>
                                        </header>
                                        <ul>
                                            {group.lines.map((line) => {
                                                const state = wizard.lines[line.lineId]!;
                                                return (
                                                    <li key={line.lineId}>
                                                        <span className="ofi-bom-code">{line.erpCode}</span>
                                                        <span className="ofi-bom-ordercard__name">{line.name}</span>
                                                        <span className="ofi-bom-qty">{fmtQty(parseQty(state.quantityText))}<small>{unitLabel(line.unit)}</small></span>
                                                        {state.note.trim() && <Info className="ofi-bom-ordercard__note" aria-label={state.note} />}
                                                    </li>
                                                );
                                            })}
                                        </ul>
                                        <footer>
                                            {group.target
                                                ? t('productionBom.wizard.addLinesCount', { count: group.lines.length })
                                                : t('productionBom.wizard.linesCount', { count: group.lines.length })}
                                            {group.sent && ` · ${t('productionBom.wizard.sentOrderNote', { number: shownPurchaseCode(group.sent.referenceNumber) })}`}
                                        </footer>
                                    </section>
                                );
                            })}
                        </div>
                    </>
                )}

                {step === 4 && wizard.result && (
                    <>
                        <Note>{t('productionBom.wizard.resultHint')}</Note>
                        <div className="ofi-bom-links">
                            {wizard.result.created.map((entry) => (
                                <div key={entry.purchaseOrderId} className="ofi-bom-resultrow">
                                    <span className="ofi-bom-resultrow__icon"><Check /></span>
                                    <span className="ofi-bom-resultrow__text">
                                        <b><PurchaseCode value={entry.referenceNumber} /></b>
                                        <small>
                                            {entry.supplierName} · {entry.merged
                                                ? t('productionBom.wizard.linesAdded', { count: entry.lineCount })
                                                : t('productionBom.wizard.linesCount', { count: entry.lineCount })}
                                        </small>
                                    </span>
                                    <button type="button" className="ofi-bom-btn is-small ofi-nosize" onClick={() => context.open({ kind: 'purchase', bomId: bom.id, purchaseOrderId: entry.purchaseOrderId })}>
                                        {t('productionBom.purchase.quoteSection')}
                                        <ChevronRight />
                                    </button>
                                    <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={() => context.openOrder(entry.purchaseOrderId)}>
                                        <ExternalLink />
                                        {t('productionBom.wizard.openOrder')}
                                    </button>
                                </div>
                            ))}
                            {wizard.result.failed.map((entry) => (
                                <div key={entry.supplierName} className="ofi-bom-resultrow is-failed">
                                    <span className="ofi-bom-resultrow__icon"><TriangleAlert /></span>
                                    <span className="ofi-bom-resultrow__text">
                                        <b>{t('productionBom.wizard.failed', { supplier: entry.supplierName })}</b>
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
                subtitle={t('productionBom.wizard.supplierAddedHint')}
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
                    <SupplierSelect value={supplierDraft} onChange={setSupplierDraft} />
                </div>
            </PopupDialog>
        </>
    );
};
