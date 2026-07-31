import { useEffect, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { File05 as FilePdf, FileDownload02 as FileDown } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { deliveryReportApi, projectApi, type DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectSalesOrder } from '@/types/project';

import { PdfView } from './PdfView';
import { ReportsSheet } from './ReportsSheet';
import { orderPayloadId } from '../../../utils/projectOrderScope';

type PdfDoc = { title: string; build: () => Promise<Blob | null> };

/**
 * "Reports" popup for the selected order: every report stacked vertically —
 * daily field reports, delivery report(s), the general report. Each row has a
 * PDF glyph that slides the document in inside the SAME sheet, plus a
 * download. Documents are generated from a freshly fetched full project graph
 * so images and signatures are always included.
 */
export const OrderReportsSheet = ({
    open,
    project,
    order,
    onClose,
}: {
    open: boolean;
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    onClose: () => void;
}) => {
    const [deliveries, setDeliveries] = useState<DeliveryReportDto[]>([]);
    const [loading, setLoading] = useState(false);
    const [busyKey, setBusyKey] = useState<string | null>(null);
    const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
    const [anim, setAnim] = useState<'right' | 'left' | 'rise'>('rise');

    const salesOrderId = orderPayloadId(order);
    const fieldReports = ((project as any).reports || [])
        .filter((r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId)
        .sort((a: any, b: any) => dayjs(b.workDate || b.reportDate).valueOf() - dayjs(a.workDate || a.reportDate).valueOf());

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        setLoading(true);
        setPdfDoc(null);
        setAnim('rise');
        deliveryReportApi.list({ projectId: project.id })
            .then((rows) => {
                if (cancelled) return;
                setDeliveries(rows.filter((row) => !salesOrderId || (row.salesOrderId || null) === salesOrderId));
            })
            .catch(() => { if (!cancelled) setDeliveries([]); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [open, project.id, salesOrderId]);

    // Full graph (report images + signatures) fetched per document.
    const fullProject = () => projectApi.getById(project.id, 'generalReport');

    const fieldPdf = (report: any, output: 'download' | 'blob') => async () => {
        const [{ exportFieldReportPdf }, full] = await Promise.all([import('@/utils/pdf/fieldReportPdf'), fullProject()]);
        const fullReport = ((full as any).reports || []).find((r: any) => r.id === report.id) || report;
        const appointment = (full.appointments || []).find((a: any) => a.id === fullReport.appointmentId) || null;
        return (await exportFieldReportPdf(full, fullReport, { appointment, output })) || null;
    };

    const deliveryPdf = (report: DeliveryReportDto, output: 'download' | 'blob') => async () => {
        const [{ exportDeliveryReportPdf }, full] = await Promise.all([import('@/utils/pdf/deliveryReportPdf'), fullProject()]);
        const fieldImages = ((full as any).reports || [])
            .filter((r: any) => !report.salesOrderId || (r.salesOrderId || null) === report.salesOrderId)
            .flatMap((r: any) => (Array.isArray(r.images) ? r.images : []))
            .filter((img: any) => img?.imageData)
            .map((img: any) => ({ imageData: img.imageData }));
        return (await exportDeliveryReportPdf({ report, project: full, fieldImages, output })) || null;
    };

    const generalPdf = (output: 'download' | 'blob') => async () => {
        const [{ exportProjectGeneralReportPdf }, full] = await Promise.all([import('@/utils/pdf/projectReportPdf'), fullProject()]);
        return (await exportProjectGeneralReportPdf(full, { output })) || null;
    };

    const openPdf = (doc: PdfDoc) => {
        setAnim('right');
        setPdfDoc(doc);
    };
    const closePdf = () => {
        setAnim('left');
        setPdfDoc(null);
    };

    const runDownload = async (key: string, job: () => Promise<unknown>) => {
        setBusyKey(key);
        try {
            await job();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || t('projects.pdf_olusturulamadi'));
        } finally {
            setBusyKey(null);
        }
    };

    const Row = ({ id, title, subtitle, signed, view, download }: {
        id: string;
        title: string;
        subtitle?: string;
        signed?: boolean;
        view: PdfDoc;
        download: () => Promise<unknown>;
    }) => (
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-b-0 dark:border-white/10">
            <div className="min-w-0">
                <div className="truncate text-[12.5px] font-medium text-slate-800">{title}</div>
                {subtitle && <div className="text-[11px] text-slate-500">{subtitle}</div>}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                {signed !== undefined && (
                    <StatusChip variant={signed ? 'active' : 'warning'}>
                        {signed ? t('projects.reportsHub.signed') : t('projects.reportsHub.unsigned')}
                    </StatusChip>
                )}
                <button
                    type="button"
                    title={t('projects.reportsHub.preview')}
                    aria-label={t('projects.reportsHub.preview')}
                    onClick={() => openPdf(view)}
                    className="ofi-rs-pdf inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors"
                >
                    <FilePdf size={14} />
                </button>
                <button
                    type="button"
                    title={t('projects.delivery.download')}
                    aria-label={t('projects.delivery.download')}
                    disabled={busyKey === id}
                    onClick={() => void runDownload(id, download)}
                    className="ofi-rs-pdf inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors disabled:opacity-40"
                >
                    <FileDown size={14} />
                </button>
            </div>
        </div>
    );

    const Group = ({ title, children, empty }: { title: string; children?: React.ReactNode; empty?: boolean }) => (
        <section className="overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
            <header className="border-b border-slate-200 bg-slate-50/70 px-3 py-1.5 text-[12px] font-semibold text-slate-700 dark:border-white/10 dark:bg-white/5">{title}</header>
            {empty ? <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('projects.reportsHub.noReports')}</div> : children}
        </section>
    );

    return (
        <ReportsSheet
            open={open}
            title={t('projects.reportsHub.orderReports')}
            subtitle={pdfDoc ? pdfDoc.title : (order?.orderNumber || project.projectName || undefined)}
            onBack={pdfDoc ? closePdf : undefined}
            onClose={onClose}
        >
            <div key={pdfDoc ? 'pdf' : `list-${anim}`} className={`flex min-h-0 flex-1 flex-col ${pdfDoc ? 'ofi-slide-in-right' : anim === 'left' ? 'ofi-slide-in-left' : 'ofi-rise-in'}`}>
                {pdfDoc ? (
                    <PdfView build={pdfDoc.build} />
                ) : (
                    <div className="space-y-3 p-4">
                        {loading && <div className="h-24 animate-pulse rounded-[3px] bg-slate-100 dark:bg-white/10" />}

                        <Group title={t('projects.reportsHub.fieldSection')} empty={fieldReports.length === 0}>
                            {fieldReports.map((report: any) => (
                                <Row
                                    key={report.id}
                                    id={`field-${report.id}`}
                                    title={dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')}
                                    subtitle={`${dayjs(report.startedAt).format('HH:mm')} – ${dayjs(report.endedAt).format('HH:mm')}`}
                                    signed={Boolean(report.isSigned)}
                                    view={{ title: `${t('projects.reportsHub.fieldSection')} · ${dayjs(report.workDate || report.reportDate).format('DD.MM.YYYY')}`, build: fieldPdf(report, 'blob') }}
                                    download={fieldPdf(report, 'download')}
                                />
                            ))}
                        </Group>

                        <Group title={t('projects.reportsHub.deliverySection')} empty={!loading && deliveries.length === 0}>
                            {deliveries.map((report) => (
                                <Row
                                    key={report.id}
                                    id={`delivery-${report.id}`}
                                    title={report.checklistName || t('projects.delivery.pdf.title')}
                                    subtitle={dayjs(report.sentAt || report.createdAt).format('DD.MM.YYYY HH:mm')}
                                    signed={Boolean(report.isSigned)}
                                    view={{ title: report.checklistName || t('projects.reportsHub.deliverySection'), build: deliveryPdf(report, 'blob') }}
                                    download={() => deliveryPdf(report, 'download')()}
                                />
                            ))}
                        </Group>

                        <Group title={t('projects.reportsHub.generalSection')} empty={fieldReports.length === 0}>
                            {fieldReports.length > 0 && (
                                <Row
                                    id="general"
                                    title={t('projects.reportsHub.generalSection')}
                                    subtitle={t('projects.reportsHub.reportCount', { count: fieldReports.length })}
                                    view={{ title: t('projects.reportsHub.generalSection'), build: generalPdf('blob') }}
                                    download={() => generalPdf('download')()}
                                />
                            )}
                        </Group>
                    </div>
                )}
            </div>
        </ReportsSheet>
    );
};
