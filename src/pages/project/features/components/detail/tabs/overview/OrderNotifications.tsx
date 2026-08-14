import { memo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type React from 'react';

import { Bell01, ChevronRight, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

export type OrderNotification = {
    key: string;
    critical?: boolean;
    title: string;
    tag: string;
    subtitle?: string;
    icon?: React.ReactNode;
    onOpen: () => void;
};

/**
 * The order's notifications: a bell with the count, and ONE pop-up rising from
 * the bottom of the screen that lists them all as lines stacked under each
 * other. One window, one place to look — never a separate card per item.
 *
 * It opens only when the bell is clicked, and stays until it is closed: the
 * overview should not throw a window over itself the moment it is opened.
 */
export const OrderNotifications = memo(({ items }: { items: OrderNotification[] }) => {
    const [open, setOpen] = useState(false);

    // Escape closes it, like every other overlay in the app.
    useEffect(() => {
        if (!open) return undefined;
        const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false); };
        globalThis.addEventListener('keydown', onKey);
        return () => globalThis.removeEventListener('keydown', onKey);
    }, [open]);

    return (
        <>
            <button
                type="button"
                disabled={items.length === 0}
                onClick={() => setOpen((current) => !current)}
                title={items.length > 0 ? t('projects.detail.overview.showNotifications') : t('projects.detail.overview.noNotifications')}
                aria-label={`${t('projects.detail.notifications')} (${items.length})`}
                /* Aynı ekrandaki diğer ikonlarla AYNI renk (kullanıcı isteği):
                   amber/altın vurgu kaldırıldı, nötr slate kullanılır. */
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-[12px] font-semibold transition-colors ${
                    items.length > 0
                        ? 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-[#272f67] dark:border-white/15 dark:bg-transparent dark:text-white/70 dark:hover:bg-white/10 dark:hover:text-white'
                        : 'cursor-default border-slate-200 bg-white text-slate-400 dark:border-white/15 dark:bg-transparent dark:text-white/40'
                }`}
            >
                <Bell01 size={14} />
                <span>{t('projects.detail.notifications')}</span>
                <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[11px] font-bold ${
                    items.length > 0
                        ? 'bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-white/80'
                        : 'bg-slate-100 text-slate-400 dark:bg-white/10 dark:text-white/50'
                }`}>
                    {items.length}
                </span>
            </button>

            {open && items.length > 0 && createPortal(
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-4">
                    <div className="ofi-rise-in pointer-events-auto w-full max-w-lg overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_10px_30px_rgba(16,24,40,0.18)] dark:border-white/15 dark:bg-[#1d2024]">
                        <header className="flex items-center justify-between gap-2 border-b border-slate-200 px-3.5 py-2 dark:border-white/10">
                            <span className="flex items-center gap-2 text-[12px] font-semibold text-slate-700 dark:text-white">
                                <Bell01 size={13} />
                                {t('projects.detail.notifications')}
                                <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-[#8a5f08] px-1 text-[10px] font-bold text-white dark:bg-[#e6cf9e] dark:text-black">
                                    {items.length}
                                </span>
                            </span>
                            <button
                                type="button"
                                aria-label={t('projects.detail.dismiss')}
                                onClick={() => setOpen(false)}
                                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <X size={14} />
                            </button>
                        </header>

                        {/* One line per notification, stacked — the whole list in one window. */}
                        <ul className="divide-y divide-slate-100 dark:divide-white/10">
                            {items.map((item) => (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => { setOpen(false); item.onOpen(); }}
                                        className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                                    >
                                        <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${
                                            item.critical
                                                ? 'bg-rose-500/12 text-rose-600 dark:text-rose-300'
                                                : 'bg-[#8a5f08]/10 text-[#8a5f08] dark:bg-[#e6cf9e]/12 dark:text-[#e6cf9e]'
                                        }`}>
                                            {item.icon}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-[12.5px] font-semibold text-slate-900 dark:text-white">
                                                {item.title}
                                            </span>
                                            <span className="block truncate text-[11px] text-slate-500 dark:text-white/60">
                                                {item.tag}{item.subtitle ? ` · ${item.subtitle}` : ''}
                                            </span>
                                        </span>
                                        <ChevronRight size={15} className="shrink-0 text-slate-400 dark:text-white/30" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
});
