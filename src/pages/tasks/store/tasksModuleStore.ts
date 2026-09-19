import { create } from 'zustand';

import { tasksApi } from '@/lib/api/tasksModule';
import type { ActiveTimerInfo, DirectoryPerson, LabelDto, TaskOnboarding, TasksBootstrap, TasksSummary } from '@/types/tasksModule';
import { readTasksCache, writeTasksCache } from '../utils/tasksCache';

/**
 * ── ZUSTAND DES GÖREVLER-MODULS ──────────────────────────────────────────────
 *
 * Was jede Seite des Moduls braucht und nicht bei jedem Seitenwechsel neu holen
 * soll: wer handelt (Leitung/Teammitglied), die Etiketten, die persönliche
 * Einstellung, die Zähler der Leiste und das Personalverzeichnis des Moduls.
 *
 * Je FIRMA gehalten: wechselt die ausgewählte Firma, gilt nichts davon mehr —
 * `ensure()` merkt es am Schlüssel und lädt neu. Die Zähler frischt die Kopfzeile
 * jede Minute und beim Zurückkehren in den Tab auf (`refreshSummary`).
 */

const BOOTSTRAP_STALE_MS = 60_000;

const selectedTenantKey = (): string =>
    sessionStorage.getItem('selectedTenantId') || localStorage.getItem('selectedTenantId') || '';

interface TasksModuleState {
    tenantKey: string;
    bootstrap: TasksBootstrap | null;
    loadedAt: number;
    loading: boolean;
    error: unknown;
    /** Unterschied Server − Browser in ms (für die laufende Uhr). */
    serverOffsetMs: number;
    /**
     * Die EIGENE laufende Messung — unabhängig vom Bootstrap (14.09.2026, Samet:
     * «ilk front başlayacak, arka planda backend'e gönderecek»): ein Klick zählt
     * sofort, auch wenn der Bootstrap noch lädt oder fehlt. undefined = unbekannt.
     */
    activeTimer: ActiveTimerInfo | null | undefined;
    /** false = nur der GEMERKTE Bootstrap sagt es (kann alt sein); true nach Klick, frischem Bootstrap oder Özet. */
    activeTimerKnown: boolean;
    directory: DirectoryPerson[] | null;
    /** Das letzte Laden des Verzeichnisses ist gescheitert — beim nächsten Öffnen erneut versuchen. */
    directoryFailed: boolean;
    ensure: (force?: boolean) => Promise<TasksBootstrap | null>;
    refreshSummary: () => Promise<void>;
    setSummary: (summary: TasksSummary) => void;
    setLabels: (labels: LabelDto[]) => void;
    setReminderLeadMinutes: (minutes: number) => void;
    setActiveTimer: (activeTimer: ActiveTimerInfo | null) => void;
    setOnboarding: (onboarding: TaskOnboarding) => void;
    loadDirectory: (force?: boolean) => Promise<DirectoryPerson[]>;
    /** `trusted` = Antwort kommt nie aus dem Redis-Cache (Bootstrap, Timer, Detail, Hızlı, Pano). */
    noteServerNow: (serverNow: string | undefined, trusted?: boolean) => void;
}

let bootstrapInFlight: Promise<TasksBootstrap | null> | null = null;
let directoryInFlight: Promise<DirectoryPerson[]> | null = null;

const offsetFrom = (serverNow: string | undefined): number | null => {
    if (!serverNow) return null;
    const server = Date.parse(serverNow);
    return Number.isFinite(server) ? server - Date.now() : null;
};

/**
 * Der Uhrversatz wird EINMAL gemessen und dann festgehalten (14.09.2026, Samet:
 * «sayaçlar bir anda geri sayıyor ileri sayıyor»). Jede Antwort stempelt ihr
 * `serverNow` VOR der Datenbankarbeit und kommt mit anderer Laufzeit an — Chat
 * alle 4 s, Pano alle 15 s, Liste, Detail, Özet, Hızlı mod: jede Messung wich
 * um 50–300 ms ab, und jede Abweichung verschob ALLE Uhren um genau so viel —
 * bei ganzen Sekunden sprang die Anzeige vor und zurück. Ein fester Versatz ist
 * um seine Laufzeit verschoben, aber in sich stimmig: nichts springt je.
 * Nur eine ECHTE Änderung (Rechneruhr gestellt, anderer Server) wird übernommen.
 */
const OFFSET_RESET_MS = 1500;
/** Nur frische Antworten dürfen die Uhr stellen; `weak` bleibt für bereits laufende Sitzungen als Übergangswert erhalten. */
let offsetSource: 'none' | 'weak' | 'trusted' = 'none';

const nextOffset = (current: number, sample: number, trusted: boolean): number => {
    // Eine gecachte Antwort trägt ein bis zu 15 s altes `serverNow`. Auch als
    // allererste Antwort darf sie weder die sichtbare Uhr noch `actionAt`
    // verschieben; Bootstrap/Detail/Timer liefern gleich danach eine frische.
    if (!trusted) return current;
    if (offsetSource === 'none' || offsetSource === 'weak') {
        offsetSource = 'trusted';
        return sample;
    }
    return Math.abs(sample - current) > OFFSET_RESET_MS ? sample : current;
};

/**
 * Laufende Messung aus einer Antwort übernehmen — ohne die eigene Uhr zu
 * verrücken: meldet der Server DIESELBE Aufgabe, bleibt die Startzeit des
 * Klicks (die des Servers weicht um die Netzlaufzeit ab; jede Übernahme liesse
 * Kopfzeile, Hızlı mod und Zeilen um eine Sekunde springen). Nur eine deutlich
 * andere Startzeit (andere Messung, anderes Gerät) ersetzt sie.
 */
export const mergeActiveTimer = (current: ActiveTimerInfo | null | undefined, incoming: ActiveTimerInfo | null): ActiveTimerInfo | null => {
    void current;
    return incoming;
};

/* Sofort sichtbar (13.09.2026): der letzte Bootstrap dieser Firma steht beim
   Öffnen schon da, `ensure()` holt ihn im Hintergrund frisch (loadedAt = 0). */
const cachedBootstrap = readTasksCache<TasksBootstrap>('bootstrap');

export const useTasksModuleStore = create<TasksModuleState>((set, get) => ({
    tenantKey: cachedBootstrap ? selectedTenantKey() : '',
    bootstrap: cachedBootstrap,
    loadedAt: 0,
    loading: false,
    error: null,
    serverOffsetMs: 0,
    activeTimer: cachedBootstrap ? cachedBootstrap.summary.activeTimer ?? null : undefined,
    activeTimerKnown: false,
    directory: null,
    directoryFailed: false,

    ensure: async (force = false) => {
        const tenantKey = selectedTenantKey();
        const state = get();
        const fresh = state.bootstrap && state.tenantKey === tenantKey && Date.now() - state.loadedAt < BOOTSTRAP_STALE_MS;
        if (fresh && !force) return state.bootstrap;
        if (bootstrapInFlight) return bootstrapInFlight;
        if (state.tenantKey !== tenantKey) {
            const cached = readTasksCache<TasksBootstrap>('bootstrap');
            set({
                bootstrap: cached,
                directory: null,
                tenantKey,
                loadedAt: 0,
                activeTimer: cached ? cached.summary.activeTimer ?? null : undefined,
                activeTimerKnown: false,
            });
        }
        set({ loading: true, error: null });
        bootstrapInFlight = tasksApi.bootstrap()
            .then((bootstrap) => {
                writeTasksCache('bootstrap', bootstrap);
                const offset = offsetFrom(bootstrap.serverNow);
                set((state) => {
                    // Dieselbe Firma: die laufende Uhr behält die Startzeit des Klicks.
                    const activeTimer = state.tenantKey === tenantKey
                        ? mergeActiveTimer(state.activeTimer, bootstrap.summary.activeTimer)
                        : bootstrap.summary.activeTimer;
                    return {
                        bootstrap: { ...bootstrap, summary: { ...bootstrap.summary, activeTimer } },
                        activeTimer,
                        activeTimerKnown: true,
                        tenantKey,
                        loadedAt: Date.now(),
                        loading: false,
                        ...(offset !== null ? { serverOffsetMs: nextOffset(state.serverOffsetMs, offset, true) } : {}),
                    };
                });
                return bootstrap;
            })
            .catch((error: unknown) => {
                set({ loading: false, error });
                return null;
            })
            .finally(() => { bootstrapInFlight = null; });
        return bootstrapInFlight;
    },

    refreshSummary: async () => {
        const current = get().bootstrap;
        if (!current) return;
        try {
            const summary = await tasksApi.summary();
            get().setSummary(summary);
            get().noteServerNow(summary.serverNow);
        } catch {
            /* Ein ausgefallener Zähler ist kein Grund für eine Meldung. */
        }
    },

    /* Nur der Inhalt — der Uhrversatz kommt ausschliesslich aus FRISCHEN Antworten
       (refreshSummary/noteServerNow), sonst liesse ein gemerkter Stand die Uhren wandern. */
    setSummary: (summary) => set((state) => {
        const activeTimer = mergeActiveTimer(state.activeTimer, summary.activeTimer);
        return {
            activeTimer,
            activeTimerKnown: true,
            bootstrap: state.bootstrap ? { ...state.bootstrap, summary: { ...summary, activeTimer } } : state.bootstrap,
        };
    }),

    setLabels: (labels) => set((state) => ({
        bootstrap: state.bootstrap ? { ...state.bootstrap, labels } : state.bootstrap,
    })),

    setReminderLeadMinutes: (minutes) => set((state) => ({
        bootstrap: state.bootstrap
            ? { ...state.bootstrap, settings: { ...state.bootstrap.settings, reminderLeadMinutes: minutes } }
            : state.bootstrap,
    })),

    /* Der Klick — zählt IMMER, auch ohne Bootstrap; der Server erfährt es danach (useTaskTimer). */
    setActiveTimer: (activeTimer) => set((state) => ({
        activeTimer,
        activeTimerKnown: true,
        bootstrap: state.bootstrap
            ? { ...state.bootstrap, summary: { ...state.bootstrap.summary, activeTimer } }
            : state.bootstrap,
    })),

    setOnboarding: (onboarding) => set((state) => ({
        bootstrap: state.bootstrap ? { ...state.bootstrap, onboarding } : state.bootstrap,
    })),

    loadDirectory: async (force = false) => {
        const cached = get().directory;
        if (cached && !force && !get().directoryFailed) return cached;
        if (directoryInFlight) return directoryInFlight;
        directoryInFlight = tasksApi.directory()
            .then((directory) => {
                set({ directory, directoryFailed: false });
                return directory;
            })
            .catch(() => {
                // Leere Liste statt ewigem «Yükleniyor» — das nächste Öffnen versucht es erneut.
                const fallback = get().directory ?? [];
                set({ directory: fallback, directoryFailed: true });
                return fallback;
            })
            .finally(() => { directoryInFlight = null; });
        return directoryInFlight;
    },

    noteServerNow: (serverNow, trusted = false) => {
        const offset = offsetFrom(serverNow);
        if (offset === null) return;
        const next = nextOffset(get().serverOffsetMs, offset, trusted);
        if (next !== get().serverOffsetMs) set({ serverOffsetMs: next });
    },
}));

/** Kurzform für die Seiten: handelt die Leitung? */
export const useIsTasksManager = (): boolean =>
    useTasksModuleStore((state) => Boolean(state.bootstrap?.actor.isManager));

/** Administratorrolle: bestätigt Abschlüsse (alle anderen beantragen sie). */
export const useIsTasksAdmin = (): boolean =>
    useTasksModuleStore((state) => Boolean(state.bootstrap?.actor.isSystemAdmin));

/** Die eigene Personal-id. */
export const useTasksActorId = (): string =>
    useTasksModuleStore((state) => state.bootstrap?.actor.employeeId ?? '');
