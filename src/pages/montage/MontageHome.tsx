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
    { to: '/montage/reports', icon: Clipboard, labelKey: 'montage.myDocuments' },
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
        <div className="grid min-h-[calc(100dvh-132px)] flex-1 grid-cols-1 items-stretch gap-5 xl:h-full xl:min-h-0 xl:grid-cols-[minmax(0,1.45fr)_minmax(480px,0.8fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-6">
            {/* Tablet: primary shortcuts come first. Wide screens keep the calm
                notification stream on the left and the four actions on the right. */}
            <section className="order-last flex min-h-[360px] min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_2px_10px_rgba(15,23,42,0.05)] xl:order-first xl:min-h-0 dark:border-white/10 dark:bg-[#17191c] dark:shadow-none">
                <header className="flex min-h-16 items-center justify-between gap-3 border-b border-slate-200/80 px-5 py-3.5 dark:border-white/10">
                    <span className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-[#eef2fb] text-[#1f2654] dark:bg-amber-500/10 dark:text-amber-300">
                            <Bell01 size={19} />
                        </span>
                        <span>
                            <span className="block text-[15px] font-bold text-slate-900 dark:text-slate-50">{t('montage.home.notifications')}</span>
                            <span className="mt-0.5 block text-[11.5px] text-slate-500 dark:text-slate-400">{t('montage.home.notificationsHint')}</span>
                        </span>
                    </span>
                    {!loadingNotifications && notifications.length > 0 && (
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-bold tabular-nums text-slate-600 dark:bg-white/10 dark:text-white/65">{notifications.length}</span>
                    )}
                </header>
                {loadingNotifications ? (
                    <div className="flex flex-1 items-center justify-center gap-3 text-[14px] text-slate-400">
                        <span className="size-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                        {t('common.loading')}
                    </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-1 items-center justify-center px-8 py-12 text-center text-[15px] text-slate-400 dark:text-slate-500">
                        {t('montage.home.notificationsEmpty')}
                    </div>
                ) : (
                    <div className="min-h-0 flex-1 overflow-y-auto">
                        {notifications.map((notification) => (
                            <button
                                key={notification.id}
                                type="button"
                                onClick={() => void openNotification(notification)}
                                className="group flex min-h-[76px] w-full items-center gap-4 border-b border-slate-100 px-5 py-3.5 text-left transition-colors last:border-b-0 hover:bg-[#f8f9fa] active:bg-slate-100 dark:border-white/10 dark:hover:bg-white/5"
                            >
                                <span className={`size-2.5 shrink-0 rounded-full ${notification.isRead ? 'bg-slate-300 dark:bg-slate-600' : 'bg-[#d30f15] shadow-[0_0_0_4px_rgba(211,15,21,0.08)] dark:bg-amber-500'}`} />
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-[14px] font-semibold text-slate-900 dark:text-slate-100">{notification.title}</span>
                                    <span className="mt-1 block truncate text-[12.5px] text-slate-500 dark:text-slate-400">{notification.message}</span>
                                </span>
                                <span className="shrink-0 text-[11.5px] tabular-nums text-slate-400">{dateFmt(notification.createdAt)}</span>
                                {notification.linkUrl && <ChevronRight size={18} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#1f2654] dark:group-hover:text-amber-300" />}
                            </button>
                        ))}
                    </div>
                )}
            </section>

            <div className="order-first grid min-h-[420px] w-full grid-cols-1 gap-4 sm:grid-cols-2 sm:grid-rows-2 xl:order-last xl:min-h-0 xl:gap-5">
                {TILES.map(({ to, icon: Icon, labelKey }) => (
                    <button
                        key={to}
                        type="button"
                        onClick={() => navigate(to)}
                        className="group relative flex h-full min-h-[190px] flex-col items-start justify-between overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-[0_2px_10px_rgba(15,23,42,0.05)] transition duration-200 hover:-translate-y-0.5 hover:border-[#1f2654]/25 hover:shadow-[0_10px_28px_rgba(15,23,42,0.10)] active:translate-y-0 active:bg-slate-50 xl:min-h-0 dark:border-white/10 dark:bg-[#17191c] dark:shadow-none dark:hover:border-amber-400/30 dark:hover:bg-white/[0.04]"
                    >
                        <span className="grid size-14 place-items-center rounded-2xl bg-[#d30f15] text-white shadow-[0_6px_16px_rgba(211,15,21,0.18)] transition-transform duration-200 group-hover:scale-105 dark:bg-amber-500 dark:text-[#151616] dark:shadow-none">
                            <Icon size={26} />
                        </span>
                        <span className="flex w-full items-end justify-between gap-3">
                            <span className="max-w-[220px] text-[17px] font-bold leading-snug text-slate-900 dark:text-slate-50">{t(labelKey)}</span>
                            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-400 transition-colors group-hover:bg-[#eef2fb] group-hover:text-[#1f2654] dark:bg-white/10 dark:text-white/50 dark:group-hover:text-amber-300">
                                <ChevronRight size={18} />
                            </span>
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
};
