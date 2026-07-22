import { useState } from 'react';

import type { DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectMaterial } from '@/types/project';

import type { InstallationAppointment, InstallationView } from '../../hooks/useInstallationDetail';
import { useInstallationDetailDerivedData } from '../../hooks/useInstallationDetailDerivedData';
import { useInstallationGeneralSignature } from '../../hooks/useInstallationGeneralSignature';
import { useInstallationMaterialMode } from '../../hooks/useInstallationMaterialMode';
import type { ProcessStep } from '../InstallationProcessSteps';
import { InstallationDetailHeaderBlock } from './InstallationDetailHeaderBlock';
import { InstallationFieldReportSection } from './InstallationFieldReportSection';
import { InstallationGeneralReportSection } from './InstallationGeneralReportSection';
import { InstallationMaterialExpenseSection } from './InstallationMaterialExpenseSection';
import { InstallationOvertimeSection } from './InstallationOvertimeSection';

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

export const InstallationDetailCard = ({
    selected,
    appointments,
    selectedReport,
    canFinish,
    materials,
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
    view,
    setView,
    capturedSignature,
    setCapturedSignature,
    onSubmit,
    onReload,
}: {
    selected: InstallationAppointment;
    appointments: InstallationAppointment[];
    selectedReport: any;
    canFinish: boolean;
    materials: ProjectMaterial[];
    saving: boolean;
    deliveryReports: DeliveryReportDto[];
    operations: string[];
    setOperations: StateSetter<string[]>;
    technicalNotes: string;
    setTechnicalNotes: StateSetter<string>;
    reportImages: string[];
    setReportImages: StateSetter<string[]>;
    expenseRows: Array<{ expenseType: string; amount: number; description: string }>;
    setExpenseRows: StateSetter<Array<{ expenseType: string; amount: number; description: string }>>;
    materialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    usedMaterialRows: Array<{ materialId: string; quantity: number; description: string }>;
    setUsedMaterialRows: StateSetter<Array<{ materialId: string; quantity: number; description: string }>>;
    view: InstallationView;
    setView: (view: InstallationView) => void;
    capturedSignature: string | null;
    setCapturedSignature: StateSetter<string | null>;
    onSubmit: (signatureBase64?: string) => void;
    onReload: () => void;
}) => {
    const [generalDetailId, setGeneralDetailId] = useState<string | null>(null);
    const [fieldSignOpen, setFieldSignOpen] = useState(false);

    // General report signature is captured then sent (signed or unsigned) via its
    // own "Send" — "Finish & Send" never sends the general report.
    const { generalSignature, setGeneralSignature, generalSignOpen, setGeneralSignOpen, generalSending, sendGeneral } =
        useInstallationGeneralSignature({ selected, deliveryReports, onReload });

    const { materialMode, setMaterialMode, activeMaterialRows, setActiveMaterialRows } =
        useInstallationMaterialMode({ materialRows, setMaterialRows, usedMaterialRows, setUsedMaterialRows });

    const { costs, usedMaterials, finished, disabled, relatedAppointments, overtimeReports, generalDetail } =
        useInstallationDetailDerivedData({ selected, appointments, canFinish, saving, generalDetailId });

    // The job as a process: the field report must be captured before the customer
    // signature; both reports stay reachable at any time from the Signature view.
    const steps: ProcessStep[] = [
        // Green once the report is sent (finished) or as soon as a work-performed
        // line is entered — the field report is meaningfully started at that point.
        { key: 'field', label: t('projects.task.fieldReport'), done: finished || operations.some((item) => item.trim()) },
        // Green as soon as the field-report signature is captured — either already
        // signed & sent (selectedReport.isSigned) or ticked locally during creation
        // (capturedSignature), before Finish & Send persists it.
        { key: 'signature', label: t('projects.task.signature'), done: Boolean(selectedReport?.isSigned || capturedSignature) },
        { key: 'sent', label: t('projects.task.sent'), done: finished && Boolean(selectedReport?.isSigned) },
    ];

    const views: Array<{ key: InstallationView; label: string }> = [
        { key: 'field', label: t('projects.task.fieldReport') },
        { key: 'materials', label: t('nav.materials') },
        { key: 'expenses', label: t('projects.harici_giderler') },
        { key: 'overtime', label: t('projects.task.overtime') },
        { key: 'general', label: t('projects.general.button') },
    ];

    return (
        // Three explicit layers (see .ofi-rep-* in index.css / dark.css): an
        // elevated shell, a recessed canvas inside it, and raised panels on top
        // of that. Replaces the previous <Card>, whose white-on-white nesting
        // gave the whole screen a single flat surface.
        <section className="ofi-rep-shell overflow-hidden rounded-2xl">
            <div className="ofi-rep-canvas space-y-4 p-3 md:p-5">
                <InstallationDetailHeaderBlock
                    selected={selected}
                    selectedReport={selectedReport}
                    finished={finished}
                    canFinish={canFinish}
                    saving={saving}
                    onSubmit={onSubmit}
                    steps={steps}
                    views={views}
                    view={view}
                    setView={setView}
                />

                {/* Content sheet: one raised panel per view, so switching tabs
                    swaps the contents of a stable surface instead of dropping
                    loose blocks straight onto the canvas. */}
                <div className="ofi-rep-panel rounded-xl p-3 md:p-4">
                {view === 'field' && (
                    <InstallationFieldReportSection
                        selected={selected}
                        selectedReport={selectedReport}
                        finished={finished}
                        canFinish={canFinish}
                        saving={saving}
                        disabled={disabled}
                        operations={operations}
                        setOperations={setOperations}
                        technicalNotes={technicalNotes}
                        setTechnicalNotes={setTechnicalNotes}
                        reportImages={reportImages}
                        setReportImages={setReportImages}
                        capturedSignature={capturedSignature}
                        setCapturedSignature={setCapturedSignature}
                        fieldSignOpen={fieldSignOpen}
                        setFieldSignOpen={setFieldSignOpen}
                        setView={setView}
                        onReload={onReload}
                    />
                )}

                {view === 'materials' && (
                    <InstallationMaterialExpenseSection
                        view="materials"
                        disabled={disabled}
                        materials={materials}
                        usedMaterials={usedMaterials}
                        expenses={costs.expenses}
                        extraMaterials={costs.materials}
                        materialMode={materialMode}
                        setMaterialMode={setMaterialMode}
                        activeMaterialRows={activeMaterialRows}
                        setActiveMaterialRows={setActiveMaterialRows}
                        expenseRows={expenseRows}
                        setExpenseRows={setExpenseRows}
                    />
                )}

                {view === 'expenses' && (
                    <InstallationMaterialExpenseSection
                        view="expenses"
                        disabled={disabled}
                        materials={materials}
                        usedMaterials={usedMaterials}
                        expenses={costs.expenses}
                        extraMaterials={costs.materials}
                        materialMode={materialMode}
                        setMaterialMode={setMaterialMode}
                        activeMaterialRows={activeMaterialRows}
                        setActiveMaterialRows={setActiveMaterialRows}
                        expenseRows={expenseRows}
                        setExpenseRows={setExpenseRows}
                    />
                )}

                {view === 'overtime' && (
                    <InstallationOvertimeSection overtimeReports={overtimeReports} />
                )}

                {/* General Report: all appointments on the order so far, with a
                    signature section that can be signed at any time. */}
                {view === 'general' && (
                    <InstallationGeneralReportSection
                        selected={selected}
                        deliveryReports={deliveryReports}
                        relatedAppointments={relatedAppointments}
                        generalDetail={generalDetail}
                        setGeneralDetailId={setGeneralDetailId}
                        generalSignature={generalSignature}
                        setGeneralSignature={setGeneralSignature}
                        generalSignOpen={generalSignOpen}
                        setGeneralSignOpen={setGeneralSignOpen}
                        generalSending={generalSending}
                        sendGeneral={sendGeneral}
                    />
                )}
                </div>
            </div>
        </section>
    );
};
