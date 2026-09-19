import { absoluteAttachmentUrl } from '@/lib/api/tasksModule';
import type { DailyReport, WorkReport, WorkReportSession } from '@/types/tasksModule';
import { parseMarkdown, type MdBlock } from './markdownDoc';

/**
 * ── ARBEITSRAPPORT EINER PERSON: DAS DOKUMENT ────────────────────────────────
 *
 * 16.09.2026 (Samet): «Raporlamada gün gün yazsın; grafik falan kaldır, diğer
 * şeyleri de, görev bazlı bakışı da kaldır — sadece gün gün, gün sonunda neler
 * yaptı.» Damit ist der Rapport NUR noch die Sammlung der Gün sonu raporları:
 *
 *   Kopf     Titel, rechts oben das gerechnete graue Muster (reportMark.ts),
 *            darunter Person, Zeitraum, Firma/erstellt
 *   Tage     je Kalendertag eine Überschrift und das freie Blatt des Tages
 *            (Markdown → Blöcke, markdownDoc.ts), darunter seine Dateien als
 *            anklickbare Adressen (Bilder und PDF liegen bei Cloudflare) und
 *            zuletzt die Zeiten des Tages: welche Aufgabe, wie lange
 *            (16.09.2026, Samet: «çalıştığı görevler ve kaç saat çalıştığı,
 *            gün gün, ince gri kenarlı bir tabloda»)
 *
 * Vorschau (ReportBody) und PDF (workReportPdfLayout) lesen dasselbe Dokument.
 * Die Datei kennt weder i18n noch React: Übersetzer und Sprache kommen herein.
 */

export type WorkPeriod = 'day' | 'week';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Eine Datei des Tages — im Rapport steht ihre anklickbare Adresse. */
export interface WorkReportFile {
    id: string;
    name: string;
    url: string;
    isImage: boolean;
    isPdf: boolean;
}

/** Eine Zeile der Zeittabelle eines Tages. */
export interface WorkReportTime {
    taskId: string;
    title: string;
    ms: number;
    duration: string;
}

export interface WorkReportDay {
    key: string;
    /** «Pazartesi». */
    weekday: string;
    /** «14.09.2026». */
    dateText: string;
    /** «Pazartesi · 14.09.2026». */
    heading: string;
    /** Das Blatt des Tages; leer = nichts geschrieben. */
    blocks: MdBlock[];
    files: WorkReportFile[];
    /** Zeit je Aufgabe an diesem Tag, längste zuerst; leer = keine Messung. */
    times: WorkReportTime[];
    /** Summe der Zeiten des Tages, schon als Text. */
    total: string;
    /** Es gibt einen gespeicherten Rapport für diesen Tag. */
    written: boolean;
}

export interface WorkReportDocument {
    period: WorkPeriod;
    title: string;
    person: string;
    /** «Haftalık · 14.09.2026 – 20.09.2026». */
    subtitle: string;
    /** «Firma · Oluşturulma 16.09.2026 17:05». */
    meta: string;
    days: WorkReportDay[];
    labels: {
        files: string;
        missing: string;
        empty: string;
        /** Überschrift und Spalten der Zeittabelle. */
        worked: string;
        task: string;
        duration: string;
        total: string;
    };
    footerLeft: string;
    pageLabel: (page: number, pages: number) => string;
    fileName: string;
}

const K = 'tasksModule.reports.work';
const MINUTE_MS = 60_000;

/* ── Zeitraum ───────────────────────────────────────────────────────────── */

const pad = (value: number) => String(value).padStart(2, '0');

export const toDateKey = (date: Date): string =>
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

export const parseDateKey = (value: string | null | undefined): Date | null => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value ?? ''));
    if (!match) return null;
    const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
    return Number.isNaN(date.getTime()) || toDateKey(date) !== value ? null : date;
};

/** Anfang und Ende des Zeitraums in der Uhr des Browsers; Woche = Montag bis Sonntag. */
export const periodBounds = (period: WorkPeriod, dateKey: string): { from: Date; to: Date; days: Date[] } => {
    const anchor = parseDateKey(dateKey) ?? new Date();
    const from = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
    if (period === 'week') from.setDate(from.getDate() - ((from.getDay() + 6) % 7));
    const count = period === 'week' ? 7 : 1;
    const days = Array.from({ length: count }, (_, index) => new Date(from.getFullYear(), from.getMonth(), from.getDate() + index));
    const last = days[days.length - 1];
    const to = new Date(last.getFullYear(), last.getMonth(), last.getDate(), 23, 59, 59, 999);
    return { from, to, days };
};

/** Einen Zeitraum vor/zurück. */
export const shiftPeriod = (period: WorkPeriod, dateKey: string, step: number): string => {
    const { from } = periodBounds(period, dateKey);
    from.setDate(from.getDate() + step * (period === 'week' ? 7 : 1));
    return toDateKey(from);
};

/* ── Dokument ───────────────────────────────────────────────────────────── */

/** «2 sa 05 dk» — so wie der Gün sonu raporu die Zeit zeigt. */
export const hoursMinutesText = (t: Translate, ms: number): string => {
    const minutes = Math.round(Math.max(0, ms) / MINUTE_MS);
    return t(`${K}.daily.duration`, { hours: Math.floor(minutes / 60), minutes: pad(minutes % 60) });
};

const isWeekend = (day: Date) => day.getDay() === 0 || day.getDay() === 6;

/**
 * Messzeit je Kalendertag UND Aufgabe; eine Messung über Mitternacht wird
 * geteilt (die Tagesgrenzen kennt nur der Browser).
 */
const splitSessionsByDay = (sessions: WorkReportSession[]): Map<string, Map<string, number>> => {
    const byDay = new Map<string, Map<string, number>>();
    for (const session of sessions) {
        const start = new Date(session.startedAt);
        const end = session.endedAt ? new Date(session.endedAt) : new Date(start.getTime() + session.ms);
        if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) continue;
        let cursor = start;
        while (cursor < end) {
            const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
            const partEnd = nextDay < end ? nextDay : end;
            const key = toDateKey(cursor);
            const tasks = byDay.get(key) ?? new Map<string, number>();
            tasks.set(session.taskId, (tasks.get(session.taskId) ?? 0) + partEnd.getTime() - cursor.getTime());
            byDay.set(key, tasks);
            cursor = partEnd;
        }
    }
    return byDay;
};

const capitalize = (text: string, locale: string) => text.charAt(0).toLocaleUpperCase(locale) + text.slice(1);

const toFiles = (daily: DailyReport | undefined): WorkReportFile[] =>
    (daily?.files ?? []).map((file) => ({
        id: file.id,
        name: file.fileName,
        url: absoluteAttachmentUrl(file),
        isImage: file.isImage,
        isPdf: file.isPdf,
    }));

export const buildWorkReportDocument = (
    report: WorkReport,
    options: { period: WorkPeriod; t: Translate; locale: string; company: string },
): WorkReportDocument => {
    const { period, t, locale, company } = options;
    const dayFmt = new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' });
    const weekdayFmt = new Intl.DateTimeFormat(locale, { weekday: 'long' });
    const timeFmt = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' });

    const { days: periodDays } = periodBounds(period, toDateKey(new Date(report.from)));
    const generated = new Date(report.generatedAt);
    const person = report.employee.name || t(`${K}.unknownPerson`);
    const title = t(`${K}.title`);
    const periodText = period === 'week'
        ? t(`${K}.weekRange`, { from: dayFmt.format(periodDays[0]), to: dayFmt.format(periodDays[periodDays.length - 1]) })
        : `${capitalize(weekdayFmt.format(periodDays[0]), locale)}, ${dayFmt.format(periodDays[0])}`;
    const kindText = period === 'week' ? t(`${K}.kind.week`) : t(`${K}.kind.day`);

    /* Gün sonu raporları: Montag–Freitag immer, Wochenende nur mit Rapport oder Arbeit. */
    const dailyByDate = new Map((report.dailyReports ?? []).map((daily) => [daily.date, daily]));
    const timesByDate = splitSessionsByDay(report.sessions ?? []);
    const taskTitle = (taskId: string) => report.tasks?.[taskId]?.title || t(`${K}.unknownTask`);
    const days: WorkReportDay[] = periodDays
        .filter((day) => period === 'day' || !isWeekend(day)
            || dailyByDate.has(toDateKey(day)) || timesByDate.has(toDateKey(day)))
        .map((day) => {
            const key = toDateKey(day);
            const daily = dailyByDate.get(key);
            const weekday = capitalize(weekdayFmt.format(day), locale);
            const dateText = dayFmt.format(day);
            const times: WorkReportTime[] = [...(timesByDate.get(key) ?? new Map<string, number>())]
                .filter(([, ms]) => ms >= MINUTE_MS / 2)
                .map(([taskId, ms]) => ({ taskId, title: taskTitle(taskId), ms, duration: hoursMinutesText(t, ms) }))
                .sort((left, right) => right.ms - left.ms || left.title.localeCompare(right.title, locale));
            return {
                key,
                weekday,
                dateText,
                heading: `${weekday} · ${dateText}`,
                blocks: parseMarkdown(daily?.body ?? ''),
                files: toFiles(daily),
                times,
                total: hoursMinutesText(t, times.reduce((sum, entry) => sum + entry.ms, 0)),
                written: Boolean(daily),
            };
        });

    const safe = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
    const lastDay = periodDays[periodDays.length - 1];
    return {
        period,
        title,
        person,
        subtitle: `${kindText} · ${periodText}`,
        meta: [
            company,
            `${t(`${K}.meta.generatedAt`)} ${dayFmt.format(generated)} ${timeFmt.format(generated)}`,
        ].filter(Boolean).join(' · '),
        days,
        labels: {
            files: t(`${K}.daily.files`),
            missing: t(`${K}.daily.missing`),
            empty: t(`${K}.daily.empty`),
            worked: t(`${K}.daily.worked`),
            task: t(`${K}.col.task`),
            duration: t(`${K}.col.duration`),
            total: t(`${K}.total`),
        },
        footerLeft: `${title} · ${person} · ${periodText}`,
        pageLabel: (page, pages) => t(`${K}.page`, { page, pages }),
        fileName: safe(`${title}_${person}_${toDateKey(periodDays[0])}${period === 'week' ? `_${toDateKey(lastDay)}` : ''}`),
    };
};
