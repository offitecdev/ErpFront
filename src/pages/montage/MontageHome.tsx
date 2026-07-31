import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Bell01, Calendar, CheckCircle, ChevronRight, Clipboard, Wrench } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { notificationApi, type NotificationDto } from '@/lib/api/notifications';
import { useAuthStore } from '@/store/authStore';

import { dateFmt } from './utils/montageFormat';

const TILES = [
    { to: '/montage/orders/active', icon: Wrench, labelKey: 'montage.home.active' },
    { to: '/montage/orders/completed', icon: CheckCircle, labelKey: 'montage.home.completed' },
    { to: '/montage/reports', icon: Clipboard, labelKey: 'montage.home.reports' },
    { to: '/calendar', icon: Calendar, labelKey: 'montage.home.calendar' },
] as const;

/**
 * Entry screen, quote-design style: the shortcuts are a COMPACT tile block on
 * the right (no longer four huge centered color slabs) — white cards, navy
 * icon chips, thin borders. The left/main area is reserved for the upcoming
 * notification feed and shows a quiet placeholder card until it lands.
 */
export const MontageHome = () => {
    const navigate = useNavigate();
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId);
    const userId = useAuthStore((state) => state.user?.id);
    const [notifications, setNotifications] = useState<NotificationDto[]>([]);
    const [loadingNotifications, setLoadingNotifications] = useState(true);

    useEffect(() => {
        if (!selectedTenantId || !userId) return;
        let cancelled = false;
        let firstLoad = true;
        const load = () => {
            if (firstLoad) setLoadingNotifications(true);
            void notificationApi.list({ limit: 12 })
                .then((rows) => {
                    if (!cancelled) setNotifications(rows);
                })
                .catch(() => {
                    if (!cancelled && firstLoad) setNotifications([]);
                })
                .finally(() => {
                    if (!cancelled && firstLoad) setLoadingNotifications(false);
                    firstLoad = false;
                });
        };
        load();
        const timer = window.setInterval(load, 30_000);
        return () => {
            cancelled = true;
            window.clearInterval(timer);
        };
    }, [selectedTenantId, userId]);

    const openNotification = async (notification: NotificationDto) => {
        if (!notification.isRead) {
            setNotifications((rows) => rows.map((row) => row.id === notification.id ? { ...row, isRead: true } : row));
            await notificationApi.markRead(notification.id).catch(() => undefined);
        }
        const metadata = (notification.metadata || {}) as {
            signatureRequestId?: string;
            reportType?: 'FIELD' | 'DELIVERY' | 'GENERAL';
            reportId?: string;
        };
        if (metadata.reportType === 'GENERAL' && metadata.signatureRequestId) {
            navigate(`/montage/reports/view/general/${metadata.signatureRequestId}`);
        } else if (metadata.reportType === 'FIELD' && metadata.reportId) {
            navigate(`/montage/reports/view/field/${metadata.reportId}`);
        } else if (metadata.reportType === 'DELIVERY' && metadata.reportId) {
            navigate(`/montage/reports/view/delivery/${metadata.reportId}`);
        } else if (notification.linkUrl) {
            navigate(notification.linkUrl);
        }
    };

    return (
        <div className="grid flex-1 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_500px]">
            {/* Main area: notifications land here; placeholder card until then. */}
            <section className="flex h-[324px] min-w-0 flex-1 flex-col overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <header className="flex items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                    <Bell01 size={14} className="text-[#1f2654] dark:text-slate-200" />
                    <span className="text-[12.5px] font-semibold text-[#1f2654] dark:text-slate-100">{t('montage.home.notifications')}</span>
                </header>
                {loadingNotifications ? (
                    <div className="flex flex-1 items-center justify-center gap-2 text-[13px] text-slate-400">
                        <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                        {t('common.loading')}
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-6 py-10 text-center text-[14px] text-slate-400 dark:text-slate-500">
                        {t('montage.home.notificationsEmpty')}
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {notifications.map((notification) => (
                            <button
                                key={notification.id}
                                type="button"
                                onClick={() => void openNotification(notification)}
                                className="flex w-full items-center gap-3 border-b border-slate-100 px-3 py-2.5 text-left transition-colors hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5"
                            >
                                <span className={`size-2 shrink-0 rounded-full ${notification.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-[#d30f15] dark:bg-amber-500'}`} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[12.5px] font-semibold text-slate-800 dark:text-slate-100">{notification.title}</span>
                                    <span className="block truncate text-[11.5px] text-slate-500 dark:text-slate-400">{notification.message}</span>
                                </span>
                                <span className="shrink-0 text-[10.5px] text-slate-400">{dateFmt(notification.createdAt)}</span>
                                {notification.linkUrl && <ChevronRight size={15} className="shrink-0 text-slate-400" />}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            {/* Right: compact one-tap shortcuts (a notch larger than v2 — the
                first shrink overshot). */}
            <div className="grid h-[324px] w-full grid-cols-2 grid-rows-2 gap-3">
                {TILES.map(({ to, icon: Icon, labelKey }) => (
                    <button
                        key={to}
                        type="button"
                        onClick={() => navigate(to)}
                        className="flex h-full flex-col items-center justify-center gap-3 rounded-[3px] border border-slate-300 bg-white px-4 transition-colors hover:border-[#1f2654] hover:bg-slate-50 active:bg-slate-100 dark:border-white/15 dark:bg-[#17191c] dark:hover:bg-white/5"
                    >
                        <span className="grid size-11 place-items-center rounded-[3px] bg-[#d30f15] text-white dark:bg-amber-500">
                            <Icon size={22} />
                        </span>
                        <span className="text-center text-[15px] font-semibold leading-tight text-slate-800 dark:text-slate-100">{t(labelKey)}</span>
                    </button>
                ))}
            </div>
        </div>
    );
};
