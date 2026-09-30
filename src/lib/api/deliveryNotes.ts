import { apiClient } from '../axios';

/**
 * ── LIEFERSCHEINE (28.09.2026) ───────────────────────────────────────────────
 * Der Lieferschein gehört zum Auftrag (AB): welche Positionen mit welcher Menge
 * an welche Anschrift gingen. Die Nummer LS-YYYY-NNNNN vergibt der Server.
 */
export type DeliverySiteKind = 'INSTALLATION' | 'DELIVERY';

export interface DeliveryNoteLineDto {
    id?: string;
    /** Offertposition der Zeile — leer bei einer von Hand ergänzten Zeile. */
    sourcePositionId: string | null;
    articleId: string | null;
    /** «1.2» — dieselbe Nummer, die Offerte und AB drucken. */
    positionNumber: string | null;
    articleCode: string | null;
    description: string;
    unit: string | null;
    orderedQty: number;
    deliveredQty: number;
}

export interface DeliveryNoteDto {
    id: string;
    salesOrderId: string;
    projectId: string | null;
    noteNumber: string;
    /** JJJJ-MM-TT */
    deliveryDate: string | null;
    customerName: string | null;
    customerAddress: string | null;
    siteAddressKind: DeliverySiteKind | null;
    siteAddress: string | null;
    customerReference: string | null;
    note: string | null;
    createdAt: string;
    lines: DeliveryNoteLineDto[];
}

export interface DeliveryNoteInput {
    salesOrderId: string;
    deliveryDate: string;
    customerName: string | null;
    customerAddress: string | null;
    siteAddressKind: DeliverySiteKind | null;
    siteAddress: string | null;
    customerReference: string | null;
    note: string | null;
    lines: DeliveryNoteLineDto[];
}

export const deliveryNotesApi = {
    list: async (salesOrderId: string): Promise<DeliveryNoteDto[]> => {
        const res = await apiClient.get('/delivery-notes', { params: { salesOrderId } });
        return Array.isArray(res.data?.notes) ? res.data.notes : [];
    },

    /**
     * Artikelnummern und Lagerbestand zu Artikel-Ids (die Offertpositionen
     * kennen nur die Id). Der Bestand ist nur für die Erfassungsmaske — er
     * kommt nie auf das PDF.
     */
    articleInfo: async (ids: string[]): Promise<{ codes: Record<string, string>; stock: Record<string, number> }> => {
        const unique = [...new Set(ids.filter(Boolean))].slice(0, 500);
        if (unique.length === 0) return { codes: {}, stock: {} };
        const res = await apiClient.get('/delivery-notes/article-codes', { params: { ids: unique.join(',') } });
        const obj = (value: unknown) => (value && typeof value === 'object' ? value as Record<string, never> : {});
        return { codes: obj(res.data?.codes), stock: obj(res.data?.stock) };
    },

    /** Vorschau der nächsten Nummer — keine Reservierung. */
    nextNumber: async (): Promise<string | null> => {
        const res = await apiClient.get('/delivery-notes/next-number');
        return typeof res.data?.number === 'string' ? res.data.number : null;
    },

    create: async (input: DeliveryNoteInput): Promise<DeliveryNoteDto> => {
        const res = await apiClient.post('/delivery-notes', input);
        return res.data;
    },

    /** Kopf und Zeilen ersetzen; die Kundenanschrift bleibt der Schnappschuss vom Erstellen. */
    update: async (id: string, input: Partial<Omit<DeliveryNoteInput, 'salesOrderId'>>): Promise<DeliveryNoteDto> => {
        const res = await apiClient.patch(`/delivery-notes/${id}`, input);
        return res.data;
    },

    remove: async (id: string): Promise<void> => {
        await apiClient.delete(`/delivery-notes/${id}`);
    },
};
