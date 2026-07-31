import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { signatureApi, type DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';

import type { InstallationAppointment } from './useInstallationDetail';
import { buildGeneralSnapshot } from '../utils/installationSnapshots';

// Owns the general-report signature capture + send flow. The general report is sent
// (signed or unsigned) via its own "Send" — "Finish & Send" never sends it.
export const useInstallationGeneralSignature = ({
    selected,
    deliveryReports,
    onReload,
}: {
    selected: InstallationAppointment;
    deliveryReports: DeliveryReportDto[];
    onReload: () => void;
}) => {
    const [generalSignature, setGeneralSignature] = useState<string | null>(null);
    const [generalSignOpen, setGeneralSignOpen] = useState(false);
    const [generalSending, setGeneralSending] = useState(false);

    const sendGeneral = useCallback(async () => {
        setGeneralSending(true);
        try {
            // Send the general report itself (signed or unsigned) — do NOT raise a
            // customer signature request: no email, no technician notification.
            await signatureApi.create({
                reportType: 'GENERAL',
                reportId: selected.salesOrder?.id || null,
                projectId: selected.project?.id || null,
                title: `${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('projects.general.button')}`,
                snapshot: buildGeneralSnapshot(selected, deliveryReports),
                signatureBase64: generalSignature || null,
                customerEmail: null,
                sendEmail: false,
                notifyTechnician: false,
            });
            toast.success(t('projects.task.sent'));
            setGeneralSignature(null);
            onReload();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.createError'));
        } finally {
            setGeneralSending(false);
        }
    }, [selected, deliveryReports, generalSignature, onReload]);

    return { generalSignature, setGeneralSignature, generalSignOpen, setGeneralSignOpen, generalSending, sendGeneral };
};
