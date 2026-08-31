import { t } from '@/i18n/translate';
import type { TenderFormat } from '../../../../types/tender';

export const isSourceSalesOrder = (value?: string | null) => {
    const normalized = String(value || '')
        .trim()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
    return ['verkaufsauftrag','sales_order','sale_order', 'sipariste', 'siparis', 'auftrag'].includes(normalized);
};

export const formatTenderFormatLabel = (format?: TenderFormat | string | null) => (format === 'SIA451' ?t('tenders.sia_451') : String(format || ''));

/**
 * Der Arbeitsablauf kennt genau ZWEI Zustände: Auftrag (an einem Projekt oder
 * mit Verkaufsauftrag als Quelle) oder Entwurf. Die rohen Draft/Approved/
 * Exported-Werte fallen in den Listen unter "Entwurf" zusammen.
 *
 * Nur `projectId` + `sourceStatus` werden gelesen — beide stecken auch in der
 * schlanken Listenzeile (`fields=list`), die kein `status` mitschickt. Deshalb
 * funktionieren die Helfer in der Angebotsliste UND im Kundenreiter.
 */
type TenderStateSource = {
    projectId?: string | null;
    sourceStatus?: string | null;
    validUntil?: string | Date | null;
    offerAcceptedAt?: string | Date | null;
};

export const isOrderTender = (tender: TenderStateSource) =>
    Boolean(tender.projectId) || isSourceSalesOrder(tender.sourceStatus);

/**
 * "Abgelaufen" (Vorgabe 15.08.2026): ein Entwurf, dessen "gültig bis" vor
 * heute liegt (der letzte Gültigkeitstag zählt noch) und der weder angenommen
 * noch bestellt wurde. Der Hintergrunddienst räumt dazu die Erinnerungen weg;
 * die Liste und die Detailansicht zeigen den Zustand als Status.
 */
export const isExpiredTender = (tender: TenderStateSource): boolean => {
    if (isOrderTender(tender) || tender.offerAcceptedAt || !tender.validUntil) return false;
    const validUntil = new Date(tender.validUntil);
    if (Number.isNaN(validUntil.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    validUntil.setHours(0, 0, 0, 0);
    return validUntil < today;
};

export const tenderStatusLabel = (tender: TenderStateSource) => {
    if (isOrderTender(tender)) return t('crm.tenders.statusOrdered');
    if (isExpiredTender(tender)) return t('crm.tenders.statusExpired');
    return t('crm.tenders.statusDraft');
};

export const tenderStatusVariant = (tender: TenderStateSource): 'passive' | 'order' | 'danger' => {
    if (isOrderTender(tender)) return 'order';
    if (isExpiredTender(tender)) return 'danger';
    return 'passive';
};
