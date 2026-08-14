import { useEffect, useRef, useState } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ArrowLeft, ArrowRight, File05 as FilePdf, FileDownload02 as FileDown } from '@/components/icons/antIconCompat';
import { StatusChip } from '@/components/ui-shared/StatusBadge';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AppointmentSignaturesView } from './AppointmentSignaturesView';
import { DeliveryChecklistView } from './DeliveryChecklistView';
import { FieldReportEditorView, type FieldReportSaveHandle } from './FieldReportEditorView';
import { PdfView } from './PdfView';
import { ReportsSheet } from './ReportsSheet';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import { orderPayloadId } from '../../../utils/projectOrderScope';

type SheetView = 'overview' | 'field' | 'delivery' | 'signatures' | 'pdf';
type SlideDir = 'right' | 'left' | 'rise';

/*
 * Navigation is a real history stack, not a fixed running order. The views
 * BRANCH — the overview opens any of them, the field report opens the PDF — so
 * "back" has to return to the exact place the click came from, which a running
 * order cannot express: from the PDF it would walk to whatever happened to
 * precede it in the list rather than to the row that opened it. Past and future
 * behave like a browser's, so forward re-enters whatever back just left.
 */

const animClass: Record<SlideDir, string> = {
    right: 'ofi-slide-in-right',
    left: 'ofi-slide-in-left',
    rise: 'ofi-rise-in',
};

type PdfDoc = { title: string; build: () => Promise<Blob | null> };

/**
 * The appointment popup of the Reports section: a large square sheet that
 * slides up from the bottom (identical animation to the planning popup) and
 * NEVER resizes — field report, delivery checklist, signatures and the PDF
 * stage slide in sideways inside it, driven by the back/next bar at the
 * bottom. Every document row carries a PDF glyph that opens the live document
 * in place (dimmed while the document does not exist yet).
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
    /**
     * 'pdf' opens straight onto the field report document (hub row PDF icon);
     * 'delivery' straight onto the delivery checklist (hub toolbar button).
     */
    initialView?: 'overview' | 'pdf' | 'delivery';
    onSaved: () => Promise<void>;
    onClose: () => void;
}) => {
    const [view, setView] = useState<SheetView>('overview');
    const [anim, setAnim] = useState<SlideDir>('rise');
    const [pdfDoc, setPdfDoc] = useState<PdfDoc | null>(null);
    /**
     * Başlıktaki sabit aksiyon alanı: editörler Kaydet/PDF düğmelerini buraya
     * PORTALLAR — başlık sabit olduğundan düğmeler kaydırmada görünür kalır.
     */
    const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null);
    /** Where we came from, newest last — and what `back` stepped out of. */
    const [past, setPast] = useState<SheetView[]>([]);
    const [future, setFuture] = useState<SheetView[]>([]);
    const [downloading, setDownloading] = useState<string | null>(null);
    /**
     * Editörün kayıt tutamacı: popup DEĞİŞİKLİKLE kapatılırsa kayıt otomatik
     * tetiklenir ve kullanıcıya kaydedildiği bildirilir (kullanıcı isteği —
     * "son kayıt geçerlidir", hiçbir değişiklik sessizce kaybolmaz).
     */
    const editorHandle = useRef<FieldReportSaveHandle | null>(null);
    // Editör kendi POST yanıtıyla anında güncellenir. Büyük fieldReports proje
    // modelini her Kaydet tıklamasında çekmek yerine, kullanıcı editörden
    // ayrılırken üst görünümü bir kez senkronize ederiz.
    const fieldChangedSinceSync = useRef(false);
    /**
     * Editörden ayrılırken (başka görünüme geçiş YA DA popup kapanışı) bekleyen
     * değişiklik varsa kayıt otomatik tetiklenir ve kullanıcıya bildirilir —
     * görünümler ayrılınca unmount olduğundan aksi halde değişiklik kaybolurdu.
     */
    const flushEditor = (leavingView: SheetView) => {
        const handle = editorHandle.current;
        if (leavingView === 'field' && handle?.dirty && !handle.saving) {
            toast.info(t('projects.reportsHub.savingOnClose'), { position: 'top-center' });
            void handle.save().then((saved) => {
                if (!saved) return;
                fieldChangedSinceSync.current = false;
                void onSaved();
            });
        } else if (leavingView === 'field' && fieldChangedSinceSync.current) {
            fieldChangedSinceSync.current = false;
            void onSaved();
        }
        if (leavingView === 'field') editorHandle.current = null;
    };
    const handleClose = () => {
        flushEditor(view);
        onClose();
    };

    const salesOrderId = orderPayloadId(order);

    const kind = appointmentStatusKind(appointment);
    const isCompleted = kind === 'completed';
    const start = dayjs(appointment.startTime);
    const end = dayjs(appointment.endTime);

    const go = (next: SheetView, dir: SlideDir) => {
        // Re-clicking the current view's button must not remount it (that would
        // drop unsaved editor state) — the slide only runs on a real change.
        if (next === view) return;
        flushEditor(view);
        // A fresh jump forks the history: whatever `back` had parked is dropped.
        setPast((stack) => [...stack, view]);
        setFuture([]);
        setAnim(dir);
        setView(next);
    };

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

    // `from` is no longer tracked separately: the history stack already holds the
    // exact view the glyph was clicked in, so `back` lands on that row.
    const openPdf = (doc: PdfDoc) => {
        setPdfDoc(doc);
        // Swapping documents while already on the stage must not stack the stage
        // onto itself, or `back` would loop between two PDFs.
        if (view !== 'pdf') go('pdf', 'right');
    };

    // Deep-link from the hub's row PDF glyph straight onto the document.
    useEffect(() => {
        if (!open) return;
        // A newly opened sheet starts with an empty history, so `back` is inert
        // until something has actually been navigated away from.
        setPast([]);
        setFuture([]);
        if (initialView === 'pdf' && report) {
            setPdfDoc({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf });
            setView('pdf');
            setAnim('rise');
        } else if (initialView === 'delivery') {
            setView('delivery');
            setAnim('rise');
        } else {
            setView('overview');
            setAnim('rise');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    // ── back / forward over the visited views, browser style. ──
    const goBack = () => {
        if (past.length === 0) return;
        const target = past[past.length - 1];
        flushEditor(view);
        setPast((stack) => stack.slice(0, -1));
        setFuture((stack) => [view, ...stack]);
        setAnim('left');
        setView(target);
    };
    const goNext = () => {
        if (future.length === 0) return;
        const target = future[0];
        flushEditor(view);
        setFuture((stack) => stack.slice(1));
        setPast((stack) => [...stack, view]);
        setAnim('right');
        setView(target);
    };
    const canBack = past.length > 0;
    const canNext = future.length > 0;

    const viewTitles: Record<SheetView, string> = {
        overview: t('projects.reportsHub.appointmentTitle'),
        field: t('projects.reportsHub.fieldSection'),
        delivery: t('projects.reportsHub.deliverySection'),
        signatures: t('projects.reportsHub.signaturesSection'),
        pdf: pdfDoc?.title || 'PDF',
    };

    // Belgeyi doğrudan dosya olarak indirir (önizlemeden bağımsız).
    const downloadDoc = async (doc: PdfDoc) => {
        setDownloading(doc.title);
        try {
            const blob = await doc.build();
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${doc.title.replace(/[\\/:*?"<>|]/g, '-')}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
        } finally {
            setDownloading(null);
        }
    };

    /**
     * Alt rapor kutusu: İNCE kenarlıklı kutu (kullanıcı isteği) — başlık +
     * durum solda, önizleme ve indirme sağda. Kutuya tıklamak ilgili editörü açar.
     */
    const DocumentBox = ({ title, status, available, doc, target }: {
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
            className={`flex items-center justify-between gap-4 rounded-lg border border-slate-200 px-4 py-3.5 sm:px-5 dark:border-white/15 ${target ? 'cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/5' : ''}`}
        >
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="text-[12.5px] font-semibold text-slate-800">{title}</span>
                {status}
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
                <button
                    type="button"
                    title={available ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
                    aria-label={t('projects.reportsHub.preview')}
                    disabled={!available}
                    onClick={(event) => { event.stopPropagation(); openPdf(doc); }}
                    className={`inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors ${
                        available ? 'ofi-rs-pdf' : 'ofi-rs-pdf-dim cursor-default'
                    }`}
                >
                    <FilePdf size={14} />
                </button>
                <button
                    type="button"
                    title={t('projects.delivery.download')}
                    aria-label={t('projects.delivery.download')}
                    disabled={!available || downloading === doc.title}
                    onClick={(event) => { event.stopPropagation(); void downloadDoc(doc); }}
                    className={`inline-flex size-7 items-center justify-center rounded-[2px] border transition-colors ${
                        available ? 'ofi-rs-pdf' : 'ofi-rs-pdf-dim cursor-default'
                    } ${downloading === doc.title ? 'opacity-50' : ''}`}
                >
                    <FileDown size={14} />
                </button>
            </div>
        </div>
    );

    return (
        <ReportsSheet
            open={open}
            title={`${start.format('DD.MM.YYYY')} · ${start.format('HH:mm')}–${end.format('HH:mm')}`}
            subtitle={viewTitles[view]}
            onBack={canBack ? goBack : undefined}
            onClose={handleClose}
            headerActions={<div ref={setActionsHost} className="flex items-center gap-1.5" />}
            footer={(
                <>
                    {/* Yalnızca gezinme kaldı: Gesamtrapport/Abnahme düğmeleri
                        popup'tan çıkıp Rapporte sekmesinin araç çubuğuna taşındı,
                        "Auftragsrapporte" tamamen kalktı (kullanıcı isteği). */}
                    <button
                        type="button"
                        disabled={!canBack}
                        onClick={goBack}
                        className="ofi-rs-nav inline-flex items-center gap-1.5 rounded-[3px] px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:opacity-30"
                    >
                        <ArrowLeft size={13} />
                        {t('common.back')}
                    </button>

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
                    <div className="space-y-7 px-6 py-7 sm:px-8 sm:py-9 lg:px-10">
                        {/* Auftrag-Details als EINE Tabelle (Benutzerwunsch) — nur bei
                            laufenden Terminen; bei abgeschlossenen genügt der Titel
                            samt Status-Chip darunter. */}
                        {!isCompleted ? (
                            <div className="overflow-hidden rounded-[3px] border border-slate-200 dark:border-white/15">
                                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                                    <thead>
                                        <tr>
                                            <th className="text-left">{t('projects.reportsHub.order')}</th>
                                            <th className="text-left">{t('projects.musteri')}</th>
                                            <th className="text-left">{t('common.date')}</th>
                                            <th className="text-left">{t('projects.schedule.time')}</th>
                                            <th className="text-left">{t('projects.teknisyen')}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td className="font-semibold text-slate-800 dark:text-white">{order?.orderNumber || '—'}</td>
                                            <td className="text-slate-700 dark:text-white/80">{project.customer?.companyName || '—'}</td>
                                            <td className="tabular-nums text-slate-700 dark:text-white/80">{start.format('DD.MM.YYYY')}</td>
                                            <td className="tabular-nums text-slate-700 dark:text-white/80">{`${start.format('HH:mm')} – ${end.format('HH:mm')}`}</td>
                                            <td className="text-slate-700 dark:text-white/80">{appointmentTechnicianNames(appointment) || '—'}</td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="flex items-center gap-2.5">
                                <span className="text-[13px] font-semibold text-slate-800 dark:text-white">{order?.orderNumber || project.projectName}</span>
                                <StatusChip variant="active">{statusLabel(kind)}</StatusChip>
                            </div>
                        )}

                        {/* Montage-Rapport: nur Vorschau + PDF (Benutzerwunsch); die
                            Zeile öffnet den Editor. */}
                        <div className="space-y-2.5">
                            <DocumentBox
                                title={t('projects.reportsHub.fieldSection')}
                                status={report
                                    ? <StatusChip variant={report.isSigned ? 'active' : 'info'}>{report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportAvailable')}</StatusChip>
                                    : <StatusChip variant="neutral">{t('projects.reportUnavailable')}</StatusChip>}
                                available={Boolean(report)}
                                doc={{ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }}
                                target="field"
                            />

                            {/* Unterschriften-Zeile — Gesamtrapport & Abnahme-Rapport
                                sind aus dem Popup in die Werkzeugleiste des
                                Rapporte-Tabs gewandert (Benutzerwunsch), links
                                neben "Unterschriften". */}
                            <div
                                role="button"
                                tabIndex={0}
                                onClick={() => go('signatures', 'right')}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault();
                                        go('signatures', 'right');
                                    }
                                }}
                                className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 px-4 py-3.5 hover:bg-slate-50/70 sm:px-5 dark:border-white/15 dark:hover:bg-white/5"
                            >
                                <span className="text-[12.5px] font-semibold text-slate-800">{t('projects.reportsHub.signaturesSection')}</span>
                            </div>
                        </div>
                    </div>
                )}

                {view === 'field' && (
                    <div className="p-6 sm:p-8">
                        <FieldReportEditorView
                            project={project}
                            order={order}
                            appointment={appointment}
                            report={report}
                            materials={materials}
                            showLogs
                            saveHandleRef={editorHandle}
                            onSaved={() => { fieldChangedSinceSync.current = true; }}
                            onBack={() => go('overview', 'left')}
                            onPreviewPdf={report ? () => openPdf({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }) : undefined}
                            actionsHost={actionsHost}
                        />
                    </div>
                )}

                {view === 'delivery' && (
                    <div className="p-6 sm:p-8">
                        <DeliveryChecklistView
                            project={project}
                            order={order}
                            appointment={appointment}
                            actionsHost={actionsHost}
                        />
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
