/**
 * ── PERSONALBERICHTE ALS PDF ─────────────────────────────────────────────────
 *
 * Detailbericht, Buchhaltungsbericht und Buchhaltungs-Detailbericht. Alle drei
 * tragen die Gestaltung aus `modernReportKit.ts` — dieselbe, die Angebot,
 * Auftrag und die Rapporte tragen ("die moderne Vorlage aus dem Angebotsbereich",
 * Vorgabe): kodiert gezeichneter Briefkopf mit Wellenband, weiche Tabellenbänder,
 * feine Trennlinien, keine Hintergrund-Zusammenführung.
 *
 * Der Buchhaltungsbericht zeigt die Kennzahlen zusätzlich als KURZE KARTEN je
 * Person (Vorgabe) — die Zahlen, die im Bildschirm auf den Karten stehen, stehen
 * im PDF an derselben Stelle.
 *
 * WICHTIG: Gerechnet wird hier NICHTS. Die Zahlen kommen fertig aus dem Bericht
 * (Server) bzw. aus `pages/personnel/utils/personnel.ts` — sonst stünden im
 * Browser und im Druck zwei verschiedene Sollstunden.
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { getReportTranslator, type FixedTranslator } from '@/i18n/reportLanguage';
import {
    CONTENT_W, EMPTY, ML,
    COLOR_CARD_BG, COLOR_CARD_BORDER, COLOR_LABEL, COLOR_MUTED, COLOR_NAVY, COLOR_TEXT,
    FONT, FS_BASE,
    clean, decoratePages, downloadPdf, drawBandRow, drawCover, drawModernTable, drawSectionTitle,
    ensureSpace, fitFontSize, loadBrandAssets, registerFonts,
    type ModernColumn,
} from './modernReportKit';
import type {
    AccountingDetail,
    AccountingPersonRow,
    AccountingReport,
    DetailedReport,
    ReportDay,
} from '../../pages/personnel/types/personnel';
import { buildStaffOrdinals, formatDate, formatHours, formatHoursMinutes, formatDays, formatTime, staffNumberDisplay } from '../../pages/personnel/utils/format';
import { displayLeaveType } from '../../pages/personnel/utils/personnel';

export interface PersonnelPdfRange {
    startDate: string;
    endDate: string;
    firstName?: string | undefined;
    lastName?: string | undefined;
}

const rangeLabel = (range: PersonnelPdfRange) => `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`;

/**
 * Die Urlaubsart fürs PDF. Bei „Sonstiger Urlaub" gewinnt der Freitext, in dem
 * die antragstellende Person die Art selbst benannt hat — genau wie auf dem
 * Bildschirm (`utils/format.ts`). Beide Wege laufen über `displayLeaveType`,
 * damit im Rapport nichts anderes steht als in der Ansicht.
 */
const leaveTypeText = (
    flag: { leaveType: string; leaveTypeLabel: string | null },
    t: FixedTranslator,
): string => displayLeaveType(flag.leaveType, flag.leaveTypeLabel, t(`personnel.leaveType.${flag.leaveType}`));

const fileStamp = (range: PersonnelPdfRange) =>
    `${range.startDate}_${range.endDate}`.replace(/[^0-9_-]/g, '');

/** Die Kopfkarte, die alle drei Berichte teilen. */
const coverRows = (range: PersonnelPdfRange, t: FixedTranslator, extra: Array<{ label: string; value: string }> = []) => [
    { label: t('personnel.pdf.period'), value: rangeLabel(range), emphasize: true },
    { label: t('personnel.field.firstName'), value: clean(range.firstName) },
    { label: t('personnel.field.lastName'), value: clean(range.lastName) },
    { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
    ...extra.map((row) => ({ label: row.label, value: row.value })),
];

/**
 * Kurze Kennzahlkarten in einer Reihe. Sie sind das gedruckte Gegenstück zu den
 * Karten auf dem Bildschirm; die Spaltenzahl ergibt sich aus der Anzahl, damit
 * drei Werte nicht als drei schmale Streifen mit viel Luft dastehen.
 */
const drawStatCards = (
    doc: jsPDF,
    cards: Array<{ label: string; value: string; hint?: string }>,
    y: number,
): number => {
    if (cards.length === 0) return y;
    const perRow = cards.length <= 3 ? cards.length : Math.min(4, Math.ceil(cards.length / Math.ceil(cards.length / 4)));
    const gap = 3;
    const cardW = (CONTENT_W - gap * (perRow - 1)) / perRow;
    // Höher, sobald eine Karte eine Herkunftszeile trägt („laut Plan", „Pause
    // abgezogen") — sonst stiesse sie unten an den Rahmen.
    const hasHints = cards.some((card) => Boolean(card.hint));
    const cardH = hasHints ? 19 : 15;

    for (let index = 0; index < cards.length; index += perRow) {
        const row = cards.slice(index, index + perRow);
        y = ensureSpace(doc, y, cardH + 3);
        let x = ML;
        for (const card of row) {
            doc.setFillColor(...COLOR_CARD_BG);
            doc.setDrawColor(...COLOR_CARD_BORDER);
            doc.setLineWidth(0.25);
            doc.rect(x, y, cardW, cardH, 'FD');
            doc.setFillColor(...COLOR_NAVY);
            doc.rect(x, y, 1.1, cardH, 'F');

            doc.setFont(FONT, 'normal');
            doc.setTextColor(...COLOR_LABEL);
            fitFontSize(doc, card.label, cardW - 7, 7.2, 5.4);
            doc.text(card.label, x + 4, y + 5.6);

            doc.setFont(FONT, 'bold');
            doc.setTextColor(...COLOR_NAVY);
            fitFontSize(doc, card.value, cardW - 7, 12, 7);
            doc.text(card.value, x + 4, y + 12);

            if (card.hint) {
                doc.setFont(FONT, 'normal');
                doc.setTextColor(...COLOR_MUTED);
                fitFontSize(doc, card.hint, cardW - 7, 6.4, 5);
                doc.text(card.hint, x + 4, y + 16.4);
            }
            x += cardW + gap;
        }
        y += cardH + gap;
    }

    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    return y + 2;
};

/** Fusszeile eines Abschnitts: Hinweistext in Grau, umbrochen. */
const drawNote = (doc: jsPDF, text: string, y: number): number => {
    const value = clean(text);
    if (!value) return y;
    doc.setFont(FONT, 'italic');
    doc.setFontSize(7.6);
    doc.setTextColor(...COLOR_MUTED);
    const lines = doc.splitTextToSize(value, CONTENT_W) as string[];
    y = ensureSpace(doc, y, lines.length * 3.6 + 4);
    doc.text(lines, ML, y + 3);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(FS_BASE);
    doc.setTextColor(...COLOR_TEXT);
    return y + lines.length * 3.6 + 4;
};

// ─────────────────────────────────────────────────────────────────────────────
// 1. Detailbericht
// ─────────────────────────────────────────────────────────────────────────────

export const exportDetailedReportPdf = async (
    report: DetailedReport,
    range: PersonnelPdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    let y = drawCover(doc, {
        rows: coverRows(range, t, [
            { label: t('personnel.pdf.rowCount'), value: String(report.days.length) },
        ]),
        settings,
        title: t('personnel.pdf.detailedTitle'),
        subtitle: t('personnel.pdf.detailedSubtitle'),
    });

    /* EINE Zeile je Person und Tag, mit den DREI Zeiten nebeneinander:
       Schichtdauer, tatsächliche Arbeitszeit und Pausenzeit. Sie werden getrennt
       ausgewiesen und nicht gegeneinander verrechnet (Vorgabe) — es gilt immer
       Schichtdauer = Arbeitszeit + Pause.

       Elf Spalten auf A4 hoch sind eng; die Zeitspalten bekommen deshalb genug
       Breite für „8 Std. 15 Min." und der Kit bricht zur Not innerhalb der Zelle
       um, statt den Text abzuschneiden. */
    const columns: ModernColumn[] = [
        { header: t('personnel.field.staffNumber'), w: 12, align: 'right' },
        { header: t('personnel.field.firstName'), w: 21 },
        { header: t('personnel.field.lastName'), w: 23 },
        { header: t('personnel.field.createdAt'), w: 19, align: 'center' },
        { header: t('personnel.field.shiftDate'), w: 19, align: 'center' },
        { header: t('personnel.field.checkIn'), w: 14, align: 'center' },
        { header: t('personnel.field.checkOut'), w: 14, align: 'center' },
        { header: t('personnel.field.shiftDuration'), w: 20, align: 'right' },
        { header: t('personnel.field.actualWork'), w: 20, align: 'right' },
        { header: t('personnel.field.breakDuration'), w: CONTENT_W - 12 - 21 - 23 - 19 - 19 - 14 - 14 - 20 - 20, align: 'right' },
    ];

    const ordinals = buildStaffOrdinals(report.days.map((day) => day.employeeId));
    const rows = report.days.map((day: ReportDay) => [
        staffNumberDisplay(day.staffNumber, ordinals.get(day.employeeId)),
        day.firstName,
        day.lastName,
        formatDate(day.employeeCreatedAt),
        formatDate(day.workDate),
        formatTime(day.startedAt),
        day.endedAt ? formatTime(day.endedAt) : t('personnel.clock.stillIn'),
        day.open ? EMPTY : formatHoursMinutes(day.grossSeconds),
        formatHoursMinutes(day.actualWorkSeconds),
        day.open ? EMPTY : formatHoursMinutes(day.breakSeconds),
    ]);

    if (rows.length === 0) {
        y = drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        y = drawModernTable(doc, columns, rows, y);
        const totals = report.days.reduce(
            (sum, day) => ({
                gross: sum.gross + day.grossSeconds,
                actual: sum.actual + day.actualWorkSeconds,
                breaks: sum.breaks + day.breakSeconds,
            }),
            { gross: 0, actual: 0, breaks: 0 },
        );
        y = drawBandRow(doc, t('personnel.field.shiftDuration'), formatHoursMinutes(totals.gross), y + 2);
        y = drawBandRow(doc, t('personnel.field.breakDuration'), formatHoursMinutes(totals.breaks), y);
        y = drawBandRow(doc, t('personnel.field.actualWork'), formatHoursMinutes(totals.actual), y, true);
    }

    // Abwesenheiten stehen als eigener Abschnitt darunter — im Bildschirm sind
    // sie das Ausrufezeichen neben dem Namen, gedruckt braucht es eine Liste.
    if (report.flags.length > 0) {
        y = drawSectionTitle(doc, t('personnel.pdf.absencesTitle'), y + 4);
        const flagColumns: ModernColumn[] = [
            { header: t('personnel.field.name'), w: 58 },
            { header: t('personnel.field.leaveType'), w: 44 },
            { header: t('personnel.pdf.period'), w: 46, align: 'center' },
            { header: t('personnel.field.days'), w: 16, align: 'right' },
            { header: t('personnel.field.status'), w: CONTENT_W - 58 - 44 - 46 - 16 },
        ];
        const nameOf = (employeeId: string) => {
            const match = report.days.find((day) => day.employeeId === employeeId);
            return match ? `${match.firstName} ${match.lastName}` : EMPTY;
        };
        y = drawModernTable(doc, flagColumns, report.flags.map((flag) => [
            nameOf(flag.employeeId),
            leaveTypeText(flag, t),
            `${formatDate(flag.startDate)} – ${formatDate(flag.endDate)}`,
            String(flag.totalDays),
            t(`personnel.leaveStatus.${flag.status}`),
        ]), y);
    }

    drawNote(doc, t('personnel.pdf.detailedNote'), y + 3);
    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${t('personnel.pdf.detailedFile')}-${fileStamp(range)}.pdf`);
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 2. Buchhaltungsbericht
// ─────────────────────────────────────────────────────────────────────────────

/** Die Kennzahlzeile des Buchhaltungsberichts (auch am Bildschirm dieselbe). */
export const accountingBasisCards = (basis: AccountingReport['basis'], t: FixedTranslator) => [
    { label: t('personnel.accounting.totalDays'), value: String(basis.totalDays) },
    { label: t('personnel.accounting.workdays'), value: String(basis.workdays), hint: t('personnel.accounting.perPlan') },
    { label: t('personnel.accounting.publicHolidays'), value: String(basis.publicHolidays), hint: t('personnel.accounting.daysDeducted') },
    { label: t('personnel.accounting.actualWorkdays'), value: String(basis.actualWorkdays) },
    { label: t('personnel.accounting.dailyNetHours'), value: formatHours(basis.dailyNetHours), hint: t('personnel.accounting.breakDeducted') },
    { label: t('personnel.accounting.targetHours'), value: formatHours(basis.targetHours), hint: t('personnel.accounting.perPerson') },
];

export const exportAccountingReportPdf = async (
    report: AccountingReport,
    range: PersonnelPdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    let y = drawCover(doc, {
        rows: coverRows(range, t, [
            { label: t('personnel.accounting.publicHolidays'), value: String(report.basis.publicHolidays) },
            { label: t('personnel.pdf.staffCount'), value: String(report.rows.length) },
        ]),
        settings,
        title: t('personnel.pdf.accountingTitle'),
        subtitle: t('personnel.accounting.description'),
    });

    // Die Bemessungsgrundlage zuerst — sie erklärt jede Zahl darunter.
    y = drawStatCards(doc, accountingBasisCards(report.basis, t), y + 1);

    const columns: ModernColumn[] = [
        { header: t('personnel.field.staffNumber'), w: 18, align: 'right' },
        { header: t('personnel.field.firstName'), w: 30 },
        { header: t('personnel.field.lastName'), w: 34 },
        { header: t('personnel.pdf.period'), w: 44, align: 'center' },
        { header: t('personnel.accounting.totalHours'), w: 24, align: 'right' },
        { header: t('personnel.accounting.daysShort'), w: 16, align: 'right' },
        { header: t('personnel.accounting.extraDays'), w: CONTENT_W - 18 - 30 - 34 - 44 - 24 - 16, align: 'right' },
    ];

    const ordinals = buildStaffOrdinals(report.rows.map((person) => person.employeeId));
    const rows = report.rows.map((person: AccountingPersonRow) => [
        staffNumberDisplay(person.staffNumber, ordinals.get(person.employeeId)),
        person.firstName,
        person.lastName,
        rangeLabel(range),
        formatHours(person.totalHours),
        formatDays(person.daysShort),
        formatDays(person.extraDays),
    ]);

    if (rows.length === 0) {
        drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        y = drawModernTable(doc, columns, rows, y);
        const totalHours = report.rows.reduce((sum, person) => sum + person.totalHours, 0);
        y = drawBandRow(doc, t('personnel.accounting.totalHours'), formatHours(totalHours), y + 2, true);

        // Personen MIT Abwesenheit werden ausdrücklich genannt: am Bildschirm
        // steht dort das Ausrufezeichen, auf Papier wäre es sonst verloren.
        const flagged = report.rows.filter((person) => person.flags.length > 0);
        if (flagged.length > 0) {
            y = drawSectionTitle(doc, t('personnel.pdf.absencesTitle'), y + 4);
            const flagColumns: ModernColumn[] = [
                { header: t('personnel.field.name'), w: 58 },
                { header: t('personnel.field.leaveType'), w: 44 },
                { header: t('personnel.pdf.period'), w: 46, align: 'center' },
                { header: t('personnel.field.status'), w: CONTENT_W - 58 - 44 - 46 },
            ];
            y = drawModernTable(doc, flagColumns, flagged.flatMap((person) => person.flags.map((flag) => [
                `${person.firstName} ${person.lastName}`,
                leaveTypeText(flag, t),
                `${formatDate(flag.startDate)} – ${formatDate(flag.endDate)}`,
                t(`personnel.leaveStatus.${flag.status}`),
            ])), y, { mergeFirstColumn: true });
        }
    }

    drawNote(doc, t('personnel.pdf.accountingNote'), y + 3);
    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${t('personnel.pdf.accountingFile')}-${fileStamp(range)}.pdf`);
    return null;
};

// ─────────────────────────────────────────────────────────────────────────────
// 3. Buchhaltungs-Detailbericht (eine Person, Tag für Tag)
// ─────────────────────────────────────────────────────────────────────────────

export const exportAccountingDetailPdf = async (
    detail: AccountingDetail,
    range: PersonnelPdfRange,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const person = detail.person;
    if (!person) return null;

    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    const totalHours = detail.totalSeconds / 3600;
    const difference = totalHours - detail.basis.targetHours;

    let y = drawCover(doc, {
        rows: [
            { label: t('personnel.field.staffNumber'), value: person.staffNumber == null ? EMPTY : String(person.staffNumber), emphasize: true },
            { label: t('personnel.pdf.period'), value: rangeLabel(range) },
            { label: t('personnel.field.createdAt'), value: formatDate(person.createdAt) },
            { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
        ],
        settings,
        recipientName: `${person.firstName} ${person.lastName}`,
        title: t('personnel.pdf.accountingDetailTitle'),
        subtitle: t('personnel.pdf.accountingDetailSubtitle'),
    });

    y = drawStatCards(doc, [
        { label: t('personnel.accounting.targetHours'), value: formatHours(detail.basis.targetHours) },
        { label: t('personnel.accounting.totalHours'), value: formatHours(totalHours) },
        {
            label: difference < 0 ? t('personnel.accounting.daysShort') : t('personnel.accounting.extraDays'),
            value: formatDays(Math.abs(difference) / (detail.basis.dailyNetHours || 1)),
        },
        { label: t('personnel.accounting.dailyNetHours'), value: formatHours(detail.basis.dailyNetHours) },
    ], y + 1);

    const columns: ModernColumn[] = [
        { header: t('personnel.field.shiftDate'), w: 26, align: 'center' },
        { header: t('personnel.field.checkIn'), w: 22, align: 'center' },
        { header: t('personnel.field.checkOut'), w: 22, align: 'center' },
        { header: t('personnel.field.duration'), w: 24, align: 'right' },
        { header: t('personnel.accounting.dayTarget'), w: 24, align: 'right' },
        { header: t('personnel.field.leaveType'), w: CONTENT_W - 26 - 22 - 22 - 24 - 24 },
    ];

    // Ein Tag kann mehrere Fenster haben (Pausen). Jedes bekommt seine Zeile;
    // planfreie Tage OHNE Stempelung stehen gar nicht erst da — sie wären eine
    // Seite voll leerer Zeilen.
    const rows: string[][] = [];
    for (const day of detail.days) {
        if (day.entries.length === 0) {
            if (!day.isWorkday && !day.leave) continue;
            rows.push([
                formatDate(day.date),
                EMPTY,
                EMPTY,
                formatHoursMinutes(0),
                formatHoursMinutes(day.targetSeconds),
                day.leave ? leaveTypeText(day.leave, t) : EMPTY,
            ]);
            continue;
        }
        day.entries.forEach((entry, index) => {
            rows.push([
                formatDate(day.date),
                formatTime(entry.startedAt),
                entry.endedAt ? formatTime(entry.endedAt) : t('personnel.clock.stillIn'),
                formatHoursMinutes(entry.durationSeconds),
                // Das Tagessoll steht nur EINMAL je Tag — sonst summierte es
                // sich beim Lesen über die Pausenzeilen hinweg.
                index === 0 ? formatHoursMinutes(day.targetSeconds) : EMPTY,
                day.leave ? leaveTypeText(day.leave, t) : EMPTY,
            ]);
        });
    }

    if (rows.length === 0) {
        y = drawBandRow(doc, t('personnel.pdf.noRows'), '', y);
    } else {
        y = drawModernTable(doc, columns, rows, y, { mergeFirstColumn: true });
        y = drawBandRow(doc, t('personnel.accounting.totalHours'), formatHours(totalHours), y + 2, true);
    }

    drawNote(doc, t('personnel.pdf.accountingDetailNote'), y + 3);
    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    const safeName = `${person.firstName}-${person.lastName}`.replace(/[\\/:*?"<>|\s]+/g, '-').slice(0, 60);
    downloadPdf(bytes, `${t('personnel.pdf.accountingDetailFile')}-${safeName}-${fileStamp(range)}.pdf`);
    return null;
};
