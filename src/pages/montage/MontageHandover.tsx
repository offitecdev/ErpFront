import { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, Edit01 as Pen, Image01, List, Send01 } from '@/components/icons/antIconCompat';
import { SignaturePad } from '@/components/ui-shared/SignaturePad';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { AppointmentDto } from '@/types/project';

import { BigButton } from './components/BigButton';
import { HandoverChecklist } from './components/HandoverChecklist';
import { MontageHeader } from './components/MontageHeader';
import { MontageImageUpload } from './components/MontageImageUpload';
import { useHandoverReport } from './hooks/useHandoverReport';

type HandoverTab = 'checklist' | 'images' | 'signatures';

/**
 * Handover (delivery/Abnahme) report for a project. Checklist, photos and the
 * SIGNATURES live in separate tabs; "Get signature" and "Sign & Send" sit at
 * the top, right below the back/forward navigation, per the tablet design.
 *
 * Der Rapport trägt ZWEI Unterschriften: der Techniker unterschreibt selbst im
 * Reiter "Unterschriften" (Feld direkt auf dem Tablet), die Kundensignatur
 * kommt weiterhin über das grosse Signatur-Popup.
 */
export const MontageHandover = () => {
    const { projectId } = useParams();
    const [searchParams] = useSearchParams();
    const appointmentId = searchParams.get('appointmentId');
    const handover = useHandoverReport(projectId);
    const [appointment, setAppointment] = useState<AppointmentDto | null>(null);
    const [tab, setTab] = useState<HandoverTab>('checklist');
    const [signOpen, setSignOpen] = useState(false);

    useEffect(() => {
        if (!appointmentId) {
            setAppointment(null);
            return;
        }
        let cancelled = false;
        projectApi.getMyInstallationDetail(appointmentId)
            .then((row) => { if (!cancelled) setAppointment(row); })
            .catch(() => { if (!cancelled) setAppointment(null); });
        return () => { cancelled = true; };
    }, [appointmentId]);

    const projectInfo = useMemo(() => {
        const report = handover.currentReport;
        const appt = appointment as any;
        return {
            name: appt?.project?.projectName || report?.projectName || '',
            customer: appt?.project?.customer?.companyName || report?.customerName || '',
        };
    }, [appointment, handover.currentReport]);

    const {
        loading, templates, reportId, templateId, selectTemplate, responses, setStatus, setMeasurement,
        doneCount, notes, setNotes, images, setImages, signature, setSignature, sending, send, buildSnapshot, currentReport,
        technicianSignature, setTechnicianSignature,
    } = handover;

    if (loading) return <div className="h-80 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />;

    return (
        <div className="space-y-4">
            <MontageHeader
                title={t('montage.actions.deliveryReport')}
                subtitle={[projectInfo.customer, projectInfo.name].filter(Boolean).join(' · ')}
                backTo="/montage/reports"
            />

            {/* Sign & Send — at the top, below the navigation. */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <BigButton
                    tone={signature || currentReport?.isSigned ? 'success' : 'outline'}
                    icon={(signature || currentReport?.isSigned) ? <CheckCircle size={20} /> : undefined}
                    onClick={() => setSignOpen(true)}
                >
                    {signature ? t('montage.signed') : t('signatures.getSignature')}
                </BigButton>
                <BigButton tone="brand" icon={<Send01 size={20} />} disabled={sending} onClick={() => void send()}>
                    {t('montage.signAndSend')}
                </BigButton>
            </div>

            {/* Fresh report: pick the checklist template first. */}
            {!reportId && (
                <select
                    value={templateId}
                    onChange={(e) => selectTemplate(e.target.value)}
                    className="h-13 min-h-12 w-full rounded-xl border border-slate-300 bg-white px-3 text-[15px] font-semibold text-slate-800 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-100"
                >
                    {templates.length === 0 && <option value="">{t('projects.delivery.noChecklists')}</option>}
                    {templates.map((tpl) => <option key={tpl.id} value={tpl.id}>{tpl.name}</option>)}
                </select>
            )}

            {/* Checklist / photos / signatures tabs. */}
            <div className="grid grid-cols-3 gap-3">
                <BigButton tone={tab === 'checklist' ? 'brand' : 'neutral'} icon={<List size={20} />} onClick={() => setTab('checklist')}>
                    {t('montage.handover.checklistTab')} ({doneCount}/{responses.length})
                </BigButton>
                <BigButton tone={tab === 'images' ? 'brand' : 'neutral'} icon={<Image01 size={20} />} onClick={() => setTab('images')}>
                    {t('montage.handover.imagesTab')} ({images.length})
                </BigButton>
                <BigButton tone={tab === 'signatures' ? 'brand' : 'neutral'} icon={<Pen size={20} />} onClick={() => setTab('signatures')}>
                    {t('montage.handover.signaturesTab')}
                </BigButton>
            </div>

            {tab === 'checklist' && (
                <>
                    <HandoverChecklist responses={responses} onStatus={setStatus} onMeasurement={setMeasurement} />
                    <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
                        <div className="text-[14px] font-bold text-slate-700 dark:text-slate-200">{t('montage.handover.comments')}</div>
                        <textarea
                            rows={3}
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-[15.5px] text-slate-900 outline-none focus:border-brand-500 dark:border-white/15 dark:bg-white/5 dark:text-slate-50"
                        />
                    </div>
                </>
            )}
            {tab === 'images' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
                    <MontageImageUpload value={images} onChange={setImages} />
                </div>
            )}
            {tab === 'signatures' && (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
                    <div className="ofi-sign-grid">
                        {/* Der Techniker unterschreibt hier selbst — gespeichert
                            wird sie mit "Signieren & Senden". */}
                        <SignaturePad
                            label={t('signatures.mySignature')}
                            value={technicianSignature}
                            onChange={setTechnicianSignature}
                            caption={t('projects.delivery.technicianSignatureHint')}
                            height={190}
                        />
                        <SignaturePad
                            label={t('projects.delivery.customerSignature')}
                            value={signature || currentReport?.customerSignature || null}
                            onChange={setSignature}
                            caption={projectInfo.customer || undefined}
                            height={190}
                        />
                    </div>
                </div>
            )}

            <SignatureSheet
                open={signOpen}
                title={t('montage.actions.deliveryReport')}
                snapshot={buildSnapshot(projectInfo.name, projectInfo.customer)}
                saving={sending}
                onClose={() => setSignOpen(false)}
                onSave={(sig) => {
                    setSignOpen(false);
                    if (sig) {
                        setSignature(sig);
                        toast.success(t('montage.signatureCaptured'), { position: 'top-center' });
                    }
                }}
            />
        </div>
    );
};
