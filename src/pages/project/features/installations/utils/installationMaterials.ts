import { t } from '@/i18n/translate';
import { localizeTenderNumber } from '@/utils/tenderNumber';

import type { InstallationAppointment } from '../hooks/useInstallationDetail';

export const getInstallationUsedMaterials = (appointment: InstallationAppointment) => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return [
        ...(tender?.usedMaterials || []).map((usage: any) => ({
            id: `usage-${usage.id}`,
            material: usage.material,
            quantity: Number(usage.quantity || 0),
            unitCost: Number(usage.unitCost || usage.material?.unitCost || 0),
            source: tender?.tenderNumber ? localizeTenderNumber(tender.tenderNumber) :t('projects.teklif'),
            note: usage.description,
        })),
        ...((tender?.positions || []).flatMap((position: any) =>
            (position.materialMappings || []).map((mapping: any) => ({
                id: `mapping-${mapping.id}`,
                material: mapping.material,
                quantity: Number(mapping.quantityMultiplier || 0),
                unitCost: Number(mapping.material?.unitCost || 0),
                source: `${position.positionNumber ||t('projects.pozisyon')} - ${position.shortDescription || ''}`,
                note: '',
            }))
        )),
    ].filter((item) => item.quantity > 0);
};
