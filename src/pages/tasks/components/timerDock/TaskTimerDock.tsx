import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import { LuPause, LuPictureInPicture2, LuPlay, LuX } from 'react-icons/lu';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { tasksApi, tasksErrorCode } from '@/lib/api/tasksModule';
import { useLanguageTick } from '@/pages/inventory/hooks/useLanguageTick';
import { useAuthStore } from '@/store/authStore';
import { useGuardedNavigate } from '@/store/navGuardStore';
import '@/styles/modules/tasksTimerDock.css';
import type { ActiveTimerInfo } from '@/types/tasksModule';
import { isTimerActionPending, useTaskTimer } from '../../hooks/useTaskTimer';
import { useTasksModuleStore } from '../../store/tasksModuleStore';
import { useTasksChanged } from '../../utils/taskEvents';
import {
    DESKTOP_HEARTBEAT_MS,
    DESKTOP_LOCK_KEY,
    DESKTOP_WINDOW_SIZE,
    clearDesktopLock,
    copyStylesInto,
    desktopOpenInOtherTab,
    desktopWindowApi,
    mirrorRootClass,
    shrinkOnNextClick,
    writeDesktopLock,
} from './desktopWindow';
import {
    MAILBOX_ACTION_MAX_AGE_MS,
    closeTimerNotification,
    drainNotificationMailbox,
    isNotificationEvent,
    notificationWorkerReady,
    phoneNotificationSupported,
    readNotifyFlag,
    showTimerNotification,
    writeNotifyFlag,
    type NotificationEvent,
} from './phoneNotification';
import {
    applyActiveTimer,
    closeRecord,
    nearestPlace,
    parseRecord,
    readPlace,
    readRecord,
    recordKey,
    sameRun,
    writePlace,
    writeRecord,
    type DockPlace,
    type TimerDockRecord,
} from './timerDockRecord';

/**
 * ── ÇALIŞAN GÖREV — das kleine Fenster unten ────────────────────────────────
 *
 * 15.09.2026 (Samet): «macOS SwiftUI tarzında küçük bir modal; bir görev
 * başlayınca otomatik altta çıksın; masaüstünde de mobilde de, uygulama
 * kapanıp açılınca da hep orada olsun; ben kapatırsam çarpıyla kapansın.
 * Çalışan görevin adı, durdur/başlat düğmesi, çalışıyor/durduruldu — çok
 * kolay ve her yerden erişilebilir.» Dann: «sadece uygulama değil masaüstünde
 * de». Dann: «işarete basınca açılsın, direkt değil; o kadar büyük açılmasın;
 * bu özellik mobil görünümde de olsun».
 *
 *   Öffnen      jeder Start: Liste, Detail, dieses Fenster, ein anderer Tab,
 *               ein anderes Gerät — erkannt an der Startzeit der Messung.
 *   Inhalt      Titel (Klick → Aufgabe), «Çalışıyor»/«Durduruldu», EIN Knopf
 *               Durdur/Başlat, ⧉, ×. Keine Uhr (14.09.2026: «kronometre olmayacak»).
 *   Bleiben     nach Durdur steht es mit «Durduruldu» weiter da; nach dem
 *               Neuladen und in jedem Tab wieder (timerDockRecord.ts).
 *   Schliessen  nur ×, und nur bis zum nächsten Start.
 *   Ort         unten rechts; Ziehen rastet links/Mitte/rechts ein (gemerkt).
 *               Telefon: volle Breite unten.
 *   ⧉           NUR auf Knopfdruck, nie von selbst:
 *               • Chrome/Edge (auch schmales Fenster): dasselbe Fenster als
 *                 kleines Picture-in-Picture über allen Programmen
 *                 (desktopWindow.ts); solange es steht, ist das Fenster in der
 *                 App ausgeblendet.
 *               • Telefon: die Aufgabe in der Mitteilungsleiste, mit Durdur/
 *                 Başlat/Kapat, auch wenn die App zu ist (phoneNotification.ts).
 *
 * Start/Pause laufen über useTaskTimer — dieselbe Warteschlange und derselbe
 * Store wie Liste und Detail, darum wechseln alle Anzeigen im selben Klick.
 * Ausserhalb des Moduls lädt niemand den Store; das Fenster fragt darum selbst
 * `/tasks/timer/active` (ungecacht, firmenübergreifend): beim Öffnen, beim
 * Zurückkehren in den Tab und jede Minute, solange es sichtbar ist.
 *
 * Hängt am Rahmen (MainLayout), nicht in der rechten Hälfte der geteilten Ansicht.
 */

const POLL_MS = 60_000;
const MIN_GAP_MS = 5_000;
/** So lange wartet das erste Bild auf die frische Antwort — danach zeigt es das Gedächtnis. */
const FIRST_ANSWER_WAIT_MS = 1_200;
const LEAVE_MS = 180;
const DRAG_THRESHOLD_PX = 6;
const PHONE_QUERY = '(max-width: 640px)';
/**
 * Diese Antworten auf «Başlat» heissen: an dieser Aufgabe wird nicht mehr
 * gemessen — das Fenster geht weg. «Nicht gefunden/nicht sichtbar» nur, wenn
 * die Aufgabe sicher zur ausgewählten Firma gehört (sonst liegt sie bloss in
 * einer anderen Firma).
 */
const GONE_ALWAYS = new Set(['TIMER_NOT_ALLOWED']);
const GONE_IN_OWN_COMPANY = new Set(['TASK_NOT_FOUND', 'TASK_FORBIDDEN']);

type TasksState = ReturnType<typeof useTasksModuleStore.getState>;
type CardVariant = 'inline' | 'desktop';

const httpStatus = (error: unknown): number =>
    Number((error as { response?: { status?: unknown } })?.response?.status ?? 0);

const sameActive = (current: ActiveTimerInfo | null, incoming: ActiveTimerInfo | null): boolean => {
    if (!current || !incoming) return current === incoming;
    return current.taskId === incoming.taskId
        && sameRun(current.startedAt, incoming.startedAt)
        && (!incoming.taskTitle || current.taskTitle === incoming.taskTitle)
        // Ausserhalb des Moduls kennt der Klick die Firma nicht — der Server nennt sie.
        && (!incoming.tenantId || current.tenantId === incoming.tenantId);
};

/** Die Aufgabe gehört zur ausgewählten Firma (oder es ist nicht bekannt) — nur dann Link und Başlat. */
const isLinkable = (record: TimerDockRecord, selectedTenantId: string): boolean =>
    !record.tenantId || !selectedTenantId || record.tenantId === selectedTenantId;

const selectedTenant = (): string => useAuthStore.getState().selectedTenantId ?? '';

/** Vom losgelassenen Ort weich an den Einrastplatz gleiten (FLIP). */
const settleFrom = (node: HTMLElement, from: DOMRect): void => {
    node.style.transition = 'none';
    node.style.transform = '';
    const to = node.getBoundingClientRect();
    node.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px)`;
    void node.offsetWidth;
    node.classList.remove('is-dragging');
    node.style.transition = '';
    node.style.transform = '';
};

export const TaskTimerDock = () => {
    useLanguageTick();
    const userId = useAuthStore((state) => state.user?.id ?? '');
    const selectedTenantId = useAuthStore((state) => state.selectedTenantId ?? '');
    const navigate = useGuardedNavigate();
    const { start, pause } = useTaskTimer();

    const [record, setRecord] = useState<TimerDockRecord | null>(() => readRecord(userId));
    const [ghost, setGhost] = useState<TimerDockRecord | null>(null);
    const [ready, setReady] = useState(() => useTasksModuleStore.getState().activeTimerKnown);
    const [blocked, setBlocked] = useState(false);
    const [place, setPlace] = useState<DockPlace>(readPlace);
    const [desktop, setDesktop] = useState<{ win: Window; host: HTMLElement } | null>(null);
    const [desktopElsewhere, setDesktopElsewhere] = useState(desktopOpenInOtherTab);
    const [phoneSupported] = useState(phoneNotificationSupported);
    const [notifyOn, setNotifyOn] = useState(() => phoneSupported && readNotifyFlag());
    const [mailboxRead, setMailboxRead] = useState(() => !phoneSupported);
    const [notifyNonce, setNotifyNonce] = useState(0);

    const userIdRef = useRef(userId);
    const recordRef = useRef(record);
    const blockedRef = useRef(false);
    const inFlightRef = useRef(false);
    const recheckRef = useRef(false);
    const lastCheckRef = useRef(0);
    const dockRef = useRef<HTMLElement | null>(null);
    const dragRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
    const suppressClickRef = useRef(false);
    const settleFromRef = useRef<DOMRect | null>(null);
    const desktopRef = useRef<Window | null>(null);
    const openingDesktopRef = useRef(false);

    const commit = useCallback((next: TimerDockRecord | null) => {
        if (next === recordRef.current) return;
        recordRef.current = next;
        writeRecord(userIdRef.current, next);
        setRecord(next);
    }, []);

    const setNotify = useCallback((on: boolean) => {
        writeNotifyFlag(on);
        setNotifyOn(on);
    }, []);

    /* ── ⧉ auf dem Desktop: kleines Picture-in-Picture-Fenster ── */
    const openDesktop = useCallback(async (): Promise<void> => {
        const api = desktopWindowApi();
        // Ein fremdes Bild-im-Bild dieser Seite (z. B. ein Video) wird nicht übernommen.
        if (!api || api.window || desktopRef.current || openingDesktopRef.current || desktopOpenInOtherTab()) return;
        openingDesktopRef.current = true;
        let win: Window;
        try {
            win = await api.requestWindow({ ...DESKTOP_WINDOW_SIZE });
        } catch {
            return; // vom Browser verweigert — das Fenster in der App bleibt
        } finally {
            openingDesktopRef.current = false;
        }
        const doc = win.document;
        copyStylesInto(doc);
        const stopMirror = mirrorRootClass(doc);
        doc.title = t('tasksModule.dock.label');
        doc.body.className = 'ofi-tdock-desktopbody';
        const host = doc.createElement('div');
        host.className = 'ofi-tdock-desktophost';
        doc.body.append(host);
        desktopRef.current = win;
        writeDesktopLock();
        const heartbeat = window.setInterval(writeDesktopLock, DESKTOP_HEARTBEAT_MS);
        const stopShrink = shrinkOnNextClick(win);
        win.addEventListener('pagehide', () => {
            window.clearInterval(heartbeat);
            stopMirror();
            stopShrink();
            if (desktopRef.current === win) desktopRef.current = null;
            clearDesktopLock();
            setDesktop((current) => (current?.win === win ? null : current));
        }, { once: true });
        setDesktop({ win, host });
    }, []);

    const closeDesktop = useCallback(() => {
        desktopRef.current?.close();
    }, []);

    // Eine andere Person am selben Gerät hat ihr eigenes Gedächtnis.
    useEffect(() => {
        if (userIdRef.current === userId) return;
        userIdRef.current = userId;
        const next = readRecord(userId);
        recordRef.current = next;
        setRecord(next);
    }, [userId]);

    /* Jede Änderung der eigenen Messung im Store — Klick hier, in der Liste, im
       Detail oder eine frische Antwort — landet im Gedächtnis. Ein nur GEMERKTER
       Stand (activeTimerKnown = false) zählt nicht: er kann alt sein. */
    useEffect(() => {
        if (!userId) return undefined;
        const apply = (state: TasksState) => {
            if (state.activeTimerKnown) commit(applyActiveTimer(recordRef.current, state.activeTimer, Date.now()));
        };
        apply(useTasksModuleStore.getState());
        return useTasksModuleStore.subscribe((state, previous) => {
            if (state.activeTimer !== previous.activeTimer || state.activeTimerKnown !== previous.activeTimerKnown) apply(state);
        });
    }, [userId, commit]);

    /* Den Server fragen. Hat ein Klick die Antwort überholt, entscheidet dessen
       eigene Antwort; wer während einer laufenden Frage ausdrücklich fragt
       (nach einem Klick), bekommt gleich danach eine zweite. */
    const check = useCallback(async (force = false): Promise<void> => {
        if (!userIdRef.current || blockedRef.current) return;
        if (inFlightRef.current) {
            if (force) recheckRef.current = true;
            return;
        }
        // Ein minimierter Browser ist «hidden» — steht das Desktop-Fenster, wird trotzdem gefragt.
        const unseen = document.hidden && !desktopRef.current;
        if (!force && (unseen || Date.now() - lastCheckRef.current < MIN_GAP_MS)) return;
        inFlightRef.current = true;
        try {
            do {
                recheckRef.current = false;
                if (isTimerActionPending()) break;
                lastCheckRef.current = Date.now();
                const before = useTasksModuleStore.getState().activeTimer;
                try {
                    const { active, serverNow } = await tasksApi.activeTimer();
                    const store = useTasksModuleStore.getState();
                    store.noteServerNow(serverNow, true);
                    if (!isTimerActionPending() && store.activeTimer === before
                        && (!store.activeTimerKnown || !sameActive(store.activeTimer ?? null, active))) {
                        store.setActiveTimer(active);
                    }
                } catch (failure) {
                    const status = httpStatus(failure);
                    // Kein Modul in dieser Firma / kein Zugang: nicht mehr fragen, nichts zeigen.
                    if (status === 403 || status === 404) {
                        blockedRef.current = true;
                        setBlocked(true);
                    }
                }
            } while (recheckRef.current && !blockedRef.current);
        } finally {
            inFlightRef.current = false;
            setReady(true);
        }
    }, []);

    // Öffnen, andere Firma, zurück im Tab, wieder online.
    useEffect(() => {
        if (!userId) return undefined;
        blockedRef.current = false;
        setBlocked(false);
        void check(true);
        const wait = window.setTimeout(() => setReady(true), FIRST_ANSWER_WAIT_MS);
        const onVisible = () => {
            if (!document.hidden) void check();
        };
        const onOnline = () => {
            void check(true);
        };
        document.addEventListener('visibilitychange', onVisible);
        window.addEventListener('focus', onVisible);
        window.addEventListener('online', onOnline);
        return () => {
            window.clearTimeout(wait);
            document.removeEventListener('visibilitychange', onVisible);
            window.removeEventListener('focus', onVisible);
            window.removeEventListener('online', onOnline);
        };
    }, [userId, selectedTenantId, check]);

    // Solange das Fenster steht: jede Minute (Pause oder Start auf einem anderen Gerät).
    const open = Boolean(record && !record.closed);
    useEffect(() => {
        if (!open) return undefined;
        const id = window.setInterval(() => {
            void check();
        }, POLL_MS);
        return () => window.clearInterval(id);
    }, [open, check]);

    // Ein anderer Tab hat das Gedächtnis geändert (Start, Durdur, ×) oder sein Desktop-Fenster geöffnet/geschlossen.
    useEffect(() => {
        if (!userId) return undefined;
        const key = recordKey(userId);
        const onStorage = (event: StorageEvent) => {
            if (event.key === DESKTOP_LOCK_KEY || event.key === null) setDesktopElsewhere(desktopOpenInOtherTab());
            if (event.key !== key) return;
            const next = parseRecord(event.newValue);
            recordRef.current = next;
            setRecord(next);
            void check();
        };
        window.addEventListener('storage', onStorage);
        return () => window.removeEventListener('storage', onStorage);
    }, [userId, check]);

    // Die Sperre eines anderen Tabs läuft ab, wenn er ohne Abschied verschwindet.
    useEffect(() => {
        if (!desktopElsewhere) return undefined;
        const id = window.setInterval(() => setDesktopElsewhere(desktopOpenInOtherTab()), 10_000);
        return () => window.clearInterval(id);
    }, [desktopElsewhere]);

    // Zu (×), keine Aufgabe mehr, kein Zugang: auch das Desktop-Fenster und die Mitteilung gehen.
    useEffect(() => {
        if (open && !blocked && userId) return;
        closeDesktop();
        if (notifyOn) setNotify(false);
    }, [open, blocked, userId, notifyOn, closeDesktop, setNotify]);

    // Abmelden / Rahmen weg: das Desktop-Fenster nicht verwaist stehen lassen.
    useEffect(() => {
        const onLeave = () => clearDesktopLock();
        window.addEventListener('pagehide', onLeave);
        return () => {
            window.removeEventListener('pagehide', onLeave);
            desktopRef.current?.close();
        };
    }, []);

    // Abschluss beantragt, Zuweisung geändert …: die Messung kann auf dem Server geendet haben.
    useTasksChanged((kind) => {
        if (kind === 'task') void check(true);
    });

    const inlineHidden = desktop !== null || desktopElsewhere;

    // Telefon: die Seite bekommt unten Luft, damit die letzte Zeile nicht unter dem Fenster liegt (CSS).
    const inlineVisible = Boolean(userId && ready && !blocked && open && !inlineHidden);
    useEffect(() => {
        if (!inlineVisible) return undefined;
        const root = document.documentElement;
        root.setAttribute('data-ofi-tdock', '');
        return () => root.removeAttribute('data-ofi-tdock');
    }, [inlineVisible]);

    // Nach dem Einrasten an einem anderen Platz: vom Loslass-Ort dorthin gleiten.
    useLayoutEffect(() => {
        const from = settleFromRef.current;
        const node = dockRef.current;
        settleFromRef.current = null;
        if (from && node) settleFrom(node, from);
    }, [place]);

    const toggle = async () => {
        const current = recordRef.current;
        if (!current) return;
        if (current.running) {
            await pause(current.taskId);
        } else {
            const outcome: { error: unknown } = { error: null };
            const started = await start(current.taskId, current.taskTitle, {
                onError: (error) => {
                    outcome.error = error;
                },
            });
            const code = !started && outcome.error !== null ? tasksErrorCode(outcome.error) : '';
            const ownCompany = Boolean(current.tenantId) && current.tenantId === selectedTenant();
            if (GONE_ALWAYS.has(code) || (ownCompany && GONE_IN_OWN_COMPANY.has(code))) {
                const latest = recordRef.current;
                if (latest && latest.taskId === current.taskId) commit(null);
            }
        }
        // Ausserhalb des Moduls holt useTaskTimer den Stand nach einem Fehler nicht zurück — hier schon.
        void check(true);
    };

    const close = (animate: boolean) => {
        const current = recordRef.current;
        if (!current) return;
        commit(closeRecord(current, Date.now()));
        if (animate) {
            setGhost(current);
            window.setTimeout(() => setGhost(null), LEAVE_MS);
        }
    };

    const openTask = () => {
        if (suppressClickRef.current) return;
        const current = recordRef.current;
        if (current && isLinkable(current, selectedTenant())) {
            navigate(`/tasks/${current.taskId}`);
            if (desktopRef.current) window.focus();
        }
    };

    /* ── ⧉ auf dem Telefon: die Mitteilung ── */
    const toggleNotify = async () => {
        if (notifyOn) {
            setNotify(false);
            return;
        }
        let permission = Notification.permission;
        if (permission === 'default') {
            try {
                permission = await Notification.requestPermission();
            } catch {
                permission = 'denied';
            }
        }
        if (permission !== 'granted') {
            toast.error(t('tasksModule.dock.notifyDenied'));
            return;
        }
        if (!(await notificationWorkerReady())) {
            toast.error(t('tasksModule.dock.notifyUnavailable'));
            return;
        }
        setNotify(true);
        toast(t('tasksModule.dock.notifyShown'));
    };

    /* Knöpfe der Mitteilung (über public/sw.js). Der Klick hat die Mitteilung
       geschlossen — sie wird mit dem neuen Stand wieder gezeigt (notifyNonce). */
    const handleNotificationEvent = (event: NotificationEvent) => {
        const current = recordRef.current;
        const sameTask = current !== null && current.taskId === event.taskId;
        switch (event.action) {
            case 'dismissed':
                setNotify(false);
                return;
            case 'close':
                if (sameTask && current && !current.closed) close(false);
                setNotify(false);
                return;
            case 'open':
                if (sameTask) openTask();
                setNotifyNonce((nonce) => nonce + 1);
                return;
            case 'pause':
            case 'start':
                // Aus dem Briefkasten gilt nur ein frischer Klick — nie einer von gestern.
                if (sameTask && current && Date.now() - event.at <= MAILBOX_ACTION_MAX_AGE_MS) {
                    const wantsRun = event.action === 'start';
                    if (current.running !== wantsRun && (!wantsRun || isLinkable(current, selectedTenant()))) void toggle();
                }
                setNotifyNonce((nonce) => nonce + 1);
                return;
            default:
                return;
        }
    };
    const notificationHandlerRef = useRef(handleNotificationEvent);
    useLayoutEffect(() => {
        notificationHandlerRef.current = handleNotificationEvent;
    });

    useEffect(() => {
        if (!phoneSupported) return undefined;
        const container = navigator.serviceWorker;
        const onMessage = (event: MessageEvent) => {
            if (isNotificationEvent(event.data)) notificationHandlerRef.current(event.data);
        };
        container.addEventListener('message', onMessage);
        container.startMessages();
        return () => container.removeEventListener('message', onMessage);
    }, [phoneSupported]);

    // Aktionen, die kamen, während keine App offen war — beim Start und beim Zurückkehren.
    useEffect(() => {
        if (!phoneSupported || !userId) return undefined;
        let cancelled = false;
        const drain = async () => {
            const events = await drainNotificationMailbox();
            if (cancelled) return;
            events.forEach((event) => notificationHandlerRef.current(event));
            setMailboxRead(true);
        };
        void drain();
        const onVisible = () => {
            if (!document.hidden) void drain();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, [phoneSupported, userId]);

    // Die Mitteilung folgt dem Fenster: Aufgabe, Titel, läuft/angehalten.
    const notifyKey = open && record ? `${record.taskId}|${record.running ? 1 : 0}|${record.taskTitle}|${record.tenantId}` : '';
    useEffect(() => {
        if (!phoneSupported || !mailboxRead) return;
        const current = recordRef.current;
        if (!notifyOn || !notifyKey || blocked || !current) {
            void closeTimerNotification();
            return;
        }
        if (Notification.permission !== 'granted') {
            setNotify(false);
            return;
        }
        const linkable = isLinkable(current, selectedTenant());
        void showTimerNotification({
            taskId: current.taskId,
            title: current.taskTitle || t('tasksModule.live.untitled'),
            running: current.running,
            url: linkable ? `/tasks/${current.taskId}` : '/',
            labels: {
                running: t('tasksModule.dock.running'),
                stopped: t('tasksModule.dock.stopped'),
                stop: t('tasksModule.dock.stop'),
                start: t('tasksModule.dock.start'),
                close: t('common.close'),
            },
        });
    }, [phoneSupported, mailboxRead, notifyOn, notifyKey, blocked, notifyNonce, setNotify]);

    const onPointerDown = (event: ReactPointerEvent<HTMLElement>) => {
        if (event.button !== 0 || !event.isPrimary) return;
        if ((event.target as Element).closest('.ofi-tdock__action, .ofi-tdock__close, .ofi-tdock__popout')) return;
        if (window.matchMedia(PHONE_QUERY).matches) return;
        dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
    };

    const onPointerMove = (event: ReactPointerEvent<HTMLElement>) => {
        const drag = dragRef.current;
        const node = dockRef.current;
        if (!drag || drag.pointerId !== event.pointerId || !node) return;
        const dx = event.clientX - drag.x;
        const dy = event.clientY - drag.y;
        if (!drag.moved) {
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;
            drag.moved = true;
            try {
                node.setPointerCapture(event.pointerId);
            } catch {
                /* schon losgelassen */
            }
            node.classList.add('is-dragging');
        }
        node.style.transform = `translate(${dx}px, ${dy}px)`;
    };

    const endDrag = (event: ReactPointerEvent<HTMLElement>, cancelled: boolean) => {
        const drag = dragRef.current;
        const node = dockRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (!drag.moved || !node) return;
        // Der Klick nach dem Loslassen öffnet die Aufgabe nicht.
        suppressClickRef.current = true;
        window.setTimeout(() => {
            suppressClickRef.current = false;
        }, 0);
        const dropped = node.getBoundingClientRect();
        const next = cancelled ? place : nearestPlace(dropped.left + dropped.width / 2, window.innerWidth);
        if (next === place) {
            settleFrom(node, dropped);
            return;
        }
        settleFromRef.current = dropped;
        writePlace(next);
        setPlace(next);
    };

    const shown = record && !record.closed ? record : ghost;
    if (!userId || !ready || blocked || !shown) return null;

    const leaving = shown !== record || shown.closed;
    const running = shown.running;
    const title = shown.taskTitle || t('tasksModule.live.untitled');
    const linkable = isLinkable(shown, selectedTenantId);
    const otherCompany = t('tasksModule.dock.otherCompany');
    const canOpenDesktop = desktopWindowApi() !== null && !desktop && !desktopElsewhere;
    const popOut = canOpenDesktop
        ? { label: t('tasksModule.dock.popOut'), on: false, run: () => void openDesktop() }
        : phoneSupported
            ? { label: notifyOn ? t('tasksModule.dock.notifyOff') : t('tasksModule.dock.notifyOn'), on: notifyOn, run: () => void toggleNotify() }
            : null;

    const card = (variant: CardVariant) => {
        const inline = variant === 'inline';
        const className = inline
            ? `ofi-tdock is-${place} ${running ? 'is-running' : 'is-stopped'} ${leaving ? 'is-leaving' : ''}`
            : `ofi-tdock is-desktop ${running ? 'is-running' : 'is-stopped'}`;
        return (
            <section
                ref={inline ? dockRef : undefined}
                className={className.trim()}
                aria-label={t('tasksModule.dock.label')}
                onPointerDown={inline ? onPointerDown : undefined}
                onPointerMove={inline ? onPointerMove : undefined}
                onPointerUp={inline ? (event) => endDrag(event, false) : undefined}
                onPointerCancel={inline ? (event) => endDrag(event, true) : undefined}
            >
                <button
                    type="button"
                    className="ofi-tdock__main ofi-btn-plain ofi-nosize"
                    onClick={openTask}
                    aria-disabled={linkable ? undefined : true}
                    title={linkable ? title : `${title} — ${otherCompany}`}
                >
                    <span className="ofi-tdock__title">{title}</span>
                    <span className="ofi-tdock__status" aria-live="polite">
                        <i className="ofi-tdock__dot" aria-hidden />
                        {running ? t('tasksModule.dock.running') : t('tasksModule.dock.stopped')}
                    </span>
                </button>
                <button
                    type="button"
                    className={`ofi-tdock__action ofi-btn-plain ofi-nosize ${running ? 'is-stop' : 'is-start'}`}
                    onClick={() => {
                        void toggle();
                    }}
                    disabled={!running && !linkable}
                    title={!running && !linkable ? otherCompany : undefined}
                >
                    {running ? <LuPause size={14} strokeWidth={2.5} aria-hidden /> : <LuPlay size={14} strokeWidth={2.5} aria-hidden />}
                    <span>{running ? t('tasksModule.dock.stop') : t('tasksModule.dock.start')}</span>
                </button>
                {inline && popOut && (
                    <button
                        type="button"
                        className={`ofi-tdock__popout ofi-btn-plain ofi-nosize rounded-full ${popOut.on ? 'is-on' : ''}`.trim()}
                        onClick={popOut.run}
                        aria-label={popOut.label}
                        aria-pressed={phoneSupported && !canOpenDesktop ? popOut.on : undefined}
                        title={popOut.label}
                    >
                        <LuPictureInPicture2 size={15} strokeWidth={2.25} aria-hidden />
                    </button>
                )}
                <button
                    type="button"
                    className="ofi-tdock__close ofi-btn-plain ofi-nosize rounded-full"
                    onClick={() => close(inline)}
                    aria-label={t('common.close')}
                    title={t('common.close')}
                >
                    <LuX size={13} strokeWidth={2.5} aria-hidden />
                </button>
            </section>
        );
    };

    return (
        <>
            {!inlineHidden && createPortal(card('inline'), document.body)}
            {desktop && open && createPortal(card('desktop'), desktop.host)}
        </>
    );
};
