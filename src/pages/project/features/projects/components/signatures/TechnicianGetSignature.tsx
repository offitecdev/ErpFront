import { Edit01 as Pen } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { SignatureSheet, type SignatureAttachment } from '@/components/ui-shared/SignatureSheet';
import type { SignatureReportType, SignatureSnapshot } from '@/lib/api/project';
import { t } from '@/i18n/translate';

import { useTechnicianSignature } from '../../hooks/useTechnicianSignature';

/**
 * Technician "Get signature" flow: renders the trigger button and the shared
 * signature sheet. All modal state and the save API call live in
 * {@link useTechnicianSignature}.
 */
export const TechnicianGetSignature = ({
    reportType,
    reportId,
    projectId,
    title,
    snapshot,
    attachments,
    disabled,
    label,
    disabledReason,
    onDone,
}: {
    reportType: SignatureReportType;
    reportId?: string | null;
    projectId?: string | null;
    title: string;
    snapshot: SignatureSnapshot;
    attachments?: SignatureAttachment[];
    disabled?: boolean;
    label?: string;
    /** Optional explanation shown as a tooltip when the button is disabled. */
    disabledReason?: string;
    onDone?: () => void;
}) => {
    const { open, busy, openSheet, closeSheet, saveSignature } = useTechnicianSignature({
        reportType,
        reportId,
        projectId,
        title,
        onDone,
    });

    return (
        <>
            <Button
                variant="secondary"
                size="sm"
                icon={<Pen size={12} />}
                disabled={disabled}
                title={disabled ? disabledReason : undefined}
                onClick={openSheet}
            >
                {label || t('signatures.getSignature')}
            </Button>

            <SignatureSheet
                open={open}
                title={title}
                snapshot={snapshot}
                attachments={attachments}
                saving={busy}
                onClose={closeSheet}
                onSave={saveSignature}
            />
        </>
    );
};

export default TechnicianGetSignature;
