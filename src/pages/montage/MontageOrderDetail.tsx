import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { CheckCircle, File05 as FileIcon, Send01 } from '@/components/icons/antIconCompat';
import { EmptyState } from '@/components/ui-shared/EmptyState';
import { useAppointmentSeries } from '@/components/ui-shared/AppointmentDocuments';
import { SignatureSheet } from '@/components/ui-shared/SignatureSheet';
import { t } from '@/i18n/translate';
import { projectApi } from '@/lib/api/project';
import { useAuthStore } from '@/store/authStore';
import type { ProjectMaterial } from '@/types/project';
import {
    FieldReportEditorView,
    type FieldReportSaveHandle,
} from '@/pages/project/features/components/detail/reports/FieldReportEditorView';
import { findReport, reportImageUrls } from '@/pages/project/features/installations/utils/installationScope';
import { buildDraftFieldSnapshot, buildFieldSnapshot } from '@/pages/project/features/installations/utils/installationSnapshots';
import type { SignatureSnapshot } from '@/lib/api/project';

import { BigButton } from './components/BigButton';
import { InstallationDocumentsSheet } from './components/InstallationDocumentsSheet';
import { MontageHeader } from './components/MontageHeader';
import { StatusPill } from './components/StatusPill';
import { dateFmt, timeRange } from './utils/montageFormat';
import { toMontageOrderRow } from './utils/montageStatus';

/**
 * One order's work screen. Since the reports unification (user request
 * 2026-08-13) this renders the SAME field-report editor as the manager's
 * appointment popup — identical workflow and layout: one flat Kosten table
 * with direct entry, a change-gated save icon, and one comprehensive save
 * endpoint where the last save wins. The montage-only extras remain the
 * signature capture and "Auftrag technisch abschliessen", with the
 * Gesamtrapport / Abnahme-Rapport buttons NEXT to the signature area.
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
    // Field-report signature captured during creation. It is NOT sent on capture —
    // it rides along with the report only when "Finish & Send" is clicked.
    const [capturedSignature, setCapturedSignature] = useState<string | null>(null);
    /** Editör yalnızca yükleme sonrası taze veriyle KURULUR; her reload yeni kurulumdur. */
    const [editorEpoch, setEditorEpoch] = useState(0);
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
            setCapturedSignature(null);
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
    const disabled = Boolean(finished || !canFinish || saving);

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
                signatureBase64: capturedSignature ?? payload.customerSignature ?? undefined,
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
            setCapturedSignature(null);
            // Stay on the appointment so the now-sent report shows read-only.
            void load();
        } catch (error: any) {
            toast.error(error.response?.data?.error || t('projects.montaj_tamamlanamadi'));
        } finally {
            setSaving(false);
        }
    };

    const openSignature = () => {
        if (!selected) return;
        if (finished && report) {
            setSignSnapshot(buildFieldSnapshot(selected, report));
            setSignOpen(true);
            return;
        }
        // İmza anlık form içeriğinin üstüne alınır — geçersiz formda (iş maddesi
        // yok) collect uyarır ve imza açılmaz.
        const payload = editorHandle.current?.collect();
        if (!payload) return;
        setSignSnapshot(buildDraftFieldSnapshot(selected, payload.operationsDoneItems, payload.technicalNotes, payload.images ?? images));
        setSignOpen(true);
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

    return (
        <div className="space-y-4">
            <MontageHeader
                title={`${t('auto.randevu')} · ${dateFmt(row.start)} · ${timeRange(row.start, row.end)}`}
                subtitle={`${row.customerName} · ${row.projectName} · ${row.orderNumber}`}
                backTo={finished ? '/montage/orders/completed' : '/montage/orders/active'}
                actions={<StatusPill status={row.status} />}
            />

            {/* İmza alanı ve yanındaki aksiyonlar: Gesamtrapport ile Abnahme-Rapport
                imza düğmesinin YANINDA durur (kullanıcı isteği). */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-[3px] border border-slate-200 bg-white px-4 py-3 dark:border-white/10 dark:bg-[#17191c]">
                <div>
                    <div className="text-[15px] font-bold text-slate-900 dark:text-slate-50">{timeRange(row.start, row.end)}</div>
                    <div className="text-[12.5px] text-slate-500 dark:text-slate-400">{dateFmt(row.start)}</div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    {/* TERMINUNTERLAGEN (Vorgabe 24.08.2026): der Begleitzettel
                        und die Pläne, die das Büro an den Einsatz gehängt hat.
                        Sie gehen an keinen Kunden — sie stehen hier, auf dem
                        Bildschirm, an dem gearbeitet wird. */}
                    <BigButton
                        tone={docsOpen ? 'navy' : 'neutral'}
                        icon={<FileIcon size={15} />}
                        onClick={() => setDocsOpen(true)}
                    >
                        {documentCount > 0 ? `${t('calendar.docs.title')} (${documentCount})` : t('calendar.docs.title')}
                    </BigButton>
                    <BigButton tone="neutral" onClick={() => navigate(`/montage/reports/general/${selected.id}`)}>
                        {t('projects.reportsHub.generalSection')}
                    </BigButton>
                    <BigButton
                        tone="neutral"
                        disabled={!selected.project?.id}
                        onClick={() => navigate(`/montage/reports/delivery/${selected.project.id}?appointmentId=${encodeURIComponent(selected.id)}`)}
                    >
                        {t('projects.reportsHub.deliverySection')}
                    </BigButton>
                    {!finished && (
                        <>
                            <BigButton tone="navyOutline" icon={capturedSignature ? <CheckCircle size={15} /> : undefined} onClick={openSignature} disabled={disabled}>
                                {capturedSignature ? t('montage.signed') : t('signatures.getSignature')}
                            </BigButton>
                            <BigButton tone="navy" icon={<Send01 size={15} />} disabled={disabled} onClick={() => void finish()}>
                                {t('projects.finish_and_send')}
                            </BigButton>
                        </>
                    )}
                    {finished && (
                        <>
                            {report && !report.isSigned && (
                                <BigButton tone="navyOutline" onClick={openSignature} disabled={signingExisting}>
                                    {t('signatures.getSignature')}
                                </BigButton>
                            )}
                            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-700 dark:text-emerald-300">
                                <CheckCircle size={16} />
                                {t('montage.status.completed')}
                            </div>
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
            <div className="rounded-[3px] border border-slate-200 bg-white p-4 dark:border-white/10 dark:bg-[#17191c]">
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
                    saveHandleRef={editorHandle}
                    // Editör kayıttan sonra sunucu durumunu kendisi benimser; ayrıca
                    // tam sayfa yenileme (remount) düzenlemeyi kesintiye uğratırdı.
                    onSaved={() => {}}
                />
            </div>

            {/* Field-report signature: captured now, sent with "Finish & Send". */}
            <SignatureSheet
                open={signOpen}
                title={t('signatures.tabs.field')}
                snapshot={signSnapshot ?? buildDraftFieldSnapshot(selected, [], '', images)}
                saving={saving || signingExisting}
                onClose={() => setSignOpen(false)}
                onSave={async (signature) => {
                    if (!signature) return;
                    if (finished && report) {
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
                        return;
                    }
                    setSignOpen(false);
                    setCapturedSignature(signature);
                    toast.success(t('montage.signatureCaptured'), { position: 'top-center' });
                }}
            />
            {finished && report && !report.isSigned && (
                <div className="rounded-[3px] border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] font-semibold text-[#d30f15] dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                    {t('projects.imza_bekliyor')} — <button type="button" className="underline" onClick={() => void load()}>{t('common.refresh')}</button>
                </div>
            )}
        </div>
    );
};
