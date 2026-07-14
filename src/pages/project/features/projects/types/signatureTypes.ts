import type { SignatureAttachment } from '@/components/ui-shared/SignatureSheet';
import type { SignatureReportType, SignatureSnapshot } from '@/lib/api/project';

// SignatureAttachment is owned by the shared SignatureSheet component. Re-export
// it here so the signature feature has a single import surface, without
// redefining the shape.
export type { SignatureAttachment };

/**
 * A report selected for signature dispatch: the report identity plus the
 * pre-built snapshot preview shown in the dispatch modal. `reportId` is `null`
 * for the general report, which has no persisted row of its own.
 */
export type SignatureDispatchTarget = {
    reportType: SignatureReportType;
    reportId: string | null;
    title: string;
    snapshot: SignatureSnapshot;
    alreadySigned: boolean;
};

/**
 * Appointment record enriched with its project / sales-order graph, as consumed
 * by the signature attachment builders. Kept permissive because the underlying
 * API graph is loosely typed across the project pages.
 */
export type AppointmentWithProject = any;

/** A single material usage row derived from the tender graph. */
export type UsedMaterial = {
    id: string;
    material: any;
    quantity: number;
};

/** Records that can be scoped to a specific order / appointment. */
export type ScopedRecord = {
    salesOrderId?: string | null;
    appointmentId?: string | null;
};
