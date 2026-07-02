import type { ReactNode } from 'react';
import {
    ArrowLeft,
    Briefcase01 as BriefcaseBusiness,
    FileCheck02 as FileCheck2,
    FileDownload02 as FileDown,
    GitBranch01 as GitBranch,
} from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PageHeader } from '../../../../components/layout/PageHeader';
import { Button } from '../../../../components/ui-shared/Button';
import { StatusChip } from '../../../../components/ui-shared/StatusBadge';
import type { TenderListItem } from '../../../../types/tender';

type StatusChipVariant = 'active' | 'approved' | 'passive' | 'info' | 'warning' | 'danger' | 'neutral' | 'order';

type TenderDetailHeaderProps = {
    tender: Pick<TenderListItem, 'tenderNumber' | 'version'>;
    tenderStatusVariant: StatusChipVariant;
    tenderStatusLabel: ReactNode;
    tenderHeaderMeta: ReactNode;
    isDraft: boolean;
    canManage: boolean;
    canExport: boolean;
    canApprove: boolean;
    isSalesOrderStatus: boolean;
    projectId?: string | null;
    projectCreateLoading: boolean;
    onBack: () => void;
    onCreateVersion: () => void;
    onExport: () => void;
    onCreateProject: () => void;
    onOpenOrderDecision: () => void;
    onApprove: () => void;
};

export const TenderDetailHeader = ({
    tender,
    tenderStatusVariant,
    tenderStatusLabel,
    tenderHeaderMeta,
    isDraft,
    canManage,
    canExport,
    canApprove,
    isSalesOrderStatus,
    projectId,
    projectCreateLoading,
    onBack,
    onCreateVersion,
    onExport,
    onCreateProject,
    onOpenOrderDecision,
    onApprove,
}: TenderDetailHeaderProps) => (
    <PageHeader
        title={
            <span className="flex items-center gap-3">
                <span>{tender.tenderNumber}</span>
                <span className="text-[12px] font-mono text-slate-400">v{tender.version}</span>
                <StatusChip variant={tenderStatusVariant}>
                    {tenderStatusLabel}
                </StatusChip>
            </span>
        }
        description={tenderHeaderMeta}
        actions={
            <>
                <Button variant="ghost" icon={<ArrowLeft size={13} />} onClick={onBack}>{t('tenders.list_back')}</Button>
                {!isDraft && canManage && (!isSalesOrderStatus || projectId) && (
                    <Button variant="secondary" icon={<GitBranch size={13} />} onClick={onCreateVersion}>{t('tenders.new_versiyon')}</Button>
                )}
                {canExport && (
                    <Button variant="secondary" icon={<FileDown size={13} />} onClick={onExport}>{t('tenders.pdf_export')}</Button>
                )}
                {!isDraft && canManage && (
                    <Button
                        variant="primary"
                        icon={<BriefcaseBusiness size={13} />}
                        loading={projectCreateLoading}
                        onClick={projectId ? onCreateProject : onOpenOrderDecision}
                    >
                        {projectId ?t('tenders.siparise_git') :t('tenders.order_create')}
                    </Button>
                )}
                {isDraft && canApprove && (
                    <Button variant="primary" icon={<FileCheck2 size={13} />} onClick={onApprove}>{t('common.confirm')}</Button>
                )}
            </>
        }
    />
);
