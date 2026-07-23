import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    Activity,
    AlertTriangle,
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    Building02 as Building2,
    Calendar,
    ChevronRight,
    Clock,
    CurrencyDollar as DollarSign,
    Edit01 as EditIcon,
    File02 as FileText,
    File05 as FileSpreadsheet,
    Hash01 as Hash,
    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Plus,
    RefreshCcw01 as RefreshIcon,
    Save01 as Save,
    Tag01 as Tag,
    Trash01 as TrashIcon,
    User01 as UserIcon,
    X as XIcon,
} from '@/components/icons/antIconCompat';

import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea, Select } from '../../components/ui-shared/Field';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { Modal } from '../../components/ui-shared/Modal';
import { localizeTenderNumber } from '../../utils/tenderNumber';
import type { TenderListItem } from '../../types/tender';
import { customerApi } from '../../lib/api/customer';
import { CUSTOMER_TYPE_OPTIONS, CUSTOMER_LANGUAGE_OPTIONS, CUSTOMER_STATUS_OPTIONS, DEFAULT_CUSTOMER_TYPE, DEFAULT_CUSTOMER_STATUS, getCustomerTypeLabel, getCustomerLanguageLabel, getCustomerStatusOption, getCustomerStatusLabel } from './customerType';

import { t as i18nT } from '@/i18n/translate';

const ContactsTab = lazy(() =>
    import('./CustomerEntityTabs').then((module) => ({ default: module.ContactsTab }))
);
const AddressesTab = lazy(() =>
    import('./CustomerEntityTabs').then((module) => ({ default: module.AddressesTab }))
);
const CustomerProductDiscounts = lazy(() =>
    import('./CustomerProductDiscounts').then((module) => ({ default: module.CustomerProductDiscounts }))
);
const OrdersTab = lazy(() =>
    import('./CustomerOrdersBilling').then((module) => ({ default: module.OrdersTab }))
);
const BillingTab = lazy(() =>
    import('./CustomerOrdersBilling').then((module) => ({ default: module.BillingTab }))
);
const CustomerReports = lazy(() =>
    import('./CustomerReports').then((module) => ({ default: module.CustomerReports }))
);

interface CustomerDashboardDto {
    id: string;
    companyName: string;
    customerType?: string | null;
    vatNumber?: string | null;
    priceList?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    mobilePhone?: string | null;
    website?: string | null;
    language?: string | null;
    responsibleFirstName?: string | null;
    responsibleLastName?: string | null;
    addressName?: string | null;
    address?: string | null;
    postalCode?: string | null;
    city?: string | null;
    country?: string | null;
    status?: string | null;
    isActive: boolean;
    activities?: ActivityDto[];
    notes?: NoteDto[];
    contacts?: ContactDto[];
    locations?: LocationDto[];
}

interface LocationDto {
    id: string;
    name: string;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    country?: string | null;
    phone?: string | null;
    email?: string | null;
    contactPerson?: string | null;
    isPrimary: boolean;
    notes?: string | null;
}

interface ActivityDto {
    id: string;
    activityType: string;
    description?: string | null;
    activityDate: string;
    employeeId: string;
    employeeName?: string | null;
    employeeEmail?: string | null;
}
interface NoteDto {
    id: string;
    noteType: string;
    noteText: string;
    isHighlight: boolean;
    createdAt: string;
    createdBy?: { firstName?: string; lastName?: string };
}
interface ContactDto {
    id: string;
    firstName: string;
    lastName: string;
    title?: string | null;
    email?: string | null;
    phone?: string | null;
    mobilePhone?: string | null;
    notes?: string | null;
    isPrimaryContact: boolean;
}

const getActivityLabel = (type: string) => ({
    Meeting:i18nT('crm.customers.activityMeeting'),
    Call:i18nT('crm.customers.activityPhone'),
    Email:i18nT('crm.customers.activityEmail'),
    SiteVisit:i18nT('crm.customers.activityFieldVisit'),
    ProjectPhase:i18nT('crm.customers.activityPhaseChange'),
    TENDER_IMPORTED:i18nT('crm.customers.activityTenderImported'),
    TENDER_CREATED:i18nT('crm.customers.activityTenderCreated'),
    TENDER_APPROVED:i18nT('crm.customers.activityTenderApproved'),
    TENDER_ORDERED:i18nT('crm.customers.activityTenderOrdered'),
    OFFER_MAIL_SENT:i18nT('crm.customers.activityTenderMailed'),
}[type] || type);
const ACTIVITY_COLOR: Record<string, string> = {
    Meeting: 'bg-blue-500',
    Call: 'bg-cyan-500',
    Email: 'bg-violet-500',
    SiteVisit: 'bg-emerald-500',
    ProjectPhase: 'bg-amber-500',
    TENDER_IMPORTED: 'bg-blue-600',
    TENDER_CREATED: 'bg-blue-600',
    TENDER_APPROVED: 'bg-blue-600',
    TENDER_ORDERED: 'bg-emerald-600',
    OFFER_MAIL_SENT: 'bg-sky-500',
};

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '—';

const activityActor = (activity: ActivityDto) =>
    activity.employeeName || activity.employeeEmail || activity.employeeId;

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

type CustomerTabId = 'profile' | 'contacts' | 'locations' | 'discounts' | 'offers' | 'orders' | 'billing' | 'projects' | 'reports' | 'notes' | 'activities';
const DASHBOARD_DETAIL_TABS: CustomerTabId[] = ['contacts', 'locations', 'notes', 'activities'];

interface EditForm {
    companyName: string;
    customerType: string;
    vatNumber: string;
    priceList: string;
    mainEmail: string;
    mainPhone: string;
    mobilePhone: string;
    website: string;
    language: string;
    responsibleFirstName: string;
    responsibleLastName: string;
    addressName: string;
    address: string;
    postalCode: string;
    city: string;
    country: string;
    status: string;
}

const toEditForm = (d: CustomerDashboardDto): EditForm => ({
    companyName: d.companyName ?? '',
    customerType: d.customerType ?? DEFAULT_CUSTOMER_TYPE,
    vatNumber: d.vatNumber ?? '',
    priceList: d.priceList ?? '',
    mainEmail: d.mainEmail ?? '',
    mainPhone: d.mainPhone ?? '',
    mobilePhone: d.mobilePhone ?? '',
    website: d.website ?? '',
    language: d.language ?? '',
    responsibleFirstName: d.responsibleFirstName ?? '',
    responsibleLastName: d.responsibleLastName ?? '',
    addressName: d.addressName ?? '',
    address: d.address ?? '',
    postalCode: d.postalCode ?? '',
    city: d.city ?? '',
    country: d.country ?? '',
    status: d.status ?? DEFAULT_CUSTOMER_STATUS,
});

// React StrictMode mounts effects twice in development. Reusing an in-flight
// request prevents that diagnostic remount from doubling the two slowest
// customer-detail calls while preserving a fresh request after it settles.
const dashboardRequests = new Map<string, Promise<CustomerDashboardDto>>();
const tenderRequests = new Map<string, Promise<TenderListItem[]>>();

const loadCustomerDashboard = (customerId: string, summaryOnly = false): Promise<CustomerDashboardDto> => {
    const requestKey = `${customerId}:${summaryOnly ? 'summary' : 'full'}`;
    const pending = dashboardRequests.get(requestKey);
    if (pending) return pending;

    const request = apiClient
        .get<CustomerDashboardDto>(`/customers/${customerId}/dashboard`, {
            params: summaryOnly ? { summary: true } : undefined,
        })
        .then((response) => response.data);
    dashboardRequests.set(requestKey, request);
    void request.finally(() => {
        if (dashboardRequests.get(requestKey) === request) dashboardRequests.delete(requestKey);
    }).catch(() => undefined);
    return request;
};

const loadCustomerTenders = (customerId: string): Promise<TenderListItem[]> => {
    const pending = tenderRequests.get(customerId);
    if (pending) return pending;

    // Keep this request local and small. Importing the full tender API module
    // made every tender editor method part of Vite's development request chain.
    const request = apiClient
        .get('/tenders', { params: { customerId } })
        .then((response) => Array.isArray(response.data) ? response.data : response.data.items ?? []);
    tenderRequests.set(customerId, request);
    void request.finally(() => {
        if (tenderRequests.get(customerId) === request) tenderRequests.delete(customerId);
    }).catch(() => undefined);
    return request;
};

const DeferredTabFallback = () => (
    <div className="space-y-2 rounded-lg border border-slate-100 bg-white p-6" role="status" aria-label={i18nT('common.loading')}>
        {[1, 2, 3].map((row) => (
            <div key={row} className="h-10 animate-pulse rounded-md bg-slate-50" />
        ))}
    </div>
);

const DeferredTab = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<DeferredTabFallback />}>{children}</Suspense>
);

export const CustomerDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<CustomerDashboardDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [tenders, setTenders] = useState<TenderListItem[]>([]);
    const [activeCustomerTab, setActiveCustomerTab] = useState<CustomerTabId>('profile');
    const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
    const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
    const [detailsErrorId, setDetailsErrorId] = useState<string | null>(null);

    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState<EditForm>({
        companyName: '', customerType: DEFAULT_CUSTOMER_TYPE,
        vatNumber: '', priceList: '', mainEmail: '', mainPhone: '', mobilePhone: '', website: '', language: '',
        responsibleFirstName: '', responsibleLastName: '', addressName: '', address: '', postalCode: '', city: '', country: '',
        status: DEFAULT_CUSTOMER_STATUS,
    });
    const [savingProfile, setSavingProfile] = useState(false);

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [noteForm, setNoteForm] = useState({
        noteType: 'internal', noteText: '', isHighlight: false,
    });
    const [activityForm, setActivityForm] = useState({
        activityType: 'Meeting', description: '',
    });
    const [savingNote, setSavingNote] = useState(false);
    const [savingActivity, setSavingActivity] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    // Inline edit / delete state for notes and activities (logs)
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [editNoteForm, setEditNoteForm] = useState({ noteType: 'internal', noteText: '', isHighlight: false });
    const [savingNoteEdit, setSavingNoteEdit] = useState(false);
    const [confirmDeleteNoteId, setConfirmDeleteNoteId] = useState<string | null>(null);

    const [editingActivityId, setEditingActivityId] = useState<string | null>(null);
    const [editActivityForm, setEditActivityForm] = useState({ activityType: 'Meeting', description: '' });
    const [savingActivityEdit, setSavingActivityEdit] = useState(false);
    const [confirmDeleteActivityId, setConfirmDeleteActivityId] = useState<string | null>(null);

    // Silent in-place refresh of the customer section after every action —
    // does NOT trigger the full-page skeleton, so the active tab stays put.
    const fetchData = async () => {
        if (!id) return;
        try {
            setRefreshing(true);
            const dashboardPromise = loadCustomerDashboard(id);
            void loadCustomerTenders(id).then(setTenders).catch(() => setTenders([]));
            setData(await dashboardPromise);
            setDetailsCustomerId(id);
            setDetailsErrorId(null);
        } catch {
            toast.error(i18nT('crm.customers.errorLoadCustomer'));
        } finally {
            setRefreshing(false);
        }
    };

    useEffect(() => {
        let cancelled = false;
        if (!id) return;

        const loadingTimer = window.setTimeout(() => {
            if (!cancelled) {
                setLoading(true);
                setActiveCustomerTab('profile');
            }
        }, 0);

        // The company name is the page's LCP element. Do not hold it behind the
        // independent tender request; tender KPIs fill in as soon as they arrive.
        void loadCustomerDashboard(id, true)
            .then((dashboard) => {
                if (!cancelled) setData(dashboard);
            })
            .catch(() => {
                if (!cancelled) toast.error(i18nT('crm.customers.errorLoadCustomer'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        void loadCustomerTenders(id)
            .then((rows) => {
                if (!cancelled) setTenders(rows);
            })
            .catch(() => {
                if (!cancelled) setTenders([]);
            });

        return () => {
            cancelled = true;
            window.clearTimeout(loadingTimer);
        };
    }, [id]);

    const detailsLoaded = detailsCustomerId === id;
    const detailsLoading = detailsLoadingId === id;
    const detailsFailed = detailsErrorId === id;

    const loadDashboardDetails = async () => {
        if (!id || detailsLoaded || detailsLoading) return;
        setDetailsLoadingId(id);
        setDetailsErrorId(null);
        try {
            const dashboard = await loadCustomerDashboard(id);
            setData(dashboard);
            setDetailsCustomerId(id);
        } catch {
            setDetailsErrorId(id);
            toast.error(i18nT('crm.customers.errorLoadCustomer'));
        } finally {
            setDetailsLoadingId((current) => current === id ? null : current);
        }
    };

    const selectCustomerTab = (tabId: CustomerTabId) => {
        setActiveCustomerTab(tabId);
        if (DASHBOARD_DETAIL_TABS.includes(tabId)) void loadDashboardDetails();
    };

    const dashboardDetailsPlaceholder = detailsFailed ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-rose-100 bg-white px-6 py-10 text-center">
            <span className="text-[13px] text-slate-500">{i18nT('crm.customers.errorLoadCustomer')}</span>
            <Button variant="secondary" size="sm" icon={<RefreshIcon size={12} />} onClick={() => void loadDashboardDetails()}>
                {i18nT('common.refresh')}
            </Button>
        </div>
    ) : (
        <DeferredTabFallback />
    );

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-20 bg-slate-50 border border-slate-100 rounded-lg" />
                <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                    {[1, 2, 3, 4].map((i) => (
                        <div key={i} className="h-20 bg-slate-50 border border-slate-100 rounded-lg" />
                    ))}
                </div>
                <div className="h-[360px] bg-slate-50 border border-slate-100 rounded-lg" />
            </div>
        );
    }
    if (!data) {
        return <div className="text-center text-slate-400 py-20 text-[13px]">{i18nT('crm.customer_not_found')}</div>;
    }

    const startEditing = () => {
        setEditForm(toEditForm(data));
        setEditing(true);
        setActiveCustomerTab('profile');
    };

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.companyName.trim()) return toast.error(i18nT('crm.customers.companyNameRequired'));
        try {
            setSavingProfile(true);
            await apiClient.patch(`/customers/${id}`, editForm);
            toast.success(i18nT('crm.customer_updated'));
            setEditing(false);
            await fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customer_update_error')));
        } finally {
            setSavingProfile(false);
        }
    };

    const handleDelete = async () => {
        try {
            setDeleting(true);
            await apiClient.delete(`/customers/${id}`);
            toast.success(i18nT('crm.customer_deleted'));
            navigate('/crm/customers');
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customer_delete_error')));
            setDeleting(false);
            setConfirmDelete(false);
        }
    };

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noteForm.noteText.trim()) return toast.error(i18nT('crm.customers.errorNoteEmpty'));
        try {
            setSavingNote(true);
            await apiClient.post(`/customers/${id}/notes`, noteForm);
            toast.success(i18nT('crm.customers.successNoteAdded'));
            setNoteForm({ noteType: 'internal', noteText: '', isHighlight: false });
            fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customers.errorNoteAdd')));
        } finally {
            setSavingNote(false);
        }
    };

    const handleAddActivity = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setSavingActivity(true);
            await apiClient.post(`/customers/${id}/activities`, activityForm);
            toast.success(i18nT('crm.customers.successActivityAdded'));
            setActivityForm({ activityType: 'Meeting', description: '' });
            fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customers.errorActivityAdd')));
        } finally {
            setSavingActivity(false);
        }
    };

    const startEditNote = (n: NoteDto) => {
        setEditingNoteId(n.id);
        setEditNoteForm({ noteType: n.noteType, noteText: n.noteText, isHighlight: n.isHighlight });
    };

    const handleUpdateNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingNoteId || !id) return;
        if (!editNoteForm.noteText.trim()) return toast.error(i18nT('crm.customers.errorNoteEmpty'));
        try {
            setSavingNoteEdit(true);
            await customerApi.updateNote(id, editingNoteId, editNoteForm);
            toast.success(i18nT('crm.noteUpdated'));
            setEditingNoteId(null);
            await fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customers.errorNoteAdd')));
        } finally {
            setSavingNoteEdit(false);
        }
    };

    const handleDeleteNote = async () => {
        if (!confirmDeleteNoteId || !id) return;
        try {
            await customerApi.deleteNote(id, confirmDeleteNoteId);
            toast.success(i18nT('crm.noteDeleted'));
            setConfirmDeleteNoteId(null);
            await fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        }
    };

    const startEditActivity = (a: ActivityDto) => {
        setEditingActivityId(a.id);
        setEditActivityForm({ activityType: a.activityType, description: a.description ?? '' });
    };

    const handleUpdateActivity = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingActivityId || !id) return;
        try {
            setSavingActivityEdit(true);
            await customerApi.updateActivity(id, editingActivityId, editActivityForm);
            toast.success(i18nT('crm.activityUpdated'));
            setEditingActivityId(null);
            await fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('crm.customers.errorActivityAdd')));
        } finally {
            setSavingActivityEdit(false);
        }
    };

    const handleDeleteActivity = async () => {
        if (!confirmDeleteActivityId || !id) return;
        try {
            await customerApi.deleteActivity(id, confirmDeleteActivityId);
            toast.success(i18nT('crm.activityDeleted'));
            setConfirmDeleteActivityId(null);
            await fetchData();
        } catch (error: unknown) {
            toast.error(apiErrorMessage(error, i18nT('common.error')));
        }
    };

    const totalTenderValue = tenders.reduce((s, t) => s + (t.grandTotal ?? 0), 0);
    const approvedTenders = tenders.filter((t) => t.status === "Approved" || t.status === "Exported").length;
    const projectTenders = tenders.filter((t) => t.projectId);

    const customerTabs: { id: CustomerTabId; label: string; count?: number }[] = [
        { id: 'profile', label: i18nT('crm.profil') },
        { id: 'contacts', label: i18nT('crm.tab_contacts'), count: detailsLoaded ? data.contacts?.length ?? 0 : undefined },
        { id: 'locations', label: i18nT('crm.tab_locations'), count: detailsLoaded ? data.locations?.length ?? 0 : undefined },
        { id: 'discounts', label: i18nT('crm.tab_productDiscounts') },
        { id: 'offers', label: i18nT('crm.offers'), count: tenders.length },
        { id: 'orders', label: i18nT('crm.tab_orders') },
        { id: 'billing', label: i18nT('crm.tab_billing') },
        { id: 'projects', label: i18nT('nav.projects'), count: projectTenders.length },
        { id: 'reports', label: i18nT('crm.tab_reports') },
        { id: 'notes', label: i18nT('crm.internal_notes'), count: detailsLoaded ? data.notes?.length ?? 0 : undefined },
        { id: 'activities', label: i18nT('crm.activities_label'), count: detailsLoaded ? data.activities?.length ?? 0 : undefined },
    ];

    return (
        <div>
            <PageHeader
                breadcrumb={i18nT('crm.breadcrumb_customer')}
                title={
                    <span className="flex items-center gap-3">
                        <span>{data.companyName}</span>
                        <StatusChip variant={getCustomerStatusOption(data.status).variant}>
                            {getCustomerStatusLabel(data.status)}
                        </StatusChip>
                        {refreshing && <RefreshIcon size={14} className="animate-spin text-slate-400" />}
                    </span>
                }
                description={
                    <span className="flex items-center gap-3 text-[12.5px]">
                        {data.vatNumber && <><Hash size={11} className="inline" /> <span className="font-mono">{data.vatNumber}</span></>}
                    </span>
                }
                actions={
                    <>
                        <Button variant="secondary" icon={<EditIcon size={13} />} onClick={startEditing}>{i18nT('crm.edit_customer')}</Button>
                        <Button variant="danger" icon={<TrashIcon size={13} />} onClick={() => setConfirmDelete(true)}>{i18nT('common.delete')}</Button>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/customers')}>{i18nT('crm.list_back')}</Button>
                    </>
                }
            />

            {/* KPI strip — always visible */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
                <KPI label={i18nT('crm.active_tenders')} value={`${tenders.length}`} icon={<FileSpreadsheet size={14} />} />
                <KPI label={i18nT('crm.approved_export_exported')} value={`${approvedTenders}`} icon={<Activity size={14} />} accent="text-emerald-700" />
                <KPI label={i18nT('crm.total_hacim')} value={fmtMoney(totalTenderValue)} icon={<DollarSign size={14} />} primary />
                <KPI
                    label={i18nT('crm.notes_activities')}
                    value={detailsLoaded ? `${data.notes?.length ?? 0} / ${data.activities?.length ?? 0}` : '—'}
                    icon={<FileText size={14} />}
                />
            </div>

            {/* Tab bar — switches content instantly, no scrolling */}
            <div className="mb-5 border-b border-secondary">
                <nav className="flex gap-1 overflow-x-auto" aria-label={i18nT('crm.customer_sections')}>
                    {customerTabs.map((tab) => {
                        const active = activeCustomerTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => selectCustomerTab(tab.id)}
                                className={`relative -mb-px flex items-center gap-2 whitespace-nowrap border-b-[3px] px-3.5 py-3 text-sm font-semibold transition-colors ${
                                    active
                                        ?"border-brand text-brand-secondary"
                                        :"border-transparent text-tertiary hover:border-utility-brand-200 hover:text-secondary"
                                }`}
                            >
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`inline-flex min-w-[20px] items-center justify-center rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${
                                        active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* ---- PROFILE ---- */}
            {activeCustomerTab === 'profile' && (
                <Card
                    title={i18nT('crm.customer_profili')}
                    icon={<Building2 size={13} />}
                    actions={
                        !editing ? (
                            <Button variant="secondary" size="sm" icon={<EditIcon size={11} />} onClick={startEditing}>{i18nT('common.edit')}</Button>
                        ) : null
                    }
                >
                    {!editing ? (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12.5px]">
                                <InfoRow icon={<Building2 size={11} />} label={i18nT('common.company')} value={data.companyName} />
                                <InfoRow icon={<FileText size={11} />} label={i18nT('crm.customers.customerType')} value={getCustomerTypeLabel(data.customerType)} />
                                <InfoRow icon={<Mail size={11} />} label={i18nT('common.email')} value={data.mainEmail} linkType="email" />
                                <InfoRow icon={<Phone size={11} />} label={i18nT('common.phone')} value={data.mainPhone} linkType="tel" />
                                <InfoRow icon={<Phone size={11} />} label={i18nT('crm.customers.mobilePhone')} value={data.mobilePhone} linkType="tel" />
                                <InfoRow icon={<Tag size={11} />} label={i18nT('crm.customers.website')} value={data.website} />
                                <InfoRow icon={<FileText size={11} />} label={i18nT('crm.customers.language')} value={getCustomerLanguageLabel(data.language)} />
                                <InfoRow icon={<Hash size={11} />} label={i18nT('crm.customers.vatNumber')} value={data.vatNumber} />
                                <InfoRow icon={<UserIcon size={11} />} label={i18nT('crm.customers.responsibleEmployee')} value={[data.responsibleFirstName, data.responsibleLastName].filter(Boolean).join(' ') || null} />
                                <InfoRow icon={<Activity size={11} />} label={i18nT('common.status')} value={getCustomerStatusLabel(data.status)} />
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100">
                                <div className="mb-2 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                                    <MapPin size={11} /> {i18nT('crm.locationPrimary')}
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12.5px]">
                                    <InfoRow icon={<Tag size={11} />} label={i18nT('crm.locationName')} value={data.addressName} />
                                    <InfoRow icon={<MapPin size={11} />} label={i18nT('common.address')} value={data.address} />
                                    <InfoRow icon={<Hash size={11} />} label={i18nT('crm.postalCode')} value={data.postalCode} />
                                    <InfoRow icon={<Building2 size={11} />} label={i18nT('crm.city')} value={data.city} />
                                    <InfoRow icon={<MapPin size={11} />} label={i18nT('crm.country')} value={data.country} />
                                </div>
                            </div>
                        </>
                    ) : (
                        <form onSubmit={handleSaveProfile} className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <Field label={i18nT('crm.customers.companyName')} required className="md:col-span-2">
                                <Input
                                    value={editForm.companyName}
                                    onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                                    placeholder={i18nT('crm.customers.companyNamePlaceholder')}
                                />
                            </Field>
                            <Field label={i18nT('crm.customers.customerType')}>
                                <Select
                                    value={editForm.customerType}
                                    onChange={(e) => setEditForm({ ...editForm, customerType: e.target.value })}
                                >
                                    {CUSTOMER_TYPE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{i18nT(o.labelKey)}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label={i18nT('common.status')}>
                                <Select
                                    value={editForm.status}
                                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                                >
                                    {CUSTOMER_STATUS_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{i18nT(o.labelKey)}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label={i18nT('crm.customers.vatNumber')}>
                                <Input value={editForm.vatNumber}
                                    onChange={(e) => setEditForm({ ...editForm, vatNumber: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.customers.language')}>
                                <Select
                                    value={editForm.language}
                                    onChange={(e) => setEditForm({ ...editForm, language: e.target.value })}
                                >
                                    <option value="">{i18nT('common.select')}</option>
                                    {CUSTOMER_LANGUAGE_OPTIONS.map((o) => (
                                        <option key={o.value} value={o.value}>{i18nT(o.labelKey)}</option>
                                    ))}
                                </Select>
                            </Field>
                            <Field label={i18nT('common.email')}>
                                <Input type="email" value={editForm.mainEmail}
                                    onChange={(e) => setEditForm({ ...editForm, mainEmail: e.target.value })} />
                            </Field>
                            <Field label={i18nT('common.phone')}>
                                <Input value={editForm.mainPhone}
                                    onChange={(e) => setEditForm({ ...editForm, mainPhone: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.customers.mobilePhone')}>
                                <Input value={editForm.mobilePhone}
                                    onChange={(e) => setEditForm({ ...editForm, mobilePhone: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.customers.website')}>
                                <Input value={editForm.website}
                                    onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                                    placeholder="https://" />
                            </Field>
                            <Field label={i18nT('crm.customers.responsibleEmployee')}>
                                <div className="flex gap-2">
                                    <Input value={editForm.responsibleFirstName}
                                        onChange={(e) => setEditForm({ ...editForm, responsibleFirstName: e.target.value })}
                                        placeholder={i18nT('crm.customers.responsibleFirstName')} />
                                    <Input value={editForm.responsibleLastName}
                                        onChange={(e) => setEditForm({ ...editForm, responsibleLastName: e.target.value })}
                                        placeholder={i18nT('crm.customers.responsibleLastName')} />
                                </div>
                            </Field>
                            <div className="md:col-span-2 mt-1 flex items-center gap-1.5 border-t border-slate-100 pt-3 text-[10.5px] font-semibold uppercase tracking-wider text-slate-400">
                                <MapPin size={11} /> {i18nT('crm.locationPrimary')}
                            </div>
                            <Field label={i18nT('crm.locationName')} className="md:col-span-2">
                                <Input value={editForm.addressName}
                                    onChange={(e) => setEditForm({ ...editForm, addressName: e.target.value })} />
                            </Field>
                            <Field label={i18nT('common.address')} className="md:col-span-2">
                                <Input value={editForm.address}
                                    onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.postalCode')}>
                                <Input value={editForm.postalCode}
                                    onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.city')}>
                                <Input value={editForm.city}
                                    onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} />
                            </Field>
                            <Field label={i18nT('crm.country')} className="md:col-span-2">
                                <Input value={editForm.country}
                                    onChange={(e) => setEditForm({ ...editForm, country: e.target.value })} />
                            </Field>
                            <div className="md:col-span-2 flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                                <Button variant="secondary" type="button" icon={<XIcon size={13} />} onClick={() => setEditing(false)}>{i18nT('common.cancel')}</Button>
                                <Button variant="primary" type="submit" loading={savingProfile} icon={<Save size={13} />}>{i18nT('crm.save_changes')}</Button>
                            </div>
                        </form>
                    )}
                </Card>
            )}

            {/* ---- CONTACTS (Kontaktpersonen) ---- */}
            {activeCustomerTab === 'contacts' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <ContactsTab customerId={id} items={data.contacts ?? []} onChanged={fetchData} />
                    </DeferredTab>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- LOCATIONS (Standorte) ---- */}
            {activeCustomerTab === 'locations' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <AddressesTab customerId={id} items={data.locations ?? []} onChanged={fetchData} />
                    </DeferredTab>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- PRODUCT DISCOUNTS (Produktrabatte) ---- */}
            {activeCustomerTab === 'discounts' && id && (
                <DeferredTab>
                    <CustomerProductDiscounts customerId={id} />
                </DeferredTab>
            )}

            {/* ---- ORDERS (Aufträge) ---- */}
            {activeCustomerTab === 'orders' && id && (
                <DeferredTab>
                    <OrdersTab customerId={id} />
                </DeferredTab>
            )}

            {/* ---- BILLING (Rechnungen) ---- */}
            {activeCustomerTab === 'billing' && id && (
                <DeferredTab>
                    <BillingTab customerId={id} />
                </DeferredTab>
            )}

            {/* ---- OFFERS ---- */}
            {activeCustomerTab === 'offers' && (
                <Card
                    title={i18nT('crm.customer_ait_tenders')}
                    description={i18nT('crm.crb_sia_451_standardinda_prepared_tender_data')}
                    icon={<FileSpreadsheet size={13} />}
                    noPadding
                    actions={
                        <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => navigate(`/crm/tenders/new?customerId=${id}`)}>{i18nT('nav.quickActionsGroup.newTender')}</Button>
                    }
                >
                    {tenders.length === 0 ? (
                        <EmptyState
                            icon={<FileSpreadsheet size={28} />}
                            title={i18nT('crm.tender_not_found')}
                            description={i18nT('crm.bu_customer_icin_no_hazirlanmis_bir_tender_bul')}
                            action={
                                <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => navigate(`/crm/tenders/new?customerId=${id}`)}>{i18nT('nav.quickActionsGroup.newTender')}</Button>
                            }
                        />
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {tenders.map((t) => (
                                <div
                                    key={t.id}
                                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 active:bg-slate-100"
                                    onClick={() => navigate(`/crm/tenders/${t.id}`)}
                                >
                                    <div className="w-9 h-9 rounded bg-blue-50 text-blue-700 flex items-center justify-center flex-shrink-0">
                                        <FileSpreadsheet size={14} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="font-semibold text-slate-900 text-[13px]">{localizeTenderNumber(t.tenderNumber)}</span>
                                            <span className="text-[11px] text-slate-400 font-mono">v{t.version}</span>
                                            <StatusChip variant={t.projectId ? 'order' : t.status === "Draft" ? 'warning' : t.status === "Approved" ? 'approved' : 'info'}>
                                                {t.projectId ?i18nT('crm.tenders.statusOrdered') : t.status === "Draft" ?i18nT('crm.tenders.statusDraft') : t.status === "Approved" ?i18nT('crm.tenders.statusApproved') :i18nT('crm.tenders.statusExported')}
                                            </StatusChip>
                                            <span className="font-mono text-[10.5px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                                {t.format}
                                            </span>
                                        </div>
                                        <div className="text-[11.5px] text-slate-500 mt-0.5">
                                            {t.positionCount ?? 0}{i18nT('crm.pozisyon')}{dayjs(t.createdAt).format('DD.MM.YYYY')}
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-mono font-semibold text-slate-900 text-[13px]">{fmtMoney(t.grandTotal)}</div>
                                    </div>
                                    <ChevronRight size={14} className="text-slate-300 flex-shrink-0" />
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* ---- PROJECTS ---- */}
            {activeCustomerTab === 'projects' && (
                <Card
                    title={i18nT('crm.customer_ait_projects')}
                    description={i18nT('crm.project_management_ile_ayni_detail_sayfasina_gider')}
                    icon={<BriefcaseBusiness size={13} />}
                    noPadding
                >
                    {projectTenders.length === 0 ? (
                        <EmptyState
                            icon={<BriefcaseBusiness size={28} />}
                            title={i18nT('crm.project_not_found')}
                            description={i18nT('crm.approved_tekliflerden_project_olusturuldugunda_burad')}
                        />
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {projectTenders.map((t) => (
                                <div
                                    key={t.projectId}
                                    className="flex cursor-pointer items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 active:bg-slate-100"
                                    onClick={() => navigate(`/projects/${t.projectId}`)}
                                >
                                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded bg-emerald-50 text-emerald-700">
                                        <BriefcaseBusiness size={14} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-[13px] font-semibold text-slate-900">{localizeTenderNumber(t.tenderNumber)}</span>
                                            <StatusChip variant="active">{i18nT('nav.projects')}</StatusChip>
                                            <span className="font-mono text-[10.5px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                                {t.format}
                                            </span>
                                        </div>
                                        <div className="mt-0.5 text-[11.5px] text-slate-500">
                                            {dayjs(t.createdAt).format('DD.MM.YYYY')} - {fmtMoney(t.grandTotal)}
                                        </div>
                                    </div>
                                    <ChevronRight size={14} className="flex-shrink-0 text-slate-300" />
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            {/* ---- REPORTS (Field / General / Delivery) ---- */}
            {activeCustomerTab === 'reports' && id && (
                <DeferredTab>
                    <CustomerReports customerId={id} />
                </DeferredTab>
            )}

            {/* ---- NOTES ---- */}
            {activeCustomerTab === 'notes' && (
                detailsLoaded ? (
                <Card
                    title={i18nT('crm.internal_notes')}
                    description={i18nT('crm.internal_notes_hint')}
                    icon={<FileText size={13} />}
                >
                    <form onSubmit={handleAddNote} className="space-y-2 pb-3 mb-3 border-b border-slate-100">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            <Field label={i18nT('crm.note_turu')}>
                                <Select
                                    value={noteForm.noteType}
                                    onChange={(e) => setNoteForm({ ...noteForm, noteType: e.target.value })}
                                >
                                    <option value="internal">{i18nT('crm.internal_yorum')}</option>
                                    <option value="technical">{i18nT('crm.technical_note')}</option>
                                </Select>
                            </Field>
                            <Field label={i18nT('crm.onem')}>
                                <Checkbox
                                    label={i18nT('crm.critical')}
                                    size="sm"
                                    isSelected={noteForm.isHighlight}
                                    onChange={(checked) => setNoteForm({ ...noteForm, isHighlight: checked })}
                                    className="rounded-lg bg-primary px-2.5 py-2 ring-1 ring-secondary ring-inset"
                                />
                            </Field>
                        </div>
                        <Field label={i18nT('crm.note_content')}>
                            <Textarea
                                rows={3}
                                value={noteForm.noteText}
                                onChange={(e) => setNoteForm({ ...noteForm, noteText: e.target.value })}
                                placeholder={i18nT('crm.note_yazin')}
                            />
                        </Field>
                        <Button variant="primary" type="submit" loading={savingNote} icon={<Save size={12} />}>{i18nT('crm.notu_kaydet')}</Button>
                    </form>

                    {(data.notes?.length ?? 0) === 0 ? (
                        <div className="text-[12px] text-slate-400 text-center py-4">{i18nT('crm.no_notes_yet')}</div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {data.notes!.map((n) => {
                                // Critical notes render as a translucent "glass" red card;
                                // every text element inside flips to white so it stays legible.
                                const hot = n.isHighlight;
                                return (
                                <div
                                    key={n.id}
                                    className={`group relative overflow-hidden border rounded-md p-2.5 ${hot ?"border-[#dc2626]/30 bg-[#dc2626]/15 shadow-sm shadow-red-900/5 ring-1 ring-inset ring-white/40 backdrop-blur-lg" :"border-slate-200 bg-white"}`}
                                >
                                    {editingNoteId === n.id ? (
                                        <form onSubmit={handleUpdateNote} className="space-y-2">
                                            <div className="grid grid-cols-2 gap-2">
                                                <Select value={editNoteForm.noteType} onChange={(e) => setEditNoteForm({ ...editNoteForm, noteType: e.target.value })}>
                                                    <option value="internal">{i18nT('crm.internal_yorum')}</option>
                                                    <option value="technical">{i18nT('crm.technical_note')}</option>
                                                </Select>
                                                <Checkbox
                                                    label={i18nT('crm.critical')}
                                                    size="sm"
                                                    isSelected={editNoteForm.isHighlight}
                                                    onChange={(checked) => setEditNoteForm({ ...editNoteForm, isHighlight: checked })}
                                                    className="rounded-lg bg-primary px-2.5 py-2 ring-1 ring-secondary ring-inset"
                                                />
                                            </div>
                                            <Textarea rows={3} value={editNoteForm.noteText} onChange={(e) => setEditNoteForm({ ...editNoteForm, noteText: e.target.value })} />
                                            <div className="flex items-center justify-end gap-2">
                                                <Button variant="secondary" size="sm" type="button" icon={<XIcon size={12} />} onClick={() => setEditingNoteId(null)}>{i18nT('common.cancel')}</Button>
                                                <Button variant="primary" size="sm" type="submit" loading={savingNoteEdit} icon={<Save size={12} />}>{i18nT('common.save')}</Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <>
                                            <div className="absolute top-2 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                <button type="button" onClick={() => startEditNote(n)} className={`p-1 rounded ${hot ?"text-white hover:bg-white/25 [filter:drop-shadow(0_1px_1px_rgba(127,29,29,0.7))]" :"text-slate-400 hover:bg-slate-100 hover:text-slate-700"}`} title={i18nT('common.edit')}>
                                                    <EditIcon size={12} />
                                                </button>
                                                <button type="button" onClick={() => setConfirmDeleteNoteId(n.id)} className={`p-1 rounded ${hot ?"text-white hover:bg-white/25 [filter:drop-shadow(0_1px_1px_rgba(127,29,29,0.7))]" :"text-slate-400 hover:bg-rose-50 hover:text-rose-600"}`} title={i18nT('common.delete')}>
                                                    <TrashIcon size={12} />
                                                </button>
                                            </div>
                                            <div className="flex items-center gap-1.5 mb-1 pr-12">
                                                <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-medium ${hot ?"bg-red-600/80 text-white" : n.noteType === 'technical' ?"bg-cyan-50 text-cyan-700" :"bg-slate-100 text-slate-600"}`}>
                                                    {n.noteType === 'technical' ?i18nT('crm.technical') :i18nT('crm.internal')}
                                                </span>
                                                {n.isHighlight && (
                                                    <span className="text-[10.5px] px-1.5 py-0.5 rounded font-semibold bg-red-600/80 text-white flex items-center gap-1">
                                                        <AlertTriangle size={9} />{i18nT('crm.critical')}</span>
                                                )}
                                                <span className={`text-[10.5px] ml-auto flex items-center gap-1 font-mono ${hot ? 'text-white [text-shadow:0_1px_2px_rgba(80,7,7,0.95)]' : 'text-slate-400'}`}>
                                                    <Calendar size={9} />
                                                    {dayjs(n.createdAt).format("DD.MM.YYYY HH:mm")}
                                                </span>
                                            </div>
                                            <p className={`text-[12.5px] leading-relaxed whitespace-pre-wrap ${hot ? 'text-white [text-shadow:0_1px_3px_rgba(80,7,7,0.95)]' : 'text-slate-700'}`}>{n.noteText}</p>
                                            {n.createdBy && (
                                                <div className={`text-[10.5px] mt-1 flex items-center gap-1 ${hot ? 'text-white [text-shadow:0_1px_2px_rgba(80,7,7,0.95)]' : 'text-slate-400'}`}>
                                                    <UserIcon size={9} />
                                                    {n.createdBy.firstName} {n.createdBy.lastName}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- ACTIVITIES ---- */}
            {activeCustomerTab === 'activities' && (
                detailsLoaded ? (
                <Card
                    title={i18nT('crm.zaman_cizelgesi')}
                    description={i18nT('crm.customer_timeline_description')}
                    icon={<Clock size={13} />}
                >
                    <form onSubmit={handleAddActivity} className="grid grid-cols-1 md:grid-cols-12 gap-2 mb-4 pb-4 border-b border-slate-100">
                        <div className="md:col-span-3">
                            <Field label={i18nT('common.type')}>
                                <Select
                                    value={activityForm.activityType}
                                    onChange={(e) => setActivityForm({ ...activityForm, activityType: e.target.value })}
                                >
                                    <option value="Meeting">{i18nT('crm.customers.activityMeeting')}</option>
                                    <option value="Call">{i18nT('common.phone')}</option>
                                    <option value="Email">{i18nT('crm.customers.activityEmail')}</option>
                                    <option value="SiteVisit">{i18nT('crm.customers.activityFieldVisit')}</option>
                                    <option value="ProjectPhase">{i18nT('crm.project_faz')}</option>
                                </Select>
                            </Field>
                        </div>
                        <div className="md:col-span-7">
                            <Field label={i18nT('common.description')}>
                                <Input
                                    value={activityForm.description}
                                    onChange={(e) => setActivityForm({ ...activityForm, description: e.target.value })}
                                    placeholder={i18nT('crm.enter_short_description')}
                                />
                            </Field>
                        </div>
                        <div className="md:col-span-2 flex items-end">
                            <Button variant="primary" type="submit" loading={savingActivity} icon={<Plus size={12} />} className="w-full">{i18nT('common.add')}</Button>
                        </div>
                    </form>

                    {(data.activities?.length ?? 0) === 0 ? (
                        <div className="text-[12px] text-slate-400 text-center py-4">{i18nT('crm.no_activities_yet')}</div>
                    ) : (
                        <ol className="relative border-l border-slate-200 ml-1 space-y-3">
                            {data.activities!.map((a) => (
                                <li key={a.id} className="group ml-3.5">
                                    <span className={`absolute w-2.5 h-2.5 rounded-full -left-[5px] mt-1 ${ACTIVITY_COLOR[a.activityType] || 'bg-slate-400'}`} />
                                    {editingActivityId === a.id ? (
                                        <form onSubmit={handleUpdateActivity} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end pb-1">
                                            <div className="sm:col-span-4">
                                                <Select value={editActivityForm.activityType} onChange={(e) => setEditActivityForm({ ...editActivityForm, activityType: e.target.value })}>
                                                    <option value="Meeting">{i18nT('crm.customers.activityMeeting')}</option>
                                                    <option value="Call">{i18nT('common.phone')}</option>
                                                    <option value="Email">{i18nT('crm.customers.activityEmail')}</option>
                                                    <option value="SiteVisit">{i18nT('crm.customers.activityFieldVisit')}</option>
                                                    <option value="ProjectPhase">{i18nT('crm.project_faz')}</option>
                                                </Select>
                                            </div>
                                            <div className="sm:col-span-5">
                                                <Input value={editActivityForm.description} onChange={(e) => setEditActivityForm({ ...editActivityForm, description: e.target.value })} />
                                            </div>
                                            <div className="sm:col-span-3 flex items-center gap-1.5">
                                                <Button variant="secondary" size="sm" type="button" icon={<XIcon size={12} />} onClick={() => setEditingActivityId(null)}>{i18nT('common.cancel')}</Button>
                                                <Button variant="primary" size="sm" type="submit" loading={savingActivityEdit} icon={<Save size={12} />}>{i18nT('common.save')}</Button>
                                            </div>
                                        </form>
                                    ) : (
                                        <>
                                            <div className="flex items-center justify-between mb-0.5">
                                                <div className="min-w-0">
                                                    <span className="text-[12.5px] font-semibold text-slate-800">
                                                        {getActivityLabel(a.activityType)}
                                                    </span>
                                                    <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                                        <UserIcon size={10} />
                                                        <span className="truncate">{activityActor(a)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1.5">
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => startEditActivity(a)} className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700" title={i18nT('common.edit')}>
                                                            <EditIcon size={12} />
                                                        </button>
                                                        <button type="button" onClick={() => setConfirmDeleteActivityId(a.id)} className="p-1 rounded hover:bg-rose-50 text-slate-400 hover:text-rose-600" title={i18nT('common.delete')}>
                                                            <TrashIcon size={12} />
                                                        </button>
                                                    </div>
                                                    <time className="text-[11px] text-slate-400 font-mono">
                                                        {dayjs(a.activityDate).format("DD.MM.YYYY HH:mm")}
                                                    </time>
                                                </div>
                                            </div>
                                            {a.description && (
                                                <p className="text-[12px] text-slate-600 leading-relaxed">{a.description}</p>
                                            )}
                                        </>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </Card>
                ) : dashboardDetailsPlaceholder
            )}

            {/* Delete confirmation */}
            <Modal
                open={confirmDelete}
                title={i18nT('crm.delete_customer')}
                description={i18nT('crm.delete_customer_confirm', { name: data.companyName })}
                onClose={() => !deleting && setConfirmDelete(false)}
                width="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirmDelete(false)} disabled={deleting}>{i18nT('common.cancel')}</Button>
                        <Button variant="danger" loading={deleting} icon={<TrashIcon size={13} />} onClick={handleDelete}>{i18nT('crm.delete_customer')}</Button>
                    </>
                }
            >
                <div className="flex items-start gap-3 text-[13px] text-slate-600">
                    <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-rose-50 text-rose-600">
                        <AlertTriangle size={16} />
                    </span>
                    <p className="leading-relaxed">{i18nT('crm.delete_customer_confirm', { name: data.companyName })}</p>
                </div>
            </Modal>

            {/* Note delete confirmation */}
            <Modal
                open={confirmDeleteNoteId !== null}
                title={i18nT('common.delete')}
                onClose={() => setConfirmDeleteNoteId(null)}
                width="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirmDeleteNoteId(null)}>{i18nT('common.cancel')}</Button>
                        <Button variant="danger" icon={<TrashIcon size={13} />} onClick={handleDeleteNote}>{i18nT('common.delete')}</Button>
                    </>
                }
            >
                <p className="text-[13px] text-slate-600">{i18nT('crm.noteDeleteConfirm')}</p>
            </Modal>

            {/* Activity delete confirmation */}
            <Modal
                open={confirmDeleteActivityId !== null}
                title={i18nT('common.delete')}
                onClose={() => setConfirmDeleteActivityId(null)}
                width="sm"
                footer={
                    <>
                        <Button variant="secondary" onClick={() => setConfirmDeleteActivityId(null)}>{i18nT('common.cancel')}</Button>
                        <Button variant="danger" icon={<TrashIcon size={13} />} onClick={handleDeleteActivity}>{i18nT('common.delete')}</Button>
                    </>
                }
            >
                <p className="text-[13px] text-slate-600">{i18nT('crm.activityDeleteConfirm')}</p>
            </Modal>
        </div>
    );
};

const KPI: React.FC<{ label: string; value: string; icon: React.ReactNode; accent?: string; primary?: boolean }> = ({ label, value, icon, accent, primary }) => (
    <div className={`border rounded-md px-4 py-3 ${primary ?"bg-blue-50/60 border-blue-200/60" :"bg-white border-slate-200/70"}`}>
        <div className="flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
            {icon}
            {label}
        </div>
        <div className={`mt-1 text-[16px] font-semibold ${accent || (primary ? 'text-blue-900' : 'text-slate-800')}`}>
            {value}
        </div>
    </div>
);

// Build a clickable href: mailto: for email, tel: (digits/+ only) for phone.
const buildContactHref = (linkType: 'email' | 'tel', value: string) =>
    linkType === 'email' ? `mailto:${value.trim()}` : `tel:${value.replace(/[^+\d]/g, '')}`;

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string | null; full?: boolean; linkType?: 'email' | 'tel' }> = ({ icon, label, value, full, linkType }) => (
    <div className={`flex items-baseline gap-2.5 py-1.5 ${full ? 'sm:col-span-2' : ''}`}>
        <span className="text-slate-400 flex-shrink-0 translate-y-[2px]">{icon}</span>
        <span className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 w-28 flex-shrink-0 leading-tight">{label}</span>
        {value ? (
            linkType ? (
                <a href={buildContactHref(linkType, value)} className="text-blue-700 hover:underline truncate">{value}</a>
            ) : (
                <span className="text-slate-800 truncate">{value}</span>
            )
        ) : (
            <span className="text-slate-300">-</span>
        )}
    </div>
);
