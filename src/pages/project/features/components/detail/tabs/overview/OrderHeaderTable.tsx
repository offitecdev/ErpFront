import { memo } from 'react';
import dayjs from 'dayjs';

import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { OrderNotifications, type OrderNotification } from './OrderNotifications';
import { ProjectStatusChip } from './overviewChips';

const day = (value?: string | null) => (value ? dayjs(value).format('DD.MM.YYYY') : '-');

/**
 * The single row at the very top: who the order is for and what it is. Nothing
 * else on the screen repeats this, so everything below can stay narrow. The bell
 * sits in the card header — its notifications play as single pop-ups at the
 * bottom of the screen.
 */
export const OrderHeaderTable = memo(({ project, order, notifications }: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    notifications: OrderNotification[];
}) => {
    const creator = order?.createdBy || project.manager || null;
    // Kommission — kendi teklifinden, yoksa projenin teklifinden. Projede tek
    // bir kommission olduğu için müşteri/sipariş satırının yanında durur.
    const commission = (order?.tender?.commissionNumber || project.tender?.commissionNumber || '').trim();
    return (
        <SectionCard
            title={`${t('projects.delivery.colCustomer')} · ${t('projects.order')}`}
            action={<OrderNotifications items={notifications} />}
        >
            <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                <thead>
                    <tr>
                        <th className="text-left">{t('projects.delivery.colCustomer')}</th>
                        <th className="text-left">{t('projects.order')}</th>
                        <th className="text-left">{t('projects.tender')}</th>
                        <th className="text-left">{t('tenders.kommission_nr')}</th>
                        <th className="w-28 text-left">{t('common.start')}</th>
                        <th className="w-28 text-left">{t('common.end')}</th>
                        <th className="text-left">{t('projects.detail.overview.creator')}</th>
                        <th className="w-32 text-left">{t('common.status')}</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td className="truncate font-semibold text-slate-900 dark:text-white">
                            {project.customer?.companyName || '-'}
                        </td>
                        <td className="truncate font-semibold text-slate-800 dark:text-white/90">
                            {order?.orderNumber ? order.orderNumber : '-'}
                        </td>
                        <td className="truncate">
                            {order?.tender?.tenderNumber || project.tender?.tenderNumber || '' || '-'}
                        </td>
                        <td className={commission
                            ? 'truncate font-mono font-semibold text-slate-900 dark:text-white'
                            : 'truncate text-slate-400 dark:text-white/40'}
                        >
                            {commission || '-'}
                        </td>
                        <td className="tabular-nums">{day(project.startDate)}</td>
                        <td className="tabular-nums">{day(project.endDate)}</td>
                        <td className="truncate">{creator ? `${creator.firstName} ${creator.lastName}` : '-'}</td>
                        <td><ProjectStatusChip status={project.status} /></td>
                    </tr>
                </tbody>
            </table>
        </SectionCard>
    );
});
