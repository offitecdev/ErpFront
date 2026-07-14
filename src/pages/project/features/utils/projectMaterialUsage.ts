import type { ProjectDto, ProjectSalesOrder } from '@/types/project';
import { t } from '@/i18n/translate';
import { localizeTenderNumber } from '@/utils/tenderNumber';

export const getProjectUsedMaterials = (project: ProjectDto, order?: ProjectSalesOrder | null) => {
    const tender = order?.tender || project.tender;
    return (
    [
        ...(tender?.usedMaterials || []).map((usage) => ({
            id: `usage-${usage.id}`,
            rawId: usage.id,
            source: 'tender' as const,
            positionNumber: tender?.tenderNumber ? localizeTenderNumber(tender.tenderNumber) : '-',
            positionName:t('auto.teklif_ayarlari'),
            quantity: Number(usage.quantity || 0),
            discount: 0,
            material: usage.material,
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            value: Number(usage.quantity || 0) * Number(usage.unitCost || usage.material?.unitCost || 0),
            description: usage.description,
        })),
        ...((tender?.positions || []).flatMap((position) =>
            (position.materialMappings || []).map((mapping) => ({
                id: `mapping-${mapping.id}`,
                rawId: mapping.id,
                source: 'position' as const,
                positionNumber: position.positionNumber,
                positionName: position.shortDescription ||t('auto.teklif_pozisyonu'),
                quantity: Number(mapping.quantityMultiplier || 0),
                discount: Number(mapping.discount || 0),
                material: mapping.material,
                unitCost: Number(mapping.material?.unitCost || 0),
                value: Number(mapping.quantityMultiplier || 0) * Number(mapping.material?.unitCost || 0),
            }))
        )),
    ].filter((item) => item.quantity > 0)
    );
};
