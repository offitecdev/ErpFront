import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    CheckCircle,
    ChevronLeft,
    ChevronRight,
    Edit01,
    File05,
    FileDownload02,
    List,
    Mail01,
    Send01,
    ShoppingCart01,
    Trash01,
    Truck01,
} from '@/components/icons/antIconCompat';
import { ConfirmDialog } from '@/components/ui-shared/ConfirmDialog';
import { t } from '@/i18n/translate';
import { purchaseOrdersApi } from '@/lib/api/inventory';
import { usePdfSettingsStore } from '@/store/pdfSettingsStore';
import type { PurchaseOrderRow } from '@/types/inventory';
// CC penceresi takvim modülünde yaşar ve TEK KOPYADIR: aynı pencere hem randevu
// hem sipariş mailinde kullanılır (kullanıcı isteği 2026-08-02 — "takvimde
// örneği var"), böylece iki yerde ayrışan iki liste penceresi oluşmaz.
import { PeoplePickerModal } from '@/pages/calendar/components/PeoplePickerModal';
import { personKey, type PickedPerson } from '@/pages/calendar/calendarShared';
import type { OrderPdfLang } from '@/utils/pdf/orderPdf';
import { BottomSheet } from './BottomSheet';
import { fmtDateTime, fmtMoneyIn, fmtQty } from '../utils/format';
import { EXTRA_DISCOUNT_KEYS, fmtPercent, itemDisplayNetPrice, orderGrandTotal } from '../utils/orderPricing';
import { ORDER_STATUS_META, canConfirmToOrder, canConvertToOrder, canReceiveGoods, isEditableStage, isPriceRequestStage } from '../utils/orderStatus';

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

/**
 * Onay penceresinin metinleri — her AŞAMA EYLEMİ için başlık + açıklama.
 * Fonksiyon olarak tutulur: `t()` modül yüklenirken değil, pencere çizilirken
 * çağrılsın (dil değişince metin de değişir).
 */
type ConfirmKind = 'convert' | 'confirm' | 'receive' | 'delete';
const CONFIRM_TEXTS: Record<ConfirmKind, { title: () => string; message: () => string }> = {
    convert: {
        title: () => t('inv.orders.actions.convertToOrder'),
        message: () => t('inv.orders.convertConfirm'),
    },
    confirm: {
        title: () => t('inv.orders.actions.confirmOrder'),
        message: () => t('inv.orders.confirmOrderConfirm'),
    },
    receive: {
        title: () => t('inv.orders.views.receive'),
        message: () => t('inv.orders.receive.stageConfirm'),
    },
    delete: {
        title: () => t('common.delete'),
        message: () => t('inv.orders.deleteConfirm'),
    },
};

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
 * Sipariş detay/önizleme popup'ı. Başlık SİPARİŞİN DURUMUDUR ("Preisanfrage",
 * "Warten auf Auftragsbestätigung"…) — kullanıcı isteği 2026-08-01: popup
 * başlığı akıştaki yeri söyler, uzun düğme metinleri yerine ok/ikon gezinmesi
 * kullanılır. Görünümler: genel bakış · PDF · mail · mal kabul; ileri/geri
 * oklarla ya da ikonlarla geçilir. Alt bar İKON düğmelerden oluşur (başlıklar
 * tooltip'te), sol/sağ uçtaki oklar sayfadaki siparişler arasında gezdirir.
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
    // Fiyat talebi aşaması: fiyat sütunları gizlenir, PDF/mail "Preisanfrage" olur.
    const priceRequest = isPriceRequestStage(order.status);

    const [view, setView] = useState<SheetView>('overview');
    const [anim, setAnim] = useState<SlideDir>('rise');
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

    const go = (next: SheetView) => {
        if (next === view) return;
        setAnim(VIEW_SEQUENCE.indexOf(next) > VIEW_SEQUENCE.indexOf(view) ? 'right' : 'left');
        setView(next);
    };
    // İleri/geri oklar görünüm dizisinde gezdirir (kullanıcı isteği: uzun düğme
    // listesi yerine ok ikonları).
    const goStep = (delta: 1 | -1) => {
        const index = VIEW_SEQUENCE.indexOf(view) + delta;
        if (index >= 0 && index < VIEW_SEQUENCE.length) go(VIEW_SEQUENCE[index]);
    };

    // Kalem tablosunda hangi opsiyonel sütunlar görünecek: yalnızca kayıtta
    // gerçekten dolu olanlar — boş bir "İndirim 3" sütunu detayda yer kaplamaz.
    const shownExtraDiscounts = EXTRA_DISCOUNT_KEYS.filter((key) =>
        order.items.some((item) => (item[key] ?? 0) > 0));
    // KDV: TOTAL kipinde tek oran genel toplamdadır (satır sütunu yok);
    // LINE kipinde satır oranı doluysa sütun görünür.
    const vatIsTotal = order.vatMode === 'TOTAL';
    const showLineVat = !vatIsTotal && order.items.some((item) => (item.vatRate ?? 0) > 0);
    const showVatRow = vatIsTotal ? (order.orderVatRate > 0 || (order.totalVat ?? 0) > 0) : showLineVat;
    // Ek ücretler (nakliye, ambalaj…): eski kayıtlarda alan hiç olmayabilir.
    const fees = order.additionalFees ?? [];
    // ürün/malzeme + seri kod + miktar (+ fiyat sütunları yalnızca fiyatlı aşamada).
    const itemColumnCount = priceRequest
        ? 3
        : 7 + shownExtraDiscounts.length + (showLineVat ? 1 : 0);

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

    /**
     * ── ALICI ADI (Empfänger) — BU PENCEREDE DE DÜZENLENEBİLİR ───────────────
     * Kullanıcı isteği 2026-08-02: alan yalnızca sipariş detayları penceresinde
     * değil, "Besteller"ın göründüğü BU popup'ta da yazılabilir olmalı. Teklif
     * no ile aynı desen: yazılır, odak çıkınca (ya da Enter'da) PATCH edilir.
     * Üst bilgi alanı olduğu için siparişin DURUMUNU değiştirmez.
     */
    const [recipientDraft, setRecipientDraft] = useState(order.recipientName ?? '');
    useEffect(() => { setRecipientDraft(order.recipientName ?? ''); }, [order.id, order.recipientName]);
    const saveRecipientName = async () => {
        const next = recipientDraft.trim();
        if ((order.recipientName ?? '') === next) return;
        try {
            const updated = await purchaseOrdersApi.update(order.id, { recipientName: next || null });
            onOrderChanged(updated);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        }
    };

    // ── PDF üretimi (fiyat talebi aşamasında ayrı "Preisanfrage" belgesi) ────
    const buildPdfBytes = async (): Promise<Uint8Array> => {
        if (priceRequest) {
            const { buildPriceRequestPdfBytes } = await import('@/utils/pdf/priceRequestPdf');
            return buildPriceRequestPdfBytes(order, settings, pdfLang);
        }
        const { buildOrderPdfBytes } = await import('@/utils/pdf/orderPdf');
        return buildOrderPdfBytes(order, settings, pdfLang);
    };
    const pdfFileName = priceRequest ? `Preisanfrage-${order.referenceNumber}.pdf` : `${order.referenceNumber}.pdf`;

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
            const bytes = await buildPdfBytes();
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
        // updatedAt: sipariş düzenlendiyse önizleme yeniden üretilir; status:
        // fiyat talebi onaylanınca belge tipi değişir.
    }, [view, pdfLang, order.id, order.updatedAt, order.status]); // eslint-disable-line react-hooks/exhaustive-deps

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
        const base = priceRequest
            ? t('inv.orders.mail.subjectPriceRequest', { number: order.referenceNumber })
            : t('inv.orders.mail.subject', { number: order.referenceNumber });
        return updatedTag ? `${base} (${t('inv.orders.updatedTag')})` : base;
    };
    const [mailTo, setMailTo] = useState(order.supplierEmail ?? '');
    const [mailSubject, setMailSubject] = useState(defaultSubject());
    const [mailMessage, setMailMessage] = useState(t(priceRequest ? 'inv.orders.mail.defaultMessagePriceRequest' : 'inv.orders.mail.defaultMessage'));
    /**
     * ── KOPYA (CC) ───────────────────────────────────────────────────────────
     * ALICI siparişin TEDARİKÇİSİDİR ve öyle kalır (sunucu başka adrese
     * göndermez — açık relay engeli). Kopya listesi VARSAYILAN OLARAK
     * TEDARİKÇİNİN ADRESİYLE açılır (kullanıcı isteği 2026-08-02: "tedarikçinin
     * e-postası varsayılan olsun, üzerine başkaları eklenebilsin"); üzerine
     * eklenecek kişiler AYRI BİR PENCEREDEN seçilir: takvimdeki CC penceresinin
     * ta kendisi (`PeoplePickerModal mode="cc"`) — personel + müşteri sekmeleri
     * ve elle adres girme.
     *
     * ⚠ Varsayılan rozet ALICIYLA AYNI adrestir; sunucu CC listesinden alıcıyı
     * eler, dolayısıyla tedarikçiye iki kopya GİTMEZ. Rozet, listenin kimden
     * başladığını gösterir ve tek tıkla çıkarılabilir.
     */
    const supplierCcSeed = (): PickedPerson[] => {
        const email = (order.supplierEmail ?? '').trim();
        if (!email) return [];
        return [{
            key: personKey('EMAIL', email.toLowerCase()),
            type: 'EMAIL',
            name: order.supplierName || email,
            email,
        }];
    };
    const [mailCc, setMailCc] = useState<PickedPerson[]>(supplierCcSeed);
    const [ccModalOpen, setCcModalOpen] = useState(false);
    useEffect(() => {
        setMailTo(order.supplierEmail ?? '');
        setMailSubject(defaultSubject());
        // Mesaj taslağı kullanıcıya aittir; sipariş değişince sıfırlanır.
        setMailMessage(t(priceRequest ? 'inv.orders.mail.defaultMessagePriceRequest' : 'inv.orders.mail.defaultMessage'));
        setMailCc(supplierCcSeed());
    }, [order.id, priceRequest]); // eslint-disable-line react-hooks/exhaustive-deps

    const sendMail = async () => {
        setBusy('send');
        setNotice(null);
        try {
            const bytes = await buildPdfBytes();
            const result = await purchaseOrdersApi.sendMail(order.id, {
                to: mailTo.trim() || undefined,
                // Adressiz seçim (e-postası olmayan kişi) gönderilmez.
                ccEmails: mailCc.map((person) => person.email).filter((email): email is string => Boolean(email)),
                subject: mailSubject.trim(),
                message: mailMessage,
                attachments: [{
                    filename: pdfFileName,
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

    // ── Durum eylemleri ──────────────────────────────────────────────────────
    /**
     * SİPARİŞE DÖNÜŞTÜR — fiyat talebi aşamasının tek çıkışı (kullanıcı isteği
     * 2026-08-02). Talep KAPANIR ve kayıt fiyatlı SİPARİŞ TASLAĞINA (ORDER_DRAFT)
     * döner; fiyat, KDV ve ek ücretler ancak bundan sonra girilebilir. Bu yüzden
     * dönüşümün ardından doğrudan DÜZENLEYİCİ açılır — fiyatların girileceği yer
     * orasıdır; "siparişi oluştur" düğmesi de orada belirir.
     * Talepten DOĞRUDAN resmî siparişe geçiş YOKTUR: fiyatı hiç girilememiş bir
     * sipariş kilitlenirdi.
     */
    const convertToOrder = async () => {
        setBusy('confirm');
        try {
            const updated = await purchaseOrdersApi.setStatus(order.id, 'ORDER_DRAFT');
            onOrderChanged(updated);
            navigate(`/inventory/orders/new?id=${order.id}`);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    // Fiyatlı taslak onaylandı → resmî satın alma siparişi (PENDING).
    const confirmOrder = async () => {
        setBusy('confirm');
        try {
            const updated = await purchaseOrdersApi.setStatus(order.id, 'PENDING');
            onOrderChanged(updated);
            setNotice({ kind: 'ok', text: t('inv.orders.confirmedToast') });
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
        } finally {
            setBusy(null);
        }
    };

    const deleteOrder = async () => {
        setBusy('delete');
        try {
            await purchaseOrdersApi.remove(order.id);
            onDeleted(order.id);
        } catch (err) {
            setNotice({ kind: 'err', text: errorText(err) });
            setBusy(null);
        }
    };

    /**
     * ── ONAY GEREKTİREN EYLEMLER ─────────────────────────────────────────────
     * Tarayıcının `window.confirm` kutusu YERİNE uygulamanın kendi penceresi
     * kullanılır (kullanıcı isteği 2026-08-02: "düzgün bir popup olsun").
     * Dördü de geri alması pahalıdır: fiyat talebini siparişe DÖNÜŞTÜRMEK talebi
     * kapatır, SİPARİŞİ ONAYLAMAK kaydı resmîleştirip kilitler, mal kabule geçmek
     * aşamayı ilerletir, silmek kaydı yok eder.
     */
    const [confirmKind, setConfirmKind] = useState<ConfirmKind | null>(null);
    const runConfirmed = async () => {
        const kind = confirmKind;
        // Pencere hemen kapanır; işin durumu alttaki düğmenin kendi göstergesinde
        // (`busy`) ve hata olursa sayfadaki uyarı şeridinde görünür.
        setConfirmKind(null);
        if (kind === 'convert') await convertToOrder();
        else if (kind === 'confirm') await confirmOrder();
        else if (kind === 'receive') await openReceivePage();
        else if (kind === 'delete') await deleteOrder();
    };

    // Mal kabul POPUP DEĞİLDİR (kullanıcı isteği 2026-08-02): stok ekranı gibi
    // kendi sayfasında açılır — buradaki düğme yalnızca oraya götürür.
    const receiveAllowed = canManage && canReceiveGoods(order.status);
    /**
     * Mal kabul düğmesi: durum "Wareneingang"a YALNIZCA BURADA geçer (kullanıcı
     * isteği 2026-08-02) — sipariş verilmiş olması yetmez, mal kabulün fiilen
     * başlatılması gerekir. Sonra kendi sayfası açılır.
     */
    const openReceivePage = async () => {
        if (order.status === 'PENDING' || order.status === 'UPDATED') {
            setBusy('goreceive');
            try {
                const updated = await purchaseOrdersApi.setStatus(order.id, 'TO_BE_STOCKED');
                onOrderChanged(updated);
            } catch (err) {
                setNotice({ kind: 'err', text: errorText(err) });
                setBusy(null);
                return;
            }
            setBusy(null);
        }
        navigate(`/inventory/orders/${order.id}/receive`);
    };

    // ── Küçük yapı taşları ───────────────────────────────────────────────────
    // Görünüm ikonları (uzun sekme metinleri yerine): liste · PDF · mail · kabul.
    const viewIcon = (target: SheetView, icon: React.ReactNode, label: string) => (
        <button
            type="button"
            onClick={() => go(target)}
            title={label}
            aria-label={label}
            className={`flex size-7 items-center justify-center rounded-md transition-colors ${
                view === target
                    ? 'bg-[#272f67] text-white'
                    : 'text-slate-500 hover:text-[#1f2654] dark:text-white/60 dark:hover:text-white'
            }`}
        >
            {icon}
        </button>
    );

    // Alt bar: İKON düğme (başlık tooltip'te) — popup'taki uzun metinler
    // kaldırıldı. `emphasis` DÜZENLE ve SİL'i belirginleştirir: ikisi de
    // çerçeveli ve daha büyüktür, silme kırmızıya döner (kullanıcı isteği
    // 2026-08-02 — iki eylem birbirinden ayırt edilebilmeli).
    const iconAction = (
        key: string,
        label: string,
        icon: React.ReactNode,
        onClick: () => void,
        options?: { primary?: boolean; emphasis?: 'edit' | 'delete' },
    ) => (
        <button
            type="button"
            disabled={busy !== null}
            onClick={onClick}
            title={label}
            aria-label={label}
            className={`flex items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                options?.emphasis ? 'size-10 border' : 'size-8'
            } ${
                options?.emphasis === 'delete'
                    ? 'border-red-200 text-red-500 hover:bg-red-500 hover:text-white dark:border-red-500/40 dark:text-red-300 dark:hover:bg-red-500'
                    : options?.emphasis === 'edit'
                        ? 'border-[#272f67]/30 text-[#272f67] hover:bg-[#272f67] hover:text-white dark:border-white/30 dark:text-white dark:hover:bg-white/15'
                        : options?.primary
                            ? 'bg-[#272f67] text-white hover:bg-[#1f2654]'
                            : 'ofi-rs-nav'
            }`}
        >
            {busy === key
                ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                : icon}
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
                    {/* Başlık = SİPARİŞİN DURUMU (kullanıcı isteği): "Preisanfrage",
                        "Warten auf Auftragsbestätigung"… Sipariş kodu yanında kalır. */}
                    <span>{t(statusMeta.labelKey)}</span>
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-semibold ${statusMeta.className}`}>
                        {order.referenceNumber}
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
                <div className="mr-1 flex items-center gap-0.5 rounded-md border border-slate-200 p-0.5 dark:border-white/15">
                    <button
                        type="button"
                        onClick={() => goStep(-1)}
                        disabled={view === VIEW_SEQUENCE[0]}
                        title={t('inv.orders.viewBack')}
                        aria-label={t('inv.orders.viewBack')}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-[#1f2654] disabled:opacity-30 dark:text-white/50 dark:hover:text-white"
                    >
                        <ChevronLeft size={14} />
                    </button>
                    {viewIcon('overview', <List size={14} />, t('inv.orders.views.overview'))}
                    {viewIcon('pdf', <File05 size={14} />, t('inv.orders.views.pdf'))}
                    {viewIcon('mail', <Mail01 size={14} />, t('inv.orders.views.mail'))}
                    <button
                        type="button"
                        onClick={() => goStep(1)}
                        disabled={view === VIEW_SEQUENCE[VIEW_SEQUENCE.length - 1]}
                        title={t('inv.orders.viewForward')}
                        aria-label={t('inv.orders.viewForward')}
                        className="flex size-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:text-[#1f2654] disabled:opacity-30 dark:text-white/50 dark:hover:text-white"
                    >
                        <ChevronRight size={14} />
                    </button>
                </div>
            )}
            footer={(
                <>
                    <button
                        type="button"
                        disabled={!canBack}
                        onClick={onBack}
                        title={t('inv.orders.prevOrder')}
                        aria-label={t('inv.orders.prevOrder')}
                        className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ArrowLeft size={14} />
                    </button>
                    <div className="flex min-w-0 flex-wrap items-center justify-center gap-1.5">
                        {/* PDF İNDİRME BURADA YOKTUR (kullanıcı isteği 2026-08-02):
                            belge PDF görünümünden alınır. "Stoğa eklenecek" işareti
                            de kaldırıldı — mal kabul yalnızca RESMÎ sipariş varsa
                            açılır (`canReceiveGoods`). KDV ayarı sipariş
                            detaylarına taşındı. */}
                        {iconAction('excel', t('inv.orders.actions.downloadExcel'), <FileDownload02 size={14} />, downloadExcel)}
                        {canManage && iconAction(
                            'send',
                            isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send'),
                            <Send01 size={14} />,
                            () => go('mail'),
                            { primary: true },
                        )}
                        {/* FİYAT TALEBİ AŞAMASI: onay YOKTUR — talep fiyatsızdır.
                            Tek çıkış "siparişe dönüştür" (→ ORDER_DRAFT), fiyat ve
                            KDV ancak orada girilir. */}
                        {canManage && canConvertToOrder(order.status) && iconAction(
                            'confirm',
                            t('inv.orders.actions.convertToOrder'),
                            <ShoppingCart01 size={14} />,
                            () => setConfirmKind('convert'),
                            { primary: true },
                        )}
                        {/* FİYATLI TASLAK: siparişi oluştur (PENDING) — kayıt
                            resmîleşir ve kilitlenir. */}
                        {canManage && canConfirmToOrder(order.status) && iconAction(
                            'confirm',
                            t('inv.orders.actions.confirmOrder'),
                            <CheckCircle size={14} />,
                            () => setConfirmKind('confirm'),
                            { primary: true },
                        )}
                        {/* Mal kabul: popup DEĞİL, kendi sayfası — yalnızca sipariş
                            verilmişse (fiyat talebi/taslak aşamasında görünmez). */}
                        {receiveAllowed && iconAction(
                            'goreceive',
                            t('inv.orders.views.receive'),
                            <Truck01 size={14} />,
                            () => setConfirmKind('receive'),
                            { primary: true },
                        )}
                        {/* DÜZENLE ve SİL ayrı bir kümede, daha büyük ve belirgin
                            ikonlarla durur (kullanıcı isteği): araya ince ayıraç. */}
                        {canManage && (
                            <span className="mx-1 h-6 w-px bg-slate-200 dark:bg-white/15" aria-hidden />
                        )}
                        {/* Düzenleme yalnızca ONAY ÖNCESİ: onaylanmış sipariş
                            resmîdir, değişiklikler mal kabulden yapılır. */}
                        {canManage && isEditableStage(order.status) && iconAction(
                            'edit',
                            t('common.edit'),
                            <Edit01 size={17} />,
                            () => navigate(`/inventory/orders/new?id=${order.id}`),
                            { emphasis: 'edit' },
                        )}
                        {canManage && iconAction(
                            'delete',
                            t('common.delete'),
                            <Trash01 size={17} />,
                            () => setConfirmKind('delete'),
                            { emphasis: 'delete' },
                        )}
                    </div>
                    <button
                        type="button"
                        disabled={!canNext}
                        onClick={onNext}
                        title={t('inv.orders.nextOrder')}
                        aria-label={t('inv.orders.nextOrder')}
                        className="ofi-rs-nav flex size-8 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-30"
                    >
                        <ArrowRight size={14} />
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
                            {/* LIEFERANT SATIRI: AD + ADRES, E-POSTA YOK (kullanıcı
                                isteği 2026-08-02). İletişim adresi mail satırında
                                durur — tedarikçi satırı "kim ve nerede"yi söyler. */}
                            {infoRow(t('inv.columns.supplier'), (
                                <span>
                                    {order.supplierName}
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
                            {/* ALICI ADI — Besteller'in yanında ve DÜZENLENEBİLİR
                                (kullanıcı isteği 2026-08-02): odak çıkınca kaydedilir. */}
                            {infoRow(t('inv.orders.columns.recipientName'), canManage ? (
                                <input
                                    value={recipientDraft}
                                    onChange={(event) => setRecipientDraft(event.target.value)}
                                    onBlur={saveRecipientName}
                                    onKeyDown={(event) => { if (event.key === 'Enter') (event.target as HTMLInputElement).blur(); }}
                                    placeholder={t('inv.orders.recipientPlaceholder')}
                                    maxLength={120}
                                    className={INPUT_CLASS}
                                />
                            ) : (order.recipientName || '—'))}
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
                            {/* "E-Mail" SATIRI YALNIZCA ADRESİ GÖSTERİR (kullanıcı
                                isteği 2026-08-02): henüz gönderilmemişken satır
                                sadece iletişim adresidir — "Noch nicht gesendet"
                                ibaresi yalnızca kayıtlı adres YOKSA görünür, aksi
                                hâlde satır boş kalırdı. Gönderildiyse satır
                                "tarih → alıcı" olur (revizyon varsa Rev. n). */}
                            {infoRow(t('inv.orders.mailInfo'), order.emailSentAt
                                ? `${fmtDateTime(order.emailSentAt)} → ${order.emailRecipient || '—'}${order.revision > 0 ? ` (Rev. ${order.revision})` : ''}`
                                : (order.supplierEmail || t('inv.orders.mailNotSent')))}
                            {order.stockedAt && infoRow(t('inv.orders.stockedAt'), fmtDateTime(order.stockedAt))}
                        </div>

                        {/* Kalem tablosu SİPARİŞ TABLOSU, PDF ve Excel ile AYNI sütun
                            sırasını taşır. Fiyat talebi aşamasında fiyat sütunları
                            GİZLENİR (seri no + ad + miktar sorulur, fiyat henüz yok). */}
                        <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-white/10">
                            <table data-inv-table data-unstyled-table className={`w-full ${priceRequest ? 'min-w-[480px]' : 'min-w-[760px]'}`}>
                                <thead>
                                    <tr>
                                        <th className="text-left">{t('inv.columns.item')}</th>
                                        <th className="w-32 text-left">{t('inv.columns.serialCode')}</th>
                                        <th className="w-20 text-right">{t('inv.columns.quantity')}</th>
                                        {!priceRequest && (
                                            <>
                                                <th className="w-28 text-right">{t('inv.orders.columns.grossPrice')}</th>
                                                <th className="w-28 text-right">{t('inv.orders.columns.netPrice')}</th>
                                                <th className="w-20 text-right">{t('inv.orders.columns.discount')}</th>
                                                {shownExtraDiscounts.map((key) => (
                                                    <th key={key} className="w-20 text-right">{t(`inv.orders.columns.${key}`)}</th>
                                                ))}
                                                {showLineVat && <th className="w-20 text-right">{t('inv.orders.columns.vat')}</th>}
                                                <th className="w-28 text-right">{t('inv.columns.total')}</th>
                                            </>
                                        )}
                                    </tr>
                                </thead>
                                <tbody>
                                    {order.items.map((item, index) => (
                                        <tr key={`${item.code ?? ''}-${index}`}>
                                            <td className="text-slate-800 dark:text-white">{item.name}</td>
                                            <td className="font-mono text-[13px] text-slate-500 dark:text-white/60">{item.code || '—'}</td>
                                            <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtQty(item.quantity)}</td>
                                            {!priceRequest && (
                                                <>
                                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.grossPrice, order.currency)}</td>
                                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(itemDisplayNetPrice(item), order.currency)}</td>
                                                    <td className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">{fmtPercent(item.discount ?? 0)}</td>
                                                    {shownExtraDiscounts.map((key) => (
                                                        <td key={key} className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                            {fmtPercent(item[key] ?? 0)}
                                                        </td>
                                                    ))}
                                                    {showLineVat && (
                                                        <td className="text-right font-mono text-[13px] text-slate-500 dark:text-white/60">
                                                            {fmtPercent(item.vatRate ?? 0)}
                                                        </td>
                                                    )}
                                                    <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">{fmtMoneyIn(item.lineTotal, order.currency)}</td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                                {!priceRequest && (
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
                                        {showVatRow && (
                                            <tr>
                                                <td colSpan={itemColumnCount - 1} className="text-right text-[12.5px] font-semibold text-slate-500 dark:text-white/60">
                                                    {t('inv.orders.columns.vat')}
                                                    {/* TOTAL kipinde oran (+ seçilen ülke) toplam satırında görünür. */}
                                                    {vatIsTotal && (
                                                        <span className="ml-1.5 font-normal text-slate-400 dark:text-white/40">
                                                            {fmtPercent(order.orderVatRate)}{order.orderVatCountry ? ` · ${order.orderVatCountry}` : ''}
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="text-right font-mono text-[13px] text-slate-700 dark:text-white/80">
                                                    {fmtMoneyIn(order.totalVat ?? 0, order.currency)}
                                                </td>
                                            </tr>
                                        )}
                                        {/* Genel toplam: net toplamdan farklıysa (KDV ya da ek
                                            ücret varsa) yazılır. */}
                                        {(showVatRow || fees.length > 0) && (
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
                                )}
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
                        {/* KOPYA (CC) — alıcının ALTINDA. Rozetler seçilenleri
                            gösterir, kesikli düğme AYRI PENCEREYİ açar (takvimdeki
                            CC penceresinin aynısı). Alıcı tedarikçidir; buraya
                            eklenenler kopyayı alır. */}
                        <div className="flex flex-col gap-1 text-[12px] font-semibold text-slate-500 dark:text-white/60">
                            {t('inv.orders.mail.cc')}
                            <span className="flex flex-wrap items-center gap-1.5">
                                {mailCc.map((person) => (
                                    <span
                                        key={person.key}
                                        title={person.email ?? undefined}
                                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11.5px] font-medium text-slate-600 dark:border-white/15 dark:bg-white/5 dark:text-white/70"
                                    >
                                        {person.email || person.name}
                                    </span>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setCcModalOpen(true)}
                                    className="rounded-full border border-dashed border-slate-300 px-2.5 py-0.5 text-[11.5px] font-semibold text-slate-500 transition-colors hover:border-[#1f2654] hover:text-[#1f2654] dark:border-white/20 dark:text-white/50 dark:hover:text-white"
                                >
                                    {mailCc.length ? t('inv.orders.mail.editCc') : t('inv.orders.mail.addCc')}
                                </button>
                            </span>
                        </div>
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
                                {t('inv.orders.mail.attachmentNote', { name: pdfFileName })}
                            </span>
                            {canManage && (
                                <button
                                    type="button"
                                    disabled={busy !== null || !mailSubject.trim()}
                                    onClick={sendMail}
                                    title={isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}
                                    aria-label={isResend ? t('inv.orders.actions.sendUpdated') : t('inv.orders.actions.send')}
                                    className="flex size-9 items-center justify-center rounded-md bg-[#272f67] text-white transition-colors hover:bg-[#1f2654] disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                    {busy === 'send'
                                        ? <span className="size-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                                        : <Send01 size={15} />}
                                </button>
                            )}
                        </div>
                    </div>
                )}

            </div>

            {/* CC penceresi: TAKVİMDEKİ pencerenin kendisi (yeniden yazılmadı) —
                personel + müşteri sekmeleri, sayfalı liste ve elle e-posta girme.
                `mode="cc"` e-postasız satırları eler. */}
            {/* Onay penceresi: mal kabule geçiş (mavi) ve silme (kırmızı) — ikisi
                de tarayıcı kutusu değil, uygulamanın kendi popup'ı. */}
            <ConfirmDialog
                open={confirmKind !== null}
                tone={confirmKind === 'delete' ? 'danger' : 'primary'}
                title={CONFIRM_TEXTS[confirmKind ?? 'receive'].title()}
                message={CONFIRM_TEXTS[confirmKind ?? 'receive'].message()}
                confirmLabel={confirmKind === 'delete' ? t('common.delete') : t('common.confirm')}
                onConfirm={() => void runConfirmed()}
                onCancel={() => setConfirmKind(null)}
            />

            <PeoplePickerModal
                open={ccModalOpen}
                onClose={() => setCcModalOpen(false)}
                mode="cc"
                initial={mailCc}
                title={t('inv.orders.mail.ccTitle')}
                onConfirm={(picked) => { setMailCc(picked); setCcModalOpen(false); }}
            />

        </BottomSheet>
    );
};
