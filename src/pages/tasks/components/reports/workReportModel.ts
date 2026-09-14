import type { TaskStatus, WorkReport, WorkReportSession } from '@/types/tasksModule';

/**
 * ── ARBEITSRAPPORT EINER PERSON: DAS DOKUMENT (13.09.2026, Vorgabe Samet) ────
 *
 * «Rapor tek kişi için; günlük veya haftalık; sade, Arial, siyah beyaz,
 * tablolu.» Aus den Rohstoffen des Servers wird hier EIN Dokument aus fertigen
 * Texten gebaut — Vorschau und PDF lesen dasselbe:
 *
 *   Woche   NUR Tage und Aufgaben: je Tag die bearbeiteten Aufgaben mit ihrer
 *           Zeit, Tagestotal, am Ende das Wochentotal.
 *   Tag     ausführlicher: Aufgaben (Etiketten, Status, Zeit, heute abgehakt,
 *           Checkliste), Zeiteinträge, abgehakte Punkte, Kommentare.
 *
 * Messungen über Mitternacht werden auf die Tage verteilt. Die Datei kennt
 * weder i18n noch React: Übersetzer und Sprache kommen herein (so läuft sie
 * auch im Probedruck-Skript unter Node).
 */

export type WorkPeriod = 'day' | 'week';

export type Translate = (key: string, options?: Record<string, unknown>) => string;

export interface WorkColumn {
    header: string;
    /** Relative Breite; das PDF rechnet sie auf die Seitenbreite um. */
    width: number;
    align?: 'left' | 'right';
}

export interface WorkRow {
    cells: string[];
    /** Summenzeile (fett, Linie darüber). */
    total?: boolean;
    /** Beginn einer Gruppe (Tag): kräftigere Linie darüber. */
    groupStart?: boolean;
}

export interface WorkTable {
    title: string;
    columns: WorkColumn[];
    rows: WorkRow[];
    emptyText: string;
}

export interface WorkReportDocument {
    title: string;
    /** Name der Person. */
    person: string;
    period: string;
    meta: Array<{ label: string; value: string }>;
    tables: WorkTable[];
    footerLeft: string;
    pageLabel: (page: number, pages: number) => string;
    fileName: string;
}

const K = 'tasksModule.reports.work';

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

/* ── Formate ────────────────────────────────────────────────────────────── */

/** Stundenzettel-Form «7:45» — in jeder Sprache gleich lesbar. */
export const formatHours = (ms: number): string => {
    const minutes = Math.round(Math.max(0, ms) / 60_000);
    return `${Math.floor(minutes / 60)}:${pad(minutes % 60)}`;
};

const formatters = (locale: string) => ({
    day: new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'long' }),
    time: new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }),
});

/* ── Messungen auf Tage verteilen ───────────────────────────────────────── */

/** Eine Messung über Mitternacht wird zu je einer Zeile pro Tag. */
const splitSessionByDay = (session: WorkReportSession): WorkReportSession[] => {
    const start = new Date(session.startedAt);
    const end = session.endedAt ? new Date(session.endedAt) : new Date(start.getTime() + session.ms);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return [];
    const parts: WorkReportSession[] = [];
    let cursor = start;
    while (cursor < end) {
        const nextDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 1);
        const partEnd = nextDay < end ? nextDay : end;
        const tail = partEnd.getTime() === end.getTime();
        parts.push({
            taskId: session.taskId,
            startedAt: cursor.toISOString(),
            endedAt: tail && session.live ? null : partEnd.toISOString(),
            ms: partEnd.getTime() - cursor.getTime(),
            live: tail && session.live,
        });
        cursor = partEnd;
    }
    return parts;
};

/* ── Dokument ───────────────────────────────────────────────────────────── */

export const buildWorkReportDocument = (
    report: WorkReport,
    options: { period: WorkPeriod; t: Translate; locale: string; company: string },
): WorkReportDocument => {
    const { period, t, locale, company } = options;
    const fmt = formatters(locale);
    const from = new Date(report.from);
    const { days } = periodBounds(period, toDateKey(from));
    const dayLabel = (day: Date) => `${fmt.weekday.format(day)}, ${fmt.day.format(day)}`;
    const periodText = period === 'week'
        ? t(`${K}.weekRange`, { from: fmt.day.format(days[0]), to: fmt.day.format(days[days.length - 1]) })
        : dayLabel(from);
    const generated = new Date(report.generatedAt);
    const person = report.employee.name || t(`${K}.unknownPerson`);
    const title = t(`${K}.title`);
    const taskTitle = (id: string) => report.tasks[id]?.title ?? '';
    const statusText = (status: TaskStatus) => t(`tasksModule.status.${status}`);

    const segments = report.sessions.flatMap(splitSessionByDay)
        .sort((a, b) => new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime());
    const totalMs = segments.reduce((sum, segment) => sum + segment.ms, 0);

    const tables: WorkTable[] = [];

    if (period === 'week') {
        // Tag → Aufgabe → Zeit, in der Reihenfolge der ersten Messung des Tages.
        const rows: WorkRow[] = [];
        days.forEach((day) => {
            const key = toDateKey(day);
            const byTask = new Map<string, number>();
            for (const segment of segments) {
                if (toDateKey(new Date(segment.startedAt)) !== key) continue;
                byTask.set(segment.taskId, (byTask.get(segment.taskId) ?? 0) + segment.ms);
            }
            const weekend = day.getDay() === 0 || day.getDay() === 6;
            if (!byTask.size) {
                // Freie Wochenenden fallen weg; ein freier Werktag steht mit 0:00 da.
                if (!weekend) rows.push({ cells: [dayLabel(day), '–', formatHours(0)], groupStart: true });
                return;
            }
            let first = true;
            let dayMs = 0;
            byTask.forEach((ms, taskId) => {
                rows.push({ cells: [first ? dayLabel(day) : '', taskTitle(taskId), formatHours(ms)], groupStart: first });
                first = false;
                dayMs += ms;
            });
            if (byTask.size > 1) rows.push({ cells: ['', t(`${K}.dayTotal`), formatHours(dayMs)], total: true });
        });
        rows.push({ cells: [t(`${K}.weekTotal`), '', formatHours(totalMs)], total: true, groupStart: true });
        tables.push({
            title: t(`${K}.weekTitle`),
            columns: [
                { header: t(`${K}.col.date`), width: 42 },
                { header: t(`${K}.col.task`), width: 118 },
                { header: t(`${K}.col.time`), width: 20, align: 'right' },
            ],
            rows,
            emptyText: t(`${K}.noTasks`),
        });
    } else {
        const msByTask = new Map<string, number>();
        for (const segment of segments) msByTask.set(segment.taskId, (msByTask.get(segment.taskId) ?? 0) + segment.ms);
        const checkedByTask = new Map<string, number>();
        for (const item of report.checkedItems) checkedByTask.set(item.taskId, (checkedByTask.get(item.taskId) ?? 0) + 1);
        const taskIds = Object.keys(report.tasks).sort((a, b) =>
            (msByTask.get(b) ?? 0) - (msByTask.get(a) ?? 0) || taskTitle(a).localeCompare(taskTitle(b)));

        tables.push({
            title: t(`${K}.tasksTitle`),
            columns: [
                { header: t(`${K}.col.task`), width: 58 },
                { header: t(`${K}.col.labels`), width: 30 },
                { header: t(`${K}.col.status`), width: 26 },
                { header: t(`${K}.col.time`), width: 16, align: 'right' },
                { header: t(`${K}.col.checkedToday`), width: 22, align: 'right' },
                { header: t(`${K}.col.checklist`), width: 20, align: 'right' },
            ],
            rows: [
                ...taskIds.map((id): WorkRow => {
                    const task = report.tasks[id];
                    return {
                        cells: [
                            task.title,
                            task.labels.join(', '),
                            statusText(task.effectiveStatus),
                            formatHours(msByTask.get(id) ?? 0),
                            String(checkedByTask.get(id) ?? 0),
                            task.checkTotal ? `${task.checkDone}/${task.checkTotal}` : '–',
                        ],
                    };
                }),
                ...(taskIds.length ? [{ cells: [t(`${K}.total`), '', '', formatHours(totalMs), String(report.checkedItems.length), ''], total: true }] : []),
            ],
            emptyText: t(`${K}.noTasks`),
        });

        tables.push({
            title: t(`${K}.sessionsTitle`),
            columns: [
                { header: t(`${K}.col.start`), width: 18 },
                { header: t(`${K}.col.end`), width: 22 },
                { header: t(`${K}.col.task`), width: 120 },
                { header: t(`${K}.col.duration`), width: 20, align: 'right' },
            ],
            rows: [
                ...segments.map((segment): WorkRow => ({
                    cells: [
                        fmt.time.format(new Date(segment.startedAt)),
                        segment.live || !segment.endedAt ? t(`${K}.running`) : fmt.time.format(new Date(segment.endedAt)),
                        taskTitle(segment.taskId),
                        formatHours(segment.ms),
                    ],
                })),
                ...(segments.length ? [{ cells: ['', '', t(`${K}.total`), formatHours(totalMs)], total: true }] : []),
            ],
            emptyText: t(`${K}.noSessions`),
        });

        if (report.checkedItems.length) {
            tables.push({
                title: t(`${K}.checkedTitle`),
                columns: [
                    { header: t(`${K}.col.clock`), width: 18 },
                    { header: t(`${K}.col.task`), width: 62 },
                    { header: t(`${K}.col.item`), width: 100 },
                ],
                rows: report.checkedItems.map((item) => ({
                    cells: [fmt.time.format(new Date(item.doneAt)), taskTitle(item.taskId), item.text],
                })),
                emptyText: '',
            });
        }
        if (report.comments.length) {
            tables.push({
                title: t(`${K}.commentsTitle`),
                columns: [
                    { header: t(`${K}.col.clock`), width: 18 },
                    { header: t(`${K}.col.task`), width: 62 },
                    { header: t(`${K}.col.comment`), width: 100 },
                ],
                rows: report.comments.map((comment) => ({
                    cells: [fmt.time.format(new Date(comment.createdAt)), taskTitle(comment.taskId), comment.text],
                })),
                emptyText: '',
            });
        }
    }

    const kindText = period === 'week' ? t(`${K}.weekly`) : t(`${K}.daily`);
    const safe = (value: string) => value.replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_');
    return {
        title,
        person,
        period: periodText,
        meta: [
            { label: t(`${K}.meta.person`), value: person },
            { label: t(`${K}.meta.period`), value: `${kindText} · ${periodText}` },
            { label: t(`${K}.meta.totalTime`), value: formatHours(totalMs) },
            ...(company ? [{ label: t(`${K}.meta.company`), value: company }] : []),
            { label: t(`${K}.meta.generatedAt`), value: `${fmt.day.format(generated)} ${fmt.time.format(generated)}` },
        ],
        tables,
        footerLeft: `${title} · ${person} · ${periodText}`,
        pageLabel: (page, pages) => t(`${K}.page`, { page, pages }),
        fileName: safe(`${title}_${person}_${toDateKey(days[0])}${period === 'week' ? `_${toDateKey(days[days.length - 1])}` : ''}`),
    };
};
