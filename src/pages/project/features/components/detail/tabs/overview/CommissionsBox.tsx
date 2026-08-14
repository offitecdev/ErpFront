import { memo } from 'react';

import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import type { ProjectSalesOrder } from '@/types/project';

/**
 * Die Kommissionen des PROJEKTS — nicht des ausgewählten Auftrags. Ein Projekt
 * kann mehrere Aufträge tragen, und jeder bringt seine eigene Kommissionsnummer
 * aus seinem Angebot mit; hier stehen sie in Auftragsreihenfolge untereinander.
 *
 * Ein Zusatzauftrag entsteht aus bereits geleisteter Mehrarbeit und hat kein
 * eigenes Angebot — er steht mit leerer Kommission in der Liste, statt zu fehlen.
 */
export const CommissionsBox = memo(({ orders }: { orders: ProjectSalesOrder[] }) => (
    <SectionCard title={t('crm.commissions')}>
        <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
            <thead>
                <tr>
                    <th className="text-left">{t('projects.order')}</th>
                    <th className="text-left">{t('tenders.kommission_nr')}</th>
                </tr>
            </thead>
            <tbody>
                {orders.length === 0 ? (
                    <tr>
                        <td colSpan={2} className="text-[13px] text-slate-400 dark:text-white/40">
                            {t('crm.commissionMissing')}
                        </td>
                    </tr>
                ) : orders.map((order) => {
                    const commission = (order.tender?.commissionNumber || '').trim();
                    return (
                        <tr key={order.id}>
                            <td className="truncate text-[13px] text-slate-800 dark:text-white/90">{order.orderNumber}</td>
                            <td className={commission
                                ? 'font-mono text-[13px] font-semibold text-slate-900 dark:text-white'
                                : 'text-[13px] text-slate-400 dark:text-white/40'}
                            >
                                {commission || t('crm.commissionMissing')}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </SectionCard>
));
