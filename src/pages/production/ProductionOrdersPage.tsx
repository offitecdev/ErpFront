import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { RefreshCcw01 } from '@/components/icons/antIconCompat';
import { InventoryListHeader } from '@/components/inventory/InventoryListHeader';
import { FilterBar, FilterSelect, Pager, SearchBox, SectionCard, TableStateRow } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import { productionApi, productionErrorOf } from '@/lib/api/production';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { fmtDateTime } from '@/pages/inventory/utils/format';
import { useAuthStore } from '@/store/authStore';
import type { ProductionOrderListPage } from '@/types/production';
import '@/styles/modules/production.css';


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
 * jeweils in einem eigenen Reiter. Die Liste liest 20 Projektübersichten je
 * Seite; Suche und Zähler rechnet der Server. Der stille Abgleich bleibt.
 */

type KindFilter = '' | 'PROJECT' | 'DELIVERY';

/** «AB-2026-10106 · +1 NT» — die Aufträge eines Projekts in einer Zeile. */
const ordersLabel = (row: ProductionOrderListPage['projects'][number]): string => {
    const addons = row.addonCount;
    const extra = addons ? t('production.orders.addonCount', { count: addons }) : '';
    if (row.project.sourceKind === 'DELIVERY') return extra || '—';
    const mains = row.mainOrderNumbers;
    return [mains.join(', '), extra].filter(Boolean).join(' · ') || '—';
};

/**
 * Wie viele Geräte und Leistungen eines Projekts schon BESTELLT sind — die
 * Zahl statt der Marge (Vorgabe Samet, 20.09.2026: «sayılara göre … şu kadar
 * sayısına sipariş edilmiş»).
 */
export const ProductionOrdersPage = () => {
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const canForce = permissions.includes('production.manage') || permissions.includes('inventory.transfer');

    const [overview, setOverview] = useState<ProductionOrderListPage | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [search, setSearch] = useState('');
    const [kind, setKind] = useState<KindFilter>('');
    const [query, setQuery] = useState('');
    const [page, setPage] = useState(1);
    const pageSize = 20;
    const [tick, setTick] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = window.setTimeout(() => { setQuery(search.trim()); setPage(1); }, 300);
        return () => window.clearTimeout(timer);
    }, [search]);

    useEffect(() => {
        const controller = new AbortController();
        setLoading(true);
        setError(null);
        productionApi.orderList({ page, pageSize, search: query, kind }, controller.signal)
            .then((value) => {
                if (controller.signal.aborted) return;
                setOverview(value);
                const lastPage = Math.max(1, Math.ceil(value.total / pageSize));
                if (page > lastPage) setPage(lastPage);
            })
            .catch((failure) => { if (!controller.signal.aborted) setError(productionErrorOf(failure).message || t('production.loadFailed')); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [page, pageSize, query, kind, tick]);

    /* Beim Öffnen still abgleichen — der Server tut es nur, wenn der letzte
       Abgleich älter als fünf Minuten ist. */
    const sync = useCallback(async (force: boolean) => {
        setSyncing(true);
        try {
            const result = await productionApi.sync(force);
            if (result.synced || force) setTick((value) => value + 1);
            if (force) toast.success(t('production.syncDone'));
        } catch (failure) {
            if (force) toast.error(productionErrorOf(failure).message || t('production.syncFailed'));
        } finally {
            setSyncing(false);
        }
    }, []);

    useEffect(() => { void sync(false); }, [sync]);

    const rows = overview?.projects ?? [];

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
                <FilterSelect value={kind} onChange={(next) => { setKind(next as KindFilter); setPage(1); }} label={t('production.columns.kind')}>
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
                        <span className="font-normal text-slate-400"> · {overview?.total ?? 0}</span>
                    </span>
                )}
            >
                <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="ofi-prod-tree ofi-prod-flat w-full min-w-[720px]">
                        <colgroup>
                            <col style={{ width: 136 }} />
                            <col />
                            <col style={{ width: 96 }} />
                            <col style={{ width: 168 }} />
                            <col style={{ width: 150 }} />
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="text-left">{t('production.columns.number')}</th>
                                <th className="text-left">{t('production.columns.name')}</th>
                                <th className="text-left">{t('production.columns.kind')}</th>
                                <th className="text-left">{t('production.columns.orders')}</th>
                                <th className="text-right">{t('production.columns.orderedItems')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {(loading || rows.length === 0) && (
                                <TableStateRow
                                    colSpan={5}
                                    loading={loading}
                                    emptyText={query || kind ? t('production.noMatch') : t('production.orders.empty')}
                                    skeletonRows={6}
                                />
                            )}
                            {!loading && rows.map((row) => {
                                const { project } = row;
                                const delivery = project.sourceKind === 'DELIVERY';
                                const counts = row.counts;
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
                                            <span className="ofi-prod-cell__sub block truncate" title={row.orderNumbers.join(', ')}>
                                                {ordersLabel(row)}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <span className={`ofi-prod-count ${counts.ordered ? 'is-on' : ''}`.trim()}>
                                                <b>{counts.ordered}</b>
                                                <span>/ {counts.total}</span>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </SectionCard>
            {overview && overview.total > 0 && (
                <Pager page={page} pageSize={pageSize} total={overview.total}
                    totalPages={Math.max(1, Math.ceil(overview.total / pageSize))} onPage={setPage} />
            )}
        </div>
    );
};
