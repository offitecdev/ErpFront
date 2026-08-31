import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';

import { ClockRewind, FileDownload02 as FileDown, Plus, Save01 as Save, Trash01 as Trash2 } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { CELL_INPUT_CLASS, ColResizeHandle, ResizableCols, SectionCard } from '@/components/ui-shared/TableKit';
import { SignaturePad } from '@/components/ui-shared/SignaturePad';
import { PopupDialog, PopupEmpty } from '@/components/ui-shared/PopupKit';
import { AnchoredPicker } from '@/components/ui-shared/AnchoredPicker';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { projectApi } from '@/lib/api/project';
import { t } from '@/i18n/translate';
import type { ProjectMaterial, ProjectSalesOrder } from '@/types/project';
import { MontageImageUpload } from '@/pages/montage/components/MontageImageUpload';

import { appointmentTechnicianNames } from '../../../utils/appointmentPeople';
import { displayExpenseType, durationFmt, money, numberFmt } from '../../../utils/projectFormatters';
import { orderPayloadId } from '../../../utils/projectOrderScope';
import { appointmentDuration } from '../../../utils/projectAppointments';
// Shared field-report operations parser — keeps this editor and the technician
// screen reading/writing the exact same item list, in the same order.
import { operationItems as reportOperationItems } from '../../../installations/utils/installationScope';

// One visual language for every editable grid in the popup: the app-wide CRM
// table (`data-inv-table` inside a `SectionCard`).
const cellInput = CELL_INPUT_CLASS;

const AddOperationButton = ({ onClick, label }: { onClick: () => void; label: string }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        className="inline-flex size-9 items-center justify-center rounded-full text-[#1f2654] transition-colors hover:bg-[#eef2fb] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1f2654]/30 dark:text-amber-300 dark:hover:bg-white/10"
    >
        <Plus size={20} />
    </button>
);

/**
 * Satır silme — ayrı bir "Seçenekler" sütunu YOKTUR (kullanıcı isteği), çarpı
 * satırın METİN hücresinin (Bezeichnung) sağ ucunda küçük ve sessiz durur.
 * Tutar hücresine KOYULMAZ: orada sayıyı sola itip Betrag sütununun sağ
 * kenarında boşluk bırakıyordu (kullanıcı isteği 20.08.2026).
 */
const RowRemoveButton = ({ onClick, label, disabled }: { onClick: () => void; label: string; disabled?: boolean }) => (
    <button
        type="button"
        onClick={onClick}
        title={label}
        aria-label={label}
        disabled={disabled}
        className="inline-flex size-5 shrink-0 items-center justify-center rounded-[2px] text-slate-300 transition-colors hover:text-rose-600 disabled:opacity-30 dark:text-white/25 dark:hover:text-rose-400"
    >
        <Trash2 size={12} />
    </button>
);

const SectionTable = SectionCard;

type EditorTab = 'work' | 'expenses';

/**
 * TEK, DÜZ kaynak listesi (kullanıcı isteği): kayıtlı ve yeni satırlar aynı
 * tablodadır ve kaydetme SUNUCUDAKİ BÜTÜN durumu bu listeyle DEĞİŞTİRİR — son
 * kayıt geçerlidir. id'li satırlar sunucuda yaşayanlardır (silinirse kayıttan
 * da silinir), id'siz satırlar yeni eklenenlerdir.
 *
 * Giriş DOĞRUDANDIR (düğme/popup yok): son satır her zaman boş bir giriş
 * satırıdır. Yazılan metin malzeme kataloğuna uyarsa satır "Zusatzmaterial"
 * olur; uymayan serbest metin "Externe Kosten" olarak kaydedilir.
 */
type ResourceRow = {
    key: string;
    id?: string;
    kind: 'expense' | 'extra' | 'used';
    text: string;
    materialId?: string;
    quantity: number;
    amount: number;
    unitPrice: number;
};

const rowHasContent = (row: ResourceRow) => Boolean(row.text.trim() || row.materialId);

/** saveFieldReport'a giden yükün tamamı — montaj "abschliessen" da bunu kullanır. */
export type FieldReportPayload = {
    salesOrderId: string | null;
    startedAt: string;
    endedAt: string;
    operationsDoneItems: string[];
    technicalNotes: string;
    images?: string[];
    expenses?: Array<{ id?: string; expenseType: string; amount: number }>;
    extraMaterials?: Array<{ id?: string; materialId: string; quantity: number }>;
    usedMaterials?: Array<{ id?: string; materialId: string; quantity: number }>;
    /** Nur mitgeschickt, wenn sich die Technikerunterschrift geändert hat. */
    technicianSignature?: string | null;
    /** Direkte Kundenunterschrift aus demselben Rapport-Editor. */
    customerSignature?: string | null;
};

/** Kaydet/kapat akışını üst bileşene açan tutamaç (popup kapanırken otokayıt). */
export type FieldReportSaveHandle = {
    dirty: boolean;
    saving: boolean;
    save: () => Promise<boolean>;
    /** Formun anlık yükü (doğrulama hatasında null + toast) — montaj bitirme bunu gönderir. */
    collect: () => FieldReportPayload | null;
};

const LOG_ACTION_KEYS: Record<string, string> = {
    SAVED: 'projects.reportsHub.logSaved',
    COMPLETED: 'projects.reportsHub.logCompleted',
    SIGNED: 'projects.reportsHub.logSigned',
};

/**
 * Field-report editor — the ONE editor both surfaces render (user request:
 * identical workflow/layout): the manager's appointment popup and the montage
 * technician screen. Everything is a plain gray-bordered table; the Kosten tab
 * is a single flat list with direct entry, and saving pushes the WHOLE state
 * through one endpoint (last save wins).
 */
export const FieldReportEditorView = ({
    project,
    order,
    appointment,
    report,
    materials,
    existingExpenses,
    existingExtraMaterials,
    images,
    setImages,
    disabled = false,
    canSign = false,
    showLogs = false,
    onSaved,
    onPreviewPdf,
    actionsHost,
    saveHandleRef,
}: {
    project: any;
    order: ProjectSalesOrder | null;
    appointment: any;
    report: any | null;
    materials: ProjectMaterial[];
    /** Termine bağlı kayıtlı satırlar; verilmezse project.* içinden süzülür. */
    existingExpenses?: any[];
    existingExtraMaterials?: any[];
    /** Rapor fotoğrafları (montaj): verilirse Arbeiten sekmesinde yüklenir ve kayıtla gider. */
    images?: string[];
    setImages?: (images: string[]) => void;
    disabled?: boolean;
    /**
     * Nur die TECHNIKERFLÄCHE (/montage) darf die Technikerunterschrift
     * abnehmen. Der Projektleiter unterschreibt NIE — weder für den Techniker
     * noch für den Kunden (Vorgabe 19.08.2026): der Techniker signiert auf
     * seinem eigenen Gerät, der Kunde dort oder über die Signaturanfrage.
     */
    canSign?: boolean;
    /** Projektleiter-Ansicht: Protokoll-Knopf (wer hat wann gespeichert). */
    showLogs?: boolean;
    onSaved: () => Promise<void> | void;
    /** Kayıt artık editörden çıkmaz — geri dönüş yalnızca başlık okuyla olur. */
    onBack?: () => void;
    /** When set, the PDF button opens the in-sheet preview instead of downloading. */
    onPreviewPdf?: () => void;
    /**
     * Popup başlığındaki sabit aksiyon alanı: Kaydet/PDF buraya portallanır ve
     * içerik kaydırılsa da görünür kalır. Host yoksa düğmeler altta çizilir.
     */
    actionsHost?: HTMLElement | null;
    /** Kapanışta otokayıt için: üst bileşen dirty/save durumunu buradan okur. */
    saveHandleRef?: { current: FieldReportSaveHandle | null };
}) => {
    const apptDate = dayjs(appointment.startTime);
    /**
     * A field report records ONE day. An appointment may legitimately run past
     * midnight, but the report cannot follow it there: its interval terminates
     * at the end of the appointment's own day.
     */
    const DAY_END = '23:59';
    const sameDayTime = (value: string | Date) => {
        const moment = dayjs(value);
        return moment.isSame(apptDate, 'day') ? moment.format('HH:mm') : DAY_END;
    };
    const [start, setStart] = useState(report?.startedAt ? dayjs(report.startedAt).format('HH:mm') : apptDate.format('HH:mm'));
    const [end, setEnd] = useState(report?.endedAt ? sameDayTime(report.endedAt) : sameDayTime(appointment.endTime));
    const [operations, setOperations] = useState<string[]>(() => {
        const items = report ? reportOperationItems(report) : [];
        return items.length ? items : [''];
    });
    const [technicalNotes, setTechnicalNotes] = useState(report?.technicalNotes || '');
    /* Zweite Unterschrift des Rapports: der Techniker selbst. Sie reist mit dem
       normalen Speichern (siehe `collect`), nicht über einen eigenen Knopf. */
    const [technicianSignature, setTechnicianSignature] = useState<string | null>(report?.technicianSignature || null);
    const savedTechnicianSignature = useRef<string | null>(report?.technicianSignature || null);
    const [customerSignature, setCustomerSignature] = useState<string | null>(report?.customerSignature || null);
    const savedCustomerSignature = useRef<string | null>(report?.customerSignature || null);
    // Base64 fotoğrafları her kayıtta tekrar POST etmek hem gövdeyi büyütüyor hem
    // de sunucuda gereksiz delete/create yaptırıyordu. Küçük bir parmak iziyle
    // yalnızca gerçekten değişen görsel setini gönder.
    const imageFingerprint = (values?: string[]) => JSON.stringify((values || []).map((value) => [
        value.length,
        value.slice(0, 64),
        value.slice(-64),
    ]));
    const savedImagesFingerprint = useRef(imageFingerprint(images));

    const scopedExpenses = existingExpenses
        ?? (project?.expenses || []).filter((e: any) => e.appointmentId === appointment.id);
    const scopedExtras = existingExtraMaterials
        ?? (project?.extraMaterials || []).filter((m: any) => m.appointmentId === appointment.id);
    const scopedUsed = report?.usedMaterials || [];

    /**
     * Kayıtlı satırlar da DÜZENLENEBİLİR durumdadır (son kayıt geçerli olduğu
     * için): listeden çıkarılan id'li satır kaydetmede sunucudan da silinir.
     * Sıralama: verwendetes Material → Zusatzmaterial → Externe Kosten,
     * yeni girişler en altta.
     */
    const buildRows = (expenses: any[], extras: any[], used: any[]): ResourceRow[] => [
        ...used.map((m: any): ResourceRow => ({
            key: `u-${m.id}`,
            id: m.id,
            kind: 'used',
            text: m.material?.name || m.article?.name || t('auto.malzeme'),
            materialId: m.materialId || m.articleId || undefined,
            quantity: Number(m.quantity) || 0,
            amount: 0,
            unitPrice: 0,
        })),
        ...extras.map((m: any): ResourceRow => ({
            key: `x-${m.id}`,
            id: m.id,
            kind: 'extra',
            // Birleşme sonrası satırlar `article`/`articleId` taşır; eski kayıt
            // yanıtları `material`/`materialId` göndermeye devam eder.
            text: m.material?.name || m.article?.name || t('auto.malzeme'),
            materialId: m.materialId || m.articleId || undefined,
            quantity: Number(m.quantity) || 0,
            amount: 0,
            unitPrice: Number(m.unitPrice) || 0,
        })),
        ...expenses.map((e: any): ResourceRow => ({
            key: `e-${e.id}`,
            id: e.id,
            kind: 'expense',
            text: displayExpenseType(e.expenseType),
            quantity: 0,
            amount: Number(e.amount) || 0,
            unitPrice: 0,
        })),
    ];

    const [rows, setRows] = useState<ResourceRow[]>(() => buildRows(scopedExpenses, scopedExtras, scopedUsed));
    const resourceFingerprint = (values: ResourceRow[], kind: ResourceRow['kind']) => JSON.stringify(values
        .filter((row) => row.kind === kind && rowHasContent(row))
        .map((row) => [row.id || '', row.text.trim(), row.materialId || '', Number(row.quantity) || 0, Number(row.amount) || 0]));
    const savedResourceFingerprints = useRef({
        expense: resourceFingerprint(rows, 'expense'),
        extra: resourceFingerprint(rows, 'extra'),
        used: resourceFingerprint(rows, 'used'),
    });
    const rowKeyRef = useRef(0);
    const nextRowKey = () => { rowKeyRef.current += 1; return `n${rowKeyRef.current}`; };

    /** Kaynaklar tablosunun sütunları sürüklenerek genişletilir/daraltılır. */
    const resourceGrid = useColumnWidths({
        storageKey: 'offitec:field-report-resources:col-widths:v1',
        defaults: { type: 176, item: 420, qty: 96, amount: 128 },
        minPx: 72,
    });
    const [tab, setTab] = useState<EditorTab>('work');
    const [saving, setSaving] = useState(false);
    const [pdfBusy, setPdfBusy] = useState(false);
    /**
     * Kaydetme editörden ÇIKMAZ (kullanıcı isteği): ilk kayıtta oluşan rapor
     * burada tutulur ki sonraki kayıtlar güncelleme olarak devam etsin.
     */
    const [savedReport, setSavedReport] = useState<any | null>(report);
    const effectiveReport = report ?? savedReport;

    // ── Protokoll (wer hat wann gespeichert) ──
    const [logsOpen, setLogsOpen] = useState(false);
    const [logs, setLogs] = useState<any[] | null>(null);
    const openLogs = async () => {
        if (!effectiveReport) return;
        setLogsOpen(true);
        setLogs(null);
        try {
            const res = await projectApi.getReportLogs(effectiveReport.id);
            setLogs(res.logs || []);
        } catch {
            setLogs([]);
        }
    };

    const materialById = (id?: string) => materials.find((m) => m.id === id);

    // The planned duration is capped the same way, so an appointment that runs
    // over midnight is compared against the part of it this report can cover.
    const minutesToDayEnd = apptDate.endOf('day').diff(apptDate, 'minute');
    const plannedMin = Math.min(appointmentDuration(appointment), minutesToDayEnd);
    const buildIso = (time: string) => {
        const [h, m] = time.split(':').map((x) => Number(x));
        return apptDate.hour(h || 0).minute(m || 0).second(0).millisecond(0);
    };
    const workedMin = Math.max(0, buildIso(end).diff(buildIso(start), 'minute'));
    const tolerance = Number(project?.overtimeTolerancePercent ?? 15);
    const overtimeMin = Math.max(0, Math.ceil(workedMin - plannedMin * (1 + tolerance / 100)));
    const overtimeCost = (overtimeMin / 60) * (Number(project?.overtimeHourlyRate) || 0);

    const operationRefs = useRef<Array<HTMLTextAreaElement | null>>([]);
    const addOperation = () => {
        const nextIndex = operations.length;
        setOperations((current) => [...current, '']);
        window.requestAnimationFrame(() => operationRefs.current[nextIndex]?.focus());
    };

    const patchRow = (key: string, patch: Partial<ResourceRow>) =>
        setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

    const dropRow = (key: string) => setRows((current) => current.filter((row) => row.key !== key));
    const [focusedResourceKey, setFocusedResourceKey] = useState<string | null>(null);
    const addResourceRow = () => {
        const existingBlank = rows.find((row) => !row.id && !rowHasContent(row));
        if (existingBlank) {
            setFocusedResourceKey(existingBlank.key);
            return;
        }
        const key = nextRowKey();
        setRows((current) => [...current, { key, kind: 'expense', text: '', quantity: 1, amount: 0, unitPrice: 0 }]);
        setFocusedResourceKey(key);
    };

    // ── Değişiklik takibi: Kaydet simgesi yalnızca gerçek bir değişiklikte
    // aktifleşir; popup değişiklikle kapatılırsa otokayıt devreye girer. ──
    const serializeState = (rowsArg: ResourceRow[]) => JSON.stringify({
        start,
        end,
        operations: operations.map((item) => item.trim()),
        technicalNotes: technicalNotes.trim(),
        images: imageFingerprint(images),
        signature: technicianSignature ? `${technicianSignature.length}:${technicianSignature.slice(-48)}` : '',
        customerSignature: customerSignature ? `${customerSignature.length}:${customerSignature.slice(-48)}` : '',
        rows: rowsArg.filter(rowHasContent).map((row) => [row.id || '', row.kind, row.text.trim(), row.materialId || '', row.quantity, row.amount]),
    });
    const [baseline, setBaseline] = useState<string | null>(null);
    useEffect(() => {
        if (baseline === null) setBaseline(serializeState(rows));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [baseline]);
    const dirty = !disabled && baseline !== null && serializeState(rows) !== baseline;

    /** Formun anlık durumunu tam kayıt yüküne çevirir (hatalıysa null + toast). */
    const collect = (): FieldReportPayload | null => {
        const cleanOperations = operations.map((item) => item.trim()).filter(Boolean);
        if (!cleanOperations.length) { toast.error(t('projects.yapilan_isleri_girin')); return null; }
        const startedAt = buildIso(start).toISOString();
        const endedAt = buildIso(end).toISOString();
        if (dayjs(endedAt).valueOf() <= dayjs(startedAt).valueOf()) { toast.error(t('projects.bitis_baslangictan_sonra')); return null; }
        const contentRows = rows.filter(rowHasContent);
        const expenseRows = contentRows
            .filter((row) => row.kind === 'expense' && row.text.trim())
            .map((row) => ({ id: row.id, expenseType: row.text.trim(), amount: Number(row.amount) || 0 }));
        const extraRows = contentRows
            .filter((row) => row.kind === 'extra' && row.materialId && Number(row.quantity) > 0)
            .map((row) => ({ id: row.id, materialId: row.materialId!, quantity: Number(row.quantity) }));
        const usedRows = contentRows
            .filter((row) => row.kind === 'used' && row.materialId && Number(row.quantity) > 0)
            .map((row) => ({ id: row.id, materialId: row.materialId!, quantity: Number(row.quantity) }));
        return {
            salesOrderId: orderPayloadId(order),
            startedAt,
            endedAt,
            operationsDoneItems: cleanOperations,
            technicalNotes: technicalNotes.trim(),
            ...(imageFingerprint(images) !== savedImagesFingerprint.current ? { images: images || [] } : {}),
            ...(technicianSignature !== savedTechnicianSignature.current ? { technicianSignature } : {}),
            ...(customerSignature !== savedCustomerSignature.current ? { customerSignature } : {}),
            ...(resourceFingerprint(rows, 'expense') !== savedResourceFingerprints.current.expense ? { expenses: expenseRows } : {}),
            ...(resourceFingerprint(rows, 'extra') !== savedResourceFingerprints.current.extra ? { extraMaterials: extraRows } : {}),
            ...(resourceFingerprint(rows, 'used') !== savedResourceFingerprints.current.used ? { usedMaterials: usedRows } : {}),
        };
    };

    const save = async (): Promise<boolean> => {
        const payload = collect();
        if (!payload) return false;
        setSaving(true);
        try {
            // HER ŞEY tek çağrıda: rapor gövdesi + spesen + malzemeler. Sunucu
            // terminin eski durumunu bu listeyle DEĞİŞTİRİR — son kayıt geçerli.
            const res = await projectApi.saveFieldReport(appointment.id, payload);
            if (res.report) setSavedReport(res.report);
            savedImagesFingerprint.current = imageFingerprint(images);
            savedTechnicianSignature.current = technicianSignature;
            savedCustomerSignature.current = customerSignature;
            // Sunucu durumu benimsenir: yeni satırlar artık id taşır, bir sonraki
            // kayıt kopya oluşturmak yerine günceller.
            const nextRows = buildRows(res.expenses || [], res.extraMaterials || [], res.report?.usedMaterials || []);
            setRows(nextRows);
            savedResourceFingerprints.current = {
                expense: resourceFingerprint(nextRows, 'expense'),
                extra: resourceFingerprint(nextRows, 'extra'),
                used: resourceFingerprint(nextRows, 'used'),
            };
            setBaseline(serializeState(nextRows));
            if (res.overtimeWarning) toast.warning(res.overtimeWarning);
            toast.success(t('projects.saha_raporu_kaydedildi'));
            // Editör AÇIK KALIR (kullanıcı isteği); üst verinin tazelenmesi arkada tamamlanır.
            void onSaved();
            return true;
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.rapor_kaydedilemedi'));
            return false;
        } finally {
            setSaving(false);
        }
    };

    // Üst bileşen (popup) kapanırken buradan okur: değişiklik varsa kaydeder.
    if (saveHandleRef) saveHandleRef.current = { dirty, saving, save, collect };

    const createPdf = async () => {
        if (!effectiveReport) return toast.error(t('projects.raporu_once_kaydedin'));
        // Üst bileşen taze raporu henüz görmediyse önizleme yerine indirme çalışır.
        if (onPreviewPdf && report) return onPreviewPdf();
        setPdfBusy(true);
        try {
            const { exportFieldReportPdf } = await import('@/utils/pdf/fieldReportPdf');
            await exportFieldReportPdf(project, effectiveReport, { appointment });
        } catch (err: any) {
            toast.error(err.response?.data?.error || t('projects.pdf_olusturulamadi'));
        } finally {
            setPdfBusy(false);
        }
    };

    const TabButton = ({ id, label }: { id: EditorTab; label: string }) => (
        <button
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`-mb-px border-b-2 px-4 py-2 text-[13px] font-semibold transition-colors ${
                tab === id
                    ? 'border-[#272f67] text-[#272f67] dark:border-[#e6cf9e] dark:text-[#e6cf9e]'
                    : 'border-transparent text-slate-500 hover:text-slate-800 dark:text-white/55 dark:hover:text-white'
            }`}
        >
            {label}
        </button>
    );

    /**
     * Aksiyonlar: PDF önizleme + BÜYÜK, YALIN Kaydet simgesi (kullanıcı isteği) —
     * değişiklik yoksa pasif durur. Projektleiter ayrıca Protokoll'ü görür.
     */
    const actionButtons = (
        <>
            {showLogs && effectiveReport && (
                <button
                    type="button"
                    title={t('projects.reportsHub.logs')}
                    aria-label={t('projects.reportsHub.logs')}
                    onClick={() => void openLogs()}
                    className="ofi-rs-iconbtn inline-flex size-9 items-center justify-center rounded-[3px] border transition-colors"
                >
                    <ClockRewind size={16} />
                </button>
            )}
            <Button variant="secondary" size="sm" disabled={pdfBusy || !effectiveReport} icon={<FileDown size={13} />} onClick={() => void createPdf()}>{pdfBusy ? '…' : t('projects.pdf_olustur')}</Button>
            {!disabled && (
                <button
                    type="button"
                    title={dirty ? t('common.save') : t('projects.reportsHub.noChanges')}
                    aria-label={t('common.save')}
                    disabled={!dirty || saving}
                    onClick={() => void save()}
                    className="inline-flex size-9 items-center justify-center rounded-[3px] bg-[#272f67] text-white transition-colors hover:bg-[#1f2654] disabled:cursor-default disabled:opacity-30 dark:bg-[#e6cf9e] dark:text-[#151616] dark:hover:bg-[#dfc38a]"
                >
                    {saving
                        ? <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white dark:border-black/30 dark:border-t-black" />
                        : <Save size={18} />}
                </button>
            )}
        </>
    );

    const completed = appointment.status === 'COMPLETED' || appointment.status === 'CANCELLED';
    const typeLabel = (row: ResourceRow) => {
        if (row.kind === 'used') return t('projects.kullanilan');
        if (row.materialId) return t('projects.ek_malzeme');
        return row.text.trim() ? t('auto.harici_giderler') : '—';
    };

    return (
        /* `ofi-fr-editor`: bütün ızgaralar TEK yüzey gibi okunur — yazılabilen
           hücre ile hesaplanan hücre aynı yüksekliği ve aynı hizayı taşır
           (kullanıcı: "tablonun bir kısmı boş bir kısmı dolu"). Kutu yalnızca
           odakta/üzerine gelindiğinde belirir; bkz. index.css `.ofi-fr-*`. */
        <div className="ofi-fr-editor space-y-4">
            {/* Auftrag-Details als EINE Tabelle (Benutzerwunsch) — nur bei
                laufenden Terminen; abgeschlossene zeigen sie nicht mehr. */}
            {!completed && (
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
                                <td className="text-slate-700 dark:text-white/80">{project?.customer?.companyName || '—'}</td>
                                <td className="tabular-nums text-slate-700 dark:text-white/80">{apptDate.format('DD.MM.YYYY')}</td>
                                <td className="tabular-nums text-slate-700 dark:text-white/80">{`${apptDate.format('HH:mm')} – ${sameDayTime(appointment.endTime)}`}</td>
                                <td className="text-slate-700 dark:text-white/80">{appointmentTechnicianNames(appointment) || '—'}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            <div className="min-w-0 space-y-4">
            {/* Two passes through the report: what was done, then what it cost. */}
            <div className="flex items-center gap-1 border-b border-slate-200 dark:border-white/15">
                <TabButton id="work" label={t('projects.reportsHub.tabWork')} />
                <TabButton id="expenses" label={t('projects.reportsHub.tabExpenses')} />
            </div>

            {tab === 'work' && (<>
            {/* Appointment times + overtime preview, as one thin-lined grid. */}
            <SectionTable title={t('projects.randevu_saatleri')} collapsible>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <thead>
                        <tr>
                            <th className="text-left">{t('common.date')}</th>
                            <th className="text-left">{t('common.start')}</th>
                            <th className="text-left">{t('common.end')}</th>
                            <th className="text-left">{t('projects.calisilan_saat')}</th>
                            <th className="text-left">{t('projects.ek_calisma')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td className="font-semibold tabular-nums text-slate-800 dark:text-white">{apptDate.format('DD.MM.YYYY')}</td>
                            {/* Both times belong to the appointment's own day, so
                                neither may run past 23:59 into the next one. */}
                            <td><input type="time" min="00:00" max="23:59" disabled={disabled} className={cellInput} value={start} onChange={(e) => setStart(e.target.value)} /></td>
                            <td><input type="time" min="00:00" max="23:59" disabled={disabled} className={cellInput} value={end} onChange={(e) => setEnd(e.target.value)} /></td>
                            <td className="tabular-nums text-slate-700 dark:text-white/80">{durationFmt(workedMin)} <span className="text-[11px] text-slate-400">({t('auto.plan')}: {durationFmt(plannedMin)})</span></td>
                            <td className="tabular-nums text-slate-700 dark:text-white/80">{durationFmt(overtimeMin)} · {money(overtimeCost)}</td>
                        </tr>
                    </tbody>
                </table>
            </SectionTable>

            {/* Genau EIN Plus am Listenende. Eine neue, grössere Eingabe erscheint
                sofort; Tabellen-Haarlinien unter leeren Zeilen gibt es nicht. */}
            <SectionTable
                title={t('projects.yapilan_isler')}
            >
                <div className="space-y-2.5 bg-white px-4 py-4 dark:bg-transparent">
                    {operations.map((item, index) => (
                        <div key={index} className="flex items-start gap-3">
                            <span className="mt-3.5 w-5 shrink-0 text-right text-[12px] font-semibold tabular-nums text-slate-400 dark:text-white/45">{index + 1}.</span>
                            <textarea
                                ref={(node) => { operationRefs.current[index] = node; }}
                                rows={2}
                                className="min-h-[52px] flex-1 resize-y rounded-lg border border-slate-200 bg-slate-50/45 px-3.5 py-3 text-[14px] leading-5 text-slate-800 outline-none transition focus:border-[#1f2654]/45 focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10 dark:border-white/15 dark:bg-white/[0.04] dark:text-white dark:focus:border-amber-400/50 dark:focus:bg-white/[0.06]"
                                value={item}
                                disabled={disabled}
                                aria-label={t('projects.yapilan_is')}
                                onChange={(e) => setOperations(operations.map((row, i) => (i === index ? e.target.value : row)))}
                            />
                            {!disabled && (
                                <button
                                    type="button"
                                    title={t('common.delete')}
                                    aria-label={t('common.delete')}
                                    disabled={operations.length === 1}
                                    onClick={() => setOperations(operations.filter((_, i) => i !== index))}
                                    className="mt-2.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:opacity-25 dark:hover:bg-rose-500/10"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                        </div>
                    ))}
                    {!disabled && (
                        <div className="flex justify-end pt-1">
                            <AddOperationButton label={t('projects.madde')} onClick={addOperation} />
                        </div>
                    )}
                </div>
            </SectionTable>

            {/* Technical notes stay a free-text block below the work grid. */}
            <SectionTable title={t('projects.teknik_notlar')} collapsible>
                <textarea
                    rows={2}
                    disabled={disabled}
                    className="w-full resize-y bg-white px-4 py-3 text-[13.5px] text-slate-800 outline-none placeholder:text-slate-300 dark:bg-transparent dark:text-white"
                    value={technicalNotes}
                    onChange={(e) => setTechnicalNotes(e.target.value)}
                />
            </SectionTable>

            {/* Unterschriften: der Techniker unterschreibt AUF SEINEM EIGENEN
                GERÄT (/montage), die Kundensignatur kommt von dort oder über
                die Signaturanfrage. Der Projektleiter sieht beide nur — er
                unterschreibt für niemanden (Vorgabe 19.08.2026). Beide
                erscheinen so auch auf dem PDF. */}
            <SectionTable title={t('signatures.section')} collapsible>
                <div className="space-y-3 px-4 py-3">
                    {!canSign && <div className="ofi-tp-note">{t('signatures.readOnlyNote')}</div>}
                    <div className="ofi-sign-grid">
                        <SignaturePad
                            label={t('projects.field.pdf.technicianRole')}
                            value={technicianSignature}
                            onChange={setTechnicianSignature}
                            caption={effectiveReport?.technicianSignedAt
                                ? dayjs(effectiveReport.technicianSignedAt).format('DD.MM.YYYY HH:mm')
                                : t('projects.delivery.technicianSignatureHint')}
                            readOnly={disabled || !canSign}
                        />
                        <SignaturePad
                            label={t('projects.field.pdf.customerRole')}
                            value={customerSignature}
                            onChange={setCustomerSignature}
                            caption={effectiveReport?.signedAt
                                ? dayjs(effectiveReport.signedAt).format('DD.MM.YYYY HH:mm')
                                : t('signatures.notSignedYet')}
                            readOnly={disabled || !canSign}
                        />
                    </div>
                </div>
            </SectionTable>

            {/* Rapor fotoğrafları — yalnızca fotoğraf durumu yönetilen yüzeyde
                (montaj) görünür; kayıtla birlikte gider. */}
            {images !== undefined && setImages && (
                <SectionTable title={t('montage.work.photos')} collapsible>
                    <div className="px-4 py-3">
                        <MontageImageUpload value={images} onChange={setImages} disabled={disabled} />
                    </div>
                </SectionTable>
            )}

            </>)}

            {tab === 'expenses' && (<>
            {/* Tek, düz kaynak tablosu. Boş giriş satırı sürekli görünmez:
                sağ alttaki tek + anında yeni satırı açar ve odaklar. */}
            <SectionTable title={t('projects.reportsHub.resources')} collapsible>
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full">
                    <colgroup>
                        <ResizableCols keys={['type', 'item', 'qty', 'amount'] as const} grid={resourceGrid} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="relative text-left">
                                {t('common.type')}
                                <ColResizeHandle {...resourceGrid.resizeProps('type')} />
                            </th>
                            <th className="relative text-left">
                                {t('projects.reportsHub.colItem')}
                                <ColResizeHandle {...resourceGrid.resizeProps('item')} />
                            </th>
                            <th className="relative text-right">
                                {t('projects.adet')}
                                <ColResizeHandle {...resourceGrid.resizeProps('qty')} />
                            </th>
                            <th className="relative text-right">
                                {t('common.amount')}
                                <ColResizeHandle {...resourceGrid.resizeProps('amount')} />
                            </th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map((row) => {
                            // Yalnızca GERÇEKTEN boş giriş satırı silinemez ve giriş
                            // yer tutucusunu gösterir; içerik yazılan satır normaldir.
                            const isEntry = !row.id && !row.materialId && row.kind === 'expense' && !rowHasContent(row);
                            const catalogCost = row.kind === 'extra'
                                ? (row.id ? row.unitPrice : Number(materialById(row.materialId)?.unitCost) || row.unitPrice)
                                : 0;
                            const rowAmount = row.kind === 'expense'
                                ? Number(row.amount) || 0
                                : row.kind === 'extra'
                                    ? (Number(row.quantity) || 0) * catalogCost
                                    : 0;
                            return (
                                <tr key={row.key}>
                                    <td><span className="ofi-fr-cell is-muted text-[12px]">{typeLabel(row)}</span></td>
                                    <td>
                                        {/* Silme çarpısı BEZEICHNUNG hücresinin sağ ucunda durur (teklif
                                            satırlarındaki gibi). Tutarın yanında dururken sayıyı sola itiyor,
                                            sütunun sağ kenarında bir boşluk bırakıyordu (kullanıcı isteği
                                            20.08.2026): artık her satırın tutarı aynı kenarda biter. */}
                                        <div className="flex items-center gap-1.5">
                                            <div className="min-w-0 flex-1">
                                                {row.kind !== 'used' && !disabled ? (
                                                    <MaterialSuggestCell
                                                        value={row.text}
                                                        materials={materials}
                                                        placeholder={isEntry ? t('projects.reportsHub.entryPlaceholder') : t('auto.harici_giderler')}
                                                        autoFocus={focusedResourceKey === row.key}
                                                        onFocused={() => setFocusedResourceKey(null)}
                                                        onText={(text) => patchRow(row.key, row.kind === 'extra'
                                                            ? { text, kind: 'expense', materialId: undefined, unitPrice: 0, quantity: 1 }
                                                            : { text })}
                                                        onPick={(material) => patchRow(row.key, {
                                                            kind: 'extra',
                                                            materialId: material.id,
                                                            text: material.name,
                                                            quantity: row.quantity > 0 ? row.quantity : 1,
                                                            unitPrice: Number(material.unitCost) || 0,
                                                        })}
                                                    />
                                                ) : (
                                                    <span className={`ofi-fr-cell truncate ${row.kind === 'expense' ? '' : 'font-medium'}`}>{row.text}</span>
                                                )}
                                            </div>
                                            {!disabled && (
                                                <RowRemoveButton label={t('common.delete')} onClick={() => dropRow(row.key)} />
                                            )}
                                        </div>
                                    </td>
                                    <td>
                                        {row.kind === 'expense'
                                            ? <span className="ofi-fr-cell is-right is-faint">—</span>
                                            : (
                                                <input
                                                    type="number"
                                                    min={0}
                                                    step="1"
                                                    disabled={disabled}
                                                    className={`${cellInput} text-right font-mono`}
                                                    value={row.quantity}
                                                    onChange={(e) => patchRow(row.key, { quantity: Number(e.target.value) })}
                                                />
                                            )}
                                    </td>
                                    <td>
                                        {row.kind === 'expense' && !disabled ? (
                                            <input
                                                type="number"
                                                min={0}
                                                step="0.01"
                                                className={`${cellInput} text-right font-mono`}
                                                value={row.amount}
                                                onChange={(e) => patchRow(row.key, { amount: Number(e.target.value) })}
                                            />
                                        ) : (
                                            <span className="ofi-fr-cell is-right is-num font-mono">{money(rowAmount)}</span>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!disabled && (
                    <div className="flex justify-end bg-white px-4 py-3 dark:bg-transparent">
                        <AddOperationButton label={t('projects.reportsHub.entryPlaceholder')} onClick={addResourceRow} />
                    </div>
                )}
            </SectionTable>
            </>)}

            {/* Kaydet/PDF popup başlığına portallanır (sabit, kaydırmada görünür);
                host yoksa eski yerinde, altta kalır. */}
            {actionsHost ? createPortal(actionButtons, actionsHost) : (
                <div className="flex items-center justify-end gap-2 border-t border-dashed border-slate-300 pt-3">
                    {actionButtons}
                </div>
            )}

            </div>

            {/* Protokoll — a small read-only dialog of the app popup kit; it
                opens ABOVE the reports sheet, hence the raised z. */}
            <PopupDialog
                open={logsOpen}
                onClose={() => setLogsOpen(false)}
                title={t('projects.reportsHub.logs')}
                width={440}
                z={750}
            >
                {logs === null && <PopupEmpty>{t('common.loading')}</PopupEmpty>}
                {logs !== null && logs.length === 0 && <PopupEmpty>{t('projects.reportsHub.logsEmpty')}</PopupEmpty>}
                {logs !== null && logs.length > 0 && (
                    <div className="ofi-tp-list ofi-tp-list--scroll">
                        {logs.map((log: any) => (
                            <div key={log.id} className="ofi-tp-row">
                                <span className="ofi-tp-row__main">
                                    <span className="ofi-tp-row__title">
                                        {log.employee ? `${log.employee.firstName} ${log.employee.lastName}` : '—'}
                                    </span>
                                    <span className="ofi-tp-row__meta">
                                        {t(LOG_ACTION_KEYS[log.action] || 'projects.reportsHub.logSaved')}
                                    </span>
                                </span>
                                <span className="ofi-tp-num">{dayjs(log.createdAt).format('DD.MM.YYYY HH:mm')}</span>
                            </div>
                        ))}
                    </div>
                )}
            </PopupDialog>
        </div>
    );
};

/**
 * Doğrudan giriş hücresi: yazarken malzeme kataloğundan öneriler açılır.
 * Bir öneri seçilirse satır Zusatzmaterial olur; seçilmezse yazılan metin
 * Externe Kosten olarak kalır — ayrı düğme/popup yoktur (kullanıcı isteği).
 */
const MaterialSuggestCell = ({
    value,
    materials,
    placeholder,
    autoFocus,
    onFocused,
    onText,
    onPick,
}: {
    value: string;
    materials: ProjectMaterial[];
    placeholder: string;
    autoFocus?: boolean;
    onFocused?: () => void;
    onText: (text: string) => void;
    onPick: (material: ProjectMaterial) => void;
}) => {
    const [anchorEl, setAnchorEl] = useState<HTMLInputElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);
    useEffect(() => {
        if (autoFocus) inputRef.current?.focus();
    }, [autoFocus]);
    const query = value.trim().toLowerCase();
    const matches = query
        ? materials
            .filter((m) => m.name.toLowerCase().includes(query) || (m.serialId || '').toLowerCase().includes(query))
            .slice(0, 8)
        : [];
    const open = Boolean(anchorEl && matches.length > 0);
    return (
        <div>
            <input
                ref={inputRef}
                autoFocus={autoFocus}
                className="min-h-11 w-full rounded-lg border border-transparent bg-transparent px-3 py-2 text-[13.5px] text-slate-800 outline-none transition-colors placeholder:text-slate-300 hover:border-slate-200 hover:bg-white focus:border-[#1f2654]/35 focus:bg-white focus:ring-2 focus:ring-[#1f2654]/10 dark:text-white dark:placeholder:text-white/25 dark:hover:border-white/15 dark:hover:bg-white/5 dark:focus:border-amber-400/40 dark:focus:bg-white/5"
                value={value}
                placeholder={placeholder}
                aria-label={placeholder}
                onChange={(e) => onText(e.target.value)}
                onFocus={(event) => { setAnchorEl(event.currentTarget); onFocused?.(); }}
            />
            <AnchoredPicker
                anchorEl={open ? anchorEl : null}
                onClose={() => setAnchorEl(null)}
                width={380}
                maxHeight={320}
                panelClassName="shadow-[0_12px_36px_rgba(15,23,42,0.18)]"
            >
                <ul className="space-y-1 overflow-y-auto p-2">
                    {matches.map((material) => (
                        <li key={material.id}>
                            <button
                                type="button"
                                onClick={() => { onPick(material); setAnchorEl(null); }}
                                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-[12.5px] transition-colors hover:bg-[#eef2fb] focus:bg-[#eef2fb] focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10"
                            >
                                <span className="truncate font-medium text-slate-800 dark:text-white">{material.name}</span>
                                <span className="flex shrink-0 items-center gap-2 font-mono text-[11px] text-slate-400">
                                    <span>{numberFmt(material.stockQuantity)}</span>
                                    <span>{money(Number(material.unitCost) || 0)}</span>
                                </span>
                            </button>
                        </li>
                    ))}
                </ul>
            </AnchoredPicker>
        </div>
    );
};
