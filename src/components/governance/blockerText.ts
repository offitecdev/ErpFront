import { t } from '@/i18n/translate';

/**
 * Ein Satz je Sperre — dieselben Texte wie im Rücknahmefenster des Auftrags,
 * damit Verlauf, Ausnahmetür und Auswahl dieselbe Sprache sprechen.
 */
const BLOCKER_KEYS: Record<string, string> = {
    INVOICE: 'orders.lifecycle.blockerInvoice',
    REPORT: 'orders.lifecycle.blockerReport',
    DELIVERY_REPORT: 'orders.lifecycle.blockerDeliveryReport',
    STOCK_MOVEMENT: 'orders.lifecycle.blockerStock',
    EXPENSE: 'orders.lifecycle.blockerExpense',
    MONTAGE_STARTED: 'orders.lifecycle.blockerMontage',
    ADDON: 'orders.lifecycle.blockerAddon',
    CANCELLED: 'orders.lifecycle.blockerCancelled',
    SALES_ORDER: 'orders.lifecycle.blockerSalesOrder',
    PROJECT: 'orders.lifecycle.blockerProject',
    PARKED_APPOINTMENT: 'governance.blocker.PARKED_APPOINTMENT',
    CREDIT_DOCUMENT: 'governance.blocker.CREDIT_DOCUMENT',
    OPEN_INVOICE: 'governance.blocker.OPEN_INVOICE',
};

export const blockerText = (blocker: string): string =>
    BLOCKER_KEYS[blocker] ? t(BLOCKER_KEYS[blocker]) : blocker;
