/**
 * ── GÖREVLER · ARBEITSRAPPORT ALS PDF (13.09.2026, Vorgabe Samet) ────────────
 *
 * «Sade, Arial, düz siyah beyaz, tablolu — tek kişi, haftalık veya günlük.» Das Blatt
 * zeichnet `workReportPdfLayout.ts` (ohne Haus-Kit); hier werden nur die
 * gebündelte Arial registriert, das Dokument in der gewählten Rapportsprache gebaut
 * und die Datei ausgeliefert. Gerechnet wird in `workReportModel.ts` — dieselben
 * Zahlen wie in der Vorschau.
 */
import { jsPDF } from 'jspdf';

import { getReportTranslator } from '@/i18n/reportLanguage';
import type { SupportedLanguage } from '@/i18n/loadResources';
import type { WorkReport } from '@/types/tasksModule';
import { buildWorkReportDocument, type WorkPeriod } from '../../pages/tasks/components/reports/workReportModel';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { downloadPdf, FONT, registerFonts } from './modernReportKit';
import { drawWorkReportPdf } from './workReportPdfLayout';

export const exportTasksReportPdf = async (
    report: WorkReport,
    options: { period: WorkPeriod; language: SupportedLanguage },
    output: 'download' | 'blob' = 'download',
): Promise<Blob | null> => {
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const { t, locale } = await getReportTranslator(options.language);
    const sheet = buildWorkReportDocument(report, {
        period: options.period,
        t,
        locale,
        company: getPdfSettings().companyName,
    });
    drawWorkReportPdf(doc, sheet, FONT);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    downloadPdf(bytes, `${sheet.fileName}.pdf`);
    return null;
};
