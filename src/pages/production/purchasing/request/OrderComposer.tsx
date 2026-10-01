import { useMemo, useState } from 'react';
import { Building2, ShoppingCart, X } from 'lucide-react';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { SupplierPickerModal } from '@/pages/inventory/components/SupplierPickerModal';
import type { BomProposalLine } from '@/types/productionBom';
import type { ProcurementDetail } from '@/types/purchasing';

import { fmtQty, unitLabel } from '../../bom/bomFormat';
import { parseAmount } from '../purchasingSend';

const P = 'productionBom.purchasing.composer';
const EPS = 1e-9;

interface LineState { include: boolean; qty: string; note: string; automaticNote: boolean }
interface Supplier { id: string | null; name: string }

/** Der Lieferant, den die meisten Zeilen auf ihrer Karte zuerst nennen — vorgewählt. */
const commonSupplier = (lines: BomProposalLine[]): Supplier | null => {
    const counts = new Map<string, { supplier: Supplier; count: number }>();
    for (const line of lines) {
        const first = line.suppliers[0];
        if (!first || line.block) continue;
        const key = first.id ? `id:${first.id}` : `name:${first.name.trim().toLocaleLowerCase('tr-TR')}`;
        const entry = counts.get(key) ?? { supplier: { id: first.id, name: first.name }, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
    }
    return [...counts.values()].sort((a, b) => b.count - a.count)[0]?.supplier ?? null;
};

/**
 * ── «SİPARİŞ OLUŞTUR» — EIN LIEFERANT, EINE BESTELLUNG (29.09.2026) ─────────
 *
 * Samet: «Siparişe git şeklinde bir şey olacak, öncesinde de sipariş oluştur,
 * ama sadece tek bir tedarikçi seçilebilecek ve sonra aynı şekilde tek bir
 * sipariş olacak.» Die Tabelle sagt, was fehlt und wie viel bestellt wird
 * (mehr als nötig braucht ein Wort der Begründung); den Lieferanten wählt EIN
 * Feld darüber — dasselbe Lieferantenfenster wie im Stok. Der Knopf legt EINE
 * Bestellung an (hat der Lieferant in dieser BOM schon einen unversandten
 * Entwurf, kommen die Zeilen dort hinein).
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
            note: qty > line.floor + EPS ? t('productionBom.procurement.fromRequestNote') : '',
            automaticNote: qty > line.floor + EPS,
        }];
    })));
    const [supplier, setSupplier] = useState<Supplier | null>(() => commonSupplier(lines));
    const [picking, setPicking] = useState(false);
    const [busy, setBusy] = useState(false);

    if (!usable) return null;

    const patch = (lineId: string, change: Partial<LineState>) =>
        setState((current) => ({ ...current, [lineId]: { ...current[lineId]!, ...change } }));
    const chosen = lines.filter((line) => !line.block && state[line.lineId]?.include);
    const problemOf = (line: BomProposalLine): 'QTY' | 'NOTE' | null => {
        const entry = state[line.lineId]!;
        const qty = parseAmount(entry.qty);
        if (qty === null || qty + EPS < line.floor) return 'QTY';
        return qty > line.floor + EPS && !entry.note.trim() ? 'NOTE' : null;
    };
    const ready = Boolean(supplier) && chosen.length > 0 && chosen.every((line) => !problemOf(line));

    const create = async () => {
        if (!ready || !supplier || busy) return;
        setBusy(true);
        try {
            const result = await productionBomApi.createOrders(bom.id, chosen.map((line) => {
                const entry = state[line.lineId]!;
                return { lineId: line.lineId, quantity: parseAmount(entry.qty)!, supplierId: supplier.id, supplierName: supplier.name, note: entry.note.trim() || null };
            }), request.id);
            result.failed.forEach((entry) => toast.error(t('productionBom.wizard.failed', { supplier: entry.supplierName })));
            const made = result.created[0];
            if (made) toast.success(t(made.merged ? `${P}.merged` : `${P}.createdOne`, { supplier: made.supplierName }));
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
                <>
                    <div className="ofi-buy-supplierbar">
                        <span className="ofi-buy-supplierbar__label">{t(`${P}.supplier`)}</span>
                        {supplier ? (
                            <span className="ofi-buy-supplierchip">
                                <Building2 aria-hidden />
                                <b>{supplier.name}</b>
                                <button type="button" className="ofi-nosize" aria-label={t('productionBom.common.remove')} disabled={busy} onClick={() => setSupplier(null)}>
                                    <X aria-hidden />
                                </button>
                            </span>
                        ) : <span className="ofi-buy-supplierbar__empty">{t(`${P}.noSupplier`)}</span>}
                        <button type="button" className="ofi-buy-btn ofi-nosize" disabled={busy} onClick={() => setPicking(true)}>
                            {t(supplier ? `${P}.changeSupplier` : `${P}.pickSupplier`)}
                        </button>
                        <small className="ofi-buy-supplierbar__hint">{t(`${P}.oneSupplier`)}</small>
                    </div>
                    <div className="ofi-buy-scroll"><table className="ofi-buy-lines" data-unstyled-table>
                        <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 110 }} /><col style={{ width: 190 }} /></colgroup>
                        <thead>
                            <tr>
                                <th aria-label={t(`${P}.include`)} />
                                <th>{t(`${P}.product`)}</th>
                                <th className="is-num">{t(`${P}.missing`)}</th>
                                <th className="is-num">{t(`${P}.quantity`)}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lines.map((line) => {
                                const entry = state[line.lineId]!;
                                const problem = entry.include && !line.block ? problemOf(line) : null;
                                return (
                                    <tr key={line.lineId} className={line.block ? 'is-blocked' : entry.include ? undefined : 'is-off'}>
                                        <td className="is-check">
                                            <input
                                                type="checkbox"
                                                className="ofi-buy-check"
                                                checked={entry.include && !line.block}
                                                disabled={Boolean(line.block) || busy}
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
                                                        disabled={!entry.include || busy}
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
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table></div>
                    <footer className="ofi-buy-boxfoot">
                        <span className="ofi-buy-note">
                            {supplier
                                ? t(`${P}.summary`, { count: chosen.length, supplier: supplier.name })
                                : t(`${P}.pickFirst`)}
                        </span>
                        <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!ready || busy} onClick={() => void create()}>
                            {busy ? <span className="ofi-buy-spinner" /> : <ShoppingCart aria-hidden />}
                            {t(`${P}.createOne`)}
                        </button>
                    </footer>
                </>
            )}

            {picking && (
                <SupplierPickerModal
                    open
                    onClose={() => setPicking(false)}
                    onPick={(picked) => setSupplier({ id: picked.id, name: picked.companyName })}
                    onPickName={(name) => setSupplier({ id: null, name })}
                />
            )}
        </section>
    );
};
