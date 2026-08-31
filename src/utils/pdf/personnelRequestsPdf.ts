/**
 * ── ANTRÄGE ALS PDF (26.08.2026, Vorgabe Samet) ──────────────────────────────
 *
 *   «Es muss einen Abwesenheitsfilter geben; alles muss filterbar sein — mit
 *    anderen Worten: es muss ein PDF erzeugen können.»
 *
 * Gedruckt wird GENAU DIE LISTE, die auf dem Bildschirm steht: dieselben
 * Zeilen, dieselbe Reihenfolge, und im Kopf die Filter, die zu ihr geführt
 * haben. Ein Rapport ohne seine Filter ist eine Behauptung — man kann ihm
 * nicht ansehen, worüber er spricht.
 */
import { jsPDF } from 'jspdf';
import { getPdfSettings } from '../../store/pdfSettingsStore';
import { getReportTranslator } from '@/i18n/reportLanguage';
import {
    CONTENT_W, EMPTY,
    clean, decoratePages, downloadPdf, drawBandRow, drawCover, drawModernTable,
    loadBrandAssets, registerFonts,
    type ModernColumn,
} from './modernReportKit';
import type { LeaveRequestRow } from '../../pages/personnel/types/personnel';
import { requestTypeOf } from '../../pages/personnel/utils/personnel';
import { formatDate, fullName } from '../../pages/personnel/utils/format';

export interface RequestsPdfFilters {
    /** Der Reiter, aus dem gedruckt wird (Meine / Eingehende / Alle). */
    title: string;
    requestType?: string;
    status?: string;
    from?: string;
    to?: string;
}

export const exportRequestsPdf = async (
    rows: LeaveRequestRow[],
    filters: RequestsPdfFilters,
    output?: 'download' | 'blob',
): Promise<Blob | null> => {
    const settings = getPdfSettings();
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    await registerFonts(doc);
    const assets = await loadBrandAssets(doc);
    const { t } = await getReportTranslator();

    const period = filters.from || filters.to
        ? `${filters.from ? formatDate(filters.from) : EMPTY} – ${filters.to ? formatDate(filters.to) : EMPTY}`
        : '';

    const coverY = drawCover(doc, {
        rows: [
            { label: t('personnel.requests.scope'), value: filters.title, emphasize: true },
            { label: t('personnel.requests.type'), value: filters.requestType ? t(`personnel.requestType.${filters.requestType}`) : '' },
            { label: t('personnel.field.status'), value: filters.status ? t(`personnel.leaveStatus.${filters.status}`) : '' },
            { label: t('personnel.pdf.period'), value: period },
            { label: t('personnel.pdf.rowCount'), value: String(rows.length) },
            { label: t('personnel.pdf.printedOn'), value: formatDate(new Date()) },
        ],
        settings,
        title: t('personnel.pdf.requestsTitle'),
        subtitle: t('personnel.pdf.requestsSubtitle'),
    });

    const columns: ModernColumn[] = [
        { header: t('personnel.field.name'), w: 36 },
        { header: t('personnel.requests.type'), w: 24 },
        { header: t('personnel.field.leaveType'), w: 32 },
        { header: t('personnel.pdf.period'), w: 40, align: 'center' },
        { header: t('personnel.field.days'), w: 14, align: 'right' },
        { header: t('personnel.field.status'), w: 26 },
        { header: t('personnel.person.colApprover'), w: CONTENT_W - 36 - 24 - 32 - 40 - 14 - 26 },
    ];

    if (rows.length === 0) {
        drawBandRow(doc, t('personnel.pdf.noRows'), '', coverY);
    } else {
        const tableEnd = drawModernTable(doc, columns, rows.map((row) => {
            const type = requestTypeOf(row.kind, row.leaveType);
            return [
                fullName(row.employee),
                t(`personnel.requestType.${type}`),
                // Bei «Sonstiges» steht der Freitext, sonst die feste Art —
                // dieselbe Regel wie auf dem Bildschirm.
                clean(row.leaveTypeLabel) || t(`personnel.leaveType.${row.leaveType}`),
                `${formatDate(row.startDate)} – ${formatDate(row.endDate)}`,
                String(row.totalDays),
                t(`personnel.leaveStatus.${row.status}`),
                row.approver ? fullName(row.approver) : EMPTY,
            ];
        }), coverY, { reserveAfter: 12 });

        // Die Summe der Arbeitstage: die Zahl, wegen der die Liste gedruckt wird.
        const totalDays = rows.reduce((sum, row) => sum + row.totalDays, 0);
        drawBandRow(doc, t('personnel.field.days'), String(totalDays), tableEnd + 2, true);
    }

    decoratePages(doc, assets, settings, t);

    const bytes = new Uint8Array(doc.output('arraybuffer'));
    if (output === 'blob') return new Blob([bytes], { type: 'application/pdf' });
    const stamp = `${filters.from || ''}_${filters.to || ''}`.replace(/[^0-9_-]/g, '') || formatDate(new Date()).replace(/\./g, '-');
    downloadPdf(bytes, `${t('personnel.pdf.requestsFile')}-${stamp}.pdf`);
    return null;
};
