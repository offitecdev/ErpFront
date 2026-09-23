import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { RefreshCcw01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { FilterBar, FilterSelect, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { productionApi, productionErrorOf, readProductionOverview, refreshProductionOverview } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import { useAuthStore } from '@/store/authStore';
import type { ProductionOrderNode, ProductionOverview, ProductionOverviewProject } from '@/types/production';
import '@/styles/modules/production.css';

import { Money, differenceTone } from './components/productionUi';

/**
 * ── PRODUKTIONSAUFTRÄGE (19.09.2026, zweite Fassung — Vorgabe Samet) ────────
 *
 * «Einfacher: Projekt- und Lieferaufträge und der Kostenvergleich in EINER
 *  Tabelle, nichts klappt nach unten auf, ein Klick öffnet das Projekt direkt.»
 *
 * Eine Zeile je Projekt (bzw. Lieferauftrag) mit Verkauf, offenen Preisen,
 * bestätigten Bestellungen, Eingang und Differenz. Dritte Fassung
 * (20.09.2026): keine Marge und kein Total mehr — stattdessen die ZAHL, wie
 * viele Geräte und Leistungen des Projekts schon bestellt sind.
 * Geräte, Positionen und der Vergleich je Gerät stehen auf der Projektseite,
 * jeweils in einem eigenen Reiter. Die Daten kommen aus dem Speicher (sofort
 * beim zweiten Öffnen) und gleichen still mit dem Verkauf ab, wenn der letzte
 * Abgleich älter als fünf Minuten ist.
 */

type KindFilter = '' | 'PROJECT' | 'DELIVERY';

const includesText = (value: string | null | undefined, needle: string) =>
    Boolean(value && value.toLowerCase().includes(needle));

const addonCount = (nodes: ProductionOrderNode[]): number =>
    nodes.reduce((sum, node) => sum + node.addons.length + addonCount(node.addons), 0);

const orderNumbers = (nodes: ProductionOrderNode[]): string[] =>
    nodes.flatMap((node) => [node.order.orderNumber, ...orderNumbers(node.addons)]);

/** «AB-2026-10106 · +1 NT» — die Aufträge eines Projekts in einer Zeile. */
const ordersLabel = (row: ProductionOverviewProject): string => {
    const addons = addonCount(row.orders);
    const extra = addons ? t('production.orders.addonCount', { count: addons }) : '';
    if (row.project.sourceKind === 'DELIVERY') return extra || '—';
    const mains = row.orders.map((node) => node.order.orderNumber);
    return [mains.join(', '), extra].filter(Boolean).join(' · ') || '—';
};

/**
 * Wie viele Geräte und Leistungen eines Projekts schon BESTELLT sind — die
 * Zahl statt der Marge (Vorgabe Samet, 20.09.2026: «sayılara göre … şu kadar
 * sayısına sipariş edilmiş»).
 */
const orderedCount = (nodes: ProductionOrderNode[]): { ordered: number; total: number } =>
    nodes.reduce((acc, node) => {
        for (const entry of node.items) {
            if (!entry.item.isActive) continue;
            acc.total += 1;
            if (entry.figures.orderedTotal > 0) acc.ordered += 1;
        }
        const deeper = orderedCount(node.addons);
        acc.ordered += deeper.ordered;
        acc.total += deeper.total;
        return acc;
    }, { ordered: 0, total: 0 });

export const ProductionOrdersPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const canForce = permissions.includes('production.manage') || permissions.includes('inventory.transfer');

    const [overview, setOverview] = useState<ProductionOverview | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<KindFilter>('');

    useEffect(() => readProductionOverview(
        (value) => { setOverview(value); setError(null); },
        (failure) => setError(productionErrorOf(failure).message || t('production.loadFailed')),
    ), []);

    /* Beim Öffnen still abgleichen — der Server tut es nur, wenn der letzte
       Abgleich älter als fünf Minuten ist. */
    const sync = useCallback(async (force: boolean) => {
        setSyncing(true);
        try {
            const result = await productionApi.sync(force);
            if (result.synced || force) setOverview(await refreshProductionOverview());
            if (force) toast.success(t('production.syncDone'));
        } catch (failure) {
            if (force) toast.error(productionErrorOf(failure).message || t('production.syncFailed'));
        } finally {
            setSyncing(false);
        }
    }, []);

    useEffect(() => { void sync(false); }, [sync]);

    const needle = search.trim().toLowerCase();
    const rows = useMemo(() => (overview?.projects ?? []).filter((row) => {
        if (kind && row.project.sourceKind !== kind) return false;
        if (!needle) return true;
        return includesText(row.project.projectNumber, needle)
            || includesText(row.project.projectName, needle)
            || includesText(row.project.customerName, needle)
            || orderNumbers(row.orders).some((number) => includesText(number, needle));
    }), [overview, kind, needle]);
    const loading = !overview && !error;

    return (
        <div className="ofi-prod-page">
            <InventoryListHeader
                title={t('production.orders.title')}
                action={(
                    <div className="ofi-prod-headtools">
                        <span className={`ofi-prod-synced ${syncing ? 'is-busy' : ''}`}>
                            {syncing
                                ? t('production.syncing')
                                : overview?.lastSyncedAt
                                    ? t('production.syncedAt', { time: fmtDateTime(overview.lastSyncedAt) })
                                    : ''}
                        </span>
                        <button
                            type="button"
                            className={`ofi-prod-iconbtn ofi-nosize ${syncing ? 'is-busy' : ''}`}
                            onClick={() => void sync(canForce)}
                            disabled={syncing}
                            title={t('production.syncNow')}
                            aria-label={t('production.syncNow')}
                        >
                            <RefreshCcw01 />
                        </button>
                    </div>
                )}
            />

            <FilterBar>
                <SearchBox value={search} onChange={setSearch} placeholder={t('production.orders.search')} />
                <FilterSelect value={kind} onChange={(next) => setKind(next as KindFilter)} label={t('production.columns.kind')}>
                    <option value="">{t('production.orders.filterAll')}</option>
                    <option value="PROJECT">{t('production.orders.projectSection')}</option>
                    <option value="DELIVERY">{t('production.orders.deliverySection')}</option>
                </FilterSelect>
            </FilterBar>

            {error && <div className="ofi-prod-note is-warn">{error}</div>}

            <SectionCard
                title={(
                    <span>
                        {t('production.orders.sectionTitle')}
                        <span className="font-normal text-slate-400"> · {rows.length}</span>
                    </span>
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-tree ofi-prod-flat w-full min-w-[1080px]">
                        <colgroup>
                            <col style={{ width: 136 }} />
                            <col />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 168 }} />
                            <col style={{ width: 128 }} />
                            <col style={{ width: 120 }} />
                            <col style={{ width: 100 }} />
                            <col style={{ width: 118 }} />
                            <col style={{ width: 108 }} />
                            <col style={{ width: 120 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.columns.number')}</th>
                                <th className="text-left">{t('production.columns.name')}</th>
                                <th className="text-left">{t('production.columns.kind')}</th>
                                <th className="text-left">{t('production.columns.orders')}</th>
                                <th className="text-right">{t('production.columns.orderedItems')}</th>
                                <th className="text-right">{t('production.figures.sales')}</th>
                                <th className="text-right">{t('production.figures.open')}</th>
                                <th className="text-right">{t('production.figures.expenditure')}</th>
                                <th className="text-right">{t('production.figures.received')}</th>
                                <th className="text-right">{t('production.figures.difference')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || rows.length === 0) && (
                                <TableStateRow
                                    colSpan={10}
                                    loading={loading}
                                    emptyText={needle || kind ? t('production.noMatch') : t('production.orders.empty')}
                                    skeletonRows={6}
                                />
                            )}
                            {!loading && rows.map((row) => {
                                const { project, figures } = row;
                                const delivery = project.sourceKind === 'DELIVERY';
                                const counts = orderedCount(row.orders);
                                const open = () => navigate(`/production/orders/${project.id}`);
                                return (
                                    <tr
                                        key={project.id}
                                        className="is-clickable"
                                        tabIndex={0}
                                        onClick={open}
                                        onKeyDown={(event) => { if (event.key === 'Enter') open(); }}
                                    >
                                        <td><span className="ofi-prod-num">{project.projectNumber}</span></td>
                                        <td className="max-w-0">
                                            <div className="ofi-prod-cell__stack">
                                                <span className="ofi-prod-cell__main">{project.projectName}</span>
                                                <span className="ofi-prod-cell__sub">
                                                    {[project.customerName, row.sourceTenantName].filter(Boolean).join(' · ') || '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td>
                                            <span className={`ofi-prod-tag ${delivery ? 'is-delivery' : ''}`}>
                                                {delivery ? t('production.kind.delivery') : t('production.kind.project')}
                                            </span>
                                        </td>
                                        <td className="max-w-0">
                                            <span className="ofi-prod-cell__sub block truncate" title={orderNumbers(row.orders).join(', ')}>
                                                {ordersLabel(row)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span className={`ofi-prod-count ${counts.ordered ? 'is-on' : ''}`.trim()}>
                                                <b>{counts.ordered}</b>
                                                <span>/ {counts.total}</span>
                                            </span>
                                        </td>
                                        <td><Money value={figures.salesTotal} /></td>
                                        <td><Money value={figures.openTotal} dimZero /></td>
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
        </div>
    );
};
