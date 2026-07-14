import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { deliveryReportApi, signatureApi, type DeliveryReportDto, type SignatureRequestDto } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';
import { t } from '@/i18n/translate';

import type { SignatureDispatchTarget } from '../types/signatureTypes';

type UseProjectSignaturesArgs = {
    project: ProjectDto;
    salesOrderId: string | null;
};

/**
 * Owns the project signatures screen: delivery report + signature request
 * loading (scoped to the project), the dispatch modal state, and the
 * notify/email channel selection. Components consume this and only render.
 */
export const useProjectSignatures = ({ project, salesOrderId }: UseProjectSignaturesArgs) => {
    const [deliveries, setDeliveries] = useState<DeliveryReportDto[]>([]);
    const [requests, setRequests] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTarget, setActiveTarget] = useState<SignatureDispatchTarget | null>(null);
    const [notifyTech, setNotifyTech] = useState(true);
    const [emailCustomer, setEmailCustomer] = useState(false);
    const [email, setEmail] = useState('');
    const [busy, setBusy] = useState(false);

    // Field reports for this order (or all, when unscoped) — drives the field
    // rows and the general roll-up snapshot.
    const fieldReports = useMemo(
        () => ((project as any).reports || []).filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId),
        [project, salesOrderId],
    );

    const load = async () => {
        setLoading(true);
        try {
            const [del, reqs] = await Promise.all([
                deliveryReportApi.list({ projectId: project.id }).catch(() => [] as DeliveryReportDto[]),
                signatureApi.list().catch(() => [] as SignatureRequestDto[]),
            ]);
            setDeliveries(del);
            setRequests(reqs.filter((r) => r.projectId === project.id));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [project.id, salesOrderId]);

    const openTarget = (target: SignatureDispatchTarget) => {
        setActiveTarget(target);
        setNotifyTech(true);
        setEmailCustomer(Boolean(project.customer?.mainEmail));
        setEmail(project.customer?.mainEmail || '');
    };
    const closeTarget = () => setActiveTarget(null);

    const dispatch = async () => {
        if (!activeTarget) return;
        const willEmail = emailCustomer && Boolean(email.trim());
        if (!notifyTech && !willEmail) {
            toast.error(t('signatures.chooseChannel'));
            return;
        }
        setBusy(true);
        try {
            const res = await signatureApi.create({
                reportType: activeTarget.reportType,
                reportId: activeTarget.reportId,
                projectId: project.id,
                title: activeTarget.title,
                snapshot: activeTarget.snapshot,
                customerEmail: email.trim() || null,
                sendEmail: willEmail,
                notifyTechnician: notifyTech,
            });
            const parts: string[] = [];
            if (res.notified) parts.push(t('signatures.notifiedTech'));
            if (res.emailed) parts.push(t('signatures.emailedCustomer'));
            toast.success(parts.length ? parts.join(' · ') : t('signatures.dispatched'));
            setActiveTarget(null);
            await load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('signatures.createError'));
        } finally {
            setBusy(false);
        }
    };

    return {
        deliveries,
        requests,
        loading,
        fieldReports,
        activeTarget,
        notifyTech,
        emailCustomer,
        email,
        busy,
        load,
        openTarget,
        closeTarget,
        dispatch,
        setNotifyTech,
        setEmailCustomer,
        setEmail,
    };
};
