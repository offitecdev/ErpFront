import { apiClient } from '../axios';
import type { PurchaseOrderRow, PurchaseOrderStatus } from '@/types/inventory';

/**
 * ── PROJE → SİPARİŞ («Siparişlerim», 24.09.2026) ───────────────────────────
 * Sunucu: `projectProcurement.routes.ts`. Pozisyon başına talep / stok /
 * eksik, ürün türüne göre yol (satın alma, üretim, boş form) ve projenin
 * siparişleri.
 */
export type ProcurementMode = 'PURCHASE' | 'PRODUCTION' | 'EMPTY';

export interface ProcurementOrderRef {
    id: string;
    referenceNumber: string;
    status: PurchaseOrderStatus;
    /** Tedarikçi — boşsa henüz seçilmedi (Türsüzler'den açılan sipariş). */
    supplierName: string;
    quantity: number;
}

export interface ProcurementPosition {
    positionId: string;
    positionNumber: string | null;
    name: string;
    unit: string | null;
    requested: number;
    articleId: string | null;
    articleCode: string | null;
    articleKind: 'MANUFACTURED' | 'RESALE' | 'SERVICE' | null;
    itemType: string | null;
    mode: ProcurementMode;
    supplier: { id: string; name: string } | null;
    unitCost: number;
    /**
     * Nur beim Einkauf: der Bestand, der für DIESE Zeile noch da ist
     * (aktuell − reserviert; Zeilen mit demselben Artikel teilen ihn).
     */
    stock: number | null;
    /** Der Teil des Bedarfs, den das Lager deckt. */
    fromStock: number;
    /** Menge in Bestellungen (nicht in Preisanfragen). */
    ordered: number;
    /** Menge in Preisanfragen — gilt als «in Arbeit», wird nicht erneut bestellt. */
    inRequest: number;
    /** Noch zu bestellen: Bedarf − bestellt − angefragt − ab Lager. */
    missing: number;
    orders: ProcurementOrderRef[];
}

export interface ProcurementOrder {
    id: string;
    referenceNumber: string;
    status: PurchaseOrderStatus;
    supplierId: string | null;
    supplierName: string;
    totalNet: number;
    currency: string;
    createdAt: string;
    lineCount: number;
    production: boolean;
    /**
     * Türsüzler'den işaretlenip ELLE açılan sipariş: tabloda Türsüzler'in
     * üstünde kendi başlığıyla (U1, U2 …) durur, pozisyonları altında.
     */
    manual: boolean;
}

export interface ProjectProcurement {
    project: { id: string; projectNumber: string; projectName: string; label: string };
    producer: { tenantId: string; name: string } | null;
    positions: ProcurementPosition[];
    orders: ProcurementOrder[];
}


export interface ProcurementOrderResult {
    created: boolean;
    merged: boolean;
    order: PurchaseOrderRow;
}

export const projectProcurementApi = {
    get: async (projectId: string): Promise<ProjectProcurement> => {
        const res = await apiClient.get(`/inventory/project-procurement/${projectId}`);
        return res.data;
    },

    /**
     * «Siparişe Git»: eksik miktar (ya da verilen miktar) kadar sipariş —
     * tedarikçinin bu projeye ait açık siparişine eklenir, yoksa yenisi açılır.
     * `target`: AUTO (varsayılan), EXISTING (yalnızca mevcut açık sipariş),
     * NEW (her zaman yeni sipariş).
     */
    order: async (
        projectId: string,
        body: { positionId: string; quantity?: number; target?: 'AUTO' | 'EXISTING' | 'NEW' },
    ): Promise<ProcurementOrderResult> => {
        const res = await apiClient.post(`/inventory/project-procurement/${projectId}/order`, body);
        return res.data;
    },

    /**
     * «SİPARİŞE GİT» (tedarikçi grubu): grubun eksikleri varsa siparişe yazılır
     * (tedarikçinin projeye ait açık siparişine eklenir, yoksa açılır) ve
     * sipariş döner. Eksik yoksa `NOTHING_MISSING` + `orderId` gelir.
     * Otomatik sipariş PROJE OLUŞTURULUNCA sunucuda çalışır, sekme açılınca değil.
     */
    supplierOrder: async (projectId: string, key: string): Promise<ProcurementOrderResult> => {
        const res = await apiClient.post(`/inventory/project-procurement/${projectId}/supplier-order`, { key });
        return res.data;
    },

    /**
     * TÜRSÜZLER: işaretlenen pozisyonlardan TEK, tedarikçisiz bir sipariş —
     * tedarikçi siparişte seçilir.
     */
    manualOrder: async (projectId: string, positionIds: string[]): Promise<ProcurementOrderResult> => {
        const res = await apiClient.post(`/inventory/project-procurement/${projectId}/manual-order`, { positionIds });
        return res.data;
    },
};

/** Sunucunun iş kuralı kodu (`EMPTY_FORM`, `SUPPLIER_MISSING`, …). */
export const procurementErrorCode = (error: unknown): string | null =>
    (error as { response?: { data?: { code?: string } } })?.response?.data?.code ?? null;
