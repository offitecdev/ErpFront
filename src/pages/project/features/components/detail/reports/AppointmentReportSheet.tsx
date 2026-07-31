import { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';

import { ArrowLeft, ArrowRight, File05 as FilePdf, Plus } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { deliveryReportApi, projectApi, type DeliveryReportDto } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AppointmentSignaturesView } from './AppointmentSignaturesView';
import { DeliveryChecklistView } from './DeliveryChecklistView';
import { FieldReportEditorView } from './FieldReportEditorView';
import { PdfView } from './PdfView';
import { ReportsSheet } from './ReportsSheet';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import { orderPayloadId } from '../../../utils/projectOrderScope';

type SheetView = 'overview' | 'field' | 'delivery' | 'signatures' | 'pdf';
type SlideDir = 'right' | 'left' | 'rise';

// The back/next walking order. The PDF stage sits outside the sequence and
// always returns to wherever it was opened from.
const SEQUENCE: SheetView[] = ['overview', 'field', 'delivery', 'signatures'];

const animClass: Record<SlideDir, string> = {
    right: 'ofi-slide-in-right',
    left: 'ofi-slide-in-left',
    rise: 'ofi-rise-in',
};

type PdfDoc = { title: string; build: () => Promise<Blob | null> };

// A label/value hairline row for the project & order reference block — fine
// gray lines instead of the appointment color.
const MetaRow = ({ label, value }: { label: string; value: React.ReactNode }) => (
    <tr>
        <td className="w-44 font-semibold text-slate-500 dark:text-white/60">{label}</td>
        <td className="text-slate-800 dark:text-white">{value}</td>
    </tr>
);

/**
 * The appointment popup of the Reports section: a large square sheet that
 * slides up from the bottom (identical animation to the planning popup) and
 * NEVER resizes — field report, delivery checklist, signatures and the PDF
 * stage slide in sideways inside it, driven by the back/next bar at the
 * bottom. The "+" buttons live in that bottom bar; every document row carries
 * a PDF glyph that opens the live document in place (dimmed while the
 * document does not exist yet).
 */
export const AppointmentReportSheet = ({
    open,
    project,
    order,
    appointment,
    report,
    materials,
    initialView = 'overview',
    onSaved,
    onClose,
}: {
    open: boolean;
    project: ProjectDto;
    order: ProjectSalesOrder | null;
    appointment: any;
    report: any | null;
    materials: ProjectMaterial[];
    /** 'pdf' opens straight onto the field report document (hub row PDF icon). */
    initialView?: 'overview' | 'pdf';
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [view, setView] = useState<SheetView>('overview');
    const [anim, setAnim] = useState<SlideDir>('rise');
    const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
    const [pdfFrom, setPdfFrom] = useState<SheetView>('overview');
    const [delivery, setDelivery] = useState<DeliveryReportDto | null>(null);

    const salesOrderId = orderPayloadId(order);
    const fieldReports = useMemo(
        () => ((project as any).reports || []).filter(
            (r: any) => !salesOrderId || (r.salesOrderId || null) === salesOrderId,
        ),
        [project, salesOrderId],
    );
    const hasFieldReports = fieldReports.length > 0;

    const kind = appointmentStatusKind(appointment);
    const start = dayjs(appointment.startTime);
    const end = dayjs(appointment.endTime);

    const go = (next: SheetView, dir: SlideDir) => {
        // Re-clicking the current view's button must not remount it (that would
        // drop unsaved editor state) — the slide only runs on a real change.
        if (next === view) return;
        setAnim(dir);
        setView(next);
    };

    // Delivery report of this appointment — needed up-front for its PDF glyph.
    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        deliveryReportApi.getByAppointment(appointment.id)
            .then((row) => { if (!cancelled) setDelivery(row); })
            .catch(() => { if (!cancelled) setDelivery(null); });
        return () => { cancelled = true; };
    }, [open, appointment.id]);

    // ── PDF builders — always from a freshly fetched full project graph, so new
    // rows and received signatures are already inside the document. ──
    const fullProject = () => projectApi.getById(project.id, 'generalReport');

    const buildFieldPdf = async () => {
        if (!report) return null;
        const [{ exportFieldReportPdf }, full] = await Promise.all([
            import('@/utils/pdf/fieldReportPdf'),
            fullProject(),
        ]);
        const fullReport = ((full as any).reports || []).find((r: any) => r.id === report.id) || report;
        return (await exportFieldReportPdf(full, fullReport, { appointment, output: 'blob' })) || null;
    };

    const buildGeneralPdf = async () => {
        const [{ exportProjectGeneralReportPdf }, full] = await Promise.all([
            import('@/utils/pdf/projectReportPdf'),
            fullProject(),
        ]);
        return (await exportProjectGeneralReportPdf(full, { output: 'blob' })) || null;
    };

    const buildDeliveryPdf = async () => {
        if (!delivery) return null;
        const [{ exportDeliveryReportPdf }, full] = await Promise.all([
            import('@/utils/pdf/deliveryReportPdf'),
            fullProject(),
        ]);
        const fieldImages = ((full as any).reports || [])
            .filter((r: any) => !delivery.salesOrderId || (r.salesOrderId || null) === delivery.salesOrderId)
            .flatMap((r: any) => (Array.isArray(r.images) ? r.images : []))
            .filter((img: any) => img?.imageData)
            .map((img: any) => ({ imageData: img.imageData }));
        return (await exportDeliveryReportPdf({ report: delivery, project: full, fieldImages, output: 'blob' })) || null;
    };

    const openPdf = (doc: PdfDoc, from: SheetView) => {
        setPdfDoc(doc);
        // Switching documents while already on the PDF stage keeps the original
        // origin, so "back" still leaves the stage instead of looping on it.
        setPdfFrom(from === 'pdf' ? pdfFrom : from);
        if (view !== 'pdf') go('pdf', 'right');
    };

    // Deep-link from the hub's row PDF glyph straight onto the document.
    useEffect(() => {
        if (!open) return;
        if (initialView === 'pdf' && report) {
            setPdfDoc({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf });
            setPdfFrom('overview');
            setView('pdf');
            setAnim('rise');
        } else {
            setView('overview');
            setAnim('rise');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // ── back / next along the fixed sequence; PDF returns to its origin. ──
    const sequenceIndex = SEQUENCE.indexOf(view === 'pdf' ? pdfFrom : view);
    const goBack = () => {
        if (view === 'pdf') return go(pdfFrom, 'left');
        if (sequenceIndex > 0) return go(SEQUENCE[sequenceIndex - 1], 'left');
    };
    const goNext = () => {
        if (view === 'pdf') return go(pdfFrom, 'left');
        if (sequenceIndex < SEQUENCE.length - 1) return go(SEQUENCE[sequenceIndex + 1], 'right');
    };
    const canBack = view === 'pdf' || sequenceIndex > 0;
    const canNext = view !== 'pdf' && sequenceIndex < SEQUENCE.length - 1;

    const viewTitles: Record<SheetView, string> = {
        overview: t('projects.reportsHub.appointmentTitle'),
        field: t('projects.reportsHub.fieldSection'),
        delivery: t('projects.reportsHub.deliverySection'),
        signatures: t('projects.reportsHub.signaturesSection'),
        pdf: pdfDoc?.title || 'PDF',
    };

    // PDF glyph next to each document row — lit when the document can be
    // rendered, dimmed (and inert) while it does not exist yet.
    const PdfGlyph = ({ available, doc }: { available: boolean; doc: PdfDoc }) => (
        <button
            type="button"
            title={available ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
            aria-label={t('projects.reportsHub.preview')}
            disabled={!available}
            onClick={(event) => {
                event.stopPropagation();
                openPdf(doc, view);
            }}
            className={`inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors ${
                available ? 'ofi-rs-pdf' : 'ofi-rs-pdf-dim cursor-default'
            }`}
        >
            <FilePdf size={14} />
        </button>
    );

    const DocumentRow = ({ title, status, available, doc, target }: {
        title: string;
        status: React.ReactNode;
        available: boolean;
        doc: PdfDoc;
        target?: SheetView;
    }) => (
        <div
            role={target ? 'button' : undefined}
            tabIndex={target ? 0 : undefined}
            onClick={target ? () => go(target, 'right') : undefined}
            onKeyDown={target ? (event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    go(target, 'right');
                }
            } : undefined}
            className={`flex items-center justify-between gap-3 border-t border-dashed border-slate-300 py-2.5 dark:border-white/15 ${target ? 'cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/5' : ''}`}
        >
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
                {status}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <PdfGlyph available={available} doc={doc} />
            </div>
        </div>
    );

    return (
        <ReportsSheet
            open={open}
            title={`${start.format('DD.MM.YYYY')} · ${start.format('HH:mm')}–${end.format('HH:mm')}`}
            subtitle={viewTitles[view]}
            onBack={canBack ? goBack : undefined}
            onClose={onClose}
            footer={(
                <>
                    <button
                        type="button"
                        disabled={!canBack}
                        onClick={goBack}
                        className="ofi-rs-nav inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-30"
                    >
                        <ArrowLeft size={13} />
                        {t('common.back')}
                    </button>

                    {/* The "+" actions live here, at the bottom of the square. */}
                    <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto">
                        <button
                            type="button"
                            onClick={() => go('field', 'right')}
                            className="ofi-rs-plus inline-flex shrink-0 items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                        >
                            <Plus size={13} />
                            {report ? t('projects.reportsHub.reviewField') : t('projects.reportsHub.createField')}
                        </button>
                        <button
                            type="button"
                            onClick={() => go('delivery', 'right')}
                            className="ofi-rs-plus inline-flex shrink-0 items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors"
                        >
                            <Plus size={13} />
                            {delivery ? t('projects.reportsHub.reviewDelivery') : t('projects.reportsHub.createDelivery')}
                        </button>
                        <button
                            type="button"
                            disabled={!hasFieldReports}
                            onClick={() => openPdf({ title: t('projects.reportsHub.generalSection'), build: buildGeneralPdf }, view)}
                            className="ofi-rs-plus inline-flex shrink-0 items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-30"
                        >
                            <Plus size={13} />
                            {hasFieldReports ? t('projects.reportsHub.reviewGeneral') : t('projects.reportsHub.createGeneral')}
                        </button>
                    </div>

                    <button
                        type="button"
                        disabled={!canNext}
                        onClick={goNext}
                        className="ofi-rs-nav inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-30"
                    >
                        {t('projects.reportsHub.next')}
                        <ArrowRight size={13} />
                    </button>
                </>
            )}
        >
            <div key={`${view}-${anim}-${view === 'pdf' ? pdfDoc?.title || '' : ''}`} className={`flex min-h-0 flex-1 flex-col ${animClass[anim]}`}>
                {view === 'overview' && (
                    <div className="space-y-4 p-4">
                        {/* Project & order reference — fine lines, no colors. */}
                        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_1px_3px_rgba(15,23,42,0.06)] dark:border-white/15 dark:bg-transparent dark:shadow-none">
                            <table data-inv-table data-unstyled-table className="w-full">
                                <tbody>
                                    <MetaRow label={t('auto.proje')} value={project.projectName || '—'} />
                                    <MetaRow label={t('projects.reportsHub.order')} value={order?.orderNumber || '—'} />
                                    <MetaRow label={t('projects.musteri')} value={project.customer?.companyName || '—'} />
                                    <MetaRow label={t('common.date')} value={start.format('DD.MM.YYYY')} />
                                    <MetaRow label={t('projects.schedule.time')} value={`${start.format('HH:mm')} – ${end.format('HH:mm')}`} />
                                    <MetaRow label={t('projects.teknisyen')} value={appointmentTechnicianNames(appointment)} />
                                    <MetaRow label={t('common.status')} value={statusLabel(kind)} />
                                </tbody>
                            </table>
                        </div>

                        {/* Documents — dashed dividers, PDF glyph per row. */}
                        <div>
                            <DocumentRow
                                title={t('projects.reportsHub.fieldSection')}
                                status={report
                                    ? <StatusChip variant={report.isSigned ? 'active' : 'info'}>{report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportAvailable')}</StatusChip>
                                    : <StatusChip variant="neutral">{t('projects.reportUnavailable')}</StatusChip>}
                                available={Boolean(report)}
                                doc={{ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }}
                                target="field"
                            />
                            <DocumentRow
                                title={t('projects.reportsHub.generalSection')}
                                status={hasFieldReports
                                    ? <StatusChip variant="info">{t('projects.reportsHub.reportCount', { count: fieldReports.length })}</StatusChip>
                                    : <span className="text-[11.5px] text-slate-400">{t('projects.reportsHub.generalNeedsField')}</span>}
                                available={hasFieldReports}
                                doc={{ title: t('projects.reportsHub.generalSection'), build: buildGeneralPdf }}
                            />
                            <DocumentRow
                                title={t('projects.reportsHub.deliverySection')}
                                status={delivery
                                    ? <StatusChip variant={delivery.isSigned ? 'active' : 'info'}>{delivery.isSigned ? t('projects.reportsHub.signed') : t('projects.reportsHub.unsigned')}</StatusChip>
                                    : <StatusChip variant="neutral">{t('projects.reportUnavailable')}</StatusChip>}
                                available={Boolean(delivery)}
                                doc={{ title: t('projects.reportsHub.deliverySection'), build: buildDeliveryPdf }}
                                target="delivery"
                            />
                            <DocumentRow
                                title={t('projects.reportsHub.signaturesSection')}
                                status={null}
                                available={false}
                                doc={{ title: '', build: async () => null }}
                                target="signatures"
                            />
                        </div>
                    </div>
                )}

                {view === 'field' && (
                    <div className="p-4">
                        <FieldReportEditorView
                            project={project}
                            order={order}
                            appointment={appointment}
                            report={report}
                            materials={materials}
                            onSaved={onSaved}
                            onBack={() => go('overview', 'left')}
                            onPreviewPdf={report ? () => openPdf({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }, 'field') : undefined}
                        />
                    </div>
                )}

                {view === 'delivery' && (
                    <div className="p-4">
                        <DeliveryChecklistView project={project} order={order} appointment={appointment} onChanged={setDelivery} />
                    </div>
                )}

                {view === 'signatures' && (
                    <div className="p-4">
                        <AppointmentSignaturesView
                            project={project}
                            appointment={appointment}
                            report={report}
                            salesOrderId={salesOrderId}
                        />
                    </div>
                )}

                {view === 'pdf' && pdfDoc && <PdfView build={pdfDoc.build} />}
            </div>
        </ReportsSheet>
    );
};
