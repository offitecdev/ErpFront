import { memo } from 'react';
import dayjs from 'dayjs';

import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import type { DeliveryReportDto } from '@/lib/api/project';

import { Chip } from './overviewChips';

/**
 * The small box under the add-on orders: does this order have a delivery report,
 * yes or no — and if so, is it signed and from when.
 *
 * It covers ONLY the selected order. An add-on order can never have a delivery
 * report: it is a billing construct created from extra work already done on its
 * parent, and the reports section is not even offered for it (see
 * `ProjectSectionRenderer`). Listing add-ons here would ask a question that
 * cannot have an answer.
 */
export const DeliveryStatusBox = memo(({ reports }: { reports: DeliveryReportDto[] }) => {
    const exists = reports.length > 0;
    const signed = reports.some((report) => report.isSigned);
    // The newest report is the one that speaks for the order.
    const latest = reports
        .map((report) => report.createdAt)
        .sort((a, b) => dayjs(b).valueOf() - dayjs(a).valueOf())[0];

    const yesNo = (value: boolean) => (
        <Chip tone={value ? 'active' : 'passive'}>{value ? t('common.yes') : t('common.no')}</Chip>
    );

    return (
        <SectionCard title={t('projects.detail.overview.deliveryTitle')}>
            <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                <tbody>
                    <tr>
                        <td className="text-[13px] text-slate-500 dark:text-white/60">{t('projects.flow.deliveryReport')}</td>
                        <td className="text-right">{yesNo(exists)}</td>
                    </tr>
                    <tr>
                        <td className="text-[13px] text-slate-500 dark:text-white/60">{t('projects.detail.overview.signed')}</td>
                        <td className="text-right">{yesNo(signed)}</td>
                    </tr>
                    <tr>
                        <td className="text-[13px] text-slate-500 dark:text-white/60">{t('common.date')}</td>
                        <td className="whitespace-nowrap text-right font-mono font-semibold tabular-nums text-slate-900 dark:text-white">
                            {latest ? dayjs(latest).format('DD.MM.YYYY') : '-'}
                        </td>
                    </tr>
                </tbody>
            </table>
        </SectionCard>
    );
});
