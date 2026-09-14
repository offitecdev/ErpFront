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
    noteServerNow: (serverNow: string | undefined) => void;
}

let bootstrapInFlight: Promise<TasksBootstrap | null> | null = null;
let directoryInFlight: Promise<DirectoryPerson[]> | null = null;

const offsetFrom = (serverNow: string | undefined): number | null => {
    if (!serverNow) return null;
    const server = Date.parse(serverNow);
    return Number.isFinite(server) ? server - Date.now() : null;
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
    directory: null,
    directoryFailed: false,

    ensure: async (force = false) => {
        const tenantKey = selectedTenantKey();
        const state = get();
        const fresh = state.bootstrap && state.tenantKey === tenantKey && Date.now() - state.loadedAt < BOOTSTRAP_STALE_MS;
        if (fresh && !force) return state.bootstrap;
        if (bootstrapInFlight) return bootstrapInFlight;
        if (state.tenantKey !== tenantKey) {
            set({ bootstrap: readTasksCache<TasksBootstrap>('bootstrap'), directory: null, tenantKey, loadedAt: 0 });
        }
        set({ loading: true, error: null });
        bootstrapInFlight = tasksApi.bootstrap()
            .then((bootstrap) => {
                writeTasksCache('bootstrap', bootstrap);
                const offset = offsetFrom(bootstrap.serverNow);
                set({
                    bootstrap,
                    tenantKey,
                    loadedAt: Date.now(),
                    loading: false,
                    ...(offset !== null ? { serverOffsetMs: offset } : {}),
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
    setSummary: (summary) => set((state) => ({
        bootstrap: state.bootstrap ? { ...state.bootstrap, summary } : state.bootstrap,
    })),

    setLabels: (labels) => set((state) => ({
        bootstrap: state.bootstrap ? { ...state.bootstrap, labels } : state.bootstrap,
    })),

    setReminderLeadMinutes: (minutes) => set((state) => ({
        bootstrap: state.bootstrap
            ? { ...state.bootstrap, settings: { ...state.bootstrap.settings, reminderLeadMinutes: minutes } }
            : state.bootstrap,
    })),

    setActiveTimer: (activeTimer) => set((state) => ({
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

    noteServerNow: (serverNow) => {
        const offset = offsetFrom(serverNow);
        if (offset !== null) set({ serverOffsetMs: offset });
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
