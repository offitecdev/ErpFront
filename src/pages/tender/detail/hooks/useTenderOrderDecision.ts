import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';

import { projectApi, type SalesOrderMode } from '../../../../lib/api/project';
import type { ProjectDto } from '../../../../types/project';
import type { TenderListItem } from '../../../../types/tender';

type UseTenderOrderDecisionParams = {
    tender: TenderListItem | undefined;
    isDirty: boolean;
    overtimeHourlyRate: number;
    fetchDetail: (id: string, silent?: boolean) => Promise<void>;
    navigate: NavigateFunction;
};

// Owns the "turn this tender into an order/project" flow: the decision modal's
// state (mode, attach-to-existing toggle, new project name), the debounced
// existing-project search, and the submit/approve/create-project handlers. The
// resulting project id (freshly created or already linked) is surfaced as
// `projectId` so the caller can drive its sales-order UI.
export const useTenderOrderDecision = ({ tender, isDirty, overtimeHourlyRate, fetchDetail, navigate }: UseTenderOrderDecisionParams) => {
    const [projectCreateLoading, setProjectCreateLoading] = useState(false);
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
    const [orderDecisionOpen, setOrderDecisionOpen] = useState(false);
    const [orderDecisionLoading, setOrderDecisionLoading] = useState(false);
    const [orderMode, setOrderMode] = useState<SalesOrderMode>('PROJECT_NEW');
    const [attachExistingProject, setAttachExistingProject] = useState(false);
    const [orderProjectName, setOrderProjectName] = useState('');
    const [projectSearch, setProjectSearch] = useState('');
    const [projectSearchLoading, setProjectSearchLoading] = useState(false);
    const [projectSearchResults, setProjectSearchResults] = useState<ProjectDto[]>([]);
    const [selectedExistingProject, setSelectedExistingProject] = useState<ProjectDto | null>(null);

    const projectId = tender?.projectId || createdProjectId;

    useEffect(() => {
        if (!orderDecisionOpen || !attachExistingProject) return;
        const timer = window.setTimeout(() => {
            setProjectSearchLoading(true);
            projectApi.list({ search: projectSearch.trim() || undefined })
                .then((projects) => setProjectSearchResults(projects.slice(0, 8)))
                .catch(() => setProjectSearchResults([]))
                .finally(() => setProjectSearchLoading(false));
        }, 220);

        return () => window.clearTimeout(timer);
    }, [attachExistingProject, orderDecisionOpen, projectSearch]);

    const openOrderDecision = () => {
        if (!tender) return;
        if (isDirty) { toast.error(t('tenders.once_kaydedin')); return; }
        setOrderMode('PROJECT_NEW');
        setAttachExistingProject(false);
        setSelectedExistingProject(null);
        setProjectSearch('');
        setProjectSearchResults([]);
        setOrderProjectName(tender.tenderNumber);
        setOrderDecisionOpen(true);
    };

    const handleSubmitOrderDecision = async () => {
        if (!tender) return;
        // No delivery address → nothing can be delivered, so the order isn't created.
        if (!String((tender as any).deliveryAddress ?? '').trim()) {
            toast.error(t('tenders.delivery_address_required'));
            return;
        }
        const finalMode: SalesOrderMode = orderMode === 'PROJECT_NEW' && attachExistingProject ? 'PROJECT_EXISTING' : orderMode;
        if (finalMode === 'PROJECT_NEW' && !orderProjectName.trim()) {
            toast.error(t('tenders.project_ismi_zorunludur'));
            return;
        }
        if (finalMode === 'PROJECT_EXISTING' && !selectedExistingProject) {
            toast.error(t('tenders.add_istediginiz_projeyi_select'));
            return;
        }

        setProjectCreateLoading(true);
        setOrderDecisionLoading(true);
        try {
            const res = await projectApi.createSalesOrderFromTender({
                tenderId: tender.id,
                mode: finalMode,
                projectName: finalMode === 'PROJECT_NEW' ? orderProjectName.trim() : undefined,
                projectId: finalMode === 'PROJECT_EXISTING' ? selectedExistingProject?.id : undefined,
                overtimeHourlyRate,
            });
            if (res.project?.id) setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            setOrderDecisionOpen(false);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
            setOrderDecisionLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!tender) return;
        // Manual save: unsaved line/meta edits must be persisted before approval.
        if (isDirty) { toast.error(t('tenders.once_kaydedin')); return; }
        // Block the whole approve → deliver flow up front when no delivery address
        // is set: with no address there is nothing to deliver.
        if (!String((tender as any).deliveryAddress ?? '').trim()) {
            toast.error(t('tenders.delivery_address_required'));
            return;
        }
        openOrderDecision();
    };

    const handleCreateProject = async () => {
        if (projectId) {
            navigate(`/projects/${projectId}`);
            return;
        }
        if (!tender) return;
        if (isDirty) { toast.error(t('tenders.once_kaydedin')); return; }
        // No delivery address → nothing can be delivered, so the order isn't created.
        if (!String((tender as any).deliveryAddress ?? '').trim()) {
            toast.error(t('tenders.delivery_address_required'));
            return;
        }
        setProjectCreateLoading(true);
        try {
            const res = await projectApi.createFromTender(tender.id, undefined, overtimeHourlyRate);
            setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            navigate(`/projects/${res.project.id}`);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
        }
    };

    return {
        projectCreateLoading,
        createdProjectId,
        setCreatedProjectId,
        projectId,
        orderDecisionOpen,
        setOrderDecisionOpen,
        orderDecisionLoading,
        orderMode,
        setOrderMode,
        attachExistingProject,
        setAttachExistingProject,
        orderProjectName,
        setOrderProjectName,
        projectSearch,
        setProjectSearch,
        projectSearchLoading,
        projectSearchResults,
        selectedExistingProject,
        setSelectedExistingProject,
        openOrderDecision,
        handleSubmitOrderDecision,
        handleApprove,
        handleCreateProject,
    };
};
