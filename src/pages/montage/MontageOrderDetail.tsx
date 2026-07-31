import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, Package, Receipt, Send01, Wrench } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';
import { useInstallationDetail } from '@/pages/project/features/installations/hooks/useInstallationDetail';
import { getInstallationUsedMaterials } from '@/pages/project/features/installations/utils/installationMaterials';
import { buildDraftFieldSnapshot, buildFieldSnapshot } from '@/pages/project/features/installations/utils/installationSnapshots';

import { BigButton } from './components/BigButton';
import { ExpenseSection } from './components/ExpenseSection';
import { MaterialsSection } from './components/MaterialsSection';
import { MontageHeader } from './components/MontageHeader';
import { StatusPill } from './components/StatusPill';
import { WorkSection } from './components/WorkSection';
import type { MontageMaterialMode, MontageSection } from './types/montage';
import { dateFmt, timeRange } from './utils/montageFormat';
import { toMontageOrderRow } from './utils/montageStatus';

/** Section heading in the panel's card style — small navy band above each block. */
const SectionLoading = () => (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
        <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-white/15 dark:border-t-amber-400" />
        <span className="text-[13px] text-slate-500 dark:text-slate-400">{t('common.loading')}</span>
    </div>
);

/**
 * One order's work screen — SIMPLE CARD VIEW. The old dashboard (three big
 * section-switcher buttons + auto-opening appointment pop-up) is gone: the
 * summary card sits on top and the Work / Expenses / Materials blocks are
 * stacked cards, all visible at once. Report state (draft autosave, submit)
 * is still the proven useInstallationDetail hook.
 */
export const MontageOrderDetail = () => {
    const { appointmentId } = useParams();
    const [searchParams] = useSearchParams();
    const detail = useInstallationDetail(appointmentId);
    const {
        selected, materials, loading, saving, operations, setOperations, technicalNotes, setTechnicalNotes,
        reportImages, setReportImages, expenseRows, setExpenseRows, materialRows, setMaterialRows,
        usedMaterialRows, setUsedMaterialRows, canFinish, capturedSignature, setCapturedSignature,
        expenseLoading, materialLoading, loadExpenses, loadMaterials, reloadAll, submit,
    } = detail;

    const [activeSection, setActiveSection] = useState<MontageSection>('work');
    const [materialMode, setMaterialMode] = useState<MontageMaterialMode>(() =>
        searchParams.get('mode') === 'extra' ? 'extra' : 'used');
    const [signOpen, setSignOpen] = useState(false);
    const [signingExisting, setSigningExisting] = useState(false);

    const row = useMemo(() => (selected ? toMontageOrderRow(selected) : null), [selected]);
    const finished = selected?.status === 'COMPLETED';
    const disabled = Boolean(finished || !canFinish || saving);
    const quotedMaterials = useMemo(() => (selected ? getInstallationUsedMaterials(selected) : []), [selected]);

    const selectSection = (section: MontageSection) => {
        if (section === 'expenses') void loadExpenses();
        if (section === 'materials') void loadMaterials();
        setActiveSection(section);
    };

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-white/15 dark:border-t-white" />
                <span className="text-[13px] text-slate-500 dark:text-slate-400">{t('common.loading')}</span>
            </div>
        );
    }
    if (!selected || !row) {
        return (
            <div className="space-y-4">
                <MontageHeader title={t('montage.orderNotFound')} backTo="/montage/orders/active" />
                <EmptyState title={t('montage.orderNotFound')} description={t('montage.orderNotFoundHint')} />
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <MontageHeader
                title={`${t('auto.randevu')} · ${dateFmt(row.start)} · ${timeRange(row.start, row.end)}`}
                subtitle={`${row.customerName} · ${row.projectName} · ${localizeTenderNumbersInText(row.orderNumber)}`}
                backTo={finished ? '/montage/orders/completed' : '/montage/orders/active'}
                actions={<StatusPill status={row.status} />}
            />

            {/* Summary card: appointment window + the two order-level actions. */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#17191c]">
                <div>
                    <div className="text-[15px] font-bold text-slate-900 dark:text-slate-50">{timeRange(row.start, row.end)}</div>
                    <div className="text-[12.5px] text-slate-500 dark:text-slate-400">{dateFmt(row.start)}</div>
                </div>
                {!finished && (
                    <div className="flex items-center gap-2">
                        <BigButton tone="navyOutline" icon={capturedSignature ? <CheckCircle size={15} /> : undefined} onClick={() => setSignOpen(true)} disabled={disabled}>
                            {capturedSignature ? t('montage.signed') : t('signatures.getSignature')}
                        </BigButton>
                        <BigButton tone="navy" icon={<Send01 size={15} />} disabled={disabled} onClick={() => void submit()}>
                            {t('projects.finish_and_send')}
                        </BigButton>
                    </div>
                )}
                {finished && (
                    <div className="flex flex-wrap items-center gap-2">
                        {!detail.selectedReport?.isSigned && detail.selectedReport && (
                            <BigButton tone="navyOutline" onClick={() => setSignOpen(true)} disabled={signingExisting}>
                                {t('signatures.getSignature')}
                            </BigButton>
                        )}
                        <div className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                            <CheckCircle size={16} />
                            {t('montage.status.completed')}
                        </div>
                    </div>
                )}
            </div>

            {/* Stacked cards — no section switcher; everything visible at once. */}
            <div className="grid grid-cols-1 gap-2 rounded-[3px] border border-slate-200 bg-white p-2 sm:grid-cols-3 dark:border-white/10 dark:bg-[#17191c]">
                <BigButton tone={activeSection === 'work' ? 'navy' : 'neutral'} icon={<Wrench size={15} />} onClick={() => selectSection('work')}>
                    {t('montage.section.work')}
                </BigButton>
                <BigButton tone={activeSection === 'expenses' ? 'navy' : 'neutral'} icon={<Receipt size={15} />} onClick={() => selectSection('expenses')}>
                    {t('montage.section.expenses')}
                </BigButton>
                <BigButton tone={activeSection === 'materials' ? 'navy' : 'neutral'} icon={<Package size={15} />} onClick={() => selectSection('materials')}>
                    {t('montage.section.materials')}
                </BigButton>
            </div>

            {activeSection === 'work' && (
                <WorkSection
                    operations={operations}
                    setOperations={setOperations}
                    technicalNotes={technicalNotes}
                    setTechnicalNotes={setTechnicalNotes}
                    images={reportImages}
                    setImages={setReportImages}
                    disabled={disabled}
                />
            )}

            {activeSection === 'expenses' && (
                expenseLoading
                    ? <SectionLoading />
                    : <ExpenseSection rows={expenseRows} setRows={setExpenseRows} disabled={disabled} />
            )}

            {activeSection === 'materials' && (
                materialLoading
                    ? <SectionLoading />
                    : (
                        <MaterialsSection
                            mode={materialMode}
                            setMode={setMaterialMode}
                            usedRows={usedMaterialRows}
                            setUsedRows={setUsedMaterialRows}
                            extraRows={materialRows}
                            setExtraRows={setMaterialRows}
                            quotedMaterials={quotedMaterials}
                            materials={materials}
                            disabled={disabled}
                        />
                    )
            )}

            {/* Field-report signature: captured now, sent with "Finish & Send". */}
            <SignatureSheet
                open={signOpen}
                title={t('signatures.tabs.field')}
                snapshot={finished && detail.selectedReport
                    ? buildFieldSnapshot(selected, detail.selectedReport)
                    : buildDraftFieldSnapshot(selected, operations, technicalNotes, reportImages)}
                saving={saving || signingExisting}
                onClose={() => setSignOpen(false)}
                onSave={async (signature) => {
                    if (!signature) return;
                    if (finished && detail.selectedReport) {
                        setSigningExisting(true);
                        try {
                            await projectApi.signReport(detail.selectedReport.id, signature);
                            setSignOpen(false);
                            toast.success(t('signatures.signed'), { position: 'top-center' });
                            reloadAll();
                        } catch (error: any) {
                            toast.error(error.response?.data?.error || t('signatures.signError'));
                        } finally {
                            setSigningExisting(false);
                        }
                        return;
                    }
                    setSignOpen(false);
                    setCapturedSignature(signature);
                    toast.success(t('montage.signatureCaptured'), { position: 'top-center' });
                }}
            />
            {finished && !detail.selectedReport?.isSigned && (
                <div className="rounded-[3px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-[#d30f15] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t('projects.imza_bekliyor')} — <button type="button" className="underline" onClick={reloadAll}>{t('common.refresh')}</button>
                </div>
            )}
        </div>
    );
};
