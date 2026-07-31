import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Edit01, FileDownload02, PackagePlus, Send01, Trash01 } from '@/components/icons/antIconCompat';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';
import { BottomSheet } from './BottomSheet';
import { fmtDateTime, fmtMoneyIn, fmtQty } from '../utils/format';
import { EXTRA_DISCOUNT_KEYS, fmtPercent, orderGrandTotal } from '../utils/orderPricing';
import { ORDER_STATUS_META } from '../utils/orderStatus';

type SheetView = 'overview' | 'pdf' | 'mail';
type SlideDir = 'right' | 'left' | 'rise';

const ANIM_CLASS: Record<SlideDir, string> = {
    right: 'ofi-slide-in-right',
    left: 'ofi-slide-in-left',
    rise: 'ofi-rise-in',
};

const VIEW_SEQUENCE: SheetView[] = ['overview', 'pdf', 'mail'];
const PDF_LANGS: OrderPdfLang[] = ['de', 'tr', 'en'];

const INPUT_CLASS = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white';

// PDF baytları → base64 (mail eki). btoa tek seferde büyük diziyle çağrılamaz.
const bytesToBase64 = (bytes: Uint8Array): string => {
    let binary = '';
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return btoa(binary);
};

const errorText = (err: unknown): string =>
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error
    || (err as Error)?.message
    || 'error';

/**
 * Sipariş detay/önizleme popup'ı. Listede satıra tıklanınca VE "gönder"
 * akışında aynı sheet açılır: genel bakış + PDF önizleme + mail görünümü.
 * Alt bardaki sol/sağ oklar sayfadaki siparişler arasında gezdirir.
 */
export const OrderSheet = ({
    order,
    canManage,
    canBack,
    canNext,
    onBack,
    onNext,
    onClose,
    onOrderChanged,
    onDeleted,
}: {
    order: PurchaseOrderRow;
    canManage: boolean;
    canBack: boolean;
    canNext: boolean;
    onBack: () => void;
    onNext: () => void;
    onClose: () => void;
    onOrderChanged: (updated: PurchaseOrderRow) => void;
    onDeleted: (id: string) => void;
}) => {
    const navigate = useNavigate();
    const settings = usePdfSettingsStore((state) => state.settings);
    const statusMeta = ORDER_STATUS_META[order.status] ?? ORDER_STATUS_META.PENDING;

    const [view, setView] = useState<SheetView>('overview');
    const [anim, setAnim] = useState<SlideDir>('rise');
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const go = (next: SheetView) => {
        if (next === view) return;
        setAnim(VIEW_SEQUENCE.indexOf(next) > VIEW_SEQUENCE.indexOf(view) ? 'right' : 'left');
        setView(next);
    };

    // Kalem tablosunda hangi opsiyonel sütunlar görünecek: yalnızca kayıtta
    // gerçekten dolu olanlar — boş bir "İndirim 3" sütunu detayda yer kaplamaz.
    const shownExtraDiscounts = EXTRA_DISCOUNT_KEYS.filter((key) =>
        order.items.some((item) => (item[key] ?? 0) > 0));
    const showVat = order.items.some((item) => (item.vatRate ?? 0) > 0);
    // Ek ücretler (nakliye, ambalaj…): eski kayıtlarda alan hiç olmayabilir.
    const fees = order.additionalFees ?? [];
    // ürün/malzeme + seri kod + miktar + brüt + net + indirim + tutar = 7 sabit sütun.
    const itemColumnCount = 7 + shownExtraDiscounts.length + (showVat ? 1 : 0);

    // Mail gönderildiyse sonraki gönderimler "güncellendi" etiketi taşır.
    const isResend = Boolean(order.emailSentAt);
    const updatedTag = order.revision > 0 && isResend;

    // ── Teklif no (satır içi düzenleme — üst bilgi, durum ASLA değişmez) ─────
    const [quoteDraft, setQuoteDraft] = useState(order.quoteNumber ?? '');
    useEffect(() => { setQuoteDraft(order.quoteNumber ?? ''); }, [order.id, order.quoteNumber]);
    const saveQuoteNumber = async () => {
        const next = quoteDraft.trim();
        if ((order.quoteNumber ?? '') === next) return;
        try {
            const updated = await purchaseOrdersApi.update(order.id, { quoteNumber: next || null });
            onOrderChanged(updated);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        }
    };

    // ── PDF önizleme (blob URL → iframe) ─────────────────────────────────────
    const [pdfLang, setPdfLang] = useState<OrderPdfLang>('de');
    const [pdfUrl, setPdfUrl] = useState<string | null>(null);
    const [pdfBusy, setPdfBusy] = useState(false);
    useEffect(() => {
        if (view !== 'pdf') return;
        let cancelled = false;
        let url: string | null = null;
        setPdfBusy(true);
        (async () => {
            const { buildOrderPdfBytes } = await import('@/utils/pdf/orderPdf');
            const bytes = await buildOrderPdfBytes(order, settings, pdfLang);
            if (cancelled) return;
            url = URL.createObjectURL(new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }));
            setPdfUrl(url);
        })()
            .catch((err) => { if (!cancelled) setNotice({ kind: 'err', text: errorText(err) }); })
            .finally(() => { if (!cancelled) setPdfBusy(false); });
        return () => {
            cancelled = true;
            if (url) URL.revokeObjectURL(url);
            setPdfUrl(null);
        };
        // updatedAt: sipariş düzenlendiyse önizleme yeniden üretilir.
    }, [view, pdfLang, order.id, order.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps

    const downloadPdf = async () => {
        setBusy('pdf');
        try {
            const { exportOrderPdf } = await import('@/utils/pdf/orderPdf');
            await exportOrderPdf(order, settings, pdfLang);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    const downloadExcel = async () => {
        setBusy('excel');
        try {
            const { exportOrderExcel } = await import('../utils/exportExcel');
            await exportOrderExcel(order);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    // ── Mail görünümü ────────────────────────────────────────────────────────
    const defaultSubject = () => {
        const base = t('inv.orders.mail.subject', { number: order.referenceNumber });
        return updatedTag ? `${base} (${t('inv.orders.updatedTag')})` : base;
    };
    const [mailTo, setMailTo] = useState(order.supplierEmail ?? '');
    const [mailSubject, setMailSubject] = useState(defaultSubject());
    const [mailMessage, setMailMessage] = useState(t('inv.orders.mail.defaultMessage'));
    useEffect(() => {
        setMailTo(order.supplierEmail ?? '');
        setMailSubject(defaultSubject());
        // Mesaj taslağı kullanıcıya aittir; sipariş değişince sıfırlanır.
        setMailMessage(t('inv.orders.mail.defaultMessage'));
    }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const sendMail = async () => {
        setBusy('send');
        setNotice(null);
        try {
            const { buildOrderPdfBytes } = await import('@/utils/pdf/orderPdf');
            const bytes = await buildOrderPdfBytes(order, settings, pdfLang);
            const result = await purchaseOrdersApi.sendMail(order.id, {
                to: mailTo.trim() || undefined,
                subject: mailSubject.trim(),
                message: mailMessage,
                attachments: [{
                    filename: `${order.referenceNumber}.pdf`,
                    contentType: 'application/pdf',
                    contentBase64: bytesToBase64(bytes),
                }],
            });
            onOrderChanged(result.order);
            setNotice({ kind: result.preview ? 'err' : 'ok', text: result.message });
            if (!result.preview) go('overview');
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    // ── Durum / stok / silme eylemleri ───────────────────────────────────────
    const toggleToBeStocked = async () => {
        setBusy('status');
        try {
            const target = order.status === 'TO_BE_STOCKED' ? 'PENDING' : 'TO_BE_STOCKED';
            const updated = await purchaseOrdersApi.setStatus(order.id, target);
            onOrderChanged(updated);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    // Stok sayfasına geçiş: satırlar taslak olarak önceden doldurulur; kayıt
    // başarıyla tamamlanınca StockPage mark-stocked çağırır (COMPLETED).
    const addToStock = () => {
        navigate('/inventory/stock', {
            state: {
                orderPrefill: {
                    orderId: order.id,
                    orderReference: order.referenceNumber,
                    supplierId: order.supplierId ?? null,
                    supplierName: order.supplierName,
                    rows: order.items.map((item) => ({
                        itemType: item.itemType,
                        articleId: item.articleId ?? null,
                        articleCode: item.code ?? '',
                        name: item.name,
                        // Stoğa giren birim maliyet İNDİRİMLİ fiyattır: satırın net
                        // tutarı / miktar. Liste fiyatı (netPrice) indirimleri
                        // içermediği için doğrudan kullanılamaz.
                        unitCost: item.quantity > 0 ? item.lineTotal / item.quantity : item.netPrice,
                        unit: item.unit ?? '',
                    })),
                },
            },
        });
    };

    const deleteOrder = async () => {
        if (!window.confirm(t('inv.orders.deleteConfirm'))) return;
        setBusy('delete');
        try {
            await purchaseOrdersApi.remove(order.id);
            onDeleted(order.id);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
            setBusy(null);
        }
    };

    const viewPill = (target: SheetView, label: string) => (
        <button
            type="button"
            onClick={() => go(target)}
            className={`rounded-md px-2.5 py-1 text-[11.5px] font-semibold transition-colors ${
                view === target
                    ? 'bg-[#272f67] text-white'
                    : 'text-slate-500 hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white'
            }`}
        >
            {label}
        </button>
    );

    const actionButton = (
        key: string,
        label: string,
        icon: React.ReactNode,
        onClick: () => void,
        options?: { primary?: boolean },
    ) => (
        <button
            type="button"
            disabled={busy !== null}
            onClick={onClick}
            title={label}
            className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                options?.primary
                    ? 'bg-[#272f67] text-white hover:bg-[#1f2654]'
                    : 'ofi-rs-nav'
            }`}
        >
            {busy === key ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" /> : icon}
            {label}
        </button>
    );

    const infoRow = (label: string, value: React.ReactNode) => (
        <div className="flex items-baseline gap-2">
            <span className="w-40 shrink-0 text-[11.5px] font-semibold uppercase tracking-wide text-slate-400 dark:text-white/50">{label}</span>
            <span className="min-w-0 text-[13px] text-slate-800 dark:text-white">{value}</span>
        </div>
    );

    return (
        <BottomSheet
            open
            onClose={onClose}
            width={980}
            height={720}
            title={(
                <span className="flex items-center gap-2">
                    <span className="font-mono">{order.referenceNumber}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                        {t(statusMeta.labelKey)}
                    </span>
                    {updatedTag && (
                        <span className="rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-semibold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300">
                            {t('inv.orders.updatedTag')} · Rev. {order.revision}
                        </span>
                    )}
                </span>
            )}
            subtitle={[order.projectName, order.supplierName].filter(Boolean).join(' · ')}
            headerActions={(
                <div className="mr-1 flex items-center gap-1 rounded-md border border-slate-200 p-0.5 dark:border-white/15">
                    {viewPill('overview', t('inv.orders.views.overview'))}
                    {viewPill('pdf', t('inv.orders.views.pdf'))}
                    {viewPill('mail', t('inv.orders.views.mail'))}
                </div>
            )}
            footer={(
                <>
                    <button
                        type="button"
                        disabled={!canBack}
                        onClick={onBack}
                        className="ofi-rs-nav flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ArrowLeft size={13} />
                        {t('inv.orders.prevOrder')}
                    </button>
                    <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
                        {actionButton('pdf', t('inv.orders.actions.downloadPdf'), <FileDownload02 size={13} />, downloadPdf)}
                        {actionButton('excel', t('inv.orders.actions.downloadExcel'), <FileDownload02 size={13} />, downloadExcel)}
                        {canManage && actionButton(
                            'send',
                            isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send'),
                            <Send01 size={13} />,
                            () => go('mail'),
                            { primary: true },
                        )}
                        {canManage && order.status !== 'COMPLETED' && actionButton(
                            'status',
                            order.status === 'TO_BE_STOCKED' ? t('inv.orders.actions.unmarkToBeStocked') : t('inv.orders.actions.markToBeStocked'),
                            <PackagePlus size={13} />,
                            toggleToBeStocked,
                        )}
                        {canManage && order.status !== 'COMPLETED' && actionButton(
                            'stock',
                            t('inv.orders.actions.addToStock'),
                            <PackagePlus size={13} />,
                            addToStock,
                            { primary: true },
                        )}
                        {canManage && order.status !== 'COMPLETED' && actionButton(
                            'edit',
                            t('common.edit'),
                            <Edit01 size={13} />,
                            () => navigate(`/inventory/orders/new?id=${order.id}`),
                        )}
                        {canManage && actionButton('delete', t('common.delete'), <Trash01 size={13} />, deleteOrder)}
                    </div>
                    <button
                        type="button"
                        disabled={!canNext}
                        onClick={onNext}
                        className="ofi-rs-nav flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        {t('inv.orders.nextOrder')}
                        <ArrowRight size={13} />
                    </button>
                </>
            )}
        >
            {notice && (
                <div className={`mx-4 mt-3 rounded-md px-3 py-2 text-[12.5px] font-medium ${
                    notice.kind === 'ok'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300'
                        : 'bg-red-50 text-red-600 dark:bg-red-500/15 dark:text-red-300'
                }`}
                >
                    {notice.text}
                </div>
            )}

            <div key={`${order.id}-${view}-${anim}`} className={`flex min-h-0 flex-1 flex-col ${ANIM_CLASS[anim]}`}>
                {view === 'overview' && (
                    <div className="flex flex-col gap-4 p-4">
                        <div className="grid gap-2.5 rounded-lg border border-slate-200 p-3.5 dark:border-white/10 sm:grid-cols-2">
                            {infoRow(t('inv.orders.columns.reference'), <span className="font-mono">{order.referenceNumber}</span>)}
                            {infoRow(t('common.date'), fmtDateTime(order.createdAt))}
                            {infoRow(t('inv.columns.supplier'), (
                                <span>
                                    {order.supplierName}
                                    {order.supplierEmail && <span className="text-slate-400 dark:text-white/50"> · {order.supplierEmail}</span>}
                                    {/* Adres snapshot'ı bileşenlerden kurulmuştur ve en
                                        fazla 2 satır taşır (backend `composeAddressSnapshot`). */}
                                    {order.supplierAddress && (
                                        <span className="block whitespace-pre-line text-[12px] text-slate-500 dark:text-white/60">
                                            {order.supplierAddress}
                                        </span>
                                    )}
                                </span>
                            ))}
                            {infoRow(t('inv.columns.status'), (
                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${statusMeta.className}`}>
                                    {t(statusMeta.labelKey)}
                                </span>
                            ))}
                            {infoRow(t('inv.orders.columns.orderedBy'), order.orderedByName || '—')}
                            {infoRow(t('inv.orders.columns.project'), order.projectName || '—')}
                            {/* Teklif no: opsiyonel üst bilgi — düzenlemek durumu değiştirmez. */}
                            {infoRow(t('inv.orders.columns.quoteNumber'), canManage ? (
                                <input
                                    value={quoteDraft}
                                    onChange={(event) => setQuoteDraft(event.target.value)}
                                    onBlur={saveQuoteNumber}
                                    onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                                    placeholder={t('inv.orders.quotePlaceholder')}
                                    className={INPUT_CLASS}
                                />
                            ) : (order.quoteNumber || '—'))}
                            {infoRow(t('inv.orders.mailInfo'), order.emailSentAt
                                ? `${fmtDateTime(order.emailSentAt)} → ${order.emailRecipient || '—'}${order.revision > 0 ? ` (Rev. ${order.revision})` : ''}`
                                : t('inv.orders.mailNotSent'))}
                            {order.stockedAt && infoRow(t('inv.orders.stockedAt'), fmtDateTime(order.stockedAt))}
                        </div>

                        {/* Kalem tablosu SİPARİŞ TABLOSU, PDF ve Excel ile AYNI sütun
                            sırasını taşır: ürün/malzeme · seri kod · miktar · brüt ·
                            net · indirim (+2/3) · KDV · tutar. Seri no sütunu yoktur
                            (veri satırda korunur), ek indirim ve KDV yalnızca kayıtta
                            doluysa görünür. */}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                            <table data-inv-table data-unstyled-table className="w-full min-w-[760px]">
                                <thead>
                                    <tr>
                                        <th className="text-left">{t('inv.columns.item')}</th>
                                        <th className="w-32 text-left">{t('inv.columns.serialCode')}</th>
                                        <th className="w-20 text-right">{t('inv.columns.quantity')}</th>
                                        <th className="w-28 text-right">{t('inv.orders.columns.grossPrice')}</th>
                                        <th className="w-28 text-right">{t('inv.orders.columns.netPrice')}</th>
                                        <th className="w-20 text-right">{t('inv.orders.columns.discount')}</th>
                                        {shownExtraDiscounts.map((key) => (
                                            <th key={key} className="w-20 text-right">{t(`inv.orders.columns.${key}`)}</th>
                                        ))}
                                        {showVat && <th className="w-20 text-right">{t('inv.orders.columns.vat')}</th>}
                                        <th className="w-28 text-right">{t('inv.columns.total')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, index) => (
                                        <tr key={`${item.code ?? ''}-${index}`}>
                                            <td className="text-slate-800 dark:text-white">{item.name}</td>
                                            <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{item.code || '—'}</td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtQty(item.quantity)}</td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.grossPrice, order.currency)}</td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.netPrice, order.currency)}</td>
                                            <td className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">{fmtPercent(item.discount ?? 0)}</td>
                                            {shownExtraDiscounts.map((key) => (
                                                <td key={key} className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                    {fmtPercent(item[key] ?? 0)}
                                                </td>
                                            ))}
                                            {showVat && (
                                                <td className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                    {fmtPercent(item.vatRate ?? 0)}
                                                </td>
                                            )}
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.lineTotal, order.currency)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr>
                                        <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                            {t('inv.orders.totalNet')}
                                        </td>
                                        <td className="text-right font-mono text-[13.5px] font-bold text-slate-900 dark:text-white">
                                            {fmtMoneyIn(order.totalNet, order.currency)}
                                        </td>
                                    </tr>
                                    {/* EK ÜCRETLER: net toplamın hemen altında adıyla ve
                                        tutarıyla tek tek yazılır; genel toplama girer. */}
                                    {fees.map((fee, index) => (
                                        <tr key={`${fee.name}-${index}`}>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {fee.name}
                                                <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
                                                    ({t('inv.orders.fees.tag')})
                                                </span>
                                            </td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                {fmtMoneyIn(fee.amount, order.currency)}
                                            </td>
                                        </tr>
                                    ))}
                                    {showVat && (
                                        <tr>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {t('inv.orders.columns.vat')}
                                            </td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                {fmtMoneyIn(order.totalVat ?? 0, order.currency)}
                                            </td>
                                        </tr>
                                    )}
                                    {/* Genel toplam: net toplamdan farklıysa (KDV ya da ek
                                        ücret varsa) yazılır. */}
                                    {(showVat || fees.length > 0) && (
                                        <tr>
                                            <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                {t('inv.orders.grandTotal')}
                                            </td>
                                            <td className="text-right font-mono text-[13.5px] font-bold text-slate-900 dark:text-white">
                                                {fmtMoneyIn(orderGrandTotal(order), order.currency)}
                                            </td>
                                        </tr>
                                    )}
                                </tfoot>
                            </table>
                        </div>
                    </div>
                )}

                {view === 'pdf' && (
                    <div className="flex min-h-0 flex-1 flex-col gap-3 p-4">
                        <div className="flex items-center gap-1 self-start rounded-md border border-slate-200 p-0.5 dark:border-white/15">
                            {PDF_LANGS.map((lang) => (
                                <button
                                    key={lang}
                                    type="button"
                                    onClick={() => setPdfLang(lang)}
                                    className={`rounded px-2.5 py-1 text-[11.5px] font-semibold uppercase transition-colors ${
                                        pdfLang === lang
                                            ? 'bg-[#272f67] text-white'
                                            : 'text-slate-500 hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white'
                                    }`}
                                >
                                    {lang}
                                </button>
                            ))}
                        </div>
                        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-slate-200 bg-slate-100 dark:border-white/10 dark:bg-white/5">
                            {pdfBusy || !pdfUrl ? (
                                <div className="flex h-full items-center justify-center text-[13px] text-slate-500 dark:text-white/60">
                                    {t('inv.orders.pdfGenerating')}
                                </div>
                            ) : (
                                <iframe title="order-pdf" src={pdfUrl} className="h-full w-full" />
                            )}
                        </div>
                    </div>
                )}

                {view === 'mail' && (
                    <div className="flex flex-col gap-3 p-4">
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.to')}
                            <input value={mailTo} onChange={(event) => setMailTo(event.target.value)} className={INPUT_CLASS} />
                        </label>
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.subjectLabel')}
                            <input value={mailSubject} onChange={(event) => setMailSubject(event.target.value)} className={INPUT_CLASS} />
                        </label>
                        <label className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.message')}
                            <textarea
                                value={mailMessage}
                                onChange={(event) => setMailMessage(event.target.value)}
                                rows={8}
                                className="w-full rounded-md border border-slate-200 bg-white p-2.5 text-[13px] text-slate-700 focus:border-[#1f2654] focus:outline-none dark:border-white/20 dark:bg-transparent dark:text-white"
                            />
                        </label>
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-[12px] text-slate-400 dark:text-white/50">
                                {t('inv.orders.mail.attachmentNote', { name: `${order.referenceNumber}.pdf` })}
                            </span>
                            {canManage && (
                                <button
                                    type="button"
                                    disabled={busy !== null || !mailSubject.trim()}
                                    onClick={sendMail}
                                    className="flex items-center gap-1.5 rounded-md bg-[#272f67] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {busy === 'send'
                                        ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <Send01 size={13} />}
                                    {isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </BottomSheet>
    );
};
