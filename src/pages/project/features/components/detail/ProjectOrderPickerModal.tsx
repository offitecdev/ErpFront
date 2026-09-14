import dayjs from 'dayjs';

import { Plus, Receipt as ReceiptText } from '@/components/icons/antIconCompat';
import { PopupActions, PopupButton, PopupDialog } from '@/components/ui-shared/PopupKit';
import { t } from '@/i18n/translate';
import type { ProjectSalesOrder } from '@/types/project';
import '@/styles/modules/projectDetail.css';

/**
 * «WELCHEN AUFTRAG MEINEN SIE?» (Vorgabe Samet 06.09.2026, §5)
 *
 * Zurücknehmen und Stornieren geschehen am AUFTRAG, nicht am Projekt. Steht nur
 * ein einziger Auftrag im Projekt, ist die Frage überflüssig und wird gar nicht
 * gestellt; stehen mehrere darin, wählt die Person hier, welchen sie meint —
 * und erst danach öffnet das Fenster, das sagt, was mit ihm geschehen darf.
 */
export const ProjectOrderPickerModal = ({ orders, onClose, onPick }: {
    orders: ProjectSalesOrder[];
    onClose: () => void;
    onPick: (order: ProjectSalesOrder) => void;
}) => (
    <PopupDialog
        open
        title={t('projects.lifecycle.pickOrderTitle')}
        subtitle={t('projects.lifecycle.pickOrderText')}
        width={480}
        onClose={onClose}
        footer={(
            <PopupActions>
                <PopupButton onClick={onClose}>{t('common.cancel')}</PopupButton>
            </PopupActions>
        )}
    >
        <div className="space-y-1.5">
            {orders.map((order) => {
                const isAddon = Boolean(order.parentSalesOrderId);
                const cancelled = Boolean(order.cancelledAt);
                return (
                    <button
                        key={order.id}
                        type="button"
                        onClick={() => onPick(order)}
                        className="ofi-option-row flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition-colors dark:border-white/10"
                    >
                        <span className={`ofi-prj-order__mark ${isAddon ? 'is-addon' : ''}`}>
                            {isAddon ? <Plus size={14} /> : <ReceiptText size={14} />}
                        </span>
                        <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13px] font-semibold text-slate-900 dark:text-white">
                                {order.orderNumber}
                            </span>
                            <span className="block text-[12px] text-slate-500 dark:text-white/60">
                                {dayjs(order.orderDate || order.createdAt).format('DD.MM.YYYY')}
                                {' · '}
                                {isAddon ? t('projects.addonOrder') : t('projects.mainOrder')}
                            </span>
                        </span>
                        {cancelled && (
                            <span className="shrink-0 rounded px-1.5 py-px text-[11px] font-semibold text-rose-600 dark:text-rose-300">
                                {t('orders.lifecycle.statusCancelled')}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    </PopupDialog>
);
