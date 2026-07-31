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
type TenderStateSource = { projectId?: string | null; sourceStatus?: string | null };

export const isOrderTender = (tender: TenderStateSource) =>
    Boolean(tender.projectId) || isSourceSalesOrder(tender.sourceStatus);

export const tenderStatusLabel = (tender: TenderStateSource) =>
    isOrderTender(tender) ? t('crm.tenders.statusOrdered') : t('crm.tenders.statusDraft');

export const tenderStatusVariant = (tender: TenderStateSource): 'passive' | 'order' =>
    isOrderTender(tender) ? 'order' : 'passive';
