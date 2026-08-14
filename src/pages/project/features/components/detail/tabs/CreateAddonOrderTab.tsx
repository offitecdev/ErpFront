import { memo, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { AlertTriangle, Receipt as ReceiptText, X } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { Card } from '@/components/ui-shared/Card';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { InfoCard } from '../../common/InfoCard';
import { TotalRow } from '../../common/TotalRow';
import { getOrderRecordDate } from '../../../utils/projectOrderScope';
import { getPendingAddonRequests } from '../../../utils/projectTotals';
import { money } from '../../../utils/projectFormatters';

export const CreateAddonOrderTab = memo(({
    project,
    order,
    orders,
    canCreate,
    onCreated,
    onChanged,
}: {
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    orders: ProjectSalesOrder[];
    canCreate: boolean;
    onCreated: (orderId: string) => Promise<void>;
    onChanged: () => void | Promise<void>;
}) => {
    const [loading, setLoading] = useState(false);
    const [dismissingId, setDismissingId] = useState<string | null>(null);
    // Single memo over all the addon scoping/aggregation so the filters, sort and
    // reduces only re-run when the project or the order selection actually changes.
    const {
        parentOrder, pendingRequests, latestAddon, nextOrderNumber,
        pendingExpenses, pendingExtraMaterials, pendingReports,
        expenseTotal, materialTotal, overtimeTotal, total,
    } = useMemo(() => {
        const parentOrder = order?.parentSalesOrderId
            ? orders.find((candidate) => candidate.id === order.parentSalesOrderId) || null
            : order;
        const pendingRequests = getPendingAddonRequests(project, order, orders);
        const addons = parentOrder
            ? orders
                .filter((candidate) => candidate.parentSalesOrderId === parentOrder.id)
                .sort((a, b) => dayjs(a.createdAt).valueOf() - dayjs(b.createdAt).valueOf())
            : [];
        const latestAddon = addons[addons.length - 1] || null;
        const start = latestAddon ? dayjs(latestAddon.createdAt).valueOf() : null;
        const nextOrderNumber = parentOrder ? `${parentOrder.orderNumber}-N${addons.length + 1}` : '-';
        const afterLatestAddon = (record: any) => {
            if (!parentOrder || record.salesOrderId !== parentOrder.id) return false;
            if (start === null) return true;
            const rawDate = getOrderRecordDate(record);
            return rawDate ? dayjs(rawDate).valueOf() > start : false;
        };
        const pendingExpenses = (project.expenses || []).filter(afterLatestAddon);
        const pendingExtraMaterials = (project.extraMaterials || []).filter(afterLatestAddon);
        const pendingReports = (project.reports || []).filter(afterLatestAddon);
        const expenseTotal = pendingExpenses.reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
        const materialTotal = pendingExtraMaterials.reduce((sum: number, item: any) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
        const overtimeTotal = pendingReports.reduce((sum: number, item: any) => sum + Number(item.overtimeCost || 0), 0);
        const total = expenseTotal + materialTotal + overtimeTotal;
        return {
            parentOrder, pendingRequests, latestAddon, nextOrderNumber,
            pendingExpenses, pendingExtraMaterials, pendingReports,
            expenseTotal, materialTotal, overtimeTotal, total,
        };
    }, [project, order, orders]);

    if (!parentOrder) {
        return <EmptyState icon={<ReceiptText size={28} />} title={t('auto.siparis_secin')} description={t('auto.ek_siparis_olusturmak_icin_once_sol_menuden_bir_')} />;
    }

    const recordCount = (count: number) => `${count} ${t(count === 1 ? 'projects.recordUnitOne' : 'projects.recordUnitMany')}`;

    return (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            {pendingRequests.length > 0 && (
                <div className="xl:col-span-3 space-y-2 rounded-md border border-amber-200 bg-amber-50 p-4">
                    <div className="flex items-center gap-2 text-[12.5px] font-semibold text-amber-800">
                        <AlertTriangle size={15} />
                        <span>{t('projects.addonRequestPending')}</span>
                    </div>
                    {pendingRequests.map((request) => (
                        <div key={request.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-200 bg-white px-3 py-2">
                            <div className="min-w-0">
                                <div className="text-[12.5px] font-semibold text-slate-800">
                                    {t('projects.addonRequestBy', { name: request.requestedByName || t('projects.teknisyen') })}
                                </div>
                                <div className="mt-0.5 text-[11.5px] text-slate-500">
                                    {dayjs(request.createdAt).format('DD.MM.YYYY HH:mm')} · {money(request.total)}
                                    {request.note ? ` · ${request.note}` : ''}
                                </div>
                            </div>
                            <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                icon={<X size={13} />}
                                loading={dismissingId === request.id}
                                onClick={async () => {
                                    setDismissingId(request.id);
                                    try {
                                        await projectApi.resolveAddonRequest(request.id, 'DISMISSED');
                                        await onChanged();
                                    } catch (e: any) {
                                        toast.error(e.response?.data?.error || t('projects.addonRequestDismissFailed'));
                                    } finally {
                                        setDismissingId(null);
                                    }
                                }}
                            >{t('projects.addonRequestDismiss')}</Button>
                        </div>
                    ))}
                </div>
            )}
            <Card title={t('auto.ek_siparis_olustur')} icon={<ReceiptText size={13} />} className="xl:col-span-2">
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <InfoCard title={t('auto.bagli_siparis')} rows={[
                        [t('auto.ana_siparis'), parentOrder.orderNumber],
                        [t('auto.yeni_ek_siparis'), nextOrderNumber],
                        [t('auto.onceki_ek_siparis'), latestAddon?.orderNumber ? latestAddon.orderNumber : '-'],
                    ]} />
                    <InfoCard title={t('auto.alinacak_maliyetler')} rows={[
                        [t('auto.harici_gider'), `${recordCount(pendingExpenses.length)} / ${money(expenseTotal)}`],
                        [t('auto.ek_malzeme'), `${recordCount(pendingExtraMaterials.length)} / ${money(materialTotal)}`],
                        [t('auto.ek_iscilik'), `${recordCount(pendingReports.filter((report: any) => Number(report.overtimeCost) > 0).length)} / ${money(overtimeTotal)}`],
                        [t('common.total'), money(total)],
                    ]} />
                </div>
                {!canCreate && (
                    <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">{t('auto.ek_siparis_olusturma_yetkiniz_yok')}</div>
                )}
                <Button
                    className="mt-4"
                    variant="primary"
                    loading={loading}
                    disabled={!canCreate || total <= 0}
                    icon={<ReceiptText size={13} />}
                    onClick={async () => {
                        setLoading(true);
                        try {
                            const res = await projectApi.createAddonOrder(project.id, { parentSalesOrderId: parentOrder.id });
                            toast.success(res.message ||t('auto.ek_siparis_olusturuldu'));
                            await onCreated(res.salesOrder.id);
                        } catch (e: any) {
                            toast.error(e.response?.data?.error ||t('auto.ek_siparis_olusturulamadi'));
                        } finally {
                            setLoading(false);
                        }
                    }}
                >
                    {nextOrderNumber}{t('common.create')}</Button>
            </Card>
            <div className="rounded-md border border-slate-200/70 bg-white p-4">
                <div className="text-[12px] font-semibold text-slate-700">{t('auto.ek_siparis_toplami')}</div>
                <div className="mt-3 space-y-2 text-[12.5px]">
                    <TotalRow label={t('auto.harici_gider')} value={expenseTotal} />
                    <TotalRow label={t('auto.ek_malzeme')} value={materialTotal} />
                    <TotalRow label={t('auto.ek_iscilik')} value={overtimeTotal} />
                    <TotalRow label={t('common.total')} value={total} total />
                </div>
            </div>
        </div>
    );
});
