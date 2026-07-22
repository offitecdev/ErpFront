import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { Clipboard as ClipboardPenLine, Receipt as ReceiptText } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { scopedRecords } from '../../../utils/projectOrderScope';
import { expenseTypeVisual } from '../../../utils/expenseTypeVisuals';
import { groupRecordsByReport } from '../../../utils/reportGrouping';
import { displayExpenseType, displayOperationsDone, money } from '../../../utils/projectFormatters';

// Each expense type carries its own icon + tint so the rows are distinguishable
// instead of reading as one uniform block of text.
const ExpenseRow = ({ expense }: { expense: any }) => {
    const visual = expenseTypeVisual(expense.expenseType);
    return (
        <div className="grid grid-cols-[minmax(0,1fr)_130px] items-center gap-4 px-4 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
                <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${visual.chip}`}>
                    {visual.icon}
                </span>
                <div className="min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="truncate text-[12.5px] font-semibold text-slate-800">{displayExpenseType(expense.expenseType)}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{dayjs(expense.expenseDate).format('DD.MM.YYYY')}</span>
                    </div>
                    {expense.description && <div className="truncate text-[11.5px] text-slate-500">{expense.description}</div>}
                </div>
            </div>
            <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">{money(expense.amount)}</div>
        </div>
    );
};

const GroupHeader = ({ title, subtitle, total }: { title: string; subtitle?: string; total: number }) => (
    <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
            <ClipboardPenLine size={13} className="shrink-0 text-slate-400" />
            <div className="min-w-0">
                <span className="text-[12px] font-semibold text-slate-800">{title}</span>
                {subtitle && <span className="ml-2 truncate text-[11px] text-slate-400">{subtitle}</span>}
            </div>
        </div>
        <span className="shrink-0 font-mono text-[12px] font-semibold text-slate-700">{money(total)}</span>
    </div>
);

// External costs organized hierarchically under the field report they were
// recorded with. When no field report exists yet, the tab says exactly that —
// costs are entered through field reports — instead of a misleading "no expenses".
export const CostsTab = memo(({
    project,
    order,
    isPrimary,
    onGoFieldReports,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    isPrimary: boolean;
    onGoFieldReports: () => void;
}) => {
    const reports = useMemo(
        () => scopedRecords(project.reports, order, isPrimary, project.salesOrders),
        [project.reports, project.salesOrders, order, isPrimary],
    );
    const expenses = useMemo(
        () => scopedRecords(project.expenses, order, isPrimary, project.salesOrders),
        [project.expenses, project.salesOrders, order, isPrimary],
    );
    const { groups, unassigned } = useMemo(
        () => groupRecordsByReport(reports, expenses as any[], (expense: any) => expense.expenseDate),
        [reports, expenses],
    );
    const expenseTotal = useMemo(
        () => (expenses as any[]).reduce((sum, expense) => sum + (Number(expense.amount) || 0), 0),
        [expenses],
    );

    if (!reports.length && !expenses.length) {
        return (
            <EmptyState
                icon={<ReceiptText size={28} />}
                title={t('projects.detail.noFieldReportsTitle')}
                description={t('projects.detail.costsComeFromReports')}
                action={(
                    <Button variant="primary" size="sm" onClick={onGoFieldReports}>
                        {t('projects.detail.goFieldReports')}
                    </Button>
                )}
            />
        );
    }

    const groupTotal = (items: any[]) => items.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

    return (
        <div className="space-y-3">
            {groups.map((group) => {
                    const report = group.report;
                    return (
                        <div key={group.key} className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
                            <GroupHeader
                                title={`${dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')} · ${t('projects.fieldReport')}`}
                                subtitle={report.operationsDone ? displayOperationsDone(report.operationsDone) : undefined}
                                total={groupTotal(group.items)}
                            />
                            {group.items.length === 0 ? (
                                <div className="px-4 py-3 text-[11.5px] text-slate-400">{t('projects.detail.reportNoExpenses')}</div>
                            ) : (
                                <div className="divide-y divide-slate-100">
                                    {group.items.map((expense: any) => <ExpenseRow key={expense.id} expense={expense} />)}
                                </div>
                            )}
                        </div>
                    );
                })}
            {unassigned.length > 0 && (
                <div className="overflow-hidden rounded-lg border border-slate-200/70 bg-white">
                    <GroupHeader title={t('projects.detail.unassignedGroup')} total={groupTotal(unassigned)} />
                    <div className="divide-y divide-slate-100">
                        {unassigned.map((expense: any) => <ExpenseRow key={expense.id} expense={expense} />)}
                    </div>
                </div>
            )}
            {/* Grand total, aligned with the group amount column like a table footer. */}
            <div className="flex items-center justify-between gap-3 rounded-lg border border-[#272f67]/20 bg-[#eef4ff] px-4 py-2.5">
                <span className="text-[12px] font-semibold text-slate-900">{t('projects.detail.totalExpenses')}</span>
                <span className="font-mono text-[13px] font-bold text-[#272f67]">{money(expenseTotal)}</span>
            </div>
        </div>
    );
});
