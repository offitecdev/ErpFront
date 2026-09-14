import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import {
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

const CARD_ICON: Record<UpcomingKey, React.ComponentType<any>> = {
    installations: Clipboard,
    meetings: Users01,
    deliveries: Truck01,
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
        <section className="ofi-home-up">
            <div className="ofi-home-section__head">
                <h2 className="ofi-home-h2">{t('dash.upcoming.title', { defaultValue: 'Anstehend' })}</h2>
            </div>

            <div className="ofi-home-up__list">
                {available.map((key) => {
                    const Icon = CARD_ICON[key];
                    const isOpen = open.has(key);
                    const items = data[key];
                    return (
                        <div key={key}>
                            <button
                                type="button"
                                onClick={() => (isOpen ? closePopup(key) : openPopup(key))}
                                aria-expanded={isOpen}
                                className={cx('ofi-home-up__card', isOpen && 'is-open')}
                            >
                                <span className="ofi-home-up__icon"><Icon size={15} /></span>
                                <span className="min-w-0 flex-1">
                                    <span className="ofi-home-up__name">{labels[key]}</span>
                                    <span className="ofi-home-up__meta">{t('dash.upcoming.week', { defaultValue: 'Diese Woche' })}</span>
                                </span>
                                <ChevronDown size={15} className="ofi-home-up__chev" />
                            </button>

                            {isOpen && (
                                <div className="ofi-home-up__pop ofi-rise-in">
                                    <div className="ofi-home-up__pophead">
                                        <div className="min-w-0 truncate">
                                            {labels[key]}{' '}
                                            <span>{t('dash.upcoming.thisWeek', { defaultValue: 'diese Woche' })}</span>
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => closePopup(key)}
                                            aria-label={t('dash.upcoming.close', { defaultValue: 'Schliessen' })}
                                            className="ofi-home-up__close"
                                        >
                                            <XClose size={14} />
                                        </button>
                                    </div>
                                    {items === undefined ? (
                                        <div className="space-y-2 px-1 pb-1">
                                            <SkeletonBar className="h-7 rounded-md" />
                                            <SkeletonBar className="h-7 rounded-md" delayMs={120} />
                                        </div>
                                    ) : items.length === 0 ? (
                                        <p className="ofi-home-up__empty">
                                            {t('dash.upcoming.empty', { defaultValue: 'Keine Termine diese Woche.' })}
                                        </p>
                                    ) : (
                                        <ul className="ofi-home-up__rows">
                                            {items.map((item) => (
                                                <li key={item.id}>
                                                    <button
                                                        type="button"
                                                        onClick={() => navigate(item.navigateTo)}
                                                        className="ofi-home-up__row"
                                                    >
                                                        <span className="ofi-home-up__client">{item.client}</span>
                                                        <span className="ofi-home-up__when">
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
