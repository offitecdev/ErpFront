import { useEffect, useMemo, useState } from 'react';
import type React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    CalendarCheck01 as CalendarClock,
    CheckCircle as CheckCircle2,
    ChevronDown,
    Clipboard as ClipboardPenLine,
    Edit01 as Pencil,
    FileDownload02 as FileDown,
    Mail01 as Mail,
    PackagePlus,
    Receipt as ReceiptText,
    Save01 as Save,
    SearchLg as Search,
    Send01 as Send,
    Trash01 as Trash2,
    User01 as UserRound,
    X,
} from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { SlidePanel } from '../../components/layout/SlidePanel';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Field, Input, Select, Textarea } from '../../components/ui-shared/Field';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { BillingButton } from '../../components/billing/BillingButton';
import { mailApi, projectApi, type CompleteInstallationInput } from '../../lib/api/project';
import { tenderApi } from '../../lib/api/tender';
import { useAuthStore } from '../../store/authStore';
import type { PersonLite } from '../../types/maintenance';
import type { MailSettingDto, ProjectDto, ProjectMaterial, ProjectSalesOrder, ProjectStatus } from '../../types/project';

import { t } from '@/i18n/translate';

type TabKey = 'overview' | 'costs' | 'reports' | 'materials' | 'booking' | 'createAddon';
type SummaryKey = 'orderBudget' | 'overtime' | 'expenses' | 'extraMaterials' | 'total';
type MaterialMode = 'used' | 'extra';
type BookingMode = 'booking' | 'mail' | 'signature';

const STATUS_LABEL: Record<ProjectStatus, string> = {
    AWAITING_APPROVAL:t('projects.statusPending'),
    ACTIVE:t('common.active'),
    ON_HOLD:t('projects.statusOnHold'),
    COMPLETED:t('common.completed'),
    CANCELLED:t('common.cancel'),
};

const STATUS_VARIANT: Record<ProjectStatus, 'warning' | 'active' | 'passive' | 'info'> = {
    AWAITING_APPROVAL: 'warning',
    ACTIVE: 'active',
    ON_HOLD: 'info',
    COMPLETED: 'active',
    CANCELLED: 'passive',
};

const money = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(value || 0);

const numberFmt = (value?: number | null) =>
    new Intl.NumberFormat('de-CH', { maximumFractionDigits: 2 }).format(value || 0);

const MaterialSearchSelect = ({
    value,
    materials,
    disabled,
    onChange,
}: {
    value: string;
    materials: ProjectMaterial[];
    disabled?: boolean;
    onChange: (materialId: string) => void;
}) => {
    const [query, setQuery] = useState('');
    const [appliedQuery, setAppliedQuery] = useState('');
    const normalizedQuery = appliedQuery.trim().toLocaleLowerCase('tr-TR');
    const selectedMaterial = useMemo(() => materials.find((material) => material.id === value) || null, [materials, value]);
    const filteredMaterials = useMemo(() => {
        const activeMaterials = materials.filter((material) => material.isActive !== false);
        if (!normalizedQuery) return activeMaterials.slice(0, 50);
        return activeMaterials.filter((material) => {
            const haystack = `${material.name || ''} ${material.serialId || ''}`.toLocaleLowerCase('tr-TR');
            return haystack.includes(normalizedQuery);
        }).slice(0, 50);
    }, [materials, normalizedQuery]);
    const options = selectedMaterial && !filteredMaterials.some((material) => material.id === selectedMaterial.id)
        ? [selectedMaterial, ...filteredMaterials]
        : filteredMaterials;

    return (
        <div className="space-y-2">
            <div className="grid grid-cols-[minmax(0,1fr)_36px] gap-2">
                <Input
                    value={query}
                    disabled={disabled || materials.length === 0}
                    placeholder={selectedMaterial ? `${selectedMaterial.name} ara veya degistir` :t('auto.malzeme_ara')}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            setAppliedQuery(query);
                        }
                    }}
                />
                <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    icon={<Search size={13} />}
                    disabled={disabled || materials.length === 0}
                    onClick={() => setAppliedQuery(query)}
                />
            </div>
            <Select
                value={value}
                disabled={disabled || materials.length === 0}
                onChange={(event) => {
                    onChange(event.target.value);
                    setQuery('');
                    setAppliedQuery('');
                }}
            >
                <option value="">{materials.length ?t('auto.malzeme_secin') :t('auto.malzeme_bulunamadi')}</option>
                {options.map((material) => (
                    <option key={material.id} value={material.id}>
                        {material.name} ({material.serialId ||t('auto.kod_yok')}{") - stok"}{numberFmt(material.stockQuantity)}
                    </option>
                ))}
            </Select>
            {materials.length > 0 && normalizedQuery && options.length === 0 && (
                <div className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500">{t('auto.arama_sonucu_yok')}</div>
            )}
        </div>
    );
};

const durationFmt = (minutes?: number | null) => {
    const total = Math.max(0, Number(minutes || 0));
    const hours = Math.floor(total / 60);
    const mins = total % 60;
    if (hours && mins) return `${hours} sa ${mins} dk`;
    if (hours) return `${hours} sa`;
    return `${mins} dk`;
};

const appointmentDuration = (appointment: { startTime: string; endTime: string }) =>
    Math.max(0, dayjs(appointment.endTime).diff(dayjs(appointment.startTime), 'minute'));

const appointmentDayKey = (value?: string | null) => value ? dayjs(value).format('YYYY-MM-DD') : '';

const getProjectSalesOrders = (project?: ProjectDto | null): ProjectSalesOrder[] =>
    [...(project?.salesOrders || [])].sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf());

const getProjectDisplayOrders = (project?: ProjectDto | null): ProjectSalesOrder[] => {
    const orders = getProjectSalesOrders(project);
    if (orders.length || !project?.tender) return orders;
    return [{
        id: `project-main-${project.id}`,
        tenantId: project.tenantId,
        customerId: project.customerId,
        tenderId: project.tenderId || project.tender.id,
        projectId: project.id,
        orderNumber: project.tender.tenderNumber || project.projectName,
        orderType: 'PROJECT_NEW',
        status: 'ORDERED',
        totalAmount: project.plannedBudget,
        createdAt: project.createdAt,
        customer: project.customer,
        tender: project.tender,
    }];
};

const orderPayloadId = (order?: ProjectSalesOrder | null) =>
    order?.id && !order.id.startsWith('project-main-') ? (order.parentSalesOrderId || order.id) : null;

const getOrderRecordDate = (record: any) =>
    record.expenseDate || record.addedAt || record.reportDate || record.createdAt || record.workDate || record.startTime || null;

const scopedRecords = <T extends { salesOrderId?: string | null }>(records: T[] | undefined, order: ProjectSalesOrder | null, isPrimary: boolean, orders: ProjectSalesOrder[] = []) => {
    if (order?.parentSalesOrderId) {
        const previousAddon = orders
            .filter((candidate) =>
                candidate.parentSalesOrderId === order.parentSalesOrderId &&
                dayjs(candidate.createdAt).isBefore(dayjs(order.createdAt))
            )
            .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0];
        const start = previousAddon ? dayjs(previousAddon.createdAt).valueOf() : null;
        const end = dayjs(order.createdAt).valueOf();
        return (records || []).filter((record) => {
            if (record.salesOrderId !== order.parentSalesOrderId) return false;
            const rawDate = getOrderRecordDate(record);
            if (!rawDate) return false;
            const time = dayjs(rawDate).valueOf();
            return time <= end && (start === null || time > start);
        });
    }
    const payloadId = orderPayloadId(order);
    if (!payloadId) return records || [];
    return (records || []).filter((record) => record.salesOrderId === payloadId || (isPrimary && !record.salesOrderId));
};

const findAppointmentReport = (project: ProjectDto, appointment: { startTime: string; salesOrderId?: string | null }) =>
    (project.reports || []).find((report: any) => {
        const sameDay = appointmentDayKey(report.workDate || report.reportDate || report.startedAt) === appointmentDayKey(appointment.startTime);
        const sameOrder = (report.salesOrderId || null) === (appointment.salesOrderId || null);
        return sameDay && sameOrder;
    }) || null;

const hasAppointmentDayStarted = (appointment: { startTime: string }) =>
    !dayjs().isBefore(dayjs(appointment.startTime), 'day');

const isAppointmentAwaitingTechnician = (project: ProjectDto, appointment: any) =>
    appointment.status !== 'COMPLETED' && hasAppointmentDayStarted(appointment) && !findAppointmentReport(project, appointment);

const canManagerFinishAppointment = (project: ProjectDto, appointment: any) =>
    isAppointmentAwaitingTechnician(project, appointment) && dayjs().isAfter(dayjs(appointment.endTime));

const getAwaitingTechnicianAppointments = (project: ProjectDto, order: ProjectSalesOrder | null, isPrimary: boolean, orders: ProjectSalesOrder[]) =>
    scopedRecords(project.appointments, order, isPrimary, orders).filter((appointment: any) => isAppointmentAwaitingTechnician(project, appointment));

const getAddonParentOrder = (order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) =>
    order?.parentSalesOrderId
        ? orders.find((candidate) => candidate.id === order.parentSalesOrderId) || null
        : order;

const getPendingAddonSummary = (project: ProjectDto, order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) => {
    const parentOrder = getAddonParentOrder(order, orders);
    const addons = parentOrder
        ? orders
            .filter((candidate) => candidate.parentSalesOrderId === parentOrder.id)
            .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
        : [];
    const latestAddon = addons[addons.length - 1] || null;
    const start = latestAddon ? dayjs(latestAddon.createdAt).valueOf() : null;
    const afterLatestAddon = (record: any) => {
        if (!parentOrder || record.salesOrderId !== parentOrder.id) return false;
        if (start === null) return true;
        const rawDate = getOrderRecordDate(record);
        return rawDate ? dayjs(rawDate).valueOf() > start : false;
    };
    const pendingExpenses = (project.expenses || []).filter(afterLatestAddon);
    const pendingExtraMaterials = (project.extraMaterials || []).filter(afterLatestAddon);
    const pendingReports = (project.reports || []).filter(afterLatestAddon);
    const expenseTotal = pendingExpenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const materialTotal = pendingExtraMaterials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const overtimeTotal = pendingReports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
    return {
        parentOrder,
        addons,
        latestAddon,
        pendingExpenses,
        pendingExtraMaterials,
        pendingReports,
        expenseTotal,
        materialTotal,
        overtimeTotal,
        total: expenseTotal + materialTotal + overtimeTotal,
    };
};

const hasAddonAttention = (project: ProjectDto, order: ProjectSalesOrder | null, orders: ProjectSalesOrder[]) => {
    const summary = getPendingAddonSummary(project, order, orders);
    return summary.total > 0 || summary.addons.length > 0;
};

const tabs: Array<{ key: TabKey; label: string }> = [
    { key: 'overview', label:t('auto.genel_bakis') },
    { key: 'costs', label:t('auto.harici_giderler') },
    { key: 'reports', label:t('auto.saha_raporlari') },
    { key: 'materials', label:t('nav.materials') },
    { key: 'booking', label:t('auto.randevu') },
    { key: 'createAddon', label:t('auto.ek_siparis_olustur') },
];

export const ProjectDetail = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, permissions } = useAuthStore();
    const [project, setProject] = useState<ProjectDto | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [mailSettings, setMailSettings] = useState<MailSettingDto | null>(null);
    const [activeTab, setActiveTab] = useState<TabKey>('overview');
    const [expandedSummary, setExpandedSummary] = useState<SummaryKey | null>(null);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [loadError, setLoadError] = useState<string | null>(null);

    const load = async (silent = false) => {
        if (!id) return;
        if (!silent) setLoading(true);
        if (!silent) setLoadError(null);
        try {
            const [projectData, materialData] = await Promise.all([
                projectApi.getById(id),
                projectApi.materials().catch(() => []),
            ]);
            setProject(projectData);
            setMaterials(materialData);
            setLoadError(null);
        } catch (e: any) {
            const message = e.response?.data?.error ||t('auto.proje_yuklenemedi');
            toast.error(message);
            if (!silent) {
                setProject(null);
                setLoadError(message);
            }
        } finally {
            if (!silent) setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        void mailApi.getSettings().then(setMailSettings).catch(() => undefined);
    }, [id]);

    const salesOrders = useMemo(() => getProjectDisplayOrders(project), [project]);
    const selectedOrder = salesOrders.find((order) => order.id === selectedOrderId) || salesOrders[0] || null;
    const selectedOrderIndex = Math.max(0, salesOrders.findIndex((order) => order.id === selectedOrder?.id));
    const selectedOrderIsPrimary = selectedOrderIndex <= 0;
    const selectedOrderIsAddon = Boolean(selectedOrder?.parentSalesOrderId);
    const totals = useMemo(() => calculateTotals(project, selectedOrder, selectedOrderIsPrimary, salesOrders), [project, selectedOrder, selectedOrderIsPrimary, salesOrders]);
    const projectTotals = useMemo(() => calculateProjectTotals(project, salesOrders), [project, salesOrders]);
    const addonAttention = useMemo(() => project ? hasAddonAttention(project, selectedOrder, salesOrders) : false, [project, selectedOrder, salesOrders]);
    const summaryCards: Array<{ key: SummaryKey; label: string; value: number; tone: MetricTone; strong?: boolean }> = [
        { key: 'orderBudget', label:t('auto.siparis_tutari'), value: projectTotals.orderBudget, tone: 'brand' },
        { key: 'overtime', label:t('auto.ek_iscilik'), value: projectTotals.overtime, tone: 'success' },
        { key: 'expenses', label:t('auto.harici_gider'), value: projectTotals.expenses, tone: 'warning' },
        { key: 'extraMaterials', label:t('auto.malzeme'), value: projectTotals.extraMaterials, tone: 'purple' },
        { key: 'total', label:t('common.total'), value: projectTotals.total, tone: 'total', strong: true },
    ];
    const expandedSummaryRows = useMemo(() => (
        expandedSummary
            ? salesOrders.map((order, index) => ({
                id: order.id,
                orderNumber: order.orderNumber,
                value: calculateTotals(project, order, index <= 0, salesOrders)[expandedSummary],
            }))
            : []
    ), [expandedSummary, project, salesOrders]);
    const booked = scopedRecords(project?.appointments, selectedOrder, selectedOrderIsPrimary, salesOrders).find((a) => a.status === 'BOOKED');
    const awaitingTechnicianAppointments = useMemo(
        () => project ? getAwaitingTechnicianAppointments(project, selectedOrder, selectedOrderIsPrimary, salesOrders) : [],
        [project, selectedOrder, selectedOrderIsPrimary, salesOrders],
    );

    useEffect(() => {
        if (!salesOrders.length) {
            setSelectedOrderId(null);
            return;
        }
        if (!selectedOrderId || !salesOrders.some((order) => order.id === selectedOrderId)) {
            setSelectedOrderId(salesOrders[0].id);
        }
    }, [salesOrders, selectedOrderId]);

    if (loading) {
        return (
            <div className="space-y-4">
                <div className="h-24 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map((x) => <div key={x} className="h-20 animate-pulse rounded-md border border-slate-100 bg-slate-50" />)}
                </div>
                <div className="h-80 animate-pulse rounded-md border border-slate-100 bg-slate-50" />
            </div>
        );
    }

    if (!project) {
        return <EmptyState icon={<BriefcaseBusiness size={32} />} title={t('auto.proje_bulunamadi')} description={loadError ||t('auto.proje_silinmis_ya_da_erisiminiz_olmayabilir')} />;
    }

    return (
        <div>
            <PageHeader
                breadcrumb="Proje Yönetimi"
                title={
                    <span className="flex flex-wrap items-center gap-3">
                        <span>{project.projectName}</span>
                        <StatusChip variant={STATUS_VARIANT[project.status]}>{STATUS_LABEL[project.status]}</StatusChip>
                    </span>
                }
                description={
                    <span className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[12.5px]">
                        <span className="inline-flex items-center gap-1"><UserRound size={11} /> {project.customer?.companyName || project.customerId}</span>
                        <span className="inline-flex items-center gap-1"><CalendarClock size={11} /> {dayjs(project.createdAt).format('DD.MM.YYYY')}</span>
                    </span>
                }
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/projects')}>{t('auto.listeye_don')}</Button>
                    </div>
                }
            />

            <div className="mb-4 space-y-2">
                <div className="grid grid-cols-2 gap-2 md:grid-cols-5">
                    {summaryCards.map((card) => (
                        <div key={card.key} className="relative">
                            <Metric
                                label={card.label}
                                value={money(card.value)}
                                tone={card.tone}
                                strong={card.strong}
                                expanded={expandedSummary === card.key}
                                onClick={() => setExpandedSummary((current) => current === card.key ? null : card.key)}
                            />
                            {expandedSummary === card.key && (
                                <div className="absolute left-0 top-full z-30 mt-2 w-full min-w-[260px] rounded-md border border-slate-200 bg-white p-2 shadow-lg">
                                    <div className="mb-1 flex items-center justify-between px-2 py-1 text-[12px] font-semibold text-slate-700">
                                        <span>{card.label}</span>
                                        <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-50" onClick={() => setExpandedSummary(null)}>
                                            <ChevronDown size={14} className="rotate-180" />
                                        </button>
                                    </div>
                                    <div className="divide-y divide-slate-100">
                                        {expandedSummaryRows.map((row) => (
                                            <button
                                                key={row.id}
                                                type="button"
                                                className="flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left text-[12.5px] hover:bg-slate-50"
                                                onClick={() => {
                                                    setSelectedOrderId(row.id);
                                                    setExpandedSummary(null);
                                                }}
                                            >
                                                <span className="truncate font-medium text-slate-700">{row.orderNumber}</span>
                                                <span className="font-mono font-semibold text-slate-950">{money(row.value)}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>

            <div className="overflow-visible rounded-xl bg-transparent">
                <div className="grid grid-cols-1 gap-4 bg-transparent lg:grid-cols-[minmax(0,1fr)_248px] lg:items-start">
                    <div className="order-2 min-w-0 lg:order-1">
                        {!selectedOrderIsAddon && <ProjectTopTabs activeTab={activeTab} onSelectTab={setActiveTab} addonAttention={addonAttention} completionAttention={awaitingTechnicianAppointments.length > 0} />}
                        <div className="rounded-xl border border-slate-200/70 bg-white p-4 shadow-xs md:p-6">
                        {selectedOrderIsAddon && selectedOrder && (
                            <AddonOrderOverview project={project} order={selectedOrder} isPrimary={selectedOrderIsPrimary} totals={totals} onBilled={() => void load(true)} />
                        )}
                        {!selectedOrderIsAddon && (
                            <>
                        {activeTab === 'overview' && (
                            <OverviewTab
                                project={project}
                                order={selectedOrder}
                                isPrimary={selectedOrderIsPrimary}
                                totals={totals}
                                booked={booked?.startTime}
                                awaitingAppointments={awaitingTechnicianAppointments}
                                onGoBooking={() => setActiveTab('booking')}
                                onBilled={() => void load(true)}
                            />
                        )}
                        {activeTab === 'costs' && (
                            <CostsTab project={project} order={selectedOrder} isPrimary={selectedOrderIsPrimary} onSaved={() => load(true)} />
                        )}
                        {activeTab === 'reports' && (
                            <ReportsTab project={project} order={selectedOrder} isPrimary={selectedOrderIsPrimary} onSaved={() => load(true)} />
                        )}
                        {activeTab === 'materials' && (
                            <MaterialsTab project={project} order={selectedOrder} isPrimary={selectedOrderIsPrimary} materials={materials} onSaved={() => load(true)} />
                        )}
                        {activeTab === 'booking' && (
                            <BookingTab project={project} order={selectedOrder} isPrimary={selectedOrderIsPrimary} materials={materials} settings={mailSettings} userEmail={user?.email || ''} onSaved={() => load(true)} />
                        )}
                        {activeTab === 'createAddon' && (
                            <CreateAddonOrderTab project={project} order={selectedOrder} orders={salesOrders} canCreate={permissions.includes('projects.createAddonOrder')} onCreated={async (orderId) => {
                                await load(true);
                                setSelectedOrderId(orderId);
                            }} />
                        )}
                            </>
                        )}
                        </div>
                    </div>
                    <div className="order-1 self-start lg:order-2 lg:sticky lg:top-4">
                        <OrderSideNav
                            orders={salesOrders}
                            selectedOrderId={selectedOrder?.id || null}
                            onSelectOrder={(orderId) => {
                                setSelectedOrderId(orderId);
                                setActiveTab('overview');
                            }}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProjectTopTabs = ({ activeTab, onSelectTab, addonAttention = false, completionAttention = false }: { activeTab: TabKey; onSelectTab: (tab: TabKey) => void; addonAttention?: boolean; completionAttention?: boolean }) => (
    <div className="mb-4 overflow-x-auto border-b border-slate-200">
        <div className="flex min-w-max items-center gap-6 px-1">
            {tabs.map((tab) => (
                <button
                    key={tab.key}
                    type="button"
                    onClick={() => onSelectTab(tab.key)}
                    className={`relative whitespace-nowrap pb-3 text-[14px] font-semibold transition-colors ${
                        activeTab === tab.key
                            ?t('auto.text_brand_700_after_absolute_after_inset_x_0_af')
                            :t('auto.text_slate_600_hover_text_slate_950')
                    }`}
                >
                    <span className="inline-flex items-center gap-1.5">
                        {tab.label}
                        {tab.key === 'createAddon' && addonAttention && (
                            <span className="h-2 w-2 rounded-full bg-red-600" aria-label={t('auto.ek_siparis_uyarisi')} />
                        )}
                        {(tab.key === 'overview' || tab.key === 'booking') && completionAttention && (
                            <span className="h-2 w-2 rounded-full bg-red-600" aria-label={t('auto.montaj_bitirme_uyarisi')} />
                        )}
                    </span>
                </button>
            ))}
        </div>
    </div>
);

const SubTabs = <T extends string>({
    tabs,
    activeTab,
    onSelectTab,
}: {
    tabs: Array<{ key: T; label: string }>;
    activeTab: T;
    onSelectTab: (tab: T) => void;
}) => (
    <div className="mb-4 inline-flex rounded-md border border-slate-200 bg-slate-50 p-1">
        {tabs.map((tab) => (
            <button
                key={tab.key}
                type="button"
                onClick={() => onSelectTab(tab.key)}
                className={`rounded px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    activeTab === tab.key
                        ?t('auto.bg_white_text_slate_950_shadow_xs')
                        :t('auto.text_slate_600_hover_text_slate_950')
                }`}
            >
                {tab.label}
            </button>
        ))}
    </div>
);

const AddonOrderOverview = ({ project, order, isPrimary, totals, onBilled }: { project: ProjectDto; order: ProjectSalesOrder; isPrimary: boolean; totals: ReturnType<typeof calculateTotals>; onBilled?: () => void }) => {
    const expenses = scopedRecords(project.expenses, order, isPrimary, project.salesOrders);
    const extraMaterials = scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders);
    const overtimeReports = scopedRecords(project.reports, order, isPrimary, project.salesOrders).filter((report: any) => Number(report.overtimeCost) > 0);

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_siparis')}</div>
                    <div className="mt-1 text-[20px] font-bold text-slate-950">{order.orderNumber}</div>
                </div>
                {!order.id.startsWith('project-main-') && (
                    <BillingButton
                        target={{ type: 'order', id: order.id, label: `Ek Sipariş ${order.orderNumber}` }}
                        onBilled={onBilled}
                        size="md"
                        variant="primary"
                    />
                )}
            </div>
            <div className="max-w-xl rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="space-y-3 text-[13px]">
                    <TotalRow label={t('auto.malzeme')} value={totals.extraMaterials} />
                    <TotalRow label={t('auto.harici_gider')} value={totals.expenses} />
                    <TotalRow label={t('auto.15_uzeri_fazla_calisma')} value={totals.overtime} />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <CostList title={t('auto.malzeme_ayrintilari')} empty="Malzeme yok" rows={extraMaterials.map((item: any) => ({
                    id: item.id,
                    title: item.material?.name ||t('auto.malzeme'),
                    meta: `${numberFmt(item.quantity)} adet x ${money(item.unitPrice)}`,
                    amount: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
                    note: item.description,
                }))} />
                <CostList title={t('auto.harici_gider_ayrintilari')} empty="Harici gider yok" rows={expenses.map((expense: any) => ({
                    id: expense.id,
                    title: expense.expenseType,
                    meta: dayjs(expense.expenseDate).format('DD.MM.YYYY'),
                    amount: expense.amount,
                    note: expense.description,
                }))} />
                <CostList title={t('auto.15_uzeri_fazla_calisma')} empty="Fazla çalışma yok" rows={overtimeReports.map((report: any) => ({
                    id: report.id,
                    title: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
                    meta: `${durationFmt(Number(report.overtimeMinutes || 0))} x ${money(report.overtimeHourlyRate)}`,
                    amount: Number(report.overtimeCost) || 0,
                    note: report.operationsDone,
                }))} />
            </div>
        </div>
    );
};

const calculateTotals = (project: ProjectDto | null, order: ProjectSalesOrder | null, isPrimary: boolean, orders: ProjectSalesOrder[] = []) => {
    const reports = scopedRecords(project?.reports, order, isPrimary, orders);
    const expenses = scopedRecords(project?.expenses, order, isPrimary, orders).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const overtime = reports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0);
    const extraMaterials = scopedRecords(project?.extraMaterials, order, isPrimary, orders).reduce((sum: number, item: any) => {
        return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const isAddonOrder = Boolean(order?.parentSalesOrderId);
    const orderBudget = isAddonOrder ? 0 : Number(order?.totalAmount ?? project?.plannedBudget ?? 0);
    const additions = expenses + extraMaterials + overtime;
    return { orderBudget, expenses, overtime, extraMaterials, additions, total: orderBudget + additions };
};

const calculateProjectTotals = (project: ProjectDto | null, orders: ProjectSalesOrder[]) => {
    const reports = project?.reports || [];
    const expenses = (project?.expenses || []).reduce((sum: number, e: any) => sum + (Number(e.amount) || 0), 0);
    const overtime = reports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0);
    const extraMaterials = (project?.extraMaterials || []).reduce((sum: number, item: any) => {
        return sum + (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
    }, 0);
    const baseOrders = orders.filter((order) => !order.parentSalesOrderId);
    const orderBudget = baseOrders.length
        ? baseOrders.reduce((sum, order) => sum + Number(order.totalAmount || 0), 0)
        : Number(project?.plannedBudget || 0);
    return { orderBudget, expenses, overtime, extraMaterials, total: orderBudget + expenses + overtime + extraMaterials };
};

const getProjectUsedMaterials = (project: ProjectDto, order?: ProjectSalesOrder | null) => {
    const tender = order?.tender || project.tender;
    return (
    [
        ...(tender?.usedMaterials || []).map((usage) => ({
            id: `usage-${usage.id}`,
            rawId: usage.id,
            source: 'tender' as const,
            positionNumber: tender?.tenderNumber || '-',
            positionName:t('auto.teklif_ayarlari'),
            quantity: Number(usage.quantity || 0),
            discount: 0,
            material: usage.material,
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            value: Number(usage.quantity || 0) * Number(usage.unitCost || usage.material?.unitCost || 0),
            description: usage.description,
        })),
        ...((tender?.positions || []).flatMap((position) =>
            (position.materialMappings || []).map((mapping) => ({
                id: `mapping-${mapping.id}`,
                rawId: mapping.id,
                source: 'position' as const,
                positionNumber: position.positionNumber,
                positionName: position.shortDescription ||t('auto.teklif_pozisyonu'),
                quantity: Number(mapping.quantityMultiplier || 0),
                discount: Number(mapping.discount || 0),
                material: mapping.material,
                unitCost: Number(mapping.material?.unitCost || 0),
                value: Number(mapping.quantityMultiplier || 0) * Number(mapping.material?.unitCost || 0),
            }))
        )),
    ].filter((item) => item.quantity > 0)
    );
};

type MetricTone = 'brand' | 'success' | 'warning' | 'purple' | 'total' | 'danger';

const metricToneClass: Record<MetricTone, { card: string; label: string; value: string }> = {
    brand: {
        card:t('auto.border_slate_200_bg_white_80'),
        label: 'text-slate-600',
        value: 'text-slate-950',
    },
    success: {
        card:t('auto.border_emerald_200_bg_emerald_50_55'),
        label: 'text-emerald-700',
        value: 'text-emerald-900',
    },
    warning: {
        card:t('auto.border_amber_200_bg_amber_50_55'),
        label: 'text-amber-700',
        value: 'text-slate-950',
    },
    purple: {
        card:t('auto.border_violet_200_bg_violet_50_50'),
        label: 'text-violet-700',
        value: 'text-violet-950',
    },
    total: {
        card:t('auto.border_yellow_200_bg_yellow_50_70'),
        label: 'text-yellow-800',
        value: 'text-slate-950',
    },
    danger: {
        card:"border-rose-200 bg-rose-50/70",
        label: 'text-rose-700',
        value: 'text-rose-900',
    },
};

const Metric = ({
    label,
    value,
    tone = 'brand',
    strong,
    expanded,
    onClick,
}: {
    label: string;
    value: string;
    tone?: MetricTone;
    strong?: boolean;
    expanded?: boolean;
    onClick?: () => void;
}) => {
    const styles = metricToneClass[tone];

    return (
        <button
            type="button"
            onClick={onClick}
            className={`w-full rounded-md border px-3 py-1.5 text-left shadow-xs transition-all ${styles.card} ${expanded ?t('auto.ring_2_ring_slate_300_ring_offset_1') : ''}`}
        >
            <div className="flex items-start justify-between gap-2">
                <div>
                    <div className={`text-[9.5px] font-semibold uppercase tracking-normal ${styles.label}`}>{label}</div>
                    <div className={`mt-0.5 font-semibold ${strong ? 'text-[16px]' : 'text-[14px]'} ${styles.value}`}>{value}</div>
                </div>
                <ChevronDown size={12} className={`mt-1 shrink-0 text-slate-500 transition-transform ${expanded ? 'rotate-180' : ''}`} />
            </div>
        </button>
    );
};

const OrderSideNav = ({
    orders,
    selectedOrderId,
    onSelectOrder,
}: {
    orders: ProjectSalesOrder[];
    selectedOrderId: string | null;
    onSelectOrder: (orderId: string) => void;
}) => {
    const navigate = useNavigate();
    const baseOrders = orders.filter((order) => !order.parentSalesOrderId);
    const addonsByParent = orders
        .filter((order) => order.parentSalesOrderId)
        .reduce<Record<string, ProjectSalesOrder[]>>((acc, order) => {
            const parentId = order.parentSalesOrderId || '';
            acc[parentId] = [...(acc[parentId] || []), order];
            return acc;
        }, {});

    return (
        <aside className="h-full overflow-visible rounded-lg border border-white/70 bg-white/55 px-4 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.08)] ring-1 ring-slate-900/5 backdrop-blur-xl">
            <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.siparisler')}</div>
            <div className="mt-3 space-y-1 overflow-visible">
                {baseOrders.map((order) => (
                    <div key={order.id}>
                        <button
                            type="button"
                            onClick={() => onSelectOrder(order.id)}
                            className={`block w-full rounded-md border-l-2 px-4 py-2.5 text-left transition-colors ${
                                selectedOrderId === order.id
                                    ?t('auto.border_1f2654_bg_eef4ff_text_1f2654_font_semibol')
                                    :t('auto.border_transparent_text_slate_600_hover_border_s')
                            }`}
                        >
                            <div className="truncate text-[14px] font-semibold">{order.orderNumber}</div>
                        </button>
                        {(addonsByParent[order.id] || []).map((addon) => (
                            <button
                                key={addon.id}
                                type="button"
                                onClick={() => onSelectOrder(addon.id)}
                                className={`ml-4 block w-[calc(100%-1rem)] rounded-md border-l-2 px-3 py-1.5 text-left transition-colors ${
                                    selectedOrderId === addon.id
                                        ?t('auto.border_1f2654_bg_eef4ff_text_1f2654_shadow_xs')
                                        :t('auto.border_transparent_text_slate_500_hover_border_s')
                                }`}
                            >
                                <div className="truncate text-[12px] font-medium">{addon.orderNumber}</div>
                                <div className="mt-0.5 text-[10.5px] text-slate-400">{t('auto.ek_siparis')}</div>
                            </button>
                        ))}
                    </div>
                ))}
            </div>
            <div className="mt-4 border-t border-slate-200/60 pt-3">
                <button
                    type="button"
                    onClick={() => navigate('/crm/my-orders')}
                    className="block w-full rounded-md px-3 py-2 text-left text-[12px] text-slate-500 transition-colors hover:bg-white/60 hover:text-[#1f2654]"
                >{t('auto.siparislerim_crm')}</button>
            </div>
        </aside>
    );
};

const OverviewTab = ({
    project,
    order,
    isPrimary,
    totals,
    booked,
    awaitingAppointments,
    onGoBooking,
    onBilled,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    totals: ReturnType<typeof calculateTotals>;
    booked?: string;
    awaitingAppointments: any[];
    onGoBooking: () => void;
    onBilled?: () => void;
}) => {
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const expenses = scopedRecords(project.expenses, order, isPrimary, project.salesOrders);
    const extraMaterials = scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders);
    const usedMaterials = getProjectUsedMaterials(project, order);
    const finishableAppointments = awaitingAppointments.filter((appointment) => canManagerFinishAppointment(project, appointment));

    return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {awaitingAppointments.length > 0 && (
            <div className="lg:col-span-3 rounded-md border border-red-200 bg-red-50 px-4 py-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 text-[12.5px] font-semibold text-red-700">
                            <AlertTriangle size={15} />
                            <span>{t('auto.tekniker_hala_bitirmedi')}</span>
                        </div>
                        <div className="mt-1 text-[12px] text-red-700/80">
                            {awaitingAppointments.length}{t('auto.montaj_kaydi_raporsuz_bekliyor')}{finishableAppointments.length > 0 ?t('auto.yonetici_bitirme_icin_randevu_sekmesinde_ilgili_') :t('auto.randevu_suresi_dolmadan_yonetici_bitirme_pasif_k')}
                        </div>
                    </div>
                    <Button type="button" size="sm" variant="secondary" disabled={finishableAppointments.length === 0} onClick={onGoBooking}>{t('auto.yonetici_bitir')}</Button>
                </div>
            </div>
        )}
        <InfoCard title={t('auto.proje_bilgileri')} rows={[
            [t('nav.quickActionsGroup.customers'), project.customer?.companyName || project.customerId],
            [t('auto.siparis'), order?.orderNumber || '-'],
            [t('auto.teklif'), order?.tender?.tenderNumber || order?.tenderId || project.tender?.tenderNumber || project.tenderId || '-'],
            [t('auto.yonetici'), project.manager ? `${project.manager.firstName} ${project.manager.lastName}` : '-'],
            [t('common.start'), project.startDate ? dayjs(project.startDate).format('DD.MM.YYYY') : '-'],
            [t('common.end'), project.endDate ? dayjs(project.endDate).format('DD.MM.YYYY') : '-'],
        ]} />
        <InfoCard title={t('auto.surec')} rows={[
            [t('auto.saha_raporu'), String(reports.length)],
            [t('auto.malzeme'), String(extraMaterials.length + usedMaterials.length)],
            [t('auto.gider_kaydi'), String(expenses.length)],
            [t('auto.randevu'), booked ? dayjs(booked).format("DD.MM.YYYY HH:mm") : '-'],
        ]} />
        <div className="rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
            <div className="flex items-center justify-between gap-2">
                <div className="text-[12px] font-semibold text-slate-700">{t('auto.ucret_ozeti')}</div>
                {order && !order.id.startsWith('project-main-') && (
                    <BillingButton
                        target={{ type: 'order', id: order.id, label: `Sipariş ${order.orderNumber}` }}
                        onBilled={onBilled}
                        size="sm"
                        variant="primary"
                    />
                )}
            </div>
            <div className="mt-3 space-y-2 text-[12.5px]">
                <TotalRow label={t('auto.siparis_toplami')} value={totals.orderBudget} />
                <TotalRow label={t('auto.malzeme')} value={totals.extraMaterials} />
                <TotalRow label={t('auto.harici_gider')} value={totals.expenses} />
                <TotalRow label={t('auto.15_uzeri_fazla_calisma')} value={totals.overtime} />
                <TotalRow label={t('common.total')} value={totals.total} total />
            </div>
        </div>
    </div>
    );
};

const CostsTab = ({ project, order, isPrimary, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; onSaved: () => Promise<void> }) => {
    const [editingExpense, setEditingExpense] = useState<any | null>(null);
    const expenses = scopedRecords(project.expenses, order, isPrimary, project.salesOrders);
    const expenseTotal = expenses.reduce((sum: number, expense: any) => sum + (Number(expense.amount) || 0), 0);
    const reload = async () => {
        setEditingExpense(null);
        await onSaved();
    };

    return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
            <Card title={t('auto.harici_giderler')} noPadding>
                {expenses.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[12px] text-slate-900">{t('auto.gider_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {expenses.map((expense: any) => (
                            <div key={expense.id} className="grid grid-cols-[minmax(0,1fr)_150px_72px] items-start gap-4 px-4 py-3">
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-800">{expense.expenseType}</div>
                                    <div className="text-[11.5px] text-slate-900">{dayjs(expense.expenseDate).format('DD.MM.YYYY')}</div>
                                    {expense.description && <div className="mt-1 text-[12px] text-slate-900">{expense.description}</div>}
                                </div>
                                <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">{money(expense.amount)}</div>
                                <div className="flex justify-end gap-1">
                                    <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50 hover:text-slate-700" title={t('common.edit')} onClick={() => setEditingExpense(expense)}>
                                        <Pencil size={13} />
                                    </button>
                                    <button
                                        type="button"
                                        className="rounded p-1 text-slate-900 hover:bg-rose-50 hover:text-rose-600"
                                        title={t('common.delete')}
                                        onClick={async () => {
                                            if (!confirm(t('auto.harici_gider_silinsin_mi'))) return;
                                            await projectApi.deleteExpense(expense.id);
                                            toast.success(t('auto.harici_gider_silindi'));
                                            await reload();
                                        }}
                                    >
                                        <Trash2 size={13} />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
        <div>
            <EditableExpenseForm projectId={project.id} salesOrderId={orderPayloadId(order)} editingExpense={editingExpense} onCancelEdit={() => setEditingExpense(null)} onSaved={reload} />
            <div className="mt-4 rounded-md border border-slate-200/70 bg-white p-4">
                <div className="text-[12px] font-semibold text-slate-700">{t('auto.harici_gider_toplami')}</div>
                <div className="mt-3 space-y-2 text-[12.5px]">
                    <TotalRow label={t('common.total')} value={expenseTotal} total />
                </div>
            </div>
        </div>
    </div>
    );
};

const CreateAddonOrderTab = ({
    project,
    order,
    orders,
    canCreate,
    onCreated,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    canCreate: boolean;
    onCreated: (orderId: string) => Promise<void>;
}) => {
    const [loading, setLoading] = useState(false);
    const parentOrder = order?.parentSalesOrderId
        ? orders.find((candidate) => candidate.id === order.parentSalesOrderId) || null
        : order;
    const addons = parentOrder
        ? orders
            .filter((candidate) => candidate.parentSalesOrderId === parentOrder.id)
            .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
        : [];
    const latestAddon = addons[addons.length - 1] || null;
    const start = latestAddon ? dayjs(latestAddon.createdAt).valueOf() : null;
    const nextOrderNumber = parentOrder ? `${parentOrder.orderNumber}-N${addons.length + 1}` : '-';
    const afterLatestAddon = (record: any) => {
        if (!parentOrder || record.salesOrderId !== parentOrder.id) return false;
        if (start === null) return true;
        const rawDate = getOrderRecordDate(record);
        return rawDate ? dayjs(rawDate).valueOf() > start : false;
    };
    const pendingExpenses = (project.expenses || []).filter(afterLatestAddon);
    const pendingExtraMaterials = (project.extraMaterials || []).filter(afterLatestAddon);
    const pendingReports = (project.reports || []).filter(afterLatestAddon);
    const expenseTotal = pendingExpenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const materialTotal = pendingExtraMaterials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
    const overtimeTotal = pendingReports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
    const total = expenseTotal + materialTotal + overtimeTotal;

    if (!parentOrder) {
        return <EmptyState icon={<ReceiptText size={28} />} title={t('auto.siparis_secin')} description={t('auto.ek_siparis_olusturmak_icin_once_sol_menuden_bir_')} />;
    }

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title={t('auto.ek_siparis_olustur')} icon={<ReceiptText size={13} />} className="xl:col-span-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InfoCard title={t('auto.bagli_siparis')} rows={[
                        [t('auto.ana_siparis'), parentOrder.orderNumber],
                        [t('auto.yeni_ek_siparis'), nextOrderNumber],
                        [t('auto.onceki_ek_siparis'), latestAddon?.orderNumber || '-'],
                    ]} />
                    <InfoCard title={t('auto.alinacak_maliyetler')} rows={[
                        [t('auto.harici_gider'), `${pendingExpenses.length} kayıt / ${money(expenseTotal)}`],
                        [t('auto.ek_malzeme'), `${pendingExtraMaterials.length} kayıt / ${money(materialTotal)}`],
                        [t('auto.ek_iscilik'), `${pendingReports.filter((report: any) => Number(report.overtimeCost) > 0).length} kayıt / ${money(overtimeTotal)}`],
                        [t('common.total'), money(total)],
                    ]} />
                </div>
                {!canCreate && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{t('auto.ek_siparis_olusturma_yetkiniz_yok')}</div>
                )}
                <Button
                    className="mt-4"
                    variant="primary"
                    loading={loading}
                    disabled={!canCreate || total <= 0}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.createAddonOrder(project.id, { parentSalesOrderId: parentOrder.id });
                            toast.success(res.message ||t('auto.ek_siparis_olusturuldu'));
                            await onCreated(res.salesOrder.id);
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.ek_siparis_olusturulamadi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {nextOrderNumber}{t('common.create')}</Button>
            </Card>
            <div className="rounded-md border border-slate-200/70 bg-white p-4">
                <div className="text-[12px] font-semibold text-slate-700">{t('auto.ek_siparis_toplami')}</div>
                <div className="mt-3 space-y-2 text-[12.5px]">
                    <TotalRow label={t('auto.harici_gider')} value={expenseTotal} />
                    <TotalRow label={t('auto.ek_malzeme')} value={materialTotal} />
                    <TotalRow label={t('auto.ek_iscilik')} value={overtimeTotal} />
                    <TotalRow label={t('common.total')} value={total} total />
                </div>
            </div>
        </div>
    );
};

const ReportsTab = ({ project, order, isPrimary, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; onSaved: () => Promise<void> }) => {
    const [editingReport, setEditingReport] = useState<any | null>(null);
    const [generalReportOpen, setGeneralReportOpen] = useState(false);
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);

    const reload = async () => {
        setEditingReport(null);
        await onSaved();
    };

    return (
        <>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <div className="xl:col-span-2">
                <Card
                    title={t('auto.saha_raporlari')}
                    icon={<ClipboardPenLine size={13} />}
                    noPadding
                >
                    {reports.length === 0 ? (
                        <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.rapor_yok')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {reports.map((r: any) => (
                                <div key={r.id} className="px-4 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <div>
                                            <div className="font-medium text-slate-800">
                                                {dayjs(r.startedAt).format('HH:mm')} - {dayjs(r.endedAt).format('HH:mm')}{t('auto.saha_calismasi')}</div>
                                            <div className="mt-1 text-[11.5px] text-slate-900">{t('auto.planlanan')}{durationFmt(r.plannedMinutesForDay)}{t('auto.azami')}{durationFmt(Math.ceil(Number(r.plannedMinutesForDay || 0) * 1.15))}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="font-mono text-[11px] text-slate-900">{dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY')}</div>
                                            <button
                                                type="button"
                                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-900 hover:bg-slate-50"
                                                onClick={() => setEditingReport(r)}
                                            >{t('common.edit')}</button>
                                            <button
                                                type="button"
                                                className="rounded border border-slate-200 px-2 py-1 text-[11px] text-slate-900 hover:bg-slate-50"
                                                onClick={async () => {
                                                    const { exportProjectReportPdf } = await import("../../utils/pdf/projectReportPdf");
                                                    await exportProjectReportPdf(project, r);
                                                }}
                                            >
                                                PDF
                                            </button>
                                        </div>
                                    </div>
                                    {Number(r.overtimeMinutes) > 0 && (
                                        <div className="mt-2 text-[11.5px] text-slate-900">{"Kritik %15:"}{durationFmt(Number(r.overtimeMinutes))}{t('auto.fazla_calisma')}{money(Number(r.overtimeCost) || 0)}
                                        </div>
                                    )}
                                    <div className="mt-1 whitespace-pre-wrap text-[12.5px] text-slate-900">{r.operationsDone}</div>
                                    {r.technicalNotes && <div className="mt-1 text-[12px] text-slate-900">{r.technicalNotes}</div>}
                                </div>
                            ))}
                        </div>
                    )}
                    <div className="flex justify-end border-t border-slate-100 px-4 py-3">
                        <Button
                            variant="secondary"
                            icon={<FileDown size={13} />}
                            onClick={() => setGeneralReportOpen(true)}
                            disabled={reports.length === 0}
                        >{t('auto.genel_rapor_al')}</Button>
                    </div>
                </Card>
            </div>
                <ReportForm project={project} order={order} isPrimary={isPrimary} editingReport={editingReport} onCancelEdit={() => setEditingReport(null)} onSaved={reload} />
        </div>
        <GeneralReportPanel project={project} reports={reports} open={generalReportOpen} onClose={() => setGeneralReportOpen(false)} />
        </>
    );
};

const reportDay = (report: any) => dayjs(report.workDate || report.reportDate || report.startedAt).format('YYYY-MM-DD');

const GeneralReportPanel = ({ project, reports, open, onClose }: { project: ProjectDto; reports: any[]; open: boolean; onClose: () => void }) => {
    const reportDates = useMemo(() => reports.map(reportDay).filter(Boolean).sort(), [reports]);
    const [range, setRange] = useState({
        startDate: reportDates[0] || dayjs().format('YYYY-MM-DD'),
        endDate: reportDates[reportDates.length - 1] || dayjs().format('YYYY-MM-DD'),
    });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRange({
            startDate: reportDates[0] || dayjs().format('YYYY-MM-DD'),
            endDate: reportDates[reportDates.length - 1] || dayjs().format('YYYY-MM-DD'),
        });
    }, [project.id, reportDates[0], reportDates[reportDates.length - 1]]);

    const selectedReports = useMemo(() => reports.filter((report: any) => {
        const key = reportDay(report);
        return key >= range.startDate && key <= range.endDate;
    }), [reports, range.startDate, range.endDate]);

    return (
        <SlidePanel
            open={open}
            onClose={onClose}
            title={t('auto.ozel_genel_rapor')}
            subtitle={t('auto.tarih_araligindaki_saha_raporlarini_tek_ciktida_')}
            width="w-[440px]"
        >
            <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('common.start')}>
                        <Input type="date" value={range.startDate} onChange={(e) => setRange({ ...range, startDate: e.target.value })} />
                    </Field>
                    <Field label={t('common.end')}>
                        <Input type="date" value={range.endDate} onChange={(e) => setRange({ ...range, endDate: e.target.value })} />
                    </Field>
                </div>

                <div className="rounded-md border border-slate-200/70 bg-slate-50 px-3 py-2 text-[12px] text-slate-700">
                    <div className="flex items-center justify-between">
                        <span>{t('auto.secilen_saha_raporu')}</span>
                        <span className="font-semibold text-slate-900">{selectedReports.length}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between">
                        <span>{t('auto.ek_calisma_toplami')}</span>
                        <span className="font-semibold text-slate-900">
                            {money(selectedReports.reduce((sum: number, report: any) => sum + (Number(report.overtimeCost) || 0), 0))}
                        </span>
                    </div>
                </div>

                <Button
                    className="w-full"
                    icon={<FileDown size={13} />}
                    loading={loading}
                    onClick={async () => {
                        if (!range.startDate || !range.endDate) return toast.error(t('auto.tarih_araligi_secin'));
                        if (range.startDate > range.endDate) return toast.error(t('auto.baslangic_tarihi_bitisten_sonra_olamaz'));
                        if (selectedReports.length === 0) return toast.error(t('auto.secilen_aralikta_saha_raporu_yok'));
                        setLoading(true);
                        try {
                            const { exportProjectGeneralReportPdf } = await import("../../utils/pdf/projectReportPdf");
                            await exportProjectGeneralReportPdf(project, range);
                            toast.success(t('auto.genel_saha_raporu_olusturuldu'));
                            onClose();
                        } catch (e: any) {
                            toast.error(e?.message ||t('auto.genel_rapor_olusturulamadi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >{t('auto.ozel_rapor_olustur')}</Button>
            </div>
        </SlidePanel>
    );
};

const materialSubTabs: Array<{ key: MaterialMode; label: string }> = [
    { key: 'used', label:t('auto.kullanilan_malzemeler') },
    { key: 'extra', label:t('auto.ek_malzemeler') },
];

const MaterialsTab = ({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [mode, setMode] = useState<MaterialMode>('used');
    const [editingExtraMaterial, setEditingExtraMaterial] = useState<any | null>(null);
    const usedMaterials = getProjectUsedMaterials(project, order);
    const extraMaterials = scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders);
    const reload = async () => {
        setEditingExtraMaterial(null);
        await onSaved();
    };

    return (
        <div>
            <SubTabs tabs={materialSubTabs} activeTab={mode} onSelectTab={setMode} />
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <div className="xl:col-span-2 space-y-4">
                    {mode === 'used' && (
                        <Card title={t('auto.kullanilan_malzemeler')} icon={<PackagePlus size={13} />} noPadding>
                            {usedMaterials.length === 0 ? (
                                <EmptyState icon={<PackagePlus size={28} />} title={t('auto.kullanilan_malzeme_yok')} description={t('auto.teklif_veya_proje_asamasinda_kullanilan_malzeme_')} />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {usedMaterials.map((item) => (
                                        <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                                <div className="text-[11.5px] text-slate-900">
                                                    {item.material?.serialId || '-'} · {numberFmt(item.quantity)}{t('auto.adet_x')}{money(item.unitCost)} · {item.positionNumber}
                                                </div>
                                                <div className="mt-1 text-[12px] text-slate-900">{t('auto.kullanilan_malzeme_fiyat_toplamina_eklenmez')}</div>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">
                                                    <div>{money(item.value)}</div>
                                                    <div className="text-[10.5px] font-normal text-slate-500">{t('auto.dahil_degil')}</div>
                                                </div>
                                                {(order?.tenderId || project.tenderId) && item.source === 'tender' && (
                                                    <button
                                                        type="button"
                                                        className="rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                                                        onClick={async () => {
                                                            if (!confirm(t('auto.kullanilan_malzeme_kaldirilsin_mi'))) return;
                                                            await tenderApi.removeMaterialMapping((order?.tenderId || project.tenderId)!, item.rawId);
                                                            toast.success(t('auto.kullanilan_malzeme_kaldirildi'));
                                                            await onSaved();
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}

                    {mode === 'extra' && (
                        <Card title={t('auto.ek_malzemeler')} icon={<PackagePlus size={13} />} noPadding>
                            {extraMaterials.length === 0 ? (
                                <EmptyState icon={<PackagePlus size={28} />} title={t('auto.ek_malzeme_yok')} description={t('auto.fiyata_eklenecek_proje_malzemeleri_buradan_eklen')} />
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {extraMaterials.map((v: any) => (
                                        <div key={v.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                                            <div>
                                                <div className="font-medium text-slate-800">{v.material?.name ||t('auto.malzeme')}</div>
                                                <div className="text-[11.5px] text-slate-900">{numberFmt(v.quantity)}{t('auto.adet_x')}{money(v.unitPrice)}</div>
                                                {v.description && <div className="mt-1 text-[12px] text-slate-900">{v.description}</div>}
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="font-mono text-[12.5px] font-semibold">{money((Number(v.quantity) || 0) * (Number(v.unitPrice) || 0))}</span>
                                                <div className="flex gap-1">
                                                    <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50 hover:text-slate-700" title={t('common.edit')} onClick={() => setEditingExtraMaterial(v)}>
                                                        <Pencil size={13} />
                                                    </button>
                                                    <button
                                                        type="button"
                                                        className="rounded p-1 text-slate-900 hover:bg-rose-50 hover:text-rose-600"
                                                        title={t('common.delete')}
                                                        onClick={async () => {
                                                            if (!confirm(t('auto.ek_malzeme_silinsin_mi'))) return;
                                                            await projectApi.deleteExtraMaterial(v.id);
                                                            toast.success(t('auto.ek_malzeme_silindi'));
                                                            await reload();
                                                        }}
                                                    >
                                                        <Trash2 size={13} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    )}
                </div>
                <div className="space-y-4">
                    {mode === 'used' ? (
                        <UsedMaterialForm project={project} order={order} materials={materials} onSaved={onSaved} />
                    ) : (
                        <VariationForm projectId={project.id} salesOrderId={orderPayloadId(order)} materials={materials} editingMaterial={editingExtraMaterial} onCancelEdit={() => setEditingExtraMaterial(null)} onSaved={reload} />
                    )}
                </div>
            </div>
        </div>
    );
};

const bookingSubTabs: Array<{ key: BookingMode; label: string }> = [
    { key: 'booking', label:t('auto.randevu_saat_planlari') },
    { key: 'mail', label:t('auto.randevu_mail') },
    { key: 'signature', label:t('auto.imzaya_gonder') },
];

const BookingTab = ({
    project,
    order,
    isPrimary,
    materials,
    settings,
    userEmail,
    onSaved,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    materials: ProjectMaterial[];
    settings: MailSettingDto | null;
    userEmail: string;
    onSaved: () => Promise<void>;
}) => {
    const [mode, setMode] = useState<BookingMode>('booking');

    return (
        <div>
            <SubTabs tabs={bookingSubTabs} activeTab={mode} onSelectTab={setMode} />
            {mode === 'booking' && (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                    <div className="xl:col-span-2 space-y-4">
                        <AppointmentList project={project} order={order} isPrimary={isPrimary} materials={materials} onSaved={onSaved} />
                    </div>
                    <div className="space-y-4">
                        <OvertimeRateCard project={project} onSaved={onSaved} />
                        <InfoCard title={t('auto.musteri_iletisim')} rows={[
                            [t('nav.quickActionsGroup.customers'), project.customer?.companyName || '-'],
                            [t('common.email'), project.customer?.mainEmail || '-'],
                            [t('common.phone'), project.customer?.mainPhone || '-'],
                            [t('common.address'), project.customer?.address || '-'],
                        ]} />
                    </div>
                </div>
            )}
            {mode === 'mail' && (
                <MailTab project={project} order={order} settings={settings} userEmail={userEmail} />
            )}
            {mode === 'signature' && (
                <SignatureRequestTab project={project} order={order} isPrimary={isPrimary} settings={settings} userEmail={userEmail} onSaved={onSaved} />
            )}
        </div>
    );
};

const SignatureRequestTab = ({ project, order, isPrimary, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; settings: MailSettingDto | null; userEmail: string; onSaved: () => Promise<void> }) => {
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const [loadingKey, setLoadingKey] = useState<string | null>(null);

    const send = async (report: any, channel: 'technician' | 'mail' | 'both') => {
        setLoadingKey(`${report.id}:${channel}`);
        try {
            await projectApi.requestReportSignature(report.id, {
                channel,
                to: project.customer?.mainEmail || undefined,
                fromEmail: settings?.fromEmail || userEmail,
                fromName: settings?.fromName ||t('auto.offitec_erp'),
                subject: `${project.projectName} - saha raporu imzasi`,
            });
            toast.success(channel === 'technician' ?t('auto.teknisyene_imza_bildirimi_gonderildi') : channel === 'mail' ?t('auto.musteriye_imza_maili_gonderildi') :t('auto.imza_istegi_gonderildi'));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.imza_istegi_gonderilemedi'));
        } finally {
            setLoadingKey(null);
        }
    };

    return (
        <Card title={t('auto.imzaya_gonder')} icon={<Send size={13} />} noPadding>
            {reports.length === 0 ? (
                <EmptyState icon={<ClipboardPenLine size={28} />} title={t('auto.saha_raporu_yok')} description={t('auto.imzaya_gondermek_icin_once_saha_raporu_olusturun')} />
            ) : (
                <div className="divide-y divide-slate-100">
                    {reports.map((report: any) => (
                        <div key={report.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                            <div className="min-w-0">
                                <div className="text-[13px] font-semibold text-slate-900">{dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')}{t('auto.saha_raporu')}</div>
                                <div className="mt-0.5 text-[12px] text-slate-500">{dayjs(report.startedAt).format('HH:mm')} - {dayjs(report.endedAt).format('HH:mm')} · {report.isSigned ?t('auto.imzali') :t('auto.imza_bekliyor')}</div>
                            </div>
                            <div className="flex flex-wrap gap-2">
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:technician`} onClick={() => send(report, 'technician')}>{t('auto.teknikere_gonder')}</Button>
                                <Button size="sm" variant="secondary" loading={loadingKey === `${report.id}:mail`} onClick={() => send(report, 'mail')}>{t('auto.musteriye_mail')}</Button>
                                <Button size="sm" loading={loadingKey === `${report.id}:both`} onClick={() => send(report, 'both')}>{t('auto.ikisine_gonder')}</Button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </Card>
    );
};

const appointmentToForm = (appointment?: any) => ({
    id: appointment?.id || '',
    assignedTechId: appointment?.assignedTechId || '',
    technicianIds: appointment ? appointmentTechnicianIds(appointment) : [],
    date: appointment ? dayjs(appointment.startTime).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
    start: appointment ? dayjs(appointment.startTime).format('HH:mm') : '09:00',
    end: appointment ? dayjs(appointment.endTime).format('HH:mm') : '17:00',
    notes: appointment?.notes || '',
});

const appointmentTechnicianIds = (appointment: any) => {
    const ids = new Set<string>();
    if (appointment?.assignedTechId) ids.add(appointment.assignedTechId);
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technicianId) ids.add(assignment.technicianId);
    });
    return Array.from(ids);
};

const appointmentTechnicianNames = (appointment: any) => {
    const names = new Map<string, string>();
    if (appointment?.assignedTechnician) {
        names.set(appointment.assignedTechnician.id, `${appointment.assignedTechnician.firstName} ${appointment.assignedTechnician.lastName}`.trim());
    }
    (appointment?.technicianAssignments || []).forEach((assignment: any) => {
        if (assignment.technician) {
            names.set(assignment.technician.id, `${assignment.technician.firstName} ${assignment.technician.lastName}`.trim());
        }
    });
    return Array.from(names.values()).filter(Boolean).join(', ') ||t('auto.atanmadi');
};

type ManagerCompletionFormState = {
    operations: string[];
    technicalNotes: string;
    expenses: Array<{ expenseType: string; amount: number; description: string }>;
    materials: Array<{ materialId: string; quantity: number; description: string }>;
    usedMaterials: Array<{ materialId: string; quantity: number; description: string }>;
};

const emptyManagerCompletionForm = (): ManagerCompletionFormState => ({
    operations: [t('auto.yonetici_tarafindan_montaj_bitirildi')],
    technicalNotes: '',
    expenses: [{ expenseType:t('auto.nakliye'), amount: 0, description: '' }],
    materials: [{ materialId: '', quantity: 1, description: '' }],
    usedMaterials: [{ materialId: '', quantity: 1, description: '' }],
});

const AppointmentList = ({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(appointmentToForm());
    const [technicians, setTechnicians] = useState<PersonLite[]>([]);
    const [loading, setLoading] = useState(false);
    const [completionAppointmentId, setCompletionAppointmentId] = useState<string | null>(null);
    const [completionForm, setCompletionForm] = useState<ManagerCompletionFormState>(() => emptyManagerCompletionForm());
    const [completionLoading, setCompletionLoading] = useState(false);
    const editing = Boolean(form.id);
    const appointments = scopedRecords(project.appointments, order, isPrimary, project.salesOrders);
    const salesOrderId = orderPayloadId(order);

    useEffect(() => {
        projectApi.listTechnicians()
            .then(setTechnicians)
            .catch(() => setTechnicians([]));
    }, []);

    const submit = async () => {
        const startTime = dayjs(`${form.date}T${form.start}`).toISOString();
        const endTime = dayjs(`${form.date}T${form.end}`).toISOString();
        if (!dayjs(endTime).isAfter(dayjs(startTime))) return toast.error(t('auto.bitis_saati_baslangictan_sonra_olmalidir'));
        const technicianIds = [...new Set(form.technicianIds.filter(Boolean))];
        if (!technicianIds.length) return toast.error(t('auto.en_az_bir_teknisyen_secin'));
        setLoading(true);
        try {
            if (editing) {
                await projectApi.updateAppointment(form.id, { salesOrderId, assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                toast.success(t('auto.saat_plani_guncellendi'));
            } else {
                await projectApi.createAppointment(project.id, { salesOrderId, assignedTechId: technicianIds[0] || null, technicianIds, startTime, endTime, notes: form.notes });
                toast.success(t('auto.saat_plani_eklendi'));
            }
            setForm(appointmentToForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.saat_plani_kaydedilemedi'));
        } finally {
            setLoading(false);
        }
    };

    const openManagerCompletion = (appointment: any) => {
        if (!confirm(t('auto.montaji_yonetici_olarak_bitirmek_istediginize_em'))) return;
        setCompletionAppointmentId(appointment.id);
        setCompletionForm(emptyManagerCompletionForm());
    };

    const submitManagerCompletion = async (appointment: any) => {
        const operationItems = completionForm.operations.map((item) => item.trim()).filter(Boolean);
        if (!operationItems.length) return toast.error(t('auto.yapilan_islerden_en_az_bir_madde_girin'));
        const payload: CompleteInstallationInput = {
            operationsDoneItems: operationItems,
            technicalNotes: completionForm.technicalNotes,
            startedAt: appointment.startTime,
            endedAt: new Date().toISOString(),
            expenses: completionForm.expenses
                .filter((row) => row.expenseType && Number(row.amount) > 0)
                .map((row) => ({ ...row, amount: Number(row.amount || 0) })),
            materials: completionForm.materials
                .filter((row) => row.materialId && Number(row.quantity) > 0)
                .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
            usedMaterials: completionForm.usedMaterials
                .filter((row) => row.materialId && Number(row.quantity) > 0)
                .map((row) => ({ ...row, quantity: Number(row.quantity || 0) })),
        };
        setCompletionLoading(true);
        try {
            const result = await projectApi.completeAppointmentAsManager(appointment.id, payload);
            toast.success(result.message ||t('auto.montaj_yonetici_tarafindan_bitirildi'));
            if (result.addonOrder) {
                toast.success(`Ek sipariş otomatik oluşturuldu: ${result.addonOrder.orderNumber}`);
            }
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            setCompletionAppointmentId(null);
            setCompletionForm(emptyManagerCompletionForm());
            await onSaved();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('auto.montaj_bitirilemedi'));
        } finally {
            setCompletionLoading(false);
        }
    };

    return (
        <div className="space-y-4">
        <Card title={t('auto.randevu_saat_planlari')} icon={<CalendarClock size={13} />} noPadding>
            <div className="divide-y divide-slate-100">
                {appointments.length === 0 && <div className="px-4 py-8 text-center text-[12px] text-slate-900">{t('auto.saat_plani_yok')}</div>}
                {appointments.map((appointment) => {
                    const appointmentReport = findAppointmentReport(project, appointment);
                    const technicianName = appointmentTechnicianNames(appointment);
                    const awaitingTechnician = isAppointmentAwaitingTechnician(project, appointment);
                    const managerCanFinish = canManagerFinishAppointment(project, appointment);
                    return (
                    <div key={appointment.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-[12.5px]">
                        <div>
                            <div className="font-medium text-slate-800">{dayjs(appointment.startTime).format('DD.MM.YYYY')}</div>
                            <div className="text-slate-900">
                                {dayjs(appointment.startTime).format('HH:mm')} - {dayjs(appointment.endTime).format('HH:mm')}{t('auto.plan')}{durationFmt(appointmentDuration(appointment))}{t('auto.azami')}{durationFmt(Math.ceil(appointmentDuration(appointment) * 1.15))}
                            </div>
                            <div className="mt-1 text-[11.5px] font-semibold text-slate-600">{t('auto.teknisyen')}{technicianName}
                            </div>
                            {appointmentReport && (
                                <div className="mt-1 inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                    <CheckCircle2 size={11} />{t('auto.montaj_tamamlandi')}</div>
                            )}
                            {appointment.notes && <div className="mt-1 text-[11.5px] text-slate-900">{appointment.notes}</div>}
                        </div>
                        <div className="flex items-center gap-1">
                            <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50 hover:text-slate-700" onClick={() => setForm(appointmentToForm(appointment))}>
                                <Pencil size={13} />
                            </button>
                            <button
                                type="button"
                                className="rounded p-1 text-slate-900 hover:bg-rose-50 hover:text-rose-600"
                                onClick={async () => {
                                    if (!confirm(t('auto.saat_plani_silinsin_mi_bu_randevuya_bagli_teknis'))) return;
                                    await projectApi.deleteAppointment(appointment.id);
                                    await onSaved();
                                }}
                            >
                                <Trash2 size={13} />
                            </button>
                        </div>
                        {awaitingTechnician && (
                            <div className={`w-full rounded-md border px-3 py-2 ${managerCanFinish ?t('auto.border_red_200_bg_red_50') :t('auto.border_amber_200_bg_amber_50')}`}>
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className={`flex items-center gap-2 text-[12px] font-semibold ${managerCanFinish ? 'text-red-700' : 'text-amber-700'}`}>
                                        <AlertTriangle size={14} />
                                        <span>{t('auto.tekniker_hala_bitirmedi')}</span>
                                    </div>
                                    <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={completionLoading || !managerCanFinish}
                                        onClick={() => openManagerCompletion(appointment)}
                                    >{t('auto.yonetici_bitir')}</Button>
                                </div>
                            </div>
                        )}
                        {completionAppointmentId === appointment.id && (
                            <ManagerCompletionPanel
                                project={project}
                                order={order}
                                form={completionForm}
                                materials={materials}
                                loading={completionLoading}
                                onChange={setCompletionForm}
                                onCancel={() => setCompletionAppointmentId(null)}
                                onSubmit={() => submitManagerCompletion(appointment)}
                            />
                        )}
                    </div>
                    );
                })}
            </div>
        </Card>
        <Card title={editing ?t('auto.saat_planini_duzenle') :t('auto.saat_plani_ekle')} icon={<CalendarClock size={13} />}>
            <div>
                <div className="mb-3 flex items-center justify-between">
                    <div className="text-[12px] font-semibold text-slate-900">{editing ?t('auto.saat_planini_duzenle') :t('auto.saat_plani_ekle')}</div>
                    {editing && (
                        <button type="button" className="rounded p-1 text-slate-900 hover:bg-slate-50" onClick={() => setForm(appointmentToForm())}>
                            <X size={13} />
                        </button>
                    )}
                </div>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-5">
                    <Field label={t('common.date')}><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                    <Field label={t('common.start')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                    <Field label={t('common.end')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                    <Field label={t('auto.teknisyenler')}>
                        <div className="space-y-2">
                            <Select value="" onChange={(e) => {
                                const id = e.target.value;
                                if (!id) return;
                                const ids = form.technicianIds.includes(id) ? form.technicianIds : [...form.technicianIds, id];
                                setForm({ ...form, assignedTechId: ids[0] || '', technicianIds: ids });
                            }}>
                                <option value="">{t('auto.teknisyen_ekle')}</option>
                                {technicians.filter((tech) => !form.technicianIds.includes(tech.id)).map((tech) => (
                                    <option key={tech.id} value={tech.id}>
                                        {tech.firstName} {tech.lastName}{tech.email ? ` - ${tech.email}` : ''}
                                    </option>
                                ))}
                            </Select>
                            <div className="flex flex-wrap gap-1">
                                {form.technicianIds.map((id, index) => {
                                    const tech = technicians.find((item) => item.id === id);
                                    return (
                                        <span key={id} className="inline-flex items-center gap-1 rounded border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700">
                                            {index === 0 ? 'Sorumlu: ' : ''}{tech ? `${tech.firstName} ${tech.lastName}` : id}
                                            <button
                                                type="button"
                                                className="text-slate-400 hover:text-rose-600"
                                                onClick={() => {
                                                    const ids = form.technicianIds.filter((item) => item !== id);
                                                    setForm({ ...form, assignedTechId: ids[0] || '', technicianIds: ids });
                                                }}
                                            >
                                                ×
                                            </button>
                                        </span>
                                    );
                                })}
                                {form.technicianIds.length === 0 && <span className="text-[11px] text-slate-500">{t('auto.teknisyen_secilmedi')}</span>}
                            </div>
                        </div>
                    </Field>
                    <Field label={t('auto.not')}><Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </div>
                <Button className="mt-3" loading={loading} icon={<Save size={13} />} onClick={submit}>
                    {editing ?t('common.update') :t('common.add')}
                </Button>
            </div>
        </Card>
        </div>
    );
};

const ManagerCompletionPanel = ({
    project,
    order,
    form,
    materials,
    loading,
    onChange,
    onCancel,
    onSubmit,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    form: ManagerCompletionFormState;
    materials: ProjectMaterial[];
    loading: boolean;
    onChange: (form: ManagerCompletionFormState) => void;
    onCancel: () => void;
    onSubmit: () => void;
}) => {
    const [activeTab, setActiveTab] = useState<'reports' | 'costs' | 'materials'>('reports');
    const [materialMode, setMaterialMode] = useState<MaterialMode>('used');
    const usedMaterials = getProjectUsedMaterials(project, order);
    const materialById = useMemo(() => new Map(materials.map((material) => [material.id, material])), [materials]);
    const expenseTotal = form.expenses.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const extraMaterialTotal = form.materials.reduce((sum, row) => {
        const material = materialById.get(row.materialId);
        return sum + Number(row.quantity || 0) * Number(material?.unitCost || 0);
    }, 0);
    const activeMaterialRows = materialMode === 'used' ? form.usedMaterials : form.materials;
    const setActiveMaterialRows = (rows: ManagerCompletionFormState['materials']) => {
        if (materialMode === 'used') onChange({ ...form, usedMaterials: rows });
        else onChange({ ...form, materials: rows });
    };
    const updateOperation = (index: number, value: string) =>
        onChange({ ...form, operations: form.operations.map((item, rowIndex) => rowIndex === index ? value : item) });
    const updateExpense = (index: number, patch: Partial<ManagerCompletionFormState['expenses'][number]>) =>
        onChange({ ...form, expenses: form.expenses.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item) });
    const updateMaterial = (index: number, patch: Partial<ManagerCompletionFormState['materials'][number]>) =>
        setActiveMaterialRows(activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, ...patch } : item));

    return (
        <div className="w-full rounded-md border border-slate-200 bg-white p-3 shadow-xs">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                    <div className="text-[12px] font-semibold text-slate-900">{t('auto.yonetici_bitirme_formu')}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{t('auto.kaydedilince_saha_raporu_olusur_maliyetler_proje')}</div>
                </div>
                <Button type="button" size="sm" variant="ghost" icon={<X size={13} />} disabled={loading} onClick={onCancel}>{t('common.close')}</Button>
            </div>

            <div className="mb-3 grid grid-cols-2 gap-2 md:grid-cols-4">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('projects.fieldReport')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{form.operations.filter((item) => item.trim()).length}{t('auto.madde')}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.harici_gider')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(expenseTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_malzeme')}</div>
                    <div className="mt-1 font-mono text-[13px] font-semibold text-slate-950">{money(extraMaterialTotal)}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.kullanilan')}</div>
                    <div className="mt-1 text-[13px] font-semibold text-slate-950">{usedMaterials.length}{t('auto.malzeme')}</div>
                </div>
            </div>

            <div className="mb-3 overflow-x-auto border-b border-slate-200">
                <div className="flex min-w-max items-center gap-6 px-1">
                    {[
                        { key: 'reports' as const, label:t('projects.fieldReport') },
                        { key: 'costs' as const, label:t('auto.harici_giderler') },
                        { key: 'materials' as const, label:t('nav.materials') },
                    ].map((tab) => (
                        <button
                            key={tab.key}
                            type="button"
                            onClick={() => setActiveTab(tab.key)}
                            className={`relative whitespace-nowrap pb-3 text-[13px] font-semibold transition-colors ${activeTab === tab.key ?t('auto.text_brand_700_after_absolute_after_inset_x_0_af') :t('auto.text_slate_600_hover_text_slate_950')}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="space-y-3">
                <div className={activeTab === 'reports' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.yapilan_isler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ClipboardPenLine size={12} />} disabled={loading} onClick={() => onChange({ ...form, operations: [...form.operations, ''] })}>{t('auto.madde')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.operations.map((item, index) => (
                            <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                <Input value={item} disabled={loading} onChange={(event) => updateOperation(index, event.target.value)} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.operations.length === 1} onClick={() => onChange({ ...form, operations: form.operations.filter((_, rowIndex) => rowIndex !== index) })} />
                            </div>
                        ))}
                        <Field label={t('auto.teknik_notlar')}>
                            <Textarea rows={3} value={form.technicalNotes} disabled={loading} onChange={(event) => onChange({ ...form, technicalNotes: event.target.value })} />
                        </Field>
                    </div>
                </div>

                <div className={activeTab === 'costs' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('auto.harici_giderler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<ReceiptText size={12} />} disabled={loading} onClick={() => onChange({ ...form, expenses: [...form.expenses, { expenseType:t('auto.nakliye'), amount: 0, description: '' }] })}>{t('auto.satir')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {form.expenses.map((row, index) => (
                            <div key={index} className="grid grid-cols-[1fr_92px_32px] gap-2">
                                <Select value={row.expenseType} disabled={loading} onChange={(event) => updateExpense(index, { expenseType: event.target.value })}>
                                    {[t('auto.nakliye'),t('auto.ekipman_kiralama'),t('auto.dis_hizmetler'),t('auto.taseron'),t('auto.diger')].map((type) => <option key={type} value={type}>{type}</option>)}
                                </Select>
                                <Input type="number" min="0" step="0.01" value={row.amount} disabled={loading} onChange={(event) => updateExpense(index, { amount: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || form.expenses.length === 1} onClick={() => onChange({ ...form, expenses: form.expenses.filter((_, rowIndex) => rowIndex !== index) })} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateExpense(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>

                <div className={activeTab === 'materials' ?t('auto.rounded_md_border_border_slate_200') : 'hidden'}>
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('nav.materials')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<PackagePlus size={12} />} disabled={loading} onClick={() => setActiveMaterialRows([...activeMaterialRows, { materialId: '', quantity: 1, description: '' }])}>{t('auto.satir')}</Button>
                    </div>
                    <div className="border-b border-slate-100 px-3 pt-3">
                        <SubTabs tabs={materialSubTabs} activeTab={materialMode} onSelectTab={setMaterialMode} />
                    </div>
                    {materialMode === 'used' && (usedMaterials.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[12px] text-slate-500">{t('auto.kullanilan_malzeme_yok')}</div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {usedMaterials.map((item) => (
                                <div key={item.id} className="flex items-start justify-between gap-3 px-3 py-2 text-[12.5px]">
                                    <div className="min-w-0">
                                        <div className="font-semibold text-slate-800">{item.material?.name ||t('auto.malzeme')}</div>
                                        <div className="mt-0.5 text-slate-500">{item.material?.serialId || '-'} - {numberFmt(item.quantity)}{"adet -"}{item.positionNumber}</div>
                                    </div>
                                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-semibold text-slate-600">{t('auto.dahil')}</span>
                                </div>
                            ))}
                        </div>
                    ))}
                    <div className="space-y-2 p-3">
                        {activeMaterialRows.map((row, index) => (
                            <div key={index} className="grid grid-cols-[minmax(0,1fr)_82px_32px] gap-2">
                                <MaterialSearchSelect value={row.materialId} materials={materials} disabled={loading} onChange={(materialId) => {
                                    const next = activeMaterialRows.map((item, rowIndex) => rowIndex === index ? { ...item, materialId } : item);
                                    setActiveMaterialRows(materialId && index === activeMaterialRows.length - 1 ? [...next, { materialId: '', quantity: 1, description: '' }] : next);
                                }} />
                                <Input type="number" min="0" step="0.01" value={row.quantity} disabled={loading} onChange={(event) => updateMaterial(index, { quantity: Number(event.target.value) || 0 })} />
                                <Button type="button" size="sm" variant="ghost" icon={<Trash2 size={13} />} disabled={loading || activeMaterialRows.length === 1} onClick={() => setActiveMaterialRows(activeMaterialRows.filter((_, rowIndex) => rowIndex !== index))} />
                                <Input className="col-span-3" value={row.description} disabled={loading} placeholder={t('common.description')} onChange={(event) => updateMaterial(index, { description: event.target.value })} />
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex justify-end">
                <Button type="button" loading={loading} icon={<Save size={13} />} onClick={onSubmit}>{t('auto.yonetici_bitir')}</Button>
            </div>
        </div>
    );
};

const OvertimeRateCard = ({ project, onSaved }: { project: ProjectDto; onSaved: () => Promise<void> }) => {
    const [rate, setRate] = useState(Number(project.overtimeHourlyRate || 0));
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setRate(Number(project.overtimeHourlyRate || 0));
    }, [project.id, project.overtimeHourlyRate]);

    return (
        <Card title={t('auto.fazla_calisma_ucreti')} icon={<ReceiptText size={13} />}>
            <Field label={t('auto.15_uzeri_saat_ucreti_chf')}>
                <Input type="number" value={rate} onChange={(e) => setRate(Number(e.target.value) || 0)} />
            </Field>
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{t('auto.raporlarda_planlanan_surenin_15_fazlasi_azami_su')}</div>
            <Button
                className="mt-3"
                loading={loading}
                icon={<Save size={13} />}
                onClick={async () => {
                    setLoading(true);
                    try {
                        await projectApi.update(project.id, { overtimeHourlyRate: Math.max(0, Number(rate || 0)) });
                        toast.success(t('auto.chf_saat_ucreti_guncellendi'));
                        await onSaved();
                    } catch (e: any) {
                        toast.error(e.response?.data?.error ||t('auto.chf_saat_ucreti_kaydedilemedi'));
                    } finally {
                        setLoading(false);
                    }
                }}
            >{t('common.save')}</Button>
        </Card>
    );
};

const MailTab = ({ project, order, settings, userEmail }: { project: ProjectDto; order: ProjectSalesOrder | null; settings: MailSettingDto | null; userEmail: string }) => {
    const [form, setForm] = useState({
        fromName: settings?.fromName ||t('auto.offitec_erp'),
        fromEmail: settings?.fromEmail || userEmail,
        to: project.customer?.mainEmail || '',
        subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
        message:t('auto.lutfen_size_uygun_montaj_saatini_secin'),
    });
    const [loading, setLoading] = useState(false);
    const [sent, setSent] = useState(false);

    useEffect(() => {
        setSent(false);
        setForm({
            fromName: settings?.fromName ||t('auto.offitec_erp'),
            fromEmail: settings?.fromEmail || userEmail,
            to: project.customer?.mainEmail || '',
            subject: `${order?.orderNumber || project.projectName} - Montaj randevusu`,
            message:t('auto.lutfen_size_uygun_montaj_saatini_secin'),
        });
    }, [project.id, order?.id, settings, userEmail]);

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card title={t('auto.randevu_maili')} icon={<Mail size={13} />} className="xl:col-span-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label={t('settings.mail.senderName')}><Input value={form.fromName} onChange={(e) => setForm({ ...form, fromName: e.target.value })} /></Field>
                    <Field label={t('settings.mail.senderEmail')}><Input value={form.fromEmail} onChange={(e) => setForm({ ...form, fromEmail: e.target.value })} /></Field>
                    <Field label={t('auto.alici')}><Input value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></Field>
                    <Field label={t('auto.konu')}><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} /></Field>
                    <Field label={t('auto.mesaj')} className="md:col-span-2"><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></Field>
                </div>
                <Button
                    className="mt-3"
                    variant="primary"
                    icon={sent ? <CheckCircle2 size={13} /> : <Send size={13} />}
                    loading={loading}
                    disabled={sent}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.sendBookingMail(project.id, { ...form, salesOrderId: orderPayloadId(order) });
                            setSent(true);
                            toast.success(res.message ||t('auto.mail_hazirlandi'));
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.mail_gonderilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {sent ?t('auto.gonderildi') :t('common.send')}
                </Button>
            </Card>
        </div>
    );
};

const emptyReportForm = () => ({ workDate: dayjs().format('YYYY-MM-DD'), start: '09:00', end: '17:00', operationsDone: '', technicalNotes: '' });

const reportToForm = (report: any) => ({
    workDate: dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD'),
    start: dayjs(report.startedAt).format('HH:mm'),
    end: dayjs(report.endedAt).format('HH:mm'),
    operationsDone: report.operationsDone || '',
    technicalNotes: report.technicalNotes || '',
});

const ReportForm = ({ project, order, isPrimary, editingReport, onCancelEdit, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; editingReport: any | null; onCancelEdit: () => void; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState(emptyReportForm());
    const [loading, setLoading] = useState(false);
    const reports = scopedRecords(project.reports, order, isPrimary, project.salesOrders);
    const existingForDay = reports.find((report: any) =>
        dayjs(report.workDate || report.reportDate).format('YYYY-MM-DD') === form.workDate && report.id !== editingReport?.id
    );

    useEffect(() => {
        setForm(editingReport ? reportToForm(editingReport) : emptyReportForm());
    }, [editingReport?.id]);

    return (
        <Card title={editingReport ?t('auto.raporu_duzenle') :t('auto.yeni_rapor')} icon={<Save size={13} />}>
            <div className="space-y-3">
                <Field label={t('common.date')}><Input type="date" value={form.workDate} onChange={(e) => setForm({ ...form, workDate: e.target.value })} /></Field>
                {existingForDay && (
                    <div className="text-[12px] text-slate-900">{t('auto.bu_gune_ait_bir_rapor_zaten_var_ayni_gune_ikinci')}</div>
                )}
                <div className="grid grid-cols-2 gap-3">
                    <Field label={t('common.start')}><Input type="time" value={form.start} onChange={(e) => setForm({ ...form, start: e.target.value })} /></Field>
                    <Field label={t('common.end')}><Input type="time" value={form.end} onChange={(e) => setForm({ ...form, end: e.target.value })} /></Field>
                </div>
                <Field label={t('auto.yapilan_is')} required><Textarea rows={4} value={form.operationsDone} onChange={(e) => setForm({ ...form, operationsDone: e.target.value })} /></Field>
                <Field label={t('auto.teknik_notlar')}><Textarea rows={3} value={form.technicalNotes} onChange={(e) => setForm({ ...form, technicalNotes: e.target.value })} /></Field>
                {editingReport && (
                    <Button variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={Boolean(existingForDay)}
                    icon={<Save size={13} />}
                    onClick={async () => {
                        if (!form.operationsDone.trim()) return toast.error(t('auto.yapilan_is_alani_zorunludur'));
                        setLoading(true);
                        try {
                            const payload = {
                                salesOrderId: orderPayloadId(order),
                                workDate: dayjs(`${form.workDate}T00:00`).toISOString(),
                                startedAt: dayjs(`${form.workDate}T${form.start}`).toISOString(),
                                endedAt: dayjs(`${form.workDate}T${form.end}`).toISOString(),
                                operationsDone: form.operationsDone,
                                technicalNotes: form.technicalNotes,
                            };
                            const res = editingReport
                                ? await projectApi.updateReport(editingReport.id, payload)
                                : await projectApi.addReport(project.id, payload);
                            if (res.report?.overtimeWarning) toast.warning(res.report.overtimeWarning);
                            toast.success(`Saha raporu ${editingReport ?t('auto.guncellendi') : 'eklendi'}.`);
                            setForm(emptyReportForm());
                            await onSaved();
                            toast.success(editingReport ?t('auto.rapor_guncellendi') :t('auto.rapor_kaydedildi'));
                            setForm(emptyReportForm());
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.rapor_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingReport ?t('common.update') :t('common.save')}
                </Button>
            </div>
        </Card>
    );
};

const UsedMaterialForm = ({ project, order, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);
    const tenderId = order?.tenderId || project.tenderId;

    return (
        <Card title={t('auto.kullanilan_malzeme_ekle')} icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.malzeme')} required>
                    <MaterialSearchSelect value={form.materialId} materials={materials} disabled={!tenderId} onChange={(materialId) => setForm({ ...form, materialId })} />
                </Field>
                <Field label={t('common.quantity')}><Input type="number" min={1} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label={t('common.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <div className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[12px] text-blue-800">{t('auto.kullanilan_malzemeler_stoktan_duser_fakat_proje_')}</div>
                <Button
                    className="w-full"
                    loading={loading}
                    disabled={!tenderId}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!tenderId) return toast.error(t('auto.bu_siparis_bir_teklife_bagli_degil'));
                        if (!form.materialId) return toast.error(t('auto.malzeme_secin'));
                        if (form.quantity <= 0) return toast.error(t('auto.miktar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            await tenderApi.mapMaterial(tenderId, form.materialId, form.quantity, form.description);
                            toast.success(t('auto.kullanilan_malzeme_eklendi'));
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.kullanilan_malzeme_eklenemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >{t('auto.kullanilan_malzeme_ekle')}</Button>
            </div>
        </Card>
    );
};

const VariationForm = ({
    projectId,
    salesOrderId,
    materials,
    editingMaterial,
    onCancelEdit,
    onSaved,
}: {
    projectId: string;
    salesOrderId?: string | null;
    materials: ProjectMaterial[];
    editingMaterial?: any | null;
    onCancelEdit?: () => void;
    onSaved: () => Promise<void>;
}) => {
    const [form, setForm] = useState({ materialId: '', quantity: 1, description: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setForm(editingMaterial
            ? {
                materialId: editingMaterial.materialId || '',
                quantity: Number(editingMaterial.quantity || 1),
                description: editingMaterial.description || '',
            }
            : { materialId: '', quantity: 1, description: '' });
    }, [editingMaterial?.id]);

    return (
        <Card title={editingMaterial ?t('auto.ek_malzemeyi_duzenle') :t('auto.malzeme_ekle')} icon={<PackagePlus size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.malzeme')} required><MaterialSearchSelect value={form.materialId} materials={materials} onChange={(materialId) => setForm({ ...form, materialId })} /></Field>
                <Field label={t('common.quantity')}><Input type="number" value={form.quantity} onChange={(e) => setForm({ ...form, quantity: Number(e.target.value) || 0 })} /></Field>
                <Field label={t('common.description')}><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                {editingMaterial && (
                    <Button type="button" variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<PackagePlus size={13} />}
                    onClick={async () => {
                        if (!form.materialId) return toast.error(t('auto.malzeme_secin'));
                        if (form.quantity <= 0) return toast.error(t('auto.miktar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            if (editingMaterial) {
                                await projectApi.updateExtraMaterial(editingMaterial.id, { ...form, salesOrderId });
                                toast.success(t('auto.ek_malzeme_guncellendi'));
                            } else {
                                await projectApi.requestVariation(projectId, { ...form, salesOrderId });
                                toast.success(t('auto.talep_olusturuldu'));
                            }
                            setForm({ materialId: '', quantity: 1, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.ek_malzeme_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingMaterial ?t('common.update') :t('auto.talep_olustur')}
                </Button>
            </div>
        </Card>
    );
};

const EditableExpenseForm = ({
    projectId,
    salesOrderId,
    editingExpense,
    onCancelEdit,
    onSaved,
}: {
    projectId: string;
    salesOrderId?: string | null;
    editingExpense?: any | null;
    onCancelEdit?: () => void;
    onSaved: () => Promise<void>;
}) => {
    const [form, setForm] = useState({ expenseType:t('auto.nakliye'), amount: 0, description: '' });
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setForm(editingExpense
            ? {
                expenseType: editingExpense.expenseType ||t('auto.nakliye'),
                amount: Number(editingExpense.amount || 0),
                description: editingExpense.description || '',
            }
            : { expenseType:t('auto.nakliye'), amount: 0, description: '' });
    }, [editingExpense?.id]);

    return (
        <Card title={editingExpense ?t('auto.harici_gideri_duzenle') :t('auto.harici_gider_ekle')} icon={<ReceiptText size={13} />}>
            <div className="space-y-3">
                <Field label={t('auto.gider_tipi')}>
                    <Select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>
                        {[t('auto.nakliye'),t('auto.ekipman_kiralama'),t('auto.dis_hizmetler'),t('auto.taseron'),t('auto.diger')].map((x) => <option key={x} value={x}>{x}</option>)}
                    </Select>
                </Field>
                <Field label={t('common.amount')}>
                    <Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} />
                </Field>
                <Field label={t('common.description')}>
                    <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                </Field>
                {editingExpense && (
                    <Button type="button" variant="secondary" className="w-full" icon={<X size={13} />} onClick={onCancelEdit}>{t('auto.duzenlemeyi_iptal_et')}</Button>
                )}
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        if (form.amount <= 0) return toast.error(t('auto.tutar_sifirdan_buyuk_olmali'));
                        setLoading(true);
                        try {
                            if (editingExpense) {
                                await projectApi.updateExpense(editingExpense.id, { ...form, salesOrderId });
                                toast.success(t('auto.gider_guncellendi'));
                            } else {
                                await projectApi.addExpense(projectId, { ...form, salesOrderId });
                                toast.success(t('auto.gider_eklendi'));
                            }
                            setForm({ expenseType:t('auto.nakliye'), amount: 0, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.gider_kaydedilemedi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {editingExpense ?t('common.update') :t('auto.gider_ekle')}
                </Button>
            </div>
        </Card>
    );
};

/*
const ExpenseForm = ({ projectId, salesOrderId, onSaved }: { projectId: string; salesOrderId?: string | null; onSaved: () => Promise<void> }) => {
    const [form, setForm] = useState({ expenseType: 'Nakliye', amount: 0, description: '' });
    const [loading, setLoading] = useState(false);

    return (
        <Card title="Harici Gider Ekle" icon={<ReceiptText size={13} />}>
            <div className="space-y-3">
                <Field label="Gider tipi"><Select value={form.expenseType} onChange={(e) => setForm({ ...form, expenseType: e.target.value })}>{['Nakliye', 'Ekipman Kiralama', 'Dış hizmetler', 'Taşeron', 'Diğer'].map((x) => <option key={x} value={x}>{x}</option>)}</Select></Field>
                <Field label="Tutar"><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: Number(e.target.value) || 0 })} /></Field>
                <Field label="Aciklama"><Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></Field>
                <Button
                    className="w-full"
                    loading={loading}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        if (form.amount <= 0) return toast.error('Tutar sifirdan buyuk olmali.');
                        setLoading(true);
                        try {
                            await projectApi.addExpense(projectId, { ...form, salesOrderId });
                            toast.success('Gider eklendi.');
                            setForm({ expenseType: 'Nakliye', amount: 0, description: '' });
                            await onSaved();
                        } catch (e: any) {
                            toast.error(e.response?.data?.error || 'Gider eklenemedi.');
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    Gider Ekle
                </Button>
            </div>
        </Card>
    );
};

*/
const InfoCard = ({ title, rows }: { title: string; rows: Array<[string, React.ReactNode]> }) => (
    <div className="rounded-md border border-slate-200/70 bg-white p-4">
        <div className="mb-3 text-[12px] font-semibold text-slate-900">{title}</div>
        <div className="space-y-2">
            {rows.map(([label, value]) => (
                <div key={label} className="flex items-start justify-between gap-3 border-b border-slate-100 pb-2 text-[12.5px] last:border-0 last:pb-0">
                    <span className="text-slate-900">{label}</span>
                    <span className="max-w-[65%] text-right text-slate-800">{value}</span>
                </div>
            ))}
        </div>
    </div>
);

const CostList = ({ title, empty, rows }: { title: string; empty: string; rows: Array<{ id: string; title: string; meta: string; amount: number; note?: string }> }) => (
    <Card title={title} noPadding>
        {rows.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-slate-900">{empty}</div>
        ) : (
            <div className="divide-y divide-slate-100">
                {rows.map((row) => (
                    <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_150px] items-start gap-4 px-4 py-3">
                        <div className="min-w-0">
                            <div className="font-medium text-slate-800">{row.title}</div>
                            <div className="text-[11.5px] text-slate-900">{row.meta}</div>
                            {row.note && <div className="mt-1 text-[12px] text-slate-900">{row.note}</div>}
                        </div>
                        <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">{money(row.amount)}</div>
                    </div>
                ))}
            </div>
        )}
    </Card>
);

const TotalRow = ({ label, value, total }: { label: string; value: number; total?: boolean }) => (
    <div className={`flex items-center justify-between ${total ?"border-t border-slate-200 pt-2 font-semibold text-slate-900" : 'text-slate-900'}`}>
        <span>{label}</span>
        <span className={`font-mono ${total ?t('auto.rounded_full_bg_yellow_100_px_3_py_0_5_text_slat') : ''}`}>{money(value)}</span>
    </div>
);
