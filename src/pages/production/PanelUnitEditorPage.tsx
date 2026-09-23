import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, PackagePlus, Printer, Save, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';

import { TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { panelApi, refreshPanelUnits } from '@/lib/api/panels';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDate } from '@/pages/inventory/utils/format';
import { PANEL_UNIT_STATUSES, type PanelModel, type PanelSettingsPage, type PanelUnit } from '@/types/panel';
import type { ProductionItem, ProductionItemDetail, ProductionOrderNode, ProductionPickerProject, ProductionProjectDetail } from '@/types/production';
import { openPanelLabelPdf } from '@/utils/pdf/panelLabelPdf';
import '@/styles/modules/production.css';
import '@/styles/modules/panels.css';

import { PanelEditorPage, PanelMacSelect, PanelPageActions, PanelPageField, PanelPageNotice, PanelPageSection } from './components/PanelEditorKit';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';

const flattenItems = (nodes: ProductionOrderNode[]): ProductionItem[] => nodes.flatMap((node) => [
    ...node.items.map((entry) => entry.item),
    ...flattenItems(node.addons),
]);

const money = (value: number, currency = 'CHF') => new Intl.NumberFormat('de-CH', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
}).format(Number(value) || 0);

type Tab = 'details' | 'orders';

export const PanelUnitEditorPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const { unitId } = useParams<{ unitId: string }>();
    const editing = Boolean(unitId);
    const [unit, setUnit] = useState<PanelUnit | null>(null);
    const [models, setModels] = useState<PanelModel[]>([]);
    const [settings, setSettings] = useState<PanelSettingsPage | null>(null);
    const [projects, setProjects] = useState<ProductionPickerProject[]>([]);
    const [devices, setDevices] = useState<ProductionItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadingDevices, setLoadingDevices] = useState(false);
    const [tab, setTab] = useState<Tab>('details');
    const [panelModelId, setPanelModelId] = useState('');
    const [count, setCount] = useState('1');
    const [projectId, setProjectId] = useState('');
    const [deviceId, setDeviceId] = useState('');
    const [orderNumber, setOrderNumber] = useState('');
    const [customerName, setCustomerName] = useState('');
    const [siteName, setSiteName] = useState('');
    const [schemaNumber, setSchemaNumber] = useState('');
    const [schemaRevision, setSchemaRevision] = useState('');
    const [status, setStatus] = useState('PLANNED');
    const [retro, setRetro] = useState(false);
    const [busy, setBusy] = useState<'save' | 'stock' | 'label' | 'delete' | null>(null);
    const [deleteAsk, setDeleteAsk] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [itemDetail, setItemDetail] = useState<ProductionItemDetail | null>(null);
    const [projectDetail, setProjectDetail] = useState<ProductionProjectDetail | null>(null);
    const [ordersLoading, setOrdersLoading] = useState(false);

    useEffect(() => {
        let alive = true;
        setLoading(true);
        Promise.all([
            panelApi.models({ active: 'true' }),
            panelApi.settings(),
            productionApi.pickerProjects(),
            unitId ? panelApi.unit(unitId) : Promise.resolve(null),
        ]).then(([modelRows, settingPage, projectRows, current]) => {
            if (!alive) return;
            setModels(modelRows);
            setSettings(settingPage);
            setProjects(projectRows);
            setPanelModelId(current?.panelModelId ?? modelRows[0]?.id ?? '');
            setUnit(current);
            setProjectId(current?.productionProjectId ?? '');
            setDeviceId(current?.productionItemId ?? '');
            setOrderNumber(current?.orderNumber ?? '');
            setCustomerName(current?.customerName ?? '');
            setSiteName(current?.siteName ?? '');
            setSchemaNumber(current?.schemaNumber ?? '');
            setSchemaRevision(current?.schemaRevision ?? '');
            setStatus(current?.status ?? 'PLANNED');
        }).catch((failure) => {
            if (alive) setError(productionErrorOf(failure).message || t('panels.loadFailed'));
        }).finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [unitId]);

    useEffect(() => {
        let alive = true;
        setDevices([]);
        if (!projectId) return undefined;
        setLoadingDevices(true);
        productionApi.pickerProject(projectId)
            .then((result) => { if (alive) setDevices(flattenItems(result.orders).filter((item) => item.kind === 'DEVICE' && item.isActive)); })
            .catch(() => { if (alive) setDevices([]); })
            .finally(() => { if (alive) setLoadingDevices(false); });
        return () => { alive = false; };
    }, [projectId]);

    useEffect(() => {
        if (!editing || tab !== 'orders' || !unit) return;
        let alive = true;
        setOrdersLoading(true); setItemDetail(null); setProjectDetail(null);
        const request = unit.productionItemId
            ? productionApi.item(unit.productionItemId).then((value) => { if (alive) setItemDetail(value); })
            : unit.productionProjectId
                ? productionApi.project(unit.productionProjectId).then((value) => { if (alive) setProjectDetail(value); })
                : Promise.resolve();
        request.catch(() => undefined).finally(() => { if (alive) setOrdersLoading(false); });
        return () => { alive = false; };
    }, [editing, tab, unit]);

    const amount = Math.max(1, Math.min(200, Math.trunc(Number(count) || 1)));
    const selectedProject = useMemo(() => projects.find((row) => row.id === projectId) ?? null, [projects, projectId]);
    const updateProject = (next: string) => {
        setProjectId(next); setDeviceId('');
        if (!editing) {
            const project = projects.find((row) => row.id === next);
            if (project?.customerName && !customerName) setCustomerName(project.customerName);
        }
    };

    const save = async () => {
        if ((!editing && !panelModelId) || busy) return;
        setBusy('save'); setError(null);
        try {
            if (!editing) {
                await panelApi.issueSerials({
                    panelModelId, count: amount, retro,
                    productionProjectId: projectId || null,
                    productionItemId: deviceId || null,
                    orderNumber: orderNumber.trim() || null,
                    customerName: customerName.trim() || null,
                    siteName: siteName.trim() || null,
                });
                await refreshPanelUnits({});
                navigate('/production/panels', { replace: true });
                return;
            }
            if (!unit) return;
            let updated = await panelApi.updateUnit(unit.id, {
                productionProjectId: projectId || null,
                productionItemId: deviceId || null,
                orderNumber: orderNumber.trim() || null,
                customerName: customerName.trim() || null,
                siteName: siteName.trim() || null,
                schemaNumber: schemaNumber.trim() || null,
                schemaRevision: schemaRevision.trim() || null,
            });
            if (status !== unit.status) updated = await panelApi.setStatus(unit.id, status);
            const fresh = await panelApi.unit(unit.id);
            setUnit({ ...fresh, ...updated, model: fresh.model });
            await refreshPanelUnits({});
        } catch (failure) {
            setError(productionErrorOf(failure).message || t('panels.err.saveFailed'));
        } finally { setBusy(null); }
    };

    const stockIn = async () => {
        if (!unit || busy) return;
        setBusy('stock'); setError(null);
        try {
            await panelApi.stockIn(unit.id);
            const fresh = await panelApi.unit(unit.id);
            setUnit(fresh); setStatus(fresh.status);
            await refreshPanelUnits({});
        } catch (failure) { setError(productionErrorOf(failure).message || t('panels.err.saveFailed')); }
        finally { setBusy(null); }
    };

    const printLabel = async () => {
        if (!unit || busy) return;
        setBusy('label'); setError(null);
        try {
            const result = await panelApi.printLabel(unit.id);
            await openPanelLabelPdf([result.nameplate], result.label, {
                model: t('panels.label.model'), serial: t('panels.label.serial'), year: t('panels.label.year'),
                phases: t('panels.label.phases'), protection: t('panels.label.protection'), standard: t('panels.label.standard'), order: t('panels.label.order'),
            });
            setUnit((current) => current ? { ...current, ...result.unit, model: current.model } : result.unit);
            await refreshPanelUnits({});
        } catch (failure) { setError(productionErrorOf(failure).message || t('panels.err.saveFailed')); }
        finally { setBusy(null); }
    };

    const remove = async () => {
        if (!unit || !deleteAsk || busy) return;
        setBusy('delete'); setError(null);
        try {
            await panelApi.deleteUnit(unit.id);
            await refreshPanelUnits({});
            navigate('/production/panels', { replace: true });
        } catch (failure) {
            setError(productionErrorOf(failure).message || t('panels.err.saveFailed'));
            setDeleteAsk(false);
        } finally { setBusy(null); }
    };

    if (loading) return <div className="ofi-panel-page-state">{t('common.loading')}</div>;

    return (
        <PanelEditorPage
            title={editing ? (unit?.serialNumber ?? t('panels.unit.title')) : t('panels.issue.title')}
            subtitle={editing ? `${unit?.model?.modelNumber ?? unit?.modelNumberSnapshot ?? ''} · ${t(`panels.status.${unit?.status ?? 'PLANNED'}`)}` : t('panelCenter.issueSubtitle')}
        >
            {editing && (
                <div className="ofi-panel-page-tabs" role="tablist">
                    <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'is-on' : ''} onClick={() => setTab('details')}>{t('panelCenter.details')}</button>
                    <button type="button" role="tab" aria-selected={tab === 'orders'} className={tab === 'orders' ? 'is-on' : ''} onClick={() => setTab('orders')}>{t('production.columns.orders')}</button>
                </div>
            )}

            {tab === 'details' && (
                <>
                    {!editing && (
                        <PanelPageSection title={t('panels.issue.model')} description={t('panels.issue.note')}>
                            <div className="ofi-panel-page-grid">
                                <PanelPageField label={t('panels.issue.model')} wide required>
                                    <PanelMacSelect
                                        value={panelModelId}
                                        onChange={setPanelModelId}
                                        ariaLabel={t('panels.issue.model')}
                                        options={models.length ? models.map((row) => ({ value: row.id, label: `${row.modelNumber} · ${row.article?.name ?? ''}` })) : [{ value: '', label: t('panels.issue.noModels') }]}
                                    />
                                </PanelPageField>
                                <PanelPageField label={t('panels.issue.count')} required hint={t('panels.issue.countHint')}><input className="ofi-panel-page-control" inputMode="numeric" value={count} onChange={(event) => setCount(event.target.value)} /></PanelPageField>
                                <PanelPageField label={t('panels.columns.order')}><input className="ofi-panel-page-control" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></PanelPageField>
                            </div>
                        </PanelPageSection>
                    )}

                    {editing && unit && (
                        <dl className="ofi-panel-page-summary">
                            <div><dt>{t('panels.columns.serial')}</dt><dd>{unit.serialNumber}</dd></div>
                            <div><dt>{t('panels.columns.modelNumber')}</dt><dd>{unit.model?.modelNumber ?? unit.modelNumberSnapshot ?? '—'}</dd></div>
                            <div><dt>{t('panels.unit.manufactured')}</dt><dd>{unit.manufacturedAt ? fmtDate(unit.manufacturedAt) : '—'}</dd></div>
                            <div><dt>{t('panels.unit.labelPrinted')}</dt><dd>{unit.labelPrintedAt ? fmtDate(unit.labelPrintedAt) : '—'}</dd></div>
                        </dl>
                    )}

                    <PanelPageSection title={t('panelCenter.details')} description={t('panelCenter.issueSubtitle')}>
                        <div className="ofi-panel-page-grid">
                            <PanelPageField label={t('production.columns.project')} hint={t('panelCenter.optional')}>
                                <PanelMacSelect
                                    value={projectId}
                                    onChange={updateProject}
                                    ariaLabel={t('production.columns.project')}
                                    options={[{ value: '', label: t('panelCenter.noProject') }, ...projects.map((row) => ({ value: row.id, label: `${row.projectNumber} · ${row.projectName}` }))]}
                                />
                            </PanelPageField>
                            <PanelPageField label={t('production.columns.device')} hint={t('panelCenter.optional')}>
                                <PanelMacSelect
                                    value={deviceId}
                                    onChange={setDeviceId}
                                    disabled={!projectId || loadingDevices}
                                    ariaLabel={t('production.columns.device')}
                                    options={[{ value: '', label: loadingDevices ? t('common.loading') : t('panelCenter.noDevice') }, ...devices.map((row) => ({ value: row.id, label: `${row.positionNumber ?? '—'} · ${row.name}` }))]}
                                />
                            </PanelPageField>
                            <PanelPageField label={t('panels.columns.customer')}><input className="ofi-panel-page-control" value={customerName} onChange={(event) => setCustomerName(event.target.value)} /></PanelPageField>
                            <PanelPageField label={t('panels.columns.site')}><input className="ofi-panel-page-control" value={siteName} onChange={(event) => setSiteName(event.target.value)} /></PanelPageField>
                            {editing && <PanelPageField label={t('panels.columns.order')}><input className="ofi-panel-page-control" value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></PanelPageField>}
                            {editing && <PanelPageField label={t('panels.unit.schemaNumber')}><input className="ofi-panel-page-control" value={schemaNumber} onChange={(event) => setSchemaNumber(event.target.value)} /></PanelPageField>}
                            {editing && <PanelPageField label={t('panels.unit.schemaRevision')}><input className="ofi-panel-page-control" value={schemaRevision} onChange={(event) => setSchemaRevision(event.target.value)} /></PanelPageField>}
                            {editing && <PanelPageField label={t('panels.columns.state')}><PanelMacSelect value={status} onChange={setStatus} ariaLabel={t('panels.columns.state')} options={PANEL_UNIT_STATUSES.map((value) => ({ value, label: t(`panels.status.${value}`) }))} /></PanelPageField>}
                        </div>
                        {!editing && <label className={`ofi-panel-page-check ${settings?.settings.retroBlockStart ? '' : 'is-disabled'}`}><input type="checkbox" checked={retro} disabled={!settings?.settings.retroBlockStart} onChange={(event) => setRetro(event.target.checked)} /><span>{t('panels.issue.retro')}<small>{settings?.settings.retroBlockStart ? t('panels.issue.retroHint', { block: settings.settings.retroBlockStart }) : t('panels.issue.retroOff')}</small></span></label>}
                    </PanelPageSection>

                    {editing && unit && (unit.missingNameplate?.length ?? 0) > 0 && <PanelPageNotice danger>{t('panels.err.nameplateIncomplete', { fields: unit.missingNameplate!.map((row) => row.label).join(', ') })}</PanelPageNotice>}
                    {error && <PanelPageNotice danger>{error}</PanelPageNotice>}

                    <PanelPageActions>
                        {editing && !deleteAsk && <button type="button" className="ofi-panel-page-button is-danger" disabled={busy !== null} onClick={() => setDeleteAsk(true)}><Trash2 size={15} />{t('common.delete')}</button>}
                        {editing && deleteAsk && <div className="ofi-panel-inline-delete"><span>{t('panelCenter.deleteQuestion')}</span><button type="button" onClick={() => setDeleteAsk(false)}>{t('common.cancel')}</button><button type="button" className="is-danger" disabled={busy === 'delete'} onClick={remove}>{t('common.delete')}</button></div>}
                        <span />
                        {editing && unit && <button type="button" className="ofi-panel-page-button" disabled={busy !== null || Boolean(unit.stockMovementId)} onClick={stockIn}><PackagePlus size={15} />{unit.stockMovementId ? t('panels.unit.stockedAlready') : t('panels.unit.stockIn')}</button>}
                        {editing && unit && <button type="button" className="ofi-panel-page-button" disabled={busy !== null || (unit.missingNameplate?.length ?? 0) > 0} onClick={printLabel}><Printer size={15} />{t('panels.unit.printLabel')}</button>}
                        <button type="button" className="ofi-panel-page-button is-primary" disabled={busy !== null || (!editing && !panelModelId)} onClick={save}><Save size={15} />{busy === 'save' ? t('common.loading') : t('common.save')}</button>
                    </PanelPageActions>
                </>
            )}

            {editing && tab === 'orders' && unit && (
                <PanelPageSection title={t('production.columns.orders')} description={selectedProject?.projectName}>
                    <div className="ofi-panel-page-orders">
                        {!unit.productionProjectId && !unit.productionItemId ? <div className="ofi-panel-page-empty">{t('panelCenter.noLinkText')}</div>
                            : itemDetail ? <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[680px]"><thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.article')}</th><th className="text-right">{t('production.columns.lineTotal')}</th><th>{t('production.columns.status')}</th></tr></thead><tbody>{itemDetail.confirmedLines.map((line) => <tr key={line.id}><td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.purchaseOrderNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td>{t('production.project.tabConfirmed')}</td></tr>)}{itemDetail.openRows.map((line) => <tr key={`${line.purchaseOrderId}-${line.lineIndex}`}><td><a className="ofi-prod-link" href={`/inventory/orders/${line.purchaseOrderId}`}><PurchaseCode value={line.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{line.supplierName ?? '—'}</td><td>{line.name}</td><td className="text-right">{money(line.lineTotal, line.currency)}</td><td>{t('production.figures.open')}</td></tr>)}{!itemDetail.confirmedLines.length && !itemDetail.openRows.length && <TableStateRow colSpan={5} loading={false} emptyText={t('production.device.noConfirmed')} />}</tbody></table></div>
                            : projectDetail ? <div className="overflow-x-auto"><table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[580px]"><thead><tr><th>{t('production.columns.purchaseOrder')}</th><th>{t('production.columns.supplier')}</th><th>{t('production.columns.status')}</th><th>{t('production.columns.date')}</th></tr></thead><tbody>{projectDetail.purchaseOrders.map((order) => <tr key={order.id}><td><a className="ofi-prod-link" href={`/inventory/orders/${order.id}`}><PurchaseCode value={order.referenceNumber} /> <ExternalLink size={12} /></a></td><td>{order.supplierName ?? '—'}</td><td>{order.status}</td><td>{fmtDate(order.createdAt)}</td></tr>)}{!projectDetail.purchaseOrders.length && <TableStateRow colSpan={4} loading={false} emptyText={t('production.project.noPurchaseOrders')} />}</tbody></table></div>
                                : <div className="ofi-panel-page-empty">{ordersLoading ? t('common.loading') : t('production.loadFailed')}</div>}
                    </div>
                </PanelPageSection>
            )}
        </PanelEditorPage>
    );
};

export default PanelUnitEditorPage;
