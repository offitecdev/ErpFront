import type { jsPDF } from 'jspdf';

import type { MdSpan } from '../../pages/tasks/components/reports/markdownDoc';
import { REPORT_MARK } from '../../pages/tasks/components/reports/reportMark';
import type { WorkReportDocument } from '../../pages/tasks/components/reports/workReportModel';
import { drawSvgArt } from './svgArtPdf';

/**
 * ── ARBEITSRAPPORT: DAS BLATT (16.09.2026, Samet) ────────────────────────────
 *
 * «Gün gün yazsın; grafik falan, görev bazlı bakış, QR — kaldır. Dalganın
 * yerine sağ üstte, köşeyi kaplayan orta boy bir desen.» Also:
 *
 *   Kopf     rechts oben das gerechnete graue Muster (reportMark.ts) bis in die
 *            Ecke; links Titel, Person, Zeitraum, Firma
 *   Tage     je Kalendertag eine Überschrift (Wochentag · Datum, Haarlinie) und
 *            das freie Blatt der Person: Überschriften, Absätze, Listen, Zitate,
 *            Linien — fett/kursiv/`code` und Links mitten im Satz
 *   Dateien  Bilder und PDF stehen als ANKLICKBARE Adresse (Samet: «url olarak
 *            yer alacak ama tıklanabilir»), nicht als Abzug
 *   Zeiten    zuletzt je Tag eine Tabelle mit dünnen grauen Linien: welche
 *             Aufgabe, wie lange, und die Summe des Tages
 *   jede Seite Fusszeile: Rapport · Person · Zeitraum links, «Sayfa x / y» rechts
 *
 * Reines Zeichnen: die Schrift und den Muster-Text bringt der Aufrufer mit,
 * das Seitenverhältnis der Ecke kommt aus reportMark.ts (beides in Lockstep).
 */

type Gray = number;

const PAGE_W = 210;
const PAGE_H = 297;
const MX = 16;
const TOP = 16;
const CW = PAGE_W - MX * 2;
const FOOTER_Y = PAGE_H - 10;
const BOTTOM = PAGE_H - 18;
const PT = 0.3528;

const INK: Gray = 20;
const MUTED: Gray = 110;
const LINE: Gray = 215;
const SOFT: Gray = 242;

/** Das Muster in der rechten oberen Ecke — im Seitenverhältnis von reportMark.ts. */
const MARK_WIDTH = 66;
const MARK = { width: MARK_WIDTH, height: (MARK_WIDTH * REPORT_MARK.height) / REPORT_MARK.width };

const TEXT_SIZE = 9;
const LINE_FACTOR = 1.45;
const INDENT = 6;

export const drawWorkReportPdf = (
    doc: jsPDF,
    report: WorkReportDocument,
    fontName: string,
    assets: { markSvg: string | null },
): void => {
    let y = TOP;

    const font = (style: 'normal' | 'bold' | 'italic', size: number, gray: Gray = INK) => {
        doc.setFont(fontName, style);
        doc.setFontSize(size);
        doc.setTextColor(gray, gray, gray);
    };
    const fill = (gray: Gray) => doc.setFillColor(gray, gray, gray);
    const rule = (x1: number, yy: number, x2: number, gray: Gray = LINE, width = 0.2) => {
        doc.setDrawColor(gray, gray, gray);
        doc.setLineWidth(width);
        doc.line(x1, yy, x2, yy);
    };
    const lineH = (size: number) => size * PT * LINE_FACTOR;
    const split = (text: string, width: number): string[] => doc.splitTextToSize(String(text ?? ''), Math.max(4, width)) as string[];
    /** true = neue Seite begonnen. */
    const ensure = (height: number): boolean => {
        if (y + height <= BOTTOM) return false;
        doc.addPage();
        y = TOP;
        return true;
    };

    /* ── Text mit Auszeichnung: messen, umbrechen, zeichnen ─────────────── */

    interface Piece { text: string; span: MdSpan; width: number }

    const spanFont = (span: MdSpan, size: number) => {
        doc.setFont(fontName, span.bold ? 'bold' : span.italic ? 'italic' : 'normal');
        doc.setFontSize(size);
    };
    const widthOf = (text: string, span: MdSpan, size: number): number => {
        spanFont(span, size);
        return doc.getTextWidth(text);
    };

    /** Zeilen aus Auszeichnungsstücken; `\n` bricht hart um. */
    const wrapSpans = (spans: MdSpan[], width: number, size: number): Piece[][] => {
        const lines: Piece[][] = [];
        let line: Piece[] = [];
        let used = 0;
        const breakLine = () => {
            lines.push(line);
            line = [];
            used = 0;
        };
        const place = (word: string, span: MdSpan, wordWidth: number) => {
            const last = line[line.length - 1];
            if (last && last.span === span) {
                last.text += word;
                last.width += wordWidth;
            } else {
                line.push({ text: word, span, width: wordWidth });
            }
            used += wordWidth;
        };
        const add = (word: string, span: MdSpan) => {
            const wordWidth = widthOf(word, span, size);
            if (used + wordWidth > width && line.length) {
                // Ein Leerzeichen am Zeilenende verschwindet einfach.
                if (!word.trim()) return;
                breakLine();
            }
            if (!line.length && !word.trim()) return;
            // Ein einzelnes Wort, das breiter als die Spalte ist (eine lange
            // Adresse), wird buchstabenweise umgebrochen statt überzustehen.
            if (wordWidth > width) {
                let rest = word;
                while (rest) {
                    let cut = rest.length;
                    let cutWidth = widthOf(rest, span, size);
                    while (cut > 1 && used + cutWidth > width) {
                        cut -= 1;
                        cutWidth = widthOf(rest.slice(0, cut), span, size);
                    }
                    place(rest.slice(0, cut), span, cutWidth);
                    rest = rest.slice(cut);
                    if (rest) breakLine();
                }
                return;
            }
            place(word, span, wordWidth);
        };
        for (const span of spans) {
            if (span.text === '\n') {
                breakLine();
                continue;
            }
            for (const word of span.text.split(/(\s+)/)) {
                if (!word) continue;
                add(word, span);
            }
        }
        if (line.length) lines.push(line);
        return lines.length ? lines : [[]];
    };

    /** Eine fertige Zeile zeichnen (Grundlinie `baseline`); Links werden anklickbar. */
    const drawLine = (line: Piece[], x: number, baseline: number, size: number, gray: Gray = INK) => {
        let cursor = x;
        for (const piece of line) {
            spanFont(piece.span, size);
            if (piece.span.code) {
                fill(SOFT);
                doc.rect(cursor - 0.6, baseline - size * PT * 0.86, piece.width + 1.2, size * PT * 1.18, 'F');
            }
            doc.setTextColor(gray, gray, gray);
            doc.text(piece.text, cursor, baseline);
            if (piece.span.href) {
                rule(cursor, baseline + 0.7, cursor + piece.width, MUTED, 0.15);
                doc.link(cursor, baseline - size * PT * 0.86, piece.width, size * PT * 1.2, { url: piece.span.href });
            }
            cursor += piece.width;
        }
    };

    /** Ein Textstück des Blattes ausgeben (bricht über Seiten um). */
    const writeSpans = (spans: MdSpan[], options: { x?: number; width?: number; size?: number; gray?: Gray; marker?: string }) => {
        const x = options.x ?? MX;
        const width = options.width ?? MX + CW - x;
        const size = options.size ?? TEXT_SIZE;
        const gray = options.gray ?? INK;
        const height = lineH(size);
        const lines = wrapSpans(spans, width, size);
        lines.forEach((line, index) => {
            ensure(height);
            const baseline = y + height * 0.78;
            if (!index && options.marker) {
                font('normal', size, MUTED);
                doc.text(options.marker, x - 1.8, baseline, { align: 'right' });
            }
            drawLine(line, x, baseline, size, gray);
            y += height;
        });
    };

    /* ── Kopf: Muster in der Ecke, links die Angaben ────────────────────── */

    if (assets.markSvg) {
        drawSvgArt(doc, assets.markSvg, { x: PAGE_W - MARK.width, y: 0, width: MARK.width, height: MARK.height });
    }
    const headWidth = PAGE_W - MARK.width - MX - 8;
    y = TOP + 6;
    font('bold', 17);
    doc.text(split(report.title, headWidth)[0] ?? '', MX, y);
    y += 9;
    font('bold', 11.5);
    doc.text(split(report.person, headWidth)[0] ?? '', MX, y);
    y += 5.5;
    font('normal', 9, INK);
    doc.text(split(report.subtitle, headWidth)[0] ?? '', MX, y);
    y += 5;
    font('normal', 7.8, MUTED);
    doc.text(split(report.meta, headWidth)[0] ?? '', MX, y);
    y = Math.max(y + 12, MARK.height + 10);

    /* ── Tag für Tag ────────────────────────────────────────────────────── */

    report.days.forEach((day, index) => {
        ensure(24);
        if (index) y += 5;
        rule(MX, y, MX + CW, LINE);
        y += 5.4;
        font('bold', 11);
        doc.text(day.weekday, MX, y);
        const weekdayWidth = doc.getTextWidth(day.weekday);
        font('normal', 9, MUTED);
        doc.text(day.dateText, MX + weekdayWidth + 4, y);
        y += 5;

        if (!day.blocks.length) {
            font('italic', TEXT_SIZE, MUTED);
            doc.text(day.written ? report.labels.empty : report.labels.missing, MX, y + 3);
            y += 7;
        }

        day.blocks.forEach((block) => {
            switch (block.kind) {
                case 'heading': {
                    const size = block.level === 1 ? 12 : block.level === 2 ? 10.6 : 9.6;
                    y += 2.6;
                    writeSpans(block.spans.map((span) => ({ ...span, bold: true })), { size });
                    y += 1.2;
                    break;
                }
                case 'list':
                    block.items.forEach((item, position) => {
                        writeSpans(item, {
                            x: MX + INDENT,
                            width: CW - INDENT,
                            marker: block.ordered ? `${position + 1}.` : '•',
                        });
                    });
                    y += 1.4;
                    break;
                case 'quote': {
                    const top = y;
                    writeSpans(block.spans, { x: MX + INDENT, width: CW - INDENT, gray: MUTED });
                    doc.setDrawColor(LINE, LINE, LINE);
                    doc.setLineWidth(0.7);
                    doc.line(MX + 1.5, top + 0.6, MX + 1.5, y - 0.6);
                    y += 1.4;
                    break;
                }
                case 'rule':
                    ensure(6);
                    y += 2.4;
                    rule(MX, y, MX + CW, LINE);
                    y += 3;
                    break;
                case 'image': {
                    // Kein Abzug: die Adresse steht als anklickbarer Link (Vorgabe 16.09.2026).
                    const name = block.alt || decodeURIComponent(block.url.split('/').pop() ?? block.url);
                    writeSpans([{ text: name, href: block.url }], { size: TEXT_SIZE });
                    writeSpans([{ text: block.url, href: block.url }], { size: 7.2, gray: MUTED });
                    y += 1.4;
                    break;
                }
                default:
                    writeSpans(block.spans, {});
                    y += 1.8;
                    break;
            }
        });

        if (day.files.length) {
            ensure(12);
            y += 2.4;
            font('bold', 8.2, MUTED);
            doc.text(report.labels.files, MX, y + 2.6);
            y += 5.4;
            day.files.forEach((file) => {
                writeSpans([{ text: file.name, href: file.url }], { x: MX + INDENT, width: CW - INDENT, size: 8.4, marker: '·' });
                writeSpans([{ text: file.url, href: file.url }], { x: MX + INDENT, width: CW - INDENT, size: 7.2, gray: MUTED });
                y += 1.2;
            });
        }

        if (day.times.length) {
            // «ince gri kenarları olan tablo» (16.09.2026): zwei Spalten, dünne graue Linien.
            const DURATION_W = 30;
            const titleW = CW - DURATION_W;
            ensure(16);
            y += 3;
            font('bold', 8.2, MUTED);
            doc.text(report.labels.worked, MX, y + 2.6);
            y += 5;

            /** Eine Zeile der Tabelle: zwei Zellen mit dünner grauer Kante. */
            const gridRow = (title: string, duration: string, style: 'normal' | 'bold', gray: Gray = INK) => {
                font(style, 8.2, gray);
                const lines = split(title, titleW - 5);
                const rowHeight = Math.max(6.4, lines.length * lineH(8.2) + 3);
                ensure(rowHeight);
                doc.setDrawColor(LINE, LINE, LINE);
                doc.setLineWidth(0.15);
                doc.rect(MX, y, titleW, rowHeight);
                doc.rect(MX + titleW, y, DURATION_W, rowHeight);
                font(style, 8.2, gray);
                lines.forEach((text, index) => doc.text(text, MX + 2.4, y + 4.4 + index * lineH(8.2)));
                doc.text(duration, MX + CW - 2.4, y + 4.4, { align: 'right' });
                y += rowHeight;
            };
            gridRow(report.labels.task, report.labels.duration, 'bold', MUTED);
            day.times.forEach((entry) => gridRow(entry.title, entry.duration, 'normal'));
            gridRow(report.labels.total, day.total, 'bold');
            y += 2;
        }

        y += 3;
    });

    /* ── Fusszeile auf jeder Seite ──────────────────────────────────────── */

    const pages = doc.getNumberOfPages();
    for (let page = 1; page <= pages; page += 1) {
        doc.setPage(page);
        rule(MX, FOOTER_Y - 4, MX + CW, LINE);
        font('normal', 7, MUTED);
        doc.text(split(report.footerLeft, CW - 30)[0] ?? '', MX, FOOTER_Y);
        doc.text(report.pageLabel(page, pages), MX + CW, FOOTER_Y, { align: 'right' });
    }
};
