import { useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, Info, StickyNote, Trash2 } from 'lucide-react';

import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import { t } from '@/i18n/translate';
import { BOM_UNITS, type BomLineCoverage, type BomLineOrder, type BomUnit } from '@/types/productionBom';

import { fmtQty, shownPurchaseCode, unitLabel } from './bomFormat';
import { Dash } from './bomUi';

/**
 * ── DIE ZEILEN EINER BOM — «DEPODAKİ SATIRIN AYNISI» (27.09.2026) ────────────
 *
 * Links steht die Zeile genau wie in der Depo-Liste (ERP-Code · Produktname ·
 * Marke · Modell-Nr. · Lieferant · Bestand), rechts, was die BOM dazu weiss:
 *   template  Menge + Einheit der Vorlage
 *   draft     frei verfügbarer Bestand, Bedarf + Einheit (editierbar)
 *   active    Bedarf, reserviert, bestellt (mit den Bestellungen), fehlt
 *   consumed  Bedarf, abgebucht
 */

export type BomTableMode = 'template' | 'draft' | 'active' | 'consumed';

/** Was eine Zeile der Revision im Entwurf gegenüber der geltenden Revision ändert. */
export interface BomRowChange {
    kind: 'ADDED' | 'INCREASED' | 'DECREASED' | 'EDITED';
    /** Menge in der geltenden Revision (0 = neu). */
    before: number;
    unitBefore: BomUnit | null;
}

export interface BomTableRow {
    key: string;
    productId: string;
    erpCode: string | null;
    name: string;
    brand: string | null;
    modelNumber: string | null;
    description: string | null;
    supplierName: string | null;
    serialRequired: boolean;
    stock: number | null;
    free: number | null;
    minimum: number | null;
    quantityText: string;
    quantity: number;
    consumed: number;
    unit: BomUnit;
    note: string | null;
    missingProduct: boolean;
    coverage?: BomLineCoverage;
    orders?: BomLineOrder[];
    /** Was bei Wareneingängen an diese Zeile ging (Gelen mallar) — nur die Zahl. */
    received?: number;
    /** Nur in einer Revision im Entwurf: der Unterschied zur geltenden Fassung. */
    change?: BomRowChange | null;
}

/**
 * Das kleine Zeichen VOR der Menge: «neu» · «~~10~~ ↑» (vorher 10, mehr) ·
 * «~~5~~ ↓» · «geändert» — so liest die Zelle «10 → 12 Adet». Der volle Satz
 * steht im Tooltip; kurz, damit die Zelle nicht in die Werkzeuge läuft.
 */
const RevisionMark = ({ change }: { change: BomRowChange }) => {
    const was = t('productionBom.revision.markWas', { value: fmtQty(change.before), unit: unitLabel(change.unitBefore) });
    if (change.kind === 'ADDED') return <span className="ofi-bom-revmark is-added">{t('productionBom.revision.markAdded')}</span>;
    if (change.kind === 'EDITED') {
        return <span className="ofi-bom-revmark is-edited" title={was}>{t('productionBom.revision.markEdited')}</span>;
    }
    const up = change.kind === 'INCREASED';
    return (
        <span className={`ofi-bom-revmark ${up ? 'is-increased' : 'is-decreased'}`} title={was} aria-label={was}>
            <s>{fmtQty(change.before)}</s>
            {up ? <ArrowUp aria-hidden /> : <ArrowDown aria-hidden />}
        </span>
    );
};

/*
 * Die kleinen Fenster an der Zeile (Notiz, Seriennummern) liegen ÜBER der
 * Seite (AnchoredPicker = Portal): in der Tabelle schoben sie eine
 * Bildlaufleiste hinein, und die Tabelle wurde schmaler («satır notu deyince
 * tablo küçülmesin»).
 */
const NotePopover = ({
    value,
    editable,
    onChange,
}: {
    value: string | null;
    editable: boolean;
    onChange?: (next: string | null) => void;
}) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    const [draft, setDraft] = useState(value ?? '');

    if (!editable && !value) return null;
    const close = () => setAnchor(null);
    const commit = () => {
        onChange?.(draft.trim() || null);
        close();
    };
    return (
        <>
            <button
                type="button"
                className={`ofi-bom-iconbtn ofi-nosize${value ? ' is-on' : ''}`}
                title={value ?? t('productionBom.detail.noteTitle')}
                aria-label={t('productionBom.detail.noteTitle')}
                aria-expanded={Boolean(anchor)}
                onClick={(event) => {
                    const target = event.currentTarget;
                    setDraft(value ?? '');
                    setAnchor((current) => (current ? null : target));
                }}
            >
                {value ? <StickyNote /> : <Info />}
            </button>
            <AnchoredPicker anchorEl={anchor} onClose={close} width={300} maxHeight={320} exactWidth ariaLabel={t('productionBom.detail.noteTitle')}>
                <div className="ofi-bom-pop ofi-bom-notepanel">
                    <b>{t('productionBom.detail.noteTitle')}</b>
                    {editable ? (
                        <>
                            <textarea
                                value={draft}
                                autoFocus
                                rows={3}
                                maxLength={255}
                                placeholder={t('productionBom.detail.notePlaceholder')}
                                onChange={(event) => setDraft(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) commit();
                                }}
                            />
                            <span className="ofi-bom-notepanel__actions">
                                <button type="button" className="ofi-bom-btn is-small is-quiet ofi-nosize" onClick={close}>
                                    {t('productionBom.common.cancel')}
                                </button>
                                <button type="button" className="ofi-bom-btn is-small is-primary ofi-nosize" onClick={commit}>
                                    {t('productionBom.common.save')}
                                </button>
                            </span>
                        </>
                    ) : (
                        <span className="ofi-bom-notepanel__text">{value}</span>
                    )}
                </div>
            </AnchoredPicker>
        </>
    );
};

const SerialsPopover = ({ serials, label }: { serials: string[]; label: string }) => {
    const [anchor, setAnchor] = useState<HTMLElement | null>(null);
    if (!serials.length) return <span>{label}</span>;
    return (
        <>
            <button
                type="button"
                className="ofi-bom-linkbtn ofi-nosize"
                aria-expanded={Boolean(anchor)}
                onClick={(event) => {
                    const target = event.currentTarget;
                    setAnchor((current) => (current ? null : target));
                }}
            >
                {label}
            </button>
            <AnchoredPicker anchorEl={anchor} onClose={() => setAnchor(null)} width={280} maxHeight={320} exactWidth ariaLabel={t('productionBom.detail.serials')}>
                <div className="ofi-bom-pop ofi-bom-notepanel">
                    <b>{t('productionBom.detail.serials')}</b>
                    <span className="ofi-bom-serials">{serials.map((serial) => <code key={serial}>{serial}</code>)}</span>
                </div>
            </AnchoredPicker>
        </>
    );
};

export const BomLinesTable = ({
    rows,
    mode,
    editable,
    onQuantity,
    onUnit,
    onNote,
    onRemove,
    onOpenOrder,
    emptyText,
    plain,
    footer,
    hideSupplier,
    numericOnly,
}: {
    rows: BomTableRow[];
    mode: BomTableMode;
    editable: boolean;
    onQuantity?: (key: string, text: string) => void;
    onUnit?: (key: string, unit: BomUnit) => void;
    onNote?: (key: string, note: string | null) => void;
    onRemove?: (key: string) => void;
    onOpenOrder?: (purchaseOrderId: string) => void;
    emptyText?: string;
    /** Ohne Rahmen und ohne Höhe — die Tabelle wächst mit der Seite («tablonun sınırı olmasın»). */
    plain?: boolean;
    /** Die letzte, leere Zeile: hier wird hinzugefügt («tablonun en altında boş satır olsun»). */
    footer?: ReactNode;
    /** Ohne Lieferantenspalte — die BOM sieht keinen Lieferanten (27.09.2026 abends). */
    hideSupplier?: boolean;
    /**
     * «Sadece sayısal olarak» (27.09.2026 abends): bestellte Ware nur als Zahl
     * (ohne Belegnummern), dazu die Spalte «Gelen» — was schon ankam.
     */
    numericOnly?: boolean;
}) => {
    const showReceived = Boolean(numericOnly) && mode === 'active';
    const editQty = editable && (mode === 'template' || mode === 'draft');
    // So viele Spalten wie der Kopf — die leere Zeile spannt über alle.
    const columnCount = (hideSupplier ? 2 : 3) + (mode !== 'consumed' ? 1 : 0) + (mode === 'draft' || mode === 'template' ? 1 : 0)
        + 1 + (mode === 'active' ? 3 : 0) + (showReceived ? 1 : 0) + (mode === 'consumed' ? 1 : 0) + 1;
    return (
        <div className={`ofi-bom-tablewrap${plain ? ' is-plain' : ''}`}>
            <table className="ofi-bom-table" data-unstyled-table>
                <thead>
                    <tr>
                        <th className="is-code">{t('productionBom.columns.erpCode')}</th>
                        <th className="is-name">{t('productionBom.columns.name')}</th>
                        {!hideSupplier && <th>{t('productionBom.columns.supplier')}</th>}
                        {mode !== 'consumed' && <th className="is-num">{t('productionBom.columns.stock')}</th>}
                        {(mode === 'draft' || mode === 'template') && <th className="is-num">{t('productionBom.columns.free')}</th>}
                        <th className="is-num is-accent">{mode === 'template' ? t('productionBom.columns.quantity') : t('productionBom.columns.need')}</th>
                        {mode === 'active' && (
                            <>
                                <th className="is-num">{t('productionBom.columns.reserved')}</th>
                                <th className={numericOnly ? 'is-num' : undefined}>{t('productionBom.columns.incoming')}</th>
                                {showReceived && <th className="is-num">{t('productionBom.columns.received')}</th>}
                                <th className="is-num">{t('productionBom.columns.missing')}</th>
                            </>
                        )}
                        {mode === 'consumed' && <th className="is-num">{t('productionBom.status.CONSUMED')}</th>}
                        <th className="is-tools" aria-label={t('productionBom.columns.note')} />
                    </tr>
                </thead>
                <tbody>
                    {!rows.length && !footer && (
                        <tr className="is-empty">
                            <td colSpan={columnCount}>{emptyText ?? t('productionBom.detail.empty')}</td>
                        </tr>
                    )}
                    {rows.map((row) => {
                        const coverage = row.coverage;
                        const missing = coverage?.missing ?? 0;
                        const fullyReserved = coverage ? coverage.reserved + 1e-9 >= coverage.open : false;
                        return (
                            <tr key={row.key} className={[row.missingProduct ? 'is-gone' : '', row.change ? `is-rev-${row.change.kind.toLowerCase()}` : ''].filter(Boolean).join(' ') || undefined}>
                                <td className="is-code"><span className="ofi-bom-code">{row.erpCode ?? '—'}</span></td>
                                <td className="is-name">
                                    <span className="ofi-bom-cellname">
                                        <b>
                                            {row.name}
                                            {row.serialRequired && <i className="ofi-bom-sn">{t('productionBom.detail.serialTag')}</i>}
                                        </b>
                                        {row.missingProduct
                                            ? <small className="is-warn">{t('productionBom.editor.productMissing')}</small>
                                            : row.description && <small>{row.description}</small>}
                                    </span>
                                </td>
                                {!hideSupplier && <td>{row.supplierName ?? <Dash />}</td>}
                                {mode !== 'consumed' && <td className="is-num">{row.stock === null ? <Dash /> : fmtQty(row.stock)}</td>}
                                {(mode === 'draft' || mode === 'template') && (
                                    <td className={`is-num${row.free !== null && row.free + 1e-9 < row.quantity ? ' is-short' : ''}`}>
                                        {row.free === null ? <Dash /> : fmtQty(row.free)}
                                    </td>
                                )}
                                <td className="is-num is-accent">
                                    {editQty ? (
                                        <span className="ofi-bom-qtyedit">
                                            {row.change && <RevisionMark change={row.change} />}
                                            <input
                                                value={row.quantityText}
                                                inputMode="decimal"
                                                aria-label={t('productionBom.columns.quantity')}
                                                className={Number.isNaN(Number(row.quantityText.replace(',', '.'))) || !(Number(row.quantityText.replace(',', '.')) > 0) ? 'is-invalid' : undefined}
                                                onFocus={(event) => event.currentTarget.select()}
                                                onChange={(event) => onQuantity?.(row.key, event.target.value)}
                                            />
                                            <select
                                                value={row.unit}
                                                aria-label={t('productionBom.columns.unit')}
                                                onChange={(event) => onUnit?.(row.key, event.target.value as BomUnit)}
                                            >
                                                {BOM_UNITS.map((unit) => <option key={unit} value={unit}>{unitLabel(unit)}</option>)}
                                            </select>
                                        </span>
                                    ) : (
                                        <span className="ofi-bom-qty">
                                            {row.change && <RevisionMark change={row.change} />}
                                            {fmtQty(row.quantity)}<small>{unitLabel(row.unit)}</small>
                                        </span>
                                    )}
                                </td>
                                {mode === 'active' && coverage && (
                                    <>
                                        <td className={`is-num${fullyReserved ? ' is-ok' : ''}`}>
                                            <SerialsPopover serials={coverage.serials} label={fmtQty(coverage.reserved)} />
                                        </td>
                                        {numericOnly ? (
                                            <td className="is-num">
                                                {coverage.incoming > 1e-9 ? (
                                                    <span className="ofi-bom-numcell">
                                                        {fmtQty(coverage.incoming)}
                                                        {coverage.incomingConfirmed > 1e-9 && (
                                                            <small className={coverage.incomingConfirmed + 1e-9 >= coverage.incoming ? 'is-ok' : undefined}>
                                                                {t('productionBom.detail.confirmedQty', { count: fmtQty(coverage.incomingConfirmed) })}
                                                            </small>
                                                        )}
                                                    </span>
                                                ) : <Dash />}
                                            </td>
                                        ) : (
                                        <td>
                                            <span className="ofi-bom-incoming">
                                                {coverage.incoming > 0 && <span className="ofi-bom-num">{fmtQty(coverage.incoming)}</span>}
                                                {(row.orders ?? []).filter((order) => order.kind === 'ORDER').map((order) => (onOpenOrder ? (
                                                    <button
                                                        key={order.purchaseOrderId}
                                                        type="button"
                                                        className="ofi-bom-chip ofi-nosize"
                                                        onClick={() => onOpenOrder(order.purchaseOrderId)}
                                                        title={`${shownPurchaseCode(order.referenceNumber)} · ${fmtQty(order.received)}/${fmtQty(order.quantity)}`}
                                                    >
                                                        <PurchaseCode value={order.referenceNumber} />
                                                    </button>
                                                ) : (
                                                    // In der BOM nur der Weg: Nummer und Lieferstand, kein Sprung in den Beleg.
                                                    <span
                                                        key={order.purchaseOrderId}
                                                        className="ofi-bom-chip is-static"
                                                        title={`${shownPurchaseCode(order.referenceNumber)} · ${fmtQty(order.received)}/${fmtQty(order.quantity)}`}
                                                    >
                                                        <PurchaseCode value={order.referenceNumber} />
                                                    </span>
                                                )))}
                                                {coverage.incoming <= 0 && !(row.orders ?? []).some((order) => order.kind === 'ORDER') && <Dash />}
                                            </span>
                                        </td>
                                        )}
                                        {showReceived && (
                                            <td className={`is-num${(row.received ?? 0) > 1e-9 ? ' is-ok' : ''}`}>
                                                {(row.received ?? 0) > 1e-9 ? fmtQty(row.received ?? 0) : <Dash />}
                                            </td>
                                        )}
                                        <td className={`is-num${missing > 1e-9 ? ' is-missing' : ''}`}>{missing > 1e-9 ? fmtQty(missing) : <Dash />}</td>
                                    </>
                                )}
                                {mode === 'consumed' && <td className="is-num is-ok">{fmtQty(row.consumed)}</td>}
                                <td className="is-tools">
                                    <span className="ofi-bom-rowtools">
                                        <NotePopover
                                            value={row.note}
                                            editable={editQty}
                                            onChange={(next) => onNote?.(row.key, next)}
                                        />
                                        {editQty && (
                                            <button
                                                type="button"
                                                className="ofi-bom-iconbtn is-danger-hover ofi-nosize"
                                                aria-label={t('productionBom.detail.removeLine')}
                                                title={t('productionBom.detail.removeLine')}
                                                onClick={() => onRemove?.(row.key)}
                                            >
                                                <Trash2 />
                                            </button>
                                        )}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
                {footer && (
                    <tfoot>
                        <tr className="is-add">
                            <td colSpan={columnCount}>{footer}</td>
                        </tr>
                    </tfoot>
                )}
            </table>
        </div>
    );
};
