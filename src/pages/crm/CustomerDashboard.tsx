import { lazy, Suspense, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import {
    AlertTriangle,
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    ChevronRight,
    Hash01 as Hash,
    RefreshCcw01 as RefreshIcon,
    Trash01 as TrashIcon,
} from '@/components/icons/antIconCompat';

import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Modal } from '../../components/ui-shared/Modal';
import { LoadingPanel, SkeletonBar } from '../../components/ui-shared/Loader';
import { SlidingTopTabs } from '../../components/ui-shared/SlidingTopTabs';
import type { TenderListItem } from '../../types/tender';
import { getCustomerStatusOption, getCustomerStatusLabel } from './customerType';

import { t as i18nT } from '@/i18n/translate';
// Übersicht ist der Standardreiter — direkt geladen, damit sie ohne Ladeplatzhalter erscheint.
import { CustomerInfoCard } from './detail/CustomerInfoCard';

const CustomerContactsTable = lazy(() =>
    import('./detail/CustomerContactsTable').then((module) => ({ default: module.CustomerContactsTable }))
);
const CustomerAddressesTable = lazy(() =>
    import('./detail/CustomerAddressesTable').then((module) => ({ default: module.CustomerAddressesTable }))
);
const CustomerProductDiscounts = lazy(() =>
    import('./CustomerProductDiscounts').then((module) => ({ default: module.CustomerProductDiscounts }))
);
// Aufträge samt Verrechnung in der Zeile — der frühere Reiter "Rechnungen" ist
// darin aufgegangen (Rechnungen stehen im Raten-Sheet des jeweiligen Auftrags).
const CustomerOrdersTable = lazy(() =>
    import('./detail/CustomerOrdersTable').then((module) => ({ default: module.CustomerOrdersTable }))
);
// Angebote: eigene, serverseitig geblätterte Tabelle (15/Seite) — sie lädt ihre
// Zeilen selbst, sobald der Reiter geöffnet wird.
const CustomerOffersTable = lazy(() =>
    import('./detail/CustomerOffersTable').then((module) => ({ default: module.CustomerOffersTable }))
);
const CustomerNotesTable = lazy(() =>
    import('./detail/CustomerNotesTable').then((module) => ({ default: module.CustomerNotesTable }))
);
const CustomerActivitiesTable = lazy(() =>
    import('./detail/CustomerActivitiesTable').then((module) => ({ default: module.CustomerActivitiesTable }))
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
    // Adres AYRI BİLEŞENLER: `address` = sokak + bina no, `addressSupplement`
    // = adres eki / daire. Birleşik bir "adres" alanı yoktur; gösterim
    // `AddressLines` ile en fazla iki satıra iner.
    addressName?: string | null;
    address?: string | null;
    addressSupplement?: string | null;
    postalCode?: string | null;
    city?: string | null;
    state?: string | null;
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
    addressSupplement?: string | null;
    city?: string | null;
    postalCode?: string | null;
    state?: string | null;
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

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '—';

const apiErrorMessage = (error: unknown, fallback: string): string => {
    const message = (error as { response?: { data?: { error?: unknown } } })?.response?.data?.error;
    return typeof message === 'string' && message ? message : fallback;
};

// 'billing' ist entfallen: Rechnungen gehören zum Auftrag und stehen im
// Raten-Sheet der Auftragszeile, nicht in einer zweiten, parallelen Liste.
type CustomerTabId = 'profile' | 'contacts' | 'locations' | 'discounts' | 'offers' | 'orders' | 'projects' | 'reports' | 'notes' | 'activities';
const DASHBOARD_DETAIL_TABS: CustomerTabId[] = ['contacts', 'locations', 'notes', 'activities'];
// Reiter, die die Angebotsliste des Kunden brauchen. Sie wird BEIM ÖFFNEN des
// Reiters geladen, nicht beim Betreten der Seite: der Reiter "Angebote" holt
// seine 15 Zeilen selbst, hier hängt nur noch "Projekte" dran (es listet die
// Angebote mit Projekt).
const TENDER_TABS: CustomerTabId[] = ['projects'];

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

// Ladeplatzhalter aus dem gemeinsamen Loader — dieselbe Animation wie in den
// Tabellen, damit ein Reiterwechsel nicht anders lädt als eine Tabellenseite.
const DeferredTabFallback = () => <LoadingPanel rows={4} />;

const DeferredTab = ({ children }: { children: React.ReactNode }) => (
    <Suspense fallback={<DeferredTabFallback />}>{children}</Suspense>
);

export const CustomerDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<CustomerDashboardDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [tenders, setTenders] = useState<TenderListItem[]>([]);
    // null = noch nie geladen (der Reiter wurde nicht geöffnet); der Zähler am
    // Reiter bleibt dann leer, statt eine 0 zu behaupten.
    const [tendersCustomerId, setTendersCustomerId] = useState<string | null>(null);
    const [activeCustomerTab, setActiveCustomerTab] = useState<CustomerTabId>('profile');
    const [detailsCustomerId, setDetailsCustomerId] = useState<string | null>(null);
    const [detailsLoadingId, setDetailsLoadingId] = useState<string | null>(null);
    const [detailsErrorId, setDetailsErrorId] = useState<string | null>(null);
    const [tendersLoadingId, setTendersLoadingId] = useState<string | null>(null);
    // Zähler der selbstladenden Reiter — die Tabellen melden ihre Gesamtzahl,
    // solange sie nicht geöffnet wurden bleibt der Zähler weg.
    const [offersCount, setOffersCount] = useState<number | null>(null);
    const [ordersCount, setOrdersCount] = useState<number | null>(null);

    const [confirmDelete, setConfirmDelete] = useState(false);
    const [deleting, setDeleting] = useState(false);

    const [refreshing, setRefreshing] = useState(false);


    // Silent in-place refresh of the customer section after every action —
    // does NOT trigger the full-page skeleton, so the active tab stays put.
    const fetchData = async () => {
        if (!id) return;
        try {
            setRefreshing(true);
            const dashboardPromise = loadCustomerDashboard(id);
            // Angebote nur nachziehen, wenn sie schon einmal geladen wurden —
            // ein Speichern im Profil soll keinen ungeöffneten Reiter befüllen.
            if (tendersCustomerId === id) {
                void loadCustomerTenders(id).then(setTenders).catch(() => setTenders([]));
            }
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
                // Beim Kundenwechsel gehören die Listen des vorigen Kunden weg:
                // Zeilen UND Reiterzähler. Listen gehören ihren Reitern — beim
                // Betreten der Seite wird nur der Kopf geladen (der Firmenname
                // ist das LCP-Element), alles andere beim Öffnen des Reiters.
                setTenders([]);
                setTendersCustomerId(null);
                setOffersCount(null);
                setOrdersCount(null);
            }
        }, 0);

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

    const tendersLoaded = tendersCustomerId === id;
    const tendersLoading = tendersLoadingId === id;

    /** Angebotsliste für den Projektreiter — genau einmal je Kunde. */
    const loadTendersOnce = async () => {
        if (!id || tendersLoaded || tendersLoading) return;
        setTendersLoadingId(id);
        try {
            setTenders(await loadCustomerTenders(id));
        } catch {
            setTenders([]);
            toast.error(i18nT('crm.customers.errorLoadCustomer'));
        } finally {
            // Auch nach einem Fehler als geladen markieren: der Reiter zeigt dann
            // seinen Leerzustand statt endlos zu laden.
            setTendersCustomerId(id);
            setTendersLoadingId((current) => current === id ? null : current);
        }
    };

    const selectCustomerTab = (tabId: CustomerTabId) => {
        setActiveCustomerTab(tabId);
        if (DASHBOARD_DETAIL_TABS.includes(tabId)) void loadDashboardDetails();
        if (TENDER_TABS.includes(tabId)) void loadTendersOnce();
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
        // Gleiche Ladeanimation wie in den Tabellen (ui-shared/Loader).
        return (
            <div className="space-y-4" role="status" aria-live="polite">
                <SkeletonBar className="h-20 rounded-lg" />
                <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                    {[0, 1, 2, 3].map((column) => (
                        <SkeletonBar key={column} className="h-20 rounded-lg" delayMs={column * 90} />
                    ))}
                </div>
                <SkeletonBar className="h-[360px] rounded-lg" delayMs={360} />
            </div>
        );
    }
    if (!data) {
        return <div className="text-center text-slate-400 py-20 text-[13px]">{i18nT('crm.customer_not_found')}</div>;
    }


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

    const projectTenders = tenders.filter((t) => t.projectId);

    const customerTabs: { id: CustomerTabId; label: string; count?: number }[] = [
        { id: 'profile', label: i18nT('crm.profil') },
        { id: 'contacts', label: i18nT('crm.tab_contacts'), count: detailsLoaded ? data.contacts?.length ?? 0 : undefined },
        { id: 'locations', label: i18nT('crm.tab_locations'), count: detailsLoaded ? data.locations?.length ?? 0 : undefined },
        { id: 'discounts', label: i18nT('crm.tab_productDiscounts') },
        // Die Zähler der drei Listenreiter stehen erst, wenn der Reiter einmal
        // geladen hat — vorher wird keine Zahl behauptet.
        { id: 'offers', label: i18nT('crm.offers'), count: offersCount ?? undefined },
        { id: 'orders', label: i18nT('crm.tab_orders'), count: ordersCount ?? undefined },
        { id: 'projects', label: i18nT('nav.projects'), count: tendersLoaded ? projectTenders.length : undefined },
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
                        <Button variant="danger" icon={<TrashIcon size={13} />} onClick={() => setConfirmDelete(true)}>{i18nT('common.delete')}</Button>
                        <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/customers')}>{i18nT('crm.list_back')}</Button>
                    </>
                }
            />

            {/* Reiterleiste in der Optik der Angebotsdetailseite. */}
            <div className="ofi-quote-tabs-strip mb-2 min-w-0 overflow-x-auto border-b border-slate-200 px-1 pt-1 dark:border-white/15">
                <SlidingTopTabs activeKey={activeCustomerTab} className="flex min-w-max items-stretch gap-1" role="navigation" aria-label={i18nT('crm.customer_sections')}>
                    {customerTabs.map((tab) => {
                        const active = activeCustomerTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                data-tab-key={tab.id}
                                type="button"
                                onClick={() => selectCustomerTab(tab.id)}
                                className={`ofi-quote-tab -mb-px inline-flex items-center gap-1.5 whitespace-nowrap rounded-t-md border border-b-0 px-4 py-2.5 text-[12.5px] transition-colors ${
                                    active
                                        ? 'ofi-quote-tab-active border-slate-200 bg-[#eef2fb] font-bold text-[#1f2654]'
                                        : 'border-transparent font-medium text-slate-500 hover:border-slate-200 hover:bg-slate-50 hover:text-[#1f2654] dark:text-white/70'
                                }`}
                            >
                                {tab.label}
                                {tab.count !== undefined && (
                                    <span className={`ofi-quote-tab-badge inline-flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10.5px] font-bold tabular-nums ${
                                        active ? 'bg-[#1f2654] text-white' : 'bg-slate-100 text-slate-500'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </SlidingTopTabs>
            </div>

            {/* ---- PROFILE ---- */}
            {activeCustomerTab === 'profile' && id && (
                /* Nur Stammdaten: Zeilenband statt Kartenraster, Klick in eine
                   Zeile öffnet die Eingabe. Kennzahlen stehen hier bewusst nicht. */
                <CustomerInfoCard customerId={id} source={data} onSaved={fetchData} />
            )}

            {/* ---- CONTACTS (Kontaktpersonen) ---- */}
            {activeCustomerTab === 'contacts' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <CustomerContactsTable customerId={id} items={data.contacts ?? []} onChanged={fetchData} />
                    </DeferredTab>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- ADRESSEN: eine Tabelle, Hauptadresse als graue erste Zeile ---- */}
            {activeCustomerTab === 'locations' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <CustomerAddressesTable
                            customerId={id}
                            mainAddress={data}
                            items={data.locations ?? []}
                            onChanged={fetchData}
                        />
                    </DeferredTab>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- PRODUCT DISCOUNTS (Produktrabatte) ---- */}
            {activeCustomerTab === 'discounts' && id && (
                <DeferredTab>
                    <CustomerProductDiscounts customerId={id} />
                </DeferredTab>
            )}

            {/* ---- ORDERS (Aufträge) — Verrechnung direkt in der Zeile ---- */}
            {activeCustomerTab === 'orders' && id && (
                <DeferredTab>
                    <CustomerOrdersTable customerId={id} onTotalChange={setOrdersCount} />
                </DeferredTab>
            )}

            {/* ---- OFFERS (Angebote) — geblätterte Tabelle wie die Angebotsliste ---- */}
            {activeCustomerTab === 'offers' && id && (
                <DeferredTab>
                    <CustomerOffersTable customerId={id} onTotalChange={setOffersCount} />
                </DeferredTab>
            )}

            {/* ---- PROJECTS ---- */}
            {activeCustomerTab === 'projects' && !tendersLoaded && <DeferredTabFallback />}
            {activeCustomerTab === 'projects' && tendersLoaded && (
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
                                            <span className="text-[13px] font-semibold text-slate-900">{t.tenderNumber}</span>
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

            {/* ---- NOTIZEN ---- */}
            {activeCustomerTab === 'notes' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <CustomerNotesTable customerId={id} items={data.notes ?? []} onChanged={fetchData} />
                    </DeferredTab>
                ) : dashboardDetailsPlaceholder
            )}

            {/* ---- AKTIVITAETEN ---- */}
            {activeCustomerTab === 'activities' && id && (
                detailsLoaded ? (
                    <DeferredTab>
                        <CustomerActivitiesTable customerId={id} items={data.activities ?? []} onChanged={fetchData} />
                    </DeferredTab>
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
        </div>
    );
};


