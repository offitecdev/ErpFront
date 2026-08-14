import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { BillingStatusChip } from '@/components/billing/BillingStatusChip';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { CostList } from '../../common/CostList';
import { TotalRow } from '../../common/TotalRow';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import type { calculateTotals } from '../../../utils/projectTotals';

export const AddonOrderOverview = memo(({ project, order, isPrimary, totals }: { project: ProjectDto; order: ProjectSalesOrder; isPrimary: boolean; totals: ReturnType<typeof calculateTotals> }) => {
    const materialRows = useMemo(
        () => scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders).map((item: any) => ({
            id: item.id,
            title: item.material?.name || item.article?.name || t('auto.malzeme'),
            meta: `${numberFmt(item.quantity)} adet x ${money(item.unitPrice)}`,
            amount: (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0),
            note: item.description,
        })),
        [project.extraMaterials, project.salesOrders, order, isPrimary],
    );
    const expenseRows = useMemo(
        () => scopedRecords(project.expenses, order, isPrimary, project.salesOrders).map((expense: any) => ({
            id: expense.id,
            title: displayExpenseType(expense.expenseType),
            meta: dayjs(expense.expenseDate).format('DD.MM.YYYY'),
            amount: expense.amount,
            note: expense.description,
        })),
        [project.expenses, project.salesOrders, order, isPrimary],
    );
    const overtimeRows = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders)
            .filter((report: any) => Number(report.overtimeCost) > 0)
            .map((report: any) => ({
                id: report.id,
                title: dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY'),
                meta: `${durationFmt(Number(report.overtimeMinutes || 0))} x ${money(report.overtimeHourlyRate)}`,
                amount: Number(report.overtimeCost) || 0,
                note: report.operationsDone,
            })),
        [project.reports, project.salesOrders, order, isPrimary],
    );

    return (
        <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <div className="text-[11px] font-semibold uppercase text-slate-500">{t('auto.ek_siparis')}</div>
                    <div className="mt-1 text-[20px] font-bold text-slate-950">{order.orderNumber}</div>
                </div>
                {!order.id.startsWith('project-main-') && (
                    <div className="flex flex-col items-end gap-1">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{t('projects.flow.billing')}</span>
                        <BillingStatusChip salesOrderId={order.id} />
                    </div>
                )}
            </div>
            <div className="max-w-xl rounded-md border border-slate-200/70 bg-slate-50/50 p-4">
                <div className="space-y-3 text-[13px]">
                    <TotalRow label={t('auto.malzeme')} value={totals.extraMaterials} />
                    <TotalRow label={t('auto.harici_gider')} value={totals.expenses} />
                    <TotalRow label={t('auto.15_uzeri_fazla_calisma')} value={totals.overtime} />
                </div>
            </div>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <CostList title={t('auto.malzeme_ayrintilari')} empty={t('auto.malzeme_yok')} rows={materialRows} />
                <CostList title={t('auto.harici_gider_ayrintilari')} empty={t('auto.gider_yok')} rows={expenseRows} />
                <CostList title={t('auto.15_uzeri_fazla_calisma')} empty={t('auto.fazla_calisma_yok')} rows={overtimeRows} />
            </div>
        </div>
    );
});
