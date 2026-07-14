import React from 'react';
import Modal from 'antd/es/modal';
import { CheckCircle, ArrowRight } from '@/components/icons/antIconCompat';

import { Button } from '../../../../components/ui-shared/Button';
import { t } from '@/i18n/translate';

interface ProjectCreatedModalProps {
    open: boolean;
    /** Navigate to the freshly created project. Left button. */
    onGoToProject: () => void;
    /** Close the popup and remain on the tender. Right button. */
    onStay: () => void;
}

/**
 * Success popup shown right after a tender is turned into a project. Lets the
 * user jump straight into the new project or keep working on the tender instead
 * of being navigated away automatically.
 */
export const ProjectCreatedModal: React.FC<ProjectCreatedModalProps> = ({
    open,
    onGoToProject,
    onStay,
}) => {
    return (
        <Modal
            open={open}
            onCancel={onStay}
            centered
            footer={null}
            width={456}
            destroyOnHidden
        >
            <div className="flex items-start gap-4">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                    <CheckCircle size={22} />
                </div>
                <div className="min-w-0 flex-1">
                    <h2 className="text-lg font-semibold text-slate-900">{t('tenders.project_created_title')}</h2>
                    <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{t('tenders.project_created_desc')}</p>
                </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
                <Button variant="primary" onClick={onGoToProject} iconTrailing={<ArrowRight size={14} />} className="flex-1">
                    {t('tenders.project_go_to')}
                </Button>
                <Button variant="secondary" onClick={onStay} className="flex-1">
                    {t('tenders.project_stay')}
                </Button>
            </div>
        </Modal>
    );
};
