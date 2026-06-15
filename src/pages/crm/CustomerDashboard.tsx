import { useEffect, useState } from 'react';
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
    File02 as FileText,
    File05 as FileSpreadsheet,
    Hash01 as Hash,
    Mail01 as Mail,
    MarkerPin01 as MapPin,
    Phone,
    Plus,
    Save01 as Save,
    Tag01 as Tag,
    User01 as UserIcon,
} from '@/components/icons/antIconCompat';

import { apiClient } from '../../lib/axios';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Field, Input, Textarea, Select } from '../../components/ui-shared/Field';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { Checkbox } from '../../components/ui-shared/Checkbox';
import { tenderApi } from '../../lib/api/tender';
import type { TenderListItem } from '../../types/tender';

import { t as i18nT } from '@/i18n/translate';

interface CustomerDashboardDto {
    id: string;
    companyName: string;
    segment?: string | null;
    taxOffice?: string | null;
    taxNumber?: string | null;
    mainEmail?: string | null;
    mainPhone?: string | null;
    address?: string | null;
    isActive: boolean;
    activities?: ActivityDto[];
    notes?: NoteDto[];
    contacts?: ContactDto[];
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
    isPrimaryContact: boolean;
}

const ACTIVITY_LABEL: Record<string, string> = {
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
};
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

const customerTabs = [
    { id: 'profile', label:i18nT('crm.profil'), targetId: 'customer-profile' },
    { id: 'tenders', label:i18nT('crm.tenders.tableTitle'), targetId: 'customer-tenders' },
    { id: 'notes', label:i18nT('crm.notes_activities'), targetId: 'customer-notes' },
] as const;

type CustomerTabId = (typeof customerTabs)[number]['id'];

export const CustomerDashboard = () => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState<CustomerDashboardDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [tenders, setTenders] = useState<TenderListItem[]>([]);
    const [activeCustomerTab, setActiveCustomerTab] = useState<CustomerTabId>('profile');

    const [noteForm, setNoteForm] = useState({
        noteType: 'internal', noteText: '', isHighlight: false,
    });
    const [activityForm, setActivityForm] = useState({
        activityType: 'Meeting', description: '',
    });
    const [savingNote, setSavingNote] = useState(false);
    const [savingActivity, setSavingActivity] = useState(false);

    const fetchData = async () => {
        if (!id) return;
        try {
            setLoading(true);
            const [dashRes, tendersRes] = await Promise.all([
                apiClient.get(`/customers/${id}/dashboard`),
                tenderApi.list({ customerId: id }).catch(() => []),
            ]);
            setData(dashRes.data);
            setTenders(tendersRes);
        } catch {
            toast.error(i18nT('crm.customers.errorLoadCustomer'));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        let mounted = true;
        (async () => {
            if (!id) return;
            try {
                setLoading(true);
                const [dashRes, tendersRes] = await Promise.all([
                    apiClient.get(`/customers/${id}/dashboard`),
                    tenderApi.list({ customerId: id }).catch(() => []),
                ]);
                if (mounted) {
                    setData(dashRes.data);
                    setTenders(tendersRes);
                }
            } catch {
                if (mounted) toast.error(i18nT('crm.customers.errorLoadCustomer'));
            } finally {
                if (mounted) setLoading(false);
            }
        })();
        return () => { mounted = false; };
    }, [id]);

    if (loading) {
        return (
            <div className="animate-pulse space-y-4">
                <div className="h-20 bg-slate-50 border border-slate-100 rounded-lg" />
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                    <div className="lg:col-span-8 h-[360px] bg-slate-50 border border-slate-100 rounded-lg" />
                    <div className="lg:col-span-4 h-[360px] bg-slate-50 border border-slate-100 rounded-lg" />
                </div>
            </div>
        );
    }
    if (!data) {
        return <div className="text-center text-slate-400 py-20 text-[13px]">{i18nT('crm.customer_not_found')}</div>;
    }

    const handleAddNote = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!noteForm.noteText.trim()) return toast.error(i18nT('crm.customers.errorNoteEmpty'));
        try {
            setSavingNote(true);
            await apiClient.post(`/customers/${id}/notes`, noteForm);
            toast.success(i18nT('crm.customers.successNoteAdded'));
            setNoteForm({ noteType: 'internal', noteText: '', isHighlight: false });
            fetchData();
        } catch (e: any) {
            toast.error(e.response?.data?.error ||i18nT('crm.customers.errorNoteAdd'));
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
        } catch (e: any) {
            toast.error(e.response?.data?.error ||i18nT('crm.customers.errorActivityAdd'));
        } finally {
            setSavingActivity(false);
        }
    };

    const totalTenderValue = tenders.reduce((s, t) => s + (t.grandTotal ?? 0), 0);
    const approvedTenders = tenders.filter((t) => t.status === "Approved" || t.status === "Exported").length;
    const projectTenders = tenders.filter((t) => t.projectId);

    const handleCustomerTabClick = (tab: (typeof customerTabs)[number]) => {
        setActiveCustomerTab(tab.id);
        window.requestAnimationFrame(() => {
            document.getElementById(tab.targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
    };

    return (
        <div>
            <PageHeader
                breadcrumb={i18nT('crm.breadcrumb_customer')}
                title={
                    <span className="flex items-center gap-3">
                        <span>{data.companyName}</span>
                        <StatusChip variant={data.isActive ? 'active' : 'passive'}>
                            {data.isActive ?i18nT('common.active') :i18nT('common.inactive')}
                        </StatusChip>
                    </span>
                }
                description={
                    <span className="flex items-center gap-3 text-[12.5px]">
                        {data.segment && <><Tag size={11} className="inline" /> {data.segment}</>}
                        {data.taxNumber && (
                            <>
                                <span className="text-slate-300">·</span>
                                <span className="font-mono">{data.taxNumber}</span>
                            </>
                        )}
                    </span>
                }
                actions={
                    <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={() => navigate('/crm/customers')}>{i18nT('crm.list_back')}</Button>
                }
            />

            <div className="mb-5 border-b border-secondary">
                <nav className="flex gap-7 overflow-x-auto" aria-label={i18nT('crm.customer_sections')}>
                    {customerTabs.map((tab) => {
                        const active = activeCustomerTab === tab.id;

                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => handleCustomerTabClick(tab)}
                                className={`relative -mb-px whitespace-nowrap border-b-[3px] px-0.5 py-3 text-sm font-semibold transition-colors ${
                                    active
                                        ?"border-brand text-brand-secondary"
                                        :"border-transparent text-tertiary hover:border-utility-brand-200 hover:text-secondary active:text-brand-secondary"
                                }`}
                            >
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Profile Strip */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
                <KPI label={i18nT('crm.active_tenders')} value={`${tenders.length}`} icon={<FileSpreadsheet size={14} />} />
                <KPI label={i18nT('crm.approved_export_exported')} value={`${approvedTenders}`} icon={<Activity size={14} />} accent="text-emerald-700" />
                <KPI label={i18nT('crm.total_hacim')} value={fmtMoney(totalTenderValue)} icon={<DollarSign size={14} />} primary />
                <KPI label={i18nT('crm.notes_activities')} value={`${(data.notes?.length ?? 0)} / ${(data.activities?.length ?? 0)}`} icon={<FileText size={14} />} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
                {/* LEFT */}
                <div className="lg:col-span-7 flex flex-col gap-4">
                    {/* Profile */}
                    <div id="customer-profile" className="scroll-mt-24">
                        <Card title={i18nT('crm.customer_profili')} icon={<Building2 size={13} />}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-[12.5px]">
                                <InfoRow icon={<Mail size={11} />} label={i18nT('common.email')} value={data.mainEmail} />
                                <InfoRow icon={<Phone size={11} />} label={i18nT('common.phone')} value={data.mainPhone} />
                                <InfoRow icon={<Hash size={11} />} label={i18nT('common.tax')} value={data.taxNumber ? `${data.taxNumber} / ${data.taxOffice ?? ''}` : null} />
                                <InfoRow icon={<Tag size={11} />} label={i18nT('crm.customers.colSegment')} value={data.segment} />
                                <InfoRow icon={<MapPin size={11} />} label={i18nT('common.address')} value={data.address} full />
                            </div>
                        </Card>
                    </div>

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

                    {/* Tenders */}
                    <div id="customer-tenders" className="scroll-mt-24">
                        <Card
                            title={i18nT('crm.customer_ait_tenders')}
                            description={i18nT('crm.crb_sia_451_standardinda_prepared_tender_data')}
                            icon={<FileSpreadsheet size={13} />}
                            noPadding
                            actions={
                                <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => navigate('/crm/tenders')}>{i18nT('nav.tenderManagement')}</Button>
                            }
                        >
                            {tenders.length === 0 ? (
                                <EmptyState
                                    icon={<FileSpreadsheet size={28} />}
                                    title={i18nT('crm.tender_not_found')}
                                    description={i18nT('crm.bu_customer_icin_no_hazirlanmis_bir_tender_bul')}
                                    action={
                                        <Button variant="primary" size="sm" icon={<Plus size={11} />} onClick={() => navigate('/crm/tenders')}>{i18nT('nav.quickActionsGroup.newTender')}</Button>
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
                                                    <span className="font-semibold text-slate-900 text-[13px]">{t.tenderNumber}</span>
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
                    </div>

                    {/* Activity Timeline */}
                    <Card
                        title={i18nT('crm.zaman_cizelgesi')}
                        description={i18nT('crm.customer_timeline_description')}
                        icon={<Clock size={13} />}
                    >
                        {/* Inline Activity Form */}
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
                                    <li key={a.id} className="ml-3.5">
                                        <span className={`absolute w-2.5 h-2.5 rounded-full -left-[5px] mt-1 ${ACTIVITY_COLOR[a.activityType] || 'bg-slate-400'}`} />
                                        <div className="flex items-center justify-between mb-0.5">
                                            <div className="min-w-0">
                                                <span className="text-[12.5px] font-semibold text-slate-800">
                                                    {ACTIVITY_LABEL[a.activityType] || a.activityType}
                                                </span>
                                                <div className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500">
                                                    <UserIcon size={10} />
                                                    <span className="truncate">{activityActor(a)}</span>
                                                </div>
                                            </div>
                                            <time className="text-[11px] text-slate-400 font-mono">
                                                {dayjs(a.activityDate).format("DD.MM.YYYY HH:mm")}
                                            </time>
                                        </div>
                                        {a.description && (
                                            <p className="text-[12px] text-slate-600 leading-relaxed">{a.description}</p>
                                        )}
                                    </li>
                                ))}
                            </ol>
                        )}
                    </Card>
                </div>

                {/* RIGHT */}
                <div className="lg:col-span-5 flex flex-col gap-4">
                    {/* Notes */}
                    <div id="customer-notes" className="scroll-mt-24">
                        <Card
                            title={i18nT('crm.internal_notes')}
                            description={i18nT('crm.internal_notes_hint')}
                            icon={<FileText size={13} />}
                        >
                            <form onSubmit={handleAddNote} className="space-y-2 pb-3 mb-3 border-b border-slate-100">
                                <div className="grid grid-cols-2 gap-2">
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
                                <Button variant="primary" type="submit" loading={savingNote} icon={<Save size={12} />} className="w-full">{i18nT('crm.notu_kaydet')}</Button>
                            </form>

                            {(data.notes?.length ?? 0) === 0 ? (
                                <div className="text-[12px] text-slate-400 text-center py-4">{i18nT('crm.no_notes_yet')}</div>
                            ) : (
                                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                                    {data.notes!.map((n) => (
                                        <div
                                            key={n.id}
                                            className={`border rounded-md p-2.5 ${n.isHighlight ?"border-rose-200 bg-rose-50/40" :"border-slate-200 bg-white"}`}
                                        >
                                            <div className="flex items-center gap-1.5 mb-1">
                                                <span className={`text-[10.5px] px-1.5 py-0.5 rounded font-medium ${n.noteType === 'technical' ?"bg-cyan-50 text-cyan-700" :"bg-slate-100 text-slate-600"}`}>
                                                    {n.noteType === 'technical' ?i18nT('crm.technical') :i18nT('crm.internal')}
                                                </span>
                                                {n.isHighlight && (
                                                    <span className="text-[10.5px] px-1.5 py-0.5 rounded font-medium bg-rose-50 text-rose-700 flex items-center gap-1">
                                                        <AlertTriangle size={9} />{i18nT('crm.critical')}</span>
                                                )}
                                                <span className="text-[10.5px] text-slate-400 ml-auto flex items-center gap-1 font-mono">
                                                    <Calendar size={9} />
                                                    {dayjs(n.createdAt).format("DD.MM.YYYY HH:mm")}
                                                </span>
                                            </div>
                                            <p className="text-[12.5px] text-slate-700 leading-relaxed whitespace-pre-wrap">{n.noteText}</p>
                                            {n.createdBy && (
                                                <div className="text-[10.5px] text-slate-400 mt-1 flex items-center gap-1">
                                                    <UserIcon size={9} />
                                                    {n.createdBy.firstName} {n.createdBy.lastName}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </Card>
                    </div>
                </div>
            </div>
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

const InfoRow: React.FC<{ icon: React.ReactNode; label: string; value?: string | null; full?: boolean }> = ({ icon, label, value, full }) => (
    <div className={`flex items-center gap-2.5 py-1.5 ${full ? 'sm:col-span-2' : ''}`}>
        <span className="text-slate-400">{icon}</span>
        <span className="text-[10.5px] uppercase tracking-wider font-semibold text-slate-400 w-16 flex-shrink-0">{label}</span>
        <span className="text-slate-800 truncate">{value || <span className="text-slate-300">-</span>}</span>
    </div>
);
