import { t } from '@/i18n/translate';
import type { PurchaseOrderTableColumn, PurchaseTemplateDocumentType, SupplierOrderTemplate } from '@/types/inventory';
import { isProductionColumns } from '@/utils/standardOrderColumns';

/**
 * ── DIE VORLAGE DER PRODUKTION AUF DER AUFTRAGSSEITE (30.09.2026) ──────────
 *
 * Ein Beleg der BOM trägt seine Spalten selbst (Materialgruppe · Produktcode ·
 * Produktname · Einheit · Menge · bei Bestellungen Einzelpreis · Rabatt ·
 * Betrag — `shared/standardOrderTemplate.ts` im Backend). Diese Vorlage gibt
 * es auf dem Server nicht; die Auftragsseite baut sie aus dem Beleg und nimmt
 * sie, solange niemand von Hand eine andere wählt — sonst schriebe das
 * Speichern die Spalten der Stok-Vorlage über die der Produktion.
 */
export const PRODUCTION_TEMPLATE_ID = 'production-bom';

const WIDTHS: Record<string, number> = {
    stdGroup: 150,
    stdProductCode: 150,
    stdName: 260,
    stdUnit: 90,
    stdQty: 100,
    stdUnitPrice: 120,
    stdDiscount: 100,
    stdLineTotal: 130,
};

export const productionTemplateOf = (
    columns: PurchaseOrderTableColumn[] | null | undefined,
    documentType: PurchaseTemplateDocumentType,
): SupplierOrderTemplate | null => {
    if (!columns || !isProductionColumns(columns)) return null;
    return {
        id: PRODUCTION_TEMPLATE_ID,
        supplierId: null,
        supplierName: '',
        title: t('productionBom.purchasing.productionTemplate'),
        documentType,
        isDefault: false,
        usageCount: 0,
        config: {
            columns: columns.map((column) => ({
                key: column.key,
                name: column.name,
                type: column.type,
                label: column.label ?? null,
                width: WIDTHS[column.key] ?? 140,
            })),
        },
        createdAt: '',
        updatedAt: '',
    };
};
