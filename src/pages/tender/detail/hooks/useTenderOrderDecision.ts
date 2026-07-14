import { useEffect, useState } from 'react';
import type { NavigateFunction } from 'react-router-dom';
import { toast } from 'sonner';

import { t } from '@/i18n/translate';
import { localizeTenderNumber } from '@/utils/tenderNumber';

import { projectApi, type SalesOrderMode } from '../../../../lib/api/project';
import type { ProjectDto } from '../../../../types/project';
import type { TenderListItem } from '../../../../types/tender';

type UseTenderOrderDecisionParams = {
    tender: TenderListItem | undefined;
    isDirty: boolean;
    overtimeHourlyRate: number;
    fetchDetail: (id: string, silent?: boolean) => Promise<void>;
    navigate: NavigateFunction;
    // Flushes all staged line/meta edits (the top-bar Save); Approve and the
    // order flows call this automatically instead of demanding a manual save.
    saveAll: () => Promise<boolean>;
};

// An order requires the quote's single project/delivery address (EITHER the
// Projektadresse or the Lieferadresse — one of the two, never both) and the
// billing address. Shows a toast naming whichever is missing and returns false
// so the caller can bail out. When "same as installation" is on, billing
// mirrors that active address.
const hasRequiredAddresses = (tender: TenderListItem): boolean => {
    const installation = String((tender as any).installationAddress ?? '').trim();
    const delivery = String((tender as any).deliveryAddress ?? '').trim();
    const active = installation || delivery;
    const sameAsInstallation = !!(tender as any).billingSameAsInstallation;
    const billing = sameAsInstallation ? active : String((tender as any).billingAddress ?? '').trim();
    if (!active) {
        toast.error(t('tenders.installation_address_required'));
        return false;
    }
    if (!billing) {
        toast.error(t('tenders.billing_address_required'));
        return false;
    }
    return true;
};

// Owns the "turn this tender into an order/project" flow: the decision modal's
// state (mode, attach-to-existing toggle, new project name), the debounced
// existing-project search, and the submit/approve/create-project handlers. The
// resulting project id (freshly created or already linked) is surfaced as
// `projectId` so the caller can drive its sales-order UI.
export const useTenderOrderDecision = ({ tender, isDirty, overtimeHourlyRate, fetchDetail, navigate, saveAll }: UseTenderOrderDecisionParams) => {
    const [projectCreateLoading, setProjectCreateLoading] = useState(false);
    const [createdProjectId, setCreatedProjectId] = useState<string | null>(null);
    // When set, the "Project created successfully" popup is shown, offering to
    // jump into the new project or stay on the tender.
    const [projectCreatedModalId, setProjectCreatedModalId] = useState<string | null>(null);
    const [orderDecisionOpen, setOrderDecisionOpen] = useState(false);
    const [orderDecisionLoading, setOrderDecisionLoading] = useState(false);
    // Null until the user picks a card — the decision modal opens with neither
    // order type pre-selected.
    const [orderMode, setOrderMode] = useState<SalesOrderMode | null>(null);
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

    // Approve/order flows persist pending edits automatically — clicking them
    // acts as a save, so no separate manual Save step is required.
    const flushPendingEdits = async (): Promise<boolean> => {
        if (!isDirty) return true;
        return saveAll();
    };

    const openOrderDecision = async () => {
        if (!tender) return;
        if (!(await flushPendingEdits())) return;
        setOrderMode(null);
        setAttachExistingProject(false);
        setSelectedExistingProject(null);
        setProjectSearch('');
        setProjectSearchResults([]);
        setOrderProjectName(localizeTenderNumber(tender.tenderNumber));
        setOrderDecisionOpen(true);
    };

    const handleSubmitOrderDecision = async () => {
        if (!tender) return;
        // Both the installation (deliveryAddress) and billing addresses must be set
        // before an order can be created.
        if (!hasRequiredAddresses(tender)) return;
        // No card chosen yet — force the user to pick an order type first.
        if (!orderMode) {
            toast.error(t('tenders.order_turunu_select'));
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
            if (res.project?.id) setProjectCreatedModalId(res.project.id);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('tenders.order_olusturulamadi'));
        } finally {
            setProjectCreateLoading(false);
            setOrderDecisionLoading(false);
        }
    };

    const handleApprove = async () => {
        if (!tender) return;
        // Approve doubles as Save: staged line/meta edits are flushed first.
        if (!(await flushPendingEdits())) return;
        // Block the whole approve → deliver flow up front unless the
        // installation, delivery and billing addresses are set.
        if (!hasRequiredAddresses(tender)) return;
        await openOrderDecision();
    };

    const handleCreateProject = async () => {
        if (projectId) {
            navigate(`/projects/${projectId}`);
            return;
        }
        if (!tender) return;
        // Creating the project also acts as save for any staged edits.
        if (!(await flushPendingEdits())) return;
        if (!hasRequiredAddresses(tender)) return;
        setProjectCreateLoading(true);
        try {
            const res = await projectApi.createFromTender(tender.id, undefined, overtimeHourlyRate);
            setCreatedProjectId(res.project.id);
            toast.success(res.message ||t('tenders.order_created'));
            await fetchDetail(tender.id, true);
            // Ask the user whether to open the project or stay, instead of
            // navigating away automatically.
            setProjectCreatedModalId(res.project.id);
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
        // "Project created successfully" popup wiring.
        projectCreatedModalId,
        goToCreatedProject: () => {
            const target = projectCreatedModalId;
            setProjectCreatedModalId(null);
            if (target) navigate(`/projects/${target}`);
        },
        dismissProjectCreated: () => setProjectCreatedModalId(null),
    };
};
