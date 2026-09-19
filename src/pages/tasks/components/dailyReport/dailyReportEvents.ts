/**
 * Gün sonu raporu von Hand öffnen (Knopf im Görevler-Kopf). Eigene kleine
 * Datei, damit der Knopf das (verzögert geladene) Fenster nicht mitzieht.
 *
 * 16.09.2026 (Samet: «tek tıkta açılmalı ama bazen açılmıyor»): Das Fenster
 * hängt erst ein paar Sekunden nach dem Seitenaufbau am Rahmen und kommt als
 * eigenes Stück Code nach. Ein Klick davor ging ins Leere — niemand hörte das
 * Ereignis. Darum bleibt die Anforderung jetzt liegen, bis das Fenster da ist
 * und sie abholt (`takePendingDailyReportOpen`), und der Rahmen hängt das
 * Fenster beim ersten Klick sofort ein.
 */

export const DAILY_REPORT_OPEN_EVENT = 'ofi:daily-report-open';

/** So lange wartet eine Anforderung auf das Fenster. */
const PENDING_MS = 60_000;
let pendingOpenAt = 0;

export const openDailyReport = (): void => {
    pendingOpenAt = Date.now();
    window.dispatchEvent(new CustomEvent(DAILY_REPORT_OPEN_EVENT));
};

/** Liegt eine Anforderung vor? Einmal abholen — danach ist sie weg. */
export const takePendingDailyReportOpen = (): boolean => {
    const pending = pendingOpenAt > 0 && Date.now() - pendingOpenAt < PENDING_MS;
    pendingOpenAt = 0;
    return pending;
};

/** Den Code des Fensters schon laden, bevor geklickt wird (Zeiger über dem Knopf). */
export const preloadDailyReportPrompt = (): void => {
    void import('./DailyReportPrompt');
};

/** Modül ayarları hat die Uhrzeit gespeichert — das Fenster liest sie neu. */
export const DAILY_REPORT_SETTING_CHANGED_EVENT = 'ofi:daily-report-setting-changed';

export const notifyDailyReportSettingChanged = (): void => {
    window.dispatchEvent(new CustomEvent(DAILY_REPORT_SETTING_CHANGED_EVENT));
};
