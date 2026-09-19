import { apiClient } from '../axios';
import type { DocumentEntityType } from '@/components/governance/governance';
import type { OrderRevertResultDto } from '@/types/billing';

/**
 * Belegverlauf (16.09.2026, Schritt 4) — nur lesen. Dazu die zwei Aufrufe mit
 * Ausnahmetür: sie sind dieselben Wege wie ohne, tragen aber `override` im
 * Rumpf (Grund, abgetippte Belegnummer, Kennwort).
 */

export interface DocumentEventDto {
    id: string;
    entityType: DocumentEntityType;
    entityId: string;
    documentNumber: string | null;
    action: 'DELETED' | 'CANCELLED' | 'UNCANCELLED' | 'REVERTED_TO_DRAFT' | 'TEXT_CORRECTED' | 'STATUS_CHANGED' | string;
    reason: string | null;
    override: boolean;
    overriddenBlockers: string[];
    snapshot: Record<string, unknown> | null;
    actorName: string | null;
    createdAt: string;
    /** Gehört zu einem anderen Beleg und erscheint hier über den Verweis. */
    related: boolean;
}

export interface OverrideInput {
    reason: string;
    confirmNumber: string;
    password: string;
}

const params = (entityType: DocumentEntityType, entityId: string) =>
    new URLSearchParams({ entityType, entityId }).toString();

export const documentEventsApi = {
    list: async (entityType: DocumentEntityType, entityId: string): Promise<DocumentEventDto[]> => {
        const res = await apiClient.get(`/document-events?${params(entityType, entityId)}`);
        return Array.isArray(res.data?.items) ? res.data.items : [];
    },

    summary: async (entityType: DocumentEntityType, entityId: string): Promise<{ count: number; overrides: number }> => {
        const res = await apiClient.get(`/document-events/summary?${params(entityType, entityId)}`);
        return { count: Number(res.data?.count) || 0, overrides: Number(res.data?.overrides) || 0 };
    },

    /** Auftrag trotz Sperre zurücksetzen (nur Systemverwaltung). */
    revertOrderWithOverride: async (salesOrderId: string, override: OverrideInput): Promise<OrderRevertResultDto> => {
        const res = await apiClient.post(`/sales-orders/${salesOrderId}/revert-to-draft`, { override });
        return res.data;
    },

    /** Offerte trotz wartender Termine löschen (nur Systemverwaltung). */
    deleteTenderWithOverride: async (tenderId: string, override: OverrideInput): Promise<void> => {
        await apiClient.delete(`/tenders/${tenderId}`, { data: { override } });
    },
};
