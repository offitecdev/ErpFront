import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
    checklistApi,
    deliveryReportApi,
    type ChecklistTemplateDto,
    type DeliveryReportDto,
    type DeliveryResponseItem,
    type DeliveryStatus,
} from '@/lib/api/project';
import { t } from '@/i18n/translate';

import {
    buildResponses,
    gatherFieldImages,
    getDeliveryOrderId,
    type DeliveryAppointment,
} from '../utils/deliveryReportUtils';

type UseDeliveryReportEditorArgs = {
    appointment: DeliveryAppointment;
    onChanged?: () => void;
};

/**
 * Owns the technician delivery-report editor: checklist template loading, the
 * order-scoped existing-report lookup, response editing, and the save/signature
 * flow. The component consumes this and only renders.
 */
export const useDeliveryReportEditor = ({ appointment, onChanged }: UseDeliveryReportEditorArgs) => {
    const [templates, setTemplates] = useState<ChecklistTemplateDto[]>([]);
    const [templateId, setTemplateId] = useState<string>('');
    const [responses, setResponses] = useState<DeliveryResponseItem[]>([]);
    const [notes, setNotes] = useState('');
    const [existing, setExisting] = useState<DeliveryReportDto | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [signatureOpen, setSignatureOpen] = useState(false);

    const fieldImages = useMemo(() => gatherFieldImages(appointment), [appointment]);

    const load = async () => {
        setLoading(true);
        try {
            // One report per order: prefer the order-scoped report so a second
            // appointment on the same order reuses it instead of starting fresh.
            const orderId = getDeliveryOrderId(appointment);
            const [tpls, current] = await Promise.all([
                checklistApi.list().catch(() => [] as ChecklistTemplateDto[]),
                orderId
                    ? deliveryReportApi.list({ salesOrderId: orderId }).then((rows) => rows[0] || null).catch(() => null)
                    : deliveryReportApi.getByAppointment(appointment.id).catch(() => null),
            ]);
            const activeTpls = tpls.filter((tpl) => tpl.isActive);
            setTemplates(activeTpls);
            setExisting(current);
            if (!current && activeTpls.length > 0) {
                setTemplateId(activeTpls[0].id);
                setResponses(buildResponses(activeTpls[0]));
            }
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [appointment.id]);

    const selectTemplate = (id: string) => {
        setTemplateId(id);
        const tpl = templates.find((tt) => tt.id === id);
        setResponses(tpl ? buildResponses(tpl) : []);
    };

    const setStatus = (id: string, status: DeliveryStatus) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, status } : r)));
    const setMeasurement = (id: string, measurement: string) =>
        setResponses((rows) => rows.map((r) => (r.id === id ? { ...r, measurement } : r)));

    const selectedTemplate = templates.find((tt) => tt.id === templateId) || null;

    const openSignature = () => {
        if (responses.length === 0) {
            toast.error(t('projects.delivery.selectChecklistFirst'));
            return;
        }
        setSignatureOpen(true);
    };
    const closeSignature = () => setSignatureOpen(false);

    const save = async (signatureBase64?: string | null) => {
        setSaving(true);
        try {
            await deliveryReportApi.create({
                appointmentId: appointment.id,
                projectId: appointment.project?.id || null,
                salesOrderId: getDeliveryOrderId(appointment),
                checklistTemplateId: templateId || null,
                checklistName: selectedTemplate?.name || null,
                responses,
                notes: notes.trim() || null,
                signatureBase64: signatureBase64 || null,
            });
            toast.success(signatureBase64 ? t('projects.delivery.sentSigned') : t('projects.delivery.sentUnsigned'));
            setSignatureOpen(false);
            onChanged?.();
            await load();
        } catch (error: any) {
            toast.error(error?.response?.data?.error || t('projects.delivery.sendError'));
        } finally {
            setSaving(false);
        }
    };

    return {
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
    };
};
