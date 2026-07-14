import { t } from '@/i18n/translate';
import type { DeliveryReportDto, DeliveryResponseItem, SignatureSnapshot } from '@/lib/api/project';

import { groupResponsesByCategory, type DeliveryFieldImage } from './deliveryReportUtils';

const toSnapshotSections = (responses: DeliveryResponseItem[]) =>
    groupResponsesByCategory(responses, t('projects.delivery.uncategorized')).map((group) => ({
        heading: group.category,
        rows: group.items.map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
    }));

/** Snapshot built from an already-created delivery report. */
export const buildDeliverySnapshot = (d: DeliveryReportDto, images: DeliveryFieldImage[]): SignatureSnapshot => ({
    title: d.checklistName || t('projects.delivery.pdf.title'),
    sections: toSnapshotSections(d.responses || []),
    notes: d.notes || undefined,
    images: images.map((i) => i.imageData),
});

/** Snapshot built from the in-progress checklist for the signature request. */
export const buildDraftSnapshot = (
    checklistName: string,
    responses: DeliveryResponseItem[],
    notes: string,
    images: DeliveryFieldImage[],
): SignatureSnapshot => ({
    title: checklistName || t('projects.delivery.pdf.title'),
    sections: toSnapshotSections(responses),
    notes: notes.trim() || undefined,
    images: images.map((i) => i.imageData),
});
