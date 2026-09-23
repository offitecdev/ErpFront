import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { File05 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionProject } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDate, fmtUnitPricePrecise } from '@/pages/inventory/utils/format';
import { ORDER_STATUS_META } from '@/pages/inventory/utils/orderStatus';
import type { PurchaseOrderStatus } from '@/types/inventory';
import type {
    ProductionConfirmedLine,
    ProductionCostFigures,
    ProductionItem,
    ProductionOrder,
    ProductionOrderNode,
    ProductionProjectDetail,
} from '@/types/production';
import '@/styles/modules/production.css';

import { DevicePopup } from './components/DevicePopup';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';
import {
    CostComparisonTable,
    CostTiles,
    DeviceChip,
    Money,
    differenceTone,
    isCancelledStatus,
    money,
    orderKindLabel,
    quantity,
} from './components/productionUi';

/**
 * ── EIN PRODUKTIONSPROJEKT (19.09.2026, zweite Fassung — Vorgabe Samet) ─────
 *
 * «Nicht so viel auf einer Seite — Reiter.» Oben stehen nur der Kopf und die
 * vier Zahlen des Projekts, alles andere liegt in je EINEM Reiter:
 *   Gerät/Leistung · Bestätigte Bestellungen · Vergleich · Bestellungen.
 * Der Reiter steht in der Adresse (`?tab=`), damit «zurück» ihn behält.
 * Die Rohzeilen mit Preis («Preispositionen») sind am 20.09.2026 entfallen —
 * sie stehen in der Bestellung selbst.
 */

type Tab = 'devices' | 'confirmed' | 'comparison' | 'orders';
const TABS: Tab[] = ['devices', 'confirmed', 'comparison', 'orders'];

const PoStatus = ({ status }: { status: string }) => {
    const meta = ORDER_STATUS_META[status as PurchaseOrderStatus];
    if (!meta) return <span className="ofi-prod-tag">{status}</span>;
    return (
        <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${meta.className}`}>
            {t(meta.labelKey)}
        </span>
    );
};

const percent = (value: number) => (value ? `${value.toLocaleString('de-CH', { maximumFractionDigits: 2 })} %` : '—');

/** Jedes Gerät mit seinem Auftrag, in der Reihenfolge des Verkaufs (Hauptauftrag, dann Nachträge). */
type DeviceRow = { item: ProductionItem; figures: ProductionCostFigures; order: ProductionOrder };
const deviceRowsOf = (nodes: ProductionOrderNode[]): DeviceRow[] =>
    nodes.flatMap((node) => [
        ...node.items.map((entry) => ({ item: entry.item, figures: entry.figures, order: node.order })),
        ...deviceRowsOf(node.addons),
    ]);

export const ProductionProjectPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const { projectId = '' } = useParams<{ projectId: string }>();
    const [params, setParams] = useSearchParams();
    const [detail, setDetail] = useState<ProductionProjectDetail | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    const requested = params.get('tab') as Tab | null;
    const tab: Tab = requested && TABS.includes(requested) ? requested : 'devices';
    const setTab = (next: Tab) => setParams(next === 'devices' ? {} : { tab: next }, { replace: true });

    useEffect(() => {
        setError(null);
        setDetail((current) => (current?.project.id === projectId ? current : null));
        return readProductionProject(
            projectId,
            (value) => setDetail(value),
            (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
        );
    }, [projectId]);

    const shown = detail && detail.project.id === projectId ? detail : null;
    const devices = useMemo(() => (shown ? deviceRowsOf(shown.orders) : []), [shown]);
    const itemById = useMemo(() => new Map(devices.map((row) => [row.item.id, row.item])), [devices]);
    const confirmedCount = (shown?.confirmedGroups ?? []).reduce((sum, group) => sum + group.lines.length, 0);
    const grouped = (shown?.confirmedGroups.length ?? 0) > 1;
    const loading = !shown && !error;

    const project = shown?.project;
    const title = project ? `${project.projectNumber} · ${project.projectName}` : t('production.project.title');

    /* Derselbe graue Beleg wie auf «Bestellte Produkte» — nur dieses Projekt. */
    const exportPdf = async () => {
        if (!shown || confirmedCount === 0) {
            toast.error(t('production.pdf.empty'));
            return;
        }
        setExporting(true);
        try {
            const { exportConfirmedOrdersPdf } = await import('@/utils/pdf/productionConfirmedPdf');
            await exportConfirmedOrdersPdf({
                rows: shown.confirmedGroups.flatMap((group) => group.lines.map((line) => ({
                    purchaseOrderNumber: line.purchaseOrderNumber,
                    supplierName: line.supplierName,
                    projectNumber: shown.project.projectNumber,
                    projectName: shown.project.projectName,
                    deviceName: group.item?.name ?? null,
                    name: line.name,
                    code: line.code,
                    quantity: line.quantity,
                    unit: line.unit,
                    netPrice: line.netPrice,
                    lineTotal: line.lineTotal,
                    currency: line.currency,
                    receivedQuantity: line.receivedQuantity,
                    approvedAt: line.approvedAt,
                }))),
                totals: {
                    orderedTotal: shown.figures.orderedTotal,
                    receivedTotal: shown.figures.receivedTotal,
                    lineCount: confirmedCount,
                },
                scope: t('production.pdf.scopeProject', {
                    project: `${shown.project.projectNumber} · ${shown.project.projectName}`,
                }),
            });
        } catch {
            toast.error(t('production.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    const openPurchaseOrder = (id: string) => navigate(`/inventory/orders/${id}`);
    const poLink = (id: string, number: string) => (
        <a
            className="ofi-prod-link font-mono text-[12.5px]"
            href={`/inventory/orders/${id}`}
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                openPurchaseOrder(id);
            }}
        >
            <PurchaseCode value={number} />
        </a>
    );

    const lineCells = (line: ProductionConfirmedLine) => (
        <>
            <td>
                {poLink(line.purchaseOrderId, line.purchaseOrderNumber)}
                <div className="text-[11.5px]">{line.supplierName ?? '—'}</div>
            </td>
            <td className="max-w-0">
                <div className="truncate" title={line.name}>{line.name}</div>
                {line.code && <div className="font-mono text-[11.5px]">{line.code}</div>}
            </td>
            <td className="text-right">{quantity(line.quantity, line.unit)}</td>
            <td className="text-right">{fmtUnitPricePrecise(line.netPrice)}</td>
            <td className="text-right">{percent(line.discount)}{line.discount2 ? ` + ${percent(line.discount2)}` : ''}</td>
            <td><Money value={line.lineTotal} currency={line.currency} /></td>
            <td className="text-right">{line.receivedQuantity ? quantity(line.receivedQuantity, line.unit) : '—'}</td>
            <td className="text-[12px]">{fmtDate(line.approvedAt)}</td>
        </>
    );

    const tabs: Array<{ key: Tab; label: string; count?: number }> = [
        { key: 'devices', label: t('production.project.tabDevices'), count: devices.length },
        { key: 'confirmed', label: t('production.project.tabConfirmed'), count: confirmedCount },
        { key: 'comparison', label: t('production.project.tabComparison') },
        { key: 'orders', label: t('production.project.tabOrders'), count: shown?.purchaseOrders.length ?? 0 },
    ];

    let content: ReactNode = null;
    if (tab === 'devices') {
        content = (
            <SectionCard>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-tree ofi-prod-flat w-full min-w-[1080px]">
                        <colgroup>
                            <col style={{ width: 64 }} />
                            <col />
                            <col style={{ width: 220 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 124 }} />
                            <col style={{ width: 124 }} />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 124 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.device.position')}</th>
                                <th className="text-left">{t('production.columns.device')}</th>
                                <th className="text-left">{t('production.columns.order')}</th>
                                <th className="text-right">{t('production.columns.quantity')}</th>
                                <th className="text-right">{t('production.columns.grossPrice')}</th>
                                <th className="text-right">{t('production.figures.sales')}</th>
                                <th className="text-right">{t('production.figures.expenditure')}</th>
                                <th className="text-right">{t('production.figures.received')}</th>
                                <th className="text-right">{t('production.figures.difference')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || devices.length === 0) && (
                                <TableStateRow colSpan={9} loading={loading} emptyText={t('production.project.noDevices')} skeletonRows={4} />
                            )}
                            {devices.map(({ item, figures, order }) => {
                                const addon = order.orderKind === 'ADDON';
                                const cancelled = !item.isActive || isCancelledStatus(order.status);
                                return (
                                    <tr
                                        key={item.id}
                                        className={`is-clickable ${cancelled ? 'is-muted' : ''}`.trim()}
                                        onClick={() => setDeviceId(item.id)}
                                    >
                                        <td className="text-[12px] text-slate-500">{item.positionNumber ?? '—'}</td>
                                        <td className="max-w-0"><DeviceChip item={item} onOpen={setDeviceId} /></td>
                                        <td className="max-w-0">
                                            <div className="ofi-prod-cell">
                                                <span className="ofi-prod-num">{order.orderNumber}</span>
                                                {addon && <span className="ofi-prod-tag is-addon">{orderKindLabel(order)}</span>}
                                                {cancelled && <span className="ofi-prod-tag is-cancelled">{t('production.status.cancelled')}</span>}
                                            </div>
                                        </td>
                                        <td className="text-right">{quantity(item.quantity, item.unit)}</td>
                                        <td className="text-right">{money(item.unitPrice)}</td>
                                        <td><Money value={item.totalPrice} /></td>
                                        <td><Money value={figures.orderedTotal} dimZero /></td>
                                        <td><Money value={figures.receivedTotal} dimZero /></td>
                                        <td><Money value={figures.difference} tone={differenceTone(figures)} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        );
    } else if (tab === 'confirmed') {
        content = (
            <SectionCard>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[1080px]">
                        <colgroup>
                            <col style={{ width: 170 }} />
                            <col />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 110 }} />
                            <col style={{ width: 124 }} />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 104 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.columns.purchaseOrder')}</th>
                                <th className="text-left">{t('production.columns.article')}</th>
                                <th className="text-right">{t('production.columns.quantity')}</th>
                                <th className="text-right">{t('production.columns.netPrice')}</th>
                                <th className="text-right">{t('production.columns.discount')}</th>
                                <th className="text-right">{t('production.columns.lineTotal')}</th>
                                <th className="text-right">{t('production.columns.received')}</th>
                                <th className="text-left">{t('production.columns.approvedAt')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || confirmedCount === 0) && (
                                <TableStateRow colSpan={8} loading={loading} emptyText={t('production.project.noConfirmed')} skeletonRows={3} />
                            )}
                            {shown?.confirmedGroups.map((group) => (
                                <GroupRows key={group.item?.id ?? 'none'} grouped={grouped} group={group} onOpen={setDeviceId} cells={lineCells} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        );
    } else if (tab === 'comparison') {
        content = (
            <SectionCard>
                {shown ? (
                    <CostComparisonTable
                        labelHeader={t('production.columns.device')}
                        emptyText={t('production.project.noDevices')}
                        total={shown.figures}
                        rows={shown.comparison.map((row) => ({
                            key: row.item?.id ?? 'none',
                            label: row.item
                                ? <DeviceChip item={row.item} onOpen={setDeviceId} />
                                : <span className="text-[12.5px] text-slate-500">{t('production.project.unassigned')}</span>,
                            figures: row.figures,
                            muted: Boolean(row.item && !row.item.isActive),
                            ...(row.item ? { onClick: () => setDeviceId(row.item!.id) } : {}),
                        }))}
                    />
                ) : (
                    <div className="ofi-prod-empty">{loading ? t('common.loading') : t('production.loadFailed')}</div>
                )}
            </SectionCard>
        );
    } else {
        content = (
            <SectionCard>
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-tree ofi-prod-flat w-full min-w-[860px]">
                        <colgroup>
                            <col style={{ width: 170 }} />
                            <col />
                            <col style={{ width: 260 }} />
                            <col style={{ width: 170 }} />
                            <col style={{ width: 112 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.columns.purchaseOrder')}</th>
                                <th className="text-left">{t('production.columns.supplier')}</th>
                                <th className="text-left">{t('production.columns.devices')}</th>
                                <th className="text-left">{t('production.columns.status')}</th>
                                <th className="text-left">{t('production.columns.date')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || !shown?.purchaseOrders.length) && (
                                <TableStateRow colSpan={5} loading={loading} emptyText={t('production.project.noPurchaseOrders')} skeletonRows={3} />
                            )}
                            {shown?.purchaseOrders.map((order) => {
                                const names = order.itemIds.map((id) => itemById.get(id)?.name).filter(Boolean) as string[];
                                return (
                                    <tr key={order.id} className="is-clickable" onClick={() => openPurchaseOrder(order.id)}>
                                        <td>{poLink(order.id, order.referenceNumber)}</td>
                                        <td className="max-w-0"><span className="block truncate">{order.supplierName ?? '—'}</span></td>
                                        <td className="max-w-0">
                                            <span className="ofi-prod-cell__sub block truncate" title={names.join(', ')}>
                                                {names.length ? names.join(', ') : '—'}
                                            </span>
                                        </td>
                                        <td><PoStatus status={order.status} /></td>
                                        <td className="text-[12px]">{fmtDate(order.createdAt)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
        );
    }

    return (
        <div className="ofi-prod-page">
            <InventoryListHeader
                title={title}
                action={tab === 'confirmed' ? (
                    <button
                        type="button"
                        className={`ofi-prod-iconbtn is-wide ofi-nosize ${exporting ? 'is-busy' : ''}`}
                        onClick={() => void exportPdf()}
                        disabled={exporting || confirmedCount === 0}
                        title={t('production.pdf.title')}
                    >
                        <File05 />
                        {t('production.pdf.button')}
                    </button>
                ) : undefined}
            />

            {project && (
                <div className="ofi-prod-projecthead -mt-3">
                    <span className={`ofi-prod-tag ${project.sourceKind === 'DELIVERY' ? 'is-delivery' : ''}`}>
                        {project.sourceKind === 'DELIVERY' ? t('production.kind.delivery') : t('production.kind.project')}
                    </span>
                    {project.customerName && <span>{t('production.columns.customer')}: <b>{project.customerName}</b></span>}
                    {project.sourceTenantName && <span>{t('production.columns.company')}: <b>{project.sourceTenantName}</b></span>}
                    <span>{t('production.project.orders', { count: shown?.orders.length ?? 0 })}</span>
                    {!project.isActive && <span className="ofi-prod-tag is-cancelled">{t('production.status.cancelled')}</span>}
                </div>
            )}

            {error && <div className="ofi-prod-note is-warn">{error}</div>}

            {shown && <CostTiles figures={shown.figures} />}

            <div className="ofi-prod-segment" role="tablist">
                {tabs.map((entry) => (
                    <button
                        key={entry.key}
                        type="button"
                        role="tab"
                        aria-selected={tab === entry.key}
                        className={tab === entry.key ? 'is-on' : ''}
                        onClick={() => setTab(entry.key)}
                    >
                        {entry.label}
                        {entry.count !== undefined && <span>{entry.count}</span>}
                    </button>
                ))}
            </div>

            {content}

            <DevicePopup itemId={deviceId} onClose={() => setDeviceId(null)} />
        </div>
    );
};

/** Die Zeilen eines Geräts; bei mehreren Geräten mit Überschrift (Vorgabe: «unter Geräteüberschriften»). */
const GroupRows = ({
    group,
    grouped,
    onOpen,
    cells,
}: {
    group: ProductionProjectDetail['confirmedGroups'][number];
    grouped: boolean;
    onOpen: (itemId: string) => void;
    cells: (line: ProductionConfirmedLine) => ReactNode;
}) => (
    <>
        {grouped && (
            <tr className="is-group">
                <td colSpan={5}>
                    <div className="ofi-prod-cell">
                        {group.item
                            ? <DeviceChip item={group.item} onOpen={onOpen} large />
                            : <span className="text-[12.5px] font-medium text-slate-500">{t('production.project.unassigned')}</span>}
                        <span className="ofi-prod-cell__sub">
                            {t('production.project.groupSummary', {
                                count: group.lines.length,
                                sales: money(group.figures.salesTotal),
                            })}
                        </span>
                        <span className={`ofi-prod-money ${differenceTone(group.figures)}`} title={t('production.figures.difference')}>
                            {t('production.project.groupDifference', { amount: money(group.figures.difference) })}
                        </span>
                    </div>
                </td>
                <td><Money value={group.figures.orderedTotal} /></td>
                <td colSpan={2} />
            </tr>
        )}
        {group.lines.map((line) => <tr key={line.id}>{cells(line)}</tr>)}
    </>
);
