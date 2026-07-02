import { Button } from '@/components/ui-shared/Button';
import { Field, Input } from '@/components/ui-shared/Field';
import { Modal } from '@/components/ui-shared/Modal';
import { t } from '@/i18n/translate';
import type { SalesOrderMode } from '@/lib/api/project';
import type { ProjectDto } from '@/types/project';

type TenderOrderDecisionModalProps = {
    open: boolean;
    onClose: () => void;
    loading: boolean;
    onSubmit: () => void;
    mode: SalesOrderMode;
    onModeChange: (mode: SalesOrderMode) => void;
    attachExisting: boolean;
    onAttachExistingChange: (value: boolean) => void;
    projectName: string;
    onProjectNameChange: (value: string) => void;
    projectSearch: string;
    onProjectSearchChange: (value: string) => void;
    projectSearchLoading: boolean;
    projectSearchResults: ProjectDto[];
    selectedProject: ProjectDto | null;
    onSelectProject: (project: ProjectDto | null) => void;
};

export const TenderOrderDecisionModal = ({
    open,
    onClose,
    loading,
    onSubmit,
    mode,
    onModeChange,
    attachExisting,
    onAttachExistingChange,
    projectName,
    onProjectNameChange,
    projectSearch,
    onProjectSearchChange,
    projectSearchLoading,
    projectSearchResults,
    selectedProject,
    onSelectProject,
}: TenderOrderDecisionModalProps) => (
    <Modal
        open={open}
        onClose={() => {
            if (!loading) onClose();
        }}
        title={t('tenders.order_turunu_select')}
        description={t('tenders.tender_onaylandiktan_sonra_order_record_create')}
        width="lg"
        closeOnBackdrop={false}
        footer={
            <>
                <Button variant="secondary" disabled={loading} onClick={onClose}>{t('tenders.vazgec')}</Button>
                <Button variant="primary" loading={loading} onClick={onSubmit}>{t('tenders.order_create')}</Button>
            </>
        }
    >
        <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                <button
                    type="button"
                    onClick={() => onModeChange('PROJECT_NEW')}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${mode === 'PROJECT_NEW' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    <div className="text-[13px] font-semibold">{t('tenders.project_icin_order_create')}</div>
                    <div className="mt-1 text-[11.5px] text-slate-500">{t('tenders.create_project_or_link_existing')}</div>
                </button>
                <button
                    type="button"
                    onClick={() => {
                        onModeChange('INVOICE');
                        onAttachExistingChange(false);
                        onSelectProject(null);
                    }}
                    className={`rounded-md border px-3 py-3 text-left transition-colors ${mode === 'INVOICE' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    <div className="text-[13px] font-semibold">{t('tenders.invoice_icin_order_create')}</div>
                    <div className="mt-1 text-[11.5px] text-slate-500">{t('tenders.project_olusturulmaz_crm_order_listesine_duser')}</div>
                </button>
            </div>

            {mode === 'PROJECT_NEW' && (
                <div className="space-y-3 rounded-md border border-slate-200 bg-slate-50/60 p-3">
                    <label className="flex items-center gap-2 text-[12px] font-medium text-slate-700">
                        <input
                            type="checkbox"
                            checked={attachExisting}
                            onChange={(event) => {
                                onAttachExistingChange(event.target.checked);
                                onSelectProject(null);
                            }}
                        />{t('tenders.add_to_existing_project')}</label>

                    {!attachExisting ? (
                        <Field label={t('tenders.project_ismi')}>
                            <Input value={projectName} onChange={(event) => onProjectNameChange(event.target.value)} />
                        </Field>
                    ) : (
                        <div className="space-y-2 transition-all duration-200 ease-out">
                            <Field label={t('tenders.project_search')}>
                                <Input
                                    value={projectSearch}
                                    onChange={(event) => onProjectSearchChange(event.target.value)}
                                    placeholder={t('tenders.project_adi_customer_veya_tender_no')}
                                />
                            </Field>
                            <div className="max-h-52 overflow-y-auto rounded-md border border-slate-200 bg-white">
                                {projectSearchLoading ? (
                                    <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('tenders.projects_araniyor')}</div>
                                ) : projectSearchResults.length === 0 ? (
                                    <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('tenders.project_not_found')}</div>
                                ) : (
                                    <div className="divide-y divide-slate-100">
                                        {projectSearchResults.map((project) => (
                                            <button
                                                key={project.id}
                                                type="button"
                                                onClick={() => onSelectProject(project)}
                                                className={`w-full px-3 py-2 text-left transition-colors ${selectedProject?.id === project.id ? 'bg-emerald-50 text-emerald-900' : 'hover:bg-slate-50'}`}
                                            >
                                                <div className="text-[13px] font-semibold">{project.projectName}</div>
                                                <div className="mt-0.5 text-[11.5px] text-slate-500">{project.customer?.companyName ||t('tenders.customer_not_found')}</div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    </Modal>
);
