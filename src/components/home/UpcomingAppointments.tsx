import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

import {
    Calendar as CalendarOutlined,
    CalendarCheck01 as CalendarCheckOutlined,
    Clipboard,
    Tag01 as TagOutlined,
    AlertTriangle,
    ChevronDown,
    ChevronUp,
} from '@/components/icons/antIconCompat';

import { projectApi } from '../../lib/api/project';
import { maintenanceApi } from '../../lib/api/maintenance';
import { tenderApi } from '../../lib/api/tender';
import { useAuthStore } from '../../store/authStore';
import { localizeTenderNumber } from '../../utils/tenderNumber';

type UpcomingCategory = 'assembly' | 'maintenance' | 'offer' | 'deadline';

type UpcomingItem = {
    id: string;
    category: UpcomingCategory;
    title: string;
    subtitle?: string;
    date: dayjs.Dayjs;
    navigateTo?: string;
};

type UpcomingAppointmentsProps = {
    categories?: UpcomingCategory[];
    limit?: number;
    titleKey?: string;
    defaultTitle?: string;
    subtitleKey?: string;
    defaultSubtitle?: string;
};

const CATEGORY_META: Record<UpcomingCategory, {
    labelKey: string;
    defaultLabel: string;
    icon: React.ComponentType<any>;
    dot: string;
    badge: string;
}> = {
    assembly: { labelKey: 'home.upcoming.assembly', defaultLabel: 'Montaj', icon: Clipboard, dot: 'bg-violet-500', badge: 'bg-violet-50 text-violet-700' },
    maintenance: { labelKey: 'home.upcoming.maintenance', defaultLabel: 'Bakım', icon: CalendarCheckOutlined, dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700' },
    offer: { labelKey: 'home.upcoming.offer', defaultLabel: 'Teklif', icon: TagOutlined, dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700' },
    deadline: { labelKey: 'home.upcoming.deadline', defaultLabel: 'Termin', icon: AlertTriangle, dot: 'bg-rose-500', badge: 'bg-rose-50 text-rose-700' },
};

const WINDOW_DAYS = 30;

// True when the current user is a technician assigned to this appointment (lead or
// co-technician). Assigned technicians open their own installation task screen even
// if they also hold manager permissions; only managers not on the job go to the
// project admin screen.
const isAssignedTechnician = (appt: any, userId?: string | null) =>
    Boolean(userId) && (
        appt.assignedTechnician?.id === userId ||
        (appt.technicianAssignments || []).some((a: any) => a?.technician?.id === userId)
    );

export const UpcomingAppointments = ({
    categories,
    limit = 15,
    titleKey = 'home.upcoming.title',
    defaultTitle = 'Yaklaşan Randevular',
    subtitleKey = 'home.upcoming.subtitle',
    defaultSubtitle = 'Montaj · Sipariş · Teklif · Termin',
}: UpcomingAppointmentsProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const userId = useAuthStore((state) => state.user?.id);

    const [items, setItems] = useState<UpcomingItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [open, setOpen] = useState(true);
    const categoryFilterKey = categories?.join('|') ?? 'all';
    const enabledCategories = useMemo(() => categories ? new Set(categories) : null, [categoryFilterKey]);

    const has = useCallback((perm: string) => permissions.includes(perm), [permissions]);
    const canAllOrders = has('projects.view') || has('projects.manage');
    const canMyInstallations = has('projects.report');
    const canAllMaintenance = has('maintenance.contracts.manage');
    const canMyMaintenance = has('maintenance.tasks.manage') || has('maintenance.reports.manage');
    const canTenders = has('tenders.view');
    const shouldLoadAssembly = !enabledCategories || enabledCategories.has('assembly');
    const shouldLoadMaintenance = !enabledCategories || enabledCategories.has('maintenance');
    const shouldLoadTenders = !enabledCategories || enabledCategories.has('offer') || enabledCategories.has('deadline');

    const load = useCallback(async () => {
        setLoading(true);
        const today = dayjs().startOf('day');
        const start = today.format('YYYY-MM-DD');
        const end = today.add(WINDOW_DAYS, 'day').format('YYYY-MM-DD');

        const appointmentSource = shouldLoadAssembly && canAllOrders
            ? projectApi.listAppointments(start, end)
            : shouldLoadAssembly && canMyInstallations
                ? projectApi.listMyInstallations(start, end)
                : null;
        const maintenanceSource = shouldLoadMaintenance && canAllMaintenance
            ? maintenanceApi.listTasks(start, end)
            : shouldLoadMaintenance && canMyMaintenance
                ? maintenanceApi.listMyTasks(start, end)
                : null;
        const tenderSource = shouldLoadTenders && canTenders ? tenderApi.list() : null;

        const [apptResult, maintResult, tenderResult] = await Promise.allSettled([
            appointmentSource ?? Promise.resolve([]),
            maintenanceSource ?? Promise.resolve([]),
            tenderSource ?? Promise.resolve([]),
        ]);

        const collected: UpcomingItem[] = [];

        if (apptResult.status === 'fulfilled') {
            (apptResult.value as any[]).forEach((appt) => {
                const startTime = dayjs(appt.startTime);
                const customer = appt.project?.customer?.companyName;
                const orderNumber = appt.salesOrder?.orderNumber;
                const projectId = appt.project?.id;
                collected.push({
                    id: `assembly-${appt.id}`,
                    category: 'assembly',
                    title: customer || (orderNumber ? `#${orderNumber}` : t('home.upcoming.assembly', { defaultValue: 'Montaj' })),
                    subtitle: orderNumber ? t('home.upcoming.orderNo', { number: orderNumber, defaultValue: `Sipariş #${orderNumber}` }) : undefined,
                    date: startTime,
                    navigateTo: isAssignedTechnician(appt, userId)
                        ? `/projects/installation/tasks/${appt.id}`
                        : canAllOrders && projectId
                            ? `/projects/${projectId}`
                            : `/projects/installation/tasks/${appt.id}`,
                });
            });
        }

        if (maintResult.status === 'fulfilled') {
            (maintResult.value as any[]).forEach((task) => {
                const startTime = dayjs(task.scheduledStartTime || task.plannedDate);
                const detail = canAllMaintenance ? '/maintenance/tasks' : '/maintenance/technician/tasks';
                collected.push({
                    id: `maintenance-${task.id}`,
                    category: 'maintenance',
                    title: task.contract?.customer?.companyName || task.contract?.title || t('home.upcoming.maintenance', { defaultValue: 'Bakım' }),
                    subtitle: task.contract?.contractCode || undefined,
                    date: startTime,
                    navigateTo: `${detail}/${task.id}`,
                });
            });
        }

        if (tenderResult.status === 'fulfilled') {
            const horizon = today.add(WINDOW_DAYS, 'day');
            (tenderResult.value as any[]).forEach((tender) => {
                if (!tender.validUntil) return;
                const validUntil = dayjs(tender.validUntil);
                if (validUntil.isBefore(today) || validUntil.isAfter(horizon)) return;
                // Tenders expiring within a week are surfaced as urgent deadlines;
                // the rest appear as regular offers.
                const isUrgent = validUntil.diff(today, 'day') <= 7;
                collected.push({
                    id: `tender-${tender.id}`,
                    category: isUrgent ? 'deadline' : 'offer',
                    title: tender.customerName || `#${localizeTenderNumber(tender.tenderNumber)}`,
                    subtitle: t('home.upcoming.validUntil', {
                        date: validUntil.format('DD MMM'),
                        defaultValue: `Geçerlilik: ${validUntil.format('DD MMM')}`,
                    }),
                    date: validUntil,
                    navigateTo: `/crm/tenders/${tender.id}`,
                });
            });
        }

        collected.sort((a, b) => a.date.valueOf() - b.date.valueOf());
        const visible = enabledCategories
            ? collected.filter((item) => enabledCategories.has(item.category))
            : collected;
        setItems(visible.slice(0, limit));
        setLoading(false);
    }, [userId, canAllOrders, canMyInstallations, canAllMaintenance, canMyMaintenance, canTenders, shouldLoadAssembly, shouldLoadMaintenance, shouldLoadTenders, enabledCategories, limit, t]);

    useEffect(() => {
        void load();
    }, [load]);

    const hasAnySource = enabledCategories
        ? ((enabledCategories.has('assembly') && (canAllOrders || canMyInstallations))
            || (enabledCategories.has('maintenance') && (canAllMaintenance || canMyMaintenance))
            || ((enabledCategories.has('offer') || enabledCategories.has('deadline')) && canTenders))
        : canAllOrders || canMyInstallations || canAllMaintenance || canMyMaintenance || canTenders;

    const relativeLabel = useMemo(() => (date: dayjs.Dayjs) => {
        const today = dayjs().startOf('day');
        const diff = date.startOf('day').diff(today, 'day');
        if (diff <= 0) return t('home.upcoming.today', { defaultValue: 'Bugün' });
        if (diff === 1) return t('home.upcoming.tomorrow', { defaultValue: 'Yarın' });
        return t('home.upcoming.inDays', { days: diff, defaultValue: `${diff} gün içinde` });
    }, [t]);

    if (!hasAnySource) return null;

    return (
        <div className="rounded-xl border border-[#EAEAEC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <button
                type="button"
                onClick={() => setOpen((value) => !value)}
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left"
                aria-expanded={open}
            >
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-[#E7F6EC] text-[#16A34A] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]">
                    <CalendarOutlined size={17} />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[13.5px] font-semibold text-slate-900">
                        {t(titleKey, { defaultValue: defaultTitle })}
                    </span>
                    <span className="block text-[11.5px] text-slate-400">
                        {t(subtitleKey, { defaultValue: defaultSubtitle })}
                    </span>
                </span>
                {!loading && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-600">
                        {items.length}
                    </span>
                )}
                {open ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
            </button>

            {open && (
                <div className="max-h-[360px] overflow-y-auto border-t border-slate-100 px-2 py-2">
                    {loading ? (
                        <div className="space-y-2 p-2">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="h-12 animate-pulse rounded-lg bg-slate-100" />
                            ))}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="px-3 py-8 text-center text-[12.5px] text-slate-400">
                            {t('home.upcoming.empty', { defaultValue: 'Yaklaşan randevu bulunmuyor.' })}
                        </div>
                    ) : (
                        <ul className="space-y-0.5">
                            {items.map((item) => {
                                const meta = CATEGORY_META[item.category];
                                const Icon = meta.icon;
                                return (
                                    <li key={item.id}>
                                        <button
                                            type="button"
                                            onClick={() => item.navigateTo && navigate(item.navigateTo)}
                                            className="flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-slate-50"
                                        >
                                            <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${meta.badge}`}>
                                                <Icon size={15} />
                                            </span>
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center gap-1.5">
                                                    <span className="truncate text-[13px] font-semibold text-slate-900">{item.title}</span>
                                                </span>
                                                <span className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-slate-400">
                                                    <span className={`inline-block size-1.5 rounded-full ${meta.dot}`} />
                                                    <span>{t(meta.labelKey, { defaultValue: meta.defaultLabel })}</span>
                                                    {item.subtitle && <span className="truncate">· {item.subtitle}</span>}
                                                </span>
                                            </span>
                                            <span className="shrink-0 text-right">
                                                <span className="block text-[11.5px] font-semibold text-slate-600">{relativeLabel(item.date)}</span>
                                                <span className="block text-[11px] text-slate-400">{item.date.format('DD MMM HH:mm')}</span>
                                            </span>
                                        </button>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </div>
            )}
        </div>
    );
};

export default UpcomingAppointments;
