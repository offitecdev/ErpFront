import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
    AlertCircle,
    Bell01,
    BellRinging,
    ChevronRight,
    Edit01,
    FileCheck02,
    ListChecks,
    Users01,
    Wrench,
    X,
} from '@/components/icons/antIconCompat';
import type { NotificationDto } from '@/lib/api/notifications';
import { notificationText } from '@/lib/notificationText';
import { SkeletonBar } from '@/components/ui-shared/Loader';

/**
 * Die Mitteilungszentrale — das Fenster unter der Glocke (10.09.2026).
 *
 * Vorgabe Samet: «Beim Klick grösser, iOS-sauber, macOS / SwiftUI, von
 * Grund auf neu.» Bis hierher war es ein 280px-Seitenpanel mit Schleier
 * (SlidePanel). Jetzt: eine 420px-Karte, die unter der Glocke aufgeht wie
 * die Mitteilungszentrale des Mac — 16px-Kante, EINE Haarlinie, Grosstitel,
 * Tagesgruppen (Heute / Gestern / Früher), je Meldung ein farbiges
 * Symbolquadrat nach Art, Titel, Text, relative Zeit und ein Pfeil, wenn die
 * Zeile irgendwohin führt. Ungelesen = blauer Punkt am Symbol.
 *
 * Kein Schleier: ein Klick daneben oder Escape schliesst. Kleid in
 * styles/notifications.css (`.ofi-nc-*`); die Karte hängt in einem Portal an
 * <body>, darum tragen die Knopfregeln dort den Portal-Zwilling.
 */

interface NotificationCenterProps {
    open: boolean;
    onClose: () => void;
    notifications: NotificationDto[];
    loading: boolean;
    locale: string;
    onMarkAllRead: () => void;
    onOpen: (notification: NotificationDto) => void;
}

type Tone = 'blue' | 'green' | 'orange' | 'red' | 'indigo' | 'teal' | 'gray';

/** Art der Meldung → Symbol + Systemfarbe des Quadrats. */
const glyphFor = (type: string): { tone: Tone; icon: React.ReactNode } => {
    const kind = (type || '').toUpperCase();
    if (kind === 'TASK_ASSIGNED') return { tone: 'blue', icon: <ListChecks size={18} /> };
    // Görevler-Modul: jede TASKS_*-Meldung trägt dasselbe Listenzeichen.
    if (kind.startsWith('TASKS_')) return { tone: 'blue', icon: <ListChecks size={18} /> };
    if (kind.includes('SIGNATURE')) return { tone: 'indigo', icon: <Edit01 size={18} /> };
    if (kind.includes('REPORT')) return { tone: 'green', icon: <FileCheck02 size={18} /> };
    if (kind.includes('MAINTENANCE') || kind.includes('INSTALLATION')) return { tone: 'orange', icon: <Wrench size={18} /> };
    if (kind.includes('STAFF') || kind.includes('LEAVE')) return { tone: 'teal', icon: <Users01 size={18} /> };
    if (kind === 'ALERT' || kind.includes('ERROR')) return { tone: 'red', icon: <AlertCircle size={18} /> };
    return { tone: 'gray', icon: <BellRinging size={18} /> };
};

const startOfDay = (date: Date): number => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

export const NotificationCenter: React.FC<NotificationCenterProps> = ({
    open,
    onClose,
    notifications,
    loading,
    locale,
    onMarkAllRead,
    onOpen,
}) => {
    const { t } = useTranslation();
    const panelRef = useRef<HTMLElement>(null);
    const titleId = useId();
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });
    // «Jetzt» wird beim Öffnen und bei jeder neuen Liste gestempelt — der
    // Render bleibt rein (kein Date.now() im Render).
    const [now, setNow] = useState(0);
    useEffect(() => {
        if (!open) return;
        const id = window.setTimeout(() => setNow(Date.now()), 0);
        return () => window.clearTimeout(id);
    }, [open, notifications]);

    useEffect(() => {
        if (!open) return;
        const previouslyFocused = document.activeElement as HTMLElement | null;
        panelRef.current?.focus();
        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onCloseRef.current();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            previouslyFocused?.focus();
        };
    }, [open]);

    /** "Jetzt" / "vor 5 Min." / "vor 3 Std." / "Gestern" / Kurzdatum. */
    const relativeTime = (iso: string): string => {
        const then = new Date(iso);
        const diffMin = Math.floor((now - then.getTime()) / 60_000);
        if (diffMin < 1) return t('notify.time.now');
        if (diffMin < 60) return t('notify.time.minutes', { count: diffMin });
        const diffH = Math.floor(diffMin / 60);
        if (diffH < 24 && startOfDay(then) === startOfDay(new Date(now))) return t('notify.time.hours', { count: diffH });
        if (startOfDay(then) === startOfDay(new Date(now)) - 86_400_000) return t('notify.time.yesterday');
        return then.toLocaleDateString(locale, { day: '2-digit', month: 'short' });
    };

    // Tagesgruppen: Heute / Gestern / Früher — die Reihenfolge der Liste
    // (neueste zuerst) bleibt innerhalb jeder Gruppe erhalten.
    const groups = useMemo(() => {
        const today = startOfDay(new Date(now));
        const yesterday = today - 86_400_000;
        const buckets: Record<'today' | 'yesterday' | 'earlier', NotificationDto[]> = { today: [], yesterday: [], earlier: [] };
        for (const row of notifications) {
            const day = startOfDay(new Date(row.createdAt));
            if (day >= today) buckets.today.push(row);
            else if (day >= yesterday) buckets.yesterday.push(row);
            else buckets.earlier.push(row);
        }
        return (['today', 'yesterday', 'earlier'] as const)
            .filter((key) => buckets[key].length > 0)
            .map((key) => ({ key, rows: buckets[key] }));
    }, [notifications, now]);

    if (!open) return null;

    const unread = notifications.filter((row) => !row.isRead).length;

    return createPortal(
        <>
            <div className="ofi-nc-scrim" onMouseDown={onClose} />
            <section
                ref={panelRef}
                role="dialog"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="ofi-nc"
            >
                <header className="ofi-nc__head">
                    <h2 id={titleId} className="ofi-nc__title">
                        {t('nav.notifications')}
                        {unread > 0 && <span className="ofi-nc__count">{unread}</span>}
                    </h2>
                    <div className="ofi-nc__tools">
                        <button
                            type="button"
                            className="ofi-nc__readall"
                            onClick={onMarkAllRead}
                            disabled={unread === 0}
                        >
                            {t('notify.center.markAllRead')}
                        </button>
                        <button
                            type="button"
                            className="ofi-nc__x"
                            onClick={onClose}
                            aria-label={t('notify.center.close')}
                        >
                            <X size={13} />
                        </button>
                    </div>
                </header>

                <div className="ofi-nc__body">
                    {loading ? (
                        <div className="ofi-nc__list">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="ofi-nc__skel">
                                    <span className="ofi-nc__skel-icon" />
                                    <div className="ofi-nc__skel-lines">
                                        <SkeletonBar width="58%" className="h-2.5 rounded-full" delayMs={index * 90} />
                                        <SkeletonBar width="86%" className="h-2 rounded-full" delayMs={index * 90 + 45} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="ofi-nc__empty">
                            <span className="ofi-nc__empty-icon" aria-hidden="true"><Bell01 size={22} /></span>
                            <p className="ofi-nc__empty-title">{t('notify.center.emptyTitle')}</p>
                            <p className="ofi-nc__empty-sub">{t('notify.center.emptySub')}</p>
                        </div>
                    ) : (
                        groups.map((group) => (
                            <section key={group.key} className="ofi-nc__group">
                                <p className="ofi-nc__group-label">{t(`notify.group.${group.key}`)}</p>
                                <div className="ofi-nc__list">
                                    {group.rows.map((notification) => {
                                        // Sprachneutrale Bausteine → Satz in der Sprache der Person.
                                        const text = notificationText(notification);
                                        const glyph = glyphFor(notification.type);
                                        return (
                                            <button
                                                key={notification.id}
                                                type="button"
                                                className={`ofi-nc__row${notification.isRead ? ' is-read' : ' is-unread'}`}
                                                onClick={() => onOpen(notification)}
                                            >
                                                <span className="ofi-nc__icon">
                                                    <span className={`ofi-ntf-app is-${glyph.tone}`} aria-hidden="true">{glyph.icon}</span>
                                                </span>
                                                <span className="ofi-nc__text">
                                                    <p className="ofi-nc__row-title">{text.title}</p>
                                                    {text.message && <p className="ofi-nc__row-msg" title={text.message}>{text.message}</p>}
                                                </span>
                                                <span className="ofi-nc__meta">
                                                    <span className="ofi-nc__time" title={new Date(notification.createdAt).toLocaleString(locale)}>
                                                        {relativeTime(notification.createdAt)}
                                                    </span>
                                                    {notification.linkUrl && (
                                                        <span className="ofi-nc__chev" aria-hidden="true"><ChevronRight size={14} /></span>
                                                    )}
                                                </span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </section>
                        ))
                    )}
                </div>
            </section>
        </>,
        document.body,
    );
};
