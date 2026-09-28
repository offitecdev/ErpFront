import { useMemo, useState } from 'react';
import { Check, ShoppingCart, UserPlus } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { SupplierSelect, type SupplierValue } from '@/pages/warehouse/components/SupplierSelect';
import type { BomProposalLine } from '@/types/productionBom';
import type { ProcurementDetail } from '@/types/purchasing';

import { fmtQty, unitLabel } from '../../bom/bomFormat';
import { parseAmount } from '../purchasingSend';
import { WorkspaceSection } from '@/components/ui-shared/WorkspaceSection';

const P = 'productionBom.purchasing.composer';
const NEW = '__new';
const EPS = 1e-9;

interface LineState { include: boolean; qty: string; supplier: string; note: string; automaticNote: boolean; extra: SupplierValue[] }

const keyOf = (supplier: SupplierValue): string =>
    (supplier.id ? `id:${supplier.id}` : `name:${supplier.name.trim().toLocaleLowerCase('tr-TR')}`);

const optionsOf = (line: BomProposalLine, state: LineState | undefined): SupplierValue[] =>
    [...new Map([...line.suppliers, ...(state?.extra ?? [])].map((entry) => [keyOf(entry), entry] as const)).values()];

/**
 * ── «SİPARİŞ OLUŞTUR» OHNE ASSISTENT (28.09.2026) ──────────────────────────
 * Eine Tabelle statt vier Schritten: was fehlt, wie viel, bei wem. Menge und
 * Lieferant kommen vorbelegt (fehlende Menge / Mindestmenge, der erste
 * Lieferant der Karte); mehr als nötig braucht ein Wort der Begründung. Ein
 * Knopf legt je Lieferant eine Bestellung an.
 */
export const OrderComposer = ({ detail, lines, onCreated }: { detail: ProcurementDetail; lines: BomProposalLine[]; onCreated: () => void }) => {
    const { request, bom } = detail;
    const open = request.status === 'OPEN' || request.status === 'IN_PROGRESS';
    const wanted = useMemo(() => new Map(request.lines.filter((line) => !line.covered).map((line) => [line.bomLineId, line.quantity])), [request.lines]);
    const usable = detail.canProcure && open && wanted.size > 0 && bom.status === 'APPROVED' && !bom.consumedAt;
    const [state, setState] = useState<Record<string, LineState>>(() => Object.fromEntries(lines.map((line) => {
        const qty = Math.max(wanted.get(line.lineId) ?? 0, line.floor);
        return [line.lineId, {
            include: !line.block,
            qty: String(qty),
            supplier: line.suppliers[0] ? keyOf(line.suppliers[0]) : '',
            note: qty > line.floor + EPS ? t('productionBom.procurement.fromRequestNote') : '',
            automaticNote: qty > line.floor + EPS,
            extra: [],
        }];
    })));
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState<{ lineId: string; value: SupplierValue | null } | null>(null);



    if (!usable) return null;

    const patch = (lineId: string, change: Partial<LineState>) =>
        setState((current) => ({ ...current, [lineId]: { ...current[lineId]!, ...change } }));
    const chosen = lines.filter((line) => !line.block && state[line.lineId]?.include);
    const problemOf = (line: BomProposalLine): 'QTY' | 'NOTE' | 'SUPPLIER' | null => {
        const entry = state[line.lineId]!;
        const qty = parseAmount(entry.qty);
        if (qty === null || qty + EPS < line.floor) return 'QTY';
        if (qty > line.floor + EPS && !entry.note.trim()) return 'NOTE';
        return optionsOf(line, entry).some((option) => keyOf(option) === entry.supplier) ? null : 'SUPPLIER';
    };
    const ready = chosen.length > 0 && chosen.every((line) => !problemOf(line));
    const groups = new Map<string, { name: string; count: number }>();
    for (const line of chosen) {
        const supplier = optionsOf(line, state[line.lineId]).find((option) => keyOf(option) === state[line.lineId]!.supplier);
        if (!supplier) continue;
        const group = groups.get(keyOf(supplier)) ?? { name: supplier.name, count: 0 };
        group.count += 1;
        groups.set(keyOf(supplier), group);
    }

    const create = async () => {
        if (!ready || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.createOrders(bom.id, chosen.map((line) => {
                const entry = state[line.lineId]!;
                const supplier = optionsOf(line, entry).find((option) => keyOf(option) === entry.supplier)!;
                return { lineId: line.lineId, quantity: parseAmount(entry.qty)!, supplierId: supplier.id, supplierName: supplier.name, note: entry.note.trim() || null };
            }), request.id);
            result.failed.forEach((entry) => toast.error(t('productionBom.wizard.failed', { supplier: entry.supplierName })));
            if (result.created.length) toast.success(t(`${P}.created`, { count: result.created.length }));
            onCreated();
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="ofi-buy-box">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.title`)}</h3>
                <span className="ofi-buy-count">{lines.length}</span>
                <span className="ofi-buy-boxhead__meta">{t(`${P}.hint`)}</span>
            </header>
            {!lines.length ? <p className="ofi-buy-note">{t(`${P}.nothing`)}</p> : (
                <div className="ofi-buy-scroll"><table className="ofi-buy-lines" data-unstyled-table>
                    <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 96 }} /><col style={{ width: 150 }} /><col style={{ width: 230 }} /></colgroup>
                    <thead>
                        <tr>
                            <th aria-label={t(`${P}.include`)} />
                            <th>{t(`${P}.product`)}</th>
                            <th className="is-num">{t(`${P}.missing`)}</th>
                            <th className="is-num">{t(`${P}.quantity`)}</th>
                            <th>{t(`${P}.supplier`)}</th>
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => {
                            const entry = state[line.lineId]!;
                            const problem = entry.include && !line.block ? problemOf(line) : null;
                            const options = optionsOf(line, entry);
                            return (
                                <tr key={line.lineId} className={line.block ? 'is-blocked' : entry.include ? undefined : 'is-off'}>
                                    <td className="is-check">
                                        <input
                                            type="checkbox"
                                            className="ofi-buy-check"
                                            checked={entry.include && !line.block}
                                            disabled={Boolean(line.block)}
                                            aria-label={t(`${P}.include`)}
                                            onChange={(event) => patch(line.lineId, { include: event.target.checked })}
                                        />
                                    </td>
                                    <td>
                                        <span className="ofi-buy-l1">{line.name}</span>
                                        <span className={`ofi-buy-l2${line.block ? ' is-warn' : ''}`}>
                                            {line.block
                                                ? t(`productionBom.wizard.blocked.${line.block}`)
                                                : [line.erpCode, line.brand, line.modelNumber].filter(Boolean).join(' · ')}
                                        </span>
                                    </td>
                                    <td className="is-num">{fmtQty(line.missing)} <small>{unitLabel(line.unit)}</small></td>
                                    <td className="is-num">
                                        {line.block ? '—' : (
                                            <span className="ofi-buy-qty">
                                                <input
                                                    value={entry.qty}
                                                    inputMode="decimal"
                                                    disabled={!entry.include}
                                                    className={`ofi-buy-input is-num${problem === 'QTY' ? ' is-invalid' : ''}`}
                                                    aria-label={t(`${P}.quantity`)}
                                                    onFocus={(event) => event.currentTarget.select()}
                                                    onChange={(event) => patch(line.lineId, {
                                                        qty: event.target.value,
                                                        ...(entry.automaticNote ? { note: '', automaticNote: false } : {}),
                                                    })}
                                                />
                                                <small>{unitLabel(line.unit)}</small>
                                            </span>
                                        )}
                                        {problem === 'QTY' && <small className="ofi-buy-cellhint is-error">{t(`${P}.floor`, { value: fmtQty(line.floor) })}</small>}
                                        {!problem && line.minimum && line.minimum > line.missing + EPS && (
                                            <small className="ofi-buy-cellhint">{t(`${P}.minimum`, { value: fmtQty(line.minimum) })}</small>
                                        )}
                                        {(problem === 'NOTE' || (entry.note && !entry.automaticNote && (parseAmount(entry.qty) ?? 0) > line.floor + EPS)) && (
                                            <input
                                                value={entry.note}
                                                className={`ofi-buy-input is-note${problem === 'NOTE' ? ' is-invalid' : ''}`}
                                                placeholder={t(`${P}.notePlaceholder`)}
                                                aria-label={t(`${P}.noteLabel`)}
                                                maxLength={255}
                                                onChange={(event) => patch(line.lineId, { note: event.target.value })}
                                            />
                                        )}
                                    </td>
                                    <td>
                                        {!line.block && (
                                            <select
                                                className={`ofi-buy-select${problem === 'SUPPLIER' ? ' is-invalid' : ''}`}
                                                value={entry.supplier}
                                                disabled={!entry.include}
                                                aria-label={t(`${P}.supplier`)}
                                                onChange={(event) => (event.target.value === NEW
                                                    ? setAdding({ lineId: line.lineId, value: null })
                                                    : patch(line.lineId, { supplier: event.target.value }))}
                                            >
                                                {!options.length && <option value="">{t(`${P}.pickSupplier`)}</option>}
                                                {options.map((option) => <option key={keyOf(option)} value={keyOf(option)}>{option.name}</option>)}
                                                <option value={NEW}>{t(`${P}.newSupplier`)}</option>
                                            </select>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table></div>
            )}
            <footer className="ofi-buy-boxfoot">
                <span className="ofi-buy-groups">
                    {[...groups.values()].map((group) => (
                        <span key={group.name}><Check aria-hidden />{group.name} <small>{group.count}</small></span>
                    ))}
                </span>
                <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!ready || busy} onClick={() => void create()}>
                    {busy ? <span className="ofi-buy-spinner" /> : <ShoppingCart aria-hidden />}
                    {t(`${P}.create`, { count: groups.size })}
                </button>
            </footer>

            <WorkspaceSection
                open={adding !== null}
                title={t('productionBom.wizard.addSupplierTitle')}
                subtitle={t('productionBom.wizard.supplierAddedHint')}
                icon={<UserPlus size={18} />}
                footer={(
                    <PopupActions>
                        <PopupButton onClick={() => setAdding(null)}>{t('productionBom.common.cancel')}</PopupButton>
                        <PopupButton
                            variant="primary"
                            disabled={!adding?.value}
                            onClick={() => {
                                if (!adding?.value) return;
                                const entry = state[adding.lineId]!;
                                patch(adding.lineId, { extra: [...entry.extra, adding.value], supplier: keyOf(adding.value) });
                                setAdding(null);
                            }}
                        >
                            {t('productionBom.common.add')}
                        </PopupButton>
                    </PopupActions>
                )}
            >
                <div className="ofi-buy-pop">
                    <SupplierSelect value={adding?.value ?? null} onChange={(value) => setAdding((current) => (current ? { ...current, value } : current))} />
                </div>
            </WorkspaceSection>
        </section>
    );
};
