import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { toast } from 'sonner';
import { Check, CheckCircle, ChevronDown, Coins01, Eye, FileDownload02, InfoCircle, Send01, Trash01, X } from '@/components/icons/antIconCompat';
import { openMailCompose } from '@/components/mail/mailComposeBus';
import { ColResizeHandle, ResizableCols } from '@/components/ui-shared/TableKit';
import { useColumnWidths } from '@/hooks/useColumnWidths';
import { billingApi } from '@/lib/api/billing';
import { openAmount } from '@/lib/orderBillingTotals';
import { parsePaymentStages } from '@/lib/paymentSchedule';
import { usePdfSettings } from '@/store/pdfSettingsStore';
import { t } from '@/i18n/translate';
import type { BillingSummaryDto, InvoiceDto, InvoiceKind, InvoiceStatus } from '@/types/billing';
import type { InvoiceOrderContext } from '@/utils/pdf/invoicePdf';
import { InvoicePopup } from './InvoicePopup';
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
/**
 * Açık bakiye — %100 faturalandırılmış bir siparişte 0.00'dır, kalan kuruş
 * yalnızca yuvarlama tozu olduğu için (bkz. `openAmount`).
 */
const lineOpen = (line: BillingLineInput) =>
    openAmount(line.summary?.billedPercent, lineTotal(line), lineBilled(line));
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
 * ödenmedi mi renkli ve YAZILI rozetten tek bakışta anlaşılır. Google-clean
 * kılıkta (19.08.2026) rozet halka değil, YUMUŞAK dolgulu bir hap: yeşil
 * ödendi, kehribar açık, gri iptal.
 */
const PAYMENT_STATE: Record<InvoiceStatus, string> = {
    PAID: 'is-paid',
    ISSUED: 'is-open',
    CANCELLED: 'is-cancelled',
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
    const settings = usePdfSettings();
    const navigate = useNavigate();
    /**
     * Sütunlar sürüklenerek genişletilip daraltılır (kullanıcı isteği).
     * "Rechnungsart" dar tutulur — içindeki rozet zaten kısa.
     */
    const grid = useColumnWidths({
        // v2 = das Google-clean Kleid (19.08.2026): die Rechnungsart-Marke ist
        // eine Pille geworden und braucht ihre Spalte etwas breiter, sonst
        // steht "Gesamtrechnung" halb unter dem Prozentfeld.
        storageKey: 'offitec:order-billing:col-widths:v2',
        defaults: { order: 210, total: 140, billed: 160, remaining: 160, kind: 150, amount: 236 },
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
        else navigate(`/sales/orders/${orderId}?tab=billing`);
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
        // "Offen" satırların KENDİ açık bakiyelerinin toplamıdır: her satır
        // yuvarlama tozunu zaten düşürdü, `total - billed` deseydik toz grup
        // seviyesinde geri gelirdi (üç sipariş → CHF 0.03).
        return { total, billed, remaining: round2(ordered.reduce((sum, line) => sum + lineOpen(line), 0)) };
    }, [ordered]);

    // Der Zahlungsplan hängt am AUFTRAG, nicht an der Rechnung: er wird hier in
    // den PDF-Kontext gemischt, damit die Vollrechnung ihn am Dokumentende als
    // eigene Tabelle drucken kann.
    const contexts = useMemo(
        () => Object.fromEntries(ordered.map((line) => [line.id, { ...line.context, paymentStages: lineStages(line) }])),
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

    /** Rechnung per E-Mail: PDF wird gebaut und im Schreiben-Fenster angehängt —
        Empfänger/Betreff vorbelegt, Kundenbezug gesetzt (landet in der
        Kundenkommunikation). Versand über das Outlook-Postfach des Benutzers,
        sonst SMTP. */
    const sendByMail = async (invoice: InvoiceDto) => {
        setBusyId(invoice.id);
        try {
            const { buildInvoicePdfBytes } = await import('@/utils/pdf/invoicePdf');
            const bytes = await buildInvoicePdfBytes(invoice, contextOf(invoice), settings);
            const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
            const customer = invoice.customer || (invoice.customerId ? { id: invoice.customerId, companyName: contextOf(invoice).customerName || '' } : null);
            openMailCompose({
                subject: t('mail.invoice.subject', { number: invoice.invoiceNumber }),
                body: t('mail.invoice.body', { number: invoice.invoiceNumber }),
                customer,
                entity: { type: 'INVOICE', id: invoice.id, label: invoice.invoiceNumber },
                attachments: [{ filename: `${invoice.invoiceNumber}.pdf`, contentType: 'application/pdf', blob, size: blob.size }],
            });
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
    /**
     * Vorschau / PDF / Mail — die Symbole des Moduls sitzen in runden Feldern,
     * deren Fläche erst beim Überfahren erscheint (Google-clean, 19.08.2026).
     * Die Farbe bleibt die alte Unterscheidung: Vorschau navy, PDF rot.
     */
    const [cardOpen, setCardOpen] = useState(true);

    let addonIndex = 0;

    return (
        <>
            <section className="ofi-inv-card ofi-inv-scope">
                <header className="ofi-inv-card__head">
                    <button
                        type="button"
                        onClick={() => setCardOpen((value) => !value)}
                        aria-expanded={cardOpen}
                        title={cardOpen ? t('common.collapse') : t('common.expand')}
                        className="ofi-inv-card__toggle ofi-inv-card__title"
                    >
                        <ChevronDown size={14} className="ofi-inv-card__chev" />
                        <span className="truncate">{t('projects.flow.billing')}</span>
                    </button>
                    {/* Faturalar için AYRI düğme — ödeme planının yanında durur
                        (kullanıcı isteği); satır tıklaması da çalışmayı sürdürür. */}
                    {mainLine && (
                        <div className="ofi-inv-card__actions">
                            <button type="button" className="ofi-inv-btn" onClick={() => setInvoicesOpen(true)}>
                                {t('billing.myInvoices')}
                            </button>
                            <button type="button" className="ofi-inv-btn" onClick={() => setPlanFor(mainLine)}>
                                <Coins01 size={14} />
                                {t('billing.paymentPlan')}
                            </button>
                        </div>
                    )}
                </header>

                {cardOpen && (
                <div className="ofi-inv-card__body">
                {/* Verkäufer + Fälligkeit — zwei Felder auf der weissen Fläche,
                    RECHTSBÜNDIG wie jedes Feld des Moduls (Vorgabe 19.08.2026:
                    geschrieben wird von ganz rechts her). */}
                {mainLine && (
                    <div className="ofi-inv-meta">
                        <label className="ofi-inv-field">
                            <span className="ofi-inv-field__label">{t('common.name')}</span>
                            <input
                                type="text"
                                value={salesperson}
                                onChange={(event) => setSalesperson(event.target.value)}
                                className="ofi-inv-input"
                            />
                        </label>
                        <label className="ofi-inv-field">
                            <span className="ofi-inv-field__label">{t('billing.dueDate')}</span>
                            <input
                                type="date"
                                value={dueDate}
                                onChange={(event) => setDueDate(event.target.value)}
                                className="ofi-inv-input"
                            />
                        </label>
                    </div>
                )}
                {/* Sipariş başına TEK sade satır — ana sipariş üstte, ekler "1. / 2."
                    diye ALTINDA listelenir; satır ya da ikon Details'i açar.
                    Sığmayan sütunlar yatay kaydırılır. */}
                <div className="ofi-inv-scroll">
                <table data-inv-table data-unstyled-table className="w-full min-w-[960px]">
                    <colgroup>
                        <ResizableCols keys={['order', 'total', 'billed', 'remaining', 'kind', 'amount'] as const} grid={grid} />
                        {/* Düğme sütunu sabit dar. */}
                        <col style={{ width: 132 }} />
                    </colgroup>
                    <thead>
                        <tr>
                            <th className="relative text-left">
                                {t('projects.detail.colOrder')}
                                <ColResizeHandle {...grid.resizeProps('order')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.totalAmount')}
                                <ColResizeHandle {...grid.resizeProps('total')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.billed')}
                                <ColResizeHandle {...grid.resizeProps('billed')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.remaining')}
                                <ColResizeHandle {...grid.resizeProps('remaining')} />
                            </th>
                            <th className="relative text-left">
                                {t('billing.kindLabel')}
                                <ColResizeHandle {...grid.resizeProps('kind')} />
                            </th>
                            <th className="relative text-right">
                                {t('billing.amountLabel')}
                                <ColResizeHandle {...grid.resizeProps('amount')} />
                            </th>
                            {/* "Aktionen" başlığı yok — sütunda yalnızca Rechnung düğmesi
                                var, o yüzden sütun dar tutulur. */}
                            <th />
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
                                    className={`is-link ${line.id === activeOrderId ? 'is-current' : ''}`}
                                >
                                    {/* Ek siparişler ananın ALTINDA içerlek listelenir. */}
                                    <td className={`whitespace-nowrap ${line.isAddon ? 'pl-8' : ''}`}>
                                        <span className="ofi-inv-name">{line.orderNumber}</span>
                                        {(label || line.revisionNumber) && (
                                            <span className="ofi-inv-sub">
                                                {label}
                                                {line.revisionNumber ? `${label ? ' · ' : ''}N${line.revisionNumber}` : ''}
                                            </span>
                                        )}
                                    </td>
                                    <td className="ofi-inv-num is-strong">{fmtMoney(lineTotal(line))}</td>
                                    <td className="ofi-inv-num is-billed">
                                        {fmtMoney(lineBilled(line))}<span className="ofi-inv-num__sub">· {linePct(line)}%</span>
                                    </td>
                                    <td className={`ofi-inv-num ${done ? 'is-billed' : 'is-open'}`}>
                                        {fmtMoney(lineOpen(line))}<span className="ofi-inv-num__sub">· {Math.round(remaining)}%</span>
                                    </td>
                                    {/* Fatura girişi DOĞRUDAN tabloda: tür otomatik + % ↔ CHF. */}
                                    {done ? (
                                        <td colSpan={2} className="whitespace-nowrap">
                                            <span className="ofi-inv-done">
                                                <Check size={13} strokeWidth={3} />{t('billing.invoiceCreatedChip')}
                                            </span>
                                        </td>
                                    ) : (
                                        <>
                                            <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                <span className="ofi-inv-kind">{t(`billing.kind_${nextKind}`)}</span>
                                            </td>
                                            {/* Beide Felder werden von ganz RECHTS her
                                                geschrieben — die Ziffern stehen beim
                                                Tippen schon in der Spalte, in der sie
                                                nachher gelesen werden. */}
                                            <td className="whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                                                <div className="ofi-inv-entry">
                                                    <span className="ofi-inv-unit">
                                                        <input
                                                            type="number"
                                                            min={0.01}
                                                            max={Math.min(100, remaining)}
                                                            value={draft.pct}
                                                            onChange={(e) => setDraftPct(line, e.target.value)}
                                                            onKeyDown={(e) => { if (e.key === 'Enter') void bill(line); }}
                                                            aria-label={t('billing.percentLabel')}
                                                            className="ofi-inv-input"
                                                        />
                                                        <span className="ofi-inv-unit__mark">%</span>
                                                    </span>
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={draft.amt}
                                                        onChange={(e) => setDraftAmt(line, e.target.value)}
                                                        onKeyDown={(e) => { if (e.key === 'Enter') void bill(line); }}
                                                        aria-label={t('billing.amountLabel')}
                                                        className="ofi-inv-input"
                                                    />
                                                </div>
                                            </td>
                                        </>
                                    )}
                                    {/* Doğrudan "Rechnung" düğmesi — başlıksız, ikonsuz
                                        (kullanıcı isteği). Faturalar ve ödeme durumu için
                                        satırın kendisi popup'ı açar. */}
                                    <td className="whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                                        {!done && (
                                            <button
                                                type="button"
                                                className="ofi-inv-btn is-primary is-block"
                                                disabled={billingId === line.id}
                                                onClick={() => void bill(line)}
                                            >
                                                {billingId === line.id && <span aria-hidden className="ofi-tp-spinner" />}
                                                {t('billing.newInvoice')}
                                            </button>
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
                            <tr className="ofi-inv-total">
                                <td className="ofi-inv-muted">{t('common.total')}</td>
                                <td className="ofi-inv-num is-strong">{fmtMoney(totals.total)}</td>
                                <td className="ofi-inv-num is-strong is-billed">{fmtMoney(totals.billed)}</td>
                                <td className="ofi-inv-num is-strong is-open">{fmtMoney(Math.max(0, totals.remaining))}</td>
                                <td colSpan={3} />
                            </tr>
                        )}
                    </tbody>
                </table>
                </div>

                {/* Raporlar & belgeler (sipariş detayı sağlıyorsa) — tek satırlar. */}
                {documents && documents.length > 0 && (
                    <div className="ofi-inv-scroll">
                    <table data-inv-table data-unstyled-table className="w-full min-w-[520px] max-w-[880px]">
                        <thead>
                            <tr>
                                <th className="text-left">{t('billing.reportsDocs')}</th>
                                <th className="text-left">{t('common.type')}</th>
                                <th className="text-right">{t('common.date')}</th>
                                <th className="text-right">{t('common.status')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {documents.map((row) => (
                                <tr key={row.id}>
                                    <td className="whitespace-nowrap"><span className="ofi-inv-name">{row.label}</span></td>
                                    <td className="whitespace-nowrap ofi-inv-muted">{row.type}</td>
                                    <td className="ofi-inv-num ofi-inv-muted">{fmtDate(row.date)}</td>
                                    <td className={`ofi-inv-num ${row.signed ? 'is-billed' : 'is-open'}`}>
                                        {row.signed ? t('projects.complete.signedLabel') : t('projects.complete.unsignedLabel')}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    </div>
                )}
                </div>
                )}
            </section>

            {/* Faturalar popup'ı — ana siparişin faturaları ÜSTTE, ek siparişlerinkiler
                kendi başlıkları altında ALTINDA (kullanıcı isteği). Bodenblatt YOK:
                Kalender'in schwebende Karte'si (19.08.2026). */}
            <InvoicePopup
                open={invoicesOpen}
                title={t('billing.invoicesTitle')}
                subtitle={scope[0]?.orderNumber}
                onClose={() => setInvoicesOpen(false)}
                size="wide"
            >
                {/* İnce satırlı, standart tablo — dolgu az, satırlar alçak. */}
                <div className="ofi-inv-pop__scroll">
                    <table data-inv-table data-unstyled-table className="w-full min-w-[760px]">
                        <thead>
                            <tr>
                                <th className="text-left">{t('billing.invoiceNumber')}</th>
                                <th className="text-left">{t('billing.kindLabel')}</th>
                                <th className="text-right">{t('billing.invoiceDate')}</th>
                                <th className="text-right">{t('billing.dueDate')}</th>
                                <th className="text-right">{t('billing.share')}</th>
                                <th className="text-right">{t('billing.amountLabel')}</th>
                                <th className="text-left">{t('billing.paymentStatus')}</th>
                                <th className="text-right">{t('common.actions')}</th>
                            </tr>
                        </thead>
                        <tbody>
                            {invoicesLoading ? (
                                <tr><td colSpan={8} className="ofi-inv-empty">{t('common.loading')}</td></tr>
                            ) : invoiceGroups.every((group) => group.invoices.length === 0) ? (
                                <tr><td colSpan={8} className="ofi-inv-empty">{t('billing.noInvoices')}</td></tr>
                            ) : invoiceGroups.map((group) => [
                                /* Sipariş başlığı: AÇIK olan sipariş düz başlıktır
                                   (tıklanmaz — zaten oradasınız), diğerleri tıklanınca
                                   o siparişe geçer. */
                                <tr key={`head-${group.id}`} className="ofi-inv-group">
                                    <td colSpan={8} className="whitespace-nowrap">
                                        {group.id === activeOrderId ? (
                                            <div className="ofi-inv-group__inner">
                                                <span className="ofi-inv-group__num">{group.orderNumber}</span>
                                                <span className="ofi-inv-group__tag">{group.label}</span>
                                                <span className="ofi-inv-group__here">{t('billing.currentOrder')}</span>
                                            </div>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => openOrder(group.id)}
                                                title={t('billing.openOrderInvoices')}
                                                className="ofi-inv-group__inner"
                                            >
                                                {/* "Zur Abrechnung" etiketi YOK (kullanıcı isteği);
                                                    tıklanabilirliği altı çizilen sipariş numarası
                                                    anlatır. */}
                                                <span className="ofi-inv-group__num">{group.orderNumber}</span>
                                                <span className="ofi-inv-group__tag">{group.label}</span>
                                            </button>
                                        )}
                                    </td>
                                </tr>,
                                ...(group.invoices.length === 0
                                    ? [(
                                        <tr key={`empty-${group.id}`}>
                                            <td colSpan={8} className="ofi-inv-empty">{t('billing.noInvoices')}</td>
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
                                    <tr key={invoice.id} className={cancelled ? 'is-muted' : ''}>
                                        <td className="whitespace-nowrap">
                                            <span className={`ofi-inv-name ${cancelled ? 'is-struck' : ''}`}>
                                                {invoice.invoiceNumber}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap ofi-inv-muted">
                                            {t(`billing.kind_${(invoice.kind || 'RECHNUNG') as InvoiceKind}`)}
                                        </td>
                                        <td className="ofi-inv-num ofi-inv-muted">{fmtDate(invoice.invoiceDate || invoice.createdAt)}</td>
                                        <td className="ofi-inv-num ofi-inv-muted">{fmtDate(invoice.dueDate)}</td>
                                        <td className="ofi-inv-num">{Math.round(invoice.billedPercent)}%</td>
                                        <td className={`ofi-inv-num is-strong ${paid ? 'is-billed' : ''}`}>{fmtMoney(invoice.amount)}</td>
                                        {/* Zahlungseingang: bezahlt = dolu onay rozeti, offen = boş
                                            halka (para simgesi kullanılmaz — kullanıcı isteği). */}
                                        <td className="whitespace-nowrap">
                                            <span className={`ofi-inv-state ${PAYMENT_STATE[invoice.status]}`}>
                                                {paid ? (
                                                    <CheckCircle size={13} />
                                                ) : cancelled ? (
                                                    <X size={13} />
                                                ) : (
                                                    <span aria-hidden className="ofi-inv-state__ring" />
                                                )}
                                                {cancelled ? t('billing.groupCancelled') : paid ? t('billing.groupPaid') : t('billing.groupOpen')}
                                            </span>
                                        </td>
                                        <td className="whitespace-nowrap">
                                            {cancelled ? (
                                                /* Storniert: yalnızca kalıcı silme (çöp kutusu). */
                                                <div className="ofi-inv-glyphs">
                                                    <button
                                                        type="button"
                                                        className="ofi-inv-glyph is-danger"
                                                        title={t('billing.deleteForever')}
                                                        disabled={busyId === invoice.id}
                                                        onClick={() => void removeForever(invoice)}
                                                    >
                                                        <Trash01 size={16} />
                                                    </button>
                                                </div>
                                            ) : (
                                                <div className="ofi-inv-glyphs">
                                                    {/* Vorschau / PDF / Mail — die drei Symbole
                                                        des Dokuments, gleich gross und ruhig;
                                                        die Farbe unterscheidet sie. */}
                                                    <button type="button" className="ofi-inv-glyph is-accent" title={t('billing.previewBtn')} aria-label={t('billing.previewBtn')} disabled={busyId === invoice.id} onClick={() => void preview(invoice)}>
                                                        <Eye size={17} strokeWidth={1.8} />
                                                    </button>
                                                    <button type="button" className="ofi-inv-glyph is-pdf" title={t('billing.downloadBtn')} aria-label={t('billing.downloadBtn')} disabled={busyId === invoice.id} onClick={() => void download(invoice)}>
                                                        <FileDownload02 size={17} strokeWidth={1.8} />
                                                    </button>
                                                    <button type="button" className="ofi-inv-glyph is-accent" title={t('mail.invoice.sendBtn')} aria-label={t('mail.invoice.sendBtn')} disabled={busyId === invoice.id} onClick={() => void sendByMail(invoice)}>
                                                        <Send01 size={17} strokeWidth={1.8} />
                                                    </button>
                                                    {stages && stages.length > 0 && planLine && (
                                                        <button type="button" className="ofi-inv-glyph" title={t('billing.paymentPlan')} onClick={() => setPlanFor(planLine)}>
                                                            <InfoCircle size={16} />
                                                        </button>
                                                    )}
                                                    {!paid && (
                                                        <>
                                                            <button type="button" className="ofi-inv-glyph is-ok" title={t('billing.markPaid')} disabled={busyId === invoice.id} onClick={() => void setStatus(invoice, 'PAID')}>
                                                                <Check size={16} strokeWidth={2.5} />
                                                            </button>
                                                            <button type="button" className="ofi-inv-glyph is-danger" title={t('crm.invoiceCancel')} disabled={busyId === invoice.id} onClick={() => void setStatus(invoice, 'CANCELLED')}>
                                                                <X size={16} />
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
            </InvoicePopup>

            {/* PDF önizleme popup'ı — YALNIZCA kesilmiş bir faturanın göz
                ikonundan açılır; faturalama artık popup açmaz. */}
            <InvoicePopup
                open={previewUrl !== null}
                title={previewInvoice?.invoiceNumber || t('billing.previewBtn')}
                subtitle={previewInvoice ? t(`billing.kind_${(previewInvoice.kind || 'RECHNUNG') as InvoiceKind}`) : undefined}
                onClose={releasePreview}
                size="compact"
                fill
            >
                {previewUrl && (
                    <iframe title={t('billing.previewBtn')} src={previewUrl} className="ofi-inv-frame" />
                )}
            </InvoicePopup>

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
