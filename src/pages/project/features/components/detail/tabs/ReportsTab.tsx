import { memo, useEffect, useMemo, useState, type ReactNode } from 'react';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { Clipboard, Edit01 as PenLine, File05 as FilePdf, FileCheck02 } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { PdfPreviewSheet } from '@/components/pdf/PdfPreviewSheet';
import { t } from '@/i18n/translate';
import { deliveryReportApi, projectApi, type DeliveryReportDto } from '@/lib/api/project';
import { dayjsLocaleTag } from '@/lib/utils/dayjsLocale';
import type { ProjectDto, ProjectMaterial, ProjectSalesOrder } from '@/types/project';

import { AllSignaturesSheet } from '../reports/AllSignaturesSheet';
import { AppointmentReportSheet } from '../reports/AppointmentReportSheet';
import { appointmentStatusKind, statusLabel } from '../booking/schedule/scheduleShared';
import { scopedRecords } from '../../../utils/projectOrderScope';
import { findAppointmentReport } from '../../../utils/projectAppointments';

/**
 * The "Rapporte" hub of the project detail screen — rebuilt 18.08.2026 on the
 * calendar's visual language (user request: "ongoing and completed side by
 * side as cards, like the calendar's appointment view; Google-clean").
 *
 * Three levels, top to bottom, so the hierarchy matches what the documents
 * actually belong to:
 *   1. PROJECT documents — Gesamtrapport, Abnahme-Rapport, Unterschriften.
 *   2. APPOINTMENT lanes — "Laufend" and "Abgeschlossen" BESIDE each other
 *      (they used to share one table behind a toggle, so half the work was
 *      always hidden).
 *   3. The agenda CARD — a status rail in the calendar's event palette, the
 *      day number, the time as the headline and the report's state as a pill.
 *
 * Clicking a card opens the appointment popup (`AppointmentReportSheet`) — the
 * calendar's floating card, large but draggable, stretchable and maximisable.
 */
export const ReportsTab = memo(({ project, order, isPrimary, materials, onSaved }: { project: ProjectDto; order: ProjectSalesOrder | null; isPrimary: boolean; materials: ProjectMaterial[]; onSaved: () => Promise<void> }) => {
    const [selectedApptId, setSelectedApptId] = useState<string | null>(null);
    const [sheetInitialView, setSheetInitialView] = useState<'overview' | 'pdf' | 'delivery'>('overview');
    const [signaturesOpen, setSignaturesOpen] = useState(false);

    const appointments = useMemo(
        () => scopedRecords(project.appointments, order, isPrimary, project.salesOrders)
            .sort((a: any, b: any) => dayjs(b.startTime).valueOf() - dayjs(a.startTime).valueOf()),
        [project.appointments, project.salesOrders, order, isPrimary],
    );
    // Two lanes, both open at once (Benutzerwunsch): "Laufend" is the working
    // set, "Abgeschlossen" the history — neither hides behind the other.
    const ongoing = appointments.filter((a: any) => a.status !== 'COMPLETED' && a.status !== 'CANCELLED');
    const completed = appointments.filter((a: any) => a.status === 'COMPLETED' || a.status === 'CANCELLED');

    const selectedAppt = useMemo(
        () => appointments.find((a: any) => a.id === selectedApptId) || null,
        [appointments, selectedApptId],
    );

    // Gesamtrapport: erst ansehbar, wenn im Auftragsumfang ein Montage-Rapport
    // existiert.
    const fieldReports = useMemo(
        () => scopedRecords(((project as any).reports || []) as any[], order, isPrimary, project.salesOrders),
        [project, order, isPrimary],
    );
    const hasFieldReports = fieldReports.length > 0;
    const signedReports = fieldReports.filter((report: any) => report.isSigned).length;

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

    // Abnahme-Rapport: die Kachel öffnet das Termin-Blatt direkt auf der
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

    /* ── level 1: the project's own documents ───────────────────────────── */
    const DocumentTile = ({ icon, title, state, disabled, hint, onClick }: {
        icon: ReactNode;
        title: string;
        state: string;
        disabled?: boolean;
        hint?: string;
        onClick: () => void;
    }) => (
        <button type="button" className="ofi-rep-doc" disabled={disabled} title={hint || title} onClick={onClick}>
            <span className="ofi-rep-doc__icon">{icon}</span>
            <span className="ofi-rep-doc__main">
                <span className="ofi-rep-doc__title">{title}</span>
                <span className="ofi-rep-doc__state">{state}</span>
            </span>
        </button>
    );

    /* ── level 3: one appointment, in the calendar's card language ──────── */
    const AppointmentCard = ({ appointment }: { appointment: any }) => {
        const report = findAppointmentReport(project, appointment);
        const kind = appointmentStatusKind(appointment);
        // Month and weekday are read in the language the user picked — the
        // global dayjs locale is English, so the instance carries its own.
        const start = dayjs(appointment.startTime).locale(dayjsLocaleTag());
        const end = dayjs(appointment.endTime);
        return (
            <button
                type="button"
                onClick={() => openSheet(appointment.id, 'overview')}
                className={`ofi-rep-card ${kind === 'cancelled' ? 'is-cancelled' : ''}`}
            >
                <span className={`ofi-rep-card__rail is-${kind}`} aria-hidden />
                <span className="ofi-rep-card__date">
                    <span className="ofi-rep-card__day">{start.format('DD')}</span>
                    <span className="ofi-rep-card__month">{start.format('MMM')}</span>
                </span>
                <span className="ofi-rep-card__main">
                    <span className="ofi-rep-card__time">{start.format('HH:mm')} – {end.format('HH:mm')}</span>
                    <span className="ofi-rep-card__meta">
                        {start.format('ddd')} · {orderNumberFor(appointment.salesOrderId)} · {statusLabel(kind)}
                    </span>
                    <span className="ofi-rep-card__tags">
                        {report
                            ? (
                                <span className={`ofi-rep-tag ${report.isSigned ? 'is-signed' : 'is-open'}`}>
                                    {report.isSigned ? t('projects.reportsHub.signed') : t('projects.reportsHub.reportOpen')}
                                </span>
                            )
                            : <span className="ofi-rep-tag is-none">{t('projects.reportsHub.reportMissing')}</span>}
                    </span>
                </span>
                <span className="ofi-rep-card__side">
                    {/* PDF glyph: lit when a field report exists, dimmed until then. */}
                    <span
                        role="button"
                        tabIndex={report ? 0 : -1}
                        aria-disabled={!report}
                        title={report ? t('projects.reportsHub.preview') : t('projects.reportUnavailable')}
                        aria-label={t('projects.reportsHub.preview')}
                        onClick={(event) => {
                            event.stopPropagation();
                            if (report) openSheet(appointment.id, 'pdf');
                        }}
                        onKeyDown={(event) => {
                            if (!report || (event.key !== 'Enter' && event.key !== ' ')) return;
                            event.preventDefault();
                            event.stopPropagation();
                            openSheet(appointment.id, 'pdf');
                        }}
                        className={`ofi-rep-glyph ${report ? '' : 'is-off'}`}
                    >
                        <FilePdf size={15} />
                    </span>
                </span>
            </button>
        );
    };

    /* ── level 2: a lane ────────────────────────────────────────────────── */
    const Lane = ({ kind, title, rows, emptyText }: { kind: 'ongoing' | 'completed'; title: string; rows: any[]; emptyText: string }) => (
        <section className="ofi-rep-lane">
            <header className="ofi-rep-lane__head">
                <span className={`ofi-rep-lane__dot is-${kind}`} aria-hidden />
                <span className="ofi-rep-lane__title">{title}</span>
                <span className="ofi-rep-lane__count">{rows.length}</span>
            </header>
            <div className="ofi-rep-lane__body">
                {rows.length === 0
                    ? <div className="ofi-rep-empty">{emptyText}</div>
                    : rows.map((appointment: any) => <AppointmentCard key={appointment.id} appointment={appointment} />)}
            </div>
        </section>
    );

    return (
        <div className="space-y-4">
            {/* Ebene 1 — was dem PROJEKT gehört. */}
            <div className="ofi-rep-level">{t('projects.reportsHub.documents')}</div>
            <div className="ofi-rep-docs">
                <DocumentTile
                    icon={<FilePdf size={15} />}
                    title={t('projects.reportsHub.generalSection')}
                    state={hasFieldReports
                        ? t('projects.reportsHub.reportCount', { count: fieldReports.length })
                        : t('projects.reportsHub.generalNeedsField')}
                    disabled={!hasFieldReports}
                    hint={hasFieldReports ? t('projects.reportsHub.reviewGeneral') : t('projects.reportsHub.generalNeedsField')}
                    onClick={() => { void openGeneralPreview(); }}
                />
                <DocumentTile
                    icon={<Clipboard size={15} />}
                    title={t('projects.reportsHub.deliverySection')}
                    state={latestDelivery
                        ? t('projects.reportsHub.createdOn', { date: dayjs(latestDelivery.createdAt).format('DD.MM.YYYY') })
                        : t('projects.reportsHub.notCreated')}
                    disabled={!deliveryAppt}
                    hint={deliveryAppt
                        ? (latestDelivery ? t('projects.reportsHub.reviewDelivery') : t('projects.reportsHub.createDelivery'))
                        : t('projects.reportsHub.noAppointments')}
                    onClick={() => { if (deliveryAppt) openSheet(deliveryAppt.id, 'delivery'); }}
                />
                <DocumentTile
                    icon={signedReports > 0 ? <FileCheck02 size={15} /> : <PenLine size={15} />}
                    title={t('nav.signatures')}
                    state={hasFieldReports
                        ? t('projects.reportsHub.signedCount', { signed: signedReports, total: fieldReports.length })
                        : t('projects.reportsHub.noSignedYet')}
                    hint={t('projects.reportsHub.signaturesAll')}
                    onClick={() => setSignaturesOpen(true)}
                />
            </div>

            {/* Ebene 2 — was den TERMINEN gehört. */}
            <div className="ofi-rep-level">{t('projects.reportsHub.appointmentsSection')}</div>
            {appointments.length === 0 ? (
                <EmptyState title={t('projects.reportsHub.noAppointments')} description={t('auto.bu_proje_icin_henuz_saha_raporu_girilmemis')} />
            ) : (
                <div className="ofi-rep-lanes">
                    <Lane
                        kind="ongoing"
                        title={t('projects.reportsHub.ongoing')}
                        rows={ongoing}
                        emptyText={t('projects.reportsHub.laneOngoingEmpty')}
                    />
                    <Lane
                        kind="completed"
                        title={t('projects.reportsHub.completed')}
                        rows={completed}
                        emptyText={t('projects.reportsHub.laneCompletedEmpty')}
                    />
                </div>
            )}

            {/* Popups — everything mounts only while open, so the tab stays light. */}
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
                        // die Kachel-Beschriftung oben muss dann kippen.
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
