import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { ArrowLeft, ArrowRight, Clipboard } from '@/components/icons/antIconCompat';

import { PageHeader } from '../../components/layout/PageHeader';
import { Button } from '../../components/ui-shared/Button';
import { Card } from '../../components/ui-shared/Card';
import { EmptyState } from '../../components/ui-shared/EmptyState';

import { useInstallationDetail } from './features/installations/hooks/useInstallationDetail';
import { InstallationTaskList } from './features/installations/components/list/InstallationTaskList';
import { InstallationDetailCard } from './features/installations/components/detail/InstallationDetailCard';

import { t } from '@/i18n/translate';

import { useTranslation } from 'react-i18next';

const useLanguageRefresh = () => {
    const { i18n } = useTranslation();
    const [, setTick] = useState(0);
    useEffect(() => {
        const handler = () => setTick(t => t + 1);
        i18n.on('languageChanged', handler);
        return () => i18n.off('languageChanged', handler);
    }, [i18n]);
};

export const ProjectInstallation = () => {
    useLanguageRefresh();
    const navigate = useNavigate();
    const { appointmentId } = useParams();
    const {
        weekAnchor,
        setWeekAnchor,
        appointments,
        selected,
        materials,
        loading,
        saving,
        operations,
        setOperations,
        technicalNotes,
        setTechnicalNotes,
        reportImages,
        setReportImages,
        expenseRows,
        setExpenseRows,
        materialRows,
        setMaterialRows,
        usedMaterialRows,
        setUsedMaterialRows,
        deliveryReports,
        selectedReport,
        canFinish,
        view,
        setView,
        capturedSignature,
        setCapturedSignature,
        reloadAll,
        submit,
    } = useInstallationDetail(appointmentId);

    // Stable so the memoized task list doesn't re-render when this screen re-renders.
    const handleOpenAppointment = useCallback((id: string) => navigate(`/projects/installation/tasks/${id}`), [navigate]);

    return (
        <div>
            {appointmentId ? (
                // Detail (assembly) screen: no page title/description — the job header
                // carries the context. Keep only the back-to-calendar action.
                <div className="mb-4 flex items-center">
                    <Button variant="secondary" size="sm" icon={<ArrowLeft size={13} />} onClick={() => navigate('/projects/installation/tasks')}>{t('projects.takvime_don')}</Button>
                </div>
            ) : (
                <PageHeader
                    breadcrumb="Proje"
                    title={t('nav.technicianInstallations')}
                    description={t('projects.size_atanmis_proje_montaj_randevulari_burada_gor')}
                    actions={(
                        <div className="flex items-center gap-2">
                            <input type="date" value={weekAnchor} onChange={(e) => setWeekAnchor(e.target.value || dayjs().format('YYYY-MM-DD'))} className="h-8 rounded-lg border border-slate-200 px-2 text-[12px] font-semibold outline-none" />
                            <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).subtract(1, 'week').format('YYYY-MM-DD'))} />
                            <Button variant="secondary" size="sm" onClick={() => setWeekAnchor(dayjs().format('YYYY-MM-DD'))}>{t('projects.bugun')}</Button>
                            <Button variant="secondary" size="sm" icon={<ArrowRight size={12} />} onClick={() => setWeekAnchor(dayjs(weekAnchor).add(1, 'week').format('YYYY-MM-DD'))} />
                        </div>
                    )}
                />
            )}

            <div className="grid grid-cols-1 gap-4">
                {!appointmentId && (
                    <InstallationTaskList
                        appointments={appointments}
                        loading={loading}
                        onOpenAppointment={handleOpenAppointment}
                    />
                )}

                {/* Detail route: show a skeleton while the appointment loads and a
                    clear retry/back state if it fails — otherwise a hard refresh on
                    this URL would render a blank page before/if the fetch resolves. */}
                {appointmentId && !selected && loading && (
                    <Card title={t('projects.teknisyen_montaj_ekrani')} icon={<Clipboard size={13} />}>
                        <div className="h-72 animate-pulse rounded bg-slate-100" />
                    </Card>
                )}

                {appointmentId && !selected && !loading && (
                    <Card title={t('projects.teknisyen_montaj_ekrani')} icon={<Clipboard size={13} />}>
                        <EmptyState
                            icon={<Clipboard size={32} />}
                            title={t('projects.montaj_yok')}
                            description={t('projects.secili_haftada_montaj_kaydi_yok')}
                            action={(
                                <div className="flex items-center gap-2">
                                    <Button variant="secondary" size="sm" onClick={() => reloadAll()}>{t('common.refresh')}</Button>
                                    <Button variant="secondary" size="sm" icon={<ArrowLeft size={12} />} onClick={() => navigate('/projects/installation/tasks')}>{t('projects.takvime_don')}</Button>
                                </div>
                            )}
                        />
                    </Card>
                )}

                {appointmentId && selected && (
                    <InstallationDetailCard
                        selected={selected}
                        appointments={appointments}
                        selectedReport={selectedReport}
                        canFinish={Boolean(canFinish)}
                        materials={materials}
                        saving={saving}
                        operations={operations}
                        setOperations={setOperations}
                        technicalNotes={technicalNotes}
                        setTechnicalNotes={setTechnicalNotes}
                        reportImages={reportImages}
                        setReportImages={setReportImages}
                        expenseRows={expenseRows}
                        setExpenseRows={setExpenseRows}
                        materialRows={materialRows}
                        setMaterialRows={setMaterialRows}
                        usedMaterialRows={usedMaterialRows}
                        setUsedMaterialRows={setUsedMaterialRows}
                        deliveryReports={deliveryReports}
                        view={view}
                        setView={setView}
                        capturedSignature={capturedSignature}
                        setCapturedSignature={setCapturedSignature}
                        onSubmit={submit}
                        onReload={reloadAll}
                    />
                )}
            </div>
        </div>
    );
};
