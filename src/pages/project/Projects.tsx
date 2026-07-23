import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import {
    ArrowDown,
    ArrowUp,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    ChevronLeft,
    ChevronRight,
    Plus,
    SearchLg as Search,
    X as XIcon,
} from '@/components/icons/antIconCompat';
import Tooltip from 'antd/es/tooltip';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { Select } from '../../components/ui-shared/Field';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { orderBillingLines, orderBillingTotals } from '../../lib/orderBillingTotals';
import { computeProjectFlow, type ProjectFlow } from '../../lib/projectFlow';
import type { ProjectDto, ProjectStatus } from '../../types/project';
import type { MyOrderDto } from '../../types/billing';
import { ProjectStatusBadge } from './features/components/common/ProjectStatusBadge';
import { getStatusLabel } from './features/utils/projectFormatters';

import { t } from '@/i18n/translate';
import { localizeTenderNumber, localizeTenderNumbersInText } from '@/utils/tenderNumber';

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

// The three states a project is filtered by. ProjectStatus still carries the
// legacy AWAITING_APPROVAL / ON_HOLD / CANCELLED values and existing records
// keep rendering their own badge — they are just not offered as filters.
const FILTERABLE_STATUSES: ProjectStatus[] = ['ACTIVE', 'SPECIALLY_CLOSED', 'COMPLETED'];

// Filtre satırı kontrolü — Teklifler/Ürünler listesindeki desenle aynı.
const LIST_FILTER_CONTROL =
    'h-10 w-full rounded-lg border border-slate-200 bg-white px-2.5 text-[12px] font-normal normal-case tracking-normal text-slate-700 placeholder:text-slate-400 transition-colors hover:bg-slate-100 focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10';

const TABLE_BORDERS =
    '[&_th]:border-r [&_th]:border-slate-200 [&_td]:border-r [&_td]:border-slate-200 [&_th:last-child]:border-r-0 [&_td:last-child]:border-r-0';

type SortDirection = 'asc' | 'desc';

// Ortak sıralanabilir başlık (Teklifler listesindeki desenle aynı) — sıralama
// anahtarı serbest metin olduğundan hem proje hem sipariş tablosunda kullanılır.
const SortableHeader = ({
    label,
    column,
    sortBy,
    sortDirection,
    onSort,
    align = 'left',
}: {
    label: ReactNode;
    column: string;
    sortBy: string;
    sortDirection: SortDirection;
    onSort: (column: string, direction: SortDirection) => void;
    align?: 'left' | 'right' | 'center';
}) => (
    <th className={`px-3 py-2 font-semibold ${align === 'right' ? 'text-right' : align === 'center' ? 'text-center' : 'text-left'}`}>
        <div className={`flex min-w-0 items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : ''}`}>
            <span className="truncate">{label}</span>
            <span className="inline-flex shrink-0 items-center">
                <Tooltip title={t('common.sortAscending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortAscending')}
                        aria-pressed={sortBy === column && sortDirection === 'asc'}
                        onClick={() => onSort(column, 'asc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'asc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowUp size={10} />
                    </button>
                </Tooltip>
                <Tooltip title={t('common.sortDescending')}>
                    <button
                        type="button"
                        aria-label={t('common.sortDescending')}
                        aria-pressed={sortBy === column && sortDirection === 'desc'}
                        onClick={() => onSort(column, 'desc')}
                        className={`flex size-4 items-center justify-center rounded transition-colors hover:bg-slate-200 ${
                            sortBy === column && sortDirection === 'desc' ? 'text-[#272f67]' : 'text-slate-400'
                        }`}
                    >
                        <ArrowDown size={10} />
                    </button>
                </Tooltip>
            </span>
        </div>
    </th>
);

// Ortak üst çubuk — arama (esner) + sıralama + sayfalama (sağda). Durum/özel
// filtreler her tablonun kolon filtre satırındadır.
const ListToolbar = ({
    search,
    onSearch,
    searchPlaceholder,
    sortValue,
    onSortChange,
    sortOptions,
    total,
    page,
    totalPages,
    onPage,
}: {
    search: string;
    onSearch: (value: string) => void;
    searchPlaceholder: string;
    sortValue: string;
    onSortChange: (value: string) => void;
    sortOptions: { value: string; label: string }[];
    total: number;
    page: number;
    totalPages: number;
    onPage: (updater: (p: number) => number) => void;
}) => {
    const PAGE_SIZE = 15;
    const rangeFrom = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
    const rangeTo = Math.min(page * PAGE_SIZE, total);
    const isDefaultSort = sortOptions.some((o) => o.value === sortValue);
    return (
        <div className="px-3 py-3">
            <div className="flex w-full flex-wrap items-center gap-3">
                <div className="relative w-[240px] min-w-0 shrink">
                    <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={search}
                        onChange={(e) => onSearch(e.target.value)}
                        placeholder={searchPlaceholder}
                        className="h-9 w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-7 pr-7 text-[13px] transition-colors focus:border-blue-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => onSearch('')}
                            aria-label={t('common.clear')}
                            title={t('common.clear')}
                            className="absolute right-1.5 top-1/2 -translate-y-1/2 flex size-5 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-600"
                        >
                            <XIcon size={12} />
                        </button>
                    )}
                </div>
                <div className="w-[200px] shrink-0">
                    <Select
                        value={sortValue}
                        onChange={(e) => onSortChange(e.target.value)}
                        className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[13px] transition-colors focus:outline-none focus:ring-2 focus:ring-blue-700/10"
                        aria-label={t('common.sortOrder')}
                    >
                        {!isDefaultSort && <option value={sortValue}>{t('common.sortOrder')}</option>}
                        {sortOptions.map((o) => (
                            <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                    </Select>
                </div>
                <div className="ml-auto flex shrink-0 items-center gap-3">
                    <span className="font-mono text-[12px] text-slate-500">{rangeFrom}-{rangeTo} / {total}</span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            disabled={page <= 1}
                            onClick={() => onPage((p) => Math.max(1, p - 1))}
                            className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={t('common.back')}
                        >
                            <ChevronLeft size={14} />
                        </button>
                        <span className="px-1 font-mono text-[12px] tabular-nums text-slate-500">{page} / {totalPages}</span>
                        <button
                            type="button"
                            disabled={page >= totalPages}
                            onClick={() => onPage((p) => Math.min(totalPages, p + 1))}
                            className="flex size-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                            aria-label={t('common.next')}
                        >
                            <ChevronRight size={14} />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

const SORT_NEW_OLD = () => [
    { value: 'createdAt:desc', label: t('common.sortNewest') },
    { value: 'createdAt:asc', label: t('common.sortOldest') },
];

/** Technical / invoicing progress across all of a project's orders — the plain
 *  figure, no progress bar. */
const PercentCell = ({ percent }: { percent?: number }) => {
    if (percent === undefined) return <span className="text-slate-300">—</span>;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${clamped >= 100 ? 'text-emerald-600' : 'text-slate-700'}`}>
            {clamped}%
        </span>
    );
};

const projectCustomerName = (p: ProjectDto) => p.customer?.companyName || p.customerId || '';
const projectTenderNo = (p: ProjectDto) => (p.tender?.tenderNumber ? localizeTenderNumber(p.tender.tenderNumber) : (p.tenderId || ''));

/* ────────────────────────── Projects tab ────────────────────────── */

const ProjectsTable = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [flowMap, setFlowMap] = useState<Record<string, ProjectFlow>>({});
    const [addonMap, setAddonMap] = useState<Record<string, number>>({});
    const flowSourcesRef = useRef<{ orders: Awaited<ReturnType<typeof myOrdersApi.list>>; deliveryReports: Awaited<ReturnType<typeof deliveryReportApi.list>>; invoices: Awaited<ReturnType<typeof billingApi.listInvoices>> } | null>(null);

    const [search, setSearch] = useState('');
    const [nameFilter, setNameFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [tenderFilter, setTenderFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    const load = async () => {
        setLoading(true);
        try {
            const [list, sources] = await Promise.all([
                projectApi.list(),
                flowSourcesRef.current
                    ? Promise.resolve(flowSourcesRef.current)
                    : Promise.all([myOrdersApi.list(), deliveryReportApi.list(), billingApi.listInvoices()]).then(
                          ([orders, deliveryReports, invoices]) => ({ orders, deliveryReports, invoices }),
                      ),
            ]);
            flowSourcesRef.current = sources;
            const map: Record<string, ProjectFlow> = {};
            const addons: Record<string, number> = {};
            for (const project of list) {
                map[project.id] = computeProjectFlow(project, {
                    projects: list,
                    orders: sources.orders,
                    deliveryReports: sources.deliveryReports,
                    invoices: sources.invoices,
                    fieldReports: [],
                    generalSignatures: [],
                });
                addons[project.id] = sources.orders
                    .filter((o) => o.projectId === project.id)
                    .reduce((n, o) => n + (o.addonSalesOrders?.length || 0), 0);
            }
            setProjects(list);
            setFlowMap(map);
            setAddonMap(addons);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('projects.errorLoad'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { void load(); }, []);

    const handleSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortDirection(direction); };

    useEffect(() => { setPage(1); }, [search, nameFilter, customerFilter, tenderFilter, statusFilter, sortBy, sortDirection]);

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const nf = nameFilter.trim().toLowerCase();
        const cf = customerFilter.trim().toLowerCase();
        const tf = tenderFilter.trim().toLowerCase();
        let rows = projects.filter((p) => {
            if (statusFilter && p.status !== statusFilter) return false;
            const name = (p.projectName || '').toLowerCase();
            const cust = projectCustomerName(p).toLowerCase();
            const tno = projectTenderNo(p).toLowerCase();
            if (s && !(name.includes(s) || cust.includes(s) || tno.includes(s))) return false;
            if (nf && !name.includes(nf)) return false;
            if (cf && !cust.includes(cf)) return false;
            if (tf && !tno.includes(tf)) return false;
            return true;
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        rows = [...rows].sort((a, b) => {
            switch (sortBy) {
                case 'projectName': return dir * (a.projectName || '').localeCompare(b.projectName || '');
                case 'customer': return dir * projectCustomerName(a).localeCompare(projectCustomerName(b));
                case 'budget': return dir * ((a.plannedBudget || 0) - (b.plannedBudget || 0));
                case 'status': return dir * (a.status || '').localeCompare(b.status || '');
                default: return dir * (dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());
            }
        });
        return rows;
    }, [projects, search, nameFilter, customerFilter, tenderFilter, statusFilter, sortBy, sortDirection]);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

    const hasActiveFilters = Boolean(search || nameFilter || customerFilter || tenderFilter || statusFilter);
    const clearFilters = () => { setSearch(''); setNameFilter(''); setCustomerFilter(''); setTenderFilter(''); setStatusFilter(''); };

    return (
        <Card noPadding>
            <ListToolbar
                search={search}
                onSearch={setSearch}
                searchPlaceholder={t('projects.searchPlaceholder')}
                sortValue={`${sortBy}:${sortDirection}`}
                onSortChange={(v) => { const [c, d] = v.split(':') as [string, SortDirection]; handleSort(c, d); }}
                sortOptions={SORT_NEW_OLD()}
                total={total}
                page={pageSafe}
                totalPages={totalPages}
                onPage={setPage}
            />

            <div className="overflow-x-auto">
                <table className={`w-full table-fixed text-[12.5px] ${TABLE_BORDERS}`}>
                    <colgroup>
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '7%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '10%' }} />
                        <col style={{ width: '8%' }} />
                        <col style={{ width: '7%' }} />
                    </colgroup>
                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <tr>
                            <SortableHeader label={t('nav.projects')} column="projectName" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                            <SortableHeader label={t('nav.quickActionsGroup.customers')} column="customer" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                            <th className="px-3 py-2 text-left font-semibold">{t('auto.teklif')}</th>
                            <SortableHeader label={t('auto.butce')} column="budget" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
                            <th className="px-3 py-2 text-right font-semibold">{t('auto.rapor')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('auto.randevu')}</th>
                            <SortableHeader label={t('common.status')} column="status" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                            <th className="px-3 py-2 text-left font-semibold">{t('projects.listColTechnical')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('projects.listColBilling')}</th>
                        </tr>
                        <tr data-filter-row className="bg-white border-b border-slate-100">
                            <th className="px-2 py-1.5 font-normal">
                                <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-1.5 font-normal">
                                <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-1.5 font-normal">
                                <input value={tenderFilter} onChange={(e) => setTenderFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-2" />
                            <th className="px-2 py-2" />
                            <th className="px-2 py-2" />
                            <th className="px-2 py-1.5 font-normal">
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as ProjectStatus | '')} aria-label={t('common.status')} className={LIST_FILTER_CONTROL}>
                                    <option value="">{t('auto.tum_durumlar')}</option>
                                    {FILTERABLE_STATUSES.map((key) => (
                                        <option key={key} value={key}>{getStatusLabel()[key]}</option>
                                    ))}
                                </select>
                            </th>
                            <th className="px-2 py-2" />
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}><td colSpan={9} className="px-3 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>
                        ))}
                        {!loading && paged.length === 0 && (
                            <tr>
                                <td colSpan={9}>
                                    <div className="px-4 py-6">
                                        <EmptyState
                                            icon={<BriefcaseBusiness size={32} />}
                                            title={t('auto.proje_yok')}
                                            description={hasActiveFilters ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v') :t('auto.onayli_teklif_uzerinden_proje_olusturabilirsiniz')}
                                            action={hasActiveFilters ? (
                                                <Button variant="secondary" size="sm" icon={<XIcon size={13} />} onClick={clearFilters}>{t('auto.filtreleri_temizle')}</Button>
                                            ) : undefined}
                                        />
                                    </div>
                                </td>
                            </tr>
                        )}
                        {!loading && paged.map((project) => {
                            const bookedAll = (project.appointments || [])
                                .filter((a) => a.status === 'BOOKED')
                                .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
                            const booked = bookedAll.find((a) => dayjs(a.startTime).isAfter(dayjs())) || bookedAll[bookedAll.length - 1];
                            return (
                                <tr key={project.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => navigate(`/projects/${project.id}`)}>
                                    <td className="px-3 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-medium text-slate-800">{localizeTenderNumbersInText(project.projectName)}</span>
                                            {addonMap[project.id] > 0 && (
                                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                    <Plus size={9} />{t('projects.complete.addonCount', { count: addonMap[project.id] })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-400">{dayjs(project.createdAt).format('DD.MM.YYYY')}</div>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600"><span className="block truncate">{project.customer?.companyName || project.customerId}</span></td>
                                    <td className="px-3 py-2 font-mono text-[11.5px] text-slate-500"><span className="block truncate">{project.tender?.tenderNumber ? localizeTenderNumber(project.tender.tenderNumber) : (project.tenderId || '-')}</span></td>
                                    <td className="px-3 py-2 text-right font-mono">{money(project.plannedBudget)}</td>
                                    <td className="px-3 py-2 text-right font-mono">{project._count?.reports || 0}</td>
                                    <td className="px-3 py-2">
                                        {booked ? (
                                            <span className={`inline-flex items-center gap-1.5 ${dayjs(booked.startTime).isAfter(dayjs()) ? 'text-[#272f67]' : 'text-slate-500'}`}>
                                                <CalendarClock size={12} className="shrink-0" />
                                                <span>
                                                    <span className="block font-medium leading-tight">{dayjs(booked.startTime).format('DD.MM.YYYY')}</span>
                                                    <span className="block text-[11px] leading-tight text-slate-400">{dayjs(booked.startTime).format('HH:mm')}</span>
                                                </span>
                                            </span>
                                        ) : <span className="text-slate-300">—</span>}
                                    </td>
                                    <td className="px-3 py-2"><ProjectStatusBadge status={project.status} /></td>
                                    <td className="px-3 py-2"><PercentCell percent={flowMap[project.id]?.technicalPercent} /></td>
                                    <td className="px-3 py-2"><PercentCell percent={flowMap[project.id]?.billingPercent} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

/* ────────────────────────── Orders tab ────────────────────────── */

type OrderBillingState = 'notBilled' | 'partial' | 'billed';

const orderTotals = (order: MyOrderDto) => orderBillingTotals(orderBillingLines(order));
const orderBillingState = (percent: number): OrderBillingState => (percent <= 0 ? 'notBilled' : percent >= 100 ? 'billed' : 'partial');

const billingChipVariant = (percent: number): 'active' | 'warning' | 'info' => (percent >= 100 ? 'active' : percent <= 0 ? 'warning' : 'info');
const billingChipLabel = (percent: number) => (percent <= 0 ? t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(percent) }));

const orderCustomerName = (o: MyOrderDto) => o.customer?.companyName || o.customerId || '';
const orderProjectName = (o: MyOrderDto) => o.project?.projectName || '';

const OrdersTable = () => {
    const navigate = useNavigate();
    const [orders, setOrders] = useState<MyOrderDto[]>([]);
    const [loading, setLoading] = useState(true);

    const [search, setSearch] = useState('');
    const [orderNoFilter, setOrderNoFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [projectFilter, setProjectFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState<'' | OrderBillingState>('');
    const [sortBy, setSortBy] = useState('createdAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [page, setPage] = useState(1);
    const PAGE_SIZE = 15;

    useEffect(() => {
        let cancelled = false;
        (async () => {
            setLoading(true);
            try {
                const list = await myOrdersApi.list();
                if (!cancelled) setOrders(list);
            } catch (e: any) {
                if (!cancelled) toast.error(e.response?.data?.error ||t('crm.orders_yuklenemedi'));
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const handleSort = (column: string, direction: SortDirection) => { setSortBy(column); setSortDirection(direction); };

    useEffect(() => { setPage(1); }, [search, orderNoFilter, customerFilter, projectFilter, statusFilter, sortBy, sortDirection]);

    // Faturalama tutarları/yüzdesi tüm satırlarda bir kez hesaplanır (filtre + sıralama girdisi).
    const rows = useMemo(
        () => orders.map((o) => ({ order: o, totals: orderTotals(o) })),
        [orders],
    );

    const filtered = useMemo(() => {
        const s = search.trim().toLowerCase();
        const of = orderNoFilter.trim().toLowerCase();
        const cf = customerFilter.trim().toLowerCase();
        const pf = projectFilter.trim().toLowerCase();
        let list = rows.filter(({ order, totals }) => {
            if (statusFilter && orderBillingState(totals.percent) !== statusFilter) return false;
            const no = (order.orderNumber || '').toLowerCase();
            const cust = orderCustomerName(order).toLowerCase();
            const proj = orderProjectName(order).toLowerCase();
            if (s && !(no.includes(s) || cust.includes(s) || proj.includes(s))) return false;
            if (of && !no.includes(of)) return false;
            if (cf && !cust.includes(cf)) return false;
            if (pf && !proj.includes(pf)) return false;
            return true;
        });
        const dir = sortDirection === 'asc' ? 1 : -1;
        list = [...list].sort((a, b) => {
            switch (sortBy) {
                case 'orderNumber': return dir * (a.order.orderNumber || '').localeCompare(b.order.orderNumber || '');
                case 'customer': return dir * orderCustomerName(a.order).localeCompare(orderCustomerName(b.order));
                case 'total': return dir * (a.totals.total - b.totals.total);
                default: return dir * (dayjs(a.order.createdAt).valueOf() - dayjs(b.order.createdAt).valueOf());
            }
        });
        return list;
    }, [rows, search, orderNoFilter, customerFilter, projectFilter, statusFilter, sortBy, sortDirection]);

    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const pageSafe = Math.min(page, totalPages);
    const paged = filtered.slice((pageSafe - 1) * PAGE_SIZE, pageSafe * PAGE_SIZE);

    const hasActiveFilters = Boolean(search || orderNoFilter || customerFilter || projectFilter || statusFilter);
    const clearFilters = () => { setSearch(''); setOrderNoFilter(''); setCustomerFilter(''); setProjectFilter(''); setStatusFilter(''); };

    return (
        <Card noPadding>
            <ListToolbar
                search={search}
                onSearch={setSearch}
                searchPlaceholder={t('projects.ordersSearch')}
                sortValue={`${sortBy}:${sortDirection}`}
                onSortChange={(v) => { const [c, d] = v.split(':') as [string, SortDirection]; handleSort(c, d); }}
                sortOptions={SORT_NEW_OLD()}
                total={total}
                page={pageSafe}
                totalPages={totalPages}
                onPage={setPage}
            />

            <div className="overflow-x-auto">
                <table className={`w-full table-fixed text-[12.5px] ${TABLE_BORDERS}`}>
                    <colgroup>
                        <col style={{ width: '16%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '18%' }} />
                        <col style={{ width: '14%' }} />
                        <col style={{ width: '12%' }} />
                        <col style={{ width: '11%' }} />
                        <col style={{ width: '11%' }} />
                    </colgroup>
                    <thead className="border-b border-slate-100 bg-slate-50/60 text-[10.5px] uppercase tracking-wider text-slate-500">
                        <tr>
                            <SortableHeader label={t('crm.order_no')} column="orderNumber" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                            <SortableHeader label={t('nav.quickActionsGroup.customers')} column="customer" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} />
                            <th className="px-3 py-2 text-left font-semibold">{t('nav.projects')}</th>
                            <th className="px-3 py-2 text-left font-semibold">{t('common.status')}</th>
                            <SortableHeader label={t('common.total')} column="total" sortBy={sortBy} sortDirection={sortDirection} onSort={handleSort} align="right" />
                            <th className="px-3 py-2 text-right font-semibold">{t('billing.billed')}</th>
                            <th className="px-3 py-2 text-right font-semibold">{t('billing.remaining')}</th>
                        </tr>
                        <tr data-filter-row className="bg-white border-b border-slate-100">
                            <th className="px-2 py-1.5 font-normal">
                                <input value={orderNoFilter} onChange={(e) => setOrderNoFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-1.5 font-normal">
                                <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-1.5 font-normal">
                                <input value={projectFilter} onChange={(e) => setProjectFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={LIST_FILTER_CONTROL} />
                            </th>
                            <th className="px-2 py-1.5 font-normal">
                                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as '' | OrderBillingState)} aria-label={t('common.status')} className={LIST_FILTER_CONTROL}>
                                    <option value="">{t('common.all')}</option>
                                    <option value="notBilled">{t('crm.faturalanmadi')}</option>
                                    <option value="partial">{t('projects.orderPartial')}</option>
                                    <option value="billed">{t('projects.orderBilled')}</option>
                                </select>
                            </th>
                            <th className="px-2 py-2" />
                            <th className="px-2 py-2" />
                            <th className="px-2 py-2" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {loading && Array.from({ length: 5 }).map((_, i) => (
                            <tr key={i}><td colSpan={7} className="px-3 py-3"><div className="h-4 w-full animate-pulse rounded bg-slate-100" /></td></tr>
                        ))}
                        {!loading && paged.length === 0 && (
                            <tr>
                                <td colSpan={7}>
                                    <div className="px-4 py-6">
                                        <EmptyState
                                            icon={<BriefcaseBusiness size={32} />}
                                            title={t('crm.order_not_found')}
                                            description={hasActiveFilters ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v') :t('crm.no_goruntulenecek_bir_order_yet')}
                                            action={hasActiveFilters ? (
                                                <Button variant="secondary" size="sm" icon={<XIcon size={13} />} onClick={clearFilters}>{t('auto.filtreleri_temizle')}</Button>
                                            ) : undefined}
                                        />
                                    </div>
                                </td>
                            </tr>
                        )}
                        {!loading && paged.map(({ order, totals }) => {
                            const addons = order.addonSalesOrders || [];
                            return (
                                <tr key={order.id} className="cursor-pointer hover:bg-slate-50/70" onClick={() => navigate(`/crm/my-orders/${order.id}`)}>
                                    <td className="px-3 py-2">
                                        <div className="flex min-w-0 items-center gap-2">
                                            <span className="truncate font-semibold text-slate-800">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                            {addons.length > 0 && (
                                                <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                    <Plus size={9} />{t('crm.additionalOrdersCount', { count: addons.length })}
                                                </span>
                                            )}
                                        </div>
                                        <div className="text-[11px] text-slate-400">{dayjs(order.createdAt).format('DD.MM.YYYY')}</div>
                                    </td>
                                    <td className="px-3 py-2 text-slate-600"><span className="block truncate">{order.customer?.companyName || t('crm.customer_not_found')}</span></td>
                                    <td className="px-3 py-2 text-slate-600"><span className="block truncate">{order.project?.projectName || <span className="text-slate-300">—</span>}</span></td>
                                    <td className="px-3 py-2">
                                        <StatusChip variant={billingChipVariant(totals.percent)}>{billingChipLabel(totals.percent)}</StatusChip>
                                    </td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-slate-900">{money(totals.total)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-emerald-600">{money(totals.billed)}</td>
                                    <td className="px-3 py-2 text-right font-mono font-semibold text-amber-600">{money(totals.remaining)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </Card>
    );
};

/* ────────────────────────── Page shell (tabs) ────────────────────────── */

export const Projects = () => {
    const [tab, setTab] = useState<'projects' | 'orders'>('projects');
    const tabButton = (key: 'projects' | 'orders', label: string) => (
        <button
            type="button"
            onClick={() => setTab(key)}
            aria-pressed={tab === key}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition-colors ${
                tab === key ? 'bg-white text-[#272f67] shadow-sm' : 'text-slate-500 hover:text-slate-700'
            }`}
        >
            {label}
        </button>
    );

    return (
        <div>
            <InventoryListHeader
                title={t('nav.projects')}
                action={
                    <div className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-100 p-0.5">
                        {tabButton('projects', t('projects.projectsTab'))}
                        {tabButton('orders', t('projects.ordersTab'))}
                    </div>
                }
            />
            {tab === 'projects' ? <ProjectsTable /> : <OrdersTable />}
        </div>
    );
};
