import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, FileDownload02, Send01 } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { SnapshotView } from '@/components/ui-shared/SnapshotView';
import { useInstallationDetail } from '@/pages/project/features/installations/hooks/useInstallationDetail';
import { useInstallationGeneralSignature } from '@/pages/project/features/installations/hooks/useInstallationGeneralSignature';
import { buildGeneralSnapshot } from '@/pages/project/features/installations/utils/installationSnapshots';
import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

import { BigButton } from './components/BigButton';
import { MontageHeader } from './components/MontageHeader';

/**
 * Dedicated general (order summary) report page: PDF preview, "Get signature"
 * and "Send" — the action row sits at the top, right below the back/forward
 * navigation. Sending never requires a signature, but an unsigned report gets
 * a visible note above the preview.
 */
export const MontageGeneralReport = () => {
    const { appointmentId } = useParams();
    const { selected, loading, deliveryReports, reloadAll } = useInstallationDetail(appointmentId, {
        initialSection: 'general',
    });
    const [pdfBusy, setPdfBusy] = useState(false);

    const signatureFlow = useInstallationGeneralSignature({
        selected: selected!,
        deliveryReports,
        onReload: reloadAll,
    });
    const { generalSignature, setGeneralSignature, generalSignOpen, setGeneralSignOpen, generalSending, sendGeneral } = signatureFlow;

    const snapshot = useMemo(
        () => (selected ? buildGeneralSnapshot(selected, deliveryReports) : null),
        [selected, deliveryReports],
    );

    const exportPdf = async () => {
        if (!selected?.project) return;
        setPdfBusy(true);
        try {
            const { exportProjectGeneralReportPdf } = await import('@/utils/pdf/projectReportPdf');
            await exportProjectGeneralReportPdf(selected.project, {});
        } catch {
            toast.error(t('montage.pdfError'));
        } finally {
            setPdfBusy(false);
        }
    };

    if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />;
    if (!selected || !snapshot) {
        return (
            <div className="space-y-4">
                <MontageHeader title={t('montage.orderNotFound')} backTo="/montage/reports" />
                <EmptyState title={t('montage.orderNotFound')} description={t('montage.orderNotFoundHint')} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <MontageHeader
                title={t('projects.general.button')}
                subtitle={`${localizeTenderNumbersInText(selected.salesOrder?.orderNumber || '')} · ${selected.project?.customer?.companyName || ''}`}
                backTo="/montage/reports"
            />

            {/* Sign & Send row — always at the top, under the navigation. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <BigButton
                    tone={generalSignature ? 'success' : 'outline'}
                    icon={generalSignature ? <CheckCircle size={20} /> : undefined}
                    onClick={() => setGeneralSignOpen(true)}
                >
                    {generalSignature ? t('montage.signed') : t('signatures.getSignature')}
                </BigButton>
                <BigButton tone="brand" icon={<Send01 size={20} />} disabled={generalSending} onClick={() => void sendGeneral()}>
                    {t('projects.delivery.sendReport')}
                </BigButton>
                <BigButton tone="neutral" icon={<FileDownload02 size={20} />} disabled={pdfBusy} onClick={() => void exportPdf()}>
                    {t('montage.pdfPreview')}
                </BigButton>
            </div>

            {/* A signature is not required to send — but flag it above the report. */}
            {!generalSignature && (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-[14.5px] font-semibold text-[#d30f15] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t('montage.general.signatureHint')}
                </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
                <SnapshotView snapshot={snapshot} />
            </div>

            <SignatureSheet
                open={generalSignOpen}
                title={t('projects.general.button')}
                snapshot={snapshot}
                saving={generalSending}
                onClose={() => setGeneralSignOpen(false)}
                onSave={(signature) => {
                    setGeneralSignOpen(false);
                    if (signature) {
                        setGeneralSignature(signature);
                        // Requested UX: top-centred alert when a signature comes in.
                        toast.success(t('montage.signatureCaptured'), { position: 'top-center' });
                    }
                }}
            />
        </div>
    );
};
