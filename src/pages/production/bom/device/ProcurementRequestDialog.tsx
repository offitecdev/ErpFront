import { useMemo, useState } from 'react';
import { Check, FileText, ShoppingCart } from 'lucide-react';
import { toast } from 'sonner';

import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import { productionBomApi, productionBomErrorText } from '@/lib/api/productionBom';
import type { Bom, BomProcurementKind, BomUnit } from '@/types/productionBom';

import { fmtQty, parseQuantityText, quantityToText, unitLabel } from '../bomFormat';
import { pendingLineIds } from './bomProcess';

interface RequestRow {
    id: string;
    erpCode: string | null;
    name: string;
    modelNumber: string | null;
    unit: BomUnit;
    /** Vorschlag: bei PRICE die Menge der Zeile, bei ORDER was fehlt. */
    suggested: number;
    /** Darunter geht es nicht (ORDER: was fehlt). */
    floor: number;
    /** Steht schon in einem offenen Talep dieser Art (dessen Nummer). */
    pending: string | null;
}

interface RowState { include: boolean; text: string }

const rowsOf = (bom: Bom, kind: BomProcurementKind): RequestRow[] => {
    const pending = pendingLineIds(bom, kind);
    if (kind === 'PRICE') {
        // Im Entwurf die Zeilen der BOM, in einer Revision die der Arbeitskopie.
        const source = bom.status !== 'DRAFT' && bom.revisionDraft ? bom.revisionDraft.lines : bom.lines;
        return source.map((line) => ({
            id: line.id,
            erpCode: line.product?.erpCode ?? line.erpCode,
            name: line.product?.name ?? line.name,
            modelNumber: line.product?.modelNumber ?? line.modelNumber,
            unit: line.unit as BomUnit,
            suggested: line.quantity,
            floor: 0,
            pending: pending.get(line.id) ?? null,
        }));
    }
    return bom.lines
        .filter((line) => line.coverage.missing > 1e-9)
        .map((line) => ({
            id: line.id,
            erpCode: line.product?.erpCode ?? line.erpCode,
            name: line.product?.name ?? line.name,
            modelNumber: line.product?.modelNumber ?? line.modelNumber,
            unit: line.unit as BomUnit,
            suggested: line.coverage.missing,
            floor: line.coverage.missing,
            pending: pending.get(line.id) ?? null,
        }));
};

/**
 * ── TALEP AN DEN EINKAUF (27.09.2026 abends, Vorgabe Samet) ─────────────────
 *
 * «Bom'da sadece sipariş ve fiyat talep istekleri oluşsun … tedarikçi ve
 *  fiyatlar gözükmesin, başka bir sayfada talep olarak gelsin.» Die BOM wählt
 * nur Zeilen und Mengen — KEIN Lieferant, KEIN Preis. Daraus macht der
 * Einkauf auf «Satın alma» die Preisanfragen bzw. Bestellungen.
 *
 *   PRICE  «Fiyat talebi iste» — im Entwurf (oder in einer Revision im Entwurf)
 *   ORDER  «Sipariş talebi»    — aus der freigegebenen BOM, was fehlt (nie weniger)
 */
export const ProcurementRequestDialog = ({
    open,
    bom,
    kind,
    onClose,
    onDone,
}: {
    open: boolean;
    bom: Bom;
    kind: BomProcurementKind;
    onClose: () => void;
    onDone: (bom: Bom) => void;
}) => {
    const rows = useMemo(() => rowsOf(bom, kind), [bom, kind]);
    const [state, setState] = useState<Record<string, RowState>>({});
    const [note, setNote] = useState('');
    const [busy, setBusy] = useState(false);

    const rowState = (row: RequestRow): RowState => state[row.id] ?? { include: !row.pending, text: quantityToText(row.suggested) };
    const problem = (row: RequestRow, entry: RowState): boolean => {
        if (!entry.include || row.pending) return false;
        const value = parseQuantityText(entry.text);
        return !Number.isFinite(value) || value <= 0 || value + 1e-9 < row.floor;
    };
    const chosen = rows.filter((row) => !row.pending && rowState(row).include);
    const invalid = rows.some((row) => problem(row, rowState(row)));
    const selectable = rows.filter((row) => !row.pending);
    const allOn = selectable.length > 0 && selectable.every((row) => rowState(row).include);

    const patch = (row: RequestRow, change: Partial<RowState>) =>
        setState((current) => ({ ...current, [row.id]: { ...rowState(row), ...change } }));
    const toggleAll = () => setState((current) => {
        const next = { ...current };
        for (const row of selectable) next[row.id] = { ...rowState(row), include: !allOn };
        return next;
    });

    const close = () => {
        if (busy) return;
        setState({});
        setNote('');
        onClose();
    };

    const submit = async () => {
        if (busy || !chosen.length || invalid) return;
        setBusy(true);
        try {
            const result = await productionBomApi.createProcurementRequest(bom.id, {
                kind,
                note: note.trim() || null,
                lines: chosen.map((row) => ({ lineId: row.id, quantity: parseQuantityText(rowState(row).text), note: null })),
            });
            toast.success(t(`productionBom.procurement.created.${kind}`, { number: result.request.requestNumber }));
            setState({});
            setNote('');
            onDone(result.bom);
        } catch (error) {
            toast.error(productionBomErrorText(error));
        } finally {
            setBusy(false);
        }
    };

    return (
        <PopupDialog
            open={open}
            onClose={close}
            title={t(`productionBom.procurement.dialogTitle.${kind}`)}
            subtitle={t(`productionBom.procurement.dialogSubtitle.${kind}`, { number: bom.bomNumber })}
            icon={kind === 'PRICE' ? <FileText size={18} /> : <ShoppingCart size={18} />}
            width={760}
            footer={(
                <PopupActions start={<span className="ofi-bom-reqdlg__count">{t('productionBom.procurement.selected', { count: chosen.length })}</span>}>
                    <PopupButton onClick={close} disabled={busy}>{t('productionBom.common.cancel')}</PopupButton>
                    <PopupButton variant="primary" loading={busy} disabled={!chosen.length || invalid} onClick={() => void submit()}>
                        {t(`productionBom.procurement.send.${kind}`)}
                    </PopupButton>
                </PopupActions>
            )}
        >
            <div className="ofi-bom-pop ofi-bom-reqdlg">
                <p className="ofi-bom-reqdlg__hint">{t(`productionBom.procurement.dialogHint.${kind}`)}</p>
                {rows.length ? (
                    <div className="ofi-bom-reqdlg__table" role="table">
                        <div className="ofi-bom-reqdlg__row is-head" role="row">
                            <span role="columnheader">
                                <button
                                    type="button"
                                    role="checkbox"
                                    aria-checked={allOn}
                                    aria-label={t('productionBom.procurement.all')}
                                    className={`ofi-bom-check ofi-nosize${allOn ? ' is-on' : ''}`}
                                    disabled={!selectable.length}
                                    onClick={toggleAll}
                                >
                                    {allOn && <Check />}
                                </button>
                            </span>
                            <span role="columnheader">{t('productionBom.columns.erpCode')}</span>
                            <span role="columnheader">{t('productionBom.columns.name')}</span>
                            <span role="columnheader" className="is-num">{t(kind === 'ORDER' ? 'productionBom.columns.missing' : 'productionBom.columns.need')}</span>
                            <span role="columnheader" className="is-num">{t('productionBom.procurement.quantity')}</span>
                        </div>
                        {rows.map((row) => {
                            const entry = rowState(row);
                            const bad = problem(row, entry);
                            return (
                                <div
                                    key={row.id}
                                    role="row"
                                    className={`ofi-bom-reqdlg__row${row.pending ? ' is-pending' : ''}${entry.include && !row.pending ? ' is-on' : ''}`}
                                >
                                    <span role="cell">
                                        <button
                                            type="button"
                                            role="checkbox"
                                            aria-checked={entry.include && !row.pending}
                                            aria-label={row.name}
                                            className={`ofi-bom-check ofi-nosize${entry.include && !row.pending ? ' is-on' : ''}`}
                                            disabled={Boolean(row.pending)}
                                            onClick={() => patch(row, { include: !entry.include })}
                                        >
                                            {entry.include && !row.pending && <Check />}
                                        </button>
                                    </span>
                                    <span role="cell" className="ofi-bom-code">{row.erpCode ?? '—'}</span>
                                    <span role="cell" className="ofi-bom-reqdlg__name">
                                        <b title={row.name}>{row.name}</b>
                                        {row.pending
                                            ? <small className="is-pending">{t('productionBom.procurement.pending', { number: row.pending })}</small>
                                            : row.modelNumber && <small>{row.modelNumber}</small>}
                                    </span>
                                    <span role="cell" className="is-num">{fmtQty(row.suggested)} <small>{unitLabel(row.unit)}</small></span>
                                    <span role="cell" className="is-num">
                                        <span className="ofi-bom-reqdlg__qty">
                                            <input
                                                value={entry.text}
                                                inputMode="decimal"
                                                disabled={!entry.include || Boolean(row.pending)}
                                                aria-label={t('productionBom.procurement.quantity')}
                                                aria-invalid={bad}
                                                className={bad ? 'is-invalid' : undefined}
                                                onFocus={(event) => event.currentTarget.select()}
                                                onChange={(event) => patch(row, { text: event.target.value })}
                                            />
                                            <small>{unitLabel(row.unit)}</small>
                                        </span>
                                        {bad && row.floor > 0 && <small className="ofi-bom-reqdlg__err">{t('productionBom.procurement.minQty', { min: fmtQty(row.floor) })}</small>}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <p className="ofi-bom-reqdlg__empty">{t(`productionBom.procurement.nothing.${kind}`)}</p>
                )}
                <label className="ofi-bom-reqdlg__note">
                    <span>{t('productionBom.procurement.note')}</span>
                    <textarea
                        value={note}
                        rows={2}
                        maxLength={1000}
                        placeholder={t('productionBom.procurement.notePlaceholder')}
                        onChange={(event) => setNote(event.target.value)}
                    />
                </label>
            </div>
        </PopupDialog>
    );
};
