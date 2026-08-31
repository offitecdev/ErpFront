import { memo } from 'react';
import dayjs from 'dayjs';

import { t } from '@/i18n/translate';
import type { DeliveryReportDto } from '@/lib/api/project';

import type { ProjectDetailView } from '../../../../types/projectDetailNavigation';
import { CardLink } from './CardLink';
import { linkRow } from './linkRow';
import { OverviewCard } from './OverviewCard';
import { Chip } from './overviewChips';

const DELIVERY: ProjectDetailView = { section: 'field', subSection: 'delivery' };

/**
 * The small box under the add-on orders: does this order have a delivery report,
 * yes or no — and if so, is it signed and from when.
 *
 * It covers ONLY the selected order. An add-on order can never have a delivery
 * report: it is a billing construct created from extra work already done on its
 * parent, and the reports section is not even offered for it (see
 * `ProjectSectionRenderer`). Listing add-ons here would ask a question that
 * cannot have an answer.
 *
 * Alle drei Zeilen führen zum Übergabe-Rapport selbst — hier steht die Frage,
 * dort steht die Antwort (und das Fehlende lässt sich dort nachholen).
 */
export const DeliveryStatusBox = memo(({ reports, onNavigate }: {
    reports: DeliveryReportDto[];
    onNavigate: (view: ProjectDetailView) => void;
}) => {
    const exists = reports.length > 0;
    const signed = reports.some((report) => report.isSigned);
    // The newest report is the one that speaks for the order.
    const latest = reports
        .map((report) => report.createdAt)
        .sort((a, b) => dayjs(b).valueOf() - dayjs(a).valueOf())[0];

    const yesNoText = (value: boolean) => (value ? t('common.yes') : t('common.no'));
    const yesNo = (value: boolean) => (
        <Chip tone={value ? 'active' : 'passive'}>{yesNoText(value)}</Chip>
    );
    const shownDate = latest ? dayjs(latest).format('DD.MM.YYYY') : '-';
    const open = () => onNavigate(DELIVERY);
    const title = t('projects.detail.overview.deliveryTitle');

    return (
        <OverviewCard title={title} action={<CardLink label={title} onOpen={open} />}>
            <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                <tbody>
                    <tr {...linkRow(open, `${t('projects.flow.deliveryReport')}: ${yesNoText(exists)}`)}>
                        <td className="ofi-prj-key">{t('projects.flow.deliveryReport')}</td>
                        <td className="text-right">{yesNo(exists)}</td>
                    </tr>
                    <tr {...linkRow(open, `${t('projects.detail.overview.signed')}: ${yesNoText(signed)}`)}>
                        <td className="ofi-prj-key">{t('projects.detail.overview.signed')}</td>
                        <td className="text-right">{yesNo(signed)}</td>
                    </tr>
                    <tr {...linkRow(open, `${t('common.date')}: ${shownDate}`)}>
                        <td className="ofi-prj-key">{t('common.date')}</td>
                        <td className="ofi-prj-num">{shownDate}</td>
                    </tr>
                </tbody>
            </table>
        </OverviewCard>
    );
});
