import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    checklistApi,
    deliveryReportApi,
    type ChecklistTemplateDto,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
    type SignatureSnapshot,
} from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import { buildResponses, groupResponsesByCategory } from '@/pages/project/features/projects/utils/deliveryReportUtils';
import { t } from '@/i18n/translate';

/**
 * Handover (delivery/Abnahme) report for one project: checklist done/not-done
 * responses, comments and photos. The photos have no backend column on the
 * delivery report, so they are carried on the signature snapshot instead.
 */
export const useHandoverReport = (projectId?: string) => {
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);

    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [reports, setReports] = useState<DeliveryReportDto[]>([]);

    const [reportId, setReportId] = useState<string | null>(null);
    const [templateId, setTemplateId] = useState('');
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [images, setImages] = useState<string[]>([]);
    const [signature, setSignature] = useState<string | null>(null);
    /** Unterschrift des Technikers selbst — zweite Signatur des Rapports. */
    const [technicianSignature, setTechnicianSignature] = useState<string | null>(null);
    const [sending, setSending] = useState(false);

    const currentReport = useMemo(() => reports.find((r) => r.id === reportId) || null, [reports, reportId]);
    const selectedTemplate = templates.find((x) => x.id === templateId) || null;

    const load = async () => {
        if (!projectId) return;
        setLoading(true);
        try {
            const [tpls, rows] = await Promise.all([
                checklistApi.list().then((r) => r.filter((x) => x.isActive)).catch(() => [] as ChecklistTemplateDto[]),
                deliveryReportApi.list({ projectId }).catch(() => [] as DeliveryReportDto[]),
            ]);
            setTemplates(tpls);
            setReports(rows);
            // Prefer the project-level report (no salesOrderId), like the old screen.
            const listed = rows.find((r) => !r.salesOrderId) || rows[0] || null;
            setSignature(null);
            if (listed) {
                // Die LISTE trägt weder `responses` noch die Signaturen (schwere
                // Felder, absichtlich weggelassen) — der geöffnete Rapport wird
                // deshalb einzeln nachgeladen, sonst stünde die Checkliste leer.
                const projectReport = await deliveryReportApi.getOne(listed.id).catch(() => listed);
                // Der volle Satz ersetzt die magere Listenzeile, damit
                // `currentReport` auch Signaturen und Antworten trägt.
                setReports(rows.map((row) => (row.id === projectReport.id ? projectReport : row)));
                setReportId(projectReport.id);
                setTemplateId(projectReport.checklistTemplateId || '');
                setResponses((projectReport.responses || []).map((x) => ({ ...x })));
                setNotes(projectReport.notes || '');
                setTechnicianSignature(projectReport.technicianSignature || null);
            } else {
                const tpl = tpls[0] || null;
                setReportId(null);
                setTemplateId(tpl?.id || '');
                setResponses(tpl ? buildResponses(tpl) : []);
                setNotes('');
                setTechnicianSignature(null);
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!userId || !selectedTenantId || !projectId) return;
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [userId, selectedTenantId, projectId]);

    const selectTemplate = (id: string) => {
        setTemplateId(id);
        const tpl = templates.find((x) => x.id === id);
        setResponses(tpl ? buildResponses(tpl) : []);
    };

    const setStatus = (id: string, status: DeliveryStatus) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const doneCount = responses.filter((r) => r.status !== null).length;

    const buildSnapshot = (projectName: string, customerName?: string): SignatureSnapshot => ({
        title: selectedTemplate?.name || currentReport?.checklistName || t('projects.delivery.pdf.title'),
        customerName,
        projectName,
        sections: groupResponsesByCategory(responses, t('projects.delivery.uncategorized')).map((group) => ({
            heading: group.category,
            rows: group.items.map((x) => ({ label: x.label, status: x.status, value: x.measurement || undefined })),
        })),
        images,
        notes: notes.trim() || undefined,
    });

    /** Persist (create/update + optional sign) and report success. */
    const send = async (): Promise<boolean> => {
        if (!projectId) return false;
        if (responses.length === 0) { toast.error(t('projects.delivery.selectChecklistFirst')); return false; }
        setSending(true);
        try {
            if (reportId) {
                await deliveryReportApi.update(reportId, {
                    responses,
                    notes: notes.trim() || null,
                    technicianSignature,
                });
                if (signature) await deliveryReportApi.sign(reportId, signature);
            } else {
                await deliveryReportApi.create({
                    projectId,
                    salesOrderId: null,
                    appointmentId: null,
                    checklistTemplateId: templateId || null,
                    checklistName: selectedTemplate?.name || null,
                    responses,
                    notes: notes.trim() || null,
                    signatureBase64: signature,
                    technicianSignatureBase64: technicianSignature,
                });
            }
            toast.success(t('projects.delivery.sentOk'), { position: 'top-center' });
            setSignature(null);
            await load();
            return true;
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.delivery.sendError'));
            return false;
        } finally {
            setSending(false);
        }
    };

    return {
        loading,
        templates,
        currentReport,
        selectedTemplate,
        reportId,
        templateId,
        selectTemplate,
        responses,
        setStatus,
        setMeasurement,
        doneCount,
        notes,
        setNotes,
        images,
        setImages,
        signature,
        setSignature,
        technicianSignature,
        setTechnicianSignature,
        sending,
        send,
        buildSnapshot,
    };
};
