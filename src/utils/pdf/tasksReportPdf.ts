/**
 * ── GÖREVLER · ARBEITSRAPPORT ALS PDF ────────────────────────────────────────
 *
 * 16.09.2026 (Samet): «gün gün; grafik, QR yok; sağ üst köşede desen — deseni
 * sen oluştur». Das Blatt zeichnet `workReportPdfLayout.ts`, das Muster rechnet
 * `reportMark.ts`; hier werden nur Arial registriert, das Dokument in der
 * Rapportsprache gebaut und die Datei ausgeliefert. Gerechnet wird in `workReportModel.ts` — dasselbe
 * Dokument wie in der Vorschau.
 */
import { jsPDF } from 'jspdf';

import { getReportTranslator } from '@/i18n/reportLanguage';
import type { SupportedLanguage } from '@/i18n/loadResources';
import type { WorkReport } from '@/types/tasksModule';
import { REPORT_MARK_SVG } from '../../pages/tasks/components/reports/reportMark';
import { buildWorkReportDocument, type WorkPeriod } from '../../pages/tasks/components/reports/workReportModel';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { downloadPdf, FONT, registerFonts } from './modernReportKit';
import { drawWorkReportPdf } from './workReportPdfLayout';

export const exportTasksReportPdf = async (
    report: WorkReport,
    options: { period: WorkPeriod; language: SupportedLanguage },
    output: 'download' | 'blob' = 'download',
): Promise<Blob | null> => {
    // 3 Nachkommastellen (pt) statt 16 — sonst blähen die Vektorpfade die Datei auf.
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true, floatPrecision: 3 });
    const [{ t, locale }] = await Promise.all([
        getReportTranslator(options.language),
        registerFonts(doc),
    ]);
    const sheet = buildWorkReportDocument(report, {
        period: options.period,
        t,
        locale,
        company: getPdfSettings().companyName,
    });
    drawWorkReportPdf(doc, sheet, FONT, { markSvg: REPORT_MARK_SVG });

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${sheet.fileName}.pdf`);
    return null;
};
