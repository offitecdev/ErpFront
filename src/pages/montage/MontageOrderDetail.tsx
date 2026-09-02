import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import {
    CheckCircle,
    File05 as FileIcon,
    FileDownload02 as FileDown,
    Edit01 as PenIcon,
    Save01 as SaveIcon,
    Send01,
} from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { useAppointmentSeries } from '@/components/ui-shared/AppointmentDocuments';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { usePageBackTarget } from '@/lib/backNav';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import type { ProjectMaterial } from '@/types/project';
import {
    FieldReportEditorView,
    type FieldReportEditorState,
    type FieldReportSaveHandle,
} from '@/pages/project/features/components/detail/reports/FieldReportEditorView';
import { findReport, reportImageUrls } from '@/pages/project/features/installations/utils/installationScope';
import { buildFieldSnapshot } from '@/pages/project/features/installations/utils/installationSnapshots';
import type { SignatureSnapshot } from '@/lib/api/project';

import { InstallationDocumentsSheet } from './components/InstallationDocumentsSheet';
import { MontageHeader } from './components/MontageHeader';
import { StatusPill } from './components/StatusPill';
import { dateFmt, timeRange } from './utils/montageFormat';
import { toMontageOrderRow } from './utils/montageStatus';

const EMPTY_STATE: FieldReportEditorState = {
    dirty: false,
    saving: false,
    pdfBusy: false,
    hasReport: false,
    technicianSigned: false,
    customerSigned: false,
};

/**
 * One order's work screen. Since the reports unification (user request
 * 2026-08-13) this renders the SAME field-report editor as the manager's
 * appointment popup — one flat Kosten table with direct entry and one
 * comprehensive save endpoint where the last save wins.
 *
 * ── Der Umbau vom 02.09.2026 (Vorgabe Samet) ────────────────────────────────
 * Der Bildschirm hatte drei Stellen, an denen dasselbe stand: die Kopfzeile,
 * die Zeitleiste und die Tabelle «Auftrag · Kunde · Datum · Uhrzeit ·
 * Techniker» im Editor. Jetzt sagt jede Zeile genau eine Sache:
 *
 *   KOPFZEILE   Termin + Datum, unmittelbar daneben die drei Unterlagen
 *               (Terminunterlagen, Gesamtrapport, Abnahme-Rapport) und danach
 *               der Status («Beginnt bald»). Kunde · Projekt · Auftrag steht
 *               als ruhige zweite Zeile darunter — die Auftragstabelle im
 *               Editor ist dafür ganz weg (`showOrderSummary={false}`).
 *   ZEITLEISTE  links die Zeit des Termins, in der MITTE Speichern, rechts
 *               aussen «Signatur einholen» und daneben «Auftrag technisch
 *               abschliessen». Die Mitte ist echt mittig: ein 1fr-auto-1fr
 *               Raster, nicht eine Reihe mit Abstandhalter.
 *   EDITOR      fünf Register statt zwei — die Unterabschnitte «Technische
 *               Notizen», «Fotos» und «Unterschriften» sind nach oben in die
 *               Registerleiste gewandert.
 *
 * «Signatur einholen» öffnet kein Fenster mehr: es schlägt das Register
 * «Unterschriften» auf, wo erst das Techniker- und darunter das Kundenfeld
 * steht. Ein Klick, eine Fläche, und die Unterschrift reist mit demselben
 * Speichervorgang wie alles andere. Das Signaturfenster bleibt allein für den
 * ABGESCHLOSSENEN Rapport, den der Kunde nachträglich signiert.
 */
export const MontageOrderDetail = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();

    const [selected, setSelected] = useState<any | null>(null);
    const [materials, setMaterials] = useState<ProjectMaterial[]>([]);
    const [expenses, setExpenses] = useState<any[]>([]);
    const [extraMaterials, setExtraMaterials] = useState<any[]>([]);
    const [images, setImages] = useState<string[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [signOpen, setSignOpen] = useState(false);
    const [signSnapshot, setSignSnapshot] = useState<SignatureSnapshot | null>(null);
    const [signingExisting, setSigningExisting] = useState(false);
    /** Editör yalnızca yükleme sonrası taze veriyle KURULUR; her reload yeni kurulumdur. */
    const [editorEpoch, setEditorEpoch] = useState(0);
    /** Was der Editor gerade zu sagen hat — die Zeitleiste zeichnet danach. */
    const [editorState, setEditorState] = useState<FieldReportEditorState>(EMPTY_STATE);
    /* MEHRTÄGIGER EINSATZ (24.08.2026): die Tage des Einsatzes und seine
       Unterlagen. Der Tagesrapport bleibt, was er war — einer JE TAG —, und die
       Leiste unten wechselt zwischen ihnen, ohne dass die Monteurin über die
       Liste zurückgehen müsste (Vorgabe: «keine eigene Seite dafür»). */
    const [docsOpen, setDocsOpen] = useState(false);
    const editorHandle = useRef<FieldReportSaveHandle | null>(null);

    // Tenant context is set asynchronously by fetchProfile(); gating the fetch on
    // userId guarantees the tenant header is attached (see useInstallationDetail).
    const selectedTenantId = useAuthStore((s) => s.selectedTenantId);
    const userId = useAuthStore((s) => s.user?.id);
    const loadSeq = useRef(0);

    /**
     * HER ŞEY baştan yüklenir (kullanıcı isteği — kapsamlı ve hızlı): randevu +
     * rapor, spesen, zusatzmaterial ve malzeme kataloğu PARALEL dört istekte.
     * Eski bölüm-bölüm tembel yükleme kalktı; editör tek seferde tam durumla açılır.
     */
    const load = useCallback(async () => {
        if (!appointmentId) return;
        const seq = ++loadSeq.current;
        setLoading(true);
        try {
            const [work, exp, mat, catalogue] = await Promise.all([
                projectApi.getMyInstallation(appointmentId, 'work') as Promise<any>,
                projectApi.getMyInstallation(appointmentId, 'expenses') as Promise<any>,
                projectApi.getMyInstallation(appointmentId, 'materials') as Promise<any>,
                projectApi.materials({ compact: true }).catch(() => [] as ProjectMaterial[]),
            ]);
            if (seq !== loadSeq.current) return;
            const expenseRows = Array.isArray(exp.expenses) ? exp.expenses : [];
            const extraRows = Array.isArray(mat.extraMaterials) ? mat.extraMaterials : [];
            // Editör ve PDF üretimi PM tarafındaki proje grafiğinin aynısını okur.
            const merged = {
                ...work,
                salesOrder: { ...work.salesOrder, ...mat.salesOrder },
                project: { ...work.project, ...mat.project, expenses: expenseRows, extraMaterials: extraRows },
            };
            setSelected(merged);
            setMaterials(catalogue);
            setExpenses(expenseRows);
            setExtraMaterials(extraRows);
            const report = findReport(merged);
            setImages(report ? reportImageUrls(report) : []);
            setEditorState(EMPTY_STATE);
            setEditorEpoch((epoch) => epoch + 1);
        } catch (error: any) {
            if (seq !== loadSeq.current) return;
            toast.error(error.response?.data?.error || t('projects.montajlar_yuklenemedi'));
            setSelected(null);
        } finally {
            if (seq === loadSeq.current) setLoading(false);
        }
    }, [appointmentId]);

    useEffect(() => {
        if (!userId || !selectedTenantId) return;
        void load();
    }, [appointmentId, userId, selectedTenantId, load]);

    const { series } = useAppointmentSeries(appointmentId, { technician: true, enabled: Boolean(userId && selectedTenantId) });
    const seriesDays = series?.days ?? [];
    const multiDay = seriesDays.length > 1;
    const documentCount = series?.documents.length ?? 0;

    const row = useMemo(() => (selected ? toMontageOrderRow(selected) : null), [selected]);
    const report = useMemo(() => (selected ? findReport(selected) : null), [selected]);
    const finished = selected?.status === 'COMPLETED';
    const canFinish = Boolean(selected && !finished && !dayjs().isBefore(dayjs(selected.startTime), 'day'));
    // Der Rückweg gehört dem Pfeil in der Kopfleiste der Anwendung.
    usePageBackTarget(finished ? { to: '/montage/orders/completed' } : { to: '/montage/orders/active' });

    /**
     * "Auftrag technisch abschliessen": editörün ANLIK durumu tek çağrıda gider
     * (`resourceMode: 'replace'`) — rapor gövdesi + tüm kaynaklar sunucudaki
     * durumu DEĞİŞTİRİR, randevu kapanır. Son kayıt geçerlidir; ayrı ayrı
     * kaydetmeye gerek yoktur.
     */
    const finish = async () => {
        if (!selected) return;
        const payload = editorHandle.current?.collect();
        if (!payload) return;
        setSaving(true);
        try {
            const result = await projectApi.completeInstallation(selected.id, {
                operationsDoneItems: payload.operationsDoneItems,
                technicalNotes: payload.technicalNotes,
                images: payload.images,
                startedAt: payload.startedAt,
                endedAt: payload.endedAt,
                // Die Kundenunterschrift steht im Rapport-Editor selbst
                // (Register «Unterschriften») und reist von dort mit.
                signatureBase64: payload.customerSignature ?? undefined,
                technicianSignature: payload.technicianSignature,
                resourceMode: 'replace',
                expenses: payload.expenses,
                materials: payload.extraMaterials,
                usedMaterials: payload.usedMaterials,
            });
            if (result.overtimeWarning) toast.warning(result.overtimeWarning);
            toast.success(result.message || t('projects.montaj_tamamlandi'));
            // Technicians raise an addon-order request; the manager creates the order.
            if (result.addonRequest) toast.success(t('projects.addonRequestSent'));
            else if (result.addonOrder) toast.success(t('projects.addonOrderCreated', { orderNumber: result.addonOrder.orderNumber }));
            // Stay on the appointment so the now-sent report shows read-only.
            void load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.montaj_tamamlanamadi'));
        } finally {
            setSaving(false);
        }
    };

    /**
     * Laufender Rapport → das Register «Unterschriften» im Editor. Nur der
     * bereits abgeschlossene, noch unsignierte Rapport öffnet das Fenster: dort
     * gibt es keinen Editor mehr, in dem unterschrieben werden könnte.
     */
    const openSignature = () => {
        if (!selected) return;
        if (finished && report) {
            setSignSnapshot(buildFieldSnapshot(selected, report));
            setSignOpen(true);
            return;
        }
        editorHandle.current?.openSignatures();
    };

    if (loading) {
        return (
            <div className="flex h-64 flex-col items-center justify-center gap-3 rounded-[3px] border border-slate-200 bg-white dark:border-white/10 dark:bg-[#17191c]">
                <span aria-hidden className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-[#1f2654] dark:border-white/15 dark:border-t-white" />
                <span className="text-[13px] text-slate-500 dark:text-slate-400">{t('common.loading')}</span>
            </div>
        );
    }
    if (!selected || !row) {
        return (
            <div className="space-y-4">
                <MontageHeader title={t('montage.orderNotFound')} backTo="/montage/orders/active" />
                <EmptyState title={t('montage.orderNotFound')} description={t('montage.orderNotFoundHint')} />
            </div>
        );
    }

    const busy = saving || editorState.saving;

    return (
        <div className="ofi-mtg-screen">
            {/* KOPFZEILE — Termin, unmittelbar daneben die Unterlagen, dann der
                Status. Kein Knopf steht am anderen Ende des Bildschirms: was
                zusammengehört, steht zusammen (Vorgabe 02.09.2026). */}
            <header className="ofi-mtg-head">
                <div className="ofi-mtg-head__row">
                    <h1 className="ofi-mtg-head__title">{`${t('auto.randevu')} · ${dateFmt(row.start)}`}</h1>
                    <button
                        type="button"
                        className={`ofi-mtg-btn${docsOpen ? ' is-on' : ''}`}
                        onClick={() => setDocsOpen(true)}
                    >
                        <FileIcon size={15} />
                        {documentCount > 0 ? `${t('calendar.docs.title')} (${documentCount})` : t('calendar.docs.title')}
                    </button>
                    <button
                        type="button"
                        className="ofi-mtg-btn"
                        onClick={() => navigate(`/montage/reports/general/${selected.id}`)}
                    >
                        {t('projects.reportsHub.generalSection')}
                    </button>
                    <button
                        type="button"
                        className="ofi-mtg-btn"
                        disabled={!selected.project?.id}
                        onClick={() => navigate(`/montage/reports/delivery/${selected.project.id}?appointmentId=${encodeURIComponent(selected.id)}`)}
                    >
                        {t('projects.reportsHub.deliverySection')}
                    </button>
                    {/* Der Tagesrapport als PDF — ein Symbol, kein vierter
                        Schriftzug: er wiegt hier weniger als die drei Unterlagen. */}
                    <button
                        type="button"
                        className="ofi-mtg-btn is-icon"
                        title={t('projects.pdf_olustur')}
                        aria-label={t('projects.pdf_olustur')}
                        disabled={!editorState.hasReport || editorState.pdfBusy}
                        onClick={() => void editorHandle.current?.createPdf()}
                    >
                        <FileDown size={16} />
                    </button>
                    <StatusPill status={row.status} className="ofi-mtg-head__status" />
                </div>
                <div className="ofi-mtg-head__sub">{`${row.customerName} · ${row.projectName} · ${row.orderNumber}`}</div>
            </header>

            {/* ZEITLEISTE — links die Zeit, MITTIG Speichern, rechts die beiden
                Abschlusshandlungen. Das Raster (1fr · auto · 1fr) hält die Mitte
                mittig, auch wenn rechts zwei lange Beschriftungen stehen. */}
            <div className="ofi-mtg-bar">
                <div className="ofi-mtg-bar__time">
                    <span className="ofi-mtg-bar__hours">{timeRange(row.start, row.end)}</span>
                    <span className="ofi-mtg-bar__date">{dateFmt(row.start)}</span>
                </div>

                <div className="ofi-mtg-bar__center">
                    <button
                        type="button"
                        className="ofi-mtg-btn is-primary"
                        disabled={finished || !editorState.dirty || busy}
                        title={editorState.dirty ? t('common.save') : t('projects.reportsHub.noChanges')}
                        onClick={() => void editorHandle.current?.save()}
                    >
                        {editorState.saving
                            ? <span aria-hidden className="ofi-mtg-spin" />
                            : <SaveIcon size={16} />}
                        {t('common.save')}
                    </button>
                </div>

                <div className="ofi-mtg-bar__end">
                    {!finished && (
                        <>
                            <button
                                type="button"
                                className={`ofi-mtg-btn${editorState.customerSigned ? ' is-on' : ''}`}
                                onClick={openSignature}
                            >
                                {editorState.customerSigned ? <CheckCircle size={15} /> : <PenIcon size={15} />}
                                {editorState.customerSigned ? t('montage.signed') : t('signatures.getSignature')}
                            </button>
                            <button
                                type="button"
                                className="ofi-mtg-btn is-primary"
                                disabled={!canFinish || busy}
                                onClick={() => void finish()}
                            >
                                <Send01 size={15} />
                                {t('projects.finish_and_send')}
                            </button>
                        </>
                    )}
                    {finished && (
                        <>
                            {report && !report.isSigned && (
                                <button type="button" className="ofi-mtg-btn" onClick={openSignature} disabled={signingExisting}>
                                    <PenIcon size={15} />
                                    {t('signatures.getSignature')}
                                </button>
                            )}
                            <span className="ofi-mtg-done">
                                <CheckCircle size={16} />
                                {t('montage.status.completed')}
                            </span>
                        </>
                    )}
                </div>
            </div>

            {/* MEHRTÄGIGER EINSATZ: die Tage nebeneinander. Jeder Tag hat SEINEN
                eigenen Rapport (und seine eigenen Überstunden) — die Leiste
                wechselt zwischen ihnen, ohne den Umweg über die Auftragsliste.
                Der Tag, auf dem man steht, ist hervorgehoben. */}
            {multiDay && (
                <div className="ofi-montage-days">
                    <span className="ofi-montage-days__label">{t('calendar.days.plan')}</span>
                    {seriesDays.map((day, index) => (
                        <button
                            key={day.id}
                            type="button"
                            disabled={day.id === selected.id}
                            onClick={() => navigate(`/montage/orders/${day.id}`)}
                            className={`ofi-montage-days__day ${day.id === selected.id ? 'is-current' : ''} ${day.status === 'COMPLETED' ? 'is-done' : ''}`}
                        >
                            <span className="ofi-montage-days__num">{t('calendar.days.dayNumber', { index: index + 1 })}</span>
                            <span className="ofi-montage-days__date">{dayjs(day.startTime).format('dd DD.MM.')}</span>
                            <span className="ofi-montage-days__time">
                                {dayjs(day.startTime).format('HH:mm')}–{dayjs(day.endTime).format('HH:mm')}
                            </span>
                        </button>
                    ))}
                </div>
            )}

            <InstallationDocumentsSheet row={docsOpen ? row : null} onClose={() => setDocsOpen(false)} />

            {/* Projektleiter-Popup'taki editörün TA KENDİSİ (kullanıcı isteği —
                iki yüzeyde birebir aynı akış ve yerleşim). */}
            <div className="ofi-mtg-editor">
                <FieldReportEditorView
                    key={`${selected.id}-${editorEpoch}`}
                    project={selected.project}
                    order={selected.salesOrder}
                    appointment={selected}
                    report={report}
                    materials={materials}
                    existingExpenses={expenses}
                    existingExtraMaterials={extraMaterials}
                    images={images}
                    setImages={setImages}
                    disabled={finished}
                    /* Die EINZIGE Fläche, die unterschreiben darf: der Techniker
                       steht beim Kunden und signiert auf seinem eigenen Gerät. */
                    canSign
                    /* Auftrag · Kunde · Datum · Uhrzeit · Techniker steht schon
                       in der Kopfzeile — die Tabelle im Editor entfällt. */
                    showOrderSummary={false}
                    /* Speichern und PDF stehen oben in der Zeitleiste. */
                    hideActions
                    onStateChange={setEditorState}
                    saveHandleRef={editorHandle}
                    // Editör kayıttan sonra sunucu durumunu kendisi benimser; ayrıca
                    // tam sayfa yenileme (remount) düzenlemeyi kesintiye uğratırdı.
                    onSaved={() => {}}
                />
            </div>

            {/* Nur noch für den ABGESCHLOSSENEN Rapport: der Kunde signiert ihn
                nachträglich. Der laufende Rapport wird im Editor unterschrieben. */}
            {finished && report && signSnapshot && (
                <SignatureSheet
                    open={signOpen}
                    title={t('signatures.tabs.field')}
                    snapshot={signSnapshot}
                    saving={signingExisting}
                    onClose={() => setSignOpen(false)}
                    onSave={async (signature) => {
                        if (!signature) return;
                        setSigningExisting(true);
                        try {
                            await projectApi.signReport(report.id, signature);
                            setSignOpen(false);
                            toast.success(t('signatures.signed'), { position: 'top-center' });
                            void load();
                        } catch (error: any) {
                            toast.error(error.response?.data?.error || t('signatures.signError'));
                        } finally {
                            setSigningExisting(false);
                        }
                    }}
                />
            )}
            {finished && report && !report.isSigned && (
                <div className="rounded-[3px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-[#d30f15] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t('projects.imza_bekliyor')} — <button type="button" className="underline" onClick={() => void load()}>{t('common.refresh')}</button>
                </div>
            )}
        </div>
    );
};
