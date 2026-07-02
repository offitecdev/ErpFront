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
