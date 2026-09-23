import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, PackagePlus, Printer, Save, X } from 'lucide-react';

import { CELL_INPUT_CLASS, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { panelApi } from '@/lib/api/panels';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import { fmtDate } from '@/pages/inventory/utils/format';
import { PANEL_UNIT_STATUSES, type PanelUnit } from '@/types/panel';
import type { ProductionItem, ProductionItemDetail, ProductionOrderNode, ProductionPickerProject, ProductionProjectDetail } from '@/types/production';
import { openPanelLabelPdf } from '@/utils/pdf/panelLabelPdf';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';

const flattenItems = (nodes: ProductionOrderNode[]): ProductionItem[] => nodes.flatMap((node) => [
    ...node.items.map((entry) => entry.item),
    ...flattenItems(node.addons),
]);

const money = (value: number, currency = 'CHF') => new Intl.NumberFormat('de-CH', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(value) || 0);

type DetailTab = 'details' | 'orders';

export const PanelUnitInlineDetail = ({
    unitId,
    onClose,
    onUpdated,
}: {
    unitId: string;
    onClose: () => void;
    onUpdated: (unit: PanelUnit) => void;
}) => {
    const [unit, setUnit] = useState<PanelUnit | null>(null);
    const [tab, setTab] = useState<DetailTab>('details');
    const [projects, setProjects] = useState<ProductionPickerProject[]>([]);
    const [devices, setDevices] = useState<ProductionItem[]>([]);
    const [projectId, setProjectId] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [schemaNumber, setSchemaNumber] = useState('');
    const [schemaRevision, setSchemaRevision] = useState('');
    const [status, setStatus] = useState('PLANNED');
    const [itemDetail, setItemDetail] = useState<ProductionItemDetail | null>(null);
    const [projectDetail, setProjectDetail] = useState<ProductionProjectDetail | null>(null);
    const [ordersLoading, setOrdersLoading] = useState(false);
    const [busy, setBusy] = useState<'save' | 'stock' | 'label' | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let alive = true;
        setUnit(null);
        setError(null);
        panelApi.unit(unitId).then((value) => {
            if (!alive) return;
            setUnit(value);
            setProjectId(value.productionProjectId ?? '');
            setDeviceId(value.productionItemId ?? '');
            setSchemaNumber(value.schemaNumber ?? '');
            setSchemaRevision(value.schemaRevision ?? '');
            setStatus(value.status);
        }).catch((failure) => {
            if (alive) setError(productionErrorOf(failure).message || t('panels.loadFailed'));
        });
        productionApi.pickerProjects().then((rows) => { if (alive) setProjects(rows); }).catch(() => undefined);
        return () => { alive = false; };
    }, [unitId]);

    useEffect(() => {
        let alive = true;
        setDevices([]);
        if (!projectId) {
            setDeviceId('');
            return undefined;
        }
        productionApi.pickerProject(projectId).then((result) => {
            if (alive) setDevices(flattenItems(result.orders).filter((item) => item.kind === 'DEVICE' && item.isActive));
        }).catch(() => undefined);
        return () => { alive = false; };
    }, [projectId]);

    useEffect(() => {
        if (tab !== 'orders' || !unit) return;
        let alive = true;
        setOrdersLoading(true);
        setItemDetail(null);
        setProjectDetail(null);
        const request = unit.productionItemId
            ? productionApi.item(unit.productionItemId).then((value) => { if (alive) setItemDetail(value); })
            : unit.productionProjectId
                ? productionApi.project(unit.productionProjectId).then((value) => { if (alive) setProjectDetail(value); })
                : Promise.resolve();
        request.catch(() => undefined).finally(() => { if (alive) setOrdersLoading(false); });
        return () => { alive = false; };
    }, [tab, unit]);

    const selectedProject = projects.find((row) => row.id === (unit?.productionProjectId ?? ''));
    const selectedDevice = devices.find((row) => row.id === (unit?.productionItemId ?? ''));
    const linkedOrderCount = useMemo(() => {
        if (itemDetail) return itemDetail.confirmedLines.length + itemDetail.openRows.length;
        return projectDetail?.purchaseOrders.length ?? 0;
    }, [itemDetail, projectDetail]);

    const run = async (kind: 'save' | 'stock' | 'label', action: () => Promise<PanelUnit | void>) => {
        setBusy(kind);
        setError(null);
        try {
            const updated = await action();
            if (updated) {
                setUnit((current) => current ? { ...current, ...updated, model: current.model } : updated);
                onUpdated(updated);
            }
        } catch (failure) {
            const info = productionErrorOf(failure);
            if (info.code === 'NAMEPLATE_INCOMPLETE') {
                const fields = ((info.details as { missing?: Array<{ label: string }> })?.missing ?? []).map((row) => row.label).join(', ');
                setError(t('panels.err.nameplateIncomplete', { fields }));
            } else setError(info.message || t('panels.err.saveFailed'));
        } finally {
            setBusy(null);
        }
    };

    if (!unit) {
        return (
            <section className="ofi-panel-detail">
                <div className="ofi-panel-detail__head"><strong>{t('common.loading')}</strong><button type="button" className="ofi-btn-plain" onClick={onClose}><X size={18} /></button></div>
                {error && <div className="ofi-prod-note is-warn">{error}</div>}
            </section>
        );
    }

    const printLabel = () => run('label', async () => {
        const result = await panelApi.printLabel(unit.id);
        await openPanelLabelPdf([result.nameplate], result.label, {
            model: t('panels.label.model'), serial: t('panels.label.serial'), year: t('panels.label.year'),
            phases: t('panels.label.phases'), protection: t('panels.label.protection'), standard: t('panels.label.standard'), order: t('panels.label.order'),
        });
        return result.unit;
    });

    return (
        <section className="ofi-panel-detail">
            <div className="ofi-panel-detail__head">
                <div>
                    <span>{t('panels.unit.title')}</span>
                    <strong className="ofi-panel-mono">{unit.serialNumber}</strong>
                    <small>{unit.model?.modelNumber ?? unit.modelNumberSnapshot ?? '—'}</small>
                </div>
                <button type="button" className="ofi-btn-plain" aria-label={t('common.close')} onClick={onClose}><X size={18} /></button>
            </div>

            <div className="ofi-prod-segment is-compact" role="tablist">
                <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>{t('panelCenter.details')}</button>
                <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'is-on' : ''} onClick={() => setTab('orders')}>
                    {t('production.columns.orders')}{linkedOrderCount > 0 && <span>{linkedOrderCount}</span>}
                </button>
            </div>

            {tab === 'details' ? (
                <>
                    <div className="ofi-panel-summarygrid">
                        <div><span>{t('panels.columns.customer')}</span><strong>{unit.customerName ?? '—'}</strong></div>
                        <div><span>{t('production.columns.project')}</span><strong>{selectedProject ? `${selectedProject.projectNumber} · ${selectedProject.projectName}` : '—'}</strong></div>
                        <div><span>{t('production.columns.device')}</span><strong>{selectedDevice?.name ?? '—'}</strong></div>
                        <div><span>{t('panels.unit.manufactured')}</span><strong>{unit.manufacturedAt ? fmtDate(unit.manufacturedAt) : '—'}</strong></div>
                    </div>

                    <div className="ofi-panel-formgrid is-detail">
                        <label className="ofi-panel-field is-wide"><span className="ofi-panel-field__label">{t('production.columns.project')} <i>{t('panelCenter.optional')}</i></span>
                            <select className={CELL_INPUT_CLASS} value={projectId} onChange={(event) => { setProjectId(event.target.value); setDeviceId(''); }}>
                                <option value="">{t('panelCenter.noProject')}</option>
                                {projects.map((project) => <option key={project.id} value={project.id}>{`${project.projectNumber} · ${project.projectName}`}</option>)}
                            </select>
                        </label>
                        <label className="ofi-panel-field is-wide"><span className="ofi-panel-field__label">{t('production.columns.device')} <i>{t('panelCenter.optional')}</i></span>
                            <select className={CELL_INPUT_CLASS} value={deviceId} disabled={!projectId} onChange={(event) => setDeviceId(event.target.value)}>
                                <option value="">{t('panelCenter.noDevice')}</option>
                                {devices.map((device) => <option key={device.id} value={device.id}>{`${device.positionNumber ?? '—'} · ${device.name}`}</option>)}
                            </select>
                        </label>
                        <label className="ofi-panel-field"><span className="ofi-panel-field__label">{t('panels.unit.schemaNumber')}</span><input className={CELL_INPUT_CLASS} value={schemaNumber} onChange={(event) => setSchemaNumber(event.target.value)} /></label>
                        <label className="ofi-panel-field"><span className="ofi-panel-field__label">{t('panels.unit.schemaRevision')}</span><input className={CELL_INPUT_CLASS} value={schemaRevision} onChange={(event) => setSchemaRevision(event.target.value)} /></label>
                        <label className="ofi-panel-field"><span className="ofi-panel-field__label">{t('panels.columns.state')}</span>
                            <select className={CELL_INPUT_CLASS} value={status} onChange={(event) => setStatus(event.target.value)}>
                                {PANEL_UNIT_STATUSES.map((value) => <option key={value} value={value}>{t(`panels.status.${value}`)}</option>)}
                            </select>
                        </label>
                    </div>

                    {(unit.missingNameplate?.length ?? 0) > 0 && <div className="ofi-prod-note is-warn">{t('panels.err.nameplateIncomplete', { fields: unit.missingNameplate!.map((row) => row.label).join(', ') })}</div>}
                    {error && <div className="ofi-prod-note is-warn">{error}</div>}
                    <div className="ofi-panel-detail__actions">
                        <button type="button" className="ofi-btn" disabled={busy !== null} onClick={() => run('save', async () => {
                            const updated = await panelApi.updateUnit(unit.id, {
                                productionProjectId: projectId || null,
                                productionItemId: deviceId || null,
                                schemaNumber: schemaNumber.trim() || null,
                                schemaRevision: schemaRevision.trim() || null,
                            });
                            if (status !== unit.status) return panelApi.setStatus(unit.id, status);
                            return updated;
                        })}><Save size={16} />{busy === 'save' ? t('common.saving') : t('common.save')}</button>
                        <button type="button" className="ofi-btn" disabled={Boolean(unit.stockMovementId) || busy !== null} onClick={() => run('stock', () => panelApi.stockIn(unit.id))}><PackagePlus size={16} />{unit.stockMovementId ? t('panels.unit.stockedAlready') : t('panels.unit.stockIn')}</button>
                        <button type="button" className="ofi-btn is-primary" disabled={(unit.missingNameplate?.length ?? 0) > 0 || busy !== null} onClick={printLabel}><Printer size={16} />{t('panels.unit.printLabel')}</button>
                    </div>
                </>
            ) : (
                <div className="ofi-panel-orders">
                    {!unit.productionProjectId && !unit.productionItemId ? (
                        <div className="ofi-panel-empty"><strong>{t('panelCenter.noLinkTitle')}</strong><span>{t('panelCenter.noLinkText')}</span></div>
                    ) : itemDetail ? (
                        <div className="overflow-x-auto">
                            <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[720px]">
                                <thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.article')}</th><th className="text-right">{t('production.columns.quantity')}</th><th className="text-right">{t('production.columns.lineTotal')}</th><th>{t('production.columns.status')}</th></tr></thead>
                                <tbody>
                                    {itemDetail.confirmedLines.map((line) => <tr key={`confirmed-${line.id}`}>
                                        <td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.purchaseOrderNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{line.quantity}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td><span className="ofi-panel-chip is-stocked">{t('production.project.tabConfirmed')}</span></td>
                                    </tr>)}
                                    {itemDetail.openRows.map((line) => <tr key={`open-${line.purchaseOrderId}-${line.lineIndex}`}>
                                        <td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{line.quantity}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td><span className="ofi-panel-chip">{t('production.figures.open')}</span></td>
                                    </tr>)}
                                    {!itemDetail.confirmedLines.length && !itemDetail.openRows.length && <TableStateRow colSpan={6} loading={false} emptyText={t('production.device.noConfirmed')} />}
                                </tbody>
                            </table>
                        </div>
                    ) : projectDetail ? (
                        <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[620px]">
                            <thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.status')}</th><th>{t('production.columns.date')}</th></tr></thead>
                            <tbody>{projectDetail.purchaseOrders.map((order) => <tr key={order.id}><td><a className="ofi-prod-link" href={`/inventory/orders/${order.id}`}><PurchaseCode value={order.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{order.supplierName ?? '—'}</td><td>{order.status}</td><td>{fmtDate(order.createdAt)}</td></tr>)}{!projectDetail.purchaseOrders.length && <TableStateRow colSpan={4} loading={false} emptyText={t('production.project.noPurchaseOrders')} />}</tbody>
                        </table></div>
                    ) : <div className="ofi-panel-empty">{ordersLoading ? t('common.loading') : t('production.loadFailed')}</div>}
                </div>
            )}
        </section>
    );
};
