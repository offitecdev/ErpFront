import { memo, useMemo } from 'react';
import dayjs from 'dayjs';

import { Card } from '@/components/ui-shared/Card';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { TotalRow } from '../../common/TotalRow';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { displayExpenseType, money } from '../../../utils/projectFormatters';

export const CostsTab = memo(({ project, order, isPrimary }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; onSaved: () => Promise<void> }) => {
    const expenses = useMemo(
        () => scopedRecords(project.expenses, order, isPrimary, project.salesOrders),
        [project.expenses, project.salesOrders, order, isPrimary],
    );
    const expenseTotal = useMemo(
        () => expenses.reduce((sum: number, expense: any) => sum + (Number(expense.amount) || 0), 0),
        [expenses],
    );

    return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2 space-y-4">
            <Card title={t('auto.harici_giderler')} noPadding>
                {expenses.length === 0 ? (
                    <div className="px-4 py-8 text-center text-[12px] text-slate-900">{t('auto.gider_yok')}</div>
                ) : (
                    <div className="divide-y divide-slate-100">
                        {expenses.map((expense: any) => (
                            <div key={expense.id} className="grid grid-cols-[minmax(0,1fr)_150px] items-start gap-4 px-4 py-3">
                                <div className="min-w-0">
                                    <div className="font-medium text-slate-800">{displayExpenseType(expense.expenseType)}</div>
                                    <div className="text-[11.5px] text-slate-900">{dayjs(expense.expenseDate).format('DD.MM.YYYY')}</div>
                                    {expense.description && <div className="mt-1 text-[12px] text-slate-900">{expense.description}</div>}
                                </div>
                                <div className="text-right font-mono text-[12.5px] font-semibold text-slate-800">{money(expense.amount)}</div>
                            </div>
                        ))}
                    </div>
                )}
            </Card>
        </div>
        <div>
            <div className="rounded-md border border-slate-200/70 bg-white p-4">
                <div className="text-[12px] font-semibold text-slate-700">{t('auto.harici_gider_toplami')}</div>
                <div className="mt-3 space-y-2 text-[12.5px]">
                    <TotalRow label={t('common.total')} value={expenseTotal} total />
                </div>
            </div>
        </div>
    </div>
    );
});
