import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell01 as Bell, BellRinging, X as XIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { NOTIFICATIONS_CHANGED_EVENT, notificationApi } from '@/lib/api/notifications';
import { notificationText, reminderTitle } from '@/lib/notificationText';
import { useAuthStore } from '@/store/authStore';

/**
 * Der Wecker rechts oben: fällige Erinnerungen (Angebot läuft ab, Liefertermin
 * naht) und frische Ereignis-Benachrichtigungen (Montage-Rapport eingegangen,
 * Unterschrift eingegangen, …) blenden einen Mac-Banner ein, der 15 Sekunden
 * herunterzählt und dann von selbst verschwindet. Der Schliesskreis (links
 * oben, erscheint unter der Maus) schliesst sofort, «Öffnen» springt zum Beleg
 * bzw. Projekt. Mehrere Banner stapeln sich; wird der Stapel höher als der
 * Bildschirm, bekommt er eine eigene Bildlaufleiste.
 *
 * Kleid: styles/notifications.css (`.ofi-notice`) — seit 10.09.2026 das
 * macOS-Banner (Symbolquadrat, Titel, Text, Zeit, 16px-Kante).
 *
 * Erinnerungen werden SOFORT beim Einblenden gestempelt (`ackReminders`), nicht
 * erst beim Wegklicken — sonst zeigt ein zweiter Browser-Tab dieselbe noch
 * einmal. Das X SCHLIESST eine Erinnerung endgültig (`dismissReminders`): sie
 * wird gelöscht und kommt weder hier noch in der Erinnerungsliste wieder
 * (Vorgabe 15.08.2026). Läuft das Fenster nur ab, bleibt sie in der Liste
 * stehen. Benachrichtigungen bleiben ungelesen in der Glocke, bis man sie
 * öffnet.
 *
 * Text: beide Quellen liefern sprachneutrale Bausteine, der Satz entsteht hier
 * in der Sprache der Person (lib/notificationText.ts).
 */

/** Sekunden, die ein Fenster stehen bleibt. */
const VISIBLE_SECONDS = 15;
/** Takt der Abfrage. Erinnerungen sind minutengenau, öfter wäre nur Last. */
const POLL_MS = 60_000;
/** Beim ersten Blick zählen Benachrichtigungen der letzten Minuten als "frisch". */
const FIRST_LOOK_BACK_MS = 5 * 60_000;
/** Dauer der Abgangs-Animation (`ofi-ntf-out` in notifications.css). */
const LEAVE_MS = 200;

interface ToastItem {
    key: string;
    kind: 'reminder' | 'notification';
    id: string;
    title: string;
    subtitle: string | null;
    linkUrl: string | null;
    /** Verbleibende Sekunden bis zum automatischen Ausblenden. */
    secondsLeft: number;
    /** Gleitet gerade hinaus — bleibt für die Animation noch kurz im Baum. */
    leaving?: boolean;
}

export const ReminderToasts = () => {
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
    const navigate = useNavigate();
    const [items, setItems] = useState<ToastItem[]>([]);
    // Schlüssel, die in dieser Sitzung schon eingeblendet wurden — schützt gegen
    // ein doppeltes Einblenden, falls eine Abfrage vor dem Stempeln zurückkommt.
    const shownRef = useRef<Set<string>>(new Set());
    // Zeitpunkt des letzten Blicks auf die Benachrichtigungen; wird beim ersten
    // Takt gesetzt (nicht beim Rendern — der Render bleibt rein).
    const lastNotificationLookRef = useRef<string | null>(null);

    /** Erst hinausgleiten lassen, dann aus dem Baum nehmen. */
    const dismiss = useCallback((key: string) => {
        setItems((current) => current.map((item) => (item.key === key ? { ...item, leaving: true } : item)));
        window.setTimeout(() => {
            setItems((current) => current.filter((item) => item.key !== key));
        }, LEAVE_MS);
    }, []);

    /** Das X: Erinnerungen endgültig schliessen, Benachrichtigungen nur ausblenden. */
    const close = useCallback((item: ToastItem) => {
        dismiss(item.key);
        if (item.kind === 'reminder') void crmApi.dismissReminders([item.id]).catch(() => undefined);
    }, [dismiss]);

    const open = useCallback((item: ToastItem) => {
        dismiss(item.key);
        if (item.kind === 'notification') {
            void notificationApi.markRead(item.id).catch(() => undefined)
                .then(() => window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT)));
        }
        if (item.linkUrl) navigate(item.linkUrl);
    }, [dismiss, navigate]);

    // Abfrage im Takt; die erste läuft sofort.
    useEffect(() => {
        // Abgemeldet wird gar nicht erst gefragt. Aufräumen ist unnötig: mit der
        // Abmeldung verschwindet der ganze Rahmen samt diesem Wecker.
        if (!isAuthenticated) return;
        let cancelled = false;

        const push = (fresh: ToastItem[]) => {
            if (fresh.length === 0) return;
            fresh.forEach((item) => shownRef.current.add(item.key));
            setItems((current) => [...current, ...fresh]);
        };

        const pollReminders = async () => {
            const due = await crmApi.listDueReminders();
            if (cancelled) return;
            const fresh = due
                .filter((reminder) => !shownRef.current.has(`reminder:${reminder.id}`))
                .map((reminder): ToastItem => ({
                    key: `reminder:${reminder.id}`,
                    kind: 'reminder',
                    id: reminder.id,
                    title: reminderTitle(reminder),
                    subtitle: reminder.customerName,
                    linkUrl: reminder.linkUrl,
                    secondsLeft: VISIBLE_SECONDS,
                }));
            push(fresh);
            // Stempeln, sobald sie auf dem Schirm sind.
            if (fresh.length) await crmApi.ackReminders(fresh.map((item) => item.id)).catch(() => undefined);
        };

        const pollNotifications = async () => {
            const since = lastNotificationLookRef.current ?? new Date(Date.now() - FIRST_LOOK_BACK_MS).toISOString();
            const rows = await notificationApi.list({ unreadOnly: true, limit: 20, since });
            if (cancelled) return;
            lastNotificationLookRef.current = new Date().toISOString();
            const fresh = rows
                .filter((row) => !shownRef.current.has(`notification:${row.id}`))
                .map((row): ToastItem => {
                    const text = notificationText(row);
                    return {
                        key: `notification:${row.id}`,
                        kind: 'notification',
                        id: row.id,
                        title: text.title,
                        subtitle: text.message,
                        linkUrl: row.linkUrl ?? null,
                        secondsLeft: VISIBLE_SECONDS,
                    };
                });
            push(fresh);
            if (fresh.length) window.dispatchEvent(new CustomEvent(NOTIFICATIONS_CHANGED_EVENT));
        };

        const poll = async () => {
            // Ein Wecker darf nicht laut scheitern — beim nächsten Takt erneut.
            await Promise.all([
                pollReminders().catch(() => undefined),
                pollNotifications().catch(() => undefined),
            ]);
        };

        // A cancellable zero-delay start avoids React StrictMode issuing the
        // same two requests twice during its development-only effect replay.
        let intervalId: number | undefined;
        const initialPollId = window.setTimeout(() => {
            void poll();
            intervalId = window.setInterval(() => void poll(), POLL_MS);
        }, 0);
        return () => {
            cancelled = true;
            window.clearTimeout(initialPollId);
            if (intervalId !== undefined) window.clearInterval(intervalId);
        };
    }, [isAuthenticated]);

    // EIN Zähler für den ganzen Stapel statt einer Uhr pro Fenster. Abgelaufene
    // Banner gleiten hinaus wie weggeklickte.
    useEffect(() => {
        if (items.length === 0) return;
        const id = setInterval(() => {
            setItems((current) => current.map((item) => {
                if (item.leaving) return item;
                const secondsLeft = item.secondsLeft - 1;
                return { ...item, secondsLeft: Math.max(0, secondsLeft), leaving: secondsLeft <= 0 };
            }));
        }, 1000);
        return () => clearInterval(id);
    }, [items.length]);

    // Ausgelaufene Banner nach der Abgangs-Animation entfernen.
    useEffect(() => {
        const expired = items.filter((item) => item.leaving && item.secondsLeft === 0);
        if (expired.length === 0) return;
        const id = window.setTimeout(() => {
            setItems((current) => current.filter((item) => !(item.leaving && item.secondsLeft === 0)));
        }, LEAVE_MS);
        return () => window.clearTimeout(id);
    }, [items]);

    if (items.length === 0) return null;

    return (
        <div
            // Rechts oben in der Ecke, über der Kopfzeile. Wird der Stapel höher
            // als der Schirm, rollt er in sich statt die Seite zu verlängern.
            className="ofi-notice-stack"
            role="region"
            aria-label={t('crm.reminder.regionLabel')}
        >
            {items.map((item) => {
                const reminder = item.kind === 'reminder';
                return (
                    <div
                        key={item.key}
                        role="alert"
                        className={`ofi-notice${reminder ? ' is-reminder' : ' is-notification'}${item.leaving ? ' is-leaving' : ''}`}
                    >
                        {/* Der Mac-Schliesskreis auf der linken oberen Ecke. */}
                        <button
                            type="button"
                            onClick={() => close(item)}
                            aria-label={reminder ? t('crm.reminders.dismiss') : t('common.close')}
                            title={reminder ? t('crm.reminders.dismiss') : t('common.close')}
                            className="ofi-ntf-close"
                        >
                            <XIcon size={11} />
                        </button>

                        {/* Das «App-Symbol»: Erinnerung orange, Ereignis blau. */}
                        <span className={`ofi-ntf-app ${reminder ? 'is-orange' : 'is-blue'}`} aria-hidden="true">
                            {reminder ? <Bell size={18} /> : <BellRinging size={18} />}
                        </span>

                        <div className="ofi-notice__body">
                            <div className="ofi-notice__head">
                                <span className="ofi-notice__kind">
                                    {reminder ? t('crm.reminder.badge') : t('notify.badge')}
                                </span>
                                <span className="ofi-notice__time">{t('notify.time.now')}</span>
                            </div>
                            <p className="ofi-notice__title">{item.title}</p>
                            {item.subtitle && <p className="ofi-notice__text">{item.subtitle}</p>}
                            {/* «Öffnen» — direkt zum Beleg bzw. Projekt. */}
                            {item.linkUrl && (
                                <div className="ofi-notice__actions">
                                    <button type="button" onClick={() => open(item)} className="ofi-notice__open">
                                        {reminder ? t('crm.reminder.open') : t('notify.open')}
                                        <ArrowRight size={12} />
                                    </button>
                                </div>
                            )}
                        </div>

                        {/* Die Restlaufzeit als 2px-Linie am Fuss. */}
                        <div className="ofi-notice__timer" aria-hidden="true">
                            <span style={{ width: `${(item.secondsLeft / VISIBLE_SECONDS) * 100}%` }} />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
