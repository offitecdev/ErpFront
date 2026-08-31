import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Bell01 as Bell, X as XIcon } from '@/components/icons/antIconCompat';

import { t } from '@/i18n/translate';
import { crmApi } from '@/lib/api/crm';
import { NOTIFICATIONS_CHANGED_EVENT, notificationApi } from '@/lib/api/notifications';
import { notificationText, reminderTitle } from '@/lib/notificationText';
import { useAuthStore } from '@/store/authStore';

/**
 * Der Wecker rechts oben: fällige Erinnerungen (Angebot läuft ab, Liefertermin
 * naht) und frische Ereignis-Benachrichtigungen (Montage-Rapport eingegangen,
 * Unterschrift eingegangen, …) blenden ein Fenster ein, das 15 Sekunden
 * herunterzählt und dann von selbst verschwindet. Das X schliesst sofort,
 * "Öffnen" springt zum Beleg bzw. Projekt. Mehrere Fenster stapeln sich; wird
 * der Stapel höher als der Bildschirm, bekommt er eine eigene Bildlaufleiste.
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

interface ToastItem {
    key: string;
    kind: 'reminder' | 'notification';
    id: string;
    title: string;
    subtitle: string | null;
    linkUrl: string | null;
    /** Verbleibende Sekunden bis zum automatischen Ausblenden. */
    secondsLeft: number;
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

    const dismiss = useCallback((key: string) => {
        setItems((current) => current.filter((item) => item.key !== key));
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

    // EIN Zähler für den ganzen Stapel statt einer Uhr pro Fenster.
    useEffect(() => {
        if (items.length === 0) return;
        const id = setInterval(() => {
            setItems((current) => current
                .map((item) => ({ ...item, secondsLeft: item.secondsLeft - 1 }))
                .filter((item) => item.secondsLeft > 0));
        }, 1000);
        return () => clearInterval(id);
    }, [items.length]);

    if (items.length === 0) return null;

    return (
        <div
            // Rechts, unter der Kopfzeile. Wird der Stapel höher als der Schirm,
            // rollt er in sich statt die Seite zu verlängern.
            className="pointer-events-none fixed right-4 top-20 z-[200] flex max-h-[calc(100vh-6rem)] w-[340px] max-w-[calc(100vw-2rem)] flex-col gap-2 overflow-y-auto pr-1"
            role="region"
            aria-label={t('crm.reminder.regionLabel')}
        >
            {items.map((item) => {
                const reminder = item.kind === 'reminder';
                return (
                    <div
                        key={item.key}
                        role="alert"
                        className={`ofi-rise-in pointer-events-auto shrink-0 overflow-hidden rounded-lg border bg-white shadow-lg dark:bg-slate-900 ${reminder
                            ? 'border-amber-200 dark:border-amber-500/40'
                            : 'border-sky-200 dark:border-sky-500/40'}`}
                    >
                        <div className="flex items-start gap-2.5 p-3">
                            <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md ${reminder
                                ? 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300'
                                : 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300'}`}>
                                <Bell size={14} />
                            </span>
                            <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                    <span className={`text-[11px] font-semibold uppercase tracking-wide ${reminder
                                        ? 'text-amber-600 dark:text-amber-300'
                                        : 'text-sky-600 dark:text-sky-300'}`}>
                                        {reminder ? t('crm.reminder.badge') : t('notify.badge')}
                                    </span>
                                    {/* Sichtbarer Countdown — man sieht, wie lange das
                                        Fenster noch steht, statt es raten zu müssen. */}
                                    <span className="font-mono text-[11px] tabular-nums text-slate-400">
                                        {item.secondsLeft}s
                                    </span>
                                </div>
                                <div className="mt-0.5 break-words text-[13px] font-semibold text-slate-900 dark:text-white">
                                    {item.title}
                                </div>
                                {item.subtitle && (
                                    <div className="mt-0.5 break-words text-[11.5px] text-slate-500 dark:text-white/60">
                                        {item.subtitle}
                                    </div>
                                )}
                                {/* "Öffnen" — direkt zum Beleg bzw. Projekt. */}
                                {item.linkUrl && (
                                    <button
                                        type="button"
                                        onClick={() => open(item)}
                                        className="mt-1.5 inline-flex items-center gap-1 text-[12px] font-semibold text-[#1f2654] underline-offset-2 hover:underline dark:text-sky-300"
                                    >
                                        {reminder ? t('crm.reminder.open') : t('notify.open')}
                                        <ArrowRight size={11} />
                                    </button>
                                )}
                            </div>
                            <button
                                type="button"
                                onClick={() => close(item)}
                                aria-label={reminder ? t('crm.reminders.dismiss') : t('common.close')}
                                title={reminder ? t('crm.reminders.dismiss') : t('common.close')}
                                className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-white/10 dark:hover:text-white"
                            >
                                <XIcon size={13} />
                            </button>
                        </div>
                        {/* Der Balken läuft die verbleibenden Sekunden ab. */}
                        <div className={`h-1 w-full ${reminder ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-sky-100 dark:bg-sky-500/20'}`}>
                            <div
                                className={`h-full transition-[width] duration-1000 ease-linear ${reminder ? 'bg-amber-500' : 'bg-sky-500'}`}
                                style={{ width: `${(item.secondsLeft / VISIBLE_SECONDS) * 100}%` }}
                            />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
