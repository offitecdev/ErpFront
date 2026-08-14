import type { ChecklistTemplateDto, DeliveryResponseItem } from '@/lib/api/project';

/** A field-report image reference, as consumed by the delivery snapshot/summary. */
export type DeliveryFieldImage = { id: string; imageData: string };

/** Appointment shape consumed by the delivery report editor. */
export type DeliveryAppointment = {
    id: string;
    salesOrderId?: string | null;
    salesOrder?: { id: string; orderNumber?: string } | null;
    project?: any;
};

/** A category group of checklist responses, preserving first-seen order. */
export type DeliveryCategoryGroup = { category: string; items: DeliveryResponseItem[] };

/**
 * Fresh, empty responses derived from a checklist template. Kategorisiz (yeni
 * DÜZ listeler) maddeler LİSTE ADINI kategori olarak taşır — böylece her
 * tüketici (montaj ekranı, PDF, imza anlık görüntüsü) alt başlık yerine liste
 * adını gösterir.
 */
export const buildResponses = (tpl: ChecklistTemplateDto): DeliveryResponseItem[] =>
    (Array.isArray(tpl.items) ? tpl.items : []).map((it) => ({
        id: it.id,
        category: it.category || tpl.name || '',
        label: it.label,
        status: null,
        measurement: '',
        measurementEnabled: Boolean(it.measurement),
    }));

/**
 * Group responses by category, keeping the order categories first appear in.
 * `uncategorizedKey` is used for rows without a category (UI uses '—', the
 * snapshot builders pass the translated "uncategorized" label as the heading).
 */
export const groupResponsesByCategory = (
    responses: DeliveryResponseItem[],
    uncategorizedKey = '—',
): DeliveryCategoryGroup[] => {
    const order: string[] = [];
    const map = new Map<string, DeliveryResponseItem[]>();
    for (const r of responses) {
        const key = r.category.trim() || uncategorizedKey;
        if (!map.has(key)) {
            order.push(key);
            map.set(key, []);
        }
        map.get(key)!.push(r);
    }
    return order.map((category) => ({ category, items: map.get(category)! }));
};

/** The sales-order id a delivery appointment belongs to, if any. */
export const getDeliveryOrderId = (appointment: DeliveryAppointment): string | null =>
    appointment.salesOrderId || appointment.salesOrder?.id || null;

/** Field-report visuals belonging to this order, gathered live from the project reports. */
export const gatherFieldImages = (appointment: DeliveryAppointment): DeliveryFieldImage[] => {
    const orderId = getDeliveryOrderId(appointment);
    const reports = (appointment.project?.reports || []) as any[];
    return reports
        .filter((r) => (r.salesOrderId || null) === orderId || !orderId)
        .flatMap((r) => (Array.isArray(r.images) ? r.images : []))
        .filter((img: any) => img?.imageData)
        .map((img: any) => ({ id: img.id, imageData: img.imageData }));
};
