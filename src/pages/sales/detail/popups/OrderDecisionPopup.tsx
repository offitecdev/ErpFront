import { Check } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { SalesOrderMode } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';

import { PopupActions, PopupButton, PopupEmpty, PopupField, PopupNote, TenderDialog } from './shell/TenderPopupShell';

type OrderDecisionPopupProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    onSubmit: () => void;
    mode: SalesOrderMode | null;
    onModeChange: (mode: SalesOrderMode) => void;
    attachExisting: boolean;
    onAttachExistingChange: (value: boolean) => void;
    // Delivery order: mandatory delivery date (YYYY-MM-DD).
    deliveryDate: string;
    onDeliveryDateChange: (value: string) => void;
    projectSearch: string;
    onProjectSearchChange: (value: string) => void;
    projectSearchLoading: boolean;
    projectSearchResults: ProjectDto[];
    selectedProject: ProjectDto | null;
    onSelectProject: (project: ProjectDto | null) => void;
    /**
     * Customer address of the quote — needed only as YES/NO: without it no
     * order confirmation goes out and the dialog says so. The addresses
     * themselves are NOT shown (user request).
     */
    notifyRecipient: string | null;
};

/**
 * "Confirm / create order" — project or direct delivery? A centred dialog: the
 * choice is required and must not be lost behind the page. Two option tiles,
 * then only what the chosen path needs.
 */
export const OrderDecisionPopup = ({
    open,
    onClose,
    loading,
    onSubmit,
    mode,
    onModeChange,
    attachExisting,
    onAttachExistingChange,
    deliveryDate,
    onDeliveryDateChange,
    projectSearch,
    onProjectSearchChange,
    projectSearchLoading,
    projectSearchResults,
    selectedProject,
    onSelectProject,
    notifyRecipient,
}: OrderDecisionPopupProps) => (
    <TenderDialog
        open={open}
        onClose={() => { if (!loading) onClose(); }}
        title={t('tenders.order_project_or_direct_question')}
        subtitle={t('tenders.order_choice_required')}
        width={640}
        closeOnBackdrop={false}
        closeOnEscape={!loading}
        footer={(
            <PopupActions>
                <PopupButton disabled={loading} onClick={onClose}>{t('tenders.vazgec')}</PopupButton>
                <PopupButton variant="primary" loading={loading} onClick={onSubmit}>{t('tenders.order_create')}</PopupButton>
            </PopupActions>
        )}
    >
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2" role="radiogroup">
            <button
                type="button"
                role="radio"
                aria-checked={mode === 'PROJECT_NEW'}
                onClick={() => onModeChange('PROJECT_NEW')}
                className={`ofi-tp-tile ${mode === 'PROJECT_NEW' ? 'is-on' : ''}`}
            >
                <span className="ofi-tp-tile__title">{t('tenders.project_icin_order_create')}</span>
                <span className="ofi-tp-tile__desc">{t('tenders.create_project_or_link_existing')}</span>
            </button>
            <button
                type="button"
                role="radio"
                aria-checked={mode === 'INVOICE'}
                onClick={() => {
                    onModeChange('INVOICE');
                    onAttachExistingChange(false);
                    onSelectProject(null);
                }}
                className={`ofi-tp-tile ${mode === 'INVOICE' ? 'is-on' : ''}`}
            >
                <span className="ofi-tp-tile__title">{t('tenders.delivery_order_create')}</span>
                <span className="ofi-tp-tile__desc">{t('tenders.project_olusturulmaz_crm_order_listesine_duser')}</span>
            </button>
        </div>

        {/* A delivery order's only time commitment is the delivery date, so it
            is REQUIRED. With a project the appointments carry the schedule. The
            field shows the quote's "Lieferdatum" and updates it on save. */}
        {mode === 'INVOICE' && (
            <div className="pt-2">
                <PopupField label={t('tenders.lieferdatum_intern')} required>
                    <input
                        type="date"
                        className="ofi-cal-input w-[180px]"
                        value={deliveryDate}
                        onChange={(event) => onDeliveryDateChange(event.target.value)}
                    />
                </PopupField>
            </div>
        )}

        {mode === 'PROJECT_NEW' && (
            <div className="pt-3">
                <label className="ofi-tp-checkrow">
                    <span className={`ofi-cal-check ${attachExisting ? 'is-on' : ''}`}>{attachExisting && <Check size={11} />}</span>
                    <input
                        type="checkbox"
                        className="sr-only"
                        checked={attachExisting}
                        onChange={(event) => {
                            onAttachExistingChange(event.target.checked);
                            onSelectProject(null);
                        }}
                    />
                    {t('tenders.add_to_existing_project')}
                </label>

                {!attachExisting ? (
                    // The project name is NOT entered here — the system names the
                    // project by its own code (PR-2026-10001) and the counter
                    // continues where it left off.
                    <p className="pt-2 text-[12.5px]" style={{ color: 'var(--ofi-cal-muted)' }}>{t('tenders.project_code_auto_hint')}</p>
                ) : (
                    <div className="pt-1">
                        <PopupField label={t('tenders.project_search')}>
                            <input
                                autoFocus
                                className="ofi-cal-input w-full"
                                value={projectSearch}
                                onChange={(event) => onProjectSearchChange(event.target.value)}
                                placeholder={t('tenders.project_adi_customer_veya_tender_no')}
                            />
                        </PopupField>
                        <div className="ofi-tp-list ofi-tp-list--scroll" style={{ maxHeight: 220 }}>
                            {projectSearchLoading ? (
                                <PopupEmpty>{t('tenders.popup.searching_projects')}</PopupEmpty>
                            ) : projectSearchResults.length === 0 ? (
                                <PopupEmpty>{t('tenders.project_not_found')}</PopupEmpty>
                            ) : (
                                projectSearchResults.map((project) => (
                                    <button
                                        key={project.id}
                                        type="button"
                                        onClick={() => onSelectProject(project)}
                                        className={`ofi-tp-row is-clickable ${selectedProject?.id === project.id ? 'is-selected' : ''}`}
                                    >
                                        <span className="ofi-tp-row__main">
                                            <span className="ofi-tp-row__title">{project.projectName}</span>
                                            <span className="ofi-tp-row__meta">{project.customer?.companyName || t('tenders.customer_not_found')}</span>
                                        </span>
                                        {selectedProject?.id === project.id && <Check size={15} style={{ color: 'var(--ofi-cal-accent)' }} />}
                                    </button>
                                ))
                            )}
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* The order confirmation goes to the customer automatically on
            creation, CC to the quote's CC list, the quote PDF attached. No
            switch — and DELIBERATELY without an address list (user request):
            only a missing recipient is worth a message, since then nothing
            goes out at all. */}
        <PopupNote className="mt-4" tone={notifyRecipient ? 'neutral' : 'warning'}>
            {notifyRecipient ? t('tenders.order_mail_auto_notice') : t('tenders.notify_customer_no_email')}
        </PopupNote>
    </TenderDialog>
);
