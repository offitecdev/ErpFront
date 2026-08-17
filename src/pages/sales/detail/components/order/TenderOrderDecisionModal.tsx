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
    mode: SalesOrderMode | null;
    onModeChange: (mode: SalesOrderMode) => void;
    attachExisting: boolean;
    onAttachExistingChange: (value: boolean) => void;
    // Teslimat siparişinde zorunlu teslim tarihi (YYYY-MM-DD).
    deliveryDate: string;
    onDeliveryDateChange: (value: string) => void;
    projectSearch: string;
    onProjectSearchChange: (value: string) => void;
    projectSearchLoading: boolean;
    projectSearchResults: ProjectDto[];
    selectedProject: ProjectDto | null;
    onSelectProject: (project: ProjectDto | null) => void;
    /**
     * Kundenadresse der Offerte — nur als JA/NEIN gebraucht: fehlt sie, geht
     * keine Auftragsbestätigung hinaus und der Dialog sagt das. Die Adressen
     * selbst werden NICHT angezeigt (Benutzerwunsch).
     */
    notifyRecipient: string | null;
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
    deliveryDate,
    onDeliveryDateChange,
    projectSearch,
    onProjectSearchChange,
    projectSearchLoading,
    projectSearchResults,
    selectedProject,
    onSelectProject,
    notifyRecipient,
}: TenderOrderDecisionModalProps) => (
    <Modal
        open={open}
        onClose={() => {
            if (!loading) onClose();
        }}
        title={t('tenders.order_project_or_direct_question')}
        description={t('tenders.order_choice_required')}
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
                    className={`rounded-[2px] border px-3 py-3 text-left transition-colors ${mode === 'PROJECT_NEW' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
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
                    className={`rounded-[2px] border px-3 py-3 text-left transition-colors ${mode === 'INVOICE' ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'}`}
                >
                    <div className="text-[13px] font-semibold">{t('tenders.delivery_order_create')}</div>
                    <div className="mt-1 text-[11.5px] text-slate-500">{t('tenders.project_olusturulmaz_crm_order_listesine_duser')}</div>
                </button>
            </div>

            {/* Teslimat siparişinin tek zaman taahhüdü teslim tarihidir, bu yüzden
                ZORUNLUDUR. Projeli siparişte takvimi randevular taşır. Alan
                teklifin "Lieferdatum" değerini gösterir ve kaydederken onu günceller. */}
            {mode === 'INVOICE' && (
                <div className="space-y-3 rounded-[2px] border border-slate-200 bg-slate-50/60 p-3">
                    <Field label={t('tenders.lieferdatum_intern')} required>
                        <Input
                            type="date"
                            value={deliveryDate}
                            onChange={(event) => onDeliveryDateChange(event.target.value)}
                        />
                    </Field>
                </div>
            )}

            {mode === 'PROJECT_NEW' && (
                <div className="space-y-3 rounded-[2px] border border-slate-200 bg-slate-50/60 p-3">
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
                        // Proje adı burada GİRİLMEZ — sistem projeyi kendi
                        // koduyla (PR-2026-10001) adlandırır ve sayaç kaldığı
                        // yerden devam eder.
                        <p className="text-[12px] text-slate-500">{t('tenders.project_code_auto_hint')}</p>
                    ) : (
                        <div className="space-y-2 transition-all duration-200 ease-out">
                            <Field label={t('tenders.project_search')}>
                                <Input
                                    value={projectSearch}
                                    onChange={(event) => onProjectSearchChange(event.target.value)}
                                    placeholder={t('tenders.project_adi_customer_veya_tender_no')}
                                />
                            </Field>
                            <div className="max-h-52 overflow-y-auto rounded-[2px] border border-slate-200 bg-white">
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

            {/* Die Auftragsbestätigung geht mit dem Erstellen automatisch an den
                Kunden, in Kopie an die CC-Liste der Offerte, die Offerte als PDF
                im Anhang. Kein Schalter — und BEWUSST ohne Adressliste
                (Benutzerwunsch): nur der fehlende Empfänger ist eine Meldung
                wert, denn dann geht gar nichts hinaus. */}
            <div className="rounded-[2px] border border-slate-200 bg-slate-50/60 px-3 py-2 text-[12px] text-slate-600">
                {notifyRecipient
                    ? t('tenders.order_mail_auto_notice')
                    : t('tenders.notify_customer_no_email')}
            </div>
        </div>
    </Modal>
);
