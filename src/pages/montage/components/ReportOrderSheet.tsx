import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

import { CheckCircle, ChevronRight, Clipboard, File05, X } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import type { MontageReportOrderDetailDto, MontageReportOrderListItem } from '@/types/project';
import { localizeTenderNumbersInText } from '@/utils/tenderNumber';

import { BigButton } from './BigButton';
import { dateFmt, timeRange } from '../utils/montageFormat';

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

    return createPortal(
        <div className="fixed inset-0 z-[85] flex items-end justify-center px-2 sm:px-4">
            <button type="button" aria-label={t('common.close')} onClick={onClose} className="absolute inset-0 bg-slate-950/45" />
            <section
                role="dialog"
                aria-modal="true"
                className="relative flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-t-[14px] border border-slate-200 bg-white shadow-2xl dark:border-white/10 dark:bg-[#17191c]"
            >
                <header className="flex items-start justify-between gap-3 bg-[#1f2654] px-4 py-3.5 text-white dark:bg-amber-500">
                    <div className="min-w-0">
                        <div className="truncate text-[16px] font-bold">{localizeTenderNumbersInText(order.orderNumber)}</div>
                        <div className="mt-0.5 truncate text-[12px] text-white/75">
                            {order.customerName} · {order.projectName}
                        </div>
                    </div>
                    <button type="button" onClick={onClose} aria-label={t('common.close')} className="grid size-10 shrink-0 place-items-center rounded-[3px] bg-white/12 hover:bg-white/20">
                        <X size={19} />
                    </button>
                </header>

                <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
                    {loading ? (
                        <div className="flex h-48 items-center justify-center gap-2 text-[13px] text-slate-500">
                            <span className="size-5 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-t-amber-500" />
                            {t('common.loading')}
                        </div>
                    ) : detail ? (
                        <div className="space-y-4">
                            <section className="rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]">
                                <div className="border-b border-slate-200 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-[#1f2654] dark:border-white/10 dark:text-amber-300">
                                    Rapor oluştur
                                </div>
                                <div className="grid gap-2 p-3 sm:grid-cols-2">
                                    <BigButton
                                        tone="brand"
                                        icon={detail.deliveryReport ? <CheckCircle size={16} /> : <Clipboard size={16} />}
                                        onClick={openDelivery}
                                        disabled={!detail.deliveryReport && (!detail.order.projectId || !detail.createAppointmentId)}
                                    >
                                        {detail.deliveryReport ? 'Teslim raporu' : 'Teslim raporu oluştur'}
                                    </BigButton>
                                    <BigButton
                                        tone="brand"
                                        icon={detail.generalReport ? <CheckCircle size={16} /> : <File05 size={16} />}
                                        onClick={openGeneral}
                                        disabled={!detail.generalReport && !detail.createAppointmentId}
                                    >
                                        {detail.generalReport ? 'Genel rapor' : 'Genel rapor oluştur'}
                                    </BigButton>
                                </div>
                            </section>

                            <section className="overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-white/[0.03]" data-unstyled-table>
                                <div className="border-b border-slate-200 px-3 py-2 text-[12px] font-bold uppercase tracking-wide text-[#1f2654] dark:border-white/10 dark:text-amber-300">
                                    Tüm saha raporları
                                </div>
                                <table data-montage-table data-unstyled-table className="min-w-[680px] text-left">
                                    <thead className="dark:[&_th]:border-white/10 dark:[&_th]:bg-white/5 dark:[&_th]:text-slate-300">
                                        <tr>
                                            <th>Randevu</th>
                                            <th>{t('projects.teknisyen')}</th>
                                            <th>{t('montage.table.status')}</th>
                                            <th className="w-14" />
                                        </tr>
                                    </thead>
                                    <tbody className="dark:[&_td]:border-white/10">
                                        {detail.fieldReports.map((report) => (
                                            <tr
                                                key={report.id}
                                                onClick={() => {
                                                    onClose();
                                                    navigate(`/montage/reports/view/field/${report.id}`);
                                                }}
                                                className="cursor-pointer hover:bg-slate-50 dark:hover:bg-white/5"
                                            >
                                                <td>
                                                    <span className="font-semibold text-slate-900 dark:text-slate-50">
                                                        {dateFmt(report.appointment?.startTime || report.workDate || report.reportDate)}
                                                    </span>
                                                    {report.appointment && (
                                                        <span className="ml-2 text-slate-500">
                                                            {timeRange(report.appointment.startTime, report.appointment.endTime)}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-slate-600 dark:text-slate-300">
                                                    {[report.employee?.firstName, report.employee?.lastName].filter(Boolean).join(' ') || '-'}
                                                </td>
                                                <td>
                                                    <span className={report.isSigned
                                                        ? 'text-[11px] font-semibold text-emerald-700 dark:text-emerald-300'
                                                        : 'text-[11px] font-semibold text-[#d30f15] dark:text-amber-300'}
                                                    >
                                                        {report.isSigned ? t('projects.delivery.statusSigned') : t('projects.delivery.statusUnsigned')}
                                                    </span>
                                                </td>
                                                <td className="text-right">
                                                    <span className="inline-grid size-8 place-items-center rounded-[3px] bg-[#1f2654] text-white dark:bg-amber-500">
                                                        <ChevronRight size={16} />
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </section>
                        </div>
                    ) : null}
                </div>
            </section>
        </div>,
        document.body,
    );
};
