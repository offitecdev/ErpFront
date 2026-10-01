/**
 * Die Texte der Depo-Dateien (Excel-Liste, Excel-Vorlage) in der Sprache der
 * Oberfläche — ausserhalb der Komponenten, damit Fast Refresh sie nicht als
 * Komponenten missversteht.
 */
import { t } from '@/i18n/translate';
import { WAREHOUSE_UNITS } from '@/types/warehouse';

import type { ImportField, ListExcelTexts, TemplateTexts } from './warehouseExcel';

export const listExcelTexts = (): ListExcelTexts => ({
    sheet: t('warehouse.excel.listSheet'),
    headers: {
        erpCode: t('warehouse.excel.list.erpCode'),
        barcode: t('warehouse.excel.list.barcode'),
        name: t('warehouse.excel.list.name'),
        category: t('warehouse.excel.list.category'),
        group: t('warehouse.excel.list.group'),
        brand: t('warehouse.excel.list.brand'),
        modelNumber: t('warehouse.excel.list.modelNumber'),
        unit: t('warehouse.excel.list.unit'),
        supplier: t('warehouse.excel.list.supplier'),
        supplierArticleNumbers: t('warehouse.excel.list.supplierArticleNumbers'),
        supplierOrderNumbers: t('warehouse.excel.list.supplierOrderNumbers'),
        makerBarcodes: t('warehouse.excel.list.makerBarcodes'),
        description: t('warehouse.excel.list.description'),
        quantity: t('warehouse.excel.list.quantity'),
        purchasePrice: t('warehouse.excel.list.purchasePrice'),
        currency: t('warehouse.excel.list.currency'),
        serialRequired: t('warehouse.excel.list.serialRequired'),
    },
    units: unitTexts(),
    yes: t('warehouse.excel.yes'),
    no: t('warehouse.excel.no'),
    fileName: t('warehouse.excel.listFile'),
});

const TEMPLATE_HEADER_KEYS: Record<ImportField, string> = {
    group: 'warehouse.excel.template.group',
    name: 'warehouse.excel.template.name',
    brand: 'warehouse.excel.template.brand',
    modelNumber: 'warehouse.excel.template.modelNumber',
    unit: 'warehouse.excel.template.unit',
    supplierName: 'warehouse.excel.template.supplierName',
    supplierEmail: 'warehouse.excel.template.supplierEmail',
    supplierArticleNumber: 'warehouse.excel.template.supplierArticleNumber',
    supplierOrderNumber: 'warehouse.excel.template.supplierOrderNumber',
    manufacturerBarcode: 'warehouse.excel.template.manufacturerBarcode',
    description: 'warehouse.excel.template.description',
    quantity: 'warehouse.excel.template.quantity',
    purchasePrice: 'warehouse.excel.template.purchasePrice',
    currency: 'warehouse.excel.template.currency',
    serialRequired: 'warehouse.excel.template.serialRequired',
};

/** Die Einheiten der Karte in der Sprache der Oberfläche (Excel-Auswahl, Liste). */
const unitTexts = (): Record<string, string> =>
    Object.fromEntries(WAREHOUSE_UNITS.map((unit) => [unit, t(`warehouse.units.${unit}`)]));

export const templateTexts = (): TemplateTexts => ({
    productsSheet: t('warehouse.excel.productsSheet'),
    helpSheet: t('warehouse.excel.helpSheet'),
    headers: Object.fromEntries(
        Object.entries(TEMPLATE_HEADER_KEYS).map(([field, key]) => [field, t(key)]),
    ) as Record<ImportField, string>,
    units: unitTexts(),
    yes: t('warehouse.excel.yes'),
    no: t('warehouse.excel.no'),
    help: ['help1', 'help2', 'help3', 'help4', 'help5', 'help6'].map((key) => t(`warehouse.excel.${key}`)),
    fileName: t('warehouse.excel.templateFile'),
});
