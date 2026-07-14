import { t } from '@/i18n/translate';
import type { SignatureReportType, SignatureRequestDto } from '@/lib/api/project';

/** Chip variants accepted by StatusChip, narrowed to the ones we use. */
type StatusChipVariant = 'active' | 'info' | 'warning' | 'neutral';

/** Row-level signature status shown to the user. */
export type SignatureRowStatus = 'signed' | 'submitted' | 'pending' | 'ready' | 'notReady';

/**
 * Find the most relevant dispatched signature request for a given report.
 * A SIGNED request wins; otherwise the first match is kept so the row can
 * reflect its pending/submitted state without ever re-exposing a send action.
 * `reportId` is compared null-normalised so the general report (reportId=null)
 * matches its own requests.
 */
export const requestFor = (
    reportType: SignatureReportType,
    reportId: string | null,
    requests: SignatureRequestDto[],
): SignatureRequestDto | null => {
    const matches = requests.filter(
        (r) => r.reportType === reportType && (r.reportId || null) === (reportId || null),
    );
    return matches.find((r) => r.status === 'SIGNED') || matches[0] || null;
};

/**
 * The general report has no persisted row of its own; its signed state is
 * derived from whether a GENERAL signature request for this project is signed.
 */
export const isGeneralSigned = (requests: SignatureRequestDto[]): boolean =>
    requests.some((r) => r.reportType === 'GENERAL' && r.status === 'SIGNED');

/**
 * Derive the row status from the report's signed flag, any existing request,
 * and whether the underlying report is ready to be sent at all.
 */
export const computeSignatureStatus = ({
    signed,
    request,
    ready = true,
}: {
    signed: boolean;
    request: SignatureRequestDto | null;
    ready?: boolean;
}): SignatureRowStatus => {
    if (signed || request?.status === 'SIGNED') return 'signed';
    if (request) return request.status === 'SUBMITTED' ? 'submitted' : 'pending';
    return ready ? 'ready' : 'notReady';
};

export const getSignatureStatusLabel = (status: SignatureRowStatus): string => {
    switch (status) {
        case 'signed':
            return t('signatures.statusSigned');
        case 'submitted':
            return t('signatures.statusSubmitted');
        case 'pending':
            return t('signatures.statusPending');
        case 'notReady':
            return t('signatures.statusNotReady');
        case 'ready':
        default:
            return t('signatures.sendForSignature');
    }
};

export const getSignatureStatusVariant = (status: SignatureRowStatus): StatusChipVariant => {
    switch (status) {
        case 'signed':
            return 'active';
        case 'submitted':
            return 'info';
        case 'pending':
            return 'warning';
        case 'notReady':
        case 'ready':
        default:
            return 'neutral';
    }
};
