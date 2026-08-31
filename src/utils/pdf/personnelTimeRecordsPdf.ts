/**
 * ── ARBEITSZEITNACHWEIS ALS PDF (26.08.2026, Vorgabe Samet) ─────────────────
 *
 * «Einen Arbeitszeitbericht / Zeiterfassungsbericht als PDF erzeugen.»
 *
 * Der Bericht der Arbeitszeiterfassung (alle gesuchten Personen) und der
 * Nachweis EINER Person tragen dieselbe Gestaltung wie Angebot, Auftrag und
 * die Rapporte — `modernReportKit.ts`. Der Unterschied ist nur der Umfang:
 *
 *   exportTimeRecordsPdf   je Person eine Zeile mit den Summen, danach die
 *                          Tageszeilen aller Personen.
 *   exportPersonTimeLogPdf der Nachweis EINER Person: Kennzahlkarten, die
 *                          Tageszeilen und darunter die Fehltage.
 *
 * GERECHNET WIRD HIER NICHTS. Die Zahlen kommen fertig vom Server; sonst
 * stünden im Browser und im Druck zwei verschiedene Sollstunden.
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import {
    CONTENT_W, EMPTY,
    clean, decoratePages, downloadPdf, drawBandRow, drawCover, drawModernTable, drawSectionTitle,
    loadBrandAssets, registerFonts,
    type ModernColumn,
} from './modernReportKit';
import type {
    AbsenceDay,
    AbsenceRow,
    PersonTimeLog,
    ReportDay,
    TimeRecordResult,
} from '../../pages/personnel/types/personnel';
import {
    buildStaffOrdinals,
    formatDate,
    formatDays,
    formatHours,
    formatHoursMinutes,
    formatTime,
    staffNumberDisplay,
} from '../../pages/personnel/utils/format';

interface PdfRange {
    startDate: string;
    endDate: string;
    search?: string;
}

const rangeLabel = (range: PdfRange) => `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`;

const fileStamp = (range: PdfRange) => `${range.startDate}_${range.endDate}`.replace(/[^0-9_-]/g, '');

/** Die Tagesspalten — in BEIDEN Berichten dieselben. */
const dayColumns = (t: FixedTranslator, withName: boolean): ModernColumn[] => {
    const nameW = withName ? 42 : 0;
    return [
        ...(withName ? [{ header: t('personnel.field.name'), w: nameW }] : []),
        { header: t('personnel.field.shiftDate'), w: 22, align: 'center' as const },
        { header: t('personnel.field.checkIn'), w: 16, align: 'center' as const },
        { header: t('personnel.field.checkOut'), w: 16, align: 'center' as const },
        { header: t('personnel.field.shiftDuration'), w: 26, align: 'right' as const },
        { header: t('personnel.field.actualWork'), w: 26, align: 'right' as const },
        { header: t('personnel.field.breakDuration'), w: CONTENT_W - nameW - 22 - 16 - 16 - 26 - 26, align: 'right' as const },
    ];
};

const dayRow = (day: ReportDay, t: FixedTranslator, withName: boolean): string[] => [
    ...(withName ? [`${day.firstName} ${day.lastName}`.trim()] : []),
    formatDate(day.workDate),
    formatTime(day.startedAt),
    day.endedAt ? formatTime(day.endedAt) : t('personnel.clock.stillIn'),
    day.open ? EMPTY : formatHoursMinutes(day.grossSeconds),
    formatHoursMinutes(day.actualWorkSeconds),
    day.open ? EMPTY : formatHoursMinutes(day.breakSeconds),
];

/** Die Fehltage als Abschnitt — auf dem Bildschirm ein Chip, gedruckt eine Liste. */
const drawAbsences = (
    doc: jsPDF,
    absences: AbsenceDay[],
    t: FixedTranslator,
    y: number,
): number => {
    if (absences.length === 0) return y;
    y = drawSectionTitle(doc, t('personnel.pdf.absencesTitle'), y + 4);
    const columns: ModernColumn[] = [
        { header: t('personnel.field.shiftDate'), w: 28, align: 'center' },
        { header: t('personnel.requests.type'), w: 44 },
        { header: t('personnel.field.note'), w: CONTENT_W - 28 - 44 - 26 },
        { header: t('personnel.field.status'), w: 26, align: 'center' },
    ];
    return drawModernTable(doc, columns, absences.map((absence) => [
        formatDate(absence.date),
        t(`personnel.absence.${absence.kind}`),
        clean(absence.label),
        absence.pending ? t('personnel.leaveStatus.PENDING_MANAGER') : EMPTY,
    ]), y);
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Die Arbeitszeiterfassung (alle gesuchten Personen)
// ─────────────────────────────────────────────────────────────────────────────

export const exportTimeRecordsPdf = async (
    result: TimeRecordResult,
    range: PdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    let y = drawCover(doc, {
        rows: [
            { label: t('personnel.pdf.period'), value: rangeLabel(range), emphasize: true },
            { label: t('personnel.timeRecords.searchLabel'), value: clean(range.search) },
            { label: t('personnel.timeRecords.peopleLabel'), value: String(result.people.length) },
            { label: t('personnel.accounting.workdays'), value: result.basis ? formatDays(result.basis.workdays) : EMPTY },
            { label: t('personnel.accounting.targetHours'), value: result.basis ? formatHours(result.basis.targetHours) : EMPTY },
            { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
        ],
        settings,
        title: t('personnel.pdf.timeRecordsTitle'),
        subtitle: t('personnel.pdf.timeRecordsSubtitle'),
        numberedSections: true,
    });

    // ── Abschnitt 1: eine Zeile je Person ────────────────────────────────────
    y = drawSectionTitle(doc, t('personnel.pdf.perPersonTitle'), y);

    const summaryColumns: ModernColumn[] = [
        { header: t('personnel.field.staffNumber'), w: 14, align: 'right' },
        { header: t('personnel.field.firstName'), w: 26 },
        { header: t('personnel.field.lastName'), w: 28 },
        { header: t('personnel.field.actualWork'), w: 26, align: 'right' },
        { header: t('personnel.accounting.targetHours'), w: 20, align: 'right' },
        { header: t('personnel.timeRecords.presentDays'), w: 18, align: 'right' },
        { header: t('personnel.timeRecords.absentDays'), w: 18, align: 'right' },
        { header: t('personnel.accounting.daysShort'), w: 18, align: 'right' },
        { header: t('personnel.accounting.extraDays'), w: CONTENT_W - 14 - 26 - 28 - 26 - 20 - 18 - 18 - 18, align: 'right' },
    ];

    const ordinals = buildStaffOrdinals(result.people.map((person) => person.employeeId));

    if (result.people.length === 0) {
        y = drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        y = drawModernTable(doc, summaryColumns, result.people.map((person) => [
            staffNumberDisplay(person.staffNumber, ordinals.get(person.employeeId)),
            person.firstName,
            person.lastName,
            formatHoursMinutes(person.totalSeconds),
            formatHours(person.targetHours),
            String(person.presentDays),
            String(person.absentDays),
            formatDays(person.daysShort),
            formatDays(person.extraDays),
        ]), y, { reserveAfter: 12 });

        const totalSeconds = result.people.reduce((sum, person) => sum + person.totalSeconds, 0);
        y = drawBandRow(doc, t('personnel.field.actualWork'), formatHoursMinutes(totalSeconds), y + 2, true);
    }

    // ── Abschnitt 2: die Tageszeilen ─────────────────────────────────────────
    if (result.days.length > 0) {
        y = drawSectionTitle(doc, t('personnel.pdf.perDayTitle'), y + 4);
        const ordered = [...result.days].sort((a, b) =>
            a.lastName.localeCompare(b.lastName)
            || a.firstName.localeCompare(b.firstName)
            || a.workDate.localeCompare(b.workDate));
        /* `mergeFirstColumn`: der Name steht einmal je Person und nicht in
           jeder ihrer Zeilen — auf einem Monatsbericht sind das zwanzig
           Wiederholungen desselben Wortes untereinander. */
        drawModernTable(doc, dayColumns(t, true), ordered.map((day) => dayRow(day, t, true)), y, {
            mergeFirstColumn: true,
        });
    }

    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${t('personnel.pdf.timeRecordsFile')}-${fileStamp(range)}.pdf`);
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1b. Die Abwesenheiten eines Monats (Fenster «Abwesenheiten», 27.08.2026)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * «Aus dem Abwesenheitsfenster direkt ein PDF in Tabellenform»: je Zeile eine
 * Person und ein Fehltag, mit Art und Vermerk. Gerechnet wird nichts — die
 * Zeilen kommen fertig vom Server (/personnel/absences).
 */
export const exportAbsencesPdf = async (
    rows: AbsenceRow[],
    range: PdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    let y = drawCover(doc, {
        rows: [
            { label: t('personnel.pdf.period'), value: rangeLabel(range), emphasize: true },
            { label: t('personnel.pdf.absencesTitle'), value: String(rows.length) },
            { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
        ],
        settings,
        title: t('personnel.pdf.absencesTitle'),
        subtitle: rangeLabel(range),
    });

    if (rows.length === 0) {
        y = drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        const columns: ModernColumn[] = [
            { header: t('personnel.field.name'), w: 52 },
            { header: t('personnel.field.shiftDate'), w: 26, align: 'center' },
            { header: t('personnel.requests.type'), w: 36 },
            { header: t('personnel.field.note'), w: CONTENT_W - 52 - 26 - 36 - 28 },
            { header: t('personnel.field.status'), w: 28, align: 'center' },
        ];
        const ordered = [...rows].sort((a, b) =>
            a.lastName.localeCompare(b.lastName)
            || a.firstName.localeCompare(b.firstName)
            || a.date.localeCompare(b.date));
        drawModernTable(doc, columns, ordered.map((row) => [
            `${row.firstName} ${row.lastName}`.trim(),
            formatDate(row.date),
            t(`personnel.absence.${row.kind}`),
            clean(row.label),
            row.pending ? t('personnel.leaveStatus.PENDING_MANAGER') : EMPTY,
        ]), y, { mergeFirstColumn: true });
    }

    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${t('personnel.pdf.absencesFile')}-${fileStamp(range)}.pdf`);
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Der Nachweis EINER Person (Reiter «Arbeitszeiten» der Personenseite)
// ─────────────────────────────────────────────────────────────────────────────

export const exportPersonTimeLogPdf = async (
    log: PersonTimeLog,
    range: PdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    const name = `${log.person.firstName} ${log.person.lastName}`.trim();

    let y = drawCover(doc, {
        rows: [
            { label: t('personnel.field.name'), value: name, emphasize: true },
            { label: t('personnel.field.staffNumber'), value: staffNumberDisplay(log.person.staffNumber, 1) },
            { label: t('personnel.pdf.period'), value: rangeLabel(range) },
            { label: t('personnel.field.actualWork'), value: formatHoursMinutes(log.totals.actualSeconds) },
            { label: t('personnel.accounting.targetHours'), value: formatHours(log.basis.targetHours) },
            { label: t('personnel.timeRecords.presentDays'), value: String(log.totals.presentDays) },
            { label: t('personnel.timeRecords.absentDays'), value: String(log.totals.absentDays) },
            { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
        ],
        settings,
        title: t('personnel.pdf.timeLogTitle'),
        subtitle: name,
        numberedSections: true,
    });

    y = drawSectionTitle(doc, t('personnel.pdf.perDayTitle'), y);

    if (log.days.length === 0) {
        y = drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        y = drawModernTable(doc, dayColumns(t, false), log.days.map((day) => dayRow(day, t, false)), y, {
            reserveAfter: 20,
        });
        y = drawBandRow(doc, t('personnel.field.shiftDuration'), formatHoursMinutes(log.totals.grossSeconds), y + 2);
        y = drawBandRow(doc, t('personnel.field.breakDuration'), formatHoursMinutes(log.totals.breakSeconds), y);
        y = drawBandRow(doc, t('personnel.field.actualWork'), formatHoursMinutes(log.totals.actualSeconds), y, true);
    }

    drawAbsences(doc, log.absences, t, y);
    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    const safeName = name.replace(/[^\w-]+/g, '_');
    downloadPdf(bytes, `${t('personnel.pdf.timeLogFile')}-${safeName}-${fileStamp(range)}.pdf`);
    return null;
};
