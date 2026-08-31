import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { BillingStatusChip } from '@/components/billing/BillingStatusChip';
import { Receipt as ReceiptText } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { CostList } from '../../common/CostList';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import type { calculateTotals } from '../../../utils/projectTotals';

/**
 * Der ANGELEGTE Zusatzauftrag von innen: woraus er besteht.
 *
 * Gleiches Kleid wie die Rechnung und wie die Seite, auf der er entsteht
 * (19.08.2026): Kopfkarte mit Nummernmarke und Verrechnungsstand, darunter die
 * Kostenarten als EINE Zahlenspalte — die drei Beträge und die Summe fluchten,
 * statt in einem grauen Kasten mit gelber Summenpille zu stehen.
 */
export const AddonOrderOverview = memo(({ project, order, isPrimary, totals }: { project: ProjectDto; order: ProjectSalesOrder; isPrimary: boolean; totals: ReturnType<typeof calculateTotals> }) => {
    const materialRows = useMemo(
        () => scopedRecords(project.extraMaterials, order, isPrimary, project.salesOrders).map((item: any) => ({
            id: item.id,
            title: item.material?.name || item.article?.name || t('auto.malzeme'),
            meta: `${numberFmt(item.quantity)} ${t('auto.adet_x')} ${money(item.unitPrice)}`,
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

    // Die Zahlen kommen aus derselben Auftragsabgrenzung wie die Listen darunter,
    // die Anzahl direkt aus ihnen — Spalte und Liste können nicht auseinanderlaufen.
    const costRows = [
        { key: 'material', label: t('auto.malzeme'), count: materialRows.length, amount: totals.extraMaterials },
        { key: 'expense', label: t('auto.harici_gider'), count: expenseRows.length, amount: totals.expenses },
        { key: 'overtime', label: t('auto.15_uzeri_fazla_calisma'), count: overtimeRows.length, amount: totals.overtime },
    ];
    const total = costRows.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);

    return (
        <div className="ofi-inv-scope space-y-4">
            <section className="ofi-inv-card">
                <header className="ofi-inv-card__head">
                    <span className="ofi-inv-card__title">
                        <ReceiptText size={14} />
                        <span className="truncate">{t('auto.ek_siparis')}</span>
                        <span className="ofi-inv-chip">{order.orderNumber}</span>
                    </span>
                    {!order.id.startsWith('project-main-') && (
                        <div className="ofi-inv-card__actions">
                            <BillingStatusChip salesOrderId={order.id} />
                        </div>
                    )}
                </header>
                <div className="ofi-inv-card__body">
                    <table data-inv-table data-unstyled-table data-no-col-resize className="w-full">
                        <thead>
                            <tr>
                                <th className="text-left">{t('common.type')}</th>
                                <th className="w-32 text-right">{t('projects.recordUnitMany')}</th>
                                <th className="w-40 text-right">{t('projects.detail.colAmount')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {costRows.map((row) => (
                                <tr key={row.key}>
                                    <td><span className="ofi-inv-name">{row.label}</span></td>
                                    <td className="ofi-inv-num ofi-inv-muted">{row.count}</td>
                                    <td className="ofi-inv-num">{money(Number(row.amount) || 0)}</td>
                                </tr>
                            ))}
                            <tr className="ofi-inv-total">
                                <td><span className="ofi-inv-name">{t('common.total')}</span></td>
                                <td className="ofi-inv-num ofi-inv-muted">{materialRows.length + expenseRows.length + overtimeRows.length}</td>
                                <td className="ofi-inv-num is-strong">{money(total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                <CostList title={t('auto.malzeme_ayrintilari')} empty={t('auto.malzeme_yok')} rows={materialRows} />
                <CostList title={t('auto.harici_gider_ayrintilari')} empty={t('auto.gider_yok')} rows={expenseRows} />
                <CostList title={t('auto.15_uzeri_fazla_calisma')} empty={t('auto.fazla_calisma_yok')} rows={overtimeRows} />
            </div>
        </div>
    );
});
