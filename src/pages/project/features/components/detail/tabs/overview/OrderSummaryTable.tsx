import { memo } from 'react';
import type React from 'react';

import { t } from '@/i18n/translate';
import type { BillingSummaryDto } from '@/types/billing';
import type { DeliveryReportDto } from '@/lib/api/project';

import type { ProjectDetailView } from '../../../../types/projectDetailNavigation';
import { money } from '../../../../utils/projectFormatters';
import { linkRow } from './linkRow';
import { OverviewCard } from './OverviewCard';
import { DeliveryChip, TechnicalChip } from './overviewChips';
import {
    deliveryStateLabel,
    orderDeliveryState,
    orderTechnicalState,
    technicalStateLabel,
} from './overviewShared';

type Row = {
    label: string;
    value: React.ReactNode;
    /** Was die Zeile SAGT, wenn sie vorgelesen wird — Beschriftung und Wert. */
    spoken: string;
    strong?: boolean;
    billed?: boolean;
    /** Wo diese Angabe zu Hause ist — die Zeile führt dorthin. */
    goes: ProjectDetailView;
};

/**
 * What the selected order is worth and where it stands — label left, figure
 * right, one row each. Who it is for and when it runs is already in the header
 * row above, so this table stays short enough for a narrow column.
 *
 * JEDE ZEILE FÜHRT DORTHIN, WO DIE ANGABE HERKOMMT (19.08.2026): der
 * Lieferschein zum Rapport, der technische Stand zu den Montage-Rapporten, der
 * Betrag zu den Positionen, Verrechnet und Offen zur Rechnungsstellung. Eine
 * Zusammenfassung ist erst dann eine, wenn man von ihr aus weiterkommt — sonst
 * liest man sie und sucht das Gleiche noch einmal im Menü.
 */
export const OrderSummaryTable = memo(({
    total,
    summary,
    deliveryRows,
    onNavigate,
}: {
    total: number;
    summary: BillingSummaryDto | null;
    deliveryRows: DeliveryReportDto[];
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const billed = Number(summary?.billedAmount) || 0;
    // Without a billing summary (synthetic main order) the whole amount is open.
    const unbilled = summary ? Number(summary.remainingAmount) || 0 : Math.max(0, total - billed);

    // Lieferschein und technischer Bericht stehen VOR den Rechnungszahlen
    // (Benutzerwunsch): erst ist die Arbeit erledigt, dann wird verrechnet.
    const deliveryState = orderDeliveryState(deliveryRows);
    const technicalState = orderTechnicalState(deliveryRows);
    const says = (label: string, value: string) => `${label}: ${value}`;

    const rows: Row[] = [
        {
            label: t('projects.flow.deliveryReport'),
            value: <DeliveryChip state={deliveryState} />,
            spoken: says(t('projects.flow.deliveryReport'), deliveryStateLabel(deliveryState)),
            goes: { section: 'field', subSection: 'delivery' },
        },
        {
            label: t('projects.detail.colTechnical'),
            value: <TechnicalChip state={technicalState} />,
            spoken: says(t('projects.detail.colTechnical'), technicalStateLabel(technicalState)),
            goes: { section: 'field', subSection: 'fieldReports' },
        },
        {
            label: t('projects.detail.colAmount'),
            value: money(total),
            spoken: says(t('projects.detail.colAmount'), money(total)),
            strong: true,
            goes: { section: 'positions' },
        },
        {
            label: t('billing.billed'),
            value: money(billed),
            spoken: says(t('billing.billed'), money(billed)),
            strong: true,
            billed: true,
            goes: { section: 'billing' },
        },
        {
            label: t('projects.detail.overview.unbilled'),
            value: money(unbilled),
            spoken: says(t('projects.detail.overview.unbilled'), money(unbilled)),
            strong: true,
            goes: { section: 'billing' },
        },
    ];

    return (
        <OverviewCard title={t('projects.detail.overview.orderSummary')}>
            <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.label} {...linkRow(() => onNavigate(row.goes), row.spoken)}>
                            <td className="ofi-prj-key">{row.label}</td>
                            <td className={row.strong ? `ofi-prj-num${row.billed ? ' is-billed' : ''}` : 'text-right'}>
                                {row.value}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </OverviewCard>
    );
});
