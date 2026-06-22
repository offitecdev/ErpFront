import { useState } from 'react';
import { toast } from 'sonner';
import { Edit01 as Pen } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { SignatureSheet, type SignatureAttachment } from '../../components/ui-shared/SignatureSheet';
import { signatureApi, type SignatureReportType, type SignatureSnapshot } from '../../lib/api/project';

import { t } from '@/i18n/translate';

/**
 * Technician "Get signature" flow: opens the shared signature modal and saves
 * the captured customer signature against the report snapshot.
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
    onDone?: () => void;
}) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const save = async (signatureBase64: string | null, mergedSnapshot: SignatureSnapshot) => {
        if (!signatureBase64) return;
        setBusy(true);
        try {
            await signatureApi.create({ reportType, reportId: reportId || null, projectId: projectId || null, title, snapshot: mergedSnapshot, signatureBase64 });
            toast.success(t('signatures.signed'));
            setOpen(false);
            onDone?.();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.signError'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <Button variant="secondary" size="sm" icon={<Pen size={12} />} disabled={disabled} onClick={() => setOpen(true)}>
                {label || t('signatures.getSignature')}
            </Button>

            <SignatureSheet
                open={open}
                title={title}
                snapshot={snapshot}
                attachments={attachments}
                saving={busy}
                onClose={() => setOpen(false)}
                onSave={save}
            />
        </>
    );
};

export default TechnicianGetSignature;
