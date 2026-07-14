import { useState } from 'react';
import { toast } from 'sonner';

import { signatureApi, type SignatureReportType, type SignatureSnapshot } from '@/lib/api/project';
import { t } from '@/i18n/translate';

type UseTechnicianSignatureArgs = {
    reportType: SignatureReportType;
    reportId?: string | null;
    projectId?: string | null;
    title: string;
    onDone?: () => void;
};

/**
 * Owns the technician "get signature" flow: modal open state, the saving flag,
 * and the `signatureApi.create` call. The component only wires this to the UI.
 */
export const useTechnicianSignature = ({ reportType, reportId, projectId, title, onDone }: UseTechnicianSignatureArgs) => {
    const [open, setOpen] = useState(false);
    const [busy, setBusy] = useState(false);

    const openSheet = () => setOpen(true);
    const closeSheet = () => setOpen(false);

    const saveSignature = async (signatureBase64: string | null, mergedSnapshot: SignatureSnapshot) => {
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

    return { open, busy, openSheet, closeSheet, saveSignature };
};
