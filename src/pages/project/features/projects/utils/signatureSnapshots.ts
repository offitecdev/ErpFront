import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { DeliveryReportDto, SignatureSnapshot } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';

/** Field-report images belonging to the given order (or all, when unscoped). */
export const gatherSignatureImages = (project: ProjectDto, salesOrderId: string | null): string[] =>
    ((project as any).reports || [])
        .filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId)
        .flatMap((r: any) => (Array.isArray(r.images) ? r.images : []))
        .map((img: any) => img?.imageData)
        .filter(Boolean);

/** Snapshot preview for a single field report. */
export const buildFieldSignatureSnapshot = (project: ProjectDto, report: any): SignatureSnapshot => ({
    title: t('signatures.tabs.field'),
    customerName: project.customer?.companyName,
    projectName: project.projectName,
    meta: [{ label: t('signatures.field.workDate'), value: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY') }],
    notes: report.operationsDone || undefined,
    images: Array.isArray(report.images) ? report.images.map((i: any) => i.imageData).filter(Boolean) : [],
});

/** Snapshot preview for a delivery report, grouped by checklist category. */
export const buildDeliverySignatureSnapshot = (project: ProjectDto, d: DeliveryReportDto): SignatureSnapshot => {
    const cats: string[] = [];
    for (const x of d.responses || []) {
        const k = x.category?.trim() || t('projects.delivery.uncategorized');
        if (!cats.includes(k)) cats.push(k);
    }
    return {
        title: d.checklistName || t('projects.delivery.pdf.title'),
        customerName: project.customer?.companyName,
        projectName: project.projectName,
        sections: cats.map((c) => ({
            heading: c,
            rows: (d.responses || [])
                .filter((x) => (x.category?.trim() || t('projects.delivery.uncategorized')) === c)
                .map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
        })),
        notes: d.notes || undefined,
        images: gatherSignatureImages(project, d.salesOrderId),
    };
};

/** Snapshot preview for the general report — a roll-up of every field report. */
export const buildGeneralSignatureSnapshot = (project: ProjectDto, salesOrderId: string | null, fieldReports: any[]): SignatureSnapshot => ({
    title: t('projects.general.previewTitle'),
    customerName: project.customer?.companyName,
    projectName: project.projectName,
    sections: fieldReports.map((r: any) => ({
        heading: dayjs(r.workDate || r.reportDate).format('DD.MM.YYYY'),
        rows: [{ label: r.operationsDone || '—' }],
    })),
    images: gatherSignatureImages(project, salesOrderId),
});
