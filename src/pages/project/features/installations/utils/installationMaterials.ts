import { t } from '@/i18n/translate';

import type { InstallationAppointment } from '../hooks/useInstallationDetail';
import { rowMaterial } from '../../utils/materialCompat';

// Malzeme/ürün birleşmesi (2026-08-14): pozisyon malzeme eşlemeleri kalktı —
// teklife dahil malzeme listesi yalnızca tender.usedMaterials'tır (Article'a bağlı).
export const getInstallationUsedMaterials = (appointment: InstallationAppointment) => {
    const tender = appointment.salesOrder?.tender || appointment.project?.tender;
    return (tender?.usedMaterials || [])
        .map((usage: any) => {
            const material = rowMaterial(usage);
            return {
                id: `usage-${usage.id}`,
                material,
                quantity: Number(usage.quantity || 0),
                unitCost: Number(usage.unitCost || material?.unitCost || 0),
                source: tender?.tenderNumber ? tender.tenderNumber : t('projects.teklif'),
                note: usage.description,
            };
        })
        .filter((item: any) => item.quantity > 0);
};
