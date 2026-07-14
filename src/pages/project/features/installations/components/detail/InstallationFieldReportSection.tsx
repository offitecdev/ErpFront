import { memo } from 'react';
import dayjs from 'dayjs';

import { PackagePlus, Plus, Receipt, Trash01 as Trash } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Field, Input, Textarea } from '@/components/ui-shared/Field';
import { ReportImageUploader } from '@/components/ui-shared/ReportImageUploader';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { t } from '@/i18n/translate';

import type { InstallationAppointment, InstallationView } from '../../hooks/useInstallationDetail';
import { buildDraftFieldSnapshot, buildFieldSnapshot } from '../../utils/installationSnapshots';
import { TechnicianGetSignature } from '../../../projects/components/signatures/TechnicianGetSignature';
import { buildOrderAttachments } from '../../../projects/utils/buildOrderAttachments';
import { InstallationSignatureSection } from './InstallationSignatureSection';

type StateSetter<T> = (value: T | ((current: T) => T)) => void;

// "Field report" view. Shows a read-only summary once the montaj is completed, or the
// editable capture form (operations, notes, images, in-flight signature) while it is open.
export const InstallationFieldReportSection = memo(({
    selected,
    selectedReport,
    finished,
    canFinish,
    saving,
    disabled,
    operations,
    setOperations,
    technicalNotes,
    setTechnicalNotes,
    reportImages,
    setReportImages,
    capturedSignature,
    setCapturedSignature,
    fieldSignOpen,
    setFieldSignOpen,
    setView,
    onReload,
}: {
    selected: InstallationAppointment;
    selectedReport: any;
    finished: boolean;
    canFinish: boolean;
    saving: boolean;
    disabled: boolean;
    operations: string[];
    setOperations: StateSetter<string[]>;
    technicalNotes: string;
    setTechnicalNotes: StateSetter<string>;
    reportImages: string[];
    setReportImages: StateSetter<string[]>;
    capturedSignature: string | null;
    setCapturedSignature: StateSetter<string | null>;
    fieldSignOpen: boolean;
    setFieldSignOpen: StateSetter<boolean>;
    setView: (view: InstallationView) => void;
    onReload: () => void;
}) => (
    <>
        {/* Field Report — signing lives here, in the same place, and stays
            available even after Finish & Send. Shown read-only once the montaj is
            actually completed; a drafted-but-unfinished report stays editable below. */}
        {finished && selectedReport && (
            <div className="space-y-3">
                <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-[12px] text-emerald-800">{t('projects.bu_montaj_bitirildi_imza_durumu')}{selectedReport.isSigned ?t('projects.imzali') :t('projects.imzasiz_geldi')}
                </div>
                <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12.5px] text-slate-700">
                    <div className="font-semibold text-slate-900">{dayjs(selectedReport.startedAt).format('HH:mm')} - {dayjs(selectedReport.endedAt).format('HH:mm')}</div>
                    <div className="mt-1 whitespace-pre-wrap">{selectedReport.operationsDone}</div>
                    {selectedReport.technicalNotes && <div className="mt-1 text-slate-500">{selectedReport.technicalNotes}</div>}
                    {Array.isArray(selectedReport.images) && selectedReport.images.length > 0 && (
                        <div className="mt-2 grid grid-cols-4 gap-2 sm:grid-cols-6">
                            {selectedReport.images.map((image: any) => (
                                <a key={image.id} href={image.imageData} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200 bg-white">
                                    <img src={image.imageData} alt="" className="h-full w-full object-cover" />
                                </a>
                            ))}
                        </div>
                    )}
                </div>
                {/* Signature — available any time; can be re-captured to update
                    an existing one. A check shows when already signed. */}
                <InstallationSignatureSection label={t('signatures.tabs.field')} signed={Boolean(selectedReport.isSigned)}>
                    <TechnicianGetSignature reportType="FIELD" reportId={selectedReport.id} projectId={selected.project?.id} title={`${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('signatures.tabs.field')}`} snapshot={buildFieldSnapshot(selected, selectedReport)} attachments={buildOrderAttachments(selected)} label={selectedReport.isSigned ? t('signatures.getSignature') : t('projects.task.sign')} onDone={onReload} />
                </InstallationSignatureSection>
            </div>
        )}

        {!finished && (
            <div className="space-y-4">
                {!canFinish && (
                    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] font-semibold text-slate-600">{t('projects.randevu_gunu_gelmeden_montaj_baslatilamaz')}</div>
                )}
                <div className="rounded-lg border border-slate-200">
                    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-[12px] font-semibold text-slate-700">
                        <span>{t('projects.yapilan_isler')}</span>
                        <Button type="button" size="sm" variant="secondary" icon={<Plus size={12} />} disabled={disabled} onClick={() => setOperations([...operations, ''])}>{t('projects.madde')}</Button>
                    </div>
                    <div className="space-y-2 p-3">
                        {operations.map((item, index) => (
                            <div key={index} className="grid grid-cols-[1fr_32px] gap-2">
                                <Input value={item} onChange={(e) => setOperations(operations.map((row, i) => i === index ? e.target.value : row))} disabled={disabled} />
                                <Button type="button" variant="ghost" size="sm" icon={<Trash size={13} />} disabled={disabled || operations.length === 1} onClick={() => setOperations(operations.filter((_, i) => i !== index))} />
                            </div>
                        ))}
                    </div>
                </div>
                <Field label={t('projects.teknik_notlar')}>
                    <Textarea rows={3} value={technicalNotes} disabled={disabled} onChange={(e) => setTechnicalNotes(e.target.value)} />
                </Field>
                <Field label={t('projects.rapor_gorselleri')} hint={t('projects.gorseller_opsiyonel')}>
                    <ReportImageUploader value={reportImages} onChange={setReportImages} disabled={disabled} />
                </Field>
                {/* Quick links to the material & expense tabs. */}
                <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="secondary" icon={<PackagePlus size={13} />} disabled={disabled} onClick={() => setView('materials')}>{t('nav.materials')}</Button>
                    <Button type="button" variant="secondary" icon={<Receipt size={13} />} disabled={disabled} onClick={() => setView('expenses')}>{t('projects.harici_giderler')}</Button>
                </div>
                {/* Capture the customer signature during creation. It is NOT
                    sent now — it rides along only when "Finish & Send" is
                    clicked, and can be re-captured to update it. */}
                <InstallationSignatureSection label={t('signatures.tabs.field')} signed={Boolean(capturedSignature)}>
                    <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => setFieldSignOpen(true)}>{capturedSignature ? t('signatures.getSignature') : t('projects.task.sign')}</Button>
                </InstallationSignatureSection>
                <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-[12px] text-slate-500">{t('projects.imza_finish_hint')}</div>

                <SignatureSheet
                    open={fieldSignOpen}
                    title={`${selected.salesOrder?.orderNumber || selected.project?.projectName || ''} - ${t('signatures.tabs.field')}`}
                    snapshot={buildDraftFieldSnapshot(selected, operations, technicalNotes, reportImages)}
                    attachments={buildOrderAttachments(selected)}
                    saving={false}
                    onClose={() => setFieldSignOpen(false)}
                    onSave={(signatureBase64) => { if (signatureBase64) setCapturedSignature(signatureBase64); setFieldSignOpen(false); }}
                />
            </div>
        )}
    </>
));
