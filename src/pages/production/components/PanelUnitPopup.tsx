import { useEffect, useState } from 'react';
import { ExternalLink, PackagePlus, Printer, Save } from 'lucide-react';

import { PopupButton, PopupCard, PopupEmpty, PopupField, PopupNote } from '@/components/ui-shared/PopupKit';
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

type Tab = 'details' | 'orders';

export const PanelUnitPopup = ({ unitId, onClose, onChanged }: {
    unitId: string | null;
    onClose: () => void;
    onChanged: (unit?: PanelUnit) => void;
}) => {
    const [unit, setUnit] = useState<PanelUnit | null>(null);
    const [failed, setFailed] = useState(false);
    const [tab, setTab] = useState<Tab>('details');
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
        if (!unitId) return;
        let alive = true;
        setUnit(null); setFailed(false); setError(null); setTab('details');
        panelApi.unit(unitId).then((value) => {
            if (!alive) return;
            setUnit(value);
            setProjectId(value.productionProjectId ?? '');
            setDeviceId(value.productionItemId ?? '');
            setSchemaNumber(value.schemaNumber ?? '');
            setSchemaRevision(value.schemaRevision ?? '');
            setStatus(value.status);
        }).catch(() => { if (alive) setFailed(true); });
        productionApi.pickerProjects().then((rows) => { if (alive) setProjects(rows); }).catch(() => undefined);
        return () => { alive = false; };
    }, [unitId]);

    useEffect(() => {
        let alive = true;
        setDevices([]);
        if (!projectId) return undefined;
        productionApi.pickerProject(projectId).then((result) => {
            if (alive) setDevices(flattenItems(result.orders).filter((item) => item.kind === 'DEVICE' && item.isActive));
        }).catch(() => undefined);
        return () => { alive = false; };
    }, [projectId]);

    useEffect(() => {
        if (tab !== 'orders' || !unit) return;
        let alive = true;
        setOrdersLoading(true); setItemDetail(null); setProjectDetail(null);
        const request = unit.productionItemId
            ? productionApi.item(unit.productionItemId).then((value) => { if (alive) setItemDetail(value); })
            : unit.productionProjectId
                ? productionApi.project(unit.productionProjectId).then((value) => { if (alive) setProjectDetail(value); })
                : Promise.resolve();
        request.catch(() => undefined).finally(() => { if (alive) setOrdersLoading(false); });
        return () => { alive = false; };
    }, [tab, unit]);

    const run = async (kind: 'save' | 'stock' | 'label', action: () => Promise<PanelUnit | void>) => {
        setBusy(kind); setError(null);
        try {
            const updated = await action();
            if (updated) {
                setUnit((current) => current ? { ...current, ...updated, model: updated.model ?? current.model } : updated);
                onChanged(updated);
            } else {
                onChanged();
            }
        } catch (failure) {
            const info = productionErrorOf(failure);
            if (info.code === 'NAMEPLATE_INCOMPLETE') {
                const fields = ((info.details as { missing?: Array<{ label: string }> })?.missing ?? []).map((row) => row.label).join(', ');
                setError(t('panels.err.nameplateIncomplete', { fields }));
            } else setError(info.message || t('panels.err.saveFailed'));
        } finally { setBusy(null); }
    };

    const printLabel = () => unit && run('label', async () => {
        const result = await panelApi.printLabel(unit.id);
        await openPanelLabelPdf([result.nameplate], result.label, {
            model: t('panels.label.model'), serial: t('panels.label.serial'), year: t('panels.label.year'),
            phases: t('panels.label.phases'), protection: t('panels.label.protection'), standard: t('panels.label.standard'), order: t('panels.label.order'),
        });
        return result.unit;
    });

    return (
        <PopupCard
            open={Boolean(unitId)}
            onClose={onClose}
            width={780}
            title={<span className="ofi-panel-mono">{unit?.serialNumber ?? t('panels.unit.title')}</span>}
            subtitle={unit ? `${unit.model?.modelNumber ?? unit.modelNumberSnapshot ?? ''} · ${t(`panels.status.${unit.status}`)}` : undefined}
            bodyClassName="ofi-panel-swift-pop"
        >
            {!unit && <PopupEmpty>{failed ? t('panels.loadFailed') : t('common.loading')}</PopupEmpty>}
            {unit && (
                <div className="ofi-panel-pop">
                    <div className="ofi-panel-popup-tabs" role="tablist">
                        <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>{t('panelCenter.details')}</button>
                        <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'is-on' : ''} onClick={() => setTab('orders')}>{t('production.columns.orders')}</button>
                    </div>

                    {tab === 'details' ? (
                        <>
                            <div className="ofi-panel-numbers">
                                <div><span className="ofi-panel-sub">{t('panels.columns.serial')}</span><strong className="ofi-panel-mono">{unit.serialNumber}</strong></div>
                                <div><span className="ofi-panel-sub">{t('panels.columns.modelNumber')}</span><strong className="ofi-panel-mono">{unit.model?.modelNumber ?? unit.modelNumberSnapshot ?? '—'}</strong></div>
                                <div><span className="ofi-panel-sub">{t('panels.columns.order')}</span><strong>{unit.orderNumber ?? '—'}</strong></div>
                            </div>

                            <div className="ofi-panel-grid ofi-panel-unit-fields">
                                <PopupField label={t('production.columns.project')} hint={t('panelCenter.optional')} className="col-span-2">
                                    <select className={CELL_INPUT_CLASS} value={projectId} onChange={(event) => { setProjectId(event.target.value); setDeviceId(''); }}><option value="">{t('panelCenter.noProject')}</option>{projects.map((project) => <option key={project.id} value={project.id}>{`${project.projectNumber} · ${project.projectName}`}</option>)}</select>
                                </PopupField>
                                <PopupField label={t('production.columns.device')} hint={t('panelCenter.optional')} className="col-span-2">
                                    <select className={CELL_INPUT_CLASS} value={deviceId} disabled={!projectId} onChange={(event) => setDeviceId(event.target.value)}><option value="">{t('panelCenter.noDevice')}</option>{devices.map((device) => <option key={device.id} value={device.id}>{`${device.positionNumber ?? '—'} · ${device.name}`}</option>)}</select>
                                </PopupField>
                                <PopupField label={t('panels.unit.schemaNumber')}><input className={CELL_INPUT_CLASS} value={schemaNumber} onChange={(event) => setSchemaNumber(event.target.value)} /></PopupField>
                                <PopupField label={t('panels.unit.schemaRevision')}><input className={CELL_INPUT_CLASS} value={schemaRevision} onChange={(event) => setSchemaRevision(event.target.value)} /></PopupField>
                                <PopupField label={t('panels.columns.state')}>
                                    <select className={CELL_INPUT_CLASS} value={status} onChange={(event) => setStatus(event.target.value)}>{PANEL_UNIT_STATUSES.map((value) => <option key={value} value={value}>{t(`panels.status.${value}`)}</option>)}</select>
                                </PopupField>
                            </div>

                            <dl className="ofi-panel-swift-meta">
                                <div><dt>{t('panels.columns.customer')}</dt><dd>{unit.customerName ?? '—'}</dd></div>
                                <div><dt>{t('panels.columns.site')}</dt><dd>{unit.siteName ?? '—'}</dd></div>
                                <div><dt>{t('panels.unit.manufactured')}</dt><dd>{unit.manufacturedAt ? fmtDate(unit.manufacturedAt) : '—'}</dd></div>
                                <div><dt>{t('panels.unit.labelPrinted')}</dt><dd>{unit.labelPrintedAt ? fmtDate(unit.labelPrintedAt) : '—'}</dd></div>
                            </dl>

                            {(unit.missingNameplate?.length ?? 0) > 0 && <PopupNote tone="warning">{t('panels.err.nameplateIncomplete', { fields: unit.missingNameplate!.map((row) => row.label).join(', ') })}</PopupNote>}
                            {error && <PopupNote tone="warning">{error}</PopupNote>}
                            <div className="ofi-panel-actions">
                                <PopupButton icon={<Save size={16} />} loading={busy === 'save'} onClick={() => run('save', async () => {
                                    const updated = await panelApi.updateUnit(unit.id, { productionProjectId: projectId || null, productionItemId: deviceId || null, schemaNumber: schemaNumber.trim() || null, schemaRevision: schemaRevision.trim() || null });
                                    return status !== unit.status ? panelApi.setStatus(unit.id, status) : updated;
                                })}>{t('common.save')}</PopupButton>
                                <PopupButton icon={<PackagePlus size={16} />} loading={busy === 'stock'} disabled={Boolean(unit.stockMovementId)} onClick={() => run('stock', () => panelApi.stockIn(unit.id))}>{unit.stockMovementId ? t('panels.unit.stockedAlready') : t('panels.unit.stockIn')}</PopupButton>
                                <PopupButton variant="primary" icon={<Printer size={16} />} loading={busy === 'label'} disabled={(unit.missingNameplate?.length ?? 0) > 0} onClick={printLabel}>{t('panels.unit.printLabel')}</PopupButton>
                            </div>
                        </>
                    ) : (
                        <div className="ofi-panel-popup-orders">
                            {!unit.productionProjectId && !unit.productionItemId ? <PopupEmpty>{t('panelCenter.noLinkText')}</PopupEmpty>
                                : itemDetail ? <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[680px]">
                                    <thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.article')}</th><th className="text-right">{t('production.columns.lineTotal')}</th><th>{t('production.columns.status')}</th></tr></thead>
                                    <tbody>
                                        {itemDetail.confirmedLines.map((line) => <tr key={line.id}><td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.purchaseOrderNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td>{t('production.project.tabConfirmed')}</td></tr>)}
                                        {itemDetail.openRows.map((line) => <tr key={`${line.purchaseOrderId}-${line.lineIndex}`}><td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td>{t('production.figures.open')}</td></tr>)}
                                        {!itemDetail.confirmedLines.length && !itemDetail.openRows.length && <TableStateRow colSpan={5} loading={false} emptyText={t('production.device.noConfirmed')} />}
                                    </tbody>
                                </table></div>
                                : projectDetail ? <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[580px]"><thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.status')}</th><th>{t('production.columns.date')}</th></tr></thead><tbody>{projectDetail.purchaseOrders.map((order) => <tr key={order.id}><td><a className="ofi-prod-link" href={`/inventory/orders/${order.id}`}><PurchaseCode value={order.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{order.supplierName ?? '—'}</td><td>{order.status}</td><td>{fmtDate(order.createdAt)}</td></tr>)}{!projectDetail.purchaseOrders.length && <TableStateRow colSpan={4} loading={false} emptyText={t('production.project.noPurchaseOrders')} />}</tbody></table></div>
                                    : <PopupEmpty>{ordersLoading ? t('common.loading') : t('production.loadFailed')}</PopupEmpty>}
                        </div>
                    )}
                </div>
            )}
        </PopupCard>
    );
};
