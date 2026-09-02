import { useEffect, useMemo, useRef, useState } from 'react';
import dayjs from 'dayjs';
import {
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    Plus,
} from '@/components/icons/antIconCompat';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { InventoryListHeader } from '../../components/inventory/InventoryListHeader';
import { ColResizeHandle, FILTER_INPUT_CLASS, Pager, ResizableCols, SearchBox, SectionCard, SortableTh, TableStateRow } from '../../components/ui-shared/TableKit';
import { useColumnWidths } from '../../hooks/useColumnWidths';
import { projectApi, deliveryReportApi } from '../../lib/api/project';
import { billingApi, myOrdersApi } from '../../lib/api/billing';
import { computeProjectFlow, type ProjectFlow } from '../../lib/projectFlow';
import type { ProjectDto, ProjectStatus } from '../../types/project';
import { ProjectStatusBadge } from './features/components/common/ProjectStatusBadge';
import { getStatusLabel } from './features/utils/projectFormatters';

import { t } from '@/i18n/translate';

const money = (value: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

// The three states a project is filtered by. ProjectStatus still carries the
// legacy AWAITING_APPROVAL / ON_HOLD / CANCELLED values and existing records
// keep rendering their own badge — they are just not offered as filters.
const FILTERABLE_STATUSES: ProjectStatus[] = ['ACTIVE', 'SPECIALLY_CLOSED', 'COMPLETED'];

type ProjectSortKey = 'projectName' | 'customer' | 'budget' | 'status' | 'createdAt';
type SortDirection = 'asc' | 'desc';

/** Technical / invoicing progress across all of a project's orders — the plain
 *  figure, no progress bar. */
const PercentCell = ({ percent }: { percent?: number }) => {
    if (percent === undefined) return <span className="text-slate-300 dark:text-white/30">—</span>;
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    return (
        <span className={`font-mono text-[12.5px] font-semibold tabular-nums ${clamped >= 100 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-700 dark:text-white/80'}`}>
            {clamped}%
        </span>
    );
};

const projectCustomerName = (p: ProjectDto) => p.customer?.companyName || p.customerId || '';
const projectTenderNo = (p: ProjectDto) => (p.tender?.tenderNumber ? p.tender.tenderNumber : (p.tenderId || ''));

export const Projects = () => {
    const navigate = useNavigate();
    const [projects, setProjects] = useState<ProjectDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [flowMap, setFlowMap] = useState<Record<string, ProjectFlow>>({});
    const [addonMap, setAddonMap] = useState<Record<string, number>>({});
    const flowSourcesRef = useRef<{ orders: Awaited<ReturnType<typeof myOrdersApi.listProjectFlow>>; deliveryReports: Awaited<ReturnType<typeof deliveryReportApi.listProjectFlow>>; invoices: Awaited<ReturnType<typeof billingApi.listProjectFlowInvoices>> } | null>(null);

    const [search, setSearch] = useState('');
    // Kolon bazlı filtreler (tablo başlığı altındaki filtre satırı).
    const [nameFilter, setNameFilter] = useState('');
    const [customerFilter, setCustomerFilter] = useState('');
    const [tenderFilter, setTenderFilter] = useState('');
    // Durum seçici üst çubukta — müşteri/teklif listeleriyle aynı desen.
    const [statusFilter, setStatusFilter] = useState<ProjectStatus | ''>('');
    // Sürüklenebilir sütunlar; proje adı sütununun genişliği yoktur, kalanı o emer.
    // Genişlikler 20.08.2026'da ferahlatıldı: "Rapport"/"Technik" başlıkları
    // kendi hücrelerine sığmayıp komşularının üstüne biniyordu (başlık şeridi
    // `white-space: nowrap`). Anahtar bu yüzden v2 — v1'i saklamış tarayıcılar
    // da yeni ölçüyü alsın.
    const grid = useColumnWidths({
        storageKey: 'offitec:project-list:col-widths:v2',
        defaults: { customer: 190, tender: 128, budget: 128, report: 84, appointment: 136, status: 144, technical: 100, billing: 100 },
        minPx: 64,
    });
    const [sortBy, setSortBy] = useState<ProjectSortKey>('createdAt');
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
                    : Promise.all([myOrdersApi.listProjectFlow(), deliveryReportApi.listProjectFlow(), billingApi.listProjectFlowInvoices()]).then(
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
                    .reduce((n, o) => n + (o.addonCount || 0), 0);
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

    // Müşteri listesiyle aynı davranış: aynı kolona tıklandıkça asc/desc döner.
    const toggleSort = (column: ProjectSortKey) => {
        setSortDirection(sortBy === column && sortDirection === 'asc' ? 'desc' : 'asc');
        setSortBy(column);
    };

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

    // Telefon kartında her hücrenin başına kendi sütun adı yazılır
    // (`data-label`); metin başlıkla AYNI çeviri anahtarından gelir.
    const colLabel = {
        customer: t('nav.quickActionsGroup.customers'),
        tender: t('auto.teklif'),
        budget: t('auto.butce'),
        report: t('auto.rapor'),
        appointment: t('auto.randevu'),
        status: t('common.status'),
        technical: t('projects.listColTechnical'),
        billing: t('projects.listColBilling'),
    };

    return (
        <div className="flex w-full flex-col gap-4">
            <InventoryListHeader title={t('nav.projects')} />

            {/* Üst çubuk — müşteri listesiyle aynı: genel arama + durum seçici.
                Telefonda ikisi de tam genişlik: 390px'te yan yana sıkışmak
                yerine alt alta, dokunulacak kadar geniş dururlar. */}
            <div className="flex flex-wrap items-center gap-2">
                <div className="w-full sm:w-64">
                    <SearchBox
                        value={search}
                        onChange={setSearch}
                        placeholder={t('projects.searchPlaceholder')}
                    />
                </div>
                <select
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value as ProjectStatus | '')}
                    aria-label={t('common.status')}
                    className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] shadow-[0_1px_2px_rgba(15,23,42,0.04)] text-slate-700 focus:border-[#1f2654] focus:outline-none sm:w-auto dark:border-white/20 dark:bg-transparent dark:text-white"
                >
                    <option value="">{t('auto.tum_durumlar')}</option>
                    {FILTERABLE_STATUSES.map((key) => (
                        <option key={key} value={key}>{getStatusLabel()[key]}</option>
                    ))}
                </select>
            </div>

            <SectionCard title={`${t('nav.projects')} (${total})`}>
                {/* `data-list-table`: ferah satır ölçüsü + telefonda kart
                    görünümü (bkz. index.css "ÜBERSICHTSLISTEN"). */}
                <table data-inv-table data-list-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        {/* Proje adı: genişliği yok, kalan yeri emer. */}
                        <col />
                        <ResizableCols keys={['customer', 'tender', 'budget', 'report', 'appointment', 'status', 'technical', 'billing'] as const} grid={grid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <SortableTh label={t('nav.projects')} sortKey="projectName" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" />
                            <SortableTh label={t('nav.quickActionsGroup.customers')} sortKey="customer" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('customer')} />
                            <th className="relative text-left">
                                {t('auto.teklif')}
                                <ColResizeHandle {...grid.resizeProps('tender')} />
                            </th>
                            <SortableTh label={t('auto.butce')} sortKey="budget" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-right" {...grid.resizeProps('budget')} />
                            <th className="relative text-right">
                                {t('auto.rapor')}
                                <ColResizeHandle {...grid.resizeProps('report')} />
                            </th>
                            <th className="relative text-left">
                                {t('auto.randevu')}
                                <ColResizeHandle {...grid.resizeProps('appointment')} />
                            </th>
                            <SortableTh label={t('common.status')} sortKey="status" activeKey={sortBy} direction={sortDirection} onSort={toggleSort} className="text-left" {...grid.resizeProps('status')} />
                            <th className="relative text-left">
                                {t('projects.listColTechnical')}
                                <ColResizeHandle {...grid.resizeProps('technical')} />
                            </th>
                            <th className="relative text-left">
                                {t('projects.listColBilling')}
                                <ColResizeHandle {...grid.resizeProps('billing')} />
                            </th>
                        </tr>
                        {/* Kolon bazlı filtre satırı — proje / müşteri / teklif no metinle daraltır. */}
                        <tr data-filter-row>
                            <th className="pb-1.5">
                                <input value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th className="pb-1.5">
                                <input value={customerFilter} onChange={(e) => setCustomerFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            <th className="pb-1.5">
                                <input value={tenderFilter} onChange={(e) => setTenderFilter(e.target.value)} placeholder={`${t('common.filter')}...`} className={FILTER_INPUT_CLASS} />
                            </th>
                            {/* Filtresi olmayan sütunlar da kendi (boş) hücrelerini
                                alır ki sütun çizgileri burada da kesilmesin. */}
                            <th />
                            <th />
                            <th />
                            <th />
                            <th />
                            <th />
                        </tr>
                    </thead>
                    <tbody>
                        {(loading || paged.length === 0) && (
                            <TableStateRow
                                colSpan={9}
                                loading={loading}
                                emptyText={hasActiveFilters
                                    ?t('auto.secili_filtrelere_uygun_proje_bulunamadi_arama_v')
                                    :t('auto.onayli_teklif_uzerinden_proje_olusturabilirsiniz')}
                            />
                        )}
                        {!loading && paged.map((project) => {
                            const bookedAll = (project.appointments || [])
                                .filter((a) => a.status === 'BOOKED')
                                .sort((a, b) => dayjs(a.startTime).valueOf() - dayjs(b.startTime).valueOf());
                            const booked = bookedAll.find((a) => dayjs(a.startTime).isAfter(dayjs())) || bookedAll[bookedAll.length - 1];
                            return (
                                <tr
                                    key={project.id}
                                    className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    onClick={() => navigate(`/projects/${project.id}`)}
                                >
                                    <td>
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <div className="flex size-8 shrink-0 items-center justify-center rounded bg-blue-50 text-blue-700 dark:bg-sky-500/15 dark:text-sky-300">
                                                <BriefcaseBusiness size={14} />
                                            </div>
                                            <div className="min-w-0">
                                                <div className="flex min-w-0 items-center gap-2">
                                                    <span className="truncate font-semibold text-slate-900 dark:text-white">{project.projectName}</span>
                                                    {addonMap[project.id] > 0 && (
                                                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-100 px-1.5 py-px text-[10px] font-semibold text-amber-700">
                                                            <Plus size={9} />{t('projects.complete.addonCount', { count: addonMap[project.id] })}
                                                        </span>
                                                    )}
                                                </div>
                                                {/* Proje adı zaten kodun kendisi (PR-2026-10011) — kod
                                                    burada TEKRARLANMAZ, altta yalnızca tarih durur
                                                    (kullanıcı isteği). Eski, koddan farklı adlanmış
                                                    projelerde kod bilgi kaybolmasın diye kalır. */}
                                                <div className="ofi-list-sub flex items-center gap-1.5 text-[11.5px] text-slate-400">
                                                    {project.projectNumber && project.projectNumber !== project.projectName && (
                                                        <span className="font-mono font-semibold text-slate-500 dark:text-white/60">{project.projectNumber}</span>
                                                    )}
                                                    <span>{dayjs(project.createdAt).format('DD.MM.YYYY')}</span>
                                                </div>
                                            </div>
                                        </div>
                                    </td>
                                    {/* İki satır TEK kutuda: telefon kartında hücre
                                        "etiket ↔ değer" diye yan yana dizilir, sarmalayıcı
                                        olmasa iki satır etiketin yanına ayrı ayrı düşerdi. */}
                                    <td data-label={colLabel.customer} className="text-[13px] text-slate-700 dark:text-white/80">
                                        <div className="min-w-0">
                                            <span className="block truncate">{project.customer?.companyName || project.customerId}</span>
                                            {/* Satır "PR / müşteri / kişi / tarih" diye okunur:
                                                sorumlu kişi müşterinin altında gösterilir. */}
                                            {project.manager && (
                                                <span className="ofi-list-sub block truncate text-[11.5px] text-slate-400 dark:text-white/50">
                                                    {project.manager.firstName} {project.manager.lastName}
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td data-label={colLabel.tender} className="font-mono text-[12px] text-slate-500 dark:text-white/60">
                                        <span className="block truncate">{project.tender?.tenderNumber ? project.tender.tenderNumber : (project.tenderId || '—')}</span>
                                    </td>
                                    <td data-label={colLabel.budget} className="text-right font-mono text-[13px] font-semibold text-slate-900 dark:text-white">{money(project.plannedBudget)}</td>
                                    <td data-label={colLabel.report} className="text-right font-mono text-[13px] text-slate-600 dark:text-white/70">{project._count?.reports || 0}</td>
                                    <td data-label={colLabel.appointment}>
                                        {booked ? (
                                            <span className={`inline-flex items-center gap-1.5 ${dayjs(booked.startTime).isAfter(dayjs()) ? 'text-[#272f67] dark:text-sky-300' : 'text-slate-500 dark:text-white/60'}`}>
                                                <CalendarClock size={12} className="shrink-0" />
                                                <span>
                                                    <span className="block text-[12.5px] font-medium leading-tight">{dayjs(booked.startTime).format('DD.MM.YYYY')}</span>
                                                    <span className="block text-[11px] leading-tight text-slate-400">{dayjs(booked.startTime).format('HH:mm')}</span>
                                                </span>
                                            </span>
                                        ) : <span className="text-slate-300 dark:text-white/30">—</span>}
                                    </td>
                                    <td data-label={colLabel.status}><ProjectStatusBadge status={project.status} /></td>
                                    <td data-label={colLabel.technical}><PercentCell percent={flowMap[project.id]?.technicalPercent} /></td>
                                    <td data-label={colLabel.billing}><PercentCell percent={flowMap[project.id]?.billingPercent} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                <div className="border-t border-slate-200 dark:border-white/10">
                    <Pager
                        page={pageSafe}
                        totalPages={totalPages}
                        total={total}
                        pageSize={PAGE_SIZE}
                        onPage={setPage}
                    />
                </div>
            </SectionCard>
        </div>
    );
};
