import { useMemo, useState, type KeyboardEvent } from 'react';
import { PackageCheck, ScanLine, X } from 'lucide-react';
import { toast } from 'sonner';

import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom } from '@/types/productionBom';

import { fmtQty } from '../bomFormat';
import { EmptyState, Note } from '../bomUi';
import { NavBar } from '../NavStack';
import type { BomViewContext } from './DeviceBomArea';

interface LineEntry {
    quantityText: string;
    serials: string[];
    serialInput: string;
}

/**
 * ── WARENEINGANG EINER BOM-BESTELLUNG INS DEPO (27.09.2026, Vorgabe Samet) ──
 *
 * «Geldiği anda — depoya geldi, eklendi — bu eklenenler rezerve olmalı …
 *  direkt ayrılacak mal okutulduğunda ama rezerveye gidecek … mal kabulde de
 *  rezerveye gidilecek.»
 *
 * Je offene Zeile die eingegangene Menge; Karten mit Seriennummer bekommen je
 * Stück eine gescannte Nummer. «Depoya al» bucht ins Depo (nicht ins
 * Artikellager), und die neuen Nummern gehen sofort an die wartende BOM-Zeile
 * mit dem frühesten Liefertermin.
 */
export const BomReceiptView = ({ context, bom, purchaseOrderId }: { context: BomViewContext; bom: Bom; purchaseOrderId: string }) => {
    const { nav } = context;
    const purchase = bom.purchases.find((entry) => entry.purchaseOrderId === purchaseOrderId) ?? null;
    const [entries, setEntries] = useState<Record<number, LineEntry>>({});
    const [busy, setBusy] = useState(false);

    const serialByLine = useMemo(() => new Map(bom.lines.map((line) => [line.id, Boolean(line.product?.serialRequired)])), [bom.lines]);
    const open = (purchase?.lines ?? []).filter((line) => line.received + 1e-9 < line.quantity);

    if (!purchase) {
        return (
            <>
                <NavBar nav={nav} backTitle={context.backTitle} title={t('productionBom.receipt.title')} />
                <div className="ofi-bom-body"><EmptyState title={t('productionBom.err.PURCHASE_NOT_FOUND')} /></div>
            </>
        );
    }

    const entryOf = (index: number): LineEntry => entries[index] ?? { quantityText: '', serials: [], serialInput: '' };
    const patch = (index: number, change: Partial<LineEntry>) =>
        setEntries((current) => ({ ...current, [index]: { ...entryOf(index), ...change } }));

    const addSerial = (index: number, remaining: number, event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key !== 'Enter') return;
        event.preventDefault();
        const entry = entryOf(index);
        const value = entry.serialInput.trim();
        if (!value) return;
        if (entry.serials.some((serial) => serial.toLowerCase() === value.toLowerCase())) {
            toast.error(t('productionBom.receipt.duplicateSerial'));
            patch(index, { serialInput: '' });
            return;
        }
        if (entry.serials.length >= remaining) return;
        patch(index, { serials: [...entry.serials, value], serialInput: '' });
    };

    const payload = open.flatMap((line) => {
        const entry = entryOf(line.index);
        const serial = line.bomLineId ? serialByLine.get(line.bomLineId) : false;
        if (serial) return entry.serials.length ? [{ index: line.index, quantity: entry.serials.length, serials: entry.serials }] : [];
        const quantity = Number(entry.quantityText.replace(',', '.'));
        return Number.isFinite(quantity) && quantity > 0 ? [{ index: line.index, quantity, serials: [] }] : [];
    });

    const submit = async () => {
        if (!payload.length || busy) {
            if (!payload.length) toast.error(t('productionBom.receipt.nothing'));
            return;
        }
        setBusy(true);
        try {
            const result = await productionBomApi.receive(purchaseOrderId, payload);
            if (result.bom) context.applyBom(result.bom);
            toast.success(t('productionBom.receipt.done'));
            setEntries({});
            nav.back();
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <NavBar
                nav={nav}
                backTitle={context.backTitle}
                title={t('productionBom.receipt.title')}
                subtitle={<><PurchaseCode value={purchase.referenceNumber} /> · {purchase.supplierName}</>}
                actions={(
                    <button type="button" className="ofi-bom-btn is-primary ofi-nosize" disabled={!payload.length || busy} onClick={() => void submit()}>
                        {busy ? <span className="ofi-bom-spinner is-small is-light" /> : <PackageCheck />}
                        {t('productionBom.receipt.submit')}
                    </button>
                )}
            />
            <div className="ofi-bom-body">
                <Note>{t('productionBom.receipt.hint')}</Note>
                {!open.length ? (
                    <EmptyState icon={<PackageCheck />} title={t('productionBom.receipt.complete')} />
                ) : (
                    <div className="ofi-bom-tablewrap">
                        <table className="ofi-bom-table" data-unstyled-table>
                            <thead>
                                <tr>
                                    <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                                    <th className="is-name">{t('productionBom.columns.name')}</th>
                                    <th className="is-num">{t('productionBom.receipt.ordered')}</th>
                                    <th className="is-num">{t('productionBom.receipt.received')}</th>
                                    <th className="is-num">{t('productionBom.receipt.remaining')}</th>
                                    <th className="is-accent">{t('productionBom.receipt.now')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {open.map((line) => {
                                    const remaining = Math.max(0, line.quantity - line.received);
                                    const entry = entryOf(line.index);
                                    const serial = line.bomLineId ? serialByLine.get(line.bomLineId) : false;
                                    return (
                                        <tr key={line.index}>
                                            <td className="is-code"><span className="ofi-bom-code">{line.code ?? '—'}</span></td>
                                            <td className="is-name">
                                                <span className="ofi-bom-cellname">
                                                    <b>{line.name}{serial && <i className="ofi-bom-sn">{t('productionBom.detail.serialTag')}</i>}</b>
                                                </span>
                                            </td>
                                            <td className="is-num">{fmtQty(line.quantity)}</td>
                                            <td className="is-num">{fmtQty(line.received)}</td>
                                            <td className="is-num">{fmtQty(remaining)}</td>
                                            <td className="is-accent">
                                                {serial ? (
                                                    <span className="ofi-bom-serialentry">
                                                        <span className="ofi-bom-serialentry__field">
                                                            <ScanLine aria-hidden />
                                                            <input
                                                                value={entry.serialInput}
                                                                disabled={entry.serials.length >= remaining}
                                                                placeholder={t('productionBom.receipt.serialPlaceholder')}
                                                                aria-label={t('productionBom.receipt.serialPlaceholder')}
                                                                autoComplete="off"
                                                                spellCheck={false}
                                                                onChange={(event) => patch(line.index, { serialInput: event.target.value })}
                                                                onKeyDown={(event) => addSerial(line.index, remaining, event)}
                                                            />
                                                            <small>{t('productionBom.receipt.serialCount', { count: entry.serials.length, total: fmtQty(remaining) })}</small>
                                                        </span>
                                                        {entry.serials.length > 0 && (
                                                            <span className="ofi-bom-serials">
                                                                {entry.serials.map((value) => (
                                                                    <code key={value}>
                                                                        {value}
                                                                        <button
                                                                            type="button"
                                                                            className="ofi-nosize"
                                                                            aria-label={t('productionBom.common.remove')}
                                                                            onClick={() => patch(line.index, { serials: entry.serials.filter((item) => item !== value) })}
                                                                        >
                                                                            <X />
                                                                        </button>
                                                                    </code>
                                                                ))}
                                                            </span>
                                                        )}
                                                    </span>
                                                ) : (
                                                    <span className="ofi-bom-qtyedit">
                                                        <input
                                                            value={entry.quantityText}
                                                            inputMode="decimal"
                                                            placeholder={fmtQty(remaining)}
                                                            aria-label={t('productionBom.receipt.now')}
                                                            onChange={(event) => patch(line.index, { quantityText: event.target.value })}
                                                        />
                                                        <button
                                                            type="button"
                                                            className="ofi-bom-btn is-small is-quiet ofi-nosize"
                                                            onClick={() => patch(line.index, { quantityText: String(remaining) })}
                                                        >
                                                            {fmtQty(remaining)}
                                                        </button>
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </>
    );
};
