/** Coarse technician-facing status of an installation appointment. */
export type MontageStatusKey = 'pending' | 'startingSoon' | 'inProgress' | 'awaitingSignature' | 'completed';

/** Row tint used by the big orders table. */
export type MontageHighlight = 'none' | 'soon' | 'overdue';

export type MontageOrderRow = {
    id: string;
    fieldReportId: string | null;
    orderNumber: string;
    projectName: string;
    customerName: string;
    start: string;
    end: string;
    status: MontageStatusKey;
    highlight: MontageHighlight;
};
