import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ArrowLeft, ArrowRight, Edit01 as PenLine, File05 as FilePdf, FileDownload02 as FileDown, PackagePlus } from '@/components/icons/antIconCompat';
import { AddonOrdersPopup } from '@/components/orders/AddonOrdersPopup';
import { PopupCaption } from '@/components/ui-shared/PopupKit';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import { useAuthStore } from '@/store/authStore';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AppointmentSignaturesView } from './AppointmentSignaturesView';
import { DeliveryChecklistView } from './DeliveryChecklistView';
import { FieldReportEditorView, type FieldReportSaveHandle } from './FieldReportEditorView';
import { PdfView } from './PdfView';
import { ReportPopup } from './ReportPopup';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import { orderPayloadId } from '../../../utils/projectOrderScope';
import '@/styles/modules/projectReports.css';

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
 * The appointment popup of the Rapporte hub — since 18.08.2026 the calendar's
 * FLOATING CARD (`ReportPopup`): it opens large in the middle of the screen,
 * is dragged by its header strip, stretched by its edges and blown up to the
 * full viewport with the maximise toggle, all without a backdrop, so the two
 * appointment lanes stay readable behind it.
 *
 * Inside, the views still slide sideways — overview → field report → delivery
 * checklist → signatures → PDF stage — driven by the back/next bar. The
 * overview reads top-down: the appointment's FACTS first, its DOCUMENTS below,
 * each with its state and a PDF glyph (dimmed while it does not exist yet).
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

    /* «Zusatzaufträge» aus dem Rapport (Vorgabe Samet, 05.09.2026): der Knopf
       in der Kopfzeile öffnet die Nachträge des Hauptauftrags, an dem dieser
       Termin hängt — mit ihren eigenen Belegen. Er steht in JEDER Ansicht des
       Fensters, denn gesucht wird aus dem Rapport heraus. */
    const navigate = useNavigate();
    const { permissions } = useAuthStore();
    const [addonsOpen, setAddonsOpen] = useState(false);
    const parentOrder = order?.parentSalesOrderId
        ? (project.salesOrders || []).find((candidate) => candidate.id === order.parentSalesOrderId) || null
        : order;
    const addonParent = salesOrderId && parentOrder
        ? { id: salesOrderId, orderNumber: parentOrder.orderNumber, projectId: project.id }
        : null;
    const addonCount = (project.salesOrders || []).filter((candidate) => candidate.parentSalesOrderId === salesOrderId).length;

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

    // Deep-link from the hub's row PDF glyph / delivery tile straight onto the
    // document.
    useEffect(() => {
        if (!open) return;
        const landing: SheetView = initialView === 'pdf' && report ? 'pdf'
            : initialView === 'delivery' ? 'delivery'
            : 'overview';
        if (landing === 'pdf') setPdfDoc({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf });
        // A deep link lands INSIDE the popup, so its history is seeded with the
        // overview — otherwise "back" would be inert and the appointment itself
        // unreachable from the document it opened on.
        setPast(landing === 'overview' ? [] : ['overview']);
        setFuture([]);
        setView(landing);
        setAnim('rise');
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

    /* Eine Zeile "Beschriftung → Wert" der Auskunftsliste im Kasten
       (`.ofi-rep-facts`, styles/reportPopup.css): Beschriftung in ihrer
       festen Spalte, Wert daneben, Haarlinie zwischen den Zeilen. */
    const DetailRow = ({ label, value }: { label: string; value: string }) => (
        <div className="ofi-rep-fact">
            <span className="ofi-rep-fact__label">{label}</span>
            <span className="ofi-rep-fact__value">{value}</span>
        </div>
    );

    /**
     * Belge satırı — simge · ad + durum · düğmeler.
     *
     * Durum rozeti METNİN YANINDA durur, satırın sağ ucunda DEĞİL: sağa
     * itilmiş bir rozet satırın ortasında boşluk bırakıyor ve satırdan satıra
     * kayıyor gibi görünüyordu (kullanıcı, iki kez: "sağa doğru kayma var",
     * "iki satır da sağa doğru uzamış"). Ayrıca durum artık BİR kez yazılır —
     * eskiden aynı bilgi hem alt satırda hem rozette vardı. Sağda yalnızca
     * düğmeler kalır ve yerleri sabittir: düğmesi olmayan satır da o sütunu
     * boş bırakır. Satıra tıklamak ilgili editörü açar.
     */
    const DocumentRow = ({ icon, title, state, tone = '', available, doc, target }: {
        icon: React.ReactNode;
        title: string;
        state: string;
        tone?: '' | 'is-done' | 'is-open';
        available: boolean;
        doc?: PdfDoc;
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
            className={`ofi-rep-docrow ${target ? 'is-clickable' : ''}`}
        >
            <span className="ofi-tp-icon">{icon}</span>
            <span className="ofi-rep-docrow__main">
                <span className="ofi-rep-docrow__title">{title}</span>
                <span className={`ofi-rep-docrow__state ${tone}`}>{state}</span>
            </span>
            <span className="ofi-rep-docrow__actions">
                {doc && (
                    <>
                        <button
                            type="button"
                            title={available ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
                            aria-label={t('projects.reportsHub.preview')}
                            disabled={!available}
                            onClick={(event) => { event.stopPropagation(); openPdf(doc); }}
                            className="ofi-rep-docbtn"
                        >
                            <FilePdf size={16} />
                        </button>
                        <button
                            type="button"
                            title={t('projects.delivery.download')}
                            aria-label={t('projects.delivery.download')}
                            disabled={!available || downloading === doc.title}
                            onClick={(event) => { event.stopPropagation(); void downloadDoc(doc); }}
                            className="ofi-rep-docbtn"
                        >
                            <FileDown size={16} />
                        </button>
                    </>
                )}
            </span>
        </div>
    );

    return (
        <ReportPopup
            open={open}
            /* Wie ein Mac-Fenster: der Titel nennt, WAS offen ist (Termin,
               Montage-Rapport, …), die Zeile darunter den Termin selbst. */
            title={viewTitles[view]}
            subtitle={`${start.format('DD.MM.YYYY')} · ${start.format('HH:mm')}–${end.format('HH:mm')} · ${statusLabel(kind)}`}
            /* Der Ausleser bleibt schmal, der Editor bekommt die volle Breite —
               die Karte folgt der Ansicht (Benutzerwunsch: "gross, aber
               flexibel"). */
            size={view === 'overview' || view === 'signatures' ? 'compact' : 'wide'}
            /* Der Abnahme-Rapport geht OBEN auf: seine Liste wächst mit jeder
               Checkliste, und eine mittig platzierte Karte rutschte dabei
               Block für Block nach oben (Benutzerwunsch 19.08.2026). Der Wert
               hängt am `initialView`, nicht an der laufenden Ansicht — sonst
               spränge die Karte beim Blättern und verlöre Zug und Vollbild. */
            openAt={initialView === 'delivery' ? 'top' : 'center'}
            onBack={canBack ? goBack : undefined}
            onClose={handleClose}
            headerActions={(
                <div className="flex items-center gap-1.5">
                    <button
                        type="button"
                        className="ofi-cal-btn"
                        disabled={!addonParent}
                        title={t('crm.addon.popupTitle')}
                        onClick={() => setAddonsOpen(true)}
                    >
                        <PackagePlus size={14} />
                        {addonCount > 0 ? `${t('crm.addon.fieldButton')} (${addonCount})` : t('crm.addon.fieldButton')}
                    </button>
                    <div ref={setActionsHost} className="flex items-center gap-1.5" />
                </div>
            )}
            footer={(
                /* Nur die Navigation: Gesamtrapport/Abnahme sitzen als Kacheln
                   im Rapporte-Tab, nicht mehr im Popup (Benutzerwunsch). */
                <div className="flex items-center justify-between gap-2">
                    <button type="button" disabled={!canBack} onClick={goBack} className="ofi-cal-btn">
                        <ArrowLeft size={14} />
                        {t('common.back')}
                    </button>
                    <button type="button" disabled={!canNext} onClick={goNext} className="ofi-cal-btn">
                        {t('projects.reportsHub.next')}
                        <ArrowRight size={14} />
                    </button>
                </div>
            )}
        >
            <div key={`${view}-${anim}-${view === 'pdf' ? pdfDoc?.title || '' : ''}`} className={`flex min-h-0 flex-1 flex-col ${animClass[anim]}`}>
                {view === 'overview' && (
                    /* Zwei Spalten wie im Kalender-Detail: LINKS die Fakten des
                       Termins (Beschriftung → Wert, keine Tabelle mehr), RECHTS
                       seine Dokumente. Auf schmalen Karten fallen sie
                       untereinander. */
                    <div className="ofi-rep-overview">
                        <section>
                            <div className="flex items-center justify-between gap-3">
                                <PopupCaption>{t('projects.reportsHub.appointmentTitle')}</PopupCaption>
                                <span className={`ofi-tp-pill ${isCompleted ? 'is-done' : kind === 'cancelled' ? 'is-danger' : 'is-open'}`}>
                                    {statusLabel(kind)}
                                </span>
                            </div>
                            <div className="ofi-rep-facts">
                                <DetailRow label={t('common.date')} value={start.format('DD.MM.YYYY')} />
                                <DetailRow label={t('projects.schedule.time')} value={`${start.format('HH:mm')} – ${end.format('HH:mm')}`} />
                                <DetailRow label={t('projects.reportsHub.order')} value={order?.orderNumber || '—'} />
                                <DetailRow label={t('projects.musteri')} value={project.customer?.companyName || '—'} />
                                <DetailRow label={t('projects.teknisyen')} value={appointmentTechnicianNames(appointment) || '—'} />
                            </div>
                        </section>

                        <section>
                            <PopupCaption>{t('projects.reportsHub.documents')}</PopupCaption>
                            <div className="ofi-rep-doclist">
                                <DocumentRow
                                    icon={<FilePdf size={15} />}
                                    title={t('projects.reportsHub.fieldSection')}
                                    state={report
                                        ? (report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportsHub.reportOpen'))
                                        : t('projects.reportsHub.notCreated')}
                                    tone={report ? (report.isSigned ? 'is-done' : 'is-open') : ''}
                                    available={Boolean(report)}
                                    doc={{ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }}
                                    target="field"
                                />
                                <DocumentRow
                                    icon={<PenLine size={15} />}
                                    title={t('projects.reportsHub.signaturesSection')}
                                    state={report?.isSigned
                                        ? (report.signedAt
                                            ? `${t('projects.reportsHub.signed')} · ${dayjs(report.signedAt).format('DD.MM.YYYY')}`
                                            : t('projects.reportsHub.signed'))
                                        : t('projects.reportsHub.noSignatures')}
                                    tone={report?.isSigned ? 'is-done' : ''}
                                    available={false}
                                    target="signatures"
                                />
                            </div>
                        </section>
                    </div>
                )}

                {view === 'field' && (
                    /* `ofi-fr-stage` = der hellgraue Grund des Rapports (Vorgabe
                       Samet, 02.09.2026). Er liegt AUSSEN und nicht mehr nur um
                       die Gruppen, damit das Fenster des Projektleiters und der
                       Montage-Bildschirm dieselbe eine Fläche zeigen. */
                    <div className="ofi-fr-stage">
                        <FieldReportEditorView
                            project={project}
                            order={order}
                            appointment={appointment}
                            report={report}
                            materials={materials}
                            showLogs
                            canSign
                            saveHandleRef={editorHandle}
                            onSaved={() => { fieldChangedSinceSync.current = true; }}
                            onBack={() => go('overview', 'left')}
                            onPreviewPdf={report ? () => openPdf({ title: t('projects.reportsHub.fieldSection'), build: buildFieldPdf }) : undefined}
                            actionsHost={actionsHost}
                        />
                    </div>
                )}

                {view === 'delivery' && (
                    <div className="ofi-rep-view">
                        <DeliveryChecklistView
                            project={project}
                            order={order}
                            appointment={appointment}
                            actionsHost={actionsHost}
                        />
                    </div>
                )}

                {view === 'signatures' && (
                    <div className="ofi-rep-view">
                        <AppointmentSignaturesView
                            project={project}
                            appointment={appointment}
                            report={report}
                            salesOrderId={salesOrderId}
                        />
                    </div>
                )}

                {view === 'pdf' && pdfDoc && (
                    /* Die Dokumentbühne braucht eine eigene Höhe: die Karte
                       folgt sonst ihrem Inhalt und das <iframe> fiele auf 0. */
                    <div className="flex min-h-[68vh] flex-1 flex-col">
                        <PdfView build={pdfDoc.build} />
                    </div>
                )}
            </div>

            {/* Die Nachträge des Hauptauftrags — über dem Rapport-Fenster
                gestapelt (beide sind schwebende Karten). */}
            <AddonOrdersPopup
                open={addonsOpen}
                onClose={() => setAddonsOpen(false)}
                parentOrder={addonParent}
                canCreate={permissions.includes('projects.createAddonOrder')}
                zIndex={200}
                onOpenAddon={(addon) => navigate(`/sales/orders/${addon.parentSalesOrderId}?tab=addons&addon=${addon.id}`)}
            />
        </ReportPopup>
    );
};
