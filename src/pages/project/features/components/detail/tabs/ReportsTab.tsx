import { memo, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard, Edit01 as PenLine, File05 as FilePdf } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { ColResizeHandle, ResizableCols } from '@/components/ui-shared/TableKit';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { t } from '@/i18n/translate';
import { deliveryReportApi, projectApi, type DeliveryReportDto } from '@/lib/api/project';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AllSignaturesSheet } from '../reports/AllSignaturesSheet';
import { AppointmentReportSheet } from '../reports/AppointmentReportSheet';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { findAppointmentReport } from '../../../utils/projectAppointments';

/**
 * The consolidated "Reports" section: appointments in two clean lists (ongoing /
 * completed, tender-table styling — appointment times instead of technician
 * names, no appointment colors). Each row carries a PDF glyph (dimmed until a
 * field report exists); clicking a row opens the square bottom-sheet where the
 * whole flow — field report, delivery checklist, signatures, PDFs — slides
 * sideways inside one popup.
 */
export const ReportsTab = memo(({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
    // Sipariş sütunu esnektir; diğerleri sürüklenerek genişletilir.
    const grid = useColumnWidths({
        storageKey: 'offitec:project-reports:col-widths:v1',
        defaults: { date: 112, time: 144, section: 160, status: 112, action: 56 },
        minPx: 56,
    });
    const [sheetInitialView, setSheetInitialView] = useState<'overview' | 'pdf' | 'delivery'>('overview');
    const [signaturesOpen, setSignaturesOpen] = useState(false);
    /** Welche Termine die eine Tabelle zeigt — laufend (Vorgabe) oder erledigt. */
    const [scope, setScope] = useState<'ongoing' | 'completed'>('ongoing');

    const appointments = useMemo(
        () => scopedRecords(project.appointments, order, isPrimary, project.salesOrders)
            .sort((a: any, b: any) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf()),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    // EINE Tabelle, zwei Ansichten (Benutzerwunsch): "Laufend" zeigt nur die
    // aktuellen Termine — der Normalfall beim Öffnen —, "Abgeschlossen" hält die
    // Historie erreichbar, ohne eine zweite Tabelle daneben zu stellen.
    const ongoing = appointments.filter((a: any) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED');
    const completed = appointments.filter((a: any) => a.status === 'COMPLETED' || a.status === 'CANCELLED');
    const rows = scope === 'ongoing' ? ongoing : completed;

    const selectedAppt = useMemo(
        () => appointments.find((a: any) => a.id === selectedApptId) || null,
        [appointments, selectedApptId],
    );

    // ── Werkzeugleisten-Knöpfe links neben "Unterschriften" (Benutzerwunsch:
    // aus dem Termin-Popup hierher gewandert). ──

    // Gesamtrapport: erst ansehbar, wenn im Auftragsumfang ein Montage-Rapport
    // existiert — dieselbe Sperre wie zuvor im Popup.
    const fieldReports = useMemo(
        () => scopedRecords(((project as any).reports || []) as any[], order, isPrimary, project.salesOrders),
        [project, order, isPrimary],
    );
    const hasFieldReports = fieldReports.length > 0;

    const [generalOpen, setGeneralOpen] = useState(false);
    const [generalBusy, setGeneralBusy] = useState(false);
    const [generalBlob, setGeneralBlob] = useState<Blob | null>(null);

    // Immer frisch gebaut — soeben gespeicherte Rapporte und Unterschriften
    // müssen bereits im Dokument stehen.
    const openGeneralPreview = async () => {
        setGeneralOpen(true);
        setGeneralBusy(true);
        setGeneralBlob(null);
        try {
            const [{ exportProjectGeneralReportPdf }, full] = await Promise.all([
                import('@/utils/pdf/projectReportPdf'),
                projectApi.getById(project.id, 'generalReport'),
            ]);
            setGeneralBlob((await exportProjectGeneralReportPdf(full, { output: 'blob' })) || null);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || e?.message || t('services.toastPdfError'));
            setGeneralOpen(false);
        } finally {
            setGeneralBusy(false);
        }
    };

    const downloadGeneral = () => {
        if (!generalBlob) return;
        const url = URL.createObjectURL(generalBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${t('projects.reportsHub.generalSection').replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };

    // Abnahme-Rapport: der Knopf öffnet das Termin-Blatt direkt auf der
    // Checkliste — beim vorhandenen Rapport auf dessen Termin, sonst auf dem
    // jüngsten Termin. Nach dem Schliessen wird neu geladen, damit die
    // Beschriftung (ansehen/erstellen) stimmt.
    const [deliveries, setDeliveries] = useState<DeliveryReportDto[]>([]);
    const [deliveryReloadKey, setDeliveryReloadKey] = useState(0);
    useEffect(() => {
        let cancelled = false;
        deliveryReportApi.list({ projectId: project.id })
            .then((rows) => { if (!cancelled) setDeliveries(rows); })
            .catch(() => { if (!cancelled) setDeliveries([]); });
        return () => { cancelled = true; };
    }, [project.id, deliveryReloadKey]);

    const latestDelivery = useMemo(
        () => scopedRecords(deliveries, order, isPrimary, project.salesOrders)
            .sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf())[0] || null,
        [deliveries, order, isPrimary, project.salesOrders],
    );
    const deliveryAppt = (latestDelivery?.appointmentId
        && appointments.find((a: any) => a.id === latestDelivery.appointmentId))
        || appointments[0]
        || null;

    const orderNumberFor = (salesOrderId: string | null | undefined) =>
        (project.salesOrders || []).find((o) => o.id === (salesOrderId || null))?.orderNumber
        || order?.orderNumber
        || '—';

    const openSheet = (appointmentId: string, view: 'overview' | 'pdf' | 'delivery') => {
        setSheetInitialView(view);
        setSelectedApptId(appointmentId);
    };

    const AppointmentTable = ({ rows }: { rows: any[] }) => (
        <table data-montage-table data-grid-lines data-unstyled-table className="w-full">
            <colgroup>
                <ResizableCols keys={['date', 'time'] as const} grid={grid} />
                {/* Sipariş sütunu: genişliği yok, kalan yeri emer. */}
                <col />
                <ResizableCols keys={['section', 'status', 'action'] as const} grid={grid} />
            </colgroup>
            <thead>
                <tr>
                    <th className="relative text-left">
                        {t('common.date')}
                        <ColResizeHandle {...grid.resizeProps('date', 'right')} />
                    </th>
                    <th className="relative text-left">
                        {t('projects.schedule.time')}
                        <ColResizeHandle {...grid.resizeProps('time', 'right')} />
                    </th>
                    <th className="text-left">{t('projects.reportsHub.order')}</th>
                    <th className="relative text-left">
                        {t('projects.reportsHub.fieldSection')}
                        <ColResizeHandle {...grid.resizeProps('section')} />
                    </th>
                    <th className="relative text-left">
                        {t('common.status')}
                        <ColResizeHandle {...grid.resizeProps('status')} />
                    </th>
                    <th className="relative text-right">
                        <ColResizeHandle {...grid.resizeProps('action')} />
                    </th>
                </tr>
            </thead>
            <tbody>
                {rows.map((appt: any) => {
                    const report = findAppointmentReport(project, appt);
                    const kind = appointmentStatusKind(appt);
                    return (
                        <tr
                            key={appt.id}
                            onClick={() => openSheet(appt.id, 'overview')}
                            className="cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-white/5"
                        >
                            <td className="text-[12.5px] font-semibold tabular-nums text-slate-800">{dayjs(appt.startTime).format('DD.MM.YYYY')}</td>
                            <td className="text-[12.5px] tabular-nums text-slate-700">{dayjs(appt.startTime).format('HH:mm')} – {dayjs(appt.endTime).format('HH:mm')}</td>
                            <td className="text-[12.5px] text-slate-600">{orderNumberFor(appt.salesOrderId)}</td>
                            <td>
                                {report
                                    ? <StatusChip variant={report.isSigned ? 'active' : 'info'}>{report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportAvailable')}</StatusChip>
                                    : <span className="text-[11.5px] text-slate-400">{t('projects.reportUnavailable')}</span>}
                            </td>
                            <td className="text-[12px] text-slate-600">{statusLabel(kind)}</td>
                            <td>
                                {/* PDF glyph: lit when a field report exists, dimmed until then. */}
                                <div className="flex items-center justify-end">
                                    <button
                                        type="button"
                                        title={report ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
                                        aria-label={t('projects.reportsHub.preview')}
                                        disabled={!report}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            openSheet(appt.id, 'pdf');
                                        }}
                                        className={`inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors ${report ? 'ofi-rs-pdf' : 'ofi-rs-pdf-dim cursor-default'}`}
                                    >
                                        <FilePdf size={14} />
                                    </button>
                                </div>
                            </td>
                        </tr>
                    );
                })}
            </tbody>
        </table>
    );

    const SectionCard = ({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) => (
        <section className="overflow-hidden rounded-[3px] border border-slate-200 bg-white dark:border-white/15 dark:bg-transparent">
            <header className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-3 py-2 dark:border-white/10 dark:bg-white/5">
                <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
                {action}
            </header>
            {children}
        </section>
    );

    return (
        <div className="space-y-4">
            {/* Toolbar: "Auftragsrapporte" ist entfallen (Benutzerwunsch) — die
                Rapporte hängen an ihren Terminen. Gesamtrapport & Abnahme-Rapport
                stehen LINKS neben "Unterschriften" (Benutzerwunsch, zuvor im
                Termin-Popup). */}
            <div className="flex flex-wrap items-center justify-end gap-1.5">
                <Button
                    variant="secondary"
                    size="sm"
                    icon={<FilePdf size={13} />}
                    disabled={!hasFieldReports}
                    title={hasFieldReports ? t('projects.reportsHub.generalSection') : t('projects.reportsHub.generalNeedsField')}
                    onClick={() => { void openGeneralPreview(); }}
                >
                    {hasFieldReports ? t('projects.reportsHub.reviewGeneral') : t('projects.reportsHub.createGeneral')}
                </Button>
                <Button
                    variant="secondary"
                    size="sm"
                    icon={<Clipboard size={13} />}
                    disabled={!deliveryAppt}
                    title={deliveryAppt ? t('projects.reportsHub.deliverySection') : t('projects.reportsHub.noAppointments')}
                    onClick={() => { if (deliveryAppt) openSheet(deliveryAppt.id, 'delivery'); }}
                >
                    {latestDelivery ? t('projects.reportsHub.reviewDelivery') : t('projects.reportsHub.createDelivery')}
                </Button>
                <Button variant="secondary" size="sm" icon={<PenLine size={13} />} onClick={() => setSignaturesOpen(true)}>
                    {t('nav.signatures')}
                </Button>
            </div>

            {appointments.length === 0 ? (
                <EmptyState title={t('projects.reportsHub.noAppointments')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
            ) : (
                <SectionCard
                    title={scope === 'ongoing' ? t('projects.reportsHub.ongoing') : t('projects.reportsHub.completed')}
                    action={(
                        <div className="flex items-center gap-1">
                            {([
                                { key: 'ongoing' as const, label: t('projects.reportsHub.ongoing'), count: ongoing.length },
                                { key: 'completed' as const, label: t('projects.reportsHub.completed'), count: completed.length },
                            ]).map((option) => (
                                <button
                                    key={option.key}
                                    type="button"
                                    onClick={() => setScope(option.key)}
                                    aria-pressed={scope === option.key}
                                    className={`rounded-[2px] border px-2 py-0.5 text-[11.5px] font-semibold transition-colors ${
                                        scope === option.key
                                            ? 'border-[#272f67] bg-[#272f67] text-white dark:border-[#e6cf9e] dark:bg-[#e6cf9e] dark:text-[#151616]'
                                            : 'border-slate-200 bg-white text-slate-500 hover:text-slate-800 dark:border-white/15 dark:bg-transparent dark:text-white/60'
                                    }`}
                                >
                                    {option.label} · {option.count}
                                </button>
                            ))}
                        </div>
                    )}
                >
                    {rows.length === 0
                        ? <div className="px-3 py-4 text-center text-[12px] text-slate-400">{t('projects.reportsHub.noAppointments')}</div>
                        : <AppointmentTable rows={rows} />}
                </SectionCard>
            )}

            {/* Sheets — everything mounts only while open, so the tab stays light. */}
            {selectedAppt && (
                <AppointmentReportSheet
                    open
                    project={project}
                    order={order}
                    appointment={selectedAppt}
                    report={findAppointmentReport(project, selectedAppt)}
                    materials={materials}
                    initialView={sheetInitialView}
                    onSaved={onSaved}
                    onClose={() => {
                        setSelectedApptId(null);
                        // Im Blatt kann ein Abnahme-Rapport entstanden sein —
                        // die Knopf-Beschriftung oben muss dann kippen.
                        setDeliveryReloadKey((key) => key + 1);
                    }}
                />
            )}
            <AllSignaturesSheet
                open={signaturesOpen}
                project={project}
                order={order}
                isPrimary={isPrimary}
                onClose={() => setSignaturesOpen(false)}
            />
            <PdfPreviewSheet
                open={generalOpen}
                title={t('projects.reportsHub.generalSection')}
                blob={generalBlob}
                loading={generalBusy}
                emptyText={t('services.toastPdfError')}
                downloadLabel={t('common.download')}
                onClose={() => setGeneralOpen(false)}
                onDownload={downloadGeneral}
            />
        </div>
    );
});
