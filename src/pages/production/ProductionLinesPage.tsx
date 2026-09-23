import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { File05 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { FilterBar, FilterSelect, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { productionErrorOf, readProductionLines } from '@/lib/api/production';
import { useDebouncedValue } from '@/pages/inventory/hooks/useDebouncedValue';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDate, fmtUnitPricePrecise } from '@/pages/inventory/utils/format';
import type { ProductionLinesPage as LinesPage } from '@/types/production';
import '@/styles/modules/production.css';

import { DevicePopup } from './components/DevicePopup';
import { DeviceChip, Money, money, quantity } from './components/productionUi';
import { PurchaseCode } from '@/components/ui-shared/PurchaseCode';

/**
 * ── BESTELLTE PRODUKTE (19.09.2026, Vorgabe Samet) ──────────────────────────
 * Beim Bestätigen einer Lieferantenbestellung landen ALLE ihre Zeilen in einer
 * eigenen Tabelle (uretim_siparisleri) — mit Projekt und Gerät. Wird die
 * Bestellung gelöscht, verschwinden sie mit ihr. Diese Seite ist die Liste
 * dieser Tabelle; das Gerät öffnet sein Fenster.
 */
export const ProductionLinesPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const [search, setSearch] = useState('');
    const [projectId, setProjectId] = useState('');
    const debounced = useDebouncedValue(search.trim(), 250);
    const [page, setPage] = useState<LinesPage | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [deviceId, setDeviceId] = useState<string | null>(null);
    const [exporting, setExporting] = useState(false);

    useEffect(() => {
        setLoading(true);
        setError(null);
        return readProductionLines(
            { ...(projectId ? { projectId } : {}), ...(debounced ? { search: debounced } : {}) },
            (value) => { setPage(value); setLoading(false); },
            (failure) => { setError(productionErrorOf(failure).message || t('production.loadFailed')); setLoading(false); },
        );
    }, [projectId, debounced]);

    const rows = page?.rows ?? [];

    /* Der graue Beleg: gedruckt wird, was die Seite zeigt — die Kopfzeile des
       Belegs sagt, worauf gefiltert ist. */
    const exportPdf = async () => {
        if (!page || rows.length === 0) {
            toast.error(t('production.pdf.empty'));
            return;
        }
        setExporting(true);
        try {
            const project = (page.projects ?? []).find((entry) => entry.id === projectId);
            const scope = [
                project ? t('production.pdf.scopeProject', { project: `${project.projectNumber} · ${project.projectName}` }) : '',
                debounced ? t('production.pdf.scopeSearch', { search: debounced }) : '',
            ].filter(Boolean).join('  ·  ');
            const { exportConfirmedOrdersPdf } = await import('@/utils/pdf/productionConfirmedPdf');
            await exportConfirmedOrdersPdf({
                rows: rows.map((row) => ({
                    purchaseOrderNumber: row.purchaseOrderNumber,
                    supplierName: row.supplierName,
                    projectNumber: row.project?.projectNumber ?? null,
                    projectName: row.project?.projectName ?? null,
                    deviceName: row.item?.name ?? null,
                    name: row.name,
                    code: row.code,
                    quantity: row.quantity,
                    unit: row.unit,
                    netPrice: row.netPrice,
                    lineTotal: row.lineTotal,
                    currency: row.currency,
                    receivedQuantity: row.receivedQuantity,
                    approvedAt: row.approvedAt,
                })),
                totals: page.totals,
                scope,
            });
        } catch {
            toast.error(t('production.pdf.failed'));
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="ofi-prod-page">
            <InventoryListHeader
                title={t('production.lines.title')}
                action={(
                    <button
                        type="button"
                        className={`ofi-prod-iconbtn is-wide ofi-nosize ${exporting ? 'is-busy' : ''}`}
                        onClick={() => void exportPdf()}
                        disabled={exporting || rows.length === 0}
                        title={t('production.pdf.title')}
                    >
                        <File05 />
                        {t('production.pdf.button')}
                    </button>
                )}
            />

            <FilterBar>
                <SearchBox value={search} onChange={setSearch} placeholder={t('production.lines.search')} busy={loading && Boolean(page)} />
                <FilterSelect value={projectId} onChange={setProjectId} label={t('production.columns.project')} width="wide">
                    <option value="">{t('production.lines.allProjects')}</option>
                    {(page?.projects ?? []).map((project) => (
                        <option key={project.id} value={project.id}>{`${project.projectNumber} · ${project.projectName}`}</option>
                    ))}
                </FilterSelect>
            </FilterBar>

            {error && <div className="ofi-prod-note is-warn">{error}</div>}

            <SectionCard
                title={(
                    <span>
                        {t('production.lines.sectionTitle')}
                        <span className="font-normal text-slate-400"> · {page?.totals.lineCount ?? 0}</span>
                    </span>
                )}
                action={page ? (
                    <span className="text-[12.5px] text-slate-500">
                        {t('production.lines.totals', {
                            ordered: money(page.totals.orderedTotal),
                            received: money(page.totals.receivedTotal),
                        })}
                    </span>
                ) : undefined}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-grouped w-full min-w-[1240px]">
                        <colgroup>
                            <col style={{ width: 160 }} />
                            <col style={{ width: 220 }} />
                            <col style={{ width: 210 }} />
                            <col />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 112 }} />
                            <col style={{ width: 124 }} />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 104 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.columns.purchaseOrder')}</th>
                                <th className="text-left">{t('production.columns.project')}</th>
                                <th className="text-left">{t('production.columns.device')}</th>
                                <th className="text-left">{t('production.columns.article')}</th>
                                <th className="text-right">{t('production.columns.quantity')}</th>
                                <th className="text-right">{t('production.columns.netPrice')}</th>
                                <th className="text-right">{t('production.columns.lineTotal')}</th>
                                <th className="text-right">{t('production.columns.received')}</th>
                                <th className="text-left">{t('production.columns.approvedAt')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {((loading && !page) || rows.length === 0) && (
                                <TableStateRow
                                    colSpan={9}
                                    loading={loading && !page}
                                    emptyText={debounced || projectId ? t('production.noMatch') : t('production.lines.empty')}
                                />
                            )}
                            {rows.map((row) => (
                                <tr
                                    key={row.id}
                                    className={row.project ? 'is-clickable' : undefined}
                                    onClick={row.project ? () => navigate(`/production/orders/${row.project!.id}`) : undefined}
                                >
                                    <td>
                                        <a
                                            className="ofi-prod-link font-mono text-[12.5px]"
                                            href={`/inventory/orders/${row.purchaseOrderId}`}
                                            onClick={(event) => {
                                                event.preventDefault();
                                                event.stopPropagation();
                                                navigate(`/inventory/orders/${row.purchaseOrderId}`);
                                            }}
                                        >
                                            <PurchaseCode value={row.purchaseOrderNumber} />
                                        </a>
                                        <div className="truncate text-[11.5px]">{row.supplierName ?? '—'}</div>
                                    </td>
                                    <td className="max-w-0">
                                        {row.project ? (
                                            <div className="ofi-prod-cell__stack">
                                                <span className="ofi-prod-num">{row.project.projectNumber}</span>
                                                <span className="ofi-prod-cell__sub">{row.project.projectName}</span>
                                            </div>
                                        ) : '—'}
                                    </td>
                                    <td className="max-w-0">
                                        {row.item
                                            ? <DeviceChip item={row.item} onOpen={setDeviceId} />
                                            : <span className="text-[12px] text-slate-400">{t('production.project.unassigned')}</span>}
                                    </td>
                                    <td className="max-w-0">
                                        <div className="truncate" title={row.name}>{row.name}</div>
                                        {row.code && <div className="font-mono text-[11.5px]">{row.code}</div>}
                                    </td>
                                    <td className="text-right">{quantity(row.quantity, row.unit)}</td>
                                    <td className="text-right">{fmtUnitPricePrecise(row.netPrice)}</td>
                                    <td><Money value={row.lineTotal} currency={row.currency} /></td>
                                    <td className="text-right">{row.receivedQuantity ? quantity(row.receivedQuantity, row.unit) : '—'}</td>
                                    <td className="text-[12px]">{fmtDate(row.approvedAt)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </SectionCard>

            <DevicePopup itemId={deviceId} onClose={() => setDeviceId(null)} />
        </div>
    );
};
