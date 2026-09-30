import { t } from '@/i18n/translate';
import type { ProcurementDetail } from '@/types/purchasing';

import { shortDate } from '../../bom/bomFormat';

/* ── Der Kontext der Seitenfläche (Wareneingang) ── */

/** «TLP-2026-00131 · Coop Basel · Pano OT-CP-250 (Poz. 3) · teslim 14.10.2026» */
export const PanelContext = ({ detail }: { detail: ProcurementDetail }) => {
    const { request } = detail;
    const device = request.device
        ? `${request.device.name}${request.device.positionNumber ? ` (${t('productionBom.purchasing.position', { value: request.device.positionNumber })})` : ''}`
        : null;
    const delivery = request.project?.deliveryDate ? t('productionBom.purchasing.deliveryOn', { date: shortDate(request.project.deliveryDate) }) : null;
    return (
        <>
            <b className="is-code">{request.requestNumber}</b>
            {[request.project?.projectName, device, delivery].filter(Boolean).map((part) => <span key={part}>{part}</span>)}
        </>
    );
};
