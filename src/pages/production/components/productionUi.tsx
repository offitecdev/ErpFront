import type { ReactNode } from 'react';

import { Box, Wrench } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { fmtDate, fmtMoneyIn, fmtQty } from '@/pages/inventory/utils/format';
import type { ProductionCostFigures, ProductionItem, ProductionItemKind, ProductionOrder } from '@/types/production';

/**
 * ── DIE KLEINEN BAUSTEINE DER PRODUKTION (19.09.2026) ───────────────────────
 * Beträge, Gerätekarte, Kennzahlen und Kostenvergleich — dieselben auf der
 * Übersicht, der Projektseite und in den Lagerseiten.
 */

export const money = (value: number | null | undefined, currency?: string | null): string =>
    fmtMoneyIn(Number(value) || 0, currency || 'CHF');

export const quantity = (value: number | null | undefined, unit?: string | null): string =>
    `${fmtQty(Number(value) || 0)}${unit ? ` ${unit}` : ''}`;

export const marginText = (margin: number | null | undefined): string =>
    margin === null || margin === undefined
        ? '—'
        : `${margin.toLocaleString('de-CH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

/** Die Marge erst, wenn etwas bestellt ist — vorher wären es immer 100 %. */
export const marginOf = (figures: ProductionCostFigures): string =>
    (figures.orderedTotal > 0 ? marginText(figures.marginPercent) : '—');

/** Differenz: rot, wenn der Einkauf den Verkauf übersteigt; grau, solange nichts bestellt ist. */
export const differenceTone = (figures: ProductionCostFigures): string => {
    if (figures.orderedTotal <= 0) return 'is-dim';
    return figures.difference < 0 ? 'is-bad' : 'is-good';
};

/** Ein Betrag rechts in der Zelle; `dimZero` zeigt «—» statt 0.00. */
export const Money = ({
    value,
    currency,
    tone = '',
    dimZero = false,
}: {
    value: number;
    currency?: string | null;
    tone?: string;
    dimZero?: boolean;
}) => (
    dimZero && !value
        ? <span className="ofi-prod-money is-dim">—</span>
        : <span className={`ofi-prod-money ${tone}`.trim()}>{money(value, currency)}</span>
);

export const orderKindLabel = (order: Pick<ProductionOrder, 'orderKind'>): string =>
    order.orderKind === 'ADDON'
        ? t('production.kind.addon')
        : order.orderKind === 'DELIVERY' ? t('production.kind.delivery') : t('production.kind.project');

export const orderDateText = (order: Pick<ProductionOrder, 'orderDate'>): string =>
    order.orderDate ? fmtDate(order.orderDate) : '';

export const isCancelledStatus = (status: string | null | undefined): boolean =>
    String(status || '').toUpperCase() === 'CANCELLED';

/* ── Die Gerätekarte ─────────────────────────────────────────────────────── */

export const KindIcon = ({ kind }: { kind: ProductionItemKind }) => (
    <span className={`ofi-prod-device__icon ${kind === 'SERVICE' ? 'is-service' : ''}`} aria-hidden>
        {kind === 'SERVICE' ? <Wrench /> : <Box />}
    </span>
);

/**
 * Ein Gerät (oder eine Leistung) als eigenes Zeichen — ein Klick öffnet das
 * Fenster mit seinen Angaben (Vorgabe: «Geräte als eigene Karte/Zeichen»).
 */
export const DeviceChip = ({
    item,
    onOpen,
    large = false,
    className = '',
}: {
    item: Pick<ProductionItem, 'id' | 'name' | 'kind'>;
    onOpen?: (itemId: string) => void;
    large?: boolean;
    className?: string;
}) => (
    <button
        type="button"
        className={`ofi-prod-device ${large ? 'is-large' : ''} ${onOpen ? '' : 'is-static'} ${className}`.trim()}
        title={item.name}
        onClick={(event) => {
            event.stopPropagation();
            onOpen?.(item.id);
        }}
        tabIndex={onOpen ? 0 : -1}
    >
        <KindIcon kind={item.kind} />
        <span className="ofi-prod-device__name">{item.name}</span>
    </button>
);

/* ── Kennzahlen ──────────────────────────────────────────────────────────── */

export const CostTiles = ({ figures, lead }: { figures: ProductionCostFigures; lead?: ReactNode }) => (
    <div className="ofi-prod-kpis">
        {lead}
        <div className="ofi-prod-kpi">
            <span className="ofi-prod-kpi__label">{t('production.figures.sales')}</span>
            <span className="ofi-prod-kpi__value">{money(figures.salesTotal)}</span>
            <span className="ofi-prod-kpi__sub">{t('production.figures.salesHint')}</span>
        </div>
        <div className="ofi-prod-kpi">
            <span className="ofi-prod-kpi__label">{t('production.figures.ordered')}</span>
            <span className="ofi-prod-kpi__value">{money(figures.orderedTotal)}</span>
            <span className="ofi-prod-kpi__sub">
                {t('production.figures.openShort', { amount: money(figures.openTotal) })}
            </span>
        </div>
        <div className="ofi-prod-kpi">
            <span className="ofi-prod-kpi__label">{t('production.figures.received')}</span>
            <span className="ofi-prod-kpi__value">{money(figures.receivedTotal)}</span>
            <span className="ofi-prod-kpi__sub">{t('production.figures.receivedHint')}</span>
        </div>
        <div className={`ofi-prod-kpi ${figures.orderedTotal > 0 ? (figures.difference < 0 ? 'is-bad' : 'is-good') : ''}`}>
            <span className="ofi-prod-kpi__label">{t('production.figures.difference')}</span>
            <span className="ofi-prod-kpi__value">{money(figures.difference)}</span>
            <span className="ofi-prod-kpi__sub">
                {t('production.figures.marginShort', { margin: marginOf(figures) })}
            </span>
        </div>
    </div>
);

/** Bestellt (blau) und Eingang (grün) im Verhältnis zum Verkauf. */
export const CostBar = ({ figures }: { figures: ProductionCostFigures }) => {
    const base = Math.max(figures.salesTotal, figures.orderedTotal, 1);
    const ordered = Math.min(100, (figures.orderedTotal / base) * 100);
    const received = Math.min(ordered, (figures.receivedTotal / base) * 100);
    const over = figures.salesTotal > 0 && figures.orderedTotal > figures.salesTotal;
    return (
        <span className={`ofi-prod-bar ${over ? 'is-over' : ''} is-received`} aria-hidden>
            <i style={{ width: `${ordered}%` }} />
            <i style={{ width: `${received}%` }} />
        </span>
    );
};

/* ── Kostenvergleich ─────────────────────────────────────────────────────── */

export interface ComparisonRow {
    key: string;
    label: ReactNode;
    figures: ProductionCostFigures;
    onClick?: () => void;
    muted?: boolean;
}

/**
 * Verkauf gegen Einkauf in EINER Tabelle (Vorgabe: «Kostenvergleich —
 * Ausgaben und Kosten gegenübergestellt»). Offen = Preise ohne Bestätigung,
 * Bestellt = bestätigte Bestellungen, Eingang = davon eingegangen. OHNE Marge
 * (Vorgabe Samet, 20.09.2026: «karşılaştırmada marjı kaldır») — die Differenz
 * in Franken sagt es.
 */
export const CostComparisonTable = ({
    rows,
    total,
    labelHeader,
    emptyText,
}: {
    rows: ComparisonRow[];
    total?: ProductionCostFigures;
    labelHeader: ReactNode;
    emptyText: string;
}) => (
    <div className="overflow-x-auto">
        <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-tree w-full min-w-[860px]">
            <colgroup>
                <col />
                <col style={{ width: 132 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 132 }} />
                <col style={{ width: 124 }} />
                <col style={{ width: 132 }} />
            </colgroup>
            <thead>
                <tr>
                    <th className="text-left">{labelHeader}</th>
                    <th className="text-right">{t('production.figures.sales')}</th>
                    <th className="text-right">{t('production.figures.open')}</th>
                    <th className="text-right">{t('production.figures.ordered')}</th>
                    <th className="text-right">{t('production.figures.received')}</th>
                    <th className="text-right">{t('production.figures.difference')}</th>
                </tr>
            </thead>
            <tbody>
                {rows.length === 0 && (
                    <tr>
                        <td colSpan={6} className="py-10 text-center text-[13px] text-slate-400">{emptyText}</td>
                    </tr>
                )}
                {rows.map((row) => (
                    <tr
                        key={row.key}
                        className={`${row.onClick ? 'is-clickable' : ''} ${row.muted ? 'is-muted' : ''}`.trim()}
                        onClick={row.onClick}
                    >
                        <td className="max-w-0">{row.label}</td>
                        <td><Money value={row.figures.salesTotal} /></td>
                        <td><Money value={row.figures.openTotal} dimZero /></td>
                        <td><Money value={row.figures.orderedTotal} dimZero /></td>
                        <td><Money value={row.figures.receivedTotal} dimZero /></td>
                        <td><Money value={row.figures.difference} tone={differenceTone(row.figures)} /></td>
                    </tr>
                ))}
            </tbody>
            {total && rows.length > 1 && (
                <tfoot>
                    <tr>
                        <td>{t('production.figures.total')}</td>
                        <td><Money value={total.salesTotal} /></td>
                        <td><Money value={total.openTotal} dimZero /></td>
                        <td><Money value={total.orderedTotal} dimZero /></td>
                        <td><Money value={total.receivedTotal} dimZero /></td>
                        <td><Money value={total.difference} tone={differenceTone(total)} /></td>
                    </tr>
                </tfoot>
            )}
        </table>
    </div>
);
