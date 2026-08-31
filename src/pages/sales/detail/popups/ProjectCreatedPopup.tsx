import { ArrowRight, CheckCircle } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';

import { PopupActions, PopupButton, TenderDialog } from './shell/TenderPopupShell';

type ProjectCreatedPopupProps = {
    open: boolean;
    /** Navigate to the freshly created project. */
    onGoToProject: () => void;
    /** Close and remain on the quote. */
    onStay: () => void;
};

/**
 * Success dialog right after a quote became a project: jump into the project
 * or keep working on the quote, instead of being navigated away automatically.
 */
export const ProjectCreatedPopup = ({ open, onGoToProject, onStay }: ProjectCreatedPopupProps) => (
    <TenderDialog
        open={open}
        onClose={onStay}
        title={t('tenders.project_created_title')}
        subtitle={t('tenders.project_created_desc')}
        icon={<CheckCircle size={20} />}
        tone="success"
        width={440}
        footer={(
            <PopupActions>
                <PopupButton onClick={onStay}>{t('tenders.project_stay')}</PopupButton>
                <PopupButton variant="primary" onClick={onGoToProject}>
                    {t('tenders.project_go_to')}
                    <ArrowRight size={14} />
                </PopupButton>
            </PopupActions>
        )}
    />
);
