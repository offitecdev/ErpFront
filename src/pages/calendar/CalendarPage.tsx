import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';

import { CalendarCheck01, ChevronLeft, ChevronRight, Plus, SearchLg } from '@/components/icons/antIconCompat';
import { Card } from '@/components/ui-shared/Card';
import { t } from '@/i18n/translate';
import { maintenanceApi } from '@/lib/api/maintenance';
import { meetingApi, meetingParticipantName, type MeetingActivityDto } from '@/lib/api/meetings';
import { projectApi } from '@/lib/api/project';
import { getRoleProfile } from '@/lib/access';
import { useAuthStore } from '@/store/authStore';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { ensureMaintenanceLocale } from '@/pages/maintenance/MaintenanceShared';

import { MiniMonth } from './components/MiniMonth';
import { MonthGrid, TimeGrid } from './components/CalendarGrid';
import { EventPopup } from './components/EventPopup';
import { TodaySheet } from './components/TodaySheet';
import { AppointmentWizard, type WizardPrefill } from './components/AppointmentWizard';
import { MeetingComposer } from './components/MeetingComposer';
import {
    appointmentCalStatus,
    dayKey,
    personName,
    viewRange,
    type CalCategory,
    type CalEvent,
    type CalEventDetail,
    type CalParticipant,
    type CalStatus,
    type CalendarView,
} from './calendarShared';

const dedupeParticipants = (list: CalParticipant[]): CalParticipant[] => {
    const seen = new Set<string>();
    const out: CalParticipant[] = [];
    for (const person of list) {
        const key = person.id || person.name;
        if (!person.name || seen.has(key)) continue;
        seen.add(key);
        out.push(person);
    }
    return out;
};

const orderParticipants = (appt: any): CalParticipant[] => dedupeParticipants([
    ...(appt.assignedTechnician
        ? [{ id: appt.assignedTechnician.id, name: personName(appt.assignedTechnician), role: appt.assignedTechnician.roleName, email: appt.assignedTechnician.email, phone: appt.assignedTechnician.phone }]
        : []),
    ...(appt.technicianAssignments || [])
        .map((assignment: any) => assignment.technician)
        .filter(Boolean)
        .map((tech: any) => ({ id: tech.id, name: personName(tech), role: tech.roleName, email: tech.email, phone: tech.phone })),
]);

const maintenanceParticipants = (task: any): CalParticipant[] => dedupeParticipants([
    ...(task.technician ? [{ id: task.technician.id, name: personName(task.technician), role: task.technician.roleName, email: task.technician.email, phone: task.technician.phone }] : []),
    ...(task.alternativeTechnician ? [{ id: task.alternativeTechnician.id, name: personName(task.alternativeTechnician), role: task.alternativeTechnician.roleName, email: task.alternativeTechnician.email, phone: task.alternativeTechnician.phone }] : []),
    ...(task.assignments || [])
        .map((assignment: any) => assignment.technician)
        .filter(Boolean)
        .map((tech: any) => ({ id: tech.id, name: personName(tech), role: tech.roleName, email: tech.email, phone: tech.phone })),
]);

const buildOrderDetail = (appt: any): CalEventDetail => ({
    status: appt.status,
    notes: appt.notes,
    customerName: appt.project?.customer?.companyName,
    customerEmail: appt.project?.customer?.mainEmail,
    customerPhone: appt.project?.customer?.mainPhone,
    customerAddress: appt.project?.customer?.address,
    participants: orderParticipants(appt),
    ccEmails: Array.isArray(appt.ccEmails) ? appt.ccEmails : [],
    projectName: appt.project?.projectName,
    manager: personName(appt.project?.manager) || undefined,
    orderNumber: appt.salesOrder?.orderNumber,
    tenderNumber: (() => {
        const raw = appt.salesOrder?.tender?.tenderNumber ?? appt.project?.tender?.tenderNumber ?? null;
        return raw ? raw : null;
    })(),
});

const buildMaintenanceDetail = (task: any): CalEventDetail => ({
    status: task.status,
    customerName: task.contract?.customer?.companyName,
    customerEmail: task.contract?.customer?.mainEmail,
    customerPhone: task.contract?.customer?.mainPhone,
    customerAddress: task.contract?.customer?.address,
    participants: maintenanceParticipants(task),
    contractTitle: task.contract?.title,
    contractCode: task.contract?.contractCode,
    siteName: task.siteName || task.contract?.siteName,
    period: task.contract?.period,
});

const isAssignedTechnician = (appt: any, userId?: string | null) =>
    Boolean(userId) && (
        appt.assignedTechnician?.id === userId ||
        (appt.technicianAssignments || []).some((assignment: any) => assignment?.technician?.id === userId)
    );

/* Randevu filtre grupları: planlanan / devam eden / geçmiş-tamamlanan.
   İptal edilenler "geçmiş" grubuna sayılır (ayrı bir kutu açacak kadar nadir). */
type ApptStatusGroup = 'planned' | 'ongoing' | 'done';
const apptStatusGroup = (status: CalStatus): ApptStatusGroup =>
    status === 'planned' || status === 'ongoing' ? status : 'done';

/* Alt filtre çubuğundaki tek kategori yongası. Üzerine GELİNCE (hover) küçük
   bir panel YUKARI açılır (çubuk sayfanın altında durur) ve görünürlük onay
   kutularını gösterir; `onCreate` verildiyse yonganın içinde "+" düğmesi o
   kategorinin oluşturma pop-up'ını açar. */
const FilterChip = ({ label, swatch, count, dimmed, onCreate, createLabel, children }: {
    label: string;
    swatch: string;
    count: number;
    /** Kategorinin tüm grupları gizliyken yonga soluk görünür. */
    dimmed: boolean;
    onCreate?: () => void;
    createLabel?: string;
    children: React.ReactNode;
}) => (
    <div className="group relative">
        <span className={`flex items-center gap-1.5 rounded-md border border-slate-200 py-0.5 pl-2 pr-1 text-[11px] font-semibold dark:border-white/15 ${dimmed ? 'text-slate-400 dark:text-white/40' : 'text-slate-700 dark:text-white/85'}`}>
            <span className={`h-2.5 w-2.5 rounded-[3px] ${swatch}`} />
            {label}
            <span className="text-[10px] font-semibold tabular-nums text-slate-400 dark:text-white/45">{count}</span>
            {onCreate && (
                <button
                    type="button"
                    aria-label={createLabel}
                    title={createLabel}
                    onClick={onCreate}
                    className="ml-0.5 flex size-5 items-center justify-center rounded bg-[#07145c] text-white transition-colors hover:bg-[#0b1a6e] dark:bg-[#d48f16] dark:text-[#151616] dark:hover:bg-[#f2bb5c]"
                >
                    <Plus size={11} />
                </button>
            )}
        </span>
        {/* `pb-1` köprüsü: yonga ile panel arasında hover kopmasın. */}
        <div className="absolute bottom-full left-0 z-40 hidden w-60 pb-1 group-hover:block">
            <div className="rounded-lg border border-slate-200 bg-white p-1 shadow-lg dark:border-white/15 dark:bg-[#1d1e1e]">
                {children}
            </div>
        </div>
    </div>
);

/* Hover panelindeki tek onay kutusu satırı — durum rengi noktasıyla birlikte. */
const FilterCheckRow = ({ checked, dot, label, count, onToggle }: {
    checked: boolean;
    dot: string;
    label: string;
    count: number;
    onToggle: () => void;
}) => (
    <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11.5px] font-medium transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
    >
        <span className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-[4px] border transition-colors ${checked ? 'border-[#07145c] bg-[#07145c] dark:border-[#d48f16] dark:bg-[#d48f16]' : 'border-slate-300 bg-white dark:border-white/25 dark:bg-transparent'}`}>
            {checked && <span className="h-1.5 w-1.5 rounded-[1.5px] bg-white dark:bg-[#151616]" />}
        </span>
        <span className={`ofi-ucal-dot ${dot}`} />
        <span className="flex-1 text-slate-700 dark:text-white/85">{label}</span>
        <span className="text-[10px] font-semibold tabular-nums text-slate-400 dark:text-white/45">{count}</span>
    </button>
);

/* The calendar page: Outlook-style left rail (create buttons, mini month,
   filters, today's-events trigger) next to a large day/week/month grid. All
   the actual work happens in popups. */
export const CalendarPage = () => {
    ensureMaintenanceLocale();
    useLanguageTick();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const user = useAuthStore((state) => state.user);
    const userId = user?.id;

    // Technicians only ever see their own schedule — even with manager-level
    // view permissions the "all *" sources stay off for them.
    const isTechnician = useMemo(() => getRoleProfile(user) === 'technician', [user]);
    const has = useCallback((perm: string) => permissions.includes(perm), [permissions]);
    const canAllOrders = !isTechnician && (has('projects.view') || has('projects.manage'));
    const canMyInstallations = has('projects.report');
    const canAllMaintenance = !isTechnician && has('maintenance.contracts.manage');
    const canMyMaintenance = has('maintenance.tasks.manage') || has('maintenance.reports.manage');
    const canCreateAppointment = !isTechnician && has('projects.manage');

    const [view, setView] = useState<CalendarView>('week');
    const [anchor, setAnchor] = useState(() => dayjs());
    const [selectedDay, setSelectedDay] = useState(() => dayjs());
    // Bakım/toplantı görünürlüğü kategori başına tek anahtar; randevular ise
    // duruma göre ÜÇ grup hâlinde filtrelenir (aşağıdaki apptStatuses).
    const [enabled, setEnabled] = useState<Record<'meetings' | 'maintenance', boolean>>(() => ({
        maintenance: isTechnician,
        meetings: true,
    }));
    const [apptStatuses, setApptStatuses] = useState<Record<ApptStatusGroup, boolean>>(() => ({
        planned: true,
        ongoing: true,
        done: true,
    }));
    const [search, setSearch] = useState('');
    const [events, setEvents] = useState<CalEvent[]>([]);
    const [meetingEvents, setMeetingEvents] = useState<CalEvent[]>([]);
    const [loading, setLoading] = useState(false);
    const [now, setNow] = useState(() => dayjs());

    const [activeEvent, setActiveEvent] = useState<CalEvent | null>(null);
    const [wizardOpen, setWizardOpen] = useState(false);
    const [wizardPrefill, setWizardPrefill] = useState<WizardPrefill | null>(null);
    const [meetingOpen, setMeetingOpen] = useState(false);
    const [todayOpen, setTodayOpen] = useState(false);

    useEffect(() => {
        const id = window.setInterval(() => setNow(dayjs()), 60_000);
        return () => window.clearInterval(id);
    }, []);

    const range = useMemo(() => viewRange(view, anchor), [view, anchor]);

    const load = useCallback(async () => {
        setLoading(true);
        const start = range.start.format('YYYY-MM-DD');
        const end = range.end.format('YYYY-MM-DD');

        const orderSource = canAllOrders
            ? projectApi.listAppointments(start, end, { calendar: true })
            : canMyInstallations
                ? projectApi.listMyInstallations(start, end, { calendar: true })
                : null;
        const maintenanceSource = canAllMaintenance
            ? maintenanceApi.listTasks(start, end, { calendar: true })
            : canMyMaintenance
                ? maintenanceApi.listMyTasks(start, end, { calendar: true })
                : null;
        const maintenanceDetailPath = canAllMaintenance ? '/maintenance/tasks' : '/maintenance/technician/tasks';
        const fetchOrderDetail = canAllOrders ? projectApi.getAppointmentDetail : projectApi.getMyInstallationDetail;
        const fetchMaintenanceDetail = canAllMaintenance ? maintenanceApi.getTaskDetail : maintenanceApi.getMyTaskDetail;

        const [orderResult, maintenanceResult] = await Promise.allSettled([
            orderSource ?? Promise.resolve([]),
            maintenanceSource ?? Promise.resolve([]),
        ]);

        const collected: CalEvent[] = [];

        if (orderResult.status === 'fulfilled') {
            (orderResult.value as any[]).forEach((appt) => {
                const startTime = dayjs(appt.startTime);
                const endTime = appt.endTime ? dayjs(appt.endTime) : startTime.add(1, 'hour');
                const orderNumber = appt.salesOrder?.orderNumber;
                const customerName = appt.project?.customer?.companyName;
                const techs = orderParticipants(appt).map((person) => person.name);
                const projectId = appt.project?.id;
                const appointmentId = appt.id;
                collected.push({
                    id: `appt-${appt.id}`,
                    category: 'appointments',
                    refId: appt.id,
                    title: customerName || (orderNumber ? t('calendar.order', { number: orderNumber }) : t('calendar.orders')),
                    subtitle: orderNumber ? t('calendar.order', { number: orderNumber }) : undefined,
                    meta: techs.length ? `${t('calendar.technician')}: ${techs.join(', ')}` : undefined,
                    start: startTime,
                    end: endTime,
                    allDay: false,
                    status: appointmentCalStatus(appt, startTime, endTime),
                    customerId: appt.project?.customer?.id ?? null,
                    customerName: customerName ?? null,
                    projectId: projectId ?? null,
                    salesOrderId: appt.salesOrder?.id ?? null,
                    navigateTo: isAssignedTechnician(appt, userId)
                        ? `/projects/installation/tasks/${appt.id}`
                        : canAllOrders && projectId
                            ? `/projects/${projectId}`
                            : `/projects/installation/tasks/${appt.id}`,
                    loadDetail: () => fetchOrderDetail(appointmentId).then(buildOrderDetail),
                });
            });
        }

        if (maintenanceResult.status === 'fulfilled') {
            (maintenanceResult.value as any[]).forEach((task) => {
                const hasTime = Boolean(task.scheduledStartTime);
                const startTime = dayjs(task.scheduledStartTime || task.plannedDate);
                const endTime = task.scheduledEndTime ? dayjs(task.scheduledEndTime) : startTime.add(1, 'hour');
                const taskId = task.id;
                collected.push({
                    id: `maintenance-${task.id}`,
                    category: 'maintenance',
                    refId: task.id,
                    title: task.contract?.customer?.companyName || task.contract?.title || t('calendar.maintenance'),
                    subtitle: task.contract?.contractCode || undefined,
                    start: startTime,
                    end: endTime,
                    allDay: !hasTime,
                    status: 'maintenance',
                    navigateTo: `${maintenanceDetailPath}/${task.id}`,
                    loadDetail: () => fetchMaintenanceDetail(taskId).then(buildMaintenanceDetail),
                });
            });
        }

        setEvents(collected);
        setLoading(false);
    }, [range.start.valueOf(), range.end.valueOf(), userId, canAllOrders, canMyInstallations, canAllMaintenance, canMyMaintenance]); // eslint-disable-line react-hooks/exhaustive-deps

    // Meetings load & refresh as their own slice; saving a meeting never
    // reloads the whole calendar. TASK rows are dropped — no tasks here.
    const loadMeetings = useCallback(async () => {
        const rows = await meetingApi.list(range.start.toISOString(), range.end.toISOString()).catch(() => [] as MeetingActivityDto[]);
        setMeetingEvents(
            rows
                .filter((meeting) => meeting.kind !== 'TASK' && dayjs(meeting.startTime).isValid())
                .map((meeting) => {
                    const startTime = dayjs(meeting.startTime);
                    const endTime = dayjs(meeting.endTime);
                    const people = meeting.participants.map(meetingParticipantName).filter(Boolean);
                    return {
                        id: `meeting-${meeting.id}`,
                        category: 'meetings' as const,
                        refId: meeting.id,
                        title: meeting.customer?.companyName ? `${meeting.title} · ${meeting.customer.companyName}` : meeting.title,
                        subtitle: people.length ? people.slice(0, 3).join(', ') : meeting.notes || undefined,
                        start: startTime,
                        end: endTime.isValid() ? endTime : startTime.add(1, 'hour'),
                        allDay: false,
                        status: 'meeting' as const,
                        loadDetail: () => Promise.resolve({
                            notes: meeting.notes || null,
                            customerName: meeting.customer?.companyName || null,
                            ccEmails: Array.isArray(meeting.ccEmails) ? meeting.ccEmails : [],
                            participants: meeting.participants.map((participant) => ({
                                id: participant.id,
                                name: meetingParticipantName(participant),
                                role: participant.participantType === 'CUSTOMER'
                                    ? t('calendar.picker.customer')
                                    : participant.employee?.roleName || null,
                                email: participant.participantType === 'CUSTOMER' ? participant.customer?.mainEmail : participant.employee?.email,
                                phone: participant.participantType === 'CUSTOMER' ? participant.customer?.mainPhone : null,
                            })).filter((participant) => participant.name),
                        }),
                    };
                }),
        );
    }, [range.start.valueOf(), range.end.valueOf()]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => { void load(); }, [load]);
    useEffect(() => { void loadMeetings(); }, [loadMeetings]);

    const allEvents = useMemo(() => [...events, ...meetingEvents], [events, meetingEvents]);

    const visibleEvents = useMemo(() => {
        const needle = search.trim().toLowerCase();
        return allEvents.filter((event) => {
            // Randevular durum grubuna göre, diğer kategoriler tek anahtarla süzülür.
            if (event.category === 'appointments') {
                if (!apptStatuses[apptStatusGroup(event.status)]) return false;
            } else if (!enabled[event.category]) {
                return false;
            }
            if (!needle) return true;
            return event.title.toLowerCase().includes(needle)
                || (event.subtitle || '').toLowerCase().includes(needle)
                || (event.meta || '').toLowerCase().includes(needle);
        });
    }, [allEvents, enabled, apptStatuses, search]);

    const categoryCounts = useMemo(() => {
        const counts: Record<CalCategory, number> = { appointments: 0, maintenance: 0, meetings: 0 };
        allEvents.forEach((event) => { counts[event.category] += 1; });
        return counts;
    }, [allEvents]);

    // Randevu hover panelindeki grup sayaçları (planlanan / devam eden / geçmiş).
    const apptStatusCounts = useMemo(() => {
        const counts: Record<ApptStatusGroup, number> = { planned: 0, ongoing: 0, done: 0 };
        allEvents.forEach((event) => {
            if (event.category === 'appointments') counts[apptStatusGroup(event.status)] += 1;
        });
        return counts;
    }, [allEvents]);

    const eventsByDay = useMemo(() => {
        const map = new Map<string, CalEvent[]>();
        visibleEvents.forEach((event) => {
            const key = dayKey(event.start);
            map.set(key, [...(map.get(key) || []), event]);
        });
        map.forEach((list) => list.sort((a, b) => Number(b.allDay) - Number(a.allDay) || a.start.valueOf() - b.start.valueOf()));
        return map;
    }, [visibleEvents]);

    const step = (direction: 1 | -1) => {
        const unit = view === 'day' ? 'day' : view === 'week' ? 'week' : 'month';
        setAnchor((current) => current.add(direction, unit));
    };

    const goToday = () => {
        const today = dayjs();
        setAnchor(today);
        setSelectedDay(today);
    };

    const openDay = (day: dayjs.Dayjs) => {
        setSelectedDay(day);
        setAnchor(day);
        setView('day');
    };

    const pickDay = (day: dayjs.Dayjs) => {
        setSelectedDay(day);
        setAnchor(day);
    };

    const openWizard = (prefill: WizardPrefill | null) => {
        setWizardPrefill(prefill);
        setWizardOpen(true);
    };

    const createFromEvent = (event: CalEvent) => {
        setActiveEvent(null);
        openWizard({
            customer: event.customerId ? { id: event.customerId, companyName: event.customerName || '' } : null,
            projectId: event.projectId ?? null,
            salesOrderId: event.salesOrderId ?? null,
        });
    };

    const periodLabel = useMemo(() => {
        if (view === 'day') return anchor.format('dddd, DD MMMM YYYY');
        if (view === 'week') return `${range.start.format('DD MMM')} – ${range.end.format('DD MMM YYYY')}`;
        return anchor.format('MMMM YYYY');
    }, [view, anchor, range.start, range.end]);

    const views: Array<{ key: CalendarView; label: string }> = [
        { key: 'day', label: t('calendar.day') },
        { key: 'week', label: t('calendar.week') },
        { key: 'month', label: t('calendar.month') },
    ];

    // Randevu hover panelinin satırları — lejant renk noktalarıyla aynı sözleşme.
    const apptStatusItems: Array<{ key: ApptStatusGroup; label: string; dot: string }> = [
        { key: 'planned', label: t('calendar.legend.planned'), dot: 'ofi-ucal-dot--planned' },
        { key: 'ongoing', label: t('calendar.legend.ongoing'), dot: 'ofi-ucal-dot--ongoing' },
        { key: 'done', label: t('calendar.legend.done'), dot: 'ofi-ucal-dot--done' },
    ];

    return (
        <div className="flex w-full flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
                {/* ── left rail ─────────────────────────────────────────── */}
                {/* Oluşturma düğmeleri KALDIRILDI (kullanıcı isteği 2026-08-07):
                    sayfada yalnızca takvim durur; randevu, boş yarım saat
                    hücresine tıklanarak oluşturulur. Filtreler takvimin ALTINDAKİ
                    çubuğa taşındı. */}
                <aside className="flex h-fit flex-col gap-3 xl:sticky xl:top-4">
                    <MiniMonth anchor={anchor} selectedDay={selectedDay} now={now} eventsByDay={eventsByDay} onPickDay={pickDay} />

                    <button
                        type="button"
                        onClick={() => setTodayOpen(true)}
                        className="flex h-10 items-center justify-center gap-2 rounded-xl border border-[#E3E7F0] bg-white px-4 text-[13px] font-semibold text-slate-700 transition-colors hover:bg-[#F7F8FC] dark:border-white/10 dark:bg-white/6 dark:text-white/85 dark:hover:bg-white/10"
                    >
                        <CalendarCheck01 size={15} />
                        {t('calendar.todaySheet.button')}
                    </button>

                    {/* Takvimde arama — bugünün randevuları düğmesinin ALTINDA
                        (kullanıcı isteği 2026-08-07; alttaki şerit yalnızca
                        filtre yongalarına ayrıldı). */}
                    <label className="flex items-center gap-2 rounded-xl border border-[#E3E7F0] bg-white px-3 py-2 transition-colors focus-within:border-[#07145c]/40 dark:border-white/10 dark:bg-white/6 dark:focus-within:border-[#d48f16]/50">
                        <SearchLg size={13} className="shrink-0 text-slate-400" />
                        <input
                            value={search}
                            onChange={(event) => setSearch(event.target.value)}
                            placeholder={t('calendar.searchPlaceholder')}
                            className="w-full bg-transparent text-[12.5px] text-slate-800 outline-none placeholder:text-slate-400 dark:text-white"
                        />
                    </label>
                </aside>

                {/* ── big calendar ──────────────────────────────────────── */}
                <div className="flex min-w-0 flex-col gap-3">
                    <header className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-baseline gap-3">
                            <h1 className="text-[20px] font-semibold tracking-tight text-[#1A1A1A] dark:text-white">{t('calendar.title')}</h1>
                            <span className="text-[13.5px] font-semibold capitalize text-[#07145c] dark:text-[#d48f16]">{periodLabel}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="inline-flex overflow-hidden rounded-xl border border-[#E3E7F0] bg-white dark:border-white/10 dark:bg-white/6">
                                <button type="button" aria-label={t('common.back')} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/10" onClick={() => step(-1)}><ChevronLeft size={15} /></button>
                                <button type="button" className="h-9 border-x border-[#E3E7F0] px-3 text-[12px] font-semibold text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:text-white/85 dark:hover:bg-white/10" onClick={goToday}>{t('calendar.today')}</button>
                                <button type="button" aria-label={t('common.next')} className="flex h-9 w-9 items-center justify-center text-slate-500 hover:bg-slate-50 dark:text-white/70 dark:hover:bg-white/10" onClick={() => step(1)}><ChevronRight size={15} /></button>
                            </div>
                            <div className="inline-flex rounded-xl border border-[#E3E7F0] bg-[#EEF1F7] p-1 dark:border-white/10 dark:bg-white/6">
                                {views.map((item) => (
                                    <button
                                        key={item.key}
                                        type="button"
                                        onClick={() => setView(item.key)}
                                        className={`ofi-calendar-view-button ${view === item.key ? 'is-active' : ''}`}
                                    >
                                        {item.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </header>

                    <Card noPadding className="overflow-hidden dark:border-white/10 dark:bg-[#151616]">
                        {loading ? (
                            <div className="ofi-shimmer m-4 h-[560px] rounded-lg bg-slate-100 dark:bg-white/5" />
                        ) : view === 'month' ? (
                            <MonthGrid
                                anchor={anchor}
                                range={range}
                                eventsByDay={eventsByDay}
                                selectedDay={selectedDay}
                                now={now}
                                onSelectDay={pickDay}
                                onOpenDay={openDay}
                                onOpenEvent={setActiveEvent}
                                onCreateDay={canCreateAppointment ? (day) => openWizard({ date: day }) : undefined}
                            />
                        ) : (
                            <TimeGrid
                                days={view === 'day' ? [anchor] : Array.from({ length: 7 }, (_, index) => range.start.add(index, 'day'))}
                                eventsByDay={eventsByDay}
                                now={now}
                                onOpenEvent={setActiveEvent}
                                onOpenDay={openDay}
                                onCreateAt={canCreateAppointment ? (start) => openWizard({ date: start, withTime: true }) : undefined}
                            />
                        )}
                    </Card>

                    {/* ── filtre şeridi ─────────────────────────────────────
                        Takvimin ALTINDAKİ bölüm yalnızca filtre yongalarına
                        ayrıldı (kullanıcı isteği 2026-08-07): yonganın üzerine
                        GELİNCE görünürlük onay kutuları açılır; "+" doğrudan o
                        kategorinin oluşturma pop-up'ını açar (bakım için henüz
                        yok). Arama sol raya taşındı. */}
                    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-1.5 dark:border-white/10 dark:bg-[#151616]">
                        <FilterChip
                            label={t('calendar.appointments')}
                            swatch="bg-[#101e6e]"
                            count={categoryCounts.appointments}
                            dimmed={!apptStatuses.planned && !apptStatuses.ongoing && !apptStatuses.done}
                            onCreate={canCreateAppointment ? () => openWizard({ date: selectedDay }) : undefined}
                            createLabel={t('calendar.newAppointment')}
                        >
                            {apptStatusItems.map((item) => (
                                <FilterCheckRow
                                    key={item.key}
                                    checked={apptStatuses[item.key]}
                                    dot={item.dot}
                                    label={item.label}
                                    count={apptStatusCounts[item.key]}
                                    onToggle={() => setApptStatuses((current) => ({ ...current, [item.key]: !current[item.key] }))}
                                />
                            ))}
                        </FilterChip>

                        <FilterChip
                            label={t('calendar.meetings')}
                            swatch="bg-[#6d5bd0]"
                            count={categoryCounts.meetings}
                            dimmed={!enabled.meetings}
                            onCreate={() => setMeetingOpen(true)}
                            createLabel={t('calendar.newMeeting')}
                        >
                            <FilterCheckRow
                                checked={enabled.meetings}
                                dot="ofi-ucal-dot--meeting"
                                label={t('calendar.meetings')}
                                count={categoryCounts.meetings}
                                onToggle={() => setEnabled((current) => ({ ...current, meetings: !current.meetings }))}
                            />
                        </FilterChip>

                        <FilterChip
                            label={t('calendar.maintenance')}
                            swatch="bg-[#b45309]"
                            count={categoryCounts.maintenance}
                            dimmed={!enabled.maintenance}
                        >
                            <FilterCheckRow
                                checked={enabled.maintenance}
                                dot="ofi-ucal-dot--maintenance"
                                label={t('calendar.maintenance')}
                                count={categoryCounts.maintenance}
                                onToggle={() => setEnabled((current) => ({ ...current, maintenance: !current.maintenance }))}
                            />
                        </FilterChip>
                    </div>
                </div>
            </div>

            <EventPopup
                event={activeEvent}
                onClose={() => setActiveEvent(null)}
                onNavigate={(event) => {
                    setActiveEvent(null);
                    if (event.navigateTo) navigate(event.navigateTo);
                }}
                onCreateFrom={createFromEvent}
                canCreate={canCreateAppointment}
            />

            <TodaySheet
                open={todayOpen}
                onClose={() => setTodayOpen(false)}
                events={visibleEvents}
                onOpenEvent={(event) => setActiveEvent(event)}
                onCreate={(day) => { setTodayOpen(false); openWizard({ date: day }); }}
                canCreate={canCreateAppointment}
            />

            <AppointmentWizard
                open={wizardOpen}
                onClose={() => setWizardOpen(false)}
                prefill={wizardPrefill}
                onSaved={() => void load()}
            />

            {/* Toplantı oluşturma — filtre şeridindeki "+" ile açılır. */}
            <MeetingComposer
                open={meetingOpen}
                onClose={() => setMeetingOpen(false)}
                initialDate={selectedDay}
                onSaved={() => void loadMeetings()}
            />
        </div>
    );
};
