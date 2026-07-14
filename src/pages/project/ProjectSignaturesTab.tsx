import type { ProjectDto } from '../../types/project';

import { SignatureDispatchModal } from './features/projects/components/signatures/SignatureDispatchModal';
import { SignatureTargetList } from './features/projects/components/signatures/SignatureTargetList';
import { useProjectSignatures } from './features/projects/hooks/useProjectSignatures';

import { t } from '@/i18n/translate';

type Order = { id: string } | null;

export const ProjectSignaturesTab = ({ project, order }: { project: ProjectDto; order: Order; isPrimary?: boolean }) => {
    const salesOrderId = order?.id || null;
    const {
        deliveries,
        requests,
        loading,
        fieldReports,
        activeTarget,
        notifyTech,
        emailCustomer,
        email,
        busy,
        openTarget,
        closeTarget,
        dispatch,
        setNotifyTech,
        setEmailCustomer,
        setEmail,
    } = useProjectSignatures({ project, salesOrderId });

    if (loading) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;

    return (
        <div className="space-y-4">
            <p className="text-[12.5px] text-slate-500">{t('signatures.projectDispatchHint')}</p>

            <SignatureTargetList
                project={project}
                salesOrderId={salesOrderId}
                fieldReports={fieldReports}
                deliveries={deliveries}
                requests={requests}
                onSend={openTarget}
            />

            <SignatureDispatchModal
                target={activeTarget}
                notifyTech={notifyTech}
                emailCustomer={emailCustomer}
                email={email}
                busy={busy}
                onNotifyTechChange={setNotifyTech}
                onEmailCustomerChange={setEmailCustomer}
                onEmailChange={setEmail}
                onClose={closeTarget}
                onSend={dispatch}
            />
        </div>
    );
};

export default ProjectSignaturesTab;
