import { memo } from 'react';
import type React from 'react';

import { SectionCard } from '@/components/ui-shared/TableKit';
import { t } from '@/i18n/translate';
import type { BillingSummaryDto } from '@/types/billing';
import type { DeliveryReportDto } from '@/lib/api/project';

import { money } from '../../../../utils/projectFormatters';
import { DeliveryChip, TechnicalChip } from './overviewChips';
import { orderDeliveryState, orderTechnicalState } from './overviewShared';

type Row = { label: string; value: React.ReactNode; strong?: boolean };

/**
 * What the selected order is worth and where it stands — label left, figure
 * right, one row each. Who it is for and when it runs is already in the header
 * row above, so this table stays short enough for a narrow column.
 */
export const OrderSummaryTable = memo(({
    total,
    summary,
    deliveryRows,
}: {
    total: number;
    summary: BillingSummaryDto | null;
    deliveryRows: DeliveryReportDto[];
}) => {
    const billed = Number(summary?.billedAmount) || 0;
    // Without a billing summary (synthetic main order) the whole amount is open.
    const unbilled = summary ? Number(summary.remainingAmount) || 0 : Math.max(0, total - billed);

    // Lieferschein und technischer Bericht stehen VOR den Rechnungszahlen
    // (Benutzerwunsch): erst ist die Arbeit erledigt, dann wird verrechnet.
    const rows: Row[] = [
        { label: t('projects.flow.deliveryReport'), value: <DeliveryChip state={orderDeliveryState(deliveryRows)} /> },
        { label: t('projects.detail.colTechnical'), value: <TechnicalChip state={orderTechnicalState(deliveryRows)} /> },
        { label: t('projects.detail.colAmount'), value: money(total), strong: true },
        {
            label: t('billing.billed'),
            value: <span className="text-[#059669] dark:text-[#8fd0ae]">{money(billed)}</span>,
            strong: true,
        },
        { label: t('projects.detail.overview.unbilled'), value: money(unbilled), strong: true },
    ];

    return (
        <SectionCard title={t('projects.detail.overview.orderSummary')}>
            <table data-inv-table data-grid-lines data-unstyled-table className="ofi-compact-table w-full">
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label}>
                            <td className="text-[13px] text-slate-500 dark:text-white/60">{row.label}</td>
                            <td className={`text-right ${row.strong ? 'font-mono font-semibold tabular-nums text-slate-900 dark:text-white' : 'text-slate-800 dark:text-white/90'}`}>
                                {row.value}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </SectionCard>
    );
});
