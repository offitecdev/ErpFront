import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, Clipboard, File05 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { MontageReportOrderDetailDto, MontageReportOrderListItem } from '@/types/project';
import { ReportsSheet } from '@/pages/project/features/components/detail/reports/ReportsSheet';

import { BigButton } from './BigButton';

const reportReference = (prefix: 'GR' | 'DR', id?: string | null) =>
    id ? `${prefix}-${id.replace(/-/g, '').slice(0, 8).toUpperCase()}` : '—';

export const ReportOrderSheet = ({
    order,
    onClose,
}: {
    order: MontageReportOrderListItem | null;
    onClose: () => void;
}) => {
    const navigate = useNavigate();
    const [detail, setDetail] = useState<MontageReportOrderDetailDto | null>(null);
    const [loading, setLoading] = useState(false);
    const orderId = order?.salesOrderId || null;

    useEffect(() => {
        setDetail(null);
        if (!orderId) return;
        let cancelled = false;
        setLoading(true);
        projectApi.getMyMontageReportOrder(orderId)
            .then((data) => {
                if (!cancelled) setDetail(data);
            })
            .catch((error: any) => {
                if (!cancelled) toast.error(error.response?.data?.error || t('montage.reports.emptyHint'));
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [orderId]);

    if (!order) return null;

    const openDelivery = () => {
        if (detail?.deliveryReport) {
            onClose();
            navigate(`/montage/reports/view/delivery/${detail.deliveryReport.id}`);
            return;
        }
        if (!detail?.order.projectId || !detail.createAppointmentId) return;
        onClose();
        navigate(`/montage/reports/delivery/${detail.order.projectId}?appointmentId=${encodeURIComponent(detail.createAppointmentId)}`);
    };

    const openGeneral = () => {
        if (detail?.generalReport) {
            onClose();
            navigate(`/montage/reports/view/general/${detail.generalReport.id}`);
            return;
        }
        if (!detail?.createAppointmentId) return;
        onClose();
        navigate(`/montage/reports/general/${detail.createAppointmentId}`);
    };

    return (
        <ReportsSheet
            open={Boolean(order)}
            title={order.orderNumber}
            subtitle={`${order.customerName} · ${order.projectName}`}
            onClose={onClose}
            zIndex={85}
        >
            <div className="flex min-h-full flex-col px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
                {loading ? (
                    <div className="flex min-h-64 flex-1 items-center justify-center gap-2 text-[13px] text-slate-500">
                        <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                        {t('common.loading')}
                    </div>
                ) : detail ? (
                    <div className="space-y-7">
                        <dl className="grid overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 dark:border-white/10 dark:bg-white/[0.03]">
                            {[
                                [t('montage.table.order'), detail.order.orderNumber],
                                [t('montage.table.customer'), detail.order.customerName],
                                [t('montage.table.project'), detail.order.projectName],
                            ].map(([label, value]) => (
                                <div key={label} className="min-w-0 border-b border-slate-200 px-5 py-4 last:border-b-0 sm:border-b-0 sm:border-r sm:last:border-r-0 dark:border-white/10">
                                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
                                    <dd className="mt-1 truncate text-[13.5px] font-semibold text-slate-800 dark:text-slate-100">{value || '—'}</dd>
                                </div>
                            ))}
                        </dl>

                        <section className="overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]" data-unstyled-table>
                            <div className="border-b border-slate-200 px-5 py-3 text-[12px] font-bold uppercase tracking-wide text-[#1f2654] dark:border-white/10 dark:text-amber-300">
                                {t('montage.reportPicker.title')}
                            </div>
                            <div className="overflow-x-auto">
                                <table data-montage-table data-unstyled-table className="min-w-[760px] text-left">
                                    <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                                        <tr>
                                            <th>{t('montage.reportPicker.type')}</th>
                                            <th>{t('montage.reportPicker.number')}</th>
                                            <th>{t('montage.table.status')}</th>
                                            <th className="w-[260px]">{t('montage.reportPicker.action')}</th>
                                        </tr>
                                    </thead>
                                    <tbody className="dark:[&_td]:border-white/10">
                                        <tr>
                                            <td className="font-semibold text-slate-900 dark:text-slate-50">{t('projects.reportsHub.generalSection')}</td>
                                            <td className="font-mono text-[12.5px] text-slate-600 dark:text-slate-300">{reportReference('GR', detail.generalReport?.id)}</td>
                                            <td>
                                                <span className={detail.generalReport ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}>
                                                    {detail.generalReport ? t('projects.reportAvailable') : t('projects.reportUnavailable')}
                                                </span>
                                            </td>
                                            <td>
                                                <BigButton
                                                    tone="brand"
                                                    className="w-full"
                                                    icon={detail.generalReport ? <CheckCircle size={16} /> : <File05 size={16} />}
                                                    onClick={openGeneral}
                                                    disabled={!detail.generalReport && !detail.createAppointmentId}
                                                >
                                                    {detail.generalReport ? t('projects.reportsHub.reviewGeneral') : t('projects.reportsHub.createGeneral')}
                                                </BigButton>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td className="font-semibold text-slate-900 dark:text-slate-50">{t('projects.reportsHub.deliverySection')}</td>
                                            <td className="font-mono text-[12.5px] text-slate-600 dark:text-slate-300">{reportReference('DR', detail.deliveryReport?.id)}</td>
                                            <td>
                                                <span className={detail.deliveryReport ? 'font-semibold text-emerald-700 dark:text-emerald-300' : 'text-slate-400'}>
                                                    {detail.deliveryReport ? t('projects.reportAvailable') : t('projects.reportUnavailable')}
                                                </span>
                                            </td>
                                            <td>
                                                <BigButton
                                                    tone="brand"
                                                    className="w-full"
                                                    icon={detail.deliveryReport ? <CheckCircle size={16} /> : <Clipboard size={16} />}
                                                    onClick={openDelivery}
                                                    disabled={!detail.deliveryReport && (!detail.order.projectId || !detail.createAppointmentId)}
                                                >
                                                    {detail.deliveryReport ? t('projects.reportsHub.reviewDelivery') : t('projects.reportsHub.createDelivery')}
                                                </BigButton>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        </section>
                    </div>
                ) : null}
            </div>
        </ReportsSheet>
    );
};
