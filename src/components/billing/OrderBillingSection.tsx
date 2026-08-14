import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Check, CheckCircle, Coins01, Eye, FileDownload02, InfoCircle, Trash01, X } from '@/components/icons/antIconCompat';
import { Button } from '@/components/ui-shared/Button';
import { ColResizeHandle, ResizableCols, SectionCard } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { inputClass } from '@/components/ui-shared/Field';
import { BottomSheet } from '@/pages/inventory/components/BottomSheet';
import { billingApi } from '@/lib/api/billing';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import { t } from '@/i18n/translate';
import type { BillingSummaryDto, InvoiceDto, InvoiceKind, InvoiceStatus } from '@/types/billing';
import type { InvoiceOrderContext } from '@/utils/pdf/invoicePdf';
import { PaymentPlanSheet } from './PaymentPlanSheet';

const fmtMoney = (v: number) =>
    new Intl.NumberFormat('de-CH', { style: 'currency', currency: 'CHF', maximumFractionDigits: 2 }).format(v || 0);
const round2 = (v: number) => Math.round((v + Number.EPSILON) * 100) / 100;
const isoToday = () => new Date().toISOString().slice(0, 10);
const fmtDate = (v?: string | null) => (v ? dayjs(v).format('DD.MM.YYYY') : '—');
const apiError = (e: unknown, fallback: string) =>
    (e as { response?: { data?: { error?: string } } } | null)?.response?.data?.error
    || (e instanceof Error && e.message)
    || fallback;

export interface BillingLineInput {
    id: string;
    orderNumber: string;
    isAddon: boolean;
    /**
     * Ek siparişin gösterilecek sırası ("2. Zusatzauftrag"). Verilmezse bölüm
     * listedeki ek siparişleri kendi sayar; tek bir ek sipariş satırı gösteren
     * çağıranlar (proje Abrechnung sekmesi) gerçek sırayı buradan geçirir.
     */
    addonIndex?: number | null;
    revisionNumber?: number | null;
    date?: string | null;
    totalAmount: number;
    summary: BillingSummaryDto | null | undefined;
    /** Özet gelmediyse yedek plan kaynağı (JSON sütunu). */
    paymentStagesRaw?: string | null;
    context: InvoiceOrderContext;
}

/** Rapor + tamamlanan belge satırı (sipariş detayı sayfası besler). */
export interface BillingDocumentRow {
    id: string;
    label: string;
    type: string;
    date?: string | null;
    signed?: boolean;
}

const lineTotal = (line: BillingLineInput) => Number(line.summary?.baseAmount ?? line.totalAmount ?? 0);
const lineBilled = (line: BillingLineInput) => Number(line.summary?.billedAmount ?? 0);
const linePct = (line: BillingLineInput) => {
    const total = lineTotal(line);
    return total > 0 ? Math.max(0, Math.min(100, Math.round((lineBilled(line) / total) * 100))) : 0;
};
const lineRemainingPct = (line: BillingLineInput) =>
    round2(Math.max(0, Number(line.summary?.remainingPercent ?? (100 - linePct(line)))));
const lineStages = (line: BillingLineInput) =>
    line.summary?.paymentStages ?? parsePaymentStages(line.paymentStagesRaw) ?? null;

/**
 * Rechnungsart'ı SİSTEM belirler (kullanıcı seçmez — kullanıcı isteği):
 * ilk kısmi fatura Akonto, sonrakiler Zwischen, %100'ü tamamlayan Schluss,
 * tek seferde %100 ise Rechnung. Sunucudaki türetme ile birebir aynı kural;
 * buradaki kopya yalnızca canlı önizleme içindir (sunucuya kind GÖNDERİLMEZ,
 * sunucu kendisi türetir).
 */
const deriveKind = (billedPct: number, percent: number, remainingPct: number): InvoiceKind => {
    const completes = percent >= remainingPct - 0.005;
    if (completes) return billedPct > 0.005 ? 'SCHLUSS' : 'RECHNUNG';
    return billedPct > 0.005 ? 'ZWISCHEN' : 'AKONTO';
};

/**
 * Zahlungseingang rozeti — küçük bir ikon YETMEZ (kullanıcı isteği): ödendi mi
 * ödenmedi mi dolgulu, renkli ve YAZILI rozetten tek bakışta anlaşılır.
 */
const PAYMENT_BADGE: Record<InvoiceStatus, string> = {
    PAID: 'bg-emerald-100 text-emerald-800 ring-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-200 dark:ring-emerald-400/40',
    ISSUED: 'bg-amber-100 text-amber-900 ring-amber-300 dark:bg-amber-500/20 dark:text-amber-100 dark:ring-amber-400/40',
    CANCELLED: 'bg-slate-100 text-slate-500 ring-slate-300 dark:bg-white/10 dark:text-slate-300 dark:ring-white/20',
};

/**
 * Paylaşılan faturalama bölümü — proje Abrechnung sekmesi ile sipariş detayı
 * AYNI bileşeni kullanır. Siparişler AYRI kayıtlardır, ortak fatura listesi
 * yoktur. Sipariş satırı SADE tutulur (kullanıcı isteği): Auftrag · Total ·
 * Fakturiert · Offen · tek "Rechnung & Details" ikonu. Satırda ödeme planı
 * ikonu YOKTUR (plan yalnızca başlıktaki düğmede ve popup içindedir).
 *
 * Ana sipariş "Hauptauftrag", ekler "1. / 2. Zusatzauftrag" diye numaralanır;
 * satıra ya da ikona tıklamak O siparişe özel alttan popup'ı açar. İkonun
 * Satırın son sütununda "Aktionen" başlığı YOKTUR: yalnızca ikonsuz, doğrudan
 * "Rechnung" düğmesi durur (kullanıcı isteği) — girilen % / CHF ile faturayı
 * tek tıkta keser.
 *
 * Faturalar AYRI bir popup'ta toplu gösterilir: önce ana siparişin faturaları,
 * hemen altında ek siparişlerinkiler (her biri kendi başlığı altında). Popup
 * satıra tıklayınca açılır. Ödeme eşleşmesi şimdilik manuel: Rechnungsnummer
 * bulunur, ✓ ile "bezahlt" işaretlenir (QR-Rechnung numarası PDF'te basılıdır;
 * e-banking eşleşmesi sonraki adım).
 */

/** Popup'ta faturaları listelenecek sipariş (ana sipariş + ekleri). */
export interface BillingInvoiceScopeItem {
    id: string;
    orderNumber: string;
    isAddon: boolean;
    addonIndex?: number | null;
}

export const OrderBillingSection = ({
    lines,
    onReload,
    documents,
    invoiceScope,
    onOpenOrder,
    activeOrderId,
}: {
    lines: BillingLineInput[];
    onReload: () => void | Promise<void>;
    documents?: BillingDocumentRow[];
    /**
     * Fatura popup'ının kapsamı. Verilmezse tablodaki satırlar kullanılır;
     * proje Abrechnung sekmesi tabloda TEK sipariş gösterdiği için buraya
     * ana sipariş + ek siparişlerinin tamamını geçirir.
     */
    invoiceScope?: BillingInvoiceScopeItem[];
    /**
     * Popup'ta bir sipariş başlığına tıklanınca ne olacağı. Çağıran, kullanıcıyı
     * BULUNDUĞU ekranda ve BULUNDUĞU sekmede tutmakla yükümlüdür (proje ekranı
     * siparişi yerinde seçer, sipariş ekranı aynı sekmeyle o siparişe gider).
     * Verilmezse CRM sipariş sayfasının Abrechnung sekmesine gidilir.
     */
    onOpenOrder?: (orderId: string) => void;
    /**
     * Hâlihazırda açık olan sipariş. Popup'ta onun başlığı tıklanabilir DEĞİLDİR
     * (zaten oradasınız) — diğer siparişler tıklanabilir kalır.
     */
    activeOrderId?: string;
}) => {
    const { settings } = usePdfSettingsStore();
    const navigate = useNavigate();
    /**
     * Sütunlar sürüklenerek genişletilip daraltılır (kullanıcı isteği).
     * "Rechnungsart" dar tutulur — içindeki rozet zaten kısa.
     */
    const grid = useColumnWidths({
        storageKey: 'offitec:order-billing:col-widths:v1',
        defaults: { order: 210, total: 140, billed: 160, remaining: 160, kind: 116, amount: 248 },
        minPx: 72,
    });
    const [planFor, setPlanFor] = useState<BillingLineInput | null>(null);
    const [invoicesOpen, setInvoicesOpen] = useState(false);
    // Popup açıkken satırlar tazelenirse (fatura kesildi / bezahlt işaretlendi)
    // plan popup'ı GÜNCEL özetle çalışsın diye satır id üzerinden yeniden bulunur.
    const activePlanLine = planFor ? lines.find((line) => line.id === planFor.id) ?? planFor : null;

    /**
     * Sipariş başlığı → o sipariş açılır. Çağıran bir davranış verdiyse (aynı
     * ekran / aynı sekme) o kullanılır; yoksa CRM sipariş sayfasına gidilir.
     */
    const openOrder = (orderId: string) => {
        setInvoicesOpen(false);
        if (onOpenOrder) onOpenOrder(orderId);
        else navigate(`/crm/my-orders/${orderId}?tab=billing`);
    };

    // Ana siparişler önce, ekleri altta.
    const ordered = useMemo(() => {
        const mains = lines.filter((line) => !line.isAddon);
        const addons = lines.filter((line) => line.isAddon);
        return [...mains, ...addons];
    }, [lines]);

    const totals = useMemo(() => {
        const total = round2(ordered.reduce((sum, line) => sum + lineTotal(line), 0));
        const billed = round2(ordered.reduce((sum, line) => sum + lineBilled(line), 0));
        return { total, billed, remaining: round2(total - billed) };
    }, [ordered]);

    const contexts = useMemo(
        () => Object.fromEntries(ordered.map((line) => [line.id, line.context])),
        [ordered],
    );
    const mainLine = ordered[0] ?? null;

    // Popup kapsamı — ana sipariş(ler) üstte, ek siparişler altta.
    const scope = useMemo<BillingInvoiceScopeItem[]>(() => {
        const source: BillingInvoiceScopeItem[] = invoiceScope?.length
            ? invoiceScope
            : ordered.map((line) => ({
                id: line.id,
                orderNumber: line.orderNumber,
                isAddon: line.isAddon,
                addonIndex: line.addonIndex,
            }));
        return [...source.filter((item) => !item.isAddon), ...source.filter((item) => item.isAddon)];
    }, [invoiceScope, ordered]);

    // ── Fatura taslağı: % ↔ CHF senkron + faturaya basılacak bilgiler ───────
    // Üst şeritte yalnızca isim ve vade tarihi gösterilir. Fatura numarası
    // sunucuda üretilir; fatura kesim tarihi de seçilen vade tarihiyle aynıdır.
    interface InvoiceDraft {
        pct: string;
        amt: string;
    }
    const [drafts, setDrafts] = useState<Record<string, InvoiceDraft>>({});
    const [billingId, setBillingId] = useState<string | null>(null);

    /** Boş taslak → plandaki sıradaki taksit, yoksa kalanın tamamı. */
    const draftOf = (line: BillingLineInput): InvoiceDraft => {
        const stored = drafts[line.id];
        if (stored) return stored;
        const remaining = lineRemainingPct(line);
        const suggested = line.summary?.nextStage?.suggestedPercent ?? null;
        const pct = round2(Math.min(remaining, suggested ?? remaining));
        return {
            pct: String(pct),
            amt: String(round2((lineTotal(line) * pct) / 100)),
        };
    };

    const selectedLine = ordered.find((line) => line.id === activeOrderId) ?? mainLine;
    const defaultSalesperson = selectedLine?.context.salespersonName ?? '';
    const [dueDate, setDueDate] = useState(isoToday);
    const [salesperson, setSalesperson] = useState(defaultSalesperson);
    useEffect(() => {
        setSalesperson(defaultSalesperson);
    }, [defaultSalesperson]);

    const resetSharedInvoiceMeta = (line: BillingLineInput) => {
        setDueDate(isoToday());
        setSalesperson(line.context.salespersonName ?? defaultSalesperson);
    };

    /**
     * Oran hiçbir zaman %100'ü (ve kalan açık yüzdeyi) AŞAMAZ — `max` özniteliği
     * yalnızca ok tuşlarını sınırlar, elle yazılanı değil. Bu yüzden hem yüzde
     * hem tutar girişi yazarken kırpılır; ikisi birbirinin aynası olduğu için
     * tutar da kalan tutarla sınırlıdır.
     */
    const setDraftPct = (line: BillingLineInput, raw: string) => {
        const cap = Math.min(100, lineRemainingPct(line));
        const typed = Number(raw);
        const clamped = Number.isFinite(typed) && typed > cap;
        const pctText = clamped ? String(cap) : raw;
        const pct = Number(pctText);
        setDrafts((prev) => ({
            ...prev,
            [line.id]: {
                ...(prev[line.id] ?? draftOf(line)),
                pct: pctText,
                amt: Number.isFinite(pct) && pct > 0 ? String(round2((lineTotal(line) * pct) / 100)) : '',
            },
        }));
    };

    const setDraftAmt = (line: BillingLineInput, raw: string) => {
        const base = lineTotal(line);
        const cap = round2((base * Math.min(100, lineRemainingPct(line))) / 100);
        const typed = Number(raw);
        const amtText = Number.isFinite(typed) && typed > cap ? String(cap) : raw;
        const amt = Number(amtText);
        setDrafts((prev) => ({
            ...prev,
            [line.id]: {
                ...(prev[line.id] ?? draftOf(line)),
                pct: Number.isFinite(amt) && amt > 0 && base > 0 ? String(round2((amt / base) * 100)) : '',
                amt: amtText,
            },
        }));
    };

    const draftPercent = (line: BillingLineInput) => round2(Number(draftOf(line).pct) || 0);

    /**
     * Faturalama TEK ADIMDIR (kullanıcı isteği): düğme önizleme popup'ı AÇMAZ,
     * girilen % / CHF ile faturayı doğrudan keser. Kesilen faturanın PDF'i
     * listedeki göz / PDF ikonlarından açılır.
     */
    const bill = async (line: BillingLineInput) => {
        const remaining = lineRemainingPct(line);
        const percent = draftPercent(line);
        if (percent <= 0 || percent > remaining + 0.005) {
            toast.error(t('billing.maxPercent', { percent: remaining }));
            return;
        }
        const isFull = percent >= remaining - 0.005;
        setBillingId(line.id);
        try {
            // kind gönderilmez — türü sunucu yüzdeden türetir (Akonto/Zwischen/
            // Schluss/Rechnung), satırdaki rozet yalnızca önizlemedir. Tarihler
            // ve Verkäufer satır altındaki şeritten AYNEN gider ve belgeye
            // basılır; fatura kesim tarihi seçilen vade tarihiyle aynıdır. Kommission
            // GÖNDERİLMEZ — sunucu kesim anında tekliften kopyalar.
            const effectiveInvoiceDate = dueDate || isoToday();
            await billingApi.createInvoice({
                salesOrderId: line.id,
                billingType: isFull ? 'FULL' : 'PARTIAL',
                percent: isFull ? undefined : percent,
                invoiceDate: effectiveInvoiceDate,
                dueDate: dueDate || effectiveInvoiceDate,
                salespersonName: salesperson.trim() || line.context.salespersonName || null,
            });
            toast.success(t('billing.invoiceCreated'));
            setDrafts((prev) => {
                const next = { ...prev };
                delete next[line.id];
                return next;
            });
            resetSharedInvoiceMeta(line);
        } catch (e) {
            toast.error(apiError(e, t('billing.createError')));
            return;
        } finally {
            setBillingId(null);
        }
        // Tazeleme AYRI: burada patlayan bir istek faturayı geri almaz, bu yüzden
        // "oluşturulamadı" diye raporlanmamalı — fatura kesildi, liste gecikti.
        try {
            await Promise.all([loadInvoices(), onReload()]);
        } catch {
            toast.error(t('billing.summaryLoadError'));
        }
    };

    // ── Faturalar — sipariş başına çekilir; popup ve önizleme kartı süzer ──
    const [invoices, setInvoices] = useState<InvoiceDto[]>([]);
    const [invoicesLoading, setInvoicesLoading] = useState(false);
    const [busyId, setBusyId] = useState<string | null>(null);
    // Tablo satırları + popup kapsamı birlikte çekilir (ikisi aynı olmayabilir).
    const lineIdsKey = useMemo(
        () => Array.from(new Set([...ordered.map((line) => line.id), ...scope.map((item) => item.id)])).join(','),
        [ordered, scope],
    );

    const loadInvoices = useCallback(async () => {
        if (!lineIdsKey) {
            setInvoices([]);
            return;
        }
        setInvoicesLoading(true);
        try {
            const perOrder = await Promise.all(
                lineIdsKey.split(',').map((id) => billingApi.listInvoices({ salesOrderId: id }).catch(() => [] as InvoiceDto[])),
            );
            setInvoices(perOrder.flat().sort((a, b) => dayjs(b.createdAt).valueOf() - dayjs(a.createdAt).valueOf()));
        } finally {
            setInvoicesLoading(false);
        }
    }, [lineIdsKey]);

    useEffect(() => {
        void loadInvoices();
    }, [loadInvoices]);

    // İptal edilenler her grubun SONUNA gider (kullanıcı isteği).
    const invoicesOf = (orderId: string) =>
        invoices
            .filter((inv) => inv.salesOrderId === orderId)
            .sort((a, b) => (a.status === 'CANCELLED' ? 1 : 0) - (b.status === 'CANCELLED' ? 1 : 0));

    /** Popup satırları: sipariş başlığı + o siparişin faturaları, ana sipariş üstte. */
    const invoiceGroups = useMemo(() => {
        let addonCounter = 0;
        return scope.map((item) => {
            if (item.isAddon) addonCounter += 1;
            return {
                ...item,
                label: item.isAddon
                    ? `${item.addonIndex ?? addonCounter}. ${t('projects.addonOrder')}`
                    : t('projects.mainOrder'),
                invoices: invoicesOf(item.id),
            };
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope, invoices]);

    // ── PDF önizleme popup'ı — blob URL state'te, eskisi cleanup'ta bırakılır ─
    const [previewInvoice, setPreviewInvoice] = useState<InvoiceDto | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!previewUrl) return;
        return () => URL.revokeObjectURL(previewUrl);
    }, [previewUrl]);
    const releasePreview = () => {
        setPreviewUrl(null);
        setPreviewInvoice(null);
    };

    const contextOf = (invoice: InvoiceDto): InvoiceOrderContext =>
        (invoice.salesOrderId && contexts[invoice.salesOrderId])
        || { orderNumber: invoice.salesOrder?.orderNumber || '—', customerName: invoice.customer?.companyName };

    const preview = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(invoice, contextOf(invoice), settings);
            const url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
            setPreviewUrl(url);
            setPreviewInvoice(invoice);
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setBusyId(null);
        }
    };

    const download = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { exportInvoicePdf } = await import('@/utils/pdf/invoicePdf');
            await exportInvoicePdf(invoice, contextOf(invoice), settings);
        } catch (e) {
            toast.error(apiError(e, t('billing.pdfError')));
        } finally {
            setBusyId(null);
        }
    };

    /** Manuel ödeme eşleşmesi: Rechnungsnummer üzerinden "bezahlt" işareti. */
    const setStatus = async (invoice: InvoiceDto, status: InvoiceStatus) => {
        setBusyId(invoice.id);
        try {
            await billingApi.updateStatus(invoice.id, status);
            if (status === 'CANCELLED' && previewInvoice?.id === invoice.id) releasePreview();
            if (status === 'PAID') toast.success(t('billing.markedPaid'));
            await Promise.all([loadInvoices(), onReload()]);
        } catch (e) {
            toast.error(apiError(e, t('billing.createError')));
        } finally {
            setBusyId(null);
        }
    };

    /** İptal edilmiş faturayı kalıcı olarak siler (çöp kutusu ikonu). */
    const removeForever = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            await billingApi.deleteInvoice(invoice.id);
            toast.success(t('billing.deleted'));
            await Promise.all([loadInvoices(), onReload()]);
        } catch (e) {
            toast.error(apiError(e, t('billing.createError')));
        } finally {
            setBusyId(null);
        }
    };

    const iconBtn = 'inline-flex h-7 w-7 items-center justify-center text-slate-500 transition-colors hover:bg-slate-100 hover:text-[#272f67] disabled:opacity-40 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white';
    /**
     * Vorschau / PDF — PNG görsel DEĞİL, uygulamanın kendi ikon setinden
     * (components/icons) vektör ikonlar; çerçevesiz ama BÜYÜK düğmeler.
     * Renk ayrımı: önizleme kurumsal lacivert, PDF kırmızı.
     */
    const assetBtn = 'inline-flex size-12 items-center justify-center rounded-lg transition hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-white/10';
    const kindChip = 'inline-flex items-center rounded bg-[#272f67]/[0.08] px-1.5 py-0.5 text-[11px] font-semibold text-[#272f67] dark:bg-white/15 dark:text-white';

    let addonIndex = 0;

    return (
        <>
            <SectionCard
                title={t('projects.flow.billing')}
                collapsible
                action={
                    mainLine ? (
                        /* Faturalar için AYRI düğme — ödeme planının yanında durur
                           (kullanıcı isteği); satır tıklaması da çalışmayı sürdürür. */
                        <div className="flex items-center gap-2">
                            <Button size="sm" variant="secondary" onClick={() => setInvoicesOpen(true)}>
                                {t('billing.myInvoices')}
                            </Button>
                            <Button size="sm" variant="secondary" icon={<Coins01 size={13} />} onClick={() => setPlanFor(mainLine)}>
                                {t('billing.paymentPlan')}
                            </Button>
                        </div>
                    ) : undefined
                }
            >
                {/* Sipariş başına TEK sade satır — ana sipariş üstte, ekler "1. / 2."
                    diye ALTINDA listelenir; satır ya da ikon Details'i açar.
                    Sığmayan sütunlar yatay kaydırılır. */}
                {mainLine && (
                    <div className="grid gap-3 border-b border-slate-200 bg-slate-50/60 px-3 py-3 sm:grid-cols-[minmax(240px,1fr)_220px] dark:border-white/10 dark:bg-white/[0.03]">
                        <label className="block min-w-0">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('common.name')}</span>
                            <input
                                type="text"
                                value={salesperson}
                                onChange={(event) => setSalesperson(event.target.value)}
                                className={`${inputClass} h-10 w-full px-3 text-[13px]`}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-[11px] font-semibold text-slate-500 dark:text-slate-400">{t('billing.dueDate')}</span>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(event) => setDueDate(event.target.value)}
                                className={`${inputClass} h-10 w-full px-3 text-[13px]`}
                            />
                        </label>
                    </div>
                )}
                <div className="overflow-x-auto">
                <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[960px] text-[12px]">
                    <colgroup>
                        <ResizableCols keys={['order', 'total', 'billed', 'remaining', 'kind', 'amount'] as const} grid={grid} />
                        {/* Düğme sütunu sabit dar. */}
                        <col style={{ width: 124 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="relative px-3 py-1.5 text-left">
                                {t('projects.detail.colOrder')}
                                <ColResizeHandle {...grid.resizeProps('order', 'right')} />
                            </th>
                            <th className="relative px-3 py-1.5 text-right">
                                {t('billing.totalAmount')}
                                <ColResizeHandle {...grid.resizeProps('total', 'right')} />
                            </th>
                            <th className="relative px-3 py-1.5 text-right">
                                {t('billing.billed')}
                                <ColResizeHandle {...grid.resizeProps('billed', 'right')} />
                            </th>
                            <th className="relative px-3 py-1.5 text-right">
                                {t('billing.remaining')}
                                <ColResizeHandle {...grid.resizeProps('remaining', 'right')} />
                            </th>
                            <th className="relative px-3 py-1.5 text-left">
                                {t('billing.kindLabel')}
                                <ColResizeHandle {...grid.resizeProps('kind', 'right')} />
                            </th>
                            <th className="relative px-3 py-1.5 text-right">
                                {t('billing.amountLabel')}
                                <ColResizeHandle {...grid.resizeProps('amount', 'right')} />
                            </th>
                            {/* "Aktionen" başlığı yok — sütunda yalnızca Rechnung düğmesi
                                var, o yüzden sütun dar tutulur. */}
                            <th className="px-2 py-1.5" />

                        </tr>
                    </thead>
                    <tbody>
                        {ordered.map((line) => {
                            const remaining = lineRemainingPct(line);
                            const done = remaining <= 0.005;
                            const draft = draftOf(line);
                            const nextKind = deriveKind(
                                Number(line.summary?.billedPercent ?? linePct(line)),
                                draftPercent(line),
                                remaining,
                            );
                            // Ana siparişin yanına etiket yazılmaz; yalnızca ekler numaralanır.
                            if (line.isAddon) addonIndex += 1;
                            const label = line.isAddon ? `${line.addonIndex ?? addonIndex}. ${t('projects.addonOrder')}` : '';
                            return (
                                <Fragment key={line.id}>
                                <tr
                                    onClick={() => setInvoicesOpen(true)}
                                    title={t('billing.invoicesTitle')}
                                    /* Ekranın geri kalanının kapsandığı sipariş hafifçe vurgulanır. */
                                    className={`cursor-pointer ${line.id === activeOrderId ? 'bg-[#eef4ff]/60 dark:bg-white/[0.06]' : ''}`}
                                >
                                    {/* Ek siparişler ananın ALTINDA içerlek listelenir. */}
                                    <td className={`whitespace-nowrap py-1.5 pr-3 ${line.isAddon ? 'pl-8' : 'pl-3'}`}>
                                        <span className="font-semibold text-slate-900 dark:text-white">{line.orderNumber}</span>
                                        {(label || line.revisionNumber) && (
                                            <span className="ml-2 text-[10.5px] text-slate-400 dark:text-slate-500">
                                                {label}
                                                {line.revisionNumber ? `${label ? ' · ' : ''}N${line.revisionNumber}` : ''}
                                            </span>
                                        )}
                                    </td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold text-slate-900 dark:text-white">{fmtMoney(lineTotal(line))}</td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-emerald-600">
                                        {fmtMoney(lineBilled(line))} <span className="text-[10.5px] opacity-80">· {linePct(line)}%</span>
                                    </td>
                                    <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono ${done ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {fmtMoney(round2(lineTotal(line) - lineBilled(line)))} <span className="text-[10.5px] opacity-80">· {Math.round(remaining)}%</span>
                                    </td>
                                    {/* Fatura girişi DOĞRUDAN tabloda: tür otomatik + % ↔ CHF. */}
                                    {done ? (
                                        <td colSpan={2} className="whitespace-nowrap px-3 py-1.5">
                                            <span className="inline-flex items-center gap-1 text-[11.5px] font-semibold text-emerald-600">
                                                <Check size={12} strokeWidth={3} />{t('billing.invoiceCreatedChip')}
                                            </span>
                                        </td>
                                    ) : (
                                        <>
                                            <td className="whitespace-nowrap px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                <span className={kindChip}>{t(`billing.kind_${nextKind}`)}</span>
                                            </td>
                                            <td className="whitespace-nowrap px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-2">
                                                    <div className="relative w-[92px]">
                                                        <input
                                                            type="number"
                                                            min={0.01}
                                                            max={Math.min(100, remaining)}
                                                            value={draft.pct}
                                                            onChange={(e) => setDraftPct(line, e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') void bill(line); }}
                                                            aria-label={t('billing.percentLabel')}
                                                            /* inputClass'ta yatay boşluk yok — sayı kenara yapışmasın
                                                               diye pl-3, % işaretine değmesin diye pr-7. */
                                                            className={`${inputClass} h-9 w-full pl-3 pr-7 text-right font-mono text-[13px] font-semibold`}
                                                        />
                                                        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-[11px] font-semibold text-slate-500 dark:text-slate-400">%</span>
                                                    </div>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={draft.amt}
                                                        onChange={(e) => setDraftAmt(line, e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') void bill(line); }}
                                                        aria-label={t('billing.amountLabel')}
                                                        className={`${inputClass} h-9 w-[132px] px-3 text-right font-mono text-[13px] font-semibold`}
                                                    />
                                                </div>
                                            </td>
                                        </>
                                    )}
                                    {/* Doğrudan "Rechnung" düğmesi — başlıksız, ikonsuz
                                        (kullanıcı isteği). Faturalar ve ödeme durumu için
                                        satırın kendisi popup'ı açar. */}
                                    {/* Dar sütun, BÜYÜK düğme: düğme sütunu doldurur. */}
                                    <td className="whitespace-nowrap px-2 py-1.5 text-right" onClick={(e) => e.stopPropagation()}>
                                        {!done && (
                                            <Button size="lg" variant="primary" className="w-full" loading={billingId === line.id} onClick={() => void bill(line)}>
                                                {t('billing.newInvoice')}
                                            </Button>
                                        )}
                                    </td>
                                </tr>
                                {/* Fatura şeridi — Rechnungsnummer, Rechnungsdatum,
                                    Verkäufer, Fälligkeit (EN SONDA, kullanıcı isteği) —
                                    satırın hemen altında her zaman görünür durur.
                                    Numara sunucuda üretilir (salt-okunur "Automatisch");
                                    Fälligkeit elle değişmedikçe Rechnungsdatum'u izler.
                                    Kommission ŞERİTTE YOK — belgeye doğrudan tekliften
                                    gelir, burada girilmez (kullanıcı isteği). */}
                                </Fragment>
                            );
                        })}
                        {ordered.length > 1 && (
                            <tr className="border-t border-slate-200 dark:border-white/10">
                                <td className="px-3 py-1.5 text-[11.5px] font-semibold text-slate-600 dark:text-slate-300">{t('common.total')}</td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-[12px] font-bold text-slate-900 dark:text-white">{fmtMoney(totals.total)}</td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-[12px] font-bold text-emerald-600">{fmtMoney(totals.billed)}</td>
                                <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono text-[12px] font-bold text-amber-600">{fmtMoney(Math.max(0, totals.remaining))}</td>
                                <td colSpan={3} />
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>

                {/* Raporlar & belgeler (sipariş detayı sağlıyorsa) — tek satırlar. */}
                {documents && documents.length > 0 && (
                    <table data-inv-table data-grid-lines data-unstyled-table className="mt-4 w-full min-w-[520px] max-w-[880px]">
                        <thead>
                            <tr>
                                <th className="px-3 py-1.5 text-left">{t('billing.reportsDocs')}</th>
                                <th className="px-3 py-1.5 text-left">{t('common.type')}</th>
                                <th className="px-3 py-1.5 text-right">{t('common.date')}</th>
                                <th className="px-3 py-1.5 text-right">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((row) => (
                                <tr key={row.id}>
                                    <td className="whitespace-nowrap px-3 py-1.5 font-medium text-slate-800 dark:text-slate-100">{row.label}</td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-slate-500 dark:text-slate-400">{row.type}</td>
                                    <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">{fmtDate(row.date)}</td>
                                    <td className={`whitespace-nowrap px-3 py-1.5 text-right text-[11.5px] font-semibold ${row.signed ? 'text-emerald-600' : 'text-amber-600'}`}>
                                        {row.signed ? t('projects.complete.signedLabel') : t('projects.complete.unsignedLabel')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </SectionCard>

            {/* Faturalar popup'ı — ana siparişin faturaları ÜSTTE, ek siparişlerinkiler
                kendi başlıkları altında ALTINDA (kullanıcı isteği). */}
            <BottomSheet
                open={invoicesOpen}
                title={t('billing.invoicesTitle')}
                subtitle={scope[0]?.orderNumber}
                onClose={() => setInvoicesOpen(false)}
                /* Geniş ama ALÇAK: tablo yayılsın, popup ekranı kaplamasın. */
                width={1320}
                height={520}
                zIndex={84}
            >
                {/* İnce satırlı, standart tablo — dolgu az, satırlar alçak. */}
                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                    <div className="overflow-x-auto">
                    <table data-inv-table data-grid-lines data-unstyled-table className="w-full min-w-[760px] text-[12px]">
                        <thead>
                            <tr>
                                <th className="px-3 py-1.5 text-left">{t('billing.invoiceNumber')}</th>
                                <th className="px-3 py-1.5 text-left">{t('billing.kindLabel')}</th>
                                <th className="px-3 py-1.5 text-right">{t('billing.invoiceDate')}</th>
                                <th className="px-3 py-1.5 text-right">{t('billing.dueDate')}</th>
                                <th className="px-3 py-1.5 text-right">{t('billing.share')}</th>
                                <th className="px-3 py-1.5 text-right">{t('billing.amountLabel')}</th>
                                <th className="px-3 py-1.5 text-left">{t('billing.paymentStatus')}</th>
                                <th className="px-3 py-1.5 text-right">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoicesLoading ? (
                                <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">{t('common.loading')}</td></tr>
                            ) : invoiceGroups.every((group) => group.invoices.length === 0) ? (
                                <tr><td colSpan={8} className="px-3 py-4 text-center text-slate-400">{t('billing.noInvoices')}</td></tr>
                            ) : invoiceGroups.map((group) => [
                                /* Sipariş başlığı: AÇIK olan sipariş düz başlıktır
                                   (tıklanmaz — zaten oradasınız), diğerleri tıklanınca
                                   o siparişe geçer. */
                                <tr key={`head-${group.id}`} className="bg-slate-50 dark:bg-white/[0.04]">
                                    <td colSpan={8} className="whitespace-nowrap p-0">
                                        {group.id === activeOrderId ? (
                                            <div className="flex w-full items-center gap-2 px-3 py-1.5">
                                                <span className="font-semibold text-slate-900 dark:text-white">{group.orderNumber}</span>
                                                <span className="rounded bg-white px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15">{group.label}</span>
                                                <span className="ml-auto text-[11px] font-semibold text-slate-400 dark:text-slate-500">{t('billing.currentOrder')}</span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => openOrder(group.id)}
                                                title={t('billing.openOrderInvoices')}
                                                className="group/order flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-[#eef4ff] dark:hover:bg-white/10"
                                            >
                                                {/* "Zur Abrechnung" etiketi YOK (kullanıcı isteği);
                                                    tıklanabilirliği altı çizilen sipariş numarası
                                                    anlatır. */}
                                                <span className="font-semibold text-[#272f67] underline-offset-2 group-hover/order:underline dark:text-white">{group.orderNumber}</span>
                                                <span className="rounded bg-white px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-slate-500 ring-1 ring-inset ring-slate-200 dark:bg-white/10 dark:text-slate-300 dark:ring-white/15">{group.label}</span>
                                            </button>
                                        )}
                                    </td>
                                </tr>,
                                ...(group.invoices.length === 0
                                    ? [(
                                        <tr key={`empty-${group.id}`}>
                                            <td colSpan={8} className="px-3 py-2 text-center text-[11.5px] text-slate-400">{t('billing.noInvoices')}</td>
                                        </tr>
                                    )]
                                    : group.invoices.map((invoice) => {
                                        const cancelled = invoice.status === 'CANCELLED';
                                        const paid = invoice.status === 'PAID';
                                        // Zahlungsplan ikonu yalnızca tabloda satırı olan sipariş
                                        // için gösterilir (planı ancak orada biliyoruz).
                                        const planLine = ordered.find((line) => line.id === invoice.salesOrderId) ?? null;
                                        const stages = planLine ? lineStages(planLine) : null;
                                        return (
                                    <tr key={invoice.id} className={cancelled ? 'opacity-45' : ''}>
                                        <td className="whitespace-nowrap px-3 py-1.5">
                                            <span className={`font-semibold text-slate-900 dark:text-white ${cancelled ? 'line-through' : ''}`}>
                                                {invoice.invoiceNumber}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-1.5 text-slate-600 dark:text-slate-300">
                                            {t(`billing.kind_${(invoice.kind || 'RECHNUNG') as InvoiceKind}`)}
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</td>
                                        <td className="whitespace-nowrap px-3 py-1.5 text-right text-slate-500 dark:text-slate-400">{fmtDate(invoice.dueDate)}</td>
                                        <td className="whitespace-nowrap px-3 py-1.5 text-right font-mono font-semibold text-slate-700 dark:text-slate-200">{Math.round(invoice.billedPercent)}%</td>
                                        <td className={`whitespace-nowrap px-3 py-1.5 text-right font-mono font-bold ${paid ? 'text-emerald-600' : 'text-slate-900 dark:text-white'}`}>{fmtMoney(invoice.amount)}</td>
                                        {/* Zahlungseingang: bezahlt = dolu onay rozeti, offen = boş
                                            halka (para simgesi kullanılmaz — kullanıcı isteği). */}
                                        <td className="whitespace-nowrap px-3 py-1.5">
                                            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-bold uppercase tracking-wide ring-1 ring-inset ${PAYMENT_BADGE[invoice.status]}`}>
                                                {paid ? (
                                                    <CheckCircle size={13} />
                                                ) : cancelled ? (
                                                    <X size={13} />
                                                ) : (
                                                    <span aria-hidden className="inline-block size-2.5 rounded-full border-[2px] border-current" />
                                                )}
                                                {cancelled ? t('billing.groupCancelled') : paid ? t('billing.groupPaid') : t('billing.groupOpen')}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap px-3 py-1.5">
                                            {cancelled ? (
                                                /* Storniert: yalnızca kalıcı silme (çöp kutusu). */
                                                <div className="flex items-center justify-end">
                                                    <button
                                                        type="button"
                                                        className={`${iconBtn} rounded-md hover:!text-red-600`}
                                                        title={t('billing.deleteForever')}
                                                        disabled={busyId === invoice.id}
                                                        onClick={() => void removeForever(invoice)}
                                                    >
                                                        <Trash01 size={13} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="flex items-center justify-end gap-1.5">
                                                    {/* Vorschau / PDF: küçük çizgi ikonlar yerine BELİRGİN
                                                        renkli görseller (kullanıcı isteği). */}
                                                    <button type="button" className={`${assetBtn} text-[#272f67] dark:text-white`} title={t('billing.previewBtn')} aria-label={t('billing.previewBtn')} disabled={busyId === invoice.id} onClick={() => void preview(invoice)}>
                                                        <Eye size={28} strokeWidth={1.8} />
                                                    </button>
                                                    <button type="button" className={`${assetBtn} text-red-600 dark:text-red-400`} title={t('billing.downloadBtn')} aria-label={t('billing.downloadBtn')} disabled={busyId === invoice.id} onClick={() => void download(invoice)}>
                                                        <FileDownload02 size={28} strokeWidth={1.8} />
                                                    </button>
                                                    {stages && stages.length > 0 && planLine && (
                                                        <button type="button" className={`${iconBtn} rounded-md`} title={t('billing.paymentPlan')} onClick={() => setPlanFor(planLine)}>
                                                            <InfoCircle size={13} />
                                                        </button>
                                                    )}
                                                    {!paid && (
                                                        <>
                                                            <button type="button" className={`${iconBtn} rounded-md hover:!text-emerald-600`} title={t('billing.markPaid')} disabled={busyId === invoice.id} onClick={() => void setStatus(invoice, 'PAID')}>
                                                                <Check size={13} strokeWidth={2.5} />
                                                            </button>
                                                            <button type="button" className={`${iconBtn} rounded-md`} title={t('crm.invoiceCancel')} disabled={busyId === invoice.id} onClick={() => void setStatus(invoice, 'CANCELLED')}>
                                                                <X size={13} />
                                                            </button>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                        );
                                    })
                                ),
                            ])}
                        </tbody>
                    </table>
                    </div>
                </div>
            </BottomSheet>

            {/* PDF önizleme popup'ı — YALNIZCA kesilmiş bir faturanın göz
                ikonundan açılır; faturalama artık popup açmaz. */}
            <BottomSheet
                open={previewUrl !== null}
                title={previewInvoice?.invoiceNumber || t('billing.previewBtn')}
                subtitle={previewInvoice ? t(`billing.kind_${(previewInvoice.kind || 'RECHNUNG') as InvoiceKind}`) : undefined}
                onClose={releasePreview}
                width={920}
                height={760}
                zIndex={88}
            >
                <div className="min-h-0 flex-1 p-3">
                    {previewUrl && (
                        <iframe title={t('billing.previewBtn')} src={previewUrl} className="size-full rounded-lg border border-slate-200 dark:border-white/10" />
                    )}
                </div>
            </BottomSheet>

            <PaymentPlanSheet
                open={activePlanLine !== null}
                onClose={() => setPlanFor(null)}
                orderNumber={activePlanLine?.orderNumber || ''}
                salesOrderId={activePlanLine?.id || ''}
                stages={activePlanLine ? lineStages(activePlanLine) : null}
                baseTotal={activePlanLine ? lineTotal(activePlanLine) : 0}
                billedPercent={Number(activePlanLine?.summary?.billedPercent) || 0}
                paidPercent={Number(activePlanLine?.summary?.paidPercent) || 0}
                /* Plan kaydedilince özetler tazelenir — "sıradaki taksit" önerisi
                   ve proje/sipariş görünümleri yeni planı aynı anda görür. */
                onSaved={() => void onReload()}
            />
        </>
    );
};
