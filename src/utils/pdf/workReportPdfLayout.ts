import type { jsPDF } from 'jspdf';

import type { WorkReportDocument, WorkRow, WorkTable } from '../../pages/tasks/components/reports/workReportModel';

/**
 * ── ARBEITSRAPPORT: DAS BLATT (13.09.2026, Vorgabe Samet) ────────────────────
 *
 * «Bizim tasarımımızla bir alakası olmamalı — Arial, düz siyah beyaz, tablolu.»
 * Absichtlich OHNE das Haus-Kit (modernReportKit): kein Logo, keine Welle,
 * keine Farben. Schwarz auf Weiss, Arial, dünne schwarze Linien — EINE Person:
 *
 *   Kopf          Titel, darunter Person/Zeitraum/Gesamtzeit/Firma/erstellt am
 *   Tabellen      Woche: Tag · Aufgabe · Zeit — Tag: Aufgaben, Zeiteinträge, …
 *   jede Seite    Fusszeile: Rapport · Person · Zeitraum links, «Seite x / y» rechts
 *
 * Reines Zeichnen ohne Vite-Importe: die Schrift registriert der Aufrufer
 * (`fontName`), so läuft das Blatt auch im Probedruck-Skript unter Node.
 */

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 15;
const MARGIN_TOP = 16;
const FOOTER_Y = PAGE_H - 10;
const BOTTOM = PAGE_H - 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const TEXT_PT = 9;
const HEAD_PT = 8.5;
const PAD_X = 1.6;
const PAD_Y = 1.5;
const LINE_MM = TEXT_PT * 0.3528 * 1.18;

export const drawWorkReportPdf = (doc: jsPDF, report: WorkReportDocument, fontName: string): void => {
    let y = MARGIN_TOP;

    const font = (style: 'normal' | 'bold', size: number) => {
        doc.setFont(fontName, style);
        doc.setFontSize(size);
    };
    const rule = (width: number) => {
        doc.setLineWidth(width);
        doc.line(MARGIN_X, y, MARGIN_X + CONTENT_W, y);
    };

    const columnWidths = (table: WorkTable): number[] => {
        const sum = table.columns.reduce((total, column) => total + column.width, 0) || 1;
        return table.columns.map((column) => (column.width / sum) * CONTENT_W);
    };

    const wrap = (cells: string[], widths: number[]): string[][] =>
        cells.map((cell, index) => doc.splitTextToSize(String(cell ?? ''), widths[index] - PAD_X * 2) as string[]);

    const heightOf = (lines: string[][]): number =>
        Math.max(1, ...lines.map((cell) => cell.length)) * LINE_MM + PAD_Y * 2;

    const drawCells = (lines: string[][], widths: number[], aligns: Array<'left' | 'right' | undefined>) => {
        let x = MARGIN_X;
        lines.forEach((cell, index) => {
            cell.forEach((text, lineIndex) => {
                const baseline = y + PAD_Y + LINE_MM * (lineIndex + 1) - LINE_MM * 0.22;
                if (aligns[index] === 'right') doc.text(text, x + widths[index] - PAD_X, baseline, { align: 'right' });
                else doc.text(text, x + PAD_X, baseline);
            });
            x += widths[index];
        });
        y += heightOf(lines);
    };

    const drawHeader = (table: WorkTable, widths: number[]) => {
        font('bold', HEAD_PT);
        rule(0.35);
        drawCells(wrap(table.columns.map((column) => column.header), widths), widths, table.columns.map((column) => column.align));
        rule(0.35);
    };

    const drawTable = (table: WorkTable) => {
        const widths = columnWidths(table);
        const aligns = table.columns.map((column) => column.align);
        // Titel nie allein unten auf der Seite: Titel + Kopf + eine Zeile müssen passen.
        if (y + 24 > BOTTOM) {
            doc.addPage();
            y = MARGIN_TOP;
        }
        font('bold', 10.5);
        doc.text(table.title, MARGIN_X, y + 4);
        y += 6.5;
        drawHeader(table, widths);

        if (!table.rows.length) {
            font('normal', TEXT_PT);
            drawCells([[table.emptyText]], [CONTENT_W], [undefined]);
            rule(0.35);
            y += 7;
            return;
        }

        table.rows.forEach((row: WorkRow, index) => {
            font(row.total ? 'bold' : 'normal', TEXT_PT);
            const lines = wrap(row.cells, widths);
            const height = heightOf(lines);
            if (y + height > BOTTOM) {
                doc.addPage();
                y = MARGIN_TOP;
                drawHeader(table, widths);
                font(row.total ? 'bold' : 'normal', TEXT_PT);
            } else if (index > 0 && (row.groupStart || row.total)) {
                rule(row.groupStart ? 0.3 : 0.15);
            } else if (index > 0) {
                // Zeilen innerhalb eines Tages: nur ein Hauch von Linie.
                doc.setLineWidth(0.05);
                doc.line(MARGIN_X + widths[0], y, MARGIN_X + CONTENT_W, y);
            }
            drawCells(lines, widths, aligns);
        });
        rule(0.35);
        y += 7;
    };

    doc.setTextColor(0, 0, 0);
    doc.setDrawColor(0, 0, 0);

    // ── Kopf ──
    font('bold', 18);
    doc.text(report.title, MARGIN_X, y + 6);
    y += 11;
    report.meta.forEach((pair) => {
        font('normal', TEXT_PT + 0.5);
        doc.text(pair.label, MARGIN_X, y + 3.6);
        font('bold', TEXT_PT + 0.5);
        doc.text(doc.splitTextToSize(pair.value, CONTENT_W - 36)[0] as string, MARGIN_X + 36, y + 3.6);
        y += 4.8;
    });
    y += 3;
    rule(0.5);
    y += 6;

    report.tables.forEach(drawTable);

    // ── Fusszeile auf jeder Seite ──
    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        doc.setTextColor(0, 0, 0);
        doc.setDrawColor(0, 0, 0);
        doc.setLineWidth(0.15);
        doc.line(MARGIN_X, FOOTER_Y - 4, MARGIN_X + CONTENT_W, FOOTER_Y - 4);
        font('normal', 7.5);
        doc.text(doc.splitTextToSize(report.footerLeft, CONTENT_W - 40)[0] as string, MARGIN_X, FOOTER_Y);
        doc.text(report.pageLabel(page, pages), MARGIN_X + CONTENT_W, FOOTER_Y, { align: 'right' });
    }
};
