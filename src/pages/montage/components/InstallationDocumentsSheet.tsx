import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LuFileText, LuFolderOpen, LuListChecks } from 'react-icons/lu';

import { AppointmentDocumentsPanel } from '@/components/ui-shared/AppointmentDocuments';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { FormsContextPanel } from '@/pages/crm/forms/components/FormsContextPanel';
import { ReportsSheet } from '@/pages/project/features/components/detail/reports/ReportsSheet';

import type { MontageOrderRow } from '../types/montage';

type DocumentsTab = 'checklists' | 'pdfs';

const TabButton = ({ active, icon, children, onClick }: {
    active: boolean;
    icon: React.ReactNode;
    children: React.ReactNode;
    onClick: () => void;
}) => (
    <button
        type="button"
        role="tab"
        aria-selected={active}
        onClick={onClick}
        className={`inline-flex min-h-11 items-center gap-2 border-b-2 px-4 text-[13.5px] font-semibold transition-colors ${
            active
                ? 'border-[#1f2654] text-[#1f2654] dark:border-amber-400 dark:text-amber-300'
                : 'border-transparent text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:text-white/55 dark:hover:bg-white/5 dark:hover:text-white'
        }`}
    >
        {icon}{children}
    </button>
);

const DocumentCard = ({ icon, title, description, disabled, onClick }: {
    icon: React.ReactNode;
    title: string;
    description: string;
    disabled?: boolean;
    onClick?: () => void;
}) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="group flex min-h-[92px] w-full items-center gap-4 rounded-xl border border-slate-200 bg-white px-5 py-4 text-left shadow-sm transition hover:-translate-y-px hover:border-[#1f2654]/35 hover:shadow-md disabled:cursor-default disabled:opacity-45 disabled:hover:translate-y-0 disabled:hover:border-slate-200 disabled:hover:shadow-sm dark:border-white/10 dark:bg-white/[0.035] dark:hover:border-amber-400/40"
    >
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#eef2fb] text-[#1f2654] group-hover:bg-[#1f2654] group-hover:text-white dark:bg-amber-500/10 dark:text-amber-300 dark:group-hover:bg-amber-500 dark:group-hover:text-black">
            {icon}
        </span>
        <span className="min-w-0">
            <span className="block text-[13.5px] font-bold text-slate-900 dark:text-white">{title}</span>
            <span className="mt-1 block text-[12px] leading-5 text-slate-500 dark:text-white/55">{description}</span>
        </span>
    </button>
);

/**
 * A single, quiet document hub for one installation. Checklists no longer live
 * inside the field report; the top menu switches between editable checklists
 * and appointment/report PDFs without stacking cards behind page chrome.
 */
export const InstallationDocumentsSheet = ({ row, onClose }: {
    row: MontageOrderRow | null;
    onClose: () => void;
}) => {
    const navigate = useNavigate();
    const [tab, setTab] = useState<DocumentsTab>('checklists');
    const [detail, setDetail] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setTab('checklists');
        setDetail(null);
        if (!row) return;
        let cancelled = false;
        setLoading(true);
        projectApi.getMyInstallationDetail(row.id)
            .then((value) => { if (!cancelled) setDetail(value); })
            .catch(() => { if (!cancelled) setDetail(null); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [row]);

    if (!row) return null;
    const projectId = detail?.projectId || detail?.project?.id || null;
    const openRoute = (path: string) => { onClose(); navigate(path); };

    return (
        <ReportsSheet
            open
            title={t('montage.documents.title')}
            subtitle={`${row.customerName} · ${row.orderNumber}`}
            onClose={onClose}
            width={1180}
            zIndex={600}
            headerActions={<LuFolderOpen size={18} className="text-[#1f2654] dark:text-amber-300" />}
        >
            <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-6 backdrop-blur dark:border-white/10 dark:bg-[#17191c]/95 sm:px-8">
                <nav role="tablist" aria-label={t('montage.documents.title')} className="flex items-center gap-1">
                    <TabButton active={tab === 'checklists'} icon={<LuListChecks size={16} />} onClick={() => setTab('checklists')}>
                        {t('forms.panel.title')}
                    </TabButton>
                    <TabButton active={tab === 'pdfs'} icon={<LuFileText size={16} />} onClick={() => setTab('pdfs')}>
                        {t('montage.documents.appointmentPdfs')}
                    </TabButton>
                </nav>
            </div>

            <div className="min-h-full bg-slate-50/55 px-6 py-6 dark:bg-transparent sm:px-8 sm:py-8">
                {tab === 'checklists' ? (
                    <FormsContextPanel
                        kind="appointment"
                        id={row.id}
                        sections={['forms']}
                        canCreate
                        variant="montage"
                        onOpen={(submissionId) => openRoute(`/montage/forms/${submissionId}?back=${encodeURIComponent(location.pathname)}`)}
                    />
                ) : (
                    <div className="space-y-6">
                        <section>
                            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">{t('montage.documents.reports')}</h3>
                            <div className="grid gap-3 md:grid-cols-3">
                                <DocumentCard
                                    icon={<LuFileText size={20} />}
                                    title={t('projects.reportsHub.fieldSection')}
                                    description={row.fieldReportId ? t('projects.reportAvailable') : t('projects.reportUnavailable')}
                                    disabled={!row.fieldReportId}
                                    onClick={() => row.fieldReportId && openRoute(`/montage/reports/view/field/${row.fieldReportId}`)}
                                />
                                <DocumentCard
                                    icon={<LuFileText size={20} />}
                                    title={t('projects.reportsHub.generalSection')}
                                    description={t('montage.documents.openOrCreate')}
                                    disabled={loading}
                                    onClick={() => openRoute(`/montage/reports/general/${row.id}`)}
                                />
                                <DocumentCard
                                    icon={<LuListChecks size={20} />}
                                    title={t('projects.reportsHub.deliverySection')}
                                    description={t('montage.documents.openOrCreate')}
                                    disabled={loading || !projectId}
                                    onClick={() => projectId && openRoute(`/montage/reports/delivery/${projectId}?appointmentId=${encodeURIComponent(row.id)}`)}
                                />
                            </div>
                        </section>

                        <section>
                            <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.08em] text-slate-500 dark:text-white/50">{t('calendar.docs.title')}</h3>
                            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-white/10 dark:bg-white/[0.035]">
                                <AppointmentDocumentsPanel appointmentId={row.id} technician variant="montage" />
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </ReportsSheet>
    );
};

