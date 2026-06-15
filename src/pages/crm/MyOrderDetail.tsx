import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft as ArrowLeftOutlined } from '../../components/icons/antIconCompat';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { BillingButton } from '../../components/billing/BillingButton';
import { BillingProgressChart } from '../../components/billing/BillingProgressChart';
import { myOrdersApi } from '../../lib/api/billing';
import type { MyOrderDetailDto } from '../../types/billing';

import { t } from '@/i18n/translate';

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '-');

const billingChipColor = (remaining: number) =>
    remaining <= 0 ? 'bg-emerald-600' : remaining >= 100 ? 'bg-amber-500' : 'bg-sky-600';
const billingChipLabel = (billed: number, remaining: number) =>
    remaining <= 0 ?t('crm.billed') : remaining >= 100 ?t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(billed) });

const BillingChip = ({ billed, remaining }: { billed: number; remaining: number }) => (
    <span className={`inline-flex items-center whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold text-white shadow-xs ${billingChipColor(remaining)}`}>
        {billingChipLabel(billed, remaining)}
    </span>
);

export const MyOrderDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<MyOrderDetailDto | null>(null);
    const [loading, setLoading] = useState(true);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            setOrder(await myOrdersApi.getById(id));
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.orders.errorLoad'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    if (loading) {
        return <div className="h-72 animate-pulse rounded-xl border border-slate-100 bg-slate-50" />;
    }

    if (!order) {
        return (
            <Card>
                <EmptyState title={t('crm.order_not_found')} description={t('crm.order_missing_or_no_access')} />
            </Card>
        );
    }

    const summary = order.billingSummary;
    const remaining = summary?.remainingPercent ?? 100;
    const cost = order.costSummary;
    const phases = order.project?.phases || [];
    const reports = order.reports || [];
    const addons = order.addonSalesOrders || [];

    return (
        <div>
            <PageHeader
                breadcrumb={t('crm.breadcrumb_my_orders')}
                title={order.orderNumber}
                description={order.customer?.companyName || ''}
                actions={
                    <div className="flex items-center gap-2">
                        <Button variant="ghost" size="md" icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/my-orders')}>{t('common.back')}</Button>
                        <BillingButton
                            target={{ type: 'order', id: order.id, label: t('crm.order_label', { number: order.orderNumber }) }}
                            onBilled={() => void load()}
                            size="md"
                            variant="primary"
                        />
                    </div>
                }
            />

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
                {/* Billing status */}
                <Card title={t('crm.billing_durumu')}>
                    <div className="flex items-center gap-4">
                        <BillingProgressChart percent={summary?.billedPercent ?? 0} size={120} />
                        <div className="flex-1 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('common.status')}</span>
                                <BillingChip billed={summary?.billedPercent ?? 0} remaining={remaining} />
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('common.total')}</span>
                                <span className="font-semibold text-primary">{fmtMoney(summary?.baseAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('billing.billed')}</span>
                                <span className="font-semibold text-emerald-600">{fmtMoney(summary?.billedAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('billing.remaining')}</span>
                                <span className="font-semibold text-amber-600">{fmtMoney(summary?.remainingAmount)}</span>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Project info */}
                <Card title={t('crm.project_info')}>
                    {order.project ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('nav.projects')}</span>
                                <span className="font-medium text-primary">{order.project.projectName}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('common.status')}</span>
                                <span className="font-medium text-primary">{order.project.status}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('common.start')}</span>
                                <span className="font-medium text-primary">{fmtDate(order.project.startDate)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('crm.planned_budget')}</span>
                                <span className="font-medium text-primary">{fmtMoney(order.project.plannedBudget)}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-tertiary">{t('crm.order_not_linked_to_project')}</p>
                    )}
                </Card>

                {/* Cost summary */}
                <Card title={t('crm.cost_summary')}>
                    {cost ? (
                        <div className="space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('crm.order_amount')}</span>
                                <span className="font-medium text-primary">{fmtMoney(cost.orderAmount)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('crm.external_expenses')}</span>
                                <span className="font-medium text-primary">{fmtMoney(cost.expensesTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('crm.additional_materials')}</span>
                                <span className="font-medium text-primary">{fmtMoney(cost.extraMaterialsTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('nav.attendance')}</span>
                                <span className="font-medium text-primary">{fmtMoney(cost.overtimeTotal)}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-tertiary">{t('crm.additional_orders')}</span>
                                <span className="font-medium text-primary">{fmtMoney(cost.addonTotal)}</span>
                            </div>
                            <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
                                <span className="font-semibold text-secondary">{t('crm.general_total')}</span>
                                <span className="font-semibold text-[#272f67]">{fmtMoney(cost.grandTotal)}</span>
                            </div>
                        </div>
                    ) : (
                        <p className="text-sm text-tertiary">{t('crm.cost_info_not_found')}</p>
                    )}
                </Card>
            </div>

            {/* Additional orders */}
            <div className="mt-4">
                <Card title={t('crm.additional_orders_count', { count: addons.length })} noPadding>
                    {addons.length === 0 ? (
                        <div className="p-6">
                            <EmptyState title={t('crm.additional_order_not_found')} description={t('crm.bu_order_icin_additional_order_bulunmuyor')} />
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {addons.map((addon) => {
                                const aRemaining = addon.billingSummary?.remainingPercent ?? 100;
                                return (
                                    <div key={addon.id} className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50/80 active:bg-slate-100">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-primary">{addon.orderNumber}</span>
                                                {addon.revisionNumber ? (
                                                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">N{addon.revisionNumber}</span>
                                                ) : null}
                                                <BillingChip billed={addon.billingSummary?.billedPercent ?? 0} remaining={aRemaining} />
                                            </div>
                                            <div className="mt-0.5 text-xs text-tertiary">{fmtDate(addon.createdAt)} · {fmtMoney(addon.totalAmount)}</div>
                                        </div>
                                        <BillingButton
                                            target={{ type: 'order', id: addon.id, label: t('crm.additional_order_label', { number: addon.orderNumber }) }}
                                            onBilled={() => void load()}
                                            size="sm"
                                            variant="secondary"
                                        />
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </Card>
            </div>

            {/* Assembly phases */}
            {phases.length > 0 && (
                <div className="mt-4">
                    <Card title={t('crm.installation_steps')}>
                        <div className="space-y-3">
                            {phases.map((phase) => (
                                <div key={phase.id}>
                                    <div className="mb-1 flex items-center justify-between text-sm">
                                        <span className="text-secondary">{phase.phaseName}</span>
                                        <span className="font-medium text-primary">%{Math.round(phase.progressPercentage)}</span>
                                    </div>
                                    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                        <div
                                            className="h-full rounded-full bg-[#272f67]"
                                            style={{ width: `${Math.max(0, Math.min(100, phase.progressPercentage))}%` }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* Assembly timeline (field reports) */}
            <div className="mt-4">
                <Card title={t('crm.field_reports_installation_history')}>
                    {reports.length === 0 ? (
                        <EmptyState title={t('crm.report_not_found')} description={t('crm.no_field_report_for_order')} />
                    ) : (
                        <ol className="relative space-y-4 border-l border-slate-200 pl-5">
                            {reports.map((report) => (
                                <li key={report.id} className="relative">
                                    <span className="absolute -left-[1.45rem] top-1 size-2.5 rounded-full bg-[#272f67]" />
                                    <div className="flex items-center justify-between">
                                        <span className="text-sm font-medium text-primary">{fmtDate(report.workDate)}</span>
                                        {report.isSigned && <StatusChip variant="active">{t('crm.imzalandi')}</StatusChip>}
                                    </div>
                                    <div className="mt-0.5 text-xs text-tertiary">
                                        {report.employee ? `${report.employee.firstName} ${report.employee.lastName}` : ''}
                                        {report.overtimeMinutes > 0 ? ` · ${t('crm.overtime_minutes', { minutes: report.overtimeMinutes, amount: fmtMoney(report.overtimeCost) })}` : ''}
                                    </div>
                                    {report.operationsDone && (
                                        <p className="mt-1 whitespace-pre-line text-sm text-secondary">{report.operationsDone}</p>
                                    )}
                                </li>
                            ))}
                        </ol>
                    )}
                </Card>
            </div>
        </div>
    );
};
