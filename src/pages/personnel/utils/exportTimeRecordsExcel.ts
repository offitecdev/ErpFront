/**
 * ── ARBEITSZEITERFASSUNG → EXCEL (26.08.2026, Vorgabe Samet) ─────────────────
 *
 * «PDF und Excel ganz oben über der Liste.» Das PDF ist das Dokument, die
 * Excel-Datei ist das WEITERRECHNEN — sie geht in die Lohnbuchhaltung, und
 * dort wird sortiert, gefiltert und summiert. Deshalb:
 *
 *   • ZWEI Blätter. «Übersicht» ist die Liste, wie sie auf dem Bildschirm
 *     steht (eine Zeile je Person); «Tage» sind die Tageszeilen darunter, mit
 *     dem Namen in jeder Zeile — eine Pivot-Tabelle braucht ihn dort, eine
 *     Gruppierung über verbundene Zellen kann sie nicht lesen.
 *
 *   • ZAHLEN BLEIBEN ZAHLEN. Die Stunden stehen als Dezimalzahl (8.25), nicht
 *     als «8 Std. 15 Min.»: eine Zeichenkette lässt sich nicht summieren, und
 *     genau das ist der Zweck der Datei. Die lesbare Schreibweise steht im PDF.
 *
 * `xlsx` wird NUR hier dynamisch geladen (wie beim Bestell-Export) und kommt
 * damit nicht ins Hauptpaket.
 */
import { t } from '@/i18n/translate';

import type { ReportDay, TimeRecordResult } from '../types/personnel';
import { formatDate, formatTime, staffNumberDisplay } from './format';

interface ExportRange {
    startDate: string;
    endDate: string;
    search?: string;
}

/** Sekunden als Dezimalstunden mit zwei Stellen — die Zahl, mit der gerechnet wird. */
const decimalHours = (seconds: number): number => Math.round((seconds / 3600) * 100) / 100;

const sheetName = (value: string) => value.slice(0, 31);

export const exportTimeRecordsExcel = async (
    result: TimeRecordResult,
    range: ExportRange,
): Promise<void> => {
    const XLSX = await import('xlsx');

    const periodLine = `${formatDate(range.startDate)} – ${formatDate(range.endDate)}`;

    // ── Blatt 1: eine Zeile je Person ────────────────────────────────────────
    const summaryHeader = [
        t('personnel.field.staffNumber'),
        t('personnel.field.firstName'),
        t('personnel.field.lastName'),
        t('personnel.field.email'),
        t('personnel.field.actualWork'),
        t('personnel.accounting.targetHours'),
        t('personnel.timeRecords.presentDays'),
        t('personnel.timeRecords.absentDays'),
        t('personnel.requestType.VACATION'),
        t('personnel.requestType.SICK'),
        t('personnel.accounting.daysShort'),
        t('personnel.accounting.extraDays'),
    ];

    const summaryRows = result.people.map((person, index) => [
        staffNumberDisplay(person.staffNumber, index + 1),
        person.firstName,
        person.lastName,
        person.email,
        decimalHours(person.totalSeconds),
        person.targetHours,
        person.presentDays,
        person.absentDays,
        person.leaveDays,
        person.sickDays,
        person.daysShort,
        person.extraDays,
    ]);

    const summary = XLSX.utils.aoa_to_sheet([
        [t('personnel.timeRecords.title')],
        [t('personnel.pdf.period'), periodLine],
        ...(range.search?.trim() ? [[t('personnel.timeRecords.searchLabel'), range.search.trim()]] : []),
        [],
        summaryHeader,
        ...summaryRows,
    ]);
    summary['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 28 },
        { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 12 },
        { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 },
    ];

    // ── Blatt 2: die Tageszeilen ─────────────────────────────────────────────
    const byPerson = new Map(result.people.map((person) => [person.employeeId, person]));
    const dayHeader = [
        t('personnel.field.staffNumber'),
        t('personnel.field.firstName'),
        t('personnel.field.lastName'),
        t('personnel.field.shiftDate'),
        t('personnel.field.checkIn'),
        t('personnel.field.checkOut'),
        t('personnel.field.shiftDuration'),
        t('personnel.field.actualWork'),
        t('personnel.field.breakDuration'),
    ];

    const dayRow = (day: ReportDay, ordinal: number) => [
        staffNumberDisplay(day.staffNumber, ordinal),
        day.firstName,
        day.lastName,
        formatDate(day.workDate),
        day.startedAt ? formatTime(day.startedAt) : '',
        day.endedAt ? formatTime(day.endedAt) : t('personnel.clock.stillIn'),
        day.open ? '' : decimalHours(day.grossSeconds),
        decimalHours(day.actualWorkSeconds),
        day.open ? '' : decimalHours(day.breakSeconds),
    ];

    const ordinals = new Map([...byPerson.keys()].map((id, index) => [id, index + 1]));
    const dayRows = [...result.days]
        .sort((a, b) => a.lastName.localeCompare(b.lastName)
            || a.firstName.localeCompare(b.firstName)
            || a.workDate.localeCompare(b.workDate))
        .map((day) => dayRow(day, ordinals.get(day.employeeId) ?? 0));

    const days = XLSX.utils.aoa_to_sheet([dayHeader, ...dayRows]);
    days['!cols'] = [
        { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 14 },
        { wch: 10 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
    ];

    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, summary, sheetName(t('personnel.timeRecords.sheetSummary')));
    XLSX.utils.book_append_sheet(book, days, sheetName(t('personnel.timeRecords.sheetDays')));

    const buffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `Arbeitszeit_${range.startDate}_${range.endDate}.xlsx`.replace(/[^\w.-]/g, '_');
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};
