import { t } from '@/i18n/translate';
import type { DeliveryReportDto, SignatureSnapshot } from '@/lib/api/project';

import { cleanLabel, dateFmt, durationFmt, minutesBetweenValues, personName, timeFmt } from './installationFormatters';
import {
    operationItems,
    orderDeliveryReports,
    orderFieldReports,
    reportDateValue,
    reportImageUrls,
    reportWorkedMinutes,
} from './installationScope';

/**
 * Signature snapshot for an in-progress field report (before it is saved), so the
 * customer can sign while the technician is still creating it. Built from the live
 * draft (operations / notes / images) rather than a persisted report.
 */
export const buildDraftFieldSnapshot = (appointment: any, operations: string[], technicalNotes: string, images: string[]): SignatureSnapshot => {
    const items = operations.map((item) => item.trim()).filter(Boolean);
    return {
        title: t('signatures.tabs.field'),
        customerName: appointment.project?.customer?.companyName,
        projectName: appointment.project?.projectName,
        meta: [
            { label: t('signatures.field.workDate'), value: dateFmt(appointment.startTime) },
            { label: t('projects.delivery.pdf.technician'), value: personName(appointment.assignedTechnician) },
            { label: t('projects.delivery.pdf.commission'), value: appointment.salesOrder?.orderNumber || '-' },
        ],
        sections: [
            { heading: t('projects.yapilan_isler'), rows: (items.length ? items : ['-']).map((item, index) => ({ label: `${index + 1}. ${item}` })) },
            ...(technicalNotes.trim() ? [{ heading: t('projects.teknik_notlar'), rows: [{ label: technicalNotes.trim() }] }] : []),
        ],
        images,
    };
};

/** Signature snapshot for a single field report. */
export const buildFieldSnapshot = (appointment: any, report: any): SignatureSnapshot => ({
    title: t('signatures.tabs.field'),
    customerName: appointment.project?.customer?.companyName,
    projectName: appointment.project?.projectName,
    meta: [
        { label: t('signatures.field.workDate'), value: dateFmt(reportDateValue(report)) },
        { label: t('projects.delivery.pdf.technician'), value: personName(report.employee || appointment.assignedTechnician) },
        { label: t('projects.delivery.pdf.commission'), value: appointment.salesOrder?.orderNumber || '-' },
    ],
    sections: [
        {
            heading: t('projects.randevu_saat_planlari'),
            rows: [
                { label: t('projects.delivery.pdf.executionDate'), value: dateFmt(appointment.startTime) },
                { label: cleanLabel(t('projects.planlanan')), value: `${timeFmt(appointment.startTime)} - ${timeFmt(appointment.endTime)} / ${durationFmt(minutesBetweenValues(appointment.startTime, appointment.endTime))}` },
                { label: `${t('common.start')} / ${t('common.end')}`, value: `${timeFmt(report.startedAt)} - ${timeFmt(report.endedAt)}` },
                { label: t('common.total'), value: durationFmt(reportWorkedMinutes(report)) },
                { label: cleanLabel(t('projects.fazla_calisma')), value: durationFmt(report.overtimeMinutes) },
            ],
        },
        {
            heading: t('projects.yapilan_isler'),
            rows: (operationItems(report).length ? operationItems(report) : ['-']).map((item, index) => ({ label: `${index + 1}. ${item}` })),
        },
        ...(report.technicalNotes ? [{
            heading: t('projects.teknik_notlar'),
            rows: [{ label: report.technicalNotes }],
        }] : []),
    ],
    images: reportImageUrls(report),
});

// Mirrors the admin general report: every field report plus the delivery
// checklist summaries for the order, stored on the signature request.
export const buildGeneralSnapshot = (appointment: any, deliveryReports: DeliveryReportDto[]): SignatureSnapshot => {
    const reports = orderFieldReports(appointment);
    const deliveries = orderDeliveryReports(appointment, deliveryReports);
    const sortedReports = [...reports].sort((a, b) => String(reportDateValue(a) || '').localeCompare(String(reportDateValue(b) || '')));
    const fieldSummaryRows = sortedReports.map((report) => ({
        label: `${dateFmt(reportDateValue(report))} - ${personName(report.employee)}`,
        value: `${timeFmt(report.startedAt)}-${timeFmt(report.endedAt)} / ${durationFmt(reportWorkedMinutes(report))}`,
    }));
    const workSections = sortedReports.map((report) => ({
        heading: `${t('projects.yapilan_isler')} - ${dateFmt(reportDateValue(report))}`,
        rows: [
            ...(operationItems(report).length ? operationItems(report) : ['-']).map((item, index) => ({ label: `${index + 1}. ${item}` })),
            ...(report.technicalNotes ? [{ label: `${t('projects.teknik_notlar')}: ${report.technicalNotes}` }] : []),
        ],
    }));
    const overtimeRows = sortedReports.map((report) => {
        const planned = Number(report.plannedMinutesForDay || 0);
        const worked = reportWorkedMinutes(report);
        const max = planned ? Math.ceil(planned * 1.15) : 0;
        return {
            label: dateFmt(reportDateValue(report)),
            value: `${cleanLabel(t('projects.planlanan'))}: ${durationFmt(planned)} / ${cleanLabel(t('projects.azami'))}: ${durationFmt(max)} / ${t('common.total')}: ${durationFmt(worked)} / ${cleanLabel(t('projects.fazla_calisma'))}: ${durationFmt(report.overtimeMinutes)}`,
        };
    });
    const deliverySections = deliveries.flatMap((d) => {
        const cats: string[] = [];
        for (const x of d.responses || []) { const k = x.category?.trim() || t('projects.delivery.uncategorized'); if (!cats.includes(k)) cats.push(k); }
        return cats.map((c) => ({
            heading: `${d.checklistName || t('projects.delivery.pdf.title')} · ${c}`,
            rows: (d.responses || []).filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c).map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
        }));
    });
    return {
        title: t('projects.general.button'),
        customerName: appointment.project?.customer?.companyName,
        projectName: appointment.project?.projectName,
        meta: [
            { label: t('projects.delivery.pdf.commission'), value: appointment.salesOrder?.orderNumber || '-' },
            { label: t('signatures.general.allFieldReports', { count: sortedReports.length }), value: deliveries.length ? `${deliveries.length} ${t('signatures.tabs.delivery')}` : '-' },
            { label: t('projects.delivery.pdf.reportDate'), value: dateFmt(new Date().toISOString()) },
        ],
        sections: [
            { heading: t('projects.saha_raporlari'), rows: fieldSummaryRows.length ? fieldSummaryRows : [{ label: '-' }] },
            ...workSections,
            { heading: t('projects.15_uzeri_fazla_calisma'), rows: overtimeRows.length ? overtimeRows : [{ label: '-' }] },
            ...deliverySections,
        ],
        images: sortedReports.flatMap(reportImageUrls),
    };
};
