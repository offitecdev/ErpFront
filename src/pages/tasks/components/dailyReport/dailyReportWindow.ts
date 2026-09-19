import { useEffect, useState } from 'react';

import { tasksApi } from '@/lib/api/tasksModule';
import type { DailyReportSetting } from '@/types/tasksModule';
import { DAILY_REPORT_SETTING_CHANGED_EVENT } from './dailyReportEvents';

/**
 * ── DAS ZEITFENSTER DES GÜN SONU RAPORU (15.09.2026, Samet) ──────────────────
 *
 * «Saat 16.00'da uyarı versin, tıklanınca rapor seçeneği; 16.00–17.00 arası
 * aktif olur.» Beginn und Ende stehen je Firma in Modül ayarları → Görev
 * Yönetimi (GET /tasks/daily-reports/settings), Montag–Freitag, Browserzeit.
 * Ohne Antwort gilt 16:00–17:00. Der Server prüft beim Speichern dasselbe
 * (mit 10 Minuten Nachlauf für den, der um 16:59 noch tippt).
 */

export const DEFAULT_DAILY_REPORT_WINDOW: DailyReportSetting = { promptTime: '16:00', endTime: '17:00' };
/** Wie der Server (SAVE_GRACE_MINUTES). */
export const SAVE_GRACE_MINUTES = 10;
const SETTING_REFRESH_MS = 10 * 60_000;
/** Der Knopf und die Uyarı wechseln höchstens 5 s nach Beginn/Ende (vorher: bis zu 30 s). */
const TICK_MS = 5_000;

/** «HH:MM» → Minuten seit Mitternacht; Unlesbares → `fallback`. */
export const timeMinutes = (value: string | undefined, fallback: string): number => {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value ?? '') ?? /^(\d\d):(\d\d)$/.exec(fallback);
    return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
};

export interface DailyReportWindowState {
    setting: DailyReportSetting;
    /** Montag–Freitag zwischen Beginn und Ende. */
    isOpen: boolean;
    /** Speichern geht noch (Fenster + Nachlauf). */
    canSave: boolean;
}

export const windowState = (now: Date, setting: DailyReportSetting): DailyReportWindowState => {
    const start = timeMinutes(setting.promptTime, DEFAULT_DAILY_REPORT_WINDOW.promptTime);
    const end = timeMinutes(setting.endTime, DEFAULT_DAILY_REPORT_WINDOW.endTime);
    const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;
    const workday = now.getDay() >= 1 && now.getDay() <= 5;
    return {
        setting,
        isOpen: workday && minutes >= start && minutes < end,
        canSave: workday && minutes >= start && minutes <= end + SAVE_GRACE_MINUTES,
    };
};

/* Eine geteilte Kopie der Einstellung für Fenster und Kopfknopf. */
let cached: DailyReportSetting = DEFAULT_DAILY_REPORT_WINDOW;
let readAt = 0;
let inflight: Promise<DailyReportSetting> | null = null;
const listeners = new Set<(setting: DailyReportSetting) => void>();

export const readDailyReportWindow = (): DailyReportSetting => cached;

export const loadDailyReportWindow = (force = false): Promise<DailyReportSetting> => {
    if (!force && Date.now() - readAt < SETTING_REFRESH_MS) return Promise.resolve(cached);
    if (inflight) return inflight;
    readAt = Date.now();
    inflight = tasksApi.dailyReportSetting()
        .then((setting) => {
            cached = {
                promptTime: setting.promptTime || DEFAULT_DAILY_REPORT_WINDOW.promptTime,
                endTime: setting.endTime || DEFAULT_DAILY_REPORT_WINDOW.endTime,
            };
            listeners.forEach((listener) => listener(cached));
            return cached;
        })
        // Keine Antwort: die zuletzt bekannte Zeit (oder 16:00–17:00) gilt weiter.
        .catch(() => cached)
        .finally(() => { inflight = null; });
    return inflight;
};

/** Andere Firma: die Einstellung neu lesen. */
export const resetDailyReportWindow = (): void => {
    cached = DEFAULT_DAILY_REPORT_WINDOW;
    readAt = 0;
};

if (typeof window !== 'undefined') {
    window.addEventListener(DAILY_REPORT_SETTING_CHANGED_EVENT, () => { void loadDailyReportWindow(true); });
}

/** Zustand des Fensters, frisch alle 5 s. */
export const useDailyReportWindow = (enabled = true): DailyReportWindowState => {
    const [state, setState] = useState(() => windowState(new Date(), cached));

    useEffect(() => {
        if (!enabled) return undefined;
        const update = (setting = cached) => setState((current) => {
            const next = windowState(new Date(), setting);
            // Nichts geändert: kein neues Bild (die Prüfung läuft alle 5 s).
            return current.isOpen === next.isOpen && current.canSave === next.canSave
                && current.setting.promptTime === next.setting.promptTime
                && current.setting.endTime === next.setting.endTime ? current : next;
        });
        listeners.add(update);
        void loadDailyReportWindow().then(update);
        const id = window.setInterval(() => {
            void loadDailyReportWindow().then(update);
        }, TICK_MS);
        return () => {
            listeners.delete(update);
            window.clearInterval(id);
        };
    }, [enabled]);

    return state;
};
