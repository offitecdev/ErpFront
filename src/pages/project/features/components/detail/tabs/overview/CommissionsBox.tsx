import { memo } from 'react';

import { t } from '@/i18n/translate';
import type { ProjectSalesOrder } from '@/types/project';

import { linkRow } from './linkRow';
import { OverviewCard } from './OverviewCard';

/**
 * Die Kommissionen des PROJEKTS — nicht des ausgewählten Auftrags. Ein Projekt
 * kann mehrere Aufträge tragen, und jeder bringt seine eigene Kommissionsnummer
 * aus seinem Angebot mit; hier stehen sie in Auftragsreihenfolge untereinander.
 *
 * Ein Zusatzauftrag entsteht aus bereits geleisteter Mehrarbeit und hat kein
 * eigenes Angebot — er steht mit leerer Kommission in der Liste, statt zu fehlen.
 *
 * Eine Zeile stellt die Seite auf ihren Auftrag um — dieselbe Geste wie in der
 * Zusatzauftragsliste, damit „anklickbare Zeile" überall dasselbe bedeutet.
 */
export const CommissionsBox = memo(({ orders, onSelectOrder }: {
    orders: ProjectSalesOrder[];
    onSelectOrder: (orderId: string) => void;
}) => (
    <OverviewCard title={t('crm.commissions')}>
        <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
            <thead>
                <tr>
                    <th className="text-left">{t('projects.order')}</th>
                    <th className="text-left">{t('tenders.kommission_nr')}</th>
                </tr>
            </thead>
            <tbody>
                {orders.length === 0 ? (
                    <tr>
                        <td colSpan={2} className="ofi-prj-muted">{t('crm.commissionMissing')}</td>
                    </tr>
                ) : orders.map((order) => {
                    const commission = (order.tender?.commissionNumber || '').trim();
                    return (
                        <tr
                            key={order.id}
                            {...linkRow(
                                () => onSelectOrder(order.id),
                                `${order.orderNumber} · ${t('tenders.kommission_nr')} ${commission || t('crm.commissionMissing')}`,
                            )}
                        >
                            <td><span className="ofi-prj-cut">{order.orderNumber}</span></td>
                            <td className={commission ? 'ofi-prj-mono' : 'ofi-prj-muted'}>
                                {commission || t('crm.commissionMissing')}
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    </OverviewCard>
));
