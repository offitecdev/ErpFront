import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { t } from '@/i18n/translate';

import { rowMaterial } from './materialCompat';

// Malzeme/ürün birleşmesi (2026-08-14): pozisyon malzeme eşlemeleri
// (materialMappings) tabloyla birlikte kalktı — teklife dahil malzeme listesi
// yalnızca tender.usedMaterials'tır ve satırlar Article'a bağlıdır.
export const getProjectUsedMaterials = (project: ProjectDto, order?: ProjectSalesOrder | null) => {
    const tender = order?.tender || project.tender;
    return (tender?.usedMaterials || [])
        .map((usage) => {
            const material = rowMaterial(usage as any);
            return {
                id: `usage-${usage.id}`,
                rawId: usage.id,
                source: 'tender' as const,
                positionNumber: tender?.tenderNumber ? tender.tenderNumber : '-',
                positionName: t('auto.teklif_ayarlari'),
                quantity: Number(usage.quantity || 0),
                discount: 0,
                material,
                unitCost: Number(usage.unitCost || material?.unitCost || 0),
                value: Number(usage.quantity || 0) * Number(usage.unitCost || material?.unitCost || 0),
                description: usage.description,
            };
        })
        .filter((item) => item.quantity > 0);
};
