import { FileCheck02 as FileCheck, Image01 as ImageIcon } from '@/components/icons/antIconCompat';

import { Button } from '../../components/ui-shared/Button';
import { Field, Select, Textarea } from '../../components/ui-shared/Field';
import { SignatureSheet, type SignatureAttachment } from '../../components/ui-shared/SignatureSheet';
import type { DeliveryReportDto, DeliveryResponseItem, DeliveryStatus } from '../../lib/api/project';
import { TechnicianGetSignature } from './features/projects/components/signatures/TechnicianGetSignature';

import { DeliveryChecklistCategory } from './features/projects/components/delivery/DeliveryChecklistCategory';
import { DeliveryReportSummary } from './features/projects/components/delivery/DeliveryReportSummary';
import { useDeliveryReportEditor } from './features/projects/hooks/useDeliveryReportEditor';
import { buildDeliverySnapshot, buildDraftSnapshot } from './features/projects/utils/deliveryReportSnapshots';
import { groupResponsesByCategory, type DeliveryAppointment, type DeliveryFieldImage } from './features/projects/utils/deliveryReportUtils';

import { t } from '@/i18n/translate';

export const DeliveryReportTab = ({ appointment, attachments, onChanged }: { appointment: DeliveryAppointment; attachments?: SignatureAttachment[]; onChanged?: () => void }) => {
    const {
        templates,
        templateId,
        responses,
        notes,
        setNotes,
        existing,
        loading,
        saving,
        signatureOpen,
        fieldImages,
        selectedTemplate,
        load,
        selectTemplate,
        setStatus,
        setMeasurement,
        save,
        openSignature,
        closeSignature,
    } = useDeliveryReportEditor({ appointment, onChanged });

    if (loading) return <div className="h-48 animate-pulse rounded-lg bg-slate-100" />;

    // A delivery report has already been created/sent for this appointment.
    if (existing) {
        return (
            <div className="space-y-3">
                <div className={`flex items-center gap-2 rounded-md border px-3 py-2 text-[12px] ${existing.isSigned ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
                    <FileCheck size={14} />
                    {existing.isSigned ? t('projects.delivery.alreadySentSigned') : t('projects.delivery.alreadySentUnsigned')}
                </div>
                <DeliverySummary report={existing} fieldImages={fieldImages} />
                {!existing.isSigned && (
                    <div className="flex justify-end">
                        <TechnicianGetSignature reportType="DELIVERY" reportId={existing.id} projectId={appointment.project?.id} title={existing.checklistName || t('projects.delivery.pdf.title')} snapshot={buildDeliverySnapshot(existing, fieldImages)} attachments={attachments} label={t('projects.sadece_imza_al')} onDone={() => { onChanged?.(); void load(); }} />
                    </div>
                )}
            </div>
        );
    }

    if (templates.length === 0) {
        return (
            <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-6 text-center text-[12.5px] text-slate-600">
                {t('projects.delivery.noChecklists')}
            </div>
        );
    }

    const groups = groupResponsesByCategory(responses);

    return (
        <div className="space-y-4">
            <DeliveryReportSummary
                templateName={selectedTemplate?.name}
                responses={responses}
                photoCount={fieldImages.length}
                statusText={t('projects.delivery.statusDraft')}
            />

            <Field label={t('projects.delivery.checklist')}>
                <Select value={templateId} onChange={(e) => selectTemplate(e.target.value)}>
                    {templates.map((tpl) => (
                        <option key={tpl.id} value={tpl.id}>{tpl.name}</option>
                    ))}
                </Select>
            </Field>

            <div className="space-y-3">
                {groups.map((group) => (
                    <DeliveryChecklistCategory
                        key={group.category}
                        title={group.category === '—' ? t('projects.delivery.uncategorized') : group.category}
                        items={group.items}
                        onStatus={setStatus}
                        onMeasurement={setMeasurement}
                    />
                ))}
            </div>

            <Field label={t('projects.delivery.notes')}>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>

            {/* Sticky action bar so Save stays reachable inside a long checklist. */}
            <div className="sticky bottom-0 -mx-1 flex justify-end border-t border-slate-100 bg-white/90 px-1 py-2 backdrop-blur">
                <Button icon={<FileCheck size={13} />} onClick={openSignature}>{t('projects.delivery.create')}</Button>
            </div>

            <SignatureSheet
                open={signatureOpen}
                title={t('projects.delivery.create')}
                snapshot={buildDraftSnapshot(selectedTemplate?.name || '', responses, notes, fieldImages)}
                attachments={attachments}
                saving={saving}
                onClose={closeSignature}
                onSave={(signatureBase64) => save(signatureBase64)}
            />
        </div>
    );
};

// ---- Read-only summary used inside the preview popup and the "already sent" view ----
const statusLabel = (status: DeliveryStatus) => {
    if (status === 'YES') return t('projects.delivery.yes');
    if (status === 'NO') return t('projects.delivery.no');
    if (status === 'NA') return t('projects.delivery.na');
    return '—';
};
const statusTone = (status: DeliveryStatus) =>
    status === 'YES' ? 'bg-emerald-50 text-emerald-700' : status === 'NO' ? 'bg-rose-50 text-rose-700' : 'bg-slate-100 text-slate-600';

const SummaryRows = ({ responses }: { responses: DeliveryResponseItem[] }) => (
    <div className="space-y-3">
        {groupResponsesByCategory(responses).map((group) => (
            <div key={group.category} className="overflow-hidden rounded-lg border border-slate-200">
                <div className="border-b border-slate-100 bg-slate-50 px-3 py-1.5 text-[11.5px] font-semibold text-slate-700">
                    {group.category === '—' ? t('projects.delivery.uncategorized') : group.category}
                </div>
                <table data-grid-lines className="w-full text-[12px]">
                    <tbody className="divide-y divide-slate-100">
                        {group.items.map((r) => (
                            <tr key={r.id}>
                                <td className="px-3 py-1.5 text-slate-700">{r.label}</td>
                                <td className="w-24 px-3 py-1.5 text-right">
                                    <span className={`rounded px-1.5 py-0.5 text-[10.5px] font-semibold ${statusTone(r.status)}`}>{statusLabel(r.status)}</span>
                                </td>
                                <td className="w-32 px-3 py-1.5 text-right text-slate-500">{r.measurement || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        ))}
    </div>
);

const DeliverySummary = ({ report, fieldImages }: { report: DeliveryReportDto; fieldImages: DeliveryFieldImage[] }) => (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        {report.checklistName && <div className="text-[13px] font-semibold text-slate-900">{report.checklistName}</div>}
        <SummaryRows responses={report.responses || []} />
        {report.notes && <div className="rounded-md bg-slate-50 px-3 py-2 text-[12px] text-slate-600">{report.notes}</div>}
        {fieldImages.length > 0 && (
            <div>
                <div className="mb-1.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-slate-600"><ImageIcon size={12} /> {t('projects.delivery.fieldVisuals')}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {fieldImages.map((img) => (
                        <a key={img.id} href={img.imageData} target="_blank" rel="noreferrer" className="block aspect-square overflow-hidden rounded-md border border-slate-200">
                            <img src={img.imageData} alt="" className="h-full w-full object-cover" />
                        </a>
                    ))}
                </div>
            </div>
        )}
        {report.customerSignature && (
            <div>
                <div className="mb-1 text-[11.5px] font-semibold text-slate-600">{t('projects.delivery.customerSignature')}</div>
                <img src={report.customerSignature} alt="" className="h-24 rounded-md border border-slate-200 bg-white" />
            </div>
        )}
    </div>
);

export default DeliveryReportTab;
