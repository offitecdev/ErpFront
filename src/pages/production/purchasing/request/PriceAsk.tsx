import { useEffect, useMemo, useState } from 'react';
import { Check, Plus, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import { purchasingApi } from '@/lib/api/purchasing';
import type { SupplierValue } from '@/pages/warehouse/components/SupplierSelect';
import { warehouseApi } from '@/lib/api/warehouse';
import { readQuery } from '@/lib/api/queryCache';
import type { BomRequestProposalLine } from '@/types/productionBom';
import type { ProcurementDetail } from '@/types/purchasing';

import { fmtQty, shownPurchaseCode, unitLabel } from '../../bom/bomFormat';
import { mailPriceRequest } from '../purchasingSend';
import { MailTemplatePicker } from '@/pages/inventory/workspace/MailTemplatePicker';
import '@/styles/priceAskSuppliers.css';

const P = 'productionBom.purchasing.ask';

const keyOf = (supplier: { id: string | null; name: string }): string =>
    (supplier.id ? `id:${supplier.id}` : `name:${supplier.name.trim().toLocaleLowerCase('tr-TR')}`);
const fold = (name: string) => name.trim().toLocaleLowerCase('tr-TR');
const sameSupplier = (left: SupplierValue, right: SupplierValue) => left.id && right.id ? left.id === right.id : fold(left.name) === fold(right.name);
const uniqueSuppliers = (items: SupplierValue[]) => items.reduce<SupplierValue[]>((result, supplier) => {
    if (!result.some((other) => sameSupplier(other, supplier))) result.push(supplier);
    return result;
}, []);

/**
 * ── «FİYAT İSTE» (28.09.2026) ──────────────────────────────────────────────
 * Ein Raster statt vier Schritten: Zeilen × Lieferanten, vorab gehakt, wer das
 * Produkt auf der Karte führt. Ein Knopf legt je Lieferant eine Anfrage an
 * (Name, Modell, Menge) und schickt jedem sein PDF.
 */
export const PriceAsk = ({ detail, lines, onDone, onCancel }: { detail: ProcurementDetail; lines: BomRequestProposalLine[]; onDone: () => void; onCancel: (() => void) | null }) => {
    const { request, bom } = detail;
    const [extra, setExtra] = useState<SupplierValue[]>([]);
    const [checked, setChecked] = useState<Set<string>>(() => new Set(uniqueSuppliers(lines.flatMap((line) => line.suppliers))
        .flatMap((supplier) => lines
            .filter((line) => line.suppliers.some((entry) => sameSupplier(entry, supplier))
                && !line.requests.some((ask) => fold(ask.supplierName) === fold(supplier.name)))
            .map((line) => `${line.lineId}|${keyOf(supplier)}`))));
    const [busy, setBusy] = useState<string | null>(null);
    const [supplierPickerOpen, setSupplierPickerOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [directory, setDirectory] = useState<SupplierValue[]>([]);
    const [searchError, setSearchError] = useState(false);
    const [searching, setSearching] = useState(false);
    const [searchRevision, setSearchRevision] = useState(0);
    const [message, setMessage] = useState<string | null>(null);
    const quantities = useMemo(() => new Map(request.lines.map((line) => [line.bomLineId, line.quantity])), [request.lines]);
    useEffect(() => {
        if (!supplierPickerOpen) return;
        let unsubscribe: (() => void) | undefined;
        let alive = true;
        setSearching(true);
        setSearchError(false);
        const timer = window.setTimeout(() => {
            unsubscribe = readQuery(`warehouse:suppliers:${query.trim()}`, () => warehouseApi.suppliers(query.trim()),
                { freshMs: 30_000, tags: ['warehouse', 'catalog'] },
                (items) => { if (alive) { setDirectory(items); setSearching(false); } },
                () => { if (alive) { setSearchError(true); setSearching(false); } });
        }, query.trim() ? 160 : 0);
        return () => { alive = false; unsubscribe?.(); window.clearTimeout(timer); };
    }, [query, searchRevision, supplierPickerOpen]);

    const suppliers = useMemo(() => uniqueSuppliers([...lines.flatMap((line) => line.suppliers), ...extra]), [lines, extra]);


    const asked = (line: BomRequestProposalLine, supplier: SupplierValue) =>
        line.requests.find((ask) => fold(ask.supplierName) === fold(supplier.name)) ?? null;
    const toggle = (cell: string) => setChecked((current) => {
        const next = new Set(current);
        if (next.has(cell)) next.delete(cell);
        else next.add(cell);
        return next;
    });
    const eligibleLines = (supplier: SupplierValue) => lines.filter((line) => !asked(line, supplier));
    const picked = suppliers.filter((supplier) => eligibleLines(supplier).some((line) => checked.has(`${line.lineId}|${keyOf(supplier)}`)));
    const shownSuppliers = uniqueSuppliers([...suppliers, ...directory])
        .filter((supplier) => !query.trim() || fold(supplier.name).includes(fold(query)));
    const supplierSelected = (supplier: SupplierValue) => {
        const eligible = eligibleLines(supplier);
        const selected = eligible.filter((line) => checked.has(`${line.lineId}|${keyOf(supplier)}`)).length;
        return { all: eligible.length > 0 && selected === eligible.length, partial: selected > 0 && selected < eligible.length, eligible: eligible.length };
    };
    const chooseSuppliers = (values: SupplierValue[], selected: boolean) => {
        if (busy) return;
        if (selected) setExtra((current) => uniqueSuppliers([...current, ...values]));
        setChecked((current) => {
            const next = new Set(current);
            for (const supplier of values) {
                for (const line of eligibleLines(supplier)) {
                    const cell = `${line.lineId}|${keyOf(supplier)}`;
                    if (selected) next.add(cell);
                    else next.delete(cell);
                }
            }
            return next;
        });
    };
    const canAddName = Boolean(query.trim()) && ![...suppliers, ...directory].some((supplier) => fold(supplier.name) === fold(query));

    const send = async () => {
        const input = lines.flatMap((line) => {
            const chosen = suppliers.filter((supplier) => !asked(line, supplier) && checked.has(`${line.lineId}|${keyOf(supplier)}`));
            return chosen.length
                ? [{ lineId: line.lineId, quantity: quantities.get(line.lineId) ?? line.quantity, suppliers: chosen.map((supplier) => ({ supplierId: supplier.id, supplierName: supplier.name })) }]
                : [];
        });
        if (!input.length || busy) return;
        setBusy(t(`${P}.creating`));
        try {
            const result = await productionBomApi.createRequests(bom.id, input, request.id);
            result.failed.forEach((entry) => toast.error(t('productionBom.wizard.failed', { supplier: entry.supplierName })));
            // Jedem Lieferanten sein PDF — eine gescheiterte Mail hält die übrigen nicht auf.
            const sent: string[] = [];
            let preview = false;
            for (const [index, entry] of result.created.entries()) {
                setBusy(t(`${P}.sending`, { done: index + 1, total: result.created.length }));
                try {
                    const mail = await mailPriceRequest(entry.purchaseOrderId, { message: message ?? undefined });
                    if (mail.preview) preview = true;
                    else sent.push(entry.purchaseOrderId);
                } catch {
                    toast.error(t(`${P}.mailFailed`, { code: shownPurchaseCode(entry.referenceNumber), supplier: entry.supplierName }));
                }
            }
            if (sent.length) await purchasingApi.report(request.id, { action: 'PRICE_REQUESTS_SENT', purchaseOrderIds: sent }).catch(() => undefined);
            if (preview) toast.warning(t('inv.orders.mail.previewToast'));
            if (sent.length) toast.success(t(`${P}.sent`, { count: sent.length }));
            onDone();
        } catch (failure) {
            toast.error(productionBomErrorText(failure));
        } finally {
            setBusy(null);
        }
    };

    return (
        <section className="ofi-buy-box ofi-buy-price-ask">
            <header className="ofi-buy-boxhead">
                <h3>{t(`${P}.title`)}</h3>
                <span className="ofi-buy-boxhead__meta">{t(`${P}.hint`)}</span>
                <button type="button" className="ofi-buy-btn ofi-nosize" disabled={Boolean(busy)} onClick={() => setSupplierPickerOpen(true)}><Users aria-hidden />{t('productionBom.request.step2')}{picked.length > 0 && <span>{picked.length}</span>}</button>
            </header>
            <PopupDialog
                open={supplierPickerOpen}
                title={t('productionBom.request.step2')}
                subtitle={t(`${P}.supplierBatchHint`)}
                icon={<Users size={18} />}
                width={760}
                onClose={() => setSupplierPickerOpen(false)}
                footer={<PopupActions start={<span className="ofi-buy-note">{t('productionBom.request.perSupplier', { count: picked.length })}</span>}><PopupButton variant="primary" onClick={() => setSupplierPickerOpen(false)}>{t('productionBom.common.continue')}</PopupButton></PopupActions>}
            >
            <div className="ofi-buy ofi-buy-suppliers ofi-buy-supplier-picker" aria-label={t('productionBom.request.step2')}>
                <div className="ofi-buy-suppliers__toolbar">
                    <label className="ofi-buy-search">
                        <Search aria-hidden />
                        <input autoFocus value={query} disabled={Boolean(busy)} placeholder={t('productionBom.wizard.supplierSearch')} aria-label={t('productionBom.wizard.supplierSearch')} onChange={(event) => setQuery(event.target.value)} />
                        {query && <button type="button" className="ofi-float-card__iconbtn ofi-nosize" aria-label={t('productionBom.common.clear')} disabled={Boolean(busy)} onClick={() => setQuery('')}><X size={13} /></button>}
                    </label>
                    <PopupButton disabled={Boolean(busy) || !shownSuppliers.some((supplier) => supplierSelected(supplier).eligible > 0)} onClick={() => chooseSuppliers(shownSuppliers, true)}>{t(`${P}.selectShown`)}</PopupButton>
                    {picked.length > 0 && <PopupButton disabled={Boolean(busy)} onClick={() => setChecked(new Set())}>{t(`${P}.clearSuppliers`)}</PopupButton>}
                </div>
                <div className="ofi-buy-suppliers__list">
                    {shownSuppliers.map((supplier) => {
                        const state = supplierSelected(supplier);
                        return <label key={keyOf(supplier)} className="ofi-buy-suppliers__option">
                            <input type="checkbox" className="ofi-buy-check" checked={state.all} ref={(input) => { if (input) input.indeterminate = state.partial; }} disabled={Boolean(busy) || !state.eligible} onChange={() => chooseSuppliers([supplier], !state.all)} />
                            <span>{supplier.name}</span>
                            {!state.eligible && <Check size={13} aria-hidden />}
                        </label>;
                    })}
                    {canAddName && <PopupButton disabled={Boolean(busy) || searching || searchError} onClick={() => { chooseSuppliers([{ id: null, name: query.trim() }], true); setQuery(''); }}><Plus aria-hidden />{t('warehouse.supplier.use', { name: query.trim() })}</PopupButton>}
                </div>
                {searching && <span className="ofi-buy-note" role="status">{t('productionBom.search.searching')}</span>}
                {searchError && <span className="ofi-buy-note" role="status">{t(`${P}.supplierSearchFailed`)} <PopupButton onClick={() => setSearchRevision((value) => value + 1)}>{t('common.retry')}</PopupButton></span>}
            </div>
            </PopupDialog>
            {picked.length > 0 && <>
            <div className="ofi-buy-scroll">
                <table className="ofi-buy-matrix" data-unstyled-table>
                    <thead>
                        <tr>
                            <th>{t('productionBom.purchasing.composer.product')}</th>
                            <th className="is-num">{t('productionBom.purchasing.composer.quantity')}</th>
                            {picked.map((supplier) => <th key={keyOf(supplier)} className="is-supplier"><b>{supplier.name}</b></th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {lines.map((line) => (
                            <tr key={line.lineId}>
                                <td>
                                    <span className="ofi-buy-l1">{line.name}</span>
                                    <span className="ofi-buy-l2">{[line.brand, line.modelNumber].filter(Boolean).join(' · ') || line.erpCode}</span>
                                </td>
                                <td className="is-num">{fmtQty(quantities.get(line.lineId) ?? line.quantity)} <small>{unitLabel(line.unit)}</small></td>
                                {picked.map((supplier) => {
                                    const cell = `${line.lineId}|${keyOf(supplier)}`;
                                    const earlier = asked(line, supplier);
                                    return (
                                        <td key={cell} className="is-cell">
                                            {earlier ? (
                                                <span className="ofi-buy-asked"><Check aria-hidden />{shownPurchaseCode(earlier.referenceNumber)}</span>
                                            ) : (
                                                <input
                                                    type="checkbox"
                                                    className="ofi-buy-check"
                                                    checked={checked.has(cell)}
                                                    disabled={Boolean(busy)}
                                                    aria-label={`${line.name} · ${supplier.name}`}
                                                    onChange={() => toggle(cell)}
                                                />
                                            )}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="ofi-buy-mail-options">
                <MailTemplatePicker disabled={Boolean(busy)} onApply={setMessage} />
                <label className="ofi-buy-field">
                    <span>{t('inv.orders.mail.message')}</span>
                    <textarea className="ofi-buy-message" rows={4} value={message ?? t('inv.orders.mail.defaultMessagePriceRequest')} disabled={Boolean(busy)} onChange={(event) => setMessage(event.target.value)} />
                </label>
            </div>
            <footer className="ofi-buy-boxfoot">
                <span className="ofi-buy-note">{busy ?? t(`${P}.foot`)}</span>
                {onCancel && <button type="button" className="ofi-buy-btn ofi-nosize" disabled={Boolean(busy)} onClick={onCancel}>{t('productionBom.common.cancel')}</button>}
                <button type="button" className="ofi-buy-btn is-primary ofi-nosize" disabled={!picked.length || Boolean(busy)} onClick={() => void send()}>
                    {busy ? <span className="ofi-buy-spinner" /> : <Send aria-hidden />}
                    {t(`${P}.send`, { count: picked.length })}
                </button>
            </footer>
            </>}
        </section>
    );
};
