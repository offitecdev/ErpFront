import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
    Calendar as CalendarIcon,
    ChevronDown,
    Clipboard,
    Truck01,
    Users01,
    XClose,
} from '@/components/icons/antIconCompat';
import { cx } from '../../lib/utils/cx';
import { projectApi } from '../../lib/api/project';
import { meetingApi } from '../../lib/api/meetings';
import { logisticsApi } from '../../lib/api/logistics';
import { useAuthStore } from '../../store/authStore';
import { useModuleAccess } from '../../lib/useEnabledModules';
import { SkeletonBar } from '../ui-shared/Loader';

const SURFACE =
    'rounded-2xl border border-[#E3E7F0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)] dark:border-white/10 dark:bg-[#151616]';

type UpcomingKey = 'installations' | 'meetings' | 'deliveries';

type WeekItem = {
    id: string;
    client: string;
    date: dayjs.Dayjs;
    /** Shipments often carry only a date — then the row shows the date, no clock. */
    hasTime: boolean;
    navigateTo: string;
};

// Assigned technicians (lead or co-technician) open their own installation
// task screen even if they also hold manager permissions.
const isAssignedTechnician = (appt: any, userId?: string | null) =>
    Boolean(userId) && (
        appt.assignedTechnician?.id === userId ||
        (appt.technicianAssignments || []).some((a: any) => a?.technician?.id === userId)
    );

const ORDER: UpcomingKey[] = ['installations', 'meetings', 'deliveries'];

const CARD_META: Record<UpcomingKey, { icon: React.ComponentType<any>; badge: string }> = {
    installations: { icon: Clipboard, badge: 'bg-violet-50 text-violet-600 dark:bg-violet-400/10 dark:text-violet-300' },
    meetings: { icon: Users01, badge: 'bg-blue-50 text-blue-600 dark:bg-blue-400/10 dark:text-blue-300' },
    deliveries: { icon: Truck01, badge: 'bg-amber-50 text-amber-600 dark:bg-amber-400/10 dark:text-amber-300' },
};

/**
 * "Anstehend" — the card stack under the analog clock. One card per category
 * (Montagen · Besprechungen · Lieferungen), each with its tinted icon; hovering
 * shifts the card to the accent colour, clicking opens the category's pop-up
 * right below the card (rise-in, same surface as the calendar pop-ups). Several
 * can be open at once; a pop-up closes via its centered ✕ or a second click on
 * the card. Content is the coming week: client, day and time per entry.
 */
export const UpcomingSection: React.FC = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const permissions = useAuthStore((state) => state.permissions);
    const userId = useAuthStore((state) => state.user?.id);
    const { isModuleEnabled } = useModuleAccess();

    const [open, setOpen] = useState<Set<UpcomingKey>>(new Set());
    const [data, setData] = useState<Partial<Record<UpcomingKey, WeekItem[]>>>({});
    const [loadingKeys, setLoadingKeys] = useState<Set<UpcomingKey>>(new Set());

    const has = (perm: string) => permissions.includes(perm);
    const canInstallations = isModuleEnabled('projects')
        && (has('projects.view') || has('projects.manage') || has('projects.report'));
    const canDeliveries = isModuleEnabled('logistics') && has('logistics.view');
    const available = ORDER.filter((key) =>
        key === 'installations' ? canInstallations : key === 'deliveries' ? canDeliveries : true,
    );

    const labels: Record<UpcomingKey, string> = {
        installations: t('dash.upcoming.installations', { defaultValue: 'Montagen' }),
        meetings: t('dash.upcoming.meetings', { defaultValue: 'Besprechungen' }),
        deliveries: t('dash.upcoming.deliveries', { defaultValue: 'Lieferungen' }),
    };

    const loadCategory = useCallback(async (key: UpcomingKey): Promise<WeekItem[]> => {
        const today = dayjs().startOf('day');
        const start = today.format('YYYY-MM-DD');
        const endDay = today.add(6, 'day').endOf('day');
        const end = endDay.format('YYYY-MM-DD');
        const inWeek = (d: dayjs.Dayjs) => !d.isBefore(today) && !d.isAfter(endDay);

        if (key === 'installations') {
            const canAll = has('projects.view') || has('projects.manage');
            const rows = await (canAll
                ? projectApi.listAppointments(start, end, { calendar: true })
                : projectApi.listMyInstallations(start, end, { calendar: true }));
            return (rows as any[]).map((appt) => ({
                id: appt.id,
                client: appt.project?.customer?.companyName
                    || (appt.salesOrder?.orderNumber ? `#${appt.salesOrder.orderNumber}` : labels.installations),
                date: dayjs(appt.startTime),
                hasTime: true,
                navigateTo: isAssignedTechnician(appt, userId)
                    ? `/projects/installation/tasks/${appt.id}`
                    : canAll && appt.project?.id
                        ? `/projects/${appt.project.id}`
                        : `/projects/installation/tasks/${appt.id}`,
            })).filter((item) => inWeek(item.date));
        }
        if (key === 'meetings') {
            const rows = await meetingApi.list(start, end);
            return rows
                .filter((m) => m.kind === 'MEETING')
                .map((m) => ({
                    id: m.id,
                    client: m.customer?.companyName || m.title,
                    date: dayjs(m.startTime),
                    hasTime: true,
                    navigateTo: '/calendar',
                }))
                .filter((item) => inWeek(item.date));
        }
        const shipments = await logisticsApi.list();
        return shipments
            .filter((s) => s.shipmentDate)
            .map((s) => ({
                id: s.id,
                client: s.customer?.companyName || labels.deliveries,
                date: dayjs(s.shipmentDate as string),
                hasTime: false,
                navigateTo: '/logistics/shipments',
            }))
            .filter((item) => inWeek(item.date));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [permissions, userId, t]);

    const openPopup = (key: UpcomingKey) => {
        setOpen((cur) => (cur.has(key) ? cur : new Set(cur).add(key)));
        if (data[key] === undefined && !loadingKeys.has(key)) {
            setLoadingKeys((cur) => new Set(cur).add(key));
            loadCategory(key)
                .catch(() => [] as WeekItem[])
                .then((items) => {
                    items.sort((a, b) => a.date.valueOf() - b.date.valueOf());
                    setData((cur) => ({ ...cur, [key]: items.slice(0, 8) }));
                    setLoadingKeys((cur) => {
                        const next = new Set(cur);
                        next.delete(key);
                        return next;
                    });
                });
        }
    };

    const closePopup = (key: UpcomingKey) => {
        setOpen((cur) => {
            const next = new Set(cur);
            next.delete(key);
            return next;
        });
    };

    if (available.length === 0) return null;

    return (
        <section>
            <div className="mb-3 flex items-center gap-2">
                <CalendarIcon size={15} className="text-slate-400 dark:text-[#e8873a]" />
                <h2 className="text-[12px] font-semibold uppercase tracking-wider text-slate-500 dark:text-[#8f95a1]">
                    {t('dash.upcoming.title', { defaultValue: 'Anstehend' })}
                </h2>
            </div>

            <div className="space-y-3">
                {available.map((key) => {
                    const meta = CARD_META[key];
                    const Icon = meta.icon;
                    const isOpen = open.has(key);
                    const items = data[key];
                    return (
                        <div key={key}>
                            <button
                                type="button"
                                onClick={() => (isOpen ? closePopup(key) : openPopup(key))}
                                aria-expanded={isOpen}
                                className={cx(
                                    'group flex w-full items-center gap-3 rounded-2xl border bg-white p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-all duration-150 dark:bg-[#151616]',
                                    isOpen
                                        ? 'border-[#6977c7] dark:border-[#e8873a]'
                                        : 'border-[#E3E7F0] hover:border-[#6977c7] hover:shadow-[0_4px_12px_rgba(39,47,103,0.10)] dark:border-white/10 dark:hover:border-[#e8873a]',
                                )}
                            >
                                <span
                                    className={cx(
                                        'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                                        isOpen
                                            ? 'bg-[#6977c7] text-white dark:bg-[#e8873a] dark:text-[#16130f]'
                                            : cx(meta.badge, 'group-hover:bg-[#6977c7] group-hover:text-white dark:group-hover:bg-[#e8873a] dark:group-hover:text-[#16130f]'),
                                    )}
                                >
                                    <Icon size={17} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span
                                        className={cx(
                                            'block truncate text-[13.5px] font-semibold transition-colors',
                                            isOpen
                                                ? 'text-[#6977c7] dark:text-[#e8873a]'
                                                : 'text-[#1A1A1A] group-hover:text-[#6977c7] dark:text-white dark:group-hover:text-[#e8873a]',
                                        )}
                                    >
                                        {labels[key]}
                                    </span>
                                    <span className="mt-0.5 block text-[11.5px] text-[#98A0AE] dark:text-[#8f95a1]">
                                        {t('dash.upcoming.week', { defaultValue: 'Diese Woche' })}
                                    </span>
                                </span>
                                <ChevronDown
                                    size={16}
                                    className={cx('shrink-0 text-slate-400 transition-transform duration-150', isOpen && 'rotate-180')}
                                />
                            </button>

                            {isOpen && (
                                <div className={cx(SURFACE, 'ofi-rise-in mt-2 p-4 pt-2')}>
                                    {/* The centered ✕ — the pop-up's own way out. */}
                                    <button
                                        type="button"
                                        onClick={() => closePopup(key)}
                                        aria-label={t('dash.upcoming.close', { defaultValue: 'Schliessen' })}
                                        className="mx-auto flex size-7 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-black/5 hover:text-[#1A1A1A] dark:hover:bg-white/10 dark:hover:text-white"
                                    >
                                        <XClose size={16} />
                                    </button>
                                    <p className="mt-0.5 text-center text-[12.5px] font-semibold text-[#1A1A1A] dark:text-white">
                                        {labels[key]}
                                        <span className="ml-1.5 font-normal text-[#98A0AE]">
                                            {t('dash.upcoming.thisWeek', { defaultValue: 'diese Woche' })}
                                        </span>
                                    </p>
                                    {items === undefined ? (
                                        <div className="mt-3 space-y-2">
                                            <SkeletonBar className="h-8 rounded-lg" />
                                            <SkeletonBar className="h-8 rounded-lg" delayMs={120} />
                                        </div>
                                    ) : items.length === 0 ? (
                                        <p className="py-6 text-center text-[12.5px] text-[#98A0AE] dark:text-[#8f95a1]">
                                            {t('dash.upcoming.empty', { defaultValue: 'Keine Termine diese Woche.' })}
                                        </p>
                                    ) : (
                                        <ul className="mt-2 max-h-[228px] space-y-0.5 overflow-y-auto">
                                            {items.map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(item.navigateTo)}
                                                        className="group flex w-full items-baseline justify-between gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                                    >
                                                        <span className="min-w-0 truncate text-[13px] font-semibold text-[#1A1A1A] underline-offset-4 group-hover:underline dark:text-white">
                                                            {item.client}
                                                        </span>
                                                        <span className="shrink-0 text-right text-[11.5px] tabular-nums text-[#6B7280] dark:text-[#aab0bb]">
                                                            {item.date.format('dddd')}
                                                            {' · '}
                                                            {item.hasTime ? item.date.format('HH:mm') : item.date.format('DD.MM.')}
                                                        </span>
                                                    </button>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </section>
    );
};
