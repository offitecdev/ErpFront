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
                   amber/altın vurgu kaldırıldı, nötr gri kullanılır. Sayı
                   sıfırdan büyükse yalnızca koyulaşır — vurgu rengi yok. */
                className="ofi-prj-bell"
            >
                <Bell01 size={14} />
                <span>{t('projects.detail.notifications')}</span>
                <span className={`ofi-prj-bell__count ${items.length > 0 ? 'is-hot' : ''}`}>{items.length}</span>
            </button>

            {open && items.length > 0 && createPortal(
                <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex justify-center p-4">
                    <div className="ofi-rise-in ofi-prj-notes">
                        <header className="ofi-prj-notes__head">
                            <span className="flex items-center gap-2">
                                <Bell01 size={14} />
                                {t('projects.detail.notifications')}
                                <span className="ofi-prj-bell__count is-hot">{items.length}</span>
                            </span>
                            <button
                                type="button"
                                aria-label={t('projects.detail.dismiss')}
                                onClick={() => setOpen(false)}
                                className="ofi-prj-glyph"
                            >
                                <X size={15} />
                            </button>
                        </header>

                        {/* One line per notification, stacked — the whole list in one window. */}
                        <ul className="ofi-prj-notes__list">
                            {items.map((item) => (
                                <li key={item.key}>
                                    <button
                                        type="button"
                                        onClick={() => { setOpen(false); item.onOpen(); }}
                                        className="ofi-prj-notes__row"
                                    >
                                        <span className={`ofi-prj-notes__mark ${item.critical ? 'is-critical' : ''}`}>
                                            {item.icon}
                                        </span>
                                        <span className="min-w-0 flex-1">
                                            <span className="ofi-prj-cut ofi-prj-strong text-[12.5px]">{item.title}</span>
                                            <span className="ofi-prj-sub ofi-prj-cut">
                                                {item.tag}{item.subtitle ? ` · ${item.subtitle}` : ''}
                                            </span>
                                        </span>
                                        <ChevronRight size={15} className="ofi-prj-arrow" />
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
