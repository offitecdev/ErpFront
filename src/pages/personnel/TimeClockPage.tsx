import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { CalendarDate, Scan } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { personnelApi } from '@/lib/api/personnel';
import type { ClockScanResult, ScanTag } from './types/personnel';
import { useClockActivity, useLanguageTick, useTransientValue, useWeekOverview } from './hooks/usePersonnel';
import { useQrScanner } from './hooks/useQrScanner';
import { WelcomeOverlay } from './components/WelcomeOverlay';
import { WeekSheet } from './components/WeekSheet';
import { formatHoursMinutes, formatTime, fullName } from './utils/format';

/**
 * ── STEMPELUHR (TABLETBILDSCHIRM) ────────────────────────────────────────────
 *
 * Der zweite Bildschirm des Moduls: ein Tablet hängt an der Wand, die Kamera
 * läuft dauerhaft, und wer vorbeigeht, hält seinen QR-Ausweis hin.
 *
 *  • EIN Code, DREI Bedeutungen — der Server entscheidet (siehe `scanTagFor`):
 *    der erste Scan des Tages ist KOMMEN, jeder weitere vor dem geplanten
 *    Schichtende ist PAUSE, und ab dem Schichtende wird daraus FEIERABEND. Auf
 *    dem Tablet gibt es deshalb KEINE Knöpfe zum Auswählen; wer bei jeder
 *    Stempelung erst die richtige Taste suchen muss, drückt die falsche.
 *  • PAUSEN ZÄHLEN NICHT als Arbeitszeit: sie sind die Lücke zwischen zwei
 *    Fenstern und werden nirgends addiert.
 *  • Nach jedem Scan „Willkommen [Name]" für fünf Sekunden (Times New Roman),
 *    dann blendet es von selbst aus.
 *  • Die Erfassungsfläche hält NIE an — auch nicht, während „Diese Woche" offen
 *    ist oder die Begrüssung steht.
 *
 * Diese Seite ist bewusst gross und kontrastreich: sie wird aus zwei Metern
 * Entfernung gelesen, nicht am Schreibtisch.
 */
/* Ein Farbschlüssel je Ereignis — die vier Kennzeichen sind aus zwei Metern
   Entfernung an der Farbe schneller zu unterscheiden als am Wort. */
const TAG_CHIP_CLASS: Record<ScanTag, string> = {
    IN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
    BREAK_START: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300',
    BREAK_END: 'bg-lime-100 text-lime-700 dark:bg-lime-500/15 dark:text-lime-300',
    OUT: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300',
};

export const TimeClockPage = () => {
    useLanguageTick();
    const [weekOpen, setWeekOpen] = useState(false);
    const [welcome, showWelcome] = useTransientValue<ClockScanResult>(5000);
    const week = useWeekOverview(weekOpen);
    const activity = useClockActivity();

    const handleScan = useCallback(async (token: string) => {
        try {
            const result = await personnelApi.scan(token);
            showWelcome(result);
            // Die Tagesübersicht kommt vom Server (siehe `useClockActivity`) —
            // nach dem Scan neu holen, damit das eigene Ereignis oben steht.
            activity.reload();
            if (weekOpen) week.reload();
        } catch (error) {
            toast.error(
                (error as { response?: { data?: { error?: string } } })?.response?.data?.error
                || t('personnel.clock.scanFailed'),
            );
        }
    }, [showWelcome, weekOpen, week, activity]);

    const scanner = useQrScanner({ onScan: handleScan });

    return (
        <div className="flex min-h-[calc(100vh-140px)] w-full flex-col gap-5">
            <header className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                    <h1 className="ofi-serif truncate text-[26px] font-semibold tracking-tight text-slate-900 dark:text-white">
                        {t('personnel.clock.title')}
                    </h1>
                    <p className="mt-0.5 text-[13px] text-slate-500 dark:text-white/60">
                        {t('personnel.clock.subtitle')}
                    </p>
                </div>

                {/* Grosser Knopf — Tabletbedienung mit dem Finger (Vorgabe). */}
                <button
                    type="button"
                    onClick={() => setWeekOpen(true)}
                    className="inline-flex items-center gap-2.5 rounded-2xl bg-[#272f67] px-7 py-4 text-[17px] font-bold text-white transition-colors hover:bg-[#1f2654]"
                >
                    <CalendarDate size={20} />
                    {t('personnel.clock.weekButton')}
                </button>
            </header>

            <div className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
                <section className="flex flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-6 dark:border-white/20 dark:bg-white/5">
                    {/* Die id ist der Anker für html5-qrcode — das Element MUSS
                        gezeichnet sein, bevor die Kamera startet. */}
                    <div
                        id="personnel-clock-scanner"
                        ref={scanner.containerRef}
                        className="aspect-square w-full max-w-[460px] overflow-hidden rounded-2xl bg-black"
                    />

                    <p className="mt-5 flex items-center gap-2 text-[16px] font-semibold text-slate-700 dark:text-white/80">
                        <Scan size={18} />
                        {scanner.busy
                            ? t('personnel.clock.processing')
                            : scanner.state === 'error'
                                ? t('personnel.clock.cameraError')
                                : scanner.state === 'starting'
                                    ? t('personnel.clock.cameraStarting')
                                    : t('personnel.clock.holdCode')}
                    </p>
                    <p className="mt-1 text-center text-[12.5px] text-slate-400 dark:text-white/45">
                        {t('personnel.clock.alwaysOnHint')}
                    </p>
                </section>

                <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/15 dark:bg-transparent">
                    <h2 className="text-[13px] font-semibold uppercase tracking-wide text-slate-500 dark:text-white/60">
                        {t('personnel.clock.activityTitle')}
                    </h2>
                    {activity.loading ? (
                        <div className="mt-3 space-y-2">
                            {[0, 1, 2, 3].map((index) => (
                                <div key={index} className="ofi-shimmer h-14 rounded-xl border border-slate-200 dark:border-white/15" />
                            ))}
                        </div>
                    ) : activity.activity.events.length === 0 ? (
                        <p className="mt-6 text-center text-[13px] text-slate-400 dark:text-white/45">
                            {t('personnel.clock.activityEmpty')}
                        </p>
                    ) : (
                        <ul className="mt-3 space-y-2 overflow-y-auto">
                            {activity.activity.events.map((event, index) => (
                                <li
                                    key={`${event.employeeId}-${event.at}-${index}`}
                                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2.5 dark:border-white/15"
                                >
                                    <div className="min-w-0">
                                        <p className="truncate text-[14px] font-semibold text-slate-800 dark:text-white">
                                            {fullName(event)}
                                        </p>
                                        <p className="text-[12px] text-slate-500 dark:text-white/60">
                                            {formatTime(event.at)}
                                            {' · '}
                                            {t('personnel.clock.actualSoFar', { value: formatHoursMinutes(event.actualWorkSeconds) })}
                                            {event.breakSeconds > 0 && (
                                                <> · {t('personnel.clock.breakSoFar', { value: formatHoursMinutes(event.breakSeconds) })}</>
                                            )}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide ${TAG_CHIP_CLASS[event.tag]}`}>
                                        {t(`personnel.clock.tag.${event.tag}`)}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    )}
                </aside>
            </div>

            <WeekSheet open={weekOpen} week={week.week} loading={week.loading} onClose={() => setWeekOpen(false)} />
            <WelcomeOverlay result={welcome} />
        </div>
    );
};
