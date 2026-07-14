import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft as ArrowLeftOutlined, CheckCircle, XClose } from '../../components/icons/antIconCompat';
import dayjs from 'dayjs';
import { PageHeader } from '../../components/layout/PageHeader';
import { Card } from '../../components/ui-shared/Card';
import { Button } from '../../components/ui-shared/Button';
import { Modal } from '../../components/ui-shared/Modal';
import { StatusChip } from '../../components/ui-shared/StatusBadge';
import { EmptyState } from '../../components/ui-shared/EmptyState';
import { BillingButton } from '../../components/billing/BillingButton';
import { BillingProgressChart } from '../../components/billing/BillingProgressChart';
import { myOrdersApi } from '../../lib/api/billing';
import { deliveryReportApi, signatureApi, type DeliveryReportDto, type SignatureRequestDto } from '../../lib/api/project';
import type { MyOrderDetailDto } from '../../types/billing';

import { t } from '@/i18n/translate';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

const fmtMoney = (v?: number | null) =>
    typeof v === 'number'
        ? new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v)
        : '-';

const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '-');
const clampPercent = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

// Solid status chips, matching the shared StatusChip used across the other
// modules (no translucent "glass" tints).
const billingChipVariant = (remaining: number): 'active' | 'warning' | 'info' =>
    remaining <= 0 ? 'active' : remaining >= 100 ? 'warning' : 'info';
const billingChipLabel = (billed: number, remaining: number) =>
    remaining <= 0 ?t('crm.billed') : remaining >= 100 ?t('crm.faturalanmadi') : t('crm.partially_billed', { percent: Math.round(billed) });

const BillingChip = ({ billed, remaining }: { billed: number; remaining: number }) => (
    <StatusChip variant={billingChipVariant(remaining)}>
        {billingChipLabel(billed, remaining)}
    </StatusChip>
);

type TabKey = 'addons' | 'quotation' | 'billing';

interface StageItem { label: string; meta?: string; done: boolean }
interface Stage { key: string; label: string; completed: boolean; items: StageItem[] }

// Compact stage checkbox chip, shown top-right in the page header so the
// completion state is visible at a glance for everyone.
const StageBar = ({ stage, onOpen }: { stage: Stage; onOpen: () => void }) => (
    <button
        type="button"
        onClick={onOpen}
        title={stage.label}
        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 transition-colors ${
            stage.completed
                ? 'border-[#059669]/30 bg-[#059669]/5 hover:bg-[#059669]/10'
                : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/70'
        }`}
    >
        {stage.completed
            ? <CheckCircle size={15} className="shrink-0 text-[#059669]" />
            : <span className="size-3 shrink-0 rounded-full border-2 border-slate-300" />}
        <span className="whitespace-nowrap text-[11px] font-semibold uppercase tracking-wide text-slate-600">{stage.label}</span>
    </button>
);

const StageDetailModal = ({ stage, onClose }: { stage: Stage; onClose: () => void }) => {
    const done = stage.items.filter((i) => i.done);
    const pending = stage.items.filter((i) => !i.done);
    const Row = ({ item }: { item: StageItem }) => (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2">
            {item.done
                ? <CheckCircle size={15} className="shrink-0 text-[#059669]" />
                : <XClose size={15} className="shrink-0 text-amber-500" />}
            <div className="min-w-0 flex-1">
                <div className="truncate text-[12.5px] font-medium text-slate-800">{item.label}</div>
                {item.meta && <div className="truncate text-[11px] text-slate-400">{item.meta}</div>}
            </div>
        </div>
    );
    return (
        <Modal open onClose={onClose} title={stage.label} description={t('projects.complete.details')} width="md" footer={<Button variant="primary" onClick={onClose}>{t('projects.complete.close')}</Button>}>
            {stage.items.length === 0 ? (
                <EmptyState title={t('projects.complete.noRecords')} />
            ) : (
                <div className="space-y-4">
                    <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#059669]">{t('projects.complete.completedLabel')} · {done.length}</div>
                        <div className="space-y-1.5">
                            {done.length === 0 ? <div className="text-[12px] text-slate-400">{t('projects.complete.noRecords')}</div> : done.map((item, i) => <Row key={i} item={item} />)}
                        </div>
                    </div>
                    <div>
                        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-amber-600">{t('projects.complete.incompleteLabel')} · {pending.length}</div>
                        <div className="space-y-1.5">
                            {pending.length === 0 ? <div className="text-[12px] text-slate-400">{t('projects.complete.noRecords')}</div> : pending.map((item, i) => <Row key={i} item={item} />)}
                        </div>
                    </div>
                </div>
            )}
        </Modal>
    );
};

const TabBar = ({ tab, onSelect, orderCount }: { tab: TabKey; onSelect: (t: TabKey) => void; orderCount: number }) => {
    const tabs: Array<{ key: TabKey; label: string; badge?: number }> = [
        { key: 'addons', label: t('nav.myOrders'), badge: orderCount },
        { key: 'quotation', label: t('projects.complete.tabQuotation') },
        { key: 'billing', label: t('projects.complete.tabBilling') },
    ];
    return (
        <div className="mb-4 flex flex-wrap gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1.5">
            {tabs.map((tb) => (
                <button
                    key={tb.key}
                    type="button"
                    onClick={() => onSelect(tb.key)}
                    className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
                        tab === tb.key ? 'bg-[#272f67] text-white shadow-sm' : 'text-slate-600 hover:bg-white hover:text-slate-900'
                    }`}
                >
                    {tb.label}
                    {tb.badge ? (
                        <span className={`rounded px-1.5 py-px text-[10px] font-bold ${tab === tb.key ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-700'}`}>{tb.badge}</span>
                    ) : null}
                </button>
            ))}
        </div>
    );
};

export const MyOrderDetail = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [order, setOrder] = useState<MyOrderDetailDto | null>(null);
    const [deliveryReports, setDeliveryReports] = useState<DeliveryReportDto[]>([]);
    const [generalSignatures, setGeneralSignatures] = useState<SignatureRequestDto[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<TabKey>('addons');
    const [activeStage, setActiveStage] = useState<Stage | null>(null);

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const [detail, deliveries, generals] = await Promise.all([
                myOrdersApi.getById(id),
                deliveryReportApi.list({ salesOrderId: id }).catch(() => [] as DeliveryReportDto[]),
                signatureApi.list('GENERAL').catch(() => [] as SignatureRequestDto[]),
            ]);
            setOrder(detail);
            setDeliveryReports(deliveries);
            setGeneralSignatures(generals);
        } catch (e: any) {
            toast.error(e.response?.data?.error ||t('crm.orders.errorLoad'));
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        void load();
    }, [load]);

    const stages = useMemo<Stage[]>(() => {
        if (!order) return [];
        const summary = order.billingSummary;
        const reports = order.reports || [];
        const projectGenerals = generalSignatures.filter((s) => s.projectId === order.project?.id);

        // Quotation: the order exists because its quotation was approved.
        const quotation: Stage = {
            key: 'quotation',
            label: t('projects.complete.stageQuotation'),
            completed: true,
            items: [{ label: localizeTenderNumbersInText(order.orderNumber), meta: t('projects.complete.approved'), done: true }],
        };

        // Field reports — only signed reports count toward completion.
        const fieldSigned = reports.filter((r) => r.isSigned).length;
        const fieldReport: Stage = {
            key: 'fieldReport',
            label: t('projects.complete.stageFieldReport'),
            completed: fieldSigned > 0,
            items: reports.map((r) => ({
                label: fmtDate(r.workDate),
                meta: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : undefined,
                done: r.isSigned,
            })),
        };

        // General report — completed once a general signature is SIGNED.
        const generalSigned = projectGenerals.filter((s) => s.status === 'SIGNED').length;
        const generalReport: Stage = {
            key: 'generalReport',
            label: t('projects.complete.stageGeneralReport'),
            completed: generalSigned > 0,
            items: projectGenerals.map((s) => ({ label: s.title || fmtDate(s.createdAt), meta: s.status, done: s.status === 'SIGNED' })),
        };

        // Delivery reports — only signed reports count toward completion.
        const deliverySigned = deliveryReports.filter((r) => r.isSigned).length;
        const deliveryReport: Stage = {
            key: 'deliveryReport',
            label: t('projects.complete.stageDeliveryReport'),
            completed: deliverySigned > 0,
            items: deliveryReports.map((r) => ({ label: r.checklistName || (r.orderNumber ? localizeTenderNumbersInText(r.orderNumber) : fmtDate(r.createdAt)), meta: r.isSigned ? t('projects.complete.signedLabel') : t('projects.complete.unsignedLabel'), done: r.isSigned })),
        };

        // Billing.
        const billing: Stage = {
            key: 'billing',
            label: t('projects.complete.stageBilling'),
            completed: (summary?.billedPercent ?? 0) >= 100,
            items: (summary?.invoices || []).map((inv) => ({
                label: inv.invoiceNumber,
                meta: `${clampPercent(inv.billedPercent)}% · ${fmtMoney(inv.amount)}`,
                done: inv.status !== 'CANCELLED',
            })),
        };

        return [quotation, fieldReport, generalReport, deliveryReport, billing];
    }, [order, deliveryReports, generalSignatures]);

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
                title={localizeTenderNumbersInText(order.orderNumber)}
                description={order.customer?.companyName || ''}
                actions={
                    <div className="flex flex-col items-end gap-2">
                        {/* Stage checkboxes — top-right so completion state is
                            immediately visible; click for completed/incomplete detail. */}
                        <div className="flex flex-wrap justify-end gap-1.5">
                            {stages.map((stage) => (
                                <StageBar key={stage.key} stage={stage} onOpen={() => setActiveStage(stage)} />
                            ))}
                        </div>
                        {/* Invoicing happens from the "My Orders" list below, not the header. */}
                        <Button variant="ghost" size="md" icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/my-orders')}>{t('common.back')}</Button>
                    </div>
                }
            />

            <TabBar tab={tab} onSelect={setTab} orderCount={addons.length + 1} />

            {tab === 'addons' && (
                <Card title={t('nav.myOrders')} noPadding>
                    <div className="divide-y divide-slate-100">
                        {/* Main order first — navy tint sets it apart from the amber addon rows. */}
                        <div className="flex items-center justify-between gap-3 bg-[#272f67]/[0.04] px-4 py-3 transition-colors hover:bg-[#272f67]/[0.08]">
                            <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-semibold text-primary">{localizeTenderNumbersInText(order.orderNumber)}</span>
                                    <span className="whitespace-nowrap rounded bg-[#272f67]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#272f67]">{t('projects.mainOrder')}</span>
                                    <BillingChip billed={summary?.billedPercent ?? 0} remaining={remaining} />
                                </div>
                                <div className="mt-0.5 text-xs text-tertiary">{fmtDate(order.createdAt)} · {fmtMoney(order.totalAmount)}</div>
                            </div>
                            <BillingButton
                                target={{ type: 'order', id: order.id, label: t('crm.order_label', { number: localizeTenderNumbersInText(order.orderNumber) }) }}
                                onBilled={() => void load()}
                                size="sm"
                                variant="primary"
                                remainingPercent={remaining}
                            />
                        </div>
                        {addons.map((addon) => {
                            const aRemaining = addon.billingSummary?.remainingPercent ?? 100;
                            return (
                                <div key={addon.id} className="flex items-center justify-between gap-3 bg-amber-400/10 px-4 py-3 transition-colors hover:bg-amber-400/20">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-primary">{localizeTenderNumbersInText(addon.orderNumber)}</span>
                                            <span className="whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">{t('projects.addonOrder')}</span>
                                            {addon.revisionNumber ? (
                                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">N{addon.revisionNumber}</span>
                                            ) : null}
                                            <BillingChip billed={addon.billingSummary?.billedPercent ?? 0} remaining={aRemaining} />
                                        </div>
                                        <div className="mt-0.5 text-xs text-tertiary">{fmtDate(addon.orderDate || addon.createdAt)} · {fmtMoney(addon.totalAmount)}</div>
                                    </div>
                                    <BillingButton
                                        target={{ type: 'order', id: addon.id, label: t('crm.additional_order_label', { number: localizeTenderNumbersInText(addon.orderNumber) }) }}
                                        onBilled={() => void load()}
                                        size="sm"
                                        variant="secondary"
                                        remainingPercent={aRemaining}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </Card>
            )}

            {tab === 'quotation' && (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                        <Card title={t('crm.project_info')}>
                            {order.project ? (
                                <div className="space-y-2 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-tertiary">{t('nav.projects')}</span>
                                        <span className="font-medium text-primary">{localizeTenderNumbersInText(order.project.projectName)}</span>
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

                    {phases.length > 0 && (
                        <Card title={t('crm.installation_steps')}>
                            <div className="space-y-3">
                                {phases.map((phase) => (
                                    <div key={phase.id}>
                                        <div className="mb-1 flex items-center justify-between text-sm">
                                            <span className="text-secondary">{phase.phaseName}</span>
                                            <span className="font-medium text-primary">%{Math.round(phase.progressPercentage)}</span>
                                        </div>
                                        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
                                            <div className="h-full rounded-full bg-[#272f67]" style={{ width: `${clampPercent(phase.progressPercentage)}%` }} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}

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
            )}

            {tab === 'billing' && (
                <div className="space-y-4">
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

                    <Card title={t('projects.complete.stageBilling')} noPadding>
                        {(summary?.invoices || []).length === 0 ? (
                            <div className="p-6"><EmptyState title={t('projects.complete.noRecords')} /></div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {(summary?.invoices || []).map((inv) => (
                                    <div key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
                                        <div className="min-w-0">
                                            <div className="font-semibold text-primary">{inv.invoiceNumber}</div>
                                            <div className="mt-0.5 text-xs text-tertiary">{fmtDate(inv.createdAt)} · {clampPercent(inv.billedPercent)}%</div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono text-sm font-semibold text-primary">{fmtMoney(inv.amount)}</span>
                                            <StatusChip variant={inv.status === 'CANCELLED' ? 'passive' : inv.status === 'PAID' ? 'active' : 'info'}>{inv.status}</StatusChip>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {activeStage && <StageDetailModal stage={activeStage} onClose={() => setActiveStage(null)} />}
        </div>
    );
};
